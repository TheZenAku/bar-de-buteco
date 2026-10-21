import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import {readCharacter,type PublicUser} from '@bar/shared';
import type { Database } from '../database/index.js';
import { users, profiles, sessions, moderationActions, blocks } from '../database/schema.js';

export const SESSION_DAYS = 7;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

export async function getUser(db: Database, id: string): Promise<PublicUser | null> {
  const [row] = await db.select({ user: users, profile: profiles }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, id));
  if (!row) return null;
  const avatar = row.profile.avatarConfig as { color?: string };
  return { id: row.user.id, username: row.user.username, email: row.user.email, displayName: row.profile.displayName,
    verified: row.user.verified, role: row.user.role === 'admin' ? 'admin' : 'user', color: avatar.color ?? '#cf7549',
    character:row.profile.characterConfig?readCharacter(row.profile.characterConfig):null,equippedSkin:row.profile.equippedSkin };
}
export async function isBanned(db: Database, userId: string) {
  const rows = await db.select({ id: moderationActions.id }).from(moderationActions).where(and(
    eq(moderationActions.userId, userId), eq(moderationActions.action, 'ban'), isNull(moderationActions.revokedAt),
    or(isNull(moderationActions.expiresAt), gt(moderationActions.expiresAt, new Date())),
  )).limit(1);
  return rows.length > 0;
}
export async function readSession(db: Database, token: string | undefined) {
  if (!token || token.length > 256) return null;
  const [session] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!session) return null;
  const user = await getUser(db, session.userId);
  if (!user || await isBanned(db, user.id)) return null;
  return { session, user };
}
export async function createSession(db: Database, userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const session = { id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt };
  await db.insert(sessions).values(session);
  return { token, expiresAt, session };
}
export async function blockedIds(db: Database, userId: string) {
  const rows = await db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.userId, userId));
  return rows.map((row) => row.id);
}
