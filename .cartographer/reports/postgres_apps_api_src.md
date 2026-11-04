# Segment: postgres@apps/api/src

**Reviewed by:** db-schema-reviewer

**Scope note:** `database/schema.ts`, `database/index.ts`, `app.ts` and `config.ts` are outside this list and were not read. Index, FK and CHECK claims below are marked "unverified" unless the code in this segment shows them. The api segment report (`reports/api_apps_api.md`) was skimmed for cross-references only.

## Files reviewed
- `apps/api/src/achievement-service.ts`
- `apps/api/src/admin-policy.ts`
- `apps/api/src/admin-service.ts`
- `apps/api/src/admin.ts`
- `apps/api/src/auth/service.ts`
- `apps/api/src/control-outbox.ts`
- `apps/api/src/dev-bots.ts`
- `apps/api/src/fuel-service.ts`
- `apps/api/src/highfood-service.ts`
- `apps/api/src/index.ts`
- `apps/api/src/inventory-service.ts`
- `apps/api/src/mail.ts`
- `apps/api/src/phone-service.ts`
- `apps/api/src/pricing-service.ts`
- `apps/api/src/profile-service.ts`
- `apps/api/src/seed.ts`
- `apps/api/src/trade-service.ts`
- `apps/api/src/wallet-service.ts`
- `apps/api/src/wardrobe.ts`

## Integrations
- postgres (via the `Database` handle; drizzle-orm query builder and `tx.execute` raw SQL)
- drizzle-orm (`db.transaction`, `.for('update'|'share')`, `onConflictDoNothing`, `onConflictDoUpdate`)
- smtp via nodemailer (`mail.ts` only, not a DB integration)

