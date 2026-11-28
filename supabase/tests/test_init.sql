-- Behaviour tests for the initial migration. Run with scripts/test-db.sh.
-- Each check raises an exception on failure, which stops psql (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on

create schema t;
create function t.as_user(p uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false) $$;
create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
-- Runs `sql` as `role` and returns the error message, or null when it succeeds.
create function t.err(p_role text, sql text) returns text language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute sql;
  reset role;
  return null;
exception when others then
  reset role;
  return sqlerrm;
end $$;
grant usage on schema t to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Fixed ids
insert into auth.users (id, created_at) values
  ('00000000-0000-0000-0000-00000000000a', now() - interval '30 days'), -- alice: listing owner
  ('00000000-0000-0000-0000-00000000000b', now()),                      -- bella: new requester
  ('00000000-0000-0000-0000-00000000000c', now()),                      -- carol: unverified
  ('00000000-0000-0000-0000-00000000000d', now() - interval '30 days'), -- max: attacker who passed liveness
  ('00000000-0000-0000-0000-000000000001', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000002', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000003', now() - interval '30 days');

select t.ok((select count(*) from public.profiles) = 7, 'profile row created for every auth user');

update public.profiles set verification_status = 'verified', display_name = 'User ' || right(id::text, 1),
  age_band = '35_44', photo_path = id || '/face.jpg', languages = '{uk,en}'
where id <> '00000000-0000-0000-0000-00000000000c';
-- carol has neither a selfie check nor a profile photo.
update public.profiles set created_at = u.created_at from auth.users u where u.id = profiles.id;

-- Listings of the extra owners (inserted as service role, i.e. this superuser session)
insert into public.listings (owner_id, status, title, country_code, city, approx_lat, approx_lng, has_children, children_count)
select id, 'active', 'Listing ' || right(id::text, 1), 'PL', 'Warszawa', 52.2297, 21.0122, true, 1
from public.profiles where id::text like '00000000-0000-0000-0000-00000000000_' and right(id::text, 1) in ('1','2','3');

-- ---------------------------------------------------------------- alice
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok(t.err('authenticated', $q$
  insert into public.listings (owner_id, status, title, country_code, city, approx_lat, approx_lng,
    target_country_code, target_city, has_children, children_count, children_age_bands, pets, smoking)
  values ('00000000-0000-0000-0000-00000000000a', 'active', 'Шукаю жінку для бостонського шлюбу',
    'IT', 'Roma', 41.902782, 12.496366, 'IT', 'Roma', true, 1, '{0_3}', '{}', 'no')
$q$) is null, 'verified owner can publish a listing');

select t.ok(
  (select approx_lat <> 41.902782 and abs(approx_lat - 41.902782) < 0.05 from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a'),
  'listing coordinates are snapped and offset, never stored exactly');

select t.ok(t.err('authenticated', $q$
  update public.listings set city = 'Roma' where owner_id = '00000000-0000-0000-0000-00000000000a'
$q$) is null and (select approx_lat from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a')
  = (select public.obfuscate_coordinate(41.902782, hashtext(id::text)) from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a'),
  're-saving a listing does not move its obfuscated point');

select t.ok(t.err('authenticated', $q$
  update public.listings set status = 'hidden' where owner_id = '00000000-0000-0000-0000-00000000000a'
$q$) like '%listing_status_forbidden%', 'owners cannot set moderation-only status');

select t.ok(t.err('authenticated', $q$
  update public.profiles set verification_status = 'verified' where id = '00000000-0000-0000-0000-00000000000a'
$q$) like '%permission denied%', 'users cannot change their verification status');

select t.ok(t.err('authenticated', $q$
  insert into public.credit_ledger (user_id, delta, reason) values ('00000000-0000-0000-0000-00000000000a', 100, 'admin_adjustment')
$q$) like '%permission denied%', 'users cannot mint credits');

-- ---------------------------------------------------------------- carol (unverified)
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok(t.err('authenticated', $q$
  insert into public.listings (owner_id, status, title, country_code, city)
  values ('00000000-0000-0000-0000-00000000000c', 'active', 'Fake listing', 'UA', 'Kyiv')
$q$) like '%verification_required%', 'unverified account cannot publish');
select t.ok(t.err('authenticated', $q$
  insert into public.listings (owner_id, status, title, country_code, city)
  values ('00000000-0000-0000-0000-00000000000c', 'draft', 'Draft listing', 'UA', 'Kyiv')
$q$) is null, 'unverified account can prepare a draft');

create temp table seen (n int);
grant all on seen to anon, authenticated, service_role;
select t.err('authenticated', 'insert into seen select count(*) from public.listings');
select t.ok((select n from seen) = 1, 'unverified account sees only her own listing directly');
truncate seen;

select t.err('authenticated', $q$ insert into seen select count(*) from public.search_listings()
  where photo_paths is null and approx_lat is null $q$);
select t.ok((select n from seen) = 4, 'unverified account gets the showcase without photos or coordinates');
truncate seen;

select t.ok(t.err('authenticated', $q$
  insert into storage.objects (bucket_id, name) values ('listing-photos', '00000000-0000-0000-0000-00000000000a/x.jpg')
$q$) like '%row-level security%', 'cannot upload into another user''s folder');

-- ---------------------------------------------------------------- guest
select t.as_user(null);
select t.err('anon', $q$ insert into seen select count(*) from public.search_listings(p_country => 'it')
  where photo_paths is null and approx_lat is null and city = 'Roma' $q$);
select t.ok((select n from seen) = 1, 'guests can browse the showcase, filtered by country');
truncate seen;
select t.ok(t.err('anon', 'select * from public.listings') like '%permission denied%', 'guests cannot read the listings table');
select t.ok(t.err('anon', 'select * from public.profiles') like '%permission denied%', 'guests cannot read profiles');
select t.err('anon', $q$ insert into seen select count(*) from public.search_listings(p_lat => 52.23, p_lng => 21.01, p_radius_km => 1) $q$);
select t.ok((select n from seen) = 3, 'radius is at least 10 km');
truncate seen;
select t.err('anon', $q$ insert into seen select count(*) from public.search_listings(p_limit => 1000) $q$);
select t.ok((select n from seen) <= 30, 'page size is capped');
truncate seen;

-- ---------------------------------------------------------------- bella (verified, new account)
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.err('authenticated', $q$ insert into seen select count(*) from public.search_listings()
  where photo_paths is not null and approx_lat is not null $q$);
select t.ok((select n from seen) = 4, 'verified members see photos and approximate coordinates');
truncate seen;

select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a'),
    'Напишіть мені в телеграм')
$q$) like '%contact_info_not_allowed%', 'messages with messenger names are rejected');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a'),
    'мій номер +38 (067) 123-45-67')
