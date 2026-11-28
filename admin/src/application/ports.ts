import type { AccountSummary } from '../domain/account';
import type { AuditEntry } from '../domain/auditLog';
import type { ModerationErrorCode } from '../domain/errors';
import type { Reason } from '../domain/reason';
import type { QueuedReport, ReportDecision, ReportStatus } from '../domain/report';
import type { Result } from '../domain/result';

export type GatewayResult<T> = Promise<Result<T, ModerationErrorCode>>;

export interface QueueCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface QueueQuery {
  readonly statuses: readonly ReportStatus[];
  readonly after: QueueCursor | null;
  readonly limit: number;
}

export interface AuditQuery {
  readonly beforeId: number | null;
  readonly targetUserId: string | null;
  readonly limit: number;
}

/** Driven port: everything the panel reads from or asks of the moderation backend. */
export interface ModerationGateway {
  reportQueue(query: QueueQuery): GatewayResult<QueuedReport[]>;
  account(userId: string): GatewayResult<AccountSummary>;
  suspendAccount(userId: string, reason: Reason): GatewayResult<void>;
  unsuspendAccount(userId: string, reason: Reason): GatewayResult<void>;
  hideListing(listingId: string, reason: Reason): GatewayResult<void>;
  unhideListing(listingId: string, reason: Reason): GatewayResult<void>;
  setReportStatus(reportId: string, status: ReportDecision, note: string): GatewayResult<void>;
  auditLog(query: AuditQuery): GatewayResult<AuditEntry[]>;
}

export interface AdminSession {
  readonly userId: string;
  readonly email: string | null;
}

/** Driven port: email one-time-code sign-in. */
export interface AuthGateway {
  currentSession(): Promise<AdminSession | null>;
  sendCode(email: string): GatewayResult<void>;
  verifyCode(email: string, code: string): GatewayResult<AdminSession>;
  isAdmin(): GatewayResult<boolean>;
  signOut(): Promise<void>;
}
