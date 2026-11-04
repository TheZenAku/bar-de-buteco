# Backlog (not applied: Phase 7 is opt-in)

```fix-1
summary: Reject non-positive quantity in inventory buy and remove
severity: P2
triage: Route already validates quantity (apps/api/src/app.ts:259, 504: int, min 1, max 10). Hardening only.
files: apps/api/src/inventory-service.ts
location: apps/api/src/inventory-service.ts:41-46, 66-76
description: |
  buy() multiplies price by quantity without checking it is a positive integer. A negative quantity
  makes cost negative and credits coins. remove() accepts negative quantity and grows the stack.
fix: |
  Guard both methods: require Number.isSafeInteger(quantity) && quantity > 0 and throw a 400 error otherwise.
verification: tsc --noEmit -p apps/api && existing API tests
```

```fix-2
summary: Pending wallet credits lost on world restart
severity: P0
files: apps/server/src/world/wallet.ts
location: apps/server/src/world/wallet.ts:23
description: |
  WalletRetries keeps failed credits in an in-memory array, but the comment promises an API outage only delays them.
fix: |
  Persist pending credits through the existing outbox so they survive a restart. Needs a design decision first.
verification: unit test that a credit survives a simulated restart
```

```fix-3
summary: Add error listener to the API pg pool
severity: P0
files: apps/api/src/database/index.ts
location: apps/api/src/database/index.ts:107-109
description: |
  new pg.Pool(...) has no 'error' listener, so an idle-client error can crash the process.
fix: |
  After creating the pool, attach pool.on('error', err => log and continue).
verification: tsc --noEmit -p apps/api
```

```fix-4
summary: Add error listener to the world bots child process
severity: P1
files: apps/server/src/world/bots.ts
location: apps/server/src/world/bots.ts:51-70
description: |
  The bots child process has no 'error' listener, so an IPC or spawn failure may crash the world. Not confirmed by a test.
fix: |
  Attach child.on('error') that logs bots_unreachable and clears this.child.
verification: test with a child that exits immediately
```

```fix-5
summary: Fail closed on missing production secret
severity: P2
triage: infra/compose.yml (lines 48, 63, 94) and infra/docker/Dockerfile set NODE_ENV=production, so the fallback is not reachable in the shipped services. Risk is local runs against real data only.
files: packages/shared/src/tickets.ts, tools/ops/pseudonym.mjs
location: packages/shared/src/tickets.ts:8-12; tools/ops/pseudonym.mjs:16-18
description: |
  Both fall back to a public literal secret when NODE_ENV is not exactly "production".
fix: |
  Throw when no secret is set, regardless of NODE_ENV. Keep the literal only behind an explicit local-dev flag.
verification: unit test with NODE_ENV unset and no secret expects a throw
```

```fix-6
summary: Add timeout and abort to the shared api() helper
severity: P1
files: apps/web/src/api.ts
location: apps/web/src/api.ts:3
description: |
  fetch() has no timeout or AbortSignal, so every web request can hang.
fix: |
  Wrap fetch with an AbortController and a default timeout (about 15 s), overridable per call.
verification: tsc --noEmit -p apps/web
```

```fix-7
summary: Guard null ponto() lookups in moto delivery
severity: P1
files: apps/web/src/engine/moto-delivery.ts
location: apps/web/src/engine/moto-delivery.ts:219, 221
description: |
  rig.ponto(...) can return null for a missing node, and the code dereferences it without a guard.
fix: |
  Use optional chaining or return early when the node is missing, as the other call sites already do.
verification: tsc --noEmit -p apps/web
```

```fix-8
summary: Reuse one request id per user action in phone and vehicle clients
severity: P1
files: apps/web/src/phone/apps/bank.ts, apps/web/src/phone/apps/gram.ts, apps/web/src/phone/apps/motors.ts
location: bank.ts:54; gram.ts:295; motors.ts:118
description: |
  Each press generates a new crypto.randomUUID(), so a retry after a lost response is not recognised as a duplicate.
fix: |
  Generate the id when the action starts (on open or confirm screen) and reuse it until the request settles.
verification: manual retry test; e2e for Pix transfer
```
