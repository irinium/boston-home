import * as SecureStore from 'expo-secure-store';

import { secureStorage } from './secure-storage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => store.clear());

describe('secureStorage', () => {
  it('round-trips a large value in chunks with a safe key', async () => {
    const value = 'x'.repeat(4000);
    await secureStorage.setItem('sb-auth:token', value);
    expect(store.get('sb-auth_token.n')).toBe('3');
    await expect(secureStorage.getItem('sb-auth:token')).resolves.toBe(value);
  });

  it('returns null for a missing key or a missing chunk', async () => {
    await expect(secureStorage.getItem('nope')).resolves.toBeNull();
    await secureStorage.setItem('k', 'y'.repeat(2000));
    store.delete('k.1');
    await expect(secureStorage.getItem('k')).resolves.toBeNull();
  });

  it('removes every chunk, and ignores missing keys', async () => {
    await secureStorage.setItem('k', 'z'.repeat(2000));
    await secureStorage.removeItem('k');
    expect(store.size).toBe(0);
    await expect(secureStorage.removeItem('k')).resolves.toBeUndefined();
  });

  it('overwrites an older, longer value', async () => {
    await secureStorage.setItem('k', 'a'.repeat(4000));
    await secureStorage.setItem('k', 'b');
    expect(store.has('k.2')).toBe(false);
    await expect(secureStorage.getItem('k')).resolves.toBe('b');
  });
});
