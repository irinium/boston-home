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
npm run test:db         # migrations + 61 security checks on a local PostgreSQL
```

`test:db` needs PostgreSQL 14+ (`PGHOST`, `PGPORT`, `PGUSER` in the environment).

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests with the coverage gate, and the database tests on every pull request.

## Next

- Selfie verification (Didit: liveness + face match) through an Edge Function and webhook, then turn on `selfie_verification_required`.
- Video meetings (Daily): room and tokens issued by an Edge Function for the booked start time. The call has no time limit: the room must not expire at `meetings.ends_at`.
- Credit purchases (StoreKit / Google Play Billing, receipts verified on the server).
- Map view of listings (approximate points), push notifications without names.
- Moderation admin panel.
