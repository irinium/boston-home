import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { report, type ReportReason } from '@/lib/api';
import { useAuth } from '@/providers/auth';

const REASONS: ReportReason[] = ['is_man', 'threat', 'harassment', 'stalking', 'fake', 'inappropriate', 'underage', 'scam', 'other'];

export default function ReportScreen() {
  const params = useLocalSearchParams<{ reportedId: string; listingId?: string; requestId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState(false);

  const onSubmit = async () => {
    if (!session || !reason) return;
    try {
      await report({
        me: session.user.id,
        reportedId: params.reportedId,
        reason,
        details,
        listingId: params.listingId,
        requestId: params.requestId,
      });
      router.dismissTo('/');
    } catch {
      setError(true);
    }
  };

  return (
    <Screen>
      <ThemedText>{t('report.intro')}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {REASONS.map((r) => (
          <Chip key={r} label={t(`report.reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      <Field label={t('report.details')} value={details} onChangeText={setDetails} maxLength={1000} multiline />
      <ThemedText type="small" themeColor="textSecondary">{t('report.emergency')}</ThemedText>
      <Button label={t('report.submit')} onPress={onSubmit} disabled={!reason} />
      {error && <ThemedText themeColor="danger">{t('common.error')}</ThemedText>}
    </Screen>
  );
}
