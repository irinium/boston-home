import { useId, useState } from 'react';

import type { ModerationErrorCode } from '../domain/errors';
import { availableDecisions, isSerious, type QueuedReport, type ReportDecision } from '../domain/report';
import { useApp } from './AppContext';
import { ErrorText } from './ErrorText';

interface Props {
  readonly report: QueuedReport;
  readonly onOpenAccount: (userId: string) => void;
  readonly onDecided: () => void;
}

export function ReportCard({ report, onOpenAccount, onDecided }: Props) {
  const { moderation, t, formatDate } = useApp();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ModerationErrorCode | null>(null);

  const decide = async (decision: ReportDecision) => {
    setBusy(true);
    const result = await moderation.decideReport(report.id, decision, note);
    setBusy(false);
    if (result.ok) {
      setError(null);
      onDecided();
    } else {
      setError(result.error);
    }
  };

  const { snapshot } = report;
  return (
    <article className={isSerious(report.reason) ? 'card report serious' : 'card report'}>
      <header>
        <strong>{t(`moderation.reasons.${report.reason}`)}</strong>
        {isSerious(report.reason) ? <span className="badge danger">{t('moderation.queue.serious')}</span> : null}
        <span className="badge">{t(`moderation.statuses.${report.status}`)}</span>
        <span className="muted">{t('moderation.queue.reportedAt', { date: formatDate(report.createdAt) })}</span>
      </header>
      <p>
        {report.reportedId === null
          ? t('moderation.queue.deletedAccount')
          : report.reportedDisplayName ?? snapshot.displayName ?? t('moderation.account.noName')}
        {report.reportedIsSuspended ? <span className="badge danger">{t('moderation.queue.suspended')}</span> : null}
      </p>
      {report.openReportsAgainst > 1 ? (
        <p className="muted">{t('moderation.queue.againstAccount', { count: report.openReportsAgainst })}</p>
      ) : null}
      {report.details ? <blockquote aria-label={t('moderation.queue.details')}>{report.details}</blockquote> : null}
      {snapshot.listingTitle || snapshot.listingText ? (
        <details>
          <summary>{t('moderation.queue.snapshotListing')}</summary>
          {snapshot.listingTitle ? <p><strong>{snapshot.listingTitle}</strong></p> : null}
          {snapshot.listingText ? <p className="pre">{snapshot.listingText}</p> : null}
        </details>
      ) : null}
      {snapshot.requestMessage ? (
        <details>
          <summary>{t('moderation.queue.snapshotMessage')}</summary>
          <p className="pre">{snapshot.requestMessage}</p>
        </details>
      ) : null}
      <footer>
        <label htmlFor={noteId} className="sr-only">{t('moderation.queue.note')}</label>
        <input id={noteId} placeholder={t('moderation.queue.note')} value={note} maxLength={500}
          onChange={(e) => setNote(e.target.value)} />
        {availableDecisions(report.status).map((decision) => (
          <button key={decision} type="button" disabled={busy} onClick={() => void decide(decision)}>
            {t(`moderation.decisions.${decision}`)}
          </button>
        ))}
        {report.reportedId !== null ? (
          <button type="button" className="secondary" onClick={() => onOpenAccount(report.reportedId as string)}>
            {t('moderation.queue.openAccount')}
          </button>
        ) : null}
      </footer>
      <ErrorText code={error} />
    </article>
  );
}
