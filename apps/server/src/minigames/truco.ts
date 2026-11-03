import { TRUCO, TRUCO_BET, TRUCO_LEVELS, TRUCO_LEVEL_INFO, TrucoGame, callLabel, hasCasalMaior, partnerOf, shuffled, teamOf, trucoDecide, trucoLine, trucoSignalChoice, trucoStakes, type TrucoLevel, type TrucoLook, type TrucoMoment, type TrucoPersonality, type TrucoRandom, type TrucoSeatView, type TrucoSignal, type TrucoStakes, type TrucoTeam, type TrucoTrick, type TrucoView } from '@bar/shared';

export interface TrucoPerson { id: string; name: string; color: string }
/** A person at the table: their yes to the stake, and what they have in play. */
interface Sitter extends TrucoPerson { ready: boolean; staked: number; prize?: number }
interface Npc { name: string; personality: TrucoPersonality; look: TrucoLook }
interface Seat { person?: Sitter; npc?: Npc; say?: { text: string; tone?: 'taunt' | 'calm'; key: number } }

/** The house's regulars, by level: a match only ever seats NPCs of its own. */
const REGULARS: Record<TrucoLevel, readonly Npc[]> = {
  iniciante: [
    { name: 'Juninho', personality: 'iniciante', look: { tone: 0, hair: 1, hairColor: 3, facial: 0, glasses: 0, shirt: 5, bg: 1 } },
    { name: 'Tati Novata', personality: 'iniciante', look: { tone: 2, hair: 3, hairColor: 1, facial: 0, glasses: 0, shirt: 6, bg: 5 } },
    { name: 'Beto do Bingo', personality: 'iniciante', look: { tone: 3, hair: 0, hairColor: 4, facial: 2, glasses: 1, shirt: 2, bg: 4 } },
  ],
  medio: [
    { name: 'Seu Arlindo', personality: 'conservador', look: { tone: 1, hair: 6, hairColor: 5, facial: 2, glasses: 1, shirt: 7, bg: 6 } },
    { name: 'Bira Blefe', personality: 'blefador', look: { tone: 3, hair: 2, hairColor: 0, facial: 3, glasses: 2, shirt: 0, bg: 0 } },
    { name: 'Zé Provoca', personality: 'provocador', look: { tone: 4, hair: 6, hairColor: 0, facial: 3, glasses: 2, shirt: 4, bg: 2 } },
  ],
  experiente: [
    { name: 'Dona Neide', personality: 'experiente', look: { tone: 1, hair: 5, hairColor: 4, facial: 0, glasses: 1, shirt: 6, bg: 5 } },
    { name: 'Dra. Valquíria', personality: 'estrategico', look: { tone: 2, hair: 4, hairColor: 1, facial: 0, glasses: 1, shirt: 3, bg: 3 } },
    { name: 'Mestre Tião', personality: 'experiente', look: { tone: 5, hair: 0, hairColor: 4, facial: 1, glasses: 0, shirt: 1, bg: 7 } },
  ],
};
/** Where a match's coins go (minigames/blackjack-bank.ts): stake throws with the reason to show; settle must not lose it. */
export interface TrucoBank {
  stake(playerId: string, matchId: string, amount: number): Promise<void>;
  settle(matchId: string, playerId: string, payout: number): void;
}
const FREE_BANK: TrucoBank = { stake: async () => {}, settle: () => {} };

export interface TrucoSummary { matchId: string; stake: number; level: TrucoLevel; score: [number, number]; players: Array<{ id: string; won: boolean; paid: number }>; npcs: number }
export interface TrucoTableHooks {
  /** This player's view of the table: only they get it. */
  view(playerId: string, view: TrucoView): void;
  /** Told to one person: their turn ran out, their part could not be taken. */
  notice?(playerId: string, message: string): void;
  onMatch?(summary: TrucoSummary): void;
  bank?: TrucoBank;
  /** The values in the price table. */
  stakes?(): TrucoStakes;
  random: TrucoRandom;
  chance?: () => number;
  timing?: { turnMs?: number; answerMs?: number };
}

/**
 * The truco table of the games hall: the seats, the stakes, the clock and the NPCs around one TrucoGame (shared/truco, the
 * rules). Up to four people; NPCs of the chosen level take the empty seats, and step in for anyone who leaves. Everyone says
 * yes to the stake before it is taken. Nobody's cards go into the room's state: each person gets their own view by message.
 */
