import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ListingCard } from '@/components/listing-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { type Cluster, clusterAction, clusterPoints } from '@/features/map/domain/cluster';
import { boundsKey, initialRegion, type Region, regionToBounds } from '@/features/map/domain/geo';
import { useMapListings } from '@/features/map/use-map-listings';
import { useTheme } from '@/hooks/use-theme';
import { activeFilterCount } from '@/lib/filter-store';
import { listingCache } from '@/lib/listing-cache';
import type { ListingSummary, SearchFilters } from '@/lib/types';

import { MapCanvas } from './map-canvas';

/** The map for trusted members: loads the visible area, clusters it and routes taps. */
export function ListingsMap({ filters }: { filters: SearchFilters }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [start] = useState(() => initialRegion(filters));
  const [region, setRegion] = useState(start);
  const [bounds, setBounds] = useState(() => regionToBounds(start));
  const [focus, setFocus] = useState<Region | null>(null);
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const { points, capped, error, loading, retry } = useMapListings(bounds, filters);
  const clusters = clusterPoints(points, region);
  const active = activeFilterCount(filters);
  const group = (groupIds ?? []).map((id) => listingCache.get(id)).filter((l): l is ListingSummary => !!l);

  const onRegionChange = (next: Region) => {
    setRegion(next);
    const nextBounds = regionToBounds(next);
    if (boundsKey(nextBounds) !== boundsKey(bounds)) setBounds(nextBounds);
  };

  const onPressCluster = (cluster: Cluster) => {
    const action = clusterAction(cluster, region, points);
    if (action.type === 'open') router.push({ pathname: '/listing/[id]', params: { id: action.id } });
    else if (action.type === 'zoom') setFocus(action.region);
    else setGroupIds(action.ids);
  };

  const status = loading ? null : error ? 'error' : capped ? 'capped' : points.length === 0 ? 'empty' : null;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <MapCanvas
        initialRegion={start}
        focus={focus}
        clusters={clusters}
        onRegionChange={onRegionChange}
        onPressCluster={onPressCluster}
        markerLabel={(count) => t('map.markerLabel', { count })}
      />

      <View style={styles.top} pointerEvents="box-none">
        <Button
          label={active > 0 ? `${t('filters.open')} (${active})` : t('filters.open')}
          variant="secondary"
          onPress={() => router.push('/filters')}
        />
        <Card style={styles.note}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('map.approximate')}
          </ThemedText>
          {loading && <ActivityIndicator testID="map-loading" />}
          {status === 'error' && (
            <>
              <ThemedText type="small">{t('common.error')}</ThemedText>
              <Button label={t('common.retry')} variant="secondary" onPress={retry} />
            </>
          )}
          {status === 'capped' && <ThemedText type="small">{t('map.capped')}</ThemedText>}
          {status === 'empty' && <ThemedText type="small">{t('map.empty')}</ThemedText>}
        </Card>
      </View>

      {group.length > 0 && (
        <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={styles.sheetHeader}>
            <ThemedText type="smallBold">{t('map.here', { count: group.length })}</ThemedText>
            <Button label={t('map.close')} variant="secondary" onPress={() => setGroupIds(null)} />
          </View>
          <ScrollView contentContainerStyle={{ gap: Spacing.three }}>
            {group.map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', top: Spacing.three, left: Spacing.three, right: Spacing.three, gap: Spacing.two },
  note: { gap: Spacing.two, padding: Spacing.three },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '50%',
    padding: Spacing.three,
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
