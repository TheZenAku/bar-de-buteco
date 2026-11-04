# Segment: tools/ops

**Reviewed by:** devops-config-reviewer

## Files reviewed
- `tools/ops/postgres-backup-lib.mjs`
- `tools/ops/postgres-backup.mjs`
- `tools/ops/postgres-restore-check.mjs`
- `tools/ops/pseudonym.mjs`

Referenced, not in segment (read only for the compose service and secret requirements): `infra/compose.yml`

## Integrations
- docker (compose exec into the `postgres` service)
- postgresql (pg_dump, pg_restore, psql)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `tools/ops/postgres-backup-lib.mjs` | `repositoryRoot` | const | Project root resolved from the module location |
| `tools/ops/postgres-backup-lib.mjs` | `backupRoot` | const | `.local/backups` under the project root |
| `tools/ops/postgres-backup-lib.mjs` | `inside` | function | True when target is inside parent (lexical, no realpath) |
| `tools/ops/postgres-backup-lib.mjs` | `timestamp` | function | UTC stamp `YYYYMMDD_HHMMSS` for file and db names |
| `tools/ops/postgres-backup-lib.mjs` | `sqlIdentifier` | function | Double-quotes a SQL identifier |
| `tools/ops/postgres-backup-lib.mjs` | `sqlLiteral` | function | Single-quotes a SQL string literal |
| `tools/ops/postgres-backup-lib.mjs` | `defaultBackupPath` | function | Builds a new `bar-<stamp>-<hex>.dump` path under backups |
| `tools/ops/postgres-backup-lib.mjs` | `resolveBackupPath` | function | Validates a backup path is a `.dump` inside `.local/backups` |
| `tools/ops/postgres-backup-lib.mjs` | `resolveEnvFile` | function | Resolves env file inside project and requires a regular file |
| `tools/ops/postgres-backup-lib.mjs` | `temporaryDatabaseName` | function | Generates `bar_restore_check_<stamp>_<hex12>` name |
| `tools/ops/postgres-backup-lib.mjs` | `assertTemporaryDatabaseName` | function | Rejects any name not matching the temp-db pattern |
| `tools/ops/postgres-backup-lib.mjs` | `sha256` | function | Hex SHA-256 digest of a buffer |
| `tools/ops/postgres-backup-lib.mjs` | `systemExecutor` | function | spawnSync wrapper; throws on error or non-zero exit |
| `tools/ops/postgres-backup-lib.mjs` | `dockerArgs` | function | Builds `docker compose exec -T postgres` argv |
| `tools/ops/postgres-backup-lib.mjs` | `runDocker` | function | Runs a command in the postgres container, returns stdout |
| `tools/ops/postgres-backup-lib.mjs` | `atomicWrite` | function | Private write to partial file, fsync, hard-link publish |
| `tools/ops/postgres-backup-lib.mjs` | `createPostgresBackup` | function | pg_dump custom format, validate with pg_restore --list, write dump and checksum |
| `tools/ops/postgres-backup-lib.mjs` | `readVerifiedBackup` | function | Reads dump and refuses it unless sidecar SHA-256 matches |
| `tools/ops/postgres-backup-lib.mjs` | `verifyPostgresRestore` | function | Restores dump into a temp database, checks core tables, drops it |
| `tools/ops/postgres-backup-lib.mjs` | `parseArguments` | function | Parses `--output`, `--input`, `--env-file` into an options object |
| `tools/ops/postgres-backup.mjs` | (script) | script | CLI entry: creates a backup and prints path, size, SHA-256 |
| `tools/ops/postgres-restore-check.mjs` | (script) | script | CLI entry: verifies a backup by restoring into a temp database |
| `tools/ops/pseudonym.mjs` | (script) | script | Prints HMAC pseudonyms for user ids, keyed by INTERNAL_SECRET |

## Conventions observed
- **Naming**: camelCase for functions and variables; SCREAMING absent; file names kebab-case.
- **Error handling**: throws `Error` with Portuguese messages; CLIs catch at top level, print message, set `process.exitCode = 1`. Cleanup errors merged via `AggregateError` (lib:123).
- **Logging**: `console.log` / `console.error` with Portuguese text; no structured logging.
- **Async style**: fully synchronous (`spawnSync`, `*Sync` fs calls). No promises.
- **Type hints**: none (plain JavaScript ESM with `.mjs`).
- **Comments**: code comments are in English (lib:64-65, 67, 85-87, 112-113). User-facing strings are Portuguese.
- **Module style**: named exports only in the lib; scripts import the lib and wrap in try/catch.

