import type {
  AgeBand,
  Alcohol,
  ChildAgeBand,
  Chronotype,
  Diet,
  Expenses,
  LivingArrangement,
  MoveIn,
  PartnerChildren,
  Pet,
  Relocation,
  Smoking,
  WorkMode,
} from '@/lib/types';

// Choices offered in the editor and filters. Labels live in i18n under `options.<group>.<value>`.
export const AGE_BANDS: AgeBand[] = ['18_24', '25_34', '35_44', '45_54', '55_plus'];
export const LANGUAGES = ['uk', 'en', 'pl', 'de', 'fr', 'it', 'es', 'ru'] as const;
export const CHILD_AGE_BANDS: ChildAgeBand[] = ['0_3', '4_11', '12_17'];
export const PARTNER_CHILDREN: PartnerChildren[] = ['welcome', 'no_children', 'any'];
export const PETS: Pet[] = ['cat', 'dog', 'other'];
export const SMOKING: Smoking[] = ['no', 'outside_only', 'yes'];
export const ALCOHOL: Alcohol[] = ['no', 'sometimes', 'yes'];
export const DIET: Diet[] = ['any', 'vegetarian', 'vegan'];
export const CHRONOTYPE: Chronotype[] = ['early', 'night', 'flexible'];
export const WORK_MODE: WorkMode[] = ['remote', 'office', 'shifts', 'other'];
export const LIVING: LivingArrangement[] = ['my_place', 'partner_place', 'new_place', 'flexible'];
export const RELOCATION: Relocation[] = ['yes', 'within_country', 'no'];
export const MOVE_IN: MoveIn[] = ['asap', '3_6_months', '1_year_plus'];
export const EXPENSES: Expenses[] = ['equal', 'proportional', 'discuss'];
export const RADII_KM = [10, 25, 50, 100] as const;

/** Adds the value when missing, removes it when present. */
export function toggleIn<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}
