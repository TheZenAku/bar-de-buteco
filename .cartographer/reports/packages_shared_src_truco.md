# Segment: packages/shared/src/truco

**Reviewed by:** realtime-streaming-reviewer

**Scope note:** the dispatched file list covers all of `packages/shared/src` (46 files), not only `truco/`. All 46 were read. No socket, `ws`, `io.emit`, or pub/sub code exists in this package: it is pure rules, state, zod message schemas, and frame encoders. Realtime concerns are therefore about the message contracts and the state the room sends, and are marked "verify on server" where the enforcing code is outside this segment.

## Files reviewed
- `packages/shared/src/admin.ts`
- `packages/shared/src/blackjack.ts`
- `packages/shared/src/car-dynamics.ts`
- `packages/shared/src/car-parts.ts`
- `packages/shared/src/city.ts`
- `packages/shared/src/doors.ts`
- `packages/shared/src/economy.ts`
- `packages/shared/src/foosball.ts`
- `packages/shared/src/garage.ts`
- `packages/shared/src/gps.ts`
- `packages/shared/src/head-look.ts`
- `packages/shared/src/highfood.ts`
- `packages/shared/src/horse.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/inventory.ts`
- `packages/shared/src/jukebox.ts`
- `packages/shared/src/kick-paths.ts`
- `packages/shared/src/kick.ts`
- `packages/shared/src/media-links.ts`
- `packages/shared/src/moto-crash.ts`
- `packages/shared/src/moto-parts.ts`
- `packages/shared/src/moto.ts`
- `packages/shared/src/musicians.ts`
- `packages/shared/src/needs.ts`
- `packages/shared/src/performance.ts`
- `packages/shared/src/phone.ts`
- `packages/shared/src/prices.ts`
- `packages/shared/src/profile.ts`
- `packages/shared/src/ragdoll.ts`
- `packages/shared/src/rarity.ts`
- `packages/shared/src/refueling.ts`
- `packages/shared/src/skins.ts`
- `packages/shared/src/trade.ts`
- `packages/shared/src/truco/ai.ts`
- `packages/shared/src/truco/betting.ts`
- `packages/shared/src/truco/cards.ts`
- `packages/shared/src/truco/game.ts`
- `packages/shared/src/truco/index.ts`
- `packages/shared/src/truco/scoring.ts`
- `packages/shared/src/truco/stakes.ts`
- `packages/shared/src/vehicle-actions.ts`
- `packages/shared/src/vehicle-controls.ts`
- `packages/shared/src/vehicle-models.ts`
- `packages/shared/src/vehicle-parts.ts`
- `packages/shared/src/voice.ts`
- `packages/shared/src/world.ts`

