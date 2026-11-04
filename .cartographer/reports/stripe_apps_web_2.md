# Segment: stripe@apps/web#2

**Reviewed by:** webhook-integration-reviewer

## Files reviewed
- `apps/web/src/phone/apps/motors.ts`
- `apps/web/src/phone/apps/telefone.ts`
- `apps/web/src/phone/apps/tools.ts`
- `apps/web/src/phone/apps/zap.ts`
- `apps/web/src/phone/core.ts`
- `apps/web/src/phone/filters.ts`
- `apps/web/src/phone/media.ts`
- `apps/web/src/phone/phone.ts`
- `apps/web/src/phone/wallpapers.ts`
- `apps/web/src/pool/panel.ts`
- `apps/web/src/pool/render.ts`
- `apps/web/src/pool/sounds.ts`
- `apps/web/src/prices.ts`
- `apps/web/src/profile/badge-card.ts`
- `apps/web/src/profile/floating-window.ts`
- `apps/web/src/profile/profile-window.ts`
- `apps/web/src/settings.ts`
- `apps/web/src/trade/trade.ts`
- `apps/web/src/truco/card.ts`
- `apps/web/src/truco/sounds.ts`
- `apps/web/src/truco/table.ts`
- `apps/web/src/ui-icons.ts`
- `apps/web/src/vehicle-hud.ts`
- `apps/web/src/voice.ts`
- `apps/web/src/world-menu.ts`
- `apps/web/src/youtube-player.ts`

