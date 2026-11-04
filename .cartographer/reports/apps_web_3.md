# Segment: apps/web#3

**Reviewed by:** frontend-ui-reviewer

## Files reviewed
- `apps/web/http-redirect.ts`
- `apps/web/rigs.js`
- `apps/web/vite.config.ts`

## Integrations
- vite (dev server, preview, plugin hooks)
- @vitejs/plugin-basic-ssl
- playcanvas (engine, used by rigs.js)
- git CLI (spawned from vite.config.ts)
- Node `net`, `child_process`, `module`

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `apps/web/http-redirect.ts` | `redirectHttpToHttps` | function (exported) | Vite plugin: sniffs first byte, TLS vs plain-HTTP redirect |
| `apps/web/http-redirect.ts` | `redirect` | function | Answers plain HTTP with 301 to https, or 400 on bad Host |
| `apps/web/rigs.js` | `$` | const arrow | getElementById shorthand |
| `apps/web/rigs.js` | `ids` / `labels` | const arrays | Skin ids and display names, index-coupled |
| `apps/web/rigs.js` | `load` | function | Promise wrapper over `app.assets.loadFromUrl` |
| `apps/web/rigs.js` | `collect` | function | Snapshot of local TRS for a node tree (rest pose) |
| `apps/web/rigs.js` | `reset` | function | Restores actor rest pose |
| `apps/web/rigs.js` | `setCamera` | function | Positions camera from skin and view selects |
| `apps/web/rigs.js` | `layout` | function | Shows focused skin or lays out all actors in a row |
| `apps/web/rigs.js` | `source` | async function | Loads and caches a BAR animation container per group |
| `apps/web/rigs.js` | `select` | async function | Switches clip, retargets to every actor, resets pose |
| `apps/web/rigs.js` | `pose` | function | Sets clip time on all active states and UI clock |
| `apps/web/rigs.js` | `snapshot` | function | Bone positions per actor relative to root, for tests |
| `apps/web/rigs.js` | `ready` | const Promise | Loads all models and animation banks, then builds UI |
| `apps/web/rigs.js` | `window.rigFixture` | global | Test/debug API exposed on window |
| `apps/web/vite.config.ts` | `https` | const | HTTPS unless BAR_HTTPS=0 |
| `apps/web/vite.config.ts` | `engineBuild` | const | Picks PlayCanvas build (release, debug, profiler) |
| `apps/web/vite.config.ts` | `diagnosticCommit` / `diagnosticDirty` | let | Git revision injected as build define |
| `apps/web/vite.config.ts` | `engineWithoutMap` | plugin object | Strips engine source map from dev module |
| `apps/web/vite.config.ts` | `proxy` | const | `/api` and `/game` proxy targets |
| `apps/web/vite.config.ts` | default export | function | defineConfig factory per command (serve or build) |

## Conventions observed
- **Naming**: camelCase throughout. `rigs.js` uses single-letter and one-letter-helper identifiers (`$`, `pc`, `p`, `q`, `s`).
- **Error handling**: `http-redirect.ts` answers bad input with 400 and destroys oversize or timed-out sockets. `vite.config.ts` swallows git failures in empty `catch` blocks with comments. `rigs.js` lets `load` rejections propagate, with one `.catch` in `ready` that rethrows.
- **Logging**: none. Failures reach the UI status line (`rigs.js:43`) or are rethrown.
- **Async style**: promises and async/await in `rigs.js`. The Vite config is synchronous (`execFileSync`).
- **Type hints**: `http-redirect.ts` fully typed. `vite.config.ts` typed at the boundaries with a few `as const` and `as` casts. `rigs.js` is plain JS with no types, in a TypeScript project.
- **Formatting**: dense style. Many statements per line; `rigs.js` lines 20, 25, 34 and 38 each exceed 300 characters. `http-redirect.ts` and `vite.config.ts` are closer to conventional line breaks.
- **Imports**: `rigs.js` mixes absolute (`/src/engine/...`), relative (`../../packages/...`), and `.ts`-suffixed specifiers. Other files use `.js` suffixes for `.ts` modules.

## Internal duplication
- `vite.config.ts:17-18`: two `execFileSync` calls with near-identical option objects. Merge or extract a helper.
- `vite.config.ts:23-24` and `:31,:33`: `proxy` is shared by `server` and `preview`. This is intentional, not duplication.
- `rigs.js:48-49`: the two bone-line loops share the same skeleton of "for each actor, for each bone, find parent, draw line". Minor.

## Cross-segment hints
- `rigs.js:2,4` import `mixamo-retarget.ts` and `animation-tracks.ts` from `apps/web/src/engine`. Those modules belong to the engine segment, not this one.
- `rigs.js:3` imports `BAR_ANIMATIONS` from `packages/shared`. Shared animation metadata is consumed here without a runtime guard.
- `rigs.js:20` fetches `/animacoes/`, `/models/`, and `/animations/` assets from the static dir. Asset presence is not checked here.
- `vite.config.ts:24` depends on the game server's `GAME_PORT` default of 2567, which is defined in another segment.
- `http-redirect.ts` and `vite.config.ts` form one dev-server concern. They are in the same segment and reviewed together.

## Specialist findings

### Component inventory
None. This segment contains no JSX, TSX, Vue, or Svelte components, and no React, Vue, or Svelte hooks. `rigs.js` is an imperative PlayCanvas fixture page that builds its own DOM controls (`rigs.js:39-41`) and writes text and styles directly. The `frontend-ui-reviewer` checklist (hook misuse, prop drilling, keys, a11y on components) does not apply to these files.

### Findings

