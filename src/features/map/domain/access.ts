import type { MyAccount } from '@/lib/types';

/**
 * Who may see map points. The database enforces the same rule (`map_listings`); this only
 * decides which prompt to show instead of an error.
 */
export type MapAccess = 'signed_out' | 'not_trusted' | 'allowed';

export function mapAccess(signedIn: boolean, account: Pick<MyAccount, 'trusted'> | null): MapAccess {
  if (!signedIn) return 'signed_out';
  return account?.trusted ? 'allowed' : 'not_trusted';
}
