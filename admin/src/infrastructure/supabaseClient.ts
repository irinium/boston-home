import { createClient } from '@supabase/supabase-js';

import type { AuthClient } from './supabaseAuthGateway';
import type { RpcClient } from './rpc';

export interface SupabasePorts {
  readonly rpc: RpcClient;
  readonly auth: AuthClient;
}

export function createSupabasePorts(url: string | undefined, anonKey: string | undefined): SupabasePorts {
  if (!url || !anonKey) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see admin/.env.example).');
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return {
    rpc: { rpc: (fn, args) => client.rpc(fn, args) },
    auth: client.auth,
  };
}
