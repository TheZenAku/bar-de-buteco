# Segment: packages

**Reviewed by:** generalist-reviewer

## Files reviewed
- `packages/shared/src/achievements.ts`
- `packages/shared/src/environment.ts`
- `packages/shared/src/metrics.ts`
- `packages/shared/src/stage-show.ts`
- `packages/shared/src/tickets.ts`

## Integrations
- none (Node `crypto` HMAC only, in `tickets.ts`)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `packages/shared/src/achievements.ts` | `ACHIEVEMENT_TIERS` | const | The four levels of every series: numeral and rarity |
| `packages/shared/src/achievements.ts` | `AchievementSeries` | interface | A countable player activity; reaching each goal earns `<id>-<level>` |
| `packages/shared/src/achievements.ts` | `ACHIEVEMENT_SERIES` | const | The 26 achievement series with goals, units, texts |
| `packages/shared/src/achievements.ts` | `achievementSeries` | function | Looks up a series by id |
| `packages/shared/src/achievements.ts` | `achievementBadgeId` | function | Badge id `<series>-<level+1>` |
| `packages/shared/src/achievements.ts` | `crossedLevels` | function | Levels passed going from `before` to `after` (no giving back) |
| `packages/shared/src/achievements.ts` | `achievementOfBadge` | function | Series and level behind a badge id, undefined for admin badges |
| `packages/shared/src/achievements.ts` | `achievementAmount` | function | Formats an amount with its singular or plural unit (pt-BR) |
| `packages/shared/src/achievements.ts` | `achievementBadges` | function | Default badge set for all series and levels |
| `packages/shared/src/achievements.ts` | `seriesOfItem` | function | Series that a consumed item counts towards |
| `packages/shared/src/achievements.ts` | `ACHIEVEMENT_BLADDER_MIN` | const | Minimum bladder for a toilet visit to count |
| `packages/shared/src/achievements.ts` | `ACHIEVEMENT_CALL_MS` | const | Call length before it counts towards Telefonista |
| `packages/shared/src/achievements.ts` | `AchievementEvent` | interface | One counted event: user, series, amount |
| `packages/shared/src/achievements.ts` | `achievementReportSchema` | const (zod) | Validates the report of counted events and online users |
| `packages/shared/src/achievements.ts` | `AchievementView` | interface | One series as the profile endpoint returns it |
| `packages/shared/src/environment.ts` | `DAY_NIGHT` | const | Day/night cycle: duration, epoch, offset |
| `packages/shared/src/environment.ts` | `WEATHER` | const | Weather period, transition and lightning periods |
| `packages/shared/src/environment.ts` | `WEATHER_KINDS` | const | The four weather kinds |
| `packages/shared/src/environment.ts` | `WeatherKind` | type | Union of weather kinds |
| `packages/shared/src/environment.ts` | `WEATHER_NAMES` | const | Display names per weather, plus `auto` |
| `packages/shared/src/environment.ts` | `WeatherSample` | interface | Cloud, rain, storm, wind and kind at an instant |
| `packages/shared/src/environment.ts` | `EnvironmentState` | interface | Stored clock and weather state of the room |
| `packages/shared/src/environment.ts` | `DEFAULT_ENVIRONMENT` | const | Initial environment state |
| `packages/shared/src/environment.ts` | `gameHour` | function | In-game hour at a server time |
| `packages/shared/src/environment.ts` | `formatGameHour` | function | Hour as `HH:MM` |
| `packages/shared/src/environment.ts` | `weatherAt` | function | Weather sample at a server time, blended from the last change |
| `packages/shared/src/environment.ts` | `environmentPatchSchema` | const (zod) | Admin patch: hour, pause, day length, weather, reset |
| `packages/shared/src/environment.ts` | `EnvironmentPatch` | type | Inferred patch type |
| `packages/shared/src/environment.ts` | `applyEnvironmentPatch` | function | Applies an admin patch, re-anchoring the clock when needed |
| `packages/shared/src/environment.ts` | `lightningAt` | function | Deterministic lightning strike, flash and thunder times |
| `packages/shared/src/metrics.ts` | `Window` | class | Ring buffer of last N samples with nearest-rank percentiles |
| `packages/shared/src/metrics.ts` | `MetricsRegistry` | class | Counters, gauges and windows rendered as Prometheus text |
| `packages/shared/src/stage-show.ts` | `LIGHT_DESK` | const | Light desk position and rotation on the stage |
| `packages/shared/src/stage-show.ts` | `LIGHT_DESK_REACH` | const | Reach in metres for using the light desk |
| `packages/shared/src/stage-show.ts` | `SHOW_PROGRAMS` | const | The 16 show programs, in panel order |
| `packages/shared/src/stage-show.ts` | `SHOW_PALETTES` | const | The 8 beam palettes (sRGB hex) |
| `packages/shared/src/stage-show.ts` | `SHOW_POWERS` | const | auto, on, off |
| `packages/shared/src/stage-show.ts` | `SHOW_CUES` | const | Momentary cues (flash, blackout, drop, letreiro) and their beats |
| `packages/shared/src/stage-show.ts` | `SHOW_BARS` | const | Allowed program lengths in bars |
| `packages/shared/src/stage-show.ts` | `SHOW_BPM` | const | Tempo range |
| `packages/shared/src/stage-show.ts` | `StageShowState` | interface | Show settings as the room syncs them |
| `packages/shared/src/stage-show.ts` | `DEFAULT_SHOW_PLAYLIST` | const | Default rotation of all programs but the fixed one |
| `packages/shared/src/stage-show.ts` | `DEFAULT_SHOW` | const | Initial show state |
| `packages/shared/src/stage-show.ts` | `SHOW_TEXT_CHARS` | const | Characters the laser font draws |
| `packages/shared/src/stage-show.ts` | `SHOW_TEXT_MAX` | const | Max letreiro length (14) |
| `packages/shared/src/stage-show.ts` | `showText` | function | Normalises letreiro text, falls back to HIGHLAND |
| `packages/shared/src/stage-show.ts` | `showPatchSchema` | const (zod) | Desk patch validation |
| `packages/shared/src/stage-show.ts` | `ShowPatch` | type | Inferred desk patch type |
| `packages/shared/src/stage-show.ts` | `showCueSchema` | const (zod) | Cue validation |
| `packages/shared/src/stage-show.ts` | `SHOW_PRESETS` | const | Ready-made scenes as whole patches |
| `packages/shared/src/stage-show.ts` | `showPlaylist` | function | Playlist ids, defaulting when none are valid |
| `packages/shared/src/stage-show.ts` | `applyShowPatch` | function | Applies a desk change, keeping the beat continuous |
| `packages/shared/src/stage-show.ts` | `fireShowCue` | function | Fires a cue at a time |
| `packages/shared/src/stage-show.ts` | `ShowMoment` | interface | Program, palette, beat and running cue at an instant |
| `packages/shared/src/stage-show.ts` | `showMoment` | function | Where the show is at `now` |
| `packages/shared/src/tickets.ts` | `GameTicket` | interface | Signed claims of a game-join ticket |
| `packages/shared/src/tickets.ts` | `authSecret` | function | Auth HMAC secret; dev fallback outside production |
| `packages/shared/src/tickets.ts` | `internalSecret` | function | Machine-to-machine secret; must differ from `AUTH_SECRET` in production |
| `packages/shared/src/tickets.ts` | `signTicket` | function | Signs a 60 s ticket with a random nonce |
| `packages/shared/src/tickets.ts` | `verifyTicket` | function | Checks HMAC, format and expiry of a ticket |

