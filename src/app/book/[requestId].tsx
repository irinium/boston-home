import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { SingleChoice } from '@/components/choices';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { bookableStarts, bookMeeting } from '@/lib/api';
import { errorCode } from '@/lib/format';

const KNOWN_ERRORS = ['slot_taken', 'slot_unavailable', 'too_soon', 'meeting_exists', 'request_not_accepted'] as const;

export default function BookMeetingScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [starts, setStarts] = useState<Date[] | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    bookableStarts(requestId)
      .then((next) => active && setStarts(next))
      .catch(() => active && setStarts([]));
    return () => {
      active = false;
    };
  }, [requestId]);

  const book = async () => {
    if (!starts || choice === null) return;
    setBusy(true);
    setStatus(null);
    try {
      await bookMeeting(requestId, starts[Number(choice)]);
      setStatus(t('meetings.booked'));
      router.back();
    } catch (e) {
      const code = errorCode(e);
      setStatus(
        code && (KNOWN_ERRORS as readonly string[]).includes(code)
          ? t(`meetings.errors.${code as (typeof KNOWN_ERRORS)[number]}`)
          : t('common.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (starts === null) {
    return (
      <Screen>
        <ThemedText>{t('common.loading')}</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        {starts.length === 0 ? (
          <ThemedText themeColor="textSecondary">{t('meetings.noSlots')}</ThemedText>
        ) : (
          <>
            <SingleChoice
              label={t('meetings.pick')}
              options={starts.map((_, i) => String(i))}
              value={choice}
              onChange={setChoice}
              labelFor={(i) =>
                starts[Number(i)].toLocaleString(i18n.language, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }
            />
            <Button label={t('meetings.book')} onPress={book} disabled={busy || choice === null} />
          </>
        )}
        {status && <ThemedText>{status}</ThemedText>}
      </ScrollView>
    </Screen>
  );
}
