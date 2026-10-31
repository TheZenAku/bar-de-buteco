import { randomUUID } from 'node:crypto';
import { walletChangeSchema, type WalletChange } from '@bar/shared';
import { InternalApiError } from '../internal.js';
import type { FileOutbox } from '../world/outbox.js';
import type { WalletOwner } from '../world/wallet.js';
import type { TableBank } from './blackjack.js';

export interface StakeEntry { userId: string; roundId: string; amount: number }
export interface SettleEntry { userId: string; roundId: string; payout: number; stakes: string[]; voids: string[] }
export type BankEntry = StakeEntry | SettleEntry;
type Debit = (owner: WalletOwner, amount: number, reason: string, requestId: string) => Promise<WalletChange>;
type Send = <T>(path: string, body?: unknown) => Promise<T>;
export interface BankHooks {
  log(event: string, details: Record<string, unknown>): void;
  /** A bet was taken (amount < 0) or a round paid (amount ≥ 0): the wallet as the API left it. */
  wallet?(userId: string, change: WalletChange): void;
}
/** The games whose coins go through a bank: each has its own journal, ledger reasons and settle route. */
export type BankGame = 'blackjack' | 'foosball';

const key = (roundId: string, userId: string) => `${roundId}:${userId}`;

/**
 * A game's coins, journaled on disk (a FileOutbox) so that neither a crash nor an API outage loses any:
 * - stake: the intent is written first, then the wallet is debited (reason <game>:bet:<round>). A refusal (4xx) drops
 *   the intent; no answer keeps it as void (maybe taken, maybe not) and the round's settlement sorts it out.
 * - settle: in one atomic rewrite the player's stakes of the round become one settlement, delivered (and retried) to
 *   POST /api/internal/<game>/settle. The API pays it once per round and player, only against stakes on its ledger,
 *   never above the game's maximum return on them, and adds back whatever the void stakes really took.
 * - recover (at start): stakes of rounds that never settled (the world stopped mid-round) all become void: every coin
 *   taken comes back.
 * A "round" is a blackjack deal or a pebolim match.
 */
export class GameBank implements TableBank {
  private open = new Map<string, { stakes: string[]; voids: string[] }>();
  private flushing?: Promise<void>;

  constructor(readonly game: BankGame, private outbox: FileOutbox<BankEntry>, private owner: (userId: string) => WalletOwner | undefined,
    private debit: Debit, private send: Send, private hooks: BankHooks) { this.recover(); }

  /** Settlements waiting for the API. */
  get pending(): number { return this.outbox.pending().filter(r => r.kind === `${this.game}-settle`).length; }

  async stake(playerId: string, roundId: string, amount: number): Promise<void> {
    const owner = this.owner(playerId);
    if (!owner) throw new Error('Você não está mais no bar.');
    const requestId = randomUUID(), entry = this.open.get(key(roundId, playerId)) ?? { stakes: [], voids: [] };
    this.open.set(key(roundId, playerId), entry);
    this.outbox.add(`${this.game}-stake`, requestId, { userId: playerId, roundId, amount });
    try {
      const change = await this.debit(owner, -amount, `${this.game}:bet:${roundId}`, requestId);
      entry.stakes.push(requestId);
      this.hooks.wallet?.(playerId, change);
    } catch (error) {
      // Refused (no coins, session over): nothing was taken. Anything else may or may not have reached the wallet.
      if (error instanceof InternalApiError && error.status < 500) { this.outbox.complete([requestId]); throw error; }
      entry.voids.push(requestId);
      this.hooks.log(`${this.game}_stake_unknown`, { playerId, roundId, amount });
      throw new Error('A carteira não respondeu. Se algo foi descontado, volta no fim da rodada.');
    }
  }

  settle(roundId: string, playerId: string, payout: number): void {
    const entry = this.open.get(key(roundId, playerId)) ?? { stakes: [], voids: [] };
    this.open.delete(key(roundId, playerId));
    const ids = [...entry.stakes, ...entry.voids];
    if (!payout && !entry.voids.length) { this.outbox.complete(ids); return; }
    this.outbox.swap(ids, { kind: `${this.game}-settle`, id: `settle:${key(roundId, playerId)}`, payload: { userId: playerId, roundId, payout, stakes: entry.stakes, voids: entry.voids } });
    void this.flush();
  }

  /** Delivers waiting settlements, one run at a time (the room's maintenance retries what the API could not take). */
  flush(): Promise<void> {
    return this.flushing ??= this.deliver().finally(() => { this.flushing = undefined; });
  }

  private async deliver(): Promise<void> {
    for (const record of this.outbox.pending()) {
      if (record.kind !== `${this.game}-settle`) continue;
      const settlement = record.payload as SettleEntry;
      try {
        const answer = walletChangeSchema.safeParse(await this.send<unknown>(`${this.game}/settle`, settlement));
        this.outbox.complete([record.id]);
        if (answer.success) this.hooks.wallet?.(settlement.userId, answer.data);
      } catch (error) {
        if (error instanceof InternalApiError && error.status >= 400 && error.status < 500) {
          this.outbox.fail([record.id], error.message);
          this.hooks.log(`${this.game}_settle_refused`, { playerId: settlement.userId, roundId: settlement.roundId, reason: error.message });
          continue;
        }
        // The API is away: the rest waits for the next maintenance round.
        this.hooks.log(`${this.game}_settle_retry`, { playerId: settlement.userId, roundId: settlement.roundId });
        return;
      }
    }
  }

  private recover(): void {
    const stakes = new Map<string, { userId: string; roundId: string; ids: string[] }>();
    for (const record of this.outbox.pending()) {
      if (record.kind !== `${this.game}-stake`) continue;
      const { userId, roundId } = record.payload as StakeEntry, group = stakes.get(key(roundId, userId)) ?? { userId, roundId, ids: [] };
      group.ids.push(record.id); stakes.set(key(roundId, userId), group);
    }
    for (const { userId, roundId, ids } of stakes.values()) {
      this.outbox.swap(ids, { kind: `${this.game}-settle`, id: `settle:${key(roundId, userId)}`, payload: { userId, roundId, payout: 0, stakes: [], voids: ids } });
      this.hooks.log(`${this.game}_round_recovered`, { playerId: userId, roundId, stakes: ids.length });
    }
  }
}

/** The blackjack table's bank (blackjack:bet:<round>, POST /api/internal/blackjack/settle). */
export class BlackjackBank extends GameBank {
  constructor(outbox: FileOutbox<BankEntry>, owner: (userId: string) => WalletOwner | undefined, debit: Debit, send: Send, hooks: BankHooks) {
    super('blackjack', outbox, owner, debit, send, hooks);
  }
}
