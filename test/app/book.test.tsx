import { fireEvent, render, screen } from '@testing-library/react-native';

import BookMeetingScreen from '@/app/book/[requestId]';
import { ApiError, bookableStarts, bookMeeting } from '@/lib/api';

import { mockRouter, setParams } from '../expo-router-mock';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  bookableStarts: jest.fn(),
  bookMeeting: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const inTwoDays = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(10, 0, 0, 0);
  return d;
};

beforeEach(() => {
  jest.clearAllMocks();
  setParams({ requestId: 'r1' });
  const start = inTwoDays();
  (bookableStarts as jest.Mock).mockResolvedValue([start, new Date(start.getTime() + 1_800_000)]);
});

it('offers the starts the database allows and books one', async () => {
  await render(<BookMeetingScreen />);
  const options = await screen.findAllByRole('checkbox');
  expect(options).toHaveLength(2);
  expect(bookableStarts).toHaveBeenCalledWith('r1');
  await fireEvent.press(screen.getByText('Book'));
  expect(bookMeeting).not.toHaveBeenCalled();
  await fireEvent.press(options[1]);
  await fireEvent.press(screen.getByText('Book'));
  const [requestId, start] = (bookMeeting as jest.Mock).mock.calls[0];
  expect(requestId).toBe('r1');
  expect(start.getHours()).toBe(10);
  expect(start.getMinutes()).toBe(30);
  expect(mockRouter.back).toHaveBeenCalled();
});

it.each([
  ['slot_taken', /just taken/],
  ['too_soon', /30 minutes/],
  ['weird', /Something went wrong/],
])('explains a %s error', async (code, text) => {
  (bookMeeting as jest.Mock).mockRejectedValue(new ApiError(code));
  await render(<BookMeetingScreen />);
  await fireEvent.press((await screen.findAllByRole('checkbox'))[0]);
  await fireEvent.press(screen.getByText('Book'));
  expect(await screen.findByText(text)).toBeOnTheScreen();
});

it('says when there is no free time, also when loading fails', async () => {
  (bookableStarts as jest.Mock).mockRejectedValue(new Error('offline'));
  await render(<BookMeetingScreen />);
  expect(await screen.findByText(/not marked any free time/)).toBeOnTheScreen();
});

it('shows a loading state until free time arrives', async () => {
  (bookableStarts as jest.Mock).mockReturnValue(new Promise(() => {}));
  const { unmount } = await render(<BookMeetingScreen />);
  expect(screen.getByText('Loading…')).toBeOnTheScreen();
  await unmount();
});
