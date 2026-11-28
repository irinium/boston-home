import { mapAccess } from './access';

it('lets only trusted members see map points', () => {
  expect(mapAccess(false, null)).toBe('signed_out');
  expect(mapAccess(true, null)).toBe('not_trusted');
  expect(mapAccess(true, { trusted: false })).toBe('not_trusted');
  expect(mapAccess(true, { trusted: true })).toBe('allowed');
});
