// Returns everything stored about the caller as a JSON file (GDPR art. 15 and 20, Swiss FADP art. 25 and 28).
// Deploy: supabase functions deploy export-my-data
import { createClient } from 'npm:@supabase/supabase-js@2';

import { exportMyData } from '../_shared/export.ts';

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    // Personal data: never cache it anywhere on the way.
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { id, email, created_at } = userData.user;

  const reply = await exportMyData(
    {
      exportUserData: async (userId) => {
        const { data, error } = await admin.rpc('export_user_data', { p_user: userId });
        return { data, error };
      },
      signPhotos: async (bucket, paths, seconds) => {
        const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, seconds);
        if (error) throw error;
        return paths.map((path) => data.find((d) => d.path === path)?.signedUrl ?? null);
      },
      now: () => new Date(),
      log: (message, detail) => console.error(message, detail),
    },
    { id, email, created_at },
  );

  if (reply.status !== 200) return json(reply.body, reply.status);
  return json(reply.body, 200, { 'Content-Disposition': `attachment; filename="${reply.fileName}"` });
});
