import { useEffect, useState } from 'react';

import { fetchMapListings } from '@/features/map/api';
import type { MapPoint } from '@/features/map/domain/cluster';
import type { Bounds } from '@/features/map/domain/geo';
import { loadMapListings } from '@/features/map/domain/load';
import type { ListingStore, MapListingsSource } from '@/features/map/ports';
import { listingCache } from '@/lib/listing-cache';
import type { SearchFilters } from '@/lib/types';

export type MapDeps = { source: MapListingsSource; store: ListingStore };

const defaultDeps: MapDeps = { source: fetchMapListings, store: listingCache };

type Loaded = { bounds: Bounds; filters: SearchFilters; reload: number };

/**
 * Listings inside `bounds` for the current filters. Keeps the previous points on screen while
 * the next area loads, and ignores answers that arrive after the user has moved on.
 * `bounds` and `filters` must keep their identity until they really change.
 */
export function useMapListings(bounds: Bounds, filters: SearchFilters, deps: MapDeps = defaultDeps) {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [loadedFor, setLoadedFor] = useState<Loaded | null>(null);
  const loading = loadedFor?.bounds !== bounds || loadedFor.filters !== filters || loadedFor.reload !== reload;

  useEffect(() => {
    let current = true;
    loadMapListings(deps, bounds, filters)
      .then((result) => {
        if (!current) return;
        setPoints(result.points);
        setCapped(result.capped);
        setError(false);
      })
      .catch(() => current && setError(true))
      .finally(() => current && setLoadedFor({ bounds, filters, reload }));
    return () => {
      current = false;
    };
  }, [deps, bounds, filters, reload]);

  return { points, capped, error, loading, retry: () => setReload((n) => n + 1) };
}
