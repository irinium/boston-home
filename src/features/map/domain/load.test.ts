import { listing } from '../../../../test/fixtures';

import { loadMapListings, MAP_LIMIT, mapFilters, toPoints } from './load';

const bounds = { south: 1, west: 2, north: 3, east: 4 };

it('drops paging and sorting from the filters', () => {
  expect(mapFilters({ country: 'IT', offset: 40, sort: 'nearest', noPets: true })).toEqual({ country: 'IT', noPets: true });
});

it('keeps only listings with a point', () => {
  const items = [listing({ id: 'a', approx_lat: 1, approx_lng: 2 }), listing({ id: 'b' }), listing({ id: 'c', approx_lat: 3 })];
  expect(toPoints(items)).toEqual([{ id: 'a', latitude: 1, longitude: 2 }]);
});

it('loads the box, stores the listings and reports whether the area was capped', async () => {
  const items = [listing({ id: 'a', approx_lat: 1, approx_lng: 2 })];
  const source = jest.fn(async () => items);
  const store = { put: jest.fn() };
  const result = await loadMapListings({ source, store }, bounds, { country: 'PT', offset: 20 });
  expect(source).toHaveBeenCalledWith(bounds, { country: 'PT' });
  expect(store.put).toHaveBeenCalledWith(items);
  expect(result).toEqual({ points: [{ id: 'a', latitude: 1, longitude: 2 }], capped: false });

  const many = Array.from({ length: MAP_LIMIT }, (_, i) => listing({ id: `l${i}`, approx_lat: 1, approx_lng: 1 }));
  source.mockResolvedValueOnce(many);
  expect((await loadMapListings({ source, store }, bounds, {})).capped).toBe(true);
});

it('stores nothing when loading fails', async () => {
  const store = { put: jest.fn() };
  const source = jest.fn(async () => {
    throw new Error('offline');
  });
  await expect(loadMapListings({ source, store }, bounds, {})).rejects.toThrow('offline');
  expect(store.put).not.toHaveBeenCalled();
});
