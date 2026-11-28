import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { LEGAL_LIBRARY } from '../content';
import { legalDocument, type LegalKind } from '../domain/documents';

import { LegalDocumentView } from './legal-document-view';

/** A legal route: picks the document in the app language and sets the header title. */
export function LegalScreen({ kind }: { kind: LegalKind }) {
  const { t, i18n } = useTranslation();
  const document = legalDocument(LEGAL_LIBRARY, kind, i18n.language);
  return (
    <>
      <Stack.Screen options={{ title: t(kind === 'privacy' ? 'legal.privacyTitle' : 'legal.termsTitle') }} />
      <LegalDocumentView document={document} />
    </>
  );
}
