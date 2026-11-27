import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ageBandLabel } from '@/lib/format';
import type { ListingSummary } from '@/lib/types';

export function ListingCard({ item }: { item: ListingSummary }) {
  const { t } = useTranslation();
  const facts = [
    ageBandLabel(item.age_band),
    item.has_children ? `${t('listing.children.yes')} (${item.children_count})` : t('listing.children.no'),
    item.distance_band ? t(`listing.distance.${item.distance_band}`) : null,
  ].filter(Boolean);

  return (
    <Link href={{ pathname: '/listing/[id]', params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="link">
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {item.city}, {item.country_code}
          </ThemedText>
          <ThemedText style={{ fontSize: 18, fontWeight: 600 }}>{item.title}</ThemedText>
          <ThemedText numberOfLines={3} themeColor="textSecondary">
            {item.about}
          </ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {facts.map((f) => (
              <ThemedText key={f} type="small">
                · {f}
              </ThemedText>
            ))}
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
