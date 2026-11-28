import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as RN from 'react-native';

import { signIn, signOutState } from '../auth-mock';
import RootLayout from '@/app/_layout';

jest.mock('@/providers/auth', () => require('../auth-mock'));

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
