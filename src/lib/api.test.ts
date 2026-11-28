import { EMPTY_DRAFT } from '@/lib/draft';
import { supabase } from '@/lib/supabase';

import {
  addSlot,
  ApiError,
  availability,
  bookableStarts,
  bookMeeting,
  displayNames,
  cancelMeeting,
  deleteSlot,
  myMeetings,
  updateProfile,
  blockUser,
  deleteAccount,
  getMyListing,
  myAccount,
  myRequests,
  report,
  respondToRequest,
  saveMyListing,
  searchListings,
  sendRequest,
  setProfilePhoto,
  signedPhotoUrls,
  uploadPhoto,
} from './api';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    storage: { from: jest.fn() },
    functions: { invoke: jest.fn() },
    auth: { signOut: jest.fn() },
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: jest.fn(() => ({
        renderAsync: jest.fn(async () => ({ saveAsync: jest.fn(async () => ({ uri: 'file:///out.jpg' })) })),
      })),
    })),
  },
}));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
const storageFrom = supabase.storage.from as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

/** A chainable query builder whose terminal value is `result`. */
function query(result: unknown) {
  const builder: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const m of ['select', 'order', 'limit', 'insert', 'update', 'upsert', 'eq', 'gt', 'in', 'maybeSingle']) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => jest.clearAllMocks());

describe('searchListings', () => {
  it('maps filters to RPC parameters with safe defaults', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a' }], error: null });
    await expect(searchListings({ country: 'it', noPets: true })).resolves.toEqual([{ id: 'a' }]);
    expect(rpc).toHaveBeenCalledWith('search_listings', {
      p_country: 'it',
      p_has_children: null,
      p_i_have_children: null,
      p_no_pets: true,
      p_no_smoking: null,
      p_age_bands: null,
      p_languages: null,
      p_living: null,
      p_move_in: null,
      p_lat: null,
      p_lng: null,
      p_radius_km: null,
      p_sort: 'newest',
      p_limit: 20,
      p_offset: 0,
    });
  });

  it('passes every filter through and treats empty data as no results', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      searchListings({ hasChildren: true, noSmoking: true, lat: 1, lng: 2, radiusKm: 25, sort: 'nearest', offset: 20 }),
    ).resolves.toEqual([]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_country: null, p_lat: 1, p_radius_km: 25, p_sort: 'nearest', p_offset: 20 });
  });

  it('sends list filters only when they have values', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await searchListings({ ageBands: ['25_34'], languages: [], living: ['new_place'], moveIn: ['asap'], iHaveChildren: true });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_age_bands: ['25_34'],
      p_languages: null,
      p_living: ['new_place'],
      p_move_in: ['asap'],
      p_i_have_children: true,
    });
  });

  it('throws ApiError with the database code', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited' } });
    await expect(searchListings({})).rejects.toEqual(new ApiError('rate_limited'));
  });
});

describe('account and requests', () => {
  it('myAccount returns the account or null', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'me' }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(myAccount()).resolves.toEqual({ id: 'me' });
    await expect(myAccount()).resolves.toBeNull();
  });

  it('sendRequest calls the RPC and returns the request id', async () => {
    rpc.mockResolvedValue({ data: 'req-1', error: null });
    await expect(sendRequest('l1', 'Hi')).resolves.toBe('req-1');
    expect(rpc).toHaveBeenCalledWith('send_connection_request', { p_listing_id: 'l1', p_message: 'Hi' });
  });

  it('respondToRequest passes the decision', async () => {
    rpc.mockResolvedValue({ error: null });
    await respondToRequest('r1', false);
    expect(rpc).toHaveBeenCalledWith('respond_to_request', { p_request_id: 'r1', p_accept: false });
  });

  it('myRequests reads only the needed columns', async () => {
    const q = query({ data: [{ id: 'r1' }], error: null });
    from.mockReturnValue(q);
    await expect(myRequests()).resolves.toEqual([{ id: 'r1' }]);
    expect(from).toHaveBeenCalledWith('connection_requests');
    expect(q.limit).toHaveBeenCalledWith(100);
  });

  it('myRequests returns an empty list when there is no data', async () => {
    from.mockReturnValue(query({ data: null, error: null }));
    await expect(myRequests()).resolves.toEqual([]);
  });
});