## Symbol inventory
| File | Symbol | Kind | Header |
|------|--------|------|--------|
| `achievement-service.ts` | `badgeColumns` | const | Badge column projection, duplicated in profile-service.ts:9 |
| `achievement-service.ts` | `AchievementService` | class | Counters per player and series; goals grant badges |
| `achievement-service.ts` | `AchievementService.add` | method | Adds counters and grants badges for crossed goals, one transaction |
| `achievement-service.ts` | `AchievementService.unlocked` | method | Marks unnotified badges as told and returns them with catalog data |
| `achievement-service.ts` | `AchievementService.view` | method | Every series with the player's counter and tier ownership |
| `admin-policy.ts` | `OWNER_EMAIL` | const | Hard-coded owner account e-mail |
| `admin-policy.ts` | `isOwnerEmail` | function | Case-insensitive owner e-mail comparison |
| `admin-policy.ts` | `ensureOwnerAdministrator` | function | Promotes the owner account to admin at boot, locked, with audit row |
| `admin-service.ts` | `Transaction` | type | Drizzle transaction handle type |
| `admin-service.ts` | `AdminError` | class | Admin error with HTTP status |
| `admin-service.ts` | `activeBans` | const | SQL predicate for bans in force (one of three copies) |
| `admin-service.ts` | `WalletAdjustment`, `ModerationCommand` | interface | Admin command shapes |
| `admin-service.ts` | `AdminService` | class | Player list, audit, wallet, roles, moderation and reverts |
| `admin-service.ts` | `AdminService.actor` | method | Loads the acting admin with a share lock or throws 403 |
| `admin-service.ts` | `AdminService.permissions` | method | Owner, moderate, wallet and role rights for a target |
| `admin-service.ts` | `AdminService.audits` | method | Newest audit rows with whether each can be reverted |
| `admin-service.ts` | `AdminService.accountStates` | method | Active bans, open kicks and rights for a set of accounts |
| `admin-service.ts` | `AdminService.overview` | method | Player table, counts, recent audit and reports for the panel |
| `admin-service.ts` | `AdminService.adjustWallet` | method | Idempotent wallet add, remove or set with ledger and audit |
| `admin-service.ts` | `AdminService.changeRole` | method | Owner-only grant or revoke of admin role |
| `admin-service.ts` | `AdminService.moderate` | method | Kick, ban, unban, unkick or event; writes controls outbox row |
| `admin-service.ts` | `AdminService.revert` | method | Reverts an audited action if still safe; marks original revoked |
| `admin.ts` | (script) | module | CLI that grants admin to a verified account |
| `auth/service.ts` | `SESSION_DAYS`, `hashToken`, `newToken`, `hashPassword` | const, function | Session length, token hash, token and argon2id password helpers |
| `auth/service.ts` | `getUser` | function | Public user from users and profiles join |
| `auth/service.ts` | `isBanned` | function | True when an unrevoked, unexpired ban exists |
| `auth/service.ts` | `readSession` | function | Resolves token to session and user, refusing banned users |
| `auth/service.ts` | `createSession` | function | Inserts a hashed session row for seven days |
| `auth/service.ts` | `blockedIds` | function | Ids this user has blocked |
| `control-outbox.ts` | `CONTROL_OUTBOX` | const | Lease, attempts, batch and retention constants |
| `control-outbox.ts` | `leaseControls` | function | Leases a batch of pending or expired controls for one world |
| `control-outbox.ts` | `acknowledgeControls` | function | Confirms or fails rows still leased to this owner |
| `control-outbox.ts` | `claimControlsOnce` | function | Legacy poll: leases and confirms in one step (at-most-once) |
| `dev-bots.ts` | `DevBots` | class | Creates or refreshes development bot accounts and sessions |
| `dev-bots.ts` | `DevBots.prepare` | method | Ensures one bot account, its inventories, coins and a session |
| `fuel-service.ts` | `FuelPayments` | class | Holds coins for a fuel service and settles it |
| `fuel-service.ts` | `FuelPayments.reserve` | method | Holds up to a maximum from the wallet, idempotent by service id |
| `fuel-service.ts` | `FuelPayments.settle` | method | Charges the final amount once; tombstone if reserve never arrived |
| `highfood-service.ts` | `HighfoodError` | class | Highfood error with HTTP status |
| `highfood-service.ts` | `DeliveryRecord`, `LostOrder` | interface | Delivery and lost-order inputs from the world |
| `highfood-service.ts` | `HighfoodService` | class | Vehicles, garage, delivery pay, history and customers |
| `highfood-service.ts` | `HighfoodService.owned` | method | Vehicles whose key the player holds, oldest first |
| `highfood-service.ts` | `HighfoodService.ownershipAudit` | method | Raw aggregate counts for vehicle ownership, for inspection |
| `highfood-service.ts` | `HighfoodService.vehicle` | method | Vehicle shop view with prices and the player's garage |
| `highfood-service.ts` | `HighfoodService.addVehicle` | method | Inserts a vehicle with a free plate, retrying on collision |
| `highfood-service.ts` | `HighfoodService.buy` | method | Buys a vehicle once per receipt, with limit and balance checks |
| `highfood-service.ts` | `HighfoodService.paint` | method | Changes a car's colour if the player holds its key |
| `highfood-service.ts` | `HighfoodService.saveVehicles` | method | Writes parts, mileage and fuel for vehicles from the world |
| `highfood-service.ts` | `HighfoodService.access` | method | Owned vehicles for the access endpoint |
| `highfood-service.ts` | `HighfoodService.setVehicle` | method | Admin grants or revokes a vehicle with audit and sync control |
| `highfood-service.ts` | `HighfoodService.complete` | method | Pays a delivery once per order under the daily cap |
| `highfood-service.ts` | `HighfoodService.lost` | method | Records an order that never arrived |
| `highfood-service.ts` | `HighfoodService.view` | method | Delivery statistics, rating, week and recent history for a player |
| `highfood-service.ts` | `HighfoodService.rating` | method | Average of the last 50 star ratings |
| `highfood-service.ts` | `HighfoodService.customers` | method | Active or all Highfood customer profiles |
| `highfood-service.ts` | `HighfoodService.saveCustomer` | method | Creates or edits a customer profile with audit |
| `highfood-service.ts` | `HighfoodService.usesImage` | method | Name of a customer using a given image id, if any |
| `highfood-service.ts` | `HighfoodService.stats` | method | Administration totals for deliveries and vehicles |
| `index.ts` | (script) | module | Boots the API and wires SIGINT and SIGTERM to close |
| `inventory-service.ts` | `InventoryError`, `InventoryReason` | class, type | Inventory error and removal reasons |
| `inventory-service.ts` | `InventoryService` | class | Persistent item stacks, purchases and removals |
| `inventory-service.ts` | `InventoryService.initialize` | method | Grants starter items once per player, inside a transaction |
| `inventory-service.ts` | `InventoryService.view` | method | Stacks, balance, recent history and keys (initializes first) |
| `inventory-service.ts` | `InventoryService.buy` | method | Buys a stack quantity once per request id, under wallet lock |
| `inventory-service.ts` | `InventoryService.remove` | method | Removes or uses items once per request id |
| `inventory-service.ts` | `InventoryService.access` | method | Stacks and balance for the access endpoint |
| `mail.ts` | `MailMessage`, `Mailer` | interface, class | Sends verify and reset e-mails; keeps dev copies in memory |
| `phone-service.ts` | `PhoneError`, `GRAM_POSTS_PER_ACCOUNT` | class, const | Phone error and per-account post limit |
| `phone-service.ts` | `PhoneService` | class | Phone numbers, contacts, Highzap, Highgram and HighBank Pix |
| `phone-service.ts` | `PhoneService.line` | method | Draws and stores a player's unique phone number |
| `phone-service.ts` | `PhoneService.profile` | method | Number, saved contacts and unread count for the phone |
| `phone-service.ts` | `PhoneService.threads` | method | Latest message and unread count per conversation (up to 1000 rows) |
| `phone-service.ts` | `PhoneService.thread` | method | One conversation page; marks the peer's messages read |
| `phone-service.ts` | `PhoneService.send` | method | Sends a text message once per request id |
| `phone-service.ts` | `PhoneService.sendMedia` | method | Stores a photo, voice note or video once and trims the quota |
| `phone-service.ts` | `PhoneService.media` | method | Returns an attachment to its sender or recipient only |
| `phone-service.ts` | `PhoneService.updateGram` | method | Changes Highgram name, handle, bio or photo |
| `phone-service.ts` | `PhoneService.follow` | method | Follows or unfollows a player |
| `phone-service.ts` | `PhoneService.search` | method | Highgram search by handle, name or account name |
| `phone-service.ts` | `PhoneService.suggestions` | method | Ranks people to follow from follows, contacts, room and popularity |
| `phone-service.ts` | `PhoneService.card` | method | Player card: number, saved flag and Highgram summary |
| `phone-service.ts` | `PhoneService.feed` | method | Highgram posts for following or all, cursor by time |
| `phone-service.ts` | `PhoneService.gramProfile` | method | Highgram profile header with up to 60 posts |
| `phone-service.ts` | `PhoneService.createPost` | method | Creates a post once per request id, with a per-account cap |
| `phone-service.ts` | `PhoneService.photo` | method | Post photo bytes, decoded from base64 |
| `phone-service.ts` | `PhoneService.deletePost` | method | Deletes a post for its author or an administrator |
| `phone-service.ts` | `PhoneService.like` | method | Likes or unlikes a visible post |
| `phone-service.ts` | `PhoneService.comment` | method | Adds a comment once per request id and returns the list |
| `phone-service.ts` | `PhoneService.bank` | method | HighBank balance, daily Pix total and latest ledger entries |
| `phone-service.ts` | `PhoneService.pix` | method | Moves coins between two wallets once per request id |
| `pricing-service.ts` | `PricingError`, `PriceChange` | class, interface | Pricing error and one price change |
| `pricing-service.ts` | `PricingService` | class | Effective price table: defaults plus audited overrides, cached 5 s |
| `pricing-service.ts` | `PricingService.table` | method | Effective price table, cached per instance for the TTL |
| `pricing-service.ts` | `PricingService.get` | method | One price by key, falling back to defaults then zero |
| `pricing-service.ts` | `PricingService.rows` | method | Admin price rows with override state and last editor |
| `pricing-service.ts` | `PricingService.change` | method | Applies several prices in one transaction with one audit and control |
| `profile-service.ts` | `ProfileError` | class | Profile error with HTTP status |
| `profile-service.ts` | `pngSize` | function | Width and height of a PNG read from its chunks |
| `profile-service.ts` | `ProfileService` | class | Profile window, badges, loadouts and badge catalog and images |
| `profile-service.ts` | `ProfileService.view` | method | Profile card with badges, and skills for the owner |
| `profile-service.ts` | `ProfileService.showBadges` | method | Sets the ordered badges on show, only those the player owns |
| `profile-service.ts` | `ProfileService.setLoadout` | method | Sets the active skill and key for the worn skin, locked |
| `profile-service.ts` | `ProfileService.saveBadge` | method | Creates or edits a badge with audit |
| `profile-service.ts` | `ProfileService.deleteBadge` | method | Deletes a badge for everyone, with audit |
| `profile-service.ts` | `ProfileService.saveImage` | method | Stores a PNG by sha256 id, deduplicated, with audit |
| `profile-service.ts` | `ProfileService.deleteImage` | method | Deletes an image no badge uses, with audit |
| `profile-service.ts` | `ProfileService.grant` | method | Grants or revokes a badge for a player with audit |
| `seed.ts` | (script) | module | Creates three demonstration accounts outside production |
| `trade-service.ts` | `TradeError`, `TradeCommit` | class, interface | Trade error and the two-sided commit input |
| `trade-service.ts` | `TradeService` | class | Atomic two-player trade of coins, items and vehicles |
| `trade-service.ts` | `TradeService.commit` | method | Locks both sides, checks everything, moves it all or nothing |
| `trade-service.ts` | `TradeService.side` | method | Wallet, stacks, vehicles and keys of one player |
| `trade-service.ts` | `TradeService.result` | method | Result payload for both sides of a trade |
| `wallet-service.ts` | `WalletError`, `WalletRequest`, `GameSettlement` | class, interface | Wallet error, world change and game settlement shapes |
| `wallet-service.ts` | `WalletService` | class | Coins the world spends or pays, and game settlements |
| `wallet-service.ts` | `WalletService.change` | method | Applies a world debit or capped job pay or refund once per id |
| `wallet-service.ts` | `WalletService.settleBlackjack` | method | Blackjack round settlement for one player, via settleGame |
| `wallet-service.ts` | `WalletService.settleFoosball` | method | Pebolim settlement with a per-round advisory lock |
| `wallet-service.ts` | `WalletService.settleTruco` | method | Truco settlement capped at the player's own stake |
| `wallet-service.ts` | `WalletService.settlePool` | method | Sinuca settlement capped at the player's own stake |
| `wallet-service.ts` | `WalletService.settleGame` | method | Shared once-per-round game settlement with stake and cap checks |
| `wardrobe.ts` | `WardrobeError`, `owns` | class, function | Wardrobe error and ownership rule (free default skin) |
| `wardrobe.ts` | `WardrobeService` | class | Skins, skills, welcome coins, daily bonus and catalog edits |
| `wardrobe.ts` | `WardrobeService.initialize` | method | Creates the wallet with welcome coins if missing (write on every call) |
| `wardrobe.ts` | `WardrobeService.view` | method | Shop view: cards, skills, prices, owned flags, daily status |
| `wardrobe.ts` | `WardrobeService.claimDaily` | method | Daily bonus once per UTC day, under wallet lock |
| `wardrobe.ts` | `WardrobeService.buy` | method | Buys a skin under wallet lock; repeated purchase is a no-op |
| `wardrobe.ts` | `WardrobeService.buySkill` | method | Buys a skill that needs a card of its character |
| `wardrobe.ts` | `WardrobeService.equip` | method | Wears an owned skin, or the free default |
| `wardrobe.ts` | `WardrobeService.access` | method | Owned skins and skills for the access endpoint |
| `wardrobe.ts` | `WardrobeService.adminCatalog` | method | Administration catalog with owners, wearing and revenue per entry |
| `wardrobe.ts` | `WardrobeService.saveCatalogEntry` | method | Edits a card or skill, then its price in a second transaction |