export class TrucoTable {
  readonly seats: Seat[] = [{}, {}, {}, {}];
  game?: TrucoGame;
  dark = false;
  level: TrucoLevel = 'iniciante';
  /** The stake between people, as the table set it. */
  chosenStake: number = TRUCO_BET.minBet;
  /** Taking the stakes: the lobby is locked until every one is in, or the match is called off. */
  taking = false;
  matchId = '';
  private moment = { key: '', until: 0, deadline: 0, total: 0, npcAt: 0, endAt: 0 };
  private signalAt = new Map<number, number>();
  private npcSignals: Array<{ seat: number; signal: TrucoSignal; at: number }> = [];
  private planned = 0;
  private sayKey = 0;
  private shown = new Map<string, string>();
  private readonly chance: () => number;
  private readonly turnMs: number;
  private readonly answerMs: number;
  private readonly bank: TrucoBank;

  constructor(readonly id: string, private hooks: TrucoTableHooks) {
    this.chance = hooks.chance ?? (() => hooks.random(1_000_000) / 1_000_000);
    this.turnMs = hooks.timing?.turnMs ?? TRUCO.turnMs; this.answerMs = hooks.timing?.answerMs ?? TRUCO.answerMs;
    this.bank = hooks.bank ?? FREE_BANK;
  }

  get people(): Sitter[] { return this.seats.flatMap(s => s.person ? [s.person] : []); }
  seatOf(playerId: string): number { return this.seats.findIndex(s => s.person?.id === playerId); }
  get inMatch(): boolean { return !!this.game && this.game.phase !== 'match-end'; }
  private get values(): TrucoStakes { return this.hooks.stakes?.() ?? trucoStakes({}); }
  /** People on both teams play each other: the table's stake. People on one team play the house: the level's. */
  get betweenPeople(): boolean { const teams = new Set(this.seats.flatMap((s, i) => s.person ? [teamOf(i)] : [])); return teams.size > 1; }
  get stake(): number {
    const { levels, min, max } = this.values;
    return this.betweenPeople ? Math.min(max, Math.max(min, this.chosenStake)) : levels[this.level];
  }

