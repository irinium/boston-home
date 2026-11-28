import { render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import PrivacyScreen from '@/app/legal/privacy';
import TermsScreen from '@/app/legal/terms';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

it('shows the Privacy Policy with its draft notice and processors', async () => {
  await render(<PrivacyScreen />);
  expect(screen.getByRole('header', { name: 'Privacy Policy' })).toBeOnTheScreen();
  expect(screen.getByText(/Last updated: \d{4}-\d{2}-\d{2}/)).toBeOnTheScreen();
  expect(screen.getByText(/waiting for legal review/)).toBeOnTheScreen();
  expect(screen.getByText(/Frankfurt region/)).toBeOnTheScreen();
  expect(screen.getByText(/Nothing is recorded/)).toBeOnTheScreen();
});

it('shows the Terms in Ukrainian when the app is in Ukrainian', async () => {
  await i18n.changeLanguage('uk');
  await render(<TermsScreen />);
  expect(screen.getByRole('header', { name: 'Умови користування' })).toBeOnTheScreen();
  expect(screen.getByText(/Лише жінки віком від 18 років/)).toBeOnTheScreen();
});
