export const MODERATION_ACTIONS = [
  'suspend_account', 'unsuspend_account', 'hide_listing', 'unhide_listing', 'set_report_status',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export interface AuditEntry {
  readonly id: number;
  readonly adminId: string | null;
  readonly action: ModerationAction;
  readonly targetUserId: string | null;
  readonly targetListingId: string | null;
  readonly targetReportId: string | null;
  readonly reason: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}
