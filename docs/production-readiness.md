# ProviderMatcher production readiness runbook

This document separates controls implemented in this repository from approvals
and infrastructure settings that must be owned by IT. It is a release gate, not
a claim of legal compliance.

## Release architecture

- The React administration application is private and authenticates through
  Supabase Auth.
- PostgreSQL RLS provides tenant isolation. Database triggers additionally
  enforce `viewer`, `editor`, and `owner` write permissions.
- The public widget reads only a published, explicitly projected data shape.
- `widget-data` issues a short-lived HMAC token bound to one widget/session.
  `track-session` rejects writes without that token and never stores the full
  clinical answer vector or readable prompt/answer text.
- Raw widget telemetry is deleted after 90 days by a monitored database Cron
  job. Administrative changes are written to a separate append-only audit log.

## Required protected-environment values

Configure separate `staging` and `production` GitHub environments with required
reviewers. They need:

- secret `SUPABASE_ACCESS_TOKEN`;
- secret `SUPABASE_DB_PASSWORD`;
- variable `SUPABASE_PROJECT_ID`;
- a different, randomly generated 32+ character `WIDGET_SESSION_SECRET` per
  environment;
- variable `ADMIN_ALLOWED_ORIGINS`, containing the exact comma-separated admin
  application origins; and
- variable `ADMIN_INVITE_REDIRECT_URL`, an approved HTTPS Auth redirect.

The production widget workflow also requires a protected
`widget-production` environment with public variables `SUPABASE_URL` and
`SUPABASE_ANON_KEY`. `VITE_WIDGET_SCRIPT_URL` must point to the company-owned,
versioned HTTPS asset—not a personal GitHub Pages URL.

## First staging rollout

1. Create a disposable staging Supabase project and company-owned staging host.
2. Configure the protected staging environment and run `Deploy Supabase`.
3. Run CI's clean database rebuild and the remote tenant-isolation suite against
   staging. Never configure that suite with production credentials.
4. Deploy the new widget bundle and verify the health-check workflow receives a
   signed session token. Old widget bundles can still read configuration during
   the rollout but their telemetry is rejected after signed tracking is enabled.
5. Exercise signup invitation, viewer/editor/owner permissions, a failed import
   rollback, publishing/unpublishing, telemetry pruning, and audit-log reads.
6. Run accessibility, cross-browser, load, and authenticated/public penetration
   tests. Record results and remediation owners.
7. Take a staging backup, restore it into a second disposable project, and run
   smoke tests against the restore.
8. Privacy/security and application owners sign the release record before the
   same workflow is approved for production.

## Production configuration checklist

- Disable public email signup in Supabase Auth.
- Configure the company Site URL and exact redirect allowlist.
- Configure a 12+ character password minimum, the strongest required-character
  setting, leaked-password rejection where the plan supports it, refresh-token
  rotation, secure password changes, and Auth abuse limits. These hosted Auth
  controls must be verified in the Supabase dashboard/release evidence.
- Add 1-50 fully-qualified approved website domains in organization settings;
  wildcards and bare public suffixes are rejected.
- Have privacy approve the patient-facing disclaimer and HTTPS privacy-notice
  URL before publishing. The notice appears before the first question. Live
  widgets cannot serve or accept tracking without these controls.
- Require both CI jobs before merge: the application/Edge checks and the
  disposable-database rebuild, lint, storage, RBAC, and tenant-isolation suite.
- Require MFA/SSO according to IT policy; record any exception and expiration.
- Put the admin app behind the approved identity/network access layer.
- Put public Edge Functions behind global rate limiting/WAF rules. Application
  isolate rate limiting is only defense in depth.
- Enable database point-in-time recovery or approved backups, centralized logs,
  alert routing, and on-call ownership.
- Alert when the Cron job `provider-matcher-prune-widget-analytics` fails or has
  not succeeded for 26 hours.
- Confirm Vercel/Supabase/GitHub/CDN/WAF/error-monitoring log retention and IP
  handling. Do not send clinical answers to logs or third-party analytics.
- Record vendor approval, DPA/BAA determination, data residency, subprocessors,
  breach-notification terms, and vendor-offboarding steps.

## Deployment and rollback

Deploy only through the manual, protected workflows. The Supabase workflow sets
Edge secrets, applies reviewed migrations, deploys all functions, and runs
database advisors. The widget deploy remains a separate approval because it is
patient-facing.

Before production deployment, capture a backup/PITR checkpoint and migration
list. Application/widget rollback uses the previous immutable asset/deployment.
Database rollback must use the reviewed manual rollback notes or restore to a
new project; never improvise destructive SQL during an incident.

## Monitoring queries

```sql
-- Retention job definition and recent outcomes
select jobid, jobname, schedule, active
from cron.job
where jobname = 'provider-matcher-prune-widget-analytics';

select status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'provider-matcher-prune-widget-analytics'
)
order by start_time desc
limit 20;

-- Confirm raw telemetry does not exceed the approved window
select
  (select min(created_at) from public.widget_sessions) as oldest_session,
  (select min(created_at) from public.widget_session_events) as oldest_event;
```

## Data export and deletion

Widget telemetry contains random session identifiers rather than an intentional
patient identity field. If privacy determines a request can be linked to a
session, export/delete both telemetry tables by `org_id`, `widget_id`, and the
verified `session_id`. Require two-person review for production deletion and
retain the authorization—not the deleted health details—in the centralized
case/audit system.

Organization offboarding must export approved configuration/audit records,
disable widgets, revoke users and deployment credentials, remove hosted assets,
delete the organization under a reviewed change, and verify backup expiration.
Organization deletion audit evidence must live in the centralized platform log
because the in-database audit table is tenant-foreign-keyed.

## Incident response

1. Preserve centralized logs and establish an incident commander.
2. Disable the affected widget or deployment without deleting evidence.
3. Rotate exposed database, Supabase, GitHub, Vercel, and HMAC credentials.
4. Determine affected tenants, fields, processors, time window, and whether
   identifiers were linkable to health data.
5. Privacy/legal decides notification obligations and deadlines; engineering
   does not make that determination alone.
6. Restore through the approved workflow, validate tenant isolation and health
   checks, and document corrective actions.

Fill these before launch: incident commander/on-call channel, security contact,
privacy contact, vendor escalation contacts, RTO, RPO, severity definitions,
and notification decision owner.
