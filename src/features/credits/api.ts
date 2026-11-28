// Supabase calls of the credits feature.
import { supabase } from '@/lib/supabase';

import type { CreditPack, Store, StorePurchase, VerifyResult } from './domain/purchase';
import type { CreditsApi } from './ports';

/** HTTP statuses of `purchase-verify` after which trying again cannot help. */
const FINAL_STATUSES = new Set([400, 403, 404, 409]);

async function packs(): Promise<CreditPack[]> {
  const { data, error } = await supabase.from('credit_packs').select('id, credits').order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as CreditPack[];
}

async function verify(store: Store, purchase: StorePurchase): Promise<VerifyResult> {
  const { data, error } = await supabase.functions.invoke('purchase-verify', {
    body: { store, product_id: purchase.productId, token: purchase.token },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = await context?.json?.().catch(() => null);
    const code = typeof body?.error === 'string' ? body.error : 'network';
    return context && FINAL_STATUSES.has(context.status) ? { kind: 'rejected', code } : { kind: 'retry', code };
  }
  // 202: the store has not taken the payment yet (e.g. "Ask to Buy").
  if (data?.error === 'pending') return { kind: 'pending' };
  return { kind: 'granted', credits: data.credits, balance: data.balance };
}

export const creditsApi: CreditsApi = { packs, verify };
