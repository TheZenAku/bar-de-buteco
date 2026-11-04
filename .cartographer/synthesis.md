# Cross-segment synthesis

- Segments reviewed: **15**
- Project naming convention: **camel**
- Duplicate name pairs: **1385**
- Naming-convention outlier segments: **15**
- Centralization candidates: **0**
- Style fingerprint outliers: **2**

## Duplicate / near-duplicate functions
- `internal` in `apps/api/src/app.ts` (api_apps_api)  ↔  `internal` in `apps/server/src/internal.ts` (apps_server_src)  — score 100
- `add` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `add` in `apps/web/src/admin/world.ts` (apps_web)  — score 100
- `createApi` in `apps/api/src/app.ts` (api_apps_api)  ↔  `api` in `apps/web/src/api.ts` (apps_web)  — score 100
- `me` in `apps/api/src/app.ts` (api_apps_api)  ↔  `me` in `apps/web/src/blackjack/table.ts` (apps_web)  — score 100
- `add` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `add` in `apps/web/src/engine/mixamo-retarget.ts` (apps_web_2)  — score 100
- `add` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `add` in `apps/web/src/engine/moto-lights.ts` (apps_web_2)  — score 100
- `me` in `apps/api/src/app.ts` (api_apps_api)  ↔  `me` in `apps/web/src/foosball/panel.ts` (apps_web_2)  — score 100
- `add` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `add` in `packages/shared/src/ragdoll.ts` (packages_shared_src_truco)  — score 100
- `startOfDay` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `startOfDay` in `apps/api/src/highfood-service.ts` (postgres_apps_api_src)  — score 100
- `startOfDay` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `startOfDay` in `apps/api/src/phone-service.ts` (postgres_apps_api_src)  — score 100
- `startOfDay` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `startOfDay` in `apps/api/src/wallet-service.ts` (postgres_apps_api_src)  — score 100
- `add` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `add` in `apps/api/src/phone-service.ts` (postgres_apps_api_src)  — score 100
- `record` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `record` in `apps/web/src/phone/apps/camera.ts` (stripe_apps_web)  — score 100
- `sync` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `sync` in `apps/web/src/mouse-capture.ts` (stripe_apps_web)  — score 100
- `me` in `apps/api/src/app.ts` (api_apps_api)  ↔  `me` in `apps/web/src/phone/apps/highfood.ts` (stripe_apps_web)  — score 100
- `record` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `record` in `apps/web/src/phone/phone.ts` (stripe_apps_web_2)  — score 100
- `person` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `person` in `apps/web/src/phone/apps/telefone.ts` (stripe_apps_web_2)  — score 100
- `person` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `person` in `apps/web/src/profile/profile-window.ts` (stripe_apps_web_2)  — score 100
- `add` in `apps/api/src/admin-console.ts` (api_apps_api)  ↔  `add` in `packages/shared/src/pool/rules.ts` (stripe_packages_shared_src_pool)  — score 100
- `compact` in `apps/api/src/database/schema-contract.ts` (apps_api_src_database)  ↔  `compact` in `apps/web/src/admin/kit.ts` (apps_web)  — score 100
- `centre` in `apps/server/src/BarRoom.ts` (apps_server_src)  ↔  `centre` in `apps/server/src/world/waiter.ts` (apps_server_src_world)  — score 100
- `centre` in `apps/server/src/BarRoom.ts` (apps_server_src)  ↔  `centre` in `apps/web/src/engine/drink-props.ts` (apps_web_2)  — score 100
- `centre` in `apps/server/src/BarRoom.ts` (apps_server_src)  ↔  `centre` in `apps/web/src/minimap.ts` (stripe_apps_web)  — score 100
- `centre` in `apps/server/src/BarRoom.ts` (apps_server_src)  ↔  `centre` in `apps/web/src/profile/floating-window.ts` (stripe_apps_web_2)  — score 100
- `key` in `apps/server/src/minigames/blackjack-bank.ts` (apps_server_src_minigames)  ↔  `key` in `apps/web/src/collection/collection.ts` (apps_web)  — score 100
- `key` in `apps/server/src/minigames/blackjack-bank.ts` (apps_server_src_minigames)  ↔  `key` in `apps/web/src/collection/collection.ts` (apps_web)  — score 100
- `count` in `apps/server/src/minigames/foosball.ts` (apps_server_src_minigames)  ↔  `count` in `apps/web/src/engine/city-plan.ts` (apps_web_2)  — score 100
- `key` in `apps/server/src/minigames/blackjack-bank.ts` (apps_server_src_minigames)  ↔  `key` in `packages/shared/src/metrics.ts` (packages)  — score 100
- `gap` in `apps/server/src/minigames/foosball-cpu.ts` (apps_server_src_minigames)  ↔  `gap` in `packages/shared/src/ragdoll.ts` (packages_shared_src_truco)  — score 100
- `ahead` in `apps/server/src/minigames/foosball-cpu.ts` (apps_server_src_minigames)  ↔  `ahead` in `packages/shared/src/foosball.ts` (packages_shared_src_truco)  — score 100
- *... 1355 more in synthesis.json*

