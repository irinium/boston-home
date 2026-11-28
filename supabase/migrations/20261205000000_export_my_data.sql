-- Data export (GDPR art. 15 and 20, Swiss FADP art. 25 and 28).
-- Called only by the `export-my-data` Edge Function (service role) for the signed-in user.
--
-- It returns her own records and nothing that identifies another woman: no ids, names or
-- messages of the other side of a request or meeting, no report snapshots, no room names,
-- and only the number of accounts she blocked.
create function public.export_user_data(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'age_band', p.age_band,
        'languages', to_jsonb(p.languages),
        'photo_path', p.photo_path,
        'verification_status', p.verification_status,
        'verified_at', p.verified_at,
        'is_suspended', p.is_suspended,
        'suspended_reason', p.suspended_reason,
        'created_at', p.created_at
      )
      from public.profiles p where p.id = p_user
    ),
    'listing', (
      select to_jsonb(l) - 'owner_id' from public.listings l where l.owner_id = p_user
    ),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.starts_at)
      from public.availability_slots s where s.owner_id = p_user
    ), '[]'),
    'requests_sent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'message', r.message, 'status', r.status,
        'created_at', r.created_at, 'responded_at', r.responded_at
      ) order by r.created_at)
      from public.connection_requests r where r.requester_id = p_user
    ), '[]'),
    -- The message of a received request is the sender's own text, so it stays out.
    'requests_received', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'created_at', r.created_at, 'responded_at', r.responded_at
      ) order by r.created_at)
      from public.connection_requests r where r.owner_id = p_user
    ), '[]'),
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'request_id', m.request_id,
        'role', case when m.owner_id = p_user then 'host' else 'guest' end,
        'starts_at', m.starts_at,
        'ends_at', m.ends_at,
        'status', m.status,
        'created_at', m.created_at
      ) order by m.starts_at)
      from public.meetings m where p_user in (m.owner_id, m.requester_id)
    ), '[]'),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rp.id, 'reason', rp.reason, 'details', rp.details, 'status', rp.status,
        'created_at', rp.created_at, 'resolved_at', rp.resolved_at
      ) order by rp.created_at)
      from public.reports rp where rp.reporter_id = p_user
    ), '[]'),
    'blocked_accounts', (select count(*) from public.blocks b where b.blocker_id = p_user),
    'credits', jsonb_build_object(
      'balance', public.credit_balance(p_user),
      'ledger', coalesce((
        select jsonb_agg(jsonb_build_object(
          'delta', c.delta, 'reason', c.reason, 'ref_id', c.ref_id, 'created_at', c.created_at
        ) order by c.id)
        from public.credit_ledger c where c.user_id = p_user
      ), '[]')
    ),
    'verifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', v.provider, 'status', v.status, 'created_at', v.created_at, 'decided_at', v.decided_at
      ) order by v.created_at)
      from public.verification_sessions v where v.user_id = p_user
    ), '[]')
  ) into result;

  return result;
end $$;

revoke all on function public.export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.export_user_data(uuid) to service_role;
