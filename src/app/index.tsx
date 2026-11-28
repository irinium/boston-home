import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';

import { ListingCard } from '@/components/listing-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { searchListings } from '@/lib/api';
import { activeFilterCount, useFilters } from '@/lib/filter-store';
import { listingCache } from '@/lib/listing-cache';
import type { ListingSummary } from '@/lib/types';
import { useAuth } from '@/providers/auth';

export default function ShowcaseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, account } = useAuth();
  const filters = useFilters();
  const [items, setItems] = useState<ListingSummary[]>([]);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Which request the shown items answer; loading while it differs from the current filters or reload.
  const [loadedFor, setLoadedFor] = useState<{ filters: typeof filters; key: number } | null>(null);
  const loading = loadedFor?.filters !== filters || loadedFor.key !== reloadKey;
  const active = activeFilterCount(filters);

  useEffect(() => {
    let current = true;
    searchListings(filters)
      .then((result) => {
        if (!current) return;
        listingCache.put(result);
        setItems(result);
        setError(false);
      })
      .catch(() => current && setError(true))
      .finally(() => current && setLoadedFor({ filters, key: reloadKey }));
    return () => {
      current = false;
    };
  }, [filters, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: Spacing.three }}>
              {session ? (
                <>
                  <Link href="/inbox" asChild>
                    <Pressable accessibilityRole="link">
                      <ThemedText type="linkPrimary">{t('inbox.title')}</ThemedText>
                    </Pressable>
                  </Link>
                  <Link href="/account" asChild>
                    <Pressable accessibilityRole="link">
                      <ThemedText type="linkPrimary">{t('account.title')}</ThemedText>
                    </Pressable>
                  </Link>
                </>
              ) : (
                <Link href="/sign-in" asChild>
                  <Pressable accessibilityRole="link">
                    <ThemedText type="linkPrimary">{t('common.signIn')}</ThemedText>
                  </Pressable>
                </Link>
              )}
            </View>
          ),
        }}
      />

      <FlatList
        testID="listings"
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: Spacing.three, paddingBottom: Spacing.five }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three }}>
            <ThemedText themeColor="textSecondary">{t('tagline')}</ThemedText>
            {!account?.trusted && (
              <Card>
                <ThemedText type="small">{t('showcase.guestBanner')}</ThemedText>
              </Card>
            )}
            <Button
              label={active > 0 ? `${t('filters.open')} (${active})` : t('filters.open')}
              variant="secondary"
              onPress={() => router.push('/filters')}
            />
            {loading && <ActivityIndicator testID="loading" />}
            {error && <ThemedText>{t('common.error')}</ThemedText>}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <ThemedText themeColor="textSecondary">{t('showcase.empty')}</ThemedText> : undefined}
        renderItem={({ item }) => <ListingCard item={item} />}
      />
    </Screen>
  );
}
