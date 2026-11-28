import { useCallback, useMemo, useState } from 'react';

import type { QueueCursor } from '../application/ports';
import { prioritise, type ReportStatus } from '../domain/report';
import { AccountPanel } from './AccountPanel';
import { useApp } from './AppContext';
import { ErrorText } from './ErrorText';
import { ReportCard } from './ReportCard';
import { usePagedList } from './usePagedList';

const FILTERS = {
  active: ['open', 'reviewing'],
  closed: ['resolved', 'dismissed'],
} as const satisfies Record<string, readonly ReportStatus[]>;
type Filter = keyof typeof FILTERS;

export function ReportQueue() {
  const { moderation, t } = useApp();
  const [filter, setFilter] = useState<Filter>('active');
  const [accountId, setAccountId] = useState<string | null>(null);

  const load = useCallback(
    (cursor: QueueCursor | null) => moderation.loadQueue(FILTERS[filter], cursor),
    [moderation, filter],
  );
  const queue = usePagedList(load);
  const ordered = useMemo(() => prioritise(queue.rows), [queue.rows]);

  return (
    <section aria-labelledby="queue-heading">
      <h2 id="queue-heading">{t('moderation.queue.heading')}</h2>
      <div role="tablist" className="tabs">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>
            {t(key === 'active' ? 'moderation.queue.filterActive' : 'moderation.queue.filterClosed')}
          </button>
        ))}
      </div>
      <ErrorText code={queue.error} />
      <div className="columns">
        <div className="list">
          {!queue.loading && ordered.length === 0 && !queue.error ? <p>{t('moderation.queue.empty')}</p> : null}
          {ordered.map((report) => (
            <ReportCard key={report.id} report={report} onOpenAccount={setAccountId} onDecided={queue.reload} />
          ))}
          {queue.hasMore ? (
            <button type="button" className="secondary" disabled={queue.loading} onClick={queue.loadMore}>
              {t('moderation.queue.loadMore')}
            </button>
          ) : null}
        </div>
        {accountId ? (
          <AccountPanel key={accountId} userId={accountId} onClose={() => setAccountId(null)} onChanged={queue.reload} />
        ) : null}
      </div>
    </section>
  );
}
