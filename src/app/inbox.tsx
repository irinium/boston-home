import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { myRequests, respondToRequest } from '@/lib/api';
import type { ConnectionRequest } from '@/lib/types';
import { useAuth } from '@/providers/auth';

export default function InboxScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [items, setItems] = useState<ConnectionRequest[]>([]);

  const load = useCallback(() => {
    myRequests().then(setItems).catch(() => setItems([]));
  }, []);
  useFocusEffect(load);

  const shown = items.filter((r) => (tab === 'incoming' ? r.owner_id === me : r.requester_id === me));

  const respond = async (id: string, accept: boolean) => {
    await respondToRequest(id, accept);
    load();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Chip label={t('inbox.incoming')} selected={tab === 'incoming'} onPress={() => setTab('incoming')} />
        <Chip label={t('inbox.outgoing')} selected={tab === 'outgoing'} onPress={() => setTab('outgoing')} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ gap: Spacing.three }}
        ListEmptyComponent={<ThemedText themeColor="textSecondary">{t('inbox.empty')}</ThemedText>}
        renderItem={({ item }) => (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {t(`inbox.status.${item.status}`)} · {new Date(item.created_at).toLocaleDateString()}
            </ThemedText>
            {item.message.length > 0 && <ThemedText>{item.message}</ThemedText>}
            {tab === 'incoming' && item.status === 'pending' && (
              <View style={{ gap: Spacing.two }}>
                <Button label={t('inbox.accept')} onPress={() => respond(item.id, true)} />
                <Button label={t('inbox.decline')} variant="secondary" onPress={() => respond(item.id, false)} />
              </View>
            )}
            <Button
              label={t('listing.report')}
              variant="danger"
              onPress={() =>
                router.push({
                  pathname: '/report',
                  params: { reportedId: tab === 'incoming' ? item.requester_id : item.owner_id, requestId: item.id },
                })
              }
            />
          </Card>
        )}
      />
    </Screen>
  );
}
