import {
  FOOT_SPOT, FOUL_NAMES, GROUP_NAMES, HEAD_SPOT, POOL, POOL_BET, POOL_CPU_NAME, PoolPlanner, poolStakes, encodeBalls, encodeTracks, freeAt, groupLeft, groupOf, inQuadro, judgeShot, newRack,
  otherSeat, poolThinkMs, rackBalls, shotFacts, simulateShot, spotBall,
  type PoolAimView, type PoolBallSpot, type PoolChoiceKind, type PoolFeedItem, type PoolFoul, type PoolLevel, type PoolPhase, type PoolRack, type PoolSeat,
  type PoolSeatView, type PoolShotOutcome, type PoolShotView, type PoolStakes, type PoolStroke, type PoolTableView,
} from '@bar/shared';

/**
 * Where a match's coins go (minigames/blackjack-bank.ts, GameBank('pool')): stake() takes a player's part from their
 * wallet (throws, with the reason to show, when it cannot); settle() gives back what the match returned to them (twice the
 * stake to the winner, the stake itself when the match is called off, nothing after a loss).
 */
export interface PoolBank {
  stake(playerId: string, matchId: string, amount: number): Promise<void>;
  settle(matchId: string, playerId: string, payout: number): void;
}
const FREE_BANK: PoolBank = { stake: async () => {}, settle: () => {} };

/** What the log keeps of a finished rack. */
export interface PoolSummary {
  matchId: string; tableId: string; rack: number; reason: string; forfeit: boolean;
  players: Array<{ playerId: string; seat: PoolSeat; result: 'win' | 'loss'; paid: number }>;
  /** Coins per person on the match (0: none). */
  stake: number;
  /** The winner's name, the loser's, and whether the house's player was one of them. */
  winner: string; loser: string; cpu: boolean;
}
export interface PoolOptions {
  bank?: PoolBank;
  /** The stakes from the price table (pool:*). */
  stakes?: () => PoolStakes;
  clock?: () => number;
  random?: () => number;
  /** A stroke to play back: the room sends it to whoever is at or near the table. */
  onShot?: (shot: PoolShotView) => void;
  /** A message for one player that no request is waiting for (they were replaced, their turn ran out). */
  onNotice?: (playerId: string, message: string) => void;
  onMatch?: (summary: PoolSummary) => void;
  timing?: Partial<Record<'aimMs' | 'choiceMs' | 'settleMs' | 'finishedMs' | 'pauseMs', number>>;
  /** How long the house's player may think per tick (ms of CPU). */
  thinkBudgetMs?: number;
}

interface Seat {
  seat: PoolSeat; playerId: string; displayName: string; cpu: PoolLevel | ''; ready: boolean; connected: boolean; racks: number;
  /** Coins this player has in the match, and what the last match left them (+ won, − lost). */
  staked: number; prize: number;
}
interface Rolling { endsAt: number; outcome: PoolShotOutcome; before: number[]; shooter: PoolSeat; moving: boolean }
const PLAYING: readonly PoolPhase[] = ['aim', 'rolling', 'choice', 'paused'];
const FEED_LENGTH = 8;

/**
 * One pool table, authoritative: who plays, the rack, the rules (judgeShot from @bar/shared, Noel Snooker's bola 8) and
 * every stroke, run through the physics here at once; the browsers only aim and draw the recorded paths. Phases: lobby
 * (two seats, the house's player, "pronto") → choice (the coin toss: break or pass it) → aim (the shooter's turn; the cue
 * ball placed in the quadro for the break) → rolling (the stroke plays out) → aim, or choice (the 8 on the break), ... →
 * finished → lobby again for a rematch, the break alternating. A shooter whose connection dropped pauses the table.
 */
