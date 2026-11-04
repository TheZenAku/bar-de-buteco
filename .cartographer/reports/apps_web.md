# Segment: apps/web

**Reviewed by:** frontend-ui-reviewer

## Files reviewed
- `apps/web/src/admin/badges.ts`
- `apps/web/src/admin/charts.ts`
- `apps/web/src/admin/collection.ts`
- `apps/web/src/admin/console.ts`
- `apps/web/src/admin/economy.ts`
- `apps/web/src/admin/environment.ts`
- `apps/web/src/admin/highfood.ts`
- `apps/web/src/admin/kit.ts`
- `apps/web/src/admin/logs.ts`
- `apps/web/src/admin/overview.ts`
- `apps/web/src/admin/performance.ts`
- `apps/web/src/admin/players.ts`
- `apps/web/src/admin/prices.ts`
- `apps/web/src/admin/reports.ts`
- `apps/web/src/admin/server.ts`
- `apps/web/src/admin/vehicles.ts`
- `apps/web/src/admin/world.ts`
- `apps/web/src/admission-lifecycle.ts`
- `apps/web/src/ambient-mix.ts`
- `apps/web/src/api.ts`
- `apps/web/src/audio.ts`
- `apps/web/src/bar-animations-debug.ts`
- `apps/web/src/blackjack/sounds.ts`
- `apps/web/src/blackjack/table.ts`
- `apps/web/src/car-panel.ts`
- `apps/web/src/collection/card-sounds.ts`
- `apps/web/src/collection/collection.ts`
- `apps/web/src/collection/skin-card.ts`
- `apps/web/src/consuming-hud.ts`
- `apps/web/src/consumption.ts`
- `apps/web/src/economy-ui.ts`
- `apps/web/src/engine/BarScene.ts` (read in full; 2542 lines, the lifecycle, input and resize parts in depth, the scene body by grep and first 700 lines)
- `apps/web/src/engine/animation-tracks.ts`
- `apps/web/src/engine/bar-animations.ts`
- `apps/web/src/engine/bar-dressing.ts`
- `apps/web/src/engine/bar-surfaces.ts`
- `apps/web/src/engine/blow-fx.ts`
- `apps/web/src/engine/blow-sound.ts`
- `apps/web/src/engine/camera-rig.ts`
- `apps/web/src/engine/camera-xray.ts`

Coverage note: `BarScene.ts` lines 700 to 2455 were not read line by line; they were checked by grep for listeners, timers, `innerHTML`, `destroy` and `cleanup`. The engine files are mostly outside this specialist's lane and are reviewed for lifecycle and render hygiene only.

