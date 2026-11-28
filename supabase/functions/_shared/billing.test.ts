import {
  base64UrlDecode,
  type CreditLedger,
  decodeJwsPayload,
  fromAppStoreTransaction,
  fromPlayPurchase,
  handleAppStoreNotification,
  handlePlayNotification,
  parseVerifyRequest,
  type StoreGateway,
  type StoreTransaction,
  verifyPurchase,
} from './billing';

const USER = '00000000-0000-4000-8000-00000000000a';
const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jws = (payload: unknown) => `${b64url({ alg: 'ES256' })}.${b64url(payload)}.sig`;

const tx = (over: Partial<StoreTransaction> = {}): StoreTransaction => ({
  store: 'app_store',
  purchaseId: '2000000123',
  productId: 'credits_5',
  accountId: USER,
  state: 'purchased',
  environment: 'sandbox',
  purchasedAt: new Date('2026-11-28T10:00:00Z'),
  ...over,
});

const gateway = (found: StoreTransaction | null | Error = tx()): jest.Mocked<StoreGateway> => ({
  lookup: jest.fn(async () => {
    if (found instanceof Error) throw found;
    return found;
  }),
  consume: jest.fn(async () => {}),
});

const ledger = (over: Partial<CreditLedger> = {}): jest.Mocked<CreditLedger> =>
  ({
    grant: jest.fn(async () => ({ data: { credits: 5, balance: 7, duplicate: false }, error: null })),
    revoke: jest.fn(async () => ({ data: { status: 'revoked', credits: 5 }, error: null })),
    ...over,
  }) as jest.Mocked<CreditLedger>;

function verifyPorts(store = gateway(), db = ledger()) {
  return { stores: { app_store: store, play: gateway(tx({ store: 'play' })) }, ledger: db, log: jest.fn() };
}

const body = { store: 'app_store', product_id: 'credits_5', token: '2000000123' };

describe('parseVerifyRequest', () => {
  it.each([
    [null],
    ['text'],
    [{ ...body, store: 'amazon' }],
    [{ ...body, product_id: 'Credits 5' }],
    [{ ...body, product_id: 5 }],
    [{ ...body, token: '' }],
    [{ ...body, token: 'x'.repeat(513) }],
  ])('rejects %p', (value) => {
    expect(parseVerifyRequest(value)).toBeNull();
  });

  it('accepts a well formed body', () => {
    expect(parseVerifyRequest(body)).toEqual({ store: 'app_store', productId: 'credits_5', token: '2000000123' });
  });
});

describe('verifyPurchase', () => {
  it('grants a verified purchase, consumes it and returns the balance', async () => {
    const ports = verifyPorts();
    const reply = await verifyPurchase(ports, USER, body);
    expect(reply).toEqual({ status: 200, body: { credits: 5, balance: 7, duplicate: false } });
    expect(ports.stores.app_store.lookup).toHaveBeenCalledWith('2000000123', 'credits_5');
    expect(ports.ledger.grant).toHaveBeenCalledWith(USER, tx());
    expect(ports.stores.app_store.consume).toHaveBeenCalledWith(tx());
  });

  it('uses the gateway of the store named in the request', async () => {
    const ports = verifyPorts();
    await verifyPurchase(ports, USER, { ...body, store: 'play', token: 'tok' });
    expect(ports.stores.play.lookup).toHaveBeenCalledWith('tok', 'credits_5');
    expect(ports.stores.app_store.lookup).not.toHaveBeenCalled();
  });

  it('still answers when consuming fails', async () => {
    const store = gateway();
    store.consume.mockRejectedValue(new Error('down'));
    const ports = verifyPorts(store);
    expect((await verifyPurchase(ports, USER, body)).status).toBe(200);
    expect(ports.log).toHaveBeenCalledWith('consume failed', 'Error: down');
  });

  it('rejects a malformed body', async () => {
    expect(await verifyPurchase(verifyPorts(), USER, {})).toEqual({ status: 400, body: { error: 'bad_request' } });
  });

  it('reports an unreachable store', async () => {
    const ports = verifyPorts(gateway(new Error('timeout')));
    expect(await verifyPurchase(ports, USER, body)).toEqual({ status: 502, body: { error: 'store_unavailable' } });
    expect(ports.log).toHaveBeenCalled();
  });

  it.each([
    ['an unknown transaction', null],
    ['a receipt for another product', tx({ productId: 'credits_40' })],
  ])('rejects %s', async (_, found) => {
    const ports = verifyPorts(gateway(found));
    expect(await verifyPurchase(ports, USER, body)).toEqual({ status: 400, body: { error: 'invalid_receipt' } });
    expect(ports.ledger.grant).not.toHaveBeenCalled();
  });

  it('rejects a purchase made by another account', async () => {
    const ports = verifyPorts(gateway(tx({ accountId: 'someone-else' })));
    expect(await verifyPurchase(ports, USER, body)).toEqual({ status: 403, body: { error: 'account_mismatch' } });
  });

  it('accepts a purchase without an account token', async () => {
    const ports = verifyPorts(gateway(tx({ accountId: null })));
    expect((await verifyPurchase(ports, USER, body)).status).toBe(200);
  });

  it('waits for a pending payment', async () => {
    const ports = verifyPorts(gateway(tx({ state: 'pending' })));
    expect(await verifyPurchase(ports, USER, body)).toEqual({ status: 202, body: { error: 'pending' } });
    expect(ports.ledger.grant).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'revoked'] as const)('refuses a %s purchase', async (state) => {
    const ports = verifyPorts(gateway(tx({ state })));
    expect(await verifyPurchase(ports, USER, body)).toEqual({ status: 409, body: { error: 'purchase_revoked' } });
  });

  it.each([
    ['purchase_owned_by_other', 409],
    ['purchase_revoked', 409],
    ['unknown_product', 400],
    ['user_not_found', 404],
  ])('maps the database error %s', async (code, status) => {
    const db = ledger({ grant: jest.fn(async () => ({ data: null, error: { message: code } })) });
    const ports = verifyPorts(gateway(), db);
    expect(await verifyPurchase(ports, USER, body)).toEqual({ status, body: { error: code } });
    expect(ports.stores.app_store.consume).not.toHaveBeenCalled();
  });

  it('hides unexpected database errors', async () => {
    const db = ledger({ grant: jest.fn(async () => ({ data: null, error: { message: 'deadlock' } })) });
    const ports = verifyPorts(gateway(), db);
    expect(await verifyPurchase(ports, USER, body)).toEqual({ status: 500, body: { error: 'failed' } });
    expect(ports.log).toHaveBeenCalledWith('grant_purchase failed', 'deadlock');
  });

  it('treats an empty database answer as a failure', async () => {
    const db = ledger({ grant: jest.fn(async () => ({ data: null, error: null })) });
    expect((await verifyPurchase(verifyPorts(gateway(), db), USER, body)).status).toBe(500);
  });
});

