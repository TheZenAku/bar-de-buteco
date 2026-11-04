# Segment: apps/web#2

**Reviewed by:** frontend-ui-reviewer

## Files reviewed
- `apps/web/src/engine/car-rig.ts`
- `apps/web/src/engine/car-sound.ts`
- `apps/web/src/engine/city-plan.ts`
- `apps/web/src/engine/city-streaming.ts`
- `apps/web/src/engine/day-night.ts`
- `apps/web/src/engine/drink-props.ts`
- `apps/web/src/engine/environment-lighting.ts`
- `apps/web/src/engine/foosball-balls.ts`
- `apps/web/src/engine/fuel-props.ts`
- `apps/web/src/engine/gltf-textures.ts`
- `apps/web/src/engine/head-look.ts`
- `apps/web/src/engine/highfood-props.ts`
- `apps/web/src/engine/horse-mount.ts`
- `apps/web/src/engine/horse-sound.ts`
- `apps/web/src/engine/jukebox-lights.ts`
- `apps/web/src/engine/laser-font.ts`
- `apps/web/src/engine/map-effects.ts`
- `apps/web/src/engine/mixamo-retarget.ts`
- `apps/web/src/engine/moto-bag.ts`
- `apps/web/src/engine/moto-delivery.ts`
- `apps/web/src/engine/moto-lights.ts`
- `apps/web/src/engine/moto-motion.ts`
- `apps/web/src/engine/moto-ragdoll.ts`
- `apps/web/src/engine/moto-sound.ts`
- `apps/web/src/engine/pool-balls.ts`
- `apps/web/src/engine/scene-types.ts`
- `apps/web/src/engine/serving-props.ts`
- `apps/web/src/engine/skin-portrait.ts`
- `apps/web/src/engine/speed-blur.ts`
- `apps/web/src/engine/stage-lights.ts`
- `apps/web/src/engine/stage-musicians.ts`
- `apps/web/src/engine/stage-show.ts`
- `apps/web/src/engine/television-surface.ts`
- `apps/web/src/engine/vehicle-horn.ts`
- `apps/web/src/engine/video-colours.ts`
- `apps/web/src/engine/video-palette.ts`
- `apps/web/src/engine/weather-effects.ts`
- `apps/web/src/engine/weather-sound.ts`
- `apps/web/src/foosball/panel.ts`

