import { ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';

import { fetchMapListings } from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));

const rpc = supabase.rpc as jest.Mock;
const bounds = { south: 1, west: 2, north: 3, east: 4 };

beforeEach(() => rpc.mockReset());

it('calls map_listings with the box and every filter', async () => {
  rpc.mockResolvedValue({ data: [{ id: 'l1' }], error: null });
  const result = await fetchMapListings(bounds, {
    country: 'it',
    hasChildren: true,
    iHaveChildren: true,
    noPets: true,
    noSmoking: false,
    ageBands: ['35_44'],
    languages: ['uk'],
    living: ['my_place'],
    moveIn: ['asap'],
    lat: 41.9,
    lng: 12.5,
    radiusKm: 25,
  });
  expect(result).toEqual([{ id: 'l1' }]);
  expect(rpc).toHaveBeenCalledWith('map_listings', {
    p_south: 1,
    p_west: 2,
    p_north: 3,
    p_east: 4,
    p_country: 'it',
    p_has_children: true,
    p_i_have_children: true,
    p_no_pets: true,
    p_no_smoking: false,
    p_age_bands: ['35_44'],
    p_languages: ['uk'],
    p_living: ['my_place'],
    p_move_in: ['asap'],
    p_lat: 41.9,
    p_lng: 12.5,
    p_radius_km: 25,
    p_limit: 200,
  });
});

it('sends nulls for unset filters and handles empty data', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect(await fetchMapListings(bounds, { ageBands: [] })).toEqual([]);
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_country: null, p_age_bands: null, p_lat: null, p_radius_km: null });
});

it('raises the database error code', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'verification_required' } });
  const call = fetchMapListings(bounds, {});
  await expect(call).rejects.toBeInstanceOf(ApiError);
  await expect(call).rejects.toThrow('verification_required');
});
