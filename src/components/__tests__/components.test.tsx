import { fireEvent, render, screen } from '@testing-library/react-native';
import * as RN from 'react-native';

import { ThemedText } from '../themed-text';
import { ThemedView } from '../themed-view';
import { Button, Card, Chip, Field, Screen } from '../ui';

it('renders themed building blocks in light and dark mode', async () => {
  for (const scheme of ['light', 'dark'] as const) {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue(scheme);
    await render(
      <Screen>
        <ThemedView type="backgroundElement">
          <ThemedText type="title">Title</ThemedText>
          <ThemedText type="code">code</ThemedText>
          <ThemedText type="link">link</ThemedText>
        </ThemedView>
        <ThemedView>
          <Card>
            <ThemedText>inside</ThemedText>
          </Card>
        </ThemedView>
      </Screen>,
    );
    expect(screen.getByText('inside')).toBeOnTheScreen();
  }
});

it('Button calls onPress unless disabled', async () => {
  const onPress = jest.fn();
  await render(
    <>
      <Button label="Go" onPress={onPress} />
      <Button label="Off" variant="secondary" onPress={onPress} disabled />
      <Button label="Danger" variant="danger" onPress={onPress} />
    </>,
  );
  await fireEvent.press(screen.getByText('Go'));
  await fireEvent.press(screen.getByText('Off'));
  await fireEvent.press(screen.getByText('Danger'));
  expect(onPress).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
});

it('Chip exposes its checked state', async () => {
  const onPress = jest.fn();
  await render(
    <>
      <Chip label="Kids" selected onPress={onPress} />
      <Chip label="Pets" selected={false} onPress={onPress} />
    </>,
  );
  expect(screen.getByRole('checkbox', { name: 'Kids' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Pets' })).not.toBeChecked();
  await fireEvent.press(screen.getByText('Pets'));
  expect(onPress).toHaveBeenCalled();
});

it('Field is labelled for screen readers', async () => {
  const onChangeText = jest.fn();
  await render(<Field label="City" value="" onChangeText={onChangeText} multiline />);
  await fireEvent.changeText(screen.getByLabelText('City'), 'Roma');
  expect(onChangeText).toHaveBeenCalledWith('Roma');
});
