import { beforeEach, describe, expect, it } from 'vitest';

import { FakeAuthGateway, FakeModerationGateway, makeAccount, makeReport } from '../../test/fakes';
import { AuthService } from './authService';
import { ModerationService, PAGE_SIZE } from './moderationService';

describe('ModerationService', () => {
  let gateway: FakeModerationGateway;
  let service: ModerationService;

  beforeEach(() => {
    gateway = new FakeModerationGateway();
    gateway.accounts.set('user-1', makeAccount());
    service = new ModerationService(gateway, 2);
  });

  it('uses 50 rows per page by default', () => {
    expect(PAGE_SIZE).toBe(50);
  });

  it('pages through the queue with a cursor and stops at the last page', async () => {
    gateway.reports = [1, 2, 3].map((day) => makeReport({ id: `r${day}`, createdAt: new Date(`2026-11-0${day}`) }));
    const first = await service.loadQueue(['open']);
    expect(first.ok && first.value.rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    const cursor = first.ok ? first.value.next : null;
    expect(cursor).toEqual({ createdAt: new Date('2026-11-02'), id: 'r2' });
    const second = await service.loadQueue(['open'], cursor);
    expect(second.ok && second.value.rows.map((r) => r.id)).toEqual(['r3']);
    expect(second.ok && second.value.next).toBeNull();
  });

  it('passes gateway errors through', async () => {
    gateway.failWith = 'not_admin';
    expect(await service.loadQueue(['open'])).toEqual({ ok: false, error: 'not_admin' });
    expect(await service.loadAuditLog()).toEqual({ ok: false, error: 'not_admin' });
  });

  it('validates the reason before calling the backend', async () => {
    expect(await service.suspendAccount('user-1', ' x ')).toEqual({ ok: false, error: 'reason_required' });
    expect(gateway.calls).toEqual([]);
  });

  it('suspends and unsuspends with a trimmed reason', async () => {
    expect((await service.suspendAccount('user-1', '  fake photos  ')).ok).toBe(true);
    expect(gateway.accounts.get('user-1')?.suspendedReason).toBe('fake photos');
    expect(await service.suspendAccount('user-1', 'again')).toEqual({ ok: false, error: 'already_suspended' });
    expect((await service.unsuspendAccount('user-1', 'appeal accepted')).ok).toBe(true);
    expect(gateway.accounts.get('user-1')?.isSuspended).toBe(false);
  });

  it('hides and unhides a listing', async () => {
    expect((await service.hideListing('listing-1', 'contact details')).ok).toBe(true);
    expect(gateway.accounts.get('user-1')?.listing?.status).toBe('hidden');
    expect((await service.unhideListing('listing-1', 'fixed now')).ok).toBe(true);
    expect(gateway.accounts.get('user-1')?.listing?.status).toBe('paused');
  });

  it('decides reports with an optional note', async () => {
    const report = makeReport();
    gateway.reports = [report];
    expect((await service.decideReport(report.id, 'resolved')).ok).toBe(true);
    expect(await service.decideReport(report.id, 'dismissed', 'x'.repeat(501))).toEqual({ ok: false, error: 'reason_too_long' });
    expect(gateway.reports[0]?.status).toBe('resolved');
  });

  it('pages the audit log by id', async () => {
    await service.suspendAccount('user-1', 'one');
    await service.unsuspendAccount('user-1', 'two');
    await service.suspendAccount('user-1', 'three');
    const first = await service.loadAuditLog();
    expect(first.ok && first.value.rows.map((e) => e.reason)).toEqual(['three', 'two']);
    const next = first.ok ? first.value.next : null;
    expect(next).toBe(2);
    const second = await service.loadAuditLog(next, 'user-1');
    expect(second.ok && second.value.rows.map((e) => e.reason)).toEqual(['one']);
    expect(second.ok && second.value.next).toBeNull();
  });

  it('loads an account', async () => {
    expect(await service.loadAccount('nobody')).toEqual({ ok: false, error: 'account_not_found' });
    expect((await service.loadAccount('user-1')).ok).toBe(true);
  });
});

describe('AuthService', () => {
  let gateway: FakeAuthGateway;
  let auth: AuthService;

  beforeEach(() => {
    gateway = new FakeAuthGateway();
    auth = new AuthService(gateway);
  });

  it('sends a code to a normalised email', async () => {
    expect(await auth.sendCode(' Admin@Example.org ')).toEqual({ ok: true, value: 'admin@example.org' });
    expect(gateway.sent).toEqual(['admin@example.org']);
  });

  it('rejects an invalid email without calling the backend', async () => {
    expect(await auth.sendCode('nope')).toEqual({ ok: false, error: 'invalid_email' });
    expect(gateway.sent).toEqual([]);
  });

  it('passes on a failure to send', async () => {
    gateway.sendError = 'network';
    expect(await auth.sendCode('admin@example.org')).toEqual({ ok: false, error: 'network' });
  });

  it('admits an admin with the right code', async () => {
    const result = await auth.verifyCode('admin@example.org', '123 456');
    expect(result).toEqual({ ok: true, value: { userId: 'id-admin@example.org', email: 'admin@example.org' } });
  });

  it('rejects a malformed or wrong code', async () => {
    expect(await auth.verifyCode('admin@example.org', 'abc')).toEqual({ ok: false, error: 'invalid_code' });
    expect(await auth.verifyCode('admin@example.org', '654321')).toEqual({ ok: false, error: 'invalid_code' });
  });

  it('signs a member who is not an admin straight out', async () => {
    expect(await auth.verifyCode('member@example.org', '123456')).toEqual({ ok: false, error: 'not_admin' });
    expect(gateway.signOuts).toBe(1);
    expect(gateway.session).toBeNull();
  });

  it('signs out when the admin check itself fails', async () => {
    gateway.whoamiError = 'network';
    expect(await auth.verifyCode('admin@example.org', '123456')).toEqual({ ok: false, error: 'network' });
    expect(gateway.signOuts).toBe(1);
  });

  it('restores an admin session and drops anything else', async () => {
    expect(await auth.restore()).toBeNull();
    gateway.session = { userId: 'a', email: 'admin@example.org' };
    expect(await auth.restore()).toEqual({ userId: 'a', email: 'admin@example.org' });
    gateway.session = { userId: 'm', email: 'member@example.org' };
    expect(await auth.restore()).toBeNull();
    expect(gateway.signOuts).toBe(1);
  });

  it('signs out', async () => {
    await auth.signOut();
    expect(gateway.signOuts).toBe(1);
  });
});
