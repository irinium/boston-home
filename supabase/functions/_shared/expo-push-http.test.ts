import { EXPO_PUSH_URL, expoPushApi } from './expo-push-http';
import type { PushMessage } from './notify';

const MESSAGE: PushMessage = {
  to: 'ExponentPushToken[a]',
  title: 'Boston Home',
  body: 'You have a new request.',
  sound: 'default',
  priority: 'high',
  channelId: 'default',
  data: { url: '/inbox' },
};

const respond = (status: number, body: unknown) => {
  const fetchMock = jest.fn(async () => new Response(JSON.stringify(body), { status }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

it('posts the messages as JSON and returns the tickets', async () => {
  const fetchMock = respond(200, { data: [{ status: 'ok', id: 'r1' }] });
  await expect(expoPushApi()([MESSAGE])).resolves.toEqual([{ status: 'ok', id: 'r1' }]);
  expect(fetchMock).toHaveBeenCalledWith(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify([MESSAGE]),
  });
});

it('sends the access token when one is set', async () => {
  const fetchMock = respond(200, { data: [] });
  await expoPushApi('secret')([]);
  expect(fetchMock).toHaveBeenCalledWith(
    EXPO_PUSH_URL,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
  );
});

it('rejects on an HTTP error or an answer without tickets', async () => {
  respond(503, {});
  await expect(expoPushApi()([MESSAGE])).rejects.toThrow('expo push http 503');
  respond(200, { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS' }] });
  await expect(expoPushApi()([MESSAGE])).rejects.toThrow('expo push: no tickets');
});
