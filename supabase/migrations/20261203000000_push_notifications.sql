-- Push notifications without names.
--
-- A push message shows on a lock screen, so it never carries a name, a city, a message text
-- or a time: only a generic line such as "You have a new request". The app shows the details
-- after the woman opens it and signs in.
--
-- Flow: triggers on requests and meetings only add rows to `notification_outbox` (they never
-- call HTTP, so a slow push service can never block or roll back a booking). The `notify`
-- Edge Function, run every minute by pg_cron, claims due rows, sends them through the Expo
-- push service and reports back which were sent, which should be retried and which device
-- tokens are dead.

create type public.notification_kind as enum (
  'request_received',
  'request_accepted',
  'request_declined',
  'meeting_booked',
  'meeting_cancelled',
  'meeting_starting'
);

-- ---------------------------------------------------------------------------
-- Device tokens. One row per device; a device that signs in to another account moves to it.
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  -- Language of the generic texts on this device.
  locale text not null default 'en' check (locale in ('uk', 'en')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
-- She can see and remove her own devices; adding one goes through register_push_token.
grant select, delete on public.push_tokens to authenticated;
create policy push_tokens_own_select on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy push_tokens_own_delete on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- At most this many devices per account; the least recently registered ones are dropped.
create function public.push_tokens_per_user() returns integer
language sql immutable set search_path = '' as $$ select 5 $$;

create function public.register_push_token(p_token text, p_platform text, p_locale text default 'en')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$' then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  insert into public.push_tokens (token, user_id, platform, locale, updated_at)
  values (p_token, viewer, p_platform, case when p_locale = 'uk' then 'uk' else 'en' end, clock_timestamp())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, locale = excluded.locale, updated_at = excluded.updated_at;

  delete from public.push_tokens
  where token in (
    select t.token from public.push_tokens t
    where t.user_id = viewer
    order by t.updated_at desc, t.token
    offset public.push_tokens_per_user()
  );
end $$;

-- ---------------------------------------------------------------------------
-- Opt-out. No row means push is on (she still has to allow notifications on the phone).
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Read and written only through the two functions below.
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;

create function public.push_enabled_for(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.push_enabled from public.notification_preferences p where p.user_id = p_user), true);
$$;

create function public.my_push_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.push_enabled_for(auth.uid());
$$;

create function public.set_push_enabled(p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  insert into public.notification_preferences (user_id, push_enabled, updated_at)
  values (viewer, p_enabled, now())
  on conflict (user_id) do update set push_enabled = excluded.push_enabled, updated_at = now();
  -- Switching off also drops what is still waiting to be sent.
  if not p_enabled then
    delete from public.notification_outbox where user_id = viewer and sent_at is null;
  end if;
  return p_enabled;
end $$;

-- ---------------------------------------------------------------------------
-- Outbox. Service role only. `ref_id` is the request or meeting the row is about; it is used
-- for de-duplication and for checking, at send time, that the event still matters. It is
-- never sent to the phone.
-- ---------------------------------------------------------------------------
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  ref_id uuid not null,
  send_after timestamptz not null default now(),
  attempts smallint not null default 0,
  locked_until timestamptz,
  sent_at timestamptz,
  -- true when the row was dropped instead of sent (opted out, no device, no longer relevant).
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id)
);
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
create index notification_outbox_due_idx on public.notification_outbox (send_after) where sent_at is null;
create index notification_outbox_ref_idx on public.notification_outbox (ref_id) where sent_at is null;

create function public.enqueue_notification(
  p_user uuid, p_kind public.notification_kind, p_ref uuid, p_send_after timestamptz default now()
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notification_outbox (user_id, kind, ref_id, send_after)
  values (p_user, p_kind, p_ref, p_send_after)
  on conflict (user_id, kind, ref_id) do nothing;
$$;

-- Requests: the owner hears about a new request; the requester hears the answer.
-- Nothing is queued between two accounts with a block (a block also declines their requests).
create function public.notify_on_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.enqueue_notification(new.owner_id, 'request_received', new.id);
    end if;
  elsif old.status = 'pending' and new.status in ('accepted', 'declined')
        and not public.is_blocked_between(new.owner_id, new.requester_id) then
    perform public.enqueue_notification(
      new.requester_id,
      case new.status when 'accepted' then 'request_accepted' else 'request_declined' end::public.notification_kind,
      new.id
    );
  end if;
  return null;
end $$;

create trigger connection_requests_notify after insert or update of status on public.connection_requests
  for each row execute function public.notify_on_request();

-- Meetings: the owner hears that a meeting was booked (the requester booked it herself), both
-- get a reminder when the room opens (10 minutes before the start), and whoever did not cancel
-- hears about a cancellation.
create function public.notify_on_meeting() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  participant uuid;
begin
  if tg_op = 'INSERT' then
    if new.status = 'scheduled' then
      perform public.enqueue_notification(new.owner_id, 'meeting_booked', new.id);
      perform public.enqueue_notification(new.owner_id, 'meeting_starting', new.id, new.starts_at - interval '10 minutes');
      perform public.enqueue_notification(new.requester_id, 'meeting_starting', new.id, new.starts_at - interval '10 minutes');
    end if;
  elsif old.status = 'scheduled' and new.status = 'cancelled' then
    delete from public.notification_outbox
    where ref_id = new.id and kind in ('meeting_booked', 'meeting_starting') and sent_at is null;
    if not public.is_blocked_between(new.owner_id, new.requester_id) then
      foreach participant in array array[new.owner_id, new.requester_id] loop
        if participant is distinct from auth.uid() then
          perform public.enqueue_notification(participant, 'meeting_cancelled', new.id);
        end if;
      end loop;
    end if;
  elsif new.status = 'scheduled' and new.starts_at is distinct from old.starts_at then
    update public.notification_outbox set send_after = new.starts_at - interval '10 minutes'
    where ref_id = new.id and kind = 'meeting_starting' and sent_at is null;
  end if;
  return null;
end $$;

create trigger meetings_notify after insert or update of status, starts_at on public.meetings
  for each row execute function public.notify_on_meeting();

-- ---------------------------------------------------------------------------
-- Sending (service role only, used by the `notify` Edge Function).
-- ---------------------------------------------------------------------------

-- Does a queued row still make sense right now? Checked at send time, because things change
-- between queueing and sending: a request is withdrawn, a meeting is cancelled, someone blocks.
create function public.notification_deliverable(o public.notification_outbox) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  pair uuid[];
  still_true boolean;
begin
  if not public.push_enabled_for(o.user_id) then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.id = o.user_id and p.is_suspended) then
    return false;
  end if;
  if not exists (select 1 from public.push_tokens t where t.user_id = o.user_id) then
    return false;
  end if;

  if o.kind in ('request_received', 'request_accepted', 'request_declined') then
    select array[r.owner_id, r.requester_id],
           case o.kind
             when 'request_received' then r.status = 'pending'
             when 'request_accepted' then r.status = 'accepted'
             else r.status = 'declined'
           end
    into pair, still_true
    from public.connection_requests r where r.id = o.ref_id;
  else
    select array[m.owner_id, m.requester_id],
           case o.kind
             when 'meeting_cancelled' then m.status = 'cancelled'
             -- A reminder that arrives after the start is noise.
             when 'meeting_starting' then m.status = 'scheduled' and now() < m.starts_at
             else m.status = 'scheduled'
           end
    into pair, still_true
    from public.meetings m where m.id = o.ref_id;
  end if;

  return coalesce(still_true, false) and not public.is_blocked_between(pair[1], pair[2]);