export class PoolTable {
  readonly id: string;
  phase: PoolPhase = 'lobby';
  level: PoolLevel = 'medio';
  hostId = '';
  seats: Seat[] = [0, 1].map(seat => ({ seat: seat as PoolSeat, playerId: '', displayName: '', cpu: '' as const, ready: false, connected: true, racks: 0, staked: 0, prize: 0 }));
  /** The stake between two people, as the host set it. */
  chosenStake: number = POOL_BET.minBet;
  /** Taking the stakes: the lobby is locked until every part is in, or the match is called off. */
  taking = false;
  /** What this match is worth per person (0 while none is on). */
  matchStake = 0;
  rack: PoolRack = newRack(0);
  balls: PoolBallSpot[];
  breaker: PoolSeat = 0;
  rackNo = 0;
  placing = false;
  choice: { seat: PoolSeat; kind: PoolChoiceKind; foul: boolean } | null = null;
  deadline = 0;
  shot = 0;
  pocketed: number[] = [];
  lastFouls: PoolFoul[] = [];
  feed: PoolFeedItem[] = [];
  message = '';
  matchId = '';
  revision = 0;
  /** The stroke playing out (or the last one), for whoever starts watching midway. */
  lastShot?: PoolShotView;
  private rolling?: Rolling;
  private planner?: PoolPlanner;
  private thinkUntil = 0;
  private feedId = 0;
  /** Who sat where for the last rack (a rematch between the same two alternates the break). */
  private lastPair = '';
  private paused?: { from: PoolPhase; left: number };
  private readonly bank: PoolBank;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly timing: Required<NonNullable<PoolOptions['timing']>>;

  constructor(id: string, private readonly options: PoolOptions = {}) {
    this.id = id;
    this.bank = options.bank ?? FREE_BANK;
    this.clock = options.clock ?? Date.now;
    this.random = options.random ?? Math.random;
    const { aimMs, choiceMs, settleMs, finishedMs, pauseMs } = POOL;
    this.timing = { aimMs, choiceMs, settleMs, finishedMs, pauseMs, ...options.timing };
    this.balls = rackBalls(this.random);
  }

  get inMatch(): boolean { return PLAYING.includes(this.phase); }
  seatOf(playerId: string): Seat | undefined { return playerId ? this.seats.find(s => s.playerId === playerId) : undefined; }
  get humans(): Seat[] { return this.seats.filter(s => s.playerId); }
  private get values(): PoolStakes { return this.options.stakes?.() ?? poolStakes({}); }
  /** Two people at the table play each other: the table's stake. Someone against Juca plays the house: the level's. */
  get betweenPeople(): boolean { return this.humans.length === 2; }
  get stake(): number { const { levels, min, max } = this.values; return this.betweenPeople ? Math.min(max, Math.max(min, this.chosenStake)) : levels[this.level]; }
  /** The object balls on the table. */
  get objectBalls(): number[] { return this.balls.map(b => b.n).filter(n => n !== 0); }

