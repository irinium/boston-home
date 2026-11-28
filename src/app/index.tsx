import { Link, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';

import { ListingCard } from '@/components/listing-card';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { searchListings } from '@/lib/api';
import { listingCache } from '@/lib/listing-cache';
import type { ListingSummary, SearchFilters } from '@/lib/types';
import { useAuth } from '@/providers/auth';

export default function ShowcaseScreen() {
  const { t } = useTranslation();
  const { session, account } = useAuth();
  const [filters, setFilters] = useState<SearchFilters>({});
  const [countryInput, setCountryInput] = useState('');
  const [items, setItems] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    searchListings(filters)
      .then((result) => {
        if (!active) return;
        listingCache.put(result);
        setItems(result);
        setError(false);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filters, reloadKey]);

  const reload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const updateFilters = (update: (f: SearchFilters) => SearchFilters) => {
    setLoading(true);
    setFilters(update);
  };

  const toggle = (key: 'hasChildren' | 'noPets' | 'noSmoking') =>
    updateFilters((f) => ({ ...f, [key]: f[key] ? undefined : true }));

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
        refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={reload} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three }}>
            <ThemedText themeColor="textSecondary">{t('tagline')}</ThemedText>
            {!account?.trusted && (
              <Card>
                <ThemedText type="small">{t('showcase.guestBanner')}</ThemedText>
              </Card>
            )}
            <Field
              label={t('showcase.country')}
              value={countryInput}
              autoCapitalize="characters"
              maxLength={2}
              onChangeText={(v) => {
                setCountryInput(v);
                updateFilters((f) => ({ ...f, country: v.length === 2 ? v : undefined }));
              }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
              <Chip label={t('showcase.withChildren')} selected={!!filters.hasChildren} onPress={() => toggle('hasChildren')} />
              <Chip label={t('showcase.noPets')} selected={!!filters.noPets} onPress={() => toggle('noPets')} />
              <Chip label={t('showcase.noSmoking')} selected={!!filters.noSmoking} onPress={() => toggle('noSmoking')} />
            </View>
            {loading && items.length === 0 && <ActivityIndicator />}
            {error && <ThemedText>{t('common.error')}</ThemedText>}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <ThemedText themeColor="textSecondary">{t('showcase.empty')}</ThemedText> : undefined}
        renderItem={({ item }) => <ListingCard item={item} />}
      />
    </Screen>
  );
}
