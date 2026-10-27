import { randomUUID } from 'node:crypto';
import { walletChangeSchema, type WalletChange } from '@bar/shared';
import { internal } from '../internal.js';

export interface WalletOwner { sessionId: string; userId: string }

/** One coin change applied by the API (apps/api/src/wallet-service.ts); the same requestId is applied once. */
export async function changeWallet(owner: WalletOwner, amount: number, reason: string, requestId: string = randomUUID()): Promise<WalletChange> {
  const answer = await internal<unknown>('wallet', { sessionId: owner.sessionId, userId: owner.userId, amount, reason, requestId });
  const parsed = walletChangeSchema.safeParse(answer);
  if (!parsed.success) throw new Error('A carteira não respondeu. Tente novamente.');
  return parsed.data;
}

interface Pending { owner: WalletOwner; amount: number; reason: string; requestId: string; attempts: number; applied?: (change: WalletChange) => void }

/**
 * Credits the API could not take yet (refunds, job pay): kept with their request id and retried by the
 * room's maintenance, so an API outage delays them instead of losing them. Debits are never queued: a
 * purchase that could not be charged is simply refused.
 */
export class WalletRetries {
  private pending: Pending[] = [];
  constructor(private log: (event: string, details: Record<string, unknown>) => void, private maxAttempts = 40) {}
  get size(): number { return this.pending.length; }
  async credit(owner: WalletOwner, amount: number, reason: string, requestId: string = randomUUID(), applied?: (change: WalletChange) => void): Promise<void> {
    const entry: Pending = { owner, amount, reason, requestId, attempts: 0, applied };
    if (!await this.attempt(entry)) this.pending.push(entry);
  }
  async flush(): Promise<void> {
    const batch = this.pending.splice(0);
    for (const entry of batch) if (!await this.attempt(entry)) {
      if (entry.attempts < this.maxAttempts) this.pending.push(entry);
      else this.log('wallet_credit_abandoned', { playerId: entry.owner.userId, reason: entry.reason, amount: entry.amount });
    }
  }
  private async attempt(entry: Pending): Promise<boolean> {
    entry.attempts++;
    try { entry.applied?.(await changeWallet(entry.owner, entry.amount, entry.reason, entry.requestId)); return true; }
    catch (error) {
      // A refusal (4xx: nothing to refund, session over) will not change by retrying.
      const status = (error as { status?: number }).status;
      if (status && status < 500) { this.log('wallet_credit_refused', { playerId: entry.owner.userId, reason: entry.reason, status }); return true; }
      return false;
    }
  }
}
