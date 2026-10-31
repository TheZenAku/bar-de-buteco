import { randomUUID } from 'node:crypto';
import {
  CPU_NAME, FOOSBALL, FOOSBALL_RODS, ROD_NAMES, kicksBack, TEAM_NAMES, createSim, encodeFrame, otherTeam, placeBall, rodIndex, rodsOf, slotDefs, startKick, stepSim, stripOf, aimOffset,
  type FoosballEvent, type FoosballFormat, type FoosballFrame, type FoosballLevel, type FoosballPhase, type FoosballRole, type FoosballSim, type FoosballSlotView,
  type FoosballTableView, type FoosballTeam,
} from '@bar/shared';
import { FoosballCpu } from './foosball-cpu.js';

/**
 * Where a match's coins go: stake() takes a player's part from their wallet (throws, with the reason to show, when it
 * cannot) and settle() gives back what the match returned to them (twice the stake to a winner, the stake itself when the
 * match is called off, nothing after a loss). The room's GameBank('foosball') journals both on disk.
 */
export interface FoosballBank {
  stake(playerId: string, matchId: string, amount: number): Promise<void>;
  settle(matchId: string, playerId: string, payout: number): void;
}
/** What the log keeps of a finished match, per player. */
export interface FoosballSummary {
  matchId: string; tableId: string; score: string; forfeit: boolean; stake: number;
  players: Array<{ playerId: string; team: FoosballTeam; result: 'win' | 'loss' | 'void'; paid: number }>;
}
export interface FoosballOptions {
  bank?: FoosballBank;
  limits?: () => { min: number; max: number };
  clock?: () => number;
  random?: () => number;
  /** A message for one player that no request is waiting for (their stake could not be taken, they were replaced). */
  onNotice?: (playerId: string, message: string) => void;
  onMatch?: (summary: FoosballSummary) => void;
  timing?: Partial<Record<'kickoffMs' | 'restartMs' | 'goalMs' | 'setMs' | 'finishedMs' | 'pauseMs', number>>;
}

interface Slot {
  slot: number; team: FoosballTeam; role: FoosballRole;
  playerId: string; displayName: string; cpu: FoosballLevel | ''; ready: boolean; connected: boolean;
  /** Where the player's pointer is across the table, and whether they hold their figures up. */
  pointer: number; lift: boolean;
  /** Coins this player has in the match (taken when it started). */
  staked: number;
  brain?: FoosballCpu;
}
const FREE_BANK: FoosballBank = { stake: async () => {}, settle: () => {} };
const PLAYING: readonly FoosballPhase[] = ['kickoff', 'playing', 'goal', 'paused', 'set'];

/**
 * One pebolim table, authoritative: who plays where, the score, the phases and the physics (FoosballSim from
 * @bar/shared, 60 ticks a second). Players send where their pointer is, whether they hold their figures up and their kicks;
 * nothing else they say moves the ball. Phases: lobby (places, settings, "pronto") → kickoff (the "ready?" before a serve
 * or a restart) → playing → goal → (set) → ... → finished → lobby again for a rematch. A dropped connection pauses the
 * match (paused) until the player is back or the wait runs out.
 */
export class FoosballTable {
  readonly id: string;
  phase: FoosballPhase = 'lobby';
  format: FoosballFormat = '1x1';
  goals: number = FOOSBALL.defaultGoals;
  sets = 1;
  stake = 0;
  level: FoosballLevel = 'medio';
  hostId = '';
  slots: Slot[] = [];
  score: Record<FoosballTeam, number> = { red: 0, blue: 0 };
  setsWon: Record<FoosballTeam, number> = { red: 0, blue: 0 };
  set = 1;
  serve: FoosballTeam = 'red';
  deadline = 0;
  matchId = '';
  message = '';
  winner: FoosballTeam | '' = '';
  lastGoal: { team: FoosballTeam | ''; by: string; rod: string; speed: number } = { team: '', by: '', rod: '', speed: 0 };
  possession: { team: FoosballTeam | ''; rod: string; since: number; key: string } = { team: '', rod: '', since: 0, key: '' };
  revision = 0;
  readonly sim: FoosballSim = createSim();
  /** Taking the stakes: the lobby is locked until every one is in (or the match is called off). */
  private starting = false;
  private pending: FoosballEvent[] = [];
  /** Who touched the ball last (rod index): the scorer, or an own goal. */
  private lastTouch = -1;
  /** After the "ready?": a serve rolls the ball to the next figure (the ITSF's two touches before it leaves the 5-rod). */
  private serving = false;
  /** Where a pause was, to go back to; and whose connection it waits for. */
  private paused?: { from: FoosballPhase; waiting: Set<string> };
  private readonly bank: FoosballBank;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly timing: Required<NonNullable<FoosballOptions['timing']>>;

