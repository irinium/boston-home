# Boston Home moderation panel

A small web app for moderators: the report queue, suspending and unsuspending accounts, hiding
listings, and the audit log. It talks to the same Supabase project as the mobile app, only through
the `admin_*` RPCs in `supabase/migrations/20261204000000_moderation.sql`.

## Running

```bash
cd admin
cp .env.example .env.local   # Supabase URL and the public anon key
npm install
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm run test:coverage` (fails below 80%), `npm run build`.

## Adding a moderator

Admins sign in with an emailed one-time code (Supabase Auth, email OTP). The panel never creates
accounts, so the moderator first needs a Supabase Auth user with that email. Then, in the SQL editor
(service role):

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'moderator@example.org';
```

Remove access with `delete from public.admin_users where user_id = ...`. In the Supabase dashboard,
make sure the email template sends the code (`{{ .Token }}`), not only a magic link.

## Rules

- Every admin RPC checks `admin_users` first and answers `not_admin` otherwise. The panel signs a
  non-admin out right after the code is verified, but the database is the real gate.
- Every action needs a reason (3 to 500 characters) and is written to `moderation_log` in the same
  transaction. The log is append-only: updates, deletes and truncation are rejected for every role.
- Unsuspending lifts the suspension only. Blocks that members created, including the automatic block
  a report adds, stay in place. Moderators cannot be suspended from the panel.
- A hidden listing comes back **paused**, so its owner decides when to publish it again.
- The panel never sees who filed a report, contact details or coordinates.

## Code layout (clean architecture)

| Layer | Where | Depends on |
|---|---|---|
| Domain: entities, rules, validation | `src/domain` | nothing |
| Application: use cases and ports | `src/application` | domain |
| Infrastructure: Supabase adapters, payload schemas (zod) | `src/infrastructure` | application ports, domain |
| UI: React components | `src/ui` | application services via context |
| Composition root | `src/main.tsx` | everything, wires it together |

Tests use in-memory fakes of the ports (`test/fakes.ts`), so the use cases and screens run without a
network. Strings live in `src/i18n` (`uk.ts`, `en.ts`) under the `moderation` namespace.
