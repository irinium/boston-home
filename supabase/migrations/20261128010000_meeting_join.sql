-- Joining a video meeting. Called only by the `meeting-join` Edge Function (service role),
-- which then creates the private Daily room and a personal token.
create function public.meeting_for_join(p_meeting_id uuid, p_user uuid)
returns table (room_name text, starts_at timestamptz, display_name text)
language plpgsql security definer set search_path = '' as $$
declare
  m public.meetings;
begin
  select * into m from public.meetings where id = p_meeting_id for update;
  if not found or p_user not in (m.owner_id, m.requester_id) then
    raise exception 'meeting_not_found' using errcode = 'P0002';
  end if;
  if m.status <> 'scheduled' then
    raise exception 'meeting_not_active' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.profiles p where p.id in (m.owner_id, m.requester_id) and p.is_suspended
  ) or public.is_blocked_between(m.owner_id, m.requester_id) then
    raise exception 'meeting_not_active' using errcode = '22023';
  end if;
  -- The room opens 10 minutes early and can be joined for 12 hours after the start.
  -- Once in, the call is never cut off: it has no time limit.
  if now() < m.starts_at - interval '10 minutes' then
    raise exception 'too_early' using errcode = '22023';
  end if;
  if now() > m.starts_at + interval '12 hours' then
    raise exception 'meeting_over' using errcode = '22023';
  end if;

  if m.video_room_name is null then
    m.video_room_name := 'bh-' || replace(gen_random_uuid()::text, '-', '');
    update public.meetings set video_room_name = m.video_room_name where id = m.id;
  end if;

  return query
  select m.video_room_name, m.starts_at, coalesce(p.display_name, '')
  from public.profiles p where p.id = p_user;
end $$;

revoke all on function public.meeting_for_join(uuid, uuid) from public, anon, authenticated;
grant execute on function public.meeting_for_join(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Closing video rooms. A cancelled meeting must end video access at once, also for a
-- call that is already running. Cancelling (by either woman, by a block, or by a
-- suspension) queues the room here; the `video-cleanup` Edge Function deletes it at
-- Daily, which ejects everyone. Tokens are short-lived as well (see _shared/daily.ts).
-- ---------------------------------------------------------------------------
create table public.video_room_closures (
  room_name text primary key,
  queued_at timestamptz not null default now(),
  closed_at timestamptz
);
-- Service role only: RLS on, no policies, no grants.
alter table public.video_room_closures enable row level security;
revoke all on public.video_room_closures from anon, authenticated;
create index video_room_closures_open_idx on public.video_room_closures (queued_at) where closed_at is null;

create function public.queue_room_closure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.video_room_name is not null and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.video_room_closures (room_name) values (new.video_room_name)
    on conflict (room_name) do nothing;
  end if;
  return new;
end $$;

create trigger meetings_queue_room_closure after update of status on public.meetings
  for each row execute function public.queue_room_closure();

-- A suspended account meets nobody: her scheduled meetings are cancelled (which closes their rooms).
create function public.cancel_meetings_on_suspension() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_suspended and not old.is_suspended then
    update public.meetings set status = 'cancelled'
    where status = 'scheduled' and new.id in (owner_id, requester_id);
  end if;
  return new;
end $$;

create trigger profiles_cancel_meetings_on_suspension after update of is_suspended on public.profiles
  for each row execute function public.cancel_meetings_on_suspension();

-- Run video-cleanup every minute where pg_cron, pg_net and Vault exist (Supabase). It reads
-- the secrets `project_url` and `video_cleanup_secret` from Vault; see README.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('video-cleanup', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/video-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'video_cleanup_secret')
        )
      )
      where exists (select 1 from public.video_room_closures where closed_at is null)
    $job$);
  end if;
end $$;
