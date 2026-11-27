// Deletes the caller's photos and account (App Store guideline 5.1.1(v), GDPR art. 17).
// Deploy: supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKETS = ['listing-photos', 'profile-photos'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response('Unauthorized', { status: 401 });
  const userId = userData.user.id;

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  for (const bucket of BUCKETS) {
    const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
    if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
  }

  // Cascades to profile, listing, requests, slots, meetings and credits.
  // Reports about this user keep their snapshot for moderation (reported_id becomes null).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return new Response('Delete failed', { status: 500 });
  return new Response(null, { status: 204 });
});
