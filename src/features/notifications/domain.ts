// Pure rules for push notifications on the device. No React, no Expo modules.

export type PushPlatform = 'ios' | 'android';
export type PushLocale = 'uk' | 'en';

/** Push works on real iOS and Android devices only (not on the web or in most simulators). */
export function pushPlatform(os: string, isDevice: boolean): PushPlatform | null {
  if (!isDevice) return null;
  return os === 'ios' || os === 'android' ? os : null;
}

/** The language of the generic push texts: Ukrainian or English. */
export function pushLocale(language: string | undefined): PushLocale {
  return language?.toLowerCase().startsWith('uk') ? 'uk' : 'en';
}

/** In-app paths a push may open. Anything else in a payload is ignored. */
const ROUTES = ['/inbox'] as const;
export type PushRoute = (typeof ROUTES)[number];

export function routeFromPush(data: unknown): PushRoute | null {
  if (!data || typeof data !== 'object') return null;
  const url = (data as { url?: unknown }).url;
  return ROUTES.find((route) => route === url) ?? null;
}

export type PermissionState = { granted: boolean; canAskAgain: boolean };

/** What to do about the OS permission: use it, ask for it, or give up. */
export function permissionStep(state: PermissionState, mayAsk: boolean): 'granted' | 'ask' | 'denied' {
  if (state.granted) return 'granted';
  return mayAsk && state.canAskAgain ? 'ask' : 'denied';
}
