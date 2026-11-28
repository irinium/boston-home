-- my_account() also returns the profile fields the app edits (age band, languages),
-- so the profile screen does not need a separate read of the profiles table.
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'verification_status', p.verification_status,
    'trusted', public.is_trusted(p.id),
    'photo_path', p.photo_path,
    'age_band', p.age_band,
    'languages', p.languages,
    'is_suspended', p.is_suspended,
    'credits', public.credit_balance(p.id),
    'has_listing', exists (select 1 from public.listings l where l.owner_id = p.id)
  )
  from public.profiles p where p.id = auth.uid();
$$;

-- Video calls have no time limit. A booking reserves a window (60 minutes in the app) so that
-- neither woman gets two meetings in that hour; the call itself is never cut off at ends_at.
comment on column public.meetings.ends_at is
  'End of the reserved booking window (start + 60 min in the app) used for overlap checks only. The video call has no time limit.';

-- ---------------------------------------------------------------------------
-- Meetings that are over. A meeting room can be joined until 12 hours after the start;
-- after that the meeting counts as completed, so the pair can book another call.
-- Run on a schedule next to expire_stale_requests (service role only).
-- ---------------------------------------------------------------------------
create function public.complete_past_meetings() returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update public.meetings set status = 'completed'
    where status = 'scheduled' and starts_at < now() - interval '12 hours'
    returning 1
  )
  select count(*)::integer from done;
$$;
revoke all on function public.complete_past_meetings() from public, anon, authenticated;

-- Schedule both clean-up jobs with pg_cron where it exists (Supabase has it; plain test Postgres does not).
-- The app does not depend on the schedule: book_meeting completes past meetings itself and lists filter by time.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('complete-past-meetings', '*/30 * * * *', 'select public.complete_past_meetings()');
    perform cron.schedule('expire-stale-requests', '15 * * * *', 'select public.expire_stale_requests()');
  end if;
end $$;

-- book_meeting: as before, but a meeting that is already over no longer blocks a new booking
-- (it is marked completed on the spot) and the app reserves 60 minutes by default.
create or replace function public.book_meeting(p_request_id uuid, p_starts_at timestamptz, p_minutes integer default 60)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  req public.connection_requests;
  ends timestamptz;
  new_id uuid;
begin
  if p_minutes not in (15, 30, 45, 60) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  ends := p_starts_at + make_interval(mins => p_minutes);

  select * into req from public.connection_requests where id = p_request_id for update;
  if not found or req.requester_id <> auth.uid() then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if req.status <> 'accepted' then
    raise exception 'request_not_accepted' using errcode = '22023';
  end if;
  if p_starts_at < now() + interval '30 minutes' then
    raise exception 'too_soon' using errcode = '22023';
  end if;
  update public.meetings set status = 'completed'
  where request_id = p_request_id and status = 'scheduled' and starts_at < now() - interval '12 hours';
  if exists (select 1 from public.meetings where request_id = p_request_id and status = 'scheduled') then
    raise exception 'meeting_exists' using errcode = '23505';
  end if;
  if not exists (
    select 1 from public.availability_slots s
    where s.owner_id = req.owner_id and s.starts_at <= p_starts_at and s.ends_at >= ends
  ) then
    raise exception 'slot_unavailable' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('meetings:' || req.owner_id::text));
  if exists (
    select 1 from public.meetings m
    where m.status = 'scheduled'
      and (m.owner_id in (req.owner_id, req.requester_id) or m.requester_id in (req.owner_id, req.requester_id))
      and tstzrange(m.starts_at, m.ends_at) && tstzrange(p_starts_at, ends)
  ) then
    raise exception 'slot_taken' using errcode = '23P01';
  end if;

  insert into public.meetings (request_id, owner_id, requester_id, starts_at, ends_at)
  values (p_request_id, req.owner_id, req.requester_id, p_starts_at, ends)
  returning id into new_id;
  return new_id;
end $$;

-- Start times the requester of an accepted request can book: every 30 minutes inside the
-- owner's free time, at least 30 minutes ahead, and not overlapping any scheduled meeting of
-- either woman. The database is the only place that decides which times are free; the
-- owner's other meetings are not revealed, only left out.
create function public.bookable_starts(p_request_id uuid, p_minutes integer default 60)
returns setof timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  req public.connection_requests;
  len interval := make_interval(mins => p_minutes);
begin
  select * into req from public.connection_requests where id = p_request_id;
  if not found or req.requester_id is distinct from auth.uid() or req.status <> 'accepted' then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  return query
  select distinct t
  from public.availability_slots s,
    generate_series(s.starts_at, s.ends_at - len, interval '30 minutes') as t
  where s.owner_id = req.owner_id
    and t >= now() + interval '30 minutes'
    and not exists (
      select 1 from public.meetings m
      where m.status = 'scheduled'
        and (m.owner_id in (req.owner_id, req.requester_id) or m.requester_id in (req.owner_id, req.requester_id))
        and tstzrange(m.starts_at, m.ends_at) && tstzrange(t, t + len)
    )
  order by t
  limit 200;
end $$;
revoke all on function public.bookable_starts(uuid, integer) from public, anon;
grant execute on function public.bookable_starts(uuid, integer) to authenticated;

-- Free-time slots of one owner may not overlap (that would offer the same time twice).
create function public.guard_slot_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('slots:' || new.owner_id::text));
  if exists (
    select 1 from public.availability_slots s
    where s.owner_id = new.owner_id and s.id <> new.id
      and tstzrange(s.starts_at, s.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'slot_overlaps' using errcode = '23P01';
  end if;
  return new;
end $$;
revoke all on function public.guard_slot_overlap() from public, anon, authenticated;

create trigger availability_slots_no_overlap before insert or update on public.availability_slots
  for each row execute function public.guard_slot_overlap();
