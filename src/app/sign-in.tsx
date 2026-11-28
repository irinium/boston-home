import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { useAuth } from '@/providers/auth';

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signInWithApple } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const onApple = async () => {
    setError(false);
    try {
      await signInWithApple();
      if (router.canGoBack()) router.back();
    } catch (e) {
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') setError(true);
    }
  };

  return (
    <Screen style={{ justifyContent: 'center' }}>
      <ThemedText type="subtitle">{t('appName')}</ThemedText>
      <ThemedText themeColor="textSecondary">{t('auth.why')}</ThemedText>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={24}
          style={{ width: '100%', height: 50 }}
          onPress={onApple}
        />
      ) : (
        <ThemedText themeColor="textSecondary">{t('auth.unavailable')}</ThemedText>
      )}
      {error && <ThemedText themeColor="danger">{t('common.error')}</ThemedText>}
    </Screen>
  );
}
