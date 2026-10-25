import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRegistry } from '../src/room/session-registry.js';

type Presence = { client: { sessionId: string }; name: string };
const presence = (name: string, sessionId: string): Presence => ({ name, client: { sessionId } });

test('ticket nonces are reserved synchronously and only become reusable after expiry is pruned', () => {
  const sessions = new SessionRegistry<Presence>();
  assert.equal(sessions.reserveNonce('one-use', 100), true);
  assert.equal(sessions.reserveNonce('one-use', 200), false);
  assert.equal(sessions.pruneExpiredNonces(100), 0, 'the previous room kept tickets through their exact expiry');
  assert.equal(sessions.reserveNonce('one-use', 200), false);
  assert.equal(sessions.pruneExpiredNonces(101), 1);
  assert.equal(sessions.reserveNonce('one-use', 200), true);
});

test('binding a takeover replaces both indexes and a delayed removal cannot remove the newcomer', () => {
  const sessions = new SessionRegistry<Presence>();
  const oldPresence = presence('old', 'session-old');
  const newcomer = presence('new', 'session-new');

  assert.equal(sessions.bind('player', oldPresence), undefined);
  assert.equal(sessions.getByUser('player'), oldPresence);
  assert.equal(sessions.getBySession('session-old'), oldPresence);
  assert.equal(sessions.bind('player', newcomer), oldPresence);
  assert.equal(sessions.size, 1);
  assert.equal(sessions.getBySession('session-old'), undefined);
  assert.equal(sessions.getByClient(newcomer.client), newcomer);

  assert.equal(sessions.remove('player', oldPresence), false, 'late onLeave from the old transport is harmless');
  assert.equal(sessions.getByUser('player'), newcomer);
  assert.equal(sessions.remove('player', newcomer), true);
  assert.equal(sessions.size, 0);
  assert.equal(sessions.getBySession('session-new'), undefined);
});

test('reconnect replaces the client index only for the current presence', () => {
  const sessions = new SessionRegistry<Presence>();
  const current = presence('current', 'before');
  const stale = presence('stale', 'stale');
  sessions.bind('player', current);

  assert.equal(sessions.replaceClient('player', stale, { sessionId: 'after' }), false);
  assert.equal(sessions.getBySession('before'), current);
  assert.equal(sessions.replaceClient('player', current, { sessionId: 'after' }), true);
  assert.equal(sessions.getBySession('before'), undefined);
  assert.equal(sessions.getBySession('after'), current);
  assert.equal(current.client.sessionId, 'after');
});

test('a session id collision is rejected without corrupting either index', () => {
  const sessions = new SessionRegistry<Presence>();
  const first = presence('first', 'shared');
  const second = presence('second', 'shared');
  sessions.bind('one', first);
  assert.throws(() => sessions.bind('two', second), /already bound/);
  assert.equal(sessions.size, 1);
  assert.equal(sessions.getByUser('one'), first);
  assert.equal(sessions.getByUser('two'), undefined);
  assert.equal(sessions.getBySession('shared'), first);
});

test('an async continuation can detect that a takeover made its presence stale', async () => {
  const sessions = new SessionRegistry<Presence>();
  const reconnecting = presence('reconnecting', 'session-old');
  const newcomer = presence('newcomer', 'session-new');
  sessions.bind('player', reconnecting);

  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const continuation = (async () => {
    await pending;
    return sessions.isCurrent('player', reconnecting);
  })();

  sessions.bind('player', newcomer);
  release();
  assert.equal(await continuation, false);
  assert.equal(sessions.isCurrent('player', newcomer), true);
});