## Conventions observed
- **Naming**: TypeScript identifiers camelCase; drizzle table exports camelCase of plural snake table names; raw SQL uses snake_case columns (`control-outbox.ts:21-46`, `highfood-service.ts:30-35`). Tables referenced are all plural.
- **Error handling**: domain error class per service carrying `statusCode` (`AdminError`, `PhoneError`, `HighfoodError`, `WalletError`, `InventoryError`, `TradeError`, `WardrobeError`, `ProfileError`, `PricingError`). Messages in Portuguese. 409 for conflicts, 403 for rights, 404 for missing.
- **Logging**: none in this segment.
- **Async style**: async/await throughout; `db.transaction(async tx => ...)` wraps money and admin writes.
- **Type hints**: fully typed; `as` casts on aggregate results (`phone-service.ts:93, 237, 368, 398`; `highfood-service.ts:36`).
- **Idempotency**: receipt-id pattern. The ledger primary key is the retry key, claimed first with `onConflictDoNothing` (`inventory-service.ts:50`, `wallet-service.ts:29-33`, `admin-service.ts:102`, `trade-service.ts:26-32`). Prefixes vary: `world:`, `pix:<id>:out`, `highfood:<orderId>`, `vehicle:<id>`, `inventory-buy:<id>`, `daily:<user>:<date>`, `welcome:<user>`.
- **Locking**: `for('update')` on the wallet first in money paths; `for('share')` for the acting admin. Lock order documented in `fuel-service.ts:6`, `phone-service.ts:446`, `trade-service.ts:33`.
- **Soft delete**: `revoked_at` on `moderation_actions` (`admin-service.ts:157, 199`); `status` on `highfood_deliveries` and `game_controls`. Hard delete elsewhere (`sessions`, `phone_media`, `gram_posts`, `badges`). No `deleted_at` or `is_deleted` in this segment.
- **Timestamps**: `createdAt`, `updatedAt`, `expiresAt`, `revokedAt`, `notifiedAt`, `shownAt`, `grantedAt`, `boughtAt`; raw SQL `created_at`, `applied_at`, `lease_expires_at`. Day boundary defined three ways (see DB-28).
- **Money**: integer coins; `MAX_COIN_BALANCE` clamp in most credit paths (not all, see DB-04).
- **Structured data in text**: ledger `reason` carries peer ids and kinds (`pix:in:<id>`, `trade:out:<id>:<tradeId>`) (see DB-24).
- **Photos**: base64 text in `gram_profiles.photo` and `gram_posts.image`; bytea in `phone_media.bytes` and `badge_images.bytes` (see DB-25).

