import * as Location from 'expo-location';

import { EMPTY_DRAFT, toDraft } from './draft';
import { activeFilterCount, filterStore } from './filter-store';
import { roughLocation } from './location';
import { toggleIn } from './options';
import { changedFields } from './profile';
import { futureHours, nextDays, slotRange } from './slots';

jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 1 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

describe('roughLocation', () => {
  it('returns a rounded point with coarse accuracy', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 50.45678, longitude: 30.52345 } });
    await expect(roughLocation()).resolves.toEqual({ lat: 50.46, lng: 30.52 });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 1 });
  });

  it('returns null without permission', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await expect(roughLocation()).resolves.toBeNull();
  });
});

describe('toDraft', () => {
  it('keeps editable fields and fills defaults for missing or null ones', () => {
    const draft = toDraft({ id: 'x', title: 'T', smoking: null, pets: ['cat'], status: 'active' });
    expect(draft).toEqual({ ...EMPTY_DRAFT, title: 'T', pets: ['cat'] });
    expect(draft).not.toHaveProperty('id');
  });
});

describe('filter store', () => {
  it('notifies subscribers and can unsubscribe', () => {
    const listener = jest.fn();
    const off = filterStore.subscribe(listener);
    filterStore.set({ noPets: true });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    filterStore.set({});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('counts active filters', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ sort: 'age', radiusKm: 10 })).toBe(0);
    expect(activeFilterCount({ country: 'UA', lat: 1, lng: 2, ageBands: ['18_24'], languages: [], moveIn: ['asap'] })).toBe(4);
  });
});

describe('toggleIn', () => {
  it('adds and removes values', () => {
    expect(toggleIn(undefined, 'a')).toEqual(['a']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('slots', () => {
  it('keeps only hours still ahead today and all hours on later days', () => {
    const now = new Date(2026, 11, 1, 13, 30);
    expect(futureHours(new Date(2026, 11, 1), ['08', '13', '14', '20'], now)).toEqual(['14', '20']);
    expect(futureHours(new Date(2026, 11, 2), ['08', '13'], now)).toEqual(['08', '13']);
  });

  it('builds day lists and slot ranges in local time', () => {
    const days = nextDays(new Date(2026, 11, 31, 15), 3);
    expect(days.map((d) => [d.getMonth(), d.getDate(), d.getHours()])).toEqual([
      [11, 31, 0],
      [0, 1, 0],
      [0, 2, 0],
    ]);
    const [start, end] = slotRange(days[1], 18, 2);
    expect([start.getDate(), start.getHours(), end.getHours()]).toEqual([1, 18, 20]);
  });
});

describe('profile changes', () => {
  const before = { display_name: 'Olena', age_band: '35_44' as const, languages: ['uk', 'en'] };

  it('sends nothing when nothing changed, ignoring order and padding', () => {
    expect(changedFields(before, { ...before, display_name: ' Olena ', languages: ['en', 'uk'] })).toEqual({});
  });

  it('sends only the changed fields', () => {
    expect(changedFields(before, { ...before, age_band: null, languages: ['uk'] })).toEqual({ age_band: null, languages: ['uk'] });
    expect(changedFields(before, { ...before, display_name: 'Ola' })).toEqual({ display_name: 'Ola' });
  });
});

describe('joinState', () => {
  const { joinState } = jest.requireActual<typeof import('./meeting-time')>('./meeting-time');
  const start = '2026-12-01T10:00:00Z';
  const at = (iso: string) => Date.parse(iso);

  it('opens 10 minutes early and is over 12 hours after the start', () => {
    expect(joinState(start, at('2026-12-01T09:49:00Z'))).toBe('waiting');
    expect(joinState(start, at('2026-12-01T09:50:00Z'))).toBe('open');
    expect(joinState(start, at('2026-12-01T22:00:00Z'))).toBe('open');
    expect(joinState(start, at('2026-12-01T22:00:01Z'))).toBe('over');
  });
});