## Integrations
- websocket (message schemas and frame formats only; the socket code lives in the room and clients)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `packages/shared/src/index.ts` | `inputSchema` | zod schema | Per-tick player input: seq, dx/dz, running, rotation, head look |
| `packages/shared/src/index.ts` | `TICK_MS`, `PATCH_MS`, `AOI_RADIUS`, `CHAT_RADIUS` | const | Tick 50 ms, patch 100 ms, area of interest 18 m, chat radius 12 m |
| `packages/shared/src/index.ts` | `WorldState` | interface | Full room state sent to clients (players, npcs, tables, media, motos) |
| `packages/shared/src/index.ts` | `TrucoView` | interface | Per-seat truco view; room sends it to that player alone (comment) |
| `packages/shared/src/index.ts` | `ChatMessage` | interface | Chat line: id, sender, text, sentAt |
| `packages/shared/src/truco/index.ts` | `trucoJoinSchema` ... `trucoSignalSchema` | zod schemas | Truco room messages (join, seat, config, ready, play, answer, eleven, signal) |
| `packages/shared/src/truco/game.ts` | `TrucoGame` | class | One match's rules: no clock, no sockets; `advance()` moves timed phases |
| `packages/shared/src/truco/game.ts` | `TrucoGame.advance` | method | Moves one timed moment on; caller supplies the timing |
| `packages/shared/src/truco/game.ts` | `TrucoGame.signal` | method | Records a face shown to the table; no rate limit |
| `packages/shared/src/truco/game.ts` | `TrucoGame.observe` | method | Per-seat observation; masks hidden cards and copies signals and events |
| `packages/shared/src/truco/game.ts` | `TRUCO` | const | Timing constants: turn 25 s, answer 20 s, deal/trick/hand pauses, signal cooldown |
| `packages/shared/src/truco/ai.ts` | `trucoDecide` | function | NPC decision from its own observation only |
| `packages/shared/src/truco/ai.ts` | `trucoSignalChoice` | function | NPC chooses a face to show its partner |
| `packages/shared/src/truco/ai.ts` | `trucoLine` | function | NPC table talk, by personality and moment |
| `packages/shared/src/truco/cards.ts` | `cardStrength` | function | Strength of a card for a given vira; manilhas above all ranks |
| `packages/shared/src/truco/cards.ts` | `provenWin` | function | Whether a set of cards wins the hand whatever the opponents hold |
| `packages/shared/src/truco/betting.ts` | `nextCall`, `mayRaise` | function | Next call step and the score limit that blocks raises |
| `packages/shared/src/truco/scoring.ts` | `handWinner` | function | Hand winner from up to three trick outcomes |
| `packages/shared/src/truco/scoring.ts` | `tieRuling` | function | Points and team when three tricks tie |
| `packages/shared/src/truco/stakes.ts` | `trucoStakes` | function | Stake levels and limits from the price table |
| `packages/shared/src/blackjack.ts` | `blackjackBetSchema` | zod schema | Bet amount only (no round token) |
| `packages/shared/src/blackjack.ts` | `blackjackActionSchema` | zod schema | Action with `hand` and `move` tokens |
| `packages/shared/src/blackjack.ts` | `blackjackInsuranceSchema` | zod schema | Insurance take/decline only (no round token) |
| `packages/shared/src/blackjack.ts` | `BLACKJACK` | const | Bet, insurance, turn and deal timing constants |
| `packages/shared/src/blackjack.ts` | `betLimits` | function | Blackjack min and max bet from the price table |
| `packages/shared/src/foosball.ts` | `foosballJoinSchema` ... `foosballKickSchema` | zod schemas | Pebolim room messages; the player comes from the session (comment) |
| `packages/shared/src/foosball.ts` | `FoosballFrame` | interface | 30 Hz frame: ball, rods, sounds; `encodeFrame` / `decodeFrame` |
| `packages/shared/src/foosball.ts` | `stepSim` | function | One physics tick, shared by room and browsers |
| `packages/shared/src/foosball.ts` | `FOOSBALL` | const | Physics, tick rate, frame cadence, phase timers |
| `packages/shared/src/foosball.ts` | `foosballBetLimits` | function | Pebolim min and max bet from the price table |
| `packages/shared/src/jukebox.ts` | `jukeboxCommandSchema` | zod schema | play / pause / resume / skip / seek / remove, with revision (CAS) |
| `packages/shared/src/jukebox.ts` | `mediaEndedSchema`, `mediaFailedSchema`, `mediaLiveSchema` | zod schemas | Player reports: ended, refused, live edge |
| `packages/shared/src/jukebox.ts` | `commandJukebox` | function | Applies a command with revision check, queue limits, control rules |
| `packages/shared/src/jukebox.ts` | `endMedia`, `failMedia`, `liveMedia` | function | Apply player reports to the shared timeline |
| `packages/shared/src/jukebox.ts` | `JukeboxState`, `MediaQueueEntry` | interface | Shared playback state sent to every client |
| `packages/shared/src/jukebox.ts` | `areaMix` | function | Bar vs stage audio crossfade |
| `packages/shared/src/phone.ts` | `phoneCallSchema`, `phoneCallIdSchema`, `phonePingSchema` | zod schemas | Call, call id and "something new" ping messages |
| `packages/shared/src/phone.ts` | `PHONE` | const | Phone limits, including video frame size (8 kB socket note) |
| `packages/shared/src/phone.ts` | `isJpeg` | function | Checks only the JPEG start marker of a video frame |
| `packages/shared/src/phone.ts` | `PhoneCallView` | interface | Call state sent to both sides |
| `packages/shared/src/voice.ts` | `encodeVoicePacket`, `decodeVoicePacket` | function | Client voice packet framing with length and frame-count bounds |
| `packages/shared/src/voice.ts` | `wrapVoice`, `unwrapVoice` | function | Server-to-client frame: speaker id prefix |
| `packages/shared/src/voice.ts` | `VOICE` | const | Voice distances, packet size and packets-per-second limit |
| `packages/shared/src/highfood.ts` | `foodOrderSchema`, `foodEmptySchema`, `foodCodeSchema` | zod schemas | Courier messages: order id, empty, four-digit pickup code |
| `packages/shared/src/highfood.ts` | `highfoodCompleteSchema`, `highfoodCancelSchema` | zod schemas | Room-to-API payloads for a delivery's end |
| `packages/shared/src/highfood.ts` | `HighfoodState` | interface | Courier's shift state sent to the courier |
| `packages/shared/src/trade.ts` | `tradeRequestSchema` ... `tradeCancelSchema` | zod schemas | Trade messages with invite id, trade id and version tokens |
| `packages/shared/src/trade.ts` | `tradeCommitSchema` | zod schema | Room-to-API atomic trade payload, idempotent by id |
| `packages/shared/src/trade.ts` | `TRADE` | const | Reach, invite, idle, review and retry timings |
| `packages/shared/src/moto.ts` | `motoInputSchema`, `motoMountSchema`, `motoSpawnSchema`, `motoDespawnSchema` | zod schemas | Rider input and bike mount, spawn and despawn messages |
| `packages/shared/src/moto.ts` | `stepMoto`, `advanceMoto` | function | Bike step, shared by room and rider prediction |
| `packages/shared/src/moto.ts` | `MotoState` | interface | Bike state sent to everyone (ownerId, ownerName, vehicleId, plate) |
| `packages/shared/src/moto-parts.ts` | `motoRepairSchema` | zod schema | Repair request: bike id and part |
| `packages/shared/src/moto-crash.ts` | `stepLoose`, `stepWreck` | function | Unridden bike and wreck steps, run by the room |
| `packages/shared/src/ragdoll.ts` | `Ragdoll` | class | Seeded, deterministic body sim; room and browsers run the same steps |
| `packages/shared/src/ragdoll.ts` | `RagdollStart` | interface | Start of a crash body: position, velocity, seed |
| `packages/shared/src/kick.ts` | `kickTouches` | function | Whether a leg touched a body between two clip moments (ms) |
| `packages/shared/src/kick.ts` | `KICKS`, `KICK` | const | Kick damage, sweep step and grace time |
| `packages/shared/src/kick-paths.ts` | `KICK_PATHS` | const | Generated foot and hip paths per kick clip |
| `packages/shared/src/profile.ts` | `profileStatusSchema`, `profileBadgesSchema`, `profileSkillSchema`, `badgeSchema` | zod schemas | Profile edit messages |
| `packages/shared/src/skins.ts` | `skinMessageSchema`, `skillPurchaseSchema`, `catalogEntrySchema` | zod schemas | Skin choice, skill purchase, admin catalog entry |
| `packages/shared/src/economy.ts` | `walletChangeSchema`, `tableOrderSchema` | zod schemas | Wallet change from API; table order from a player |
| `packages/shared/src/needs.ts` | `tickNeeds` | function | Advances needs by time; `random` injected |
| `packages/shared/src/musicians.ts` | `musicianPhase` | function | Current stage phase from the synced start time |
| `packages/shared/src/car-parts.ts` | `readCarParts`, `writeCarParts` | function | Parse and write car condition strings |
| `packages/shared/src/moto-parts.ts` | `readMotoParts`, `writeMotoParts` | function | Parse and write bike condition strings |
| `packages/shared/src/media-links.ts` | `parseMediaLink` | function | Link to provider and id, or a reason it cannot play |
| `packages/shared/src/media-links.ts` | `fileLink` | function | Accepts any public https host as a direct file |
| `packages/shared/src/gps.ts` | `gpsRoute`, `nearestPickup` | function | Route along the street grid, A* |
| `packages/shared/src/admin.ts` | `WORLD_LOG_EVENTS`, `ledgerText` | const, function | Log event sentences and ledger wording |
| `packages/shared/src/prices.ts` | `sanitizePrices` | function | Clamps a received price table to known keys and ranges |
| `packages/shared/src/performance.ts` | `ServerPerformance` | interface | Server tick and loop diagnostics |

