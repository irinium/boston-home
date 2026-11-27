// Shared test setup: environment, i18n in English, and a light expo-router mock.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('expo-router', () => require('./expo-router-mock'));

beforeAll(async () => {
  const i18n = require('@/i18n').default;
  await i18n.changeLanguage('en');
});
