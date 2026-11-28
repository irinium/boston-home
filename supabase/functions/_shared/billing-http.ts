// Store adapters for the credit purchase Edge Functions: the App Store Server API, the Google
// Play Developer API, the authentication of Play's Pub/Sub pushes, and the database ledger.
// Only Web APIs (fetch, WebCrypto), so they run in Deno and in Jest alike.
import {
  base64UrlDecode,
  type CreditLedger,
  fromAppStoreTransaction,
  fromPlayPurchase,
  type GrantResult,
  type RevokeResult,
  type StoreGateway,
} from './billing.ts';

type Fetch = typeof fetch;
type Clock = () => Date;

// ---------------------------------------------------------------------------- JWT

const encoder = new TextEncoder();

export function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlBytes(input: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(base64UrlDecodeBinary(input), (c) => c.charCodeAt(0));
}

function base64UrlDecodeBinary(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

/** The DER bytes of a PEM block such as `-----BEGIN PRIVATE KEY-----`. */
export function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0)).buffer;
}

type Algorithm = 'ES256' | 'RS256';
const SIGN_PARAMS: Record<Algorithm, { import: EcKeyImportParams | RsaHashedImportParams; sign: AlgorithmIdentifier | EcdsaParams }> = {
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' } },
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, sign: { name: 'RSASSA-PKCS1-v1_5' } },
};

/** Signs a compact JWS. ECDSA signatures from WebCrypto are already in the JOSE (r || s) form. */
export async function signJwt(
  alg: Algorithm,
  privateKeyPem: string,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem), SIGN_PARAMS[alg].import, false, ['sign']);
  const input = `${base64UrlEncode(JSON.stringify({ ...header, alg, typ: 'JWT' }))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(SIGN_PARAMS[alg].sign, key, encoder.encode(input));
  return `${input}.${base64UrlEncode(signature)}`;
}

/** Caches a bearer token until a minute before it expires. */
function tokenCache(issue: () => Promise<{ token: string; expiresInSeconds: number }>, now: Clock) {
  let cached: { token: string; until: number } | null = null;
  return async () => {
    if (cached && cached.until > now().getTime()) return cached.token;
    const { token, expiresInSeconds } = await issue();
    cached = { token, until: now().getTime() + (expiresInSeconds - 60) * 1000 };
    return token;
  };
}

const seconds = (now: Clock) => Math.floor(now().getTime() / 1000);

// ---------------------------------------------------------------------------- App Store

export type AppStoreConfig = { issuerId: string; keyId: string; privateKeyPem: string; bundleId: string };

const APP_STORE_HOSTS = ['https://api.storekit.itunes.apple.com', 'https://api.storekit-sandbox.itunes.apple.com'];

/**
 * App Store Server API. A transaction is looked up in production first and then in the
 * sandbox, as Apple recommends (App Review buys with sandbox accounts on release builds).
 * The response comes straight from Apple over TLS, so its signed payload is decoded without
 * verifying the certificate chain again.
 */
export function appStoreGateway(config: AppStoreConfig, fetchFn: Fetch = fetch, now: Clock = () => new Date()): StoreGateway {
  const bearer = tokenCache(async () => {
    const iat = seconds(now);
    const token = await signJwt(
      'ES256',
      config.privateKeyPem,
      { kid: config.keyId },
      { iss: config.issuerId, iat, exp: iat + 1800, aud: 'appstoreconnect-v1', bid: config.bundleId },
    );
    return { token, expiresInSeconds: 1800 };
  }, now);

  return {
    async lookup(transactionId) {
      if (!/^\d{1,32}$/.test(transactionId)) return null;
      for (const host of APP_STORE_HOSTS) {
        const res = await fetchFn(`${host}/inApps/v1/transactions/${transactionId}`, {
          headers: { Authorization: `Bearer ${await bearer()}` },
        });
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`app store ${res.status}`);
        const { signedTransactionInfo } = await res.json();
        const [, payload] = String(signedTransactionInfo).split('.');
        return fromAppStoreTransaction(JSON.parse(base64UrlDecode(payload ?? '')), config.bundleId);
      }
      return null;
    },
    // StoreKit finishes consumables on the device; there is nothing to do on the server.
    consume: async () => {},
  };
}

// ---------------------------------------------------------------------------- Google Play

export type ServiceAccount = { client_email: string; private_key: string };
export type PlayConfig = { serviceAccount: ServiceAccount; packageName: string };

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** Google Play Developer API (purchases.products), signed in with a service account. */
export function playGateway(config: PlayConfig, fetchFn: Fetch = fetch, now: Clock = () => new Date()): StoreGateway {
  const bearer = tokenCache(async () => {
    const iat = seconds(now);
    const assertion = await signJwt('RS256', config.serviceAccount.private_key, {}, {
      iss: config.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: GOOGLE_TOKEN_URL,
      iat,
      exp: iat + 3600,
    });
    const res = await fetchFn(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`google token ${res.status}`);
    const body = await res.json();
    return { token: body.access_token, expiresInSeconds: body.expires_in };
  }, now);

  const purchaseUrl = (productId: string, token: string) =>
    `${PUBLISHER}/${encodeURIComponent(config.packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;

  return {
    async lookup(token, productId = '') {
      const res = await fetchFn(purchaseUrl(productId, token), { headers: { Authorization: `Bearer ${await bearer()}` } });
      // 400 is an invalid token, 404 an unknown one, 410 a purchase that is gone.
      if ([400, 404, 410].includes(res.status)) return null;
      if (!res.ok) throw new Error(`play ${res.status}`);
      return fromPlayPurchase(await res.json(), token, productId);
    },
    async consume(transaction) {
      const res = await fetchFn(`${purchaseUrl(transaction.productId, transaction.purchaseId)}:consume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await bearer()}` },
      });
      if (!res.ok) throw new Error(`play consume ${res.status}`);
    },
  };
}

