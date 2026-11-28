import {
  chunk,
  deliveryOf,
  messageFor,
  NOTIFICATION_KINDS,
  PUSH_CHUNK,
  sendDuePushes,
  settle,
  toLocale,
  type ClaimedPush,
  type NotifyPorts,
  type PushApi,
} from './notify';

const row = (outbox_id: number, token: string, over: Partial<ClaimedPush> = {}): ClaimedPush => ({
  outbox_id,
  kind: 'request_received',
  token,
  locale: 'en',
  ...over,
});

function ports(push: PushApi, rows: ClaimedPush[]): NotifyPorts & { finish: jest.Mock; log: jest.Mock } {
  return {
    claim: jest.fn(async () => rows),
    finish: jest.fn(async () => {}),
    push,
    log: jest.fn(),
  };
}

describe('messageFor', () => {
  it('sends a generic text in the device language, with no names or ids', () => {
    expect(messageFor(row(7, 'ExponentPushToken[a]', { locale: 'uk' }))).toEqual({
      to: 'ExponentPushToken[a]',
      title: 'Boston Home',
      body: 'У вас новий запит.',
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      data: { url: '/inbox' },
    });
  });

  it('has a text for every kind in both languages', () => {
    for (const kind of NOTIFICATION_KINDS) {
      for (const locale of ['uk', 'en']) {
        const message = messageFor(row(1, 't', { kind, locale }));
        expect(message.body.length).toBeGreaterThan(5);
        expect(JSON.stringify(message)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      }
    }
  });

  it('falls back to English for unknown languages', () => {
    expect(toLocale('de')).toBe('en');
    expect(messageFor(row(1, 't', { locale: 'de', kind: 'meeting_starting' })).body).toBe('Your video meeting room is open.');
  });
});

describe('chunk', () => {
  it('splits into parts of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it('rejects a size below one', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});

describe('deliveryOf', () => {
  it('tells delivered, failed and dead devices apart', () => {
    expect(deliveryOf({ status: 'ok', id: 'x' })).toBe('ok');
    expect(deliveryOf({ status: 'error', details: { error: 'DeviceNotRegistered' } })).toBe('dead');
    expect(deliveryOf({ status: 'error', details: { error: 'MessageRateExceeded' } })).toBe('failed');
    expect(deliveryOf({ status: 'error', message: 'oops' })).toBe('failed');
    expect(deliveryOf(undefined)).toBe('failed');
  });
});

describe('settle', () => {
  it('counts a row as sent when one of her devices got it', () => {
    const rows = [row(1, 'a'), row(1, 'b'), row(2, 'c'), row(3, 'd'), row(3, 'e')];
    expect(settle(rows, ['failed', 'ok', 'failed', 'dead', 'dead'])).toEqual({
      sent: [1, 3],
      retry: [2],
      deadTokens: ['d', 'e'],
    });
  });

  it('treats a missing delivery as failed', () => {
    expect(settle([row(1, 'a')], [])).toEqual({ sent: [], retry: [1], deadTokens: [] });
  });

  it('retries a row with one dead and one failed device, and drops the dead one', () => {
    expect(settle([row(1, 'a'), row(1, 'b')], ['dead', 'failed'])).toEqual({ sent: [], retry: [1], deadTokens: ['a'] });
  });
});

describe('sendDuePushes', () => {
  it('does nothing when nothing is due', async () => {
    const push = jest.fn();
    const p = ports(push, []);
    await expect(sendDuePushes(p)).resolves.toEqual({ sent: 0, retry: 0, deadTokens: 0 });
    expect(push).not.toHaveBeenCalled();
    expect(p.finish).not.toHaveBeenCalled();
  });

  it('sends, then reports sent rows, retries and dead devices', async () => {
    const push: PushApi = jest.fn(async () => [
      { status: 'ok', id: '1' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'MessageRateExceeded' } },
    ]);
    const p = ports(push, [row(1, 'a'), row(2, 'b'), row(3, 'c')]);
    await expect(sendDuePushes(p, 10)).resolves.toEqual({ sent: 2, retry: 1, deadTokens: 1 });
    expect(p.claim).toHaveBeenCalledWith(10);
    expect(p.finish).toHaveBeenCalledWith({ sent: [1, 2], retry: [3], deadTokens: ['b'] });
  });

  it('sends in chunks of 100', async () => {
    const rows = Array.from({ length: PUSH_CHUNK + 1 }, (_, i) => row(i, `t${i}`));
    const push = jest.fn<ReturnType<PushApi>, Parameters<PushApi>>(async (messages) =>
      messages.map(() => ({ status: 'ok' as const, id: 'x' })),
    );
    const p = ports(push, rows);
    await expect(sendDuePushes(p, 500)).resolves.toMatchObject({ sent: PUSH_CHUNK + 1 });
    expect(push.mock.calls.map(([messages]) => messages.length)).toEqual([PUSH_CHUNK, 1]);
  });

  it('retries everything in a chunk when the request fails', async () => {
    const p = ports(jest.fn(async () => Promise.reject(new Error('offline'))), [row(1, 'a'), row(2, 'b')]);
    await expect(sendDuePushes(p)).resolves.toEqual({ sent: 0, retry: 2, deadTokens: 0 });
    expect(p.log).toHaveBeenCalledWith('push request failed', 'offline');
  });

  it('retries when the push service answers with the wrong number of tickets', async () => {
    const p = ports(jest.fn(async () => [{ status: 'ok' as const, id: '1' }]), [row(1, 'a'), row(2, 'b')]);
    await expect(sendDuePushes(p)).resolves.toEqual({ sent: 0, retry: 2, deadTokens: 0 });
    expect(p.log).toHaveBeenCalledWith('push service answered with an unexpected shape', { expected: 2 });
  });

  it('logs non-Error rejections as they are', async () => {
    const p = ports(jest.fn(async () => Promise.reject('boom')), [row(1, 'a')]);
    await sendDuePushes(p);
    expect(p.log).toHaveBeenCalledWith('push request failed', 'boom');
  });
});
