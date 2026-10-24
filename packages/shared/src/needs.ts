import {ITEM_CATALOG} from './inventory.js';

/**
 * Character needs: HP, stamina, hunger, thirst, bladder and drunkenness. Pure, time-based rules shared by
 * the authoritative server (which owns the values) and the client (which predicts running and sway).
 * Every tunable number lives in NEEDS; nothing below hard-codes balance.
 */
export const NEEDS = {
  hp: {
    max: 100,
    /** HP when waking from a faint caused by HP reaching zero. */
    recoverTo: 35,
    alertAt: 25,
  },
  stamina: {
    max: 100,
    /** Running for ~11 s empties a full bar. Walking costs nothing. */
    runDrainPerSecond: 9,
    regenPerSecond: 12,
    /** Recovery starts this long after the last running step. */
    regenDelaySeconds: 1.2,
    /** Once empty, running stays locked until the bar is back to this. */
    exhaustedUntil: 30,
  },
  hunger: {
    /** 100 is fed, 0 is starving. Empties in about four hours of play. */
    max: 100,
    drainPerMinute: 100 / 240,
    alertAt: 30,
  },
  thirst: {
    /** 100 is hydrated, 0 is dehydrated. Empties in about two and a half hours of play. */
    max: 100,
    drainPerMinute: 100 / 150,
    runningMultiplier: 2,
    alertAt: 30,
    /** At zero thirst, HP drains slowly (6 per minute), never in a burst. */
    damagePerSecond: .1,
    /** No dehydration damage for this long after waking up. */
    graceAfterWakingSeconds: 60,
  },
  /** Penalties are smooth ramps: no effect above `from`, the full `penalty` at 0. */
  staminaPenalties: {
    hunger: { from: 50, penalty: .35 },
    thirst: { from: 40, penalty: .5 },
    /** A full bladder slows stamina recovery too, separately from alcohol. */
    bladder: { from: 85, penalty: .25 },
  },
  bladder: {
    max: 100,
    alertAt: 70,
    urgentAt: 90,
    /** Using a toilet takes this long and empties the bladder down to `emptiesTo`. */
    toiletSeconds: 6,
    emptiesTo: 0,
  },
  drunk: {
    max: 100,
    /** Sobering up: 100 to 0 in 40 minutes. */
    soberPerMinute: 2.5,
    /** An empty stomach makes alcohol hit harder: up to +50% at hunger 0. */
    hungerSensitivity: .5,
    /** Stage thresholds: 1 light, 2 moderate, 3 high, 4 extreme (faint). */
    stages: [20, 45, 70, 90] as const,
    /** Heading error of the walking direction per stage (degrees), deterministic for prediction. */
    swayDegrees: [0, 4, 9, 15, 15] as const,
    /** From stage 3: chance per second of stumbling while moving, and how long a stumble lasts. */
    stumbleChancePerSecond: .05,
    stumbleSeconds: 3.5,
    stumbleCooldownSeconds: 25,
    /** From this stage on the character cannot run. */
    noRunFromStage: 3,
    /** After an alcohol faint, drunkenness drops to this, so waking up never triggers a new faint. */
    soberAfterFaintTo: 55,
  },
  faint: {
    seconds: 15,
    alcoholSeconds: 20,
    /** After waking: slow, no running, then back to normal. */
    recoveringSeconds: 5,
    /** Alcohol faints move the character to this map marker (free floor around it) once the fall has played this long. */
    alcoholRecoveryMarker: 'Spawn_Jogador',
    moveAfterSeconds: 2.5,
    /** Chance of losing a random inventory item when HP reaches zero. */
    itemLossChance: .8,
  },
} as const;

