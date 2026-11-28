import { z } from 'zod';

import type { AccountSummary } from '../domain/account';
import { MODERATION_ACTIONS, type AuditEntry } from '../domain/auditLog';
import { REPORT_REASONS, REPORT_STATUSES, type QueuedReport } from '../domain/report';

const timestamp = z.string().transform((value, ctx) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: 'custom', message: 'invalid timestamp' });
    return z.NEVER;
  }
  return date;
});
const listingStatus = z.enum(['draft', 'active', 'paused', 'hidden']);
const text = z.string().nullish().transform((value) => value ?? null);

const snapshot = z
  .object({
    display_name: text,
    listing: z.object({ title: text, about: text, looking_for: text }).nullish(),
    request_message: text,
  })
  .partial()
  .transform((s) => ({
    displayName: s.display_name ?? null,
    listingTitle: s.listing?.title ?? null,
    listingText: [s.listing?.about, s.listing?.looking_for].filter(Boolean).join('\n\n') || null,
    requestMessage: s.request_message ?? null,
  }));

const reportRow = z
  .object({
    id: z.string(),
    reason: z.enum(REPORT_REASONS),
    details: z.string(),
    snapshot,
    status: z.enum(REPORT_STATUSES),
    created_at: timestamp,
    resolved_at: timestamp.nullable(),
    reported_id: z.string().nullable(),
    reported_display_name: text,
    reported_is_suspended: z.boolean(),
    listing_id: z.string().nullable(),
    listing_status: listingStatus.nullable(),
    open_reports_against: z.number().int(),
  })
  .transform((r): QueuedReport => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    snapshot: r.snapshot,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    reportedId: r.reported_id,
    reportedDisplayName: r.reported_display_name,
    reportedIsSuspended: r.reported_is_suspended,
    listingId: r.listing_id,
    listingStatus: r.listing_status,
    openReportsAgainst: r.open_reports_against,
  }));

export const reportQueueSchema = z.array(reportRow);

export const accountSchema = z
  .object({
    id: z.string(),
    display_name: text,
    created_at: timestamp,
    verification_status: z.string(),
    is_suspended: z.boolean(),
    suspended_reason: text,
    is_admin: z.boolean(),
    listing: z.object({ id: z.string(), status: listingStatus, title: z.string() }).nullable(),
    open_reports: z.number().int(),
    total_reports: z.number().int(),
  })
  .transform((a): AccountSummary => ({
    id: a.id,
    displayName: a.display_name,
    createdAt: a.created_at,
    verificationStatus: a.verification_status,
    isSuspended: a.is_suspended,
    suspendedReason: a.suspended_reason,
    isAdmin: a.is_admin,
    listing: a.listing,
    openReports: a.open_reports,
    totalReports: a.total_reports,
  }));

const auditRow = z
  .object({
    id: z.number().int(),
    admin_id: z.string().nullable(),
    action: z.enum(MODERATION_ACTIONS),
    target_user_id: z.string().nullable(),
    target_listing_id: z.string().nullable(),
    target_report_id: z.string().nullable(),
    reason: z.string(),
    details: z.record(z.string(), z.unknown()),
    created_at: timestamp,
  })
  .transform((e): AuditEntry => ({
    id: e.id,
    adminId: e.admin_id,
    action: e.action,
    targetUserId: e.target_user_id,
    targetListingId: e.target_listing_id,
    targetReportId: e.target_report_id,
    reason: e.reason,
    details: e.details,
    createdAt: e.created_at,
  }));

export const auditLogSchema = z.array(auditRow);

export const whoamiSchema = z.object({ is_admin: z.boolean() }).transform((w) => w.is_admin);

/** Void RPCs answer null (or nothing at all). */
export const voidSchema = z.unknown().transform((): void => undefined);
