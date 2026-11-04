# Segment: stripe@packages/shared/src/pool

**Reviewed by:** generalist-reviewer

## Files reviewed
- `packages/shared/src/bar-animations.ts`
- `packages/shared/src/pool/ai.ts`
- `packages/shared/src/pool/aim.ts`
- `packages/shared/src/pool/index.ts`
- `packages/shared/src/pool/physics.ts`
- `packages/shared/src/pool/rules.ts`
- `packages/shared/src/pool/table.ts`

## Integrations
- none

**Stripe check:** no Stripe usage in these files. No Stripe SDK, API, webhook, or payment code. The segment label's `stripe` integration is a false positive. The only case-insensitive match for "stripe" under `packages/shared/src` is `pool/table.ts:25` (`PoolGroup='solids'|'stripes'`), which refers to the striped-ball group in billiards. The segment itself is the sinuca (bola 8) minigame core plus the bar NPC animation module.

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `packages/shared/src/bar-animations.ts` | `BAR_ANIMATIONS` | const | Bar animation data from map-data.json (clips, groups, urinals, counter, seats) |
| `packages/shared/src/bar-animations.ts` | `BarClip` | type | Key of the clip table |
| `packages/shared/src/bar-animations.ts` | `BarGroup` | type | Key of the animation groups |
| `packages/shared/src/bar-animations.ts` | `barClipMs` | function | Clip duration in whole milliseconds |
| `packages/shared/src/bar-animations.ts` | `BarFrame` | interface | Clip space origin on the floor plus yaw |
| `packages/shared/src/bar-animations.ts` | `inFrame` | function | Converts a clip-space point to map coordinates |
| `packages/shared/src/bar-animations.ts` | `URINALS` | const | Urinal frames from map data |
| `packages/shared/src/bar-animations.ts` | `MAGRAO_SPOT` | const | Magrao's spot behind the counter |
| `packages/shared/src/bar-animations.ts` | `DRINK_DELIVERY` | const | Where Magrao leaves the drink |
| `packages/shared/src/bar-animations.ts` | `SERVE_STATES` | const | Magrao's serve clips keyed by room state |
| `packages/shared/src/bar-animations.ts` | `ServeState` | type | Key of SERVE_STATES |
| `packages/shared/src/bar-animations.ts` | `SERVE_FOR_DRINK` | const | Drink item to serve state |
| `packages/shared/src/bar-animations.ts` | `serveMs` | function | Serve clip duration for an item |
| `packages/shared/src/bar-animations.ts` | `seatFrame` | function | Chair space from a seat |
| `packages/shared/src/bar-animations.ts` | `onBench` | function | True for picnic-bench seats |
| `packages/shared/src/bar-animations.ts` | `seatExit` | function | Body position when getting up from a seat |
| `packages/shared/src/bar-animations.ts` | `standUpSpot` | function | Free floor near the exit when the exit is blocked |
| `packages/shared/src/bar-animations.ts` | `seatChair` | function | Chair instance id for a seat |
| `packages/shared/src/bar-animations.ts` | `CLEANABLE_TABLES` | const | Four-seat tables that limpar_mesa was made for |
| `packages/shared/src/bar-animations.ts` | `tableCorners` | function | The four corner frames of a table |
| `packages/shared/src/bar-animations.ts` | `nearestCorner` | function | Corner frame nearest a position |
| `packages/shared/src/bar-animations.ts` | `cornerSpot` | function | Worker spot for clearing from a corner |
| `packages/shared/src/bar-animations.ts` | `BAR_STATES` | const | Room animation states |
| `packages/shared/src/bar-animations.ts` | `barFrame` | function | Frame where the actor's clip plays, or undefined |
| `packages/shared/src/bar-animations.ts` | `Meal` | interface | Start and end of a seated customer's food |
| `packages/shared/src/bar-animations.ts` | `BarStep` | interface | A clip at a moment with its start and blend |
| `packages/shared/src/bar-animations.ts` | `chain` | function (private) | Plays clips in sequence from startedAt |
| `packages/shared/src/bar-animations.ts` | `seated` | function (private) | Sit-down, eating and seated loop |
| `packages/shared/src/bar-animations.ts` | `barTimeline` | function | The bar clip an actor plays at a given time |
| `packages/shared/src/pool/ai.ts` | `PoolLevel` | type | Juca's difficulty level |
| `packages/shared/src/pool/ai.ts` | `POOL_LEVELS` | const | Levels in order |
| `packages/shared/src/pool/ai.ts` | `POOL_LEVEL_NAMES` | const | Display names per level |
| `packages/shared/src/pool/ai.ts` | `POOL_CPU_NAME` | const | Juca's display name |
| `packages/shared/src/pool/ai.ts` | `SKILL` | const (private) | Aim and power error, shots weighed, spin use, think time per level |
| `packages/shared/src/pool/ai.ts` | `poolThinkMs` | function | Think time for a level from a random source |
| `packages/shared/src/pool/ai.ts` | `PoolPlan` | interface | Stroke plus optional cue placement |
| `packages/shared/src/pool/ai.ts` | `pots` | function (private) | Pot candidates from the cue ball's position |
| `packages/shared/src/pool/ai.ts` | `PoolPlanner` | class | Weighs shots by simulation in sliced steps |
| `packages/shared/src/pool/ai.ts` | `PoolPlanner.step` | method | Runs simulations until the budget passes; true when decided |
| `packages/shared/src/pool/ai.ts` | `PoolPlanner.score` | method (private) | Outcome of a stroke for Juca |
| `packages/shared/src/pool/ai.ts` | `PoolPlanner.plan` | method | Decision with his hand's error applied |
| `packages/shared/src/pool/ai.ts` | `PoolPlanner.placeCue` | method (private) | Cue ball spot in the quadro with the easiest pot |
| `packages/shared/src/pool/aim.ts` | `RayHit` | interface | First contact of a ray: ball or cushion, with normal |
| `packages/shared/src/pool/aim.ts` | `castBall` | function | What a ball sent along a ray meets first |
| `packages/shared/src/pool/aim.ts` | `pocketOnRay` | function | Pocket a ray passes over within a distance |
| `packages/shared/src/pool/aim.ts` | `PoolAimGuide` | interface | Aiming guide path, object ball, ghost ball, pocket |
| `packages/shared/src/pool/aim.ts` | `aimGuide` | function | Cue ball path with up to a bounce, to the first ball |
| `packages/shared/src/pool/aim.ts` | `clearPath` | function | Whether a straight path is free of other balls |
| `packages/shared/src/pool/aim.ts` | `rayCircle` | function (private) | Distance along a ray until a circle touches a point |
| `packages/shared/src/pool/aim.ts` | `SEGMENTS` | const (private) | Cushion pieces with unit direction and length |
| `packages/shared/src/pool/physics.ts` | `POOL_PHYSICS` | const | Felt, collision, stroke and sampling constants |
| `packages/shared/src/pool/physics.ts` | `PoolStroke` | interface | Aim angle, power, tip offset and elevation |
| `packages/shared/src/pool/physics.ts` | `CENTRE_STROKE` | const | Stroke with centre tip and no elevation |
| `packages/shared/src/pool/physics.ts` | `PoolTrack` | interface | One ball's recorded path |
| `packages/shared/src/pool/physics.ts` | `PoolSoundKind` | type | Sound kinds 0 to 4 |
| `packages/shared/src/pool/physics.ts` | `PoolShotOutcome` | interface | What a simulated stroke did, and where balls ended |
| `packages/shared/src/pool/physics.ts` | `strokeSpeed` | function | Cue ball speed for a power |
| `packages/shared/src/pool/physics.ts` | `stickTouches` | function | Balls the stick touches under its line |
| `packages/shared/src/pool/physics.ts` | `SimulateOptions` | interface | Record flag and time cap for a simulation |
| `packages/shared/src/pool/physics.ts` | `simulateShot` | function | Plays a stroke at 1 ms steps to rest, optionally recording |
| `packages/shared/src/pool/physics.ts` | `SimBall` | interface (private) | Mutable ball state inside the simulation |
| `packages/shared/src/pool/physics.ts` | `Contact` | interface (private) | A ball-ball or ball-cushion contact within a step |
| `packages/shared/src/pool/physics.ts` | `strike` | function (private) | Cue ball velocity, spin and hop from a stroke |
| `packages/shared/src/pool/physics.ts` | `circlePoint` | function (private) | Time until a moving circle touches a point |
| `packages/shared/src/pool/physics.ts` | `CUSHION_DATA` | const (private) | Cushion pieces with unit direction and length |
| `packages/shared/src/pool/rules.ts` | `PoolFoul` | type | Foul kinds |
| `packages/shared/src/pool/rules.ts` | `FOUL_NAMES` | const | Portuguese text per foul |
| `packages/shared/src/pool/rules.ts` | `PoolSeat` | type | Seat 0 or 1 |
| `packages/shared/src/pool/rules.ts` | `otherSeat` | function | Opponent's seat |
| `packages/shared/src/pool/rules.ts` | `PoolRack` | interface | One rack: turn, groups, benefit, winner |
| `packages/shared/src/pool/rules.ts` | `newRack` | function | Fresh rack with the given breaker |
| `packages/shared/src/pool/rules.ts` | `PoolShotFacts` | interface | Facts of a stroke as the rules see them |
| `packages/shared/src/pool/rules.ts` | `shotFacts` | function | Facts from a simulated outcome |
| `packages/shared/src/pool/rules.ts` | `PoolVerdict` | interface | Fouls, again, groups, respots, benefit, winner |
| `packages/shared/src/pool/rules.ts` | `groupLeft` | function | Balls of a group still on the table |
| `packages/shared/src/pool/rules.ts` | `legalTargets` | function | Balls a seat may hit first |
| `packages/shared/src/pool/rules.ts` | `judgeShot` | function | Judges a shot by the Noel Snooker calls |
| `packages/shared/src/pool/rules.ts` | `firstOf` | function (private) | Balls the cue ball met first |
| `packages/shared/src/pool/rules.ts` | `assign` | function (private) | Gives an open table's group to the shooter |
| `packages/shared/src/pool/table.ts` | `POOL_TABLE` | const | Table dimensions, ball radius, pocket and jaw sizes |
| `packages/shared/src/pool/table.ts` | `PoolBallKind` | type | cue, solid, eight or stripe |
| `packages/shared/src/pool/table.ts` | `PoolGroup` | type | solids or stripes |
| `packages/shared/src/pool/table.ts` | `ballKind` | function | Kind of a ball by number |
| `packages/shared/src/pool/table.ts` | `groupOf` | function | Group of a ball by number |
| `packages/shared/src/pool/table.ts` | `otherGroup` | function | The other group |
| `packages/shared/src/pool/table.ts` | `GROUP_BALLS` | const | Ball numbers per group |
| `packages/shared/src/pool/table.ts` | `GROUP_NAMES` | const | Display names per group |
| `packages/shared/src/pool/table.ts` | `HALF_LENGTH` / `HALF_WIDTH` | const | Half playfield dimensions |
| `packages/shared/src/pool/table.ts` | `HEAD_STRING` | const | Head string x in the table frame |
| `packages/shared/src/pool/table.ts` | `HEAD_SPOT` / `FOOT_SPOT` | const | Upper and lower marks |
| `packages/shared/src/pool/table.ts` | `PoolPocket` | interface | Pocket centre, drop radius, side flag, aim point |
| `packages/shared/src/pool/table.ts` | `POCKETS` | const | Six pockets numbered from the head |
| `packages/shared/src/pool/table.ts` | `PoolCushion` | interface | Cushion piece from A to B |
| `packages/shared/src/pool/table.ts` | `CUSHIONS` | const | Long pieces, short pieces and pocket jaws |
| `packages/shared/src/pool/table.ts` | `onCloth` | function | Ball centre may be on the cloth |
| `packages/shared/src/pool/table.ts` | `inQuadro` | function | Cue ball may be placed for the break |
| `packages/shared/src/pool/table.ts` | `PoolBallSpot` | interface | Ball number and position |
| `packages/shared/src/pool/table.ts` | `freeAt` | function | Whether a ball fits at a point |
| `packages/shared/src/pool/table.ts` | `spotBall` | function | Puts a ball back on a mark or the nearest free place |
| `packages/shared/src/pool/table.ts` | `rackBalls` | function | Racks fifteen balls with jitter |
| `packages/shared/src/pool/table.ts` | `PoolTablePlace` | interface | A table in the bar with its place and collider |
| `packages/shared/src/pool/table.ts` | `POOL_TABLES` | const | The bar's pool tables numbered from the stairs |
| `packages/shared/src/pool/table.ts` | `POOL_TABLE_IDS` | const | Table ids as a tuple for zod |
| `packages/shared/src/pool/table.ts` | `poolPoint` | function | Table-frame point to bar world coordinates |
| `packages/shared/src/pool/table.ts` | `poolSpot` | function | Where a player stands at the table |
| `packages/shared/src/pool/table.ts` | `poolExit` | function | Where a player stands after leaving the table |
| `packages/shared/src/pool/index.ts` | `POOL` | const | Turn, settle, finished and pause timings |
| `packages/shared/src/pool/index.ts` | `POOL_LEVEL_STAKES` | const | Stake per level from truco stakes |
| `packages/shared/src/pool/index.ts` | `POOL_BET` | const | Between-people bet limits |
| `packages/shared/src/pool/index.ts` | `POOL_MAX_RETURN` | const | Winner's return multiple (2) |
| `packages/shared/src/pool/index.ts` | `PoolStakes` | interface | Levels, min and max from the price table |
| `packages/shared/src/pool/index.ts` | `poolStakes` | function | Stakes from the price table with fallbacks |
| `packages/shared/src/pool/index.ts` | `PoolPhase` | type | lobby, aim, rolling, choice, paused, finished |
| `packages/shared/src/pool/index.ts` | `PoolChoiceKind` | type | toss or eight-break |
| `packages/shared/src/pool/index.ts` | `PoolSeatView` | interface | A seat as sent to the browsers |
| `packages/shared/src/pool/index.ts` | `PoolFeedItem` | interface | One line of the table's feed |
| `packages/shared/src/pool/index.ts` | `PoolTableView` | interface | Whole table state sent by pool.view |
| `packages/shared/src/pool/index.ts` | `PoolShotView` | interface | A stroke's playback sent by pool.shot |
| `packages/shared/src/pool/index.ts` | `PoolAimView` | interface | Shooter's aim relayed to the table |
| `packages/shared/src/pool/index.ts` | `encodeBalls` / `decodeBalls` | function | Flat wire form of balls, 0.1 mm integers |
| `packages/shared/src/pool/index.ts` | `encodeTracks` / `decodeTracks` | function | Wire form of recorded ball paths |
| `packages/shared/src/pool/index.ts` | `trackAt` | function | Ball place on its path at a time |
| `packages/shared/src/pool/index.ts` | `poolJoinSchema` and 7 more `pool*Schema` | const | zod validation for browser messages |

