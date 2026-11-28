import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import EditorScreen from '@/app/editor';
import { getMyListing, saveMyListing, uploadPhoto } from '@/lib/api';
import { roughLocation } from '@/lib/location';

import { ME, mockAuth, signIn } from '../auth-mock';
import { mockRouter } from '../expo-router-mock';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api');
jest.mock('@/lib/location', () => ({ roughLocation: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const pick = ImagePicker.launchImageLibraryAsync as jest.Mock;
const locate = roughLocation as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
  (getMyListing as jest.Mock).mockResolvedValue(null);
});

it('fills a new listing with conditions and publishes it', async () => {
  await render(<EditorScreen />);
  await fireEvent.changeText(screen.getByLabelText('Title'), 'A calm home');
  await fireEvent.changeText(screen.getByLabelText('About me'), 'About me text');
  await fireEvent.changeText(screen.getByLabelText(/Who I’m looking for/), 'Looking for');
  await fireEvent.changeText(screen.getByLabelText(/^Country \(code/), 'it');
  await fireEvent.changeText(screen.getByLabelText('City'), 'Roma');
  await fireEvent.changeText(screen.getByLabelText('Country to live together (code)'), 'pl');
  await fireEvent.changeText(screen.getByLabelText('City to live together'), 'Kraków');
  await fireEvent.press(screen.getByText('Cat'));
  await fireEvent.press(screen.getByText('Non-smoker'));
  await fireEvent.press(screen.getByText('Vegan'));
  await fireEvent.press(screen.getByText('Early bird'));
  await fireEvent.press(screen.getByText('Work from home'));
  await fireEvent.press(screen.getByText('A new place'));
  await fireEvent.press(screen.getByText('Ready to move'));
  await fireEvent.press(screen.getByText('As soon as possible'));
  await fireEvent.press(screen.getByText('Split equally'));
  await fireEvent.press(screen.getByText('Sometimes'));
  await fireEvent.press(screen.getByText('Partner’s children welcome'));
  await fireEvent(screen.getByLabelText('Pet allergy'), 'valueChange', true);
  await fireEvent(screen.getByLabelText('Separate rooms'), 'valueChange', true);
  await fireEvent.press(screen.getByText('Publish'));
  expect(saveMyListing).toHaveBeenCalledWith(
    ME,
    expect.objectContaining({
      title: 'A calm home',
      country_code: 'IT',
      city: 'Roma',
      target_country_code: 'PL',
      target_city: 'Kraków',
      pets: ['cat'],
      smoking: 'no',
      diet: 'vegan',
      chronotype: 'early',
      work_mode: 'remote',
      living_arrangement: 'new_place',
      relocation: 'yes',
      move_in: 'asap',
      expenses: 'equal',
      alcohol: 'sometimes',
      partner_children: 'welcome',
      pet_allergy: true,
      separate_rooms: true,
    }),
    true,
  );
  expect(mockAuth.refreshAccount).toHaveBeenCalled();
  expect(mockRouter.back).toHaveBeenCalled();
});

it('clears optional choices and target fields again', async () => {
  await render(<EditorScreen />);
  await fireEvent.press(screen.getByText('Partner’s children welcome'));
  await fireEvent.press(screen.getByText('Partner’s children welcome'));
  await fireEvent.changeText(screen.getByLabelText('Country to live together (code)'), 'pl');
  await fireEvent.changeText(screen.getByLabelText('Country to live together (code)'), '');
  await fireEvent.changeText(screen.getByLabelText('City to live together'), 'K');
  await fireEvent.changeText(screen.getByLabelText('City to live together'), '');
  await fireEvent.press(screen.getByText('Save draft'));
  expect(saveMyListing).toHaveBeenCalledWith(
    ME,
    expect.objectContaining({ partner_children: 'any', target_country_code: null, target_city: null }),
    false,
  );
});

it('loads an existing listing and handles children', async () => {
  (getMyListing as jest.Mock).mockResolvedValue({
    id: 'l1',
    title: 'Mine',
    about: 'a',
    looking_for: 'b',
    country_code: 'PL',
    city: 'Kraków',
    has_children: false,
    children_count: 0,
    photo_paths: null,
    smoking: 'yes',
  });
  await render(<EditorScreen />);
  expect(await screen.findByDisplayValue('Mine')).toBeOnTheScreen();
  const kids = screen.getByLabelText('I have children');
  await fireEvent(kids, 'valueChange', true);
  expect(screen.getByDisplayValue('1')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('4–11 years'));
  await fireEvent.changeText(screen.getByDisplayValue('1'), '25x');
  expect(screen.getByDisplayValue('10')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByDisplayValue('10'), '');
  expect(screen.getByDisplayValue('0')).toBeOnTheScreen();
  await fireEvent(kids, 'valueChange', false);
  expect(screen.queryByText('4–11 years')).toBeNull();
  await fireEvent.press(screen.getByText('Save draft'));
  expect(saveMyListing).toHaveBeenCalledWith(
    ME,
    expect.objectContaining({ title: 'Mine', photo_paths: [], smoking: 'yes', children_age_bands: [] }),
    false,
  );
});

it('sets and clears an approximate map location', async () => {
  locate.mockResolvedValueOnce({ lat: 41.9, lng: 12.5 });
  await render(<EditorScreen />);
  await fireEvent.press(screen.getByText('Place on the map using my location'));
  expect(await screen.findByText('Map location set (approximate)')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Save draft'));
  expect(saveMyListing).toHaveBeenLastCalledWith(ME, expect.objectContaining({ approx_lat: 41.9, approx_lng: 12.5 }), false);
  await fireEvent.press(screen.getByText('Remove'));
  expect(screen.getByText('Place on the map using my location')).toBeOnTheScreen();
});

it('explains when location permission is refused or fails', async () => {
  locate.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('gps'));
  await render(<EditorScreen />);
  await fireEvent.press(screen.getByText('Place on the map using my location'));
  expect(await screen.findByText(/needs location permission/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Place on the map using my location'));
  expect(screen.getByText(/needs location permission/)).toBeOnTheScreen();
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