## Integrations
- Stripe: not present in this segment (no SDK, no `stripe` identifiers, no `Stripe-Signature`).
- Webhooks: none inbound; no signature or replay logic in this segment.
- Outbound HTTP to the game's own API (`/api/...`): `phone/media.ts`, `prices.ts`, `profile/profile-window.ts`, `phone/apps/*`.
- Outbound static assets: `phone/core.ts` (`/phone/vibrate.wav`).
- Third-party script: YouTube IFrame API (`youtube-player.ts`).
- WebSocket room messages (not HTTP, noted for completeness): `phone.*`, `trade.*`, `moto.tow`, `pool.*`, `truco.*`, `inventory.sync`.

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/web/src/phone/apps/motors.ts` | `highmotors` | const (PhoneApp) | HighMotors app: garage, shop, buy, tow, paint |
| `apps/web/src/phone/apps/telefone.ts` | `telefone`, `contatos` | const (PhoneApp) | Telefone (recents, keypad) and Contatos apps |
| `apps/web/src/phone/apps/tools.ts` | `notas`, `calendario`, `relogio`, `calculadora`, `ajustes` | const (PhoneApp) | Notes, calendar, clock, calculator, settings apps |
| `apps/web/src/phone/apps/zap.ts` | `highzap` | const (PhoneApp) | Highzap chat: threads, media, voice notes |
| `apps/web/src/phone/core.ts` | `PhoneHost`, `PhoneContext`, `PhoneApp` | interface | Contracts between phone shell and apps |
| `apps/web/src/phone/core.ts` | `LocalStore` | class | Per-account localStorage wrapper, JSON with defaults merge |
| `apps/web/src/phone/core.ts` | `Gallery` | class | Camera roll in IndexedDB, max 60, memory fallback |
| `apps/web/src/phone/core.ts` | `PhoneSounds` | class | Synthesized ringtones and notifications, one fetch for vibration |
| `apps/web/src/phone/core.ts` | `avatar`, `header`, `timeAgo`, `initials` | function | Shared markup and formatting helpers |
| `apps/web/src/phone/filters.ts` | `PHOTO_FILTERS`, `applyFilter`, `drawFiltered` | const/function | Highgram colour matrix filters applied to pixels |
| `apps/web/src/phone/media.ts` | `recorderType`, `microphone`, `Recording` | function/class | MediaRecorder type pick, mic capture, recording wrapper |
| `apps/web/src/phone/media.ts` | `mediaUrl`, `sendZapMedia` | function | Fetch a Highzap attachment; POST raw bytes once per requestId |
| `apps/web/src/phone/media.ts` | `fitJpeg`, `postPhoto`, `profilePhoto` | function | Canvas crop and JPEG re-encode under a byte cap |
| `apps/web/src/phone/phone.ts` | `createPhone`, `Phone` | function/interface | Phone shell: calls, video frames, badges, buzz |
| `apps/web/src/phone/wallpapers.ts` | `WALLPAPERS` | const | Home screen wallpaper table |
| `apps/web/src/pool/panel.ts` | `createPoolPanel`, `PoolHooks`, `PoolControls` | function/interface | Pool table panel: aim, power charge, lobby, feed |
| `apps/web/src/pool/render.ts` | `createPoolRenderer`, `rackTurn`, `roll` | function | Canvas table renderer and per-pixel ball sprites |
| `apps/web/src/pool/sounds.ts` | `createPoolSounds` | function | Synthesized pool sounds (Web Audio, no files) |
| `apps/web/src/prices.ts` | `price`, `setPrices`, `loadPrices` | function | Client copy of the price table, GET `/api/prices` |
| `apps/web/src/profile/badge-card.ts` | `openBadgeCard`, `badgeMedal`, `studs`, `glints` | function | Tilting 3D badge card with glitter on the rarest |
| `apps/web/src/profile/floating-window.ts` | `floatingWindow` | function | Draggable window kept on screen, position remembered |
| `apps/web/src/profile/profile-window.ts` | `createProfileWindow`, `ProfileHooks` | function/interface | Profile window: status, badges, achievements, skills |
| `apps/web/src/settings.ts` | `createSettings`, `DEFAULT_SETTINGS`, `GameSettings` | function/const | Per-browser game preferences in localStorage |
| `apps/web/src/trade/trade.ts` | `createTrade`, `TradeHooks` | function/interface | Trade window and invitation, sends room messages |
| `apps/web/src/truco/card.ts` | `makeCard`, `paintCard`, `manilhaOf`, `suitSvg` | function | Playing card DOM and manilha rule |
| `apps/web/src/truco/sounds.ts` | `createTrucoSounds` | function | Truco sounds, built on blackjack's table sounds |
| `apps/web/src/truco/table.ts` | `createTrucoTable`, `TrucoHooks` | function/interface | Truco table panel: seats, centre, moves, lobby |
| `apps/web/src/ui-icons.ts` | `uiIcon`, `uiIconSource`, `itemImage`, `coins` | function | Inline Lucide icon set and item/coin markup |
| `apps/web/src/vehicle-hud.ts` | `createVehicleHud` | function | Vehicle dashboard HUD (speed, fuel, controls) |
| `apps/web/src/voice.ts` | `VoiceChat`, `CAPTURE_WORKLET` | class/const | Proximity voice: Opus or mu-law over the room, WebAudio |
| `apps/web/src/world-menu.ts` | `worldMenu`, `worldMenuOpen` | function | Right-click context menu at the pointer |
| `apps/web/src/youtube-player.ts` | `loadYoutubeApi`, `youtubeError` | function | Loads YouTube IFrame API once, maps error codes |

## Conventions observed
- **Naming**: camelCase functions and variables; PascalCase classes and interfaces; UPPER_SNAKE module constants (mostly, e.g. `DEFAULT_SETTINGS`, `PHOTO_FILTERS`, `CAPTURE_WORKLET`), with some lowercase file-local consts.
- **Error handling**: user-facing failures are Portuguese `Error` messages surfaced through `host.error`, `hooks.toast` or `hooks.notify`. Many best-effort paths use empty `catch{}` or `.catch(()=>{})` with no logging. `ApiError` carries `status` (`phone/media.ts:56`).
- **Logging**: no structured logging. Only `console.error` at `phone/phone.ts:168`, which logs an error object on app close.
- **Async style**: mixed. `async/await` in `phone/media.ts`, `trade`, `profile-window.ts`; `.then/.catch` chains in `phone/core.ts:201`, `phone/phone.ts:371-383`, `prices.ts:15`.
- **Type hints**: fully typed TypeScript. Frequent non-null assertions (`!`) and `as` casts on server data (e.g. `phone/media.ts:57`, `prices.ts:15`).

## Internal duplication
- `money`/number formatting: `phone/apps/motors.ts:12` and `trade/trade.ts:6` define the same `toLocaleString('pt-BR')` helper; the same expression is inlined in about 20 other places.
- Error-message pattern `error instanceof Error ? error.message : '...'` repeated across `phone/apps/telefone.ts:56,60`, `phone/apps/zap.ts:133,147,158,175`, `phone/apps/motors.ts:123`, `profile/profile-window.ts:175`.
- Lazy AudioContext plus gain envelope: `pool/sounds.ts:8-17`, `truco/sounds.ts:10-19`, `phone/core.ts:161-165`.
- Image path `${import.meta.env.BASE_URL}${...}`: `trade/trade.ts:7`, `ui-icons.ts:159`, `phone/phone.ts:137,181`.
- Initial-letter avatar: `phone/core.ts:83` (`avatar`) and `truco/table.ts:199` (`initial`).
- Leave-with-confirmation flow: `pool/panel.ts:410-415` and `truco/table.ts:458-462`.
- `clamp` defined locally in `pool/panel.ts:50` and `profile/badge-card.ts:22` with different signatures.

## Cross-segment hints
- `apps/web/src/api.ts:3`: the shared `api()` helper has no timeout and no `AbortSignal`. Every `api()` call in this segment inherits it (e.g. `profile/profile-window.ts:255`, `phone/apps/telefone.ts:55`, `phone/apps/zap.ts:132`, `phone/apps/motors.ts:37`). Route to the API-client or backend reviewer.
- Server-side idempotency for `requestId`-keyed writes (`/vehicles/buy`, `/phone/zap/:peer`, `/phone/zap/:peer/media`) must be verified in the backend segment; this segment assumes it.
- Room messages without acknowledgement: `moto.tow` (`phone/apps/motors.ts:150`) and `trade.*` (`trade/trade.ts:43,101-104`). Route to the realtime segment.
- `/phone/vibrate.wav` and `/api/prices` are served by the web host; cache and error headers belong to devops.

## Specialist findings
**Scope note:** no inbound webhook receivers, no Stripe SDK, no signature checks, and no payment-provider calls exist in this segment. The findings below cover outbound HTTP clients and the request-idempotency and retry behaviour of the client code.

1. **Medium**: non-idempotent retry on a coin purchase. `phone/apps/motors.ts:118` generates a fresh `requestId: crypto.randomUUID()` inside `buy()` on every call. A failed attempt sets `screen='offer'` (`motors.ts:123`), and the user can press Confirm again (`motors.ts:141`), which sends a new id. If the first request committed server-side but its response was lost, the retry is a second purchase the server cannot recognise as a duplicate. The client also does not refresh the vehicle list before the retry, so `buyBlocked()` (`motors.ts:43`) still reads stale counts. Fix: create the id once when the confirm screen opens and reuse it until success or an explicit cancel.

2. **Medium**: no timeout on the Highzap media upload. `phone/media.ts:54-56` POSTs raw bytes (up to `PHONE.videoMaxBytes`) with no `AbortSignal` and no timeout. `phone/apps/zap.ts:162-177` shows the bubble as pending (clock icon) until this resolves; a stalled connection leaves it pending indefinitely, because only a thrown error reaches the failure branch at `zap.ts:175`.

3. **Low**: no timeout on outbound fetches in this segment. `phone/media.ts:45` (attachment GET), `phone/core.ts:201` (WAV GET), `prices.ts:15` (price table GET), and `apps/web/src/api.ts:3` (cross-segment) all rely on the browser default.

4. **Low**: failure cached as success for vibration. `phone/core.ts:201` assigns `this.vibration??=fetch(...).then(...).catch(()=>undefined)`. A single transient failure caches `undefined` for the page lifetime, so vibration is silently disabled until reload. Fix: clear `this.vibration` in the catch and return `undefined`.

5. **Low**: partial success reported as failure. `phone/profile-window.ts:226` runs `api('/phone/contacts')` and then `api('/profile/...')` inside `change()`. If the second request fails, the user sees an error toast although the contact was saved.

6. **Low**: double-submit possible on contact save. `phone/apps/zap.ts:218` has no busy guard and no `requestId` (contrast `profile-window.ts:171-177`, which guards with `busy`). Two quick clicks send two `POST /phone/contacts`.

7. **Low**: unvalidated server response cast. `phone/media.ts:57` returns `data as ZapMessage` without shape checks. `zap.ts:171-173` then uses `sent.media?.id` to key local state.

8. **Low (accepted, note only)**: third-party script with no SRI. `youtube-player.ts:20` loads `https://www.youtube.com/iframe_api`. SRI is not possible for a dynamic Google API; the 15 s timeout (`youtube-player.ts:28`) and `onerror` path (`youtube-player.ts:30`) are present and correct.

