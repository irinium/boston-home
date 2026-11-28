import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { cancelMeeting, displayNames, myMeetings, myRequests, respondToRequest } from '@/lib/api';
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
  (myMeetings as jest.Mock).mockResolvedValue([]);
  (displayNames as jest.Mock).mockResolvedValue({ 'owner-2': 'Olena' });
});

/** Presses the confirming button of the last Alert. */
const confirmAlert = async (alert: jest.SpyInstance) => {
  const buttons = alert.mock.calls.at(-1)![2];
  await act(async () => buttons[1].onPress());
};

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
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByText('Decline'));
  expect(respondToRequest).not.toHaveBeenCalled();
  await confirmAlert(alert);
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
  await fireEvent.press(screen.getByText('Choose a meeting time'));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/book/[requestId]',
    params: { requestId: 'r2' },
  });
  await fireEvent.press(screen.getByText('Report'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/report', params: { reportedId: 'owner-2', requestId: 'r2' } });
  await fireEvent.press(screen.getByText('Incoming'));
  expect(screen.getByText('Hi there')).toBeOnTheScreen();
});

it('owners of accepted requests are pointed to their free time', async () => {
  (myRequests as jest.Mock).mockResolvedValue([req({ status: 'accepted' })]);
  await render(<InboxScreen />);
  await fireEvent.press(await screen.findByText('My free time'));
  expect(mockRouter.push).toHaveBeenCalledWith('/availability');
});

it('lists upcoming meetings, hides booking for them and cancels', async () => {
  (myMeetings as jest.Mock).mockResolvedValue([
    { id: 'm1', request_id: 'r2', owner_id: 'owner-2', requester_id: ME, starts_at: '2026-12-01T10:00:00Z', ends_at: '2026-12-01T10:30:00Z', status: 'scheduled' },
  ]);
  await render(<InboxScreen />);
  expect(await screen.findByText('Upcoming meetings')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Sent'));
  expect(screen.queryByText('Choose a meeting time')).toBeNull();
  expect(screen.getByText(/^Olena · /)).toBeOnTheScreen();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByText('Cancel meeting'));
  expect(cancelMeeting).not.toHaveBeenCalled();
  await confirmAlert(alert);
  expect(cancelMeeting).toHaveBeenCalledWith('m1');
  await fireEvent.press(screen.getAllByText('Report')[0]);
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/report', params: { reportedId: 'owner-2', requestId: 'r2' } });
});

it('tells the user when an answer fails', async () => {
  (respondToRequest as jest.Mock).mockRejectedValueOnce(new Error('gone'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<InboxScreen />);
  await fireEvent.press(await screen.findByText('Accept'));
  expect(alert).toHaveBeenCalledWith(expect.stringMatching(/Something went wrong/));
});

it('shows an empty state when loading fails', async () => {
  (myRequests as jest.Mock).mockRejectedValue(new Error('offline'));
  (myMeetings as jest.Mock).mockRejectedValue(new Error('offline'));
  await render(<InboxScreen />);
  expect(await screen.findByText('No requests yet.')).toBeOnTheScreen();
});
