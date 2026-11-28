import { joinErrorCode, joinUrl, roomRequest, tokenRequest } from './daily';

const start = new Date('2026-12-01T10:00:00Z');
const startSec = start.getTime() / 1000;

it('creates a private two-person room that never ejects anyone', () => {
  const req = roomRequest('bh-abc', start);
  expect(req).toMatchObject({ name: 'bh-abc', privacy: 'private' });
  expect(req.properties).toMatchObject({
    exp: startSec + 24 * 3600,
    eject_at_room_exp: false,
    max_participants: 2,
    enable_chat: true,
    enable_recording: false,
  });
});

it('issues a personal token valid for 15 minutes after issue that never ejects from a running call', () => {
  const req = tokenRequest('bh-abc', start, '  Anna  ');
  // start doubles as the issue time here
  expect(req.properties).toMatchObject({
    room_name: 'bh-abc',
    exp: startSec + 15 * 60,
    eject_at_token_exp: false,
    is_owner: false,
    user_name: 'Anna',
  });
  expect(tokenRequest('bh-abc', start, '').properties.user_name).toBe('Boston Home');
  expect(tokenRequest('bh-abc', start, 'x'.repeat(60)).properties.user_name).toHaveLength(40);
});

it('builds the join link and maps database errors', () => {
  expect(joinUrl('https://x.daily.co/bh-abc', 'a b')).toBe('https://x.daily.co/bh-abc?t=a%20b');
  expect(joinErrorCode('ERROR: too_early')).toBe('too_early');
  expect(joinErrorCode('boom')).toBeNull();
});
