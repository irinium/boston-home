import { describe, expect, it } from 'vitest';

import { makeAccount, makeReport } from '../../test/fakes';
import { availableAccountActions, isAutomaticSuspension } from './account';
import { parseEmail, parseOtp } from './email';
import { errorCodeFromMessage } from './errors';
import { parseNote, parseReason } from './reason';
import { availableDecisions, isClosed, isSerious, mergePage, prioritise } from './report';

describe('parseReason', () => {
  it('trims and accepts a reason of 3 to 500 characters', () => {
    expect(parseReason('  fake photos ')).toEqual({ ok: true, value: 'fake photos' });
    expect(parseReason('abc').ok).toBe(true);
    expect(parseReason('x'.repeat(500)).ok).toBe(true);
  });

  it('rejects blank, short and long reasons', () => {
    expect(parseReason('   ')).toEqual({ ok: false, error: 'reason_required' });
    expect(parseReason(' ab ')).toEqual({ ok: false, error: 'reason_required' });
    expect(parseReason('x'.repeat(501))).toEqual({ ok: false, error: 'reason_too_long' });
  });

  it('allows an empty note but keeps the length limit', () => {
    expect(parseNote('  ')).toEqual({ ok: true, value: '' });
    expect(parseNote('x'.repeat(501))).toEqual({ ok: false, error: 'reason_too_long' });
  });
});

describe('parseEmail and parseOtp', () => {
  it('normalises a valid email', () => {
    expect(parseEmail('  Admin@Example.ORG ')).toEqual({ ok: true, value: 'admin@example.org' });
  });

  it.each(['', 'admin', 'admin@', 'a b@c.d', `${'a'.repeat(250)}@b.cd`])('rejects %j', (input) => {
    expect(parseEmail(input)).toEqual({ ok: false, error: 'invalid_email' });
  });

  it('accepts 6 to 10 digits, ignoring spaces', () => {
    expect(parseOtp('123 456')).toEqual({ ok: true, value: '123456' });
    expect(parseOtp('12345').ok).toBe(false);
    expect(parseOtp('12345a').ok).toBe(false);
  });
});

describe('errorCodeFromMessage', () => {
  it('finds a known code inside a database message', () => {
    expect(errorCodeFromMessage('ERROR: not_admin')).toBe('not_admin');
    expect(errorCodeFromMessage('already_suspended')).toBe('already_suspended');
  });

  it('does not match a code that is only part of a word', () => {
    expect(errorCodeFromMessage('xnot_adminx')).toBe('unexpected');
  });

  it('never surfaces unknown or client-only codes from the server', () => {
    expect(errorCodeFromMessage('duplicate key value')).toBe('unexpected');
    expect(errorCodeFromMessage('invalid_email')).toBe('unexpected');
    expect(errorCodeFromMessage(null)).toBe('unexpected');
    expect(errorCodeFromMessage('')).toBe('unexpected');
  });
});

describe('reports', () => {
  it('treats the same reasons as serious as the database', () => {
    expect(['is_man', 'threat', 'stalking', 'underage'].every((r) => isSerious(r as never))).toBe(true);
    expect(isSerious('fake')).toBe(false);
    expect(isSerious('harassment')).toBe(false);
  });

  it('knows closed statuses', () => {
    expect(isClosed('resolved')).toBe(true);
    expect(isClosed('dismissed')).toBe(true);
    expect(isClosed('open')).toBe(false);
    expect(isClosed('reviewing')).toBe(false);
  });

  it('offers decisions that move a report forward and never back to open', () => {
    expect(availableDecisions('open')).toEqual(['reviewing', 'resolved', 'dismissed']);
    expect(availableDecisions('reviewing')).toEqual(['resolved', 'dismissed']);
    expect(availableDecisions('resolved')).toEqual(['dismissed']);
    expect(availableDecisions('dismissed')).toEqual(['resolved']);
  });

  it('prioritises serious reasons, then repeat offenders, then the oldest', () => {
    const old = makeReport({ id: 'old', createdAt: new Date('2026-01-01') });
    const newer = makeReport({ id: 'newer', createdAt: new Date('2026-02-01') });
    const repeat = makeReport({ id: 'repeat', createdAt: new Date('2026-03-01'), openReportsAgainst: 3 });
    const serious = makeReport({ id: 'serious', reason: 'threat', createdAt: new Date('2026-04-01') });
    const input = [newer, repeat, old, serious];
    expect(prioritise(input).map((r) => r.id)).toEqual(['serious', 'repeat', 'old', 'newer']);
    expect(input.map((r) => r.id)).toEqual(['newer', 'repeat', 'old', 'serious']);
  });

  it('keeps the original order for equal reports', () => {
    const at = new Date('2026-01-01');
    const a = makeReport({ id: 'a', createdAt: at });
    const b = makeReport({ id: 'b', createdAt: at });
    expect(prioritise([b, a]).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('merges pages without duplicates', () => {
    expect(mergePage([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }])).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});

describe('account actions', () => {
  it('offers suspend and hide for an active member', () => {
    expect(availableAccountActions(makeAccount())).toEqual({
      suspend: true, unsuspend: false, hideListing: true, unhideListing: false,
    });
  });

  it('offers unsuspend and unhide when both are in force', () => {
    const account = makeAccount({ isSuspended: true, listing: { id: 'l', status: 'hidden', title: 'T' } });
    expect(availableAccountActions(account)).toEqual({
      suspend: false, unsuspend: true, hideListing: false, unhideListing: true,
    });
  });

  it('never offers to suspend an admin and has no listing actions without a listing', () => {
    expect(availableAccountActions(makeAccount({ isAdmin: true, listing: null }))).toEqual({
      suspend: false, unsuspend: false, hideListing: false, unhideListing: false,
    });
  });

  it('recognises automatic suspensions', () => {
    expect(isAutomaticSuspension('auto: report 123')).toBe(true);
    expect(isAutomaticSuspension('fake photos')).toBe(false);
    expect(isAutomaticSuspension(null)).toBe(false);
  });
});
