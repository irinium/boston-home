import type { AuditQuery, GatewayResult, ModerationGateway, QueueQuery } from '../application/ports';
import type { AccountSummary } from '../domain/account';
import type { AuditEntry } from '../domain/auditLog';
import type { Reason } from '../domain/reason';
import type { QueuedReport, ReportDecision } from '../domain/report';
import { callRpc, type RpcClient } from './rpc';
import { accountSchema, auditLogSchema, reportQueueSchema, voidSchema } from './schemas';

/** Adapter from the moderation port to the `admin_*` RPCs in `20261204000000_moderation.sql`. */
export class SupabaseModerationGateway implements ModerationGateway {
  constructor(private readonly client: RpcClient) {}

  reportQueue(query: QueueQuery): GatewayResult<QueuedReport[]> {
    return callRpc(this.client, 'admin_report_queue', {
      p_statuses: query.statuses,
      p_after_created_at: query.after?.createdAt.toISOString() ?? null,
      p_after_id: query.after?.id ?? null,
      p_limit: query.limit,
    }, reportQueueSchema);
  }

  account(userId: string): GatewayResult<AccountSummary> {
    return callRpc(this.client, 'admin_account', { p_user_id: userId }, accountSchema);
  }

  suspendAccount(userId: string, reason: Reason): GatewayResult<void> {
    return callRpc(this.client, 'admin_suspend_account', { p_user_id: userId, p_reason: reason }, voidSchema);
  }

  unsuspendAccount(userId: string, reason: Reason): GatewayResult<void> {
    return callRpc(this.client, 'admin_unsuspend_account', { p_user_id: userId, p_reason: reason }, voidSchema);
  }

  hideListing(listingId: string, reason: Reason): GatewayResult<void> {
    return callRpc(this.client, 'admin_hide_listing', { p_listing_id: listingId, p_reason: reason }, voidSchema);
  }

  unhideListing(listingId: string, reason: Reason): GatewayResult<void> {
    return callRpc(this.client, 'admin_unhide_listing', { p_listing_id: listingId, p_reason: reason }, voidSchema);
  }

  setReportStatus(reportId: string, status: ReportDecision, note: string): GatewayResult<void> {
    return callRpc(this.client, 'admin_set_report_status', { p_report_id: reportId, p_status: status, p_note: note }, voidSchema);
  }

  auditLog(query: AuditQuery): GatewayResult<AuditEntry[]> {
    return callRpc(this.client, 'admin_moderation_log', {
      p_before_id: query.beforeId,
      p_target_user_id: query.targetUserId,
      p_limit: query.limit,
    }, auditLogSchema);
  }
}
