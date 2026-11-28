import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AdminSession } from '../application/ports';
import { createTranslator, otherLanguage, type Language } from '../i18n/i18n';
import { AppContext, type AppContextValue, type Services } from './AppContext';
import { AuditLog } from './AuditLog';
import { ReportQueue } from './ReportQueue';
import { SignIn } from './SignIn';

type View = 'queue' | 'log';
type SessionState = { readonly status: 'restoring' } | { readonly status: 'ready'; readonly session: AdminSession | null };

interface Props {
  readonly services: Services;
  readonly initialLanguage: Language;
}

export function App({ services, initialLanguage }: Props) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [state, setState] = useState<SessionState>({ status: 'restoring' });
  const [view, setView] = useState<View>('queue');

  useEffect(() => {
    let active = true;
    void services.auth.restore().then((session) => {
      if (active) setState({ status: 'ready', session });
    });
    return () => {
      active = false;
    };
  }, [services.auth]);

  const toggleLanguage = useCallback(() => setLanguage(otherLanguage), []);
  const context = useMemo<AppContextValue>(() => {
    const dateFormat = new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return {
      ...services,
      language,
      toggleLanguage,
      t: createTranslator(language),
      formatDate: (date) => dateFormat.format(date),
    };
  }, [services, language, toggleLanguage]);

  const { t } = context;
  const signOut = async () => {
    await services.auth.signOut();
    setState({ status: 'ready', session: null });
  };

  return (
    <AppContext.Provider value={context}>
      <header className="topbar">
        <span className="brand">{t('moderation.title')}</span>
        {state.status === 'ready' && state.session ? (
          <nav>
            <button type="button" aria-pressed={view === 'queue'} onClick={() => setView('queue')}>{t('moderation.nav.queue')}</button>
            <button type="button" aria-pressed={view === 'log'} onClick={() => setView('log')}>{t('moderation.nav.log')}</button>
            <button type="button" className="link" onClick={() => void signOut()}>{t('moderation.signIn.signOut')}</button>
          </nav>
        ) : null}
        <button type="button" className="link" onClick={toggleLanguage}>{t('moderation.language')}</button>
      </header>
      {state.status === 'ready' ? (
        state.session ? (
          <main>{view === 'queue' ? <ReportQueue /> : <AuditLog />}</main>
        ) : (
          <SignIn onSignedIn={(session) => setState({ status: 'ready', session })} />
        )
      ) : null}
    </AppContext.Provider>
  );
}
