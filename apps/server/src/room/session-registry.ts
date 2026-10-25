export interface SessionClient {
  readonly sessionId: string;
}

/**
 * Keeps the room's transient sessions and redeemed admission tickets indexed
 * without leaking Colyseus or gameplay concerns into the registry.
 */
export class SessionRegistry<TPresence extends { client: SessionClient }> implements Iterable<[string, TPresence]> {
  private readonly byUser = new Map<string, TPresence>();
  private readonly bySession = new Map<string, { userId: string; presence: TPresence }>();
  private readonly usedNonces = new Map<string, number>();

  get size(): number { return this.byUser.size; }

  getByUser(userId: string): TPresence | undefined { return this.byUser.get(userId); }

  getBySession(sessionId: string): TPresence | undefined { return this.bySession.get(sessionId)?.presence; }

  getByClient(client: SessionClient): TPresence | undefined { return this.getBySession(client.sessionId); }

  isCurrent(userId: string, expected: TPresence): boolean { return this.byUser.get(userId) === expected; }

  values(): IterableIterator<TPresence> { return this.byUser.values(); }

  [Symbol.iterator](): IterableIterator<[string, TPresence]> { return this.byUser.entries(); }

  /** Binds a user to one live transport. A newer binding replaces the previous one atomically. */
  bind(userId: string, presence: TPresence): TPresence | undefined {
    const sessionId = presence.client.sessionId;
    const sessionOwner = this.bySession.get(sessionId);
    if (sessionOwner && (sessionOwner.userId !== userId || sessionOwner.presence !== presence)) {
      throw new Error(`Session ${sessionId} is already bound to another presence.`);
    }

    const previous = this.byUser.get(userId);
    if (previous && previous !== presence) this.removeSessionIndex(userId, previous);
    this.byUser.set(userId, presence);
    this.bySession.set(sessionId, { userId, presence });
    return previous;
  }

  /** Updates the transport after Colyseus resumes a reserved session. */
  replaceClient(userId: string, expected: TPresence, client: TPresence['client']): boolean {
    if (this.byUser.get(userId) !== expected) return false;
    const owner = this.bySession.get(client.sessionId);
    if (owner && (owner.userId !== userId || owner.presence !== expected)) return false;
    this.removeSessionIndex(userId, expected);
    expected.client = client;
    this.bySession.set(client.sessionId, { userId, presence: expected });
    return true;
  }

  /** Expected-presence matching makes a delayed leave from an old transport harmless. */
  remove(userId: string, expected?: TPresence): boolean {
    const current = this.byUser.get(userId);
    if (!current || (expected && current !== expected)) return false;
    this.byUser.delete(userId);
    this.removeSessionIndex(userId, current);
    return true;
  }

  /** Must be called synchronously before authentication awaits external state. */
  reserveNonce(nonce: string, expiresAt: number): boolean {
    if (this.usedNonces.has(nonce)) return false;
    this.usedNonces.set(nonce, expiresAt);
    return true;
  }

  pruneExpiredNonces(now: number): number {
    let removed = 0;
    for (const [nonce, expiresAt] of this.usedNonces) {
      if (expiresAt < now) { this.usedNonces.delete(nonce); removed++; }
    }
    return removed;
  }

  private removeSessionIndex(userId: string, presence: TPresence): void {
    const sessionId = presence.client.sessionId;
    const indexed = this.bySession.get(sessionId);
    if (indexed?.userId === userId && indexed.presence === presence) this.bySession.delete(sessionId);
  }
}
