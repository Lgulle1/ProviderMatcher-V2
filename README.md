# ProviderMatcher V2

Admin app for configuring provider-matching widgets, clinical routing rules, and analytics. Built with React, TypeScript, Vite, and Supabase.

## Local development

```bash
npm ci
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
# Optional: set VITE_ENABLE_SIGNUP=true to allow public sign-up (default: invite-only)
npm run dev
```

## Production build

```bash
npm ci
npm run build
```

The production bundle is written to `dist/`.

## Deploy to Vercel

| Setting | Value |
|---------|--------|
| **Build command** | `npm run build` |
| **Output directory** | `dist` |
| **Install command** | `npm ci` (default) |

### Required environment variables

Set these in the Vercel project **Environment Variables** settings:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g. `https://your-project.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) API key |
| `VITE_ENABLE_SIGNUP` | Optional. Must be exactly `true` to show sign-up on the login page. Any other value (including unset) keeps sign-up hidden and shows an invite-only message. |

See `.env.example` for a template.

> **Warning:** Never add `SUPABASE_SERVICE_ROLE_KEY` to Vercel or any other client-facing deployment. The service role key bypasses Row Level Security and must only be used in trusted server-side contexts (e.g. Supabase Edge Functions, local scripts).

SPA routing and security headers are configured in `vercel.json`.

## Database migrations & edge functions (Supabase)

Schema changes live in `supabase/migrations/*.sql` and are **not** applied automatically — pushing to `main` deploys the frontend (Vercel) and the widget (GitHub Pages), but the database and edge functions need their own explicit steps:

```bash
supabase db push
supabase functions deploy <name> --project-ref wuhtfeptdrbdlmnxtumo
```

There is no staging database gate — these commands write directly to production. Run them deliberately, not as a reflex.

### Migration filename gotcha

A migration's version is **everything before the first underscore** in its filename, not the full name. `20260818_add_x.sql` and `20260818_revert_y.sql` both version as `20260818` — a silent collision where only one of them ever gets recorded as applied. If you're adding more than one migration on the same day, give each a distinct time suffix: `20260818090000_add_x.sql`, `20260818090100_revert_y.sql`.

### If `db push` or `db pull` complains about migration history

This means the remote database's migration-history table doesn't match your local files — usually because a migration was applied under a different filename/version than what's in git now (e.g. after a rename), or something was applied directly outside of a tracked migration. **Don't blindly follow the CLI's suggested `migration repair` commands** — they're a generic template and can be wrong about which side (local vs. remote) is the actual source of truth. Verify first:

```bash
# What does remote think is applied, and under what version/name?
supabase db query --linked "select version, name from supabase_migrations.schema_migrations order by version desc limit 10"

# Does the column/table a given migration should have added actually exist?
supabase db query --linked "select column_name from information_schema.columns where table_schema='public' and table_name='<table>'"
```

Only after confirming what's *actually* on the database should you run `supabase migration repair --status applied|reverted <version>` — and only for the specific versions your query just confirmed, not the CLI's blanket suggestion.

### Rollback

Every migration file ends with a commented-out `ROLLBACK` block (manual application only — copy the commands out and run them yourself; nothing here is automatic). There's no down-migration tooling beyond that.

## Tenant isolation tests (staging only)

Remote Supabase RLS tests live in `tests/tenant-isolation/`. They require a **staging** project and a local `.env.test.local` file (see `.env.test.example`).

```bash
cp .env.test.example .env.test.local
# Configure staging credentials; set ALLOW_REMOTE_SUPABASE_TESTS=true
npm run test:tenant
```

See [tests/tenant-isolation/README.md](tests/tenant-isolation/README.md) for full setup and safety guards. **Do not point test env vars at production.**

## Widget (separate deploy)

The embeddable widget lives in `widget/` and is deployed separately (e.g. GitHub Pages via `.github/workflows/deploy-widget.yml`). It is not part of the Vercel admin app build.
