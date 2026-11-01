import { randomUUID } from 'node:crypto';
import { EMPTY_OFFER, TRADE, offerIsEmpty, normalizeOffer, type TradeInvite, type TradeOffer, type TradeSideView, type TradeStage, type TradeVehicleLine, type TradeView } from '@bar/shared';

export interface TradeSide { userId: string; name: string; offer: TradeOffer; vehicles: TradeVehicleLine[]; ready: boolean; confirmed: boolean }
export interface Trade { id: string; version: number; stage: TradeStage; a: TradeSide; b: TradeSide; confirmableAt: number; touchedAt: number }
interface PendingInvite { id: string; from: string; fromName: string; to: string; toName: string; expiresAt: number }
export type TradeEvent = { kind: 'invite-expired'; invite: PendingInvite } | { kind: 'idle'; trade: Trade };

const side = (userId: string, name: string): TradeSide => ({ userId, name, offer: { ...EMPTY_OFFER }, vehicles: [], ready: false, confirmed: false });

/**
 * The conversation of a trade (docs/sistemas/troca.md): who asked whom, what is on the table, who agreed to it. No sockets and no money here; BarRoom tells the
 * players, the API moves things. The rules that stop a swindle live here: any change to an offer takes back everyone's agreement and gets a new version, agreeing
 * names the version seen, and once both are ready the table is frozen for a moment before it can be confirmed.
 */
export class TradeDesk {
  private readonly invites = new Map<string, PendingInvite>();
  private readonly trades = new Map<string, Trade>();
  private readonly byUser = new Map<string, string>();
  /** A refusal keeps the same person from asking again for a moment. */
  private readonly refused = new Map<string, number>();

  of(userId: string): Trade | undefined { const id = this.byUser.get(userId); return id ? this.trades.get(id) : undefined; }
  committing(userId: string): boolean { return this.of(userId)?.stage === 'committing'; }
  active(): IterableIterator<Trade> { return this.trades.values(); }
  private busy(userId: string): boolean { return this.byUser.has(userId) || [...this.invites.values()].some(invite => invite.from === userId || invite.to === userId); }