- **`rigs.js:20` and `rigs.js:44`, failed clip loads are cached and never reported. Severity: med.**
  `source()` stores the rejected promise in `loading` (`loading.set(group, load(...).then(...))`). Every later request for that group rejects without retrying. `select()` sets "Preparando clipe…" at `:21`, and the rejection is never caught there. The change handler at `:44` calls `void select(...)`, which discards the promise. Result: the status line stays on "Preparando clipe…" and an unhandled rejection is logged.

- **`rigs.js:43`, `ready` rethrows after writing status. Severity: low.**
  `.catch` writes the error message and then `throw error;`. `window.rigFixture.ready` (`:52`) is exposed, and any caller that does not await or catch it gets an unhandled rejection.

- **`rigs.js:6-7` and `:47`, index-coupled parallel arrays. Severity: low.**
  `ids[i]`, `labels[i]`, and `$('names').children[i]` are kept in step only by construction order (`:39`). Any reordering, filtering, or extra child element in `#names` silently mislabels actors. Use one array of `{id, label}` or `data-id` attributes.

- **`rigs.js:48-49`, per-frame graph lookups and allocations when overlays are on. Severity: low.**
  Each frame, with the skeleton or reference overlay checked, `findByName` runs for every bone of every actor (`:48`, `:49`). `:49` also clones two `Vec3` per bone per frame. `:47` allocates a `Vec3` and calls `worldToScreen` for every label every frame. Cache the bone nodes once in `actors` (or `referenceSource.nodes`) and reuse scratch vectors.

- **`http-redirect.ts:16-18`, no `error` listener before the first byte. Severity: med (unverified).**
  The socket gets `once('readable')` with no `'error'` listener until `redirect()` runs at `:30`. The TLS path (`:20`) hands the socket to the TLS listener, but the window between connection and first readable has no error handler on the raw socket. If the client resets in that window, the unhandled `'error'` event could crash the dev server. Not reproduced here; this is from reading the code.

- **`http-redirect.ts:12-14`, silent fallback on Node and Vite internals. Severity: med.**
  The plugin depends on `setSecureContext` being present on `httpServer` and on the TLS listener being the only `'connection'` listener. If a Vite or Node upgrade changes either, `configureServer` returns early (`:12`) with no warning. Plain HTTP would then hit the TLS server and fail with a handshake error. Log a warning when the check fails.

- **`http-redirect.ts:16`, idle sockets before first byte have no timeout. Severity: low.**
  The 5 s timeout is set only in `redirect()` (`:29`). A client that connects and sends nothing holds the socket until it closes. Dev-only, so low.

- **`http-redirect.ts:36`, absolute-form request targets fall back to `/`. Severity: low.**
  A request line like `GET http://host/path HTTP/1.1` does not match `^[A-Z]+ (\/...)`, so the redirect goes to `/` and drops the path. Path injection into `Location` is not possible here, since `[^ \r\n]*` excludes CR and LF.

- **`vite.config.ts:17-18`, two synchronous git spawns on every config load. Severity: low.**
  `git status --porcelain` on a large working tree can take seconds and runs on every `vite` and `vite build` start. Both calls block config loading. Cache the result or run them once.

- **`vite.config.ts:21`, transform keyed to Vite's internal dep path. Severity: low.**
  The regex `\/\.vite\/deps\/playcanvas\.js$` matches a path Vite generates internally. A Vite version change could silently stop the source-map strip (or the engine check).

- **`vite.config.ts:23`, `/api` target is hard-coded to port 3001. Severity: low.**
  `/game` reads `GAME_PORT` (`:24`), but `/api` has no equivalent override, so the two proxies are configured inconsistently.

### Other checks (no finding)
- Accessibility: no clickable `<div>` or unlabeled input is created in these files. The controls live in an HTML page not in this segment.
- Hook misuse, prop drilling, state duplication, data-fetching drift: not applicable (no framework).
- Server/client boundary: not applicable. `vite.config.ts` runs in Node only, and `http-redirect.ts` is Node-only.
- Style system: `rigs.js` sets inline `style.display`, `style.left`, and `style.top` (`:19`, `:47`). Acceptable for a fixture page.
- Security: `http-redirect.ts:37-39` validates the Host header against `[A-Za-z0-9.\-:[\]]` before building `Location`. Good.

## Concerns / smells
1. `rigs.js:20,44`: failed loads are cached forever and the UI sticks on "Preparando clipe…". Fix in `source()` and in the change handler.
2. `http-redirect.ts:12-16`: relies on Node and Vite internals and has no `'error'` listener before the first byte. Silent failure on upgrade, possible crash on reset.
3. `rigs.js` overall: untyped JS in a TypeScript project, with very dense single-line statements (over 300 characters on lines 20, 25, 34, 38). Hard to review.
4. `vite.config.ts:17-18`: synchronous git calls run on every config load.
5. `rigs.js:6-7,47`: actor identity is carried by parallel arrays and DOM child indexes.

## Refactor suggestions
1. **`rigs.js:20`, `:44`**: delete the `loading` entry on rejection, and `.catch` in the change handler to set `$('status')`. Replace `void select(...)` with an explicit catch.
2. **`rigs.js:6-7,39,47`**: replace `ids`, `labels`, and index-coupled `children[i]` with one `{id, label}` array and a `data-id` on each label element.
3. **`rigs.js:48-49`**: store bone nodes once when the actor is built (`actors` entry or a per-source map), and reuse a scratch `Vec3` in the overlay loops.
4. **`http-redirect.ts:16`**: attach `socket.on('error', ...)` right after the connection listener runs, and give the pre-readable phase its own timeout. Log once if the TLS-listener detection at `:12` fails.
5. **`vite.config.ts:17-18,23`**: run git once (or cache it), and add `API_PORT` (default 3001) to mirror `GAME_PORT`.
