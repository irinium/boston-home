import {
  completePurchase,
  errorKey,
  isSilentStoreError,
  type PurchaseFlowPorts,
  storeFor,
  type StorePurchase,
  toOffers,
} from './purchase';

const purchase = { productId: 'credits_5', token: 'tx-1', pending: false };

const ports = (verify: PurchaseFlowPorts['verify']): jest.Mocked<PurchaseFlowPorts> => ({
  verify: jest.fn(verify),
  finish: jest.fn(async (_purchase: StorePurchase) => {}),
});

it('maps platforms to stores', () => {
  expect(storeFor('ios')).toBe('app_store');
  expect(storeFor('android')).toBe('play');
  expect(storeFor('web')).toBeNull();
});

it('offers only the packs the store sells, smallest first, with the store price', () => {
  const packs = [
    { id: 'credits_40', credits: 40 },
    { id: 'credits_5', credits: 5 },
    { id: 'credits_15', credits: 15 },
  ];
  const products = [
    { id: 'credits_40', displayPrice: '24,99 €' },
    { id: 'credits_5', displayPrice: '4,99 €' },
    { id: 'unrelated', displayPrice: '1 €' },
  ];
  expect(toOffers(packs, products)).toEqual([
    { id: 'credits_5', credits: 5, price: '4,99 €' },
    { id: 'credits_40', credits: 40, price: '24,99 €' },
  ]);
});

describe('completePurchase', () => {
  it('finishes the transaction once the server granted the credits', async () => {
    const p = ports(async () => ({ kind: 'granted', credits: 5, balance: 6 }));
    expect(await completePurchase(p, 'app_store', purchase)).toEqual({ kind: 'granted', credits: 5, balance: 6 });
    expect(p.verify).toHaveBeenCalledWith('app_store', purchase);
    expect(p.finish).toHaveBeenCalledWith(purchase);
  });

  it('reports the grant even when finishing fails', async () => {
    const p = ports(async () => ({ kind: 'granted', credits: 5, balance: 6 }));
    p.finish.mockRejectedValue(new Error('store'));
    expect((await completePurchase(p, 'play', purchase)).kind).toBe('granted');
  });

  it('waits for pending payments without asking the server', async () => {
    const p = ports(async () => ({ kind: 'granted', credits: 5, balance: 6 }));
    expect(await completePurchase(p, 'play', { ...purchase, pending: true })).toEqual({ kind: 'pending' });
    expect(p.verify).not.toHaveBeenCalled();
  });

  it('keeps a transaction the server still sees as pending', async () => {
    const p = ports(async () => ({ kind: 'pending' }));
    expect(await completePurchase(p, 'app_store', purchase)).toEqual({ kind: 'pending' });
    expect(p.finish).not.toHaveBeenCalled();
  });

  it.each(['invalid_receipt', 'purchase_revoked'])('finishes a transaction rejected for good (%s)', async (code) => {
    const p = ports(async () => ({ kind: 'rejected', code }));
    expect(await completePurchase(p, 'app_store', purchase)).toEqual({ kind: 'failed', code });
    expect(p.finish).toHaveBeenCalled();
  });

  it('keeps a transaction claimed by another account, so support can still look into it', async () => {
    const p = ports(async () => ({ kind: 'rejected', code: 'purchase_owned_by_other' }));
    expect(await completePurchase(p, 'app_store', purchase)).toEqual({ kind: 'failed', code: 'purchase_owned_by_other' });
    expect(p.finish).not.toHaveBeenCalled();
  });

  it('keeps the transaction for a later retry when the server or network fails', async () => {
    const p = ports(async () => ({ kind: 'retry', code: 'store_unavailable' }));
    expect(await completePurchase(p, 'app_store', purchase)).toEqual({ kind: 'failed', code: 'store_unavailable' });
    const offline = ports(async () => {
      throw new Error('offline');
    });
    expect(await completePurchase(offline, 'app_store', purchase)).toEqual({ kind: 'failed', code: 'network' });
    expect(p.finish).not.toHaveBeenCalled();
    expect(offline.finish).not.toHaveBeenCalled();
  });
});

it('treats a cancelled store sheet as no error', () => {
  expect(isSilentStoreError('user-cancelled')).toBe(true);
  expect(isSilentStoreError('network-error')).toBe(false);
});

it('maps failure codes to known messages', () => {
  expect(errorKey('account_mismatch')).toBe('account_mismatch');
  expect(errorKey('deadlock')).toBe('failed');
});