  // ── Lobby ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Takes a free seat (`preferred` when free), or the house player's. Throws when there is none or a rack is on. */
  join(playerId: string, displayName: string, preferred?: number): Seat {
    const existing = this.seatOf(playerId);
    if (existing) return existing;
    if (this.phase !== 'lobby') throw new Error('Tem partida rolando nessa mesa. Dá para assistir e jogar a próxima.');
    let free = this.seats.filter(s => !s.playerId && !s.cpu);
    if (!free.length) free = this.seats.filter(s => s.cpu);
    if (!free.length) throw new Error('A mesa está completa.');
    const seat = free.find(s => s.seat === preferred) ?? free[0]!;
    if (this.taking) throw new Error('As apostas já estão sendo recolhidas.');
    Object.assign(seat, { playerId, displayName, cpu: '', ready: false, connected: true, racks: 0, staked: 0, prize: 0 });
    if (!this.hostId) this.hostId = playerId;
    this.unready(); this.revision++;
    return seat;
  }
  /** Changes seat before the match. */
  move(playerId: string, to: number): Seat {
    const from = this.lobbySeat(playerId), target = this.seats[to];
    if (!target) throw new Error('Esse lugar não existe.');
    if (target === from) return from;
    if (target.playerId || target.cpu) throw new Error('Esse lugar está ocupado.');
    Object.assign(target, { playerId: from.playerId, displayName: from.displayName, cpu: '', ready: false, connected: from.connected, racks: from.racks, staked: 0, prize: from.prize });
    this.clear(from); this.unready(); this.revision++;
    return target;
  }
  /** The host picks how well the house's player plays (and so the stake against him), or the stake between two people.
   *  Any change asks everyone's yes again. */
  configure(playerId: string, patch: { level?: PoolLevel; stake?: number }): void {
    this.lobbySeat(playerId);
    if (playerId !== this.hostId) throw new Error('Só quem abriu a mesa muda o nível e a aposta.');
    if (patch.stake !== undefined) {
      const { min, max } = this.values;
      if (patch.stake < min || patch.stake > max) throw new Error(`Entre jogadores, cada um põe de ${min} a ${max} moedas.`);
      this.chosenStake = patch.stake;
    }
    if (patch.level) { this.level = patch.level; for (const s of this.seats) if (s.cpu) s.cpu = patch.level; }
    this.unready(); this.revision++;
  }
  /** The host calls Juca da Sinuca to the empty seat, or sends him off. */
  cpu(playerId: string, on: boolean): void {
    this.lobbySeat(playerId);
    if (playerId !== this.hostId) throw new Error('Só quem abriu a mesa chama o Juca.');
    if (on) {
      const empty = this.seats.find(s => !s.playerId && !s.cpu);
      if (!empty) throw new Error('A mesa já tem dois jogadores.');
      Object.assign(empty, { cpu: this.level, displayName: POOL_CPU_NAME, ready: true, connected: true, racks: 0, staked: 0, prize: 0 });
    } else for (const s of this.seats) if (s.cpu) this.clear(s);
    this.unready(); this.revision++;
  }
  /** A yes to the stake: with both seats taken and everyone's yes, the stakes are taken and the match starts. */
  async ready(playerId: string, ready: boolean, now = this.clock()): Promise<void> {
    const seat = this.lobbySeat(playerId);
    seat.ready = ready; this.revision++;
    // As at the truco table, an empty seat is the house's: Juca of the chosen level takes it once everyone said yes.
    if (this.humans.every(s => s.ready)) for (const s of this.seats) if (!s.playerId && !s.cpu) Object.assign(s, { cpu: this.level, displayName: POOL_CPU_NAME, ready: true, connected: true, racks: 0, staked: 0, prize: 0 });
    if (this.seats.every(s => (s.playerId && s.ready) || s.cpu) && this.humans.length) await this.start(now);
  }

  /**
   * Gets up. In the lobby the seat frees. In a match it is a withdrawal (Noel Snooker: the match ends when a player gives
   * up): the other one wins the rack.
   */
  leave(playerId: string, now = this.clock()): void {
    const seat = this.seatOf(playerId);
    if (!seat) return;
    if (this.inMatch) {
      const other = this.seats[otherSeat(seat.seat)]!;
      this.finish(other.seat, `${seat.displayName} desistiu da partida`, now, true);
    }
    this.clear(seat);
    if (!this.humans.length) { this.reset(); return; }
    if (!this.seatOf(this.hostId)) this.hostId = this.humans[0]!.playerId;
    if (this.phase === 'lobby') this.unready();
    this.revision++;
  }
  /** A connection dropped or came back: the shooter's turn waits for them (paused) up to POOL.pauseMs. */
  connection(playerId: string, connected: boolean, now = this.clock()): void {
    const seat = this.seatOf(playerId);
    if (!seat || seat.connected === connected) return;
    seat.connected = connected; this.revision++;
    if (connected) { this.resumeIfBack(now); return; }
    this.pauseIfAway(now);
  }