## Naming convention outliers
- **api_apps_api**: dominant `camel` (purity 0.667), distribution {'other': 13, 'camel': 26}
- **apps_api_src_database**: dominant `camel` (purity 0.727), distribution {'camel': 8, 'other': 3}
- **apps_server_src**: dominant `other` (purity 0.562), distribution {'camel': 7, 'other': 9}
- **apps_server_src_minigames**: dominant `other` (purity 0.545), distribution {'other': 6, 'camel': 5}
- **apps_server_src_world**: dominant `other` (purity 0.655), distribution {'other': 19, 'camel': 9, 'pascal': 1}
- **apps_web**: dominant `other` (purity 0.651), distribution {'other': 242, 'camel': 130}
- **apps_web_2**: dominant `other` (purity 0.661), distribution {'camel': 59, 'other': 117, 'pascal': 1}
- **apps_web_3**: dominant `other` (purity 0.818), distribution {'camel': 2, 'other': 9}
- **packages**: dominant `camel` (purity 0.686), distribution {'camel': 24, 'other': 11}
- **packages_shared_src_truco**: dominant `camel` (purity 0.796), distribution {'camel': 320, 'other': 82}
- **postgres_apps_api_src**: dominant `camel` (purity 0.568), distribution {'camel': 21, 'other': 16}
- **stripe_apps_web**: dominant `camel` (purity 0.534), distribution {'camel': 217, 'other': 188, 'pascal': 1}
- **stripe_apps_web_2**: dominant `camel` (purity 0.543), distribution {'other': 181, 'camel': 215}
- **stripe_packages_shared_src_pool**: dominant `camel` (purity 0.628), distribution {'camel': 49, 'other': 29}
- **tools_ops**: dominant `camel` (purity 0.833), distribution {'other': 3, 'camel': 15}

## Style fingerprint outliers
- **apps_server_src**: 99.5 LOC/symbol (project mean 31.6 ± 31.2)
- **apps_server_src_minigames**: 110.8 LOC/symbol (project mean 31.6 ± 31.2)

## Refactor backlog (aggregated from per-segment reports)
_65 items across 13 segments._

