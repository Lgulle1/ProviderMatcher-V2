# Tenant isolation tests (staging Supabase only)

Automated checks for the RLS migration in `supabase/migrations/20260619_harden_tenant_security.sql`.

**Never run these against production.** The suite refuses to start unless safety guards pass.

## Prerequisites

1. A **separate staging** Supabase project with the security migration applied.
2. Copy `.env.test.example` to `.env.test.local` (gitignored).
3. Fill in staging credentials and set `ALLOW_REMOTE_SUPABASE_TESTS=true`.

| Variable | Purpose |
|----------|---------|
| `ALLOW_REMOTE_SUPABASE_TESTS` | Must be exactly `true` or tests refuse to run |
| `SUPABASE_TEST_URL` | Staging project URL |
| `SUPABASE_TEST_ANON_KEY` | Staging anon key |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | Staging service role key (setup/cleanup only) |

The runner also **blocks** any URL containing the production project reference `wuhtfeptdrbdlmnxtumo`.

## Run

```bash
npm run test:tenant
```

Static checks only (no Supabase connection):

```bash
npm run test:tenant:lint
npm run test:tenant:typecheck
```

Watch mode:

```bash
npm run test:tenant:watch
```

## What is tested

1. Anonymous reads/writes against application tables are blocked.
2. Tenant A cannot read, insert, update, or delete tenant B data.
3. Forged `org_id` inserts and updates are denied.
4. Random UUID lookups return no rows.
5. Provider image uploads outside the user org folder are denied; in-folder uploads succeed.
6. Same-organization CRUD succeeds.
7. Users may change `name` only (`id`, `org_id`, `email`, `created_at` are immutable).
8. Authenticated clients cannot write `widget_sessions` or `widget_session_events`.
9. Viewers can read their tenant but cannot write configuration, and the last owner cannot be demoted.
10. Provider imports commit atomically, roll back on late failures, and reject cross-tenant conflict targets.
11. `afterAll` cleanup removes test auth users, rows, and storage objects via the service role.

## Safety notes

- Keys and tokens are never logged.
- Do not commit `.env.test.local`.
- Do not add test credentials to Vercel or client bundles.
