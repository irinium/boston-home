import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { myAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { MyAccount } from '@/lib/types';

type AuthState = {
  ready: boolean;
  session: Session | null;
  account: MyAccount | null;
  refreshAccount: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<MyAccount | null>(null);

  const refreshAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setAccount(data.session ? await myAccount() : null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    (userId ? myAccount() : Promise.resolve(null))
      .then((next) => active && setAccount(next))
      .catch(() => active && setAccount(null));
    return () => {
      active = false;
    };
  }, [userId]);

  const signInWithApple = useCallback(async () => {
    // The nonce binds Apple's token to this sign-in attempt (replay protection).
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    // No scopes requested: we need neither the user's name nor her email.
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [], nonce: hashedNonce });
    if (!credential.identityToken) throw new Error('No identity token from Apple');
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ ready, session, account, refreshAccount, signInWithApple, signOut }),
    [ready, session, account, refreshAccount, signInWithApple, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
