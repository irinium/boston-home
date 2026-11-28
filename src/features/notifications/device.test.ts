import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ANDROID_CHANNEL, expoPushDevice } from './device';

// jest.mock calls are hoisted above the imports.
jest.mock('expo-device', () => ({ isDevice: true }));
const mockConstants: { expoConfig: object | null; easConfig: object | null } = {
  expoConfig: { extra: { eas: { projectId: 'proj-1' } } },
  easConfig: null,
};
// Getters, because the module under test is imported before this file's constants exist.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConstants.expoConfig;
    },
    get easConfig() {
      return mockConstants.easConfig;
    },
  },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[abc]' })),
  getLastNotificationResponse: jest.fn(() => null),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));


const N = Notifications as jest.Mocked<typeof Notifications>;
beforeEach(() => jest.clearAllMocks());
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
const original = Platform.OS;
afterEach(() => setOS(original));

it('shows a quiet banner for pushes that arrive while the app is open', async () => {
  await expoPushDevice.prepare('Requests');
  const handler = (N.setNotificationHandler as jest.Mock).mock.calls[0][0];
  await expect(handler.handleNotification()).resolves.toEqual({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
});

it('reports the platform on a real device', () => {
  setOS('android');
  expect(expoPushDevice.platform()).toBe('android');
  setOS('web');
  expect(expoPushDevice.platform()).toBeNull();
});

it('creates the Android channel only on Android', async () => {
  setOS('ios');
  await expoPushDevice.prepare('Requests');
  expect(N.setNotificationChannelAsync).not.toHaveBeenCalled();
  setOS('android');
  await expoPushDevice.prepare('Requests');
  expect(N.setNotificationChannelAsync).toHaveBeenCalledWith(ANDROID_CHANNEL, { name: 'Requests', importance: 3 });
});

it('reads and requests the permission, counting provisional iOS permission as granted', async () => {
  N.getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true, ios: { status: 3 } } as never);
  await expect(expoPushDevice.permission()).resolves.toEqual({ granted: true, canAskAgain: true });
  N.getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false } as never);
  await expect(expoPushDevice.permission()).resolves.toEqual({ granted: false, canAskAgain: false });
  N.requestPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true } as never);
  await expect(expoPushDevice.requestPermission()).resolves.toBe(true);
});

it('gets the Expo token for the EAS project', async () => {
  await expect(expoPushDevice.token()).resolves.toBe('ExponentPushToken[abc]');
  expect(N.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
});

it('passes on the payload of a cold-start tap and of live taps', () => {
  const remove = jest.fn();
  const payload = (data: unknown) => ({ notification: { request: { content: { data } } } });
  (N.getLastNotificationResponse as jest.Mock).mockReturnValueOnce(payload({ url: '/inbox' }));
  (N.addNotificationResponseReceivedListener as jest.Mock).mockReturnValueOnce({ remove });
  const listener = jest.fn();
  const unsubscribe = expoPushDevice.onOpen(listener);
  const live = (N.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0];
  live(payload({ url: '/x' }));
  expect(listener.mock.calls).toEqual([[{ url: '/inbox' }], [{ url: '/x' }]]);
  unsubscribe();
  expect(remove).toHaveBeenCalled();
});

it('falls back to the EAS build config, and has no token without a project id', async () => {
  mockConstants.expoConfig = {};
  mockConstants.easConfig = { projectId: 'proj-2' };
  await expoPushDevice.token();
  expect(N.getExpoPushTokenAsync).toHaveBeenLastCalledWith({ projectId: 'proj-2' });
  mockConstants.easConfig = null;
  await expect(expoPushDevice.token()).resolves.toBeNull();
});
