-- Moderation admin panel: admins, an append-only audit log and the RPCs the admin web app calls.
--
-- Rules:
--   * Admins are rows in `admin_users`. Nobody can read or change that table from a client; it is
--     managed with the service role (see README). Every admin RPC checks it first.
--   * Every moderation action writes one row to `moderation_log` in the same transaction. The log is
--     append-only: no role, not even the service role, can update or delete its rows.
--   * Unsuspending an account only lifts the suspension. Blocks that members created (including the
--     automatic block a report adds) stay, so nobody has to see a person she reported again.
--   * The admin RPCs never return the reporter's identity, contact details or exact location.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create type public.moderation_action as enum (
  'suspend_account', 'unsuspend_account', 'hide_listing', 'unhide_listing', 'set_report_status'
);

create table public.moderation_log (
  id bigint generated always as identity primary key,
  -- kept (as null) after the admin's account is deleted, so the history survives.
  admin_id uuid references auth.users (id) on delete set null,
  action public.moderation_action not null,
  target_user_id uuid,
  target_listing_id uuid,
  target_report_id uuid,
  reason text not null default '' check (char_length(reason) <= 500),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index moderation_log_recent_idx on public.moderation_log (id desc);
create index moderation_log_target_user_idx on public.moderation_log (target_user_id);

alter table public.admin_users enable row level security;
alter table public.moderation_log enable row level security;
-- No policies and no grants: clients reach both tables only through the functions below.
revoke all on public.admin_users, public.moderation_log from public, anon, authenticated;

-- The only change allowed is the `on delete set null` of admin_id when an admin's account is deleted.
create function public.moderation_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.admin_id is not null and new.admin_id is null
     and (to_jsonb(new) - 'admin_id') = (to_jsonb(old) - 'admin_id') then
    return new;
  end if;
  raise exception 'moderation_log_is_append_only' using errcode = '42501';
end $$;

create trigger moderation_log_no_change before update or delete on public.moderation_log
  for each row execute function public.moderation_log_immutable();
create trigger moderation_log_no_truncate before truncate on public.moderation_log
  for each statement execute function public.moderation_log_immutable();

-- ---------------------------------------------------------------------------
-- Internal helpers (not granted to clients)
-- ---------------------------------------------------------------------------

create function public.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.admin_users a where a.user_id = p_user);
$$;

-- Returns the calling admin's id, or raises `not_admin`.
create function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return caller;
end $$;

