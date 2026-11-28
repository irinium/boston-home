import { fireEvent, render, screen } from '@testing-library/react-native';

import { fetchMyDataExport } from '@/features/legal/api';
import { PrivacyCard } from '@/features/legal/components/privacy-card';
import { deliverExport } from '@/features/legal/deliver';

import { mockRouter } from '../expo-router-mock';

jest.mock('@/features/legal/api');
jest.mock('@/features/legal/deliver');

const fetchExport = fetchMyDataExport as jest.Mock;
const deliver = deliverExport as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchExport.mockResolvedValue({ format: 'boston-home-export' });
  deliver.mockResolvedValue(true);
});

it('exports her data and confirms it', async () => {
  await render(<PrivacyCard />);
  await fireEvent.press(screen.getByText('Export my data'));
  expect(fetchExport).toHaveBeenCalledTimes(1);
  expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'application/json' }));
  expect(await screen.findByText('Your data is ready.')).toBeOnTheScreen();
});

it('shows an error when the export fails', async () => {
  fetchExport.mockRejectedValue(new Error('offline'));
  await render(<PrivacyCard />);
  await fireEvent.press(screen.getByText('Export my data'));
  expect(await screen.findByText('Could not export your data. Please try again.')).toBeOnTheScreen();
});

it('says nothing when she closes the share sheet', async () => {
  deliver.mockResolvedValue(false);
  await render(<PrivacyCard />);
  await fireEvent.press(screen.getByText('Export my data'));
  expect(screen.queryByText('Your data is ready.')).toBeNull();
  expect(screen.queryByText(/Could not export/)).toBeNull();
});

it('links to the Privacy Policy and the Terms', async () => {
  await render(<PrivacyCard />);
  await fireEvent.press(screen.getByText('Privacy Policy'));
  expect(mockRouter.push).toHaveBeenCalledWith('/legal/privacy');
  await fireEvent.press(screen.getByText('Terms of Use'));
  expect(mockRouter.push).toHaveBeenCalledWith('/legal/terms');
});
