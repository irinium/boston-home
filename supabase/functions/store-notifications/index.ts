// Refunds and revocations from the stores. Two endpoints:
//   POST .../store-notifications/app-store  App Store Server Notifications v2 ({ signedPayload })
//   POST .../store-notifications/play       Google Play RTDN through an authenticated Pub/Sub push
// Deploy: supabase functions deploy store-notifications --no-verify-jwt
//   (the stores do not send a Supabase JWT; each endpoint authenticates its caller itself)
// Secrets: the App Store ones of purchase-verify, plus PLAY_PACKAGE_NAME,
//   PUBSUB_AUDIENCE (the audience set on the push subscription) and
//   PUBSUB_SERVICE_ACCOUNT (the service account the subscription pushes as).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { handleAppStoreNotification, handlePlayNotification } from '../_shared/billing.ts';
import { appStoreGateway, databaseLedger, googlePushAuth } from '../_shared/billing-http.ts';
import { json } from '../_shared/daily-http.ts';

const env = (name: string) => Deno.env.get(name) ?? '';

const appStore = appStoreGateway({
  issuerId: env('APPLE_ISSUER_ID'),
  keyId: env('APPLE_KEY_ID'),
  privateKeyPem: env('APPLE_PRIVATE_KEY'),
  bundleId: env('APPLE_BUNDLE_ID'),
});
const pushAuth = googlePushAuth({ audience: env('PUBSUB_AUDIENCE'), serviceAccountEmail: env('PUBSUB_SERVICE_ACCOUNT') });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const ledger = databaseLedger((fn, args) => admin.rpc(fn, args));
const log = (message: string, detail?: unknown) => console.error(message, detail);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const path = new URL(req.url).pathname;
  const body = await req.json().catch(() => null);

  if (path.endsWith('/app-store')) {
    const reply = await handleAppStoreNotification({ appStore, ledger, log, bundleId: env('APPLE_BUNDLE_ID') }, body);
    return json(reply.body, reply.status);
  }
  if (path.endsWith('/play')) {
    if (!(await pushAuth(req.headers.get('Authorization')))) return json({ error: 'unauthorized' }, 401);
    const reply = await handlePlayNotification({ ledger, log, packageName: env('PLAY_PACKAGE_NAME') }, body);
    return json(reply.body, reply.status);
  }
  return json({ error: 'not_found' }, 404);
});
