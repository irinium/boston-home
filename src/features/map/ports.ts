import type { Bounds } from '@/features/map/domain/geo';
import type { ListingSummary, SearchFilters } from '@/lib/types';

/** Filters that make sense on a map: paging and sorting do not. */
export type MapFilters = Omit<SearchFilters, 'offset' | 'sort'>;

/** Loads listings whose approximate point is inside the box. */
export type MapListingsSource = (bounds: Bounds, filters: MapFilters) => Promise<ListingSummary[]>;

/** Keeps loaded listings so the detail screen opens without another request. */
export type ListingStore = { put(items: ListingSummary[]): void };
