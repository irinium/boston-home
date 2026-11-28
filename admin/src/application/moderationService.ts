import type { AccountSummary } from '../domain/account';
import type { AuditEntry } from '../domain/auditLog';
import type { ModerationErrorCode } from '../domain/errors';
import { parseNote, parseReason, type Reason } from '../domain/reason';
import type { QueuedReport, ReportDecision, ReportStatus } from '../domain/report';
import { fail, ok, type Result } from '../domain/result';
import type { GatewayResult, ModerationGateway, QueueCursor } from './ports';

export const PAGE_SIZE = 50;

export interface Page<T, C> {
  readonly rows: T[];
  /** Pass back to load the next page; null when this was the last one. */
  readonly next: C | null;
}

type Outcome<T = void> = Promise<Result<T, ModerationErrorCode>>;

/** Use cases of the moderation panel. Validates input before any round trip. */
export class ModerationService {
  constructor(
    private readonly gateway: ModerationGateway,
    private readonly pageSize: number = PAGE_SIZE,
  ) {}

  async loadQueue(statuses: readonly ReportStatus[], after: QueueCursor | null = null): Outcome<Page<QueuedReport, QueueCursor>> {
    const result = await this.gateway.reportQueue({ statuses, after, limit: this.pageSize });
    if (!result.ok) return result;
    const rows = result.value;
    const last = rows.at(-1);
    const next = rows.length === this.pageSize && last ? { createdAt: last.createdAt, id: last.id } : null;
    return ok({ rows, next });
  }

  loadAccount(userId: string): GatewayResult<AccountSummary> {
    return this.gateway.account(userId);
  }

  suspendAccount(userId: string, reason: string): Outcome {
    return this.withReason(reason, (why) => this.gateway.suspendAccount(userId, why));
  }

  unsuspendAccount(userId: string, reason: string): Outcome {
    return this.withReason(reason, (why) => this.gateway.unsuspendAccount(userId, why));
  }

  hideListing(listingId: string, reason: string): Outcome {
    return this.withReason(reason, (why) => this.gateway.hideListing(listingId, why));
  }

  unhideListing(listingId: string, reason: string): Outcome {
    return this.withReason(reason, (why) => this.gateway.unhideListing(listingId, why));
  }

  async decideReport(reportId: string, decision: ReportDecision, note: string = ''): Outcome {
    const parsed = parseNote(note);
    if (!parsed.ok) return parsed;
    return this.gateway.setReportStatus(reportId, decision, parsed.value);
  }

  async loadAuditLog(beforeId: number | null = null, targetUserId: string | null = null): Outcome<Page<AuditEntry, number>> {
    const result = await this.gateway.auditLog({ beforeId, targetUserId, limit: this.pageSize });
    if (!result.ok) return result;
    const rows = result.value;
    const last = rows.at(-1);
    return ok({ rows, next: rows.length === this.pageSize && last ? last.id : null });
  }

  private async withReason(input: string, action: (reason: Reason) => GatewayResult<void>): Outcome {
    const reason = parseReason(input);
    return reason.ok ? action(reason.value) : fail(reason.error);
  }
}
