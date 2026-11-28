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

-- ---------------------------------------------------------------- push notifications
reset role;
update public.app_settings set paid_requests_enabled = false;
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'), -- erin: listing owner
  ('00000000-0000-0000-0000-0000000000e2'), -- fran: requester
  ('00000000-0000-0000-0000-0000000000e3'); -- gwen: stranger
update public.profiles set display_name = 'User ' || right(id::text, 2), photo_path = id || '/face.jpg'
where id::text like '00000000-0000-0000-0000-0000000000e_';
insert into public.listings (owner_id, status, title, country_code, city, approx_lat, approx_lng)
values ('00000000-0000-0000-0000-0000000000e1', 'active', 'Listing e1', 'PL', 'Kraków', 50.06, 19.94);
create function t.outbox(p_user text, p_kind text) returns integer language sql as $$
  select count(*)::integer from public.notification_outbox
  where user_id = p_user::uuid and kind = p_kind::public.notification_kind and sent_at is null
$$;
grant execute on function t.outbox(text, text) to service_role;

select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok(t.err('authenticated', $q$ select public.register_push_token('ExponentPushToken[fran-phone-0001]', 'ios', 'uk') $q$) is null,
  'a member registers her device');
select t.ok(t.err('authenticated', $q$ select public.register_push_token('not a token', 'ios', 'uk') $q$) like '%invalid_push_token%',
  'malformed push tokens are rejected');
select t.ok(t.err('authenticated', $q$ select public.register_push_token('ExponentPushToken[fran-phone-0001]', 'web', 'uk') $q$)
  like '%invalid_platform%', 'only iOS and Android devices are registered');
select t.ok(t.err('authenticated', $q$ insert into public.push_tokens (token, user_id, platform)
  values ('ExponentPushToken[forged-token-01]', '00000000-0000-0000-0000-0000000000e1', 'ios') $q$) like '%permission denied%',
  'tokens cannot be inserted directly');
select t.ok(t.err('anon', $q$ select public.register_push_token('ExponentPushToken[guest-phone-01]', 'ios') $q$) like '%permission denied%',
  'guests cannot register devices');
select t.ok(t.err('authenticated', $q$
  select public.register_push_token('ExponentPushToken[fran-phone-000' || i || ']', 'android', 'en') from generate_series(2, 7) i
$q$) is null, 'she registers six more devices');
select t.ok((select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000e2') = 5,
  'an account keeps at most 5 devices');
select t.ok(exists (select 1 from public.push_tokens where token = 'ExponentPushToken[fran-phone-0007]')
  and not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[fran-phone-0001]'),
  'the oldest devices are dropped first');

select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.ok(t.err('authenticated', $q$ select public.register_push_token('ExponentPushToken[erin-phone-0001]', 'android', 'en') $q$) is null,
  'the owner registers her device');
select t.err('authenticated', 'insert into seen select count(*) from public.push_tokens');
select t.ok((select n from seen) = 1, 'a member sees only her own devices');
truncate seen;
select t.err('authenticated', $q$ delete from public.push_tokens where token = 'ExponentPushToken[fran-phone-0007]' $q$);
select t.ok(exists (select 1 from public.push_tokens where token = 'ExponentPushToken[fran-phone-0007]'),
  'a member cannot remove another member''s device');
select t.ok(t.err('authenticated', 'select * from public.notification_outbox') like '%permission denied%',
  'clients cannot read the outbox');
select t.ok(t.err('authenticated', 'select * from public.notification_preferences') like '%permission denied%',
  'clients cannot read preferences directly');
select t.ok(t.err('authenticated', 'select * from public.claim_push_batch()') like '%permission denied%',
  'clients cannot claim notifications');
select t.ok(t.err('authenticated', $q$ select public.enqueue_notification(auth.uid(), 'request_received', gen_random_uuid()) $q$)
  like '%permission denied%', 'clients cannot queue notifications');

-- A device that signs in to another account moves to it.
select t.as_user('00000000-0000-0000-0000-0000000000e3');
select t.err('authenticated', $q$ select public.register_push_token('ExponentPushToken[fran-phone-0003]', 'android', 'en') $q$);
select t.ok((select user_id from public.push_tokens where token = 'ExponentPushToken[fran-phone-0003]') = '00000000-0000-0000-0000-0000000000e3',
  'a shared device follows the account that signed in last');

-- New request -> the owner is told, with no name in the outbox.
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok(t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-0000000000e1'), 'Привіт')
$q$) is null, 'fran sends erin a request');
reset role;
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e1', 'request_received') = 1, 'a new request queues a notification for the owner');

