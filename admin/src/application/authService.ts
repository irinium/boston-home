import { parseEmail, parseOtp } from '../domain/email';
import type { ModerationErrorCode } from '../domain/errors';
import { fail, ok, type Result } from '../domain/result';
import type { AdminSession, AuthGateway } from './ports';

type Outcome<T> = Promise<Result<T, ModerationErrorCode>>;

/**
 * Sign-in for moderators. Any account can receive a code, so after verifying it the service asks the
 * database whether the account is an admin and signs non-admins straight out. The admin RPCs check
 * again on every call; this only keeps the panel closed to everyone else.
 */
export class AuthService {
  constructor(private readonly gateway: AuthGateway) {}

  async restore(): Promise<AdminSession | null> {
    const session = await this.gateway.currentSession();
    if (!session) return null;
    const admitted = await this.admit(session);
    return admitted.ok ? admitted.value : null;
  }

  async sendCode(emailInput: string): Outcome<string> {
    const email = parseEmail(emailInput);
    if (!email.ok) return email;
    const sent = await this.gateway.sendCode(email.value);
    return sent.ok ? ok(email.value) : sent;
  }

  async verifyCode(email: string, codeInput: string): Outcome<AdminSession> {
    const code = parseOtp(codeInput);
    if (!code.ok) return code;
    const session = await this.gateway.verifyCode(email, code.value);
    return session.ok ? this.admit(session.value) : session;
  }

  signOut(): Promise<void> {
    return this.gateway.signOut();
  }

  private async admit(session: AdminSession): Outcome<AdminSession> {
    const admin = await this.gateway.isAdmin();
    if (admin.ok && admin.value) return ok(session);
    await this.gateway.signOut();
    return fail(admin.ok ? 'not_admin' : admin.error);
  }
}
