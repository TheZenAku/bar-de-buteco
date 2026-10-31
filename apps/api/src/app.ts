import Fastify, { LogController, type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { signTicket } from '@bar/shared/tickets';
import {skinMessageSchema,ADMIN_LOG_CATEGORIES,ADMIN_PLAYER_FILTERS,ADMIN_PLAYER_SORTS,ITEM_IDS,MAX_COIN_BALANCE,PHONE,PHONE_MEDIA_KINDS,PHONE_MEDIA_TYPES,WALLET_REASON,mediaBaseType,type PublicUser} from '@bar/shared';
import {WardrobeService} from './wardrobe.js';
import {InventoryService} from './inventory-service.js';
import {WalletService} from './wallet-service.js';
import {PhoneService} from './phone-service.js';
import {AdminService} from './admin-service.js';
import {AdminConsole} from './admin-console.js';
import {PricingService} from './pricing-service.js';
import {DevBots} from './dev-bots.js';
import {ensureOwnerAdministrator,isOwnerEmail} from './admin-policy.js';
import {acknowledgeControls,claimControlsOnce,leaseControls} from './control-outbox.js';
import {createApiMetrics,requestIdFor} from './observability.js';
import { readConfig, type ApiConfig } from './config.js';
import { connectDatabase, connectMigratedDatabase, type Database } from './database/index.js';
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

export async function createApi(options: { config?: ApiConfig; database?: Database; logger?: boolean; rateLimit?: boolean; migrate?: boolean } = {}) {
  const config = options.config ?? readConfig();
  if(options.migrate&&config.production)throw new Error('A API de produção não pode executar migrações; use o job migrate.');
  const connection = options.database ? null : await (options.migrate?connectMigratedDatabase:connectDatabase)({ url: config.databaseUrl, path: config.dataPath });
  const db = options.database ?? connection!.db;
  const pricing=new PricingService(db);
  const wardrobe=new WardrobeService(db,pricing);
  const inventory=new InventoryService(db,wardrobe);
  const wallet=new WalletService(db,wardrobe);
  const phone=new PhoneService(db,wardrobe);
  const administration=new AdminService(db,wardrobe);
  const mailer = new Mailer(config);
  const cookieName = config.production ? '__Host-bar_session' : 'bar_session';
  const cookieSettings = { path: '/', httpOnly: true, secure: config.production, sameSite: 'lax' as const };
  const allowedOrigins = new Set([config.webOrigin]);
  if (!config.production) for (const scheme of ['http', 'https']) { allowedOrigins.add(`${scheme}://localhost:5173`); allowedOrigins.add(`${scheme}://127.0.0.1:5173`); }
  // In development the Vite proxy (loopback) forwards the browser address, so LAN clients are not treated as local.
  const app = Fastify({ bodyLimit: 16_384, trustProxy: config.trustProxyHops ? (_address: string, hop: number) => hop < config.trustProxyHops! : config.production ? false : 'loopback', logger: options.logger ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-internal-secret'] } : false,
    // Correlation: the caller's x-request-id (the world sends one per internal call) or a new id, logged as requestId.
    genReqId: requestIdFor, logController: new LogController({ requestIdLogLabel: 'requestId' }) });
  const metrics = createApiMetrics();
  const adminConsole = new AdminConsole(db, administration, pricing, { driver: connection?.driver ?? 'injected', dataPath: config.dataPath, metrics: metrics.registry });
  app.addHook('onSend', async (request, reply) => { reply.header('x-request-id', request.id); });
  app.addHook('onResponse', async (request, reply) => { metrics.record(request.method, request.routeOptions.url, reply.statusCode, reply.elapsedTime); });
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
    if (!equalSecret(request.headers['x-internal-secret'], config.internalSecret)) throw new HttpError(401, 'Acesso interno inválido.');
  }
  const authLimit = { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } };
  const recoverLimit = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };
  const internalOptions = { preHandler: internal, config: { rateLimit: false as const } };
  const dummyHash = await hashPassword(newToken());

  // /api/health: the process answers. /api/ready: the database answers too (traffic can come).
  app.get('/api/health', async () => ({ ok: true, service: 'bar-api', database: connection?.driver ?? 'injected' }));
  app.get('/api/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    try { await db.execute(sql`select 1`); return { ready: true, checks: { database: true } }; }
    catch { return reply.code(503).send({ ready: false, checks: { database: false } }); }
  });
  app.get('/api/internal/metrics', internalOptions, async (_request, reply) => reply.type('text/plain; version=0.0.4').send(metrics.registry.render()));
  app.get('/api/auth/config', async () => ({ emailVerificationRequired: !config.autoVerifyEmail }));
  // What everything costs and pays now (packages/shared/src/prices.ts, Preços in the administration).
  app.get('/api/prices', async () => ({ prices: await pricing.table() }));
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
    return reply.code(201).send({user:await getUser(db,userId), verificationRequired: !config.autoVerifyEmail, message: config.autoVerifyEmail ? 'Conta criada! Puxe uma cadeira.' : 'Conta criada. Confirme seu e-mail para entrar.' });
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
    if (!account || !correct) { request.log.warn({ event: 'login_failure', ip: request.ip }, 'Falha de autenticação'); if (account) void adminConsole.record([{ source: 'api', event: 'login_failed', userId: account.id }]); throw new HttpError(401, 'E-mail ou senha incorretos.'); }
    if (await isBanned(db, account.id)) throw new HttpError(403, 'Esta conta está banida do bar.');
    // Rotate an existing browser session on sign-in.
    if (request.cookies[cookieName]) await db.delete(tables.sessions).where(eq(tables.sessions.tokenHash, hashToken(request.cookies[cookieName]!)));
    const { token, expiresAt } = await createSession(db, account.id);
    reply.setCookie(cookieName, token, { ...cookieSettings, maxAge: SESSION_DAYS * 86_400, expires: expiresAt });
    void adminConsole.record([{ source: 'api', event: 'login', userId: account.id }]);
    return { user: await getUser(db, account.id) };
  });
  app.get('/api/auth/me', { preHandler: authenticated }, async (request) => ({ user: request.auth!.user }));
  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[cookieName];
    const [ended] = token ? await db.delete(tables.sessions).where(eq(tables.sessions.tokenHash, hashToken(token))).returning({ userId: tables.sessions.userId }) : [];
    if (ended) void adminConsole.record([{ source: 'api', event: 'logout', userId: ended.userId }]);
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
    const userId = await db.transaction(async (tx) => {
      const [reset] = await tx.delete(tables.passwordResets).where(and(eq(tables.passwordResets.tokenHash, hashToken(token)), gt(tables.passwordResets.expiresAt, new Date()))).returning();
      if (!reset) throw new HttpError(400, 'Link inválido ou expirado. Solicite outro e-mail.');
      await tx.update(tables.users).set({ passwordHash }).where(eq(tables.users.id, reset.userId));
      await tx.delete(tables.sessions).where(eq(tables.sessions.userId, reset.userId));
      await tx.delete(tables.passwordResets).where(eq(tables.passwordResets.userId, reset.userId));
      return reset.userId;
    });
    void adminConsole.record([{ source: 'api', event: 'password_reset', userId }]);
    reply.clearCookie(cookieName, cookieSettings);
    return { message: 'Senha alterada. Entre novamente na sua conta.' };
  });
  app.post('/api/game-ticket', { preHandler: authenticated }, async (request) => {
    const { user, session } = request.auth!;
    if (!user.verified) throw new HttpError(403, 'Confirme seu e-mail antes de entrar no bar.');
    const ticket = signTicket({ userId: user.id, sessionId: session.id, displayName: user.displayName, color: user.color, role: user.role }, config.authSecret);
    return { ticket, user };
  });
  app.get('/api/wardrobe',{preHandler:authenticated},request=>wardrobe.view(request.auth!.user));
  app.post('/api/wardrobe/equip',{preHandler:authenticated},async request=>{
    const {skin}=skinMessageSchema.parse(request.body);
    const result=await wardrobe.equip(request.auth!.user,skin);
    return {...result,user:await getUser(db,request.auth!.user.id)};
  });
  app.post('/api/wardrobe/buy',{preHandler:authenticated},request=>wardrobe.buy(request.auth!.user,skinMessageSchema.parse(request.body).skin));
  app.post('/api/wardrobe/daily',{preHandler:authenticated},request=>wardrobe.claimDaily(request.auth!.user));
  app.get('/api/inventory',{preHandler:authenticated},request=>inventory.view(request.auth!.user.id));
  app.post('/api/inventory/buy',{preHandler:authenticated},request=>{
    const body=z.object({itemId:z.enum(ITEM_IDS),quantity:z.number().int().min(1).max(10),requestId:uuidSchema.toLowerCase()}).strict().parse(request.body);
    return inventory.buy(request.auth!.user,body.itemId,body.quantity,body.requestId);
  });
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
  // The in-game phone (apps/api/src/phone-service.ts). The room only forwards "something new" pings between players;
  // what changed is always read here, so a forged ping shows nothing that is not true.
  async function phoneUser(request: FastifyRequest) {
    await authenticated(request);
    if (!request.auth!.user.verified) throw new HttpError(403, 'Confirme seu e-mail para usar o celular.');
    if (request.method !== 'GET' && await isBanned(db, request.auth!.user.id)) throw new HttpError(403, 'Sua conta está suspensa.');
  }
  const me = (request: FastifyRequest) => request.auth!.user.id;
  const phoneTarget = z.object({ userId: uuidSchema.optional(), number: z.string().regex(/^\d{9}$/, 'Digite um número de 9 dígitos.').optional() }).strict()
    .refine(target => !!target.userId !== !!target.number, 'Escolha um contato ou digite um número.');
  const idParams = z.object({ id: uuidSchema });
  const beforeQuery = z.object({ before: z.coerce.number().int().positive().optional() }).strict();
  const feedQuery = z.object({ before: z.coerce.number().int().positive().optional(), scope: z.enum(['following', 'all']).default('all') }).strict();
  // Highzap media arrive as the recorded bytes, not JSON (POST /api/phone/zap/:id/media).
  app.addContentTypeParser([...new Set(Object.values(PHONE_MEDIA_TYPES).flat())], { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  app.get('/api/phone', { preHandler: phoneUser }, request => phone.profile(me(request)));
  // The player card (clicking someone in the bar): the way to get a number to save.
  app.get('/api/phone/card/:id', { preHandler: phoneUser }, request => phone.card(me(request), idParams.parse(request.params).id));
  app.get('/api/phone/lookup', { preHandler: phoneUser }, request => phone.resolve({ number: z.object({ number: z.string().regex(/^\d{9}$/, 'Digite um número de 9 dígitos.') }).strict().parse(request.query).number }));
  app.post('/api/phone/contacts', { preHandler: phoneUser }, request => phone.addContact(me(request), phoneTarget.parse(request.body)));
  app.delete('/api/phone/contacts/:id', { preHandler: phoneUser }, request => phone.removeContact(me(request), idParams.parse(request.params).id));
  app.get('/api/phone/zap', { preHandler: phoneUser }, async request => ({ threads: await phone.threads(me(request)) }));
  app.get('/api/phone/zap/:id', { preHandler: phoneUser }, request => phone.thread(me(request), idParams.parse(request.params).id, beforeQuery.parse(request.query).before));
  app.post('/api/phone/zap/:id', { preHandler: phoneUser, config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, request => {
    const body = z.object({ text: z.string().max(PHONE.messageMax * 2), requestId: uuidSchema.toLowerCase() }).strict().parse(request.body);
    return phone.send(me(request), idParams.parse(request.params).id, body.text, body.requestId);
  });
  app.get('/api/phone/gram', { preHandler: phoneUser }, async request => { const query = feedQuery.parse(request.query); return { posts: await phone.feed(me(request), query.before, query.scope) }; });
  app.patch('/api/phone/gram/me', { preHandler: phoneUser, bodyLimit: Math.ceil(PHONE.avatarMaxBytes * 1.4) + 4096, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, request => {
    const body = z.object({ name: z.string().max(PHONE.gramNameMax * 2).optional(), handle: z.string().max(48).optional(), bio: z.string().max(PHONE.bioMax * 2).optional(),
      photo: z.string().max(Math.ceil(PHONE.avatarMaxBytes * 1.4)).nullable().optional() }).strict().parse(request.body);
    return phone.updateGram(me(request), body);
  });
  // The URL carries the photo's version (?v=), so a new photo is a new URL.
  app.get('/api/phone/gram/avatars/:id', { preHandler: phoneUser, config: { rateLimit: { max: 900, timeWindow: '1 minute' } } }, async (request, reply) => {
    const photo = await phone.avatar(me(request), idParams.parse(request.params).id);
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/jpeg').send(photo);
  });
  app.get('/api/phone/gram/search', { preHandler: phoneUser }, async request => ({ people: await phone.search(me(request), z.object({ q: z.string().max(80) }).strict().parse(request.query).q) }));
  // `here`: who the phone sees in the bar (ids from the room), to suggest them; only real accounts count.
  app.get('/api/phone/gram/suggestions', { preHandler: phoneUser }, async request => {
    const { here } = z.object({ here: z.string().max(64 * 37).default('') }).strict().parse(request.query);
    return { people: await phone.suggestions(me(request), here.split(',').filter(id => uuidSchema.safeParse(id).success)) };
  });
  app.post('/api/phone/gram/users/:id/follow', { preHandler: phoneUser, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, request =>
    phone.follow(me(request), idParams.parse(request.params).id, z.object({ followed: z.boolean() }).strict().parse(request.body).followed));
  app.get('/api/phone/gram/users/:id/:list', { preHandler: phoneUser }, async request => {
    const params = z.object({ id: uuidSchema, list: z.enum(['followers', 'following']) }).parse(request.params);
    return { people: await phone.followList(me(request), params.id, params.list) };
  });
  app.post('/api/phone/zap/:id/media', { preHandler: phoneUser, bodyLimit: PHONE.videoMaxBytes, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, request => {
    const query = z.object({ kind: z.enum(PHONE_MEDIA_KINDS), ms: z.coerce.number().int().min(0).max(600_000).optional(), requestId: uuidSchema.toLowerCase() }).strict().parse(request.query);
    if (!Buffer.isBuffer(request.body)) throw new HttpError(415, 'Formato de arquivo não aceito.');
    return phone.sendMedia(me(request), idParams.parse(request.params).id, { kind: query.kind, type: mediaBaseType(request.headers['content-type'] ?? ''), bytes: request.body, ms: query.ms }, query.requestId);
  });
  // Only the two ends of the conversation; a file never changes, so the browser keeps it.
  app.get('/api/phone/zap/media/:id', { preHandler: phoneUser, config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (request, reply) => {
    const media = await phone.media(me(request), idParams.parse(request.params).id);
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type(media.type).send(media.bytes);
  });
  app.get('/api/phone/gram/users/:id', { preHandler: phoneUser }, request => phone.gramProfile(me(request), idParams.parse(request.params).id));
  // A photo is about 60–150 kB of JPEG; as a data URL in JSON it is a third larger.
  app.post('/api/phone/gram/posts', { preHandler: phoneUser, bodyLimit: Math.ceil(PHONE.photoMaxBytes * 1.4) + 4096, config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, request => {
    const body = z.object({ image: z.string().max(Math.ceil(PHONE.photoMaxBytes * 1.4)), caption: z.string().max(PHONE.captionMax * 2).default(''), requestId: uuidSchema.toLowerCase() }).strict().parse(request.body);
    return phone.createPost(me(request), body.image, body.caption, body.requestId);
  });
  // Photos never change (a new post is a new id): the browser keeps them.
  app.get('/api/phone/gram/photos/:id', { preHandler: phoneUser, config: { rateLimit: { max: 900, timeWindow: '1 minute' } } }, async (request, reply) => {
    const photo = await phone.photo(me(request), idParams.parse(request.params).id);
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/jpeg').send(photo);
  });
  app.delete('/api/phone/gram/posts/:id', { preHandler: phoneUser }, async request => {
    const user = request.auth!.user;
    await phone.deletePost(user.id, idParams.parse(request.params).id, user.verified && user.role === 'admin');
    return { deleted: true };
  });
  app.post('/api/phone/gram/posts/:id/like', { preHandler: phoneUser, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, request =>
    phone.like(me(request), idParams.parse(request.params).id, z.object({ liked: z.boolean() }).strict().parse(request.body).liked));
  app.get('/api/phone/gram/posts/:id/comments', { preHandler: phoneUser }, async request => ({ comments: await phone.comments(me(request), idParams.parse(request.params).id) }));
  app.post('/api/phone/gram/posts/:id/comments', { preHandler: phoneUser, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, request => {
    const body = z.object({ text: z.string().max(PHONE.commentMax * 2), requestId: uuidSchema.toLowerCase() }).strict().parse(request.body);
    return phone.comment(me(request), idParams.parse(request.params).id, body.text, body.requestId);
  });
  app.delete('/api/phone/gram/comments/:id', { preHandler: phoneUser }, async request => { await phone.deleteComment(me(request), idParams.parse(request.params).id); return { deleted: true }; });
  app.get('/api/phone/bank', { preHandler: phoneUser }, request => phone.bank(me(request)));
  app.post('/api/phone/bank/pix', { preHandler: phoneUser, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, request => {
    const body = z.object({ userId: uuidSchema.optional(), number: z.string().regex(/^\d{9}$/, 'Digite um número de 9 dígitos.').optional(), amount: z.number().int(), requestId: uuidSchema.toLowerCase() }).strict()
      .refine(target => !!target.userId !== !!target.number, 'Escolha um contato ou digite um número.').parse(request.body);
    return phone.pix(me(request), body.userId ? { userId: body.userId } : { number: body.number }, body.amount, body.requestId);
  });
  app.get('/api/admin/overview', { preHandler: administrator }, request => {
    const query=z.object({search:z.string().trim().max(100).default(''),offset:z.coerce.number().int().min(0).max(1000000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25),
      filter:z.enum(ADMIN_PLAYER_FILTERS).default('all'),sort:z.enum(ADMIN_PLAYER_SORTS).default('recent'),online:z.string().max(128*37).default('')}).strict().parse(request.query);
    return administration.overview(request.auth!.user,{...query,online:query.online.split(',').filter(id=>uuidSchema.safeParse(id).success)});
  });
  app.get('/api/admin/summary',{preHandler:administrator},request=>adminConsole.summary(request.auth!.user));
  app.get('/api/admin/players/:id',{preHandler:administrator},request=>adminConsole.player(request.auth!.user,idParams.parse(request.params).id));
  app.post('/api/admin/player',{preHandler:administrator},async request=>{
    const base={playerId:uuidSchema,reason:reasonSchema};
    const body=z.discriminatedUnion('op',[
      z.object({...base,op:z.literal('rename'),displayName:z.string().max(64)}).strict(),
      z.object({...base,op:z.literal('verify')}).strict(),
      z.object({...base,op:z.literal('logout')}).strict(),
      z.object({...base,op:z.literal('item'),itemId:z.enum(ITEM_IDS),quantity:z.number().int().min(-100).max(100)}).strict(),
      z.object({...base,op:z.literal('skin'),skinId:z.string().max(32),grant:z.boolean()}).strict(),
    ]).parse(request.body);
    const {playerId,reason,...operation}=body;
    const result=await adminConsole.changePlayer(request.auth!.user.id,playerId,operation,reason);
    request.log.info({actorId:request.auth!.user.id,op:operation.op,playerId},'Ação administrativa');
    return result;
  });
  app.get('/api/admin/reports',{preHandler:administrator},async request=>({reports:await adminConsole.reports(z.object({status:z.enum(['open','resolved','all']).default('open')}).strict().parse(request.query).status)}));
  app.post('/api/admin/reports/resolve',{preHandler:administrator},request=>{
    const body=z.object({reportId:z.string().min(1).max(128),resolution:reasonSchema.nullable()}).strict().parse(request.body);
    return adminConsole.resolveReport(request.auth!.user.id,body.reportId,body.resolution);
  });
  app.get('/api/admin/logs',{preHandler:administrator},request=>{
    const query=z.object({categories:z.string().max(200).default(ADMIN_LOG_CATEGORIES.join(',')),player:uuidSchema.optional(),q:z.string().trim().max(100).optional(),
      since:z.iso.datetime().optional(),before:z.iso.datetime().optional(),limit:z.coerce.number().int().min(1).max(200).default(60)}).strict().parse(request.query);
    const categories=ADMIN_LOG_CATEGORIES.filter(category=>query.categories.split(',').includes(category));
    return adminConsole.logs({categories,playerId:query.player,q:query.q,since:query.since?new Date(query.since):undefined,before:query.before?new Date(query.before):undefined,limit:query.limit});
  });
  app.get('/api/admin/economy',{preHandler:administrator},request=>adminConsole.economy(Number(z.object({days:z.enum(['7','30','90']).default('30')}).strict().parse(request.query).days)));
  app.get('/api/admin/prices',{preHandler:administrator},async request=>({rows:await pricing.rows(),changes:await administration.audits(request.auth!.user,eq(tables.moderationActions.action,'price-set'),20)}));
  app.post('/api/admin/prices',{preHandler:administrator},request=>{
    const body=z.object({changes:z.array(z.object({key:z.string().min(1).max(64),value:z.number().int().nullable()}).strict()).min(1).max(64),reason:reasonSchema}).strict().parse(request.body);
    return pricing.change(request.auth!.user.id,body.changes,body.reason);
  });
  app.get('/api/admin/server',{preHandler:administrator},()=>adminConsole.serverInfo());
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
    return { valid,banned, blocked: valid ? await blockedIds(db, userId) : [], role: user?.role ?? 'user',...(valid&&user?{...await wardrobe.access(user),...await inventory.access(user.id)}:{}) };
  });
  app.post('/api/internal/inventory',internalOptions,async request=>{
    const body=z.object({sessionId:uuidSchema,userId:uuidSchema,itemId:z.enum(ITEM_IDS),quantity:z.number().int().min(1).max(10),
      reason:z.enum(['use','discard','faint']),requestId:uuidSchema.toLowerCase()}).strict().parse(request.body);
    const [session]=await db.select().from(tables.sessions).where(and(eq(tables.sessions.id,body.sessionId),eq(tables.sessions.userId,body.userId),gt(tables.sessions.expiresAt,new Date())));
    if(!session||await isBanned(db,body.userId))throw new HttpError(401,'Sessão encerrada.');
    return inventory.remove(body.userId,body.itemId,body.quantity,body.reason,body.requestId);
  });
  // Coins spent or earned in the room (apps/api/src/wallet-service.ts); only the live session's player.
  app.post('/api/internal/wallet',internalOptions,async request=>{
    const body=z.object({sessionId:uuidSchema,userId:uuidSchema,amount:z.number().int().min(-100_000).max(100_000).refine(n=>n!==0),
      reason:z.string().max(90).regex(WALLET_REASON),requestId:uuidSchema.toLowerCase()}).strict().parse(request.body);
    const [session]=await db.select().from(tables.sessions).where(and(eq(tables.sessions.id,body.sessionId),eq(tables.sessions.userId,body.userId),gt(tables.sessions.expiresAt,new Date())));
    if(!session||await isBanned(db,body.userId))throw new HttpError(401,'Sessão encerrada.');
    return wallet.change(body);
  });
  // The end of a blackjack round for one player: paid against the round's bets on the ledger, once (wallet-service.ts).
  app.post('/api/internal/blackjack/settle',internalOptions,async request=>{
    const body=z.object({userId:uuidSchema,roundId:uuidSchema,payout:z.number().int().min(0).max(10_000_000),
      stakes:z.array(uuidSchema.toLowerCase()).max(16),voids:z.array(uuidSchema.toLowerCase()).max(16)}).strict().parse(request.body);
    return wallet.settleBlackjack(body);
  });
  // The end of a pebolim match for one player: the winners are paid against the match's stakes on the ledger, once.
  app.post('/api/internal/foosball/settle',internalOptions,async request=>{
    const body=z.object({userId:uuidSchema,roundId:uuidSchema,payout:z.number().int().min(0).max(10_000_000),
      stakes:z.array(uuidSchema.toLowerCase()).max(16),voids:z.array(uuidSchema.toLowerCase()).max(16)}).strict().parse(request.body);
    return wallet.settleFoosball(body);
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
  app.get('/api/internal/prices', internalOptions, async () => ({ prices: await pricing.table() }));
  // The world's events for the administration's log (WORLD_LOG_EVENTS), in batches.
  app.post('/api/internal/logs', { ...internalOptions, bodyLimit: 262_144 }, async (request) => {
    const { events } = z.object({ events: z.array(z.object({ event: z.string().min(1).max(64), userId: z.string().max(64).optional(), details: z.record(z.string(), z.unknown()).optional(), at: z.number().int().positive() }).strict()).max(200) }).strict().parse(request.body);
    await adminConsole.record(events.map(event => ({ ...event, source: 'world' as const })));
    return { recorded: events.length };
  });
  // Previous world versions: each control delivered once, as before (no confirmation).
  app.get('/api/internal/controls', internalOptions, async () => ({ controls: await claimControlsOnce(db) }));
  const ownerSchema = z.string().min(1).max(128);
  // Outbox: the world leases controls, applies them, then confirms. Unconfirmed leases are delivered again.
  app.post('/api/internal/controls/lease', internalOptions, async (request) => {
    const { owner } = z.object({ owner: ownerSchema }).strict().parse(request.body);
    return { controls: (await leaseControls(db, owner)).map(({ id, payload, attempts }) => ({ ...payload, id, attempts })) };
  });
  app.post('/api/internal/controls/ack', internalOptions, async (request) => {
    const { owner, applied, failed } = z.object({ owner: ownerSchema, applied: z.array(z.string().min(1).max(128)).max(100),
      failed: z.array(z.object({ id: z.string().min(1).max(128), error: z.string().max(500) }).strict()).max(100).default([]) }).strict().parse(request.body);
    return acknowledgeControls(db, owner, applied, failed);
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
  // Development only: a ticket for bot number `index` (tests/load/bots.ts), its account created on first use.
  if (!config.production) {
    const bots = new DevBots(db, wardrobe, dummyHash);
    app.post('/api/internal/dev/bot', internalOptions, async (request) => {
      const { index } = z.object({ index: z.number().int().min(1).max(128) }).strict().parse(request.body);
      const bot = await bots.prepare(index);
      return { ...bot, ticket: signTicket({ userId: bot.userId, sessionId: bot.sessionId, displayName: bot.displayName, color: bot.color, role: 'user', bot: true }, config.authSecret) };
    });
  }
  if (!config.production && config.mailEnabled) app.get('/api/dev/mail', async (request) => {
    if (!isLoopback(request.ip)) throw new HttpError(403, 'A caixa de e-mail local só está disponível neste computador.');
    return { messages: mailer.messages };
  });
  await app.ready();
  return { app, db, mailer, config,inventory };
}
