import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/providers/auth';

function RootStack() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const signedIn = session !== null;

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('showcase.title') }} />
      <Stack.Screen name="listing/[id]" options={{ title: '' }} />
      <Stack.Screen name="filters" options={{ title: t('filters.title'), presentation: 'modal' }} />

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: t('auth.title'), presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="request/[listingId]" options={{ title: t('request.title'), presentation: 'modal' }} />
        <Stack.Screen name="report" options={{ title: t('report.title'), presentation: 'modal' }} />
        <Stack.Screen name="inbox" options={{ title: t('inbox.title') }} />
        <Stack.Screen name="account" options={{ title: t('account.title') }} />
        <Stack.Screen name="editor" options={{ title: t('editor.title') }} />
        <Stack.Screen name="availability" options={{ title: t('availability.title') }} />
        <Stack.Screen name="credits" options={{ title: t('credits.title') }} />
        <Stack.Screen name="book/[requestId]" options={{ title: t('meetings.title'), presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const theme = {
    ...base,
    colors: { ...base.colors, primary: colors.accent, background: colors.background, card: colors.background, text: colors.text, border: colors.border },
  };

  return (
    <ThemeProvider value={theme}>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
