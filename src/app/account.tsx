import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { deleteAccount, setProfilePhoto, signedPhotoUrls, uploadPhoto } from '@/lib/api';
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
    <Screen>
      <Card>
        <ThemedText type="smallBold">{account?.display_name ?? '—'}</ThemedText>
        <ThemedText>
          {t('account.credits')}: {account?.credits ?? 0}
        </ThemedText>
      </Card>
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
      <Button label={t('common.signOut')} variant="secondary" onPress={signOut} />
      <Button label={t('account.delete')} variant="danger" onPress={onDelete} />
    </Screen>
  );
}