// ---------------------------------------------------------------------------- Pub/Sub push auth

export type PushAuthConfig = { audience: string; serviceAccountEmail: string };

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * Checks the OIDC token that Pub/Sub attaches to an authenticated push subscription: signed
 * by Google, for our audience, and issued to the push service account we configured.
 */
export function googlePushAuth(config: PushAuthConfig, fetchFn: Fetch = fetch, now: Clock = () => new Date()) {
  let keys: { list: JsonWebKey[]; until: number } | null = null;
  const jwks = async (): Promise<JsonWebKey[]> => {
    if (keys && keys.until > now().getTime()) return keys.list;
    const res = await fetchFn(GOOGLE_CERTS);
    if (!res.ok) throw new Error(`google certs ${res.status}`);
    keys = { list: (await res.json()).keys ?? [], until: now().getTime() + 3600_000 };
    return keys.list;
  };

  return async (authorization: string | null): Promise<boolean> => {
    const match = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(authorization ?? '');
    if (!match) return false;
    const [, h, p, s] = match;
    try {
      const header = JSON.parse(base64UrlDecode(h));
      const claims = JSON.parse(base64UrlDecode(p));
      if (header.alg !== 'RS256') return false;
      const jwk = (await jwks()).find((k) => (k as { kid?: string }).kid === header.kid);
      if (!jwk) return false;
      const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlBytes(s), encoder.encode(`${h}.${p}`));
      const t = seconds(now);
      return (
        valid &&
        GOOGLE_ISSUERS.includes(claims.iss) &&
        claims.aud === config.audience &&
        claims.email === config.serviceAccountEmail &&
        claims.email_verified === true &&
        typeof claims.exp === 'number' &&
        claims.exp > t &&
        (typeof claims.iat !== 'number' || claims.iat <= t + 300)
      );
    } catch {
      return false;
    }
  };
}

// ---------------------------------------------------------------------------- database

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** The ledger ports over the `grant_purchase` and `revoke_purchase` RPCs (service role). */
export function databaseLedger(rpc: Rpc): CreditLedger {
  return {
    async grant(userId, t) {
      const { data, error } = await rpc('grant_purchase', {
        p_user: userId,
        p_store: t.store,
        p_purchase_id: t.purchaseId,
        p_product_id: t.productId,
        p_environment: t.environment,
        p_purchased_at: t.purchasedAt.toISOString(),
      });
      return { data: (data as GrantResult | null) ?? null, error };
    },
    async revoke(store, purchaseId) {
      const { data, error } = await rpc('revoke_purchase', { p_store: store, p_purchase_id: purchaseId });
      return { data: (data as RevokeResult | null) ?? null, error };
    },
  };
}
