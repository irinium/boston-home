import { render, screen } from '@testing-library/react-native';

import { MapCanvas } from './map-canvas.web';

it('explains on the web that the map is in the app', async () => {
  await render(
    <MapCanvas
      initialRegion={{ latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 }}
      focus={null}
      clusters={[]}
      onRegionChange={jest.fn()}
      onPressCluster={jest.fn()}
      markerLabel={String}
    />,
  );
  expect(screen.getByText(/iOS and Android app/)).toBeOnTheScreen();
});
