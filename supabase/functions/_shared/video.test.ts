import { closeQueuedRooms, joinMeeting, type DailyApi, type JoinPorts } from './video';

const res = (status: number, body: unknown = {}) => ({ status, ok: status < 300, json: async () => body });
const ROW = { room_name: 'bh-1', starts_at: '2026-12-01T10:00:00Z', display_name: 'Anna' };
const NOW = new Date('2026-12-01T09:55:00Z');

/** A fake Daily API that answers by "METHOD path", in order for repeated calls. */
function fakeDaily(answers: Record<string, ReturnType<typeof res>[]>) {
  const calls: string[] = [];
  const daily: DailyApi = async (path, init = {}) => {
    const key = `${init.method ?? 'GET'} ${path}`;
    calls.push(key);
    const next = answers[key]?.shift();
    if (!next) throw new Error(`unexpected ${key}`);
    return next;
  };
  return { daily, calls };
}

function ports(daily: DailyApi, over: Partial<JoinPorts> = {}): JoinPorts {
  return {
    meetingForJoin: async () => ({ data: ROW, error: null }),
    daily,
    now: () => NOW,
    log: jest.fn(),
    ...over,
  };
}

describe('joinMeeting', () => {
  it('rejects a missing meeting id', async () => {
    const { daily } = fakeDaily({});
    await expect(joinMeeting(ports(daily), 'u', undefined)).resolves.toEqual({ status: 400, body: { error: 'bad_request' } });
  });

  it('reuses an existing room and issues a short token', async () => {
    const { daily, calls } = fakeDaily({
      'GET /rooms/bh-1': [res(200, { url: 'https://x.daily.co/bh-1' })],
      'POST /meeting-tokens': [res(200, { token: 'a b' })],
    });
    const reply = await joinMeeting(ports(daily), 'u', 'm1');
    expect(reply).toEqual({ status: 200, body: { url: 'https://x.daily.co/bh-1?t=a%20b' } });
    expect(calls).toEqual(['GET /rooms/bh-1', 'POST /meeting-tokens']);
  });

  it('creates the room on first join', async () => {
    const { daily, calls } = fakeDaily({
      'GET /rooms/bh-1': [res(404)],
      'POST /rooms': [res(200, { url: 'https://x.daily.co/bh-1' })],
      'POST /meeting-tokens': [res(200, { token: 't' })],
    });
    expect((await joinMeeting(ports(daily), 'u', 'm1')).status).toBe(200);
    expect(calls).toEqual(['GET /rooms/bh-1', 'POST /rooms', 'POST /meeting-tokens']);
  });

  it('reads the room again when the other participant created it first', async () => {
    const { daily } = fakeDaily({
      'GET /rooms/bh-1': [res(404), res(200, { url: 'https://x.daily.co/bh-1' })],
      'POST /rooms': [res(400, { info: 'already exists' })],
      'POST /meeting-tokens': [res(200, { token: 't' })],
    });
    expect((await joinMeeting(ports(daily), 'u', 'm1')).status).toBe(200);
  });

  it.each([
    ['room lookup fails', { 'GET /rooms/bh-1': [res(500)] }],
    ['room creation and the second lookup fail', { 'GET /rooms/bh-1': [res(404), res(404)], 'POST /rooms': [res(500)] }],
    ['the token fails', { 'GET /rooms/bh-1': [res(200, { url: 'u' })], 'POST /meeting-tokens': [res(500)] }],
    ['Daily is unreachable', {}],
  ])('answers 502 when %s', async (_, answers) => {
    const { daily } = fakeDaily(answers);
    const p = ports(daily);
    await expect(joinMeeting(p, 'u', 'm1')).resolves.toEqual({ status: 502, body: { error: 'video_unavailable' } });
    expect(p.log).toHaveBeenCalled();
  });

  it.each([
    ['meeting_not_found', 404],
    ['too_early', 403],
    ['meeting_over', 403],
    ['meeting_not_active', 403],
  ])('maps the known code %s to %i', async (code, status) => {
    const { daily } = fakeDaily({});
    const p = ports(daily, { meetingForJoin: async () => ({ data: null, error: { message: `P0001: ${code}` } }) });
    await expect(joinMeeting(p, 'u', 'm1')).resolves.toEqual({ status, body: { error: code } });
  });

  it('answers 500 and logs an unknown database error', async () => {
    const { daily } = fakeDaily({});
    const p = ports(daily, { meetingForJoin: async () => ({ data: null, error: { message: 'connection reset' } }) });
    await expect(joinMeeting(p, 'u', 'm1')).resolves.toEqual({ status: 500, body: { error: 'failed' } });
    expect(p.log).toHaveBeenCalledWith('meeting_for_join failed', 'connection reset');
  });

  it('answers 404 when the database returns no row', async () => {
    const { daily } = fakeDaily({});
    const p = ports(daily, { meetingForJoin: async () => ({ data: null, error: null }) });
    expect((await joinMeeting(p, 'u', 'm1')).status).toBe(404);
  });
});

describe('closeQueuedRooms', () => {
  it('deletes queued rooms, counts gone rooms as closed and keeps failures queued', async () => {
    const { daily } = fakeDaily({
      'DELETE /rooms/a': [res(200)],
      'DELETE /rooms/b': [res(404)],
      'DELETE /rooms/c': [res(500)],
    });
    const markClosed = jest.fn(async () => {});
    const log = jest.fn();
    const result = await closeQueuedRooms({ openClosures: async () => ['a', 'b', 'c', 'd'], markClosed, daily, log });
    expect(result).toEqual({ closed: 2, failed: 2 });
    expect(markClosed).toHaveBeenCalledWith(['a', 'b']);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the queue is empty', async () => {
    const markClosed = jest.fn(async () => {});
    const { daily } = fakeDaily({});
    await expect(closeQueuedRooms({ openClosures: async () => [], markClosed, daily, log: jest.fn() })).resolves.toEqual({
      closed: 0,
      failed: 0,
    });
    expect(markClosed).not.toHaveBeenCalled();
  });
});