## Conventions observed
- **Naming**: camelCase for functions and values; UPPER_SNAKE for constant objects (`TRUCO`, `BLACKJACK`, `MOTO`); PascalCase for types and classes; domain terms in Portuguese (`mao`, `mesa`, `vaza`) mixed with English code words.
- **Error handling**: mixed. Game and room rules throw `Error` with Portuguese messages (`truco/game.ts:134`, `jukebox.ts:118`). Parsers return `undefined` (`voice.ts:33`) or `{error}` unions (`media-links.ts:125`). Schemas use `safeParse` (`highfood.ts:127`).
- **Logging**: none in this package.
- **Async style**: none. All functions are synchronous and pure, except classes with mutable state.
- **Type hints**: fully typed TypeScript with `as const` objects and zod-inferred types. Heavy non-null `!` use on indexed reads.
- **Validation**: zod `.strict()` on every message schema, with length, range and enum bounds.

## Internal duplication
- `clamp` / `clampTo` repeated: `car-dynamics.ts:5`, `moto.ts:72`, `foosball.ts:99`, `head-look.ts:5`.
- `heading` normalisation repeated: `horse.ts:7` and `head-look.ts:7`.
- Bet-limit helpers with the same shape: `blackjack.ts:74-77`, `foosball.ts:368-371`, `truco/stakes.ts:17-22`.
- Car and bike condition read/write pairs with the same logic: `car-parts.ts:28-32` and `moto-parts.ts:28-32`.
- Two ledger-to-sentence functions with overlapping cases and different wording: `phone.ts:81-103` (`ledgerLabel`) and `admin.ts:118-147` (`ledgerText`).

