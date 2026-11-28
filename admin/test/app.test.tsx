import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from '../src/application/authService';
import { ModerationService } from '../src/application/moderationService';
import type { Language } from '../src/i18n/i18n';
import { App } from '../src/ui/App';
import { FakeAuthGateway, FakeModerationGateway, makeAccount, makeReport } from './fakes';

let moderation: FakeModerationGateway;
let auth: FakeAuthGateway;

function renderApp({ signedIn = true, language = 'en' as Language, pageSize = 50 } = {}) {
  if (signedIn) auth.session = { userId: 'admin', email: 'admin@example.org' };
  const services = { moderation: new ModerationService(moderation, pageSize), auth: new AuthService(auth) };
  return { user: userEvent.setup(), ...render(<App services={services} initialLanguage={language} />) };
}

beforeEach(() => {
  moderation = new FakeModerationGateway();
  auth = new FakeAuthGateway();
  moderation.accounts.set('user-1', makeAccount());
});

describe('sign-in', () => {
  it('signs an admin in with an emailed code', async () => {
    const { user } = renderApp({ signedIn: false });
    await user.type(await screen.findByLabelText('Email'), 'admin@example.org');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('We sent a code to admin@example.org.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code from the email'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The code is wrong or has expired.');
    await user.clear(screen.getByLabelText('Code from the email'));
    await user.type(screen.getByLabelText('Code from the email'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Report queue' })).toBeInTheDocument();
  });

  it('keeps members out', async () => {
    const { user } = renderApp({ signedIn: false });
    await user.type(await screen.findByLabelText('Email'), 'member@example.org');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Code from the email'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This account has no access to moderation.');
    expect(auth.session).toBeNull();
  });

  it('explains an invalid email and lets her change the address', async () => {
    const { user } = renderApp({ signedIn: false });
    await user.type(await screen.findByLabelText('Email'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the email address.');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'admin@example.org');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.click(await screen.findByRole('button', { name: 'Use another email' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('signs out', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Moderator sign-in' })).toBeInTheDocument();
    expect(auth.signOuts).toBe(1);
  });
});

describe('report queue', () => {
  it('shows serious reports first, with the snapshot', async () => {
    moderation.reports = [
      makeReport({ id: 'a', reason: 'fake', createdAt: new Date('2026-11-01') }),
      makeReport({
        id: 'b', reason: 'threat', createdAt: new Date('2026-11-02'), details: 'She threatened me',
        openReportsAgainst: 2, reportedIsSuspended: true,
        snapshot: { displayName: 'Olena', listingTitle: 'Home', listingText: 'About', requestMessage: 'Write me' },
      }),
    ];
    renderApp();
    const cards = await screen.findAllByRole('article');
    expect(within(cards[0]!).getByText('Threats')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Serious')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('She threatened me')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Open reports against this account: 2')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Suspended')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Write me')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('Fake')).toBeInTheDocument();
  });

  it('shows an empty queue and a deleted account', async () => {
    const { user } = renderApp();
    expect(await screen.findByText('No reports.')).toBeInTheDocument();
    moderation.reports = [makeReport({ status: 'resolved', reportedId: null, reportedDisplayName: null })];
    await user.click(screen.getByRole('tab', { name: 'Closed' }));
    expect(await screen.findByText('Account deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('moves a report through review to resolved', async () => {
    moderation.reports = [makeReport({ id: 'r1' })];
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Start review' }));
    expect(await screen.findByText('Reviewing')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Note (optional)'), 'confirmed');
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('No reports.')).toBeInTheDocument();
    expect(moderation.log.map((e) => e.reason)).toEqual(['', 'confirmed']);
  });

  it('shows a decision error', async () => {
    moderation.reports = [makeReport()];
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(moderation.calls).toContain('setReportStatus:dismissed'));
    moderation.reports = [makeReport({ id: 'gone' })];
    moderation.failWith = 'network';
    await user.click(screen.getByRole('tab', { name: 'Closed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('loads more pages', async () => {
    moderation.reports = [1, 2, 3].map((d) => makeReport({ id: `r${d}`, createdAt: new Date(`2026-11-0${d}`), details: `report ${d}` }));
    const { user } = renderApp({ pageSize: 2 });
    expect(await screen.findByText('report 2')).toBeInTheDocument();
    expect(screen.queryByText('report 3')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('report 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('reports a decision that the backend refuses', async () => {
    moderation.reports = [makeReport()];
    const { user } = renderApp();
    await screen.findByRole('article');
    moderation.failWith = 'not_admin';
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This account has no access to moderation.');
  });
});

describe('account panel', () => {
  async function openAccount() {
    moderation.reports = [makeReport()];
    const result = renderApp();
    await result.user.click(await screen.findByRole('button', { name: 'Account' }));
    await screen.findByRole('heading', { name: 'Account Olena' });
    return result;
  }

  it('suspends with a reason, then unsuspends', async () => {
    const { user } = await openAccount();
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give a reason (at least 3 characters).');
    await user.type(within(screen.getByRole('form', { name: 'Suspend' })).getByRole('textbox'), 'fake photos');
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Suspended: fake photos')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Done.');
    expect(screen.getByText('Blocks that members set stay in place.')).toBeInTheDocument();
    await user.type(within(screen.getByRole('form', { name: 'Unsuspend' })).getByRole('textbox'), 'appeal accepted');
    await user.click(screen.getByRole('button', { name: 'Unsuspend' }));
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(moderation.log.map((e) => e.action)).toEqual(['suspend_account', 'unsuspend_account']);
  });

  it('hides and restores the listing', async () => {
    const { user } = await openAccount();
    await user.type(within(screen.getByRole('form', { name: 'Hide listing' })).getByRole('textbox'), 'phone number in text');
    await user.click(screen.getByRole('button', { name: 'Hide listing' }));
    expect(await screen.findByText('Listing: Квартира в Києві (hidden)')).toBeInTheDocument();
    await user.type(within(screen.getByRole('form', { name: 'Restore listing (paused)' })).getByRole('textbox'), 'text fixed');
    await user.click(screen.getByRole('button', { name: 'Restore listing (paused)' }));
    expect(await screen.findByText('Listing: Квартира в Києві (paused)')).toBeInTheDocument();
  });

  it('describes automatic suspensions, admins and accounts without a listing', async () => {
    moderation.accounts.set('user-1', makeAccount({
      displayName: null, isSuspended: true, suspendedReason: 'auto: report r1', isAdmin: true, listing: null,
    }));
    moderation.reports = [makeReport()];
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Account' }));
    expect(await screen.findByRole('heading', { name: 'Account without a name' })).toBeInTheDocument();
    expect(screen.getByText('Suspended: automatically after a report')).toBeInTheDocument();
    expect(screen.getByText('Moderator')).toBeInTheDocument();
    expect(screen.getByText('No listing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
  });

  it('shows a load error and closes', async () => {
    moderation.reports = [makeReport({ reportedId: 'missing' })];
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account not found.');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('audit log and language', () => {
  it('lists actions newest first and pages', async () => {
    moderation.log = [1, 2, 3].map((id) => ({
      id, adminId: id === 1 ? null : 'admin-0001-aaaa', action: 'suspend_account' as const, targetUserId: id === 3 ? null : 'user-0001-bbbb',
      targetListingId: null, targetReportId: null, reason: `reason ${id}`, details: {}, createdAt: new Date('2026-11-28T12:00:00Z'),
    }));
    const { user } = renderApp({ pageSize: 2 });
    await user.click(await screen.findByRole('button', { name: 'Audit log' }));
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Account suspended');
    expect(items[0]).toHaveTextContent('reason 3');
    expect(items[1]).toHaveTextContent('account user-000');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('reason 1')).toBeInTheDocument();
    expect(screen.getByText(/deleted account/)).toBeInTheDocument();
  });

  it('shows an empty log', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Audit log' }));
    expect(await screen.findByText('No actions yet.')).toBeInTheDocument();
  });

  it('switches between Ukrainian and English', async () => {
    const { user } = renderApp({ language: 'uk' });
    expect(await screen.findByRole('heading', { name: 'Черга скарг' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Report queue' })).toBeInTheDocument();
  });
});