## Conventions observed
- **Naming**: camelCase functions and variables, PascalCase types and classes, UPPER_SNAKE for config objects. Single-letter module constants (`R`, `D`, `G`, `P`, `HL`, `HW`) in `physics.ts:63`, `aim.ts:3`, `ai.ts:23`, `table.ts:32`.
- **Error handling**: returns `undefined` or optional values for missing data (`barFrame`, `seatExit`, `aimGuide`). One throw: `bar-animations.ts:124` (`chain sem clipes`). Input validation via zod at `index.ts:113-126`.
- **Logging**: none in these files.
- **Async style**: fully synchronous. Time budgeting uses `Date.now()` in `ai.ts:95-101`.
- **Type hints**: fully typed. `as const` and `satisfies` used for literal tables (`bar-animations.ts:32`).
- **Comments**: JSDoc in Portuguese for domain terms and English for mechanics. Code identifiers are English with some Portuguese domain words (`sentar`, `levantar`, `quadro`, `bola 8`).

## Internal duplication
- Cushion pre-processing is duplicated: `aim.ts:4` (`SEGMENTS`) and `physics.ts:68` (`CUSHION_DATA`) both map `CUSHIONS` to unit direction and length with the same arithmetic.
- Circle-versus-point intersection is written twice with the same quadratic: `aim.ts:7-14` (`rayCircle`) and `physics.ts:107-119` (`circlePoint`). The second adds relative velocity, so this is a near-duplicate, not an exact copy.
- `R=POOL_TABLE.ballRadius` and `D=2*R` are redeclared in `aim.ts:3`, `physics.ts:63`, `ai.ts:23`. `table.ts:32` declares `R` as well.
- The `1e4` scale (tenths of a millimetre) is repeated as a literal in `index.ts:86, 91, 97, 104-109` and `physics.ts:144-145`.
- Benefit-turn target logic is written in both `rules.ts:73-79` (`legalTargets`) and `rules.ts:119` (`judgeShot`).

