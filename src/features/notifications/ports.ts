// Ports of the notifications feature. The use cases in service.ts depend only on these, so they
// are tested with fakes; device.ts (Expo) and api.ts (Supabase) are the real adapters.
import type { PermissionState, PushLocale, PushPlatform } from './domain';

export interface PushDevice {
  /** The platform when push works on this device, otherwise null. */
  platform(): PushPlatform | null;
  /** Creates what the OS needs before asking (the Android channel). */
  prepare(channelName: string): Promise<void>;
  permission(): Promise<PermissionState>;
  requestPermission(): Promise<boolean>;
  /** The Expo push token, or null when the app has no EAS project id. */
  token(): Promise<string | null>;
  /** Calls `listener` with the payload of every push the user taps; returns an unsubscribe. */
  onOpen(listener: (data: unknown) => void): () => void;
}

export interface PushBackend {
  register(token: string, platform: PushPlatform, locale: PushLocale): Promise<void>;
  unregister(token: string): Promise<void>;
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}