## Internal duplication
- `.local/backups` literal: `postgres-backup-lib.mjs:8` (`backupRoot`) and `:22` (`allowed`). Same path built twice.
- Env argument expression `relative(root,resolvedEnv)||basename(resolvedEnv)`: lib:80 and lib:104.
- Repeated psql argument block `--username=bar --dbname=... --tuples-only --no-align --set=ON_ERROR_STOP=1 --command`: lib:107, :111, :117, :122. Also `--username=bar` literal repeated at lib:81, :107, :111, :115, :117, :122.
- Database name `bar` and role `bar` hard-coded in lib:81 and lib:107; they must match `infra/compose.yml:8-9`.
- Secret lookup block (`match(/^KEY=(.*)$/m)` plus quote strip) written twice: pseudonym.mjs:14 and :16.
- Each CLI repeats the same try/catch + `process.exitCode = 1` shell (postgres-backup.mjs:5-10, postgres-restore-check.mjs:5-11).

## Cross-segment hints
- `tools/ops/pseudonym.mjs:2` says the formula matches `apps/server/src/observability.ts`. Parity not verified here (outside this segment). Route to the server or observability reviewer.
- `tools/ops/pseudonym.mjs:16` falls back from INTERNAL_SECRET to AUTH_SECRET. `infra/compose.yml:69` and `:99` require INTERNAL_SECRET and say it must differ from AUTH_SECRET. The fallback contradicts that rule. The server-side reader should be checked for the same fallback.
- `tools/ops/postgres-backup-lib.mjs:9` points at `infra/compose.yml`. The `postgres` service there is the production database (compose.yml:3-20). The restore check therefore runs on the live cluster. Infra reviewer should confirm this is intended.
- Backups contain password hashes (per lib:64 comment). Retention and off-host copy policy is not in this segment. Route to whoever owns deploy docs.

## Specialist findings

**Env var registry**

| Var name | Used in (file:line) | Has default? | Notes |
|----------|---------------------|--------------|-------|
| INTERNAL_SECRET | pseudonym.mjs:10, :12-14, :19 | no (required) | Required by compose (`infra/compose.yml:69`, `:99`); must differ from AUTH_SECRET |
| AUTH_SECRET | pseudonym.mjs:16, :18 | used as fallback for INTERNAL_SECRET | Duplicates INTERNAL_SECRET role in this script; see finding 2 |
| NODE_ENV | pseudonym.mjs:16, :18, :19 | gates both fallbacks | Set to production inside compose (`infra/compose.yml:48`, `:63`, `:94`), not set for host runs |
| (literal) `local-development-only-change-before-deploying` | pseudonym.mjs:18 | yes, hard-coded | Public default key when not production; see finding 1 |
| (none, env file path) `.env` | pseudonym.mjs:11 | n/a | Read directly from repo root |
| (none, env file path) `.env.production` | postgres-backup-lib.mjs:77, :102 via `--env-file` default at :29 | yes (file default) | Passed to `docker compose --env-file` |
| POSTGRES_PASSWORD, BAR_MIGRATOR_PASSWORD, BAR_RUNTIME_PASSWORD | not read in segment | n/a | Consumed only by compose through the env file |

Secrets never reach argv or logs: the DB password stays inside the compose env file, and SQL goes through `--command` with no credential. Good.

**Findings**

1. **Hard-coded fallback key** — `tools/ops/pseudonym.mjs:18` — if no INTERNAL_SECRET and no AUTH_SECRET is found and `NODE_ENV` is not `production`, the HMAC key becomes the public literal `local-development-only-change-before-deploying`. Anyone who knows the literal can recompute pseudonyms from user ids. Gating depends on `NODE_ENV`, which is unset on a host run unless the operator sets it. Severity: **med**.

2. **Silent secret-name fallback** — `tools/ops/pseudonym.mjs:16` — in non-production, AUTH_SECRET is used when INTERNAL_SECRET is absent. The produced pseudonym then matches nothing in the logs, which the operator reads as "no lines for this player". This is an env-var drift issue (two names, one role) that fails silently. Severity: **med**.

