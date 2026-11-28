export const REPORT_REASONS = [
  'is_man', 'threat', 'harassment', 'stalking', 'fake', 'inappropriate', 'underage', 'scam', 'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Statuses a moderator can move a report to (reopening is not allowed). */
export type ReportDecision = Exclude<ReportStatus, 'open'>;

export type ListingStatus = 'draft' | 'active' | 'paused' | 'hidden';

/** The same reasons the database treats as serious in `after_report`. */
const SERIOUS_REASONS: ReadonlySet<ReportReason> = new Set(['is_man', 'threat', 'stalking', 'underage']);

export interface ReportSnapshot {
  readonly displayName: string | null;
  readonly listingTitle: string | null;
  readonly listingText: string | null;
  readonly requestMessage: string | null;
}

export interface QueuedReport {
  readonly id: string;
  readonly reason: ReportReason;
  readonly details: string;
  readonly snapshot: ReportSnapshot;
  readonly status: ReportStatus;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly reportedId: string | null;
  readonly reportedDisplayName: string | null;
  readonly reportedIsSuspended: boolean;
  readonly listingId: string | null;
  readonly listingStatus: ListingStatus | null;
  readonly openReportsAgainst: number;
}

export const isSerious = (reason: ReportReason): boolean => SERIOUS_REASONS.has(reason);

export const isClosed = (status: ReportStatus): boolean => status === 'resolved' || status === 'dismissed';

/** Decisions that make sense from the current status. */
export function availableDecisions(status: ReportStatus): readonly ReportDecision[] {
  switch (status) {
    case 'open':
      return ['reviewing', 'resolved', 'dismissed'];
    case 'reviewing':
      return ['resolved', 'dismissed'];
    case 'resolved':
      return ['dismissed'];
    case 'dismissed':
      return ['resolved'];
  }
}

/**
 * Orders the queue for triage: serious reasons first, then accounts with more open reports,
 * then the oldest report. Pure and stable; never mutates its input.
 */
export function prioritise(reports: readonly QueuedReport[]): QueuedReport[] {
  return reports
    .map((report, index) => ({ report, index }))
    .sort((a, b) =>
      Number(isSerious(b.report.reason)) - Number(isSerious(a.report.reason))
      || b.report.openReportsAgainst - a.report.openReportsAgainst
      || a.report.createdAt.getTime() - b.report.createdAt.getTime()
      || a.index - b.index)
    .map(({ report }) => report);
}

/** Merges a new page into the loaded rows, dropping duplicates by id (a row can shift between pages). */
export function mergePage<T extends { readonly id: string | number }>(loaded: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(loaded.map((row) => row.id));
  return [...loaded, ...page.filter((row) => !seen.has(row.id))];
}
