/**
 * Client-side mirror of `public.contains_contact_info` in the database migration.
 * Gives instant feedback while typing; the database check is the one that counts.
 * Keep both in sync (see src/lib/contact-filter.test.ts).
 */
const PATTERNS: RegExp[] = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u, // email
  /(https?:\/\/|www\.)/u, // links
  /[\p{L}\p{N}-]+\.(com|net|org|ua|me|io|ly|app|eu|de|pl|link|info|page)([^\p{L}\p{N}]|$)/u, // domains
  /(^|[^\p{L}\p{N}])@[\p{L}\p{N}_.]{3,}/u, // @handles
  /(telegram|whats ?app|viber|instagram|facebook|snapchat|tiktok|wechat|threema)/u,
  /(телеграм|телеґрам|вайбер|ватсап|вотсап|інстаграм|инстаграм|фейсбук|тікток|тикток)/u,
  /(^|[^a-zа-яіїєґ])(tg|тг|інста|инста|insta|fb)([^a-zа-яіїєґ]|$)/u,
];

export function containsContactInfo(text: string): boolean {
  const t = text.toLowerCase();
  if (PATTERNS.some((p) => p.test(t))) return true;
  const digits = t.replace(/[\s().+/-]/g, '');
  return /[0-9]{7,}/.test(digits);
}
