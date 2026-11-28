import type { SearchFilters } from '@/lib/types';

export type LatLng = { latitude: number; longitude: number };

/** The visible map area, as react-native-maps describes it. */
export type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };

/** A box in degrees. `west > east` means the box crosses the antimeridian. */
export type Bounds = { south: number; west: number; north: number; east: number };

/** About 1 km in degrees of latitude. */
export const KM_IN_DEGREES = 1 / 111.32;

/** The database widens smaller boxes to this, so asking for less gains nothing. */
export const MIN_BOX_KM = 10;

/** Europe and the Mediterranean: where most members live today. */
export const DEFAULT_REGION: Region = { latitude: 48, longitude: 14, latitudeDelta: 30, longitudeDelta: 30 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Wraps a longitude into [-180, 180). */
export function normalizeLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function regionToBounds(region: Region): Bounds {
  const halfLat = region.latitudeDelta / 2;
  const south = clamp(region.latitude - halfLat, -90, 90);
  const north = clamp(region.latitude + halfLat, -90, 90);
  if (region.longitudeDelta >= 360) return { south, west: -180, north, east: 180 };
  const halfLng = region.longitudeDelta / 2;
  return {
    south,
    north,
    west: normalizeLongitude(region.longitude - halfLng),
    east: normalizeLongitude(region.longitude + halfLng),
  };
}

/**
 * A stable key for a box, rounded to about 1 km, so tiny map jitters do not trigger a new
 * request. Two regions with the same key are the same query.
 */
export function boundsKey(bounds: Bounds): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east].map((n) => n.toFixed(2)).join(',');
}

/** Where the map opens: around the radius filter if one is set, otherwise the default area. */
export function initialRegion(filters: SearchFilters): Region {
  if (filters.lat === undefined || filters.lng === undefined) return DEFAULT_REGION;
  const radiusKm = Math.max(filters.radiusKm ?? 50, MIN_BOX_KM);
  const delta = radiusKm * 2 * KM_IN_DEGREES * 1.2;
  return { latitude: filters.lat, longitude: filters.lng, latitudeDelta: delta, longitudeDelta: delta };
}
