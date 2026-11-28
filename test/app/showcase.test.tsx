import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { searchListings } from '@/lib/api';
import { filterStore } from '@/lib/filter-store';
import { listingCache } from '@/lib/listing-cache';

import { mockAuth, signIn, signOutState } from '../auth-mock';
import { mockRouter } from '../expo-router-mock';
import { listing } from '../fixtures';
import ShowcaseScreen from '@/app/index';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api');

const search = searchListings as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  signOutState();
  search.mockResolvedValue([listing()]);
});

it('shows the guest showcase with a sign-in link and caches results', async () => {
  await render(<ShowcaseScreen />);
  expect(await screen.findByText('Looking for a calm home')).toBeOnTheScreen();
  expect(screen.getByText('Sign in')).toBeOnTheScreen();
  expect(screen.getByText(/visible after you sign in/)).toBeOnTheScreen();
  expect(listingCache.get('l1')?.title).toBe('Looking for a calm home');
});

it('shows inbox and profile links and hides the banner for trusted members', async () => {
  signIn();
  await render(<ShowcaseScreen />);
  await screen.findByText('Looking for a calm home');
  expect(screen.getByText('Requests')).toBeOnTheScreen();
  expect(screen.getByText('My profile')).toBeOnTheScreen();
  expect(screen.queryByText(/visible after you sign in/)).toBeNull();
  expect(mockAuth.account?.trusted).toBe(true);
});

it('opens the filters screen and reloads when filters change', async () => {
  await render(<ShowcaseScreen />);
  await screen.findByText('Looking for a calm home');
  await fireEvent.press(screen.getByText('Filters'));
  expect(mockRouter.push).toHaveBeenCalledWith('/filters');
  await act(async () => filterStore.set({ country: 'IT', noPets: true }));
  await waitFor(() => expect(search).toHaveBeenLastCalledWith({ country: 'IT', noPets: true }));
  expect(screen.getByText('Filters (2)')).toBeOnTheScreen();
  await act(async () => filterStore.set({}));
});

it('shows an empty state', async () => {
  search.mockResolvedValue([]);
  await render(<ShowcaseScreen />);
  expect(await screen.findByText(/No listings/)).toBeOnTheScreen();
});

it('shows an error and recovers on pull-to-refresh', async () => {
  search.mockRejectedValueOnce(new Error('offline'));
  await render(<ShowcaseScreen />);
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
  const list = screen.getByTestId('listings');
  await act(async () => list.props.refreshControl.props.onRefresh());
  expect(await screen.findByText('Looking for a calm home')).toBeOnTheScreen();
  expect(screen.queryByText(/Something went wrong/)).toBeNull();
});
