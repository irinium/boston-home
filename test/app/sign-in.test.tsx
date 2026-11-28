import { fireEvent, render, screen } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { mockAuth } from '../auth-mock';
import { mockRouter } from '../expo-router-mock';
import SignInScreen from '@/app/sign-in';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('expo-apple-authentication', () => {
  const { Pressable, Text } = require('react-native');
  return {
    isAvailableAsync: jest.fn(),
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 2 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>Apple</Text>
      </Pressable>
    ),
  };
});

const available = AppleAuthentication.isAvailableAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());


it('explains when Apple sign-in is unavailable', async () => {
  available.mockResolvedValue(false);
  await render(<SignInScreen />);
  expect(await screen.findByText(/works on iPhone/)).toBeOnTheScreen();
});

it('signs in with Apple and closes the modal', async () => {
  available.mockResolvedValue(true);
  await render(<SignInScreen />);
  await fireEvent.press(await screen.findByText('Apple'));
  expect(mockAuth.signInWithApple).toHaveBeenCalled();
  expect(mockRouter.back).toHaveBeenCalled();
});

it('stays open when there is nowhere to go back to', async () => {
  available.mockResolvedValue(true);
  mockRouter.canGoBack.mockReturnValueOnce(false);
  await render(<SignInScreen />);
  await fireEvent.press(await screen.findByText('Apple'));
  expect(mockRouter.back).not.toHaveBeenCalled();
});

it('ignores a cancelled sign-in but reports other errors', async () => {
  available.mockResolvedValue(true);
  mockAuth.signInWithApple.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ERR_REQUEST_CANCELED' }));
  await render(<SignInScreen />);
  await fireEvent.press(await screen.findByText('Apple'));
  expect(screen.queryByText(/Something went wrong/)).toBeNull();
  mockAuth.signInWithApple.mockRejectedValueOnce(new Error('network'));
  await fireEvent.press(screen.getByText('Apple'));
  expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
});

it('links to the Terms and the Privacy Policy before sign-in', async () => {
  available.mockResolvedValue(false);
  await render(<SignInScreen />);
  expect(screen.getByText(/By signing in you accept/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Terms of Use'));
  expect(mockRouter.push).toHaveBeenCalledWith('/legal/terms');
});
