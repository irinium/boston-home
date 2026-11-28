// Use cases for push notifications: register this device, forget it, switch push on or off.
import { permissionStep, type PushLocale } from './domain';
import type { PushBackend, PushDevice } from './ports';

export type RegisterResult = 'registered' | 'unsupported' | 'disabled' | 'denied' | 'unavailable';

export type RegisterOptions = { locale: PushLocale; channelName: string; ask: boolean };

export type PushService = ReturnType<typeof createPushService>;

export function createPushService({ device, backend }: { device: PushDevice; backend: PushBackend }) {
  const supported = () => device.platform() !== null;

  /** Sends this device's token to the server, asking for the OS permission when allowed. */
  async function register({ locale, channelName, ask }: RegisterOptions): Promise<RegisterResult> {
    const platform = device.platform();
    if (!platform) return 'unsupported';
    if (!(await backend.isEnabled())) return 'disabled';

    await device.prepare(channelName);
    const step = permissionStep(await device.permission(), ask);
    const granted = step === 'granted' || (step === 'ask' && (await device.requestPermission()));
    if (!granted) return 'denied';

    const token = await device.token();
    if (!token) return 'unavailable';
    await backend.register(token, platform, locale);
    return 'registered';
  }

  /** Removes this device from the account (before signing out), so pushes stop arriving here. */
  async function forget(): Promise<void> {
    if (!supported() || !(await device.permission()).granted) return;
    const token = await device.token();
    if (token) await backend.unregister(token);
  }

  /** Saves the switch; switching on also registers the device (and may ask for permission). */
  async function setEnabled(enabled: boolean, options: Omit<RegisterOptions, 'ask'>): Promise<RegisterResult> {
    await backend.setEnabled(enabled);
    return enabled ? register({ ...options, ask: true }) : 'disabled';
  }

  return {
    supported,
    register,
    forget,
    setEnabled,
    isEnabled: () => backend.isEnabled(),
    onOpen: (listener: (data: unknown) => void) => device.onOpen(listener),
  };
}
