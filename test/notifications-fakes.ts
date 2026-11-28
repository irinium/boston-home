// Test doubles for the notifications ports.
import type { PermissionState, PushPlatform } from '@/features/notifications/domain';
import type { PushBackend, PushDevice } from '@/features/notifications/ports';
import { createPushService } from '@/features/notifications/service';

export function fakeDevice(over: { platform?: PushPlatform | null; permission?: PermissionState; grants?: boolean; token?: string | null } = {}) {
  let tapListener: ((data: unknown) => void) | null = null;
  const device = {
    platform: jest.fn(() => (over.platform === undefined ? 'ios' : over.platform)),
    prepare: jest.fn(async () => {}),
    permission: jest.fn(async () => over.permission ?? { granted: true, canAskAgain: true }),
    requestPermission: jest.fn(async () => over.grants ?? true),
    token: jest.fn(async () => (over.token === undefined ? 'ExponentPushToken[abc]' : over.token)),
    onOpen: jest.fn((listener: (data: unknown) => void) => {
      tapListener = listener;
      return () => {
        tapListener = null;
      };
    }),
  } satisfies PushDevice;
  return { device, tap: (data: unknown) => tapListener?.(data), listening: () => tapListener !== null };
}

/** A backend that remembers the switch, like the database does. */
export function fakeBackend(initiallyEnabled = true) {
  let enabled = initiallyEnabled;
  return {
    register: jest.fn(async () => {}),
    unregister: jest.fn(async () => {}),
    isEnabled: jest.fn(async () => enabled),
    setEnabled: jest.fn(async (next: boolean) => {
      enabled = next;
    }),
  } satisfies PushBackend;
}

export function fakeService(device = fakeDevice().device, backend = fakeBackend()) {
  return createPushService({ device, backend });
}
