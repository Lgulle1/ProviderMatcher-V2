// Derived from database.generated.ts, which `supabase gen types typescript`
// produces from the real schema. These were hand-maintained until 2026-09-02
// and had drifted from the database they described, so the compiler was
// checking the app against a description rather than against the schema.
// check-db-types.mjs fails CI if the generated file stops matching the
// migrations, so this stays true on its own.
import type { Database } from './database.generated'

export type { Database, Json } from './database.generated'

type Tables = Database['public']['Tables']

/** A table's row shape, exactly as the database defines it. */
export type Row<T extends keyof Tables> = Tables[T]['Row']

/** Insert shape: columns with defaults or nullability are optional. */
export type Insert<T extends keyof Tables> = Tables[T]['Insert']

/** Update shape: every column optional. */
export type Update<T extends keyof Tables> = Tables[T]['Update']

export type Organization = Row<'organizations'>
export type User = Row<'users'>
export type Location = Row<'locations'>
export type CaseType = Row<'case_types'>
export type Category = Row<'categories'>
export type Provider = Row<'providers'>
export type ProviderLocation = Row<'provider_locations'>
export type Constraint = Row<'constraints'>
export type Offering = Row<'offerings'>
export type Question = Row<'questions'>
export type Widget = Row<'widgets'>
export type ImportHistory = Row<'import_history'>
export type OrganizationInvitation = Row<'organization_invitations'>
export type WidgetSession = Row<'widget_sessions'>
export type WidgetSessionEvent = Row<'widget_session_events'>
export type AdminAuditLog = Row<'admin_audit_log'>