## Integrations
- none detected (segment metadata)
- Observed, not counted as integrations: PlayCanvas engine (`playcanvas`, used in every file except `scene-types.ts`, `day-night.ts`, `horse-sound.ts`, `vehicle-horn.ts`, `weather-sound.ts`, `moto-sound.ts`, `laser-font.ts`, `video-palette.ts`, `video-colours.ts`, `panel.ts`'s DOM only); Web Audio API; WebGL via PlayCanvas; DOM (`panel.ts`).

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `engine/car-rig.ts` | `CarRig` | class | Hatch model rig: bones, paint, plate texture, doors, wipers, telemetry |
| `engine/car-rig.ts` | `CarLights` | class | Headlights (two spots) and rear omni light for the hatch |
| `engine/car-rig.ts` | `seatCar` | function | Seats a rider on the hatch bench, hands on wheel, feet on pedals |
| `engine/car-sound.ts` | `CarSounds` | class | Positional two-oscillator engine voices for cars |
| `engine/city-plan.ts` | `CityDetail` | type | Quality level name: low, medium, high, ultra |
| `engine/city-plan.ts` | `CityTuning` | interface | Per-quality streaming knobs (rings, reach, concurrency, cull, lights) |
| `engine/city-plan.ts` | `CITY_TUNING` | const | Tuning table per quality level |
| `engine/city-plan.ts` | `CityBackend` | interface | Load, dispose, show and warn hooks the planner calls |
| `engine/city-plan.ts` | `CityPlanner` | class | Decides which sector files load, show, hide, retry and free |
| `engine/city-plan.ts` | `CENTRE_MARGIN`, `RETAIN_MS`, `RETRY_MS` | const | Hysteresis margin, retention time, retry back-off |
| `engine/city-streaming.ts` | `CityStreaming` | class | Draws the streamed city sectors, backdrop and LOD via CityPlanner |
| `engine/day-night.ts` | `daylightAt` | function | Sun, moon, sky and fog colours for a server time |
| `engine/day-night.ts` | `smooth`, `Rgb`, `gameHour` | function/type/re-export | Smoothstep helper, RGB tuple type, game hour re-export |
| `engine/drink-props.ts` | `DRINK_PROPS` | const | Size, grip and sip angles per held drink |
| `engine/drink-props.ts` | `RIG_GRIP` | const | Per-skeleton grip fine-tuning |
| `engine/drink-props.ts` | `HandRig`, `Frame` | interface | Hand entity, finger chains, palm sign; grip frame |
| `engine/drink-props.ts` | `findHand` | function | Locates a hand and its finger chains by canonical names |
| `engine/drink-props.ts` | `handFrame` | function | Grip frame of a hand: fingers, across, palm, origin |
| `engine/drink-props.ts` | `closeHand` | function | Curls the fingers around something held |
| `engine/drink-props.ts` | `holdDrink` | function | Places a drink in the hand and raises it to the lips |
| `engine/environment-lighting.ts` | `EnvironmentLighting` | class | Sun, moon, sky, fog, lamps, signs, live shadows and weather |
| `engine/foosball-balls.ts` | `FoosballBalls` | class | Pebolim balls drawn on the 3D tables, blended between room frames |
| `engine/fuel-props.ts` | `FuelProps` | class | Pump nozzle and hose; attendant arm poses while fuelling |
| `engine/gltf-textures.ts` | `pointAtFirstTexture` | function | glTF preprocess: materials share the first copy of each image |
| `engine/gltf-textures.ts` | `loadSharedContainer` | function | Loads a glTF container with shared textures |
| `engine/gltf-textures.ts` | `limitTextures` | function | Scales decoded images above a size limit before upload |
| `engine/head-look.ts` | `HeadLookPose` | class | Applies yaw and pitch to the head joint after animation |
| `engine/highfood-props.ts` | `HighfoodProps` | class | Paper bag, courier backpack and phone as plain branded boxes |
| `engine/horse-mount.ts` | `HorseMount` | class | Horse model: gaits, rear, rider seat, reins by IK |
| `engine/horse-sound.ts` | `HorseSoundView` | interface | Horse position, speed, animation and rear time |
| `engine/horse-sound.ts` | `HorseSounds` | class | Gallop loops and neigh one-shots, positional |
| `engine/jukebox-lights.ts` | `JukeboxLights` | class | Jukebox tubes and front light tinted by the video colours |
| `engine/jukebox-lights.ts` | `JukeboxLightsStatus` | interface | Telemetry shape for the jukebox lights |
| `engine/laser-font.ts` | `textDrawing` | function | Single-stroke letreiro text laid out as a cached drawing |
| `engine/laser-font.ts` | `LASER_SHAPES`, `LASER_GLYPHS` | const | Star, heart, mug and quavers drawings; glyph keys |
| `engine/laser-font.ts` | `Drawing` | interface | Traced segments of a drawing with their lengths |
| `engine/map-effects.ts` | `MapEffects` | class | Embers, fire and smoke particles; beer tap streams |
| `engine/map-effects.ts` | `MapEffectsStatus` | interface | Telemetry shape for map effects |
| `engine/mixamo-retarget.ts` | `boneName` | function | Maps a Mixamo joint name to the canonical skin name |
| `engine/mixamo-retarget.ts` | `sample` | function | Samples a clip curve at time t, quaternion-safe |
| `engine/mixamo-retarget.ts` | `readClip`, `readSource`, `readTarget` | function | Reads a clip, the authoring skeleton and a skin's bind pose |
| `engine/mixamo-retarget.ts` | `alignedRest` | function | Aligns each joint's bind pose to the authoring rest direction |
| `engine/mixamo-retarget.ts` | `convert` | function | Converts a Mixamo clip to an AnimTrack for one skin |
| `engine/mixamo-retarget.ts` | `Curve`, `Clip`, `Source`, `Target` | interface | Clip curves and skeleton shapes used by the converter |
| `engine/moto-bag.ts` | `MotoBag` | class | Script: opens the bag lid by a smoothed angle |
| `engine/moto-delivery.ts` | `MotoRig` | class | Delivery bike rig: wheels, steering, lean, suspension, lamps |
| `engine/moto-delivery.ts` | `Motos` | class | Syncs and draws all bikes and cars from room state |
| `engine/moto-delivery.ts` | `Bike` | interface | Per-vehicle record: entity, rig, lights, track, drawn pose |
| `engine/moto-delivery.ts` | `seatRider` | function | Seats a rider on a bike: hips, hands on grips, feet on pegs |
| `engine/moto-delivery.ts` | `RiderRig` | interface | Rider skeleton fields used by seat and lift code |
| `engine/moto-lights.ts` | `MotoLampMaterials` | class | Shared lens and halo materials for all bikes |
| `engine/moto-lights.ts` | `MotoLights` | class | Bike lenses, halos and real lights from the lamp state |
| `engine/moto-lights.ts` | `lampState` | function | Lamp flags from the room's light bits |
| `engine/moto-lights.ts` | `LampState` | type | Lamp flags: lit, brake, left, right, high |
| `engine/moto-motion.ts` | `PredictedRide` | class | Local rider's bike: fixed-tick simulation with interpolation |
| `engine/moto-motion.ts` | `RoomTrack` | class | Other riders' bikes: room samples played back late |
| `engine/moto-motion.ts` | `SNAP_DISTANCE`, `PLAYBACK_DELAY_MS` | const | Teleport threshold and playback delay |
| `engine/moto-ragdoll.ts` | `RagdollPuppet` | class | Draws a thrown body from the shared Ragdoll sim |
| `engine/moto-ragdoll.ts` | `lifterPose` | function | Pose of a rider lifting a fallen bike |
| `engine/moto-ragdoll.ts` | `RagdollRig` | interface | Bones the ragdoll moves |
| `engine/moto-ragdoll.ts` | `LATE_MS` | const | Age above which a body catches up at once |
| `engine/moto-sound.ts` | `MotoSounds` | class | Engine loops and one-shot clips per bike, positional |
| `engine/moto-sound.ts` | `engineMix`, `engineClip`, `roughness` | function | Pure engine loop mix, clip choice and rough-idle factor |
| `engine/moto-sound.ts` | `placeListener` | function | Places the Web Audio listener at the camera |
| `engine/moto-sound.ts` | `MOTO_CLIPS`, `MotoClip`, `EngineView` | const/type/interface | Clip names, clip type, per-bike engine view |
| `engine/pool-balls.ts` | `PoolBalls` | class | Pool balls on the 3D tables; hides the map's decor balls and cue |
| `engine/scene-types.ts` | `SceneActor`, `SceneWorld`, `SceneInput` | interface | Presentation contracts for actors, world and input |
| `engine/scene-types.ts` | `MapView`, `SceneLabel`, `SceneCallbacks` | interface | Minimap view, label and scene callback contracts |
| `engine/serving-props.ts` | `traySlots` | function | Packs an order's items on the tray, cached per order |
| `engine/serving-props.ts` | `aim` | function | Turns a bone so a direction points at another |
| `engine/serving-props.ts` | `reach` | function | Two-bone IK toward a target with a pole |
| `engine/serving-props.ts` | `palmUp`, `openHand`, `trayCentre` | function | Hand pose helpers for serving and the tray |
| `engine/serving-props.ts` | `smoothstep`, `TRAY_RADIUS`, `TRAY_HEIGHT`, `PLATE_HEIGHT` | function/const | Easing and tray geometry constants |
| `engine/skin-portrait.ts` | `shootPortrait` | function | Renders a standing skin to a transparent PNG data URL |
| `engine/speed-blur.ts` | `SpeedBlur` | class | Radial screen-edge blur post pass at speed |
| `engine/stage-lights.ts` | `StageLights` | class | Stage lenses, backlight and washes tinted by the video |
| `engine/stage-lights.ts` | `StageLightsStatus` | interface | Telemetry shape for stage lights |
| `engine/stage-musicians.ts` | `StageMusicians` | class | Musicians at the stage spots: converted clips, instrument copies |
| `engine/stage-musicians.ts` | `musicianState`, `musicianTime` | function | Anim state name and clip time for a spot's phase |
| `engine/stage-show.ts` | `StageShow` | class | Lasers, heads, strobe and telao drawings from the light desk |
| `engine/stage-show.ts` | `StageShowStatus` | interface | Telemetry shape for the stage show |
| `engine/television-surface.ts` | `TelevisionSurface` | class | Video aperture on a TV: projection, dimming, occlusion test |
| `engine/television-surface.ts` | `televisionTransform`, `TvDefinition`, `Point` | function/type | CSS matrix3d for a projected screen; TV and point types |
| `engine/vehicle-horn.ts` | `VehicleHorns` | class | Sustained positional horns for nearby vehicles |
| `engine/video-colours.ts` | `VideoColours` | class | Eases the colours shown by a lit prop toward the video's palette |
| `engine/video-colours.ts` | `toLinear`, `hex` | function | sRGB to linear; linear colour to sRGB hex |
| `engine/video-palette.ts` | `videoPalette` | function | Reads and caches the vivid colours of a video's stills |
| `engine/video-palette.ts` | `mediaStills`, `neon` | function | Still URLs per platform; boosts a colour to neon brightness |
| `engine/video-palette.ts` | `Rgb`, `VideoPalette`, `PALETTE_KEYS` | type/interface/const | sRGB tuple, palette shape, still positions |
| `engine/weather-effects.ts` | `WeatherEffects` | class | Rain streaks: one transparent draw call over the camera |
| `engine/weather-sound.ts` | `WeatherSounds` | class | Procedural rain bed and distant thunder |
| `foosball/panel.ts` | `createFoosballPanel` | function | Pebolim panel: markup, lobby, match input, overlay, sounds |
| `foosball/panel.ts` | `FoosballHooks` | interface | Callbacks the panel needs: send, clock, balance, volume, notify, closed |
| `foosball/panel.ts` | `FoosballPanel` | type | Return type of createFoosballPanel |

## Conventions observed
- **Naming**: camelCase for functions and fields, PascalCase for classes, UPPER_SNAKE for module constants. Mixed language: `moto-delivery.ts` and `car-rig.ts` use Portuguese identifiers (`ossos`, `repouso`, `frente()`, `ponto()`) beside English ones.
- **Error handling**: console.warn plus a fallback in most engine code (`car-rig.ts:37`, `city-streaming.ts:127`); throws for missing required nodes in `horse-mount.ts:21` and `mixamo-retarget.ts:84`; silent `catch{}` in `weather-sound.ts:40`, `pool-balls.ts:34`, `car-sound.ts:9`.
- **Logging**: console.warn with Portuguese messages; no structured logger.
- **Async style**: promise chains (`city-streaming.ts:102`, `moto-sound.ts:162`, `horse-sound.ts:44-52`), async/await in `city-streaming.ts:135`, `moto-delivery.ts:181`, `skin-portrait.ts:15`. Engine asset loads use PlayCanvas callbacks.
- **Type hints**: typed in most files; untyped spots: `as never` (`city-streaming.ts:184,206`, `gltf-textures.ts:21`), `as unknown as` into engine internals (`environment-lighting.ts:162`, `city-streaming.ts:83,112`, `speed-blur.ts:56`), `any` in `gltf-textures.ts:3,11`, `data:object` in `moto-lights.ts:105`, `string` for fields that have unions (see Specialist findings).
- **Formatting**: two styles coexist: compact one-liners (`car-sound.ts`, `drink-props.ts`, `moto-delivery.ts`) and spaced multi-statement lines (`laser-font.ts`, `map-effects.ts`, `television-surface.ts:78`).

## Internal duplication
- Mercosul plate canvas and texture: `car-rig.ts:68-76` and `moto-delivery.ts:203-223` draw the same plate with different sizes.
- Seat IK for hands on grips and feet on pegs: `car-rig.ts:133-139` (`seatCar`), `moto-delivery.ts:362-392` (`seatRider`), `horse-mount.ts:64-73` (`seat`).
- Emissive shader texture block (`#ifdef STD_EMISSIVE_TEXTURE`): `jukebox-lights.ts:34-36`, `stage-lights.ts:52-54` and `stage-lights.ts:73-75`.
- Light lookup `entity.light ?? findComponent('light') ?? undefined`: `jukebox-lights.ts:70`, `stage-lights.ts:126` and `stage-lights.ts:132`.
- Two identical render-mesh loops in `environment-lighting.ts:240-247` and `248-264`.
- Lens-level expression `LENS.head*(high?1.25:1)*head` written twice: `moto-lights.ts:145` and `:150`; same for signal and tail levels.
- Batch end sequence `lasers.end(); strokes.end(); cones.end(); flares.end();`: `stage-show.ts:470` and `:492`.
- Two fetch chains with the same shape: `horse-sound.ts:44-49` and `:50-52`.
- Radians-to-degrees constant under five names: `car-rig.ts:8` (`DEGREES`), `moto-delivery.ts:16` (`RAD_TO_DEG`), `serving-props.ts:37` (`DEG`), `stage-show.ts:13` (`RAD`), `laser-font.ts:18` (`RAD`).
- Smoothing curves: `day-night.ts:6` (`smooth`), `serving-props.ts:91` (`smoothstep`), `stage-show.ts:76` (`ease`); same cubic.
- `Rgb` tuple type defined four times: `day-night.ts:3`, `video-palette.ts:2` (mutable), `moto-lights.ts:10` and `stage-show.ts:5` (readonly).
- Visibility-change handling: `moto-sound.ts:178-181`, `horse-sound.ts:21-27`, `weather-sound.ts:18`.
- AudioContext guard (`userActivation` check, then `new AudioContext()`): `car-sound.ts:9`, `horse-sound.ts:30-40`, `moto-sound.ts:183-196`, `vehicle-horn.ts:12-16`, `weather-sound.ts:23-38`.

## Cross-segment hints
- Five engine sound modules each create their own AudioContext (`car-sound.ts:9`, `horse-sound.ts:34`, `moto-sound.ts:188`, `vehicle-horn.ts:15`, `weather-sound.ts:27`). Across apps/web/src there are about 16 `new AudioContext()` sites (see the other apps/web report for the close-path finding). A shared context would remove most of this.
- `placeListener` lives in `moto-sound.ts:49` but is imported by `car-sound.ts:2`, `horse-sound.ts:2` and `vehicle-horn.ts:2`; it belongs in a shared audio helper.
- `retryFailed` (`city-plan.ts:106`) has no production caller; only `tests/integration/city-streaming.test.ts:177` calls it. Whatever owns connectivity (BarScene or the app shell) should call it on reconnect.
- `environment-lighting.ts:269` takes `event:string` and compares against `'BLACKOUT'` / `'PARTY'` (`:281`); the event type is `scene-types.ts:59` `type:string`. A shared union would catch typos.
- `scene-types.ts:32` `holding?:string` and `:30` `drinkItem?:string` should use the shared `HeldDrink` type that `drink-props.ts` already uses.
- `foosball/panel.ts` depends on `render.ts` and `sounds.ts` (outside this segment): neither exposes a teardown (`foosball/render.ts` returns no destroy; `foosball/sounds.ts:6` creates a context that is never closed).
- `mixamo-retarget.ts` exports are used by `stage-musicians.ts` and BarScene (`serving-props.ts` is used by BarScene at `BarScene.ts:1876-1877`).
- Canvas-to-texture boilerplate (`createTexture` with mipmaps and linear filters) repeats in `car-rig.ts:74`, `moto-delivery.ts:211`, `pool-balls.ts:132`, `highfood-props.ts:9`, `map-effects.ts:57`.

## Specialist findings

### Component inventory
Segment has no React, Vue or Svelte files. The one UI component is `createFoosballPanel`; the other entries are PlayCanvas objects with lifecycle, listed for completeness.

| Component | File:Line | Props | Fetches? | Owns state? | Notes |
|-----------|-----------|-------|----------|-------------|-------|
| `createFoosballPanel` | `foosball/panel.ts:48` | `root:HTMLElement, hooks:FoosballHooks` | no (sends through `hooks.send`) | yes, about 15 closure `let`s (`table`, `frames`, `charge`, `lift`, `shownKey`, `controlsKey`, ...) | Imperative DOM with innerHTML templates; 355-line closure |
| `shootPortrait` | `engine/skin-portrait.ts:15` | `app, model, main camera` | no | no | Async; returns data URL |
| `Motos` | `engine/moto-delivery.ts:137` | `app, shadow callback, volume` | loads two GLBs | yes (`bikes` map) | Syncs from room state each tick |
| `StageMusicians` | `engine/stage-musicians.ts:59` | `app, map` | loads per-spot GLB | yes (`spots`, `converted`) | |
| `TelevisionSurface` | `engine/television-surface.ts:13` | `app, definition` | no | yes (`visible`, `dimmed`) | |
| `StageShow` | `engine/stage-show.ts:377` | `app` | no | yes (level, status, flash gate) | |

### Hook misuse
- N/A: no React hooks in this segment.

### Prop drilling
- No prop passed more than three levels. `volume:()=>number` is passed `Motos` (`moto-delivery.ts:166`) to `MotoSounds`, `CarSounds` and `VehicleHorns` (`:168-170`); acceptable.

### State duplication
- `foosball/panel.ts:135`, `:139`, `:306`, `:319`, `:372`: charging state lives in the `charge` variable and in the DOM class `fb-charging` on `root`, set and cleared in five places. Drift risk. Severity: low.
- `foosball/panel.ts:271` writes `data-phase` from `t.phase`, and `lastPhase` (`:82`, `:208`) is a second copy used for edge detection. Severity: low.
- Clocks mixed: `moto-delivery.ts:251` (`Date.now`), `:252` (`performance.now`), `moto-sound.ts:116-117` (`performance.now`) against the `time` argument. Severity: low.

### Re-render hotspots
- `foosball/panel.ts:73`: `q()` runs `querySelector` on every call, about 30 times per `render()`. Cache the element references once. Severity: low.
- `foosball/panel.ts:160`: beads are rebuilt with innerHTML on every board update. Severity: low.
- `foosball/panel.ts:173`: `clock.className` is written every 200 ms by the ticker (`:374`) even when unchanged; the text on `:172` is guarded, the class is not. Severity: low.
- `foosball/panel.ts:108-109`: `requestAnimationFrame(loop)` is scheduled before the `hidden` check, so the loop keeps running while the panel is hidden. Severity: low.
- `foosball/panel.ts:94`, `:121`, `:123`: new arrays and objects every frame. Severity: low.
- `engine/environment-lighting.ts:304-306`: `Object.entries({...})` and new arrays every frame in `update()`. `:335`: panorama tint key built with `toFixed` every frame. `:357-373`: `chooseLiveLamps` allocates a `Set` and array every frame. Severity: low.

### Server/Client boundary
- N/A: Vite SPA, no `"use client"` or server modules.

### Data fetching pattern drift
- `city-streaming.ts:138` fetches the manifest with three retries and a wait; `horse-sound.ts:44-52` and `moto-sound.ts:162` fetch once with no retry; `video-palette.ts:24-33` uses `Image` with `crossOrigin`. Three strategies. Severity: low.

### Accessibility quick-checks
- `foosball/panel.ts:356`: Escape closes the rules panel (`q('rules').hidden=true`) but does not update the toggle's `aria-expanded`, which was set to `"true"` at `:341`. Stale state for assistive tech. Severity: low.
- `foosball/panel.ts:66`: `#fb-overlay` has `aria-live="assertive"`, and its HTML carries a countdown that changes every second: kickoff `3/2/1` (`:182-183`), paused `Esperando N s` (`:188`), finished `Nova partida em N s` (`:192`). `:195` only swaps when the HTML changes, which it does every second. Screen readers would be interrupted every second. Severity: med.
- `foosball/panel.ts:324`: a click on a hold button (`data-fb-hold`) is ignored, so Enter on the focused "Chutar" or "Levantar" button does nothing. Space works through the document keydown (`:360`). Keyboard users have no Enter path for the hold. Severity: low.
- `foosball/panel.ts:65`: the playable canvas has `role="img"`, which removes it from the accessibility tree as an interactive element. Severity: low.
- `foosball/panel.ts:67`: `#fb-banner` (foul messages, `:206-212`) has no live region; the text is not announced. Severity: low.

### Style system drift
- Inline shader source as template strings in four files: `environment-lighting.ts:56-82`, `moto-lights.ts:40-49`, `weather-effects.ts:5-22`, `television-surface.ts:28-29`. Consistent with the engine style, but not shared. Severity: low.
- `foosball/panel.ts:51-72` builds the whole UI as one template string with `data-fb-*` attributes; the click dispatcher at `:322-349` is a chain of `if` on data attributes. Adding a control needs changes in both places. Severity: low.

### Untyped props
- `engine/scene-types.ts:30`: `drinkItem?: string`; `:32`: `holding?: string`; should be the `HeldDrink` union. Severity: low.
- `engine/scene-types.ts:59`: `event.type: string` (see Cross-segment). Severity: low.
- `engine/scene-types.ts:110`: `onVehicleControl(id:string, action:string)`; `action` is untyped. Severity: low.
- `engine/weather-effects.ts:51`: `setQuality(quality:string)`, while `environment-lighting.ts:440` passes a five-member union. Severity: low.
- `engine/moto-lights.ts:105`: `light(parent, name, data:object, at)` spreads an untyped object into `addComponent`. Severity: low.
- `foosball/panel.ts:10`: `send(type:string, payload?:unknown)`; the config payload built at `:335` (`{[set]: ...}`) has a computed key and no type. Severity: low.
- `engine/moto-delivery.ts:70,81`, `car-rig.ts:48-51`, `moto-delivery.ts:80-84`: `ponto()` is declared to return `pc.Entity` but returns null when the node is missing (see Concerns). Severity: med.
- `engine/car-rig.ts:135,138`, `horse-mount.ts:65-71`: `rider[\`upperarm_${side}\`]` and similar string-built keys bypass the typed `RiderRig` interface, so a misspelled bone name compiles silently. Severity: low.

### Other findings
- `foosball/panel.ts:297` and `:305`: right-button press sets `lift.mouse=true` on the canvas with no `setPointerCapture`; release is handled only by a `pointerup` listener on the canvas (`:305`). If the button is released outside the canvas (the controls strip is in the same root), `lift.mouse` stays true and the rods stay raised until the next canvas pointerup or a window blur. Severity: med.
- `foosball/panel.ts:16`: `FoosballHooks.notify` is declared but never called in `panel.ts`. Severity: low.
- `foosball/panel.ts:402`: `destroy()` clears the ticker and listeners, but does not clear `bannerTimer` (`:211-213`) and does not tear down the renderer or sounds (no teardown exists in `render.ts`; `sounds.ts:6` creates an AudioContext that is never closed). Severity: low.

## Concerns / smells
1. **`ponto()` null contract** (`engine/moto-delivery.ts:80-84`, `car-rig.ts:48-51`): returns a cached null but is typed `pc.Entity`. Callers in `moto-delivery.ts:219,221`, `moto-lights.ts:93,96,101,102`, `car-rig.ts:89,94,105,107,126` assume non-null; a model missing one node throws out of `Motos.place()` (`moto-delivery.ts:229-241`) on every sync. Severity: med.
2. **Retry never wired** (`engine/city-plan.ts:106`, `engine/city-streaming.ts:135-147`): sectors that fail three attempts, and a manifest that fails three fetches, stay out until a reload. No production caller of `retryFailed`. Severity: med.
3. **PlayCanvas buffer locks** (`engine/pool-balls.ts:44` and `:52`; `engine/city-streaming.ts:242`): `lock()` is called and `unlock()` only runs on the changed path in `pool-balls.ts`; `city-streaming.ts` never unlocks. Verify against the engine's lock contract before acting. Severity: med.
4. **Per-frame work** (`engine/moto-sound.ts:130`, `moto-delivery.ts:293`, `car-rig.ts:78`, `car-sound.ts:22`): vehicle `parts` strings are parsed every frame per vehicle; `environment-lighting.ts:345` rebuilds the live-lamp set each frame; `weather-effects.ts:58-61` rebuilds 2400 drops with 9600 array literals each time the camera moves 6 m. Severity: low.
5. **Lifecycle gaps**: `engine/moto-delivery.ts:323` does not destroy `lampMaterials` (`:159`, `:167`); `engine/highfood-props.ts` has no destroy and never releases its box mesh or logo textures (`:9`, `:22`, `:29`); `engine/stage-musicians.ts:146` drops a loaded asset when destroyed mid-load; `engine/stage-musicians.ts:156-168` leaks the instantiated entity on error. Severity: low.

## Refactor suggestions
1. `engine/environment-lighting.ts:186-268` (`configureMap`, about 80 lines): split into `configureSign`, `configureLamp`, `addStreetLamps` and `tintMaterials`; merge the two mesh loops at `:240` and `:248`.
2. `engine/moto-delivery.ts:250-302` (`Motos.update`, about 50 lines): extract the per-bike pose step (`:254-280`) and the per-bike lamp and rig step (`:281-294`) into methods; the two `RiderRig` and `RagdollRig` interfaces (`moto-delivery.ts:340`, `moto-ragdoll.ts:6`) can share one base.
3. `foosball/panel.ts:73` and `:349`: cache DOM references once in `createFoosballPanel`, and replace the `data-fb-*` click chain with a table of handlers keyed by data attribute.
4. Shared audio helper: one `getAudioContext()` plus the `placeListener` and visibility plumbing, used by the five engine sound modules (`car-sound.ts:9`, `horse-sound.ts:30-40`, `moto-sound.ts:183-196`, `vehicle-horn.ts:12-16`, `weather-sound.ts:23-38`).
5. Shared `Rgb`, `smooth`/`smoothstep`/`ease` and `RAD_TO_DEG` constants in one math module (`day-night.ts:3,6`, `serving-props.ts:37,91`, `stage-show.ts:5,13,76`, `moto-lights.ts:10`, `video-palette.ts:2`).
