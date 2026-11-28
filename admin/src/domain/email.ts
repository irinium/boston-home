import { fail, ok, type Result } from './result';

/** Deliberately loose: the OTP email is the real check. Rejects only obvious typos. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6,10}$/;

export function parseEmail(input: string): Result<string, 'invalid_email'> {
  const email = input.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? ok(email) : fail('invalid_email');
}

export function parseOtp(input: string): Result<string, 'invalid_code'> {
  const code = input.replace(/\s+/g, '');
  return OTP_PATTERN.test(code) ? ok(code) : fail('invalid_code');
}
