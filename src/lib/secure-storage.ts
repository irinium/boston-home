import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage backed by the iOS Keychain / Android Keystore.
 * Values are split into chunks because some platforms reject large keychain entries.
 */
const CHUNK = 1800;
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const count = await SecureStore.getItemAsync(`${base}.n`, options);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${base}.${i}`, options);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    await secureStorage.removeItem(key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), options);
    }
    await SecureStore.setItemAsync(`${base}.n`, String(count), options);
  },
  async removeItem(key: string): Promise<void> {
    const base = safeKey(key);
    const count = await SecureStore.getItemAsync(`${base}.n`, options);
    if (count === null) return;
    for (let i = 0; i < Number(count); i++) {
      await SecureStore.deleteItemAsync(`${base}.${i}`, options);
    }
    await SecureStore.deleteItemAsync(`${base}.n`, options);
  },
};