## Conventions observed
- **Naming**: camelCase functions and variables; SCREAMING_CASE constants; PascalCase types and classes. Metric names are snake_case (`bar_api_requests_total`). Show and series ids are kebab-case. Domain strings are Portuguese.
- **Error handling**: zod schemas with `.strict()` for input (`environment.ts:51`, `stage-show.ts:102`, `achievements.ts:86`); plain `throw new Error` with Portuguese messages in `tickets.ts`. Pure functions otherwise, no Result types.
- **Logging**: none in this segment.
- **Async style**: none. All functions are synchronous and pure, except the `Window` and `MetricsRegistry` classes, which hold mutable in-memory state.
- **Type hints**: fully typed. Heavy use of `as const`, `as` casts and `!` assertions (`achievements.ts:56,63`, `stage-show.ts:197`).
- **Formatting**: mixed. `achievements.ts`, `environment.ts`, `stage-show.ts` use compact style (no spaces, long lines up to ~200 chars); `metrics.ts` and `tickets.ts` (partly) use spaced style.

## Internal duplication
- `clamp` defined twice with different signatures: `environment.ts:17` (one arg, [0,1]) and `stage-show.ts:144` (value, min, max).
- Rarity colour literals in `achievements.ts:72` duplicate `RARITY_INFO` in `rarity.ts:5` (listed under specialist findings).
- `stage-show.ts:53` (`SHOW_BARS`) and `stage-show.ts:107` (the same 4/8/16 list written as a zod literal union).
- Preset patches (`stage-show.ts:124-141`) repeat the full level set. Data repetition, acceptable.