describe('decodeJwsPayload', () => {
  it('reads the payload of a compact JWS', () => {
    expect(decodeJwsPayload(jws({ a: 'ü' }))).toEqual({ a: 'ü' });
  });

  it.each([[undefined], ['a.b'], ['a.!!!.c'], [`x.${b64url(5)}.y`], [`x.${b64url(null)}.y`]])('returns null for %p', (value) => {
    expect(decodeJwsPayload(value)).toBeNull();
  });

  it('decodes unpadded base64url', () => {
    expect(base64UrlDecode(Buffer.from('ab?').toString('base64url'))).toBe('ab?');
  });
});

describe('handleAppStoreNotification', () => {
  const BUNDLE = 'app.bostonhome';
  const notification = (type: string, over: Record<string, unknown> = {}) => ({
    signedPayload: jws({
      notificationType: type,
      data: { bundleId: BUNDLE, signedTransactionInfo: jws({ transactionId: '2000000123' }), ...over },
    }),
  });
  const ports = (store = gateway(tx({ state: 'revoked' })), db = ledger()) => ({
    appStore: store,
    ledger: db,
    log: jest.fn(),
    bundleId: BUNDLE,
  });

  it.each(['REFUND', 'REVOKE'])('revokes the purchase on %s once Apple confirms it', async (type) => {
    const p = ports();
    expect(await handleAppStoreNotification(p, notification(type))).toEqual({
      status: 200,
      body: { status: 'revoked', credits: 5 },
    });
    expect(p.appStore.lookup).toHaveBeenCalledWith('2000000123');
    expect(p.ledger.revoke).toHaveBeenCalledWith('app_store', '2000000123');
  });

  it('ignores other notification types', async () => {
    const p = ports();
    expect(await handleAppStoreNotification(p, notification('CONSUMPTION_REQUEST'))).toEqual({
      status: 200,
      body: { ignored: 'CONSUMPTION_REQUEST' },
    });
    expect(p.appStore.lookup).not.toHaveBeenCalled();
  });

  it('does not revoke a transaction that Apple still reports as valid', async () => {
    const p = ports(gateway(tx()));
    expect((await handleAppStoreNotification(p, notification('REFUND'))).body).toEqual({ ignored: 'not_revoked' });
    expect(p.ledger.revoke).not.toHaveBeenCalled();
  });

  it('does not revoke a transaction Apple does not know', async () => {
    const p = ports(gateway(null));
    expect((await handleAppStoreNotification(p, notification('REFUND'))).body).toEqual({ ignored: 'not_revoked' });
  });

  it.each([
    ['no payload', {}],
    ['a broken payload', { signedPayload: 'nope' }],
    ['no transaction', notification('REFUND', { signedTransactionInfo: undefined })],
  ])('rejects %s', async (_, value) => {
    expect((await handleAppStoreNotification(ports(), value)).status).toBe(400);
  });

  it('rejects notifications for another app', async () => {
    expect(await handleAppStoreNotification(ports(), notification('REFUND', { bundleId: 'other' }))).toEqual({
      status: 400,
      body: { error: 'wrong_app' },
    });
  });

  it('asks Apple to retry when the lookup fails', async () => {
    expect((await handleAppStoreNotification(ports(gateway(new Error('x'))), notification('REFUND'))).status).toBe(502);
  });

  it('asks Apple to retry when the database fails', async () => {
    const db = ledger({ revoke: jest.fn(async () => ({ data: null, error: { message: 'down' } })) });
    expect((await handleAppStoreNotification(ports(undefined, db), notification('REFUND'))).status).toBe(500);
  });

  it('logs refunds of purchases it never granted', async () => {
    const db = ledger({ revoke: jest.fn(async () => ({ data: { status: 'not_found', credits: 0 }, error: null })) });
    const p = ports(undefined, db);
    expect((await handleAppStoreNotification(p, notification('REFUND'))).status).toBe(200);
    expect(p.log).toHaveBeenCalledWith('refund for an unknown purchase', { store: 'app_store' });
  });
});