  /** A seat for someone arriving: a free one, across from whoever is alone, so that two friends play together. A match in play has none. */
  join(person: TrucoPerson): number {
    if (this.seatOf(person.id) >= 0) return this.seatOf(person.id);
    if (this.inMatch) throw new Error('A mesa está em partida valendo moedas. Espere terminar.');
    if (this.game) this.toLobby();
    const taken = this.seats.findIndex(s => s.person);
    const order = taken >= 0 ? [partnerOf(taken), (taken + 1) % 4, (taken + 3) % 4] : [0, 2, 1, 3];
    const seat = order.find(s => !this.seats[s]!.person);
    if (seat === undefined) throw new Error('A mesa de truco está cheia.');
    this.seats[seat]!.person = { ...person, ready: false, staked: 0 };
    this.unready();
    return seat;
  }
  private unready(): void { for (const person of this.people) person.ready = false; }
  private lobbyOnly(): void {
    if (this.game) throw new Error('A partida já começou.');
    if (this.taking) throw new Error('As apostas já estão sendo recolhidas.');
  }
  /** Another free seat, before a match: that is how you choose your partner. */
  move(playerId: string, seat: number): void {
    this.lobbyOnly();
    const from = this.seatOf(playerId);
    if (from < 0) throw new Error('Sente-se à mesa primeiro.');
    if (this.seats[seat]!.person) throw new Error('Esse lugar já tem dono.');
    this.seats[seat]!.person = this.seats[from]!.person; this.seats[from] = {};
    this.unready();
  }
  /** The level, the stake between people or the Escuro. Any change asks everyone's yes again. */
  configure(playerId: string, patch: { level?: TrucoLevel; stake?: number; dark?: boolean }): void {
    this.lobbyOnly();
    if (this.seatOf(playerId) < 0) throw new Error('Sente-se à mesa primeiro.');
    if (patch.stake !== undefined) {
      const { min, max } = this.values;
      if (patch.stake < min || patch.stake > max) throw new Error(`Entre jogadores, cada um põe de ${min} a ${max} moedas.`);
      this.chosenStake = patch.stake;
    }
    if (patch.level) this.level = patch.level;
    if (patch.dark !== undefined) this.dark = patch.dark;
    this.unready();
  }
  /** A yes to the stake. When everyone said it, the stakes are taken and the match starts. */
  async ready(playerId: string, ready: boolean, now: number): Promise<void> {
    this.lobbyOnly();
    const seat = this.seatOf(playerId);
    if (seat < 0) throw new Error('Sente-se à mesa primeiro.');
    this.seats[seat]!.person!.ready = ready;
    this.push();
    if (this.people.every(p => p.ready)) await this.begin(now);
  }
  /** All the parts, or none: someone who could not pay, or got up meanwhile, calls the match off and every part goes back. */
  private async begin(now: number): Promise<void> {
    this.taking = true; this.push();
    const stake = this.stake, matchId = crypto.randomUUID(), level = this.level;
    const players = this.seats.flatMap((s, i) => s.person ? [{ person: s.person, seat: i, paid: false }] : []);
    let refused = false;
    await Promise.all(players.map(async player => {
      try { await this.bank.stake(player.person.id, matchId, stake); player.paid = true; }
      catch (error) { refused = true; this.hooks.notice?.(player.person.id, `Sua aposta não entrou: ${error instanceof Error ? error.message : 'a carteira não respondeu.'}`); }
    }));
    this.taking = false;
    const moved = players.some(p => this.seats[p.seat]!.person !== p.person) || this.people.length !== players.length;
    if (refused || moved) {
      for (const player of players) this.bank.settle(matchId, player.person.id, player.paid ? stake : 0);
      this.unready();
      for (const person of this.people) this.hooks.notice?.(person.id, 'A partida não começou: as apostas voltaram.');
      this.push();
      return;
    }
    for (const player of players) { player.person.staked = stake; player.person.prize = undefined; }
    this.matchId = matchId;
    const regulars = shuffled(REGULARS[level], this.hooks.random);
    this.seats.forEach(seat => { if (!seat.person) seat.npc = regulars.find(r => !this.seats.some(s => s.npc?.name === r.name))!; });
    this.game = new TrucoGame({ random: this.hooks.random, dark: this.dark, nameOf: seat => this.nameOf(seat) });
    this.moment.key = ''; this.moment.endAt = 0; this.planned = 0; this.npcSignals = [];
    this.drain(); this.tick(now);
  }
  /**
   * Off the table. In a match an NPC of its level takes the seat and the part stays behind: whoever leaves loses it,
   * whichever team ends up winning. With nobody left the table is free again.
   */
  leave(playerId: string): void {
    const index = this.seatOf(playerId); if (index < 0) return;
    const seat = this.seats[index]!, person = seat.person!;
    this.shown.delete(playerId);
    if (person.staked) { this.bank.settle(this.matchId, person.id, 0); person.staked = 0; }
    seat.person = undefined;
    if (!this.people.length) { this.clear(); return; }
    if (this.inMatch) seat.npc = this.freeRegular();
    else this.unready();
  }
  private clear(): void {
    this.game = undefined; this.seats.forEach((_, i) => { this.seats[i] = {}; });
    this.dark = false; this.level = 'iniciante'; this.chosenStake = TRUCO_BET.minBet; this.matchId = '';
    this.moment = { key: '', until: 0, deadline: 0, total: 0, npcAt: 0, endAt: 0 }; this.npcSignals = []; this.signalAt.clear();
  }
  /** Back to the lobby with the same people: a new match needs a new yes from each of them. */
  private toLobby(): void {
    this.game = undefined; this.matchId = '';
    for (const seat of this.seats) { seat.npc = undefined; seat.say = undefined; if (seat.person) { seat.person.ready = false; seat.person.staked = 0; seat.person.prize = undefined; } }
    this.moment = { key: '', until: 0, deadline: 0, total: 0, npcAt: 0, endAt: 0 }; this.npcSignals = []; this.signalAt.clear();
  }
  again(playerId: string): void {
    if (this.seatOf(playerId) < 0) throw new Error('Sente-se à mesa primeiro.');
    if (this.game?.phase !== 'match-end') throw new Error('A partida ainda não acabou.');
    this.toLobby(); this.push();
  }
  private freeRegular(): Npc {
    const used = new Set(this.seats.map(s => s.npc?.name));
    const free = REGULARS[this.level].filter(r => !used.has(r.name));
    return free.length ? free[this.hooks.random(free.length)]! : REGULARS[this.level][0]!;
  }
  private nameOf(seat: number): string { const s = this.seats[seat]!; return s.person?.name ?? s.npc?.name ?? `Lugar ${seat + 1}`; }

