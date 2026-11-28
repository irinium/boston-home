import { supabase } from '@/lib/supabase';

import {
  ApiError,
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
  for (const m of ['select', 'order', 'limit', 'insert', 'update', 'upsert', 'eq', 'maybeSingle']) {
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
      p_no_pets: true,
      p_no_smoking: null,
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
    const draft = {
      title: 't',
      about: '',
      looking_for: '',
      country_code: 'it',
      city: 'Roma',
      has_children: false,
      children_count: 0,
      photo_paths: [],
    };
    await saveMyListing('me', draft, true);
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: 'me', country_code: 'IT', status: 'active' }),
      { onConflict: 'owner_id' },
    );
    await saveMyListing('me', draft, false);
    expect(q.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'draft' }), { onConflict: 'owner_id' });
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
