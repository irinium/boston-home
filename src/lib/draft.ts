import type { ListingDraft } from '@/lib/types';

export const EMPTY_DRAFT: ListingDraft = {
  title: '',
  about: '',
  looking_for: '',
  country_code: '',
  city: '',
  approx_lat: null,
  approx_lng: null,
  target_country_code: null,
  target_city: null,
  has_children: false,
  children_count: 0,
  children_age_bands: [],
  partner_children: 'any',
  pets: [],
  pet_allergy: false,
  smoking: null,
  alcohol: null,
  diet: null,
  chronotype: null,
  work_mode: null,
  living_arrangement: null,
  relocation: null,
  move_in: null,
  separate_rooms: null,
  expenses: null,
  photo_paths: [],
};

/** Keeps only the editable fields of a listing row, with defaults for anything missing. */
export function toDraft(row: Record<string, unknown>): ListingDraft {
  const draft = { ...EMPTY_DRAFT };
  for (const key of Object.keys(EMPTY_DRAFT) as (keyof ListingDraft)[]) {
    if (row[key] !== undefined && row[key] !== null) (draft as Record<string, unknown>)[key] = row[key];
  }
  return draft;
}
