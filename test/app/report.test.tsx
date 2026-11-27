import { fireEvent, render, screen } from '@testing-library/react-native';

import { report } from '@/lib/api';

import { ME, signIn, signOutState } from '../auth-mock';
import { mockRouter, setParams } from '../expo-router-mock';
import ReportScreen from '@/app/report';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api');

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
  setParams({ reportedId: 'bad', requestId: 'r1' });
});

it('needs a reason before sending', async () => {
  await render(<ReportScreen />);
  await fireEvent.press(screen.getByText('Send report'));
  expect(report).not.toHaveBeenCalled();
});

it('sends a report with details and goes home', async () => {
  await render(<ReportScreen />);
  await fireEvent.press(screen.getByText('This is a man'));
  await fireEvent.changeText(screen.getByDisplayValue(''), 'Man on the video call');
  await fireEvent.press(screen.getByText('Send report'));
  expect(report).toHaveBeenCalledWith({
    me: ME,
    reportedId: 'bad',
    reason: 'is_man',
    details: 'Man on the video call',
    listingId: undefined,
    requestId: 'r1',
  });
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
});

it('shows an error when sending fails', async () => {
  (report as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await render(<ReportScreen />);
  await fireEvent.press(screen.getByText('Threats'));
  await fireEvent.press(screen.getByText('Send report'));
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
});

it('does nothing without a session', async () => {
  signOutState();
  await render(<ReportScreen />);
  await fireEvent.press(screen.getByText('Scam'));
  await fireEvent.press(screen.getByText('Send report'));
  expect(report).not.toHaveBeenCalled();
});