## Internal duplication
- Active-ban rule written three times: `admin-service.ts:12` (`activeBans`), `admin-service.ts:75` (raw SQL in overview filter), `auth/service.ts:22-28` (`isBanned`).
- `badgeColumns` identical: `achievement-service.ts:6` and `profile-service.ts:9`.
- `startOfDay` identical: `highfood-service.ts:10`, `phone-service.ts:9`, `wallet-service.ts:10`.
- Rating subquery repeated: `highfood-service.ts:139-141` (view) and `highfood-service.ts:156-157` (rating).
- Today's count and earned aggregate repeated: `highfood-service.ts:119-120`, `:142`, `:188-191`.
- Control-character rules, four variants: `phone-service.ts:16` (`clean`), `:137` (send), `:261` (bio), `:410` (comment).
- Role mapping `role==='admin'?'admin':'user'`: `admin-service.ts:68` and `auth/service.ts:19`.
- Skin and skill grant loops: `seed.ts:23-24` and `:31-32`; `dev-bots.ts:32` and `:39-40`.
- `hidden()` is called twice on the same path: `phone-service.ts:230` (inside gramPeople) and `:242` (gramSummary).
- `[{total}] as` count-cast pattern repeated: `phone-service.ts:93, 237, 368, 398`.

## Cross-segment hints
- Input bounds for money and quantities live in route zod schemas, not here: settle payout (`wallet-service.ts:91`), inventory `quantity` (`inventory-service.ts:41-46, 66-75`). Confirm in `app.ts` (api segment).
- Pix bound: the api report's F5 is answered in the service, `phone-service.ts:439` (1 to PHONE.pixMax). Keep it there.
- Internal routes trust the world: `highfood-service.ts:87` (`saveVehicles`) and the settle services. Confirm the internal-secret gate covers them (api segment).
- Image-delete guard is split: badges checked in `profile-service.ts:137`, customers checked by a separate helper `highfood-service.ts:181`. The route must call both.
- Business logic in services that act as repositories: Highgram suggestion weights (`phone-service.ts:309-324`), Highfood pay and stars (`highfood-service.ts:110-128`), game payout caps (`wallet-service.ts:75-104`), catalog rules (`wardrobe.ts:148-149`). The synthesizer may route these to the business-logic segment.
- Ban check consistency: `trade-service.ts:119` and `auth/service.ts:34` apply bans; the api report (F3) notes some write routes skip the ban check.
- World contract: control rows are inserted from `admin-service.ts:161`, `highfood-service.ts:70, 81, 105`, `pricing-service.ts:70`. Realtime or queue reviewers should check the consumer.
- Mail: `mail.ts:21` keeps verification and reset links in memory when `mailEnabled`. Confirm it is off in production (config segment).
- Owner e-mail is a constant in source (`admin-policy.ts:6`). Auth and config reviewers may want to see it.

