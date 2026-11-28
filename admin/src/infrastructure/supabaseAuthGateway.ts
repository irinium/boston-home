import type { AdminSession, AuthGateway, GatewayResult } from '../application/ports';
import { fail, ok } from '../domain/result';
import { callRpc, toErrorCode, type RpcClient, type RpcError } from './rpc';
import { whoamiSchema } from './schemas';

interface AuthUser {
  readonly id: string;
  readonly email?: string | undefined;
}

/** The subset of `supabase.auth` the panel uses. */
export interface AuthClient {
  getSession(): Promise<{ data: { session: { user: AuthUser } | null } }>;
  signInWithOtp(credentials: { email: string; options: { shouldCreateUser: boolean } }): Promise<{ error: RpcError | null }>;
  verifyOtp(params: { email: string; token: string; type: 'email' }): Promise<{
    data: { user: AuthUser | null };
    error: RpcError | null;
  }>;
  signOut(): Promise<unknown>;
}

const toSession = (user: AuthUser): AdminSession => ({ userId: user.id, email: user.email ?? null });

export class SupabaseAuthGateway implements AuthGateway {
  constructor(
    private readonly auth: AuthClient,
    private readonly rpc: RpcClient,
  ) {}

  async currentSession(): Promise<AdminSession | null> {
    const { data } = await this.auth.getSession();
    return data.session ? toSession(data.session.user) : null;
  }

  async sendCode(email: string): GatewayResult<void> {
    // Never create accounts from the admin panel: admins already exist.
    const { error } = await this.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    return error ? fail(toErrorCode(error)) : ok(undefined);
  }

  async verifyCode(email: string, code: string): GatewayResult<AdminSession> {
    const { data, error } = await this.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) return fail(toErrorCode(error) === 'network' ? 'network' : 'invalid_code');
    return data.user ? ok(toSession(data.user)) : fail('invalid_code');
  }

  isAdmin(): GatewayResult<boolean> {
    return callRpc(this.rpc, 'admin_whoami', {}, whoamiSchema);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
