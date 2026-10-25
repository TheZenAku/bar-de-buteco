import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const composePath=fileURLToPath(new URL('../../infra/compose.yml',import.meta.url));
const roleBootstrapPath=fileURLToPath(new URL('../../infra/postgres/010-roles.sh',import.meta.url));
const postgresDockerfilePath=fileURLToPath(new URL('../../infra/postgres/Dockerfile',import.meta.url));
const productionEnvPath=fileURLToPath(new URL('../../infra/production.env.example',import.meta.url));

function service(compose,name,nextName){
  return compose.split(new RegExp(`^  ${name}:\\s*$`,'m'))[1]?.split(new RegExp(`^  ${nextName}:\\s*$`,'m'))[0]??'';
}

test('fresh Compose bootstrap does not gate the lazy room behind world readiness',()=>{
  const compose=readFileSync(composePath,'utf8');
  const game=compose.split(/^  game:\s*$/m)[1]?.split(/^  web:\s*$/m)[0]??'';
  assert.match(game,/127\.0\.0\.1:2567\/health/);
  assert.doesNotMatch(game,/127\.0\.0\.1:2567\/ready/);
  assert.match(game,/api:\s*\{ condition: service_healthy \}/);
});

test('Compose gates the runtime API behind role bootstrap and a one-shot migrator',()=>{
  const compose=readFileSync(composePath,'utf8');
  const postgres=service(compose,'postgres','postgres-bootstrap');
  const bootstrap=service(compose,'postgres-bootstrap','migrate');
  const migrate=service(compose,'migrate','api');
  const api=service(compose,'api','game');

  assert.match(postgres,/dockerfile: infra\/postgres\/Dockerfile/);
  assert.match(postgres,/BAR_MIGRATOR_PASSWORD/);
  assert.match(postgres,/BAR_RUNTIME_PASSWORD/);
  assert.match(bootstrap,/010-roles\.sh/);
  assert.match(bootstrap,/postgres:\s*\{ condition: service_healthy \}/);
  assert.match(migrate,/npm.*run.*migrate.*@bar\/api/);
  assert.match(migrate,/postgresql:\/\/bar_migrator:\$\{BAR_MIGRATOR_PASSWORD/);
  assert.match(migrate,/MIGRATION_ROLE: bar_owner/);
  assert.match(migrate,/MIGRATION_RUNTIME_ROLE: bar_runtime/);
  assert.match(migrate,/postgres-bootstrap:\s*\{ condition: service_completed_successfully \}/);
  assert.match(api,/postgresql:\/\/bar_runtime:\$\{BAR_RUNTIME_PASSWORD/);
  assert.match(api,/migrate:\s*\{ condition: service_completed_successfully \}/);
  assert.doesNotMatch(api,/postgresql:\/\/bar:/);
});

test('PostgreSQL bootstrap keeps ownership, migration and runtime capabilities separate',()=>{
  const script=readFileSync(roleBootstrapPath,'utf8');
  const dockerfile=readFileSync(postgresDockerfilePath,'utf8');
  const envExample=readFileSync(productionEnvPath,'utf8');

  assert.match(dockerfile,/FROM postgres:17-alpine/);
  assert.match(dockerfile,/010-roles\.sh \/docker-entrypoint-initdb\.d\/010-roles\.sh/);
  assert.match(script,/require_hex_secret POSTGRES_PASSWORD "\$POSTGRES_PASSWORD"/);
  assert.match(script,/require_distinct_secrets POSTGRES_PASSWORD "\$POSTGRES_PASSWORD" BAR_MIGRATOR_PASSWORD "\$BAR_MIGRATOR_PASSWORD"/);
  assert.match(script,/require_distinct_secrets POSTGRES_PASSWORD "\$POSTGRES_PASSWORD" BAR_RUNTIME_PASSWORD "\$BAR_RUNTIME_PASSWORD"/);
  assert.match(script,/require_distinct_secrets BAR_MIGRATOR_PASSWORD "\$BAR_MIGRATOR_PASSWORD" BAR_RUNTIME_PASSWORD "\$BAR_RUNTIME_PASSWORD"/);
  assert.match(script,/CREATE ROLE bar_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(script,/<<'SQL'\s*BEGIN;/);
  assert.match(script,/COMMIT;\s*SQL\s*$/);
  assert.match(script,/CREATE ROLE bar_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(script,/CREATE ROLE bar_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(script,/ALTER ROLE bar_owner SET search_path = pg_catalog, public/);
  assert.match(script,/ALTER ROLE bar_migrator SET search_path = pg_catalog, public/);
  assert.match(script,/ALTER ROLE bar_runtime SET search_path = pg_catalog, public/);
  assert.match(script,/GRANT bar_owner TO bar_migrator/);
  assert.match(script,/member\.rolname IN \('bar_migrator','bar_runtime'\)/);
  assert.match(script,/REVOKE ALL ON SCHEMA public FROM PUBLIC/);
  assert.match(script,/ALTER SCHEMA public OWNER TO bar_owner/);
  assert.match(script,/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC/);
  assert.match(script,/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC/);
  assert.match(script,/GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO bar_runtime/);
  assert.match(script,/REVOKE ALL ON TABLE bar_schema_migrations FROM bar_runtime/);
  assert.match(script,/GRANT SELECT ON TABLE bar_schema_migrations TO bar_runtime/);
  assert.doesNotMatch(script,/REASSIGN OWNED|DROP OWNED/);
  assert.match(envExample,/^BAR_MIGRATOR_PASSWORD=/m);
  assert.match(envExample,/^BAR_RUNTIME_PASSWORD=/m);
});