## Specialist findings
Checked and clean: trade locks wallets, then stacks, then vehicles in one order (`trade-service.ts:34-37`); Pix locks two wallets sorted by user id (`phone-service.ts:447`); SQL is parameterised with the tagged template (`control-outbox.ts:21-46`); LIKE patterns are escaped (`admin-service.ts:72`, `phone-service.ts:290`); no transaction is held across a network call; migration coordination is not in this segment.

Severity: high / med / low. "unverified" means the index, FK or CHECK is not visible in this segment.

| ID | Where | What | Why | Severity |
|----|-------|------|-----|----------|
| DB-01 | `wallet-service.ts:91`, `:98` | `settleGame` bounds `payout` only above. No check that payout is a non-negative safe integer, and balance is written without a floor check. | A negative payout debits the wallet below zero. The invariant "balance never leaves 0..MAX" (`wallet-service.ts:13-15`) is not enforced here. Depends on the route zod schema (unverified). | med |
| DB-02 | `fuel-service.ts:16`, `:35-37`; `highfood-service.ts:65`; `wallet-service.ts:44`; `inventory-service.ts:57` | Fuel holds are subtracted only in `reserve`. Other debits (vehicle buy, world change, item buy) do not subtract holds. `settle` writes `balance-total` with no floor. | The wallet can go negative at settle time. Safe only if `wallets.balance` has a CHECK >= 0 (unverified). | high |
| DB-03 | `inventory-service.ts:41-46`, `:57`, `:60`; `:66-76` | `buy` and `remove` do not validate `quantity` as a positive integer. A negative buy credits coins (`cost` negative). A negative remove grows the stack. | Money and item creation. Safe only if the route rejects non-positive quantity (api segment, unverified). | high |
| DB-04 | `wardrobe.ts:53-64`, `:61` | `claimDaily` adds the bonus with no `MAX_COIN_BALANCE` clamp. Other credit paths clamp (`wallet-service.ts:45`, `highfood-service.ts:122`, `phone-service.ts:458`). | Inconsistent cap; a near-full wallet can exceed the maximum. | low |
| DB-05 | `phone-service.ts:363-371` | `createPost` counts posts, then inserts, with no transaction or lock on the author. | Two concurrent posts can pass the count and exceed `GRAM_POSTS_PER_ACCOUNT` (60). | med |
| DB-06 | `wardrobe.ts:151-155` | `saveCatalogEntry` commits the card edit and its audit (`:151-154`), then calls `pricing.change` in a second transaction (`:155`). | If the price is out of range, the request fails after the card edit is saved. Not atomic. | med |
| DB-07 | `profile-service.ts:89`, `:135-141`; `highfood-service.ts:181-183` | `saveBadge` checks the image exists without a row lock (`:89`). `deleteImage` checks badges only (`:137`). Customer use is checked by a separate helper. | Race: an image can be deleted while a badge or customer is being saved with it, leaving a dangling reference unless an FK exists (unverified). | med |
| DB-08 | `highfood-service.ts:86-88` | `saveVehicles` runs one UPDATE per vehicle, no transaction, and no `userId` filter. | Partial application on failure. Any caller holding the internal secret can change any vehicle's parts, mileage and fuel. | med |
| DB-09 | `control-outbox.ts:21-24` | Every `leaseControls` call (each world poll) runs a dead-letter UPDATE and a DELETE of applied rows over the whole table. | Writes on the poll path. Needs an index on `(status, applied_at)` and `(status, created_at)` to stay cheap (unverified). | med |
| DB-10 | `control-outbox.ts:41-46` | `acknowledgeControls` issues one UPDATE per id in a loop (batch up to 50). | N+1 inside a transaction. A single `WHERE id = ANY` would do. | low |
| DB-11 | `inventory-service.ts:28`; `wardrobe.ts:21-27`; `wallet-service.ts:23`; `phone-service.ts:429`, `:442` | `initialize()` runs a transaction with `INSERT ... ON CONFLICT DO NOTHING` on `wallets` on every view, bank read, Pix and world change. `inventory-service.ts:15-25` also writes starter rows on every view. | Write amplification on read and poll paths. Select first, insert only when missing. | med |
| DB-12 | `phone-service.ts:130-131` | `thread()` (a read) updates `read_at` on the peer's messages. | Read path with a side effect (api F11). Probably intended, but name and contract should say so. | low |
| DB-13 | `phone-service.ts:200-214`, `:217` | `ensureGram` inserts `gram_profiles` rows during feed, comment, search and suggestion reads, via `authors()`. | Reads may insert. Each missing person costs a select and an insert, one at a time. | low |
| DB-14 | `auth/service.ts:31-34` | Each authenticated request runs a session select, a `getUser` join and an `isBanned` select (three queries). | Hot path. The token lookup needs an index on `sessions.token_hash` (unverified). | low |
| DB-15 | `phone-service.ts:86-88` | `profile()` loads every unread message row for the recipient to count them. | Use `count(*)`. Unbounded rows on each phone open. | low |
| DB-16 | `phone-service.ts:311`, `:321` | `suggestions()` has `limit(2000)` with no `orderBy` on follows (non-deterministic cut), and runs a full `groupBy` over `gram_follows` on every call. | Unstable suggestions and a full scan per call. Cache or keep counters. | med |
| DB-17 | `phone-service.ts:183-186` | `trimMedia` selects every media row of the sender on each upload, no limit. | Needs an index on `phone_media(owner_id, created_at)` (unverified). Cost grows with quota churn. | low |
| DB-18 | `phone-service.ts:292` | `search` uses `ilike '%term%'` on four columns through a join. | Leading wildcard cannot use a btree index. Full scan per keystroke. | low |
| DB-19 | `highfood-service.ts:30-35` | `ownershipAudit` runs five full-table subqueries, including an unindexed `currency_ledger.reason` filter. Debug code sits in the service. | Cost on every call; reason not indexed. Move to a script or remove. | low |
| DB-20 | `wardrobe.ts:128` | `adminCatalog` revenue sums `LIKE 'skin:%' OR LIKE 'skill:%'` over the whole ledger, grouped by reason. | No index on `reason`. Full scan per admin load. | low |
| DB-21 | `phone-service.ts:424`; `wallet-service.ts:41`; `wallet-service.ts:93-95`; `highfood-service.ts:191` | Ledger `reason` is a query key: LIKE prefix and equality with `inArray`. | Needs an index on `currency_ledger(reason)`, with `text_pattern_ops` for LIKE (unverified). | med |
| DB-22 | `phone-service.ts:432-435`; `phone-service.ts:424` | Peer id is stored in `currency_ledger.reason` (`pix:in:<id>`, `trade:out:<id>:<tradeId>`) and parsed with `split(':')[2]`. The `{` prefix marks admin JSON. | No FK, no column for the peer. An id containing ':' breaks the parse. Schema concern. | med |
| DB-23 | `phone-service.ts:262`, `:370` vs `:170`; `profile-service.ts:129` | Photos are base64 text in `gram_profiles.photo` and `gram_posts.image`, but bytea in `phone_media.bytes` and `badge_images.bytes`. | Storage drift. Base64 adds about 33% and is decoded on each read (`:270`, `:380`). | low |
| DB-24 | `admin.ts:13`; `admin-policy.ts:7`, `:12` | E-mail normalisation drift: the CLI matches `eq(users.email, lowercased)`, the bootstrap uses `lower(users.email)`, which cannot use a plain index. Stored casing (register path) not read. | The CLI may miss a mixed-case account. Pick one normalised column. | low |
| DB-25 | `wardrobe.ts:52`; `highfood-service.ts:10`, `:137`, `:142-143`; `wallet-service.ts:10`; `phone-service.ts:9`, `:424` | Three day boundaries: UTC date for the daily bonus (`wardrobe.ts:52`), server-local midnight for job cap, deliveries and Pix limit, and the DB session time zone for `to_char` chart buckets (`highfood-service.ts:142`). | A player near midnight can see mismatched "today" values. Use one zone. | med |
| DB-26 | `wardrobe.ts:145-146` | `saveCatalogEntry` takes `kind` from `split(':')` and does not validate it. Any prefix that matches an id writes an arbitrary key into `skin_catalog`. | Garbage keys possible through the admin route. Validate `kind` in ['skin','skill']. | low |
| DB-27 | `admin-service.ts:21`, `:49`, `:95`, `:126`, `:149` | `select()` on `users` returns every column, including `password_hash`, to read id, role or verified. | Secret in memory and in logs if a row is ever serialised. Select explicit columns. | low |
| DB-28 | `admin-service.ts:12`, `:75`; `auth/service.ts:22-28` | Active-ban rule in three forms. `:75` uses DB `now()`, the others use JS `Date`. | Drift risk; expiry can differ by clock. | low |
| DB-29 | `admin-service.ts:156-161`, `:195-199` | `unban`, `unkick`, and reverts of ban or kick write no control to the world. Only the row changes. | Confirm the world re-reads bans and kicks from the DB. Question, not a confirmed bug. | low |
| DB-30 | `profile-service.ts:105-111` | `deleteBadge` relies on an FK cascade to clear `user_badges`. | Not verified in this segment. If there is no cascade, the delete fails with a 500. | low |
| DB-31 | `achievement-service.ts:39-42` | `unlocked()` marks `notified_at` in one statement, then reads the catalog in another, with no transaction. | At-most-once notice: a failure after the update loses the notice. | low |
| DB-32 | `dev-bots.ts:25-35`; `profile-service.ts:96-98`; `highfood-service.ts:172-175`; `fuel-service.ts:26-31` | Select-then-insert without `onConflictDoNothing` (or with a non-atomic `taken` set for slugs). Concurrent calls throw a unique violation (500). | Races: bot creation, badge and customer slugs, fuel tombstones. | low |
| DB-33 | `dev-bots.ts:39-40` | Per `prepare`, one insert per skin and per skill (N+M queries, mostly no-ops). | Dev-only, but on every bot connect. | low |
| DB-34 | `phone-service.ts:189-196` | `media()` loads `bytes` before the ownership and share check, then discards them for non-owners. | Wasted I/O on refusals. Select bytes after the check. | low |
| DB-35 | `phone-service.ts:287-293` | Comment says "everyone gets a profile row first", but `search` never calls `ensureGram`. Rows are created only for results, via `authors()`. | Comment is inaccurate. Fix the comment. | low |
| DB-36 | `pricing-service.ts:18`, `:73` | Price cache is per instance. `change()` clears only the instance that wrote. | Other instances serve stale prices for up to 5 s. Confirm `app.ts` shares one instance (unverified). | low |
| DB-37 | `seed.ts:13`; `seed.ts:11` | Hard-coded fallback demo password. Production guard at line 11 covers it. | Low risk; a committed credential. | low |
| DB-38 | `admin-policy.ts:6` | Owner e-mail is a constant in source. | Personal data in code; the owner rule keys off it. | low |
| DB-39 | `admin.ts:13-14`, `:17` | The CLI grants admin without the rules `changeRole` applies (owner-only, ban check at `admin-service.ts:131-132`). | Operator-only, but a second path to the same write. | low |
| DB-40 | `highfood-service.ts:195` | `void HIGHFOOD_CUSTOMERS;` keeps an unused import alive. | Dead code. | low |