## Cross-segment hints
- `clamp` copies outside this segment: `packages/shared/src/car-dynamics.ts:5`, `foosball.ts:99`, `head-look.ts:5`, `moto.ts:72`, `needs.ts:144`, `pool/physics.ts:64`, `city.ts:20`. Candidate for one shared math helper.
- `packages/shared/src/world.ts:4` imports `LIGHT_DESK` and `LIGHT_DESK_REACH` from `stage-show.ts`. World geometry depends on a feature module (layering inversion).
- `tickets.ts:10-11` secret fallback: route to **auth-security-reviewer**.
- `metrics.ts` gauges are wired in `apps/server/src/BarRoom.ts:325-331`: route to the observability or server reviewer for the `read()` exception risk.
- `apps/api/src/config.ts:39` and `apps/server/src/config.ts:63` consume `authSecret`/`internalSecret`; secret handling belongs in a config module, not `tickets.ts`.
- `apps/server/src/BarRoom.ts` also consumes `verifyTicket`/`GameTicket` from `tickets.ts`: auth-security-reviewer to check the ticket path end to end.
- `achievementReportSchema` and `AchievementView` are consumed by `apps/api/src/app.ts` and `apps/api/src/achievement-service.ts`: API reviewer to confirm the shapes.

## Specialist findings

### Cohesion assessment
- Recommendation: **split** into 5 groupings. The segment is five unrelated `packages/shared` modules: progression, day/night and weather, observability, stage light desk, and auth secrets.
- Reasoning: no shared concept between the five files. Each has its own consumers (api, server, web). Only the file-count is small (491 lines), so the cost of splitting is low.
- Proposed groupings:
  - progression: `achievements.ts` (with `profile.ts`, `rarity.ts`, `apps/api/src/achievement-service.ts`)
  - world-time: `environment.ts` (with `apps/web/src/engine/day-night.ts`, `apps/server/src/state.ts`)
  - stage: `stage-show.ts` (with `musicians.ts`, `apps/web/src/light-desk.ts`)
  - observability: `metrics.ts` (with `apps/api/src/observability.ts`, `apps/server/src/observability.ts`)
  - auth: `tickets.ts` (with `apps/api/src/config.ts`, `apps/server/src/config.ts`)

### Deletability
- None observed. Every export in the segment has at least one caller outside its own file or a same-file use (`ACHIEVEMENT_TIERS`, `achievementOfBadge`, `achievementReportSchema`, `Window`, `MetricsRegistry`, `showCueSchema`, `WEATHER_NAMES`, `lightningAt`).
- `ShowMoment` (`stage-show.ts:179`) is exported but only used inside its file. Keep: it is the return type of an exported function.

### Utility duplication
- `clamp` in `environment.ts:17` and `stage-show.ts:144` (see Internal duplication).
- Rarity colours in `achievements.ts:72` duplicate `rarity.ts:5` (`RARITY_INFO`).
- The ternary chain at `achievements.ts:72` duplicates a lookup that already exists.

### Configuration sprawl
- `tickets.ts:5-11`: `insecureSecret` regex and dev fallback secret live in a ticket module. Secrets and their fallbacks should be read once in config.
- `tickets.ts:10` and `apps/api/src/config.ts:39` both read `NODE_ENV` directly to decide production. Two sources of truth for "production".

### Missing tests
- No test in `apps/*/test` or `tests/integration` references `Window` or the percentile logic directly (`metrics.ts:8-23`). Only indirect coverage is possible.
- `crossedLevels`, `applyShowPatch`, `showMoment`, `applyEnvironmentPatch` have tests in `apps/api/test/achievements.test.ts`, `tests/integration/stage-show.test.ts`, `tests/integration/environment.test.ts`. Adequate.

### Type hint gaps
- `stage-show.ts:191` `showMoment(show:StageShowState=DEFAULT_SHOW,now:number)`: a defaulted parameter before a required one. Callers must pass `undefined` to get the default for `show`. Low.
- `environment.ts:9`, `achievements.ts:85`: fully typed.

### Naming clarity
- `tickets.ts` holds secrets and config as well as tokens. Name is narrower than contents.
- `achievements.ts:50` `id:'pix'` named `Mão Aberta`: the series name and id disagree. Intentional per copy, but readers may mistake it for a bug. Low.

### Generic code-smell pass
- Longest function: `showMoment` (`stage-show.ts:191-210`), about 20 lines. No function over 50 lines. No commented-out code, no TODO/FIXME.
- Magic numbers, unnamed:
  - `stage-show.ts:165` `2000` (tap window, ms)
  - `stage-show.ts:112` `25`, `200` (speed range; no constant, unlike `SHOW_BPM`)
  - `environment.ts:77-79` `3000`, `6000`, `1400`, `2000`, `650` (lightning timing)
  - `environment.ts:76` `16807`, `2147483647` (Park-Miller LCG constants, unnamed)
  - `environment.ts:54` `5`, `240` (day minutes range)

### Findings table

