# Segment: apps/api/src/database

**Reviewed by:** db-schema-reviewer

## Files reviewed
- `apps/api/src/database/migrate.ts`
- `apps/api/src/database/migrations.ts`
- `apps/api/src/database/schema-contract.ts`

## Integrations
- postgres
- filesystem

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/api/src/database/migrate.ts:1-12` | (top-level script) | module | CLI: reads migration config, applies pending SQL, prints result |
| `apps/api/src/database/migrations.ts:5` | `MIGRATION_TABLE` | const | Ledger table name `bar_schema_migrations` |
| `apps/api/src/database/migrations.ts:7` | `MigrationFile` | interface | Name, checksum, normalised SQL of one file |
| `apps/api/src/database/migrations.ts:8` | `AppliedMigration` | interface | Ledger row: name and checksum |
| `apps/api/src/database/migrations.ts:10` | `SqlExecutor` | interface | `execute` and parameterised `query` |
| `apps/api/src/database/migrations.ts:15` | `MigrationSession` | interface | Executor plus `transaction` |
| `apps/api/src/database/migrations.ts:19` | `MigrationCoordinator` | interface | `withLock` around migration work |
| `apps/api/src/database/migrations.ts:23` | `MigrationResult` | interface | Applied and already-applied names |
| `apps/api/src/database/migrations.ts:28` | `SchemaVerifier` | type | Callback that certifies schema shape |
| `apps/api/src/database/migrations.ts:29` | `MigrationFinalizer` | type | Callback run after ledger insert, same transaction |
| `apps/api/src/database/migrations.ts:31` | `MigrationError` | class | Domain error for migration and schema failures |
| `apps/api/src/database/migrations.ts:37` | `loadMigrations` | function | Reads `NNN_name.sql` files, sorts, rejects duplicates and empties, hashes |
| `apps/api/src/database/migrations.ts:59` | `validateApplied` | function | Checks ledger rows: checksum, unknown rows, gaps |
| `apps/api/src/database/migrations.ts:79` | `ledgerSql` | const | DDL for the ledger table |
| `apps/api/src/database/migrations.ts:85` | `readApplied` | function | Selects ledger rows ordered by name |
| `apps/api/src/database/migrations.ts:89` | `applyMigrations` | function | Locks, runs pending SQL, verifies schema, writes ledger in one transaction |
| `apps/api/src/database/migrations.ts:115` | `assertMigrationsCurrent` | function | Runtime boot check; tolerates newer unknown migrations |
| `apps/api/src/database/schema-contract.ts:3` | `ColumnSpec` | type | Tuple of type, nullability, default fragment |
| `apps/api/src/database/schema-contract.ts:4` | `columns` | const | Expected columns of 39 tables |
| `apps/api/src/database/schema-contract.ts:46` | `primaryKeys` | const | Expected PK column list per table |
| `apps/api/src/database/schema-contract.ts:55` | `foreignKeys` | const | Expected FKs: table, column, cascade flag (37 rows) |
| `apps/api/src/database/schema-contract.ts:66` | `uniqueConstraints` | const | Expected UNIQUE columns |
| `apps/api/src/database/schema-contract.ts:67` | `checkConstraints` | const | Expected CHECK fragments per table |
| `apps/api/src/database/schema-contract.ts:74` | `indexes` | const | Expected named indexes (23 entries) |
| `apps/api/src/database/schema-contract.ts:85` | `compact` | function | Lowercases and strips quotes, whitespace, parentheses |
| `apps/api/src/database/schema-contract.ts:86` | `requireFragments` | function | True when every compacted fragment is a substring |
| `apps/api/src/database/schema-contract.ts:88` | `ColumnRow` | interface | information_schema.columns row shape |
| `apps/api/src/database/schema-contract.ts:89` | `ConstraintRow` | interface | pg_constraint row shape |
| `apps/api/src/database/schema-contract.ts:90` | `IndexRow` | interface | pg_indexes row shape |
| `apps/api/src/database/schema-contract.ts:93` | `verifyApplicationSchema` | function | Certifies columns, PK, UNIQUE, FK, CHECK, indexes against the catalog |

## Conventions observed
- **Naming**: mixed. TypeScript identifiers camelCase (`applyMigrations`, `ledgerSql`); catalog keys and SQL snake_case (`user_profiles`, `avatar_config`); exported constants UPPER_SNAKE (`MIGRATION_TABLE`).
- **Error handling**: domain exception `MigrationError` (migrations.ts:31) with Portuguese messages; one wrap with `{cause}` (migrations.ts:119). No Result types.
- **Logging**: `console.log` only, one line (migrate.ts:12).
- **Async style**: async/await throughout; top-level await in migrate.ts:4-5.
- **Type hints**: fully typed; one non-null assertion (migrations.ts:43 `match[1]!`).
- **Language**: code is mixed. Messages and some comments are Portuguese (migrations.ts:39, schema-contract.ts:92), others English (migrations.ts:51, schema-contract.ts:116).

## Internal duplication
- The ledger table is defined twice: `ledgerSql` (migrations.ts:79-83) and the `bar_schema_migrations` entry in `columns` (schema-contract.ts:5) plus its CHECK (schema-contract.ts:68). Changing one without the other makes boot fail.
- Table lists repeat across `columns`, `primaryKeys`, and `foreignKeys` (schema-contract.ts:4-64). Each new table needs edits in up to four places (contract plus SQL plus schema.ts, see F-5).

## Cross-segment hints
- `apps/api/src/database/schema.ts` (same folder, not in this list, read to verify) is the Drizzle model. It is not the DDL source and differs from the SQL (F-5). Route to the segment that owns `schema.ts`.
- Migration SQL under `infra/migrations/001_initial.sql` through `019_fuel_services.sql` (not in this list, read to verify) is the authoritative DDL. Route to the infra or migrations segment if one exists.
- The fuel reservation trigger `fuel_wallet_reservation` (infra/migrations/019_fuel_services.sql:10-18) is a DB-level money invariant that `apps/api/src/app.ts:96` maps by constraint name. Business logic in the DB layer; cross-check with the app and money-path segment.
- `apps/api/src/phone-service.ts:182-186` (`trimMedia`) deletes `phone_media` rows, which fires the unindexed `phone_messages.media_id` set-null (F-6). Owned by the phone segment.
- `.cartographer/reports/postgres_apps_api_src.md` already covers query-side index needs. Status of its items against the SQL, checked here:
  - DB-14 `sessions.token_hash` index: present as UNIQUE (001:12). The report's "unverified" is resolved.
  - DB-17 `phone_media(owner_id, created_at)`: present (007:30). Resolved.
  - player_vehicles user index (its schema.ts:166 claim): present as `player_vehicles_owner_idx` (014:18). Resolved.
  - DB-09 `game_controls`: `(status, created_at)` exists (004:9). `(status, applied_at)` does not. Still open.
  - DB-19, DB-20, DB-21 `currency_ledger.reason`: no index on `reason` (002:16, 008:25). Still open.
  - highfood image lookup `highfood_customers.image_id` (highfood-service.ts:182): no index (013:17). Confirmed.
  - trades without user FKs (api F27): confirmed intentional (014:19 comment).
- `apps/api/test/postgres-smoke.test.ts:125` is the only place that deletes a user (test code, signal only). See F-7.

## Specialist findings
**Scope of verification:** the contract was checked against 44 FKs, 25 explicit indexes, and the CHECK constraints in `infra/migrations/001-019`. Counts: contract has 37 FKs, 23 indexes, 39 tables.

| ID | Sev | Where | What | Why |
|----|-----|-------|------|-----|
| F-1 | med | `apps/api/src/database/schema-contract.ts:55-64`; comment at `apps/api/src/database/migrations.ts:104` | FK list is partial. 7 of 44 SQL FKs are not certified: `fuel_services.user_id` (019:4), `user_badges.badge_id` (009:15), `gram_likes.post_id` (006:36), `gram_comments.post_id` (006:43), `phone_messages.media_id` (007:32), `badges.image_id` (010:8), `highfood_customers.image_id` (013:17). | migrations.ts:104 says the check certifies "the complete schema". Dropping a cascade on `gram_comments.post_id` or `user_badges.badge_id` would pass boot and change delete behaviour. |
| F-2 | med | `apps/api/src/database/schema-contract.ts:67-73`, `:74-83` | Indexes and CHECKs are partial. Not certified: indexes `user_badges_badge_idx` (009:20) and `fuel_services_user_idx` (019:9, partial). CHECKs: `player_vehicles` fuel 0..100 (018:4) and color regex (017:4); `user_badges.shown_at` 0..5 (009:16); `fuel_services` budget>0 and total>=0 (019:5-6); `phone_media.size>0` (007:26); `badge_images.size>0` (010:5); `badges` id/name/description/color (009:5-9); `skin_catalog.key` and `economy_prices.key` regex (015:10, 008:4); `game_logs.event` length (008:14); `user_profiles.status_message` length (009:2); `gram_posts.caption` and `gram_comments.body` length (006:29, 006:45). | Schema-shape drift in these columns (for example fuel above 100) passes certification. |
| F-3 | med | `apps/api/src/database/schema-contract.ts:93-130`; `infra/migrations/019_fuel_services.sql:10-18` | Trigger `fuel_wallet_reservation` on `wallets` and its function `protect_fuel_reservation` are not checked by `verifyApplicationSchema`. | The reservation invariant (balance cannot drop under open fuel reservations) and the error mapping at `apps/api/src/app.ts:96` depend on the trigger. A DB missing it boots clean and debits reserved funds. |
| F-4 | med | `apps/api/src/database/schema-contract.ts:86`, `:101`, `:107-108`, `:71-72` | Matching is substring-based over compacted text. `compact` (line 85) strips `(` and `)`, so `PRIMARY KEY (user_id)` matches any PK whose text starts with `primarykeyuser_id`, including `(user_id, other)`. CHECK fragments are too short: `['phone_lines',['number']]` (71) and `['gram_profiles',['handle']]` (72) match any constraint naming that column. The default check uses `includes` (101): `mileage` default `0` accepts a stored default of `100` or `1000`. | The certifier reports "divergente" only for gross changes. Narrow drift is accepted. |
| F-5 | med | `apps/api/src/database/schema.ts:1`, `:166`, `:170`; whole file | The Drizzle model is not a faithful picture of the DB. It declares 3 indexes (166, 170); the 22 other explicit indexes exist only in SQL. It declares no CHECK (no `check` import, no `check(` call), no partial index, and no trigger. `apps/api/` has no drizzle config, so nothing diffs the two today. | If drizzle-kit is wired later, `generate` would propose dropping ~22 indexes and every CHECK. Readers of `schema.ts` see a schema without guards. |
| F-6 | low | `infra/migrations/007_phone_social.sql:32`; `010_badge_images.sql:8`; `013_highfood.sql:17`; `001_initial.sql:15-20`, `:27-28`, `:41` | Foreign-key columns with no supporting index: `phone_messages.media_id` (SET NULL), `badges.image_id` (SET NULL), `highfood_customers.image_id` (SET NULL), `email_verifications.user_id`, `password_resets.user_id`, `reports.reporter_id`, `reports.user_id`, `game_results.user_id`. | Each delete on the parent scans the child table. `phone-service.ts:186` deletes `phone_media` on every upload over quota, so every delete scans `phone_messages`. |
| F-7 | low | `infra/migrations/001_initial.sql:27-28`, `:31`, `:41`; `008_admin_console.sql:6`, `:22`; `015_collection.sql:15`; `schema-contract.ts:57-63` | NO ACTION FKs (default) on `reports` (reporter, user, resolved_by), `moderation_actions.actor_id`, `game_results.user_id`, `skin_catalog.updated_by`, `economy_prices.updated_by`. These are listed as intentional (schema-contract.ts:116-117). | The only user deletion is in test code (`apps/api/test/postgres-smoke.test.ts:125`). Any future account deletion fails for users with reports, actions or results. |
| F-8 | low | `infra/migrations/005_retire_character_creator.sql:3-4`; `infra/migrations/014_garage_trade.sql:12-18` | Migrations 005 (drops `user_profiles.character_config`) and 014 (replaces PK `(user_id, model)` with `(id)`) are destructive and not expand-only. The rollback promise at `migrations.ts:114` ("expand-only rollback can still boot") holds only for additive migrations. | An older build run against the 014 schema may fail at query time on `ON CONFLICT (user_id, model)`. Not verified against the older build. |
| F-9 | low | `apps/api/src/database/migrations.ts:118-119` | Any failure in `readApplied` (connection loss, timeout, permission) becomes "Schema do banco não foi preparado. Execute o comando de migração". The real cause survives only in `cause`. | Operators chase migrations when the database is unreachable. |
| F-10 | low | `infra/migrations/009_profile.sql:16`; `schema.ts:150`; `schema-contract.ts:34` | `user_badges.shown_at` is `smallint` (0..5) despite the `_at` suffix. In every other table `_at` means timestamptz (checked against `columns`). | Naming convention breaks for readers. |
| F-11 | low | `apps/api/src/database/schema.ts:12`, `:77`, `:87`, `:146`, `:173`, `:178` | Drizzle export and property names diverge from SQL: `profiles` for `user_profiles`, `statistics` for `game_statistics`, `controls` for `game_controls`; properties `badges.image` and `highfoodCustomers.image` for `image_id`, and `length` for `length_m`. | Mapping is by reading code, not by name. |

### Schema inventory
Source: DDL in `infra/migrations` (authoritative), with the Drizzle line in `schema.ts` where it exists. All 39 tables are plural snake_case. "C" means ON DELETE CASCADE, "NA" means NO ACTION, "SN" means SET NULL. "(not certified)" means the FK or index is absent from the contract.

| Table/Collection | File:Line | Key fields | Indexes | FKs | Soft delete? |
|------------------|-----------|------------|---------|-----|--------------|
| `bar_schema_migrations` | migrations.ts:79; contract:5 | name PK, checksum, applied_at | PK | — | no |
| `users` | schema.ts:6; 001:1 | id PK, username UNIQUE, email UNIQUE, role CHECK | PK, username, email | — | no |
| `user_profiles` | schema.ts:12; 001:6 | user_id PK, display_name, avatar_config, equipped_skin | PK | user_id C | no |
| `wallets` | schema.ts:18; 002:3 | user_id PK, balance >= 0; trigger 019:17-18 | PK | user_id C | no |
| `fuel_services` | schema.ts:21; 019:2 | id PK, budget > 0, total >= 0, settled | PK, `fuel_services_user_idx` partial | user_id C (not certified) | no |
| `skill_inventory` | schema.ts:26; 015:2 | (user_id, skill_id) PK | PK | user_id C | no |
| `skin_catalog` | schema.ts:30; 015:9 | key PK (regex), rarity, availability CHECK | PK | updated_by NA | no |
| `skin_inventory` | schema.ts:34; 002:7 | (user_id, skin_id) PK | PK | user_id C | no |
| `currency_ledger` | schema.ts:37; 002:12 | id PK, amount, reason | PK, user_idx(user_id, created_at), created_idx | user_id C | no |
| `item_inventory` | schema.ts:41; 003:1 | (user_id, item_id) PK, quantity > 0 | PK | user_id C | no |
| `inventory_ledger` | schema.ts:45; 003:8 | id PK, quantity <> 0 | PK, user_idx(user_id, created_at desc), created_idx | user_id C | no |
| `sessions` | schema.ts:49; 001:10 | id PK, token_hash UNIQUE, expires_at | PK, token_hash, sessions_user_idx | user_id C | no |
| `email_verifications` | schema.ts:53; 001:15 | token_hash PK, expires_at | PK | user_id C | no |
| `password_resets` | schema.ts:57; 001:18 | token_hash PK, expires_at | PK | user_id C | no |
| `blocks` | schema.ts:61; 001:21 | (user_id, blocked_id) PK, <> CHECK | PK | user_id C, blocked_id C | no |
| `reports` | schema.ts:65; 001:26; 008:21-23 | id PK, reason, resolved_* | PK, reports_created_idx | reporter_id NA, user_id NA, resolved_by NA | no |
| `moderation_actions` | schema.ts:72; 001:30 | id PK, action, expires_at, revoked_at | PK, moderation_user_idx(user_id, action), moderation_created_idx | actor_id NA, user_id NA | no |
| `game_statistics` | schema.ts:77; 001:35 | user_id PK, blackjack counters | PK | user_id C | no |
| `game_results` | schema.ts:83; 001:40 | id PK, result | PK (no user index) | user_id NA | no |
| `game_controls` | schema.ts:87; 001:44; 004 | id PK, status, lease, attempts | PK, game_controls_status_created_idx | — | no |
| `phone_lines` | schema.ts:95; 006:3 | user_id PK, number UNIQUE, regex CHECK | PK, number | user_id C | no |
| `phone_contacts` | schema.ts:98; 006:8 | (owner_id, contact_id) PK, <> CHECK | PK | owner_id C, contact_id C | no |
| `phone_media` | schema.ts:105; 007:20 | id PK, kind, bytes, size | PK, phone_media_owner_idx(owner_id, created_at) | owner_id C | no |
| `phone_messages` | schema.ts:109; 006:15; 007:32-38 | id PK, body, media_* | PK, pair_idx, unread_idx(recipient_id, read_at); media_id unindexed | sender_id C, recipient_id C, media_id SN (not certified) | no |
| `gram_posts` | schema.ts:115; 006:26 | id PK, caption, image | PK, created_idx, author_idx | author_id C | no |
| `gram_likes` | schema.ts:119; 006:35 | (post_id, user_id) PK | PK | post_id C (not certified), user_id C | no |
| `gram_comments` | schema.ts:123; 006:41 | id PK, body 1..240 | PK, gram_comments_post_idx | post_id C (not certified), author_id C | no |
| `gram_profiles` | schema.ts:128; 007:3 | user_id PK, handle UNIQUE regex | PK, handle | user_id C | no |
| `gram_follows` | schema.ts:132; 007:12 | (follower_id, followed_id) PK, <> CHECK | PK, followed_idx | follower_id C, followed_id C | no |
| `economy_prices` | schema.ts:137; 008:3 | key PK (regex), value >= 0 | PK | updated_by NA | no |
| `badge_images` | schema.ts:142; 010:2 | id PK (64 chars), bytes, size > 0 | PK | — | no |
| `badges` | schema.ts:145; 009:4; 010:8; 011 | id PK (regex), rarity CHECK | PK (image_id unindexed) | image_id SN (not certified) | no |
| `user_badges` | schema.ts:148; 009:13; 012 | (user_id, badge_id) PK, shown_at 0..5 | PK, user_badges_badge_idx (not certified), user_badges_unnotified_idx partial | user_id C, badge_id C (not certified) | no |
| `user_achievements` | schema.ts:155; 012:3 | (user_id, series) PK, value >= 0 | PK | user_id C | no |
| `player_vehicles` | schema.ts:160; 013:2; 014; 017; 018 | id PK, plate UNIQUE, mileage >= 0, fuel 0..100, color regex | PK, plate, player_vehicles_owner_idx | user_id C | no |
| `trades` | schema.ts:168; 014:20 | id PK, offers, fingerprint, <> CHECK | PK, trades_user_a_idx, trades_user_b_idx | none (intentional, 014:19) | no |
| `highfood_customers` | schema.ts:172; 013:12 | id PK, look, lines | PK (image_id unindexed) | image_id SN (not certified) | no |
| `highfood_deliveries` | schema.ts:176; 013:23 | id PK, paid >= 0, status CHECK | PK, highfood_deliveries_user_idx(user_id, created_at) | user_id C | no |
| `game_logs` | schema.ts:182; 008:11 | id PK, source CHECK, event length | PK, game_logs_created_idx, game_logs_user_idx | none | no |

Totals: 44 SQL FKs (37 certified), 25 explicit indexes (23 certified), 39 tables (39 certified).

## Concerns / smells
1. The certifier is weaker than its own comment (F-1, F-2, F-4). It is the only guard against silent drift on a live DB.
2. Three schema sources (DDL, `schema.ts`, `schema-contract.ts`) disagree on indexes, CHECKs and triggers (F-5). No single source of truth.
3. The fuel reservation invariant lives only in a trigger no check covers (F-3).
4. Unindexed set-null and cascade FKs sit on paths that delete often, notably phone media trimming (F-6).

## Refactor suggestions
1. `schema-contract.ts:55-64`: add the seven missing FKs (F-1). Certify `ON DELETE` for each.
2. `schema-contract.ts:85-86`: make `requireFragments` compare whole clauses, for example by matching the full pg_get_constraintdef text or by comparing exact strings after normalisation. Stop stripping `(` and `)` before comparison (F-4).
3. `schema-contract.ts:93-130`: add a trigger check against `pg_trigger` for `fuel_wallet_reservation` on `wallets` (F-3).
4. `apps/api/src/database/schema.ts`: either declare the missing indexes and CHECKs, or add a comment saying the DDL is authoritative and listing the exceptions (F-5). Pick one before any drizzle-kit wiring.
5. `infra/migrations/007_phone_social.sql:32` and `010_badge_images.sql:8`: add indexes on `phone_messages(media_id)` and `badges(image_id)` as a new migration (F-6). Keep migrations forward-only.

## Checked and clean
- Migration numbering: `001` through `019` with no gaps, and each ALTER or index targets a table created earlier (verified by ordering).
- Duplicate versions are rejected (migrations.ts:49); empty files are rejected (migrations.ts:53); checksum mismatch on applied migrations is rejected (migrations.ts:68).
- Ledger write is after schema verification and parameterised (migrations.ts:105-107).
- Lock, ledger, DDL, verification and finalize run in one transaction (migrations.ts:96-111).
- CRLF is normalised before hashing (migrations.ts:52), so checkout line endings do not change checksums.
- Raw SQL is constant strings; the only interpolation is the constant `MIGRATION_TABLE` (migrations.ts:86, 79).
- Timestamps: every `_at` column is `timestamp with time zone` (checked against `columns`), except F-10.
- Soft delete: none. No `deleted_at` or `is_deleted` in any of the 39 tables. Hard delete throughout. State columns (`revoked_at`, `resolved_at`, `settled`, `status`) are not soft delete.
- Money columns are `integer` with `>= 0` CHECKs where a balance can go negative (`wallets.balance` 002:5, `economy_prices.value` 008:5, `highfood_deliveries.paid` 013:33, `fuel_services.budget` 019:5).
- Trades: no user FKs, deliberate and commented (014:19). Query-side notes are in the postgres report.