### Schema inventory
Definitions are in `database/schema.ts` (not read). Key fields are as used in this segment. "unverified" means not visible here.

| Table/Collection | File:Line | Key fields | Indexes | FKs | Soft delete? |
|------------------|-----------|------------|---------|-----|--------------|
| `users` | `auth/service.ts:15` | id, email, username, verified, role, passwordHash | unverified (email) | unverified | no (hard delete not used here) |
| `profiles` | `profile-service.ts:34` | userId, displayName, equippedSkin, avatarConfig, skillLoadouts, statusMessage | unverified | unverified (userId) | no |
| `sessions` | `auth/service.ts:31` | id, userId, tokenHash, expiresAt | token_hash lookup needed (DB-14) | unverified (userId) | hard delete (`admin-service.ts:160`) |
| `wallets` | `wallet-service.ts:27` | userId, balance | PK userId assumed | unverified | no |
| `currency_ledger` | `wallet-service.ts:29`; `phone-service.ts:424` | id (receipt), userId, amount, reason, createdAt | id PK; (userId, createdAt) and reason needed (DB-21) | unverified | append-only |
| `moderation_actions` | `admin-service.ts:12`, `:165` | id, actorId, userId, action, reason, expiresAt, revokedAt, createdAt | (userId, action) needed | unverified | revokedAt |
| `game_controls` | `control-outbox.ts:21` | id, payload, status, attempts, lease_owner, lease_expires_at, applied_at, last_error | (status, created_at) needed (DB-09) | none | status |
| `user_achievements` | `achievement-service.ts:26` | userId, series, value, updatedAt | PK (userId, series) implied by onConflict target | unverified | no |
| `badges` | `achievement-service.ts:6` | id, name, description, icon, color, rarity, image (id) | PK id | none | hard delete (`profile-service.ts:107`) |
| `user_badges` | `achievement-service.ts:32` | userId, badgeId, grantedAt, notifiedAt, shownAt | PK (userId, badgeId) implied | badgeId to badges (cascade assumed, DB-30) | no |
| `badge_images` | `profile-service.ts:129` | id (sha256), bytes, size, createdAt | PK id | none | hard delete (`:139`) |
| `highfood_deliveries` | `highfood-service.ts:125` | id (orderId), userId, customerId, customer, items, paid, stars, status, createdAt | (userId, status, createdAt) needed | unverified (customerId) | status |
| `highfood_customers` | `highfood-service.ts:165-175` | id (slug), name, skin, look, image, lines, active | image lookup `:182` unindexed | none | active flag |
| `player_vehicles` | `highfood-service.ts:46-52` | id, userId, model, plate (unique), parts, mileage, fuel, color, boughtAt | userId index declared per api report (schema.ts:166, not re-verified) | unverified | hard delete (`:102`) |
| `trades` | `trade-service.ts:106` | id, userA, userB, offerA, offerB, fingerprint | PK id | no user FKs (api F27) | append-only |
| `item_inventory` | `inventory-service.ts:22` | userId, itemId, quantity, updatedAt | PK (userId, itemId) implied | unverified | hard delete (`:77`) |
| `inventory_ledger` | `inventory-service.ts:20`, `:61` | id, userId, itemId, quantity, reason | (userId, createdAt) needed for history `:32` | unverified | append-only |
| `skin_inventory`, `skill_inventory` | `wardrobe.ts:79`, `:102` | userId, skinId / skillId | PK implied | unverified | hard delete not used |
| `skin_catalog` | `wardrobe.ts:18`, `:152` | key (PK), rarity, description, availability, updatedBy, updatedAt | PK key | unverified | availability 'hidden' |
| `economy_prices` | `pricing-service.ts:22`, `:63` | key (PK), value, updatedBy, updatedAt | PK key | unverified (updatedBy) | delete on default |
| `phone_lines` | `phone-service.ts:37-41` | userId, number | number unique (onConflict) | unverified | no |
| `phone_contacts` | `phone-service.ts:55`, `:95` | ownerId, contactId | unverified | unverified | hard delete (`:99`) |
| `phone_messages` | `phone-service.ts:106`, `:141`, `:171` | id (requestId), senderId, recipientId, body, readAt, mediaId, mediaKind, mediaMs, createdAt | (sender, createdAt) and (recipient, createdAt) needed | mediaId not verified | none |
| `phone_media` | `phone-service.ts:170`, `:183` | id, ownerId, kind, mime, bytes, size, durationMs, createdAt | (owner, createdAt) needed (DB-17) | none | quota trim (`:186`) |
| `blocks` | `phone-service.ts:64` | userId, blockedId | blocked_id needed (OR query) | unverified | no |
| `gram_profiles` | `phone-service.ts:208`, `:262` | userId, handle (unique), name, bio, photo (base64 text), photoAt, updatedAt | handle unique (`:257`, `:264`) | unverified | no |
| `gram_posts` | `phone-service.ts:352`, `:370` | id, authorId, caption, image (base64 text), createdAt | createdAt and (authorId, createdAt) needed | unverified | hard delete (`:386`) |
| `gram_likes` | `phone-service.ts:340`, `:396` | postId, userId | PK (postId, userId) implied | unverified | hard delete |
| `gram_comments` | `phone-service.ts:404`, `:412` | id, postId, authorId, body, createdAt | postId needed | unverified | hard delete (`:419`) |
| `gram_follows` | `phone-service.ts:225`, `:276` | followerId, followedId, createdAt | both sides needed (DB-16) | unverified | hard delete (`:277`) |
| `reports` | `admin-service.ts:87` | id, userId, reporterId, reason, createdAt | createdAt unverified | unverified | not read |

