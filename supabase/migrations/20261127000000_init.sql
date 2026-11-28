-- Boston Home: initial schema.
--
-- Principles (see README.md):
--   * Collect the minimum: pseudonym, photos, age band, approximate location. No birthdates,
--     phone numbers, documents or exact addresses.
--   * Every table has Row Level Security. Clients get column-level grants only for what they
--     may read or write; everything sensitive (verification status, suspension, credits,
--     request state changes, meetings) is changed only through SECURITY DEFINER functions
--     or by the service role (Edge Functions, admin tools).
--   * SECURITY DEFINER functions use `set search_path = ''` and fully qualified names.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.age_band as enum ('18_24', '25_34', '35_44', '45_54', '55_plus');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.listing_status as enum ('draft', 'active', 'paused', 'hidden');
create type public.partner_children_pref as enum ('welcome', 'no_children', 'any');
create type public.smoking_pref as enum ('no', 'outside_only', 'yes');
create type public.alcohol_pref as enum ('no', 'sometimes', 'yes');
create type public.diet_pref as enum ('any', 'vegetarian', 'vegan');
create type public.chronotype as enum ('early', 'night', 'flexible');
create type public.work_mode as enum ('remote', 'office', 'shifts', 'other');
create type public.living_arrangement as enum ('my_place', 'partner_place', 'new_place', 'flexible');
create type public.relocation_pref as enum ('yes', 'within_country', 'no');
create type public.move_in_timeline as enum ('asap', '3_6_months', '1_year_plus');
create type public.expenses_pref as enum ('equal', 'proportional', 'discuss');
create type public.request_status as enum ('pending', 'accepted', 'declined', 'expired', 'withdrawn');
create type public.meeting_status as enum ('scheduled', 'completed', 'cancelled');
create type public.report_reason as enum (
  'is_man', 'threat', 'harassment', 'stalking', 'fake', 'inappropriate', 'underage', 'scam', 'other'
);
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.credit_reason as enum (
  'purchase', 'request_sent', 'refund_declined', 'refund_expired', 'refund_withdrawn',
  'monthly_listing_bonus', 'launch_gift', 'admin_adjustment'
);

-- ---------------------------------------------------------------------------
-- App settings (single row)
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id boolean primary key default true check (id),
  -- false during the free launch phase: requests cost nothing.
  paid_requests_enabled boolean not null default false,
  new_account_days integer not null default 14 check (new_account_days >= 0),
  new_account_daily_requests integer not null default 3 check (new_account_daily_requests >= 0),
  daily_requests integer not null default 10 check (daily_requests >= 0),
  request_expiry_days integer not null default 7 check (request_expiry_days > 0),
  -- distinct reporters needed to auto-suspend an account for serious reasons
  -- when none of them has interacted with it.
  auto_suspend_report_threshold integer not null default 3 check (auto_suspend_report_threshold > 0),
  -- Launch phase: no selfie/liveness check (Didit comes later). Members only need a profile photo,
  -- and the mandatory video call before any contact exchange is the identity check.
  selfie_verification_required boolean not null default false
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user. Requesters only need a profile; listing owners also have a listing.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 2 and 40),
  age_band public.age_band,
  languages text[] not null default '{}' check (cardinality(languages) <= 8),
  -- face photo in the `profile-photos` bucket, matched against the liveness selfie.
  photo_path text check (char_length(photo_path) <= 200),
  verification_status public.verification_status not null default 'unverified',
  verified_at timestamptz,
  is_suspended boolean not null default false,
  suspended_reason text,
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  status public.listing_status not null default 'draft',

  title text not null check (char_length(title) between 3 and 80),
  about text not null default '' check (char_length(about) <= 2000),
  looking_for text not null default '' check (char_length(looking_for) <= 2000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),

  -- Where I live now. Coordinates are snapped to a ~5 km grid plus a fixed per-listing offset
  -- by a trigger; the precise point the client sent is never stored.
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  city text not null check (char_length(city) between 1 and 80),
  approx_lat double precision check (approx_lat between -90 and 90),
  approx_lng double precision check (approx_lng between -180 and 180),

  -- Where I propose to live together (optional).
  target_country_code text check (target_country_code ~ '^[A-Z]{2}$'),
  target_city text check (char_length(target_city) <= 80),
  target_lat double precision check (target_lat between -90 and 90),
  target_lng double precision check (target_lng between -180 and 180),

  has_children boolean not null default false,
  children_count smallint not null default 0 check (children_count between 0 and 10),
  children_age_bands text[] not null default '{}'
    check (children_age_bands <@ array['0_3', '4_11', '12_17']::text[]),
  partner_children public.partner_children_pref not null default 'any',
  pets text[] not null default '{}' check (pets <@ array['cat', 'dog', 'other']::text[]),
  pet_allergy boolean not null default false,
  smoking public.smoking_pref,
  alcohol public.alcohol_pref,
  diet public.diet_pref,
  chronotype public.chronotype,
  work_mode public.work_mode,
  living_arrangement public.living_arrangement,
  relocation public.relocation_pref,
  move_in public.move_in_timeline,
  separate_rooms boolean,
  expenses public.expenses_pref,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  constraint children_consistent check (has_children or children_count = 0)
);

