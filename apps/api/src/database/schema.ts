import {index, boolean, customType, integer, jsonb, pgTable, primaryKey, text, timestamp, smallint } from 'drizzle-orm/pg-core';
import type { BadgeRarity } from '@bar/shared';

const date = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(),
  email: text('email').notNull().unique(), passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('player'), verified: boolean('verified').notNull().default(false),
  createdAt: date('created_at').notNull().defaultNow(),
});
export const profiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(), avatarConfig: jsonb('avatar_config').notNull().default({ color: '#cf7549' }),
  statusMessage: text('status_message').notNull().default(''), skillLoadouts: jsonb('skill_loadouts').notNull().default({}),
  equippedSkin:text('equipped_skin').notNull().default('nathan'),
});
export const wallets=pgTable('wallets',{
  userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),balance:integer('balance').notNull().default(0),
});
/** The skills a player bought; they work in every variant of the character (WardrobeService). */
export const skillInventory=pgTable('skill_inventory',{
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),skillId:text('skill_id').notNull(),acquiredAt:date('acquired_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.userId,t.skillId]})]);
/** What the administration changed on a card or skill (`skin:<id>`, `skill:<id>`). Without a row, the defaults in packages/shared stand. */
export const skinCatalog=pgTable('skin_catalog',{
  key:text('key').primaryKey(),rarity:text('rarity').notNull(),description:text('description').notNull(),availability:text('availability').notNull().default('sale'),
  updatedAt:date('updated_at').notNull().defaultNow(),updatedBy:text('updated_by').references(()=>users.id),
});
export const skinInventory=pgTable('skin_inventory',{
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),skinId:text('skin_id').notNull(),acquiredAt:date('acquired_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.userId,t.skinId]})]);
export const currencyLedger=pgTable('currency_ledger',{
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  amount:integer('amount').notNull(),reason:text('reason').notNull(),createdAt:date('created_at').notNull().defaultNow(),
});
export const itemInventory=pgTable('item_inventory',{
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),itemId:text('item_id').notNull(),
  quantity:integer('quantity').notNull(),updatedAt:date('updated_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.userId,t.itemId]})]);
export const inventoryLedger=pgTable('inventory_ledger',{
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  itemId:text('item_id').notNull(),quantity:integer('quantity').notNull(),reason:text('reason').notNull(),createdAt:date('created_at').notNull().defaultNow(),
});
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(), expiresAt: date('expires_at').notNull(), createdAt: date('created_at').notNull().defaultNow(),
});
export const emailVerifications = pgTable('email_verifications', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: date('expires_at').notNull(),
});
export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: date('expires_at').notNull(),
});
export const blocks = pgTable('blocks', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: text('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.blockedId] })]);
export const reports = pgTable('reports', {
  id: text('id').primaryKey(), reporterId: text('reporter_id').notNull().references(() => users.id),
  userId: text('user_id').notNull().references(() => users.id), reason: text('reason').notNull(),
  createdAt: date('created_at').notNull().defaultNow(),
  // Closed in the administration (infra/migrations/008_admin_console.sql).
  resolvedAt: date('resolved_at'), resolvedBy: text('resolved_by').references(() => users.id), resolution: text('resolution'),
});
export const moderationActions = pgTable('moderation_actions', {
  id: text('id').primaryKey(), actorId: text('actor_id').notNull().references(() => users.id),
  userId: text('user_id').references(() => users.id), action: text('action').notNull(), reason: text('reason').notNull(),
  expiresAt: date('expires_at'), revokedAt: date('revoked_at'), createdAt: date('created_at').notNull().defaultNow(),
});
export const statistics = pgTable('game_statistics', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  blackjackWins: integer('blackjack_wins').notNull().default(0),
  blackjackLosses: integer('blackjack_losses').notNull().default(0),
  blackjackDraws: integer('blackjack_draws').notNull().default(0), gamesPlayed: integer('games_played').notNull().default(0),
});
export const gameResults = pgTable('game_results', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  result: text('result').notNull(), createdAt: date('created_at').notNull().defaultNow(),
});
export const controls = pgTable('game_controls', {
  id: text('id').primaryKey(), payload: jsonb('payload').notNull(), createdAt: date('created_at').notNull().defaultNow(),
  acknowledged: boolean('acknowledged').notNull().default(false),
  // Outbox state (infra/migrations/004_control_outbox.sql, apps/api/src/control-outbox.ts).
  status: text('status').notNull().default('pending'), leaseOwner: text('lease_owner'), leaseExpiresAt: date('lease_expires_at'),
  attempts: integer('attempts').notNull().default(0), appliedAt: date('applied_at'), lastError: text('last_error'),
});
// The in-game phone (infra/migrations/006_phone.sql, apps/api/src/phone-service.ts).
export const phoneLines=pgTable('phone_lines',{
  userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),number:text('number').notNull().unique(),createdAt:date('created_at').notNull().defaultNow(),
});
export const phoneContacts=pgTable('phone_contacts',{
  ownerId:text('owner_id').notNull().references(()=>users.id,{onDelete:'cascade'}),contactId:text('contact_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  createdAt:date('created_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.ownerId,t.contactId]})]);
