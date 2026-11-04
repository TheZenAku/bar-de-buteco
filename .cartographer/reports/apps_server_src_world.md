# Segment: apps/server/src/world

**Reviewed by:** realtime-streaming-reviewer

**Scope note:** this segment holds no socket, WebSocket, SSE, Colyseus room or channel code. The realtime lane here means long-lived process state: timers, child processes, IPC, in-memory queues, tick-path I/O and state that the room mirrors to clients. Socket and broadcast code lives in `apps/server/src/BarRoom.ts`, outside this list. The message schemas are covered in `reports/packages_shared_src_truco.md` and are not repeated here.

## Files reviewed
- `apps/server/src/performance.ts`
- `apps/server/src/room/session-registry.ts`
- `apps/server/src/world/achievements.ts`
- `apps/server/src/world/bartender.ts`
- `apps/server/src/world/bots.ts`
- `apps/server/src/world/events.ts`
- `apps/server/src/world/highfood.ts`
- `apps/server/src/world/jobs.ts`
- `apps/server/src/world/media-check.ts`
- `apps/server/src/world/navigation.ts`
- `apps/server/src/world/needs.ts`
- `apps/server/src/world/npcs.ts`
- `apps/server/src/world/outbox.ts`
- `apps/server/src/world/phone-calls.ts`
- `apps/server/src/world/refueling.ts`
- `apps/server/src/world/relays.ts`
- `apps/server/src/world/trades.ts`
- `apps/server/src/world/waiter.ts`
- `apps/server/src/world/wallet.ts`