-- Claiming and sending
create temp table claimed as select * from public.claim_push_batch(100);
select t.ok((select count(*) from claimed) = 1 and (select token from claimed) = 'ExponentPushToken[erin-phone-0001]'
  and (select locale from claimed) = 'en', 'the batch has one line per device, with its language');
select t.ok(not exists (select 1 from public.claim_push_batch(100)), 'claimed rows are locked against a second run');
select public.finish_push_batch(array(select outbox_id from claimed), '{}', '{}');
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e1', 'request_received') = 0, 'sent rows are marked sent');
drop table claimed;

-- Accepting -> the requester is told; she has 4 devices left after one moved away.
select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.err('authenticated', $q$
  select public.respond_to_request((select id from public.connection_requests where owner_id = auth.uid()), true)
$q$);
reset role;
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e2', 'request_accepted') = 1, 'accepting queues a notification for the requester');
create temp table claimed as select * from public.claim_push_batch(100);
select t.ok((select count(*) from claimed) = 4 and (select bool_and(locale = 'en') from claimed), 'every device of hers is in the batch');
-- The push service failed for this row, and said one device is gone.
select public.finish_push_batch('{}', array(select distinct outbox_id from claimed), '{ExponentPushToken[fran-phone-0004]}');
select t.ok(not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[fran-phone-0004]'), 'dead device tokens are removed');
select t.ok((select send_after > now() + interval '1 minute' and attempts = 1 and locked_until is null from public.notification_outbox
  where id = (select distinct outbox_id from claimed)), 'a failed row is retried later with backoff');
update public.notification_outbox set send_after = now(), attempts = public.push_max_attempts() where id = (select distinct outbox_id from claimed);
select t.ok(not exists (select 1 from public.claim_push_batch(100)), 'after too many attempts a row is given up');
select t.ok((select skipped from public.notification_outbox where id = (select distinct outbox_id from claimed)), 'and marked as skipped');
drop table claimed;

-- Booking -> the owner is told, both get a reminder 10 minutes before the start.
insert into public.availability_slots (owner_id, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000e1', date_trunc('day', now()) + interval '5 days 10 hours', date_trunc('day', now()) + interval '5 days 12 hours');
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok(t.err('authenticated', $q$
  select public.book_meeting((select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-0000000000e1'),
    date_trunc('day', now()) + interval '5 days 10 hours')
$q$) is null, 'fran books a meeting');
reset role;
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e1', 'meeting_booked') = 1, 'booking queues a notification for the owner');
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e2', 'meeting_booked') = 0, 'the woman who booked is not told about her own booking');
select t.ok((select count(*) from public.notification_outbox o join public.meetings m on m.id = o.ref_id
  where o.kind = 'meeting_starting' and o.send_after = m.starts_at - interval '10 minutes'
    and m.owner_id = '00000000-0000-0000-0000-0000000000e1') = 2,
  'both get a reminder when the room opens');
select t.ok(not exists (select 1 from public.claim_push_batch(100) where kind = 'meeting_starting'), 'reminders wait until the room opens');

-- Opting out drops what is waiting and stops new pushes.
select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.err('authenticated', 'insert into seen select public.my_push_enabled()::int');
select t.ok((select n from seen) = 1, 'push is on by default');
truncate seen;
select t.ok(t.err('authenticated', 'select public.set_push_enabled(false)') is null, 'she switches push off');
select t.err('authenticated', 'insert into seen select public.my_push_enabled()::int');
select t.ok((select n from seen) = 0, 'and the switch is saved');
truncate seen;
reset role;
select t.ok(not exists (select 1 from public.notification_outbox where user_id = '00000000-0000-0000-0000-0000000000e1' and sent_at is null),
  'switching off drops her queued notifications');
select public.enqueue_notification('00000000-0000-0000-0000-0000000000e1', 'meeting_booked',
  (select id from public.meetings where owner_id = '00000000-0000-0000-0000-0000000000e1' and status = 'scheduled'));
select t.ok(not exists (select 1 from public.claim_push_batch(100) where token like '%erin%'), 'nothing is sent to her while push is off');
select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.err('authenticated', 'select public.set_push_enabled(true)');

-- The start time moves -> the reminder moves with it.
reset role;
update public.meetings set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour'
where owner_id = '00000000-0000-0000-0000-0000000000e1' and status = 'scheduled';
select t.ok((select send_after = (select starts_at from public.meetings where owner_id = '00000000-0000-0000-0000-0000000000e1' and status = 'scheduled')
  - interval '10 minutes' from public.notification_outbox where user_id = '00000000-0000-0000-0000-0000000000e2' and kind = 'meeting_starting'),
  'a moved meeting moves its reminder');

-- A reminder is sent when the room opens, and not after the start.
update public.meetings set starts_at = now() + interval '5 minutes', ends_at = now() + interval '65 minutes'
where owner_id = '00000000-0000-0000-0000-0000000000e1' and status = 'scheduled';
select t.ok(exists (select 1 from public.claim_push_batch(100) where kind = 'meeting_starting' and token like '%fran%'),
  'the reminder goes out once the room is open');

-- Cancelling: only the other woman is told, and pending reminders are dropped.
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok(t.err('authenticated', $q$
  select public.cancel_meeting((select id from public.meetings where requester_id = auth.uid() and status = 'scheduled'))
$q$) is null, 'fran cancels the meeting');
reset role;
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e1', 'meeting_cancelled') = 1, 'the other woman is told about the cancellation');
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e2', 'meeting_cancelled') = 0, 'the woman who cancelled is not');
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e1', 'meeting_starting') = 0, 'reminders of a cancelled meeting are dropped');

-- A request withdrawn before sending is not announced; a suspended account gets nothing.
select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.err('authenticated', $q$ select public.register_push_token('ExponentPushToken[erin-phone-0001]', 'android', 'uk') $q$);
reset role;
insert into public.listings (owner_id, status, title, country_code, city, approx_lat, approx_lng)
values ('00000000-0000-0000-0000-0000000000e3', 'active', 'Listing e3', 'PL', 'Gdańsk', 54.35, 18.65);
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.err('authenticated', $q$
  select public.send_connection_request((select id from public.listings where owner_id = '00000000-0000-0000-0000-0000000000e3'), 'Hi')
$q$);
select t.err('authenticated', $q$
  select public.withdraw_request((select id from public.connection_requests where owner_id = '00000000-0000-0000-0000-0000000000e3'))
$q$);
reset role;
create temp table claimed as select * from public.claim_push_batch(100);
select t.ok(not exists (select 1 from claimed where kind = 'request_received'), 'a withdrawn request is not announced');
select t.ok((select locale from claimed where kind = 'meeting_cancelled') = 'uk', 'the device language is updated on re-registration');
select public.finish_push_batch(array(select outbox_id from claimed), '{}', '{}');
drop table claimed;
update public.profiles set is_suspended = true where id = '00000000-0000-0000-0000-0000000000e1';
select public.enqueue_notification('00000000-0000-0000-0000-0000000000e1', 'meeting_cancelled',
  (select id from public.meetings where owner_id = '00000000-0000-0000-0000-0000000000e1' limit 1));
delete from public.notification_outbox where user_id = '00000000-0000-0000-0000-0000000000e1' and sent_at is not null;
select public.enqueue_notification('00000000-0000-0000-0000-0000000000e1', 'meeting_cancelled',
  (select id from public.meetings where owner_id = '00000000-0000-0000-0000-0000000000e1' limit 1));
select t.ok(not exists (select 1 from public.claim_push_batch(100)), 'a suspended account gets no pushes');
update public.profiles set is_suspended = false where id = '00000000-0000-0000-0000-0000000000e1';

-- A block: nothing is announced between the two accounts.
select t.as_user('00000000-0000-0000-0000-0000000000e3');
select t.err('authenticated', $q$ insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000e2') $q$);
reset role;
select t.ok(t.outbox('00000000-0000-0000-0000-0000000000e2', 'request_declined') = 0, 'a block does not announce a decline');

-- Deleting the account removes her devices, preferences and queue.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000e1';
select t.ok(not exists (select 1 from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000e1')
  and not exists (select 1 from public.notification_outbox where user_id = '00000000-0000-0000-0000-0000000000e1')
  and not exists (select 1 from public.notification_preferences where user_id = '00000000-0000-0000-0000-0000000000e1'),
  'a deleted account leaves no devices, preferences or queued pushes');

\echo 'all database tests passed'