/** bytea: Buffer in and out (PGlite hands back a Uint8Array). */
const bytes=customType<{data:Buffer;driverData:Buffer|Uint8Array}>({dataType:()=>'bytea',fromDriver:value=>Buffer.isBuffer(value)?value:Buffer.from(value)});
/** Highzap attachments (infra/migrations/007_phone_social.sql), served to the two ends of the conversation only. */
export const phoneMedia=pgTable('phone_media',{
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull().references(()=>users.id,{onDelete:'cascade'}),kind:text('kind').notNull(),mime:text('mime').notNull(),
  bytes:bytes('bytes').notNull(),size:integer('size').notNull(),durationMs:integer('duration_ms'),createdAt:date('created_at').notNull().defaultNow(),
});
export const phoneMessages=pgTable('phone_messages',{
  id:text('id').primaryKey(),senderId:text('sender_id').notNull().references(()=>users.id,{onDelete:'cascade'}),recipientId:text('recipient_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  body:text('body').notNull(),createdAt:date('created_at').notNull().defaultNow(),readAt:date('read_at'),
  mediaId:text('media_id').references(()=>phoneMedia.id,{onDelete:'set null'}),mediaKind:text('media_kind'),mediaMs:integer('media_ms'),
});
/** The photo is the JPEG in base64, served by GET /api/phone/gram/photos/:id. */
export const gramPosts=pgTable('gram_posts',{
  id:text('id').primaryKey(),authorId:text('author_id').notNull().references(()=>users.id,{onDelete:'cascade'}),caption:text('caption').notNull().default(''),
  image:text('image').notNull(),createdAt:date('created_at').notNull().defaultNow(),
});
export const gramLikes=pgTable('gram_likes',{
  postId:text('post_id').notNull().references(()=>gramPosts.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  createdAt:date('created_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.postId,t.userId]})]);
export const gramComments=pgTable('gram_comments',{
  id:text('id').primaryKey(),postId:text('post_id').notNull().references(()=>gramPosts.id,{onDelete:'cascade'}),authorId:text('author_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  body:text('body').notNull(),createdAt:date('created_at').notNull().defaultNow(),
});
/** Highgram profiles: created with the account's username as handle the first time someone is shown in Highgram. */
export const gramProfiles=pgTable('gram_profiles',{
  userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),handle:text('handle').notNull().unique(),name:text('name').notNull(),bio:text('bio').notNull().default(''),
  photo:text('photo'),photoAt:date('photo_at'),updatedAt:date('updated_at').notNull().defaultNow(),
});
export const gramFollows=pgTable('gram_follows',{
  followerId:text('follower_id').notNull().references(()=>users.id,{onDelete:'cascade'}),followedId:text('followed_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  createdAt:date('created_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.followerId,t.followedId]})]);
/** Prices changed in the administration (packages/shared/src/prices.ts); a missing key is the default. */
export const economyPrices=pgTable('economy_prices',{
  key:text('key').primaryKey(),value:integer('value').notNull(),updatedBy:text('updated_by').references(()=>users.id),updatedAt:date('updated_at').notNull().defaultNow(),
});
/** Badges of the profile window (apps/api/src/profile-service.ts); shownAt: where the player put it among the six on show. */
/** PNGs sent in the administration for badges. The id is the file's SHA-256: the same file is kept once. */
export const badgeImages=pgTable('badge_images',{
  id:text('id').primaryKey(),bytes:bytes('bytes').notNull(),size:integer('size').notNull(),createdAt:date('created_at').notNull().defaultNow(),
});
export const badges=pgTable('badges',{
  id:text('id').primaryKey(),name:text('name').notNull(),description:text('description').notNull(),icon:text('icon').notNull(),color:text('color').notNull(),rarity:text('rarity').$type<BadgeRarity>().notNull().default('common'),image:text('image_id').references(()=>badgeImages.id,{onDelete:'set null'}),createdAt:date('created_at').notNull().defaultNow(),
});
export const userBadges=pgTable('user_badges',{
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),badgeId:text('badge_id').notNull().references(()=>badges.id,{onDelete:'cascade'}),
  shownAt:smallint('shown_at'),grantedAt:date('granted_at').notNull().defaultNow(),
  /** When the world told the player; null until then (AchievementService.unlocked). */
  notifiedAt:date('notified_at'),
},t=>[primaryKey({columns:[t.userId,t.badgeId]})]);
/** What each player has done, per series of packages/shared/src/achievements.ts, in that series' stored unit. */
export const userAchievements=pgTable('user_achievements',{
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),series:text('series').notNull(),
  value:integer('value').notNull().default(0),updatedAt:date('updated_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.userId,t.series]})]);
/** Every vehicle players bought (HighMotors), with the state the room keeps it in. `userId` is who holds its key: one column, so there is only one key. */
export const playerVehicles=pgTable('player_vehicles',{
  id:text('id').primaryKey(),plate:text('plate').notNull().unique(),
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),model:text('model').notNull(),parts:text('parts').notNull(),mileage:integer('mileage').notNull().default(0),
  color:text('color').notNull().default('#ccc9c2'),
  boughtAt:date('bought_at').notNull().defaultNow(),updatedAt:date('updated_at').notNull().defaultNow(),
},t=>[index('player_vehicles_owner_idx').on(t.userId,t.boughtAt)]);
/** Every trade that happened (trade-service.ts), written with what it moved: a retry finds it and changes nothing. */
export const trades=pgTable('trades',{
  id:text('id').primaryKey(),userA:text('user_a').notNull(),userB:text('user_b').notNull(),offerA:jsonb('offer_a').notNull(),offerB:jsonb('offer_b').notNull(),fingerprint:text('fingerprint').notNull(),createdAt:date('created_at').notNull().defaultNow(),
},t=>[index('trades_user_a_idx').on(t.userA,t.createdAt.desc()),index('trades_user_b_idx').on(t.userB,t.createdAt.desc())]);
/** Who the deliveries go to; the administration edits them. `image`: a picture from the badges' store, else the avatar drawn from `look`. */
export const highfoodCustomers=pgTable('highfood_customers',{
  id:text('id').primaryKey(),name:text('name').notNull(),skin:text('skin').notNull(),look:jsonb('look').notNull(),image:text('image_id').references(()=>badgeImages.id,{onDelete:'set null'}),
  lines:jsonb('lines').notNull(),active:boolean('active').notNull().default(true),updatedAt:date('updated_at').notNull().defaultNow(),
});
export const highfoodDeliveries=pgTable('highfood_deliveries',{
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),customerId:text('customer_id').notNull(),customer:text('customer').notNull(),restaurant:text('restaurant').notNull(),
  items:jsonb('items').notNull(),address:text('address').notNull(),length:integer('length_m').notNull(),durationMs:integer('duration_ms').notNull(),paid:integer('paid').notNull().default(0),stars:smallint('stars'),
  onTime:boolean('on_time').notNull().default(false),crashes:smallint('crashes').notNull().default(0),status:text('status').notNull(),createdAt:date('created_at').notNull().defaultNow(),
});
/** The event log: logins from the API, entries, shifts and faints from the world (apps/api/src/admin-console.ts). */
export const gameLogs=pgTable('game_logs',{
  id:text('id').primaryKey(),source:text('source').notNull(),event:text('event').notNull(),userId:text('user_id'),
  details:jsonb('details').notNull().default({}),createdAt:date('created_at').notNull().defaultNow(),
});