## Cross-segment hints
- `index.ts:6` imports `../truco/stakes.js`. Pool stake values depend on the truco segment.
- `index.ts:31-40` and comment `index.ts:31`: stake values come from the price table keys `pool:*`. The price-table owner (admin or economy segment) belongs with this coupling.
- `index.ts:13-14` header comment says the room lives in `apps/server/src/minigames/pool.ts`. The server room, `pool.shot` and `pool.view` handlers belong to the realtime segment.
- `index.ts:113-126` zod schemas validate browser messages. They belong to the same validation or backend-api segment that owns message routing.
- `bar-animations.ts:1` imports `./map-data.json` and `bar-animations.ts:3` imports `./world.js` (`floorHeight`, `isWalkable`). The world or collision segment owns those.
- `bar-animations.ts:6-12` describes room-synced `animationState` and `animationStartedAt`. The room and client animation consumers belong to a bar or NPC segment, not the pool segment.
- `bar-animations.ts` has no pool code at all. It shares this segment only by name and path. See Cohesion assessment.
- `table.ts:1` imports `map-data.json`, which is generated by the map pipeline (comment at `table.ts:4` references `36_bar_polimento.py`). Map-generation segment.

## Specialist findings

### Cohesion assessment
- Recommendation: split into 2 segments.
- Reasoning: `bar-animations.ts` (bar NPC clips, seats, urinals, counter, serve states) shares no code or types with `pool/`. It shares `map-data.json` and the segment label only. `pool/` is one coherent minigame: `table` (geometry), `physics` (simulation), `aim` (guides), `rules` (judging), `ai` (planner), `index` (protocol). It is internally cohesive.
- If split:
  - Group A `bar-animations`: `packages/shared/src/bar-animations.ts`
  - Group B `pool`: `packages/shared/src/pool/ai.ts`, `aim.ts`, `index.ts`, `physics.ts`, `rules.ts`, `table.ts`

