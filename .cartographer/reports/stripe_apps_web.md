# Segment: stripe@apps/web

**Reviewed by:** webhook-integration-reviewer

**Scope note:** The segment label says "stripe", but none of the 40 listed files contain a Stripe SDK import, a Stripe call, a webhook route, or signature code. The segment is mostly client-side UI (phone apps, media players, HUD, networking). It was routed here by the generic HTTP/`api(` pattern. Coverage: all 40 files were grep-scanned for integration signals (fetch, api, script/iframe loads, storage, timers, webhook/stripe/signature terms). Read by range: `main.ts:795-807, 1028-1036, 1205-1224`, `networking.ts:110-143`, `media/player.ts:25-82`, `media/file.ts:18-40`, `media/platforms.ts:115-128`, `phone/apps/bank.ts:45-80`, `phone/apps/gram.ts:286-300`. The other files were not read in full, so no finding is claimed from them.

## Files reviewed
- `apps/web/src/foosball/render.ts` (grep only)
- `apps/web/src/foosball/sounds.ts` (grep only)
- `apps/web/src/fuel-hud.ts` (grep only)
- `apps/web/src/fullscreen.ts` (grep only)
- `apps/web/src/game-ui.ts` (grep only)
- `apps/web/src/garage-panel.ts` (grep only)
- `apps/web/src/gps.ts` (grep only)
- `apps/web/src/graphics.ts` (grep only)
- `apps/web/src/highfood/courier.ts` (grep only)
- `apps/web/src/highfood/locker.ts` (grep only)
- `apps/web/src/highfood/npc-avatar.ts` (grep only)
- `apps/web/src/hud-panels.ts` (grep only)
- `apps/web/src/jukebox.ts` (grep only)
- `apps/web/src/light-desk.ts` (grep only)
- `apps/web/src/lobby-hero.ts` (grep only)
- `apps/web/src/lobby-menu.ts` (grep only)
- `apps/web/src/main.ts` (range reads)
- `apps/web/src/media/file.ts` (range read)
- `apps/web/src/media/platforms.ts` (range read)
- `apps/web/src/media/player.ts` (range reads)
- `apps/web/src/minimap.ts` (grep only)
- `apps/web/src/moto-panel.ts` (grep only)
- `apps/web/src/mouse-capture.ts` (grep only)
- `apps/web/src/needs-hud.ts` (grep only)
- `apps/web/src/networking.ts` (range read)
- `apps/web/src/notifications.ts` (grep only)
- `apps/web/src/objective-blip.ts` (grep only)
- `apps/web/src/performance/browser.ts` (grep only)
- `apps/web/src/performance/frames.ts` (grep only)
- `apps/web/src/performance/hud.ts` (grep only)
- `apps/web/src/performance/inventory.ts` (grep only)
- `apps/web/src/performance/monitor.ts` (grep only)
- `apps/web/src/performance/recording.ts` (grep only)
- `apps/web/src/performance/report.ts` (grep only)
- `apps/web/src/performance/view.ts` (grep only)
- `apps/web/src/phone/apps/bank.ts` (range read)
- `apps/web/src/phone/apps/camera.ts` (grep only)
- `apps/web/src/phone/apps/gram.ts` (range reads)
- `apps/web/src/phone/apps/highfood.ts` (grep only)
- `apps/web/src/phone/apps/maps.ts` (grep only)

## Integrations
- none external-SDK in this segment (no Stripe, GitHub, Twilio, SendGrid, Resend)
- platform embeds loaded by script or iframe: YouTube, Spotify (iframe API), Vimeo, SoundCloud, Mixcloud, TikTok, Twitch (via `media/`)
- hls.js (dynamic import, `media/file.ts:31`)
- internal game API via `api()` from `apps/web/src/api.ts` (outside this segment)

## Symbol inventory
Only integration-relevant symbols were inventoried.

| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/web/src/networking.ts` | `BarNetwork` | class | Realtime room connection; ticket fetch and join retry |
| `apps/web/src/networking.ts` | `BarNetwork.connect` | method | Fetches `/game-ticket`, joins room, retries while full (`:118`) |
| `apps/web/src/media/player.ts` | `scriptLoader` | function | Loads a platform script once, 15 s timeout, retry after failure (`:31`) |
| `apps/web/src/media/player.ts` | `frameIn` | function | Replaces a slot with a platform iframe, sets allow and referrerPolicy (`:78`) |
| `apps/web/src/media/file.ts` | `FilePlayer` | class | Plays file/HLS media; lazy-loads hls.js (`:11`) |
| `apps/web/src/media/file.ts` | `FilePlayer.load` | method | Native or hls.js load of the media URL (`:27`) |
| `apps/web/src/media/platforms.ts` | `loadSpotify` | function | Injects Spotify iframe API script, 15 s timeout (`:119`) |
| `apps/web/src/media/platforms.ts` | `playerError` | function | Maps platform error codes to user text (`:266`) |
| `apps/web/src/phone/apps/bank.ts` | `send` | function | Pix transfer; sends a fresh `requestId` per call (`:50`) |
| `apps/web/src/phone/apps/gram.ts` | (publish handler) | closure | Highgram photo post; fresh `requestId` per submit (`:295`) |
| `apps/web/src/main.ts` | `mailbox` | function | Dev-only mail viewer, gated by `import.meta.env.DEV` (`:795`) |
| `apps/web/src/main.ts` | `start` | function | Boot; reads `?verify=` and `?reset=` from URL (`:1215`) |

## Conventions observed
- **Naming**: camelCase for functions and variables; PascalCase for classes and interfaces; mixed-case constants (`PLAYING`, `FRAME_ALLOW`).
- **Error handling**: try/catch with `error instanceof Error ? error.message : ...` into toast or host error; `catch{}` with comment for best-effort storage and timers.
- **Logging**: `console.error` only at `main.ts:1214`; no structured logging.
- **Async style**: async/await in the main paths; promise chains with `void` in UI handlers.
- **Type hints**: TypeScript throughout; `as unknown as` casts for third-party globals (`media/platforms.ts:125`).

## Internal duplication
- Fresh `crypto.randomUUID()` per click for idempotent writes appears in `phone/apps/bank.ts:54` and `phone/apps/gram.ts:295` (same bug class, see Specialist findings).
- Script-loader pattern is duplicated: `scriptLoader` (`media/player.ts:31`) and `loadSpotify` (`media/platforms.ts:119`) both inject a script with a 15 s timeout and manual reset. `loadSpotify` could use `scriptLoader`.

## Cross-segment hints
- `api()` in `apps/web/src/api.ts` is the only HTTP client here. Its timeout, retry, and abort behaviour is unverified from this segment and decides the real risk for every call in `main.ts`, `networking.ts`, `phone/apps/*`.
- Server must honour `requestId` on `/phone/bank/pix`, `/phone/gram/posts`, `/phone/gram/posts/:id/comments`, `/wardrobe/buy`, `/inventory/buy`. The client sends it; dedupe is not verifiable here.
- Dev mail route is gated server-side at `apps/api/src/app.ts:626` (`!config.production && config.mailEnabled`). Good, but belongs to the API segment.
- Third-party script injection (`media/player.ts:36`, `media/platforms.ts:122`) has no SRI and no CSP in this segment. CSP check belongs to the devops/config segment.
- Verify and reset tokens travel in the page URL (`main.ts:1215-1217`). Route handling is in the auth segment.

## Specialist findings

### Webhook + client inventory
| Direction | Provider | File:Line | Sig verified? | Timeout | Retries | Notes |
|-----------|----------|-----------|---------------|---------|---------|-------|
| inbound | none | — | n/a | n/a | n/a | No webhook receiver in this segment |
| outbound | game API (`api()`) | `main.ts:416`, `networking.ts:122`, `phone/apps/bank.ts:54`, `phone/apps/gram.ts:127` | n/a | unverified (`api.ts` not in segment) | unverified | Same-origin game API, not a webhook; auth mechanism not verified here |
| outbound | Spotify iframe API | `media/platforms.ts:122` | n/a | 15 s | none (reset on fail) | No SRI |
| outbound | platform script loader | `media/player.ts:36` | n/a | 15 s | none (reset on fail) | No SRI |
| outbound | platform iframes (YouTube, Twitch, Vimeo, etc.) | `media/player.ts:80` | n/a | n/a | n/a | `allow` list and `strict-origin-when-cross-origin` set |
| outbound | hls.js chunk | `media/file.ts:31` | n/a | none | none | Unhandled if import rejects (see finding 3) |

### Findings

1. **Duplicate Pix transfer on retry**, med. `apps/web/src/phone/apps/bank.ts:52-58`. `requestId: crypto.randomUUID()` is created inside `send()` on each press. After an error (line 57) `sending` resets and the user can press again. A new key is sent. If the first request reached the server and only the response was lost, the second press creates a second transfer. Fix: keep one `requestId` per pending intent, reuse it on retry, clear it on success or cancel.

2. **Duplicate Highgram post on retry**, med. `apps/web/src/phone/apps/gram.ts:295-297`. Same pattern: the key is generated per click; on failure (line 297) the submit is re-enabled and a second click posts again with a new key. Same fix as finding 1.

3. **Unhandled rejection when hls.js fails to load**, low. `apps/web/src/media/file.ts:25` runs `void this.load().then(...)` with no `.catch`. `load()` awaits `import('hls.js')` at line 31. If the chunk fails to load, the rejection is unhandled, `announce()` never runs, and the player does not call `fail()`. Result: a stuck player with no error state.

4. **Unbounded join retry while room is full**, low. `apps/web/src/networking.ts:121-132`. The loop continues while `!this.stopped`, with a fixed 3 s delay (line 129) and no attempt cap or backoff. Each pass fetches a new `/game-ticket` (line 122). If the server never frees a slot, this polls forever. The `/game-ticket` call on line 122 is outside the try block, so a network error from it leaves `connect()` by throwing, not by the retry path. Whether the caller handles that throw is outside this segment.

5. **Auth tokens in the page URL**, low-med. `apps/web/src/main.ts:1216-1217`. The `verify` and `reset` tokens are read from `location.search`. `replaceState` clears the URL only after success for verify (line 1216) and after password reset (line 1034). The reset token stays in the URL while the user types a new password. Tokens in URLs enter browser history and logs. Mitigation: read the token and call `history.replaceState` before the API call. Note that cross-origin iframes get origin-only referrer, which limits leakage to third parties.

6. **No SRI on third-party scripts**, low. `apps/web/src/media/player.ts:36` and `apps/web/src/media/platforms.ts:122` inject external scripts without `integrity`. Dynamic sources (YouTube, Spotify) make SRI hard; the risk is accepted by design. Flag only for the CSP review.

Negative checks (no issue found): no inbound signature code and no webhook routes in this segment; `phone/apps/bank.ts:78-80` restricts the lookup digits with `phoneDigits` and `PHONE_NUMBER` before URL interpolation; `main.ts:796` gates the dev mailbox with `import.meta.env.DEV`; `main.ts:801-804` escapes mail content with `e()`; `main.ts:1031-1034` forgot-password message is generic (no account enumeration); `gram.ts:147` debounced search is guarded by `searchId` so stale responses are dropped.

## Concerns / smells
- Two write paths (`bank.ts:54`, `gram.ts:295`) regenerate the idempotency key per click. This is the real risk in this segment.
- The HTTP client that matters (`api.ts`) is out of segment; timeouts and retries for every call here are unknown.
- Unbounded reconnect loop (`networking.ts:121`) with fixed 3 s delay.
- Tokens in query string (`main.ts:1215-1217`).
- Stripe is absent. The segment label is likely a routing false positive; re-check the segmenter's match rules.

## Refactor suggestions
1. `apps/web/src/phone/apps/bank.ts:50-58`: hold `requestId` in a closure variable set when the Pix intent starts; reuse it on retry; clear on success or cancel.
2. `apps/web/src/phone/apps/gram.ts:295-297`: same key handling for the publish submit.
3. `apps/web/src/media/file.ts:25`: add `.catch(error => this.fail(FAILED))` to the `load()` chain so a hls.js chunk failure surfaces.
4. `apps/web/src/networking.ts:121-132`: cap attempts (or back off to a max) and surface a "try again later" state after the cap.
5. `apps/web/src/media/platforms.ts:119-127`: reuse `scriptLoader` from `media/player.ts:31` instead of the duplicate loader.
