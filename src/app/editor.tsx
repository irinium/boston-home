import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { MultiChoice, SingleChoice, Toggle } from '@/components/choices';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getMyListing, saveMyListing, uploadPhoto } from '@/lib/api';
import { roughLocation } from '@/lib/location';
import {
  ALCOHOL,
  CHILD_AGE_BANDS,
  CHRONOTYPE,
  DIET,
  EXPENSES,
  LIVING,
  MOVE_IN,
  PARTNER_CHILDREN,
  PETS,
  RELOCATION,
  SMOKING,
  WORK_MODE,
} from '@/lib/options';
import { EMPTY_DRAFT, toDraft } from '@/lib/draft';
import type { ListingDraft } from '@/lib/types';
import { useAuth } from '@/providers/auth';

export default function EditorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, account, refreshAccount } = useAuth();
  const me = session!.user.id;
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const canPublish = account?.trusted === true;

  useEffect(() => {
    getMyListing(me).then((row) => {
      if (row) setDraft(toDraft(row));
    });
  }, [me]);

  const set = <K extends keyof ListingDraft>(key: K, value: ListingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const addPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    if (picked.canceled) return;
    setBusy(true);
    try {
      const path = await uploadPhoto(me, 'listing-photos', picked.assets[0].uri);
      set('photo_paths', [...draft.photo_paths, path].slice(0, 3));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const locateMe = async () => {
    setLocationDenied(false);
    try {
      const point = await roughLocation();
      if (point) setDraft((d) => ({ ...d, approx_lat: point.lat, approx_lng: point.lng }));
      else setLocationDenied(true);
    } catch {
      setLocationDenied(true);
    }
  };

  const save = async (publish: boolean) => {
    setBusy(true);
    setError(false);
    try {
      await saveMyListing(me, draft, publish);
      await refreshAccount();
      router.back();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        <Field label={t('editor.titleField')} value={draft.title} onChangeText={(v) => set('title', v)} maxLength={80} />
        <Field label={t('editor.about')} value={draft.about} onChangeText={(v) => set('about', v)} maxLength={2000} multiline />
        <Field
          label={t('editor.lookingFor')}
          value={draft.looking_for}
          onChangeText={(v) => set('looking_for', v)}
          maxLength={2000}
          multiline
        />
        <Field
          label={t('editor.country')}
          value={draft.country_code}
          onChangeText={(v) => set('country_code', v.toUpperCase())}
          autoCapitalize="characters"
          maxLength={2}
        />
        <Field label={t('editor.city')} value={draft.city} onChangeText={(v) => set('city', v)} maxLength={80} />

        {draft.approx_lat !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText type="small">{t('conditions.locationSet')}</ThemedText>
            <Button
              label={t('conditions.clearLocation')}
              variant="danger"
              onPress={() => setDraft((d) => ({ ...d, approx_lat: null, approx_lng: null }))}
            />
          </View>
        ) : (
          <Button label={t('conditions.useLocation')} variant="secondary" onPress={locateMe} />
        )}
        {locationDenied && (
          <ThemedText type="small" themeColor="danger">
            {t('filters.locationDenied')}
          </ThemedText>
        )}

        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('conditions.target')}
        </ThemedText>
        <Field
          label={t('conditions.targetCountry')}
          value={draft.target_country_code ?? ''}
          onChangeText={(v) => set('target_country_code', v.toUpperCase() || null)}
          autoCapitalize="characters"
          maxLength={2}
        />
        <Field
          label={t('conditions.targetCity')}
          value={draft.target_city ?? ''}
          onChangeText={(v) => set('target_city', v || null)}
          maxLength={80}
        />

        <Toggle
          label={t('editor.hasChildren')}
          value={draft.has_children}
          onChange={(v) =>
            setDraft((d) => ({
              ...d,
              has_children: v,
              children_count: v ? Math.max(d.children_count, 1) : 0,
              children_age_bands: v ? d.children_age_bands : [],
            }))
          }
        />
        {draft.has_children && (
          <>
            <Field
              label={t('editor.childrenCount')}
              value={String(draft.children_count)}
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={(v) => set('children_count', Math.min(Number(v.replace(/\D/g, '')) || 0, 10))}
            />
            <MultiChoice
              label={t('conditions.childAges')}
              options={CHILD_AGE_BANDS}
              values={draft.children_age_bands}
              onChange={(v) => set('children_age_bands', v)}
              labelFor={(v) => t(`options.childAge.${v}`)}
            />
          </>
        )}

        <ThemedText type="subtitle" style={{ fontSize: 20, lineHeight: 28 }}>
          {t('conditions.title')}
        </ThemedText>
        <SingleChoice
          label={t('conditions.partnerChildren')}
          options={PARTNER_CHILDREN}
          value={draft.partner_children}
          onChange={(v) => set('partner_children', v ?? 'any')}
          labelFor={(v) => t(`options.partnerChildren.${v}`)}
        />
        <MultiChoice
          label={t('conditions.pets')}
          options={PETS}
          values={draft.pets}
          onChange={(v) => set('pets', v)}
          labelFor={(v) => t(`options.pet.${v}`)}
        />
        <Toggle label={t('conditions.petAllergy')} value={draft.pet_allergy} onChange={(v) => set('pet_allergy', v)} />
        <SingleChoice
          label={t('conditions.smoking')}
          options={SMOKING}
          value={draft.smoking}
          onChange={(v) => set('smoking', v)}
          labelFor={(v) => t(`options.smoking.${v}`)}
        />
        <SingleChoice
          label={t('conditions.alcohol')}
          options={ALCOHOL}
          value={draft.alcohol}
          onChange={(v) => set('alcohol', v)}
          labelFor={(v) => t(`options.alcohol.${v}`)}
        />
        <SingleChoice
          label={t('conditions.diet')}
          options={DIET}
          value={draft.diet}
          onChange={(v) => set('diet', v)}
          labelFor={(v) => t(`options.diet.${v}`)}
        />
        <SingleChoice
          label={t('conditions.chronotype')}
          options={CHRONOTYPE}
          value={draft.chronotype}
          onChange={(v) => set('chronotype', v)}
          labelFor={(v) => t(`options.chronotype.${v}`)}
        />
        <SingleChoice
          label={t('conditions.workMode')}
          options={WORK_MODE}
          value={draft.work_mode}
          onChange={(v) => set('work_mode', v)}
          labelFor={(v) => t(`options.workMode.${v}`)}
        />
        <SingleChoice
          label={t('conditions.living')}
          options={LIVING}
          value={draft.living_arrangement}
          onChange={(v) => set('living_arrangement', v)}
          labelFor={(v) => t(`options.living.${v}`)}
        />
        <SingleChoice
          label={t('conditions.relocation')}
          options={RELOCATION}
          value={draft.relocation}
          onChange={(v) => set('relocation', v)}
          labelFor={(v) => t(`options.relocation.${v}`)}
        />
        <SingleChoice
          label={t('conditions.moveIn')}
          options={MOVE_IN}
          value={draft.move_in}
          onChange={(v) => set('move_in', v)}
          labelFor={(v) => t(`options.moveIn.${v}`)}
        />
        <Toggle
          label={t('conditions.separateRooms')}
          value={draft.separate_rooms === true}
          onChange={(v) => set('separate_rooms', v)}
        />
        <SingleChoice
          label={t('conditions.expenses')}
          options={EXPENSES}
          value={draft.expenses}
          onChange={(v) => set('expenses', v)}
          labelFor={(v) => t(`options.expenses.${v}`)}
        />

        <ThemedText type="small" themeColor="textSecondary">
          {t('editor.photosNote')} ({draft.photo_paths.length}/3)
        </ThemedText>
        {draft.photo_paths.length < 3 && (
          <Button label={t('editor.addPhoto')} variant="secondary" onPress={addPhoto} disabled={busy} />
        )}
        {!canPublish && <ThemedText themeColor="textSecondary">{t('editor.needsVerification')}</ThemedText>}
        <Button label={t('editor.publish')} onPress={() => save(true)} disabled={busy || !canPublish} />
        <Button label={t('editor.saveDraft')} variant="secondary" onPress={() => save(false)} disabled={busy} />
        {error && <ThemedText themeColor="danger">{t('common.error')}</ThemedText>}
      </ScrollView>
    </Screen>
  );
}
