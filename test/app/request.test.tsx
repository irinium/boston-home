import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError, sendRequest } from '@/lib/api';

import { mockAuth, signIn } from '../auth-mock';
import { mockRouter, setParams } from '../expo-router-mock';
import RequestScreen from '@/app/request/[listingId]';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), sendRequest: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const send = sendRequest as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
  setParams({ listingId: 'l1' });
});

it('blocks sending while the message contains contact details', async () => {
  await render(<RequestScreen />);
  expect(screen.getByText(/only after the video meeting/)).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByDisplayValue(''), 'мій тг anna');
  expect(screen.getByText(/Please remove contact details/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('I’d like to meet'));
  expect(send).not.toHaveBeenCalled();
});

it('sends, refreshes credits and closes after a moment', async () => {
  jest.useFakeTimers();
  send.mockResolvedValue('req-1');
  await render(<RequestScreen />);
  await fireEvent.changeText(screen.getByDisplayValue(''), 'Hello!');
  await fireEvent.press(screen.getByText('I’d like to meet'));
  expect(send).toHaveBeenCalledWith('l1', 'Hello!');
  expect(mockAuth.refreshAccount).toHaveBeenCalled();
  expect(screen.getByText(/Request sent/)).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(1500));
  expect(mockRouter.back).toHaveBeenCalled();
  jest.useRealTimers();
});

it.each([
  ['rate_limited', /today’s request limit/],
  ['request_exists', /already sent a request/],
  ['something_new', /Something went wrong/],
])('shows a friendly message for %s', async (code, text) => {
  send.mockRejectedValue(new ApiError(code));
  await render(<RequestScreen />);
  await fireEvent.press(screen.getByText('I’d like to meet'));
  expect(await screen.findByText(text)).toBeOnTheScreen();
});

it('shows a generic message for network errors', async () => {
  send.mockRejectedValue(new Error('Network request failed'));
  await render(<RequestScreen />);
  await fireEvent.press(screen.getByText('I’d like to meet'));
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
});
