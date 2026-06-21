-- Base table/sequence privileges for the PostgREST roles.
-- Our migration-created objects did not receive Supabase's default grants, so anon/
-- authenticated/service_role had no access. RLS still governs ROW visibility for
-- anon/authenticated; service_role has BYPASSRLS. This mirrors Supabase's default model.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public      to anon, authenticated, service_role;
grant all on all sequences in schema public   to anon, authenticated, service_role;
grant all on all functions in schema public   to anon, authenticated, service_role;

-- Objects created by later migrations get the same grants automatically.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
