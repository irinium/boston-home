import { useEffect, useRef, useState } from 'react';

import type { Page } from '../application/moderationService';
import type { ModerationErrorCode } from '../domain/errors';
import { mergePage } from '../domain/report';
import type { Result } from '../domain/result';

export interface PagedList<T> {
  readonly rows: readonly T[];
  readonly loading: boolean;
  readonly error: ModerationErrorCode | null;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly reload: () => void;
}

export type PageLoader<T, C> = (cursor: C | null) => Promise<Result<Page<T, C>, ModerationErrorCode>>;

interface Loaded<T, C> {
  /** The loader these rows came from; rows of an older loader are never shown. */
  readonly source: PageLoader<T, C> | null;
  readonly rows: readonly T[];
  readonly next: C | null;
  readonly error: ModerationErrorCode | null;
}

/**
 * Loads the first page whenever `load` changes (pass a memoised loader) and appends further pages on
 * request. A response that arrives after a newer request started is dropped.
 */
export function usePagedList<T extends { readonly id: string | number }, C>(load: PageLoader<T, C>): PagedList<T> {
  const [loaded, setLoaded] = useState<Loaded<T, C>>({ source: null, rows: [], next: null, error: null });
  const [pending, setPending] = useState(false);
  const generation = useRef(0);

  const apply = (cursor: C | null, result: Result<Page<T, C>, ModerationErrorCode>) =>
    setLoaded((previous) => {
      if (!result.ok) return { ...previous, source: load, error: result.error };
      const base = cursor === null || previous.source !== load ? [] : previous.rows;
      return { source: load, rows: mergePage(base, result.value.rows), next: result.value.next, error: null };
    });

  const request = (cursor: C | null) => {
    const current = ++generation.current;
    setPending(true);
    void load(cursor).then((result) => {
      if (current !== generation.current) return;
      setPending(false);
      apply(cursor, result);
    });
  };

  useEffect(() => {
    const current = ++generation.current;
    void load(null).then((result) => {
      if (current !== generation.current) return;
      setPending(false);
      setLoaded(
        result.ok
          ? { source: load, rows: result.value.rows, next: result.value.next, error: null }
          : { source: load, rows: [], next: null, error: result.error },
      );
    });
  }, [load]);

  const fresh = loaded.source === load;
  return {
    rows: fresh ? loaded.rows : [],
    loading: !fresh || pending,
    error: fresh ? loaded.error : null,
    hasMore: fresh && loaded.next !== null,
    loadMore: () => {
      if (fresh && loaded.next !== null) request(loaded.next);
    },
    reload: () => request(null),
  };
}
