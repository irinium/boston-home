import { act, render } from '@testing-library/react-native';

import { fakeBackend, fakeDevice, fakeService } from '../../../test/notifications-fakes';
import { mockRouter } from '../../../test/expo-router-mock';

import type { PushService } from './service';
import { usePushRegistration } from './use-push-registration';

jest.mock('./push-service', () => ({ pushService: {} }));

function Probe({ userId, service }: { userId?: string; service: PushService }) {
  usePushRegistration(userId, service);
  return null;
}

beforeEach(() => jest.clearAllMocks());

it('registers the device once she is signed in, in her language', async () => {
  const backend = fakeBackend();
  const service = fakeService(fakeDevice().device, backend);
  const view = await render(<Probe service={service} />);
  expect(backend.register).not.toHaveBeenCalled();
  await view.rerender(<Probe userId="u1" service={service} />);
  await act(async () => {});
  expect(backend.register).toHaveBeenCalledWith('ExponentPushToken[abc]', 'ios', 'en');
});

it('ignores registration failures', async () => {
  const backend = fakeBackend();
  backend.isEnabled.mockRejectedValueOnce(new Error('offline'));
  await render(<Probe userId="u1" service={fakeService(fakeDevice().device, backend)} />);
  await act(async () => {});
  expect(backend.register).not.toHaveBeenCalled();
});

it('opens the inbox when she taps a push, and ignores unknown links', async () => {
  const { device, tap, listening } = fakeDevice();
  const view = await render(<Probe service={fakeService(device)} />);
  tap({ url: 'https://evil.example' });
  expect(mockRouter.push).not.toHaveBeenCalled();
  tap({ url: '/inbox' });
  expect(mockRouter.push).toHaveBeenCalledWith('/inbox');
  await view.unmount();
  expect(listening()).toBe(false);
});

it('does not listen for taps where push does not work', async () => {
  const { device } = fakeDevice({ platform: null });
  await render(<Probe userId="u1" service={fakeService(device)} />);
  expect(device.onOpen).not.toHaveBeenCalled();
});
