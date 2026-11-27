import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { getMyListing, saveMyListing, uploadPhoto } from '@/lib/api';

import { ME, mockAuth, signIn } from '../auth-mock';
import { mockRouter } from '../expo-router-mock';
import EditorScreen from '@/app/editor';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api');
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const pick = ImagePicker.launchImageLibraryAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
  (getMyListing as jest.Mock).mockResolvedValue(null);
});

it('fills a new listing and publishes it', async () => {
  await render(<EditorScreen />);
  await fireEvent.changeText(screen.getByLabelText('Title'), 'A calm home');
  await fireEvent.changeText(screen.getByLabelText('About me'), 'About me text');
  await fireEvent.changeText(screen.getByLabelText(/Who I’m looking for/), 'Looking for');
  await fireEvent.changeText(screen.getByLabelText(/Country/), 'it');
  await fireEvent.changeText(screen.getByLabelText('City'), 'Roma');
  await fireEvent.press(screen.getByText('Publish'));
  expect(saveMyListing).toHaveBeenCalledWith(
    ME,
    expect.objectContaining({ title: 'A calm home', about: 'About me text', country_code: 'IT', city: 'Roma' }),
    true,
  );
  expect(mockAuth.refreshAccount).toHaveBeenCalled();
  expect(mockRouter.back).toHaveBeenCalled();
});

it('loads an existing listing and handles the children switch', async () => {
  (getMyListing as jest.Mock).mockResolvedValue({
    title: 'Mine',
    about: 'a',
    looking_for: 'b',
    country_code: 'PL',
    city: 'Kraków',
    has_children: false,
    children_count: 0,
    photo_paths: null,
  });
  await render(<EditorScreen />);
  expect(await screen.findByDisplayValue('Mine')).toBeOnTheScreen();
  await fireEvent(screen.getByRole('switch'), 'valueChange', true);
  expect(screen.getByDisplayValue('1')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByDisplayValue('1'), '25x');
  expect(screen.getByDisplayValue('10')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByDisplayValue('10'), '');
  expect(screen.getByDisplayValue('0')).toBeOnTheScreen();
  await fireEvent(screen.getByRole('switch'), 'valueChange', false);
  expect(screen.queryByDisplayValue('0')).toBeNull();
  await fireEvent.press(screen.getByText('Save draft'));
  expect(saveMyListing).toHaveBeenCalledWith(ME, expect.objectContaining({ title: 'Mine', photo_paths: [] }), false);
});

it('adds photos up to three and hides the button after that', async () => {
  (getMyListing as jest.Mock).mockResolvedValue({
    title: 'Mine', about: '', looking_for: '', country_code: 'PL', city: 'K', has_children: true, children_count: 2,
    photo_paths: ['a', 'b'],
  });
  pick.mockResolvedValueOnce({ canceled: true }).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.jpg' }] });
  (uploadPhoto as jest.Mock).mockResolvedValue(`${ME}/c.jpg`);
  await render(<EditorScreen />);
  await screen.findByDisplayValue('Mine');
  await fireEvent.press(screen.getByText('Add photo'));
  expect(uploadPhoto).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Add photo'));
  expect(uploadPhoto).toHaveBeenCalledWith(ME, 'listing-photos', 'file:///x.jpg');
  await waitFor(() => expect(screen.queryByText('Add photo')).toBeNull());
  expect(screen.getByText(/\(3\/3\)/)).toBeOnTheScreen();
});

it('shows errors for failed uploads and saves', async () => {
  pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.jpg' }] });
  (uploadPhoto as jest.Mock).mockRejectedValue(new Error('upload'));
  await render(<EditorScreen />);
  await fireEvent.press(screen.getByText('Add photo'));
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
  (saveMyListing as jest.Mock).mockRejectedValue(new Error('save'));
  await fireEvent.press(screen.getByText('Save draft'));
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
  expect(mockRouter.back).not.toHaveBeenCalled();
});

it('explains why publishing is disabled without a profile photo', async () => {
  signIn({ trusted: false, photo_path: null });
  await render(<EditorScreen />);
  expect(screen.getByText(/once you add a profile photo/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Publish'));
  expect(saveMyListing).not.toHaveBeenCalled();
});
