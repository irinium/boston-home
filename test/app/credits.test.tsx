import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { creditsApi } from '@/features/credits/api';
import type { StorePurchase } from '@/features/credits/domain/purchase';
import { createExpoIapStore } from '@/features/credits/expo-iap-store';
import type { BillingStore } from '@/features/credits/ports';

import { ME, mockAuth, signIn } from '../auth-mock';
import CreditsScreen from '@/app/credits';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/features/credits/api', () => ({ creditsApi: { packs: jest.fn(), verify: jest.fn() } }));
jest.mock('@/features/credits/expo-iap-store', () => ({ createExpoIapStore: jest.fn() }));

const api = creditsApi as jest.Mocked<typeof creditsApi>;
const purchase: StorePurchase = { productId: 'credits_5', token: 'tx-1', pending: false };

let emitPurchase: (p: StorePurchase) => void;
let emitError: (code: string) => void;
let store: jest.Mocked<BillingStore>;

beforeEach(() => {
  jest.clearAllMocks();
  signIn({ credits: 2 });
  store = {
    connect: jest.fn(async () => {}),
    disconnect: jest.fn(async () => {}),
    products: jest.fn(async (_ids: string[]) => [
      { id: 'credits_5', displayPrice: '4,99 €' },
      { id: 'credits_15', displayPrice: '11,99 €' },
    ]),
    buy: jest.fn(async (_id: string, _user: string) => {}),
    finish: jest.fn(async (_p: StorePurchase) => {}),
    onPurchase: jest.fn((listener) => {
      emitPurchase = listener;
      return jest.fn();
    }),
    onError: jest.fn((listener) => {
      emitError = listener;
      return jest.fn();
    }),
  };
  (createExpoIapStore as jest.Mock).mockReturnValue(store);
  api.packs.mockResolvedValue([
    { id: 'credits_15', credits: 15 },
    { id: 'credits_5', credits: 5 },
    { id: 'credits_40', credits: 40 },
  ]);
});

async function open() {
  const view = await render(<CreditsScreen />);
  await act(async () => {});
  return view;
}

it('shows the balance and the packs the store sells, with store prices', async () => {
  await open();
  expect(screen.getByText('Your balance: 2')).toBeOnTheScreen();
  expect(screen.getByText('5 credits')).toBeOnTheScreen();
  expect(screen.getByText('Buy for 11,99 €')).toBeOnTheScreen();
  expect(screen.queryByText('40 credits')).toBeNull();
  expect(store.products).toHaveBeenCalledWith(['credits_15', 'credits_5', 'credits_40']);
});

it('buys a pack for this account, verifies it and refreshes the balance', async () => {
  api.verify.mockResolvedValue({ kind: 'granted', credits: 5, balance: 7 });
  await open();
  await fireEvent.press(screen.getByText('Buy for 4,99 €'));
  expect(store.buy).toHaveBeenCalledWith('credits_5', ME);

  await act(async () => emitPurchase(purchase));
  expect(api.verify).toHaveBeenCalledWith('app_store', purchase);
  expect(store.finish).toHaveBeenCalledWith(purchase);
  expect(mockAuth.refreshAccount).toHaveBeenCalled();
  expect(screen.getByText('Done! 5 credits added.')).toBeOnTheScreen();
});

it('says when a payment is waiting for approval', async () => {
  await open();
  await act(async () => emitPurchase({ ...purchase, pending: true }));
  expect(screen.getByText(/still waiting for approval/)).toBeOnTheScreen();
  expect(mockAuth.refreshAccount).not.toHaveBeenCalled();
});

it('explains a rejected purchase', async () => {
  api.verify.mockResolvedValue({ kind: 'rejected', code: 'account_mismatch' });
  await open();
  await act(async () => emitPurchase(purchase));
  expect(screen.getByText('This purchase was made from another account.')).toBeOnTheScreen();
});

it('stays quiet when the buyer closes the store sheet, and reports other store errors', async () => {
  await open();
  await act(async () => emitError('user-cancelled'));
  expect(screen.queryByText('Could not open the store. Please try again.')).toBeNull();
  await act(async () => emitError('network-error'));
  expect(screen.getByText('Could not open the store. Please try again.')).toBeOnTheScreen();
});

it('reports a store that cannot start a purchase', async () => {
  store.buy.mockRejectedValue(new Error('not prepared'));
  await open();
  await fireEvent.press(screen.getByText('Buy for 4,99 €'));
  expect(screen.getByText('Could not open the store. Please try again.')).toBeOnTheScreen();
});

it('shows purchases as unavailable when the store cannot connect or sells nothing', async () => {
  store.connect.mockRejectedValue(new Error('no billing'));
  const { unmount } = await open();
  expect(screen.getByText('Purchases are not available on this device right now.')).toBeOnTheScreen();
  await unmount();

  store.connect.mockResolvedValue();
  store.products.mockResolvedValue([]);
  await open();
  expect(screen.getByText('Purchases are not available on this device right now.')).toBeOnTheScreen();
});

it('disconnects from the store when the screen closes', async () => {
  const { unmount } = await open();
  await unmount();
  expect(store.disconnect).toHaveBeenCalled();
});

it('offers no purchases on the web', async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  try {
    await open();
    expect(store.connect).not.toHaveBeenCalled();
    expect(screen.getByText('Purchases are not available on this device right now.')).toBeOnTheScreen();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }
});
