# Cartographer health check: BAR de buteco

Scope: 15 segments (272 files) from a 663-file parse. Goal: health check. Tests read for intent only. `assets-bar/`, `tools/assets/` and `.local/` excluded.

Confidence tags used below:
- **[checked]**: I re-read the cited code and it matches the claim.
- **[reported]**: from a segment reviewer, not re-checked. Some depend on code outside the segment.

## Executive summary

1. **Money and state integrity is the main risk.** Negative quantities can credit coins in the inventory service [reported, service verified], the wallet can go negative at settle time, and pending credits are held only in memory on the world server [checked] so a world restart loses them.
2. **Unauthenticated-looking writes and trust boundaries.** A GET route claims controls [checked, `apps/api/src/app.ts:588`]. Phone writes check bans but wardrobe, inventory, blocks and reports writes don't [reported].
3. **Fallback secrets.** Two shared-code paths fall back to a public literal secret when `NODE_ENV` is not exactly `production` [checked: `packages/shared/src/tickets.ts:8-12`, `tools/ops/pseudonym.mjs:16-18`]. Safe only if every production deploy sets `NODE_ENV=production`; the deploy config was not checked.
4. **Operational crash and hang risks.** The API pg pool has no `'error'` listener [checked, `apps/api/src/database/index.ts:107`]. The world bots child process has none either [checked by grep, `apps/server/src/world/bots.ts`]. The shared `api()` helper has no timeout [checked, `apps/web/src/api.ts:3`], so every web request inherits it.
5. **Client-side idempotency gaps.** Phone Pix transfers, gram posts and vehicle purchases each generate a fresh `requestId` per press [checked: `phone/apps/bank.ts`, `phone/apps/gram.ts`, `phone/apps/motors.ts:118`], so a retry after a lost response is not recognised as a duplicate.
6. **Null dereference.** `moto-delivery.ts` uses `rig.ponto(...)` without a null check [checked, lines 219 and 221]. A missing model node throws on every sync.
7. **Mis-segmentation.** The packages segment contains bar NPC animation code with no pool dependency [reported]. The `stripe@` label on the pool and web segments is a false positive [checked].

## Segment inventory

| Segment | Files | Specialist | Report |
|---|---|---|---|
| api@apps/api | 6 | backend-api-reviewer | api_apps_api.md (28 findings) |
| packages/shared/src/truco | 46 | realtime-streaming-reviewer | packages_shared_src_truco.md |
| stripe@apps/web | 40 | webhook-integration-reviewer | stripe_apps_web.md (mislabelled, no Stripe) |
| apps/web | 40 | frontend-ui-reviewer | apps_web.md |
| stripe@apps/web#2 | 26 | webhook-integration-reviewer | stripe_apps_web_2.md |
| apps/web#2 | 39 | frontend-ui-reviewer | apps_web_2.md |
| postgres@apps/api/src | 19 | db-schema-reviewer | postgres_apps_api_src.md (40 findings) |
| apps/server/src/world | 19 | realtime-streaming-reviewer | apps_server_src_world.md |
| stripe@packages/shared/src/pool | 7 | generalist-reviewer | stripe_packages_shared_src_pool.md (no Stripe; pool + bar animations) |
| apps/server/src/minigames | 6 | generalist-reviewer | apps_server_src_minigames.md |
| apps/server/src | 9 | backend-api-reviewer | apps_server_src.md (20 findings) |
| tools/ops | 4 | devops-config-reviewer | tools_ops.md |
| apps/api/src/database | 3 | db-schema-reviewer | apps_api_src_database.md (11 findings) |
| packages | 5 | generalist-reviewer | packages.md |
| apps/web#3 | 3 | frontend-ui-reviewer | apps_web_3.md (dev tooling only) |

Reports are in `.cartographer/reports/`.

## Ranked findings

### Critical to fix first (money, data loss, crash)

| # | Finding | Where | Tag |
|---|---|---|---|
| 1 | Negative `quantity` on inventory buy credits coins; negative remove grows a stack. Safe only if the route validates. | `apps/api/src/inventory-service.ts:41-46, 57, 60, 66-76` | reported; service read [checked] |
| 2 | Settle payout is bounded only above; fuel holds not subtracted by other debits, so balance can go negative. | `apps/api/src/wallet-service.ts:91`, `fuel-service.ts:35-37` | reported |
| 3 | Pending credits (refunds, job pay) held in memory; world restart loses them. The comment says outages only delay. | `apps/server/src/world/wallet.ts:23` | [checked] |
| 4 | Double-tow race charges twice; tow at a pump can charge with no refund. | `apps/server/src/BarRoom.ts` (F1, F2 in server report) | reported; verify against `world/refueling.ts` |
| 5 | Pg pool without `'error'` listener; a DB restart can crash the API. | `apps/api/src/database/index.ts:107-109` | [checked] |
| 6 | `GET /api/internal/controls` claims controls (a write behind GET). Internal secret limits exposure. | `apps/api/src/app.ts:588` | [checked] |

### High to medium (correctness and trust)

