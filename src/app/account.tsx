import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';

import { MultiChoice, SingleChoice } from '@/components/choices';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { pushService, PushToggle } from '@/features/notifications';
import { deleteAccount, setProfilePhoto, signedPhotoUrls, updateProfile, uploadPhoto } from '@/lib/api';
import { AGE_BANDS, LANGUAGES } from '@/lib/options';
import { changedFields, fromAccount } from '@/lib/profile';
import type { MyAccount } from '@/lib/types';
import { useAuth } from '@/providers/auth';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, account, refreshAccount, signOut } = useAuth();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoPath = account?.photo_path ?? null;
  useEffect(() => {
    let active = true;
    if (photoPath) {
      signedPhotoUrls('profile-photos', [photoPath]).then(([url]) => {
        if (active) setPhotoUrl(url ?? null);
      });
    }
    return () => {
      active = false;
    };
  }, [photoPath]);

  const pickPhoto = async () => {
    if (!session) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    if (picked.canceled) return;
    setBusy(true);
    try {
      const path = await uploadPhoto(session.user.id, 'profile-photos', picked.assets[0].uri);
      await setProfilePhoto(session.user.id, path);
      await refreshAccount();
    } catch {
      Alert.alert(t('account.photoError'));
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    // Stop pushes to this phone first, while the session can still remove its token.
    await pushService.forget().catch(() => {});
    await signOut();
  };

  const onDelete = () =>
    Alert.alert(t('account.delete'), t('account.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteAccount();
          router.dismissTo('/');
        },
      },
    ]);

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
      <Card>
        <ThemedText type="smallBold">{account?.display_name ?? '—'}</ThemedText>
        <ThemedText>
          {t('account.credits')}: {account?.credits ?? 0}
        </ThemedText>
      </Card>
      {account ? (
        <ProfileForm key={account.id} account={account} onSaved={refreshAccount} />
      ) : (
        <ActivityIndicator />
      )}
      <Card>
        <ThemedText type="smallBold">{t('account.photo')}</ThemedText>
        {photoPath && photoUrl && (
          <Image source={{ uri: photoUrl }} style={{ width: 120, height: 120, borderRadius: Radius.medium }} />
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {t('account.photoWhy')}
        </ThemedText>
        <Button
          label={photoPath ? t('account.changePhoto') : t('account.addPhoto')}
          variant={photoPath ? 'secondary' : 'primary'}
          onPress={pickPhoto}
          disabled={busy}
        />
      </Card>
      <Button label={t('account.myListing')} onPress={() => router.push('/editor')} />
      <Button label={t('availability.open')} variant="secondary" onPress={() => router.push('/availability')} />
      <PushToggle />
      <Button label={t('common.signOut')} variant="secondary" onPress={onSignOut} />
      <Button label={t('account.delete')} variant="danger" onPress={onDelete} />
      </ScrollView>
    </Screen>
  );
}

/** Rendered only once the account is loaded, and keyed on it, so it never starts from empty values. */
function ProfileForm({ account, onSaved }: { account: MyAccount; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [initial] = useState(() => fromAccount(account));
  const [profile, setProfile] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);
  const changes = changedFields(initial, profile);
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    setStatus(null);
    try {
      await updateProfile(account.id, changes);
      await onSaved();
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Card>
      <Field
        label={t('profile.name')}
        value={profile.display_name}
        maxLength={40}
        onChangeText={(display_name) => setProfile((p) => ({ ...p, display_name }))}
      />
      <SingleChoice
        label={t('profile.age')}
        options={AGE_BANDS}
        value={profile.age_band}
        onChange={(age_band) => setProfile((p) => ({ ...p, age_band }))}
        labelFor={(v) => t(`options.age.${v}`)}
      />
      <MultiChoice
        label={t('profile.languages')}
        options={LANGUAGES}
        values={profile.languages as (typeof LANGUAGES)[number][]}
        onChange={(languages) => setProfile((p) => ({ ...p, languages }))}
        labelFor={(v) => t(`options.language.${v}`)}
      />
      <View style={{ gap: Spacing.one }}>
        <Button label={t('common.save')} variant="secondary" onPress={save} disabled={!dirty || profile.display_name.trim() === ''} />
        {status && (
          <ThemedText type="small" themeColor={status === 'error' ? 'danger' : 'textSecondary'}>
            {status === 'error' ? t('common.error') : t('profile.saved')}
          </ThemedText>
        )}
      </View>
    </Card>
  );
}