### Webhook + client inventory
| Direction | Provider | File:Line | Sig verified? | Timeout | Retries | Notes |
|-----------|----------|-----------|---------------|---------|---------|-------|
| inbound | none in segment | — | n/a | n/a | n/a | No webhook receivers here |
| outbound | game API (shared `api()`) | `apps/web/src/api.ts:3` | n/a | none | none | Cross-segment; all `api()` callers inherit it |
| outbound | game API (Highzap media POST) | `phone/media.ts:54` | n/a | none | none | `requestId` present, not retried by client |
| outbound | game API (Highzap media GET) | `phone/media.ts:45` | n/a | none | none | Cache evicted on failure (`media.ts:46`) |
| outbound | game API (prices GET) | `prices.ts:15` | n/a | none | none | Errors swallowed; defaults kept by design |
| outbound | static asset (WAV) | `phone/core.ts:201` | n/a | none | none | Failure cached as `undefined` (finding 4) |
| outbound | game API (purchase POST) | `phone/apps/motors.ts:118` | n/a | none | none | New `requestId` per attempt (finding 1) |
| outbound | YouTube IFrame API | `youtube-player.ts:20` | n/a (no SRI) | 15 s (`youtube-player.ts:28`) | none | Error path present |

## Concerns / smells
1. Purchase retry creates a new idempotency key (`phone/apps/motors.ts:118,141`); a lost response can double-charge the player.
2. No timeouts on any outbound request in the segment, and none in the shared `api()` helper (`apps/web/src/api.ts:3`).
3. Pending UI states have no timeout path (`phone/apps/zap.ts:162-177`), so a stalled upload looks like a slow one forever.
4. Empty catches hide failures on best-effort paths (`phone/core.ts:201`, `prices.ts:15`, `phone/apps/zap.ts:374`, `phone/phone.ts:73`).
5. Repeated error-message and formatting helpers across the phone apps (see Internal duplication).

## Refactor suggestions
1. `phone/apps/motors.ts:118`: generate `requestId` once when the confirm screen opens (`motors.ts:102`); keep it through retries; clear on success or cancel.
2. `phone/media.ts:45,54`: add an `AbortSignal.timeout(...)` to both fetches; on abort, mark the zap bubble failed (`phone/apps/zap.ts:175`). Pair with a shared timeout in `apps/web/src/api.ts:3` (cross-segment).
3. `phone/core.ts:201`: reset `this.vibration` in the `.catch` so a transient failure can retry on the next buzz.
4. `phone/apps/zap.ts:218` and `phone/profile-window.ts:226`: add a busy guard to the contact save; split the two-step save so a partial success shows as success with a refresh.
5. `phone/apps/motors.ts:12` and `trade/trade.ts:6`: move `money` into a shared formatter module, and add one shared `errorText(error, fallback)` helper for the repeated `instanceof Error` pattern.
