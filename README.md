# ProviderRoute

Admin app for configuring provider-matching widgets, clinical routing rules, and analytics. Built with React, TypeScript, Vite, and Supabase.

## Production URLs

| URL | Serves | Host |
|-----|--------|------|
| `app.providerroute.com` | This admin app | Vercel |
| `widget.providerroute.com/widget.js` | The embeddable widget bundle | GitHub Pages (`gh-pages` branch), Cloudflare-proxied |
| `providerroute.com` | Landing page (not yet built) | unconfigured |

## Local development

```bash
npm ci
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm run dev
```

## Production build

```bash
npm ci
npm run build
npm run check:migrations
npm run check:edge-safety
npm run check:edge-types
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
| `VITE_WIDGET_SCRIPT_URL` | Approved company-owned HTTPS URL for the versioned widget bundle. Required before embed code is issued. |
| `VITE_IDLE_TIMEOUT_MINUTES` | Admin inactivity timeout; defaults to 30 and cannot be configured below 5. |

The standalone widget build separately requires `SUPABASE_URL` and
`SUPABASE_ANON_KEY`. They are public browser configuration, but must be supplied
by the protected deployment environment so no developer/project identity is
hardcoded into the artifact.

See `.env.example` for a template.

Production onboarding is invitation-only. Disable public email signup in the
Supabase Auth settings. Invitations for a new organization must include
`full_name` and `organization_name` user metadata; on the invitee's first sign
in, the database-guarded `complete_signup` RPC atomically creates the profile
and organization. The RPC independently verifies that `auth.users.invited_at`
is present, so calling the public Auth signup API cannot create application data.

> **Warning:** Never add `SUPABASE_SERVICE_ROLE_KEY` to Vercel or any other client-facing deployment. The service role key bypasses Row Level Security and must only be used in trusted server-side contexts (e.g. Supabase Edge Functions, local scripts).

SPA routing and security headers are configured in `vercel.json`.

## Database migrations & edge functions (Supabase)

Schema changes live in `supabase/migrations/*.sql` and are **not** applied automatically. Database and edge functions need their own explicit, approved deployment steps:

```bash
supabase db push
supabase functions deploy <name> --project-ref <approved-project-ref>
```

Direct CLI commands target whichever project is linked and bypass the protected
release workflow. Reserve them for approved recovery work and verify the linked
project before running them.

The repository now includes a manual, protected `Deploy Supabase` workflow and
a disposable-database CI job. Configure a staging GitHub environment and follow
[`docs/production-readiness.md`](docs/production-readiness.md) instead of using
the direct production commands above for normal releases.

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

The embeddable widget lives in `widget/` and is deployed separately. The included GitHub Pages workflow is manual-only and targets a protected `widget-production` environment; production must use a company-owned repository and approved HTTPS asset URL. Configure the health-check workflow variables/secrets before enabling its schedule. The widget is not part of the Vercel admin app build.
