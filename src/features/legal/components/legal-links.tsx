import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** Links to the Privacy Policy and the Terms, for the sign-in and account screens. */
export function LegalLinks({ notice }: { notice?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={{ gap: Spacing.one }}>
      {notice && (
        <ThemedText type="small" themeColor="textSecondary">
          {notice}
        </ThemedText>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
        <ThemedText type="link" accessibilityRole="link" onPress={() => router.push('/legal/privacy')}>
          {t('legal.privacyTitle')}
        </ThemedText>
        <ThemedText type="link" accessibilityRole="link" onPress={() => router.push('/legal/terms')}>
          {t('legal.termsTitle')}
        </ThemedText>
      </View>
    </View>
  );
}
