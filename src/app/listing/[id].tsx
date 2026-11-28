import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View } from 'react-native';

import { ConditionsList } from '@/components/conditions-list';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { blockUser, signedPhotoUrls } from '@/lib/api';
import { ageBandLabel } from '@/lib/format';
import { listingCache } from '@/lib/listing-cache';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { session, account } = useAuth();
  const item = listingCache.get(id);
  const trusted = account?.trusted === true;
  const [photos, setPhotos] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!trusted) return;
    // Members may read the listing row (RLS); guests never get the owner's id or photos.
    supabase
      .from('listings')
      .select('owner_id, photo_paths')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        setOwnerId(data.owner_id);
        setPhotos(await signedPhotoUrls('listing-photos', data.photo_paths ?? []));
      });
  }, [id, trusted]);

  if (!item) {
    return (
      <Screen>
        <ThemedText>{t('request.errors.listing_unavailable')}</ThemedText>
      </Screen>
    );
  }

  const onBlock = () => {
    if (!session || !ownerId) return;
    Alert.alert(t('listing.block'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('listing.block'),
        style: 'destructive',
        onPress: async () => {
          await blockUser(session.user.id, ownerId);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        {trusted && photos.length > 0 ? (
          <ScrollView horizontal contentContainerStyle={{ gap: Spacing.two }}>
            {photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={{ width: 260, height: 320, borderRadius: Radius.medium }} />
            ))}
          </ScrollView>
        ) : item.photo_count > 0 ? (
          <Card style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {t('showcase.guestBanner')}
            </ThemedText>
          </Card>
        ) : null}

        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {[ageBandLabel(item.age_band), item.distance_band && t(`listing.distance.${item.distance_band}`)]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
          <ThemedText style={{ fontSize: 24, lineHeight: 30, fontWeight: 600 }}>{item.title}</ThemedText>
        </View>

        <Card>
          <ThemedText type="small" themeColor="textSecondary">{t('listing.liveNow')}</ThemedText>
          <ThemedText>{item.city}, {item.country_code}</ThemedText>
          {item.target_city && (
            <>
              <ThemedText type="small" themeColor="textSecondary">{t('listing.liveTogether')}</ThemedText>
              <ThemedText>{item.target_city}, {item.target_country_code}</ThemedText>
            </>
          )}
          <ThemedText>
            {item.has_children ? `${t('listing.children.yes')} (${item.children_count})` : t('listing.children.no')}
          </ThemedText>
        </Card>

        <ConditionsList item={item} />

        {item.about.length > 0 && (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">{t('listing.about')}</ThemedText>
            <ThemedText>{item.about}</ThemedText>
          </View>
        )}
        {item.looking_for.length > 0 && (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">{t('listing.lookingFor')}</ThemedText>
            <ThemedText>{item.looking_for}</ThemedText>
          </View>
        )}

        <Button
          label={t('listing.sendRequest')}
          onPress={() =>
            session
              ? router.push({ pathname: '/request/[listingId]', params: { listingId: item.id } })
              : router.push('/sign-in')
          }
        />
        {ownerId && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: Spacing.four }}>
            <Button
              label={t('listing.report')}
              variant="danger"
              onPress={() => router.push({ pathname: '/report', params: { reportedId: ownerId, listingId: item.id } })}
            />
            <Button label={t('listing.block')} variant="danger" onPress={onBlock} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
