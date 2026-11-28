import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import type { MapCanvasProps } from './map-canvas.types';

/** react-native-maps has no web map; the web build explains that the map is in the app. */
export function MapCanvas(_props: MapCanvasProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <ThemedText themeColor="textSecondary">{t('map.webUnavailable')}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
});
