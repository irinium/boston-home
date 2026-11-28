import { exportFileName, exportMyData, photoRefs, PHOTO_LINK_SECONDS, type ExportPorts, type UserData } from './export';

const ME = 'u1';
const NOW = new Date('2026-11-28T17:00:00Z');
const DATA: UserData = {
  profile: { photo_path: `${ME}/face.jpg` },
  listing: { photo_paths: [`${ME}/a.jpg`, `${ME}/b.jpg`] },
  requests_sent: [],
};

function ports(over: Partial<ExportPorts> = {}): ExportPorts {
  return {
    exportUserData: async () => ({ data: DATA, error: null }),
    signPhotos: async (bucket, paths) => paths.map((p) => `https://signed/${bucket}/${p}`),
    now: () => NOW,
    log: jest.fn(),
    ...over,
  };
}

describe('photoRefs', () => {
  it('lists the profile photo first, then listing photos', () => {
    expect(photoRefs(ME, DATA)).toEqual([
      { bucket: 'profile-photos', path: `${ME}/face.jpg` },
      { bucket: 'listing-photos', path: `${ME}/a.jpg` },
      { bucket: 'listing-photos', path: `${ME}/b.jpg` },
    ]);
  });

  it('ignores missing photos and paths outside her own folder', () => {
    expect(photoRefs(ME, { profile: { photo_path: null }, listing: null })).toEqual([]);
    expect(photoRefs(ME, { profile: null, listing: { photo_paths: ['someone/x.jpg', `${ME}/ok.jpg`] } })).toEqual([
      { bucket: 'listing-photos', path: `${ME}/ok.jpg` },
    ]);
    expect(photoRefs(ME, {})).toEqual([]);
  });
});

it('names the file after the UTC date', () => {
  expect(exportFileName(new Date('2026-01-02T23:30:00-02:00'))).toBe('boston-home-data-2026-01-03.json');
});

describe('exportMyData', () => {
  it('wraps her data with the account, signed photo links and their expiry', async () => {
    const signPhotos = jest.fn(ports().signPhotos);
    const reply = await exportMyData(ports({ signPhotos }), { id: ME, email: 'a@b.ch', created_at: '2026-01-01T00:00:00Z' });

    expect(reply.status).toBe(200);
    if (reply.status !== 200) return;
    expect(reply.fileName).toBe('boston-home-data-2026-11-28.json');
    expect(reply.body).toMatchObject({
      format: 'boston-home-export',
      version: 1,
      generated_at: NOW.toISOString(),
      account: { id: ME, email: 'a@b.ch', created_at: '2026-01-01T00:00:00Z' },
      requests_sent: [],
      photo_links_expire_at: '2026-11-28T18:00:00.000Z',
    });
    expect(reply.body.photos).toEqual([
      { bucket: 'profile-photos', path: `${ME}/face.jpg`, url: `https://signed/profile-photos/${ME}/face.jpg` },
      { bucket: 'listing-photos', path: `${ME}/a.jpg`, url: `https://signed/listing-photos/${ME}/a.jpg` },
      { bucket: 'listing-photos', path: `${ME}/b.jpg`, url: `https://signed/listing-photos/${ME}/b.jpg` },
    ]);
    // One signing call per bucket.
    expect(signPhotos).toHaveBeenCalledTimes(2);
    expect(signPhotos).toHaveBeenCalledWith('listing-photos', [`${ME}/a.jpg`, `${ME}/b.jpg`], PHOTO_LINK_SECONDS);
  });

  it('does not ask for links when she has no photos, and fills unknown account fields with null', async () => {
    const signPhotos = jest.fn();
    const reply = await exportMyData(
      ports({ signPhotos, exportUserData: async () => ({ data: { profile: { photo_path: null } }, error: null }) }),
      { id: ME },
    );
    expect(signPhotos).not.toHaveBeenCalled();
    expect(reply.body).toMatchObject({ account: { id: ME, email: null, created_at: null }, photos: [] });
  });

  it('still exports when signing fails, with the paths but no links', async () => {
    const log = jest.fn();
    const reply = await exportMyData(
      ports({ log, signPhotos: async () => Promise.reject(new Error('storage down')) }),
      { id: ME },
    );
    expect(reply.status).toBe(200);
    expect((reply.body.photos as { url: unknown }[]).map((p) => p.url)).toEqual([null, null, null]);
    expect(log).toHaveBeenCalledWith('photo signing failed', expect.objectContaining({ bucket: 'profile-photos' }));
  });

  it('keeps a link null when storage returns fewer links than paths', async () => {
    const reply = await exportMyData(ports({ signPhotos: async () => ['https://only-one'] }), { id: ME });
    expect((reply.body.photos as { url: unknown }[]).map((p) => p.url)).toEqual(['https://only-one', 'https://only-one', null]);
  });

  it('answers 404 for an unknown user', async () => {
    await expect(
      exportMyData(ports({ exportUserData: async () => ({ data: null, error: { message: 'user_not_found' } }) }), { id: ME }),
    ).resolves.toEqual({ status: 404, body: { error: 'user_not_found' } });
    await expect(exportMyData(ports({ exportUserData: async () => ({ data: null, error: null }) }), { id: ME })).resolves.toEqual({
      status: 404,
      body: { error: 'user_not_found' },
    });
  });

  it('hides database errors behind a generic 500 and logs them', async () => {
    const log = jest.fn();
    const reply = await exportMyData(
      ports({ log, exportUserData: async () => ({ data: null, error: { message: 'connection reset' } }) }),
      { id: ME },
    );
    expect(reply).toEqual({ status: 500, body: { error: 'failed' } });
    expect(log).toHaveBeenCalledWith('export_user_data failed', 'connection reset');
  });
});