## Integrations
- Internal API client (`../internal.js`), called through the wallet, relay and refueling hooks
- Outbound HTTP to oEmbed endpoints (`apps/server/src/world/media-check.ts:51-65`)
- Child process over IPC running the development bots (`apps/server/src/world/bots.ts:55-58`)
- Local filesystem JSON-lines journal with fsync (`apps/server/src/world/outbox.ts`)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/server/src/performance.ts` | `ServerPerformanceSampler` | class | Tick window, CPU and event-loop sampler for the admin panel |
| `apps/server/src/room/session-registry.ts` | `SessionRegistry` | class | User and session index with expected-presence matching |
| `apps/server/src/room/session-registry.ts` | `SessionClient` | interface | Minimal transport handle (`sessionId`) |
| `apps/server/src/world/achievements.ts` | `AchievementTracker` | class | Accumulates player achievement counts, reports whole numbers |
| `apps/server/src/world/bartender.ts` | `BarService` | class | Magrão's counter queue and serve animation timing |
| `apps/server/src/world/bots.ts` | `BotRunner` | class | Starts, resizes and stops the dev bot child process |
| `apps/server/src/world/bots.ts` | `BotsStatus`, `BotRunnerOptions` | interface | Status payload and runner options |
| `apps/server/src/world/events.ts` | `EventDirector` | class | Single global random event clock (blackout, troublemaker, party) |
| `apps/server/src/world/events.ts` | `EventKind`, `WorldEvent` | type, interface | Event kinds and current event shape |
| `apps/server/src/world/highfood.ts` | `HighfoodDesk` | class | Courier shifts, offers, deadlines and customer give-ups |
| `apps/server/src/world/highfood.ts` | `customerLine` | function | Picks what the customer says on handover |
| `apps/server/src/world/highfood.ts` | `FoodOrder`, `Shift`, `DeskEvent` | interface, type | Order, shift and desk event shapes |
| `apps/server/src/world/jobs.ts` | `JobDirector` | class | Job shifts, stations, tasks, pay queue and table assignment |
| `apps/server/src/world/jobs.ts` | `WorkerOrder`, `Shift`, `Payment`, `JobEvent` | interface, type | Worker order, shift, payment and event shapes |
| `apps/server/src/world/media-check.ts` | `VideoCheck` | class | Asks platform oEmbed endpoints whether a video may play |
| `apps/server/src/world/media-check.ts` | `plainTitle` | function | Strips control characters and caps a title at 200 chars |
| `apps/server/src/world/navigation.ts` | `findPath` | function | A* search over the shared walk rules, budgeted |
| `apps/server/src/world/navigation.ts` | `PathSearch` | class | Sliced A* search, `run(n)` per tick |
| `apps/server/src/world/navigation.ts` | `PathFollower` | class | Moves a body along a validated path |
| `apps/server/src/world/navigation.ts` | `walkSegment` | function | Checks a straight walk against floor and walls |
| `apps/server/src/world/needs.ts` | `NeedsDirector` | class | Per-player needs, mirrored to the Player schema on change |
| `apps/server/src/world/needs.ts` | `InventoryPort`, `NO_INVENTORY` | interface, const | Synchronous inventory port and its no-op default |
| `apps/server/src/world/npcs.ts` | `createNpcs` | function | Builds bartender, Tonico and dealer NPCs |
| `apps/server/src/world/npcs.ts` | `NpcDirector` | class | Wandering routes, pauses, party and blackout reactions |
| `apps/server/src/world/outbox.ts` | `FileOutbox` | class | Durable JSON-lines outbox, fsync on add, atomic rewrite |
| `apps/server/src/world/phone-calls.ts` | `PhoneCalls` | class | One-call-per-player phone state, ringing and expiry |
| `apps/server/src/world/refueling.ts` | `Refueling` | class | Fuel service state machine, pay and recovery |
| `apps/server/src/world/refueling.ts` | `fuelPath` | function | Visibility path around parked vehicle hulls |
| `apps/server/src/world/relays.ts` | `ControlRelay` | class | Leases admin controls from the API, applies once, acks |
| `apps/server/src/world/relays.ts` | `ResultRelay` | class | Sends blackjack results from the outbox, one request per round |
| `apps/server/src/world/trades.ts` | `TradeDesk` | class | Trade invites, offers, ready and confirm stages, idle close |
| `apps/server/src/world/waiter.ts` | `WaiterService` | class | Tonico's order and bussing jobs, route search and walk |
| `apps/server/src/world/waiter.ts` | `TableOrder`, `TableTop`, `WaiterEvents` | interface | Order, table planning port and waiter event shapes |
| `apps/server/src/world/waiter.ts` | `publicOrder` | const | Strips the paying session from an order before it leaves the server |
| `apps/server/src/world/wallet.ts` | `changeWallet` | function | One coin change via the API, same requestId applied once |
| `apps/server/src/world/wallet.ts` | `WalletRetries` | class | In-memory retry queue for credits the API could not take |

## Conventions observed
- **Naming**: camelCase functions and fields, PascalCase classes, UPPER_SNAKE constants, kebab-case file names. Event and log names are snake_case strings (`bots_exit`, `wallet_credit_refused`).
- **Error handling**: throws `Error` with Portuguese player-facing messages. Refusals are classified by `status` (4xx final, else retry) in `relays.ts:55` and `wallet.ts:43`. Some catches swallow silently (`refueling.ts:127`, `refueling.ts:132`).
- **Logging**: injected `log(event, details)` callbacks in every stateful class. No logger imported directly.
- **Async style**: async/await for API calls, plain synchronous tick functions for state. Journal I/O is synchronous (`outbox.ts:31-32`, `outbox.ts:59-63`).
- **Type hints**: fully typed TypeScript. Several non-null assertions (`!`) on lookups (`npcs.ts:29`, `waiter.ts:27`, `jobs.ts:170`). Some casts through `unknown` (`needs.ts:67`).
- **Formatting**: mixed. `refueling.ts`, `performance.ts`, `phone-calls.ts` and `session-registry.ts` use dense no-space style. The rest use spaced style.

## Internal duplication
- `Point = Required<Position>` is declared twice: `navigation.ts:3` and `waiter.ts:6`.
- A distance helper is redefined inline in several places: `refueling.ts:21`, `waiter.ts:67`, `highfood.ts:58-59`.
- The key `${userId}\n${seriesId}` is built in two places: `achievements.ts:17` and `achievements.ts:42`.
- Two different `Shift` interfaces share a name: `highfood.ts:6` and `jobs.ts:8`.
- The job-ended reason string for a finished shift appears twice: `jobs.ts:113` and `jobs.ts:117`.

## Cross-segment hints
- **Maintenance overlap**: `BarRoom.ts:340` fires maintenance every 3 s without awaiting it, and `BarRoom.ts:3092-3097` awaits several flushes in sequence. The relays and wallet retries have no in-flight guard (`relays.ts:17`, `relays.ts:44`, `wallet.ts:30`). Verify whether maintenance is guarded in `BarRoom.ts`.
- **Nonce expiry**: `reserveNonce` (`session-registry.ts:64`) is pruned at `BarRoom.ts:3077` and called at `BarRoom.ts:350`. The ticket verifier must reject `exp` in the past, or pruning opens a replay window. Verify in the auth segment.
- **Outbound rate limit**: `media-check.ts` makes server-side fetches per queue submission with no rate limit in this segment. Belongs with the auth and rate-limit lane.
- **Trade invite state**: the client must be told when the server removes an invite. `trades.ts:41` removes it without an event. The room's broadcast path is outside this segment.
- **NPC filter**: `NpcDirector.update` receives only the non-customer NPCs (`BarRoom.ts:1051`). `npcs.ts:29` assumes every such NPC is bartender, tonico, dealer or `attendant-*`. Verify `isCustomerNpc` covers `HIGHFOOD_NPC_PREFIX` NPCs.
- **Forget on leave**: `NeedsDirector.forget` (`needs.ts:29`) and `SessionRegistry.remove` (`session-registry.ts:55`) must be called on leave, or state leaks. Verify in `BarRoom.ts`.

## Specialist findings
Channel inventory: none in this segment. No channel, room, subscribe or publish code exists here. Auth on message, broadcast scope and reconnect are not applicable to these files.

Checked and clean for this lens: `performance.ts` (percentile, CPU and interval arithmetic, timer is unref'd and cleared in `destroy`), `events.ts`, `bartender.ts`, `needs.ts` (sync writes only on change).

| # | Where | What | Why | Severity |
|---|-------|------|-----|----------|
| 1 | `apps/server/src/world/wallet.ts:23`, `:17-18` | Credits the API could not take are held only in `private pending: Pending[]`. | A world restart loses pending refunds and job pay. The comment at `:17-18` says an outage "delays them instead of losing them", which is only true while the process lives. Abandoned credits after `maxAttempts` (`:33-34`) are logged and dropped. `relays.ts:36` already uses `FileOutbox` for the same kind of durability. | high |
| 2 | `apps/server/src/world/refueling.ts:77-85`, `:115`, `:120-128`, `:94` | A failed `reserve` leaves the service in `active` with phase `paying`. `pay()` then calls `settle` with total 0 and retries every 3 s with no cap (`:127`). The timeout at `:94` excludes `paying`. | If `settle` refuses for good (for example, no reservation), the pump stays occupied (`:69` "Esta bomba está ocupada.") and the retry loop never ends. Verify the API's settle status codes. | med |
| 3 | `apps/server/src/world/bots.ts:51-53`, `:55-58`, `:60-70` | `child` has no `'error'` listener. `send` is wrapped in try/catch, which only catches synchronous throws. | Node emits an `'error'` event for a send on a closed IPC channel. With no listener it is an uncaught exception that can take down the world process. Needs a test to confirm. | med |
| 4 | `apps/server/src/world/trades.ts:38-43` | `respond` deletes the invite (`:41`) before the busy check (`:43`) throws. | The invite is gone server-side but no event is returned, so the inviter's client keeps a stale invite until it reconnects. This is state drift with no reconcile step. Check conflicts before deleting, or return an event. | med |
| 5 | `apps/server/src/world/refueling.ts:105-108`, `apps/server/src/world/outbox.ts:44-47`, `:59-63`, `shared/src/refueling.ts:32` | In `fueling`, `journal.swap` runs whenever `total` changes. `fuelCost` rounds up to whole coins. At price 6 and 1.2 L/s, that is about 7 changes per second. | Each swap rewrites the whole journal file and fsyncs it (`outbox.ts:61`), on the room tick. Throttle to about 1 Hz or journal at phase boundaries and on the last change. | med |
| 6 | `apps/server/src/world/wallet.ts:39` | `entry.applied?.(...)` runs inside the `try` whose catch treats any error as an API failure. | If the callback throws, the credit is re-queued and `changeWallet` runs again with the same requestId. The API is idempotent, but the callback side effects repeat. Move the callback outside the try. | low |
| 7 | `apps/server/src/world/bots.ts:41`, `:45` | `stopping` is set on stop and cleared only on child `exit`. There is no kill timeout. | If the child never exits, `set()` ignores every new count (`:41`) and the status stays "stopping" with no recovery. | low |
| 8 | `apps/server/src/world/relays.ts:44-59`, `:17-31` | `flush` and `poll` have no in-flight guard. | Overlapping calls send the same results or controls twice. This relies on API idempotency that the comment at `:43` states. Verify maintenance overlap (see cross-segment hints). | low |
| 9 | `apps/server/src/world/media-check.ts:41`, `:56-57`, `:58` | Failed answers are never cached (`:41`). Early returns on 400, 401, 403, 404 do not consume `response.body` (`:56-57`). | Every submission of a bad link triggers a new outbound request. Unconsumed bodies can hold the connection until GC. Rate limit at the caller. | low |
| 10 | `apps/server/src/world/npcs.ts:23`, `:29` | `routes[npc.id]!` is non-null asserted. Any NPC id not bartender, tonico, dealer or `attendant-*` throws here. | Currently unreachable if `isCustomerNpc` covers the rest (see cross-segment hints). A new NPC type would crash the tick. | low |
| 11 | `apps/server/src/world/jobs.ts:170` | `options[Math.floor(...)]!` is used when `options` may be empty. | If a job has no station without a table and every table is taken, `task.station` is undefined and `tick` (`:104`, `:110`) throws. Verify `JOBS` in `shared/src/economy.ts:127`. | low |
| 12 | `apps/server/src/world/achievements.ts:13-14`, `:20-21` | `lastCounted` is never pruned. | Grows with every player and series that has `everyMs`. Small, but unbounded over a long run. | low |
| 13 | `apps/server/src/world/outbox.ts:31-32`, `apps/server/src/world/relays.ts:38-40` | `FileOutbox.add` does an open, write and fsync on each call. | `ResultRelay.record` calls it on each finished round, from the room's tick path. A slow disk stalls the tick. Low frequency, so low severity. | low |
| 14 | `apps/server/src/room/session-registry.ts:55-61` | `remove(userId, expected?)` removes the user when `expected` is omitted. | The delayed-leave protection in the comment at `:54` is opt-in. A caller that omits `expected` can remove a newer binding. Verify all callers pass it. | low |

## Concerns / smells
1. **Durable refunds are not durable** (`wallet.ts:23`). A restart during an API outage loses coins that players were owed. Highest-impact item in this segment.
2. **Pump held forever on a refused settle** (`refueling.ts:115-127`). An uncapped retry with a silent catch and no timeout for the `paying` phase.
3. **Unhandled child IPC error** (`bots.ts:51-70`). Possible world crash in development, unverified.
4. **Stale trade invite after refusal** (`trades.ts:41`, `:43`). Server state changes without notifying the inviter.
5. **Journal rewrite on every coin change** (`refueling.ts:107`). Synchronous fsync at about 7 Hz on the room tick.

## Refactor suggestions
1. `apps/server/src/world/wallet.ts:23-46`: persist `WalletRetries` pending entries through a `FileOutbox`, as `ResultRelay` does. Keep the `applied` callback in memory, keyed by requestId, and move it outside the try at `:39`.
2. `apps/server/src/world/refueling.ts:107-111`: throttle the journal swap to about once per second, or journal only at phase changes and on the final total. Keeps recovery correct with fewer rewrites.
3. `apps/server/src/world/refueling.ts:115-127`: cap settle retries and surface a stuck state in the service message. Clear the pump after a bounded number of 4xx refusals, logging each.
4. `apps/server/src/world/bots.ts:55-70`: add `child.on('error', ...)` that logs through `options.log`, and a kill timeout after `stop()` that forces `exit`.
5. `apps/server/src/world/trades.ts:38-43`: check conflicts before `this.invites.delete(...)`, or return an event so the room can notify the inviter.