| # | Where | What | Why | Severity |
|---|-------|------|-----|----------|
| 1 | `packages/shared/src/tickets.ts:10-11` | `authSecret()` returns the public literal `local-development-only-change-before-deploying` whenever `NODE_ENV !== 'production'`. | `apps/api/src/config.ts:39` and `apps/server/src/config.ts:63` derive production from `NODE_ENV` alone. A deployment that omits `NODE_ENV=production` signs and accepts tickets with a public key. | med |
| 2 | `packages/shared/src/stage-show.ts:200` | `show.cue in SHOW_CUES` uses the `in` operator, which also matches inherited keys (e.g. `'toString'`). | Not reachable through the validated path today, because `cue` is set only by `fireShowCue` through `showCueSchema`. Brittle if state is ever loaded from storage without validation. Use `Object.hasOwn`. | low |
| 3 | `packages/shared/src/stage-show.ts:118` | `preset` accepts any trimmed string up to 32 chars. It is not checked against `SHOW_PRESETS` ids (`:124`). | Stored and broadcast verbatim in `StageShowState.preset`. Unknown ids reach every client. Constrain with `z.enum` of preset ids. | low |
| 4 | `packages/shared/src/stage-show.ts:107` | Bar options written as a literal union, duplicating `SHOW_BARS` (`:53`). | Two lists that must stay in sync. Derive the schema from `SHOW_BARS`. | low |
| 5 | `packages/shared/src/achievements.ts:72` | Rarity colours are an inline ternary chain, duplicating `RARITY_INFO` in `rarity.ts:5`. | Colours can drift between badges and rarity info. Use `RARITY_INFO[tier.rarity].color`. | low |
| 6 | `packages/shared/src/tickets.ts:38` | Malformed claims (missing `userId`, `sessionId`, `nonce`) throw the same message `Ticket expirado.` as an expired ticket. | Misleading in logs and in client handling. Separate the message. | low |
| 7 | `packages/shared/src/metrics.ts:57-61` | `render()` calls each gauge's `read()` with no try/catch. | One throwing gauge (e.g. the closures at `apps/server/src/BarRoom.ts:325-331`) fails the whole `/metrics` scrape and hides every other series. | med |
| 8 | `packages/shared/src/metrics.ts:17-21` and `:65` | `percentile()` copies and sorts the whole window on every call. `render()` calls it three times per window, per scrape. | Work scales with window size (default 1200). Sort once per window in `render()`. | low |
| 9 | `packages/shared/src/metrics.ts:6`, `:55` | Label names are not validated. Label values replace only `"`, `\` and newline with `_`. HELP text is not escaped. | Metric names and labels come from code, so risk is low. A future dynamic label could break the exposition format. | low |
| 10 | `packages/shared/src/environment.ts:76-79` and `stage-show.ts:165` | Magic numbers listed under Generic code-smell pass. | Hard to tune and to review. Name them next to `WEATHER` and `SHOW_*`. | low |
| 11 | `packages/shared/src/stage-show.ts:191` | `showMoment(show=DEFAULT_SHOW, now)`: defaulted parameter before a required one. | Callers must pass `undefined` for the default. Reorder or make `now` the first parameter. | low |
| 12 | `packages/shared/src/world.ts:4` | `world.ts` imports the light desk constants from `stage-show.ts`. | Geometry module depends on a feature module. Move `LIGHT_DESK` and `LIGHT_DESK_REACH` next to `STAGE`. | low |

## Concerns / smells
1. **Ticket secret fallback** (`tickets.ts:10-11`): tickets are forgeable with a public literal if `NODE_ENV` is not exactly `production`. Highest-risk item in the segment. Route to auth-security-reviewer.
2. **Unguarded gauges** (`metrics.ts:58`): one throwing gauge blanks all metrics.
3. **Unvalidated preset and cue lookup** (`stage-show.ts:118`, `:200`): low risk today, brittle for future changes.
4. **Copy-pasted `clamp`** in 9 files across `packages/shared`.
5. **Five unrelated modules** in one segment. Splitting it makes ownership and review clearer.

## Refactor suggestions
1. `packages/shared/src/tickets.ts:5-24`: move `authSecret`/`internalSecret` into the API and server config modules. Fail closed in production, and require `AUTH_SECRET` unless `NODE_ENV` is explicitly `development` or `test`.
2. `packages/shared/src/achievements.ts:72`: replace the ternary chain with `RARITY_INFO[tier.rarity].color`.
3. `packages/shared/src/stage-show.ts:107` and `:112`: derive the bars union from `SHOW_BARS`, and name the speed range (`SHOW_SPEED={min:25,max:200}`) like `SHOW_BPM`.
4. `packages/shared/src/metrics.ts:57-65`: wrap each gauge `read()` in try/catch; in `render()`, sort each window once and reuse the sorted array for the three quantiles.
5. Replace the seven `clamp` copies listed in Cross-segment hints with one shared math helper (cross-segment, synthesizer to route).