  // ── Play ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Where the shooter aims (for the others to see); undefined when it is not their turn. */
  aim(playerId: string, aim: Omit<PoolAimView, 'tableId'>): PoolAimView | undefined {
    const seat = this.seatOf(playerId);
    if (!seat || this.phase !== 'aim' || this.rack.turn !== seat.seat) return;
    const cue = this.placing && aim.cue && inQuadro(aim.cue.x, aim.cue.y) ? aim.cue : undefined;
    return { tableId: this.id, angle: aim.angle, power: aim.power, spinX: aim.spinX, spinY: aim.spinY, elevation: aim.elevation, ...(cue ? { cue } : {}) };
  }

  /**
   * A stroke from the shooter, for the table's stroke `shot` (a stale or repeated one is refused). Played through the
   * physics at once; the room sends its paths and the verdict comes when the balls stop. Sent while the balls of the last
   * stroke still roll, it is the foul of playing with a ball in motion.
   */
  shoot(playerId: string, stroke: PoolStroke & { shot: number; cue?: { x: number; y: number } }, now = this.clock()): void {
    const seat = this.seatOf(playerId);
    if (!seat) throw new Error('Pegue um lugar na mesa primeiro.');
    if (this.phase === 'rolling' && this.rolling) {
      // A repeated click carries the stroke counter of the stroke already rolling: ignored. A new stroke is the foul.
      if (this.rolling.shooter === seat.seat && stroke.shot === this.shot) this.rolling.moving = true;
      return;
    }
    if (this.phase !== 'aim') throw new Error('Agora não é hora de tacar.');
    if (this.rack.turn !== seat.seat) throw new Error('Não é a sua vez.');
    if (stroke.shot !== this.shot) throw new Error('Essa tacada já passou.');
    this.strike(seat.seat, stroke, stroke.cue, now);
  }

  /** The coin toss's winner (break or pass) or the 8 on the break (the 8 back on its mark, or a new break). */
  choose(playerId: string, choice: 'break' | 'pass' | 'spot' | 'rerack', now = this.clock()): void {
    const seat = this.seatOf(playerId);
    if (!seat || this.phase !== 'choice' || !this.choice || this.choice.seat !== seat.seat) throw new Error('Essa escolha não é sua.');
    this.decide(choice, now);
  }

  /** The table's clock: strokes ending, turns running out, the house's player thinking, the result coming down. */
  tick(now = this.clock()): void {
    if (this.phase === 'lobby') return;
    if (this.phase === 'finished') { if (now >= this.deadline) this.toLobby(); return; }
    if (this.phase === 'rolling') { if (this.rolling && now >= this.rolling.endsAt) this.settle(now); return; }
    if (this.phase === 'paused') { if (now >= this.deadline) this.awayTooLong(now); return; }
    if (this.phase === 'choice' && this.choice) {
      const chooser = this.seats[this.choice.seat]!;
      if (chooser.cpu && now >= this.thinkUntil) this.decide(this.choice.kind === 'toss' ? 'break' : 'spot', now);
      else if (now >= this.deadline) this.decide(this.choice.kind === 'toss' ? 'break' : 'spot', now);
      return;
    }
    if (this.phase === 'aim') {
      const shooter = this.seats[this.rack.turn]!;
      if (shooter.cpu) { this.think(shooter, now); return; }
      if (now >= this.deadline) {
        this.note('info', `${shooter.displayName} demorou demais: a vez passa.`);
        this.options.onNotice?.(shooter.playerId, 'O seu tempo acabou e a vez passou.');
        this.placing = false; this.rack.breaking = false; this.rack.turn = otherSeat(this.rack.turn); this.toAim(now);
      }
    }
  }