- `api_apps_api` via `backend-api-reviewer`: **app.ts:498-520, 556**: extract `requireLiveSession(sessionId, userId)` returning the user, to replace five copies of the session lookup and 401 (F13).
- `api_apps_api` via `backend-api-reviewer`: **app.ts:530-552**: register the four settle routes from one shared zod schema and a map of `{game: wallet.settleX}` (F13).
- `api_apps_api` via `backend-api-reviewer`: **database/index.ts:107-109**: attach `pool.on('error', ...)` that logs, and make pool size configurable through `DatabaseOptions` (F17).
- `api_apps_api` via `backend-api-reviewer`: **admin-console.ts:276 and 234**: make the log cursor a `(at, id)` tuple and compare with `(at < before) or (at = before and id < beforeId)` so boundary rows are not skipped (F6). Document or migrate overview to cursor paging (F6).
- `api_apps_api` via `backend-api-reviewer`: **admin-console.ts:355, 359**: cache the table counts for a short TTL or use `pg_class.reltuples` for the overview, so each admin poll does not scan `game_logs` (F20).
- `apps_api_src_database` via `db-schema-reviewer`: `schema-contract.ts:55-64`: add the seven missing FKs (F-1). Certify `ON DELETE` for each.
- `apps_api_src_database` via `db-schema-reviewer`: `schema-contract.ts:85-86`: make `requireFragments` compare whole clauses, for example by matching the full pg_get_constraintdef text or by comparing exact strings after normalisation. Stop stripping `(` and `)` before comparison (F-4).
- `apps_api_src_database` via `db-schema-reviewer`: `schema-contract.ts:93-130`: add a trigger check against `pg_trigger` for `fuel_wallet_reservation` on `wallets` (F-3).
- `apps_api_src_database` via `db-schema-reviewer`: `apps/api/src/database/schema.ts`: either declare the missing indexes and CHECKs, or add a comment saying the DDL is authoritative and listing the exceptions (F-5). Pick one before any drizzle-kit wiring.
- `apps_api_src_database` via `db-schema-reviewer`: `infra/migrations/007_phone_social.sql:32` and `010_badge_images.sql:8`: add indexes on `phone_messages(media_id)` and `badges(image_id)` as a new migration (F-6). Keep migrations forward-only.
- `apps_server_src_minigames` via `generalist-reviewer`: Extract a shared `takeParts(players, stake, debit)` helper (stake all, refund-or-settle, notice text) into `blackjack-bank.ts` or a new `minigames/stakes.ts`. Replaces `foosball.ts:259-290`, `pool.ts:281-307`, `truco.ts:142-167`. Move the four `FREE_BANK` and four bank interfaces to the same module (`blackjack.ts:47-50`, `foosball.ts:14-17`, `pool.ts:13-17`, `truco.ts:28-32`).
- `apps_server_src_minigames` via `generalist-reviewer`: Wrap the `taking` reset in `try/finally` in `pool.ts:282-290` and `truco.ts:142-151`, matching `foosball.ts:289-290`.
- `apps_server_src_minigames` via `generalist-reviewer`: Resolve the possession rule: decide the ITSF behaviour, then make `foosball.ts:332-334` and its comment agree. Put the rule table next to the constants in `packages/shared/src/foosball.ts:71`.
- `apps_server_src_minigames` via `generalist-reviewer`: Split `FoosballCpu.play` (`foosball-cpu.ts:55-105`) into `chooseEdge`, `backPass` and `shouldStrike` helpers. Name the magic numbers listed in F4.
- `apps_server_src_minigames` via `generalist-reviewer`: Make `BlackjackTable.act` explicit: a named `split` branch, and a throw in the final `else` (`blackjack.ts:204-218`), plus a default throw in `cost()` (`blackjack.ts:400`).
- `apps_server_src_world` via `realtime-streaming-reviewer`: `apps/server/src/world/wallet.ts:23-46`: persist `WalletRetries` pending entries through a `FileOutbox`, as `ResultRelay` does. Keep the `applied` callback in memory, keyed by requestId, and move it outside the try at `:39`.
- `apps_server_src_world` via `realtime-streaming-reviewer`: `apps/server/src/world/refueling.ts:107-111`: throttle the journal swap to about once per second, or journal only at phase changes and on the final total. Keeps recovery correct with fewer rewrites.
- `apps_server_src_world` via `realtime-streaming-reviewer`: `apps/server/src/world/refueling.ts:115-127`: cap settle retries and surface a stuck state in the service message. Clear the pump after a bounded number of 4xx refusals, logging each.
- `apps_server_src_world` via `realtime-streaming-reviewer`: `apps/server/src/world/bots.ts:55-70`: add `child.on('error', ...)` that logs through `options.log`, and a kill timeout after `stop()` that forces `exit`.
- `apps_server_src_world` via `realtime-streaming-reviewer`: `apps/server/src/world/trades.ts:38-43`: check conflicts before `this.invites.delete(...)`, or return an event so the room can notify the inviter.
- `apps_web_2` via `frontend-ui-reviewer`: `engine/environment-lighting.ts:186-268` (`configureMap`, about 80 lines): split into `configureSign`, `configureLamp`, `addStreetLamps` and `tintMaterials`; merge the two mesh loops at `:240` and `:248`.
- `apps_web_2` via `frontend-ui-reviewer`: `engine/moto-delivery.ts:250-302` (`Motos.update`, about 50 lines): extract the per-bike pose step (`:254-280`) and the per-bike lamp and rig step (`:281-294`) into methods; the two `RiderRig` and `RagdollRig` interfaces (`moto-delivery.ts:340`, `moto-ragdoll.ts:6`) can share one base.
- `apps_web_2` via `frontend-ui-reviewer`: `foosball/panel.ts:73` and `:349`: cache DOM references once in `createFoosballPanel`, and replace the `data-fb-*` click chain with a table of handlers keyed by data attribute.
- `apps_web_2` via `frontend-ui-reviewer`: Shared audio helper: one `getAudioContext()` plus the `placeListener` and visibility plumbing, used by the five engine sound modules (`car-sound.ts:9`, `horse-sound.ts:30-40`, `moto-sound.ts:183-196`, `vehicle-horn.ts:12-16`, `weather-sound.ts:23-38`).
- `apps_web_2` via `frontend-ui-reviewer`: Shared `Rgb`, `smooth`/`smoothstep`/`ease` and `RAD_TO_DEG` constants in one math module (`day-night.ts:3,6`, `serving-props.ts:37,91`, `stage-show.ts:5,13,76`, `moto-lights.ts:10`, `video-palette.ts:2`).
- `apps_web_3` via `frontend-ui-reviewer`: **`rigs.js:20`, `:44`**: delete the `loading` entry on rejection, and `.catch` in the change handler to set `$('status')`. Replace `void select(...)` with an explicit catch.
- `apps_web_3` via `frontend-ui-reviewer`: **`rigs.js:6-7,39,47`**: replace `ids`, `labels`, and index-coupled `children[i]` with one `{id, label}` array and a `data-id` on each label element.
- `apps_web_3` via `frontend-ui-reviewer`: **`rigs.js:48-49`**: store bone nodes once when the actor is built (`actors` entry or a per-source map), and reuse a scratch `Vec3` in the overlay loops.
- `apps_web_3` via `frontend-ui-reviewer`: **`http-redirect.ts:16`**: attach `socket.on('error', ...)` right after the connection listener runs, and give the pre-readable phase its own timeout. Log once if the TLS-listener detection at `:12` fails.
- `apps_web_3` via `frontend-ui-reviewer`: **`vite.config.ts:17-18,23`**: run git once (or cache it), and add `API_PORT` (default 3001) to mirror `GAME_PORT`.
- `packages` via `generalist-reviewer`: `packages/shared/src/tickets.ts:5-24`: move `authSecret`/`internalSecret` into the API and server config modules. Fail closed in production, and require `AUTH_SECRET` unless `NODE_ENV` is explicitly `development` or `test`.
- `packages` via `generalist-reviewer`: `packages/shared/src/achievements.ts:72`: replace the ternary chain with `RARITY_INFO[tier.rarity].color`.
- `packages` via `generalist-reviewer`: `packages/shared/src/stage-show.ts:107` and `:112`: derive the bars union from `SHOW_BARS`, and name the speed range (`SHOW_SPEED={min:25,max:200}`) like `SHOW_BPM`.
- `packages` via `generalist-reviewer`: `packages/shared/src/metrics.ts:57-65`: wrap each gauge `read()` in try/catch; in `render()`, sort each window once and reuse the sorted array for the three quantiles.
- `packages` via `generalist-reviewer`: Replace the seven `clamp` copies listed in Cross-segment hints with one shared math helper (cross-segment, synthesizer to route).
- `packages_shared_src_truco` via `realtime-streaming-reviewer`: `truco/game.ts:107`: change `advance()` to take `{phase, handNumber}` and return a boolean. No-op on mismatch.
- `packages_shared_src_truco` via `realtime-streaming-reviewer`: `truco/game.ts:248`: change `signal(seat, signal)` to `signal(seat, signal, now)` with a per-seat last-signal time against `TRUCO.signalCooldownMs`. Cap the list per hand.
- `packages_shared_src_truco` via `realtime-streaming-reviewer`: `blackjack.ts:88` and `:90`: add `round` (or `move`) to both schemas, matching `blackjackActionSchema` at `:89`.
- `packages_shared_src_truco` via `realtime-streaming-reviewer`: `jukebox.ts:161-162`: remove the client-duration guard or compare against the server's known duration. Document the choice.
- `packages_shared_src_truco` via `realtime-streaming-reviewer`: Extract one `betLimits(prices, key, defaults)` helper for `blackjack.ts:74`, `foosball.ts:368` and `truco/stakes.ts:17`. Extract one `clamp` and one read/write helper for `car-parts.ts:28-32` and `moto-parts.ts:28-32`.
- `postgres_apps_api_src` via `db-schema-reviewer`: **One debit helper** for `wallet-service.ts` `change`, `settleGame`, `fuel-service.ts` `settle`, and the buy paths in `highfood-service.ts:65`, `inventory-service.ts:57`, `wardrobe.ts:77`. It locks the wallet, subtracts active fuel holds, refuses a negative result, clamps to `MAX_COIN_BALANCE`, and validates integer amounts. Fixes DB-01, DB-02, DB-04.
- `postgres_apps_api_src` via `db-schema-reviewer`: **Make `initialize()` read-first.** Select the wallet and starter rows; insert only when missing. Call it at account creation and login, not on view, bank or world-change paths (`wardrobe.ts:21-27`, `inventory-service.ts:15-28`, `wallet-service.ts:23`, `phone-service.ts:429`, `:442`). Fixes DB-11.
- `postgres_apps_api_src` via `db-schema-reviewer`: **Batch the control outbox.** `acknowledgeControls` (`control-outbox.ts:41-46`) becomes one `UPDATE ... WHERE id = ANY(...)` per list. Move the retention DELETE (`:24`) and dead-letter sweep (`:21-22`) to a periodic job. Fixes DB-09, DB-10.
- `postgres_apps_api_src` via `db-schema-reviewer`: **Put the pricing change in the catalog transaction.** Extract an in-transaction variant of `PricingService.change` (`pricing-service.ts:44-75`) and call it inside `saveCatalogEntry` (`wardrobe.ts:151-155`). Fixes DB-06.
- `postgres_apps_api_src` via `db-schema-reviewer`: **Lock before counting or checking.** In `createPost` (`phone-service.ts:363-371`), lock the author's `users` row `FOR UPDATE` inside a transaction before the count. In `saveBadge` and `deleteImage` (`profile-service.ts:89`, `:137`), take `FOR SHARE` on the `badge_images` row, and have the customer-image check run in the same transaction. Fixes DB-05, DB-07.
- `stripe_apps_web` via `webhook-integration-reviewer`: `apps/web/src/phone/apps/bank.ts:50-58`: hold `requestId` in a closure variable set when the Pix intent starts; reuse it on retry; clear on success or cancel.
- `stripe_apps_web` via `webhook-integration-reviewer`: `apps/web/src/phone/apps/gram.ts:295-297`: same key handling for the publish submit.
- `stripe_apps_web` via `webhook-integration-reviewer`: `apps/web/src/media/file.ts:25`: add `.catch(error => this.fail(FAILED))` to the `load()` chain so a hls.js chunk failure surfaces.
- `stripe_apps_web` via `webhook-integration-reviewer`: `apps/web/src/networking.ts:121-132`: cap attempts (or back off to a max) and surface a "try again later" state after the cap.
- `stripe_apps_web` via `webhook-integration-reviewer`: `apps/web/src/media/platforms.ts:119-127`: reuse `scriptLoader` from `media/player.ts:31` instead of the duplicate loader.
- *... 15 more in synthesis.json*

