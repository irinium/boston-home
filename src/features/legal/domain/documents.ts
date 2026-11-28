// Legal documents as plain data, so the texts can be reviewed and changed without touching UI code.

export type LegalKind = 'privacy' | 'terms';
export type LegalLanguage = 'uk' | 'en';

export type LegalSection = { heading: string; paragraphs: string[] };

export type LegalDocument = {
  title: string;
  /** ISO date of the current version. */
  updated: string;
  /** True until the owner approves the text; the screen then shows a draft notice. */
  draft: boolean;
  sections: LegalSection[];
};

export type LegalLibrary = Record<LegalKind, Record<LegalLanguage, LegalDocument>>;

export const LEGAL_KINDS: readonly LegalKind[] = ['privacy', 'terms'];

/** Ukrainian for `uk` (also `uk-UA`), English for every other language. */
export function legalLanguage(language: string | undefined): LegalLanguage {
  return language?.toLowerCase().split('-')[0] === 'uk' ? 'uk' : 'en';
}

export function isLegalKind(value: unknown): value is LegalKind {
  return typeof value === 'string' && (LEGAL_KINDS as readonly string[]).includes(value);
}

export function legalDocument(library: LegalLibrary, kind: LegalKind, language: string | undefined): LegalDocument {
  return library[kind][legalLanguage(language)];
}
