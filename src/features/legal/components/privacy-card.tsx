import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';

import { useDataExport } from '../use-data-export';

import { LegalLinks } from './legal-links';

const STATUS_KEY = { delivered: 'legal.exportDone', failed: 'legal.exportError' } as const;

/** Account screen section: export my data, plus links to the Privacy Policy and the Terms. */
export function PrivacyCard() {
  const { t } = useTranslation();
  const { run, busy, outcome } = useDataExport();
  const status = outcome && outcome !== 'cancelled' ? STATUS_KEY[outcome] : null;

  return (
    <Card>
      <ThemedText type="smallBold">{t('legal.section')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('legal.exportHint')}
      </ThemedText>
      <Button label={busy ? t('legal.exporting') : t('legal.export')} variant="secondary" onPress={run} disabled={busy} />
      {status && (
        <ThemedText type="small" themeColor={outcome === 'failed' ? 'danger' : 'textSecondary'}>
          {t(status)}
        </ThemedText>
      )}
      <LegalLinks />
    </Card>
  );
}