  invite(from: string, fromName: string, to: string, toName: string, now: number): TradeInvite {
    if (from === to) throw new Error('Escolha outra pessoa.');
    if (this.busy(from)) throw new Error('Termine a negociação atual primeiro.');
    if (this.busy(to)) throw new Error(`${toName} está em outra negociação.`);
    if ((this.refused.get(`${from}>${to}`) ?? 0) > now) throw new Error(`${toName} acabou de recusar. Espere um pouco.`);
    const invite: PendingInvite = { id: randomUUID(), from, fromName, to, toName, expiresAt: now + TRADE.INVITE_MS };
    this.invites.set(invite.id, invite);
    return { id: invite.id, from, fromName, expiresAt: invite.expiresAt };
  }
  /** The person asked answers; a yes opens the trade. */
  respond(userId: string, inviteId: string, accept: boolean, now: number): { invite: PendingInvite; trade?: Trade } {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.to !== userId) throw new Error('Esse convite não está mais de pé.');
    this.invites.delete(inviteId);
    if (!accept) { this.refused.set(`${invite.from}>${invite.to}`, now + TRADE.REFUSED_MS); return { invite }; }
    if (this.byUser.has(invite.from) || this.byUser.has(invite.to)) throw new Error('Um dos dois já está em outra negociação.');
    const trade: Trade = { id: randomUUID(), version: 1, stage: 'offer', a: side(invite.from, invite.fromName), b: side(invite.to, invite.toName), confirmableAt: 0, touchedAt: now };
    this.trades.set(trade.id, trade);
    this.byUser.set(invite.from, trade.id); this.byUser.set(invite.to, trade.id);
    return { invite, trade };
  }
  dropInvites(userId: string): PendingInvite[] {
    const gone = [...this.invites.values()].filter(invite => invite.from === userId || invite.to === userId);
    for (const invite of gone) this.invites.delete(invite.id);
    return gone;
  }

  private mine(userId: string, tradeId: string): { trade: Trade; me: TradeSide; them: TradeSide } {
    const trade = this.trades.get(tradeId);
    if (!trade || this.byUser.get(userId) !== tradeId) throw new Error('Essa negociação já terminou.');
    return trade.a.userId === userId ? { trade, me: trade.a, them: trade.b } : { trade, me: trade.b, them: trade.a };
  }
  /** A whole new offer. Nothing on the table changes without everyone having to agree again. */
  setOffer(userId: string, tradeId: string, offer: TradeOffer, vehicles: TradeVehicleLine[], now: number): Trade {
    const { trade, me } = this.mine(userId, tradeId);
    if (trade.stage !== 'offer') throw new Error('Volte para mudar a oferta.');
    me.offer = normalizeOffer(offer); me.vehicles = vehicles;
    this.reopen(trade, now);
    return trade;
  }
  private reopen(trade: Trade, now: number): void {
    trade.stage = 'offer'; trade.version++; trade.confirmableAt = 0; trade.touchedAt = now;
    for (const each of [trade.a, trade.b]) { each.ready = false; each.confirmed = false; }
  }
  /** Agreeing to this version of the table; with both ready it freezes for review. Taking it back reopens the table. */
  setReady(userId: string, tradeId: string, version: number, ready: boolean, now: number): Trade {
    const { trade, me, them } = this.mine(userId, tradeId);
    if (trade.stage === 'committing') throw new Error('A troca já está sendo feita.');
    if (!ready) { this.reopen(trade, now); return trade; }
    if (version !== trade.version) throw new Error('A oferta mudou. Confira de novo antes de aceitar.');
    if (trade.stage !== 'offer') return trade;
    if (offerIsEmpty(me.offer) && offerIsEmpty(them.offer)) throw new Error('Coloque alguma coisa na troca primeiro.');
    me.ready = true; trade.touchedAt = now;
    if (them.ready) { trade.stage = 'review'; trade.confirmableAt = now + TRADE.REVIEW_MS; }
    return trade;
  }
  /** The last yes, of this very version. With both, the trade is on its way and nothing about it can change any more. */
  confirm(userId: string, tradeId: string, version: number, now: number): { trade: Trade; go: boolean } {
    const { trade, me, them } = this.mine(userId, tradeId);
    if (trade.stage === 'committing') throw new Error('A troca já está sendo feita.');
    if (trade.stage !== 'review' || version !== trade.version) throw new Error('A oferta mudou. Confira de novo antes de confirmar.');
    if (now < trade.confirmableAt) throw new Error('Confira a troca antes de confirmar.');
    me.confirmed = true; trade.touchedAt = now;
    if (!them.confirmed) return { trade, go: false };
    trade.stage = 'committing';
    return { trade, go: true };
  }
  /** A trade under way at the API cannot be taken back: only what happens there ends it. */
  cancel(userId: string, tradeId: string): Trade {
    const { trade } = this.mine(userId, tradeId);
    if (trade.stage === 'committing') throw new Error('A troca já está sendo feita.');
    this.close(trade);
    return trade;
  }
  close(trade: Trade): void {
    this.trades.delete(trade.id);
    for (const each of [trade.a, trade.b]) if (this.byUser.get(each.userId) === trade.id) this.byUser.delete(each.userId);
  }
  /** The clock: invitations nobody answered and trades nobody touches. */
  update(now: number): TradeEvent[] {
    const events: TradeEvent[] = [];
    for (const invite of [...this.invites.values()]) if (now >= invite.expiresAt) { this.invites.delete(invite.id); events.push({ kind: 'invite-expired', invite }); }
    for (const trade of [...this.trades.values()]) if (trade.stage !== 'committing' && now - trade.touchedAt >= TRADE.IDLE_MS) { this.close(trade); events.push({ kind: 'idle', trade }); }
    for (const [key, until] of this.refused) if (until <= now) this.refused.delete(key);
    return events;
  }
  viewFor(trade: Trade, userId: string): TradeView {
    const view = ({ userId: id, name, offer, vehicles, ready, confirmed }: TradeSide): TradeSideView => ({ id, name, offer, vehicles, ready, confirmed });
    const mine = trade.a.userId === userId;
    return { id: trade.id, version: trade.version, stage: trade.stage, me: view(mine ? trade.a : trade.b), them: view(mine ? trade.b : trade.a), confirmableAt: trade.confirmableAt, expiresAt: trade.touchedAt + TRADE.IDLE_MS };
  }
}