### Deletability (candidates only, synthesizer to confirm repo-wide)
Not referenced by any other file in these seven files. Each may be used by server or client code outside this segment.
- `CENTRE_STROKE` `physics.ts:35`
- `ballKind` `table.ts:26`
- `GROUP_NAMES` `table.ts:30`
- `FOUL_NAMES` `rules.ts:18`
- `POOL_LEVEL_NAMES` `ai.ts:9` and `POOL_CPU_NAME` `ai.ts:10`
- `POOL_MAX_RETURN` `index.ts:34`
- `poolExit` `table.ts:145`
- `PoolPocket.dirX` and `dirY` `table.ts:41-43`, set at `table.ts:51-52`, never read in these files
- `PoolVerdict.respotCue`, `assigned`, `removed` `rules.ts:60-64`, written at `rules.ts:97`, `rules.ts:138`, never read in these files
- `BAR_STATES` `bar-animations.ts:84`, `DRINK_DELIVERY` `bar-animations.ts:30`, `MAGRAO_SPOT` `bar-animations.ts:29`, `seatChair` `bar-animations.ts:66`

### Utility duplication
- `clamp` at `physics.ts:64` duplicates a small helper. No stdlib equivalent exists in JavaScript, so this is acceptable.
- `gauss` at `ai.ts:24` (Box-Muller). Acceptable, one call site.
- `dist` at `ai.ts:145` duplicates an inline distance pattern in `pots`. Low value.