  constructor(id: string, private readonly options: FoosballOptions = {}) {
    this.id = id;
    this.bank = options.bank ?? FREE_BANK;
    this.clock = options.clock ?? Date.now;
    this.random = options.random ?? Math.random;
    const { kickoffMs, restartMs, goalMs, setMs, finishedMs, pauseMs } = FOOSBALL;
    this.timing = { kickoffMs, restartMs, goalMs, setMs, finishedMs, pauseMs, ...options.timing };
    this.layout('1x1');
  }

  get limits(): { min: number; max: number } { return this.options.limits?.() ?? { min: FOOSBALL.minBet, max: FOOSBALL.maxBet }; }
  get inMatch(): boolean { return PLAYING.includes(this.phase); }
  seat(playerId: string): Slot | undefined { return playerId ? this.slots.find(s => s.playerId === playerId) : undefined; }
  get humans(): Slot[] { return this.slots.filter(s => s.playerId); }

  // ── Lobby ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Takes a free place (`preferred` when free, else on the team with fewer players). Throws when there is none. */
  join(playerId: string, displayName: string, preferred?: number): Slot {
    const existing = this.seat(playerId);
    if (existing) return existing;
    if (this.phase !== 'lobby' || this.starting) throw new Error('A partida já começou. Dá para assistir e entrar na próxima.');
    // A free place first; else a player takes Zé's.
    let free = this.slots.filter(s => !s.playerId && !s.cpu);
    if (!free.length) free = this.slots.filter(s => s.cpu);
    if (!free.length) throw new Error('A mesa está completa.');
    const count = (team: FoosballTeam) => this.slots.filter(s => s.team === team && (s.playerId || s.cpu)).length;
    const slot = free.find(s => s.slot === preferred) ?? [...free].sort((a, b) => count(a.team) - count(b.team) || a.slot - b.slot)[0]!;
    Object.assign(slot, { playerId, displayName, cpu: '', ready: false, connected: true, pointer: 0, lift: false, staked: 0, brain: undefined });
    if (!this.hostId) this.hostId = playerId;
    this.unready(); this.revision++;
    return slot;
  }

  /** Moves to another free place before the match. */
  move(playerId: string, to: number): Slot {
    const from = this.lobbySlot(playerId), target = this.slots.find(s => s.slot === to);
    if (!target) throw new Error('Esse lugar não existe nesta partida.');
    if (target === from) return from;
    if (target.playerId || target.cpu) throw new Error('Esse lugar está ocupado.');
    Object.assign(target, { playerId: from.playerId, displayName: from.displayName, cpu: '', ready: false, connected: from.connected, pointer: 0, lift: false });
    this.clear(from); this.unready(); this.revision++;
    return target;
  }

