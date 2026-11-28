import type { ListingStore, MapFilters, MapListingsSource } from '@/features/map/ports';
import type { ListingSummary, SearchFilters } from '@/lib/types';

import type { MapPoint } from './cluster';
import type { Bounds } from './geo';

/** The most listings one map query returns (the database caps it as well). */
export const MAP_LIMIT = 200;

export type MapResult = {
  points: MapPoint[];
  /** True when the area has more listings than one query returns: zoom in to see them all. */
  capped: boolean;
};

export function mapFilters({ offset: _offset, sort: _sort, ...rest }: SearchFilters): MapFilters {
  return rest;
}

export function toPoints(items: readonly ListingSummary[]): MapPoint[] {
  return items.flatMap((item) =>
    item.approx_lat === null || item.approx_lng === null
      ? []
      : [{ id: item.id, latitude: item.approx_lat, longitude: item.approx_lng }],
  );
}

/** Use case: load the listings in view, remember them for the detail screen, return map points. */
export async function loadMapListings(
  deps: { source: MapListingsSource; store: ListingStore },
  bounds: Bounds,
  filters: SearchFilters,
): Promise<MapResult> {
  const items = await deps.source(bounds, mapFilters(filters));
  deps.store.put(items);
  return { points: toPoints(items), capped: items.length >= MAP_LIMIT };
}
