/**
 * Every failure the panel can show. Database codes raised by the admin RPCs map one to one;
 * anything unknown becomes `unexpected` so internal messages never reach the screen.
 */
export const MODERATION_ERROR_CODES = [
  'not_admin',
  'reason_required',
  'reason_too_long',
  'account_not_found',
  'listing_not_found',
  'report_not_found',
  'target_is_admin',
  'already_suspended',
  'not_suspended',
  'already_hidden',
  'not_hidden',
  'invalid_status',
  'status_unchanged',
  'invalid_email',
  'invalid_code',
  'network',
  'unexpected',
] as const;

export type ModerationErrorCode = (typeof MODERATION_ERROR_CODES)[number];

const SERVER_CODES: readonly ModerationErrorCode[] = MODERATION_ERROR_CODES.filter(
  (code) => !['invalid_email', 'invalid_code', 'network', 'unexpected'].includes(code),
);

/** Finds the known code inside a database error message such as `ERROR: not_admin`. */
export function errorCodeFromMessage(message: string | null | undefined): ModerationErrorCode {
  if (!message) return 'unexpected';
  const words = new Set(message.toLowerCase().split(/[^a-z_]+/));
  return SERVER_CODES.find((code) => words.has(code)) ?? 'unexpected';
}