  /** The host's settings, before the match. Changing them asks everyone for their "pronto" again. */
  configure(playerId: string, patch: { format?: FoosballFormat; goals?: number; sets?: number; stake?: number; level?: FoosballLevel }): void {
    this.lobbySlot(playerId);
    if (playerId !== this.hostId) throw new Error('Só quem abriu a mesa muda as regras.');
    if (patch.stake !== undefined && patch.stake > 0) {
      const { min, max } = this.limits;
      if (patch.stake < min || patch.stake > max) throw new Error(`Cada um põe de ${min} a ${max} moedas.`);
      if (this.slots.some(s => s.cpu)) throw new Error('Valendo moedas, só entre jogadores: tire o Zé da mesa primeiro.');
    }
    if (patch.format && patch.format !== this.format) this.reformat(patch.format);
    if (patch.goals !== undefined) this.goals = patch.goals;
    if (patch.sets !== undefined) this.sets = patch.sets;
    if (patch.stake !== undefined) this.stake = patch.stake;
    if (patch.level) { this.level = patch.level; for (const s of this.slots) if (s.cpu) { s.cpu = patch.level; s.brain = new FoosballCpu(patch.level, this.random); } }
    this.unready(); this.revision++;
  }

  /** The host puts Zé do Totó in an empty place, or takes him out. */
  cpu(playerId: string, slotIndex: number, on: boolean): void {
    this.lobbySlot(playerId);
    if (playerId !== this.hostId) throw new Error('Só quem abriu a mesa chama o Zé.');
    const slot = this.slots.find(s => s.slot === slotIndex);
    if (!slot) throw new Error('Esse lugar não existe nesta partida.');
    if (on) {
      if (slot.playerId || slot.cpu) throw new Error('Esse lugar está ocupado.');
      if (this.stake) throw new Error('O Zé não joga valendo moedas. Zere o valor da partida para chamá-lo.');
      Object.assign(slot, { cpu: this.level, displayName: CPU_NAME, ready: true, connected: true, brain: new FoosballCpu(this.level, this.random) });
    } else if (slot.cpu) this.clear(slot);
    this.unready(); this.revision++;
  }

  /** "Pronto": when every place is taken and every player is ready, the match starts. */
  async ready(playerId: string, ready: boolean, now = this.clock()): Promise<void> {
    const slot = this.lobbySlot(playerId);
    slot.ready = ready; this.revision++;
    if (this.slots.every(s => (s.playerId && s.ready) || s.cpu) && this.humans.length) await this.start(now);
  }

  /**
   * Gets up from the table. In the lobby the place frees. In a match: with coins on it, leaving loses it (W.O.); a
   * friendly goes on with Zé do Totó in the place, and ends when no player is left.
   */
  leave(playerId: string, now = this.clock()): void {
    const slot = this.seat(playerId);
    if (!slot) return;
    if (this.inMatch) {
      if (this.stake) { this.finish(otherTeam(slot.team), now, true, `${slot.displayName} saiu da mesa: W.O.`); this.clear(slot); this.afterLeave(); return; }
      this.clear(slot);
      if (!this.humans.length) { this.reset(); return; }
      Object.assign(slot, { cpu: this.level, displayName: CPU_NAME, ready: true, connected: true, brain: new FoosballCpu(this.level, this.random) });
      this.message = `O Zé do Totó assumiu o lugar de quem saiu.`;
      if (this.phase === 'paused') this.resumeIfBack(now);
      this.revision++;
      return;
    }
    this.clear(slot); this.afterLeave();
  }

  /** A player's connection dropped or came back: a match waits for them (paused) up to FOOSBALL.pauseMs. */
  connection(playerId: string, connected: boolean, now = this.clock()): void {
    const slot = this.seat(playerId);
    if (!slot || slot.connected === connected) return;
    slot.connected = connected; this.revision++;
    if (!this.inMatch) return;
    if (!connected) {
      if (this.phase !== 'paused') this.paused = { from: this.phase === 'goal' || this.phase === 'set' ? this.phase : 'kickoff', waiting: new Set() };
      this.paused!.waiting.add(playerId);
      this.phase = 'paused'; this.deadline = now + this.timing.pauseMs; this.sim.frozen = true;
      this.message = `${slot.displayName} caiu da conexão. Esperando a volta.`;
    } else this.resumeIfBack(now);
  }

