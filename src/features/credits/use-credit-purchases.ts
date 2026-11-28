// Connects the credits screen to the store and the server: loads the offers, starts a
// purchase, and completes every purchase the store reports (including ones left unfinished
// by an earlier session, which the store replays on connect).
import { useEffect, useRef, useState } from 'react';

import { completePurchase, isSilentStoreError, type Offer, type PurchaseOutcome, storeFor, toOffers } from './domain/purchase';
import type { BillingStore, CreditsApi } from './ports';

export type CreditsDeps = { billing: BillingStore; api: CreditsApi; platform: string };

export type CreditsState = {
  status: 'loading' | 'ready' | 'unavailable';
  offers: Offer[];
  busy: boolean;
  outcome: PurchaseOutcome | null;
};

export function useCreditPurchases(deps: CreditsDeps, userId: string, onGranted: () => void) {
  const store = storeFor(deps.platform);
  const [state, setState] = useState<CreditsState>({ status: 'loading', offers: [], busy: false, outcome: null });
  // The latest callback, without reconnecting to the store when it changes.
  const granted = useRef(onGranted);
  useEffect(() => {
    granted.current = onGranted;
  }, [onGranted]);

  useEffect(() => {
    if (!store) return;
    const { billing, api } = deps;
    let active = true;
    const update = (next: Partial<CreditsState>) => active && setState((s) => ({ ...s, ...next }));

    const offPurchase = billing.onPurchase(async (purchase) => {
      update({ busy: true });
      const outcome = await completePurchase({ verify: api.verify, finish: billing.finish }, store, purchase);
      update({ busy: false, outcome });
      if (outcome.kind === 'granted') granted.current();
    });
    const offError = billing.onError((code) => {
      update({ busy: false, outcome: isSilentStoreError(code) ? null : { kind: 'failed', code: 'unavailable' } });
    });

    (async () => {
      try {
        await billing.connect();
        const packs = await api.packs();
        const products = await billing.products(packs.map((p) => p.id));
        const offers = toOffers(packs, products);
        update({ status: offers.length > 0 ? 'ready' : 'unavailable', offers });
      } catch {
        update({ status: 'unavailable' });
      }
    })();

    return () => {
      active = false;
      offPurchase();
      offError();
      billing.disconnect().catch(() => {});
    };
  }, [deps, store]);

  const buy = async (offer: Offer) => {
    setState((s) => ({ ...s, busy: true, outcome: null }));
    try {
      await deps.billing.buy(offer.id, userId);
    } catch {
      setState((s) => ({ ...s, busy: false, outcome: { kind: 'failed', code: 'unavailable' } }));
    }
  };

  return { ...state, status: store ? state.status : ('unavailable' as const), buy };
}
