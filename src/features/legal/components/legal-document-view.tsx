import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';

import type { LegalDocument } from '../domain/documents';

/** Renders one legal document: title, version date, optional draft notice and its sections. */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  const { t } = useTranslation();
  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold" accessibilityRole="header">
            {document.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('legal.updated', { date: document.updated })}
          </ThemedText>
        </View>
        {document.draft && (
          <Card>
            <ThemedText type="small" themeColor="danger">
              {t('legal.draftNotice')}
            </ThemedText>
          </Card>
        )}
        {document.sections.map((section) => (
          <View key={section.heading} style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold" accessibilityRole="header">
              {section.heading}
            </ThemedText>
            {section.paragraphs.map((paragraph) => (
              <ThemedText key={paragraph} type="small">
                {paragraph}
              </ThemedText>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
