import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import AvailabilityScreen from '@/app/availability';
import { addSlot, ApiError, availability, deleteSlot } from '@/lib/api';

import { ME, signIn } from '../auth-mock';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  addSlot: jest.fn(),
  availability: jest.fn(),
  deleteSlot: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
  (availability as jest.Mock).mockResolvedValue([]);
});

it('shows an empty state and adds a slot for the chosen day, hour and length', async () => {
  await render(<AvailabilityScreen />);
  expect(await screen.findByText('No free time yet.')).toBeOnTheScreen();
  const add = screen.getByText('Add');
  await fireEvent.press(add);
  expect(addSlot).not.toHaveBeenCalled();

  const days = screen.getAllByRole('checkbox').slice(0, 14);
  await fireEvent.press(days[1]);
  await fireEvent.press(screen.getByText('10:00'));
  await fireEvent.press(screen.getByText('3 h'));
  await fireEvent.press(screen.getByText('Add'));
  const [me, start, end] = (addSlot as jest.Mock).mock.calls[0];
  expect(me).toBe(ME);
  expect(start.getHours()).toBe(10);
  expect((end.getTime() - start.getTime()) / 3_600_000).toBe(3);
  expect(availability).toHaveBeenCalledTimes(2);
});

it('lists slots and removes one', async () => {
  (availability as jest.Mock).mockResolvedValue([
    { id: 's1', owner_id: ME, starts_at: '2026-12-01T10:00:00Z', ends_at: '2026-12-01T12:00:00Z' },
  ]);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<AvailabilityScreen />);
  await fireEvent.press(await screen.findByText('Remove'));
  expect(deleteSlot).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][0]).toBe('Remove this free time?');
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  expect(deleteSlot).toHaveBeenCalledWith('s1');

  (deleteSlot as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  expect(alert).toHaveBeenLastCalledWith(expect.stringMatching(/Something went wrong/));
});

it('explains an overlapping slot', async () => {
  (addSlot as jest.Mock).mockRejectedValue(new ApiError('slot_overlaps'));
  await render(<AvailabilityScreen />);
  await fireEvent.press(screen.getAllByRole('checkbox')[1]);
  await fireEvent.press(screen.getByText('10:00'));
  await fireEvent.press(screen.getByText('1 h'));
  await fireEvent.press(screen.getByText('Add'));
  expect(await screen.findByText(/overlaps/)).toBeOnTheScreen();
});

it('shows an error when adding fails, and survives a failed load', async () => {
  (availability as jest.Mock).mockRejectedValue(new Error('offline'));
  (addSlot as jest.Mock).mockRejectedValue(new Error('past'));
  await render(<AvailabilityScreen />);
  await fireEvent.press(screen.getAllByRole('checkbox')[0]);
  await fireEvent.press(screen.getByText('Add'));
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
});
