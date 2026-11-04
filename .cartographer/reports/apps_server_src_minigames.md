# Segment: apps/server/src/minigames

**Reviewed by:** generalist-reviewer

## Files reviewed
- `apps/server/src/minigames/blackjack-bank.ts`
- `apps/server/src/minigames/blackjack.ts`
- `apps/server/src/minigames/foosball-cpu.ts`
- `apps/server/src/minigames/foosball.ts`
- `apps/server/src/minigames/pool.ts`
- `apps/server/src/minigames/truco.ts`

## Integrations
- none detected (internal only: `@bar/shared`, `../world/outbox`, `../world/wallet`, `../internal`)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/server/src/minigames/blackjack-bank.ts` | `StakeEntry`, `SettleEntry`, `BankEntry` | interface/type | Journal entries: a stake, or a round's settlement |
| `apps/server/src/minigames/blackjack-bank.ts` | `BankHooks` | interface | log and wallet-change callbacks for the bank |
| `apps/server/src/minigames/blackjack-bank.ts` | `BankGame` | type | The four games that journal coins through a bank |
| `apps/server/src/minigames/blackjack-bank.ts` | `GameBank` | class | Per-game coin journal: stake, settle, deliver, recover |
| `apps/server/src/minigames/blackjack-bank.ts` | `GameBank.stake` | method | Journals intent, debits wallet, voids on unknown outcome |
| `apps/server/src/minigames/blackjack-bank.ts` | `GameBank.settle` | method | Atomically swaps a round's stakes into one settlement entry |
| `apps/server/src/minigames/blackjack-bank.ts` | `GameBank.deliver` | method | POSTs waiting settlements; 4xx refused, other errors retried later |
| `apps/server/src/minigames/blackjack-bank.ts` | `GameBank.recover` | method | At start, voids stakes of rounds that never settled |
| `apps/server/src/minigames/blackjack-bank.ts` | `BlackjackBank` | class | Constructor-only subclass of GameBank('blackjack') |
| `apps/server/src/minigames/blackjack.ts` | `freshShoe` | function | Six-deck shoe shuffled with Fisher-Yates over crypto.randomInt |
| `apps/server/src/minigames/blackjack.ts` | `handTotal` | function | Hand total from `handValue` |
| `apps/server/src/minigames/blackjack.ts` | `TableBank` | interface | Coins in (stake) and out (settle) for one table |
| `apps/server/src/minigames/blackjack.ts` | `TableOptions` | interface | Bank, callbacks, shoe, limits, timing and clock for a table |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable` | class | Authoritative blackjack table: phases, seats, bets, turns |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.join` | method | Takes a chair, preferred one first, nearest free otherwise |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.leave` | method | Gets up; with coins in play the seat stays until settled |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.bet` | method | Sets the next deal's bet; first bet opens the betting window |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.insure` | method | Insurance decision; takes half the bet through the bank |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.act` | method | Hit, stand, double, split, surrender; stakes extra bet first |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.tick` | method | Clock: closes bets, deals, peeks, runs timeouts, clears felt |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.snapshot` | method | Public table view for the browsers (hole card hidden) |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.close` | method | Takes every bet from its wallet, then deals |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.settle` | method | Pays hands against the dealer and settles each seat |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.advance` | method | Moves turn to the next hand that still needs a decision |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.dealerStep` | method | One dealer draw (below 17) or settle |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.toWaiting` | method | Clears the felt; leavers removed, others keep their last bet |
| `apps/server/src/minigames/blackjack.ts` | `BlackjackTable.cost` | method | Extra bet for double or split, or throws why not allowed |
| `apps/server/src/minigames/foosball-cpu.ts` | `NIGHTS` | const | Three difficulty tunings: delay, noise, hands, strike, think, power, angle |
| `apps/server/src/minigames/foosball-cpu.ts` | `crossingY` | function | Y where a straight ball crosses x, bouncing off side walls |
| `apps/server/src/minigames/foosball-cpu.ts` | `laneFor` | function | Gap on the next rod of the other team to aim a strike at |
| `apps/server/src/minigames/foosball-cpu.ts` | `FoosballCpu` | class | Zé do Totó's brain for one table slot |
| `apps/server/src/minigames/foosball-cpu.ts` | `FoosballCpu.play` | method | Moves Zé's rods and strikes; called every physics tick |
| `apps/server/src/minigames/foosball.ts` | `FoosballBank` | interface | Coins in and out for one pebolim match |
| `apps/server/src/minigames/foosball.ts` | `FoosballSummary` | interface | What the log keeps of a finished match |
| `apps/server/src/minigames/foosball.ts` | `FoosballOptions` | interface | Bank, limits, clock, random, callbacks and timing for a table |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable` | class | Authoritative pebolim table: lobby, match phases, physics, referee |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.join` | method | Takes a free place, else takes Zé's place |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.configure` | method | Host settings: format, goals, sets, stake, level |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.cpu` | method | Host puts Zé in an empty place or takes him out |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.ready` | method | Ready toggle; starts the match when everyone is ready |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.leave` | method | Leaves; with coins on the match it is W.O. |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.connection` | method | Connection drop pauses the match until back or timeout |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.tick` | method | One physics tick, referee, and phase timeouts |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.start` | method | Takes every stake (or none), then kickoff with a coin toss |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.referee` | method | Goals and the possession time limits |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.timeUp` | method | Ends kickoff, goal, set and pause phases when their clock runs out |
| `apps/server/src/minigames/foosball.ts` | `FoosballTable.finish` | method | Ends a match; winners get twice their stake |
| `apps/server/src/minigames/pool.ts` | `PoolBank` | interface | Coins in and out for one sinuca match |
| `apps/server/src/minigames/pool.ts` | `PoolTable` | class | Authoritative pool table: rack, rules via judgeShot, strokes, turns |
| `apps/server/src/minigames/pool.ts` | `PoolTable.join` | method | Takes a free seat, else the house's player's seat |
| `apps/server/src/minigames/pool.ts` | `PoolTable.configure` | method | Host sets house level or the stake between people |
| `apps/server/src/minigames/pool.ts` | `PoolTable.ready` | method | Yes to the stake; fills empty seat with Juca when all said yes |
| `apps/server/src/minigames/pool.ts` | `PoolTable.leave` | method | Leaving mid-match is a withdrawal; the other player wins the rack |
| `apps/server/src/minigames/pool.ts` | `PoolTable.shoot` | method | Stroke from the shooter; stale or repeated strokes refused |
| `apps/server/src/minigames/pool.ts` | `PoolTable.choose` | method | Coin-toss choice (break or pass) or the 8 on the break |
| `apps/server/src/minigames/pool.ts` | `PoolTable.tick` | method | Strokes ending, turn timeouts, Juca thinking, pauses |
| `apps/server/src/minigames/pool.ts` | `PoolTable.start` | method | Takes every part (or none), then the coin toss or same-pair break |
| `apps/server/src/minigames/pool.ts` | `PoolTable.strike` | method | Runs a stroke through simulateShot and starts it rolling |
| `apps/server/src/minigames/pool.ts` | `PoolTable.settle` | method | Applies the verdict of a finished stroke: fouls, respots, turn |
| `apps/server/src/minigames/pool.ts` | `PoolTable.finish` | method | Ends the rack; winner gets twice the part, loser nothing |
| `apps/server/src/minigames/pool.ts` | `PoolTable.pauseIfAway` | method | Pauses the table while the shooter's connection is down |
| `apps/server/src/minigames/pool.ts` | `listBalls` | function | Portuguese list of ball numbers, e.g. "a 3, a 9 e a 11" |
| `apps/server/src/minigames/truco.ts` | `REGULARS` | const | The house's NPC regulars per level, with looks and personalities |
| `apps/server/src/minigames/truco.ts` | `TrucoBank` | interface | Coins in and out for one truco match |
| `apps/server/src/minigames/truco.ts` | `TrucoTableHooks` | interface | Per-person view, notices, match summary, bank, stakes, random |
| `apps/server/src/minigames/truco.ts` | `TrucoTable` | class | Truco table: seats, stakes, clock and NPCs around one TrucoGame |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.join` | method | Takes a seat, across from a lone player when possible |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.configure` | method | Level, stake between people, or Escuro; asks everyone's yes again |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.ready` | method | Yes to the stake; starts the match when all have said yes |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.begin` | method | Takes every part (or none), seats NPCs, creates the TrucoGame |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.leave` | method | Leaves; in a match an NPC takes the seat and the part is forfeited |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.tick` | method | Advances moments, timeouts and NPC decisions, then pushes views |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.decisions` | method | Decides who must act now: a person, an NPC, or auto-play on timeout |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.settle` | method | Pays each winning person twice their part; NPC part is the house's |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.push` | method | Sends each person their view when it changed |
| `apps/server/src/minigames/truco.ts` | `TrucoTable.viewFor` | method | One person's view of the table; their cards only |

## Conventions observed
- **Naming**: camelCase methods and fields, PascalCase classes, UPPER_CASE module constants (`NIGHTS`, `REGULARS`, `FREE_BANK`). Log and journal event names are snake_case with a game prefix (`blackjack_stake_unknown`). Mixed on the UUID source (see F7).
- **Error handling**: plain `Error` with Portuguese user-facing messages thrown from table methods (e.g. `blackjack.ts:124`). No typed domain errors. `InternalApiError` status is checked only in `blackjack-bank.ts:56` and `:86`.
- **Logging**: through injected `hooks.log(event, details)` (`blackjack-bank.ts:14`) and `onNotice` callbacks. No direct console use.
- **Async style**: `async`/`await` with `Promise.all` for parallel stake debits. Fire-and-forget uses `void this.flush()` (`blackjack-bank.ts:69`). Single-flight uses a memoised promise (`blackjack-bank.ts:74`).
- **Type hints**: fully typed signatures. Non-null assertions are pervasive: lines containing `!` per file are blackjack 40, foosball 48, pool 63, truco 50, foosball-cpu 18. `as` casts are few (3 to 6 per file).
- **Line length**: longest lines are truco 398, foosball 329, pool 329, blackjack 325 characters; 5 to 15 lines per file exceed 180 characters.

## Internal duplication
- The no-op bank `FREE_BANK` is defined four times: `blackjack.ts:67`, `foosball.ts:43`, `pool.ts:17`, `truco.ts:32`.
- Four bank interfaces with the same `stake`/`settle` shape: `TableBank` (`blackjack.ts:47`), `FoosballBank` (`foosball.ts:14`), `PoolBank` (`pool.ts:13`), `TrucoBank` (`truco.ts:28`).
- The all-or-nothing stake start is repeated: `foosball.ts:259-290`, `pool.ts:281-307`, `truco.ts:142-167`. Each has the same refund-if-refused-or-moved branch.
- The refusal message `error instanceof Error ? error.message : 'a carteira não respondeu.'` appears at `blackjack.ts:279`, `foosball.ts:270`, `pool.ts:288`, `truco.ts:149`.
- The 2x-stake payout is computed in `foosball.ts:397`, `pool.ts:421` and `truco.ts:315`.
- `unready()` is defined in `foosball.ts:452`, `pool.ts:478` and `truco.ts:105`, with slightly different bodies.
- The house substitution `Object.assign(slot, {cpu, displayName: CPU_NAME, ready: true, connected: true, brain})` repeats at `foosball.ts:160`, `:183`, `:373-374` and `pool.ts:167`, `:176`.
- The W.O. or away-timeout flow is near-identical in `foosball.ts:369-378` and `pool.ts:463-469`.

## Cross-segment hints
- `blackjack-bank.ts` is the common coin layer for four games but is named for blackjack. It depends on `world/outbox.ts` and `world/wallet.ts`, which belong to the world segment (a sibling report exists; avoid duplicating it).
- Input validation is in zod schemas in `packages/shared` (`blackjackActionSchema` in `packages/shared/src/blackjack.ts:89`, `foosballConfigSchema` in `packages/shared/src/foosball.ts:378`, `trucoConfigSchema` in `packages/shared/src/truco/index.ts:18`, `poolConfigSchema` in `packages/shared/src/pool/index.ts:121`). The table classes trust that validation (see F3).
- The notice hooks in `apps/server/src/BarRoom.ts:246`, `:258`, `:274`, `:292` call `client.send` directly. Relevant to F2.
- Game rules (`TrucoGame`, `judgeShot`, `FoosballSim`, `PoolPlanner`, `trucoDecide`) live in `packages/shared`. Out of this segment's scope.
- Possession time limits and rod kinds are constants in `packages/shared/src/foosball.ts:71` and `:30`. Relevant to F1.

## Specialist findings
**Findings (generalist lens, file:line):**

- **F1: possession restart contradicts its own comment** (`apps/server/src/minigames/foosball.ts:332-334`). Medium. The comment says a hold on the 3-rod (midfield) restarts at the other team's 2-rod (defense), and anywhere else at "its 5-rod" (attack). The code maps `attack` to `'defense'` and every other rod to `'midfield'`, so it never restarts on the attack rod and never restarts midfield holds on defense. Either the comment or the code is wrong. Confirm the ITSF rule, then fix one. No test in this segment pins it. Confidence medium, since the ITSF rule was not checked.
- **F2: `taking` flag not reset in a `finally`** (`apps/server/src/minigames/pool.ts:284-290`, `apps/server/src/minigames/truco.ts:147-151`). Low likelihood, high impact. If `hooks.notice` or `onNotice` throws inside the per-player `catch`, `Promise.all` rejects and `taking` stays `true`. Every later `join`, `configure`, `ready` and `move` then throws "As apostas já estão sendo recolhidas" until restart. `foosball.ts:289-290` already uses `try/finally` for the same pattern; mirror it.
- **F3: `act()` treats any unknown action as a split** (`apps/server/src/minigames/blackjack.ts:204-218`, default branch at `:210`). `cost()` (`blackjack.ts:387-401`, `return 0` at `:400`) does not reject unknown actions, so the final `else` runs the split path with no bet taken and none of the split checks (same-value pair, `maxHands`). Unreachable from the route, because `blackjackActionSchema` enumerates the five actions, but the class relies on that. Make `split` explicit and throw in the final `else`. Low.
- **F4: `FoosballCpu.play` is 50 lines with four nesting levels and magic numbers** (`apps/server/src/minigames/foosball-cpu.ts:55-105`). Magic values: `700` (`:76`), `.006` / `.02` (`:98`), `-.05` / `.08` / `3` (`:66`), `30` and `.6` (`:69`), `.3` (`:77`), `.4` (`:90`), `.7` (`:91`, `:102`). Extract the edge choice, the back-pass check and the strike decision into helpers. Low.
- **F5: hard-coded timers and game constants** (`apps/server/src/minigames/pool.ts:452` min pause `5000`; `foosball.ts:387` resume delay `1500`; `truco.ts:257` NPC signal delay `800 + 4000`; `truco.ts:364` and `:378` deck sizes `40` and `27`; `blackjack.ts:343` dealer stands at `17`; `blackjack.ts` uses `21` in about 10 places; `pool.ts:353` think budget `?? 6`). Low. Move to the shared constants modules.
- **F6: truco view names are misleading** (`apps/server/src/minigames/truco.ts:348`). `personality` carries the level label (`TRUCO_LEVEL_INFO[this.level].label`), while `personalityId` carries the NPC personality. Rename or swap. Low.
- **F7: inconsistent UUID source** (`apps/server/src/minigames/pool.ts:283` uses `globalThis.crypto.randomUUID()`; `truco.ts:144` uses bare `crypto.randomUUID()`; `blackjack.ts:1` and `foosball.ts:1` import `randomUUID` from `node:crypto`). Low. Use one import.
- **F8: needless copy** (`apps/server/src/minigames/blackjack.ts:291`: `(this.options.makeShoe ?? freshShoe)().slice()`). Both producers already return a fresh array. Low.
- **F9: `push()` rebuilds every person's view on every tick** (`apps/server/src/minigames/truco.ts:332-337`). Each call runs `viewFor` and `JSON.stringify` for each person, then compares strings. Cheap to fix with a dirty flag. Low.

**Deletability (candidates for the synthesizer to confirm):**
- `BlackjackBank` (`apps/server/src/minigames/blackjack-bank.ts:113-117`) adds nothing over `new GameBank('blackjack', ...)`. Its only use is `BarRoom.ts:237`. Candidate for removal.
- Exported but used only inside their own file: `freshShoe`, `handTotal` (`blackjack.ts:70`, `:79`), `listBalls` (`pool.ts:489`), `crossingY`, `laneFor` (`foosball-cpu.ts:16`, `:29`). Candidates for un-exporting. Not dead.

**Utility duplication**: the four `FREE_BANK` and four bank interfaces are the same shape (see Internal duplication). Nothing in the segment reimplements a standard-library function.

**Configuration sprawl**: game constants come from `@bar/shared` (`BLACKJACK`, `FOOSBALL`, `POOL`, `TRUCO`), which is the right place. The exceptions are F5's hard-coded values.

**Missing tests**: not assessed. Test code is out of scope for this review.

**Type hint gaps**: none. Every public method is typed.

**Naming clarity**: `act`, `tick`, `settle` and `decide` are used for several different things across the classes. `settle` means "pay a round" in `blackjack.ts:347` and "apply a stroke verdict" in `pool.ts:377`. Concrete names would help (e.g. `payRound`, `applyVerdict`). Low.

### Cohesion assessment
- Recommendation: keep as-is. The six files form one coherent layer: the house's table games and their coin bank.
- Reasoning: each game table is a self-contained state machine; the shared coin journal is the one cross-cutting piece, and it is already the common module (`blackjack-bank.ts`).
- If split: not needed. Optional rename only: `blackjack-bank.ts` → `game-bank.ts`, since it holds `GameBank` for all four games (touches the world segment's imports).

## Concerns / smells
1. Four copies of the stake, refund and settle scaffolding across blackjack, foosball, pool and truco (Internal duplication). The next change to the refund rule must be made four times.
2. Possession restart in `foosball.ts:332-334` disagrees with its own comment (F1). Gameplay correctness.
3. `taking` flags in `pool.ts` and `truco.ts` are not reset in a `finally` (F2). One throwing hook locks a table.
4. Dense code: about 40 lines per file contain `!` assertions, and lines run to 398 characters (`truco.ts`). This makes review and diffing hard.
5. The table classes trust validated input and have no defence of their own (F3).

## Refactor suggestions
1. Extract a shared `takeParts(players, stake, debit)` helper (stake all, refund-or-settle, notice text) into `blackjack-bank.ts` or a new `minigames/stakes.ts`. Replaces `foosball.ts:259-290`, `pool.ts:281-307`, `truco.ts:142-167`. Move the four `FREE_BANK` and four bank interfaces to the same module (`blackjack.ts:47-50`, `foosball.ts:14-17`, `pool.ts:13-17`, `truco.ts:28-32`).
2. Wrap the `taking` reset in `try/finally` in `pool.ts:282-290` and `truco.ts:142-151`, matching `foosball.ts:289-290`.
3. Resolve the possession rule: decide the ITSF behaviour, then make `foosball.ts:332-334` and its comment agree. Put the rule table next to the constants in `packages/shared/src/foosball.ts:71`.
4. Split `FoosballCpu.play` (`foosball-cpu.ts:55-105`) into `chooseEdge`, `backPass` and `shouldStrike` helpers. Name the magic numbers listed in F4.
5. Make `BlackjackTable.act` explicit: a named `split` branch, and a throw in the final `else` (`blackjack.ts:204-218`), plus a default throw in `cost()` (`blackjack.ts:400`).