  snapshot(): PoolTableView {
    return {
      id: this.id, phase: this.phase, hostId: this.hostId, level: this.level,
      seats: this.seats.map((s): PoolSeatView => ({ seat: s.seat, playerId: s.playerId, displayName: s.displayName, cpu: s.cpu, ready: s.ready, connected: s.connected, racks: s.racks, staked: s.staked, prize: s.prize })),
      turn: this.rack.turn, breaker: this.breaker, breaking: this.rack.breaking, groups: [...this.rack.groups], benefit: this.rack.benefit,
      balls: encodeBalls(this.balls), pocketed: [...this.pocketed], placing: this.placing, choice: this.choice ? { ...this.choice } : null,
      deadline: this.deadline, shot: this.shot, rack: this.rackNo, lastFouls: [...this.lastFouls], feed: this.feed.map(f => ({ ...f })),
      winner: this.rack.winner, reason: this.rack.reason, message: this.message,
      stake: this.matchStake || this.stake, betweenPeople: this.betweenPeople, levelStakes: { ...this.values.levels }, minBet: this.values.min, maxBet: this.values.max,
      step: POOL_BET.step, taking: this.taking, revision: this.revision,
    };
  }

  // ── The match ───────────────────────────────────────────────────────────────────────────────────────────────────

  /** All the parts, or none: someone who could not pay, or got up meanwhile, calls the match off and every part goes back. */
  private async start(now: number): Promise<void> {
    if (this.taking) return;
    const stake = this.stake, matchId = globalThis.crypto.randomUUID(), players = this.humans.map(seat => ({ seat, playerId: seat.playerId, paid: false }));
    this.taking = true; this.revision++;
    let refused = false;
    await Promise.all(players.map(async player => {
      try { await this.bank.stake(player.playerId, matchId, stake); player.paid = true; }
      catch (error) { refused = true; this.options.onNotice?.(player.playerId, `Sua aposta não entrou: ${error instanceof Error ? error.message : 'a carteira não respondeu.'}`); }
    }));
    this.taking = false;
    const moved = players.some(p => p.seat.playerId !== p.playerId) || this.humans.length !== players.length || this.phase !== 'lobby';
    if (refused || moved) {
      for (const player of players) this.bank.settle(matchId, player.playerId, player.paid ? stake : 0);
      this.unready(); this.message = 'A partida não começou: as apostas voltaram.'; this.revision++;
      return;
    }
    for (const player of players) { player.seat.staked = stake; player.seat.prize = 0; }
    now = Math.max(now, this.clock());
    this.matchId = matchId; this.matchStake = stake; this.feed = []; this.message = '';
    const pair = this.seats.map(s => s.playerId || `cpu:${s.cpu}`).join('|');
    // The same two again: the break alternates (Noel Snooker). Anyone new: the coin decides who chooses.
    if (pair === this.lastPair && this.rackNo > 0) { this.startRack(otherSeat(this.breaker), now); return; }
    this.lastPair = pair;
    const winner: PoolSeat = this.random() < .5 ? 0 : 1;
    this.note('info', `Cara ou coroa: ${this.seats[winner]!.displayName} ganhou e escolhe quem sai.`);
    this.ask({ seat: winner, kind: 'toss', foul: false }, now);
  }
  private startRack(breaker: PoolSeat, now: number): void {
    this.breaker = breaker; this.rackNo++;
    this.rack = newRack(breaker); this.balls = rackBalls(this.random); this.pocketed = []; this.lastFouls = [];
    this.lastShot = undefined; this.rolling = undefined;
    this.note('turn', `Saída de ${this.seats[breaker]!.displayName}. Ponha a branca no quadro.`);
    this.placing = true; this.toAim(now);
  }
  private toAim(now: number): void {
    this.phase = 'aim'; this.choice = null; this.deadline = now + this.timing.aimMs; this.planner = undefined;
    const shooter = this.seats[this.rack.turn]!;
    if (shooter.cpu) this.thinkUntil = now + poolThinkMs(shooter.cpu, this.random);
    if (!shooter.connected) this.pauseIfAway(now);
    this.revision++;
  }
  private ask(choice: { seat: PoolSeat; kind: PoolChoiceKind; foul: boolean }, now: number): void {
    this.phase = 'choice'; this.choice = choice; this.deadline = now + this.timing.choiceMs;
    const chooser = this.seats[choice.seat]!;
    if (chooser.cpu) this.thinkUntil = now + poolThinkMs(chooser.cpu, this.random) * .6;
    this.revision++;
  }
  private decide(choice: 'break' | 'pass' | 'spot' | 'rerack', now: number): void {
    const c = this.choice!, who = this.seats[c.seat]!;
    if (c.kind === 'toss') {
      if (choice !== 'break' && choice !== 'pass') throw new Error('Escolha sair ou passar a saída.');
      const breaker = choice === 'break' ? c.seat : otherSeat(c.seat);
      if (choice === 'pass') this.note('info', `${who.displayName} passou a saída.`);
      this.choice = null; this.startRack(breaker, now);
      return;
    }
    if (choice !== 'spot' && choice !== 'rerack') throw new Error('Escolha recolocar a 8 ou uma nova saída.');
    if (choice === 'rerack') {
      // A new break: by the same breaker after a clean one, by the other player after a foul.
      this.note('info', `${who.displayName} pediu uma nova saída.`);
      this.choice = null; this.startRack(c.foul ? c.seat : this.breaker, now);
      return;
    }
    const spot = spotBall(this.balls, FOOT_SPOT, 1);
    this.balls.push({ n: 8, ...spot }); this.pocketed = this.pocketed.filter(n => n !== 8);
    this.note('info', `A bola 8 voltou para a marca inferior. Joga ${who.displayName}.`);
    this.rack.breaking = false; this.rack.turn = c.seat; this.toAim(now);
  }

