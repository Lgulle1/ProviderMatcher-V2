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
