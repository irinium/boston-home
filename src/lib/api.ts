import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';
import type {
  ConnectionRequest,
  ListingDraft,
  ListingSummary,
  MyAccount,
  SearchFilters,
} from '@/lib/types';

/** Error codes raised by the database functions, e.g. `rate_limited`. */
export class ApiError extends Error {}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new ApiError(error.message);
}

export async function searchListings(f: SearchFilters): Promise<ListingSummary[]> {
  const { data, error } = await supabase.rpc('search_listings', {
    p_country: f.country || null,
    p_has_children: f.hasChildren ?? null,
    p_no_pets: f.noPets ?? null,
    p_no_smoking: f.noSmoking ?? null,
    p_lat: f.lat ?? null,
    p_lng: f.lng ?? null,
    p_radius_km: f.radiusKm ?? null,
    p_sort: f.sort ?? 'newest',
    p_limit: 20,
    p_offset: f.offset ?? 0,
  });
  fail(error);
  return (data ?? []) as ListingSummary[];
}

export async function myAccount(): Promise<MyAccount | null> {
  const { data, error } = await supabase.rpc('my_account');
  fail(error);
  return (data as MyAccount | null) ?? null;
}

export async function sendRequest(listingId: string, message: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_connection_request', {
    p_listing_id: listingId,
    p_message: message,
  });
  fail(error);
  return data as string;
}

export async function respondToRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_request', { p_request_id: requestId, p_accept: accept });
  fail(error);
}

export async function myRequests(): Promise<ConnectionRequest[]> {
  const { data, error } = await supabase
    .from('connection_requests')
    .select('id, listing_id, owner_id, requester_id, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  fail(error);
  return data ?? [];
}

export async function blockUser(me: string, other: string): Promise<void> {
  const { error } = await supabase.from('blocks').insert({ blocker_id: me, blocked_id: other });
  fail(error);
}

export type ReportReason =
  | 'is_man'
  | 'threat'
  | 'harassment'
  | 'stalking'
  | 'fake'
  | 'inappropriate'
  | 'underage'
  | 'scam'
  | 'other';

export async function report(input: {
  me: string;
  reportedId: string;
  reason: ReportReason;
  details?: string;
  listingId?: string;
  requestId?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: input.me,
    reported_id: input.reportedId,
    reason: input.reason,
    details: input.details ?? '',
    listing_id: input.listingId ?? null,
    request_id: input.requestId ?? null,
  });
  fail(error);
}

export async function getMyListing(me: string) {
  const { data, error } = await supabase.from('listings').select('*').eq('owner_id', me).maybeSingle();
  fail(error);
  return data;
}

export async function saveMyListing(me: string, draft: ListingDraft, publish: boolean): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .upsert(
      { owner_id: me, ...draft, country_code: draft.country_code.toUpperCase(), status: publish ? 'active' : 'draft' },
      { onConflict: 'owner_id' },
    );
  fail(error);
}

/**
 * Re-encodes the photo (which drops EXIF metadata such as GPS location), shrinks it,
 * and uploads it to the user's own folder in a private bucket. Returns the storage path.
 */
export async function uploadPhoto(
  me: string,
  bucket: 'listing-photos' | 'profile-photos',
  uri: string,
): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: 1280, height: null }).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const body = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${me}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg' });
  fail(error);
  return path;
}

/** Sets the face photo that listing owners see on incoming requests. */
export async function setProfilePhoto(me: string, path: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ photo_path: path }).eq('id', me);
  fail(error);
}

/** Short-lived links, so photos can't be hot-linked or scraped later. */
export async function signedPhotoUrls(bucket: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 300);
  fail(error);
  return (data ?? []).map((d) => d.signedUrl ?? '').filter(Boolean);
}

/** Deletes photos and the account (Edge Function `delete-account`). */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  fail(error);
  await supabase.auth.signOut();
}
