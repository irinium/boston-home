import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ client: true })) }));
jest.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK: 0 }));

describe('supabase client', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  });

  it('is created with secure session storage', () => {
    jest.isolateModules(() => {
      const { supabase } = require('./supabase');
      expect(supabase).toEqual({ client: true });
    });
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: true, detectSessionInUrl: false }) }),
    );
    const options = (createClient as jest.Mock).mock.calls[0][2];
    expect(options.auth.storage).toBeDefined();
  });

  it('refuses to start without configuration', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    jest.isolateModules(() => {
      expect(() => require('./supabase')).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
    });
  });
});
