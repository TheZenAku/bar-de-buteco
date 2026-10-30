import { boolean, customType, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

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
  equippedSkin:text('equipped_skin').notNull().default('nathan'),
});
export const wallets=pgTable('wallets',{
  userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),balance:integer('balance').notNull().default(0),
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
/** The event log: logins from the API, entries, shifts and faints from the world (apps/api/src/admin-console.ts). */
export const gameLogs=pgTable('game_logs',{
  id:text('id').primaryKey(),source:text('source').notNull(),event:text('event').notNull(),userId:text('user_id'),
  details:jsonb('details').notNull().default({}),createdAt:date('created_at').notNull().defaultNow(),
});
