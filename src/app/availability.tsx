import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View } from 'react-native';

import { SingleChoice } from '@/components/choices';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addSlot, availability, deleteSlot } from '@/lib/api';
import { errorCode } from '@/lib/format';
import { futureHours, nextDays, slotRange } from '@/lib/slots';
import type { AvailabilitySlot } from '@/lib/types';
import { useAuth } from '@/providers/auth';

const HOURS = ['8', '10', '12', '14', '16', '18', '20'] as const;
const LENGTHS = ['1', '2', '3', '4'] as const;

const dayLabel = (d: Date, locale: string) =>
  d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AvailabilityScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const me = session!.user.id;
  const [now] = useState(() => new Date());
  const [days] = useState(() => nextDays(now, 14));
  const [day, setDay] = useState<string | null>(null);
  const [hour, setHour] = useState<string | null>('18');
  const [length, setLength] = useState<string | null>('2');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hours = day === null ? HOURS : futureHours(days[Number(day)], HOURS, now);

  const load = useCallback(() => {
    availability(me).then(setSlots).catch(() => setSlots([]));
  }, [me]);
  useFocusEffect(load);

  const add = async () => {
    if (day === null || hour === null || length === null || !hours.includes(hour as (typeof HOURS)[number])) return;
    setError(null);
    try {
      const [start, end] = slotRange(days[Number(day)], Number(hour), Number(length));
      await addSlot(me, start, end);
      load();
    } catch (e) {
      setError(errorCode(e) === 'slot_overlaps' ? t('availability.overlaps') : t('common.error'));
    }
  };

  const remove = (id: string) =>
    Alert.alert(t('availability.removeConfirm'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('availability.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSlot(id);
          } catch {
            Alert.alert(t('common.error'));
          }
          load();
        },
      },
    ]);

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        <ThemedText themeColor="textSecondary">{t('availability.intro')}</ThemedText>
        <SingleChoice
          label={t('availability.day')}
          options={days.map((_, i) => String(i))}
          value={day}
          onChange={setDay}
          labelFor={(i) => dayLabel(days[Number(i)], i18n.language)}
        />
        <SingleChoice label={t('availability.from')} options={hours} value={hour} onChange={setHour} labelFor={(h) => `${h}:00`} />
        <SingleChoice
          label={t('availability.length')}
          options={LENGTHS}
          value={length}
          onChange={setLength}
          labelFor={(n) => t('availability.hours', { count: Number(n) })}
        />
        <Button label={t('availability.add')} onPress={add} disabled={day === null || hour === null || length === null} />
        {error && <ThemedText themeColor="danger">{error}</ThemedText>}

        {slots.length === 0 ? (
          <ThemedText themeColor="textSecondary">{t('availability.empty')}</ThemedText>
        ) : (
          slots.map((s) => (
            <Card key={s.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <ThemedText>
                  {timeLabel(s.starts_at, i18n.language)} – {new Date(s.ends_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                </ThemedText>
                <Button label={t('availability.remove')} variant="danger" onPress={() => remove(s.id)} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
