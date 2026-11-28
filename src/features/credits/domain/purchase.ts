// Pure rules of the credit purchase flow. The store SDK and the server sit behind ports
// (see ../ports.ts), so this module has no React, no SDK and no network.

export type Store = 'app_store' | 'play';

/** A pack from the `credit_packs` catalogue. The server decides how many credits it grants. */
export type CreditPack = { id: string; credits: number };

/** What the store SDK knows about a product, in the buyer's currency. */
export type StoreProduct = { id: string; displayPrice: string };

export type Offer = CreditPack & { price: string };

/** A finished payment reported by the store SDK, not yet verified. */
export type StorePurchase = { productId: string; token: string; pending: boolean };

export type VerifyResult =
  | { kind: 'granted'; credits: number; balance: number }
  | { kind: 'pending' }
  | { kind: 'rejected'; code: string }
  | { kind: 'retry'; code: string };

export type PurchaseOutcome =
  | { kind: 'granted'; credits: number; balance: number }
  | { kind: 'pending' }
  | { kind: 'failed'; code: string };

export interface PurchaseFlowPorts {
  verify(store: Store, purchase: StorePurchase): Promise<VerifyResult>;
  /** Finishes (and on Play consumes) the transaction, so the store stops replaying it. */
  finish(purchase: StorePurchase): Promise<void>;
}

export const storeFor = (platform: string): Store | null =>
  platform === 'ios' ? 'app_store' : platform === 'android' ? 'play' : null;

/** Packs the store can sell right now, smallest first. Packs the store does not list are hidden. */
export function toOffers(packs: CreditPack[], products: StoreProduct[]): Offer[] {
  const prices = new Map(products.map((p) => [p.id, p.displayPrice]));
  return packs
    .filter((pack) => prices.has(pack.id))
    .map((pack) => ({ ...pack, price: prices.get(pack.id)! }))
    .sort((a, b) => a.credits - b.credits);
}

/** Server answers after which the transaction will never grant credits, so it is finished too. */
const FINAL_REJECTIONS = new Set(['purchase_revoked', 'invalid_receipt']);

/**
 * Verifies a payment on the server and finishes the transaction once it can no longer change.
 * A transaction that failed for a passing reason (network, store outage) stays unfinished, so
 * the store hands it to the app again on the next start and it is verified then.
 */
export async function completePurchase(
  ports: PurchaseFlowPorts,
  store: Store,
  purchase: StorePurchase,
): Promise<PurchaseOutcome> {
  if (purchase.pending) return { kind: 'pending' };

  let result: VerifyResult;
  try {
    result = await ports.verify(store, purchase);
  } catch {
    result = { kind: 'retry', code: 'network' };
  }

  switch (result.kind) {
    case 'pending':
      return result;
    case 'retry':
      return { kind: 'failed', code: result.code };
    case 'rejected':
      if (FINAL_REJECTIONS.has(result.code)) await finishQuietly(ports, purchase);
      return { kind: 'failed', code: result.code };
    case 'granted':
      await finishQuietly(ports, purchase);
      return result;
  }
}

// The server has already granted (or refused) the credits; a failed finish only means the
// store replays the transaction later, and the server answers it as a duplicate.
const finishQuietly = (ports: PurchaseFlowPorts, purchase: StorePurchase) => ports.finish(purchase).catch(() => {});

/** Store SDK error codes that are the buyer's own choice, not a failure worth showing. */
const SILENT_STORE_ERRORS = new Set(['user-cancelled']);

export const isSilentStoreError = (code: string) => SILENT_STORE_ERRORS.has(code);

/** The i18n key under `credits.errors` for a failure code. */
export function errorKey(code: string): string {
  return KNOWN_ERRORS.has(code) ? code : 'failed';
}

const KNOWN_ERRORS = new Set([
  'network',
  'store_unavailable',
  'invalid_receipt',
  'purchase_revoked',
  'account_mismatch',
  'purchase_owned_by_other',
  'unavailable',
]);
