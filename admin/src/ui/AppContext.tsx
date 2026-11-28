import { createContext, useContext } from 'react';

import type { AuthService } from '../application/authService';
import type { ModerationService } from '../application/moderationService';
import type { Language, Translate } from '../i18n/i18n';

export interface Services {
  readonly moderation: ModerationService;
  readonly auth: AuthService;
}

export interface AppContextValue extends Services {
  readonly t: Translate;
  readonly language: Language;
  readonly toggleLanguage: () => void;
  readonly formatDate: (date: Date) => string;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <App>');
  return value;
}
