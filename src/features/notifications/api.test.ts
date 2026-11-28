import { supabase } from '@/lib/supabase';

import { NotificationsError, supabasePushBackend } from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('registers a device through the database function', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await supabasePushBackend.register('ExponentPushToken[a]', 'ios', 'uk');
  expect(rpc).toHaveBeenCalledWith('register_push_token', { p_token: 'ExponentPushToken[a]', p_platform: 'ios', p_locale: 'uk' });
});

it('turns database errors into NotificationsError', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'invalid_push_token' } });
  await expect(supabasePushBackend.register('x', 'ios', 'en')).rejects.toEqual(new NotificationsError('invalid_push_token'));
});

it('removes a device by its token', async () => {
  const eq = jest.fn(async () => ({ error: null }));
  const del = jest.fn(() => ({ eq }));
  from.mockReturnValue({ delete: del });
  await supabasePushBackend.unregister('ExponentPushToken[a]');
  expect(from).toHaveBeenCalledWith('push_tokens');
  expect(eq).toHaveBeenCalledWith('token', 'ExponentPushToken[a]');
});

it('reads the switch, treating anything but false as on', async () => {
  rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: null });
  await expect(supabasePushBackend.isEnabled()).resolves.toBe(false);
  await expect(supabasePushBackend.isEnabled()).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith('my_push_enabled');
});

it('saves the switch', async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  await supabasePushBackend.setEnabled(true);
  expect(rpc).toHaveBeenCalledWith('set_push_enabled', { p_enabled: true });
});