3. **Backup file mode ignored on Windows** — `tools/ops/postgres-backup-lib.mjs:66` — `openSync(partial,'wx',0o600)` is commented as "Start private regardless of the host's umask". On win32 Node applies only the read-only bit from the mode, so the dump inherits the directory ACL. The file holds account data and password hashes (lib:64 comment), and this project runs on Windows (gitStatus / env platform win32). Severity: **med**. Verify with `icacls` on a produced file before relying on it.

4. **Restore check writes to the live cluster** — `tools/ops/postgres-backup-lib.mjs:111-115` and `:122` — `verifyPostgresRestore` creates a database and runs `pg_restore` on the `postgres` service from `infra/compose.yml:3-20`, which is the production database. No option points it at a separate instance. Load from a large dump competes with live game traffic, and the superuser role `bar` is used. The guard (`assertTemporaryDatabaseName`, armed-after-CREATE drop at :114, `DROP ... WITH (FORCE)` at :122) is sound for the name space, so the risk is load and blast radius, not data loss. Severity: **med**.

5. **Ignored flags accepted without error** — `tools/ops/postgres-backup.mjs:7` and `tools/ops/postgres-restore-check.mjs:8` — `parseArguments` (lib:130-140) accepts `--output`, `--input`, `--env-file` for both commands. The backup CLI ignores `--input`, and the restore CLI ignores `--output`. A mistyped flag pair runs with defaults and no warning. Severity: **low**.

6. **Checksum is integrity, not authenticity** — `tools/ops/postgres-backup-lib.mjs:92-99` — the `.sha256` sidecar sits next to the dump and is written by the same tool. Anyone who can write `.local/backups` can replace both. This only detects corruption. Severity: **low**.

7. **Whole dump in memory** — `tools/ops/postgres-backup-lib.mjs:48` (`maxBuffer: 1 GB`), `:54`, `:96` (`readFileSync`) — the full dump is held in memory several times (stdout buffer, `dump`, `readVerifiedBackup.content`). Fine for the current size; it fails hard as the database grows. Severity: **low**.

8. **Path check is lexical** — `tools/ops/postgres-backup-lib.mjs:12` and `:24` — `inside()` uses `path.relative` without `realpath`. A symlink or junction at `.local/backups` or `.local` can point elsewhere and still pass. `resolveEnvFile` does check `lstat` (lib:32), but the backup path does not. Severity: **low**.

9. **Partial files survive a hard kill** — `tools/ops/postgres-backup-lib.mjs:61`, `:72` — the `finally` removes `*.partial-*` files on normal exceptions, but a process kill leaves them in `.local/backups` with no cleanup on the next run. Severity: **low**.

## Concerns / smells
- Windows backup privacy claim is not true (finding 3). Highest priority.
- `pseudonym.mjs` has two secret fallbacks, one of them a public literal (findings 1 and 2).
- The restore check is the only verification and it targets the production cluster (finding 4).
- Parameter parsing is shared across commands and silently accepts flags that do nothing (finding 5).
- Entire segment is synchronous and buffers whole dumps in memory (finding 7).

## Refactor suggestions
1. **`tools/ops/postgres-backup-lib.mjs:66`** — on win32, either set the ACL explicitly (`icacls` via `systemExecutor`) or remove the "private regardless of umask" comment so it does not overstate the protection.
2. **`tools/ops/pseudonym.mjs:10-19`** — fail closed when no INTERNAL_SECRET is found, regardless of NODE_ENV. Drop the AUTH_SECRET fallback and the literal. Replace the two regex blocks with one `readEnvValue(name)` helper.
3. **`tools/ops/postgres-backup-lib.mjs:81, 107-122`** — extract `psql(envArgument, db, extraArgs)` and `DB_ROLE = 'bar'`. Removes the repeated `--username=bar --set=ON_ERROR_STOP=1` blocks and the duplicated role literal.
4. **`tools/ops/postgres-backup-lib.mjs:8, 22`** — compute `allowed` once and reuse `backupRoot` (both `resolve(..., '.local/backups')`).
5. **`tools/ops/postgres-backup.mjs:7`, `tools/ops/postgres-restore-check.mjs:8`** — pass an allow-list of flags per command into `parseArguments` and reject the rest. Stops `--input` on backup and `--output` on restore from being silently ignored.
