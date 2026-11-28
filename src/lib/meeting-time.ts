/** The room opens this long before the start, and the meeting counts as over this long after it. */
export const JOIN_OPENS_MS = 10 * 60_000;
export const MEETING_OVER_MS = 12 * 3_600_000;

/** Error codes of the meeting-join function that the app explains in words. */
export const JOIN_ERRORS: readonly string[] = ['too_early', 'meeting_over', 'meeting_not_active', 'meeting_not_found', 'video_unavailable'];

/** Whether a meeting's room can be joined at `now` (ms). Mirrors the window in `meeting_for_join`. */
export function joinState(startsAt: string, now: number): 'waiting' | 'open' | 'over' {
  const start = Date.parse(startsAt);
  if (now < start - JOIN_OPENS_MS) return 'waiting';
  if (now > start + MEETING_OVER_MS) return 'over';
  return 'open';
}