### Configuration sprawl
- None observed. Tuning lives in exported objects (`POOL_PHYSICS`, `POOL`, `SKILL`, `POOL_TABLE`). `ai.ts:119` (`maxMs:15_000`) and `ai.ts:121-126` (score constants) are inline.

### Generic code-smell pass
- Long function: `simulateShot` `physics.ts:130-355` (226 lines). Inner closures `earliest`, `separate`, `resolve`, `friction`, `holeOrOff` share mutable state. Severity: med.
- Long function: `judgeShot` `rules.ts:85-147` (63 lines), with a 3-level nested `eightDown` branch at `rules.ts:132-142`. Severity: low.
- Long function: `resolve` `physics.ts:223-285` (63 lines). Severity: low.
- Magic numbers in `ai.ts:121-126` (scores `10_000`, `-10_000`, `-400`, `300`, `25`, `12`, cut `70`, `78`). Severity: low.
- Magic numbers in `physics.ts:137` (`900` sounds cap), `physics.ts:140` (`2e-5`), `physics.ts:194` (`R-.004`). Severity: low.
- Commented-out code: none observed. TODO markers: none observed.

### Missing tests
- No test files in this segment. Test coverage cannot be confirmed from these files. Tests were excluded from review as instructed.

### Type hint gaps
- None observed. All exported functions have parameter and return types.

