import { describe, expect, it } from 'vitest';

import { MODERATION_ERROR_CODES } from '../domain/errors';
import { en } from './en';
import { createTranslator, detectLanguage, otherLanguage } from './i18n';
import { uk } from './uk';

const keys = (node: object, prefix = ''): string[] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keys(value as object, `${prefix}${key}.`));

describe('i18n', () => {
  it('has the same keys in both languages, all under the moderation namespace', () => {
    expect(keys(en)).toEqual(keys(uk));
    expect(Object.keys(uk)).toEqual(['moderation']);
  });

  it('has a message for every error code', () => {
    expect(Object.keys(uk.moderation.errors).sort()).toEqual([...MODERATION_ERROR_CODES].sort());
  });

  it('interpolates parameters and leaves unknown ones in place', () => {
    const t = createTranslator('en');
    expect(t('moderation.signIn.codeSent', { email: 'a@b.cd' })).toBe('We sent a code to a@b.cd.');
    expect(t('moderation.signIn.codeSent')).toBe('We sent a code to {{email}}.');
    expect(createTranslator('uk')('moderation.nav.queue')).toBe('Скарги');
  });

  it('falls back to the key for a missing string', () => {
    expect(createTranslator('en')('moderation.missing' as never)).toBe('moderation.missing');
  });

  it('prefers Ukrainian unless the browser asks for English first', () => {
    expect(detectLanguage(['en-GB', 'uk'])).toBe('en');
    expect(detectLanguage(['de-DE', 'uk-UA'])).toBe('uk');
    expect(detectLanguage(['de'])).toBe('uk');
    expect(detectLanguage([])).toBe('uk');
    expect(otherLanguage('uk')).toBe('en');
    expect(otherLanguage('en')).toBe('uk');
  });
});
