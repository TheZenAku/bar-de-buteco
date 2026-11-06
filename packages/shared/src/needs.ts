import {ITEM_CATALOG} from './inventory.js';

/**
 * Character needs: HP, stamina, hunger, thirst, bladder and drunkenness. Pure, time-based rules shared by
 * the authoritative server (which owns the values) and the client (which predicts running and sway).
 *
 * HP, stamina, hunger and thirst are each two things: the ring (the level, `hp`, `stamina`...) and the core behind it
 * (`hpCore`...). The ring is what is felt and it is refilled from the core, which is spent as it does; eating fills the core
 * immediately when consumption starts. Damage past an empty ring takes the core. Only the heart (HP) kills: its ring and core both at zero is death.
 * Every tunable number lives in NEEDS; nothing below hard-codes balance.
 */
export const NEEDS = {
  hp: {
    max: 100,
    /** The ring's HP on coming back from a death. */
    recoverTo: 35,
    /** The heart's own reserve is low: a notice. */
    alertAt: 25,
  },
  /** The cores: where they start, how fast each ring is refilled from its core, and how many core points a ring point costs. */
  cores: {
    start: 100,
    hp: { refillPerSecond: 1.5, cost: 1 },
    /** Rested stamina is cheap: a full bar costs 5 core points. With an empty core it comes back at this share of the pace. */
    stamina: { refillPerSecond: 12, cost: .05, emptyShare: .2 },
    hunger: { refillPerSecond: 3, cost: 1 },
    thirst: { refillPerSecond: 3, cost: 1 },
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
    /** 100 is fed, 0 is starving. The ring loses this much and takes it from the core: a full core lasts forty minutes. */
    max: 100,
    drainPerMinute: 100 / 40,
    alertAt: 30,
    /** Ring and core both empty: HP is lost at this pace (points per second), never in a burst. */
    damagePerSecond: .25,
  },
  thirst: {
    /** 100 is hydrated, 0 is dehydrated. A full core lasts twenty-five minutes (half that running). */
    max: 100,
    drainPerMinute: 100 / 25,
    runningMultiplier: 2,
    alertAt: 30,
    /** Ring and core both empty: HP is lost at this pace, never in a burst. */
    damagePerSecond: .35,
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
    /**
     * From `fromStage`, finishing an alcoholic drink makes the character sick with this chance (at most once per
     * cooldown). Being sick takes a little of the alcohol out, and some water with it.
     */
    vomit: { fromStage: 3, chance: .4, cooldownSeconds: 120, drunkRelief: 10, thirst: -8 },
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
  /** The reserves behind hp, stamina, hunger and thirst. Consumables change them immediately. */
  hpCore: number; staminaCore: number; hungerCore: number; thirstCore: number;
  /** HP and its core ran out: the death was reported once (the room clears it with `revive`). */
  dead: boolean;
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
  /** No new sickness before this time (ms). */
  nextVomitAt: number;
  dehydrationGraceUntil: number;
}
export type CoreKey = 'hp' | 'stamina' | 'hunger' | 'thirst';
export const CORE_KEYS: readonly CoreKey[] = ['hp', 'stamina', 'hunger', 'thirst'];
export type NeedsEvent =
  | { type: 'died' }
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
  /** Stamina for the stamina core. */
  stamina?: number;
  /** HP for the heart's core immediately; the core then refills the ring. */
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
  const core = NEEDS.cores.start;
  return { hp: NEEDS.hp.max, stamina: NEEDS.stamina.max, hunger: NEEDS.hunger.max, thirst: NEEDS.thirst.max, bladder: 0, drunk: 0,
    hpCore: core, staminaCore: core, hungerCore: core, thirstCore: core, dead: false,
    bonuses: [], exhausted: false, restAt: now, condition: 'normal', conditionUntil: 0, faints: 0, nextStumbleAt: 0, nextVomitAt: 0, dehydrationGraceUntil: 0 };
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

/** Lowers HP (damage of any kind): the ring first, what is left past it takes the heart's core. Death is decided by the next tick. */
export function damage(state: NeedsState, amount: number, now: number): void {
  if (!(amount > 0)) return;
  const ring = clamp(state.hp, 0, maxHp(state, now)), taken = Math.min(ring, amount);
  state.hp = ring - taken;
  state.hpCore = clamp(state.hpCore - (amount - taken), 0, NEEDS.cores.start);
}
/** HP, ring and heart, to zero: the death the administration sends. The next tick reports it (unless `dead` is already set). */
export function killNeeds(state: NeedsState): void {
  state.hp = 0; state.hpCore = 0;
}
/** Back from a death: the ring at `NEEDS.hp.recoverTo` and an empty heart. */
export function reviveNeeds(state: NeedsState): void {
  state.dead = false; state.hp = NEEDS.hp.recoverTo; state.hpCore = 0;
  state.condition = 'normal'; state.conditionUntil = 0;
}

/**
 * Applies food or drink effects immediately. `portion` (0–1) scales the dose. Returns false when the
 * character cannot consume now (fainted or stumbling). The only place consumables change needs.
 */
export function applyConsumable(state: NeedsState, effects: ConsumableEffects, now: number, portion = 1): boolean {
  if (!isConscious(state)) return false;
  const part = clamp(portion, 0, 1), amount = (value?: number) => Number.isFinite(value) ? value! : 0;
  // All gains and losses reach the reserves together, without waiting for the animation or a later tick.
  const feed = (key: CoreKey, value: number) => {
    state[`${key}Core` as const] = clamp(state[`${key}Core` as const] + value * part, 0, NEEDS.cores.start);
  };
  feed('hunger', amount(effects.hunger)); feed('thirst', amount(effects.thirst)); feed('stamina', amount(effects.stamina)); feed('hp', amount(effects.hp));
  state.bladder = clamp(state.bladder + amount(effects.bladder) * part, 0, NEEDS.bladder.max);
  // Alcohol hits harder on an empty stomach (hunger is measured before this item's own food value).
  const sensitivity = 1 + NEEDS.drunk.hungerSensitivity * (1 - clamp(state.hunger, 0, NEEDS.hunger.max) / NEEDS.hunger.max);
  state.drunk = clamp(state.drunk + amount(effects.drunk) * part * sensitivity, 0, NEEDS.drunk.max);
  if (effects.maxHp && amount(effects.maxHp.amount) > 0 && amount(effects.maxHp.seconds) > 0 && part > 0)
    state.bonuses.push({ source: effects.name, amount: effects.maxHp.amount * part, until: now + effects.maxHp.seconds * 1000 });
  return true;
}
/**
 * Whether finishing `effects` (a drink) makes the character sick now (NEEDS.drunk.vomit), applying what being sick does.
 * `random` is injected as in tickNeeds.
 */
export function sickAfterDrink(state: NeedsState, effects: ConsumableEffects, now: number, random: () => number = Math.random): boolean {
  const rule = NEEDS.drunk.vomit;
  if (!((effects.drunk ?? 0) > 0) || !isConscious(state) || drunkStage(state.drunk) < rule.fromStage || now < state.nextVomitAt || random() >= rule.chance) return false;
  state.nextVomitAt = now + rule.cooldownSeconds * 1000;
  state.drunk = clamp(state.drunk - rule.drunkRelief, 0, NEEDS.drunk.max);
  state.thirstCore = clamp(state.thirstCore + rule.thirst, 0, NEEDS.cores.start);
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

  // Each ring is refilled from its core, spending it. `room` is how much the ring can take at most this tick.
  const refill = (key: CoreKey, ring: number, max: number, pace: number): number => {
    const rule = NEEDS.cores[key], core = `${key}Core` as const, got = Math.min(Math.max(0, max - ring), pace * dt, state[core] / rule.cost);
    state[core] -= got * rule.cost;
    return ring + got;
  };
  state.hunger = refill('hunger', clamp(state.hunger - NEEDS.hunger.drainPerMinute / 60 * dt, 0, NEEDS.hunger.max), NEEDS.hunger.max, NEEDS.cores.hunger.refillPerSecond);
  state.thirst = refill('thirst', clamp(state.thirst - NEEDS.thirst.drainPerMinute / 60 * dt * (activity.running ? NEEDS.thirst.runningMultiplier : 1), 0, NEEDS.thirst.max), NEEDS.thirst.max, NEEDS.cores.thirst.refillPerSecond);
  state.drunk = clamp(state.drunk - NEEDS.drunk.soberPerMinute / 60 * dt, 0, NEEDS.drunk.max);
  state.hp = refill('hp', state.hp, ceiling, NEEDS.cores.hp.refillPerSecond);

  if (activity.running) {
    state.stamina = clamp(state.stamina - NEEDS.stamina.runDrainPerSecond * staminaCost(state) * dt, 0, NEEDS.stamina.max);
    state.restAt = now + NEEDS.stamina.regenDelaySeconds * 1000;
    if (state.stamina <= 0 && !state.exhausted) { state.exhausted = true; events.push({ type: 'exhausted' }); }
  } else if (now >= state.restAt) {
    // Rested from the core; with the core empty, only a slow trickle (never stuck for good).
    const pace = NEEDS.stamina.regenPerSecond * staminaRecovery(state), before = state.staminaCore;
    state.stamina = refill('stamina', state.stamina, NEEDS.stamina.max, pace);
    const missing = pace * dt - (before - state.staminaCore) / NEEDS.cores.stamina.cost;
    if (missing > 1e-9) state.stamina = clamp(state.stamina + missing * NEEDS.cores.stamina.emptyShare, 0, NEEDS.stamina.max);
  }
  if (state.exhausted && state.stamina >= NEEDS.stamina.exhaustedUntil) state.exhausted = false;

  // No ring and no core of hunger or thirst: the body pays with HP (the heart's ring, then its core).
  if (state.condition !== 'fainted') {
    if (state.thirst <= 0 && state.thirstCore <= 0 && now >= state.dehydrationGraceUntil) damage(state, NEEDS.thirst.damagePerSecond * dt, now);
    if (state.hunger <= 0 && state.hungerCore <= 0 && now >= state.dehydrationGraceUntil) damage(state, NEEDS.hunger.damagePerSecond * dt, now);
  }
  if (!state.dead && state.hp <= 0 && state.hpCore <= 0) { state.dead = true; events.push({ type: 'died' }); return events; }

  // Conditions: one transition per tick, each with its own timer; nothing restarts while it runs.
  if (state.condition === 'fainted') {
    if (now >= state.conditionUntil) {
      if (state.faintCause === 'alcohol') state.drunk = Math.min(state.drunk, NEEDS.drunk.soberAfterFaintTo);
      state.dehydrationGraceUntil = now + NEEDS.thirst.graceAfterWakingSeconds * 1000;
      state.condition = 'recovering'; state.conditionUntil = now + NEEDS.faint.recoveringSeconds * 1000;
      events.push({ type: 'woke' });
    }
  } else if (drunkStage(state.drunk) >= 4) {
    const cause: FaintCause = 'alcohol';
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
