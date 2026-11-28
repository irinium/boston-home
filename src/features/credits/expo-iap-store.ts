// The BillingStore port over expo-iap (StoreKit 2 and Play Billing).
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  initConnection,
  type Purchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'expo-iap';
import { Platform } from 'react-native';

import type { StorePurchase } from './domain/purchase';
import type { BillingStore } from './ports';

/**
 * The server looks a purchase up by its App Store transactionId or its Play purchaseToken.
 * Returns null for an event without one, which cannot be verified.
 */
export function toStorePurchase(purchase: Purchase, platform: string = Platform.OS): StorePurchase | null {
  const token = platform === 'ios' ? (purchase as { transactionId?: string }).transactionId ?? purchase.id : purchase.purchaseToken;
  if (!token) return null;
  return { productId: purchase.productId, token, pending: purchase.purchaseState === 'pending' };
}

export function createExpoIapStore(): BillingStore {
  // finishTransaction needs the SDK's own object; keep it until the purchase is finished.
  const raw = new Map<string, Purchase>();

  return {
    connect: async () => {
      await initConnection();
    },
    disconnect: async () => {
      raw.clear();
      await endConnection();
    },
    async products(ids) {
      const list = ids.length === 0 ? [] : await fetchProducts({ skus: ids, type: 'in-app' });
      return (list ?? []).map((p) => ({ id: p.id, displayPrice: p.displayPrice }));
    },
    async buy(sku, userId) {
      // Ties the payment to this account, so the server refuses it for any other account.
      await requestPurchase({
        type: 'in-app',
        request: { apple: { sku, appAccountToken: userId }, google: { skus: [sku], obfuscatedAccountId: userId } },
      });
    },
    async finish(purchase) {
      const original = raw.get(purchase.token);
      if (!original) return;
      await finishTransaction({ purchase: original, isConsumable: true });
      raw.delete(purchase.token);
    },
    onPurchase(listener) {
      const subscription = purchaseUpdatedListener((event) => {
        const purchase = toStorePurchase(event);
        if (!purchase) return;
        raw.set(purchase.token, event);
        listener(purchase);
      });
      return () => subscription.remove();
    },
    onError(listener) {
      const subscription = purchaseErrorListener((error) => listener(String(error.code)));
      return () => subscription.remove();
    },
  };
}