export type Condition = 'normal' | 'stumbling' | 'fainted' | 'recovering';
export type FaintCause = 'hp' | 'alcohol';
/** A temporary raise of maximum HP, e.g. from a food; it never becomes permanent. */
export interface MaxHpBonus { source: string; amount: number; until: number }
export interface NeedsState {
  hp: number; stamina: number; hunger: number; thirst: number; bladder: number; drunk: number;
  bonuses: MaxHpBonus[];
  exhausted: boolean;
  /** Stamina may recover from this time (ms). */
  restAt: number;
  condition: Condition;
  conditionUntil: number;
  faintCause?: FaintCause;
  /** Increments with every faint, so a faint is handled once. */
  faints: number;
  nextStumbleAt: number;
  dehydrationGraceUntil: number;
}
export type NeedsEvent =
  | { type: 'faint'; cause: FaintCause }
  | { type: 'woke' }
  | { type: 'recovered' }
  | { type: 'stumble' }
  | { type: 'steady' }
  | { type: 'exhausted' };

/**
 * What eating or drinking something does. Every field is optional: a drink need not feed, a food need not
 * hydrate. Amounts are points on the 0–100 scales; durations in seconds.
 */
export interface ConsumableEffects {
  name: string;
  hunger?: number;
  thirst?: number;
  /** Immediate HP recovery, up to the current maximum. */
  hp?: number;
  /** Temporary raise of maximum HP, and for how long. */
  maxHp?: { amount: number; seconds: number };
  drunk?: number;
  bladder?: number;
}
/**
 * The bar's real drinks (the drinks served by Seu Zé, see DRINK_ITEMS). Beer hydrates a little, but alcohol
 * is never treated as water: its thirst value is declared explicitly. The inventory catalogue is the single
 * source of truth, so UI descriptions, purchases and authoritative effects cannot drift apart.
 */
export const CONSUMABLES: Record<string, ConsumableEffects> = Object.fromEntries(ITEM_CATALOG.map(item=>[item.id,item.effects]));

const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
export function createNeeds(now = 0): NeedsState {
  return { hp: NEEDS.hp.max, stamina: NEEDS.stamina.max, hunger: NEEDS.hunger.max, thirst: NEEDS.thirst.max, bladder: 0, drunk: 0,
    bonuses: [], exhausted: false, restAt: now, condition: 'normal', conditionUntil: 0, faints: 0, nextStumbleAt: 0, dehydrationGraceUntil: 0 };
}
/** Maximum HP right now: the base plus active temporary bonuses. */
export function maxHp(state: Pick<NeedsState, 'bonuses'>, now: number): number {
  return NEEDS.hp.max + state.bonuses.filter(b => b.until > now).reduce((sum, b) => sum + Math.max(0, b.amount), 0);
}
/** 0 sober, 1–4 by NEEDS.drunk.stages. */
export function drunkStage(drunk: number): 0 | 1 | 2 | 3 | 4 {
  const stages = NEEDS.drunk.stages;
  return (drunk >= stages[3] ? 4 : drunk >= stages[2] ? 3 : drunk >= stages[1] ? 2 : drunk >= stages[0] ? 1 : 0);
}
const ramp = (value: number, { from, penalty }: { from: number; penalty: number }) => value >= from ? 0 : penalty * (1 - clamp(value, 0, from) / from);
const rampUp = (value: number, { from, penalty }: { from: number; penalty: number }) => value <= from ? 0 : penalty * (clamp(value, from, 100) - from) / (100 - from);
/** Multiplier on stamina recovery (1 = unaffected): hunger, thirst and a full bladder slow it gradually. */
export function staminaRecovery(state: Pick<NeedsState, 'hunger' | 'thirst' | 'bladder'>): number {
  const p = NEEDS.staminaPenalties;
  return (1 - ramp(state.hunger, p.hunger)) * (1 - ramp(state.thirst, p.thirst)) * (1 - rampUp(state.bladder, p.bladder));
}
/** Multiplier on stamina spent running (1 = unaffected): hunger makes running cost more. */
export function staminaCost(state: Pick<NeedsState, 'hunger'>): number {
  return 1 + ramp(state.hunger, NEEDS.staminaPenalties.hunger);
}
/** Whether the character may run now. Shared by the server and the client's prediction. */
export function canRun(state: { condition?: string; exhausted?: boolean; stamina?: number; drunk?: number }): boolean {
  return (state.condition ?? 'normal') === 'normal' && !state.exhausted && (state.stamina ?? NEEDS.stamina.max) > 0 && drunkStage(state.drunk ?? 0) < NEEDS.drunk.noRunFromStage;
}
/** Whether the character can act (interact, consume, emote). */
export function isConscious(state: { condition?: string }): boolean {
  return state.condition !== 'fainted' && state.condition !== 'stumbling';
}

