import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { myRequests, respondToRequest } from '@/lib/api';
import type { ConnectionRequest } from '@/lib/types';

import { ME, signIn } from '../auth-mock';
import { mockRouter } from '../expo-router-mock';
import InboxScreen from '@/app/inbox';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api');

const req = (over: Partial<ConnectionRequest>): ConnectionRequest => ({
  id: 'r1',
  listing_id: 'l1',
  owner_id: ME,
  requester_id: 'other',
  message: 'Hi there',
  status: 'pending',
  created_at: '2026-11-20T10:00:00Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
  (myRequests as jest.Mock).mockResolvedValue([
    req({}),
    req({ id: 'r2', owner_id: 'owner-2', requester_id: ME, message: '', status: 'accepted' }),
  ]);
});

it('lists incoming requests and lets the owner accept', async () => {
  await render(<InboxScreen />);
  expect(await screen.findByText('Hi there')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Accept'));
  expect(respondToRequest).toHaveBeenCalledWith('r1', true);
  await waitFor(() => expect(myRequests).toHaveBeenCalledTimes(2));
});

it('lets the owner decline and report the requester', async () => {
  await render(<InboxScreen />);
  await screen.findByText('Hi there');
  await fireEvent.press(screen.getByText('Decline'));
  expect(respondToRequest).toHaveBeenCalledWith('r1', false);
  await fireEvent.press(screen.getByText('Report'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/report', params: { reportedId: 'other', requestId: 'r1' } });
});

it('shows sent requests without answer buttons', async () => {
  await render(<InboxScreen />);
  await screen.findByText('Hi there');
  await fireEvent.press(screen.getByText('Sent'));
  expect(screen.getByText(/Accepted/)).toBeOnTheScreen();
  expect(screen.queryByText('Accept')).toBeNull();
  await fireEvent.press(screen.getByText('Report'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/report', params: { reportedId: 'owner-2', requestId: 'r2' } });
  await fireEvent.press(screen.getByText('Incoming'));
  expect(screen.getByText('Hi there')).toBeOnTheScreen();
});

it('shows an empty state when loading fails', async () => {
  (myRequests as jest.Mock).mockRejectedValue(new Error('offline'));
  await render(<InboxScreen />);
  expect(await screen.findByText('No requests yet.')).toBeOnTheScreen();
});