## Concerns / smells (aggregated)
### api_apps_api
- **F1**: a GET that claims controls (app.ts:588). Confirm and move to POST.
- **F17**: missing pg Pool error listener (database/index.ts:107-109). A transient DB disconnect can take the API down.
- **F3**: ban check present on phone writes but absent on wardrobe, inventory, blocks and reports writes (app.ts:248-279 vs app.ts:291).
- **F2**: response-time enumeration on forgot and resend (app.ts:214-226, 179-192).
- **F4**: role default `'player'` outside the API vocabulary `admin|user` (schema.ts:9 vs app.ts:448).

### apps_api_src_database
- The certifier is weaker than its own comment (F-1, F-2, F-4). It is the only guard against silent drift on a live DB.
- Three schema sources (DDL, `schema.ts`, `schema-contract.ts`) disagree on indexes, CHECKs and triggers (F-5). No single source of truth.
- The fuel reservation invariant lives only in a trigger no check covers (F-3).
- Unindexed set-null and cascade FKs sit on paths that delete often, notably phone media trimming (F-6).

### apps_server_src_minigames
- Four copies of the stake, refund and settle scaffolding across blackjack, foosball, pool and truco (Internal duplication). The next change to the refund rule must be made four times.
- Possession restart in `foosball.ts:332-334` disagrees with its own comment (F1). Gameplay correctness.
- `taking` flags in `pool.ts` and `truco.ts` are not reset in a `finally` (F2). One throwing hook locks a table.
- Dense code: about 40 lines per file contain `!` assertions, and lines run to 398 characters (`truco.ts`). This makes review and diffing hard.
- The table classes trust validated input and have no defence of their own (F3).

