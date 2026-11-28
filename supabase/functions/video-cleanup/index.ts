// Deletes the Daily rooms of cancelled meetings (queued in public.video_room_closures),
// which ends video access at once. Called every minute by pg_cron (see the migration).
// Deploy: supabase functions deploy video-cleanup --no-verify-jwt
// Secrets: supabase secrets set DAILY_API_KEY=... VIDEO_CLEANUP_SECRET=...
import { createClient } from 'npm:@supabase/supabase-js@2';

import { dailyApi, json } from '../_shared/daily-http.ts';
import { closeQueuedRooms } from '../_shared/video.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('VIDEO_CLEANUP_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const result = await closeQueuedRooms({
    openClosures: async (limit) => {
      const { data, error } = await admin
        .from('video_room_closures')
        .select('room_name')
        .is('closed_at', null)
        .order('queued_at')
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => r.room_name);
    },
    markClosed: async (rooms) => {
      const { error } = await admin.from('video_room_closures').update({ closed_at: new Date().toISOString() }).in('room_name', rooms);
      if (error) throw error;
    },
    daily: dailyApi(Deno.env.get('DAILY_API_KEY')!),
    log: (message, detail) => console.error(message, detail),
  });
  return json(result);
});
