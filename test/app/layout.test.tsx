import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as RN from 'react-native';

import { usePushRegistration } from '@/features/notifications';

import { ME, signIn, signOutState } from '../auth-mock';
import RootLayout from '@/app/_layout';

jest.mock('@/providers/auth', () => require('../auth-mock'));
jest.mock('@/features/notifications', () => ({ usePushRegistration: jest.fn() }));

// The router mock renders a Stack.Screen's `headerRight`; here we only check that the
// layout renders for both auth states and both color schemes without crashing.
it.each([
  ['light', false],
  ['dark', true],
] as const)('renders in %s mode, signed in: %s', async (scheme, signedIn) => {
  jest.spyOn(RN, 'useColorScheme').mockReturnValue(scheme);
  if (signedIn) signIn();
  else signOutState();
  await render(
    <>
      <RootLayout />
      <Text>layout ok</Text>
    </>,
  );
  expect(screen.getByText('layout ok')).toBeOnTheScreen();
});

it('registers this device for pushes once she is signed in', async () => {
  signIn();
  await render(<RootLayout />);
  expect(usePushRegistration).toHaveBeenLastCalledWith(ME);
  signOutState();
  await render(<RootLayout />);
  expect(usePushRegistration).toHaveBeenLastCalledWith(undefined);
});
