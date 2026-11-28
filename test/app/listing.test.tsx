import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { blockUser, signedPhotoUrls } from '@/lib/api';
import { listingCache } from '@/lib/listing-cache';
import { supabase } from '@/lib/supabase';

import { ME, signIn, signOutState } from '../auth-mock';
import { mockRouter, setParams } from '../expo-router-mock';
import { listing } from '../fixtures';
import ListingScreen from '@/app/listing/[id]';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api');
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const from = supabase.from as jest.Mock;

function row(data: unknown) {
  const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data }) };
  return q;
}

beforeEach(() => {
  jest.clearAllMocks();
  signOutState();
  setParams({ id: 'l1' });
  listingCache.put([
    listing({ target_city: 'Milano', target_country_code: 'IT', distance_band: '10_25', looking_for: 'Someone kind.' }),
  ]);
  from.mockReturnValue(row({ owner_id: 'owner-1', photo_paths: ['owner-1/a.jpg'] }));
  (signedPhotoUrls as jest.Mock).mockResolvedValue(['https://signed/a.jpg']);
});

it('says the listing is unavailable when it is not in the cache', async () => {
  setParams({ id: 'missing' });
  await render(<ListingScreen />);
  expect(screen.getByText(/no longer available/i)).toBeOnTheScreen();
});

it('shows text to guests, hides photos and sends them to sign-in', async () => {
  await render(<ListingScreen />);
  expect(screen.getByText('Looking for a calm home')).toBeOnTheScreen();
  expect(screen.getByText('Milano, IT')).toBeOnTheScreen();
  expect(screen.getByText('Someone kind.')).toBeOnTheScreen();
  expect(from).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('I’d like to meet'));
  expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
});

it('shows photos, report and block to trusted members', async () => {
  signIn();
  await render(<ListingScreen />);
  await screen.findByText('Block');
  expect(signedPhotoUrls).toHaveBeenCalledWith('listing-photos', ['owner-1/a.jpg']);

  await fireEvent.press(screen.getByText('I’d like to meet'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/request/[listingId]', params: { listingId: 'l1' } });

  await fireEvent.press(screen.getByText('Report'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/report', params: { reportedId: 'owner-1', listingId: 'l1' } });

  const alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByText('Block'));
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons[1].onPress!());
  expect(blockUser).toHaveBeenCalledWith(ME, 'owner-1');
  expect(mockRouter.back).toHaveBeenCalled();
});

it('handles a listing row that is not visible and listings without optional text', async () => {
  signIn();
  from.mockReturnValue(row(null));
  listingCache.put([listing({ id: 'l2', about: '', looking_for: '', has_children: false, photo_count: 0, age_band: null })]);
  setParams({ id: 'l2' });
  await render(<ListingScreen />);
  expect(screen.getByText('No children')).toBeOnTheScreen();
  expect(screen.queryByText('Block')).toBeNull();
});

it('shows household conditions as chips', async () => {
  listingCache.put([
    listing({
      id: 'l3',
      children_age_bands: ['4_11'],
      partner_children: 'welcome',
      pets: ['cat'],
      pet_allergy: true,
      smoking: 'outside_only',
      alcohol: 'no',
      diet: 'vegetarian',
      chronotype: 'night',
      work_mode: 'shifts',
      living_arrangement: 'my_place',
      relocation: 'no',
      move_in: '3_6_months',
      separate_rooms: true,
      expenses: 'proportional',
    }),
  ]);
  setParams({ id: 'l3' });
  await render(<ListingScreen />);
  for (const text of ['Conditions', '4–11 years', 'Partner’s children welcome', 'Cat', 'Pet allergy', 'Smoke outside only',
    'Don’t drink', 'Vegetarian', 'Night owl', 'Shifts', 'At my place', 'Not moving', 'In 3–6 months', 'Separate rooms',
    'In proportion to income']) {
    expect(screen.getByText(text)).toBeOnTheScreen();
  }
});

it('hides the conditions card when nothing is set', async () => {
  listingCache.put([listing({ id: 'l4', smoking: null })]);
  setParams({ id: 'l4' });
  await render(<ListingScreen />);
  expect(screen.queryByText('Conditions')).toBeNull();
});
