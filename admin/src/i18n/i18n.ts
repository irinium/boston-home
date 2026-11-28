import { en } from './en';
import { uk } from './uk';

/** Shape of the strings: every leaf is a string, keys come from the Ukrainian source. */
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Messages = Shape<typeof uk>;

/** Dotted paths to every string, e.g. `moderation.queue.heading`. */
type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

export const LANGUAGES = ['uk', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const catalog: Record<Language, Messages> = { uk, en };

export type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;

function lookup(messages: Messages, key: string): string {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  return typeof node === 'string' ? node : key;
}

export function createTranslator(language: Language): Translate {
  const messages = catalog[language];
  return (key, params) =>
    lookup(messages, key).replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
      params && name in params ? String(params[name]) : match);
}

/** Ukrainian unless the browser prefers English. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'uk' || base === 'en') return base;
  }
  return 'uk';
}

export const otherLanguage = (language: Language): Language => (language === 'uk' ? 'en' : 'uk');
