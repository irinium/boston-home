import { dailyApi, json } from './daily-http';

it('calls the Daily API with the key and a JSON body', async () => {
  const fetchMock = jest.fn(async () => new Response('{}'));
  global.fetch = fetchMock as unknown as typeof fetch;
  const daily = dailyApi('key-1');
  await daily('/rooms', { method: 'POST', body: { name: 'x' } });
  await daily('/rooms/x');
  expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.daily.co/v1/rooms', {
    method: 'POST',
    body: '{"name":"x"}',
    headers: { Authorization: 'Bearer key-1', 'Content-Type': 'application/json' },
  });
  expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.daily.co/v1/rooms/x', expect.objectContaining({ method: 'GET', body: undefined }));
});

it('builds JSON responses', async () => {
  const r = json({ a: 1 }, 418);
  expect(r.status).toBe(418);
  expect(await r.json()).toEqual({ a: 1 });
});
