// Verifies a credit pack purchase with its store and grants the credits, exactly once.
// Body: { store: 'app_store' | 'play', product_id, token }, where token is the App Store
// transactionId or the Play purchaseToken.
// Deploy: supabase functions deploy purchase-verify
// Secrets: supabase secrets set APPLE_ISSUER_ID=... APPLE_KEY_ID=... APPLE_PRIVATE_KEY="$(cat AuthKey.p8)" \
//   APPLE_BUNDLE_ID=app.bostonhome PLAY_PACKAGE_NAME=app.bostonhome PLAY_SERVICE_ACCOUNT="$(cat sa.json)"
import { createClient } from 'npm:@supabase/supabase-js@2';

import { verifyPurchase } from '../_shared/billing.ts';
import { appStoreGateway, databaseLedger, playGateway } from '../_shared/billing-http.ts';
import { json } from '../_shared/daily-http.ts';

const env = (name: string) => Deno.env.get(name) ?? '';

// Created once per instance, so the store access tokens are cached between requests.
const stores = {
  app_store: appStoreGateway({
    issuerId: env('APPLE_ISSUER_ID'),
    keyId: env('APPLE_KEY_ID'),
    privateKeyPem: env('APPLE_PRIVATE_KEY'),
    bundleId: env('APPLE_BUNDLE_ID'),
  }),
  play: playGateway({
    serviceAccount: JSON.parse(env('PLAY_SERVICE_ACCOUNT') || '{}'),
    packageName: env('PLAY_PACKAGE_NAME'),
  }),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = env('SUPABASE_URL');
  const userClient = createClient(url, env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'));

  const reply = await verifyPurchase(
    {
      stores,
      ledger: databaseLedger((fn, args) => admin.rpc(fn, args)),
      log: (message, detail) => console.error(message, detail),
    },
    userData.user.id,
    body,
  );
  return json(reply.body, reply.status);
});
