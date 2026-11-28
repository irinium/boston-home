import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { fetchMapListings } from '@/features/map/api';
import { filterStore } from '@/lib/filter-store';
import { listingCache } from '@/lib/listing-cache';

import { signIn, signOutState } from '../auth-mock';
import { mockRouter } from '../expo-router-mock';
import { listing } from '../fixtures';
import { animateToRegion } from '../react-native-maps-mock';
import MapScreen from '@/app/map';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/features/map/api');
jest.mock('react-native-maps', () => require('../react-native-maps-mock'));

const fetchMap = fetchMapListings as jest.Mock;

const rome = listing({ id: 'rome', title: 'Rome home', approx_lat: 41.91, approx_lng: 12.51 });
const romeToo = listing({ id: 'rome2', title: 'Second Rome home', approx_lat: 41.913, approx_lng: 12.515 });
const lisbon = listing({ id: 'lisbon', title: 'Lisbon home', approx_lat: 38.72, approx_lng: -9.14 });

const markers = () => screen.queryAllByTestId(/^marker-/);
const moveMap = (region: object) =>
  act(async () => screen.getByTestId('map').props.onRegionChangeComplete(region));

beforeEach(() => {
  jest.clearAllMocks();
  signOutState();
  filterStore.set({});
  fetchMap.mockResolvedValue([rome, romeToo, lisbon]);
});

it('asks guests to sign in and loads nothing', async () => {
  await render(<MapScreen />);
  expect(screen.getByText(/Sign in to see listings on the map/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Sign in'));
  expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
  expect(fetchMap).not.toHaveBeenCalled();
});

it('asks members who are not trusted yet to finish their profile', async () => {
  signIn({ trusted: false });
  await render(<MapScreen />);
  expect(screen.getByText(/visible to verified members/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('My profile'));
  expect(mockRouter.push).toHaveBeenCalledWith('/account');
  expect(fetchMap).not.toHaveBeenCalled();
});

it('shows clustered points to trusted members and opens a single listing', async () => {
  signIn();
  await render(<MapScreen />);
  await waitFor(() => expect(markers()).toHaveLength(2));
  expect(fetchMap).toHaveBeenCalledWith({ south: 33, west: -1, north: 63, east: 29 }, {});
  expect(screen.getByLabelText('Listings: 2')).toBeOnTheScreen();
  expect(listingCache.get('lisbon')?.title).toBe('Lisbon home');
  expect(screen.getByText(/approximate/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText('Listings: 1'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/listing/[id]', params: { id: 'lisbon' } });
});

it('zooms into a group, then lists it when zooming cannot split it', async () => {
  signIn();
  await render(<MapScreen />);
  await waitFor(() => expect(markers()).toHaveLength(2));
  await fireEvent.press(screen.getByLabelText('Listings: 2'));
  expect(animateToRegion).toHaveBeenCalledWith(expect.objectContaining({ latitude: expect.closeTo(41.9115), longitude: expect.closeTo(12.5125) }), 350);

  // Fully zoomed in: the two approximate points still share a marker.
  await moveMap({ latitude: 41.9115, longitude: 12.5125, latitudeDelta: 0.15, longitudeDelta: 0.15 });
  await waitFor(() => expect(fetchMap).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByTestId('map-loading')).toBeNull());
  await fireEvent.press(screen.getByLabelText('Listings: 2'));
  expect(screen.getByText('Listings here: 2')).toBeOnTheScreen();
  expect(screen.getByText('Second Rome home')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Close'));
  expect(screen.queryByText('Listings here: 2')).toBeNull();
});

it('does not reload for a tiny map jitter', async () => {
  signIn();
  await render(<MapScreen />);
  await waitFor(() => expect(markers()).toHaveLength(2));
  await moveMap({ latitude: 48.001, longitude: 14.001, latitudeDelta: 30, longitudeDelta: 30 });
  expect(fetchMap).toHaveBeenCalledTimes(1);
});

it('reloads when the filters change and opens the filters screen', async () => {
  signIn();
  await render(<MapScreen />);
  await waitFor(() => expect(fetchMap).toHaveBeenCalledTimes(1));
  await act(async () => filterStore.set({ noPets: true, offset: 20 }));
  await waitFor(() => expect(fetchMap).toHaveBeenLastCalledWith(expect.any(Object), { noPets: true }));
  await fireEvent.press(screen.getByText('Filters (1)'));
  expect(mockRouter.push).toHaveBeenCalledWith('/filters');
});

it('opens around the radius filter', async () => {
  signIn();
  filterStore.set({ lat: 41.9, lng: 12.5, radiusKm: 10 });
  await render(<MapScreen />);
  await waitFor(() => expect(fetchMap).toHaveBeenCalled());
  const [bounds] = fetchMap.mock.calls[0];
  expect(bounds.south).toBeCloseTo(41.9 - 0.1078, 3);
  expect(bounds.east).toBeCloseTo(12.5 + 0.1078, 3);
});

it('says when an area is empty or has more listings than one load', async () => {
  signIn();
  fetchMap.mockResolvedValueOnce([]);
  await render(<MapScreen />);
  expect(await screen.findByText('No listings in this area.')).toBeOnTheScreen();

  fetchMap.mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => listing({ id: `l${i}`, approx_lat: 45, approx_lng: 10 })));
  await moveMap({ latitude: 45, longitude: 10, latitudeDelta: 10, longitudeDelta: 10 });
  expect(await screen.findByText(/Zoom in to see them all/)).toBeOnTheScreen();
});

it('shows an error and retries', async () => {
  signIn();
  fetchMap.mockRejectedValueOnce(new Error('offline'));
  await render(<MapScreen />);
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(markers()).toHaveLength(2));
  expect(screen.queryByText(/Something went wrong/)).toBeNull();
});

it('ignores an answer for an area the user has already left', async () => {
  signIn();
  let answerFirst: (items: unknown[]) => void = () => {};
  fetchMap.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
  fetchMap.mockResolvedValueOnce([lisbon]);
  await render(<MapScreen />);
  await moveMap({ latitude: 38.7, longitude: -9.1, latitudeDelta: 5, longitudeDelta: 5 });
  await waitFor(() => expect(markers()).toHaveLength(1));
  await act(async () => answerFirst([rome, romeToo, lisbon]));
  expect(markers()).toHaveLength(1);
});
