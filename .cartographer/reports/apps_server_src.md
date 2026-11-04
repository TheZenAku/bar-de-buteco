# Segment: apps/server/src

**Reviewed by:** backend-api-reviewer

## Files reviewed
- `apps/server/src/BarRoom.ts` (3341 lines)
- `apps/server/src/config.ts`
- `apps/server/src/http.ts`
- `apps/server/src/index.ts`
- `apps/server/src/internal.ts`
- `apps/server/src/observability.ts`
- `apps/server/src/state.ts`
- `apps/server/src/world/musicians.ts`
- `apps/server/src/world/served.ts`

## Integrations
- Colyseus (`@colyseus/core`, `@colyseus/schema`, WebSocket transport) — the room and its HTTP router
- Internal API over HTTP (`internal.ts:16`, base from `API_INTERNAL_URL`) — validate, equip, wallet, trades, highfood, logs, controls
- YouTube oEmbed (`config.ts:81`, `YOUTUBE_OEMBED_URL`) — called from `world/media-check.ts` on each new video (not in this segment)
- Note: segment metadata said "none detected"; the two above are present in the code.

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/server/src/BarRoom.ts` | `BarRoom` | class | The bar room: one Colyseus room, all world state and ~110 message handlers |
| `apps/server/src/BarRoom.ts:299` | `onCreate` | method | Sets capacity, tables, doors, NPCs, timers, metrics gauges; registers messages |
| `apps/server/src/BarRoom.ts:345` | `onAuth` | method | Verifies the ticket, reserves its nonce, validates the session with the API |
| `apps/server/src/BarRoom.ts:356` | `onJoin` | method | Binds a presence to the avatar (new or takeover); sends initial state |
| `apps/server/src/BarRoom.ts:388` | `onDrop` | method | Marks avatar disconnected, ends seated/order states, allows 30 s reconnect |
| `apps/server/src/BarRoom.ts:413` | `onReconnect` | method | Re-validates the session, rebinds the client, refreshes state |
| `apps/server/src/BarRoom.ts:445` | `onLeave` | method | Cancels pending orders/trades; parks or removes the avatar |
| `apps/server/src/BarRoom.ts:507` | `onDispose` | method | Saves vehicles best-effort, stops bots and timers |
| `apps/server/src/BarRoom.ts:509` | `registerMessages` | method | Declares every WebSocket message handler (the room's API surface) |
| `apps/server/src/BarRoom.ts:962` | `handle` | method | Wraps a message: session check, rate limit, zod parse, conscious gate, error envelope |
| `apps/server/src/BarRoom.ts:980` | `step` | method | 20 Hz simulation tick: input, needs, motos, kicks, tables, jobs, NPCs |
| `apps/server/src/BarRoom.ts:1062` | `stepMotos` | method | Delivery bikes and cars: inputs, engines, crashes, owned-vehicle wear |
| `apps/server/src/BarRoom.ts:1183` | `crashMoto` | method | Crash resolution: rider thrown, bike wrecked or left rolling |
| `apps/server/src/BarRoom.ts:1213` | `stepKicks` | method | Kick hit checks per tick against nearby players |
| `apps/server/src/BarRoom.ts:1237` | `startThrown` | method | Puts a body into the ragdoll state, damage, drops hands and parcel |
| `apps/server/src/BarRoom.ts:1382` | `mountMoto` | method | Mount/lift/enter car seat; checks lock, seat, distance |
| `apps/server/src/BarRoom.ts:1447` | `controlVehicle` | method | Doors, hood, trunk, lights, wipers, ignition, engine, lock, refuel |
| `apps/server/src/BarRoom.ts:1560` | `towOwnMoto` | method | Guincho: charges the tow price and places the owner's bike on the street |
| `apps/server/src/BarRoom.ts:1588` | `lockMoto` | method | Key button: sets the owner's bike lock from a short distance |
| `apps/server/src/BarRoom.ts:1612` | `takeFromGarage` | method | Takes a vehicle out of a garage (no coins) |
| `apps/server/src/BarRoom.ts:1626` | `storeInGarage` | method | Stores a vehicle; far vehicles only with a paid tow |
| `apps/server/src/BarRoom.ts:1657` | `requestTrade` | method | Trade invite between two players (distance, blocks) |
| `apps/server/src/BarRoom.ts:1698` | `offerTrade` | method | Records one side's offer after checking the room's view of their wallet |
| `apps/server/src/BarRoom.ts:1720` | `confirmTrade` | method | Both confirmed: queues the trade commit for the API |
| `apps/server/src/BarRoom.ts:1742` | `sendCommit` | method | Sends the trade commit (saves vehicles first), retries on 5xx |
| `apps/server/src/BarRoom.ts:1799` | `startHighfood` | method | Goes online as a courier; needs a bike or the horse skill |
| `apps/server/src/BarRoom.ts:1825` | `acceptOrder` | method | Accepts a delivery order and spawns the customer NPC |
| `apps/server/src/BarRoom.ts:1859` | `openLocker` | method | Opens the pickup locker screen for the current order |
| `apps/server/src/BarRoom.ts:1869` | `typeLockerCode` | method | Checks the 4-digit locker code |
| `apps/server/src/BarRoom.ts:1920` | `handOverFood` | method | Delivers the bag, announces success, then calls the API for pay |
| `apps/server/src/BarRoom.ts:2018` | `flushHighfood` | method | Maintenance: customer profiles, vehicle saves, unpaid Highfood retries |
| `apps/server/src/BarRoom.ts:2046` | `repairMoto` | method | Repairs one part using a backpack piece |
| `apps/server/src/BarRoom.ts:2134` | `interact` | method | Dispatch for E on any interactable object (seat, counter, door, stage...) |
| `apps/server/src/BarRoom.ts:2227` | `charge` | method | Charges coins through the API; throws if the wallet refuses |
| `apps/server/src/BarRoom.ts:2232` | `refund` | method | Credits coins back through the retry queue |
| `apps/server/src/BarRoom.ts:2256` | `cancelTable` | method | Drops a table order wherever it is and refunds it |
| `apps/server/src/BarRoom.ts:2288` | `serveTables` | method | Tonico's table service and seated customers' consumption |
| `apps/server/src/BarRoom.ts:2314` | `runJobs` | method | Handles job events: pay, deliveries, shift endings |
| `apps/server/src/BarRoom.ts:2363` | `requireAdmin` | method | Role check from the presence ticket, for admin messages |
| `apps/server/src/BarRoom.ts:2369` | `adminSnapshot` | method | Full admin panel state (players, motos, jobs, media, process metrics) |
| `apps/server/src/BarRoom.ts:2401` | `removeInventory` | method | Backpack removal through the API, one operation at a time per player |
| `apps/server/src/BarRoom.ts:2855` | `syncFoosball` | method | Pushes pebolim table snapshots into room state |
| `apps/server/src/BarRoom.ts:3007` | `syncPool` | method | Pushes sinuca views to each audience member by revision |
| `apps/server/src/BarRoom.ts:3073` | `maintenance` | method | 3 s round: session revalidation, controls, flushes, prices, logs, achievements |
| `apps/server/src/BarRoom.ts:3191` | `applyControl` | method | Applies one administrative control (kick, ban, event, prices, sync) |
| `apps/server/src/BarRoom.ts:3210` | `applyAppearance` | method | Applies skin and skill state from an API answer to the avatar |
| `apps/server/src/BarRoom.ts:3258` | `relayVoice` | method | Relays voice packets to listeners in range, per-second limit |
| `apps/server/src/BarRoom.ts:3280` | `relayVideo` | method | Relays a phone-call JPEG frame to the call peer only |
| `apps/server/src/BarRoom.ts:3333` | `log` | method | Console JSON line with pseudonymised ids; queues whitelisted events for the API |
| `apps/server/src/config.ts:59` | `readWorldConfig` | function | Parses and validates the environment; fails with the variable name |
| `apps/server/src/config.ts:57` | `WorldConfigError` | class | Startup configuration failure |
| `apps/server/src/config.ts:32` | `WorldConfig` | interface | Validated world settings (ports, capacities, journals, prices, providers) |
| `apps/server/src/http.ts:10` | `worldRouter` | function | Colyseus router: /health, /ready, /metrics |
| `apps/server/src/index.ts:12` | (top level) | module | Loads env, creates HTTP server and Colyseus server, defines `bar`, listens |
| `apps/server/src/internal.ts:13` | `internal` | function | Calls the internal API with the secret and request id; maps errors |
| `apps/server/src/internal.ts:11` | `InternalApiError` | class | An API error status: 4xx carries the API's message, 5xx does not |
| `apps/server/src/internal.ts:30` | `validateAccess` | function | Session check and account snapshot (balance, skins, inventory, vehicles) |
| `apps/server/src/internal.ts:6` | `Access` | interface | Shape of the API's session answer (not validated at runtime) |
| `apps/server/src/internal.ts:8` | `Control` | interface | An administrative control leased from the API's outbox |
| `apps/server/src/observability.ts:6` | `worldMetrics` | const | Prometheus registry for this process |
| `apps/server/src/observability.ts:12` | `readiness` | function | Room exists, API answered in the last 15 s, outbox writable |
| `apps/server/src/observability.ts:21` | `pseudonym` | function | HMAC of an account id, 12 hex chars, for logs |
| `apps/server/src/observability.ts:24` | `logLine` | function | Builds the JSON log line; hashes `playerId` and `userId` fields |
| `apps/server/src/observability.ts:29` | `internalSecretMatches` | function | Constant-time check of the internal secret header |
| `apps/server/src/state.ts:5` | `Player` | class | Schema for an avatar (position, animation, needs, job, phone, holding) |
| `apps/server/src/state.ts:68` | `Npc` | class | Schema for NPCs (bartender, Tonico, customers, dealer) |
| `apps/server/src/state.ts:86` | `FuelService` | class | Schema for a gas-station service in progress |
| `apps/server/src/state.ts:102` | `ServedItem` | class | Schema for an item on a table top |
| `apps/server/src/state.ts:120` | `CardState` | class | Schema for a blackjack card |
| `apps/server/src/state.ts:125` | `HandState` | class | Schema for a blackjack hand |
| `apps/server/src/state.ts:137` | `SeatState` | class | Schema for a blackjack seat |
| `apps/server/src/state.ts:153` | `TableState` | class | Schema for the blackjack table |
| `apps/server/src/state.ts:170` | `FoosballSlotState` | class | Schema for one pebolim place |
| `apps/server/src/state.ts:185` | `FoosballState` | class | Schema for one pebolim table |
| `apps/server/src/state.ts:216` | `EventState` | class | Schema for the current world event |
| `apps/server/src/state.ts:223` | `MediaEntry` | class | Schema for a queued video |
| `apps/server/src/state.ts:233` | `Jukebox` | class | Schema for a jukebox or TV group, with its queue |
| `apps/server/src/state.ts:252` | `DoorState` | class | Schema for a door's open state |
| `apps/server/src/state.ts:258` | `MusicianSpot` | class | Schema for one stage musician spot |
| `apps/server/src/state.ts:269` | `Moto` | class | Schema for a bike or car (owner, plate, physics, parts, fuel) |
| `apps/server/src/state.ts:324` | `RagdollState` | class | Schema for a thrown body |
| `apps/server/src/state.ts:340` | `StageShowState` | class | Schema for the stage light show |
| `apps/server/src/state.ts:365` | `JobSlotState` | class | Schema for a job's public occupancy |
| `apps/server/src/state.ts:373` | `Environment` | class | Schema for clock and weather |
| `apps/server/src/state.ts:385` | `BarState` | class | Root room state; `players` and `npcs` are per-client views |
| `apps/server/src/world/musicians.ts:12` | `Musicians` | class | Who plays each stage spot and the show phases |
| `apps/server/src/world/musicians.ts:6` | `MusicianEnd` | interface | A show that ended, with its player and spot |
| `apps/server/src/world/served.ts:32` | `layoutSpots` | function | Places ordered items on a table top, clear of each other and the holder |
| `apps/server/src/world/served.ts:67` | `ServedItems` | class | Items on table tops: planning, placing, consumption, collection |
| `apps/server/src/world/served.ts:6` | `Spot` | interface | A place on a table top, with rotation |
| `apps/server/src/world/served.ts:8` | `TablePlan` | interface | Where an order goes and what must be cleared first |

## Conventions observed
- **Naming**: camelCase identifiers; message types are dot-namespaced lowercase (`food.start`, `moto.input`), with exceptions `ping`, `voice`, `chat.send`. Constants UPPER_SNAKE. Mixed PascalCase classes. Portuguese user-facing strings.
- **Error handling**: handler errors are thrown as `Error` with Portuguese text and converted by `handle()` (`BarRoom.ts:976`) into an `error` event `{message}`. Lifecycle hooks use Colyseus `ServerError`. Internal API errors use `InternalApiError` with a 4xx/5xx split (`internal.ts:11`). Coin flows refund on throw by hand (see findings).
- **Logging**: `console.log` of a JSON line with HMAC-pseudonymised `playerId`/`userId` (`observability.ts:24`), plus a whitelisted queue (`WORLD_LOG_EVENTS`) sent to the API every round (`BarRoom.ts:3333`).
- **Async style**: async/await in handlers; fire-and-forget with `void promise.catch(() => {})` in many places (e.g. `BarRoom.ts:1784`, `1811`, `2233`).
- **Type hints**: TypeScript with zod at every WebSocket boundary; the internal API response is a cast, not a parse (`internal.ts:27`). Frequent non-null assertions on Map lookups (e.g. `BarRoom.ts:887`, `1570`, `2584`, `2645`).
- **Validation**: zod for WebSocket messages (`handle()` and `onMessageBytes` handlers); HTTP routes have no inputs.
- **Config**: one zod schema, parsed at startup (`config.ts:14-30`) and again on every internal call (`internal.ts:16`).

## Internal duplication
- Four identical bank constructions: `BarRoom.ts:237-241` (blackjack), `251-255` (truco), `265-269` (pebolim), `283-287` (sinuca).
- Pebolim and sinuca mirror each other: join/leave/near/at/sync/check (`BarRoom.ts:2801-2825` vs `2927-2952`, `2828-2838` vs `2955-2966`, `2841-2845` vs `2969-2973`, `2848-2852` vs `2976-2980`, `2855-2870` vs `3007-3025`, `2873-2880` vs `2983-2990`) and their message blocks (`BarRoom.ts:918-935` vs `936-958`).
- Bike knocked into another bike: `BarRoom.ts:1188-1189` and `1331-1332`.
- `z.object({}).strict()` is written 15 times (e.g. `BarRoom.ts:555`, `681`, `710`, `725`, `747`, `867`, `893`, `908`, `912`, `914`, `924`, `942`), and `{ locked: z.boolean() }` style inline schemas are repeated across handlers.
- `Object.assign(player, standingPosition(player, player.rotation))` appears in at least 8 leave paths.
- Pool and pebolim `watch` and `leave` (`BarRoom.ts:919-924`, `937-942`).

## Cross-segment hints
- Coin charge-and-refund logic (`charge`/`refund`/`cancelTable`/`WalletRetries`) is spread across this file and `world/wallet.ts`; a single owner would prevent the gaps in finding F1-F2.
- `Refueling.busy`, `Refueling.cancel` and `Refueling.request` (`world/refueling.ts`) decide whether a bike can be despawned; their semantics decide F2 and F10.
- The admin control path (`ControlRelay`, `world/relays.ts`) and `applyControl` (`BarRoom.ts:3191`) belong with the admin segment review.
- `index.ts` has no SIGTERM/graceful-shutdown handling (devops segment).
- `Access` (`internal.ts:6`) is also the shape used by `validateAccess` in the API; any change there must be made on both sides.
- `world/musicians.ts` and `world/served.ts` are listed here but sit beside the `world` segment's report; no overlap was found.

## Specialist findings
**Endpoint inventory** is in the subsection below. The HTTP surface is three GET routes. The WebSocket surface is every `handle()` call in `BarRoom.registerMessages`.

### Endpoint inventory
Method `WS` means a Colyseus message. "session" means the handler requires a bound presence (`BarRoom.ts:964-965`); "conscious" means the name is in `NEEDS_CONSCIOUS` (`BarRoom.ts:142`); "admin" means `requireAdmin`; "test" means it is registered only when `NODE_ENV === 'test'`. Rate is messages per second per client, from the `handle()` limit argument.

| Method | Path | File:Line | Auth | Validated | Notes |
|--------|------|-----------|------|-----------|-------|
| GET | /health | `http.ts:12` | none | n/a | Public; returns `roomId` (see F18) |
| GET | /ready | `http.ts:13` | none | n/a | 200 or 503 from `readiness()`; no side effects |
| GET | /metrics | `http.ts:14-15` | `x-internal-secret` | constant-time compare (`observability.ts:29`) | 404 text when the secret does not match |
| WS | voice (bytes) | `BarRoom.ts:511` | session + speaker connected | `decodeVoicePacket` | Per-second window `VOICE.maxPacketsPerSecond` |
| WS | voice.state | `BarRoom.ts:512` | session | `voiceStateSchema` | 4/s |
| WS | phone.call | `BarRoom.ts:517` | session + conscious | `phoneCallSchema` | 2/s |
| WS | phone.video (bytes) | `BarRoom.ts:519` | session | `isJpeg` + `PHONE.videoFrameMaxBytes` | Per-second window `PHONE.videoFps + 4` |
| WS | phone.answer | `BarRoom.ts:520` | session | `phoneCallIdSchema` | 3/s |
| WS | phone.hangup | `BarRoom.ts:524` | session | `phoneCallIdSchema` | 3/s; participant check |
| WS | phone.ping | `BarRoom.ts:530` | session | `phonePingSchema` | 8/s; blocks respected |
| WS | phone.look | `BarRoom.ts:583` | session | inline strict `{on}` | 6/s |
| WS | player.input | `BarRoom.ts:535` | session | `inputSchema` | 55/s; queue of 6 |
| WS | moto.input | `BarRoom.ts:545` | session | `motoInputSchema` | 55/s; queue of 12 |
| WS | moto.mount | `BarRoom.ts:553` | session | `motoMountSchema` | 4/s; conscious checked inside |
| WS | vehicle.control | `BarRoom.ts:554` | session | inline strict enum | 5/s; conscious checked inside |
| WS | fuel.cancel | `BarRoom.ts:555` | session | inline strict `{}` | 2/s |
| WS | moto.tow | `BarRoom.ts:556` | session | inline strict uuid optional | 2/s; NOT conscious-gated (F8); charges coins (F1, F2) |
| WS | moto.lock | `BarRoom.ts:557` | session + conscious | inline strict `{locked}` | 4/s; duplicates `vehicle.control` lock (F9) |
| WS | garage.take | `BarRoom.ts:558` | session + conscious | inline strict | 3/s |
| WS | garage.store | `BarRoom.ts:559` | session + conscious | inline strict | 3/s; charges a tow when far |
| WS | trade.request | `BarRoom.ts:560` | session + conscious | `tradeRequestSchema` | 3/s |
| WS | trade.respond | `BarRoom.ts:561` | session + conscious | `tradeRespondSchema` | 5/s |
| WS | trade.offer | `BarRoom.ts:562` | session | `tradeOfferMessageSchema` | 12/s; conscious not in NEEDS (checked by trade rules) |
| WS | trade.ready | `BarRoom.ts:563` | session + conscious | `tradeReadySchema` | 6/s |
| WS | trade.confirm | `BarRoom.ts:564` | session + conscious | `tradeConfirmSchema` | 6/s |
| WS | trade.cancel | `BarRoom.ts:565` | session | `tradeCancelSchema` | 6/s |
| WS | test.player.place | `BarRoom.ts:567` | test | inline strict | 5/s; teleports the caller |
| WS | test.moto.parts | `BarRoom.ts:572` | test | inline strict | 5/s |
| WS | test.moto.place | `BarRoom.ts:577` | test | inline strict | 5/s |
| WS | food.start | `BarRoom.ts:584` | session + conscious | `foodEmptySchema` | 3/s |
| WS | food.stop | `BarRoom.ts:585` | session | `foodEmptySchema` | 3/s |
| WS | food.state | `BarRoom.ts:586` | session | `foodEmptySchema` | 10/s; same name also used server to client |
| WS | food.accept | `BarRoom.ts:587` | session | `foodOrderSchema` | 5/s; NOT conscious-gated (F8) |
| WS | food.decline | `BarRoom.ts:588` | session | `foodOrderSchema` | 5/s |
| WS | food.cancel | `BarRoom.ts:589` | session | `foodEmptySchema` | 3/s |
| WS | food.locker | `BarRoom.ts:590` | session | `foodEmptySchema` | 4/s |
| WS | food.code | `BarRoom.ts:591` | session | `foodCodeSchema` | 4/s |
| WS | food.unload | `BarRoom.ts:592` | session | `foodEmptySchema` | 4/s |
| WS | food.talk | `BarRoom.ts:593` | session | `foodEmptySchema` | 4/s |
| WS | food.leave | `BarRoom.ts:594` | session | `foodEmptySchema` | 4/s |
| WS | food.deliver | `BarRoom.ts:595` | session | `foodOrderSchema` | 4/s; pays via API (F5) |
| WS | moto.repair | `BarRoom.ts:596` | session + conscious | `motoRepairSchema` | 3/s |
| WS | player.interact | `BarRoom.ts:597` | session + conscious | inline strict + `DRINK_ITEMS` | 5/s; the central E dispatcher |
| WS | inventory.sync | `BarRoom.ts:598` | session | inline strict `{}` | 2/s; reads the API |
| WS | inventory.use | `BarRoom.ts:599` | session + conscious | `ITEM_IDS` enum | 3/s |
| WS | inventory.discard | `BarRoom.ts:600` | session + conscious | enum + quantity 1–10 | 3/s |
| WS | jukebox.command / tv.command | `BarRoom.ts:608` | session + conscious | `jukeboxCommandSchema` | 4/s each; `play` charges coins |
| WS | jukebox.ended / tv.ended | `BarRoom.ts:642` | session | `mediaEndedSchema` | 2/s |
| WS | jukebox.failed / tv.failed | `BarRoom.ts:646` | session | `mediaFailedSchema` | 2/s; refunds |
| WS | jukebox.live / tv.live | `BarRoom.ts:656` | session | `mediaLiveSchema` | 2/s |
| WS | table.order | `BarRoom.ts:662` | session + conscious | `tableOrderSchema` | 2/s; charges coins |
| WS | table.cancel | `BarRoom.ts:710` | session | inline strict `{}` | 2/s; refunds |
| WS | stage.buy | `BarRoom.ts:681` | session + conscious | inline strict `{}` | 2/s; `stageBusy` guard |
| WS | show.set | `BarRoom.ts:700` | session + conscious | `showPatchSchema` | 12/s; light desk only |
| WS | show.cue | `BarRoom.ts:704` | session + conscious | `showCueSchema` | 3/s; light desk only |
| WS | job.start | `BarRoom.ts:716` | session + conscious | inline strict `jobId` | 2/s; `jobId` not an enum (F13) |
| WS | job.stop | `BarRoom.ts:725` | session | inline strict `{}` | 2/s |
| WS | job.work | `BarRoom.ts:729` | session + conscious | inline strict `{}` | 3/s |
| WS | chat.send | `BarRoom.ts:874` | session | inline strict `text` 1–280 | 3/s; control chars replaced |
| WS | player.emote | `BarRoom.ts:803` | session + conscious | inline strict enum | 4/s |
| WS | player.skill | `BarRoom.ts:835` | session | inline strict `skill` | 4/s; conscious checked inside (839) |
| WS | player.skin | `BarRoom.ts:860` | session + conscious | `skinMessageSchema` | 2/s; reads API |
| WS | player.appearance | `BarRoom.ts:867` | session + conscious | inline strict `{}` | 2/s; reads API |
| WS | ping | `BarRoom.ts:959` | session | inline strict `at` | 3/s; answers `pong` |
| WS | blackjack.join | `BarRoom.ts:892` | session + conscious | inline strict literal | 3/s |
| WS | blackjack.leave | `BarRoom.ts:893` | session | inline strict `{}` | 3/s |
| WS | blackjack.bet | `BarRoom.ts:895` | session + conscious | `blackjackBetSchema` | 4/s; cached balance pre-check |
| WS | blackjack.action | `BarRoom.ts:900` | session + conscious | `blackjackActionSchema` | 4/s |
| WS | blackjack.insurance | `BarRoom.ts:903` | session + conscious | `blackjackInsuranceSchema` | 2/s |
| WS | truco.join | `BarRoom.ts:907` | session + conscious | `trucoJoinSchema` | 3/s |
| WS | truco.leave | `BarRoom.ts:908` | session | inline strict `{}` | 3/s |
| WS | truco.seat | `BarRoom.ts:909` | session + conscious | `trucoSeatSchema` | 4/s |
| WS | truco.config | `BarRoom.ts:910` | session + conscious | `trucoConfigSchema` | 8/s |
| WS | truco.ready | `BarRoom.ts:911` | session + conscious | `trucoReadySchema` | 3/s |
| WS | truco.again | `BarRoom.ts:912` | session + conscious | inline strict `{}` | 3/s |
| WS | truco.play | `BarRoom.ts:913` | session + conscious | `trucoPlaySchema` | 6/s |
| WS | truco.call | `BarRoom.ts:914` | session + conscious | inline strict `{}` | 4/s |
| WS | truco.answer | `BarRoom.ts:915` | session + conscious | `trucoAnswerSchema` | 4/s |
| WS | truco.eleven | `BarRoom.ts:916` | session + conscious | `trucoElevenSchema` | 4/s |
| WS | truco.signal | `BarRoom.ts:917` | session + conscious | `trucoSignalSchema` | 6/s |
| WS | foosball.join | `BarRoom.ts:918` | session + conscious | `foosballJoinSchema` | 3/s |
| WS | foosball.watch | `BarRoom.ts:919` | session | `foosballWatchSchema` | 3/s |
| WS | foosball.leave | `BarRoom.ts:924` | session | inline strict `{}` | 3/s |
| WS | foosball.slot | `BarRoom.ts:925` | session + conscious | `foosballSlotSchema` | 4/s |
| WS | foosball.config | `BarRoom.ts:926` | session + conscious | `foosballConfigSchema` | 8/s |
| WS | foosball.cpu | `BarRoom.ts:927` | session + conscious | `foosballCpuSchema` | 4/s |
| WS | foosball.ready | `BarRoom.ts:928` | session + conscious | `foosballReadySchema` | 4/s; balance pre-check |
| WS | foosball.input | `BarRoom.ts:934` | session | `foosballInputSchema` | 45/s |
| WS | foosball.kick | `BarRoom.ts:935` | session | `foosballKickSchema` | 10/s |
| WS | pool.join | `BarRoom.ts:936` | session + conscious | `poolJoinSchema` | 3/s |
| WS | pool.watch | `BarRoom.ts:937` | session | `poolWatchSchema` | 3/s |
| WS | pool.leave | `BarRoom.ts:942` | session | inline strict `{}` | 3/s |
| WS | pool.seat | `BarRoom.ts:943` | session + conscious | `poolSeatSchema` | 4/s |
| WS | pool.config | `BarRoom.ts:944` | session + conscious | `poolConfigSchema` | 8/s |
| WS | pool.cpu | `BarRoom.ts:945` | session + conscious | `poolCpuSchema` | 4/s |
| WS | pool.ready | `BarRoom.ts:946` | session + conscious | `poolReadySchema` | 4/s; balance pre-check |
| WS | pool.choice | `BarRoom.ts:952` | session + conscious | `poolChoiceSchema` | 4/s |
| WS | pool.shot | `BarRoom.ts:953` | session + conscious | `poolShotSchema` | 4/s |
| WS | pool.aim | `BarRoom.ts:955` | session | `poolAimSchema` | 14/s |
| WS | admin.world | `BarRoom.ts:747` | admin | inline strict `{}` | 2/s |
| WS | admin.environment | `BarRoom.ts:748` | admin | `environmentPatchSchema` | 4/s |
| WS | admin.performance | `BarRoom.ts:754` | admin | inline strict `{}` | 1/s |
| WS | admin.job | `BarRoom.ts:759` | admin | inline strict; `jobId` free text | 5/s; F13 |
| WS | admin.table | `BarRoom.ts:766` | admin | inline strict | 5/s; refunds |
| WS | admin.media | `BarRoom.ts:770` | admin | inline strict enum kind | 5/s; refunds queued videos |
| WS | admin.moto.spawn | `BarRoom.ts:779` | admin | `motoSpawnSchema` | 5/s |
| WS | admin.moto.despawn | `BarRoom.ts:789` | admin | `motoDespawnSchema` | 5/s |
| WS | admin.bots | `BarRoom.ts:797` | admin | inline strict count 0–128 | 3/s |

Message count: 105 `handle`/`onMessageBytes` call sites at `BarRoom.ts:511-959`, expanding to about 110 message names (the jukebox/TV loop at `606-660` registers 8 names). The "admin" and "test" rows are the only ones the rest of the file gates by role or environment.

### Auth posture
- All WebSocket messages except `voice` and `phone.video` need a bound presence and a connected avatar (`BarRoom.ts:964-965`). The two byte handlers check the presence and the connection inside `relayVoice` and `relayVideo`.
- Admin messages (9) all call `requireAdmin` (`BarRoom.ts:2363`). The role comes from the ticket, refreshed each maintenance round (`BarRoom.ts:3084`).
- The HTTP surface has no mutating routes; `/metrics` is the only protected one.
- The only fully unauthenticated routes are `/health` and `/ready`.

### Findings

- **F1 (medium)** `BarRoom.ts:1566-1579` — towOwnMoto has no in-flight guard around its charge. The pre-checks at `1566-1572` run before `await changeWallet` at `1575`. A second tow sent while the first awaits passes the same checks, charges again, and at `1578-1579` despawns the bike the first call just placed. Result: two charges, one bike, no refund. Compare `stageBusy` (`BarRoom.ts:683`, `686`, `693`) and `inventoryBusy` (`2402`), which exist for the same reason. `moto.tow` allows 2/s (`556`), so a double click reaches it.

- **F2 (medium)** `BarRoom.ts:1574-1579` with `2103` — the tow charges coins and only then calls `despawnMoto`, which throws `Aguarde o frentista...` when `refueling.busy(id)` (`2103`). towOwnMoto never checks `refueling.busy` (compare `storeInGarage` at `1630` and `controlVehicle` at `1451`). A bike at a pump: the coins are taken, the rider is already ejected by `freeMoto` at `1579`, the error is sent, and the charge is not refunded.

- **F3 (medium)** `BarRoom.ts:218`, `1939`, `2027-2037` — Highfood payments and loss records are held only in `this.unpaid`, an in-memory array with no size cap. The results (`ResultRelay`) and the game banks use `FileOutbox`, which survives a crash (`189`, `237`, `265`). After 200 failed rounds an entry is dropped with only a log line (`2034-2035`), and a world restart loses every entry. The delivery pay is therefore not durable, unlike the rest of the money paths.

- **F4 (medium)** `BarRoom.ts:2019-2026` — `flushHighfood` fetches customer profiles with an unguarded `await internal(...)` before the vehicle save (`2025-2026`) and the unpaid retries (`2027`). While `highfood/customers` fails (it is retried every maintenance round, since `customersAt` is set only on success), vehicle persistence and pay retries never run. An optional read blocks mandatory writes.

- **F5 (medium)** `BarRoom.ts:1934-1939` — `food.delivered` is sent to the player (`1934`) and the order is closed (`1930`) before the API has answered. On a 4xx answer the handler returns silently (`1938`): no receipt, no `food.notice`, no retry. The player has been told the delivery is done and is not paid. The 5xx path is retried (`1939`).

- **F6 (low)** `BarRoom.ts:346`, `351` — `onAuth` does `z.object(...).parse(options)` without mapping the error, so a malformed payload throws a `ZodError` instead of a `ServerError(401)` like the ticket branch (`348`). `validateAccess` failures at `351` (API down, 5xx) also surface as plain `Error`s, whose text (`API interna indisponível (503).`) goes to the client. Confirm the close code Colyseus sends for a plain `Error` from `onAuth`.

- **F7 (low)** `BarRoom.ts:974-976` — `handle()` sends `e.message` for every thrown error. That includes programming errors (`TypeError`s from unguarded `!` assertions) as well as refusals, and it counts both as `rejected('refused')` (`976`). Non-refusal errors should be logged with a generic client message.

- **F8 (low)** `BarRoom.ts:142`, `556`, `587`, `1560`, `1825` — `moto.tow` and `food.accept` are not in `NEEDS_CONSCIOUS`, and `towOwnMoto` (`1560-1573`) and `acceptOrder` (`1825-1830`) do not call `isConscious`. A fainted player can summon a paid tow and accept a delivery, while `moto.lock`, `garage.take` and `garage.store` (in the set) are refused. The gate is a hand-kept set, so each new message needs to be added by hand.

- **F9 (low)** `BarRoom.ts:557` (`lockMoto`, `1588-1595`) and `1453` (`controlVehicle` action `lock`) — two entry points set the same `locked` flag with different reach rules. `controlVehicle` lets the current rider toggle it on any vehicle (`1452`), so a non-owner rider can change the lock on an owned bike. Both send `moto.locked`. Keep one.

- **F10 (low, cross-check)** `BarRoom.ts:1992`, `2103` — `stepHighfood` despawns an absent owner's bike inside the fixed-step tick. If `refueling.busy(moto.id)` is still true (its state lives in `world/refueling.ts`, not in this segment), `despawnMoto` throws from `step()`, and the throw repeats every tick until the refuel clears. Verify `Refueling.busy` after `cancel` on leave (`449`).

- **F11 (low)** `BarRoom.ts:3076-3103` — the maintenance round is one serial `try`. A throw in `results.flush` (`3092`), `blackjackBank.flush` (`3093`), `foosballBank.flush` (`3094`), `trucoBank.flush` (`3095`), `poolBank.flush` (`3096`), `walletRetries.flush` (`3097`) or `refueling.recover` (`3098`) skips prices, Highfood, logs and achievements for that round. Only the Highfood step has its own `.catch` (`3101`).

- **F12 (low)** Response shape drift for user-facing notices. Text is sent as `text` in `trade.notice` (`1670`, `1686`, `1731`), `food.notice` (`1823`, `1959`, `1965`, `1975`) and `chat.message`; as `message` in `error` (`3251`), `trade.closed` (`1681`, `1723`, `1728`, `1761`), `job.state` (`2266`, `2339`, `2357`), and `table.state` (`2271`, `2302`). Same kind of payload, two keys.

- **F13 (low)** `BarRoom.ts:759-762` — `admin.job` takes `jobId` as free text (`z.string().max(32)`), not an enum. `endShiftOf` runs (`761`) before `jobs.configure` (`762`), so an unknown job id can end a shift and then fail.

- **F14 (low)** `config.ts:29`, `82` — `MEDIA_PROVIDERS` is split and trimmed but not checked against `MEDIA_PLATFORMS`. A typo (`youtub`) silently disables YouTube, and an unknown name is accepted. Validate against the known keys at startup.

- **F15 (low)** `internal.ts:16` and `observability.ts:21` — `readWorldConfig()` (a zod parse plus both secret checks) runs on every internal call, and `internalSecret()` on every log line. Read the config once at module load, as `BarRoom` already does (`152`).

- **F16 (low)** `internal.ts:23-26` — on a 5xx response the body is never read or cancelled (`refusal` is read only for `< 500`). Under sustained 5xx, unread bodies can hold keep-alive sockets. Cancel or consume the body on every path.

- **F17 (low)** `internal.ts:27`, `BarRoom.ts:3079-3083` — internal responses are cast, not parsed, so a 200 with an unexpected shape is accepted. In maintenance, `!access.valid` expels the player (`3083`). A shape drift in the API expels everyone online in one round. Parse with a schema on the world side, as the config is parsed.

- **F18 (low)** `http.ts:12` — `/health` returns `roomId` to anyone. Room ids are used to join by id, and the join still needs a ticket (`onAuth`), so impact is small. Remove it or keep it behind the secret.

- **F19 (low, decision)** `BarRoom.ts:370` (`Player.id = auth.userId`), `state.ts:246` (`Jukebox.by`), `state.ts:138` (`SeatState.playerId`), `state.ts:286` (`Moto.ownerId`) — the raw account id is in the public room state, sent to every client that can see the object (`motos`, `tables`, `jukeboxes` are not per-client views). The logs are pseudonymised (`observability.ts:21-25`), the state is not. Clients need ids for trade and call actions, so this may be intended; record the decision.

- **F20 (low)** `BarRoom.ts:566-577` — the `test.*` handlers are registered when `NODE_ENV === 'test'`. `test.player.place` teleports any caller. Fine in tests, but a deployed environment with `NODE_ENV=test` would expose it. Add a second guard, such as a build flag or the test port.

### Endpoint-level checks
- No GET has a side effect. `/ready` and `/health` are read-only.
- Pagination: none. Lists in state are bounded: served items (`served.ts:23`, `MAX_ITEMS = 96`), worker orders (`MAX_WORKER_ORDERS`), queue (`TABLE_QUEUE_MAX`), bike count (`MOTO.LIMIT`). The admin snapshot is not bounded beyond capacity (`BarRoom.ts:2369`).
- Error envelope: `error` events `{message}` are the majority (`BarRoom.ts:973`, `976`). Outliers: `ServerError(503, 'BAR_FULL: ...')` (`302`), the `401` texts in `onAuth` (`348`, `352`), `moderation.removed` `{kind, reason}` (`3245`), and `leave(4000)` close codes (`415`, `423`, `504`).
- No versioning on the WebSocket messages or HTTP routes. The internal API is shared with `apps/api`, so renaming a message is a two-sided change.
- Status codes: `/metrics` returns 404 for a bad secret (`http.ts:15`), which hides the route. `/ready` uses 503 correctly.

### Concerns / smells
1. `BarRoom.ts` is 3341 lines in one class covering about 110 messages, every economy flow, the physics for bikes and cars, four minigames, Highfood, jobs and admin. Its size makes the coin paths (F1, F2, F5) hard to audit together.
2. The coin paths charge first and refund by hand: tow (`1575`), store (`1636`), table order (`669`), counter (`2192`), stage (`688`). Each has its own refund branch, and the tow's is missing (F1, F2).
3. Durability is inconsistent: results and banks use `FileOutbox`, Highfood pay and loss records do not (F3).
4. The conscious gate is a hand-maintained set (`142`), so new messages default to ungated (F8).
5. Internal and error text reaches clients raw (F6, F7), and internal responses are trusted by cast (F17).

### Refactor suggestions
1. **`BarRoom.ts:1560-1582`, `1634-1644`, `2191-2197`, `668-674`, `685-693`** — Extract `withCharge(presence, amount, reason, requestId, action)` with a per-presence in-flight flag and refund-on-throw. Use it for tow, store, counter, table order and stage pass. This fixes F1 and F2 at once.
2. **`BarRoom.ts:218`, `1939`, `2027-2037`** — Put Highfood pay and loss records in a `FileOutbox`, the way `ResultRelay` is (`189`). Cap it and log abandonment as a count. This fixes F3.
3. **`BarRoom.ts:2019-2026`** — Wrap the customer-profile read in its own `try` (or move it to a separate timer), so vehicles and unpaid pay are always attempted. This fixes F4.
4. **`BarRoom.ts:142`, `962-978`** — Move the conscious gate into `handle()` options (`{ conscious: true }`) so each message declares it. Remove the set. This fixes F8.
5. **`BarRoom.ts` (15 `z.object({}).strict()` sites), `1670`/`1681` etc.** — Export `emptyBody` and one `notice` payload shape `{ message }` from `packages/shared`, and use them in the handlers. Fixes F12 and the duplication above.
