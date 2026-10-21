import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

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
});
