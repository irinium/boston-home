import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { myAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';

import { AuthProvider, useAuth } from './auth';

jest.mock('@/lib/api', () => ({ myAccount: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithIdToken: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'raw-nonce',
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

const auth = supabase.auth as unknown as Record<string, jest.Mock>;
const session = { user: { id: 'u1' } };
let emit: (event: string, next: unknown) => void;
const unsubscribe = jest.fn();

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockImplementation((cb) => {
    emit = cb;
    return { data: { subscription: { unsubscribe } } };
  });
  (myAccount as jest.Mock).mockResolvedValue({ id: 'u1', trusted: true });
});

it('starts signed out and becomes ready', async () => {
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.session).toBeNull();
  expect(result.current.account).toBeNull();
});

it('loads the account when a session appears, and clears it on sign-out', async () => {
  const { result, unmount } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => emit('SIGNED_IN', session));
  await waitFor(() => expect(result.current.account).toEqual({ id: 'u1', trusted: true }));
  await act(async () => emit('SIGNED_OUT', null));
  await waitFor(() => expect(result.current.account).toBeNull());
  await unmount();
  expect(unsubscribe).toHaveBeenCalled();
});

it('treats a failed account load as no account', async () => {
  (myAccount as jest.Mock).mockRejectedValue(new Error('offline'));
  auth.getSession.mockResolvedValue({ data: { session } });
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.session).toEqual(session));
  await waitFor(() => expect(myAccount).toHaveBeenCalled());
  expect(result.current.account).toBeNull();
});

it('refreshAccount reloads for a signed-in user only', async () => {
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() => result.current.refreshAccount());
  expect(result.current.account).toBeNull();
  auth.getSession.mockResolvedValue({ data: { session } });
  await act(() => result.current.refreshAccount());
  expect(result.current.account).toEqual({ id: 'u1', trusted: true });
});

it('signs in with Apple using a hashed nonce and no scopes', async () => {
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'jwt' });
  auth.signInWithIdToken.mockResolvedValue({ error: null });
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await act(() => result.current.signInWithApple());
  expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({ requestedScopes: [], nonce: 'hashed-nonce' });
  expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'jwt', nonce: 'raw-nonce' });
});

it('rejects a missing Apple token and Supabase errors', async () => {
  const { result } = await renderHook(() => useAuth(), { wrapper });
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: null });
  await expect(result.current.signInWithApple()).rejects.toThrow('No identity token');
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: 'jwt' });
  auth.signInWithIdToken.mockResolvedValueOnce({ error: new Error('invalid nonce') });
  await expect(result.current.signInWithApple()).rejects.toThrow('invalid nonce');
});

it('signs out', async () => {
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await act(() => result.current.signOut());
  expect(auth.signOut).toHaveBeenCalled();
});

it('useAuth outside the provider is a programming error', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  function Bare() {
    useAuth();
    return <Text>never</Text>;
  }
  await expect(render(<Bare />)).rejects.toThrow('useAuth must be used inside AuthProvider');
});
