# Boston Home

An app for women looking for a partner for a Boston marriage: a shared home, household and children.
Product plan: [Boston: product and architecture plan (MVP)](https://claude.ai/artifact/GWWizSAggS3RGyDMuP442g) (in Ukrainian).

**Stack:** Expo (React Native) + TypeScript, Supabase (Postgres, Auth, Storage, Edge Functions).

## Layout

| Part | Where |
|---|---|
| Screens (Expo Router) | `src/app/` |
| Supabase client, API, contact filter | `src/lib/` |
| Translations (uk, en) | `src/i18n/` |
| Database schema, RLS, server functions | `supabase/migrations/` |
| Database tests | `supabase/tests/`, `scripts/test-db.sh` |
| Edge Functions | `supabase/functions/` |

### Security principles

- **Minimal data.** Pseudonym, photos, age band, approximate city. No phone numbers, documents or birthdates. Sign in with Apple requests neither name nor email.
- **Row Level Security on every table.** Clients get only the columns they need. Verification status, suspension, credits, and request and meeting states change only through server functions or the service role.
- **Showcase for guests.** `search_listings` returns only text and conditions to guests and accounts without a profile photo: no photos, no coordinates.
- **Selfie check is a switch.** At launch `app_settings.selfie_verification_required` is off: a profile photo is enough to publish and send requests, and the mandatory video call before any contact exchange is the identity check. Turning the switch on later (after the Didit integration) requires a passed selfie check instead. The search radius is at least 10 km, distance is returned as a band, and page size is capped.
- **Location.** Coordinates are snapped to a ~5 km grid with a fixed per-listing offset. The exact point is never stored.
- **Photos.** Re-encoded before upload (which strips EXIF/GPS) and kept in private buckets, served through links that expire after 5 minutes.
- **Requests.** No contact details before the video meeting: phone numbers, emails, links and messenger names are rejected in the database (`contains_contact_info`) and highlighted in the app. Daily limits: 3 requests for new accounts, 10 for others.
- **Reports.** A report automatically blocks the reported person. A report of "this is a man", threats or stalking from someone who interacted with the account suspends it at once; strangers need several distinct reports, so one malicious report cannot take down an honest listing.
- **Meetings.** Each booking reserves a 60-minute window; it is the gap between meetings and does not limit the call. The database offers only free starts (`bookable_starts`), rejects overlapping free time, and marks meetings completed 12 hours after the start (`complete_past_meetings`, scheduled with pg_cron every 30 minutes).
- **Location permission.** Foreground only and approximate: Android's precise and background location permissions are blocked in `app.json`.
- **Credits.** Kept only in a server-side ledger. A credit is refunded when a request is declined, expires after 7 days, or is withdrawn.

## Running

```bash
cp .env.example .env.local   # fill in the Supabase project URL and anon key
npm install
npx expo start
```

Sign in with Apple works only in a development build (`npx expo run:ios` or `eas build --profile development`), not in Expo Go.

## Checks

```bash
npm run typecheck
npx expo lint
npm test                # unit tests (Jest + React Native Testing Library)
npm run test:coverage   # same, fails below 80% statements/branches/functions/lines
npm run test:db         # migrations + 70 security checks on a local PostgreSQL
```

`test:db` needs PostgreSQL 14+ (`PGHOST`, `PGPORT`, `PGUSER` in the environment).

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests with the coverage gate, and the database tests on every pull request.

## Video meetings

`supabase/functions/meeting-join` checks in the database that the caller is a participant, the room is open (from 10 minutes before the start until 12 hours after) and nobody is blocked or suspended. It then creates a private two-person Daily room on first join and returns a personal token link. Calls have no time limit: neither the room nor the token ejects anyone. Recording and screen sharing are off.

- **Ending access.** Cancelling a meeting (by either woman, by a block, or because an account is suspended, which cancels her meetings) queues its room in `video_room_closures`. `supabase/functions/video-cleanup` runs every minute and deletes the room at Daily, which ejects anyone still in the call. Join tokens expire 15 minutes after issue, so a link copied from browser history is soon useless.
- **Errors.** Known database codes answer 403/404 with the code; anything else answers 500 and is logged. Daily failures answer 502 `video_unavailable`. If both women create the room at once, the loser reads it again.
- **Code layout.** The use cases live in `supabase/functions/_shared/video.ts` behind small ports (database, Daily, clock, log) and are unit-tested in Jest; the `index.ts` files only wire Supabase and `fetch`.
- **Chat (proposed product decision, awaiting confirmation).** Daily's in-call chat is on. It is not filtered by `contains_contact_info` and is not part of reports: after the video meeting, exchanging contacts is the point. Reports still work on the person.
- **Privacy policy.** Daily.co (Daily Co., Inc.) is a data processor for video and audio; nothing is recorded. It must be named in the privacy policy with its DPA.
- **Not yet device-tested.** Camera and microphone inside the in-app browser (`expo-web-browser`) must be checked on a real iPhone and Android phone before release.

Setup: create a Daily account (10,000 participant minutes a month are free), then:

```bash
supabase secrets set DAILY_API_KEY=... VIDEO_CLEANUP_SECRET=<random>
supabase functions deploy meeting-join
supabase functions deploy video-cleanup --no-verify-jwt
```

and in the SQL editor store the two Vault secrets the cron job reads: `select vault.create_secret('https://<project>.supabase.co', 'project_url'); select vault.create_secret('<same random>', 'video_cleanup_secret');`

## Data export and legal pages

`supabase/functions/export-my-data` returns everything stored about the caller as one JSON file (GDPR art. 15 and 20, Swiss FADP). The database function `export_user_data` (service role only) decides what belongs to her: profile, listing, free time, requests, meetings, reports she filed, the number of accounts she blocked, credits and verification checks. It leaves out anything that identifies another woman (ids, names and messages of the other side, report snapshots, video room names). Photos come as signed links that expire after one hour. The use case is in `supabase/functions/_shared/export.ts` behind ports, like the video functions. In the app, My profile has an "Export my data" button (share sheet on mobile, download on web).

The Privacy Policy and Terms of Use (`/legal/privacy`, `/legal/terms`, UA and EN) are plain data in `src/features/legal/content`. They are **drafts**: fill in the [bracketed] controller details, approve the text, then set `draft: false` to remove the draft notice.

```bash
supabase functions deploy export-my-data
```

## Next

- Selfie verification (Didit: liveness + face match) through an Edge Function and webhook, then turn on `selfie_verification_required`.
- Credit purchases (StoreKit / Google Play Billing, receipts verified on the server).
- Map view of listings (approximate points), push notifications without names.
- Moderation admin panel.