$q$) like '%contact_info_not_allowed%', 'messages with phone numbers are rejected');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a'),
    'Привіт! Мені дуже відгукується ваш текст, у мене теж є донька 2 років.')
$q$) is null, 'a clean request is sent');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a'), 'ще раз')
$q$) like '%request_exists%', 'no duplicate open requests');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-000000000001'), 'Привіт')
$q$) is null, 'second request');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-000000000002'), 'Привіт')
$q$) is null, 'third request');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-000000000003'), 'Привіт')
$q$) like '%rate_limited%', 'new accounts are limited to 3 requests a day');
select t.ok(t.err('authenticated', $q$
  select public.respond_to_request((select id from public.connection_requests where requester_id = '00000000-0000-0000-0000-00000000000b' limit 1), true)
$q$) like '%request_not_found%', 'requesters cannot accept their own requests');
select t.ok(t.err('authenticated', $q$
  update public.connection_requests set status = 'accepted'
$q$) like '%permission denied%', 'request state cannot be edited directly');

-- ---------------------------------------------------------------- owner 1 accepts, sets availability, bella books
select t.as_user('00000000-0000-0000-0000-000000000001');
select t.err('authenticated', $q$ insert into seen select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b' $q$);
select t.ok((select n from seen) = 1, 'owner sees the profile of whoever sent her a request');
truncate seen;
select t.ok(t.err('authenticated', $q$
  select public.respond_to_request((select id from public.connection_requests where owner_id = auth.uid()), true)
$q$) is null, 'owner accepts');
select t.ok(t.err('authenticated', $q$
  insert into public.availability_slots (owner_id, starts_at, ends_at)
  values (auth.uid(), date_trunc('day', now()) + interval '2 days 10 hours', date_trunc('day', now()) + interval '2 days 12 hours')
$q$) is null, 'owner adds availability');

select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(t.err('authenticated', $q$
  select public.book_meeting((select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-000000000001'),
    date_trunc('day', now()) + interval '2 days 13 hours')
$q$) like '%slot_unavailable%', 'cannot book outside availability');
select t.ok(t.err('authenticated', $q$
  select public.book_meeting((select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-000000000001'),
    date_trunc('day', now()) + interval '2 days 10 hours 30 minutes')
$q$) is null, 'books a meeting inside availability');
select t.ok(t.err('authenticated', $q$
  select public.book_meeting((select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-000000000001'),
    date_trunc('day', now()) + interval '2 days 11 hours')
$q$) like '%meeting_exists%', 'one scheduled meeting per request');
select t.ok(t.err('authenticated', 'select video_room_name from public.meetings') like '%permission denied%',
  'video room names are not readable by clients');

-- ---------------------------------------------------------------- paid requests and refunds
reset role;
update public.app_settings set paid_requests_enabled = true;
insert into public.credit_ledger (user_id, delta, reason) values ('00000000-0000-0000-0000-00000000000d', 2, 'purchase');

select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-00000000000a'), 'Hello')
$q$) is null, 'paid request spends a credit');
select t.err('authenticated', 'insert into seen select public.my_credit_balance()');
select t.ok((select n from seen) = 1, 'balance after spending is 1');
truncate seen;
select t.err('authenticated', $q$ insert into seen select count(*) from public.connection_requests $q$);
select t.ok((select n from seen) = 1, 'a user sees only her own requests');
truncate seen;
select t.err('authenticated', $q$ insert into seen select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b' $q$);
select t.ok((select n from seen) = 0, 'strangers cannot read each other''s profiles');
truncate seen;

select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok(t.err('authenticated', $q$
  select public.respond_to_request((select id from public.connection_requests
    where requester_id = '00000000-0000-0000-0000-00000000000d'), false)
$q$) is null, 'owner declines');
select t.ok(public.credit_balance('00000000-0000-0000-0000-00000000000d') = 2, 'declined request refunds the credit');

-- ---------------------------------------------------------------- report: "this is a man"
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-000000000002'), 'Hi')
$q$);
select t.as_user('00000000-0000-0000-0000-000000000002');
select t.ok(t.err('authenticated', $q$
  insert into public.reports (reporter_id, reported_id, reason, details)
  values (auth.uid(), '00000000-0000-0000-0000-00000000000d', 'is_man', 'Чоловік на відеодзвінку')
$q$) is null, 'woman reports a man');
select t.ok((select is_suspended from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  'a report from someone who interacted suspends the account at once');
select t.ok((select status = 'declined' from public.connection_requests
  where requester_id = '00000000-0000-0000-0000-00000000000d' and owner_id = '00000000-0000-0000-0000-000000000002'),
  'reporting blocks and closes open requests');
select t.ok((select snapshot ->> 'display_name' = 'User d' from public.reports limit 1), 'report keeps a snapshot');

select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-000000000003'), 'Hi')
$q$) like '%verification_required%', 'suspended accounts cannot send requests');
select t.err('authenticated', $q$ insert into seen select count(*) from public.search_listings() where photo_paths is not null $q$);
select t.ok((select n from seen) = 0, 'suspended accounts lose access to photos');
truncate seen;

-- A single stranger's report does not suspend an honest woman.
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.err('authenticated', $q$
  insert into public.reports (reporter_id, reported_id, reason) values (auth.uid(), '00000000-0000-0000-0000-00000000000a', 'is_man')
$q$);
select t.ok(not (select is_suspended from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'one report from a stranger does not suspend');

select t.ok(t.err('authenticated', 'select public.expire_stale_requests()') like '%permission denied%',
  'clients cannot run the expiry job');
select t.ok(t.err('authenticated', $q$ select public.credit_balance('00000000-0000-0000-0000-00000000000a') $q$) like '%permission denied%',
  'clients cannot read other users'' balances');
reset role;
select t.ok(public.expire_stale_requests() = 0, 'expiry job runs');
select t.ok(public.contains_contact_info('пиши на anna.k@gmail.com'), 'filter: email');
select t.ok(public.contains_contact_info('insta: anna_k'), 'filter: insta');
select t.ok(public.contains_contact_info('мій тг anna'), 'filter: тг');
select t.ok(public.contains_contact_info('@anna_kyiv'), 'filter: handle');
select t.ok(not public.contains_contact_info('У мене двоє дітей, 4 і 7 років, і кіт.'), 'filter: no false positive on ordinary text');
select t.ok(not public.contains_contact_info('Працюю в стартапі, люблю театр.'), 'filter: no false positive on "стартапі"');
-- ---------------------------------------------------------------- my_account
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.err('authenticated', $q$ insert into seen select 1 from public.my_account() a
  where a ->> 'age_band' = '35_44' and a -> 'languages' = '["uk", "en"]'::jsonb and (a ->> 'trusted')::boolean $q$);
select t.ok((select count(*) from seen) = 1, 'my_account returns age band, languages and trust');
truncate seen;

-- ---------------------------------------------------------------- free times, overlaps, completion
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.err('authenticated', $q$ insert into seen select count(*) from public.bookable_starts(
  (select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-000000000001')) $q$);
select t.ok((select n from seen) = 0, 'times overlapping a scheduled meeting are not offered');
truncate seen;

select t.as_user('00000000-0000-0000-0000-000000000001');
select t.ok(t.err('authenticated', $q$
  insert into public.availability_slots (owner_id, starts_at, ends_at)
  values (auth.uid(), date_trunc('day', now()) + interval '2 days 11 hours', date_trunc('day', now()) + interval '2 days 13 hours')
$q$) like '%slot_overlaps%', 'overlapping free-time slots are rejected');
select t.ok(t.err('authenticated', $q$
  insert into public.availability_slots (owner_id, starts_at, ends_at)
  values (auth.uid(), date_trunc('day', now()) + interval '3 days 10 hours', date_trunc('day', now()) + interval '3 days 12 hours')
$q$) is null, 'a separate slot is accepted');

select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.err('authenticated', $q$ insert into seen select count(*) from public.bookable_starts(
  (select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-000000000001')) $q$);
select t.ok((select n from seen) = 3, 'a free 2-hour slot offers three 60-minute starts');
truncate seen;

select t.as_user('00000000-0000-0000-0000-000000000002');
select t.ok(t.err('authenticated', $q$ select * from public.bookable_starts(
  (select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-000000000001'
     and requester_id = '00000000-0000-0000-0000-00000000000b')) $q$) like '%request_not_found%',
  'only the requester can list bookable times');

select t.ok(t.err('authenticated', 'select public.complete_past_meetings()') like '%permission denied%',
  'clients cannot run the completion job');
reset role;
update public.meetings set starts_at = now() - interval '13 hours', ends_at = now() - interval '12 hours'
where requester_id = '00000000-0000-0000-0000-00000000000b' and status = 'scheduled';
select t.ok(public.complete_past_meetings() = 1, 'meetings older than 12 hours are completed');

select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(t.err('authenticated', $q$
  select public.book_meeting((select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-000000000001'),
    date_trunc('day', now()) + interval '3 days 10 hours')
$q$) is null, 'after a completed meeting the pair can book another one');

-- ---------------------------------------------------------------- selfie check switch
-- Launch phase (default): a profile photo is enough. With the switch on, only verified members count.
reset role;
update public.profiles set verification_status = 'unverified', is_suspended = false
where id = '00000000-0000-0000-0000-000000000001';
select t.ok(public.is_trusted('00000000-0000-0000-0000-000000000001'), 'without the selfie check a profile photo is enough');
select t.ok(not public.is_trusted('00000000-0000-0000-0000-00000000000c'), 'without the selfie check a profile photo is still required');
update public.app_settings set selfie_verification_required = true;
select t.ok(not public.is_trusted('00000000-0000-0000-0000-000000000001'), 'with the selfie check on, a photo alone is not enough');
select t.ok(public.is_trusted('00000000-0000-0000-0000-000000000002'), 'with the selfie check on, verified members stay trusted');
update public.app_settings set selfie_verification_required = false;
-- ---------------------------------------------------------------- joining a video meeting
reset role;
create temp table jm as
  select id from public.meetings where requester_id = '00000000-0000-0000-0000-00000000000b' and status = 'scheduled';
grant select on jm to authenticated, service_role;
select t.ok((select count(*) from jm) = 1, 'one scheduled meeting to join');

select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(t.err('authenticated', $q$ select * from public.meeting_for_join((select id from jm), auth.uid()) $q$)
  like '%permission denied%', 'clients cannot call meeting_for_join directly');

select t.ok(t.err('service_role', $q$ select * from public.meeting_for_join((select id from jm), '00000000-0000-0000-0000-00000000000b') $q$)
  like '%too_early%', 'the room does not open days before the start');

reset role;
update public.meetings set starts_at = now() + interval '5 minutes', ends_at = now() + interval '35 minutes' where id = (select id from jm);
select t.err('service_role', $q$ insert into seen select length(room_name) from public.meeting_for_join((select id from jm), '00000000-0000-0000-0000-00000000000b') $q$);
select t.ok((select n from seen) = 35, 'a participant gets a random room name 10 minutes before the start');
truncate seen;
select t.ok((select video_room_name from public.meetings where id = (select id from jm)) like 'bh-%', 'the room name is stored');
select t.ok(t.err('service_role', $q$
  do $d$ begin
    if (select room_name from public.meeting_for_join((select id from jm), '00000000-0000-0000-0000-000000000001'))
       is distinct from (select video_room_name from public.meetings where id = (select id from jm)) then
      raise exception 'different room';
    end if;
  end $d$ $q$) is null, 'the other participant joins the same room');
select t.ok(t.err('service_role', $q$ select * from public.meeting_for_join((select id from jm), '00000000-0000-0000-0000-000000000002') $q$)
  like '%meeting_not_found%', 'strangers cannot join');

update public.meetings set starts_at = now() - interval '13 hours', ends_at = now() - interval '12 hours 30 minutes' where id = (select id from jm);
select t.ok(t.err('service_role', $q$ select * from public.meeting_for_join((select id from jm), '00000000-0000-0000-0000-00000000000b') $q$)
  like '%meeting_over%', 'the room cannot be joined 12 hours after the start');

update public.meetings set starts_at = now(), ends_at = now() + interval '30 minutes' where id = (select id from jm);
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
select t.ok(t.err('service_role', $q$ select * from public.meeting_for_join((select id from jm), '00000000-0000-0000-0000-00000000000b') $q$)
  like '%meeting_not_active%', 'a block closes the meeting room');

reset role;
select t.ok((select status from public.meetings where id = (select id from jm)) = 'cancelled', 'the block cancelled the meeting');
select t.ok(exists (select 1 from public.video_room_closures v join public.meetings m on m.video_room_name = v.room_name
  where m.id = (select id from jm) and v.closed_at is null), 'and queued its video room for closing');
select t.ok(t.err('authenticated', $q$ select * from public.video_room_closures $q$) like '%permission denied%',
  'clients cannot read the closure queue');

insert into public.meetings (request_id, owner_id, requester_id, starts_at, ends_at, status, video_room_name)
  select request_id, owner_id, requester_id, now() + interval '1 day', now() + interval '1 day 1 hour', 'scheduled', 'bh-suspension-test'
  from public.meetings where id = (select id from jm);
update public.profiles set is_suspended = true where id = '00000000-0000-0000-0000-00000000000b';
select t.ok((select status from public.meetings where video_room_name = 'bh-suspension-test') = 'cancelled',
  'a suspension cancels her scheduled meetings');
select t.ok(exists (select 1 from public.video_room_closures where room_name = 'bh-suspension-test'),
  'and closes their rooms');
update public.profiles set is_suspended = false where id = '00000000-0000-0000-0000-00000000000b';

-- ---------------------------------------------------------------- moderation admin panel
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000e'); -- erin: moderator
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-00000000000e');
insert into public.reports (reporter_id, reported_id, reason, details)
  values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'fake', 'stock photos');
create temp table mr as select id from public.reports where reported_id = '00000000-0000-0000-0000-000000000003';
create temp table ml as select id from public.listings where owner_id = '00000000-0000-0000-0000-000000000003';
grant select on mr, ml to authenticated;

select t.as_user(null);
select t.ok(t.err('anon', $q$ select public.admin_whoami() $q$) like '%permission denied%',
  'guests cannot call admin RPCs');

select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok(t.err('authenticated', $q$ select * from public.admin_users $q$) like '%permission denied%',
  'clients cannot read the admin list');
select t.ok(t.err('authenticated', $q$ insert into public.admin_users (user_id) values (auth.uid()) $q$) like '%permission denied%',
  'clients cannot make themselves admins');
select t.ok(t.err('authenticated', $q$ select * from public.moderation_log $q$) like '%permission denied%',
  'clients cannot read the moderation log directly');
select t.ok(t.err('authenticated', $q$ select public.is_admin(auth.uid()) $q$) like '%permission denied%',
  'clients cannot call the internal admin check');
select t.ok(t.err('authenticated', $q$ select public.write_moderation_log(auth.uid(), 'suspend_account', 'forged') $q$)
  like '%permission denied%', 'clients cannot write log rows');
set role authenticated;
select t.ok(not (public.admin_whoami() ->> 'is_admin')::boolean, 'a member is told she is not an admin');
reset role;
select t.ok(t.err('authenticated', $q$ select * from public.admin_report_queue() $q$) like '%not_admin%',
  'members cannot read the report queue');
select t.ok(t.err('authenticated', $q$ select public.admin_suspend_account('00000000-0000-0000-0000-000000000003', 'because') $q$)
  like '%not_admin%', 'members cannot suspend accounts');
select t.ok(t.err('authenticated', $q$ select public.admin_hide_listing((select id from ml), 'because') $q$)
  like '%not_admin%', 'members cannot hide listings');
select t.ok(t.err('authenticated', $q$ select * from public.admin_moderation_log() $q$) like '%not_admin%',
  'members cannot read the audit log');

select t.as_user('00000000-0000-0000-0000-00000000000e');
set role authenticated;
select t.ok((public.admin_whoami() ->> 'is_admin')::boolean, 'an admin is recognised');
select t.ok(exists (select 1 from public.admin_report_queue() q where q.id = (select id from mr)
  and q.reported_display_name = 'User 3' and q.open_reports_against = 1 and q.listing_id = (select id from ml)),
  'the queue shows the open report with the reported account and her listing');
select t.ok(not exists (select 1 from public.admin_report_queue(array['resolved']::public.report_status[])),
  'the queue filters by status');
select t.ok((select count(*) from public.admin_report_queue(p_limit := 1)) = 1, 'the queue honours the page size');
select t.ok(not exists (select 1 from public.admin_report_queue(
    p_after_created_at := (select created_at from public.admin_report_queue() q where q.id = (select id from mr)),
    p_after_id := (select id from mr)) q where q.id = (select id from mr)),
  'keyset pagination continues after the last row');
select t.ok((public.admin_account('00000000-0000-0000-0000-000000000003') ->> 'open_reports')::int = 1
  and not (public.admin_account('00000000-0000-0000-0000-000000000003') ?| array['approx_lat', 'approx_lng', 'city', 'photo_path']),
  'the account summary shows reports but no location or photo');
reset role;
select t.ok(pg_get_function_result('public.admin_report_queue(public.report_status[], timestamptz, uuid, integer)'::regprocedure)
  not like '%reporter%', 'the queue never returns who filed a report');

select t.ok(t.err('authenticated', $q$ select public.admin_suspend_account('00000000-0000-0000-0000-000000000003', '  x ') $q$)
  like '%reason_required%', 'a suspension needs a reason');
select t.ok(t.err('authenticated', $q$ select public.admin_suspend_account('00000000-0000-0000-0000-00000000000e', 'testing') $q$)
  like '%target_is_admin%', 'admins cannot be suspended from the panel');
select t.ok(t.err('authenticated', $q$ select public.admin_suspend_account('00000000-0000-0000-0000-0000000000ff', 'testing') $q$)
  like '%account_not_found%', 'suspending an unknown account fails');
select t.ok(t.err('authenticated', $q$ select public.admin_suspend_account('00000000-0000-0000-0000-000000000003', ' fake photos ') $q$) is null,
  'an admin suspends an account');
select t.ok((select is_suspended and suspended_reason = 'fake photos' from public.profiles where id = '00000000-0000-0000-0000-000000000003'),
  'the suspension stores the trimmed reason');
select t.ok(t.err('authenticated', $q$ select public.admin_suspend_account('00000000-0000-0000-0000-000000000003', 'again') $q$)
  like '%already_suspended%', 'an account cannot be suspended twice');
select t.ok(exists (select 1 from public.moderation_log where action = 'suspend_account'
  and admin_id = '00000000-0000-0000-0000-00000000000e' and target_user_id = '00000000-0000-0000-0000-000000000003'
  and reason = 'fake photos'), 'the suspension is in the audit log');

select t.ok(t.err('authenticated', $q$ select public.admin_unsuspend_account('00000000-0000-0000-0000-000000000003', 'appeal accepted') $q$) is null,
  'an admin lifts a suspension');
select t.ok((select not is_suspended and suspended_reason is null from public.profiles where id = '00000000-0000-0000-0000-000000000003'),
  'the account is active again');
select t.ok(exists (select 1 from public.blocks where blocker_id = '00000000-0000-0000-0000-000000000002'
  and blocked_id = '00000000-0000-0000-0000-000000000003'), 'unsuspending does not undo the reporter''s block');
select t.ok(exists (select 1 from public.moderation_log where action = 'unsuspend_account'
  and details ->> 'previous_reason' = 'fake photos'), 'the unsuspension is logged with the earlier reason');
select t.ok(t.err('authenticated', $q$ select public.admin_unsuspend_account('00000000-0000-0000-0000-000000000003', 'again') $q$)
  like '%not_suspended%', 'an active account cannot be unsuspended');

select t.ok(t.err('authenticated', $q$ select public.admin_hide_listing((select id from ml), 'contact details in text') $q$) is null,
  'an admin hides a listing');
select t.ok((select status from public.listings where id = (select id from ml)) = 'hidden', 'the listing is hidden');
select t.ok(t.err('authenticated', $q$ select public.admin_hide_listing((select id from ml), 'again') $q$) like '%already_hidden%',
  'a hidden listing cannot be hidden again');
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.ok(t.err('authenticated', $q$ update public.listings set status = 'active' where owner_id = auth.uid() $q$)
  like '%listing_hidden_by_moderation%', 'the owner cannot unhide it herself');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.ok(t.err('authenticated', $q$ select public.admin_unhide_listing((select id from ml), 'text fixed') $q$) is null,
  'an admin unhides a listing');
select t.ok((select status from public.listings where id = (select id from ml)) = 'paused',
  'unhiding brings the listing back paused');
select t.ok(t.err('authenticated', $q$ select public.admin_unhide_listing((select id from ml), 'again') $q$) like '%not_hidden%',
  'only hidden listings can be unhidden');

select t.ok(t.err('authenticated', $q$ select public.admin_set_report_status((select id from mr), 'open') $q$) like '%invalid_status%',
  'a report cannot be reopened from the panel');
select t.ok(t.err('authenticated', $q$ select public.admin_set_report_status((select id from mr), 'resolved', 'handled') $q$) is null,
  'an admin resolves a report');
select t.ok((select status = 'resolved' and resolved_at is not null from public.reports where id = (select id from mr)),
  'the report is closed with a timestamp');
select t.ok(t.err('authenticated', $q$ select public.admin_set_report_status((select id from mr), 'resolved') $q$) like '%status_unchanged%',
  'setting the same status twice fails');
select t.ok(exists (select 1 from public.moderation_log where action = 'set_report_status'
  and target_report_id = (select id from mr) and details = '{"from": "open", "to": "resolved"}'), 'the status change is logged');

set role authenticated;
select t.ok((select array_agg(action order by id desc) from public.admin_moderation_log()) =
  array['set_report_status', 'unhide_listing', 'hide_listing', 'unsuspend_account', 'suspend_account']::public.moderation_action[],
  'the audit log lists every action, newest first');
select t.ok((select count(*) from public.admin_moderation_log(p_limit := 2)) = 2
  and (select count(*) from public.admin_moderation_log(p_before_id := (select min(id) from public.admin_moderation_log(p_limit := 2)))) = 3,
  'the audit log pages by id');
select t.ok((select count(*) from public.admin_moderation_log(p_target_user_id := '00000000-0000-0000-0000-00000000000a')) = 0,
  'the audit log filters by account');
reset role;

select t.ok(t.err('postgres', $q$ update public.moderation_log set reason = 'rewritten' $q$) like '%append_only%',
  'nobody can rewrite the audit log');
select t.ok(t.err('postgres', $q$ delete from public.moderation_log $q$) like '%append_only%',
  'nobody can delete from the audit log');
select t.ok(t.err('postgres', $q$ truncate public.moderation_log $q$) like '%append_only%',
  'nobody can truncate the audit log');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000e';
select t.ok((select count(*) from public.moderation_log where admin_id is null) = 5,
  'the audit log survives the admin''s account being deleted');

\echo 'all database tests passed'