## Cross-segment hints
- `index.ts:88`: `PublicUser` carries `email`. Keep it out of anything the room broadcasts (auth/PII segment).
- `moto.ts:53` and `index.ts:136`: `MotoState` exposes `ownerId`, `ownerName`, `vehicleId` to every client ("seen from anywhere"). Auth/data segment to confirm this is intended.
- `media-links.ts:68-77`: `fileLink` allows any public https host, and each listener's browser fetches it. IP exposure and tracking risk (security segment).
- `highfood.ts:172`: four-digit pickup code, 10,000 values. Attempt limiting must live on the server (backend/security).
- `packages/shared/src/tickets.ts` exists in the same package but is not in this file list. Not reviewed here.
- Price-table lookups for bet limits and stakes (`blackjack.ts:74`, `foosball.ts:368`, `truco/stakes.ts:17`) belong to the economy segment.

## Specialist findings

### Channel inventory
| Channel/Event | File:Line | Subscribe scope | Publish scope | Auth check | Notes |
|---------------|-----------|------------------|---------------|------------|-------|
| `truco` join, seat, config, ready | `truco/index.ts:16-19` | lobby members (room) | client to room | session (room, not in segment) | Schema only; `ready` has no token |
| `truco` play | `truco/index.ts:20` | seat only (`index.ts:46-49`) | client to room | turn check in `game.ts:134` | Card id encodes hand number (`game.ts:97`), so stale plays are rejected |
| `truco` answer | `truco/index.ts:21` | seat only | client to room | `to` must match open bet (`game.ts:208`) | Good: stale answer token |
| `truco` eleven, signal | `truco/index.ts:22-23` | table (signal) / seat (eleven) | client to room | `game.ts:230`, `game.ts:249` | `signal` has no cooldown here (finding 1) |
| `TrucoView` | `index.ts:50-69` | one seat | room to client | per-seat `observe` (`game.ts:257`) | Hidden cards masked (`game.ts:255`) |
| `jukebox` command | `jukebox.ts:87-95` | all clients (`JukeboxState`) | client to room | revision CAS (`jukebox.ts:133`), control rule (`:135`) | Good: CAS on playback |
| `media` ended / failed / live | `jukebox.ts:148-152` | all clients | client to room | `mediaReporter` (`:156`) | Duration self-reported (finding 4) |
| `phone` call, call id, ping | `phone.ts:39-43` | both call sides; ping to peer | client to room | room (not in segment) | Pings only say "something new" (`phone.ts:44`) |
| `phone` video frame | `phone.ts:23-24`, `:36` | call peer | room relay | room | 7,600 bytes against 8 kB (finding 5) |
| voice packet | `voice.ts:24`, `:32` | listeners within 15 m | client to room, relayed | room | Bounds checked; rate limit constant only (finding 6) |
| `foosball` join, config, ready, cpu, kick | `foosball.ts:375-385` | table watchers | client to room | player from session (comment, `:373`) | No revision token on ready and kick |
| `foosball` input | `foosball.ts:383` | none | client to room, 30 Hz | session | Latest-wins, no seq |
| `foosball` frame | `foosball.ts:302-316` | table watchers | room to client, 30 Hz | room | Sounds capped at 6 per frame (`:307`) |
| `blackjack` bet | `blackjack.ts:88` | table seats | client to room | room (not in segment) | No round or move token (finding 3) |
| `blackjack` action | `blackjack.ts:89` | table seats | client to room | `hand` and `move` tokens | Good: rejects a repeat or stale click |
| `blackjack` insurance | `blackjack.ts:90` | table seats | client to room | room | No round token (finding 3) |
| `highfood` order, empty, code | `highfood.ts:170-172` | courier | client to room | courier session (room) | Four-digit code, no attempt limit here |
| `trade` request, respond, offer, ready, confirm, cancel | `trade.ts:56-61` | the two traders | client to room | session (room) | Version tokens on ready and confirm |
| `trade` view | `trade.ts:51` | each trader | room to client | room | Good: versioned view |
| `moto` input | `moto.ts:58` | none | client to room | rider (room) | Seq-less; deterministic step |
| `moto` mount, spawn, despawn | `moto.ts:59-70` | all | client to room | admin for spawn (room) | Spawn/despawn are admin-only per comments |
| `state` WorldState | `index.ts:127-139` | all clients | room to client | none | Full world per patch; AOI constant `index.ts:55` |
| `inputSchema` | `index.ts:87` | none | client to room | session | Has seq; bounds checked |
| `profile`, `skin`, `badge` | `profile.ts:65-69`, `skins.ts:39`, `:60`, `:72` | owner | client to API | session (API) | HTTP-style payloads, not socket |

