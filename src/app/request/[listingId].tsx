import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Button, Field, Screen } from '@/components/ui';
import { sendRequest } from '@/lib/api';
import { containsContactInfo } from '@/lib/contact-filter';
import { errorCode } from '@/lib/format';
import { useAuth } from '@/providers/auth';

const KNOWN_ERRORS = [
  'contact_info_not_allowed',
  'rate_limited',
  'insufficient_credits',
  'request_exists',
  'verification_required',
  'profile_incomplete',
  'listing_unavailable',
] as const;

export default function RequestScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshAccount } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const hasContact = containsContactInfo(message);

  const onSend = async () => {
    setSending(true);
    setStatus(null);
    try {
      await sendRequest(listingId, message);
      await refreshAccount();
      setStatus(t('request.sent'));
      setTimeout(() => router.back(), 1500);
    } catch (e) {
      const code = errorCode(e);
      setStatus(
        code && (KNOWN_ERRORS as readonly string[]).includes(code)
          ? t(`request.errors.${code as (typeof KNOWN_ERRORS)[number]}`)
          : t('common.error'),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <Field
        label={t('request.title')}
        placeholder={t('request.placeholder')}
        value={message}
        onChangeText={setMessage}
        maxLength={300}
        multiline
      />
      <ThemedText type="small" themeColor={hasContact ? 'danger' : 'textSecondary'}>
        {hasContact ? t('request.errors.contact_info_not_allowed') : t('request.contactWarning')}
      </ThemedText>
      <Button label={t('listing.sendRequest')} onPress={onSend} disabled={sending || hasContact} />
      {status && <ThemedText>{status}</ThemedText>}
    </Screen>
  );
}
