import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getMyListing, saveMyListing, uploadPhoto } from '@/lib/api';
import type { ListingDraft } from '@/lib/types';
import { useAuth } from '@/providers/auth';

const EMPTY: ListingDraft = {
  title: '',
  about: '',
  looking_for: '',
  country_code: '',
  city: '',
  has_children: false,
  children_count: 0,
  photo_paths: [],
};

export default function EditorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, account, refreshAccount } = useAuth();
  const me = session!.user.id;
  const [draft, setDraft] = useState<ListingDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const verified = account?.trusted === true;

  useEffect(() => {
    getMyListing(me).then((row) => {
      if (row) {
        setDraft({
          title: row.title,
          about: row.about,
          looking_for: row.looking_for,
          country_code: row.country_code,
          city: row.city,
          has_children: row.has_children,
          children_count: row.children_count,
          photo_paths: row.photo_paths ?? [],
        });
      }
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <ThemedText>{t('editor.hasChildren')}</ThemedText>
          <Switch
            value={draft.has_children}
            onValueChange={(v) => setDraft((d) => ({ ...d, has_children: v, children_count: v ? Math.max(d.children_count, 1) : 0 }))}
          />
        </View>
        {draft.has_children && (
          <Field
            label={t('editor.childrenCount')}
            value={String(draft.children_count)}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(v) => set('children_count', Math.min(Number(v.replace(/\D/g, '')) || 0, 10))}
          />
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {t('editor.photosNote')} ({draft.photo_paths.length}/3)
        </ThemedText>
        {draft.photo_paths.length < 3 && (
          <Button label={t('editor.addPhoto')} variant="secondary" onPress={addPhoto} disabled={busy} />
        )}
        {!verified && <ThemedText themeColor="textSecondary">{t('editor.needsVerification')}</ThemedText>}
        <Button label={t('editor.publish')} onPress={() => save(true)} disabled={busy || !verified} />
        <Button label={t('editor.saveDraft')} variant="secondary" onPress={() => save(false)} disabled={busy} />
        {error && <ThemedText themeColor="danger">{t('common.error')}</ThemedText>}
      </ScrollView>
    </Screen>
  );
}
