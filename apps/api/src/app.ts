import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { signTicket } from '@bar/shared/tickets';
import {characterSchema,skinMessageSchema,MAX_COIN_BALANCE,type PublicUser} from '@bar/shared';
import {WardrobeService} from './wardrobe.js';
import {AdminService} from './admin-service.js';
import {ensureOwnerAdministrator,isOwnerEmail} from './admin-policy.js';
import { readConfig, type ApiConfig } from './config.js';
import { connectDatabase, type Database } from './database/index.js';
import * as tables from './database/schema.js';
import { Mailer } from './mail.js';
import { blockedIds, createSession, getUser, hashPassword, hashToken, isBanned, newToken, readSession, SESSION_DAYS } from './auth/service.js';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(10, 'A senha precisa ter pelo menos 10 caracteres.').max(128);
const tokenSchema = z.string().min(20).max(256);
const uuidSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(3).max(500);
type Auth = { user: PublicUser; session: typeof tables.sessions.$inferSelect };
declare module 'fastify' { interface FastifyRequest { auth: Auth | null } }

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}
function equalSecret(actual: unknown, expected: string) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function isLoopback(ip: string) { return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'; }

export async function createApi(options: { config?: ApiConfig; database?: Database; logger?: boolean; rateLimit?: boolean } = {}) {
  const config = options.config ?? readConfig();
  const connection = options.database ? null : await connectDatabase({ url: config.databaseUrl, path: config.dataPath });
  const db = options.database ?? connection!.db;
  const wardrobe=new WardrobeService(db);
  const administration=new AdminService(db,wardrobe);
  const mailer = new Mailer(config);
  const cookieName = config.production ? '__Host-bar_session' : 'bar_session';
  const cookieSettings = { path: '/', httpOnly: true, secure: config.production, sameSite: 'lax' as const };
  const allowedOrigins = new Set([config.webOrigin]);
  if (!config.production) for (const scheme of ['http', 'https']) { allowedOrigins.add(`${scheme}://localhost:5173`); allowedOrigins.add(`${scheme}://127.0.0.1:5173`); }
  // In development the Vite proxy (loopback) forwards the browser address, so LAN clients are not treated as local.
  const app = Fastify({ bodyLimit: 16_384, trustProxy: config.trustProxyHops ? (_address: string, hop: number) => hop < config.trustProxyHops! : config.production ? false : 'loopback', logger: options.logger ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-internal-secret'] } : false });
  app.decorateRequest('auth', null);
  await app.register(cookie);
  await app.register(cors, { origin: [...allowedOrigins], credentials: true, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] });
  await app.register(rateLimit, { global: options.rateLimit !== false, max: 240, timeWindow: '1 minute', errorResponseBuilder: () => ({ error: 'Muitas tentativas. Aguarde um minuto.' }) });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.url.startsWith('/api/internal/')) return;
    const origin = request.headers.origin;
    // Development also accepts the page's own address, such as the LAN IP served by Vite (HTTPS by default).
    const sameHost = !config.production && (origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`);
    if ((origin && !allowedOrigins.has(origin) && !sameHost) || request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Origem da requisição não permitida.');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError || error instanceof Error && error.name==='ZodError' && 'issues' in error) return reply.code(400).send({ error: (error as ZodError).issues[0]?.message ?? 'Dados inválidos.' });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, 'Falha na API');
    return reply.code(status).send({ error: status >= 500 ? 'Não foi possível concluir. Tente novamente.' : error instanceof Error ? error.message : 'Dados inválidos.' });
  });
  app.addHook('onClose', async () => { mailer.close(); await connection?.close(); });

  // Apply the same activation policy to accounts registered before this mode was enabled.
  if (config.autoVerifyEmail) {
    const activatedCount = await db.transaction(async (tx) => {
      const activated = await tx.update(tables.users).set({ verified: true }).where(eq(tables.users.verified, false)).returning({ id: tables.users.id });
      if (activated.length) await tx.delete(tables.emailVerifications).where(inArray(tables.emailVerifications.userId, activated.map((user) => user.id)));
      return activated.length;
    });
    app.log.info({ activatedCount }, 'Automatic account activation enabled');
  }

  const owner=await ensureOwnerAdministrator(db);
  app.log.info({ownerAccountPresent:owner.present,ownerAdministrator:owner.enabled,ownerPromoted:owner.promoted},'Primary administrator ready');

  async function authenticated(request: FastifyRequest) {
    request.auth = await readSession(db, request.cookies[cookieName]);
    if (!request.auth) throw new HttpError(401, 'Entre na sua conta para continuar.');
  }
  async function administrator(request: FastifyRequest) {
    await authenticated(request);
    if (!request.auth!.user.verified || request.auth!.user.role !== 'admin') throw new HttpError(403, 'Acesso exclusivo da administração.');
  }
  async function internal(request: FastifyRequest) {
    if (!equalSecret(request.headers['x-internal-secret'], config.authSecret)) throw new HttpError(401, 'Acesso interno inválido.');
  }
  const authLimit = { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } };
  const recoverLimit = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };
  const internalOptions = { preHandler: internal, config: { rateLimit: false as const } };
  const dummyHash = await hashPassword(newToken());

  app.get('/api/health', async () => ({ ok: true, service: 'bar-api', database: connection?.driver ?? 'injected' }));
  app.get('/api/auth/config', async () => ({ emailVerificationRequired: !config.autoVerifyEmail }));
  app.post('/api/auth/register', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = z.object({ email: emailSchema, username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Use 3 a 24 letras, números ou sublinhado.'),
      displayName: z.string().trim().min(2).max(32).regex(/^[^\u0000-\u001f\u007f<>]+$/u), password: passwordSchema }).strict().parse(request.body);
    const existing = await db.select({ id: tables.users.id }).from(tables.users).where(or(eq(tables.users.email, body.email), eq(tables.users.username, body.username))).limit(1);
    if (existing.length) throw new HttpError(409, 'E-mail ou nome de usuário indisponível.');
    const userId = randomUUID(), token = newToken(), passwordHash = await hashPassword(body.password);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(tables.users).values({ id: userId, email: body.email, username: body.username, passwordHash, verified: config.autoVerifyEmail });
        await tx.insert(tables.profiles).values({ userId, displayName: body.displayName, avatarConfig: { color: ['#cf7549','#579a9b','#b79857','#9774af'][Math.floor(Math.random()*4)] } });
        await tx.insert(tables.statistics).values({ userId });
        if (!config.autoVerifyEmail) await tx.insert(tables.emailVerifications).values({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
      });
    } catch (error) {
      if ((error as { cause?: { code?: string }; code?: string }).cause?.code === '23505' || (error as { code?: string }).code === '23505') throw new HttpError(409, 'E-mail ou nome de usuário indisponível.');
      throw error;
    }
    if(isOwnerEmail(body.email))await ensureOwnerAdministrator(db);
    if (!config.autoVerifyEmail) await mailer.send(body.email, 'verify', token);
    const {token:sessionToken,expiresAt}=await createSession(db,userId);
    reply.setCookie(cookieName,sessionToken,{...cookieSettings,maxAge:SESSION_DAYS*86_400,expires:expiresAt});
    return reply.code(201).send({user:await getUser(db,userId), verificationRequired: !config.autoVerifyEmail, message: config.autoVerifyEmail ? 'Conta criada! Vamos montar seu personagem.' : 'Conta criada. Personalize seu personagem e confirme seu e-mail para entrar.' });
  });
  app.post('/api/auth/verify', authLimit, async (request) => {
    const { token } = z.object({ token: tokenSchema }).strict().parse(request.body);
    await db.transaction(async (tx) => {
      const [verification] = await tx.delete(tables.emailVerifications).where(and(eq(tables.emailVerifications.tokenHash, hashToken(token)), gt(tables.emailVerifications.expiresAt, new Date()))).returning();
      if (!verification) throw new HttpError(400, 'Link inválido ou expirado. Solicite outro e-mail.');
      await tx.update(tables.users).set({ verified: true }).where(eq(tables.users.id, verification.userId));
      await tx.delete(tables.emailVerifications).where(eq(tables.emailVerifications.userId, verification.userId));
    });
    await ensureOwnerAdministrator(db);
    return { message: 'E-mail confirmado. Sua mesa está esperando.' };
  });
  app.post('/api/auth/resend', recoverLimit, async (request) => {
    const { email } = z.object({ email: emailSchema }).strict().parse(request.body);
    if (config.autoVerifyEmail) return { message: 'As contas são ativadas automaticamente. Entre com seu e-mail e senha.' };
    const [user] = await db.select().from(tables.users).where(eq(tables.users.email, email));
    if (user && !user.verified) {
      const token = newToken();
      await db.transaction(async (tx) => {
        await tx.delete(tables.emailVerifications).where(eq(tables.emailVerifications.userId, user.id));
        await tx.insert(tables.emailVerifications).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now()+86_400_000) });
      });
      await mailer.send(email, 'verify', token);
    }
    return { message: 'Se a conta precisa de confirmação, enviaremos um novo link.' };
  });
  app.post('/api/auth/login', authLimit, async (request, reply) => {
    const { email, password } = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict().parse(request.body);
    const [account] = await db.select().from(tables.users).where(eq(tables.users.email, email));
    const correct = await argon2.verify(account?.passwordHash ?? dummyHash, password);
    if (!account || !correct) { request.log.warn({ event: 'login_failure', ip: request.ip }, 'Falha de autenticação'); throw new HttpError(401, 'E-mail ou senha incorretos.'); }
    if (await isBanned(db, account.id)) throw new HttpError(403, 'Esta conta está banida do bar.');
    // Rotate an existing browser session on sign-in.
    if (request.cookies[cookieName]) await db.delete(tables.sessions).where(eq(tables.sessions.tokenHash, hashToken(request.cookies[cookieName]!)));
    const { token, expiresAt } = await createSession(db, account.id);
    reply.setCookie(cookieName, token, { ...cookieSettings, maxAge: SESSION_DAYS * 86_400, expires: expiresAt });
    return { user: await getUser(db, account.id) };
  });
  app.get('/api/auth/me', { preHandler: authenticated }, async (request) => ({ user: request.auth!.user }));
  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[cookieName];
    if (token) await db.delete(tables.sessions).where(eq(tables.sessions.tokenHash, hashToken(token)));
    reply.clearCookie(cookieName, cookieSettings);
    return { message: 'Até a próxima rodada.' };
  });
  app.post('/api/auth/forgot', recoverLimit, async (request) => {
    const { email } = z.object({ email: emailSchema }).strict().parse(request.body);
    const [user] = await db.select().from(tables.users).where(eq(tables.users.email, email));
    if (user) {
      const token = newToken();
      await db.transaction(async (tx) => {
        await tx.delete(tables.passwordResets).where(eq(tables.passwordResets.userId, user.id));
        await tx.insert(tables.passwordResets).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now()+1_800_000) });
      });
      await mailer.send(email, 'reset', token);
    }
    return { message: 'Se o e-mail estiver cadastrado, enviaremos um link de recuperação.' };
  });
  app.post('/api/auth/reset', authLimit, async (request, reply) => {
    const { token, password } = z.object({ token: tokenSchema, password: passwordSchema }).strict().parse(request.body);
    const passwordHash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const [reset] = await tx.delete(tables.passwordResets).where(and(eq(tables.passwordResets.tokenHash, hashToken(token)), gt(tables.passwordResets.expiresAt, new Date()))).returning();
      if (!reset) throw new HttpError(400, 'Link inválido ou expirado. Solicite outro e-mail.');
      await tx.update(tables.users).set({ passwordHash }).where(eq(tables.users.id, reset.userId));
      await tx.delete(tables.sessions).where(eq(tables.sessions.userId, reset.userId));
      await tx.delete(tables.passwordResets).where(eq(tables.passwordResets.userId, reset.userId));
    });
    reply.clearCookie(cookieName, cookieSettings);
    return { message: 'Senha alterada. Entre novamente na sua conta.' };
  });
  app.post('/api/game-ticket', { preHandler: authenticated }, async (request) => {
    const { user, session } = request.auth!;
    if (!user.verified) throw new HttpError(403, 'Confirme seu e-mail antes de entrar no bar.');
    if(!user.character)throw new HttpError(409,'Crie seu personagem antes de entrar no bar.');
    const ticket = signTicket({ userId: user.id, sessionId: session.id, displayName: user.displayName, color: user.color, role: user.role }, config.authSecret);
    return { ticket, user };
  });
  app.get('/api/wardrobe',{preHandler:authenticated},request=>wardrobe.view(request.auth!.user));
  app.post('/api/character',{preHandler:authenticated},async request=>{
    const {character}= {character:characterSchema.parse(request.body)};
    const result=await wardrobe.saveCharacter(request.auth!.user,character);
    return {...result,user:await getUser(db,request.auth!.user.id)};
  });
  app.post('/api/wardrobe/equip',{preHandler:authenticated},async request=>{
    const {skin}=skinMessageSchema.parse(request.body);
    const result=await wardrobe.equip(request.auth!.user,skin);
    return {...result,user:await getUser(db,request.auth!.user.id)};
  });
  app.post('/api/wardrobe/buy',{preHandler:authenticated},request=>wardrobe.buy(request.auth!.user,skinMessageSchema.parse(request.body).skin));
  app.post('/api/wardrobe/daily',{preHandler:authenticated},request=>wardrobe.claimDaily(request.auth!.user));
  app.get('/api/stats', { preHandler: authenticated }, async (request) => {
    const [stats] = await db.select().from(tables.statistics).where(eq(tables.statistics.userId, request.auth!.user.id));
    return { gamesPlayed: stats?.gamesPlayed ?? 0, wins: stats?.blackjackWins ?? 0, losses: stats?.blackjackLosses ?? 0, draws: stats?.blackjackDraws ?? 0 };
  });
  app.get('/api/blocks', { preHandler: authenticated }, async (request) => ({ blocked: await blockedIds(db, request.auth!.user.id) }));
  app.post('/api/blocks', { preHandler: authenticated }, async (request) => {
    const { playerId } = z.object({ playerId: uuidSchema }).strict().parse(request.body);
    if (playerId === request.auth!.user.id) throw new HttpError(400, 'Você não pode bloquear sua própria conta.');
    if (!await getUser(db, playerId)) throw new HttpError(404, 'Jogador não encontrado.');
    await db.insert(tables.blocks).values({ userId: request.auth!.user.id, blockedId: playerId }).onConflictDoNothing();
    return { blocked: await blockedIds(db, request.auth!.user.id) };
  });
  app.delete('/api/blocks/:id', { preHandler: authenticated }, async (request) => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    await db.delete(tables.blocks).where(and(eq(tables.blocks.userId, request.auth!.user.id), eq(tables.blocks.blockedId, id)));
    return { blocked: await blockedIds(db, request.auth!.user.id) };
  });
  app.post('/api/reports', { preHandler: authenticated, config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const { playerId, reason } = z.object({ playerId: uuidSchema, reason: reasonSchema }).strict().parse(request.body);
    if (playerId === request.auth!.user.id) throw new HttpError(400, 'Escolha outro jogador.');
    if (!await getUser(db, playerId)) throw new HttpError(404, 'Jogador não encontrado.');
    await db.insert(tables.reports).values({ id: randomUUID(), reporterId: request.auth!.user.id, userId: playerId, reason });
    return reply.code(201).send({ message: 'Denúncia recebida pela administração.' });
  });
  app.get('/api/admin/overview', { preHandler: administrator }, request => {
    const query=z.object({search:z.string().trim().max(100).default(''),offset:z.coerce.number().int().min(0).max(1000000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().parse(request.query);
    return administration.overview(request.auth!.user,query);
  });
  app.post('/api/admin/wallet',{preHandler:administrator},request=>{
    const body=z.object({playerId:uuidSchema,operation:z.enum(['add','remove','set']),amount:z.number().int().min(0).max(MAX_COIN_BALANCE),reason:reasonSchema,
      requestId:uuidSchema.toLowerCase(),expectedBalance:z.number().int().min(0).max(MAX_COIN_BALANCE).optional()}).strict()
      .refine(b=>b.operation==='set'||b.amount>0,{message:'Informe uma quantidade maior que zero.'})
      .refine(b=>b.operation!=='set'||b.expectedBalance!==undefined,{message:'Consulte o saldo atual antes de definir um novo valor.'}).parse(request.body);
    return administration.adjustWallet(request.auth!.user.id,body);
  });
  app.post('/api/admin/role',{preHandler:administrator},request=>{
    const body=z.object({playerId:uuidSchema,role:z.enum(['admin','user']),reason:reasonSchema}).strict().parse(request.body);
    return administration.changeRole(request.auth!.user.id,body);
  });
  app.post('/api/admin/action',{preHandler:administrator},async request=>{
    const body=z.object({action:z.enum(['kick','ban','unban','unkick','event']),playerId:uuidSchema.optional(),reason:reasonSchema.optional(),eventType:z.enum(['BLACKOUT','DRUNK_NPC','PARTY']).optional()}).strict().parse(request.body);
    const result=await administration.moderate(request.auth!.user.id,body);
    request.log.info({actorId:request.auth!.user.id,action:body.action,playerId:body.playerId},'Ação administrativa');
    return result;
  });
  app.post('/api/admin/revert',{preHandler:administrator},request=>{
    const body=z.object({actionId:z.string().min(1).max(128),reason:reasonSchema}).strict().parse(request.body);
    return administration.revert(request.auth!.user.id,body);
  });
  app.post('/api/internal/validate', internalOptions, async (request) => {
    const { sessionId, userId } = z.object({ sessionId: uuidSchema, userId: uuidSchema }).strict().parse(request.body);
    const [session] = await db.select().from(tables.sessions).where(and(eq(tables.sessions.id, sessionId), eq(tables.sessions.userId, userId), gt(tables.sessions.expiresAt, new Date())));
    const user = session ? await getUser(db, userId) : null;
    const banned=await isBanned(db,userId),valid = !!user?.verified && !banned;
    return { valid,banned, blocked: valid ? await blockedIds(db, userId) : [], role: user?.role ?? 'user',...(valid&&user?await wardrobe.access(user):{}) };
  });
  app.post('/api/internal/equip',internalOptions,async request=>{
    const {sessionId,userId,skin:requestedSkin}=z.object({sessionId:uuidSchema,userId:uuidSchema,skin:z.string().max(32)}).strict().parse(request.body);
    const skin=skinMessageSchema.parse({skin:requestedSkin}).skin;
    const [session]=await db.select().from(tables.sessions).where(and(eq(tables.sessions.id,sessionId),eq(tables.sessions.userId,userId),gt(tables.sessions.expiresAt,new Date())));
    const user=session?await getUser(db,userId):null;
    if(!user?.verified||await isBanned(db,userId))throw new HttpError(401,'Sessão encerrada.');
    await wardrobe.equip(user,skin);
    return {valid:true,role:user.role,blocked:await blockedIds(db,userId),...await wardrobe.access({...user,equippedSkin:skin})};
  });
  app.get('/api/internal/controls', internalOptions, async () => {
    // DELETE RETURNING claims a queued command once, atomically, even if pollers overlap.
    const queued = await db.delete(tables.controls).returning();
    return { controls: queued.sort((a,b) => a.createdAt.getTime()-b.createdAt.getTime()).map((row) => row.payload) };
  });
  app.post('/api/internal/stats', internalOptions, async (request) => {
    const { roundId, results } = z.object({ roundId: z.string().min(1).max(128), results: z.array(z.object({ userId: uuidSchema, result: z.enum(['win','loss','draw']) }).strict()).min(1).max(64) }).strict().parse(request.body);
    await db.transaction(async (tx) => {
      for (const result of results) {
        const recorded = await tx.insert(tables.gameResults).values({ id: `${roundId}:${result.userId}`, ...result }).onConflictDoNothing().returning({ id: tables.gameResults.id });
        if (!recorded.length) continue;
        await tx.insert(tables.statistics).values({ userId: result.userId }).onConflictDoNothing();
        await tx.update(tables.statistics).set({
          gamesPlayed: sql`${tables.statistics.gamesPlayed} + 1`,
          blackjackWins: sql`${tables.statistics.blackjackWins} + ${result.result === 'win' ? 1 : 0}`,
          blackjackLosses: sql`${tables.statistics.blackjackLosses} + ${result.result === 'loss' ? 1 : 0}`,
          blackjackDraws: sql`${tables.statistics.blackjackDraws} + ${result.result === 'draw' ? 1 : 0}`,
        }).where(eq(tables.statistics.userId, result.userId));
      }
    });
    return { ok: true };
  });
  if (!config.production && config.mailEnabled) app.get('/api/dev/mail', async (request) => {
    if (!isLoopback(request.ip)) throw new HttpError(403, 'A caixa de e-mail local só está disponível neste computador.');
    return { messages: mailer.messages };
  });
  await app.ready();
  return { app, db, mailer, config };
}
