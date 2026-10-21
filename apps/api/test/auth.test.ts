import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { verifyTicket } from '@bar/shared/tickets';
import { createApi } from '../src/app.js';
import { connectDatabase } from '../src/database/index.js';
import { emailVerifications, users } from '../src/database/schema.js';
import type { ApiConfig } from '../src/config.js';
import {DEFAULT_CHARACTER} from '@bar/shared';

const config: ApiConfig = {
  production: false, host: '127.0.0.1', port: 0, webOrigin: 'http://localhost:5173',
  authSecret: 'tests-only-secret-with-at-least-thirty-two-characters',
  mailEnabled: true, autoVerifyEmail: false, smtpPort: 1025, mailFrom: 'test@bar.local', dataPath: 'memory://',
};
const password = 'ButecoSeguro2026!';

test('automatic activation unlocks existing accounts and new registrations without sending confirmation', async (t) => {
  const connection = await connectDatabase({ path: 'memory://' });
  t.after(() => connection.close());
  const pending = await createApi({ config, database: connection.db, rateLimit: false });
  assert.deepEqual((await pending.app.inject('/api/auth/config')).json(), { emailVerificationRequired: true });
  const account = { email: 'pending@test.local', username: 'pending', displayName: 'Pending', password };
  const registered = await pending.app.inject({ method: 'POST', url: '/api/auth/register', payload: account });
  assert.equal(registered.statusCode, 201);
  await pending.app.inject({method:'POST',url:'/api/character',payload:DEFAULT_CHARACTER,headers:{cookie:`${registered.cookies[0].name}=${registered.cookies[0].value}`}});
  assert.equal(registered.json().verificationRequired, true);
  const [before] = await connection.db.select().from(users).where(eq(users.email, account.email));
  assert.equal(before.verified, false);
  assert.equal((await connection.db.select().from(emailVerifications)).length, 1);
  const previousLogin = await pending.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: account.email, password } });
  const previousCookie = previousLogin.cookies[0].name + '=' + previousLogin.cookies[0].value;
  await pending.app.close();

  const active = await createApi({ config: { ...config, autoVerifyEmail: true }, database: connection.db, rateLimit: false });
  t.after(() => active.app.close());
  assert.deepEqual((await active.app.inject('/api/auth/config')).json(), { emailVerificationRequired: false });
  const [after] = await connection.db.select().from(users).where(eq(users.id, before.id));
  assert.deepEqual(after, { ...before, verified: true });
  assert.equal((await connection.db.select().from(emailVerifications)).length, 0);
  const existingSession = await active.app.inject({ url: '/api/auth/me', headers: { cookie: previousCookie } });
  assert.equal(existingSession.json().user.verified, true);
  assert.equal((await active.app.inject({ method: 'POST', url: '/api/game-ticket', headers: { cookie: previousCookie }, payload: {} })).statusCode, 200);
  const existingLogin = await active.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: account.email, password } });
  assert.equal(existingLogin.statusCode, 200);
  assert.equal(existingLogin.json().user.verified, true);

  const freshAccount = { ...account, email: 'automatic@test.local', username: 'automatic' };
  const fresh = await active.app.inject({ method: 'POST', url: '/api/auth/register', payload: freshAccount });
  assert.equal(fresh.statusCode, 201);
  await active.app.inject({method:'POST',url:'/api/character',payload:DEFAULT_CHARACTER,headers:{cookie:`${fresh.cookies[0].name}=${fresh.cookies[0].value}`}});
  assert.equal(fresh.json().verificationRequired, false);
  const login = await active.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: freshAccount.email, password } });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().user.verified, true);
  const cookie = login.cookies[0].name + '=' + login.cookies[0].value;
  assert.equal((await active.app.inject({ method: 'POST', url: '/api/game-ticket', headers: { cookie }, payload: {} })).statusCode, 200);
  assert.equal((await active.app.inject({ method: 'POST', url: '/api/auth/resend', payload: { email: freshAccount.email } })).statusCode, 200);
  assert.equal(active.mailer.messages.length, 0);
  assert.equal((await connection.db.select().from(emailVerifications)).length, 0);
});

