// Ports of the credits feature. The screen depends on these, never on expo-iap or Supabase.
import type { CreditPack, Store, StoreProduct, StorePurchase, VerifyResult } from './domain/purchase';

export type Unsubscribe = () => void;

/** The device's store: StoreKit on iOS, Play Billing on Android. */
export interface BillingStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  products(ids: string[]): Promise<StoreProduct[]>;
  /** Opens the store sheet. The result arrives through onPurchase / onError. */
  buy(productId: string, userId: string): Promise<void>;
  finish(purchase: StorePurchase): Promise<void>;
  onPurchase(listener: (purchase: StorePurchase) => void): Unsubscribe;
  onError(listener: (code: string) => void): Unsubscribe;
}

export interface CreditsApi {
  packs(): Promise<CreditPack[]>;
  verify(store: Store, purchase: StorePurchase): Promise<VerifyResult>;
}