  /** Juca thinks in slices (the room never stalls), then plays after a human-like pause. */
  private think(shooter: Seat, now: number): void {
    this.planner ??= new PoolPlanner(this.rack, shooter.seat, this.balls, shooter.cpu as PoolLevel, this.random, this.placing);
    if (!this.planner.step(this.options.thinkBudgetMs ?? 6) || now < this.thinkUntil) return;
    const plan = this.planner.plan();
    try { this.strike(shooter.seat, plan.stroke, plan.cue, now); } catch { this.strike(shooter.seat, plan.stroke, undefined, now); }
  }

  private strike(seat: PoolSeat, stroke: PoolStroke, cue: { x: number; y: number } | undefined, now: number): void {
    if (this.placing) {
      const at = this.balls.find(b => b.n === 0)!;
      if (cue) {
        if (!inQuadro(cue.x, cue.y)) throw new Error('A branca da saída fica no quadro, atrás da linha de cabeceira.');
        if (!freeAt(this.balls, cue.x, cue.y, 0)) throw new Error('A branca não cabe aí: encostaria em outra bola.');
        at.x = cue.x; at.y = cue.y;
      }
    }
    const before = this.objectBalls, outcome = simulateShot(this.balls, stroke, { record: true });
    const play: PoolShotView = { tableId: this.id, shot: this.shot, startAt: now, duration: outcome.duration, stroke: { ...stroke },
      tracks: encodeTracks(outcome.tracks ?? []), sounds: outcome.sounds ?? [] };
    this.rolling = { endsAt: now + outcome.duration + this.timing.settleMs, outcome, before, shooter: seat, moving: false };
    this.phase = 'rolling'; this.deadline = this.rolling.endsAt; this.placing = false; this.planner = undefined;
    this.shot++; this.lastShot = play; this.lastFouls = []; this.revision++;
    this.options.onShot?.(play);
  }