  // ── Play ────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Where the player's pointer is across the table and whether they hold their figures up. */
  input(playerId: string, y: number, lift: boolean): void {
    const slot = this.seat(playerId);
    if (!slot) throw new Error('Pegue um lugar na mesa primeiro.');
    slot.pointer = Math.max(-FOOSBALL.width / 2, Math.min(FOOSBALL.width / 2, y)); slot.lift = lift;
  }
  /** Every rod the player holds swings (a quick touch passes, a full charge is a bomb). */
  kick(playerId: string, power: number): void {
    const slot = this.seat(playerId);
    if (!slot) throw new Error('Pegue um lugar na mesa primeiro.');
    if (this.phase !== 'playing' && this.phase !== 'kickoff') return;
    // Each rod swings the way its ball needs: forward, or a back pass for a ball behind a figure.
    for (const def of rodsOf(slot.team, slot.role)) { const rod = this.sim.rods[def.index]!; startKick(rod, power, this.sim.time, kicksBack(def, rod, this.sim.ball)); }
  }

  /** The table's clock: one physics tick (FOOSBALL.tickHz) and the phases that end by themselves. */
  tick(now = this.clock()): void {
    if (this.phase === 'lobby' || this.phase === 'finished') { if (this.phase === 'finished' && now >= this.deadline) this.toLobby(); return; }
    const dt = 1 / FOOSBALL.tickHz;
    this.steer(dt);
    stepSim(this.sim, dt);
    const events = this.sim.events.splice(0);
    this.pending.push(...events);
    if (this.phase === 'playing') this.referee(events, now);
    if (this.deadline && now >= this.deadline) this.timeUp(now);
  }

  /** A frame for the browsers (the room asks 30 times a second) while a match is on; undefined otherwise. */
  frame(serverTime = this.clock()): FoosballFrame | undefined {
    if (!this.inMatch) return;
    const frame = encodeFrame(this.id, this.sim, serverTime, this.pending);
    this.pending = [];
    return frame;
  }

  snapshot(): FoosballTableView {
    const { min, max } = this.limits;
    return {
      id: this.id, phase: this.phase, format: this.format, goals: this.goals, sets: this.sets, stake: this.stake, level: this.level, hostId: this.hostId,
      slots: this.slots.map((s): FoosballSlotView => ({ slot: s.slot, team: s.team, role: s.role, playerId: s.playerId, displayName: s.displayName, cpu: s.cpu, ready: s.ready, connected: s.connected })),
      red: this.score.red, blue: this.score.blue, setsRed: this.setsWon.red, setsBlue: this.setsWon.blue, set: this.set, serve: this.serve,
      deadline: this.deadline, matchId: this.matchId, message: this.message,
      goalTeam: this.lastGoal.team, goalBy: this.lastGoal.by, goalRod: this.lastGoal.rod, goalSpeed: Math.round(this.lastGoal.speed * 10) / 10,
      possTeam: this.possession.team, possRod: this.possession.rod, possSince: this.possession.since,
      winner: this.winner, minBet: min, maxBet: max, revision: this.revision,
    };
  }

