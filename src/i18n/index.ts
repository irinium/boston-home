import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';
import { uk } from './uk';

export const supportedLanguages = ['uk', 'en'] as const;

const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: { uk: { translation: uk }, en: { translation: en } },
  lng: (supportedLanguages as readonly string[]).includes(deviceLanguage) ? deviceLanguage : 'en',
  fallbackLng: 'en',
  // React already escapes text; nothing here is rendered as HTML.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
