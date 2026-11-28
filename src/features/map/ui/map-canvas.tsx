import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import type { MapCanvasProps } from './map-canvas.types';

/** Native map (Apple Maps on iOS, Google Maps on Android). Only draws what it is given. */
export function MapCanvas({ initialRegion, focus, clusters, onRegionChange, onPressCluster, markerLabel }: MapCanvasProps) {
  const theme = useTheme();
  const map = useRef<MapView>(null);

  useEffect(() => {
    if (focus) map.current?.animateToRegion(focus, 350);
  }, [focus]);

  return (
    <MapView
      ref={map}
      testID="map"
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      onRegionChangeComplete={(region) => onRegionChange(region)}
      showsUserLocation={false}
      showsPointsOfInterests={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}>
      {clusters.map((cluster) => (
        <Marker
          key={cluster.key}
          testID={`marker-${cluster.key}`}
          coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
          accessibilityLabel={markerLabel(cluster.ids.length)}
          tracksViewChanges={false}
          onPress={() => onPressCluster(cluster)}>
          <View
            style={[
              styles.bubble,
              cluster.ids.length > 1 && styles.group,
              { backgroundColor: cluster.ids.length > 1 ? theme.accent : theme.sage, borderColor: theme.background },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              {cluster.ids.length > 1 ? cluster.ids.length : '•'}
            </ThemedText>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  group: { minWidth: 36, height: 36, borderRadius: 18 },
});