  /** The person's seat, in a match. */
  private playing(playerId: string): number {
    const seat = this.seatOf(playerId);
    if (seat < 0 || !this.game) throw new Error('Sente-se à mesa e comece a partida primeiro.');
    return seat;
  }
  play(playerId: string, card: string, hidden: boolean, now: number): void { this.game?.play(this.playing(playerId), card, hidden); this.after(now); }
  call(playerId: string, now: number): void { this.game?.call(this.playing(playerId)); this.after(now); }
  answer(playerId: string, answer: 'accept' | 'raise' | 'run', to: number, now: number): void { this.game?.answer(this.playing(playerId), answer, to); this.after(now); }
  eleven(playerId: string, answer: 'play' | 'run' | 'show', now: number): void { this.game?.decideEleven(this.playing(playerId), answer); this.after(now); }
  signal(playerId: string, signal: TrucoSignal, now: number): void {
    const seat = this.playing(playerId);
    if (now - (this.signalAt.get(seat) ?? -Infinity) < TRUCO.signalCooldownMs) throw new Error('Calma: um sinal de cada vez.');
    this.signalAt.set(seat, now);
    this.game?.signal(seat, signal); this.push();
  }
  private after(now: number): void { this.drain(); this.tick(now); }

  /** The clock: a moment that has lasted moves on, a turn that ran out is played, an NPC whose time has come decides. */
  tick(now: number): void {
    const game = this.game;
    if (!game) { this.push(); return; }
    for (let guard = 0; guard < 6; guard++) {
      this.enter(now);
      if (game.timed && now >= this.moment.until) { game.advance(); this.drain(); continue; }
      break;
    }
    this.flushSignals(now);
    if (game.phase === 'playing' || game.phase === 'bet' || game.phase === 'eleven') this.decisions(now);
    if (game.phase === 'match-end') {
      if (!this.moment.endAt) this.moment.endAt = now + TRUCO.matchEndMs;
      else if (now >= this.moment.endAt) this.toLobby();
    }
    this.push();
  }
  /** A new moment on the table: when it ends, who must act and by when. */
  private enter(now: number): void {
    const game = this.game!, key = `${game.handNumber}:${game.phase}:${game.turn}:${game.bet?.to ?? ''}:${game.played.length}`;
    if (key === this.moment.key) return;
    this.moment.key = key;
    const hold = { shuffling: TRUCO.shuffleMs, dealing: TRUCO.dealMs, 'trick-end': TRUCO.trickEndMs, 'hand-end': TRUCO.handEndMs } as Partial<Record<string, number>>;
    this.moment.until = now + (hold[game.phase] ?? 0);
    const answering = game.phase === 'bet' || game.phase === 'eleven', total = answering ? this.answerMs : game.phase === 'playing' ? this.turnMs : 0;
    this.moment.deadline = total ? now + total : 0; this.moment.total = total;
    this.moment.npcAt = now + TRUCO.npcMinMs + this.chance() * (TRUCO.npcMaxMs - TRUCO.npcMinMs);
    if (game.phase === 'playing' && this.planned !== game.handNumber) { this.planned = game.handNumber; this.planSignals(now); }
  }
  private planSignals(now: number): void {
    const game = this.game!;
    this.seats.forEach((seat, index) => {
      if (!seat.npc) return;
      const signal = trucoSignalChoice(game.observe(index), seat.npc.personality, this.chance);
      if (signal) this.npcSignals.push({ seat: index, signal, at: now + 800 + this.chance() * 4000 });
    });
  }
  private flushSignals(now: number): void {
    const game = this.game!;
    this.npcSignals = this.npcSignals.filter(s => {
      if (s.at > now) return true;
      if (game.phase === 'playing' || game.phase === 'bet') game.signal(s.seat, s.signal);
      return false;
    });
  }
  /** Those who must act. An NPC beside a person leaves the answer to them (first initiative), and takes it only when time runs out. */
  private decisions(now: number): void {
    const game = this.game!, out = this.moment.deadline > 0 && now >= this.moment.deadline, ready = now >= this.moment.npcAt;
    if (game.phase === 'playing') {
      const seat = this.seats[game.turn!]!;
      if (seat.npc) { if (ready) this.npcMove(game.turn!); return; }
      if (out) {
        if (seat.person) this.hooks.notice?.(seat.person.id, 'Seu tempo acabou: a primeira carta foi jogada.');
        game.play(game.turn!, game.hands[game.turn!]![0]!.id); this.drain();
      }
      return;
    }
    const team: TrucoTeam = game.phase === 'bet' ? (game.bet!.team === 0 ? 1 : 0) : game.elevenTeam!;
    const members = [team, team + 2], npcs = members.filter(m => this.seats[m]!.npc), people = members.filter(m => this.seats[m]!.person);
    if (npcs.length && (people.length ? out : ready)) { this.npcMove(npcs[0]!); return; }
    if (out && !npcs.length) {
      if (game.phase === 'bet') game.answer(people[0]!, 'run', game.bet!.to); else game.decideEleven(people[0]!, 'run');
      this.drain();
    }
  }
  private npcMove(seat: number): void {
    const game = this.game!, npc = this.seats[seat]!.npc!, decision = trucoDecide(game.observe(seat), npc.personality, this.chance);
    if (!decision) return;
    if (decision.type === 'play') game.play(seat, decision.card, !!decision.hidden);
    else if (decision.type === 'call') game.call(seat);
    else if (decision.type === 'answer') game.answer(seat, decision.answer, game.bet!.to);
    else game.decideEleven(seat, decision.answer);
    this.drain();
  }
  /** What just happened at the table: lines for the NPCs, and the end of the match pays. */
  private drain(): void {
    const game = this.game; if (!game) return;
    for (const event of game.events.splice(0)) {
      if (event.type === 'call') this.say(event.seat, 'call');
      else if (event.type === 'accept') this.say(event.seat, 'accept');
      else if (event.type === 'run') this.sayFor(event.team === 0 ? 1 : 0, 'they-run');
      else if (event.type === 'trick' && event.winner !== 'tie') this.say(event.seat, 'won-trick');
      else if (event.type === 'hand' && event.result.winner !== null && event.result.points) { this.sayFor(event.result.winner, 'won-hand'); this.sayFor(event.result.winner === 0 ? 1 : 0, 'lost-hand'); }
      else if (event.type === 'match') { this.sayFor(event.winner, 'won-match'); this.settle(event.winner, game); }
    }
  }
  /** Each winner takes twice their part: the parts added up, divided by two. An NPC's part is the house's. */
  private settle(winner: TrucoTeam, game: TrucoGame): void {
    const players: TrucoSummary['players'] = [];
    let stake = 0;
    this.seats.forEach((seat, index) => {
      const person = seat.person; if (!person) return;
      const won = teamOf(index) === winner, paid = won ? person.staked * 2 : 0;
      stake = Math.max(stake, person.staked);
      this.bank.settle(this.matchId, person.id, paid);
      person.prize = paid - person.staked; person.staked = 0;
      players.push({ id: person.id, won, paid });
    });
    this.hooks.onMatch?.({ matchId: this.matchId, stake, level: this.level, score: [...game.score], players, npcs: 4 - players.length });
  }
  private say(seat: number, moment: TrucoMoment): void {
    const holder = this.seats[seat]!; if (!holder.npc) return;
    const text = trucoLine(holder.npc.personality, moment, this.chance);
    if (text) holder.say = { text, tone: holder.npc.personality === 'provocador' || holder.npc.personality === 'blefador' ? 'taunt' : 'calm', key: ++this.sayKey };
  }
  private sayFor(team: TrucoTeam, moment: TrucoMoment): void { const seat = [team, team + 2].filter(s => this.seats[s]!.npc); if (seat.length) this.say(seat[this.hooks.random(seat.length)]!, moment); }

