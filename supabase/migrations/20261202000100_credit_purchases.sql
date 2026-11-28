-- Credit purchases through the App Store and Google Play.
--
-- Receipts are verified only on the server: the `purchase-verify` Edge Function asks the store
-- about the transaction and then calls grant_purchase with the service role. Refunds and
-- revocations arrive as store notifications (`store-notifications`), which call revoke_purchase.
-- Clients can read the catalogue of packs, and nothing else here; their history stays in
-- credit_ledger. No receipts, prices or payment details are stored.

create type public.purchase_store as enum ('app_store', 'play');
create type public.purchase_status as enum ('granted', 'revoked');
create type public.purchase_environment as enum ('sandbox', 'production');

-- The packs on sale. `id` is the product id, the same in App Store Connect and Play Console.
-- Prices live in the stores, so they are shown in the buyer's currency.
create table public.credit_packs (
  id text primary key check (id ~ '^[a-z0-9_.]{1,100}$'),
  credits integer not null check (credits between 1 and 1000),
  sort_order smallint not null default 0,
  active boolean not null default true
);

insert into public.credit_packs (id, credits, sort_order) values
  ('credits_5', 5, 1),
  ('credits_15', 15, 2),
  ('credits_40', 40, 3);

-- One row per store transaction. (store, purchase_id) is the idempotency key: the App Store
-- transactionId or the Play purchaseToken. A replayed receipt can never grant credits twice.
create table public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  store public.purchase_store not null,
  purchase_id text not null check (length(purchase_id) between 1 and 512),
  product_id text not null references public.credit_packs (id),
  credits integer not null check (credits > 0),
  environment public.purchase_environment not null,
  status public.purchase_status not null default 'granted',
  purchased_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store, purchase_id),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index credit_purchases_user_idx on public.credit_purchases (user_id);

-- At most one grant and one refund per purchase in the ledger, whatever calls them.
create unique index credit_ledger_purchase_once_idx on public.credit_ledger (reason, ref_id)
  where reason in ('purchase', 'refund');

alter table public.credit_packs enable row level security;
alter table public.credit_purchases enable row level security;
revoke all on public.credit_packs, public.credit_purchases from anon, authenticated;

grant select on public.credit_packs to anon, authenticated;
create policy credit_packs_select on public.credit_packs for select to anon, authenticated using (active);
-- credit_purchases: no client access at all (RLS on, no policies, no grants).

-- Grants the credits of a verified store transaction to p_user, once.
-- Returns {credits, balance, duplicate}. A transaction already claimed by another account
-- raises purchase_owned_by_other, so a receipt cannot be shared between accounts.
create function public.grant_purchase(
  p_user uuid,
  p_store public.purchase_store,
  p_purchase_id text,
  p_product_id text,
  p_environment public.purchase_environment,
  p_purchased_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pack public.credit_packs;
  existing public.credit_purchases;
  new_id uuid;
begin
  -- serialize with spends and refunds of the same user (see send_connection_request)
  perform pg_advisory_xact_lock(hashtext('credits:' || p_user::text));

  -- Inactive packs are still honoured: the buyer has paid for them.
  select * into pack from public.credit_packs where id = p_product_id;
  if not found then
    raise exception 'unknown_product' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  -- The unique key settles a race between two accounts sending the same receipt.
  insert into public.credit_purchases (user_id, store, purchase_id, product_id, credits, environment, purchased_at)
  values (p_user, p_store, p_purchase_id, pack.id, pack.credits, p_environment, p_purchased_at)
  on conflict (store, purchase_id) do nothing
  returning id into new_id;

  if new_id is null then
    select * into existing from public.credit_purchases where store = p_store and purchase_id = p_purchase_id;
    if existing.user_id <> p_user then
      raise exception 'purchase_owned_by_other' using errcode = '42501';
    end if;
    if existing.status = 'revoked' then
      raise exception 'purchase_revoked' using errcode = '22023';
    end if;
    return jsonb_build_object('credits', existing.credits, 'balance', public.credit_balance(p_user), 'duplicate', true);
  end if;

  insert into public.credit_ledger (user_id, delta, reason, ref_id)
  values (p_user, pack.credits, 'purchase', new_id);

  return jsonb_build_object('credits', pack.credits, 'balance', public.credit_balance(p_user), 'duplicate', false);
end $$;

-- Takes back the credits of a refunded or revoked purchase, once. The balance may go below
-- zero when the credits were already spent: she then cannot spend until it is positive again.
-- Returns {status: 'revoked' | 'already_revoked' | 'not_found', credits}.
create function public.revoke_purchase(p_store public.purchase_store, p_purchase_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.credit_purchases;
begin
  select * into p from public.credit_purchases where store = p_store and purchase_id = p_purchase_id;
  if not found then
    return jsonb_build_object('status', 'not_found', 'credits', 0);
  end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || p.user_id::text));
  select * into p from public.credit_purchases where id = p.id for update;
  if p.status = 'revoked' then
    return jsonb_build_object('status', 'already_revoked', 'credits', 0);
  end if;

  update public.credit_purchases set status = 'revoked', revoked_at = now() where id = p.id;
  insert into public.credit_ledger (user_id, delta, reason, ref_id)
  values (p.user_id, -p.credits, 'refund', p.id);
  return jsonb_build_object('status', 'revoked', 'credits', p.credits);
end $$;

revoke all on function public.grant_purchase(uuid, public.purchase_store, text, text, public.purchase_environment, timestamptz)
  from public, anon, authenticated;
revoke all on function public.revoke_purchase(public.purchase_store, text) from public, anon, authenticated;
grant execute on function public.grant_purchase(uuid, public.purchase_store, text, text, public.purchase_environment, timestamptz)
  to service_role;
grant execute on function public.revoke_purchase(public.purchase_store, text) to service_role;
