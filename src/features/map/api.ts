import type { Bounds } from '@/features/map/domain/geo';
import { MAP_LIMIT } from '@/features/map/domain/load';
import type { MapListingsSource } from '@/features/map/ports';
import { ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { ListingSummary } from '@/lib/types';

const nonEmpty = <T>(list: T[] | undefined): T[] | null => (list && list.length > 0 ? list : null);

/** Supabase adapter for the map: the `map_listings` RPC (trusted members only). */
export const fetchMapListings: MapListingsSource = async (bounds: Bounds, f) => {
  const { data, error } = await supabase.rpc('map_listings', {
    p_south: bounds.south,
    p_west: bounds.west,
    p_north: bounds.north,
    p_east: bounds.east,
    p_country: f.country || null,
    p_has_children: f.hasChildren ?? null,
    p_i_have_children: f.iHaveChildren ?? null,
    p_no_pets: f.noPets ?? null,
    p_no_smoking: f.noSmoking ?? null,
    p_age_bands: nonEmpty(f.ageBands),
    p_languages: nonEmpty(f.languages),
    p_living: nonEmpty(f.living),
    p_move_in: nonEmpty(f.moveIn),
    p_lat: f.lat ?? null,
    p_lng: f.lng ?? null,
    p_radius_km: f.radiusKm ?? null,
    p_limit: MAP_LIMIT,
  });
  if (error) throw new ApiError(error.message);
  return (data ?? []) as ListingSummary[];
};
