// The Daily REST adapter for Deno Edge Functions.
import type { DailyApi } from './video.ts';

const DAILY = 'https://api.daily.co/v1';

export function dailyApi(apiKey: string): DailyApi {
  return (path, init = {}) =>
    fetch(`${DAILY}${path}`, {
      method: init.method ?? 'GET',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
