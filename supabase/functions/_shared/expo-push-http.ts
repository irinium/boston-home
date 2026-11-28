// The Expo push service adapter for Deno Edge Functions.
import type { PushApi, PushTicket } from './notify.ts';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Posts messages to the Expo push service. `accessToken` is needed only when "enhanced push
 * security" is switched on for the Expo project. Rejects when the request fails as a whole.
 */
export function expoPushApi(accessToken?: string): PushApi {
  return async (messages) => {
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
    if (!res.ok) throw new Error(`expo push http ${res.status}`);
    const body = (await res.json()) as { data?: PushTicket[] };
    if (!Array.isArray(body.data)) throw new Error('expo push: no tickets');
    return body.data;
  };
}
