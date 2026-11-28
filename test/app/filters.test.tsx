import { fireEvent, render, screen } from '@testing-library/react-native';

import FiltersScreen from '@/app/filters';
import { filterStore } from '@/lib/filter-store';
import { roughLocation } from '@/lib/location';

import { mockRouter } from '../expo-router-mock';

jest.mock('@/lib/location', () => ({ roughLocation: jest.fn() }));

const locate = roughLocation as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  filterStore.set({});
});

it('applies every kind of filter and closes', async () => {
  locate.mockResolvedValue({ lat: 50.45, lng: 30.52 });
  await render(<FiltersScreen />);
  await fireEvent.changeText(screen.getByLabelText(/Country/), 'ua');
  await fireEvent(screen.getByLabelText('Near me'), 'valueChange', true);
  await fireEvent.press(await screen.findByText('50 km'));
  await fireEvent.press(screen.getByText('Nearest'));
  await fireEvent.press(screen.getByText('35–44'));
  await fireEvent.press(screen.getByText('Українська'));
  await fireEvent(screen.getByLabelText('With children'), 'valueChange', true);
  await fireEvent(screen.getByLabelText('Welcomes my children'), 'valueChange', true);
  await fireEvent(screen.getByLabelText('No pets'), 'valueChange', true);
  await fireEvent(screen.getByLabelText('Non-smoker'), 'valueChange', true);
  await fireEvent.press(screen.getByText('A new place'));
  await fireEvent.press(screen.getByText('As soon as possible'));
  await fireEvent.press(screen.getByText('Show'));
  expect(filterStore.get()).toEqual({
    country: 'UA',
    lat: 50.45,
    lng: 30.52,
    radiusKm: 50,
    sort: 'nearest',
    ageBands: ['35_44'],
    languages: ['uk'],
    hasChildren: true,
    iHaveChildren: true,
    noPets: true,
    noSmoking: true,
    living: ['new_place'],
    moveIn: ['asap'],
  });
  expect(mockRouter.back).toHaveBeenCalled();
});

it('drops a half-typed country and switches off "near me" with its sort', async () => {
  filterStore.set({ lat: 1, lng: 2, radiusKm: 25, sort: 'nearest', hasChildren: true });
  await render(<FiltersScreen />);
  await fireEvent.changeText(screen.getByLabelText(/Country/), 'u');
  await fireEvent.press(screen.getByText('25 km'));
  await fireEvent(screen.getByLabelText('Near me'), 'valueChange', false);
  expect(screen.queryByText('Nearest')).toBeNull();
  await fireEvent(screen.getByLabelText('With children'), 'valueChange', false);
  await fireEvent.press(screen.getByText('Show'));
  expect(filterStore.get()).toEqual({
    country: undefined,
    lat: undefined,
    lng: undefined,
    radiusKm: undefined,
    sort: 'newest',
    hasChildren: undefined,
  });
});

it('keeps a non-distance sort when switching off "near me"', async () => {
  filterStore.set({ lat: 1, lng: 2, sort: 'age' });
  await render(<FiltersScreen />);
  await fireEvent(screen.getByLabelText('Near me'), 'valueChange', false);
  await fireEvent.press(screen.getByText('Show'));
  expect(filterStore.get().sort).toBe('age');
});

it('explains when location is refused or fails', async () => {
  locate.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('gps'));
  await render(<FiltersScreen />);
  await fireEvent(screen.getByLabelText('Near me'), 'valueChange', true);
  expect(await screen.findByText(/needs location permission/)).toBeOnTheScreen();
  await fireEvent(screen.getByLabelText('Near me'), 'valueChange', true);
  expect(screen.getByText(/needs location permission/)).toBeOnTheScreen();
  expect(screen.queryByText('Radius')).toBeNull();
});

it('resets the draft', async () => {
  filterStore.set({ noPets: true, ageBands: ['18_24'] });
  await render(<FiltersScreen />);
  await fireEvent.press(screen.getByText('Reset'));
  await fireEvent.press(screen.getByText('Show'));
  expect(filterStore.get()).toEqual({ country: undefined });
});
