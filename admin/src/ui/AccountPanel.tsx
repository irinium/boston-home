import { useEffect, useState } from 'react';

import { availableAccountActions, isAutomaticSuspension, type AccountSummary } from '../domain/account';
import type { ModerationErrorCode } from '../domain/errors';
import { useApp } from './AppContext';
import { ErrorText } from './ErrorText';
import { ReasonForm } from './ReasonForm';

interface Props {
  readonly userId: string;
  readonly onClose: () => void;
  /** Called after any change, so the queue can refresh. */
  readonly onChanged: () => void;
}

export function AccountPanel({ userId, onClose, onChanged }: Props) {
  const { moderation, t, formatDate } = useApp();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<ModerationErrorCode | null>(null);
  const [notice, setNotice] = useState(false);
  // Bumped after every action so the summary is read again from the database.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void moderation.loadAccount(userId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setAccount(result.value);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [moderation, userId, version]);

  const done = () => {
    setNotice(true);
    setVersion((v) => v + 1);
    onChanged();
  };

  const actions = account ? availableAccountActions(account) : null;
  const listing = account?.listing ?? null;

  return (
    <aside className="card account" aria-label={t('moderation.queue.openAccount')}>
      <button type="button" className="link close" onClick={onClose}>{t('moderation.account.close')}</button>
      <ErrorText code={error} />
      {account && actions ? (
        <>
          <h2>{t('moderation.account.heading', { name: account.displayName ?? t('moderation.account.noName') })}</h2>
          <p>{t('moderation.account.createdAt', { date: formatDate(account.createdAt) })}</p>
          <p>{t('moderation.account.reports', { open: account.openReports, total: account.totalReports })}</p>
          <p className={account.isSuspended ? 'badge danger' : 'badge'}>
            {account.isSuspended
              ? t('moderation.account.suspended', {
                reason: isAutomaticSuspension(account.suspendedReason)
                  ? t('moderation.account.automatic')
                  : account.suspendedReason ?? '',
              })
              : t('moderation.account.active')}
          </p>
          {account.isAdmin ? <p className="badge">{t('moderation.account.admin')}</p> : null}
          <p>
            {listing
              ? t('moderation.account.listing', { title: listing.title, status: t(`moderation.listingStatuses.${listing.status}`) })
              : t('moderation.account.noListing')}
          </p>
          {notice ? <p role="status">{t('moderation.account.done')}</p> : null}

          {actions.suspend ? (
            <ReasonForm danger submitLabel={t('moderation.account.suspend')}
              onSubmit={(reason) => moderation.suspendAccount(account.id, reason)} onDone={done} />
          ) : null}
          {actions.unsuspend ? (
            <ReasonForm submitLabel={t('moderation.account.unsuspend')} hint={t('moderation.account.unsuspendHint')}
              onSubmit={(reason) => moderation.unsuspendAccount(account.id, reason)} onDone={done} />
          ) : null}
          {listing && actions.hideListing ? (
            <ReasonForm danger submitLabel={t('moderation.account.hideListing')}
              onSubmit={(reason) => moderation.hideListing(listing.id, reason)} onDone={done} />
          ) : null}
          {listing && actions.unhideListing ? (
            <ReasonForm submitLabel={t('moderation.account.unhideListing')}
              onSubmit={(reason) => moderation.unhideListing(listing.id, reason)} onDone={done} />
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