## Integrations
- PlayCanvas (engine: scene, materials, instancing, particles)
- Web Audio API (synthesized sounds, ambient bus, blow sounds)
- Web Animations API (card flips, deal, discard)
- `fetch` to `/api` (admin panel, badge and customer image upload)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/web/src/api.ts` | `ApiError` | class | HTTP error carrying `status` |
| `apps/web/src/api.ts` | `api` | function | JSON fetch to `/api` with cookie credentials |
| `apps/web/src/api.ts` | `escape` | function | HTML-escapes any value for templates |
| `apps/web/src/admission-lifecycle.ts` | `AdmissionLifecycle` | class | Serialises entry and exit with generation tokens |
| `apps/web/src/admission-lifecycle.ts` | `AdmissionPhase` | type | outside, entering, inside, leaving |
| `apps/web/src/ambient-mix.ts` | `AMBIENT_MIX` | const | Ambient gain, duck, crossfade and preload values |
| `apps/web/src/ambient-mix.ts` | `AmbientQueue` | class | Shuffled bag of tracks, no repeat across bags |
| `apps/web/src/ambient-mix.ts` | `fadeCurve` | function | Equal-power fade curve, 65 samples |
| `apps/web/src/audio.ts` | `BarAudio` | class | Two-deck streamed ambience mixed through Web Audio |
| `apps/web/src/bar-animations-debug.ts` | `barAnimationsDebug` | function | Dev-only F8 panel that plays bar animations |
| `apps/web/src/blackjack/sounds.ts` | `createTableSounds` | function | Synthesized blackjack table sounds |
| `apps/web/src/blackjack/sounds.ts` | `TableSounds` | type | Return type of createTableSounds |
| `apps/web/src/blackjack/table.ts` | `BlackjackHooks` | interface | Send, clock, balance, volume and notify callbacks |
| `apps/web/src/blackjack/table.ts` | `createBlackjackTable` | function | Blackjack felt, controls and card animation |
| `apps/web/src/car-panel.ts` | `carPanelHtml` | function | Car panel markup: parts, controls, seats, repair |
| `apps/web/src/collection/card-sounds.ts` | `cardSounds` | const | Noise snaps and bell chimes for the collection |
| `apps/web/src/collection/collection.ts` | `CollectionHooks` | interface | Wardrobe actions and wearing state from the room |
| `apps/web/src/collection/collection.ts` | `createCollection` | function | Card collection screen: hand, focus card, buy, wear |
| `apps/web/src/collection/skin-card.ts` | `CardFace` | interface | Fields a card needs to draw |
| `apps/web/src/collection/skin-card.ts` | `cardArt` | function | Art URL for a card, cache-busted |
| `apps/web/src/collection/skin-card.ts` | `isHolographic` | function | Epic and rarest cards get the foil layer |
| `apps/web/src/collection/skin-card.ts` | `cardStyle` | function | CSS custom properties for rarity and accent |
| `apps/web/src/collection/skin-card.ts` | `skinCardHtml` | function | Static card markup, small or big |
| `apps/web/src/collection/skin-card.ts` | `LiveCard` | interface | Handle to a tilting, spinning card |
| `apps/web/src/collection/skin-card.ts` | `liveCard` | function | Pointer tilt, layer parallax and turn for one card |
| `apps/web/src/consuming-hud.ts` | `createConsumingHud` | function | Row of consumption tiles with draining rings |
| `apps/web/src/consumption.ts` | `Consumption` | interface | One thing the local player is consuming |
| `apps/web/src/consumption.ts` | `consumptions` | function | Builds the consumption list from room state |
| `apps/web/src/economy-ui.ts` | `mediaPriceNote` | function | Price note above jukebox and TV panels |
| `apps/web/src/economy-ui.ts` | `stageMinutes` | function | Minutes left on a stage pass |
| `apps/web/src/economy-ui.ts` | `stagePanelHtml` | function | Stage pass purchase or remaining time |
| `apps/web/src/economy-ui.ts` | `tableMenuHtml` | function | Table order form or pending order |
| `apps/web/src/economy-ui.ts` | `tableMenuTotal` | function | Recomputes order total and enables submit |
| `apps/web/src/economy-ui.ts` | `jobsHtml` | function | Job list with slots, pay and start buttons |
| `apps/web/src/economy-ui.ts` | `jobPanelHtml` | function | HUD panel of the current job task |
| `apps/web/src/economy-ui.ts` | `jobPanelTick` | function | Ten-per-second clock update for the job panel |
| `apps/web/src/economy-ui.ts` | `graphicsSettingsHtml` | function | Graphics settings form |
| `apps/web/src/economy-ui.ts` | `nextGraphics` | function | Applies one setting change, switching to custom |
| `apps/web/src/engine/BarScene.ts` | `BarScene` | class | Whole bar scene: avatars, camera, map, input |
| `apps/web/src/engine/BarScene.ts` | `BLIP_RADIUS` | const | Floor ring radius of a blip, metres |
| `apps/web/src/engine/BarScene.ts` | `StageBlip` | type | Stage blip ids: entry, telao, shop, desk |
| `apps/web/src/engine/animation-tracks.ts` | `completeBasePose` | function | Fills missing bone channels from the rest pose |
| `apps/web/src/engine/bar-animations.ts` | `BarAnimations` | class | Bar clips: props, chairs, particles, leftovers |
| `apps/web/src/engine/bar-animations.ts` | `barState` | function | Anim state name for a bar clip |
| `apps/web/src/engine/bar-animations.ts` | `barEndOffset` | function | How far a clip leaves the body from its start |
| `apps/web/src/engine/bar-animations.ts` | `BarPlay` | interface | Inputs for playing a clip on one avatar |
| `apps/web/src/engine/bar-dressing.ts` | `BarDressing` | class | Fridges, warmer and counter dressed with real props |
| `apps/web/src/engine/bar-surfaces.ts` | `BarSurfaces` | class | Baked occlusion and room reflections for bar materials |
| `apps/web/src/engine/blow-fx.ts` | `BlowEffects` | class | Star and dust quads for blows and falls |
| `apps/web/src/engine/blow-sound.ts` | `BLOW_CLIPS` | const | Clip names used for blows |
| `apps/web/src/engine/blow-sound.ts` | `BlowEar` | interface | Listener pose for panned blow sounds |
| `apps/web/src/engine/blow-sound.ts` | `BlowSounds` | class | Panned, limited blow, swing and fall sounds |
| `apps/web/src/engine/camera-rig.ts` | `CameraMode` | type | first or third |
| `apps/web/src/engine/camera-rig.ts` | `CAMERA_MODES` | const | Camera modes in cycle order |
| `apps/web/src/engine/camera-rig.ts` | `CAMERA_LABELS` | const | Labels of the camera modes |
| `apps/web/src/engine/camera-rig.ts` | `isCameraMode` | function | Type guard for a camera mode |
| `apps/web/src/engine/camera-rig.ts` | `CAMERA_ZOOMS` | const | Near, middle and far distances, metres |
| `apps/web/src/engine/camera-rig.ts` | `CAMERA_ZOOM_LABELS` | const | Labels of the zoom steps |
| `apps/web/src/engine/camera-rig.ts` | `DEFAULT_CAMERA_DISTANCE` | const | Middle zoom |
| `apps/web/src/engine/camera-rig.ts` | `readCameraDistance` | function | Saved distance snapped to a zoom step |
| `apps/web/src/engine/camera-rig.ts` | `CameraFeel` | interface | Height, sensitivity and smoothing tuning |
| `apps/web/src/engine/camera-rig.ts` | `DEFAULT_CAMERA_FEEL` | const | Default camera tuning |
| `apps/web/src/engine/camera-rig.ts` | `CAMERA_HEIGHT_LIMIT` | const | Height tuning limit, metres |
| `apps/web/src/engine/camera-rig.ts` | `CAMERA_SENSITIVITY_LIMITS` | const | Sensitivity bounds |
| `apps/web/src/engine/camera-rig.ts` | `readCameraFeel` | function | Clamps saved camera tuning |
| `apps/web/src/engine/camera-rig.ts` | `CameraSubject` | interface | What the camera follows this frame |
| `apps/web/src/engine/camera-rig.ts` | `CameraRig` | class | Boom, orbit, obstacle closing and x-ray window |
| `apps/web/src/engine/camera-xray.ts` | `CameraXray` | class | Shader chunk that cuts what hides the player |
| `apps/web/src/admin/badges.ts` | `badgePng` | function | Scales an uploaded PNG to the server's size limit |
| `apps/web/src/admin/badges.ts` | `sendBadgeImage` | function | POSTs PNG bytes to the badge image store |
| `apps/web/src/admin/badges.ts` | `badgesSection` | function | Admin badge catalog, editor and holders |
| `apps/web/src/admin/charts.ts` | `lineChart` | function | Inline SVG line chart with tooltips |
| `apps/web/src/admin/charts.ts` | `flowChart` | function | Inline SVG created-versus-destroyed bars |
| `apps/web/src/admin/charts.ts` | `chartHover` | function | Shared tooltip and crosshair for charts |
| `apps/web/src/admin/collection.ts` | `collectionSection` | function | Admin card and skill catalog editor |
| `apps/web/src/admin/console.ts` | `adminConsole` | function | Admin shell: menu, status line, section switching |
| `apps/web/src/admin/economy.ts` | `economySection` | function | Money supply, inflation and distribution |
| `apps/web/src/admin/environment.ts` | `environmentSection` | function | Clock, weather and day length controls |
| `apps/web/src/admin/highfood.ts` | `highfoodSection` | function | Delivery service stats, customers, bike grants |
| `apps/web/src/admin/kit.ts` | `AdminContext` | interface | What every admin section receives |
| `apps/web/src/admin/kit.ts` | `SectionId` | type | Section identifiers |
| `apps/web/src/admin/kit.ts` | `Section` | interface | Section lifecycle: destroy and world update |
| `apps/web/src/admin/kit.ts` | `SectionFactory` | type | Signature of a section factory |
| `apps/web/src/admin/kit.ts` | `WorldSnapshot` | interface | Shape of the admin.world snapshot |
| `apps/web/src/admin/kit.ts` | `n`, `signed`, `pct`, `compact`, `bytes`, `duration`, `when`, `fullDate`, `ago` | functions | pt-BR number, date and duration formatting |
| `apps/web/src/admin/kit.ts` | `requestId` | function | UUID with a getRandomValues fallback |
| `apps/web/src/admin/kit.ts` | `stat`, `card`, `empty`, `badge`, `reasonField`, `meter`, `chips` | functions | Markup helpers for admin cards and tiles |
| `apps/web/src/admin/kit.ts` | `lock` | function | Disables a section's controls while a change runs |
| `apps/web/src/admin/logs.ts` | `logsSection` | function | Filterable, paged event log with CSV export |
| `apps/web/src/admin/overview.ts` | `goButton` | function | Link markup that opens another section |
| `apps/web/src/admin/overview.ts` | `followGo` | function | Follows a data-admin-go link |
| `apps/web/src/admin/overview.ts` | `overviewSection` | function | Admin summary and world health |
| `apps/web/src/admin/performance.ts` | `performanceSection` | function | Performance monitor controls and charts |
| `apps/web/src/admin/players.ts` | `playersSection` | function | Account list and per-player file |
| `apps/web/src/admin/prices.ts` | `pricesSection` | function | Price table with draft and save |
| `apps/web/src/admin/reports.ts` | `reportsSection` | function | Report queue with resolve and reopen |
| `apps/web/src/admin/server.ts` | `serverSection` | function | Processes, host, database and queues |
| `apps/web/src/admin/vehicles.ts` | `vehiclesSection` | function | Delivery bikes on the map: spawn and despawn |
| `apps/web/src/admin/world.ts` | `worldSection` | function | Live room: jobs, orders, media, players, bots |

## Conventions observed
- **Naming**: camelCase for functions and values, PascalCase for classes and types, UPPER_SNAKE for module constants. Files kebab-case, with a few PascalCase engine files (`BarScene.ts`).
- **Error handling**: `ApiError` carries HTTP status; admin `ctx.run` maps 403 to `denied` and shows the message in the status line. Audio code swallows errors with empty `catch` blocks by design (comments say why).
- **Logging**: `console.warn` in the engine for missing assets; no structured logger.
- **Async style**: promises and async/await; fire-and-forget marked with `void`; request races guarded with generation counters (`players.ts`, `logs.ts`, `economy.ts`).
- **Type hints**: fully typed. `strict: true` in `tsconfig.base.json`; no `any`, no `@ts-ignore` in the segment. `tsc -p apps/web/tsconfig.json --noEmit` ran clean.
- **UI rendering**: no React, Vue or Svelte. Views are built as template strings assigned to `innerHTML`, with delegated `click`, `submit`, `input` and `change` listeners on the root. Escaping is consistent (`e()`) across the admin files reviewed.
- **Language**: UI strings are pt-BR; code comments are English or pt-BR mixed by file.

## Internal duplication
- Search-and-grant state machine repeated: `apps/web/src/admin/badges.ts:38` and `:152-160` (find, debounce at `:229`) versus `apps/web/src/admin/highfood.ts:15` and `:21-27` (find, debounce at `:95`).
- Audio context bootstrap and noise buffer duplicated: `apps/web/src/collection/card-sounds.ts:3-13` versus `apps/web/src/blackjack/sounds.ts:8-12` and `:19-21`.
- Signed-number formatting: `apps/web/src/blackjack/table.ts:38` (`signed`) versus `apps/web/src/admin/kit.ts:49` (`signed`), with different zero and minus output.
- Upload fetch and error handling: `apps/web/src/admin/badges.ts:23-28` repeats `apps/web/src/api.ts:2-7` with a Blob body.
- `clamp` defined in `apps/web/src/engine/BarScene.ts:247` and `apps/web/src/engine/camera-rig.ts:30`.

## Cross-segment hints
- `badgeMedal`, `customerPicture`, `plateHtml`, `itemImage`, `coins`, `uiIcon`, `glints` and `studs` are imported from other modules and return HTML. Callers pass user-entered text (badge name and description, customer name). Their escaping must be checked in their own segments.
- `apps/web/src/admin/performance.ts:44-52` rebuilds five panels on every monitor push. Push rate is set in the performance monitor (outside this segment).
- `apps/web/src/admin/kit.ts:30-46` mirrors the server's `adminSnapshot` by hand (`apps/server/src/BarRoom.ts`). Drift risk.
- `apps/web/src/admin/players.ts`, `highfood.ts`, `vehicles.ts`, `car-panel.ts` import `plateHtml` from `garage-panel`; `car-panel.ts` also imports types from `moto-panel`. These are UI-to-UI links across panels.
- `apps/web/src/api.ts:8` holds the HTML `escape` helper; about twenty files import it from the network module. A utility module would be clearer.
- Badge image upload (`badges.ts:23`) follows the phone media upload pattern (the comment says so); the two are not shared.
- `apps/web/src/engine/bar-animations.ts` particle and leftover logic is engine lane; see the performance notes below.

## Specialist findings

### Component inventory
No framework components in this segment. The table lists the controller factories and render functions that play that role.

| Component | File:Line | Props | Fetches? | Owns state? | Notes |
|-----------|-----------|-------|----------|-------------|-------|
| `adminConsole` | `apps/web/src/admin/console.ts:48` | container, hooks | yes (`/admin/reports`) | yes (section, busy) | Shell; polls `admin.world` every 5 s (`:99`) |
| 15 section factories | `apps/web/src/admin/*.ts` (see Symbol inventory) | `(root, ctx, params)` | yes, via `ctx.api` | yes, per section | `SectionFactory` in `admin/kit.ts:28` |
| `createCollection` | `apps/web/src/collection/collection.ts:29` | root, first wardrobe, hooks, focusOn | via hooks | yes (focus, remembered variant) | Buy, equip, reveal overlay |
| `createBlackjackTable` | `apps/web/src/blackjack/table.ts:57` | root, hooks | no (room state in) | yes (draft, sent, timer) | Felt, controls, keyboard 1 to 5 |
| `createConsumingHud` | `apps/web/src/consuming-hud.ts:23` | root | no | yes (slot map) | Tile row, ten-per-second ring updates |
| `carPanelHtml` | `apps/web/src/car-panel.ts:7` | MotoPanelView | no | no | Pure markup |
| `jobsHtml` / `jobPanelHtml` / `tableMenuHtml` / `stagePanelHtml` | `apps/web/src/economy-ui.ts:20,33,55,66` | world, task, balance | no | no | Pure markup, `jobPanelTick` mutates |
| `skinCardHtml` / `liveCard` | `apps/web/src/collection/skin-card.ts:28,58` | face, options / scene, skin | no | yes (liveCard pointer, spin) | `liveCard` runs its own rAF loop |
| `barAnimationsDebug` | `apps/web/src/bar-animations-debug.ts:14` | scene getter | no | yes (panel, interval) | Dev only |
| `BarAudio` | `apps/web/src/audio.ts:17` | tracks | streams media | yes (decks, timers) | Not a UI component; owns audio graph |
| `BarScene` | `apps/web/src/engine/BarScene.ts:260` | canvas, callbacks | loads GLB and JSON assets | yes | Engine root |

### Hook misuse
- None in this segment (no React hooks).

### Prop drilling
- `AdminContext` (`apps/web/src/admin/kit.ts:8-25`) is passed to 15 sections. It is a deliberate context object, not drilling. No action.

### State duplication
- Search text, found accounts and debounce timer kept in both `apps/web/src/admin/badges.ts:38` and `apps/web/src/admin/highfood.ts:15`. Same logic, two copies. (See Refactor 2.)
- Drafts for the customer form live in `highfood.ts:14` while the DOM also holds the typed values; the two diverge between `keepDraft` calls (see F1).

### Re-render hotspots
- Whole-section `innerHTML` rebuild on each push or timer: `apps/web/src/admin/highfood.ts:113` (every 5 s), `apps/web/src/admin/vehicles.ts:37-42` (every 5 s), `apps/web/src/admin/server.ts:56` (every 15 s), `apps/web/src/admin/logs.ts:91` (every 10 s when live). Some sections guard their redraw; these do not.
- `apps/web/src/blackjack/table.ts:116-118` calls `getBoundingClientRect()` on every card before each state render: a forced layout per update. Acceptable at table pace; noted.
- `apps/web/src/collection/skin-card.ts:93` requests a frame on every tick forever for each live card; the early return at `:97` only skips drawing.

### Server/Client boundary
- Not applicable. The segment is client-only; `import.meta.env.BASE_URL` used for asset paths.

### Data fetching pattern drift
- Admin sections use `ctx.api` (wrapper over `api()`); `apps/web/src/admin/badges.ts:24` calls `fetch` directly for the image upload. Justified by the Blob body, but the error handling is copied (see Duplication).
- Collection uses injected hooks (`collection/collection.ts:13-16`) for all server calls. Consistent with the rest of the app.

### Accessibility quick-checks
- F8 (`apps/web/src/admin/charts.ts:44,60`): tooltip targets have `tabindex="-1"`, so keyboard users cannot reach them with Tab. The comment at `charts.ts:67` says the tooltips work on "keyboard focus". Data is still in the "numbers per day" table, so the impact is small.
- F9 (`apps/web/src/admin/players.ts:132`): tab list has `role="tablist"` and `role="tab"` but no arrow-key handling. `admin/console.ts:92-96` does implement arrows for the menu, so the pattern is inconsistent.
- F10 (`apps/web/src/collection/collection.ts:104,125`; `apps/web/src/admin/collection.ts:18`): interactive `<button>` wraps `<article>` and `<h3>` from `skinCardHtml` (`skin-card.ts:30-38`). Block and heading content inside a button is outside the HTML content model and makes the accessible name the whole card text.
- Form controls are labelled (wrapping `<label>` or `aria-label`) across the files reviewed. Icon-only buttons carry `aria-label`. Live status uses `role="status"` / `aria-live`.

### Style system drift
- Mixed: classes in `admin.css`, CSS custom properties via inline `style="--x:..."` (`admin/economy.ts:46`, `admin/badges.ts:48`, `economy-ui.ts:33`), and JS `style.cssText` strings (`bar-animations-debug.ts:17-25`, `collection/collection.ts:148,261`). The dev panel is the outlier.

### Untyped props
- None. Props are typed interfaces; no `any`. Typecheck passes.

### Findings

**F1: high**. `apps/web/src/admin/highfood.ts:113`, `:49-57`, `:28-33`, `:39`.
- What: `world(next){snapshot=next;render();}` rebuilds the whole section each time the admin poll brings a snapshot (every 5 s, `admin/console.ts:99`). `render()` builds the customer form from `draft`, but `draft` is only synced by `keepDraft()`, which runs on clicks and submits, not on typing.
- Why: admin typing in the customer name, lines, or the grant search (`:17`) is lost after the next snapshot, and focus is dropped. `world.ts:83`, `environment.ts:53` and `overview.ts:81` skip the redraw while an input has focus; this section does not.
- Fix direction: guard like `world.ts:83`, and call `keepDraft()` before `render()`.

**F2: low**. `apps/web/src/admin/logs.ts:44`, `:91`.
- What: `load()` sets `entries=[]` before fetching when not paging. With "Ao vivo" on, the timer calls `load()` every 10 s, so the table is replaced by "Buscando registros…" for each request.
- Why: visible flicker and a scroll jump every 10 s while the admin reads the log.
- Fix direction: keep `entries` until the response arrives when called from the timer.

**F3: low (not run in a browser)**. `apps/web/src/admin/vehicles.ts:37-42`, `apps/web/src/admin/world.ts:51`, `apps/web/src/admin/highfood.ts:54`.
- What: the scroll wrapper `.admin-scroll` is recreated on each 5 s redraw.
- Why: inferred from the code that a scrolled table jumps to the top every 5 s. Not verified in the browser.

**F4: low**. `apps/web/src/blackjack/sounds.ts:6-12`; `apps/web/src/blackjack/table.ts:398`.
- What: `createTableSounds` creates an `AudioContext` on first sound and never closes it. `destroy()` at `table.ts:398` removes the keydown listener and the ticker only, and the sound object has no `destroy`.
- Why: each table instance that plays a sound leaves a context open. Browsers cap these, so a long session with table re-creation can hit the limit.
- Fix direction: add `destroy()` that closes the context, and call it from `table.ts:398`.

**F5: low**. `apps/web/src/engine/bar-dressing.ts:33-36`; `apps/web/src/engine/BarScene.ts:603`.
- What: `BarDressing.ready` is `Promise.all(...).then(() => this.build())` with no `catch`. `BarScene` does not keep or await `dressing.ready`.
- Why: an exception in `build()` (for example a missing material) becomes an unhandled promise rejection, and no caller handles it.
- Fix direction: `.catch` that logs, or await it in the scene's `ready` chain.

**F6: low**. `apps/web/src/blackjack/table.ts:305`.
- What: `render()` calls `send('bet', ...)` for a queued repeat bet. A side effect inside a render function.
- Why: guarded by setting `repeatNext=false` first, so it is safe today, but any second call to `render()` in the same tick is a hazard for future edits.

**F7: low**. `apps/web/src/collection/collection.ts:148`, `:261`; `apps/web/src/collection/skin-card.ts:24`.
- What: `cardStyle()` returns HTML-escaped values (`e(...)`), and the result is assigned to `element.style.cssText`, where HTML entities are not decoded.
- Why: any accent containing `&`, `<` or quotes would be applied wrongly. The current `accent` values are hex colours, so there is no visible bug today.
- Fix direction: build the CSS string without HTML escaping for `cssText` (or validate the colour), and keep the escaped form for attributes.

**F8: low**. `apps/web/src/admin/charts.ts:44`, `:60`, `:67`.
- What: tooltip targets are `tabindex="-1"`; the comment claims keyboard focus support.
- Why: keyboard users cannot reach the tooltips. Numbers exist in the table below each chart.

**F9: low**. `apps/web/src/admin/players.ts:132`.
- What: `role="tablist"` with no arrow-key navigation. Compare `admin/console.ts:92-96`.
- Why: screen reader users expect arrow keys in a tablist.

**F10: low**. `apps/web/src/collection/collection.ts:104,125`; `apps/web/src/admin/collection.ts:18`; `apps/web/src/collection/skin-card.ts:30-38`.
- What: `<button>` contains `<article>`, `<h3>`, `<div>` from `skinCardHtml`.
- Why: invalid content model for `<button>`; the accessible name becomes the whole card text including the price and rarity.

**F11: low (dev only)**. `apps/web/src/bar-animations-debug.ts:40-41`.
- What: `setInterval(refresh, 250)` and a `document` keydown listener are never removed.
- Why: no cleanup path. Loaded only in development (per file comment), so it does not reach players.

**F12: low**. `apps/web/src/admin/highfood.ts:26`.
- What: after the grant search returns, `input?.focus()` runs unconditionally.
- Why: pulls focus back to the search box even if the admin has moved on. `badges.ts:157-159` restores focus only if it was there, which is the better pattern.

**F13: low**. `apps/web/src/admin/badges.ts:23-28`.
- What: repeats the response parsing and `ApiError` handling of `api()` for a Blob upload.
- Why: two places to change error behaviour.

**F14: low**. `apps/web/src/engine/blow-sound.ts:41`.
- What: `fetch(...).then(r => r.arrayBuffer())` does not check `response.ok`.
- Why: a 404 returns an HTML body, which fails `decodeAudioData` and logs a warning. Harmless, but the warning hides the real cause (missing file).

**F15: low**. `apps/web/src/engine/bar-animations.ts:300-301`.
- What: `actor.dropped` gets a new key per clip start and is never pruned.
- Why: grows for the whole session per avatar. Small strings, so low impact.

**F16: low (perf, engine lane)**. `apps/web/src/engine/bar-animations.ts:119-123`, `:156`.
- What: per particle, `jitter` and `spread` closures and `set([...])` array literals are allocated in the emit loop (urine emits up to 240 per second per emitter). `mesh.setPositions` uploads the full 2400-slot buffer every frame while anything is alive.
- Why: GC churn and upload cost during long urine or smoke sessions.

**F17: info (engine lane)**. `apps/web/src/engine/BarScene.ts:876-878`, `:930`.
- What: a 100 ms `setTimeout` poll for up to 20 s waits for skin models.
- Why: works, but an event or promise per skin would be simpler.

### Concerns / smells
1. F1: typed admin input is discarded by a timer-driven redraw (`highfood.ts:113`).
2. Redraw guards are applied in some admin sections and not others (`world.ts:83`, `environment.ts:53`, `overview.ts:81` versus `highfood.ts:113`, `vehicles.ts:37`).
3. Audio lifecycle: sound objects that create `AudioContext` have no close path (`blackjack/sounds.ts`), while `blow-sound.ts` closes its context in `destroy()`.
4. Copy-pasted admin search pattern (`badges.ts`, `highfood.ts`) and audio bootstrap (`card-sounds.ts`, `blackjack/sounds.ts`).
5. Accessibility gaps are small and consistent in kind: tooltips not focusable, tabs without arrows, buttons with block content.

### Refactor suggestions
1. `apps/web/src/admin/highfood.ts:113`: guard `world()` the way `world.ts:83` does, and call `keepDraft()` before `render()`. Why: fixes F1 with a three-line change.
2. `apps/web/src/admin/badges.ts:152-160,229` and `apps/web/src/admin/highfood.ts:21-27,92-96`: extract a shared `playerSearch` helper (text, debounce, found list, target). Why: removes the duplicated state machine.
3. `apps/web/src/collection/card-sounds.ts:3-13` and `apps/web/src/blackjack/sounds.ts:8-12`: export one `audioContext()` and `noiseBuffer()` from `card-sounds.ts` (or a small `sound-core.ts`) and reuse. Why: one place for resume and lazy creation.
4. `apps/web/src/admin/logs.ts:44`: when called from the live timer, keep the current `entries` until the response arrives. Why: fixes F2.
5. `apps/web/src/admin/charts.ts:44,60,67`: make `.viz-hit` and `.viz-bar` focusable with `tabindex="0"`, or correct the comment. Why: fixes F8 and makes the comment true.