describe('safety actions', () => {
  it('blockUser inserts a block', async () => {
    const q = query({ error: null });
    from.mockReturnValue(q);
    await blockUser('me', 'other');
    expect(q.insert).toHaveBeenCalledWith({ blocker_id: 'me', blocked_id: 'other' });
  });

  it('report fills optional fields', async () => {
    const q = query({ error: null });
    from.mockReturnValue(q);
    await report({ me: 'me', reportedId: 'x', reason: 'is_man' });
    expect(q.insert).toHaveBeenCalledWith({
      reporter_id: 'me',
      reported_id: 'x',
      reason: 'is_man',
      details: '',
      listing_id: null,
      request_id: null,
    });
    await report({ me: 'me', reportedId: 'x', reason: 'other', details: 'd', listingId: 'l', requestId: 'r' });
    expect(q.insert).toHaveBeenLastCalledWith(expect.objectContaining({ details: 'd', listing_id: 'l', request_id: 'r' }));
  });

  it('report surfaces errors', async () => {
    from.mockReturnValue(query({ error: { message: 'permission denied' } }));
    await expect(report({ me: 'me', reportedId: 'x', reason: 'scam' })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('listing and photos', () => {
  it('getMyListing reads the own row', async () => {
    const q = query({ data: { id: 'l1' }, error: null });
    from.mockReturnValue(q);
    await expect(getMyListing('me')).resolves.toEqual({ id: 'l1' });
    expect(q.eq).toHaveBeenCalledWith('owner_id', 'me');
  });

  it('saveMyListing upserts, upper-cases the country and sets the status', async () => {
    const q = query({ error: null });
    from.mockReturnValue(q);
    const draft = { ...EMPTY_DRAFT, title: 't', country_code: 'it', city: 'Roma' };
    await saveMyListing('me', draft, true);
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: 'me', country_code: 'IT', status: 'active' }),
      { onConflict: 'owner_id' },
    );
    expect(q.upsert.mock.calls[0][0]).toMatchObject({ target_country_code: null, target_city: null });
    await saveMyListing('me', { ...draft, target_country_code: ' pl', target_city: ' Kraków ' }, false);
    expect(q.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'draft', target_country_code: 'PL', target_city: 'Kraków' }),
      { onConflict: 'owner_id' },
    );
  });

  it('uploadPhoto re-encodes and uploads into the user folder', async () => {
    const upload = jest.fn(async () => ({ error: null }));
    storageFrom.mockReturnValue({ upload });
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })) as unknown as typeof fetch;
    await expect(uploadPhoto('me', 'profile-photos', 'file:///in.heic')).resolves.toBe('me/uuid-1.jpg');
    expect(storageFrom).toHaveBeenCalledWith('profile-photos');
    expect(upload).toHaveBeenCalledWith('me/uuid-1.jpg', expect.any(ArrayBuffer), { contentType: 'image/jpeg' });
  });

  it('setProfilePhoto updates the own profile', async () => {
    const q = query({ error: null });
    from.mockReturnValue(q);
    await setProfilePhoto('me', 'me/p.jpg');
    expect(q.update).toHaveBeenCalledWith({ photo_path: 'me/p.jpg' });
    expect(q.eq).toHaveBeenCalledWith('id', 'me');
  });

  it('signedPhotoUrls returns short-lived links and skips failures', async () => {
    const createSignedUrls = jest.fn(async () => ({ data: [{ signedUrl: 'u1' }, { signedUrl: null }], error: null }));
    storageFrom.mockReturnValue({ createSignedUrls });
    await expect(signedPhotoUrls('listing-photos', ['a', 'b'])).resolves.toEqual(['u1']);
    expect(createSignedUrls).toHaveBeenCalledWith(['a', 'b'], 300);
  });

  it('signedPhotoUrls handles empty input and empty data', async () => {
    await expect(signedPhotoUrls('listing-photos', [])).resolves.toEqual([]);
    storageFrom.mockReturnValue({ createSignedUrls: jest.fn(async () => ({ data: null, error: null })) });
    await expect(signedPhotoUrls('listing-photos', ['a'])).resolves.toEqual([]);
  });
});

