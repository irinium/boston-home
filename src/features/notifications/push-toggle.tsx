import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { Toggle } from '@/components/choices';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';

import { pushLocale } from './domain';
import { pushService } from './push-service';
import type { PushService } from './service';

type Notice = 'denied' | 'unavailable' | 'error' | null;

/** The account screen's switch for push notifications. Hidden where push does not work. */
export function PushToggle({ service = pushService }: { service?: PushService }) {
  const { t, i18n } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const supported = service.supported();

  useEffect(() => {
    if (!supported) return;
    let active = true;
    service
      .isEnabled()
      .then((value) => active && setEnabled(value))
      .catch(() => active && setNotice('error'));
    return () => {
      active = false;
    };
  }, [service, supported]);

  if (!supported) return null;

  const onChange = async (next: boolean) => {
    setEnabled(next);
    setNotice(null);
    try {
      const result = await service.setEnabled(next, {
        locale: pushLocale(i18n.language),
        channelName: t('notifications.channel'),
      });
      if (result === 'denied' || result === 'unavailable') setNotice(result);
    } catch {
      setEnabled(!next);
      setNotice('error');
    }
  };

  return (
    <Card>
      <Toggle label={t('notifications.toggle')} value={enabled ?? false} onChange={onChange} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('notifications.why')}
      </ThemedText>
      {notice && (
        <ThemedText type="small" themeColor={notice === 'error' ? 'danger' : 'textSecondary'}>
          {t(`notifications.${notice}`)}
        </ThemedText>
      )}
      {notice === 'denied' && (
        <Button label={t('notifications.openSettings')} variant="secondary" onPress={() => Linking.openSettings()} />
      )}
    </Card>
  );
}
