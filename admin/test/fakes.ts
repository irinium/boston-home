import type { AdminSession, AuditQuery, AuthGateway, GatewayResult, ModerationGateway, QueueQuery } from '../src/application/ports';
import type { AccountSummary } from '../src/domain/account';
import type { AuditEntry, ModerationAction } from '../src/domain/auditLog';
import type { ModerationErrorCode } from '../src/domain/errors';
import type { Reason } from '../src/domain/reason';
import type { QueuedReport, ReportDecision } from '../src/domain/report';
import { fail, ok } from '../src/domain/result';

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export function makeReport(overrides: Partial<QueuedReport> = {}): QueuedReport {
  return {
    id: uuid(),
    reason: 'fake',
    details: '',
    snapshot: { displayName: null, listingTitle: null, listingText: null, requestMessage: null },
    status: 'open',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    resolvedAt: null,
    reportedId: 'user-1',
    reportedDisplayName: 'Olena',
    reportedIsSuspended: false,
    listingId: 'listing-1',
    listingStatus: 'active',
    openReportsAgainst: 1,
    ...overrides,
  };
}

export function makeAccount(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 'user-1',
    displayName: 'Olena',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    verificationStatus: 'verified',
    isSuspended: false,
    suspendedReason: null,
    isAdmin: false,
    listing: { id: 'listing-1', status: 'active', title: 'Квартира в Києві' },
    openReports: 1,
    totalReports: 2,
    ...overrides,
  };
}

/** In-memory stand-in for the admin RPCs, with the same rules the database enforces. */
export class FakeModerationGateway implements ModerationGateway {
  reports: QueuedReport[] = [];
  accounts = new Map<string, AccountSummary>();
  log: AuditEntry[] = [];
  failWith: ModerationErrorCode | null = null;
  readonly calls: string[] = [];

  async reportQueue(query: QueueQuery): GatewayResult<QueuedReport[]> {
    this.calls.push('reportQueue');
    if (this.failWith) return fail(this.failWith);
    const sorted = this.reports
      .filter((r) => query.statuses.includes(r.status))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const after = query.after;
    const start = after
      ? sorted.findIndex((r) => r.createdAt > after.createdAt || (r.createdAt.getTime() === after.createdAt.getTime() && r.id > after.id))
      : 0;
    return ok(start < 0 ? [] : sorted.slice(start, start + query.limit));
  }

  async account(userId: string): GatewayResult<AccountSummary> {
    this.calls.push('account');
    if (this.failWith) return fail(this.failWith);
    const account = this.accounts.get(userId);
    return account ? ok(account) : fail('account_not_found');
  }

  async suspendAccount(userId: string, reason: Reason): GatewayResult<void> {
    return this.updateAccount(userId, 'suspend_account', reason, (a) => {
      if (a.isAdmin) return 'target_is_admin';
      if (a.isSuspended) return 'already_suspended';
      return { ...a, isSuspended: true, suspendedReason: reason };
    });
  }

  async unsuspendAccount(userId: string, reason: Reason): GatewayResult<void> {
    return this.updateAccount(userId, 'unsuspend_account', reason, (a) =>
      a.isSuspended ? { ...a, isSuspended: false, suspendedReason: null } : 'not_suspended');
  }

  async hideListing(listingId: string, reason: Reason): GatewayResult<void> {
    return this.updateListing(listingId, 'hide_listing', reason, 'hidden');
  }

  async unhideListing(listingId: string, reason: Reason): GatewayResult<void> {
    return this.updateListing(listingId, 'unhide_listing', reason, 'paused');
  }

  async setReportStatus(reportId: string, status: ReportDecision, note: string): GatewayResult<void> {
    this.calls.push(`setReportStatus:${status}`);
    if (this.failWith) return fail(this.failWith);
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return fail('report_not_found');
    if (report.status === status) return fail('status_unchanged');
    this.reports = this.reports.map((r) => (r.id === reportId ? { ...r, status } : r));
    this.record('set_report_status', note, report.reportedId, { from: report.status, to: status });
    return ok(undefined);
  }

  async auditLog(query: AuditQuery): GatewayResult<AuditEntry[]> {
    this.calls.push('auditLog');
    if (this.failWith) return fail(this.failWith);
    return ok(this.log
      .filter((e) => query.beforeId === null || e.id < query.beforeId)
      .filter((e) => query.targetUserId === null || e.targetUserId === query.targetUserId)
      .sort((a, b) => b.id - a.id)
      .slice(0, query.limit));
  }

  private updateAccount(
    userId: string, action: ModerationAction, reason: string,
    change: (account: AccountSummary) => AccountSummary | ModerationErrorCode,
  ): GatewayResult<void> {
    this.calls.push(action);
    if (this.failWith) return Promise.resolve(fail(this.failWith));
    const account = this.accounts.get(userId);
    if (!account) return Promise.resolve(fail('account_not_found'));
    const next = change(account);
    if (typeof next === 'string') return Promise.resolve(fail(next));
    this.accounts.set(userId, next);
    this.record(action, reason, userId);
    return Promise.resolve(ok(undefined));
  }

  private updateListing(listingId: string, action: ModerationAction, reason: string, status: 'hidden' | 'paused'): GatewayResult<void> {
    this.calls.push(action);
    const account = [...this.accounts.values()].find((a) => a.listing?.id === listingId);
    if (!account?.listing) return Promise.resolve(fail('listing_not_found'));
    if ((status === 'hidden') === (account.listing.status === 'hidden')) {
      return Promise.resolve(fail(status === 'hidden' ? 'already_hidden' : 'not_hidden'));
    }
    this.accounts.set(account.id, { ...account, listing: { ...account.listing, status } });
    this.record(action, reason, account.id);
    return Promise.resolve(ok(undefined));
  }

  private record(action: ModerationAction, reason: string, userId: string | null, details: Record<string, unknown> = {}) {
    this.log.push({
      id: this.log.length + 1,
      adminId: 'admin-0001-aaaa',
      action,
      targetUserId: userId,
      targetListingId: null,
      targetReportId: null,
      reason,
      details,
      createdAt: new Date('2026-11-28T12:00:00Z'),
    });
  }
}

export class FakeAuthGateway implements AuthGateway {
  session: AdminSession | null = null;
  admins = new Set<string>(['admin@example.org']);
  validCode = '123456';
  sendError: ModerationErrorCode | null = null;
  whoamiError: ModerationErrorCode | null = null;
  readonly sent: string[] = [];
  signOuts = 0;

  async currentSession() {
    return this.session;
  }

  async sendCode(email: string): GatewayResult<void> {
    if (this.sendError) return fail(this.sendError);
    this.sent.push(email);
    return ok(undefined);
  }

  async verifyCode(email: string, code: string): GatewayResult<AdminSession> {
    if (code !== this.validCode) return fail('invalid_code');
    this.session = { userId: `id-${email}`, email };
    return ok(this.session);
  }

  async isAdmin(): GatewayResult<boolean> {
    if (this.whoamiError) return fail(this.whoamiError);
    return ok(this.session?.email ? this.admins.has(this.session.email) : false);
  }

  async signOut() {
    this.signOuts += 1;
    this.session = null;
  }
}
