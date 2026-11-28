import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { fakeBackend, fakeDevice, fakeService } from '../../../test/notifications-fakes';

import { PushToggle } from './push-toggle';

jest.mock('./push-service', () => ({ pushService: {} }));

const toggle = () => screen.getByLabelText('Push notifications');

it('is hidden where push does not work', async () => {
  await render(<PushToggle service={fakeService(fakeDevice({ platform: null }).device)} />);
  expect(screen.queryByLabelText('Push notifications')).toBeNull();
});

it('shows the saved switch and switches push off', async () => {
  const backend = fakeBackend(true);
  await render(<PushToggle service={fakeService(fakeDevice().device, backend)} />);
  expect(await screen.findByText(/never show names/)).toBeOnTheScreen();
  expect(toggle()).toHaveProp('value', true);
  await fireEvent(toggle(), 'valueChange', false);
  expect(backend.setEnabled).toHaveBeenCalledWith(false);
  expect(toggle()).toHaveProp('value', false);
});

it('switches push on and points to the phone settings when notifications are blocked', async () => {
  const backend = fakeBackend(false);
  const { device } = fakeDevice({ permission: { granted: false, canAskAgain: false } });
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<PushToggle service={fakeService(device, backend)} />);
  await act(async () => {});
  await fireEvent(toggle(), 'valueChange', true);
  expect(backend.setEnabled).toHaveBeenCalledWith(true);
  expect(screen.getByText(/turned off for Boston Home/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Open settings'));
  expect(openSettings).toHaveBeenCalled();
});

it('says when the build has no push project', async () => {
  await render(<PushToggle service={fakeService(fakeDevice({ token: null }).device, fakeBackend(false))} />);
  await act(async () => {});
  await fireEvent(toggle(), 'valueChange', true);
  expect(screen.getByText(/not available in this version/)).toBeOnTheScreen();
});

it('rolls the switch back when saving fails', async () => {
  const backend = fakeBackend(true);
  backend.setEnabled.mockRejectedValueOnce(new Error('offline'));
  await render(<PushToggle service={fakeService(fakeDevice().device, backend)} />);
  await act(async () => {});
  await fireEvent(toggle(), 'valueChange', false);
  expect(toggle()).toHaveProp('value', true);
  expect(screen.getByText('Could not change the setting. Please try again.')).toBeOnTheScreen();
});

it('shows an error when the switch cannot be read', async () => {
  const backend = fakeBackend(true);
  backend.isEnabled.mockRejectedValueOnce(new Error('offline'));
  await render(<PushToggle service={fakeService(fakeDevice().device, backend)} />);
  expect(await screen.findByText('Could not change the setting. Please try again.')).toBeOnTheScreen();
});