### apps_server_src_world
- **Durable refunds are not durable** (`wallet.ts:23`). A restart during an API outage loses coins that players were owed. Highest-impact item in this segment.
- **Pump held forever on a refused settle** (`refueling.ts:115-127`). An uncapped retry with a silent catch and no timeout for the `paying` phase.
- **Unhandled child IPC error** (`bots.ts:51-70`). Possible world crash in development, unverified.
- **Stale trade invite after refusal** (`trades.ts:41`, `:43`). Server state changes without notifying the inviter.
- **Journal rewrite on every coin change** (`refueling.ts:107`). Synchronous fsync at about 7 Hz on the room tick.

### apps_web_2
- **`ponto()` null contract** (`engine/moto-delivery.ts:80-84`, `car-rig.ts:48-51`): returns a cached null but is typed `pc.Entity`. Callers in `moto-delivery.ts:219,221`, `moto-lights.ts:93,96,101,102`, `car-rig.ts:89,94,105,107,126` assume non-null; a model missing one node throws out of `Motos.plac
- **Retry never wired** (`engine/city-plan.ts:106`, `engine/city-streaming.ts:135-147`): sectors that fail three attempts, and a manifest that fails three fetches, stay out until a reload. No production caller of `retryFailed`. Severity: med.
- **PlayCanvas buffer locks** (`engine/pool-balls.ts:44` and `:52`; `engine/city-streaming.ts:242`): `lock()` is called and `unlock()` only runs on the changed path in `pool-balls.ts`; `city-streaming.ts` never unlocks. Verify against the engine's lock contract before acting. Severity: med.
- **Per-frame work** (`engine/moto-sound.ts:130`, `moto-delivery.ts:293`, `car-rig.ts:78`, `car-sound.ts:22`): vehicle `parts` strings are parsed every frame per vehicle; `environment-lighting.ts:345` rebuilds the live-lamp set each frame; `weather-effects.ts:58-61` rebuilds 2400 drops with 9600 array
- **Lifecycle gaps**: `engine/moto-delivery.ts:323` does not destroy `lampMaterials` (`:159`, `:167`); `engine/highfood-props.ts` has no destroy and never releases its box mesh or logo textures (`:9`, `:22`, `:29`); `engine/stage-musicians.ts:146` drops a loaded asset when destroyed mid-load; `engine/

### apps_web_3
- `rigs.js:20,44`: failed loads are cached forever and the UI sticks on "Preparando clipe…". Fix in `source()` and in the change handler.
- `http-redirect.ts:12-16`: relies on Node and Vite internals and has no `'error'` listener before the first byte. Silent failure on upgrade, possible crash on reset.
- `rigs.js` overall: untyped JS in a TypeScript project, with very dense single-line statements (over 300 characters on lines 20, 25, 34, 38). Hard to review.
- `vite.config.ts:17-18`: synchronous git calls run on every config load.
- `rigs.js:6-7,47`: actor identity is carried by parallel arrays and DOM child indexes.

### packages
- **Ticket secret fallback** (`tickets.ts:10-11`): tickets are forgeable with a public literal if `NODE_ENV` is not exactly `production`. Highest-risk item in the segment. Route to auth-security-reviewer.
- **Unguarded gauges** (`metrics.ts:58`): one throwing gauge blanks all metrics.
- **Unvalidated preset and cue lookup** (`stage-show.ts:118`, `:200`): low risk today, brittle for future changes.
- **Copy-pasted `clamp`** in 9 files across `packages/shared`.
- **Five unrelated modules** in one segment. Splitting it makes ownership and review clearer.

### packages_shared_src_truco
- Timed state machine advanced by caller-invoked `advance()` with no token (`truco/game.ts:107`).
- Several client messages carry no round or revision token (`blackjack.ts:88`, `:90`; `foosball.ts:381`, `:385`; `truco/index.ts:19`).
- Unbounded per-match or per-hand arrays (`truco/game.ts:67`, `:69`).
- Realtime limits are declared as constants but enforced nowhere in the package (`voice.ts:8`, `phone.ts:24`).
- The package mixes rules for about 15 games and the world; a single dispatch covers all of it, so review depth per game is thin.

### postgres_apps_api_src
- **Money invariants live in application code, not in the database.** No CHECK constraint on balance or quantity is visible in this segment, and the balance floor is checked on some paths only (DB-01, DB-02, DB-03, DB-04). This is the highest risk in the segment.
- **Writes on read and poll paths.** `initialize()` on every view and bank read (DB-11), `ensureGram` on feed and search (DB-13), `thread()` setting `read_at` (DB-12), and the control-outbox lease DELETE on every poll (DB-09).
- **Non-atomic multi-step writes.** Catalog then pricing (DB-06), createPost count then insert (DB-05), image check then delete (DB-07), saveVehicles without a transaction (DB-08).
- **Ledger `reason` as a data model.** Peer ids and kinds live in text, parsed with `split` and matched with LIKE (DB-21, DB-22). This blocks indexing and FKs.
- **Three day boundaries** across the money paths (DB-25). A bonus can be "today" in UTC and yesterday for the job cap.

### stripe_apps_web
- Two write paths (`bank.ts:54`, `gram.ts:295`) regenerate the idempotency key per click. This is the real risk in this segment.
- The HTTP client that matters (`api.ts`) is out of segment; timeouts and retries for every call here are unknown.
- Unbounded reconnect loop (`networking.ts:121`) with fixed 3 s delay.
- Tokens in query string (`main.ts:1215-1217`).
- Stripe is absent. The segment label is likely a routing false positive; re-check the segmenter's match rules.