| # | Finding | Where | Tag |
|---|---|---|---|
| 7 | Ban checked on phone writes, not on wardrobe, inventory, blocks, reports. | `apps/api/src/app.ts:119-122, 248-279, 291` | reported |
| 8 | Forgot / resend password reveals registered e-mails via response timing. | `apps/api/src/app.ts:179-226` | reported |
| 9 | Default role `'player'` in schema vs `admin\|user` vocabulary in code. | `apps/api/src/database/schema.ts:9`, `app.ts:448-623` | reported |
| 10 | Pix amount has no sign or max bound at the route. | `apps/api/src/app.ts:394` | reported |
| 11 | Admin log cursor is timestamp-only with strict `<`; rows at the boundary can be skipped. | `apps/api` admin logs | reported |
| 12 | `tickets.ts` secret fallback to a public literal when `NODE_ENV` is not `production`. | `packages/shared/src/tickets.ts:8-12` | [checked] |
| 13 | Pseudonym HMAC key falls back to a public literal when `NODE_ENV` is unset and no secret. | `tools/ops/pseudonym.mjs:16-18` | [checked] |
| 14 | Pseudonym helper falls back to `AUTH_SECRET` if `INTERNAL_SECRET` is missing, contradicting the compose rule. | `tools/ops/pseudonym.mjs:16` | reported |
| 15 | Backup file mode `0o600` is ignored on Windows; dump holds password hashes and the comment overstates privacy. | `tools/ops/postgres-backup-lib.mjs:66` | [checked] |
| 16 | Restore check creates and drops a temp DB on the live cluster. Guarded, but runs against production. | `tools/ops/postgres-backup-lib.mjs:111-122` | reported |
| 17 | Non-idempotent client requests: Pix transfer, gram post, vehicle buy. | `apps/web/src/phone/apps/bank.ts`, `gram.ts`, `motors.ts:118` | [checked] |
| 18 | Shared `api()` has no timeout or abort; every web request can hang. | `apps/web/src/api.ts:3` | [checked] |
| 19 | Bots child process has no `'error'` listener; IPC failure may crash the world. | `apps/server/src/world/bots.ts:51-70` | [checked by grep]; crash unconfirmed |
| 20 | `taking` flag not reset in `finally`; a throwing notice hook locks betting on the table. | `apps/server/src/minigames/pool.ts:284-290`, `truco.ts:143-151` | [checked]; needs a throwing hook |
| 21 | `moto-delivery.ts` dereferences a possibly null `ponto(...)`. | `apps/web/src/engine/moto-delivery.ts:219, 221` | [checked] |
| 22 | Clip load failure cached as a rejected promise and never retried. | `apps/web/src/engine/rigs.js:20, 44` | reported |
| 23 | `retryFailed` in city plan has no production caller; failed sectors stay out until reload. | `apps/web/src/engine/city-plan.ts:106` | reported |
| 24 | Highfood admin section redraws every 5 s, discarding unsaved typing. | `apps/web/src/admin/highfood.ts:113` | reported; code [checked], browser not run |
| 25 | `metrics.ts` throwing gauge blanks the whole `/metrics` scrape. | `packages/shared/src/metrics.ts:57-61` | reported |
| 26 | Realtime: truco signals have no server-side cooldown; truco `advance()` and blackjack bet messages take no round token. | `packages/shared/src/truco/game.ts:107, 248`, `blackjack.ts:88, 90` | reported; verify on server |
| 27 | Fuel journal fully rewritten and fsynced ~7 times a second during fueling. | `apps/server/src/world/refueling.ts:107` | reported |
| 28 | Inconsistent day boundaries across three money paths. | postgres report | reported |
| 29 | `schema-contract.ts` says it certifies "the complete schema" but reportedly skips some FKs, indexes and CHECKs. | `apps/api/src/database/migrations.ts:104` | comment [checked]; gap reported |

### Maintainability (lower priority)

- `clamp` copied in eight shared files [reported].
- Rarity colours duplicated between `achievements.ts:72` and `RARITY_INFO` [reported].
- Five engine sound modules each create their own `AudioContext` [reported].
- Stake and refund scaffolding duplicated across four minigames [reported].
- `blackjack-bank.ts` is the common coin layer for four games but is named for blackjack [reported].
- `simulateShot` at 226 lines [reported].
- Wall-clock time budget in the pool AI makes decisions machine-dependent [reported].
- Accessibility gaps in the foosball panel: assertive live region re-announcing a countdown every second; right-button lift can stick if released outside the canvas [reported].

## Mechanical synthesis: not useful

`synthesis.json` reported 1,385 "duplicate" name pairs and 0 centralization candidates. These are generic names (`add`, `me`, `key`, `startOfDay`) matching unrelated functions, so I've discarded them. The reviewer findings above are the real signal.

## Method and limits

- Python 3.12 installed for the user to run the scripts (winget, user scope).
- The mapper walked untracked files too, so the segments were filtered to `git ls-files`, excluding `assets-bar/`, `tools/assets/`, `.local/`, and test code. Segment set was hand-curated, not auto-generated.
- Specialist matcher scored 0 for every segment. Assignments were made by hand from names and integrations; overrides recorded in `wave_plan.json`.
- Pipeline tracing found only one entry point, so pipeline views are thin. Endpoint cards (116) and the synthetic OpenAPI spec are the more useful outputs.
- Coverage: `apps/server` (84 files) only about half covered; the rest was outside the top-15 budget.
- Several findings depend on code outside their segment (route zod schemas, `readSession`, `world/refueling.ts`, `observability.ts`, deploy config). They are not resolved.
- Phase 7 (applying fixes) was not run. Nothing in the project was edited by this run.

## Suggested next steps

1. Verify the money findings (1-4) against route validation and `refueling.ts`. These decide whether they are reachable.
2. Set `NODE_ENV=production` in every deployment and confirm; then convert both literal-secret fallbacks to fail-closed.
3. Add the pg pool `'error'` listener and the bots child `'error'` listener.
4. Add a timeout and abort to `api()`.
5. Reuse one idempotency key per user action (not per press) in the phone and vehicle clients.
6. Move pending wallet credits to durable storage.
