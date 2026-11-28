import { en } from './en';
import { uk } from './uk';

/** Every key in one language must exist in the other, so no screen shows a raw key. */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

it('Ukrainian and English have the same keys', () => {
  expect(keys(uk).sort()).toEqual(keys(en).sort());
});

it('picks the device language when supported, English otherwise', () => {
  for (const [device, expected] of [
    ['uk', 'uk'],
    ['de', 'en'],
    [undefined, 'en'],
  ] as const) {
    jest.isolateModules(() => {
      jest.doMock('expo-localization', () => ({ getLocales: () => (device ? [{ languageCode: device }] : []) }));
      const i18n = require('./index').default;
      expect(i18n.language).toBe(expected);
    });
  }
});
