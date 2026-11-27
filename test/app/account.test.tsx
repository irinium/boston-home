import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { deleteAccount, setProfilePhoto, signedPhotoUrls, uploadPhoto } from '@/lib/api';

import { ME, mockAuth, signIn, signOutState } from '../auth-mock';
import { mockRouter } from '../expo-router-mock';
import AccountScreen from '@/app/account';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/lib/api');
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const pick = ImagePicker.launchImageLibraryAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (signedPhotoUrls as jest.Mock).mockResolvedValue(['https://signed/face.jpg']);
  (uploadPhoto as jest.Mock).mockResolvedValue(`${ME}/new.jpg`);
});

it('asks for a profile photo when there is none', async () => {
  signIn({ photo_path: null, trusted: false });
  await render(<AccountScreen />);
  expect(screen.getByText('Add a profile photo')).toBeOnTheScreen();
  expect(signedPhotoUrls).not.toHaveBeenCalled();
});

it('uploads a new profile photo and refreshes the account', async () => {
  signIn({ photo_path: null, trusted: false });
  pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///p.jpg' }] });
  await render(<AccountScreen />);
  await fireEvent.press(screen.getByText('Add a profile photo'));
  expect(uploadPhoto).toHaveBeenCalledWith(ME, 'profile-photos', 'file:///p.jpg');
  expect(setProfilePhoto).toHaveBeenCalledWith(ME, `${ME}/new.jpg`);
  expect(mockAuth.refreshAccount).toHaveBeenCalled();
});

it('shows the current photo and does nothing when picking is cancelled', async () => {
  signIn();
  pick.mockResolvedValue({ canceled: true });
  await render(<AccountScreen />);
  await act(async () => {});
  expect(signedPhotoUrls).toHaveBeenCalledWith('profile-photos', [`${ME}/face.jpg`]);
  await fireEvent.press(screen.getByText('Change photo'));
  expect(uploadPhoto).not.toHaveBeenCalled();
});

it('tells the user when the upload fails', async () => {
  signIn();
  pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///p.jpg' }] });
  (uploadPhoto as jest.Mock).mockRejectedValue(new Error('too big'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<AccountScreen />);
  await fireEvent.press(screen.getByText('Change photo'));
  expect(alert).toHaveBeenCalledWith('Could not upload the photo. Please try again.');
});

it('does not open the picker without a session', async () => {
  signOutState();
  await render(<AccountScreen />);
  expect(screen.getByText('—')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Add a profile photo'));
  expect(pick).not.toHaveBeenCalled();
});

it('navigates, signs out and deletes the account after confirmation', async () => {
  signIn();
  await render(<AccountScreen />);
  await fireEvent.press(screen.getByText('My listing'));
  expect(mockRouter.push).toHaveBeenCalledWith('/editor');
  await fireEvent.press(screen.getByText('Sign out'));
  expect(mockAuth.signOut).toHaveBeenCalled();

  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByText('Delete account'));
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons[1].onPress!());
  expect(deleteAccount).toHaveBeenCalled();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
});
