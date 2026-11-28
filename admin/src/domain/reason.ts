import type { ModerationErrorCode } from './errors';
import { fail, ok, type Result } from './result';

export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

/** A moderator's written reason. Branded so an unchecked string cannot reach a use case. */
export type Reason = string & { readonly __brand: 'Reason' };

/** Mirrors `public.require_reason` in the database, so the panel can explain the rule before a round trip. */
export function parseReason(input: string): Result<Reason, Extract<ModerationErrorCode, 'reason_required' | 'reason_too_long'>> {
  const trimmed = input.trim();
  if (trimmed.length < REASON_MIN_LENGTH) return fail('reason_required');
  if (trimmed.length > REASON_MAX_LENGTH) return fail('reason_too_long');
  return ok(trimmed as Reason);
}

/** Notes on report decisions are optional but share the length limit. */
export function parseNote(input: string): Result<string, 'reason_too_long'> {
  const trimmed = input.trim();
  return trimmed.length > REASON_MAX_LENGTH ? fail('reason_too_long') : ok(trimmed);
}