  /** The balls stopped: the verdict (Noel Snooker), applied. */
  private settle(now: number): void {
    const { outcome, before, shooter, moving } = this.rolling!;
    this.rolling = undefined;
    const name = this.seats[shooter]!.displayName, verdict = judgeShot(this.rack, before, shotFacts(outcome, moving));
    this.balls = outcome.balls.map(b => ({ ...b }));
    const potted = outcome.pocketed.map(p => p.n).filter(n => n !== 0);
    this.pocketed.push(...potted);
    if (potted.length) this.note('pot', `${name} encaçapou ${listBalls(potted)}.`);
    this.lastFouls = verdict.fouls;
    for (const foul of verdict.fouls) this.note('foul', `Falta de ${name}: ${FOUL_NAMES[foul]}.`);
    // Balls back on their marks: the cue ball on the upper one, the 8 and any ball off the table on the lower one.
    if (verdict.respotCue) { this.balls = this.balls.filter(b => b.n !== 0); this.balls.push({ n: 0, ...spotBall(this.balls, HEAD_SPOT, -1) }); }
    for (const n of verdict.respot) { this.balls = this.balls.filter(b => b.n !== n); this.balls.push({ n, ...spotBall(this.balls, FOOT_SPOT, 1) }); this.note('info', `A bola ${n} volta para a marca inferior.`); }
    this.rack.groups = verdict.groups;
    if (verdict.assigned) this.note('info', `${name} fica com as ${GROUP_NAMES[verdict.assigned].toLowerCase()}; ${this.seats[otherSeat(shooter)]!.displayName} com as ${GROUP_NAMES[verdict.groups[otherSeat(shooter)] as 'solids' | 'stripes'].toLowerCase()}.`);
    if (verdict.removed >= 0) {
      this.balls = this.balls.filter(b => b.n !== verdict.removed); this.pocketed.push(verdict.removed);
      const them = this.seats[otherSeat(shooter)]!;
      this.note('info', `Benefício para ${them.displayName}: a bola ${verdict.removed} sai da mesa e ${them.displayName} tem uma tacada contínua para limpar o resto.`);
    }
    if (verdict.winner >= 0) { this.finish(verdict.winner as PoolSeat, verdict.reason, now); return; }
    this.rack.benefit = verdict.benefit;
    if (verdict.choice) {
      const chooser = this.seats[verdict.choice.seat]!;
      this.note('info', `A bola 8 caiu na saída: ${chooser.displayName} escolhe entre recolocá-la na marca ou uma nova saída.`);
      this.rack.turn = verdict.choice.seat;
      this.ask({ seat: verdict.choice.seat, kind: 'eight-break', foul: verdict.choice.foul }, now);
      return;
    }
    this.rack.breaking = false;
    this.rack.turn = verdict.again ? shooter : otherSeat(shooter);
    const next = this.seats[this.rack.turn]!, mine = this.rack.groups[this.rack.turn];
    if (verdict.again) this.note('turn', `${next.displayName} continua.`);
    else this.note('turn', `Vez de ${next.displayName}.`);
    if (mine && this.rack.benefit < 0 && !groupLeft(mine, this.objectBalls).length && this.objectBalls.includes(8)) this.note('info', `${next.displayName} está na bola 8.`);
    this.toAim(now);
  }

