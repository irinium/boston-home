import { describe, expect, it, vi } from 'vitest';

import type { Reason } from '../domain/reason';
import type { RpcClient, RpcResponse } from './rpc';
import { callRpc, toErrorCode } from './rpc';
import { voidSchema } from './schemas';
import { SupabaseAuthGateway, type AuthClient } from './supabaseAuthGateway';
import { SupabaseModerationGateway } from './supabaseModerationGateway';

const client = (response: RpcResponse | Error) => {
  const rpc = vi.fn((): PromiseLike<RpcResponse> =>
    (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  return { rpc } satisfies RpcClient;
};

const reportRow = {
  id: 'r1',
  reason: 'threat',
  details: 'she wrote threats',
  snapshot: { display_name: 'Olena', listing: { title: 'Home', about: 'About', looking_for: 'Looking' }, request_message: 'Hi' },
  status: 'open',
  created_at: '2026-11-01T10:00:00Z',
  resolved_at: null,
  reported_id: 'u1',
  reported_display_name: 'Olena',
  reported_is_suspended: false,
  listing_id: 'l1',
  listing_status: 'active',
  open_reports_against: 2,
};

const reason = 'fake photos' as Reason;

describe('callRpc', () => {
  it('maps returned errors, thrown errors and network failures to codes', async () => {
    expect(await callRpc(client({ data: null, error: { message: 'not_admin' } }), 'f', {}, voidSchema))
      .toEqual({ ok: false, error: 'not_admin' });
    expect(await callRpc(client(new Error('TypeError: Failed to fetch')), 'f', {}, voidSchema))
      .toEqual({ ok: false, error: 'network' });
    const throwsString = { rpc: () => Promise.reject('boom') } as unknown as RpcClient;
    expect(await callRpc(throwsString, 'f', {}, voidSchema)).toEqual({ ok: false, error: 'unexpected' });
  });

  it('rejects payloads that do not match the schema', async () => {
    const gateway = new SupabaseModerationGateway(client({ data: [{ id: 1 }], error: null }));
    expect(await gateway.reportQueue({ statuses: ['open'], after: null, limit: 10 })).toEqual({ ok: false, error: 'unexpected' });
    const badDate = new SupabaseModerationGateway(client({ data: [{ ...reportRow, created_at: 'nope' }], error: null }));
    expect(await badDate.reportQueue({ statuses: ['open'], after: null, limit: 10 })).toEqual({ ok: false, error: 'unexpected' });
  });

  it('recognises other network messages', () => {
    expect(toErrorCode({ message: 'Network request failed' })).toBe('network');
    expect(toErrorCode({ message: 'Load failed' })).toBe('network');
  });
});

describe('SupabaseModerationGateway', () => {
  it('maps the queue arguments and rows', async () => {
    const rpc = client({ data: [reportRow], error: null });
    const gateway = new SupabaseModerationGateway(rpc);
    const result = await gateway.reportQueue({
      statuses: ['open', 'reviewing'],
      after: { createdAt: new Date('2026-10-01T00:00:00Z'), id: 'r0' },
      limit: 50,
    });
    expect(rpc.rpc).toHaveBeenCalledWith('admin_report_queue', {
      p_statuses: ['open', 'reviewing'],
      p_after_created_at: '2026-10-01T00:00:00.000Z',
      p_after_id: 'r0',
      p_limit: 50,
    });
    expect(result).toEqual({
      ok: true,
      value: [{
        id: 'r1',
        reason: 'threat',
        details: 'she wrote threats',
        snapshot: { displayName: 'Olena', listingTitle: 'Home', listingText: 'About\n\nLooking', requestMessage: 'Hi' },
        status: 'open',
        createdAt: new Date('2026-11-01T10:00:00Z'),
        resolvedAt: null,
        reportedId: 'u1',
        reportedDisplayName: 'Olena',
        reportedIsSuspended: false,
        listingId: 'l1',
        listingStatus: 'active',
        openReportsAgainst: 2,
      }],
    });
  });

  it('accepts an empty snapshot from a report on a deleted account', async () => {
    const rpc = client({ data: [{ ...reportRow, snapshot: {}, reported_id: null, reported_display_name: null, listing_id: null, listing_status: null }], error: null });
    const result = await new SupabaseModerationGateway(rpc).reportQueue({ statuses: ['open'], after: null, limit: 1 });
    expect(rpc.rpc).toHaveBeenCalledWith('admin_report_queue', expect.objectContaining({ p_after_created_at: null, p_after_id: null }));
    expect(result.ok && result.value[0]?.snapshot).toEqual({ displayName: null, listingTitle: null, listingText: null, requestMessage: null });
  });

  it('maps an account summary', async () => {
    const rpc = client({
      data: {
        id: 'u1', display_name: null, created_at: '2026-10-01T00:00:00Z', verification_status: 'verified',
        is_suspended: true, suspended_reason: 'auto: report r1', is_admin: false, listing: null,
        open_reports: 1, total_reports: 3,
      },
      error: null,
    });
    const result = await new SupabaseModerationGateway(rpc).account('u1');
    expect(rpc.rpc).toHaveBeenCalledWith('admin_account', { p_user_id: 'u1' });
    expect(result).toEqual({
      ok: true,
      value: {
        id: 'u1', displayName: null, createdAt: new Date('2026-10-01T00:00:00Z'), verificationStatus: 'verified',
        isSuspended: true, suspendedReason: 'auto: report r1', isAdmin: false, listing: null, openReports: 1, totalReports: 3,
      },
    });
  });

  it.each([
    ['suspendAccount', 'admin_suspend_account', { p_user_id: 'u1', p_reason: reason }],
    ['unsuspendAccount', 'admin_unsuspend_account', { p_user_id: 'u1', p_reason: reason }],
    ['hideListing', 'admin_hide_listing', { p_listing_id: 'u1', p_reason: reason }],
    ['unhideListing', 'admin_unhide_listing', { p_listing_id: 'u1', p_reason: reason }],
  ] as const)('%s calls %s', async (method, fn, args) => {
    const rpc = client({ data: null, error: null });
    expect(await new SupabaseModerationGateway(rpc)[method]('u1', reason)).toEqual({ ok: true, value: undefined });
    expect(rpc.rpc).toHaveBeenCalledWith(fn, args);
  });

  it('sets a report status', async () => {
    const rpc = client({ data: null, error: null });
    await new SupabaseModerationGateway(rpc).setReportStatus('r1', 'dismissed', 'duplicate');
    expect(rpc.rpc).toHaveBeenCalledWith('admin_set_report_status', { p_report_id: 'r1', p_status: 'dismissed', p_note: 'duplicate' });
  });

  it('maps the audit log', async () => {
    const rpc = client({
      data: [{
        id: 7, admin_id: null, action: 'hide_listing', target_user_id: 'u1', target_listing_id: 'l1',
        target_report_id: null, reason: 'contacts', details: { previous_status: 'active' }, created_at: '2026-11-28T12:00:00Z',
      }],
      error: null,
    });
    const result = await new SupabaseModerationGateway(rpc).auditLog({ beforeId: 10, targetUserId: null, limit: 5 });
    expect(rpc.rpc).toHaveBeenCalledWith('admin_moderation_log', { p_before_id: 10, p_target_user_id: null, p_limit: 5 });
    expect(result.ok && result.value[0]).toEqual({
      id: 7, adminId: null, action: 'hide_listing', targetUserId: 'u1', targetListingId: 'l1', targetReportId: null,
      reason: 'contacts', details: { previous_status: 'active' }, createdAt: new Date('2026-11-28T12:00:00Z'),
    });
  });
});

describe('SupabaseAuthGateway', () => {
  const authClient = (overrides: Partial<AuthClient> = {}): AuthClient => ({
    getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.cd' } } } })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    signOut: vi.fn(async () => ({})),
    ...overrides,
  });

  it('reads the current session', async () => {
    expect(await new SupabaseAuthGateway(authClient(), client({ data: null, error: null })).currentSession())
      .toEqual({ userId: 'u1', email: 'a@b.cd' });
    const none = authClient({ getSession: async () => ({ data: { session: null } }) });
    expect(await new SupabaseAuthGateway(none, client({ data: null, error: null })).currentSession()).toBeNull();
  });

  it('never creates accounts when sending a code', async () => {
    const auth = authClient();
    expect(await new SupabaseAuthGateway(auth, client({ data: null, error: null })).sendCode('a@b.cd')).toEqual({ ok: true, value: undefined });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'a@b.cd', options: { shouldCreateUser: false } });
    const failing = authClient({ signInWithOtp: async () => ({ error: { message: 'Failed to fetch' } }) });
    expect(await new SupabaseAuthGateway(failing, client({ data: null, error: null })).sendCode('a@b.cd')).toEqual({ ok: false, error: 'network' });
  });

  it('verifies a code', async () => {
    const auth = authClient();
    const gateway = new SupabaseAuthGateway(auth, client({ data: null, error: null }));
    expect(await gateway.verifyCode('a@b.cd', '123456')).toEqual({ ok: true, value: { userId: 'u1', email: null } });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.cd', token: '123456', type: 'email' });
  });

  it('reports a wrong code, a missing user and a network failure', async () => {
    const wrong = authClient({ verifyOtp: async () => ({ data: { user: null }, error: { message: 'Token has expired' } }) });
    expect(await new SupabaseAuthGateway(wrong, client({ data: null, error: null })).verifyCode('a@b.cd', '1')).toEqual({ ok: false, error: 'invalid_code' });
    const noUser = authClient({ verifyOtp: async () => ({ data: { user: null }, error: null }) });
    expect(await new SupabaseAuthGateway(noUser, client({ data: null, error: null })).verifyCode('a@b.cd', '1')).toEqual({ ok: false, error: 'invalid_code' });
    const offline = authClient({ verifyOtp: async () => ({ data: { user: null }, error: { message: 'Failed to fetch' } }) });
    expect(await new SupabaseAuthGateway(offline, client({ data: null, error: null })).verifyCode('a@b.cd', '1')).toEqual({ ok: false, error: 'network' });
  });

  it('asks the database whether the caller is an admin', async () => {
    const rpc = client({ data: { user_id: 'u1', is_admin: true }, error: null });
    expect(await new SupabaseAuthGateway(authClient(), rpc).isAdmin()).toEqual({ ok: true, value: true });
    expect(rpc.rpc).toHaveBeenCalledWith('admin_whoami', {});
  });

  it('signs out', async () => {
    const auth = authClient();
    await new SupabaseAuthGateway(auth, client({ data: null, error: null })).signOut();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