### stripe_apps_web_2
- Purchase retry creates a new idempotency key (`phone/apps/motors.ts:118,141`); a lost response can double-charge the player.
- No timeouts on any outbound request in the segment, and none in the shared `api()` helper (`apps/web/src/api.ts:3`).
- Pending UI states have no timeout path (`phone/apps/zap.ts:162-177`), so a stalled upload looks like a slow one forever.
- Empty catches hide failures on best-effort paths (`phone/core.ts:201`, `prices.ts:15`, `phone/apps/zap.ts:374`, `phone/phone.ts:73`).
- Repeated error-message and formatting helpers across the phone apps (see Internal duplication).

### stripe_packages_shared_src_pool
- `bar-animations.ts` is not pool code. It is grouped here by path and label (cohesion, see Cohesion assessment).
- `simulateShot` (`physics.ts:130-355`) is 226 lines of shared mutable state. This is the riskiest code to change.
- The AI's time budget is wall-clock (`ai.ts:95-101`). Plays differ by machine.
- The bench stand-up path plays the wrong clip (`bar-animations.ts:151`), pending server-timing check.
- Many exports look unused within the segment (see Deletability). Verify repo-wide before removing.

### tools_ops
- Windows backup privacy claim is not true (finding 3). Highest priority.
- `pseudonym.mjs` has two secret fallbacks, one of them a public literal (findings 1 and 2).
- The restore check is the only verification and it targets the production cluster (finding 4).
- Parameter parsing is shared across commands and silently accepts flags that do nothing (finding 5).
- Entire segment is synchronous and buffers whole dumps in memory (finding 7).

## Cross-segment hints (raw, for routing)
### From api_apps_api
- **Ban enforcement** (F3): `authenticated` (app.ts:119-122) does not check `isBanned`; the phone's `phoneUser` does on writes (app.ts:291). Whether a banned session is rejected at all depends on `readSession` / `isBanned` in `apps/api/src/auth/service.ts` (outside this segment). Route it to the auth-security reviewer.
- **GET side effect in control claim** (F1): `claimControlsOnce` (app.ts:588) is implemented in `control-outbox.ts` (not in this segment). Route to the queue/worker reviewer to confirm it writes.
- **Phone reads** (F11): `phone.thread` (app.ts:330) and `phone.gramProfile` (app.ts:368) are GETs in `phone-service.ts`. Route to the db or phone reviewer to confirm whether they write `phone_messages.read_at` (schema.ts:111) or create `gram_profiles` (schema.ts:127).
- **Validation in services**: pix amount (app.ts:394), admin action reason optional for kick and ban (app.ts:452), and the moderation `reason` NOT NULL column (schema.ts:74) rely on `phone-service.ts` and `admin-s

### From apps_api_src_database
- `apps/api/src/database/schema.ts` (same folder, not in this list, read to verify) is the Drizzle model. It is not the DDL source and differs from the SQL (F-5). Route to the segment that owns `schema.ts`.
- Migration SQL under `infra/migrations/001_initial.sql` through `019_fuel_services.sql` (not in this list, read to verify) is the authoritative DDL. Route to the infra or migrations segment if one exists.
- The fuel reservation trigger `fuel_wallet_reservation` (infra/migrations/019_fuel_services.sql:10-18) is a DB-level money invariant that `apps/api/src/app.ts:96` maps by constraint name. Business logic in the DB layer; cross-check with the app and money-path segment.
- `apps/api/src/phone-service.ts:182-186` (`trimMedia`) deletes `phone_media` rows, which fires the unindexed `phone_messages.media_id` set-null (F-6). Owned by the phone segment.
- `.cartographer/reports/postgres_apps_api_src.md` already covers query-side index needs. Status of its items against the SQL, checked he

### From apps_server_src
- Coin charge-and-refund logic (`charge`/`refund`/`cancelTable`/`WalletRetries`) is spread across this file and `world/wallet.ts`; a single owner would prevent the gaps in finding F1-F2.
- `Refueling.busy`, `Refueling.cancel` and `Refueling.request` (`world/refueling.ts`) decide whether a bike can be despawned; their semantics decide F2 and F10.
- The admin control path (`ControlRelay`, `world/relays.ts`) and `applyControl` (`BarRoom.ts:3191`) belong with the admin segment review.
- `index.ts` has no SIGTERM/graceful-shutdown handling (devops segment).
- `Access` (`internal.ts:6`) is also the shape used by `validateAccess` in the API; any change there must be made on both sides.
- `world/musicians.ts` and `world/served.ts` are listed here but sit beside the `world` segment's report; no overlap was found.

### From apps_server_src_minigames
- `blackjack-bank.ts` is the common coin layer for four games but is named for blackjack. It depends on `world/outbox.ts` and `world/wallet.ts`, which belong to the world segment (a sibling report exists; avoid duplicating it).
- Input validation is in zod schemas in `packages/shared` (`blackjackActionSchema` in `packages/shared/src/blackjack.ts:89`, `foosballConfigSchema` in `packages/shared/src/foosball.ts:378`, `trucoConfigSchema` in `packages/shared/src/truco/index.ts:18`, `poolConfigSchema` in `packages/shared/src/pool/index.ts:121`). The table classes trust that validation (see F3).
- The notice hooks in `apps/server/src/BarRoom.ts:246`, `:258`, `:274`, `:292` call `client.send` directly. Relevant to F2.
- Game rules (`TrucoGame`, `judgeShot`, `FoosballSim`, `PoolPlanner`, `trucoDecide`) live in `packages/shared`. Out of this segment's scope.
- Possession time limits and rod kinds are constants in `packages/shared/src/foosball.ts:71` and `:30`. Relevant to F1.

### From apps_server_src_world
- **Maintenance overlap**: `BarRoom.ts:340` fires maintenance every 3 s without awaiting it, and `BarRoom.ts:3092-3097` awaits several flushes in sequence. The relays and wallet retries have no in-flight guard (`relays.ts:17`, `relays.ts:44`, `wallet.ts:30`). Verify whether maintenance is guarded in `BarRoom.ts`.
- **Nonce expiry**: `reserveNonce` (`session-registry.ts:64`) is pruned at `BarRoom.ts:3077` and called at `BarRoom.ts:350`. The ticket verifier must reject `exp` in the past, or pruning opens a replay window. Verify in the auth segment.
- **Outbound rate limit**: `media-check.ts` makes server-side fetches per queue submission with no rate limit in this segment. Belongs with the auth and rate-limit lane.
- **Trade invite state**: the client must be told when the server removes an invite. `trades.ts:41` removes it without an event. The room's broadcast path is outside this segment.
- **NPC filter**: `NpcDirector.update` receives only the non-customer NPCs (`BarRoom.ts:1051`). `