test('contas, sessões, moderação e estatísticas obedecem à autorização persistida', async (t) => {
  const api = await createApi({ config, rateLimit: false });
  t.after(() => api.app.close());
  const post = (url: string, payload: unknown, cookie?: string) => api.app.inject({ method: 'POST', url, payload: payload as object, headers: cookie ? { cookie } : {} });
  async function register(username: string) {
    const email = `${username}@test.local`;
    const response = await post('/api/auth/register', { email, username, displayName: username, password });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal((await post('/api/character',DEFAULT_CHARACTER,`${response.cookies[0].name}=${response.cookies[0].value}`)).statusCode,200);
    return email;
  }
  function mailToken(email: string, kind: 'verify'|'reset') {
    const message = api.mailer.messages.find((message) => message.to === email && message.text.includes(`?${kind}=`));
    assert.ok(message);
    return new URL(message.text.split('\n').find((line) => line.startsWith('http'))!).searchParams.get(kind)!;
  }
  async function login(email: string, pass = password) {
    const response = await post('/api/auth/login', { email, password: pass });
    assert.equal(response.statusCode, 200, response.body);
    const raw = response.headers['set-cookie'];
    const setCookie = Array.isArray(raw) ? raw[0] : raw!;
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    return { cookie: setCookie.split(';')[0], user: response.json().user };
  }
  const aliceEmail = await register('alice');
  let alice = await login(aliceEmail);
  await t.test('conta não confirmada não recebe ticket; token é consumido uma só vez', async () => {
    assert.equal((await post('/api/game-ticket', {}, alice.cookie)).statusCode, 403);
    const token = mailToken(aliceEmail, 'verify');
    assert.equal((await post('/api/auth/verify', { token })).statusCode, 200);
    assert.equal((await post('/api/auth/verify', { token })).statusCode, 400);
    const [stored] = await api.db.select().from(users).where(eq(users.email, aliceEmail));
    assert.match(stored.passwordHash, /^\$argon2id\$/);
    assert.equal(stored.role, 'player');
    assert.equal((await post('/api/auth/register', { email: 'evil@test.local', username:'evil', displayName:'Evil', password, role:'admin' })).statusCode, 400);
  });
  const ticketResponse = await post('/api/game-ticket', {}, alice.cookie);
  assert.equal(ticketResponse.statusCode, 200);
  const claims = verifyTicket(ticketResponse.json().ticket, config.authSecret);
  const internalHeaders = { 'x-internal-secret': config.authSecret };
  await t.test('API interna exige segredo; sessões pertencem ao usuário solicitado', async () => {
    const payload = { sessionId: claims.sessionId, userId: claims.userId };
    assert.equal((await post('/api/internal/validate', payload)).statusCode, 401);
    const response = await api.app.inject({ method:'POST',url:'/api/internal/validate',payload,headers:internalHeaders });
    assert.equal(response.json().valid, true);
  });
  await t.test('origem estrangeira e privilégios de jogador são rejeitados', async () => {
    assert.equal((await api.app.inject({ method:'POST',url:'/api/auth/logout',payload:{},headers:{cookie:alice.cookie,origin:'https://evil.test'} })).statusCode, 403);
    assert.equal((await api.app.inject({url:'/api/admin/overview',headers:{cookie:alice.cookie}})).statusCode, 403);
    assert.equal((await post('/api/admin/action',{action:'event',eventType:'PARTY'},alice.cookie)).statusCode, 403);
  });
  const bobEmail = await register('bob');
  await post('/api/auth/verify',{token:mailToken(bobEmail,'verify')});
  const bob = await login(bobEmail);
  await t.test('bloqueio, denúncia e estatísticas idempotentes persistem', async () => {
    const response = await post('/api/blocks',{playerId:bob.user.id},alice.cookie);
    assert.deepEqual(response.json().blocked,[bob.user.id]);
    const validation = await api.app.inject({method:'POST',url:'/api/internal/validate',payload:{sessionId:claims.sessionId,userId:claims.userId},headers:internalHeaders});
    assert.deepEqual(validation.json().blocked,[bob.user.id]);
    assert.equal((await post('/api/reports',{playerId:bob.user.id,reason:'Spam repetido no chat.'},alice.cookie)).statusCode,201);
    const payload = {roundId:'round-1',results:[{userId:alice.user.id,result:'win'},{userId:bob.user.id,result:'loss'}]};
    for (let i=0;i<2;i++) assert.equal((await api.app.inject({method:'POST',url:'/api/internal/stats',payload,headers:internalHeaders})).statusCode,200);
    const stats = await api.app.inject({url:'/api/stats',headers:{cookie:alice.cookie}});
    assert.deepEqual(stats.json(),{gamesPlayed:1,wins:1,losses:0,draws:0});
    const deleted = await api.app.inject({method:'DELETE',url:`/api/blocks/${bob.user.id}`,headers:{cookie:alice.cookie}});
    assert.deepEqual(deleted.json().blocked,[]);
  });
  await t.test('recuperação revoga sessões e impede reutilização do token', async () => {
    assert.equal((await post('/api/auth/forgot',{email:aliceEmail})).statusCode,200);
    const token = mailToken(aliceEmail,'reset');
    assert.equal((await post('/api/auth/reset',{token,password:'UmaNovaSenha2026!'})).statusCode,200);
    assert.equal((await api.app.inject({url:'/api/auth/me',headers:{cookie:alice.cookie}})).statusCode,401);
    assert.equal((await api.app.inject({method:'POST',url:'/api/internal/validate',payload:{sessionId:claims.sessionId,userId:claims.userId},headers:internalHeaders})).json().valid,false);
    assert.equal((await post('/api/auth/reset',{token,password:'OutraSenha2026!'})).statusCode,400);
    assert.equal((await post('/api/auth/login',{email:aliceEmail,password})).statusCode,401);
    alice = await login(aliceEmail,'UmaNovaSenha2026!');
  });
  await t.test('banimento revoga sessões; ações são auditadas e consumidas uma vez', async () => {
    // Fixture explicitly elevates the known account; registration itself never grants this role.
    await api.db.update(users).set({role:'admin'}).where(eq(users.id,alice.user.id));
    assert.equal((await post('/api/admin/action',{action:'ban',playerId:bob.user.id,reason:'Abuso confirmado.'},alice.cookie)).statusCode,200);
    assert.equal((await api.app.inject({url:'/api/auth/me',headers:{cookie:bob.cookie}})).statusCode,401);
    assert.equal((await post('/api/auth/login',{email:bobEmail,password})).statusCode,403);
    const overview = await api.app.inject({url:'/api/admin/overview',headers:{cookie:alice.cookie}});
    assert.equal(overview.json().reports.length,1);
    assert.equal(overview.json().logs[0].action,'ban');
    const queued = await api.app.inject({url:'/api/internal/controls',headers:internalHeaders});
    assert.equal(queued.json().controls[0].action,'ban');
    assert.deepEqual((await api.app.inject({url:'/api/internal/controls',headers:internalHeaders})).json().controls,[]);
    assert.equal((await post('/api/admin/action',{action:'unban',playerId:bob.user.id,reason:'Revisão concluída.'},alice.cookie)).statusCode,200);
    const freshBob = await login(bobEmail);
    assert.equal((await post('/api/auth/logout',{},freshBob.cookie)).statusCode,200);
    assert.equal((await api.app.inject({url:'/api/auth/me',headers:{cookie:freshBob.cookie}})).statusCode,401);
  });
});

test('PostgreSQL embutido preserva contas ao reiniciar e aplica a migração novamente', async () => {
  const directory = await mkdtemp(join(tmpdir(),'bar-api-persistence-'));
  try {
    const first = await createApi({config:{...config,dataPath:directory}});
    const response = await first.app.inject({method:'POST',url:'/api/auth/register',payload:{email:'persist@test.local',username:'persist',displayName:'Persistente',password}});
    assert.equal(response.statusCode,201,response.body);
    await first.app.close();
    const second = await connectDatabase({path:directory});
    const stored = await second.db.select().from(users).where(eq(users.email,'persist@test.local'));
    assert.equal(stored.length,1);
    assert.equal(stored[0].verified,false);
    await second.close();
  } finally { await rm(directory,{recursive:true,force:true}); }
});