  private finish(winner: PoolSeat, reason: string, now: number, forfeit = false): void {
    const win = this.seats[winner]!, lose = this.seats[otherSeat(winner)]!;
    this.rack.winner = winner; this.rack.reason = reason;
    win.racks++;
    // The coins: twice the part to the winner, nothing to the loser (Juca's part is the house's).
    const paid = new Map<string, number>();
    for (const s of this.humans) { const pay = s.staked && s.seat === winner ? s.staked * 2 : 0; if (s.staked) this.bank.settle(this.matchId, s.playerId, pay); paid.set(s.playerId, pay); s.prize = pay - s.staked; s.staked = 0; }
    this.phase = 'finished'; this.deadline = now + this.timing.finishedMs; this.choice = null; this.placing = false;
    this.rolling = undefined; this.paused = undefined; this.planner = undefined;
    this.note('win', `${win.displayName} venceu: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`);
    this.revision++;
    this.options.onMatch?.({ matchId: this.matchId, tableId: this.id, rack: this.rackNo, reason, forfeit, winner: win.displayName, loser: lose.displayName, cpu: !!(win.cpu || lose.cpu),
      stake: this.matchStake, players: this.seats.filter(s => s.playerId).map(s => ({ playerId: s.playerId, seat: s.seat, result: s.seat === winner ? 'win' : 'loss', paid: paid.get(s.playerId) ?? 0 })) });
    this.matchStake = 0;
  }
  /** Back to the lobby with the same seats: a rematch is one "pronto" away, the break alternating. */
  private toLobby(): void {
    this.phase = 'lobby'; this.deadline = 0; this.choice = null; this.message = ''; this.unready(); this.revision++;
  }
  /** Nobody is left: the table goes back to how it was, racked. */
  private reset(): void {
    // A part still in play (never expected: every match settles when it ends) goes back.
    for (const s of this.humans) if (s.staked) this.bank.settle(this.matchId, s.playerId, s.staked);
    for (const s of this.seats) this.clear(s);
    Object.assign(this, { phase: 'lobby', hostId: '', deadline: 0, choice: null, placing: false, message: '', matchId: '', rackNo: 0, lastPair: '', lastFouls: [], feed: [],
      rolling: undefined, planner: undefined, paused: undefined, lastShot: undefined, matchStake: 0, chosenStake: POOL_BET.minBet });
    this.rack = newRack(0); this.balls = rackBalls(this.random); this.pocketed = [];
    this.revision++;
  }

  // ── Away ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** The shooter (or the one who must choose) is away: their clock stops while the table waits. */
  private pauseIfAway(now: number): void {
    if (this.phase !== 'aim' && this.phase !== 'choice') return;
    const waiting = this.phase === 'aim' ? this.seats[this.rack.turn]! : this.seats[this.choice!.seat]!;
    if (waiting.connected || waiting.cpu) return;
    this.paused = { from: this.phase, left: Math.max(5000, this.deadline - now) };
    this.phase = 'paused'; this.deadline = now + this.timing.pauseMs;
    this.message = `${waiting.displayName} caiu da conexão. Esperando a volta.`;
    this.revision++;
  }
  private resumeIfBack(now: number): void {
    if (this.phase !== 'paused' || !this.paused) return;
    if (this.seats.some(s => s.playerId && !s.connected)) return;
    this.phase = this.paused.from; this.deadline = now + this.paused.left; this.paused = undefined; this.message = '';
    this.revision++;
  }
  /** Nobody came back in time: a withdrawal. */
  private awayTooLong(now: number): void {
    const away = this.seats.find(s => s.playerId && !s.connected);
    if (!away) { this.resumeIfBack(now); return; }
    this.options.onNotice?.(away.playerId, 'Você demorou a voltar e perdeu a partida de sinuca.');
    this.finish(otherSeat(away.seat), `${away.displayName} não voltou à mesa`, now, true);
  }

  // ── Seats ───────────────────────────────────────────────────────────────────────────────────────────────────────

  private note(kind: PoolFeedItem['kind'], text: string): void {
    this.feed.push({ id: ++this.feedId, kind, text });
    if (this.feed.length > FEED_LENGTH) this.feed.splice(0, this.feed.length - FEED_LENGTH);
  }
  private clear(seat: Seat): void { Object.assign(seat, { playerId: '', displayName: '', cpu: '', ready: false, connected: true, racks: 0, staked: 0, prize: 0 }); }
  private unready(): void { for (const s of this.seats) s.ready = !!s.cpu; }
  private lobbySeat(playerId: string): Seat {
    const seat = this.seatOf(playerId);
    if (!seat) throw new Error('Pegue um lugar na mesa primeiro.');
    if (this.phase !== 'lobby') throw new Error('A partida já está rolando.');
    if (this.taking) throw new Error('As apostas já estão sendo recolhidas.');
    return seat;
  }
}

/** "a 3", "a 3 e a 11", "a 3, a 9 e a 11". */
export function listBalls(balls: readonly number[]): string {
  const names = balls.map(n => `a ${n}${groupOf(n) ? '' : n === 8 ? ' (preta)' : ''}`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0] ?? '';
}
