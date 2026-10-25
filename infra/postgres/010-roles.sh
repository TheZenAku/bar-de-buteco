#!/bin/sh
set -eu

require_hex_secret() {
  secret_name="$1"
  secret_value="$2"
  if [ "${#secret_value}" -lt 32 ] || printf '%s' "$secret_value" | grep -Eq '[^0-9A-Fa-f]'; then
    echo "$secret_name deve ser hexadecimal e ter pelo menos 32 caracteres." >&2
    exit 1
  fi
}

require_distinct_secrets() {
  first_name="$1"
  first_value="$2"
  second_name="$3"
  second_value="$4"
  if [ "$first_value" = "$second_value" ]; then
    echo "$first_name e $second_name devem usar senhas diferentes." >&2
    exit 1
  fi
}

: "${POSTGRES_PASSWORD:?Defina POSTGRES_PASSWORD}"
: "${BAR_MIGRATOR_PASSWORD:?Defina BAR_MIGRATOR_PASSWORD}"
: "${BAR_RUNTIME_PASSWORD:?Defina BAR_RUNTIME_PASSWORD}"
require_hex_secret POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
require_hex_secret BAR_MIGRATOR_PASSWORD "$BAR_MIGRATOR_PASSWORD"
require_hex_secret BAR_RUNTIME_PASSWORD "$BAR_RUNTIME_PASSWORD"
require_distinct_secrets POSTGRES_PASSWORD "$POSTGRES_PASSWORD" BAR_MIGRATOR_PASSWORD "$BAR_MIGRATOR_PASSWORD"
require_distinct_secrets POSTGRES_PASSWORD "$POSTGRES_PASSWORD" BAR_RUNTIME_PASSWORD "$BAR_RUNTIME_PASSWORD"
require_distinct_secrets BAR_MIGRATOR_PASSWORD "$BAR_MIGRATOR_PASSWORD" BAR_RUNTIME_PASSWORD "$BAR_RUNTIME_PASSWORD"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=database_name="$POSTGRES_DB" \
  --set=migrator_password="$BAR_MIGRATOR_PASSWORD" \
  --set=runtime_password="$BAR_RUNTIME_PASSWORD" <<'SQL'
BEGIN;

SELECT 'CREATE ROLE bar_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bar_owner') \gexec
SELECT 'CREATE ROLE bar_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bar_migrator') \gexec
SELECT 'CREATE ROLE bar_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bar_runtime') \gexec

ALTER ROLE bar_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE bar_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
ALTER ROLE bar_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'runtime_password';
ALTER ROLE bar_owner RESET ALL;
ALTER ROLE bar_migrator RESET ALL;
ALTER ROLE bar_runtime RESET ALL;
ALTER ROLE bar_owner SET search_path = pg_catalog, public;
ALTER ROLE bar_migrator SET search_path = pg_catalog, public;
ALTER ROLE bar_runtime SET search_path = pg_catalog, public;

-- Remove stale memberships before granting the migrator its single, explicit SET ROLE target.
SELECT format('REVOKE %I FROM %I',parent.rolname,member.rolname)
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid=membership.roleid
JOIN pg_roles member ON member.oid=membership.member
WHERE member.rolname IN ('bar_migrator','bar_runtime')
ORDER BY member.rolname,parent.rolname \gexec
GRANT bar_owner TO bar_migrator;

REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO bar_owner,bar_migrator,bar_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO bar_owner;

-- Safe for both a fresh initdb and the documented upgrade of an existing volume: transfer only
-- application objects in public, never shared objects/databases/templates owned by bootstrap user bar.
SELECT format(
  CASE c.relkind
    WHEN 'S' THEN 'ALTER SEQUENCE %I.%I OWNER TO bar_owner'
    WHEN 'v' THEN 'ALTER VIEW %I.%I OWNER TO bar_owner'
    WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %I.%I OWNER TO bar_owner'
    ELSE 'ALTER TABLE %I.%I OWNER TO bar_owner'
  END,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','f','S','v','m')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend dependency
    WHERE dependency.classid='pg_class'::regclass AND dependency.objid=c.oid AND dependency.deptype='e'
  )
ORDER BY c.relkind,c.relname \gexec

SELECT format(CASE p.prokind
  WHEN 'p' THEN 'ALTER PROCEDURE %s OWNER TO bar_owner'
  WHEN 'a' THEN 'ALTER AGGREGATE %s OWNER TO bar_owner'
  ELSE 'ALTER FUNCTION %s OWNER TO bar_owner'
END,p.oid::regprocedure)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend dependency
    WHERE dependency.classid='pg_proc'::regclass AND dependency.objid=p.oid AND dependency.deptype='e'
  ) \gexec

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM bar_runtime;
GRANT USAGE ON SCHEMA public TO bar_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bar_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO bar_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM bar_runtime;
GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO bar_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO bar_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO bar_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- The runtime may inspect the migration head at startup, but can never forge history.
SELECT 'REVOKE ALL ON TABLE bar_schema_migrations FROM bar_runtime'
WHERE to_regclass('public.bar_schema_migrations') IS NOT NULL \gexec
SELECT 'GRANT SELECT ON TABLE bar_schema_migrations TO bar_runtime'
WHERE to_regclass('public.bar_schema_migrations') IS NOT NULL \gexec

COMMIT;
SQL
