// Sends queued push notifications (public.notification_outbox) through the Expo push service.
// Called every minute by pg_cron (see migration 20261203000000_push_notifications.sql).
// Deploy: supabase functions deploy notify --no-verify-jwt
// Secrets: supabase secrets set NOTIFY_SECRET=<random> [EXPO_ACCESS_TOKEN=...]
// Vault (read by the cron job): select vault.create_secret('<same random>', 'notify_secret');
// (`project_url` is already stored for video-cleanup.)
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json } from '../_shared/daily-http.ts';
import { expoPushApi } from '../_shared/expo-push-http.ts';
import { sendDuePushes, type ClaimedPush } from '../_shared/notify.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const result = await sendDuePushes({
    claim: async (limit) => {
      const { data, error } = await admin.rpc('claim_push_batch', { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as ClaimedPush[];
    },
    finish: async ({ sent, retry, deadTokens }) => {
      const { error } = await admin.rpc('finish_push_batch', { p_sent: sent, p_retry: retry, p_dead_tokens: deadTokens });
      if (error) throw error;
    },
    push: expoPushApi(Deno.env.get('EXPO_ACCESS_TOKEN') || undefined),
    log: (message, detail) => console.error(message, detail),
  });
  return json(result);
});
