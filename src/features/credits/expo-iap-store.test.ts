import * as Iap from 'expo-iap';

import { createExpoIapStore, toStorePurchase } from './expo-iap-store';

jest.mock('expo-iap', () => ({
  initConnection: jest.fn(async () => true),
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(),
  requestPurchase: jest.fn(async () => null),
  finishTransaction: jest.fn(async () => {}),
  purchaseUpdatedListener: jest.fn(),
  purchaseErrorListener: jest.fn(),
}));

const mocked = Iap as jest.Mocked<typeof Iap>;
const iosPurchase = { id: 'tx-1', transactionId: 'tx-1', productId: 'credits_5', purchaseState: 'purchased', purchaseToken: 'jws' };
const playPurchase = { id: 'order-1', productId: 'credits_5', purchaseState: 'pending', purchaseToken: 'tok-1' };

beforeEach(() => jest.clearAllMocks());

describe('toStorePurchase', () => {
  it('uses the transaction id on iOS and the purchase token on Android', () => {
    expect(toStorePurchase(iosPurchase as never, 'ios')).toEqual({ productId: 'credits_5', token: 'tx-1', pending: false });
    expect(toStorePurchase({ ...iosPurchase, transactionId: undefined } as never, 'ios')?.token).toBe('tx-1');
    expect(toStorePurchase(playPurchase as never, 'android')).toEqual({ productId: 'credits_5', token: 'tok-1', pending: true });
  });

  it('ignores events without a token', () => {
    expect(toStorePurchase({ ...playPurchase, purchaseToken: null } as never, 'android')).toBeNull();
  });
});

describe('createExpoIapStore', () => {
  it('connects, lists products and disconnects', async () => {
    mocked.fetchProducts.mockResolvedValue([{ id: 'credits_5', displayPrice: '4,99 €', title: 'x' }] as never);
    const store = createExpoIapStore();
    await store.connect();
    expect(await store.products(['credits_5'])).toEqual([{ id: 'credits_5', displayPrice: '4,99 €' }]);
    expect(mocked.fetchProducts).toHaveBeenCalledWith({ skus: ['credits_5'], type: 'in-app' });
    expect(await store.products([])).toEqual([]);
    mocked.fetchProducts.mockResolvedValue(null);
    expect(await store.products(['credits_5'])).toEqual([]);
    await store.disconnect();
    expect(mocked.initConnection).toHaveBeenCalled();
    expect(mocked.endConnection).toHaveBeenCalled();
  });

  it('ties a purchase to the account on both stores', async () => {
    await createExpoIapStore().buy('credits_5', 'user-1');
    expect(mocked.requestPurchase).toHaveBeenCalledWith({
      type: 'in-app',
      request: {
        apple: { sku: 'credits_5', appAccountToken: 'user-1' },
        google: { skus: ['credits_5'], obfuscatedAccountId: 'user-1' },
      },
    });
  });

  it('reports purchases and finishes them as consumables with the original object', async () => {
    let emit: (p: unknown) => void = () => {};
    const remove = jest.fn();
    mocked.purchaseUpdatedListener.mockImplementation(((listener: (p: unknown) => void) => {
      emit = listener;
      return { remove };
    }) as never);
    const store = createExpoIapStore();
    const seen = jest.fn();
    const off = store.onPurchase(seen);

    emit(iosPurchase);
    emit({ ...playPurchase, purchaseToken: null, transactionId: undefined, id: '' });
    expect(seen).toHaveBeenCalledTimes(1);
    const reported = seen.mock.calls[0][0];

    await store.finish(reported);
    expect(mocked.finishTransaction).toHaveBeenCalledWith({ purchase: iosPurchase, isConsumable: true });
    await store.finish(reported);
    expect(mocked.finishTransaction).toHaveBeenCalledTimes(1);

    off();
    expect(remove).toHaveBeenCalled();
  });

  it('reports store errors by code', () => {
    let emit: (e: unknown) => void = () => {};
    const remove = jest.fn();
    mocked.purchaseErrorListener.mockImplementation(((listener: (e: unknown) => void) => {
      emit = listener;
      return { remove };
    }) as never);
    const seen = jest.fn();
    const off = createExpoIapStore().onError(seen);
    emit({ code: 'user-cancelled', message: 'x' });
    expect(seen).toHaveBeenCalledWith('user-cancelled');
    off();
    expect(remove).toHaveBeenCalled();
  });
});
