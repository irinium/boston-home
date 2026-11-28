import { useCallback } from 'react';

import { useApp } from './AppContext';
import { ErrorText } from './ErrorText';
import { usePagedList } from './usePagedList';

const shortId = (id: string): string => id.slice(0, 8);

export function AuditLog() {
  const { moderation, t, formatDate } = useApp();
  const load = useCallback((beforeId: number | null) => moderation.loadAuditLog(beforeId), [moderation]);
  const log = usePagedList(load);

  return (
    <section aria-labelledby="log-heading">
      <h2 id="log-heading">{t('moderation.log.heading')}</h2>
      <ErrorText code={log.error} />
      {!log.loading && log.rows.length === 0 && !log.error ? <p>{t('moderation.log.empty')}</p> : null}
      <ol className="log">
        {log.rows.map((entry) => (
          <li key={entry.id}>
            <time dateTime={entry.createdAt.toISOString()}>{formatDate(entry.createdAt)}</time>{' '}
            <strong>{t(`moderation.actions.${entry.action}`)}</strong>
            {entry.targetUserId ? <> · {t('moderation.log.target', { id: shortId(entry.targetUserId) })}</> : null}
            {' · '}
            {t('moderation.log.by', {
              admin: entry.adminId ? shortId(entry.adminId) : t('moderation.log.deletedAdmin'),
            })}
            {entry.reason ? <p className="muted">{entry.reason}</p> : null}
          </li>
        ))}
      </ol>
      {log.hasMore ? (
        <button type="button" className="secondary" disabled={log.loading} onClick={log.loadMore}>
          {t('moderation.log.loadMore')}
        </button>
      ) : null}
    </section>
  );
}