## Concerns / smells
1. **Money invariants live in application code, not in the database.** No CHECK constraint on balance or quantity is visible in this segment, and the balance floor is checked on some paths only (DB-01, DB-02, DB-03, DB-04). This is the highest risk in the segment.
2. **Writes on read and poll paths.** `initialize()` on every view and bank read (DB-11), `ensureGram` on feed and search (DB-13), `thread()` setting `read_at` (DB-12), and the control-outbox lease DELETE on every poll (DB-09).
3. **Non-atomic multi-step writes.** Catalog then pricing (DB-06), createPost count then insert (DB-05), image check then delete (DB-07), saveVehicles without a transaction (DB-08).
4. **Ledger `reason` as a data model.** Peer ids and kinds live in text, parsed with `split` and matched with LIKE (DB-21, DB-22). This blocks indexing and FKs.
5. **Three day boundaries** across the money paths (DB-25). A bonus can be "today" in UTC and yesterday for the job cap.

## Refactor suggestions
1. **One debit helper** for `wallet-service.ts` `change`, `settleGame`, `fuel-service.ts` `settle`, and the buy paths in `highfood-service.ts:65`, `inventory-service.ts:57`, `wardrobe.ts:77`. It locks the wallet, subtracts active fuel holds, refuses a negative result, clamps to `MAX_COIN_BALANCE`, and validates integer amounts. Fixes DB-01, DB-02, DB-04.
2. **Make `initialize()` read-first.** Select the wallet and starter rows; insert only when missing. Call it at account creation and login, not on view, bank or world-change paths (`wardrobe.ts:21-27`, `inventory-service.ts:15-28`, `wallet-service.ts:23`, `phone-service.ts:429`, `:442`). Fixes DB-11.
3. **Batch the control outbox.** `acknowledgeControls` (`control-outbox.ts:41-46`) becomes one `UPDATE ... WHERE id = ANY(...)` per list. Move the retention DELETE (`:24`) and dead-letter sweep (`:21-22`) to a periodic job. Fixes DB-09, DB-10.
4. **Put the pricing change in the catalog transaction.** Extract an in-transaction variant of `PricingService.change` (`pricing-service.ts:44-75`) and call it inside `saveCatalogEntry` (`wardrobe.ts:151-155`). Fixes DB-06.
5. **Lock before counting or checking.** In `createPost` (`phone-service.ts:363-371`), lock the author's `users` row `FOR UPDATE` inside a transaction before the count. In `saveBadge` and `deleteImage` (`profile-service.ts:89`, `:137`), take `FOR SHARE` on the `badge_images` row, and have the customer-image check run in the same transaction. Fixes DB-05, DB-07.
