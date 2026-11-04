# Segment: api@apps/api

**Reviewed by:** backend-api-reviewer

## Files reviewed
- `apps/api/src/admin-console.ts`
- `apps/api/src/app.ts`
- `apps/api/src/config.ts`
- `apps/api/src/database/index.ts`
- `apps/api/src/database/schema.ts`
- `apps/api/src/observability.ts`

## Integrations
- fastify (+ @fastify/cookie, @fastify/cors, @fastify/rate-limit) (app.ts:1-4)
- zod (request validation everywhere in app.ts)
- drizzle-orm (admin-console.ts:4, database/schema.ts:1)
- postgres via pg Pool (database/index.ts:4, 107-109) and PGlite fallback (database/index.ts:2, 111-118)
- argon2 (app.ts:6, 196)
- SMTP through `./mail.js` (app.ts:30, 163, 189, 223)
- filesystem: statfs and PGlite data dir (admin-console.ts:2, 347; database/index.ts:111-112)
- dotenv (config.ts:1, 7)
- jest: listed in segment metadata; not observed in these files (tests excluded from review)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/api/src/app.ts` | `createApi` | function | Builds Fastify app, registers all routes, returns `{app, db, mailer, config, inventory}` |
| `apps/api/src/app.ts` | `HttpError` | class | Error with explicit HTTP status, mapped by error handler |
| `apps/api/src/app.ts` | `equalSecret` | function | Timing-safe comparison for internal secret |
| `apps/api/src/app.ts` | `isLoopback` | function | Loopback IP check for dev mailbox |
| `apps/api/src/app.ts` | `emailSchema`, `passwordSchema`, `tokenSchema`, `uuidSchema`, `reasonSchema` | const | Shared zod primitives |
| `apps/api/src/app.ts` | `authenticated`, `administrator`, `internal`, `phoneUser` | function | preHandlers: session, admin, internal secret, phone (session+verified+ban on writes) |
| `apps/api/src/app.ts` | `badgeImageId`, `badgeIdSchema`, `ownerSchema`, `phoneTarget`, `idParams`, `beforeQuery`, `feedQuery` | const | Route-local zod schemas |
| `apps/api/src/admin-console.ts` | `AdminConsole` | class | Admin summary, player file, changes, reports, logs, economy, server info |
| `apps/api/src/admin-console.ts` | `AdminConsole.record` | method | Best-effort game log insert with periodic retention delete |
| `apps/api/src/admin-console.ts` | `AdminConsole.summary` | method | Parallel aggregate queries for the admin home |
| `apps/api/src/admin-console.ts` | `AdminConsole.player` | method | Player detail: wallet, inventory, vehicles, sessions, reports |
| `apps/api/src/admin-console.ts` | `AdminConsole.changePlayer` | method | Transactional rename, verify, logout, item, skin, skill changes with audit rows |
| `apps/api/src/admin-console.ts` | `AdminConsole.reports`, `AdminConsole.resolveReport` | method | List and resolve or reopen player reports |
| `apps/api/src/admin-console.ts` | `AdminConsole.logs` | method | Merged cursor-paged timeline across six sources |
| `apps/api/src/admin-console.ts` | `AdminConsole.gameLogEntries` | method | Reads `game_logs` for one source (api or world) |
| `apps/api/src/admin-console.ts` | `AdminConsole.economy` | method | Supply, Gini, daily series, price index, sources |
| `apps/api/src/admin-console.ts` | `AdminConsole.serverInfo` | method | Host, process, DB size, per-table row counts, queue counts |
| `apps/api/src/admin-console.ts` | `GameLogEvent` | interface | Shape of one log event |
| `apps/api/src/admin-console.ts` | `DISPLAY_NAME`, `LOG_RETENTION_DAYS`, `dayKey`, `startOfDay`, `likeTerm`, `notTransfer`, `sourceSql` | const | Helpers and SQL fragments |
| `apps/api/src/config.ts` | `readConfig` | function | Reads and validates API env; enforces production rules |
| `apps/api/src/config.ts` | `readMigrationConfig` | function | Minimal config for the migrator; separate DB roles in production |
| `apps/api/src/config.ts` | `ApiConfig`, `MigrationConfig` | interface | Config shapes |
| `apps/api/src/config.ts` | `postgresUsername`, `assertDatabaseIdentitiesSeparated` | function | Runtime and migration DB users must differ |
| `apps/api/src/database/index.ts` | `connectDatabase` | function | Runtime connection; verifies migrations, never runs DDL |
| `apps/api/src/database/index.ts` | `connectMigratedDatabase`, `migrateDatabase` | function | Local-only migrate-on-connect and one-shot migrator |
| `apps/api/src/database/index.ts` | `assertLocalMigrationHelperAllowed` | function | Blocks migrate-on-connect in production |
| `apps/api/src/database/index.ts` | `openDatabase` | function | Opens pg Pool or PGlite and builds the executor and coordinator |
| `apps/api/src/database/index.ts` | `postgresExecutor`, `postgresCoordinator`, `pgliteCoordinator` | function | Advisory-lock migration coordination per driver |
| `apps/api/src/database/index.ts` | `migrationPermissionFinalizer` | function | Revokes writes on the migration ledger for the runtime role |
| `apps/api/src/database/index.ts` | `Database`, `DatabaseDriver`, `DatabaseOptions`, `DatabaseConnection` | type | Connection types (`Database` is PGlite-typed for both drivers) |
| `apps/api/src/database/index.ts` | `repositoryRoot`, `defaultMigrationFolder`, `quoteRole` | const/function | Paths and role-name quoting |
| `apps/api/src/database/schema.ts` | `users`, `profiles`, `wallets`, `sessions`, `emailVerifications`, `passwordResets`, `blocks` | table | Accounts, auth tokens, blocks |
| `apps/api/src/database/schema.ts` | `currencyLedger`, `itemInventory`, `inventoryLedger`, `fuelServices`, `trades` | table | Coins, items, fuel, trades |
| `apps/api/src/database/schema.ts` | `skinCatalog`, `skinInventory`, `skillInventory`, `economyPrices`, `badges`, `badgeImages`, `userBadges`, `userAchievements` | table | Catalog, collections, prices, badges, achievements |
| `apps/api/src/database/schema.ts` | `reports`, `moderationActions`, `gameLogs`, `controls`, `statistics`, `gameResults` | table | Moderation, admin log, world controls, stats |
| `apps/api/src/database/schema.ts` | `phoneLines`, `phoneContacts`, `phoneMedia`, `phoneMessages`, `gramPosts`, `gramLikes`, `gramComments`, `gramProfiles`, `gramFollows` | table | In-game phone and Highgram |
| `apps/api/src/database/schema.ts` | `playerVehicles`, `highfoodCustomers`, `highfoodDeliveries` | table | HighMotors and Highfood |
| `apps/api/src/observability.ts` | `requestIdFor` | function | Accepts a well-formed caller `x-request-id` or makes one |
| `apps/api/src/observability.ts` | `createApiMetrics` | function | Request counter and latency histogram by route template |
| `apps/api/src/observability.ts` | `REQUEST_ID` | const | Request id format regex |

## Conventions observed
- **Naming**: camelCase for TS identifiers; snake_case for DB columns via explicit names (schema.ts:6-186); kebab-case paths with snake_case in internal settle paths (`/api/internal/fuel/settle`, app.ts:525). Route verbs mixed (see F9).
- **Error handling**: `HttpError` for status-bearing errors (app.ts:41-43); zod errors mapped to 400 (app.ts:98); domain `AdminError` in admin-console.ts (imported from admin-service); global error handler returns `{error: string}` (app.ts:94-103); 5xx messages are generic.
- **Logging**: Fastify pino logger with header redaction (app.ts:74); `request.log` for warnings and admin actions (app.ts:197, 417, 454); game events written to `game_logs` via `AdminConsole.record` (admin-console.ts:40-47), which swallows its own errors.
- **Async style**: async/await throughout; fire-and-forget with `void` for log writes (app.ts:197, 203, 210, 238).
- **Type hints**: TypeScript with frequent non-null assertions (`request.auth!`, app.ts:120-125, 243, 381, 416 and ~30 more) and `as unknown as` casts (database/index.ts:109; admin-console.ts:348, 353, 355).
- **Validation style**: zod; bodies mostly `.strict()`, but `idParams` (app.ts:296) and blocks delete params (app.ts:275) are not strict. Two layouts coexist: spaced multi-line handlers (app.ts:146-166, 294-295) and compact one-line handlers (app.ts:248-256, 425-431).

## Internal duplication
- Session lookup and 401 message repeated five times: app.ts:498-500, 506-507, 514-515, 520-521, 556-558.
- Four identical settle bodies (`userId, roundId, payout, stakes, voids`): app.ts:530-532, 536-538, 542-544, 548-550.
- Phone number regex `/^\d{9}$/` with the same message in three places: app.ts:294, 326, 394.
- `requestId: uuidSchema.toLowerCase()` repeated about nine times across app.ts.
- Display-name rule: app.ts:147 regex and admin-console.ts:25 `DISPLAY_NAME`, with different length bounds (app.ts:147 allows 2-32 via min/max; app.ts:408 allows max 64 before service check).
- Reason-parsing for pix/trade ledger rows: admin-console.ts:93 and admin-console.ts:253.
- People/ID filter repeated inline: admin-console.ts:246-247 and 270-271, duplicating the `person()` helper at admin-console.ts:239-240.
- `lockTimeoutMs` validation: database/index.ts:48 and 106.
- Pglite executor defined twice: database/index.ts:87-90 and 114-117.
- Migration role-name regex: config.ts:16 and database/index.ts:33 (identical).
- Avatar color palette: app.ts:154 and default in schema.ts:14.

## Cross-segment hints
- **Ban enforcement** (F3): `authenticated` (app.ts:119-122) does not check `isBanned`; the phone's `phoneUser` does on writes (app.ts:291). Whether a banned session is rejected at all depends on `readSession` / `isBanned` in `apps/api/src/auth/service.ts` (outside this segment). Route it to the auth-security reviewer.
- **GET side effect in control claim** (F1): `claimControlsOnce` (app.ts:588) is implemented in `control-outbox.ts` (not in this segment). Route to the queue/worker reviewer to confirm it writes.
- **Phone reads** (F11): `phone.thread` (app.ts:330) and `phone.gramProfile` (app.ts:368) are GETs in `phone-service.ts`. Route to the db or phone reviewer to confirm whether they write `phone_messages.read_at` (schema.ts:111) or create `gram_profiles` (schema.ts:127).
- **Validation in services**: pix amount (app.ts:394), admin action reason optional for kick and ban (app.ts:452), and the moderation `reason` NOT NULL column (schema.ts:74) rely on `phone-service.ts` and `admin-service.ts`. Route to the domain reviewers.
- **Indexes** (db lane): the schema declares only `player_vehicles` and `trades` indexes (schema.ts:166, 170). Hot filters without a declared index here: `currency_ledger.user_id` (admin-console.ts:80, 82, 93), `sessions.user_id` (admin-console.ts:86), `reports.user_id` (admin-console.ts:89), `game_logs (source, created_at)` (admin-console.ts:263, 281), `highfood_deliveries.user_id`. Confirm whether `infra/migrations` adds them.
- **Storage style** (db lane): photos are base64 `text` (schema.ts:116, 130) while other binaries are `bytea` (schema.ts:103, 106, 143).
- **Default skin** (shared): `equippedSkin` default `'nathan'` (schema.ts:16) should match the shared `DEFAULT_SKIN` used in admin-console.ts:103, 172.
- **Game settle services** (wallet-service): the four settle methods (app.ts:530-552) probably share logic in `wallet-service.ts`.
- **Endpoint cards**: `.cartographer/endpoints/` cards checked for `GET_api_internal_controls`, `GET_api_phone_zap_id`, `GET_api_admin_reports`: handler not linked, no parameters or responses. Findings below rely on app.ts directly, not on the cards.

## Specialist findings
**This is your specialist section.**

### Endpoint inventory
Auth key: `public`; `session` = valid cookie; `+verified` = verified account; `+ban` = writes refused when banned (app.ts:291); `admin` = session + verified + role admin (app.ts:123-126); `internal` = `x-internal-secret` header (app.ts:127-129); `+session` = internal call also checks the player's session row (app.ts:498-500 etc.).

| Method | Path | File:Line | Auth | Validated | Notes |
|--------|------|-----------|------|-----------|-------|
| GET | /api/health | app.ts:136 | public | none | Exposes DB driver name |
| GET | /api/ready | app.ts:137 | public | none | `select 1`; rate limit off |
| GET | /api/internal/metrics | app.ts:141 | internal | none | text/plain Prometheus |
| GET | /api/auth/config | app.ts:142 | public | none | — |
| GET | /api/prices | app.ts:144 | public | none | — |
| POST | /api/auth/register | app.ts:145 | public | zod strict | 409 reveals taken e-mail (app.ts:149) |
| POST | /api/auth/verify | app.ts:168 | public | zod | authLimit |
| POST | /api/auth/resend | app.ts:179 | public | zod | Response time differs by account (app.ts:183-190) |
| POST | /api/auth/login | app.ts:193 | public | zod strict | authLimit 12/min per IP |
| GET | /api/auth/me | app.ts:206 | session | none | — |
| POST | /api/auth/logout | app.ts:207 | public (cookie) | none | — |
| POST | /api/auth/forgot | app.ts:214 | public | zod strict | Response time differs by account (app.ts:217-224) |
| POST | /api/auth/reset | app.ts:227 | public | zod strict | authLimit |
| POST | /api/game-ticket | app.ts:242 | session+verified | none | — |
| GET | /api/wardrobe | app.ts:248 | session | none | No ban check on writes below |
| POST | /api/wardrobe/equip | app.ts:249 | session | skinMessageSchema | — |
| POST | /api/wardrobe/buy | app.ts:254 | session | skinMessageSchema | — |
| POST | /api/wardrobe/skill | app.ts:255 | session | skillPurchaseSchema | — |
| POST | /api/wardrobe/daily | app.ts:256 | session | none | — |
| GET | /api/inventory | app.ts:257 | session | none | — |
| POST | /api/inventory/buy | app.ts:258 | session | zod strict | Verb in path |
| GET | /api/stats | app.ts:262 | session | none | — |
| GET | /api/blocks | app.ts:266 | session | none | — |
| POST | /api/blocks | app.ts:267 | session | zod strict | — |
| DELETE | /api/blocks/:id | app.ts:274 | session | zod params (not strict) | — |
| POST | /api/reports | app.ts:279 | session | zod strict | 5 per 5 min |
| GET | /api/phone | app.ts:301 | session+verified | none | — |
| GET | /api/phone/card/:id | app.ts:302 | session+verified | zod params | — |
| GET | /api/profile/achievements | app.ts:304 | session+verified | none | — |
| GET | /api/profile/:id | app.ts:305 | session+verified | zod params | — |
| POST | /api/profile/status | app.ts:306 | session+verified+ban | profileStatusSchema | — |
| POST | /api/profile/badges | app.ts:307 | session+verified+ban | profileBadgesSchema | — |
| POST | /api/profile/skill | app.ts:308 | session+verified+ban | profileSkillSchema | — |
| GET | /api/highfood | app.ts:310 | session+verified | none | — |
| GET | /api/vehicles | app.ts:311 | session+verified | none | — |
| POST | /api/vehicles/buy | app.ts:312 | session+verified+ban | zod strict | 10/min; verb in path |
| POST | /api/vehicles/paint | app.ts:316 | session+verified+ban | zod strict | 20/min; verb in path |
| GET | /api/badges/images/:id | app.ts:322 | session | regex params | immutable cache |
| GET | /api/phone/lookup | app.ts:326 | session+verified | zod query | — |
| POST | /api/phone/contacts | app.ts:327 | session+verified+ban | phoneTarget | — |
| DELETE | /api/phone/contacts/:id | app.ts:328 | session+verified+ban | zod params | — |
| GET | /api/phone/zap | app.ts:329 | session+verified | none | No limit (F7) |
| GET | /api/phone/zap/:id | app.ts:330 | session+verified | zod params + query | Cursor `before`; possible read side effect (F11) |
| POST | /api/phone/zap/:id | app.ts:331 | session+verified+ban | zod strict | 40/min |
| GET | /api/phone/gram | app.ts:335 | session+verified | zod query | Cursor `before` |
| PATCH | /api/phone/gram/me | app.ts:336 | session+verified+ban | zod strict | Body limit computed |
| GET | /api/phone/gram/avatars/:id | app.ts:342 | session+verified | zod params | immutable cache |
| GET | /api/phone/gram/search | app.ts:346 | session+verified | zod query | — |
| GET | /api/phone/gram/suggestions | app.ts:348 | session+verified | zod query | — |
| POST | /api/phone/gram/users/:id/follow | app.ts:352 | session+verified+ban | zod body + params | 60/min |
| GET | /api/phone/gram/users/:id/:list | app.ts:354 | session+verified | zod params | No limit (F7) |
| POST | /api/phone/zap/:id/media | app.ts:358 | session+verified+ban | zod query + raw bytes | 20/min |
| GET | /api/phone/zap/media/:id | app.ts:364 | session+verified | zod params | immutable cache |
| GET | /api/phone/gram/users/:id | app.ts:368 | session+verified | zod params | Lazy profile create (F11) |
| POST | /api/phone/gram/posts | app.ts:370 | session+verified+ban | zod strict | 8/10 min |
| GET | /api/phone/gram/photos/:id | app.ts:375 | session+verified | zod params | immutable cache |
| DELETE | /api/phone/gram/posts/:id | app.ts:379 | session+verified+ban | zod params | Admin override in service |
| POST | /api/phone/gram/posts/:id/like | app.ts:384 | session+verified+ban | zod body | 60/min |
| GET | /api/phone/gram/posts/:id/comments | app.ts:386 | session+verified | zod params | No limit (F7) |
| POST | /api/phone/gram/posts/:id/comments | app.ts:387 | session+verified+ban | zod strict | 20/min |
| DELETE | /api/phone/gram/comments/:id | app.ts:391 | session+verified+ban | zod params | — |
| GET | /api/phone/bank | app.ts:392 | session+verified | none | — |
| POST | /api/phone/bank/pix | app.ts:393 | session+verified+ban | zod strict | 10/min; amount unbounded (F5) |
| GET | /api/admin/overview | app.ts:398 | admin | zod query | Offset/limit (F6) |
| GET | /api/admin/summary | app.ts:403 | admin | none | — |
| GET | /api/admin/players/:id | app.ts:404 | admin | zod params | — |
| POST | /api/admin/player | app.ts:405 | admin | zod discriminated strict | Singular path (F9) |
| GET | /api/admin/reports | app.ts:420 | admin | zod query | Silent 200 cap (F7) |
| POST | /api/admin/reports/resolve | app.ts:421 | admin | zod strict | Verb in path |
| GET | /api/admin/logs | app.ts:425 | admin | zod query | Cursor `before` (F6) |
| GET | /api/admin/economy | app.ts:431 | admin | zod query | `days` enum |
| GET | /api/admin/prices | app.ts:432 | admin | none | — |
| GET | /api/admin/collection | app.ts:433 | admin | none | — |
| POST | /api/admin/collection | app.ts:434 | admin | catalogEntrySchema | — |
| POST | /api/admin/prices | app.ts:435 | admin | zod strict | — |
| GET | /api/admin/server | app.ts:439 | admin | none | Full-table counts (F20) |
| POST | /api/admin/wallet | app.ts:440 | admin | zod strict + refine | Optimistic `expectedBalance` |
| POST | /api/admin/role | app.ts:447 | admin | zod strict | Role enum `admin\|user` (F4) |
| POST | /api/admin/action | app.ts:451 | admin | zod strict | Reason optional (F10) |
| GET | /api/admin/badges | app.ts:458 | admin | none | — |
| POST | /api/admin/badges/images | app.ts:459 | admin | raw PNG | — |
| POST | /api/admin/badges/images/delete | app.ts:463 | admin | zod strict | Verb in path (F9) |
| GET | /api/admin/badges/:id/holders | app.ts:469 | admin | zod params | — |
| POST | /api/admin/badges | app.ts:470 | admin | badgeSchema | — |
| POST | /api/admin/badges/delete | app.ts:474 | admin | zod strict | POST delete (F9) |
| POST | /api/admin/badges/grant | app.ts:478 | admin | zod strict | — |
| GET | /api/admin/highfood | app.ts:482 | admin | none | — |
| POST | /api/admin/highfood/customers | app.ts:483 | admin | customerSaveSchema | — |
| POST | /api/admin/highfood/vehicle | app.ts:487 | admin | zod strict | Singular path (F9) |
| POST | /api/admin/revert | app.ts:492 | admin | zod strict | — |
| POST | /api/internal/validate | app.ts:496 | internal | zod strict | — |
| POST | /api/internal/inventory | app.ts:503 | internal+session | zod strict | — |
| POST | /api/internal/wallet | app.ts:511 | internal+session | zod strict | — |
| POST | /api/internal/fuel/reserve | app.ts:518 | internal+session | zod strict | — |
| POST | /api/internal/fuel/settle | app.ts:525 | internal | zod strict | No session check by design (app.ts:524) |
| POST | /api/internal/blackjack/settle | app.ts:530 | internal | zod strict | Duplicate body (F13) |
| POST | /api/internal/foosball/settle | app.ts:536 | internal | zod strict | Duplicate body (F13) |
| POST | /api/internal/truco/settle | app.ts:542 | internal | zod strict | Duplicate body (F13) |
| POST | /api/internal/pool/settle | app.ts:548 | internal | zod strict | Duplicate body (F13) |
| POST | /api/internal/equip | app.ts:553 | internal+session | zod strict | — |
| POST | /api/internal/highfood/rating | app.ts:562 | internal | zod strict | — |
| GET | /api/internal/highfood/customers | app.ts:563 | internal | none | — |
| POST | /api/internal/highfood/complete | app.ts:564 | internal | service | — |
| POST | /api/internal/highfood/lost | app.ts:565 | internal | service | Returns `{ok:true}` (F8) |
| POST | /api/internal/vehicles | app.ts:566 | internal | zod strict | — |
| GET | /api/internal/vehicles/ownership-audit | app.ts:571 | internal | none | — |
| POST | /api/internal/trades/commit | app.ts:573 | internal | service | — |
| GET | /api/internal/prices | app.ts:574 | internal | none | — |
| POST | /api/internal/logs | app.ts:576 | internal | zod strict | 256 kB body |
| POST | /api/internal/achievements | app.ts:582 | internal | service | — |
| GET | /api/internal/controls | app.ts:588 | internal | none | GET claims controls (F1) |
| POST | /api/internal/controls/lease | app.ts:591 | internal | zod strict | — |
| POST | /api/internal/controls/ack | app.ts:595 | internal | zod strict | — |
| POST | /api/internal/stats | app.ts:600 | internal | zod strict | — |
| POST | /api/internal/dev/bot | app.ts:620 | dev-only + internal | zod strict | Not registered in production |
| GET | /api/dev/mail | app.ts:626 | dev-only + loopback | none | Not registered in production |

### Findings
| # | Where | Finding | Why | Severity |
|---|-------|---------|-----|----------|
| F1 | `app.ts:588` | `GET /api/internal/controls` calls `claimControlsOnce(db)`, which by its name marks controls as delivered. | A GET that writes. Gated by internal secret and marked "previous world versions", so impact is limited. | high |
| F2 | `app.ts:214-226`, `app.ts:179-192` | Forgot and resend send mail (`await mailer.send`) only when the account exists. | Response time reveals whether an e-mail is registered. Message text is identical. | medium |
| F3 | `app.ts:119-122`, `app.ts:248-258`, `app.ts:266-279` | Wardrobe, inventory, blocks and reports writes use `authenticated`, which has no ban check. Phone writes use `phoneUser`, which checks ban (`app.ts:291`). | Inconsistent ban posture across mutating routes. Real exposure depends on `readSession` (outside segment). | medium |
| F4 | `database/schema.ts:9`, `app.ts:153`, `app.ts:448`, `app.ts:501`, `app.ts:623` | Column default role is `'player'`; the API role vocabulary is `admin\|user` (app.ts:448) with fallback `'user'` (app.ts:501, 623). Registration does not set role (app.ts:153). | New accounts get `'player'` as role, which is not `'user'`. Admin checks still work. Clients and `/api/internal/validate` may see a value outside the enum. | medium |
| F5 | `app.ts:394` | Pix `amount: z.number().int()` has no sign or max bound at the route. Compare wallet route `app.ts:441` which bounds `0..MAX_COIN_BALANCE`. | Negative or huge amounts depend entirely on `phone-service`. Verify there. | medium |
| F6 | `admin-console.ts:234`, `admin-console.ts:276` | Log cursor is `next = last entry .at` (timestamp only). Next page uses `lt(column, before)`. Entries are sorted by `at` then `id` (admin-console.ts:274). | Rows that share the boundary timestamp and sort after the cut are skipped. Also `overview` uses offset/limit (app.ts:399) while logs, phone zap and gram use cursor `before`. | medium |
| F7 | `app.ts:420`, `admin-console.ts:212`; `app.ts:354-357`, `app.ts:329`, `app.ts:386` | Admin reports return a silent cap of 200 with no paging or has-more flag. Followers/following, zap threads and comments lists have no `limit` in the handler. | Unbounded or silently truncated lists. Service-level caps unverified for the last three. | medium |
| F8 | `app.ts:94-103` (no not-found handler), `app.ts:490`, `app.ts:565`, `app.ts:569`, `app.ts:382`, `app.ts:391` | Unknown routes get Fastify's default `{message,error,statusCode}`. Errors are `{error}`. Success bodies mix `{ok:true}`, `{deleted:true}`, `{message}`, `{recorded}` and raw entities. | Envelope drift. Consumers must handle two error shapes. | low |
| F9 | `app.ts:474`, `app.ts:463`, `app.ts:421`, `app.ts:492`, `app.ts:451`, `app.ts:312`, `app.ts:254`; `app.ts:274`, `app.ts:328`, `app.ts:379`, `app.ts:391`; `app.ts:405` vs `app.ts:404`; `app.ts:487` vs `app.ts:483` | Verb-in-path POSTs (`/badges/delete`, `/badges/images/delete`, `/reports/resolve`, `/revert`, `/action`, `/vehicles/buy`, `/wardrobe/buy`). DELETE is used elsewhere. Singular `/admin/player` and `/admin/highfood/vehicle` vs plural siblings. | Inconsistent REST conventions. | low |
| F10 | `app.ts:452`; `database/schema.ts:74` | `reason` is optional for `kick`/`ban` in the action route. `moderation_actions.reason` is NOT NULL. | Ban without a reason may fail with 500 or write an empty reason, depending on service. | low |
| F11 | `app.ts:330`, `app.ts:368` | GET phone thread and gram profile may write (`read_at` at schema.ts:111; lazy `gram_profiles` at schema.ts:127). | Possible GET side effects. The lazy profile is documented; `read_at` is unverified. | low (verify) |
| F12 | `app.ts:294`, `app.ts:326`, `app.ts:394`; `app.ts:147` vs `admin-console.ts:25`; `app.ts:320` vs `app.ts:457` | Repeated validators: phone regex, display-name rule (with different bounds from app.ts:408 max 64 vs 32), badge-id schemas. | Drift risk when one copy changes. | low |
| F13 | `app.ts:498`, `app.ts:506`, `app.ts:514`, `app.ts:520`, `app.ts:556`; `app.ts:530-552` | Session lookup and 401 repeated five times. Four settle routes repeat the same zod body. | Duplicate code. Any change to session rules must be made five times. | medium |
| F15 | `app.ts:197` | Failed login logs the client IP at warn level (`ip: request.ip`). | Personal data in logs. Acceptable for abuse tracking; note retention. | low |
| F16 | `app.ts:74` | Non-null assertion on `config.trustProxyHops!` inside the closure. | Safe today because the ternary guards it. Smell only. | low |
| F17 | `database/index.ts:107-109` | `new pg.Pool(...)` has no `pool.on('error')` listener. Idle client errors on pg Pool are emitted as 'error'. | Without a listener, a DB restart or idle disconnect can crash the process. | high |
| F18 | `database/index.ts:13`, `database/index.ts:109` | `Database` type is PGlite-specific. The pg branch returns `as unknown as Database`. | Type lies for the production driver. Shape differences are hidden behind casts (admin-console.ts:348, 353, 355). | low |
| F19 | `database/index.ts:111`, `database/index.ts:114-117` | PGlite branch builds an executor duplicating `pgliteCoordinator` (87-90). Lock-timeout validation duplicated (48, 106). | Duplication. | low |
| F20 | `admin-console.ts:355`, `admin-console.ts:359` | `serverInfo` runs `count(*)` over every public table and `count(*)` + `min()` over `game_logs` on every call. | Full scans on each admin poll; cost grows with the log. | medium |
| F21 | `admin-console.ts:347` | Admin response exposes the absolute repository or data path (`repositoryRoot`). | Admin-only. Information leak to an admin account; low impact. | low |
| F22 | `admin-console.ts:102` | Vehicles query awaited inline inside the returned object, outside the `Promise.all` at admin-console.ts:78. | Extra sequential round trip in `player()`. | low |
| F23 | `admin-console.ts:40-47` | `record()` swallows all errors silently (`catch{}` at admin-console.ts:46). | Log loss is invisible. Documented as best-effort. | low |
| F24 | `admin-console.ts:363` | Latency and 5xx sums depend on the rendered label text `labels.includes('status="5xx"')`. | Couples to the metrics render format (observability.ts:19). | low |
| F25 | `config.ts:50` | `AUTO_VERIFY_EMAIL` is true only for the exact string `'true'`; `'1'` or `'TRUE'` silently disables it. | Config footgun. | low |
| F26 | `database/schema.ts:140` | Comment about `badges`/`userBadges`/`shownAt` sits above `badgeImages` (schema.ts:142). `shownAt` is on `userBadges` (schema.ts:150). | Misplaced documentation. | low |
| F27 | `database/schema.ts:168-170` | `trades.user_a` and `user_b` have no FK to `users`, unlike every other user column. | Orphan trades after account deletion. Verify intent. | low |
| F28 | `app.ts:136`, `app.ts:102` | Health exposes DB driver name. Error handler passes Fastify's English 4xx messages (for example 413, 415) through to clients, while other messages are Portuguese. | Minor information and language consistency issues. | low |

## Concerns / smells
1. **F1**: a GET that claims controls (app.ts:588). Confirm and move to POST.
2. **F17**: missing pg Pool error listener (database/index.ts:107-109). A transient DB disconnect can take the API down.
3. **F3**: ban check present on phone writes but absent on wardrobe, inventory, blocks and reports writes (app.ts:248-279 vs app.ts:291).
4. **F2**: response-time enumeration on forgot and resend (app.ts:214-226, 179-192).
5. **F4**: role default `'player'` outside the API vocabulary `admin|user` (schema.ts:9 vs app.ts:448).

## Refactor suggestions
1. **app.ts:498-520, 556**: extract `requireLiveSession(sessionId, userId)` returning the user, to replace five copies of the session lookup and 401 (F13).
2. **app.ts:530-552**: register the four settle routes from one shared zod schema and a map of `{game: wallet.settleX}` (F13).
3. **database/index.ts:107-109**: attach `pool.on('error', ...)` that logs, and make pool size configurable through `DatabaseOptions` (F17).
4. **admin-console.ts:276 and 234**: make the log cursor a `(at, id)` tuple and compare with `(at < before) or (at = before and id < beforeId)` so boundary rows are not skipped (F6). Document or migrate overview to cursor paging (F6).
5. **admin-console.ts:355, 359**: cache the table counts for a short TTL or use `pg_class.reltuples` for the overview, so each admin poll does not scan `game_logs` (F20).
