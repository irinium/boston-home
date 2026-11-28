import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Conditions } from '@/lib/types';

/** Read-only pills with a listing's household conditions; unset values are skipped. */
export function ConditionsList({ item }: { item: Conditions }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const facts = [
    ...item.children_age_bands.map((v) => t(`options.childAge.${v}`)),
    item.partner_children !== 'any' ? t(`options.partnerChildren.${item.partner_children}`) : null,
    ...item.pets.map((v) => t(`options.pet.${v}`)),
    item.pet_allergy ? t('conditions.petAllergy') : null,
    item.smoking && t(`options.smoking.${item.smoking}`),
    item.alcohol && t(`options.alcohol.${item.alcohol}`),
    item.diet && t(`options.diet.${item.diet}`),
    item.chronotype && t(`options.chronotype.${item.chronotype}`),
    item.work_mode && t(`options.workMode.${item.work_mode}`),
    item.living_arrangement && t(`options.living.${item.living_arrangement}`),
    item.relocation && t(`options.relocation.${item.relocation}`),
    item.move_in && t(`options.moveIn.${item.move_in}`),
    item.separate_rooms ? t('conditions.separateRooms') : null,
    item.expenses && t(`options.expenses.${item.expenses}`),
  ].filter((f): f is string => !!f);

  if (facts.length === 0) return null;
  return (
    <Card>
      <ThemedText type="smallBold">{t('conditions.title')}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {facts.map((f) => (
          <ThemedText
            key={f}
            type="small"
            style={{ borderWidth: 1, borderColor: theme.border, borderRadius: Radius.large, paddingVertical: 4, paddingHorizontal: 12 }}>
            {f}
          </ThemedText>
        ))}
      </View>
    </Card>
  );
}