### Findings
- **[med] Truco signals have no rate limit in this package.** `truco/game.ts:248-251` pushes every signal with no check. `TRUCO.signalCooldownMs` (`game.ts:14`) is declared but never read in the package. The array only resets per hand (`game.ts:85`), and `observe()` copies it on every call (`game.ts:263`). A client can grow it without bound inside one hand. Fix: pass `now` into `signal()` and enforce the cooldown per seat, or cap the list. Verify whether the room enforces the cooldown before calling.
- **[med] `advance()` is not tied to a moment.** `truco/game.ts:107-125` advances one phase per call with no token. `timed` (`game.ts:127`) only tells the caller a timer is needed. A stale or duplicate timer advances `shuffling`, `dealing`, `trick-end` or `hand-end` early, which cuts the deal, trick and result pauses (`TRUCO`, `game.ts:8-16`). Fix: `advance(expect: {phase, handNumber})` and no-op on mismatch. Verify the room clears timers on every phase change.
- **[low-med] Blackjack bet and insurance have no round token.** `blackjack.ts:88` and `:90`, compared with the action schema at `:89` which has `hand` and `move`. A duplicated or late bet or insurance packet can land in the next round's window (bet 12 s, insurance 8 s, `blackjack.ts:18` and `:21`). Fix: add `round` (or `move`) to both schemas.
- **[low] Jukebox "ended" early-guard trusts a client-supplied duration.** `jukebox.ts:148` accepts any positive `duration`. `endMedia` at `:161-162` only blocks an early end when `duration` is large. A reporter (the controller, or anyone when `by` is empty, `:156`) can send `duration: 1` and skip. This is no new privilege, because `skip` already works for the same people (`:136`), but the guard does nothing. Fix: use the server-known duration or remove the guard. `failMedia` (`:166-167`) has the same shape.
- **[low] Phone video frame cap is measured in raw bytes.** `phone.ts:23-24` sets 7,600 bytes against an 8 kB WebSocket limit. If frames travel as base64 inside JSON, 7,600 bytes becomes about 10,134 characters and exceeds the limit. Verify the transport is binary. `isJpeg` (`phone.ts:36`) checks only the three-byte start marker.
- **[low] Realtime rate limits are constants only.** `voice.ts:8` (`maxPacketsPerSecond:40`), `foosball.ts:66` and `:383` (30 Hz input and frames), `phone.ts:24` (`videoFps:8`). Nothing in this package enforces them. Verify the server does.
- **[low] Truco events are never drained.** `truco/game.ts:69` declares `events`, pushed at `:120`, `:153`, `:168`, `:195`, `:212`, `:223`, `:235`. No method clears or takes them. Growth is bounded by one match, but there is no drain API. Add `takeEvents()` or confirm the room discards the instance per match.
- **[low] Ragdoll and foosball determinism depends on engine maths.** `ragdoll.ts:113-118` and the step at `:172` rely on `Math.sin`, `Math.cos` and `Math.hypot` giving the same bits in every browser and the room. Those functions can differ in the last bits across engines, and the sim runs many steps. Impact is cosmetic if the room only draws the result. If the room uses `Ragdoll.rest()` (`ragdoll.ts:148`) for gameplay, it can desync. Verify.
- **[info] Kick timing must come from the room clock.** `kick.ts:53` takes `fromMs` and `toMs` as parameters. The caller must derive them from the server's clock for the kick start, never from a client message.

