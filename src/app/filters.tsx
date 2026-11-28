import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { MultiChoice, SingleChoice, Toggle } from '@/components/choices';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { filterStore } from '@/lib/filter-store';
import { roughLocation } from '@/lib/location';
import { AGE_BANDS, LANGUAGES, LIVING, MOVE_IN, RADII_KM } from '@/lib/options';
import type { SearchFilters } from '@/lib/types';

type Sort = NonNullable<SearchFilters['sort']>;
const SORTS: Sort[] = ['newest', 'nearest', 'age'];
const SORT_LABEL = { newest: 'filters.sortNewest', nearest: 'filters.sortNearest', age: 'filters.sortAge' } as const;

export default function FiltersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [draft, setDraft] = useState<SearchFilters>(filterStore.get());
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const near = draft.lat !== undefined;

  const update = (patch: Partial<SearchFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleNear = async () => {
    if (near) {
      update({ lat: undefined, lng: undefined, radiusKm: undefined, sort: draft.sort === 'nearest' ? 'newest' : draft.sort });
      return;
    }
    setLocating(true);
    setDenied(false);
    try {
      const point = await roughLocation();
      if (point) update({ lat: point.lat, lng: point.lng, radiusKm: draft.radiusKm ?? 25 });
      else setDenied(true);
    } catch {
      setDenied(true);
    } finally {
      setLocating(false);
    }
  };

  const apply = () => {
    // A half-typed country code would match nothing, so it is dropped.
    filterStore.set({ ...draft, country: draft.country?.length === 2 ? draft.country : undefined });
    router.back();
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.four }}>
        <Field
          label={t('showcase.country')}
          value={draft.country ?? ''}
          autoCapitalize="characters"
          maxLength={2}
          onChangeText={(v) => update({ country: v.toUpperCase() || undefined })}
        />

        <View style={{ gap: Spacing.two }}>
          <Toggle label={t('filters.nearMe')} value={near} onChange={toggleNear} />
          <ThemedText type="small" themeColor={denied ? 'danger' : 'textSecondary'}>
            {denied ? t('filters.locationDenied') : t('filters.nearMeHint')}
          </ThemedText>
          {locating && <ThemedText type="small">{t('common.loading')}</ThemedText>}
          {near && (
            <SingleChoice
              label={t('filters.radius')}
              options={RADII_KM.map(String)}
              value={draft.radiusKm ? String(draft.radiusKm) : null}
              onChange={(v) => update({ radiusKm: v ? Number(v) : undefined })}
              labelFor={(v) => t('filters.km', { count: Number(v) })}
            />
          )}
        </View>

        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('filters.sort')}
          </ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {SORTS.filter((s) => s !== 'nearest' || near).map((s) => (
              <Chip key={s} label={t(SORT_LABEL[s])} selected={(draft.sort ?? 'newest') === s} onPress={() => update({ sort: s })} />
            ))}
          </View>
        </View>

        <MultiChoice
          label={t('filters.age')}
          options={AGE_BANDS}
          values={draft.ageBands ?? []}
          onChange={(ageBands) => update({ ageBands })}
          labelFor={(v) => t(`options.age.${v}`)}
        />
        <MultiChoice
          label={t('filters.languages')}
          options={LANGUAGES}
          values={draft.languages ?? []}
          onChange={(languages) => update({ languages })}
          labelFor={(v) => t(`options.language.${v}`)}
        />

        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('filters.children')}
          </ThemedText>
          <Toggle label={t('showcase.withChildren')} value={!!draft.hasChildren} onChange={(v) => update({ hasChildren: v || undefined })} />
          <Toggle label={t('filters.iHaveChildren')} value={!!draft.iHaveChildren} onChange={(v) => update({ iHaveChildren: v || undefined })} />
        </View>

        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('filters.household')}
          </ThemedText>
          <Toggle label={t('showcase.noPets')} value={!!draft.noPets} onChange={(v) => update({ noPets: v || undefined })} />
          <Toggle label={t('showcase.noSmoking')} value={!!draft.noSmoking} onChange={(v) => update({ noSmoking: v || undefined })} />
        </View>

        <MultiChoice
          label={t('filters.living')}
          options={LIVING}
          values={draft.living ?? []}
          onChange={(living) => update({ living })}
          labelFor={(v) => t(`options.living.${v}`)}
        />
        <MultiChoice
          label={t('filters.moveIn')}
          options={MOVE_IN}
          values={draft.moveIn ?? []}
          onChange={(moveIn) => update({ moveIn })}
          labelFor={(v) => t(`options.moveIn.${v}`)}
        />

        <Button label={t('filters.apply')} onPress={apply} />
        <Button label={t('filters.reset')} variant="secondary" onPress={() => setDraft({})} />
      </ScrollView>
    </Screen>
  );
}