  // ── Match ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Everyone is ready: the stakes are taken (all of them, or the match does not start), the coin decides the serve. */
  private async start(now: number): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    const matchId = randomUUID(), stake = this.stake;
    // Who was at the table when the stakes were asked: someone may get up while their wallet answers.
    const players = this.humans.map(slot => ({ slot, playerId: slot.playerId, name: slot.displayName, paid: false }));
    try {
      if (stake) {
        const refused: string[] = [];
        await Promise.all(players.map(async player => {
          try { await this.bank.stake(player.playerId, matchId, stake); player.paid = true; }
          catch (error) { refused.push(player.name); this.options.onNotice?.(player.playerId, `Sua parte não entrou: ${error instanceof Error ? error.message : 'a carteira não respondeu.'}`); }
        }));
        // Someone could not pay, or got up while paying: the match is off and every part goes back (and every attempt
        // is settled, so a stake the wallet never answered comes back too).
        if (refused.length || players.some(p => this.seat(p.playerId) !== p.slot) || this.phase !== 'lobby') {
          for (const player of players) this.bank.settle(matchId, player.playerId, player.paid ? stake : 0);
          this.unready();
          this.message = refused.length ? `A partida não começou: faltou a parte de ${refused.join(', ')}.` : 'A partida não começou: alguém saiu da mesa.';
          this.revision++;
          return;
        }
        for (const player of players) player.slot.staked = stake;
      }
      this.matchId = matchId;
      this.score = { red: 0, blue: 0 }; this.setsWon = { red: 0, blue: 0 }; this.set = 1; this.winner = '';
      this.lastGoal = { team: '', by: '', rod: '', speed: 0 }; this.message = '';
      // ITSF: a coin decides who serves first.
      this.serve = this.random() < .5 ? 'red' : 'blue';
      for (const rod of this.sim.rods) Object.assign(rod, { offset: 0, target: 0, vy: 0, angle: 0, omega: 0, kick: undefined, lift: false, autoLiftUntil: 0 });
      this.kickoff(this.serve, 'midfield', Math.max(now, this.clock()), this.timing.kickoffMs);
    } finally { this.starting = false; this.revision++; }
  }

  /** The ball, still, in front of the middle figure of a team's rod; live after the countdown. */
  private kickoff(team: FoosballTeam, kind: 'midfield' | 'defense', now: number, wait: number, message = ''): void {
    placeBall(this.sim, rodIndex(team, kind));
    this.phase = 'kickoff'; this.deadline = now + wait; this.serving = kind === 'midfield' && !message;
    this.message = message; this.lastTouch = -1;
    this.possession = { team: '', rod: '', since: 0, key: '' };
    this.revision++;
  }

  /** The rods follow their players' pointers and Zé plays his. */
  private steer(dt: number): void {
    for (const slot of this.slots) {
      const rods = rodsOf(slot.team, slot.role);
      if (slot.cpu && slot.brain) { slot.brain.play(this.sim, rods.map(r => r.index), slot.team, dt); continue; }
      for (const def of rods) {
        const rod = this.sim.rods[def.index]!;
        // A player away (or a place nobody holds) leaves the rods where they are.
        if (!slot.playerId || !slot.connected) { rod.lift = false; continue; }
        rod.target = aimOffset(def, slot.pointer, rod.target); rod.lift = slot.lift;
      }
    }
  }

  /** Goals and the ITSF time limits, from what the ball did this tick. */
  private referee(events: readonly FoosballEvent[], now: number): void {
    for (const event of events) {
      if (event.kind === 'man' || event.kind === 'kick') this.lastTouch = event.rod;
      if (event.kind === 'goal') { this.goal(event.team, event.speed, now); return; }
    }
    const ball = this.sim.ball;
    if (this.serving && Math.abs(ball.vx) + Math.abs(ball.vy) > 0) this.serving = false;
    // Possession: the rod whose strip the ball is in (goalie and 2-rod count as one), from when the ball came there.
    const def = FOOSBALL_RODS[stripOf(ball.x)]!, group = def.kind === 'goalie' || def.kind === 'defense' ? 'back' : def.kind, key = `${def.team}:${group}`;
    if (key !== this.possession.key) this.possession = { team: def.team, rod: group === 'back' ? 'defense' : def.kind, since: now, key };
    const limit = group === 'midfield' ? FOOSBALL.possession.midfield : FOOSBALL.possession.other;
    // Every still ball is within some figure's reach on this table (rods 14 cm apart, a foot reaches 9 cm), so it is never
    // dead in the ITSF's sense: a ball nobody plays is that rod's possession, and its clock gives it away.
    if (now - this.possession.since > limit) {
      const offender = def.team, rod = group === 'back' ? 'goleiro e zaga' : ROD_NAMES[def.kind];
      // ITSF: over the time on the 3-rod, the ball goes to the other team's 2-rod; anywhere else, to its 5-rod.
      this.kickoff(otherTeam(offender), def.kind === 'attack' ? 'defense' : 'midfield', now, this.timing.restartMs,
        `Tempo de posse estourado (${rod}, ${limit / 1000} s): bola do ${TEAM_NAMES[otherTeam(offender)]}.`);
    }
  }

  private goal(team: FoosballTeam, speed: number, now: number): void {
    this.score[team]++;
    const rod = this.lastTouch >= 0 ? FOOSBALL_RODS[this.lastTouch]! : undefined;
    const own = !!rod && rod.team !== team, scorer = rod ? this.holder(rod.team, rod.index) : undefined;
    this.lastGoal = { team, by: scorer?.displayName ?? TEAM_NAMES[team], rod: rod ? (own ? 'contra' : rod.kind) : '', speed };
    this.serve = otherTeam(team);
    this.phase = 'goal'; this.deadline = now + this.timing.goalMs; this.message = ''; this.revision++;
  }

  /** A phase ran out of time. */
  private timeUp(now: number): void {
    switch (this.phase) {
      case 'kickoff':
        this.phase = 'playing'; this.deadline = 0; this.sim.frozen = false; this.message = '';
        // The serve: the middle figure passes to the next one (two touches before the ball may leave the 5-rod).
        if (this.serving) this.sim.ball.vy = (this.random() < .5 ? -1 : 1) * .24;
        this.revision++;
        break;
      case 'goal': {
        const team = this.lastGoal.team as FoosballTeam;
        if (this.score[team] < this.goals) { this.kickoff(this.serve, 'midfield', now, this.timing.kickoffMs); break; }
        this.setsWon[team]++;
        if (this.setsWon[team] >= Math.ceil(this.sets / 2)) { this.finish(team, now); break; }
        this.phase = 'set'; this.deadline = now + this.timing.setMs; this.message = `${TEAM_NAMES[team]} levou o set ${this.set}.`; this.revision++;
        break;
      }
      case 'set':
        // ITSF: the team that lost the set serves first in the next one.
        this.set++; this.score = { red: 0, blue: 0 };
        this.kickoff(this.serve, 'midfield', now, this.timing.kickoffMs);
        break;
      case 'paused': {
        // Nobody came back in time: a match with coins is lost by their team; a friendly goes on with Zé in their place.
        const away = this.slots.filter(s => s.playerId && !s.connected);
        if (this.stake && away.length) { this.finish(otherTeam(away[0]!.team), now, true, `${away[0]!.displayName} não voltou: W.O.`); break; }
        for (const slot of away) { this.options.onNotice?.(slot.playerId, 'Você demorou a voltar e o Zé do Totó assumiu o seu lugar no pebolim.'); this.clear(slot);
          Object.assign(slot, { cpu: this.level, displayName: CPU_NAME, ready: true, connected: true, brain: new FoosballCpu(this.level, this.random) }); }
        if (!this.humans.length) { this.reset(); break; }
        this.resumeIfBack(now);
        break;
      }
    }
  }

  /** Back from a pause once everyone it waited for is here. */
  private resumeIfBack(now: number): void {
    if (this.phase !== 'paused' || !this.paused) return;
    if ([...this.paused.waiting].some(id => this.seat(id)?.connected === false)) return;
    const from = this.paused.from; this.paused = undefined;
    if (from === 'goal' || from === 'set') { this.phase = from; this.deadline = now + 1500; this.message = ''; this.revision++; return; }
    // The ball stays where it was, still, and comes back to life after the countdown.
    Object.assign(this.sim.ball, { vx: 0, vy: 0 });
    this.phase = 'kickoff'; this.deadline = now + this.timing.restartMs; this.serving = false; this.message = 'De volta! A bola continua de onde parou.'; this.revision++;
  }

  /** The end: the winners get twice what each of them put in, the losers nothing. */
  private finish(winner: FoosballTeam, now: number, forfeit = false, message = ''): void {
    const summary: FoosballSummary = { matchId: this.matchId, tableId: this.id, score: `${this.score.red} × ${this.score.blue}${this.sets > 1 ? ` (sets ${this.setsWon.red} × ${this.setsWon.blue})` : ''}`, forfeit, stake: this.stake, players: [] };
    for (const slot of this.humans) {
      const win = slot.team === winner, paid = slot.staked ? (win ? slot.staked * 2 : 0) : 0;
      if (slot.staked) this.bank.settle(this.matchId, slot.playerId, paid);
      summary.players.push({ playerId: slot.playerId, team: slot.team, result: win ? 'win' : 'loss', paid });
      slot.staked = 0;
    }
    this.winner = winner; this.phase = 'finished'; this.deadline = now + this.timing.finishedMs; this.sim.frozen = true; this.paused = undefined;
    this.message = message || `${TEAM_NAMES[winner]} venceu!`; this.revision++;
    this.options.onMatch?.(summary);
  }

  /** Back to the lobby with the same places: a rematch is one "pronto" away. */
  private toLobby(): void {
    this.phase = 'lobby'; this.deadline = 0; this.matchId = ''; this.message = ''; this.unready();
    for (const slot of this.slots) { slot.pointer = 0; slot.lift = false; }
    this.revision++;
  }

  /** Nobody is left: the table goes back to how it was. */
  private reset(): void {
    for (const slot of this.humans) if (slot.staked) { this.bank.settle(this.matchId, slot.playerId, slot.staked); slot.staked = 0; }
    this.layout(this.format);
    Object.assign(this, { phase: 'lobby', deadline: 0, matchId: '', message: '', winner: '', hostId: '', stake: 0, paused: undefined });
    this.score = { red: 0, blue: 0 }; this.setsWon = { red: 0, blue: 0 }; this.set = 1;
    this.sim.frozen = true; this.revision++;
  }

  // ── Places ──────────────────────────────────────────────────────────────────────────────────────────────────────

  private layout(format: FoosballFormat): void {
    this.format = format;
    this.slots = slotDefs(format).map(d => ({ ...d, playerId: '', displayName: '', cpu: '', ready: false, connected: true, pointer: 0, lift: false, staked: 0 }));
  }
  /** 1x1 ↔ 2x2, keeping everyone on their team (a 2x2 team with two players cannot become a single place). */
  private reformat(format: FoosballFormat): void {
    const people = this.slots.filter(s => s.playerId || s.cpu).map(s => ({ ...s }));
    for (const team of ['red', 'blue'] as const) if (format === '1x1' && people.filter(p => p.team === team && p.playerId).length > 1)
      throw new Error(`O ${TEAM_NAMES[team]} tem dois jogadores: para 1×1, um deles precisa trocar de time ou sair.`);
    this.layout(format);
    for (const team of ['red', 'blue'] as const) {
      const mine = people.filter(p => p.team === team).sort((a, b) => Number(!!a.cpu) - Number(!!b.cpu));
      this.slots.filter(s => s.team === team).forEach((slot, i) => {
        const p = mine[i];
        if (p) Object.assign(slot, { playerId: p.playerId, displayName: p.displayName, cpu: p.cpu, ready: !!p.cpu, connected: p.connected, brain: p.cpu ? new FoosballCpu(p.cpu, this.random) : undefined });
      });
    }
  }
  private clear(slot: Slot): void {
    Object.assign(slot, { playerId: '', displayName: '', cpu: '', ready: false, connected: true, pointer: 0, lift: false, staked: 0, brain: undefined });
  }
  /** After someone left the lobby: the host passes on, and a table with only Zé left is cleared. */
  private afterLeave(): void {
    if (!this.humans.length) { this.reset(); return; }
    if (!this.seat(this.hostId)) this.hostId = this.humans[0]!.playerId;
    this.unready(); this.revision++;
  }
  private unready(): void { for (const s of this.slots) s.ready = !!s.cpu; }
  private lobbySlot(playerId: string): Slot {
    const slot = this.seat(playerId);
    if (!slot) throw new Error('Pegue um lugar na mesa primeiro.');
    if (this.phase !== 'lobby' || this.starting) throw new Error('A partida já está rolando.');
    return slot;
  }
  /** Who holds a rod of a team (for "who scored"). */
  private holder(team: FoosballTeam, rod: number): Slot | undefined {
    return this.slots.find(s => s.team === team && rodsOf(s.team, s.role).some(r => r.index === rod));
  }
}