end $$;

-- Give up on a row after this many failed sends.
create function public.push_max_attempts() returns integer
language sql immutable set search_path = '' as $$ select 5 $$;

-- Claims up to `p_limit` due rows and returns one line per (row, device). Rows that should not
-- be sent are marked as skipped on the spot. Claimed rows are locked for two minutes; if the
-- function crashes before finish_push_batch, they become due again after that.
create function public.claim_push_batch(p_limit integer default 100)
returns table (outbox_id bigint, kind public.notification_kind, token text, locale text)
language plpgsql security definer set search_path = '' as $$
declare
  r public.notification_outbox;
begin
  for r in
    select * from public.notification_outbox o
    where o.sent_at is null and o.send_after <= now()
      and (o.locked_until is null or o.locked_until < now())
    order by o.send_after, o.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  loop
    if r.attempts < public.push_max_attempts()
       and r.send_after > now() - interval '1 day'
       and public.notification_deliverable(r) then
      update public.notification_outbox
      set locked_until = now() + interval '2 minutes', attempts = attempts + 1
      where id = r.id;
      return query
      select r.id, r.kind, t.token, t.locale from public.push_tokens t where t.user_id = r.user_id order by t.token;
    else
      update public.notification_outbox set sent_at = now(), skipped = true, locked_until = null where id = r.id;
    end if;
  end loop;
end $$;

-- Reports the outcome of a batch: rows that were sent, rows to retry later (with exponential
-- backoff: 2, 4, 8, ... minutes), and device tokens the push service says no longer exist.
-- Also drops finished rows older than a week, so the outbox stays small.
create function public.finish_push_batch(p_sent bigint[], p_retry bigint[], p_dead_tokens text[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_outbox set sent_at = now(), locked_until = null
  where id = any(coalesce(p_sent, '{}')) and sent_at is null;

  update public.notification_outbox
  set locked_until = null, send_after = now() + make_interval(mins => power(2, attempts)::integer)
  where id = any(coalesce(p_retry, '{}')) and sent_at is null;

  delete from public.push_tokens where token = any(coalesce(p_dead_tokens, '{}'));

  delete from public.notification_outbox where sent_at < now() - interval '7 days';
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.push_tokens_per_user() from public, anon, authenticated;
revoke all on function public.register_push_token(text, text, text) from public, anon, authenticated;
revoke all on function public.my_push_enabled() from public, anon, authenticated;
revoke all on function public.set_push_enabled(boolean) from public, anon, authenticated;
revoke all on function public.enqueue_notification(uuid, public.notification_kind, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.notify_on_request() from public, anon, authenticated;
revoke all on function public.notify_on_meeting() from public, anon, authenticated;
revoke all on function public.notification_deliverable(public.notification_outbox) from public, anon, authenticated;
revoke all on function public.push_enabled_for(uuid) from public, anon, authenticated;
revoke all on function public.push_max_attempts() from public, anon, authenticated;
revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_push_batch(bigint[], bigint[], text[]) from public, anon, authenticated;

grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.my_push_enabled() to authenticated;
grant execute on function public.set_push_enabled(boolean) to authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.finish_push_batch(bigint[], bigint[], text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Schedule: run `notify` every minute where pg_cron, pg_net and Vault exist (Supabase), and only
-- when something is due. It reads the Vault secrets `project_url` and `notify_secret`; see README.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('notify', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')
        )
      )
      where exists (
        select 1 from public.notification_outbox
        where sent_at is null and send_after <= now() and (locked_until is null or locked_until < now())
      )
    $job$);
  end if;
end $$;
