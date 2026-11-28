import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { cancelMeeting, displayNames, myMeetings, myRequests, respondToRequest } from '@/lib/api';
import type { ConnectionRequest, Meeting } from '@/lib/types';
import { useAuth } from '@/providers/auth';

export default function InboxScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [items, setItems] = useState<ConnectionRequest[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    myRequests().then(setItems).catch(() => setItems([]));
    myMeetings()
      .then(async (next) => {
        setMeetings(next);
        const others = next.map((m) => (m.owner_id === me ? m.requester_id : m.owner_id));
        setNames(await displayNames([...new Set(others)]));
      })
      .catch(() => setMeetings([]));
  }, [me]);
  useFocusEffect(load);

  const shown = items.filter((r) => (tab === 'incoming' ? r.owner_id === me : r.requester_id === me));
  const meetingFor = (requestId: string) => meetings.find((m) => m.request_id === requestId);
  const other = (m: Meeting) => (m.owner_id === me ? m.requester_id : m.owner_id);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  /** Runs an action, reloads, and tells the user when it failed. */
  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      Alert.alert(t('common.error'));
    }
    load();
  };

  const confirm = (message: string, label: string, action: () => Promise<void>) =>
    Alert.alert(message, '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: label, style: 'destructive', onPress: () => run(action) },
    ]);

  return (
    <Screen>
      {meetings.length > 0 && (
        <Card>
          <ThemedText type="smallBold">{t('meetings.upcoming')}</ThemedText>
          {meetings.map((m) => (
            <View key={m.id} style={{ gap: Spacing.two }}>
              <ThemedText>
                {[names[other(m)] || t('meetings.with'), when(m.starts_at)].join(' · ')}
              </ThemedText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
                <Button
                  label={t('meetings.cancel')}
                  variant="danger"
                  onPress={() => confirm(t('meetings.cancelConfirm'), t('meetings.cancel'), () => cancelMeeting(m.id))}
                />
                <Button
                  label={t('meetings.report')}
                  variant="danger"
                  onPress={() => router.push({ pathname: '/report', params: { reportedId: other(m), requestId: m.request_id } })}
                />
              </View>
            </View>
          ))}
        </Card>
      )}
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
              {t(`inbox.status.${item.status}`)} · {new Date(item.created_at).toLocaleDateString(i18n.language)}
            </ThemedText>
            {item.message.length > 0 && <ThemedText>{item.message}</ThemedText>}
            {tab === 'incoming' && item.status === 'pending' && (
              <View style={{ gap: Spacing.two }}>
                <Button label={t('inbox.accept')} onPress={() => run(() => respondToRequest(item.id, true))} />
                <Button
                  label={t('inbox.decline')}
                  variant="secondary"
                  onPress={() => confirm(t('inbox.declineConfirm'), t('inbox.decline'), () => respondToRequest(item.id, false))}
                />
              </View>
            )}
            {tab === 'incoming' && item.status === 'accepted' && !meetingFor(item.id) && (
              <Button label={t('availability.open')} variant="secondary" onPress={() => router.push('/availability')} />
            )}
            {tab === 'outgoing' && item.status === 'accepted' && !meetingFor(item.id) && (
              <Button
                label={t('meetings.choose')}
                onPress={() => router.push({ pathname: '/book/[requestId]', params: { requestId: item.id } })}
              />
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
