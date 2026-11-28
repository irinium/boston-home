// Use cases behind the credit purchase Edge Functions (`purchase-verify`, `store-notifications`).
// They depend only on the ports below, so the Deno entry points stay thin and this logic is
// covered by Jest. The store adapters live in `billing-http.ts`.
//
// Trust model: a receipt sent by the app is only a reference. Credits are granted after the
// store's own server API confirms the transaction. Store notifications are handled the same
// way for the App Store (the transaction is fetched again from Apple), and for Google Play
// only after the Pub/Sub push has been authenticated by the entry point.

export type Store = 'app_store' | 'play';
export const STORES: readonly Store[] = ['app_store', 'play'];

export type PurchaseState = 'purchased' | 'pending' | 'cancelled' | 'revoked';

/** A transaction as the store's server reports it. */
export type StoreTransaction = {
  store: Store;
  /** The idempotency key: App Store transactionId or Play purchaseToken. */
  purchaseId: string;
  productId: string;
  /** appAccountToken (App Store) or obfuscatedExternalAccountId (Play), set by the app to the user id. */
  accountId: string | null;
  state: PurchaseState;
  environment: 'sandbox' | 'production';
  purchasedAt: Date;
};

export interface StoreGateway {
  /**
   * Looks the transaction up on the store's server; null when the store does not know it.
   * Play needs the product id; the App Store finds a transaction by its id alone.
   */
  lookup(token: string, productId?: string): Promise<StoreTransaction | null>;
  /** Marks a consumable as used up, so it can be bought again (Play). Best effort. */
  consume(transaction: StoreTransaction): Promise<void>;
}

export type GrantResult = { credits: number; balance: number; duplicate: boolean };
export type RevokeResult = { status: 'revoked' | 'already_revoked' | 'not_found'; credits: number };
export type DbError = { message: string };

export interface CreditLedger {
  /** `grant_purchase`: idempotent on (store, purchaseId). */
  grant(userId: string, transaction: StoreTransaction): Promise<{ data: GrantResult | null; error: DbError | null }>;
  /** `revoke_purchase`: idempotent. */
  revoke(store: Store, purchaseId: string): Promise<{ data: RevokeResult | null; error: DbError | null }>;
}

export type Log = (message: string, detail?: unknown) => void;
export type Reply = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string): Reply => ({ status, body: { error } });

// ---------------------------------------------------------------------------- verify

export type VerifyPorts = {
  stores: Record<Store, StoreGateway>;
  ledger: CreditLedger;
  log: Log;
};

export type VerifyRequest = { store: Store; productId: string; token: string };

const PRODUCT_ID = /^[a-z0-9_.]{1,100}$/;

/** Validates the JSON body sent by the app: `{ store, product_id, token }`. */
export function parseVerifyRequest(body: unknown): VerifyRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { store, product_id: productId, token } = body as Record<string, unknown>;
  if (!STORES.includes(store as Store)) return null;
  if (typeof productId !== 'string' || !PRODUCT_ID.test(productId)) return null;
  if (typeof token !== 'string' || token.length === 0 || token.length > 512) return null;
  return { store: store as Store, productId, token };
}

/** Database errors that are the client's fault, with their HTTP status. */
const GRANT_ERRORS: Record<string, number> = {
  purchase_owned_by_other: 409,
  purchase_revoked: 409,
  unknown_product: 400,
  user_not_found: 404,
};

const grantErrorCode = (message: string) => Object.keys(GRANT_ERRORS).find((code) => message.includes(code));

/** Verifies one purchase with its store and grants its credits to `userId`, exactly once. */
export async function verifyPurchase(ports: VerifyPorts, userId: string, body: unknown): Promise<Reply> {
  const request = parseVerifyRequest(body);
  if (!request) return fail(400, 'bad_request');
  const gateway = ports.stores[request.store];

  let transaction: StoreTransaction | null;
  try {
    transaction = await gateway.lookup(request.token, request.productId);
  } catch (error) {
    ports.log('store lookup failed', { store: request.store, error: String(error) });
    return fail(502, 'store_unavailable');
  }
  if (!transaction || transaction.productId !== request.productId) return fail(400, 'invalid_receipt');
  if (transaction.accountId !== null && transaction.accountId !== userId) return fail(403, 'account_mismatch');
  switch (transaction.state) {
    case 'pending':
      return fail(202, 'pending');
    case 'cancelled':
    case 'revoked':
      return fail(409, 'purchase_revoked');
  }

  const { data, error } = await ports.ledger.grant(userId, transaction);
  if (error || !data) {
    const code = error && grantErrorCode(error.message);
    if (code) return fail(GRANT_ERRORS[code], code);
    ports.log('grant_purchase failed', error?.message);
    return fail(500, 'failed');
  }

  // The app also finishes the transaction; doing it here as well covers an app that is killed
  // in between, before Play would refund the unconsumed purchase after three days.
  await gateway.consume(transaction).catch((e) => ports.log('consume failed', String(e)));
  return { status: 200, body: { credits: data.credits, balance: data.balance, duplicate: data.duplicate } };
}

// ---------------------------------------------------------------------------- notifications

/** Reads the payload of a JWS without checking its signature. Only for data that is checked again. */
export function decodeJwsPayload(jws: unknown): Record<string, any> | null {
  if (typeof jws !== 'string') return null;
  const parts = jws.split('.');
  if (parts.length !== 3) return null;
  try {
    const value = JSON.parse(base64UrlDecode(parts[1]));
    return typeof value === 'object' && value !== null ? value : null;
  } catch {
    return null;
  }
}

