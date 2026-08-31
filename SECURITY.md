# ProviderMatcher security and data handling

## Data classification

The public widget is designed not to request a patient's name, email address,
telephone number, postal address, date of birth, medical-record number, account
number, or insurance identifier. It assigns a random session identifier and
uses routing answers in browser memory, and records result counts,
providers shown/clicked, structural question identifiers, and interaction
events. The full answer vector and readable question/answer text are not sent
to telemetry.

This means the repository does not intentionally collect directly identifying
patient information. It does **not**, by itself, prove that every deployed data
flow is de-identified. Before production approval, the organization must verify:

- the configured questions do not request identity or allow unnecessary free text;
- Supabase, CDN, WAF, analytics, and error logs do not retain IP addresses or
  other identifiers alongside clinical answers;
- no third-party script on the embedding page joins widget activity to an
  identified user or advertising profile;
- the remaining answer combinations do not provide a reasonable basis for
  identifying an individual; and
- applicable state privacy laws and organizational policies, which may protect
  consumer health data even when HIPAA does not apply, have been reviewed.

The product owner and privacy/security reviewer must record the resulting
classification and approval. Application code must not silently expand the data
collected beyond that approved classification.

## Current safeguards

- Tenant application tables use Row Level Security.
- Anonymous table access is denied; public widget access is mediated by Edge
  Functions using explicit output projections and bounded inputs.
- Widget writes derive organization identity from the published widget rather
  than trusting a submitted organization id.
- Widget telemetry writes require a short-lived HMAC token bound to the
  published widget and random browser session.
- Database triggers enforce viewer/editor/owner permissions; tenant assignment
  for existing organizations comes from a server-side pending invitation.
- Provider imports execute through one tenant-derived PostgreSQL transaction.
- Raw widget sessions and events have a database-enforced 90-day deletion job;
  deployments must monitor that scheduled job and alert on failures.
- Administrative configuration changes have an append-only, tenant-scoped
  application audit trail.
- Public storage listing is disabled and tenant upload paths are checked.
- Client bundles contain only the public Supabase anonymous key, never the
  service-role key.

## Production requirements

Production release is blocked until all of the following have owners and are
tested:

- server-side invite enforcement, MFA/SSO decision, and role-based authorization;
- company-owned hosting, protected deployments, and a reproducible staging
  environment;
- global WAF/rate limiting for public functions;
- documented approval of the 90-day raw telemetry retention period and
  monitoring of the scheduled deletion job;
- encrypted backups and a tested restore procedure;
- centralized monitoring that excludes clinical answer content;
- export/retention of organization-deletion audit records in the platform or
  centralized audit system;
- incident response, breach assessment, rollback, and vendor-offboarding runbooks;
- accessibility, load, penetration, and cross-browser testing; and
- vendor/security/privacy approval for every production processor.

## Public widget publication controls

A live widget fails closed unless its organization has a narrow, valid domain
allowlist, the widget contains a privacy disclaimer, and a published snapshot
exists. The database enforces these requirements even if a caller bypasses the
admin UI. Public configuration and tracking endpoints also deny requests when
the allowlist is missing, invalid, or does not match the browser origin.

The concrete deployment, retention, export/deletion, restore, monitoring, and
incident steps are in `docs/production-readiness.md`.

## Secret handling

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Keep it in an approved secret manager
or local protected credential store, never in Vercel client variables, browser
bundles, source control, tickets, or logs. Rotate it immediately if exposure is
suspected.

## Reporting a vulnerability

Do not place patient data, credentials, or exploit details in a public issue.
Report vulnerabilities through the organization's private security channel. The
production owner and response SLA must be filled in before launch.
