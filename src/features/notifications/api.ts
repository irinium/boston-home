// Supabase adapter for the notifications feature (see ports.ts).
import { supabase } from '@/lib/supabase';

import type { PushBackend } from './ports';

/** Error codes raised by the database functions, e.g. `invalid_push_token`. */
export class NotificationsError extends Error {}

function check(error: { message: string } | null): void {
  if (error) throw new NotificationsError(error.message);
}

export const supabasePushBackend: PushBackend = {
  async register(token, platform, locale) {
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: platform, p_locale: locale });
    check(error);
  },
  async unregister(token) {
    const { error } = await supabase.from('push_tokens').delete().eq('token', token);
    check(error);
  },
  async isEnabled() {
    const { data, error } = await supabase.rpc('my_push_enabled');
    check(error);
    return data !== false;
  },
  async setEnabled(enabled) {
    const { error } = await supabase.rpc('set_push_enabled', { p_enabled: enabled });
    check(error);
  },
};