/**
 * Drunk walking: the intended direction turns by a deterministic angle from the input sequence, so the
 * server and the client's prediction move the same way. 0 when sober.
 */
export function swayAngle(seq: number, drunk: number, seed: string): number {
  const amplitude = NEEDS.drunk.swayDegrees[drunkStage(drunk)] * Math.PI / 180;
  if (!amplitude) return 0;
  let hash = 0; for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const phase = (hash & 1023) / 1024 * Math.PI * 2;
  return amplitude * (Math.sin(seq * .21 + phase) * .7 + Math.sin(seq * .053 + phase * 2) * .3);
}
export function swayInput<T extends { dx: number; dz: number }>(input: T, seq: number, drunk: number, seed: string): T {
  const angle = swayAngle(seq, drunk, seed);
  if (!angle || (!input.dx && !input.dz)) return input;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { ...input, dx: input.dx * cos - input.dz * sin, dz: input.dx * sin + input.dz * cos };
}

/** Lowers HP (damage of any kind). Fainting is decided by the next tick, once, by the condition rules. */
export function damage(state: NeedsState, amount: number, now: number): void {
  if (!(amount > 0)) return;
  state.hp = clamp(state.hp - amount, 0, maxHp(state, now));
}

/**
 * Applies a food or drink. `portion` (0–1) covers a drink interrupted halfway. Returns false when the
 * character cannot consume now (fainted or stumbling). The only place consumables change needs.
 */
export function applyConsumable(state: NeedsState, effects: ConsumableEffects, now: number, portion = 1): boolean {
  if (!isConscious(state)) return false;
  const part = clamp(portion, 0, 1), amount = (value?: number) => Number.isFinite(value) ? value! : 0;
  state.hunger = clamp(state.hunger + amount(effects.hunger) * part, 0, NEEDS.hunger.max);
  state.thirst = clamp(state.thirst + amount(effects.thirst) * part, 0, NEEDS.thirst.max);
  state.bladder = clamp(state.bladder + amount(effects.bladder) * part, 0, NEEDS.bladder.max);
  // Alcohol hits harder on an empty stomach (hunger is measured before this item's own food value).
  const sensitivity = 1 + NEEDS.drunk.hungerSensitivity * (1 - clamp(state.hunger, 0, NEEDS.hunger.max) / NEEDS.hunger.max);
  state.drunk = clamp(state.drunk + amount(effects.drunk) * part * sensitivity, 0, NEEDS.drunk.max);
  if (effects.maxHp && amount(effects.maxHp.amount) > 0 && amount(effects.maxHp.seconds) > 0 && part > 0)
    state.bonuses.push({ source: effects.name, amount: effects.maxHp.amount * part, until: now + effects.maxHp.seconds * 1000 });
  state.hp = clamp(state.hp + amount(effects.hp) * part, 0, maxHp(state, now));
  return true;
}
/** Using a toilet; `portion` (0–1) for a visit cut short. */
export function relieve(state: NeedsState, portion = 1): void {
  const target = NEEDS.bladder.emptiesTo;
  state.bladder = clamp(state.bladder - (state.bladder - target) * clamp(portion, 0, 1), 0, NEEDS.bladder.max);
}

/**
 * Advances needs by `seconds` of real time. `running` means a running step was taken in this interval.
 * `random` is injected so the server's dice and the tests are reproducible.
 */