  // ── Views ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Sends each person their view, when it changed. */
  private push(): void {
    for (const person of this.people) {
      const view = this.viewFor(person.id), json = JSON.stringify(view);
      if (this.shown.get(person.id) === json) continue;
      this.shown.set(person.id, json); this.hooks.view(person.id, view);
    }
  }
  /** Sends a view even if nothing changed: someone just opened the panel. */
  refresh(playerId: string): void { this.shown.delete(playerId); this.push(); }
  private seatViews(): TrucoSeatView[] {
    const game = this.game, signals = game?.signals ?? [];
    return this.seats.map((seat, index): TrucoSeatView => {
      const signal = signals.filter(s => s.seat === index).at(-1), person = seat.person, npc = seat.npc;
      return {
        seat: index, team: teamOf(index), name: person?.name ?? npc?.name ?? '', kind: person ? 'human' : npc ? 'npc' : 'empty',
        ...(person ? { id: person.id, color: person.color, ready: person.ready } : {}),
        ...(npc ? { look: npc.look, personality: TRUCO_LEVEL_INFO[this.level].label, personalityId: npc.personality } : {}),
        cards: game?.hands[index]?.length ?? 0,
        ...(seat.say ? { say: seat.say } : {}), ...(signal ? { signal: { signal: signal.signal, key: signal.key } } : {}),
      };
    });
  }
  private modeText(): string {
    const people = this.people.length, npcs = this.game ? this.seats.filter(s => s.npc).length : 4 - people, level = TRUCO_LEVEL_INFO[this.level].label;
    return `Duplas 2x2 · ${people} ${people === 1 ? 'pessoa' : 'pessoas'}${npcs ? ` e ${npcs} ${npcs === 1 ? 'NPC' : 'NPCs'} · Nível ${level}` : ''} · ${this.stake} moedas por pessoa${this.dark ? ' · Ferro no escuro' : ''}`;
  }
  viewFor(playerId: string): TrucoView {
    const game = this.game, selfSeat = this.seatOf(playerId), me = this.seats[selfSeat]?.person;
    if (!game) {
      const { levels, min, max } = this.values;
      return {
        id: this.id, mode: this.modeText(), phase: 'lobby', handNumber: 0, selfSeat, seats: this.seatViews(), dealer: -1, turn: null, deadline: 0, turnMs: 1,
        score: [0, 0], target: TRUCO.target, handValue: 1, callLabel: '', vira: null, deck: 40, mine: [], table: [], tricks: [{ winner: null }, { winner: null }, { winner: null }], log: [],
        lobby: { level: this.level, dark: this.dark, betweenPeople: this.betweenPeople, stake: this.stake, min, max, step: TRUCO_BET.step, levels: TRUCO_LEVELS.map(id => ({ id, label: TRUCO_LEVEL_INFO[id].label, stake: levels[id], npcs: TRUCO_LEVEL_INFO[id].npcs })), taking: this.taking },
      };
    }
    const team = teamOf(selfSeat), obs = game.vira ? game.observe(selfSeat) : undefined, bet = game.bet, label = callLabel(game.value);
    const opponents = (of: TrucoTeam) => [of, of + 2].map(s => this.nameOf(s)).join(' ou ');
    const tricks: TrucoTrick[] = game.tricks.map((winner, i) => ({ winner, ...(winner !== 'tie' ? { seat: game.played.slice(i * 4, i * 4 + 4).find(p => p.winner)?.seat ?? -1 } : {}) }));
    while (tricks.length < 3) tricks.push({ winner: null });
    const raiseTo = bet ? game.raiseOption(selfSeat) : null, option = game.callOption(selfSeat);
    const elevenMine = game.elevenTeam === team, partner = obs?.partnerCards ?? [];
    return {
      id: this.id, mode: this.modeText(), phase: game.phase, handNumber: game.handNumber, selfSeat, seats: this.seatViews(), dealer: game.dealer, turn: game.turn,
      deadline: this.moment.deadline, turnMs: this.moment.total || 1,
      score: [...game.score], target: TRUCO.target, handValue: game.value, callLabel: game.elevenTeam !== null ? 'Mão de 11' : game.iron ? 'Ferro' : label,
      vira: game.vira, deck: 27, mine: obs?.hand ?? [], table: game.table, tricks,
      ...(option ? { canCall: option } : {}), ...(game.canHide(selfSeat) ? { canHide: true } : {}),
      ...(bet ? { bet: { by: bet.by, label: callLabel(bet.to), from: bet.from, to: bet.to, ...(raiseTo ? { raiseTo, raiseLabel: callLabel(raiseTo) } : {}), runAway: bet.from, mine: bet.team === team, answering: bet.team !== team, ...(bet.team === team ? { waitingFor: opponents(team === 0 ? 1 : 0) } : {}) } } : {}),
      ...(game.phase === 'eleven' && game.elevenTeam !== null ? { eleven: {
        team: game.elevenTeam, mine: elevenMine, ...(elevenMine ? { partnerCards: partner, canShow: obs!.canShow, casalMaior: obs!.canShow && hasCasalMaior([...game.hands[selfSeat]!, ...game.hands[partnerOf(selfSeat)]!], game.vira!) } : { waitingFor: opponents(game.elevenTeam) }),
      } } : {}),
      ...(game.iron ? { iron: { dark: game.dark } } : {}),
      ...(game.result ? { result: game.result } : {}),
      log: game.log.slice(-5),
      ...(me?.staked ? { stake: me.staked } : {}), ...(me?.prize !== undefined ? { prize: me.prize } : {}),
    };
  }
}