## Concerns / smells
1. Timed state machine advanced by caller-invoked `advance()` with no token (`truco/game.ts:107`).
2. Several client messages carry no round or revision token (`blackjack.ts:88`, `:90`; `foosball.ts:381`, `:385`; `truco/index.ts:19`).
3. Unbounded per-match or per-hand arrays (`truco/game.ts:67`, `:69`).
4. Realtime limits are declared as constants but enforced nowhere in the package (`voice.ts:8`, `phone.ts:24`).
5. The package mixes rules for about 15 games and the world; a single dispatch covers all of it, so review depth per game is thin.

## Refactor suggestions
1. `truco/game.ts:107`: change `advance()` to take `{phase, handNumber}` and return a boolean. No-op on mismatch.
2. `truco/game.ts:248`: change `signal(seat, signal)` to `signal(seat, signal, now)` with a per-seat last-signal time against `TRUCO.signalCooldownMs`. Cap the list per hand.
3. `blackjack.ts:88` and `:90`: add `round` (or `move`) to both schemas, matching `blackjackActionSchema` at `:89`.
4. `jukebox.ts:161-162`: remove the client-duration guard or compare against the server's known duration. Document the choice.
5. Extract one `betLimits(prices, key, defaults)` helper for `blackjack.ts:74`, `foosball.ts:368` and `truco/stakes.ts:17`. Extract one `clamp` and one read/write helper for `car-parts.ts:28-32` and `moto-parts.ts:28-32`.
