import type { ListingSummary } from '@/lib/types';

export function listing(overrides: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: 'l1',
    title: 'Looking for a calm home',
    about: 'Two kids and a cat.',
    looking_for: 'Someone kind.',
    country_code: 'IT',
    city: 'Roma',
    target_country_code: null,
    target_city: null,
    age_band: '35_44',
    languages: ['uk', 'en'],
    children_age_bands: [],
    pets: [],
    smoking: 'no',
    has_children: true,
    children_count: 2,
    photo_count: 1,
    photo_paths: null,
    approx_lat: null,
    approx_lng: null,
    distance_band: null,
    published_at: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}
