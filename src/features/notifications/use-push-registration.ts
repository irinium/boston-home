import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { pushLocale, routeFromPush } from './domain';
import { pushService } from './push-service';
import type { PushService } from './service';

/**
 * Registers this device for pushes once she is signed in (asking for the OS permission the
 * first time), and opens the right screen when she taps a push.
 */
export function usePushRegistration(userId: string | undefined, service: PushService = pushService) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = pushLocale(i18n.language);
  const channelName = t('notifications.channel');

  useEffect(() => {
    if (!userId) return;
    // Best effort: without push the app still works, and the next launch tries again.
    service.register({ locale, channelName, ask: true }).catch(() => {});
  }, [userId, locale, channelName, service]);

  useEffect(() => {
    if (!service.supported()) return;
    return service.onOpen((data) => {
      const route = routeFromPush(data);
      if (route) router.push(route);
    });
  }, [router, service]);
}
