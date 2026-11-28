import type { AgeBand } from '@/lib/types';

const AGE: Record<AgeBand, string> = {
  '18_24': '18–24',
  '25_34': '25–34',
  '35_44': '35–44',
  '45_54': '45–54',
  '55_plus': '55+',
};

export const ageBandLabel = (band: AgeBand | null) => (band ? AGE[band] : null);

/** Maps a database error message to a known code, e.g. `rate_limited`. */
export function errorCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^[a-z_]+$/);
  return match ? match[0] : null;
}