describe('profile', () => {
  it('updateProfile trims the name and stores an empty one as null', async () => {
    const q = query({ error: null });
    from.mockReturnValue(q);
    await updateProfile('me', { display_name: '  Anna ', age_band: '35_44', languages: ['uk'] });
    expect(q.update).toHaveBeenCalledWith({ display_name: 'Anna', age_band: '35_44', languages: ['uk'] });
    await updateProfile('me', { display_name: '   ', age_band: null, languages: [] });
    expect(q.update).toHaveBeenLastCalledWith({ display_name: null, age_band: null, languages: [] });
    await updateProfile('me', { age_band: '25_34' });
    expect(q.update).toHaveBeenLastCalledWith({ age_band: '25_34' });
  });

  it('displayNames maps ids to names and skips the query for none', async () => {
    from.mockClear();
    await expect(displayNames([])).resolves.toEqual({});
    expect(from).not.toHaveBeenCalled();
    const q = query({ data: [{ id: 'a', display_name: 'Anna' }, { id: 'b', display_name: null }], error: null });
    from.mockReturnValue(q);
    await expect(displayNames(['a', 'b'])).resolves.toEqual({ a: 'Anna', b: '' });
    expect(q.in).toHaveBeenCalledWith('id', ['a', 'b']);
    from.mockReturnValue(query({ data: null, error: null }));
    await expect(displayNames(['a'])).resolves.toEqual({});
  });
});

describe('availability and meetings', () => {
  it('reads future slots of an owner', async () => {
    const q = query({ data: [{ id: 's1' }], error: null });
    q.gt = jest.fn(() => q);
    from.mockReturnValue(q);
    await expect(availability('owner')).resolves.toEqual([{ id: 's1' }]);
    expect(from).toHaveBeenCalledWith('availability_slots');
    expect(q.eq).toHaveBeenCalledWith('owner_id', 'owner');
    expect(q.gt).toHaveBeenCalledWith('ends_at', expect.any(String));
  });

  it('returns no slots when there is no data', async () => {
    const q = query({ data: null, error: null });
    q.gt = jest.fn(() => q);
    from.mockReturnValue(q);
    await expect(availability('owner')).resolves.toEqual([]);
  });

  it('adds and deletes slots', async () => {
    const q = query({ error: null });
    q.delete = jest.fn(() => q);
    from.mockReturnValue(q);
    const start = new Date('2026-12-01T10:00:00Z');
    const end = new Date('2026-12-01T12:00:00Z');
    await addSlot('me', start, end);
    expect(q.insert).toHaveBeenCalledWith({ owner_id: 'me', starts_at: start.toISOString(), ends_at: end.toISOString() });
    await deleteSlot('s1');
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('lists scheduled meetings', async () => {
    const q = query({ data: [{ id: 'm1' }], error: null });
    from.mockReturnValue(q);
    await expect(myMeetings()).resolves.toEqual([{ id: 'm1' }]);
    expect(q.eq).toHaveBeenCalledWith('status', 'scheduled');
    expect(q.gt).toHaveBeenCalledWith('starts_at', expect.any(String));
    from.mockReturnValue(query({ data: null, error: null }));
    await expect(myMeetings()).resolves.toEqual([]);
  });

  it('books and cancels meetings through RPCs', async () => {
    rpc.mockResolvedValue({ data: 'm1', error: null });
    const start = new Date('2026-12-01T10:00:00Z');
    await expect(bookMeeting('r1', start)).resolves.toBe('m1');
    expect(rpc).toHaveBeenCalledWith('book_meeting', { p_request_id: 'r1', p_starts_at: start.toISOString(), p_minutes: 60 });
    rpc.mockResolvedValue({ error: null });
    await cancelMeeting('m1');
    expect(rpc).toHaveBeenLastCalledWith('cancel_meeting', { p_meeting_id: 'm1' });
  });

  it('reads bookable starts from the database', async () => {
    rpc.mockResolvedValue({ data: ['2026-12-01T10:00:00+00:00'], error: null });
    await expect(bookableStarts('r1')).resolves.toEqual([new Date('2026-12-01T10:00:00Z')]);
    expect(rpc).toHaveBeenCalledWith('bookable_starts', { p_request_id: 'r1', p_minutes: 60 });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(bookableStarts('r1')).resolves.toEqual([]);
  });
});

describe('deleteAccount', () => {
  it('invokes the Edge Function and signs out', async () => {
    invoke.mockResolvedValue({ error: null });
    await deleteAccount();
    expect(invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('does not sign out when deletion fails', async () => {
    invoke.mockResolvedValue({ error: { message: 'boom' } });
    await expect(deleteAccount()).rejects.toBeInstanceOf(ApiError);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});
