-- Disables the pg_graphql extension (Data API GraphQL endpoint).
--
-- Verified the app never uses GraphQL anywhere in the codebase (REST only, via
-- supabase-js). GraphQL auto-exposes every table with `anon`/`authenticated`
-- SELECT grants at /graphql/v1 regardless of intent, which is what produced 28
-- of the 34 Supabase linter warnings (pg_graphql_anon_table_exposed /
-- pg_graphql_authenticated_table_exposed). Since REST access relies on the same
-- table grants, those grants can't be revoked without breaking the app -- the
-- clean fix is removing the unused GraphQL surface entirely.
drop extension if exists pg_graphql cascade;
