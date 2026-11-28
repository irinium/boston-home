// Gives a participant a link into the private video room of her meeting.
// Deploy: supabase functions deploy meeting-join
// Secrets: supabase secrets set DAILY_API_KEY=...
import { createClient } from 'npm:@supabase/supabase-js@2';

import { dailyApi, json } from '../_shared/daily-http.ts';
import { joinMeeting } from '../_shared/video.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  const { meeting_id: meetingId } = await req.json().catch(() => ({}));
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const reply = await joinMeeting(
    {
      meetingForJoin: async (id, user) => {
        const { data, error } = await admin.rpc('meeting_for_join', { p_meeting_id: id, p_user: user });
        return { data: Array.isArray(data) ? data[0] ?? null : data, error };
      },
      daily: dailyApi(Deno.env.get('DAILY_API_KEY')!),
      now: () => new Date(),
      log: (message, detail) => console.error(message, detail),
    },
    userData.user.id,
    meetingId,
  );
  return json(reply.body, reply.status);
});