### From apps_web
- `badgeMedal`, `customerPicture`, `plateHtml`, `itemImage`, `coins`, `uiIcon`, `glints` and `studs` are imported from other modules and return HTML. Callers pass user-entered text (badge name and description, customer name). Their escaping must be checked in their own segments.
- `apps/web/src/admin/performance.ts:44-52` rebuilds five panels on every monitor push. Push rate is set in the performance monitor (outside this segment).
- `apps/web/src/admin/kit.ts:30-46` mirrors the server's `adminSnapshot` by hand (`apps/server/src/BarRoom.ts`). Drift risk.
- `apps/web/src/admin/players.ts`, `highfood.ts`, `vehicles.ts`, `car-panel.ts` import `plateHtml` from `garage-panel`; `car-panel.ts` also imports types from `moto-panel`. These are UI-to-UI links across panels.
- `apps/web/src/api.ts:8` holds the HTML `escape` helper; about twenty files import it from the network module. A utility module would be clearer.
- Badge image upload (`badges.ts:23`) follows the phone media upload pattern (t

### From apps_web_2
- Five engine sound modules each create their own AudioContext (`car-sound.ts:9`, `horse-sound.ts:34`, `moto-sound.ts:188`, `vehicle-horn.ts:15`, `weather-sound.ts:27`). Across apps/web/src there are about 16 `new AudioContext()` sites (see the other apps/web report for the close-path finding). A shared context would remove most of this.
- `placeListener` lives in `moto-sound.ts:49` but is imported by `car-sound.ts:2`, `horse-sound.ts:2` and `vehicle-horn.ts:2`; it belongs in a shared audio helper.
- `retryFailed` (`city-plan.ts:106`) has no production caller; only `tests/integration/city-streaming.test.ts:177` calls it. Whatever owns connectivity (BarScene or the app shell) should call it on reconnect.
- `environment-lighting.ts:269` takes `event:string` and compares against `'BLACKOUT'` / `'PARTY'` (`:281`); the event type is `scene-types.ts:59` `type:string`. A shared union would catch typos.
- `scene-types.ts:32` `holding?:string` and `:30` `drinkItem?:string` should use the shared

### From apps_web_3
- `rigs.js:2,4` import `mixamo-retarget.ts` and `animation-tracks.ts` from `apps/web/src/engine`. Those modules belong to the engine segment, not this one.
- `rigs.js:3` imports `BAR_ANIMATIONS` from `packages/shared`. Shared animation metadata is consumed here without a runtime guard.
- `rigs.js:20` fetches `/animacoes/`, `/models/`, and `/animations/` assets from the static dir. Asset presence is not checked here.
- `vite.config.ts:24` depends on the game server's `GAME_PORT` default of 2567, which is defined in another segment.
- `http-redirect.ts` and `vite.config.ts` form one dev-server concern. They are in the same segment and reviewed together.

### From packages
- `clamp` copies outside this segment: `packages/shared/src/car-dynamics.ts:5`, `foosball.ts:99`, `head-look.ts:5`, `moto.ts:72`, `needs.ts:144`, `pool/physics.ts:64`, `city.ts:20`. Candidate for one shared math helper.
- `packages/shared/src/world.ts:4` imports `LIGHT_DESK` and `LIGHT_DESK_REACH` from `stage-show.ts`. World geometry depends on a feature module (layering inversion).
- `tickets.ts:10-11` secret fallback: route to **auth-security-reviewer**.
- `metrics.ts` gauges are wired in `apps/server/src/BarRoom.ts:325-331`: route to the observability or server reviewer for the `read()` exception risk.
- `apps/api/src/config.ts:39` and `apps/server/src/config.ts:63` consume `authSecret`/`internalSecret`; secret handling belongs in a config module, not `tickets.ts`.
- `apps/server/src/BarRoom.ts` also consumes `verifyTicket`/`GameTicket` from `tickets.ts`: auth-security-reviewer to check the ticket path end to end.
- `achievementReportSchema` and `AchievementView` are consumed by `ap

### From packages_shared_src_truco
- `index.ts:88`: `PublicUser` carries `email`. Keep it out of anything the room broadcasts (auth/PII segment).
- `moto.ts:53` and `index.ts:136`: `MotoState` exposes `ownerId`, `ownerName`, `vehicleId` to every client ("seen from anywhere"). Auth/data segment to confirm this is intended.
- `media-links.ts:68-77`: `fileLink` allows any public https host, and each listener's browser fetches it. IP exposure and tracking risk (security segment).
- `highfood.ts:172`: four-digit pickup code, 10,000 values. Attempt limiting must live on the server (backend/security).
- `packages/shared/src/tickets.ts` exists in the same package but is not in this file list. Not reviewed here.
- Price-table lookups for bet limits and stakes (`blackjack.ts:74`, `foosball.ts:368`, `truco/stakes.ts:17`) belong to the economy segment.

### From postgres_apps_api_src
- Input bounds for money and quantities live in route zod schemas, not here: settle payout (`wallet-service.ts:91`), inventory `quantity` (`inventory-service.ts:41-46, 66-75`). Confirm in `app.ts` (api segment).
- Pix bound: the api report's F5 is answered in the service, `phone-service.ts:439` (1 to PHONE.pixMax). Keep it there.
- Internal routes trust the world: `highfood-service.ts:87` (`saveVehicles`) and the settle services. Confirm the internal-secret gate covers them (api segment).
- Image-delete guard is split: badges checked in `profile-service.ts:137`, customers checked by a separate helper `highfood-service.ts:181`. The route must call both.
- Business logic in services that act as repositories: Highgram suggestion weights (`phone-service.ts:309-324`), Highfood pay and stars (`highfood-service.ts:110-128`), game payout caps (`wallet-service.ts:75-104`), catalog rules (`wardrobe.ts:148-149`). The synthesizer may route these to the business-logic segment.
- Ban check consisten

### From stripe_apps_web
- `api()` in `apps/web/src/api.ts` is the only HTTP client here. Its timeout, retry, and abort behaviour is unverified from this segment and decides the real risk for every call in `main.ts`, `networking.ts`, `phone/apps/*`.
- Server must honour `requestId` on `/phone/bank/pix`, `/phone/gram/posts`, `/phone/gram/posts/:id/comments`, `/wardrobe/buy`, `/inventory/buy`. The client sends it; dedupe is not verifiable here.
- Dev mail route is gated server-side at `apps/api/src/app.ts:626` (`!config.production && config.mailEnabled`). Good, but belongs to the API segment.
- Third-party script injection (`media/player.ts:36`, `media/platforms.ts:122`) has no SRI and no CSP in this segment. CSP check belongs to the devops/config segment.
- Verify and reset tokens travel in the page URL (`main.ts:1215-1217`). Route handling is in the auth segment.

### From stripe_apps_web_2
- `apps/web/src/api.ts:3`: the shared `api()` helper has no timeout and no `AbortSignal`. Every `api()` call in this segment inherits it (e.g. `profile/profile-window.ts:255`, `phone/apps/telefone.ts:55`, `phone/apps/zap.ts:132`, `phone/apps/motors.ts:37`). Route to the API-client or backend reviewer.
- Server-side idempotency for `requestId`-keyed writes (`/vehicles/buy`, `/phone/zap/:peer`, `/phone/zap/:peer/media`) must be verified in the backend segment; this segment assumes it.
- Room messages without acknowledgement: `moto.tow` (`phone/apps/motors.ts:150`) and `trade.*` (`trade/trade.ts:43,101-104`). Route to the realtime segment.
- `/phone/vibrate.wav` and `/api/prices` are served by the web host; cache and error headers belong to devops.

### From stripe_packages_shared_src_pool
- `index.ts:6` imports `../truco/stakes.js`. Pool stake values depend on the truco segment.
- `index.ts:31-40` and comment `index.ts:31`: stake values come from the price table keys `pool:*`. The price-table owner (admin or economy segment) belongs with this coupling.
- `index.ts:13-14` header comment says the room lives in `apps/server/src/minigames/pool.ts`. The server room, `pool.shot` and `pool.view` handlers belong to the realtime segment.
- `index.ts:113-126` zod schemas validate browser messages. They belong to the same validation or backend-api segment that owns message routing.
- `bar-animations.ts:1` imports `./map-data.json` and `bar-animations.ts:3` imports `./world.js` (`floorHeight`, `isWalkable`). The world or collision segment owns those.
- `bar-animations.ts:6-12` describes room-synced `animationState` and `animationStartedAt`. The room and client animation consumers belong to a bar or NPC segment, not the pool segment.
- `bar-animations.ts` has no pool code at all. It

### From tools_ops
- `tools/ops/pseudonym.mjs:2` says the formula matches `apps/server/src/observability.ts`. Parity not verified here (outside this segment). Route to the server or observability reviewer.
- `tools/ops/pseudonym.mjs:16` falls back from INTERNAL_SECRET to AUTH_SECRET. `infra/compose.yml:69` and `:99` require INTERNAL_SECRET and say it must differ from AUTH_SECRET. The fallback contradicts that rule. The server-side reader should be checked for the same fallback.
- `tools/ops/postgres-backup-lib.mjs:9` points at `infra/compose.yml`. The `postgres` service there is the production database (compose.yml:3-20). The restore check therefore runs on the live cluster. Infra reviewer should confirm this is intended.
- Backups contain password hashes (per lib:64 comment). Retention and off-host copy policy is not in this segment. Route to whoever owns deploy docs.
