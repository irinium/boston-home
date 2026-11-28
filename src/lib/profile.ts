import type { MyAccount, ProfileUpdate } from '@/lib/types';

/** Fields of the profile form, as the account holds them. */
export function fromAccount(account: MyAccount): ProfileUpdate {
  return { display_name: account.display_name ?? '', age_band: account.age_band, languages: account.languages };
}

/** Only the fields the user changed, so a save never overwrites anything else. */
export function changedFields(before: ProfileUpdate, after: ProfileUpdate): Partial<ProfileUpdate> {
  const changes: Partial<ProfileUpdate> = {};
  if (after.display_name.trim() !== before.display_name.trim()) changes.display_name = after.display_name;
  if (after.age_band !== before.age_band) changes.age_band = after.age_band;
  if ([...after.languages].sort().join() !== [...before.languages].sort().join()) changes.languages = after.languages;
  return changes;
}
