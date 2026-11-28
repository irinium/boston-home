import { supabase } from '@/lib/supabase';

import { creditsApi } from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));

const from = supabase.from as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;
const purchase = { productId: 'credits_5', token: 'tx-1', pending: false };

function query(result: unknown) {
  const builder: { select: jest.Mock; order: jest.Mock } = { select: jest.fn(), order: jest.fn(async () => result) };
  builder.select.mockReturnValue(builder);
  return builder;
}

describe('packs', () => {
  it('reads the catalogue in its order', async () => {
    const q = query({ data: [{ id: 'credits_5', credits: 5 }], error: null });
    from.mockReturnValue(q);
    await expect(creditsApi.packs()).resolves.toEqual([{ id: 'credits_5', credits: 5 }]);
    expect(from).toHaveBeenCalledWith('credit_packs');
    expect(q.select).toHaveBeenCalledWith('id, credits');
    expect(q.order).toHaveBeenCalledWith('sort_order');
  });

  it('returns an empty list for no data and throws on errors', async () => {
    from.mockReturnValue(query({ data: null, error: null }));
    await expect(creditsApi.packs()).resolves.toEqual([]);
    from.mockReturnValue(query({ data: null, error: { message: 'boom' } }));
    await expect(creditsApi.packs()).rejects.toThrow('boom');
  });
});

describe('verify', () => {
  const failure = (status: number, body: Promise<unknown>) => ({
    data: null,
    error: { context: { status, json: () => body } },
  });

  it('sends the receipt reference to purchase-verify and returns the grant', async () => {
    invoke.mockResolvedValue({ data: { credits: 5, balance: 6, duplicate: false }, error: null });
    await expect(creditsApi.verify('app_store', purchase)).resolves.toEqual({ kind: 'granted', credits: 5, balance: 6 });
    expect(invoke).toHaveBeenCalledWith('purchase-verify', {
      body: { store: 'app_store', product_id: 'credits_5', token: 'tx-1' },
    });
  });

  it('recognises a pending payment', async () => {
    invoke.mockResolvedValue({ data: { error: 'pending' }, error: null });
    await expect(creditsApi.verify('play', purchase)).resolves.toEqual({ kind: 'pending' });
  });

  it.each([400, 403, 404, 409])('treats HTTP %i as a final rejection', async (status) => {
    invoke.mockResolvedValue(failure(status, Promise.resolve({ error: 'invalid_receipt' })));
    await expect(creditsApi.verify('play', purchase)).resolves.toEqual({ kind: 'rejected', code: 'invalid_receipt' });
  });

  it('asks for a retry on server and network errors', async () => {
    invoke.mockResolvedValue(failure(502, Promise.resolve({ error: 'store_unavailable' })));
    await expect(creditsApi.verify('play', purchase)).resolves.toEqual({ kind: 'retry', code: 'store_unavailable' });
    invoke.mockResolvedValue(failure(500, Promise.reject(new Error('html'))));
    await expect(creditsApi.verify('play', purchase)).resolves.toEqual({ kind: 'retry', code: 'network' });
    invoke.mockResolvedValue({ data: null, error: {} });
    await expect(creditsApi.verify('play', purchase)).resolves.toEqual({ kind: 'retry', code: 'network' });
  });
});
