import { permissionStep, pushLocale, pushPlatform, routeFromPush } from './domain';

it('allows push only on real iOS and Android devices', () => {
  expect(pushPlatform('ios', true)).toBe('ios');
  expect(pushPlatform('android', true)).toBe('android');
  expect(pushPlatform('ios', false)).toBeNull();
  expect(pushPlatform('web', true)).toBeNull();
});

it('picks Ukrainian or English for the push texts', () => {
  expect(pushLocale('uk')).toBe('uk');
  expect(pushLocale('uk-UA')).toBe('uk');
  expect(pushLocale('en')).toBe('en');
  expect(pushLocale('de')).toBe('en');
  expect(pushLocale(undefined)).toBe('en');
});

it('opens only known in-app paths from a push', () => {
  expect(routeFromPush({ url: '/inbox' })).toBe('/inbox');
  expect(routeFromPush({ url: 'https://evil.example' })).toBeNull();
  expect(routeFromPush({ url: 42 })).toBeNull();
  expect(routeFromPush({})).toBeNull();
  expect(routeFromPush(null)).toBeNull();
  expect(routeFromPush('/inbox')).toBeNull();
});

it('decides whether to use, ask for or give up on the permission', () => {
  expect(permissionStep({ granted: true, canAskAgain: false }, false)).toBe('granted');
  expect(permissionStep({ granted: false, canAskAgain: true }, true)).toBe('ask');
  expect(permissionStep({ granted: false, canAskAgain: true }, false)).toBe('denied');
  expect(permissionStep({ granted: false, canAskAgain: false }, true)).toBe('denied');
});