export function tickNeeds(state: NeedsState, seconds: number, now: number, activity: { running: boolean; moving: boolean }, random: () => number = Math.random): NeedsEvent[] {
  const events: NeedsEvent[] = [];
  const dt = clamp(seconds, 0, 1);
  // Temporary maximum-HP bonuses end on time; HP above the new maximum is brought down to it.
  state.bonuses = state.bonuses.filter(b => b.until > now);
  const ceiling = maxHp(state, now);
  state.hp = clamp(state.hp, 0, ceiling);

  state.hunger = clamp(state.hunger - NEEDS.hunger.drainPerMinute / 60 * dt, 0, NEEDS.hunger.max);
  state.thirst = clamp(state.thirst - NEEDS.thirst.drainPerMinute / 60 * dt * (activity.running ? NEEDS.thirst.runningMultiplier : 1), 0, NEEDS.thirst.max);
  state.drunk = clamp(state.drunk - NEEDS.drunk.soberPerMinute / 60 * dt, 0, NEEDS.drunk.max);

  if (activity.running) {
    state.stamina = clamp(state.stamina - NEEDS.stamina.runDrainPerSecond * staminaCost(state) * dt, 0, NEEDS.stamina.max);
    state.restAt = now + NEEDS.stamina.regenDelaySeconds * 1000;
    if (state.stamina <= 0 && !state.exhausted) { state.exhausted = true; events.push({ type: 'exhausted' }); }
  } else if (now >= state.restAt) {
    state.stamina = clamp(state.stamina + NEEDS.stamina.regenPerSecond * staminaRecovery(state) * dt, 0, NEEDS.stamina.max);
  }
  if (state.exhausted && state.stamina >= NEEDS.stamina.exhaustedUntil) state.exhausted = false;

  if (state.thirst <= 0 && state.condition !== 'fainted' && now >= state.dehydrationGraceUntil)
    state.hp = clamp(state.hp - NEEDS.thirst.damagePerSecond * dt, 0, ceiling);

  // Conditions: one transition per tick, each with its own timer; nothing restarts while it runs.
  if (state.condition === 'fainted') {
    if (now >= state.conditionUntil) {
      if (state.faintCause === 'hp') state.hp = Math.max(state.hp, Math.min(NEEDS.hp.recoverTo, ceiling));
      if (state.faintCause === 'alcohol') state.drunk = Math.min(state.drunk, NEEDS.drunk.soberAfterFaintTo);
      state.dehydrationGraceUntil = now + NEEDS.thirst.graceAfterWakingSeconds * 1000;
      state.condition = 'recovering'; state.conditionUntil = now + NEEDS.faint.recoveringSeconds * 1000;
      events.push({ type: 'woke' });
    }
  } else if (state.hp <= 0 || drunkStage(state.drunk) >= 4) {
    const cause: FaintCause = state.hp <= 0 ? 'hp' : 'alcohol';
    state.condition = 'fainted'; state.faintCause = cause; state.faints++;
    state.conditionUntil = now + (cause === 'alcohol' ? NEEDS.faint.alcoholSeconds : NEEDS.faint.seconds) * 1000;
    state.exhausted = false;
    events.push({ type: 'faint', cause });
  } else if (state.condition === 'recovering' || state.condition === 'stumbling') {
    if (now >= state.conditionUntil) { events.push({ type: state.condition === 'recovering' ? 'recovered' : 'steady' }); state.condition = 'normal'; state.conditionUntil = 0; }
  } else if (activity.moving && drunkStage(state.drunk) >= 3 && now >= state.nextStumbleAt && random() < NEEDS.drunk.stumbleChancePerSecond * dt) {
    state.condition = 'stumbling'; state.conditionUntil = now + NEEDS.drunk.stumbleSeconds * 1000;
    state.nextStumbleAt = now + NEEDS.drunk.stumbleCooldownSeconds * 1000;
    events.push({ type: 'stumble' });
  }
  return events;
}
