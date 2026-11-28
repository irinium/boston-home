import type { ListingSummary } from '@/lib/types';

/** Search results kept in memory so the detail screen opens instantly (and works for guests). */
const cache = new Map<string, ListingSummary>();

export const listingCache = {
  put(items: ListingSummary[]) {
    for (const item of items) cache.set(item.id, item);
  },
  get(id: string) {
    return cache.get(id);
  },
};
