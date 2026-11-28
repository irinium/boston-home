import { generateKeyPairSync, createVerify, verify as nodeVerify } from 'node:crypto';

import {
  appStoreGateway,
  base64UrlEncode,
  databaseLedger,
  googlePushAuth,
  pemToDer,
  playGateway,
  signJwt,
} from './billing-http';

const NOW = new Date('2026-11-28T12:00:00Z');
const now = () => NOW;
const T = Math.floor(NOW.getTime() / 1000);
const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const part = (jwt: string, i: number) => JSON.parse(Buffer.from(jwt.split('.')[i], 'base64url').toString());

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ecPem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsaPem = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const fetchMock = (...replies: Response[]) => {
  const fn = jest.fn(async (..._args: unknown[]) => replies.shift() ?? reply(500));
  return fn as unknown as typeof fetch & jest.Mock;
};

describe('JWT signing', () => {
  it('signs ES256 tokens in the JOSE form', async () => {
    const jwt = await signJwt('ES256', ecPem, { kid: 'K1' }, { iss: 'me' });
    expect(part(jwt, 0)).toEqual({ kid: 'K1', alg: 'ES256', typ: 'JWT' });
    expect(part(jwt, 1)).toEqual({ iss: 'me' });
    const [h, p, s] = jwt.split('.');
    const ok = nodeVerify('sha256', Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
    expect(ok).toBe(true);
  });

  it('signs RS256 tokens', async () => {
    const jwt = await signJwt('RS256', rsaPem, {}, { a: 1 });
    const [h, p, s] = jwt.split('.');
    expect(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(rsa.publicKey, Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('encodes base64url without padding and reads PEM blocks', () => {
    expect(base64UrlEncode('ab?>')).toBe('YWI_Pg');
    expect(base64UrlEncode(new Uint8Array([251, 255]))).toBe('-_8');
    expect(new Uint8Array(pemToDer('-----BEGIN X-----\nAQID\n-----END X-----'))).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('appStoreGateway', () => {
  const config = { issuerId: 'issuer', keyId: 'KEY', privateKeyPem: ecPem, bundleId: 'app.bostonhome' };
  const transaction = (over = {}) => ({
    signedTransactionInfo: `x.${b64url({
      bundleId: 'app.bostonhome',
      transactionId: '42',
      productId: 'credits_5',
      type: 'Consumable',
      environment: 'Sandbox',
      purchaseDate: 1,
      ...over,
    })}.y`,
  });

  it('looks a transaction up in production, then in the sandbox, with a signed token', async () => {
    const f = fetchMock(reply(404), reply(200, transaction()));
    const found = await appStoreGateway(config, f, now).lookup('42');
    expect(found).toMatchObject({ store: 'app_store', purchaseId: '42', environment: 'sandbox', state: 'purchased' });
    expect(f.mock.calls[0][0]).toBe('https://api.storekit.itunes.apple.com/inApps/v1/transactions/42');
    expect(f.mock.calls[1][0]).toBe('https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/42');
    const token = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const jwt = token.Authorization.replace('Bearer ', '');
    expect(part(jwt, 0)).toMatchObject({ alg: 'ES256', kid: 'KEY' });
    expect(part(jwt, 1)).toEqual({ iss: 'issuer', iat: T, exp: T + 1800, aud: 'appstoreconnect-v1', bid: 'app.bostonhome' });
  });

  it('reuses its token', async () => {
    const f = fetchMock(reply(200, transaction()), reply(200, transaction()));
    const gw = appStoreGateway(config, f, now);
    await gw.lookup('42');
    await gw.lookup('42');
    const auth = (i: number) => ((f.mock.calls[i][1] as RequestInit).headers as Record<string, string>).Authorization;
    expect(auth(0)).toBe(auth(1));
  });

  it('returns null for transactions Apple does not know, or ids that are not ids', async () => {
    const f = fetchMock(reply(404), reply(404));
    const gw = appStoreGateway(config, f, now);
    expect(await gw.lookup('42')).toBeNull();
    expect(await gw.lookup('../apps')).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('returns null for a transaction of another app', async () => {
    const gw = appStoreGateway(config, fetchMock(reply(200, transaction({ bundleId: 'x' }))), now);
    expect(await gw.lookup('42')).toBeNull();
  });

  it('throws on server errors so the caller can retry', async () => {
    await expect(appStoreGateway(config, fetchMock(reply(503)), now).lookup('42')).rejects.toThrow('app store 503');
  });

  it('has nothing to consume', async () => {
    const f = fetchMock();
    await appStoreGateway(config, f, now).consume({} as never);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('playGateway', () => {
  const config = { serviceAccount: { client_email: 'sa@x.iam', private_key: rsaPem }, packageName: 'app.bostonhome' };
  const URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.bostonhome/purchases/products/credits_5/tokens/t%2F1';
  const token = () => reply(200, { access_token: 'AT', expires_in: 3600 });

  it('signs in with the service account and reads the purchase', async () => {
    const f = fetchMock(token(), reply(200, { purchaseState: 0, purchaseTimeMillis: '5' }));
    const found = await playGateway(config, f, now).lookup('t/1', 'credits_5');
    expect(found).toMatchObject({ store: 'play', purchaseId: 't/1', productId: 'credits_5', state: 'purchased' });

    const [tokenUrl, tokenInit] = f.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(tokenInit.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(part(form.get('assertion')!, 1)).toEqual({
      iss: 'sa@x.iam',
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: T,
      exp: T + 3600,
    });
    expect(f.mock.calls[1]).toEqual([URL, { headers: { Authorization: 'Bearer AT' } }]);
  });

  it.each([400, 404, 410])('returns null when Play answers %i', async (status) => {
    expect(await playGateway(config, fetchMock(token(), reply(status)), now).lookup('t/1', 'credits_5')).toBeNull();
  });

  it('throws on server errors and failed sign-in', async () => {
    await expect(playGateway(config, fetchMock(token(), reply(500)), now).lookup('t', 'c')).rejects.toThrow('play 500');
    await expect(playGateway(config, fetchMock(reply(401)), now).lookup('t', 'c')).rejects.toThrow('google token 401');
  });

  it('consumes a purchase', async () => {
    const f = fetchMock(token(), reply(200), reply(400));
    const gw = playGateway(config, f, now);
    const t = { store: 'play', purchaseId: 't/1', productId: 'credits_5' } as never;
    await gw.consume(t);
    expect(f.mock.calls[1]).toEqual([`${URL}:consume`, { method: 'POST', headers: { Authorization: 'Bearer AT' } }]);
    await expect(gw.consume(t)).rejects.toThrow('play consume 400');
  });
});

describe('googlePushAuth', () => {
  const config = { audience: 'https://x.supabase.co/functions/v1/store-notifications/play', serviceAccountEmail: 'push@x.iam' };
  const jwk = { ...(rsa.publicKey.export({ format: 'jwk' }) as object), kid: 'G1', alg: 'RS256', use: 'sig' };
  const certs = () => reply(200, { keys: [jwk] });
  const claims = {
    iss: 'https://accounts.google.com',
    aud: config.audience,
    email: 'push@x.iam',
    email_verified: true,
    iat: T - 10,
    exp: T + 3000,
  };
  const bearer = async (over: Record<string, unknown> = {}, header: Record<string, unknown> = { kid: 'G1' }) =>
    `Bearer ${await signJwt('RS256', rsaPem, header, { ...claims, ...over })}`;

  it('accepts a Google-signed token for our audience and push account, and caches the keys', async () => {
    const f = fetchMock(certs());
    const auth = googlePushAuth(config, f, now);
    expect(await auth(await bearer())).toBe(true);
    expect(await auth(await bearer({ iss: 'accounts.google.com' }))).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['another audience', { aud: 'other' }],
    ['another service account', { email: 'evil@x.iam' }],
    ['an unverified email', { email_verified: false }],
    ['another issuer', { iss: 'https://evil.example' }],
    ['an expired token', { exp: T - 1 }],
    ['a token without expiry', { exp: undefined }],
    ['a token from the future', { iat: T + 3600 }],
  ])('rejects %s', async (_, over) => {
    expect(await googlePushAuth(config, fetchMock(certs()), now)(await bearer(over))).toBe(false);
  });

  it('rejects unknown keys, other algorithms, bad signatures and missing headers', async () => {
    const auth = googlePushAuth(config, fetchMock(certs()), now);
    expect(await auth(await bearer({}, { kid: 'other' }))).toBe(false);
    const forged = (await bearer()).replace(/\.[\w-]+$/, `.${base64UrlEncode('forged')}`);
    expect(await auth(forged)).toBe(false);
    const tampered = (await bearer()).split('.');
    tampered[1] = b64url({ ...claims, email: 'evil@x.iam' });
    expect(await auth(tampered.join('.'))).toBe(false);
    const hs = `Bearer ${b64url({ alg: 'HS256', kid: 'G1' })}.${b64url(claims)}.abc`;
    expect(await auth(hs)).toBe(false);
    expect(await auth(null)).toBe(false);
    expect(await auth('Basic abc')).toBe(false);
    expect(await auth('Bearer a.b.c')).toBe(false);
  });

  it('fails closed when the Google keys cannot be fetched', async () => {
    expect(await googlePushAuth(config, fetchMock(reply(500)), now)(await bearer())).toBe(false);
  });
});

describe('databaseLedger', () => {
  it('calls grant_purchase and revoke_purchase with the transaction', async () => {
    const rpc = jest.fn(async (fn: string) => ({ data: fn === 'grant_purchase' ? { credits: 5 } : null, error: null }));
    const ledger = databaseLedger(rpc);
    const purchasedAt = new Date('2026-11-28T10:00:00Z');
    const grant = await ledger.grant('u1', {
      store: 'play',
      purchaseId: 'tok',
      productId: 'credits_5',
      accountId: null,
      state: 'purchased',
      environment: 'production',
      purchasedAt,
    });
    expect(grant).toEqual({ data: { credits: 5 }, error: null });
    expect(rpc).toHaveBeenCalledWith('grant_purchase', {
      p_user: 'u1',
      p_store: 'play',
      p_purchase_id: 'tok',
      p_product_id: 'credits_5',
      p_environment: 'production',
      p_purchased_at: '2026-11-28T10:00:00.000Z',
    });
    expect(await ledger.revoke('app_store', '42')).toEqual({ data: null, error: null });
    expect(rpc).toHaveBeenLastCalledWith('revoke_purchase', { p_store: 'app_store', p_purchase_id: '42' });
  });
});