### Naming clarity
- `aim.ts:4` (`SEGMENTS`) versus `physics.ts:68` (`CUSHION_DATA`) name the same data differently. Severity: low.
- Legacy alias `Actor.animation` `bar-animations.ts:85` and `stateOf` `bar-animations.ts:86` keep the old field name alive. Severity: low.

### Specialist findings (issues)

- **Bench stand-up plays the chair-pull clip**: `bar-animations.ts:151`. The `sit` case at `bar-animations.ts:149` passes `onBench(place)` into `seated`. The `stand-up` case passes only `from-barClipMs('sentar')` and no bench flag. With `bench=false`, `seated` plays `sentar` (the chair-pull clip, `bar-animations.ts:130`) for a picnic-bench seat when the stand-up is asked before `from`. Severity: med. I could not confirm from these files whether the server sets `from` for benches the same way. Reading the code, the mismatch is real.
- **Prototype keys pass the `in` test**: `bar-animations.ts:94` and `bar-animations.ts:147` use `state in SERVE_STATES`. `in` also matches inherited names such as `constructor` or `toString`. Then `SERVE_STATES[state]` returns a function, and `barClipMs` returns NaN. The same applies to `SERVE_FOR_DRINK[item]` at `bar-animations.ts:36` for an item named `toString`. The inputs come from room state and the drink catalog, so impact is low. Severity: low.
- **Wall-clock budget makes the AI's decision machine-dependent**: `ai.ts:95-101` stops the queue when `Date.now()-start>=budgetMs`. The number of simulated candidates, and so the chosen stroke, depends on CPU speed and load. This also makes tests that drive `step` non-deterministic. Severity: med.
- **Synchronous work outside the slice budget**: `ai.ts:76` calls `placeCue` in the constructor. `placeCue` at `ai.ts:135-143` runs up to about 72 `pots` calls before any `step`. This contradicts the class comment at `ai.ts:57-58` ("Work comes in slices"). Severity: low.
- **Score simulation cap diverges from physics cap**: `ai.ts:119` uses `maxMs:15_000`. `physics.ts:29` sets `maxMs:40_000`. A roll that outlasts 15 s is judged at its 15 s position with balls still moving, with no flag. Severity: low.
- **Trailing `!` on a non-optional field**: `index.ts:105` uses `track.end!=='stop'` where `end` is non-optional (`physics.ts:41`). Harmless. Severity: low.
- **Module-level `dist` used before definition**: `ai.ts:83` and `ai.ts:85` call `dist` declared at `ai.ts:145`. Safe at runtime because the constructor runs later. Severity: low, readability only.

## Concerns / smells
1. `bar-animations.ts` is not pool code. It is grouped here by path and label (cohesion, see Cohesion assessment).
2. `simulateShot` (`physics.ts:130-355`) is 226 lines of shared mutable state. This is the riskiest code to change.
3. The AI's time budget is wall-clock (`ai.ts:95-101`). Plays differ by machine.
4. The bench stand-up path plays the wrong clip (`bar-animations.ts:151`), pending server-timing check.
5. Many exports look unused within the segment (see Deletability). Verify repo-wide before removing.

## Refactor suggestions
1. Move `packages/shared/src/bar-animations.ts` into its own segment. It has no pool dependency. Pool keeps the six `pool/` files.
2. Extract the cushion unit-vector preprocessing into one helper in `table.ts`, and use it from `aim.ts:4` and `physics.ts:68`.
3. Replace `state in SERVE_STATES` (`bar-animations.ts:94, 147`) and the `SERVE_FOR_DRINK[item]` lookup (`bar-animations.ts:36`) with an own-property check (`Object.hasOwn` or `hasOwnProperty.call`). Pass the bench flag through the `stand-up` branch at `bar-animations.ts:151`.
4. Make the AI budget count-based (simulations per step), or sum simulated ticks, so the chosen stroke is reproducible. Move `placeCue` (`ai.ts:135-143`) behind a `step` slice, or make it part of the queue. Share one `POS_SCALE=1e4` constant for `index.ts:86-109` and `physics.ts:144-145`.
5. Split `simulateShot` into a module-level state object plus separate `earliest`, `resolve`, and `friction` functions. Move the `judgeShot` benefit and eight branches (`rules.ts:117-142`) into helpers.