describe('handlePlayNotification', () => {
  const PKG = 'app.bostonhome';
  const push = (rtdn: unknown) => ({ message: { data: Buffer.from(JSON.stringify(rtdn)).toString('base64') } });
  const voided = (over: Record<string, unknown> = {}) =>
    push({ packageName: PKG, voidedPurchaseNotification: { purchaseToken: 'tok-1', productType: 1, ...over } });
  const ports = (db = ledger()) => ({ ledger: db, log: jest.fn(), packageName: PKG });

  it('revokes a voided one-time purchase', async () => {
    const p = ports();
    expect(await handlePlayNotification(p, voided())).toEqual({ status: 200, body: { status: 'revoked', credits: 5 } });
    expect(p.ledger.revoke).toHaveBeenCalledWith('play', 'tok-1');
  });

  it('ignores voided subscriptions', async () => {
    expect((await handlePlayNotification(ports(), voided({ productType: 2 }))).body).toEqual({ ignored: 'subscription' });
  });

  it('acknowledges test and other notifications', async () => {
    expect((await handlePlayNotification(ports(), push({ packageName: PKG, testNotification: {} }))).body).toEqual({
      ignored: 'test',
    });
    expect((await handlePlayNotification(ports(), push({ packageName: PKG, oneTimeProductNotification: {} }))).body).toEqual({
      ignored: 'other',
    });
  });

  it.each([
    ['no message', {}],
    ['data that is not JSON', { message: { data: 'bm9wZQ' } }],
    ['JSON that is not an object', push(null)],
    ['a voided purchase without a token', voided({ purchaseToken: '' })],
  ])('rejects %s', async (_, value) => {
    expect((await handlePlayNotification(ports(), value)).status).toBe(400);
  });

  it('rejects notifications for another app', async () => {
    expect((await handlePlayNotification(ports(), push({ packageName: 'x' }))).body).toEqual({ error: 'wrong_app' });
  });
});

describe('store payloads', () => {
  const apple = {
    bundleId: 'app.bostonhome',
    transactionId: '2000000123',
    productId: 'credits_5',
    type: 'Consumable',
    appAccountToken: USER.toUpperCase(),
    environment: 'Production',
    purchaseDate: 1764324000000,
  };

  it('maps an App Store transaction', () => {
    expect(fromAppStoreTransaction(apple, 'app.bostonhome')).toEqual({
      store: 'app_store',
      purchaseId: '2000000123',
      productId: 'credits_5',
      accountId: USER,
      state: 'purchased',
      environment: 'production',
      purchasedAt: new Date(1764324000000),
    });
    expect(fromAppStoreTransaction({ ...apple, revocationDate: 1, environment: 'Sandbox', appAccountToken: undefined }, 'app.bostonhome'))
      .toMatchObject({ state: 'revoked', environment: 'sandbox', accountId: null });
  });

  it.each([
    ['another app', { bundleId: 'x' }],
    ['a subscription', { type: 'Auto-Renewable Subscription' }],
    ['no transaction id', { transactionId: 1 }],
    ['no product id', { productId: null }],
  ])('rejects an App Store transaction of %s', (_, over) => {
    expect(fromAppStoreTransaction({ ...apple, ...over }, 'app.bostonhome')).toBeNull();
  });

  it('maps a Play purchase', () => {
    const p = { purchaseState: 0, obfuscatedExternalAccountId: USER, purchaseTimeMillis: '1764324000000' };
    expect(fromPlayPurchase(p, 'tok', 'credits_5')).toEqual({
      store: 'play',
      purchaseId: 'tok',
      productId: 'credits_5',
      accountId: USER,
      state: 'purchased',
      environment: 'production',
      purchasedAt: new Date(1764324000000),
    });
    expect(fromPlayPurchase({ purchaseState: 2, purchaseType: 0 }, 't', 'c')).toMatchObject({
      state: 'pending',
      environment: 'sandbox',
      accountId: null,
    });
    expect(fromPlayPurchase({ purchaseState: 1 }, 't', 'c').state).toBe('cancelled');
    expect(fromPlayPurchase({ purchaseState: 9 }, 't', 'c').state).toBe('cancelled');
  });
});
