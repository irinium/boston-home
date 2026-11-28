import { useId, useState, type FormEvent } from 'react';

import type { ModerationErrorCode } from '../domain/errors';
import type { Result } from '../domain/result';
import { useApp } from './AppContext';
import { ErrorText } from './ErrorText';

interface Props {
  readonly submitLabel: string;
  readonly hint?: string;
  readonly danger?: boolean;
  readonly onSubmit: (reason: string) => Promise<Result<void, ModerationErrorCode>>;
  readonly onDone: () => void;
}

/** A required-reason form for one moderation action. The use case validates the text. */
export function ReasonForm({ submitLabel, hint, danger = false, onSubmit, onDone }: Props) {
  const { t } = useApp();
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ModerationErrorCode | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await onSubmit(reason);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setReason('');
    onDone();
  };

  return (
    <form onSubmit={submit} className="reason-form" aria-label={submitLabel}>
      <label htmlFor={id}>{t('moderation.account.reason')}</label>
      <textarea id={id} value={reason} maxLength={500} rows={2} onChange={(e) => setReason(e.target.value)} />
      {hint ? <p className="hint">{hint}</p> : null}
      <button type="submit" className={danger ? 'danger' : undefined} disabled={busy}>{submitLabel}</button>
      <ErrorText code={error} />
    </form>
  );
}
