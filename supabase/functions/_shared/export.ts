// Use case behind the `export-my-data` Edge Function (GDPR art. 15 and 20, Swiss FADP art. 25 and 28).
// It depends only on the small ports below, so the Deno entry point stays thin and this logic is
// covered by Jest. The database decides which records belong to the user (`export_user_data`);
// this module adds the account details, short-lived photo links and the file envelope.

export const EXPORT_FORMAT = 'boston-home-export';
export const EXPORT_VERSION = 1;
/** Photo links in the export stop working after this many seconds. */
export const PHOTO_LINK_SECONDS = 60 * 60;

export type PhotoBucket = 'profile-photos' | 'listing-photos';

/** The auth user, as the Edge Function already knows her from the JWT. */
export type ExportUser = { id: string; email?: string | null; created_at?: string | null };

/** The part of `export_user_data` this module reads; everything else is passed through as is. */
export type UserData = {
  profile?: { photo_path?: string | null } | null;
  listing?: { photo_paths?: string[] | null } | null;
  [section: string]: unknown;
};

export type ExportPorts = {
  /** `export_user_data` with the service role. */
  exportUserData(userId: string): Promise<{ data: UserData | null; error: { message: string } | null }>;
  /** Signed download links for private photos, in the order of `paths` (null where signing failed). */
  signPhotos(bucket: PhotoBucket, paths: string[], seconds: number): Promise<(string | null)[]>;
  now(): Date;
  log(message: string, detail?: unknown): void;
};

export type PhotoRef = { bucket: PhotoBucket; path: string };
export type ExportedPhoto = PhotoRef & { url: string | null };

export type ExportReply =
  | { status: 200; body: Record<string, unknown>; fileName: string }
  | { status: 404 | 500; body: { error: string } };

/** Every photo the user stored, grouped per bucket in a stable order. Only paths under her own folder count. */
export function photoRefs(userId: string, data: UserData): PhotoRef[] {
  const own = (path: unknown): path is string => typeof path === 'string' && path.startsWith(`${userId}/`);
  const profile = [data.profile?.photo_path].filter(own).map((path) => ({ bucket: 'profile-photos' as const, path }));
  const listing = (data.listing?.photo_paths ?? []).filter(own).map((path) => ({ bucket: 'listing-photos' as const, path }));
  return [...profile, ...listing];
}

/** `boston-home-data-2026-11-28.json` (UTC date). */
export function exportFileName(at: Date): string {
  return `boston-home-data-${at.toISOString().slice(0, 10)}.json`;
}

async function signAll(ports: ExportPorts, refs: PhotoRef[]): Promise<ExportedPhoto[]> {
  const buckets = [...new Set(refs.map((r) => r.bucket))];
  const signed = await Promise.all(
    buckets.map(async (bucket) => {
      const paths = refs.filter((r) => r.bucket === bucket).map((r) => r.path);
      const urls = await ports.signPhotos(bucket, paths, PHOTO_LINK_SECONDS).catch((e: unknown) => {
        // The export is still useful without links: the paths say which photos exist.
        ports.log('photo signing failed', { bucket, error: String(e) });
        return paths.map(() => null);
      });
      return paths.map((path, i) => ({ bucket, path, url: urls[i] ?? null }));
    }),
  );
  return signed.flat();
}

/** Everything stored about the signed-in user, as one JSON document. */
export async function exportMyData(ports: ExportPorts, user: ExportUser): Promise<ExportReply> {
  const { data, error } = await ports.exportUserData(user.id);
  if (error) {
    if (error.message.includes('user_not_found')) return { status: 404, body: { error: 'user_not_found' } };
    ports.log('export_user_data failed', error.message);
    return { status: 500, body: { error: 'failed' } };
  }
  if (!data) return { status: 404, body: { error: 'user_not_found' } };

  const now = ports.now();
  const photos = await signAll(ports, photoRefs(user.id, data));
  return {
    status: 200,
    fileName: exportFileName(now),
    body: {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      generated_at: now.toISOString(),
      account: { id: user.id, email: user.email ?? null, created_at: user.created_at ?? null },
      ...data,
      photos,
      photo_links_expire_at: new Date(now.getTime() + PHOTO_LINK_SECONDS * 1000).toISOString(),
    },
  };
}