create index listings_active_idx on public.listings (status, country_code, published_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default '' check (char_length(message) <= 300),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (owner_id <> requester_id)
);
create unique index connection_requests_open_pair
  on public.connection_requests (listing_id, requester_id)
  where status in ('pending', 'accepted');
create index connection_requests_requester_idx on public.connection_requests (requester_id, created_at desc);
create index connection_requests_owner_idx on public.connection_requests (owner_id, status);

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at and ends_at - starts_at <= interval '4 hours')
);
create index availability_slots_owner_idx on public.availability_slots (owner_id, starts_at);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.connection_requests (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.meeting_status not null default 'scheduled',
  -- set by the video Edge Function; never exposed to clients (they get short-lived tokens).
  video_room_name text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index meetings_one_scheduled_per_request
  on public.meetings (request_id) where status = 'scheduled';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  -- kept (as null) after the reported account is deleted, so the snapshot survives for review.
  reported_id uuid references public.profiles (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  request_id uuid references public.connection_requests (id) on delete set null,
  meeting_id uuid references public.meetings (id) on delete set null,
  reason public.report_reason not null,
  details text not null default '' check (char_length(details) <= 1000),
  -- what the reported account showed at report time (pseudonym, listing text, request message).
  snapshot jsonb not null default '{}',
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_queue_idx on public.reports (status, created_at);
create index reports_reported_idx on public.reports (reported_id);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason public.credit_reason not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id);

create table public.verification_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_session_id text not null,
  status public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (provider, provider_session_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();

-- Create an empty profile for every new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the account a member in good standing (may publish and send requests)?
-- While the selfie check is off, a profile photo is enough; otherwise she must be verified.
create function public.is_trusted(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p, public.app_settings s
    where p.id = p_user and not p.is_suspended
      and (
        p.verification_status = 'verified'
        or (not s.selfie_verification_required and p.photo_path is not null)
      )
  );
$$;

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Detects attempts to share contact details before the video meeting.
-- Mirrored in src/lib/contact-filter.ts for instant feedback; this one is authoritative.
create function public.contains_contact_info(p_text text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  t text := lower(coalesce(p_text, ''));
  digits text;
begin
  -- email
  if t ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then return true; end if;
  -- links and bare domains
  if t ~ '(https?://|www\.)' then return true; end if;
  if t ~ '[[:alnum:]-]+\.(com|net|org|ua|me|io|ly|app|eu|de|pl|link|info|page)([^[:alnum:]]|$)' then
    return true;
  end if;
  -- @handles
  if t ~ '(^|[^[:alnum:]])@[[:alnum:]_.]{3,}' then return true; end if;
  -- phone numbers: 7+ digits once common separators are removed
  digits := regexp_replace(t, '[[:space:]().+/-]', '', 'g');
  if digits ~ '[0-9]{7,}' then return true; end if;
  -- messengers and social networks (Latin and Cyrillic spellings)
  if t ~ '(telegram|whats ?app|viber|instagram|facebook|snapchat|tiktok|wechat|threema)' then
    return true;
  end if;
  if t ~ '(телеграм|телеґрам|вайбер|ватсап|вотсап|інстаграм|инстаграм|фейсбук|тікток|тикток)' then
    return true;
  end if;
  if t ~ '(^|[^a-zа-яіїєґ])(tg|тг|інста|инста|insta|fb)([^a-zа-яіїєґ]|$)' then return true; end if;
  return false;
end $$;

create function public.credit_balance(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::integer from public.credit_ledger where user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Listing guards: location snapping, status rules, publish requirements
-- ---------------------------------------------------------------------------

-- Snap to a 0.05 degree grid (~5 km) and add a fixed per-listing offset of up to ±0.015 degrees.
-- The offset never moves a point out of its grid cell, so re-snapping is idempotent and
-- repeated edits cannot be averaged to recover the true point.
create function public.obfuscate_coordinate(p_value double precision, p_seed integer)
returns double precision
language sql immutable set search_path = '' as $$
  select case when p_value is null then null else
    round((round(p_value / 0.05) * 0.05 + ((p_seed & 1023)::double precision / 1023 - 0.5) * 0.03)::numeric, 4)::double precision
  end;
$$;

create function public.guard_listing() returns trigger
language plpgsql set search_path = '' as $$
declare
  seed integer := hashtext(new.id::text);
  is_client boolean := current_user in ('authenticated', 'anon');
begin
  new.approx_lat := public.obfuscate_coordinate(new.approx_lat, seed);
  new.approx_lng := public.obfuscate_coordinate(new.approx_lng, seed >> 10);
  new.target_lat := public.obfuscate_coordinate(new.target_lat, seed >> 20);
  new.target_lng := public.obfuscate_coordinate(new.target_lng, (seed >> 5) # seed);

  if is_client then
    if tg_op = 'UPDATE' and old.owner_id <> new.owner_id then
      raise exception 'owner_id cannot change' using errcode = '42501';
    end if;
    -- only moderators can hide or unhide a listing
    if new.status = 'hidden' and (tg_op = 'INSERT' or old.status <> 'hidden') then
      raise exception 'listing_status_forbidden' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.status = 'hidden' and new.status <> 'hidden' then
      raise exception 'listing_hidden_by_moderation' using errcode = '42501';
    end if;
    if new.status = 'active' and not public.is_trusted(new.owner_id) then
      raise exception 'verification_required' using errcode = '42501';
    end if;
  end if;

  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    new.published_at := now();
  end if;
  return new;
end $$;

create trigger listings_guard before insert or update on public.listings
  for each row execute function public.guard_listing();

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.blocks enable row level security;
alter table public.connection_requests enable row level security;
alter table public.availability_slots enable row level security;
alter table public.meetings enable row level security;
alter table public.reports enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.verification_sessions enable row level security;

-- Start from nothing; Supabase grants everything to anon/authenticated by default.
revoke all on all tables in schema public from anon, authenticated;

-- app_settings: readable by everyone (the app shows whether requests are free).
grant select on public.app_settings to anon, authenticated;
create policy app_settings_read on public.app_settings for select using (true);

-- profiles
grant select (id, display_name, age_band, languages, photo_path, verification_status, created_at)
  on public.profiles to authenticated;
grant update (display_name, age_band, languages, photo_path) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1 from public.connection_requests r
    where (r.owner_id = auth.uid() and r.requester_id = profiles.id)
       or (r.requester_id = auth.uid() and r.owner_id = profiles.id)
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- listings: full rows for the owner and for trusted viewers; guests use search_listings().
grant select on public.listings to authenticated;
grant insert (
  owner_id, status, title, about, looking_for, photo_paths, country_code, city, approx_lat, approx_lng,
  target_country_code, target_city, target_lat, target_lng, has_children, children_count,
  children_age_bands, partner_children, pets, pet_allergy, smoking, alcohol, diet, chronotype,
  work_mode, living_arrangement, relocation, move_in, separate_rooms, expenses
) on public.listings to authenticated;
grant update (
  status, title, about, looking_for, photo_paths, country_code, city, approx_lat, approx_lng,
  target_country_code, target_city, target_lat, target_lng, has_children, children_count,
  children_age_bands, partner_children, pets, pet_allergy, smoking, alcohol, diet, chronotype,
  work_mode, living_arrangement, relocation, move_in, separate_rooms, expenses
) on public.listings to authenticated;
grant delete on public.listings to authenticated;

create policy listings_select on public.listings for select to authenticated using (
  owner_id = auth.uid()
  or (
    status = 'active'
    and public.is_trusted(auth.uid())
    and public.is_trusted(owner_id)
    and not public.is_blocked_between(auth.uid(), owner_id)
  )
);
create policy listings_insert on public.listings for insert to authenticated
  with check (owner_id = auth.uid());
create policy listings_update on public.listings for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy listings_delete on public.listings for delete to authenticated
  using (owner_id = auth.uid());

-- blocks: each user manages her own block list.
grant select, insert, delete on public.blocks to authenticated;
create policy blocks_select on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- connection_requests: read-only for participants; changes go through functions below.
grant select on public.connection_requests to authenticated;
create policy requests_select on public.connection_requests for select to authenticated
  using (owner_id = auth.uid() or requester_id = auth.uid());

-- availability_slots: the owner manages them; requesters with an accepted request can read them.
grant select, insert, update, delete on public.availability_slots to authenticated;
create policy slots_select on public.availability_slots for select to authenticated using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.connection_requests r
    where r.owner_id = availability_slots.owner_id and r.requester_id = auth.uid() and r.status = 'accepted'
  )
);
create policy slots_insert on public.availability_slots for insert to authenticated
  with check (owner_id = auth.uid() and starts_at > now());
create policy slots_update on public.availability_slots for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy slots_delete on public.availability_slots for delete to authenticated
  using (owner_id = auth.uid());

-- meetings: participants read them (without the room name); changes via functions.
grant select (id, request_id, owner_id, requester_id, starts_at, ends_at, status, created_at)
  on public.meetings to authenticated;
create policy meetings_select on public.meetings for select to authenticated
  using (owner_id = auth.uid() or requester_id = auth.uid());

-- reports: anyone signed in can file one; she sees only her own.
grant select (id, reported_id, listing_id, request_id, meeting_id, reason, details, status, created_at)
  on public.reports to authenticated;
grant insert (reporter_id, reported_id, listing_id, request_id, meeting_id, reason, details)
  on public.reports to authenticated;
create policy reports_select on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and reported_id is distinct from auth.uid());

-- credit_ledger: read own history; only functions write.
grant select on public.credit_ledger to authenticated;
create policy ledger_select on public.credit_ledger for select to authenticated using (user_id = auth.uid());

-- verification_sessions: service role only (no policies for clients).

-- ---------------------------------------------------------------------------
-- Report and block side effects
-- ---------------------------------------------------------------------------

create function public.after_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  settings public.app_settings;
  interacted boolean;
  serious_reporters integer;
  snap jsonb;
begin
  if new.reported_id is null then
    return new;
  end if;

  select jsonb_build_object(
    'display_name', p.display_name,
    'listing', (select jsonb_build_object('title', l.title, 'about', l.about, 'looking_for', l.looking_for)
                from public.listings l where l.owner_id = p.id),
    'request_message', (select r.message from public.connection_requests r where r.id = new.request_id)
  ) into snap
  from public.profiles p where p.id = new.reported_id;
  update public.reports set snapshot = coalesce(snap, '{}') where id = new.id;

  -- The reporter never has to see this account again.
  if new.reporter_id is not null then
    insert into public.blocks (blocker_id, blocked_id)
    values (new.reporter_id, new.reported_id) on conflict do nothing;
  end if;

  if new.reason in ('is_man', 'threat', 'stalking', 'underage') then
    select * into settings from public.app_settings;
    -- A report from someone who actually dealt with the account suspends it at once.
    -- Strangers' reports need several distinct reporters, so a single malicious report
    -- cannot take down an honest woman's listing.
    select exists (
      select 1 from public.connection_requests r
      where (r.owner_id = new.reporter_id and r.requester_id = new.reported_id)
         or (r.requester_id = new.reporter_id and r.owner_id = new.reported_id)
    ) into interacted;
    select count(distinct reporter_id) into serious_reporters
    from public.reports
    where reported_id = new.reported_id
      and reason in ('is_man', 'threat', 'stalking', 'underage')
      and status in ('open', 'reviewing');

    if interacted or serious_reporters >= settings.auto_suspend_report_threshold then
      update public.profiles
      set is_suspended = true, suspended_reason = 'auto: report ' || new.id
      where id = new.reported_id and not is_suspended;
    end if;
  end if;
  return new;
end $$;

create trigger reports_after_insert after insert on public.reports
  for each row execute function public.after_report();

-- Blocking ends any open contact between the two accounts.
create function public.after_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.connection_requests
  set status = 'declined', responded_at = now()
  where status in ('pending', 'accepted')
    and ((owner_id = new.blocker_id and requester_id = new.blocked_id)
      or (owner_id = new.blocked_id and requester_id = new.blocker_id));
  update public.meetings
  set status = 'cancelled'
  where status = 'scheduled'
    and ((owner_id = new.blocker_id and requester_id = new.blocked_id)
      or (owner_id = new.blocked_id and requester_id = new.blocker_id));
  return new;
end $$;

create trigger blocks_after_insert after insert on public.blocks
  for each row execute function public.after_block();

-- ---------------------------------------------------------------------------
-- Search (guests and members)
-- ---------------------------------------------------------------------------

create function public.distance_km(lat1 double precision, lng1 double precision,
                                   lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Guests (and accounts that are not trusted yet) get the "showcase": text and conditions, but no
-- photos and no coordinates. Trusted members also get photo paths and approximate coordinates.
-- Distances are returned as bands, the radius is at least 10 km and paging is capped,
-- so narrow filters cannot pinpoint a person and the base cannot be bulk-downloaded.
create function public.search_listings(
  p_country text default null,
  p_city text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km integer default null,
  p_age_bands public.age_band[] default null,
  p_has_children boolean default null,
  p_i_have_children boolean default null,
  p_no_pets boolean default null,
  p_no_smoking boolean default null,
  p_languages text[] default null,
  p_living public.living_arrangement[] default null,
  p_move_in public.move_in_timeline[] default null,
  p_sort text default 'newest',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  about text,
  looking_for text,
  country_code text,
  city text,
  target_country_code text,
  target_city text,
  age_band public.age_band,
  languages text[],
  has_children boolean,
  children_count smallint,
  children_age_bands text[],
  partner_children public.partner_children_pref,
  pets text[],
  pet_allergy boolean,
  smoking public.smoking_pref,
  alcohol public.alcohol_pref,
  diet public.diet_pref,
  chronotype public.chronotype,
  work_mode public.work_mode,
  living_arrangement public.living_arrangement,
  relocation public.relocation_pref,
  move_in public.move_in_timeline,
  separate_rooms boolean,
  expenses public.expenses_pref,
  photo_count integer,
  photo_paths text[],
  approx_lat double precision,
  approx_lng double precision,
  distance_band text,
  published_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  trusted boolean := public.is_trusted(auth.uid());
  radius integer := case when p_radius_km is null then null else greatest(p_radius_km, 10) end;
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  off integer := least(greatest(coalesce(p_offset, 0), 0), 600);
begin
  if p_sort not in ('newest', 'nearest', 'age') then
    raise exception 'invalid_sort' using errcode = '22023';
  end if;

  return query
  with base as (
    select l.*, p.age_band as owner_age_band, p.languages as owner_languages,
      case when p_lat is not null and p_lng is not null and l.approx_lat is not null
        then public.distance_km(p_lat, p_lng, l.approx_lat, l.approx_lng) end as dist
    from public.listings l
    join public.profiles p on p.id = l.owner_id
    where l.status = 'active'
      and public.is_trusted(l.owner_id)
      and (viewer is null or (l.owner_id <> viewer and not public.is_blocked_between(viewer, l.owner_id)))
      and (p_country is null or l.country_code = upper(p_country) or l.target_country_code = upper(p_country))
      and (p_city is null or lower(l.city) = lower(p_city) or lower(l.target_city) = lower(p_city))
      and (p_age_bands is null or p.age_band = any (p_age_bands))
      and (p_has_children is null or l.has_children = p_has_children)
      and (p_i_have_children is not true or l.partner_children in ('welcome', 'any'))
      and (p_no_pets is not true or cardinality(l.pets) = 0)
      and (p_no_smoking is not true or l.smoking = 'no')
      and (p_languages is null or p.languages && p_languages)
      and (p_living is null or l.living_arrangement = any (p_living))
      and (p_move_in is null or l.move_in = any (p_move_in))
  )
  select b.id, b.title, b.about, b.looking_for, b.country_code, b.city,
    b.target_country_code, b.target_city, b.owner_age_band, b.owner_languages,
    b.has_children, b.children_count, b.children_age_bands, b.partner_children,
    b.pets, b.pet_allergy, b.smoking, b.alcohol, b.diet, b.chronotype, b.work_mode,
    b.living_arrangement, b.relocation, b.move_in, b.separate_rooms, b.expenses,
    cardinality(b.photo_paths),
    case when trusted then b.photo_paths end,
    case when trusted then b.approx_lat end,
    case when trusted then b.approx_lng end,
    case
      when b.dist is null then null
      when b.dist < 10 then 'lt_10'
      when b.dist < 25 then '10_25'
      when b.dist < 50 then '25_50'
      when b.dist < 100 then '50_100'
      else '100_plus'
    end,
    b.published_at
  from base b
  where radius is null or (b.dist is not null and b.dist <= radius)
  order by
    case when p_sort = 'nearest' then b.dist end asc nulls last,
    case when p_sort = 'age' then b.owner_age_band end asc nulls last,
    b.published_at desc,
    b.id
  limit lim offset off;
end $$;


-- ---------------------------------------------------------------------------
-- Requests, credits and meetings
-- ---------------------------------------------------------------------------

create function public.my_credit_balance() returns integer
language sql stable security definer set search_path = '' as $$
  select public.credit_balance(auth.uid());
$$;

create function public.send_connection_request(p_listing_id uuid, p_message text default '')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  me public.profiles;
  target public.listings;
  settings public.app_settings;
  sent_today integer;
  daily_limit integer;
  new_id uuid;
begin
  if viewer is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into me from public.profiles where id = viewer;
  if not public.is_trusted(viewer) then
    raise exception 'verification_required' using errcode = '42501';
  end if;
  if me.display_name is null or me.photo_path is null then
    raise exception 'profile_incomplete' using errcode = '22023';
  end if;

  select * into target from public.listings where id = p_listing_id;
  if not found or target.status <> 'active' or not public.is_trusted(target.owner_id)
     or public.is_blocked_between(viewer, target.owner_id) then
    raise exception 'listing_unavailable' using errcode = 'P0002';
  end if;
  if target.owner_id = viewer then
    raise exception 'own_listing' using errcode = '22023';
  end if;

  p_message := btrim(coalesce(p_message, ''));
  if char_length(p_message) > 300 then
    raise exception 'message_too_long' using errcode = '22001';
  end if;
  if public.contains_contact_info(p_message) then
    raise exception 'contact_info_not_allowed' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.connection_requests
    where listing_id = p_listing_id and requester_id = viewer and status in ('pending', 'accepted')
  ) then
    raise exception 'request_exists' using errcode = '23505';
  end if;

  select * into settings from public.app_settings;
  daily_limit := case
    when me.created_at > now() - make_interval(days => settings.new_account_days)
      then settings.new_account_daily_requests
    else settings.daily_requests
  end;
  select count(*) into sent_today from public.connection_requests
  where requester_id = viewer and created_at > now() - interval '24 hours';
  if sent_today >= daily_limit then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  new_id := gen_random_uuid();
  if settings.paid_requests_enabled then
    -- serialize concurrent spends by the same user
    perform pg_advisory_xact_lock(hashtext('credits:' || viewer::text));
    if public.credit_balance(viewer) < 1 then
      raise exception 'insufficient_credits' using errcode = '53000';
    end if;
    insert into public.credit_ledger (user_id, delta, reason, ref_id)
    values (viewer, -1, 'request_sent', new_id);
  end if;

  insert into public.connection_requests (id, listing_id, owner_id, requester_id, message)
  values (new_id, p_listing_id, target.owner_id, viewer, p_message);
  return new_id;
end $$;

-- Give back the credit spent on a request, if one was spent and not yet refunded.
create function public.refund_request_credit(p_request_id uuid, p_reason public.credit_reason)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  spent record;
begin
  select user_id into spent from public.credit_ledger
  where ref_id = p_request_id and reason = 'request_sent';
  if not found then
    return;
  end if;
  if exists (
    select 1 from public.credit_ledger
    where ref_id = p_request_id and reason in ('refund_declined', 'refund_expired', 'refund_withdrawn')
  ) then
    return;
  end if;
  insert into public.credit_ledger (user_id, delta, reason, ref_id)
  values (spent.user_id, 1, p_reason, p_request_id);
end $$;

create function public.respond_to_request(p_request_id uuid, p_accept boolean)
returns public.request_status
language plpgsql security definer set search_path = '' as $$
declare
  req public.connection_requests;
  new_status public.request_status;
begin
  select * into req from public.connection_requests where id = p_request_id for update;
  if not found or req.owner_id <> auth.uid() then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if req.status <> 'pending' then
    raise exception 'request_not_pending' using errcode = '22023';
  end if;
  new_status := case when p_accept then 'accepted' else 'declined' end;
  update public.connection_requests set status = new_status, responded_at = now() where id = p_request_id;
  if not p_accept then
    perform public.refund_request_credit(p_request_id, 'refund_declined');
  end if;
  return new_status;
end $$;

create function public.withdraw_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  req public.connection_requests;
begin
  select * into req from public.connection_requests where id = p_request_id for update;
  if not found or req.requester_id <> auth.uid() then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if req.status <> 'pending' then
    raise exception 'request_not_pending' using errcode = '22023';
  end if;
  update public.connection_requests set status = 'withdrawn', responded_at = now() where id = p_request_id;
  perform public.refund_request_credit(p_request_id, 'refund_withdrawn');
end $$;

-- Run on a schedule (pg_cron or a scheduled Edge Function): expire unanswered requests and refund.
create function public.expire_stale_requests() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  days integer;
  r record;
  n integer := 0;
begin
  select request_expiry_days into days from public.app_settings;
  for r in
    update public.connection_requests set status = 'expired', responded_at = now()
    where status = 'pending' and created_at < now() - make_interval(days => days)
    returning id
  loop
    perform public.refund_request_credit(r.id, 'refund_expired');
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.book_meeting(p_request_id uuid, p_starts_at timestamptz, p_minutes integer default 30)
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

create function public.cancel_meeting(p_meeting_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.meetings set status = 'cancelled'
  where id = p_meeting_id and status = 'scheduled'
    and (owner_id = auth.uid() or requester_id = auth.uid());
  if not found then
    raise exception 'meeting_not_found' using errcode = 'P0002';
  end if;
end $$;

-- What the signed-in user needs about her own account in one call.
create function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'verification_status', p.verification_status,
    'trusted', public.is_trusted(p.id),
    'photo_path', p.photo_path,
    'is_suspended', p.is_suspended,
    'credits', public.credit_balance(p.id),
    'has_listing', exists (select 1 from public.listings l where l.owner_id = p.id)
  )
  from public.profiles p where p.id = auth.uid();
$$;

-- In-app account deletion (App Store guideline 5.1.1(v)). Storage files are removed by the
-- `delete-account` Edge Function, which calls this after deleting the user's objects.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private buckets; paths are `<user id>/<file>`
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', false), ('profile-photos', 'profile-photos', false)
on conflict (id) do nothing;

create policy "own uploads" on storage.objects for insert to authenticated with check (
  bucket_id in ('listing-photos', 'profile-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "own updates" on storage.objects for update to authenticated using (
  bucket_id in ('listing-photos', 'profile-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "own deletes" on storage.objects for delete to authenticated using (
  bucket_id in ('listing-photos', 'profile-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
);
-- Listing photos: the owner, and trusted members for active listings that use the file.
create policy "listing photos read" on storage.objects for select to authenticated using (
  bucket_id = 'listing-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.listings l
      where name = any (l.photo_paths)
        and l.status = 'active'
        and public.is_trusted(auth.uid())
        and public.is_trusted(l.owner_id)
        and not public.is_blocked_between(auth.uid(), l.owner_id)
    )
  )
);
-- Profile (face) photos: the user, and listing owners she has sent a request to.
create policy "profile photos read" on storage.objects for select to authenticated using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.connection_requests r
      join public.profiles p on p.id = r.requester_id
      where p.photo_path = name
        and r.owner_id = auth.uid()
        and not public.is_blocked_between(r.owner_id, r.requester_id)
    )
  )
);

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is callable by clients unless listed here.
-- (PostgreSQL grants EXECUTE to PUBLIC by default, so this must come after every function.)
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;

-- used inside RLS policies and invoker triggers
grant execute on function public.is_trusted(uuid) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.obfuscate_coordinate(double precision, integer) to authenticated;
grant execute on function public.contains_contact_info(text) to anon, authenticated;

-- client API
grant execute on function public.search_listings(
  text, text, double precision, double precision, integer, public.age_band[], boolean, boolean,
  boolean, boolean, text[], public.living_arrangement[], public.move_in_timeline[], text, integer, integer
) to anon, authenticated;
grant execute on function public.my_account() to authenticated;
grant execute on function public.my_credit_balance() to authenticated;
grant execute on function public.send_connection_request(uuid, text) to authenticated;
grant execute on function public.respond_to_request(uuid, boolean) to authenticated;
grant execute on function public.withdraw_request(uuid) to authenticated;
grant execute on function public.book_meeting(uuid, timestamptz, integer) to authenticated;
grant execute on function public.cancel_meeting(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
-- Not granted (service role / scheduler only): expire_stale_requests, refund_request_credit,
-- credit_balance (would reveal other users' balances), handle_new_user, after_report, after_block.
