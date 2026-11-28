import { LEGAL_LIBRARY } from '../content';

import { isLegalKind, LEGAL_KINDS, legalDocument, legalLanguage } from './documents';

it('uses Ukrainian for uk and English for everything else', () => {
  expect(legalLanguage('uk')).toBe('uk');
  expect(legalLanguage('uk-UA')).toBe('uk');
  expect(legalLanguage('UK')).toBe('uk');
  expect(legalLanguage('de')).toBe('en');
  expect(legalLanguage(undefined)).toBe('en');
});

it('recognises the legal document kinds', () => {
  expect(isLegalKind('privacy')).toBe(true);
  expect(isLegalKind('terms')).toBe(true);
  expect(isLegalKind('cookies')).toBe(false);
  expect(isLegalKind(undefined)).toBe(false);
});

it('picks the document in the app language', () => {
  expect(legalDocument(LEGAL_LIBRARY, 'privacy', 'uk').title).toBe('Політика конфіденційності');
  expect(legalDocument(LEGAL_LIBRARY, 'terms', 'fr').title).toBe('Terms of Use');
});

describe.each(LEGAL_KINDS)('%s', (kind) => {
  const { uk, en } = LEGAL_LIBRARY[kind];

  it('has the same structure and version in both languages', () => {
    expect(uk.updated).toBe(en.updated);
    expect(uk.draft).toBe(en.draft);
    expect(uk.sections.map((s) => s.paragraphs.length)).toEqual(en.sections.map((s) => s.paragraphs.length));
  });

  it('has unique headings and no empty paragraphs (they are React keys)', () => {
    for (const doc of [uk, en]) {
      expect(new Set(doc.sections.map((s) => s.heading)).size).toBe(doc.sections.length);
      for (const section of doc.sections) {
        expect(section.paragraphs.every((p) => p.trim().length > 0)).toBe(true);
        expect(new Set(section.paragraphs).size).toBe(section.paragraphs.length);
      }
    }
  });
});

it('names the processors and says that nothing is recorded', () => {
  for (const doc of Object.values(LEGAL_LIBRARY.privacy)) {
    const text = doc.sections.flatMap((s) => s.paragraphs).join(' ');
    expect(text).toMatch(/Supabase/);
    expect(text).toMatch(/Frankfurt|Франкфурт/);
    expect(text).toMatch(/Daily\.co/);
  }
  expect(LEGAL_LIBRARY.privacy.en.sections.flatMap((s) => s.paragraphs).join(' ')).toMatch(/Nothing is recorded/);
  expect(LEGAL_LIBRARY.privacy.uk.sections.flatMap((s) => s.paragraphs).join(' ')).toMatch(/нічого не записуємо/);
});
