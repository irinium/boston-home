// Expo adapter for the notifications feature (see ports.ts).
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { pushPlatform } from './domain';
import type { PushDevice } from './ports';

/** Android channel id; must match ANDROID_CHANNEL in supabase/functions/_shared/notify.ts. */
export const ANDROID_CHANNEL = 'default';

const isGranted = (p: Notifications.NotificationPermissionsStatus) =>
  p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL;

function projectId(): string | null {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export const expoPushDevice: PushDevice = {
  platform: () => pushPlatform(Platform.OS, Device.isDevice),

  async prepare(channelName) {
    // A push that arrives while the app is open shows as a quiet banner.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    // Android 13+ shows the permission prompt only once a channel exists.
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: channelName,
      importance: AndroidImportance.DEFAULT,
    });
  },

  async permission() {
    const p = await Notifications.getPermissionsAsync();
    return { granted: isGranted(p), canAskAgain: p.canAskAgain };
  },

  async requestPermission() {
    return isGranted(await Notifications.requestPermissionsAsync());
  },

  async token() {
    const id = projectId();
    if (!id) return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  },

  onOpen(listener) {
    // A tap that launched the app from a cold start is delivered once, then live taps.
    const last = Notifications.getLastNotificationResponse();
    if (last) listener(last.notification.request.content.data);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      listener(response.notification.request.content.data),
    );
    return () => subscription.remove();
  },
};
