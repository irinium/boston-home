import type { ListingStatus } from './report';

export interface AccountSummary {
  readonly id: string;
  readonly displayName: string | null;
  readonly createdAt: Date;
  readonly verificationStatus: string;
  readonly isSuspended: boolean;
  readonly suspendedReason: string | null;
  readonly isAdmin: boolean;
  readonly listing: { readonly id: string; readonly status: ListingStatus; readonly title: string } | null;
  readonly openReports: number;
  readonly totalReports: number;
}

export interface AccountActions {
  readonly suspend: boolean;
  readonly unsuspend: boolean;
  readonly hideListing: boolean;
  readonly unhideListing: boolean;
}

/** Which buttons the account panel offers. The database enforces the same rules. */
export function availableAccountActions(account: AccountSummary): AccountActions {
  const listing = account.listing;
  return {
    suspend: !account.isSuspended && !account.isAdmin,
    unsuspend: account.isSuspended,
    hideListing: listing !== null && listing.status !== 'hidden',
    unhideListing: listing !== null && listing.status === 'hidden',
  };
}

/** Automatic suspensions from reports carry a machine reason such as `auto: report <id>`. */
export const isAutomaticSuspension = (reason: string | null): boolean => reason?.startsWith('auto:') ?? false;
