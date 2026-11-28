import { fakeBackend, fakeDevice } from '../../../test/notifications-fakes';
import { createPushService } from './service';

const OPTIONS = { locale: 'uk' as const, channelName: 'Requests', ask: true };

describe('register', () => {
  it('sends the token with platform and language', async () => {
    const { device } = fakeDevice({ platform: 'android' });
    const backend = fakeBackend();
    await expect(createPushService({ device, backend }).register(OPTIONS)).resolves.toBe('registered');
    expect(device.prepare).toHaveBeenCalledWith('Requests');
    expect(device.requestPermission).not.toHaveBeenCalled();
    expect(backend.register).toHaveBeenCalledWith('ExponentPushToken[abc]', 'android', 'uk');
  });

  it('does nothing where push does not work', async () => {
    const { device } = fakeDevice({ platform: null });
    const backend = fakeBackend();
    await expect(createPushService({ device, backend }).register(OPTIONS)).resolves.toBe('unsupported');
    expect(backend.isEnabled).not.toHaveBeenCalled();
  });

  it('does nothing when she switched push off', async () => {
    const { device } = fakeDevice();
    await expect(createPushService({ device, backend: fakeBackend(false) }).register(OPTIONS)).resolves.toBe('disabled');
    expect(device.permission).not.toHaveBeenCalled();
  });

  it('asks for the permission when allowed, and stops when refused', async () => {
    const { device } = fakeDevice({ permission: { granted: false, canAskAgain: true }, grants: false });
    const backend = fakeBackend();
    await expect(createPushService({ device, backend }).register(OPTIONS)).resolves.toBe('denied');
    expect(device.requestPermission).toHaveBeenCalled();
    expect(backend.register).not.toHaveBeenCalled();
  });

  it('registers after the permission is granted', async () => {
    const { device } = fakeDevice({ permission: { granted: false, canAskAgain: true }, grants: true });
    await expect(createPushService({ device, backend: fakeBackend() }).register(OPTIONS)).resolves.toBe('registered');
  });

  it('does not ask when asking is not allowed', async () => {
    const { device } = fakeDevice({ permission: { granted: false, canAskAgain: true } });
    await expect(createPushService({ device, backend: fakeBackend() }).register({ ...OPTIONS, ask: false })).resolves.toBe('denied');
    expect(device.requestPermission).not.toHaveBeenCalled();
  });

  it('reports a build without a push project', async () => {
    const { device } = fakeDevice({ token: null });
    const backend = fakeBackend();
    await expect(createPushService({ device, backend }).register(OPTIONS)).resolves.toBe('unavailable');
    expect(backend.register).not.toHaveBeenCalled();
  });
});

describe('forget', () => {
  it('removes this device from the account', async () => {
    const backend = fakeBackend();
    await createPushService({ device: fakeDevice().device, backend }).forget();
    expect(backend.unregister).toHaveBeenCalledWith('ExponentPushToken[abc]');
  });

  it('does nothing without permission, support or token', async () => {
    for (const over of [{ permission: { granted: false, canAskAgain: true } }, { platform: null }, { token: null }] as const) {
      const backend = fakeBackend();
      await createPushService({ device: fakeDevice(over).device, backend }).forget();
      expect(backend.unregister).not.toHaveBeenCalled();
    }
  });
});

describe('setEnabled', () => {
  it('saves the switch and registers when switched on', async () => {
    const backend = fakeBackend();
    const service = createPushService({ device: fakeDevice().device, backend });
    await expect(service.setEnabled(true, { locale: 'en', channelName: 'c' })).resolves.toBe('registered');
    expect(backend.setEnabled).toHaveBeenCalledWith(true);
    expect(backend.register).toHaveBeenCalled();
  });

  it('only saves the switch when switched off', async () => {
    const backend = fakeBackend();
    const service = createPushService({ device: fakeDevice().device, backend });
    await expect(service.setEnabled(false, { locale: 'en', channelName: 'c' })).resolves.toBe('disabled');
    expect(backend.setEnabled).toHaveBeenCalledWith(false);
    expect(backend.register).not.toHaveBeenCalled();
  });
});

it('exposes support, the saved switch and taps', async () => {
  const { device, tap } = fakeDevice();
  const service = createPushService({ device, backend: fakeBackend(false) });
  expect(service.supported()).toBe(true);
  await expect(service.isEnabled()).resolves.toBe(false);
  const listener = jest.fn();
  service.onOpen(listener);
  tap({ url: '/inbox' });
  expect(listener).toHaveBeenCalledWith({ url: '/inbox' });
});