-- Returns the trimmed reason, or raises `reason_required` when it is shorter than 3 characters.
create function public.require_reason(p_reason text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  trimmed text := btrim(coalesce(p_reason, ''));
begin
  if char_length(trimmed) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(trimmed) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  return trimmed;
end $$;

create function public.write_moderation_log(
  p_admin uuid, p_action public.moderation_action, p_reason text,
  p_user uuid default null, p_listing uuid default null, p_report uuid default null,
  p_details jsonb default '{}'
) returns bigint
language sql security definer set search_path = '' as $$
  insert into public.moderation_log (admin_id, action, reason, target_user_id, target_listing_id, target_report_id, details)
  values (p_admin, p_action, coalesce(p_reason, ''), p_user, p_listing, p_report, coalesce(p_details, '{}'))
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

-- Lets the admin app check, right after sign-in, whether the account may use it.
create function public.admin_whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', auth.uid(), 'is_admin', public.is_admin(auth.uid()));
$$;

-- Report queue, oldest first, with keyset pagination on (created_at, id).
create function public.admin_report_queue(
  p_statuses public.report_status[] default array['open', 'reviewing']::public.report_status[],
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 50
) returns table (
  id uuid,
  reason public.report_reason,
  details text,
  snapshot jsonb,
  status public.report_status,
  created_at timestamptz,
  resolved_at timestamptz,
  reported_id uuid,
  reported_display_name text,
  reported_is_suspended boolean,
  listing_id uuid,
  listing_status public.listing_status,
  open_reports_against integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select r.id, r.reason, r.details, r.snapshot, r.status, r.created_at, r.resolved_at,
      r.reported_id, p.display_name, coalesce(p.is_suspended, false),
      l.id, l.status,
      (select count(*)::integer from public.reports o
       where o.reported_id = r.reported_id and o.status in ('open', 'reviewing'))
    from public.reports r
    left join public.profiles p on p.id = r.reported_id
    left join public.listings l on l.owner_id = r.reported_id
    where r.status = any (coalesce(p_statuses, array['open', 'reviewing']::public.report_status[]))
      and (p_after_created_at is null
           or (r.created_at, r.id) > (p_after_created_at, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by r.created_at, r.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- What a moderator needs to decide on an account. No contact details or coordinates.
create function public.admin_account(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'created_at', p.created_at,
    'verification_status', p.verification_status,
    'is_suspended', p.is_suspended,
    'suspended_reason', p.suspended_reason,
    'is_admin', public.is_admin(p.id),
    'listing', (select jsonb_build_object('id', l.id, 'status', l.status, 'title', l.title)
                from public.listings l where l.owner_id = p.id),
    'open_reports', (select count(*) from public.reports r
                     where r.reported_id = p.id and r.status in ('open', 'reviewing')),
    'total_reports', (select count(*) from public.reports r where r.reported_id = p.id)
  ) into result
  from public.profiles p where p.id = p_user_id;
  if result is null then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  return result;
end $$;

create function public.admin_suspend_account(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  why text := public.require_reason(p_reason);
  target public.profiles;
begin
  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  if public.is_admin(p_user_id) then
    raise exception 'target_is_admin' using errcode = '42501';
  end if;
  if target.is_suspended then
    raise exception 'already_suspended' using errcode = '55000';
  end if;
  update public.profiles set is_suspended = true, suspended_reason = why where id = p_user_id;
  perform public.write_moderation_log(admin, 'suspend_account', why, p_user := p_user_id);
end $$;

-- Lifts the suspension only. Blocks between members are left exactly as they are.
create function public.admin_unsuspend_account(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  why text := public.require_reason(p_reason);
  target public.profiles;
begin
  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  if not target.is_suspended then
    raise exception 'not_suspended' using errcode = '55000';
  end if;
  update public.profiles set is_suspended = false, suspended_reason = null where id = p_user_id;
  perform public.write_moderation_log(admin, 'unsuspend_account', why, p_user := p_user_id,
    p_details := jsonb_build_object('previous_reason', target.suspended_reason));
end $$;

create function public.admin_hide_listing(p_listing_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  why text := public.require_reason(p_reason);
  target public.listings;
begin
  select * into target from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if target.status = 'hidden' then
    raise exception 'already_hidden' using errcode = '55000';
  end if;
  update public.listings set status = 'hidden' where id = p_listing_id;
  perform public.write_moderation_log(admin, 'hide_listing', why, p_user := target.owner_id,
    p_listing := p_listing_id, p_details := jsonb_build_object('previous_status', target.status));
end $$;

-- An unhidden listing comes back paused: the owner decides when to publish it again.
create function public.admin_unhide_listing(p_listing_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  why text := public.require_reason(p_reason);
  target public.listings;
begin
  select * into target from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if target.status <> 'hidden' then
    raise exception 'not_hidden' using errcode = '55000';
  end if;
  update public.listings set status = 'paused' where id = p_listing_id;
  perform public.write_moderation_log(admin, 'unhide_listing', why, p_user := target.owner_id,
    p_listing := p_listing_id);
end $$;

create function public.admin_set_report_status(p_report_id uuid, p_status public.report_status, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  note text := btrim(coalesce(p_note, ''));
  target public.reports;
begin
  if char_length(note) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if p_status is null or p_status = 'open' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select * into target from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if target.status = p_status then
    raise exception 'status_unchanged' using errcode = '55000';
  end if;
  update public.reports
  set status = p_status,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
  where id = p_report_id;
  perform public.write_moderation_log(admin, 'set_report_status', note, p_user := target.reported_id,
    p_report := p_report_id, p_details := jsonb_build_object('from', target.status, 'to', p_status));
end $$;

-- Audit log, newest first, with keyset pagination on id.
create function public.admin_moderation_log(
  p_before_id bigint default null,
  p_target_user_id uuid default null,
  p_limit integer default 50
) returns table (
  id bigint,
  admin_id uuid,
  action public.moderation_action,
  target_user_id uuid,
  target_listing_id uuid,
  target_report_id uuid,
  reason text,
  details jsonb,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select g.id, g.admin_id, g.action, g.target_user_id, g.target_listing_id, g.target_report_id,
      g.reason, g.details, g.created_at
    from public.moderation_log g
    where (p_before_id is null or g.id < p_before_id)
      and (p_target_user_id is null or g.target_user_id = p_target_user_id)
    order by g.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ---------------------------------------------------------------------------
-- Grants (PostgreSQL grants EXECUTE to PUBLIC by default, so revoke first)
-- ---------------------------------------------------------------------------

revoke all on function public.moderation_log_immutable() from public, anon, authenticated;
revoke all on function public.is_admin(uuid) from public, anon, authenticated;
revoke all on function public.require_admin() from public, anon, authenticated;
revoke all on function public.require_reason(text) from public, anon, authenticated;
revoke all on function public.write_moderation_log(uuid, public.moderation_action, text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_whoami() from public, anon;
revoke all on function public.admin_report_queue(public.report_status[], timestamptz, uuid, integer) from public, anon;
revoke all on function public.admin_account(uuid) from public, anon;
revoke all on function public.admin_suspend_account(uuid, text) from public, anon;
revoke all on function public.admin_unsuspend_account(uuid, text) from public, anon;
revoke all on function public.admin_hide_listing(uuid, text) from public, anon;
revoke all on function public.admin_unhide_listing(uuid, text) from public, anon;
revoke all on function public.admin_set_report_status(uuid, public.report_status, text) from public, anon;
revoke all on function public.admin_moderation_log(bigint, uuid, integer) from public, anon;

-- Signed-in accounts may call the admin RPCs; each one rejects non-admins with `not_admin`.
grant execute on function public.admin_whoami() to authenticated;
grant execute on function public.admin_report_queue(public.report_status[], timestamptz, uuid, integer) to authenticated;
grant execute on function public.admin_account(uuid) to authenticated;
grant execute on function public.admin_suspend_account(uuid, text) to authenticated;
grant execute on function public.admin_unsuspend_account(uuid, text) to authenticated;
grant execute on function public.admin_hide_listing(uuid, text) to authenticated;
grant execute on function public.admin_unhide_listing(uuid, text) to authenticated;
grant execute on function public.admin_set_report_status(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_moderation_log(bigint, uuid, integer) to authenticated;
