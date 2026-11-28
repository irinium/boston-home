import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { creditsApi } from '@/features/credits/api';
import { errorKey, type PurchaseOutcome } from '@/features/credits/domain/purchase';
import { createExpoIapStore } from '@/features/credits/expo-iap-store';
import { type CreditsDeps, useCreditPurchases } from '@/features/credits/use-credit-purchases';
import { useAuth } from '@/providers/auth';

export default function CreditsScreen() {
  const { t } = useTranslation();
  const { session, account, refreshAccount } = useAuth();
  const [deps] = useState<CreditsDeps>(() => ({ billing: createExpoIapStore(), api: creditsApi, platform: Platform.OS }));
  const { status, offers, busy, outcome, buy } = useCreditPurchases(deps, session!.user.id, refreshAccount);

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        <Card>
          <ThemedText type="subtitle">{t('credits.balance', { n: account?.credits ?? 0 })}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('credits.why')}
          </ThemedText>
        </Card>

        {status === 'loading' && <ActivityIndicator />}
        {status === 'unavailable' && <ThemedText themeColor="textSecondary">{t('credits.unavailable')}</ThemedText>}
        {status === 'ready' &&
          offers.map((offer) => (
            <Card key={offer.id}>
              <View style={{ gap: Spacing.two }}>
                <ThemedText type="smallBold">{t('credits.pack', { n: offer.credits })}</ThemedText>
                <Button label={t('credits.buy', { price: offer.price })} onPress={() => buy(offer)} disabled={busy} />
              </View>
            </Card>
          ))}

        {busy && <ActivityIndicator accessibilityLabel={t('credits.processing')} />}
        {outcome && <OutcomeText outcome={outcome} />}

        <ThemedText type="small" themeColor="textSecondary">
          {t('credits.refundNote')}
        </ThemedText>
      </ScrollView>
    </Screen>
  );
}

function OutcomeText({ outcome }: { outcome: PurchaseOutcome }) {
  const { t } = useTranslation();
  switch (outcome.kind) {
    case 'granted':
      return <ThemedText>{t('credits.granted', { n: outcome.credits })}</ThemedText>;
    case 'pending':
      return <ThemedText themeColor="textSecondary">{t('credits.pending')}</ThemedText>;
    case 'failed':
      return <ThemedText themeColor="danger">{t(`credits.errors.${errorKey(outcome.code)}`)}</ThemedText>;
  }
}