export function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** App Store Server Notifications v2 that take credits back. */
const APPLE_REVOCATIONS = new Set(['REFUND', 'REVOKE']);

export type NotificationPorts = { ledger: CreditLedger; log: Log };

export type AppStoreNotificationPorts = NotificationPorts & { appStore: StoreGateway; bundleId: string };

/**
 * Handles `{ signedPayload }` from Apple. The payload is not trusted: it only names the
 * transaction, which is then fetched from the App Store Server API and revoked only if Apple
 * reports it revoked. Answers 200 for everything Apple should not retry.
 */
export async function handleAppStoreNotification(ports: AppStoreNotificationPorts, body: unknown): Promise<Reply> {
  const payload = decodeJwsPayload((body as { signedPayload?: unknown } | null)?.signedPayload);
  if (!payload) return fail(400, 'bad_request');
  const type = String(payload.notificationType ?? '');
  if (!APPLE_REVOCATIONS.has(type)) return { status: 200, body: { ignored: type } };
  if (payload.data?.bundleId !== ports.bundleId) return fail(400, 'wrong_app');

  const transactionId = decodeJwsPayload(payload.data?.signedTransactionInfo)?.transactionId;
  if (typeof transactionId !== 'string' || transactionId.length === 0) return fail(400, 'bad_request');

  let transaction: StoreTransaction | null;
  try {
    transaction = await ports.appStore.lookup(transactionId);
  } catch (error) {
    ports.log('app store lookup failed', String(error));
    return fail(502, 'store_unavailable'); // Apple retries
  }
  if (!transaction || transaction.state !== 'revoked') return { status: 200, body: { ignored: 'not_revoked' } };
  return revoke(ports, 'app_store', transaction.purchaseId);
}

/** Google Play RTDN voided purchase types: 1 = in-app product (2 is a subscription). */
const PLAY_ONE_TIME_PRODUCT = 1;

/**
 * Handles a Pub/Sub push with a Play Real-time Developer Notification. The caller must have
 * authenticated the push (Google-signed OIDC token) before calling this.
 */
export async function handlePlayNotification(
  ports: NotificationPorts & { packageName: string },
  body: unknown,
): Promise<Reply> {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data;
  let rtdn: Record<string, any>;
  try {
    rtdn = JSON.parse(base64UrlDecode(String(data)));
  } catch {
    return fail(400, 'bad_request');
  }
  if (typeof rtdn !== 'object' || rtdn === null) return fail(400, 'bad_request');
  if (rtdn.packageName !== ports.packageName) return fail(400, 'wrong_app');

  const voided = rtdn.voidedPurchaseNotification;
  if (!voided) return { status: 200, body: { ignored: rtdn.testNotification ? 'test' : 'other' } };
  if (voided.productType !== PLAY_ONE_TIME_PRODUCT) return { status: 200, body: { ignored: 'subscription' } };
  if (typeof voided.purchaseToken !== 'string' || voided.purchaseToken.length === 0) return fail(400, 'bad_request');
  return revoke(ports, 'play', voided.purchaseToken);
}

async function revoke(ports: NotificationPorts, store: Store, purchaseId: string): Promise<Reply> {
  const { data, error } = await ports.ledger.revoke(store, purchaseId);
  if (error || !data) {
    ports.log('revoke_purchase failed', error?.message);
    return fail(500, 'failed'); // the store retries
  }
  if (data.status === 'not_found') ports.log('refund for an unknown purchase', { store });
  return { status: 200, body: { status: data.status, credits: data.credits } };
}

// ---------------------------------------------------------------------------- store payloads

/** Maps a decoded App Store `JWSTransactionDecodedPayload` to a transaction. */
export function fromAppStoreTransaction(t: Record<string, any>, bundleId: string): StoreTransaction | null {
  if (t.bundleId !== bundleId || typeof t.transactionId !== 'string' || typeof t.productId !== 'string') return null;
  if (t.type !== 'Consumable') return null;
  return {
    store: 'app_store',
    purchaseId: t.transactionId,
    productId: t.productId,
    accountId: typeof t.appAccountToken === 'string' ? t.appAccountToken.toLowerCase() : null,
    state: t.revocationDate ? 'revoked' : 'purchased',
    environment: t.environment === 'Production' ? 'production' : 'sandbox',
    purchasedAt: new Date(Number(t.purchaseDate)),
  };
}

const PLAY_STATES: Record<number, PurchaseState> = { 0: 'purchased', 1: 'cancelled', 2: 'pending' };

/** Maps a Play Developer API `ProductPurchase` to a transaction. */
export function fromPlayPurchase(p: Record<string, any>, token: string, productId: string): StoreTransaction {
  return {
    store: 'play',
    purchaseId: token,
    productId,
    accountId: typeof p.obfuscatedExternalAccountId === 'string' ? p.obfuscatedExternalAccountId : null,
    state: PLAY_STATES[p.purchaseState as number] ?? 'cancelled',
    // purchaseType 0 is a license tester; it is absent for real purchases.
    environment: p.purchaseType === 0 ? 'sandbox' : 'production',
    purchasedAt: new Date(Number(p.purchaseTimeMillis)),
  };
}
