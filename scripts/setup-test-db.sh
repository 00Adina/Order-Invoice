#!/usr/bin/env bash
# Creates a throwaway local Postgres database that mimics Supabase (auth schema,
# auth.uid(), anon/authenticated/service_role roles) and applies migration + seed.
set -euo pipefail
DB=${DB:-order_app_test}
HERE=$(cd "$(dirname "$0")/.." && pwd)
PSQL="psql -v ON_ERROR_STOP=1 -q"
su postgres -c "dropdb --if-exists $DB && createdb $DB"
su postgres -c "$PSQL -d $DB" <<'SQL'
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
su postgres -c "$PSQL -d $DB -f $HERE/supabase/migrations/20261106000000_init.sql" 2>&1 | grep -v NOTICE || true
su postgres -c "$PSQL -d $DB -f $HERE/supabase/seed.sql"
