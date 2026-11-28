-- Map of listings: approximate listing points inside the visible map area.
--
-- Privacy rules (same as search_listings, plus):
--   * Trusted members only. Guests and accounts that are not trusted yet get an error, never points.
--   * Points are the stored, already obfuscated coordinates (~5 km grid plus a fixed offset).
--   * The box is widened to at least 10 km on each side, so a tiny box cannot test whether a
--     listing sits on one street. A radius filter is also at least 10 km.
--   * Distances are returned only as bands, and one call returns at most 200 listings.

create function public.map_listings(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision,
  p_country text default null,
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
  p_limit integer default 200
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
  -- 5 km in degrees of latitude: half of the 10 km minimum box side.
  min_half_lat constant double precision := 0.045;
  radius integer := case when p_radius_km is null then null else greatest(p_radius_km, 10) end;
  lim integer := least(greatest(coalesce(p_limit, 200), 1), 200);
  center_lat double precision;
  center_lng double precision;
  half_lat double precision;
  half_lng double precision;
  span_lng double precision;
  south double precision;
  north double precision;
  west double precision;
  east double precision;
  all_lng boolean;
begin
  if viewer is null or not public.is_trusted(viewer) then
    raise exception 'verification_required' using errcode = '42501';
  end if;
  if p_south is null or p_west is null or p_north is null or p_east is null
     or p_south < -90 or p_north > 90 or p_south > p_north
     or p_west < -180 or p_west > 180 or p_east < -180 or p_east > 180 then
    raise exception 'invalid_bounds' using errcode = '22023';
  end if;

  -- Widen the box around its centre. A box with west > east crosses the antimeridian.
  span_lng := case when p_west <= p_east then p_east - p_west else p_east + 360 - p_west end;
  center_lat := (p_south + p_north) / 2;
  center_lng := p_west + span_lng / 2;
  half_lat := greatest((p_north - p_south) / 2, min_half_lat);
  half_lng := greatest(span_lng / 2, min_half_lat / greatest(cos(radians(center_lat)), 0.01));
  south := greatest(center_lat - half_lat, -90);
  north := least(center_lat + half_lat, 90);
  all_lng := half_lng >= 180;
  -- Normalise to [-180, 180).
  west := mod((center_lng - half_lng + 540)::numeric, 360)::double precision - 180;
  east := mod((center_lng + half_lng + 540)::numeric, 360)::double precision - 180;

  return query
  with base as (
    select l.*, p.age_band as owner_age_band, p.languages as owner_languages,
      case when p_lat is not null and p_lng is not null
        then public.distance_km(p_lat, p_lng, l.approx_lat, l.approx_lng) end as dist
    from public.listings l
    join public.profiles p on p.id = l.owner_id
    where l.status = 'active'
      and l.approx_lat is not null and l.approx_lng is not null
      and l.approx_lat between south and north
      and (all_lng
        or (west <= east and l.approx_lng between west and east)
        or (west > east and (l.approx_lng >= west or l.approx_lng <= east)))
      and public.is_trusted(l.owner_id)
      and l.owner_id <> viewer
      and not public.is_blocked_between(viewer, l.owner_id)
      -- The filters below match search_listings (checked by the database tests).
      and (p_country is null or l.country_code = upper(p_country) or l.target_country_code = upper(p_country))
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
    cardinality(b.photo_paths), b.photo_paths, b.approx_lat, b.approx_lng,
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
  order by b.published_at desc, b.id
  limit lim;
end $$;

revoke all on function public.map_listings(
  double precision, double precision, double precision, double precision, text, double precision,
  double precision, integer, public.age_band[], boolean, boolean, boolean, boolean, text[],
  public.living_arrangement[], public.move_in_timeline[], integer
) from public, anon;
grant execute on function public.map_listings(
  double precision, double precision, double precision, double precision, text, double precision,
  double precision, integer, public.age_band[], boolean, boolean, boolean, boolean, text[],
  public.living_arrangement[], public.move_in_timeline[], integer
) to authenticated;

-- Map queries filter active listings by their approximate point.
create index listings_active_point on public.listings (approx_lat, approx_lng) where status = 'active';
