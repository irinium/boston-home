import { useSyncExternalStore } from 'react';

import type { SearchFilters } from '@/lib/types';

/** Search filters shared by the showcase and the filters screen, kept in memory only. */
let current: SearchFilters = {};
const listeners = new Set<() => void>();

export const filterStore = {
  get: () => current,
  set(next: SearchFilters) {
    current = next;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useFilters = () => useSyncExternalStore(filterStore.subscribe, filterStore.get, filterStore.get);

/** How many filters are active, for the "Filters (n)" button. */
export function activeFilterCount(f: SearchFilters): number {
  return [
    f.country,
    f.hasChildren,
    f.iHaveChildren,
    f.noPets,
    f.noSmoking,
    f.lat !== undefined,
    f.ageBands?.length,
    f.languages?.length,
    f.living?.length,
    f.moveIn?.length,
  ].filter(Boolean).length;
}
