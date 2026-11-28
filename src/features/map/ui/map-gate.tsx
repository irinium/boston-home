import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { MapAccess } from '@/features/map/domain/access';

/** Shown instead of the map to guests and to accounts that are not trusted yet. */
export function MapGate({ access }: { access: Exclude<MapAccess, 'allowed'> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const signedOut = access === 'signed_out';
  return (
    <Screen>
      <Card>
        <View style={{ gap: Spacing.three }}>
          <ThemedText>{t(signedOut ? 'map.guestPrompt' : 'map.notTrustedPrompt')}</ThemedText>
          <Button
            label={signedOut ? t('common.signIn') : t('map.openAccount')}
            onPress={() => router.push(signedOut ? '/sign-in' : '/account')}
          />
        </View>
      </Card>
    </Screen>
  );
}
