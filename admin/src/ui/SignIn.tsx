import { useState, type FormEvent } from 'react';

import type { AdminSession } from '../application/ports';
import type { ModerationErrorCode } from '../domain/errors';
import { useApp } from './AppContext';
import { ErrorText } from './ErrorText';

export function SignIn({ onSignedIn }: { readonly onSignedIn: (session: AdminSession) => void }) {
  const { auth, t } = useApp();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ModerationErrorCode | null>(null);

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await auth.sendCode(email);
    setBusy(false);
    setError(result.ok ? null : result.error);
    if (result.ok) setSentTo(result.value);
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    const result = await auth.verifyCode(sentTo, code);
    setBusy(false);
    if (result.ok) onSignedIn(result.value);
    else setError(result.error);
  };

  return (
    <main className="card narrow">
      <h1>{t('moderation.signIn.heading')}</h1>
      {sentTo === null ? (
        <form onSubmit={sendCode} noValidate>
          <label>
            {t('moderation.signIn.email')}
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>{t('moderation.signIn.sendCode')}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p>{t('moderation.signIn.codeSent', { email: sentTo })}</p>
          <label>
            {t('moderation.signIn.code')}
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>{t('moderation.signIn.verify')}</button>
          <button type="button" className="link" onClick={() => { setSentTo(null); setCode(''); setError(null); }}>
            {t('moderation.signIn.changeEmail')}
          </button>
        </form>
      )}
      <ErrorText code={error} />
    </main>
  );
}
