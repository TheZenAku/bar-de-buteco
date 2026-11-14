import { CONSUMABLES, applyConsumable, canRun, createNeeds, damage, killNeeds, maxHp, relieve, reviveNeeds, sickAfterDrink, tickNeeds, NEEDS, type NeedsEvent, type NeedsState } from '@bar/shared';
import type { Player } from '../state.js';

/**
 * Small synchronous adapter retained for alternate room modes and isolated simulations. The main bar
 * persists inventory through the API because a database mutation cannot safely fit this synchronous port.
 */
export interface InventoryPort {
  /** Items that may be lost when the character faints (e.g. not quest or bound items). */
  eligibleItems(playerId: string): readonly string[];
  /** Removes one item; returns whether it was removed. */
  remove(playerId: string, itemId: string): boolean;
}
export const NO_INVENTORY: InventoryPort = { eligibleItems: () => [], remove: () => false };

/**
 * A saved needs state, checked field by field: a damaged or partial save falls back to the defaults for
 * whatever is missing. A saved death (or no HP left) is revived, as respawnAfterDeath would do.
 */
export function restoredNeeds(saved: unknown, now: number): NeedsState {
  const state = createNeeds(now), fields = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>, out = state as unknown as Record<string, unknown>;
  for (const key of Object.keys(state)) {
    const value = fields[key], fallback = out[key];
    if (key === 'bonuses') { if (Array.isArray(value)) out[key] = value.filter(b => b && typeof b.amount === 'number' && typeof b.until === 'number'); }
    else if (typeof fallback === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === typeof fallback) out[key] = value;
  }
  if (typeof fields.faintCause === 'string') state.faintCause = fields.faintCause as NeedsState['faintCause'];
  if (state.dead || state.hp <= 0) reviveNeeds(state);
  return state;
}

/**
 * Authoritative needs of every avatar in the room, kept with full precision here and mirrored to the
 * Player schema as whole points (patches only when a point changes).
 */
export class NeedsDirector {
  private states = new Map<string, NeedsState>();
  constructor(public inventory: InventoryPort = NO_INVENTORY, private random: () => number = Math.random) {}

  state(playerId: string, now = Date.now()): NeedsState {
    let state = this.states.get(playerId);
    if (!state) { state = createNeeds(now); this.states.set(playerId, state); }
    return state;
  }
  forget(playerId: string): void { this.states.delete(playerId); }
  /** Takes over a character's saved needs when it joins (restoredNeeds); the live state is the one the room keeps. */
  adopt(player: Player, state: NeedsState, now: number): void { this.states.set(player.id, state); this.sync(player, now); }
  canRun(playerId: string): boolean { return canRun(this.state(playerId)); }

  tick(player: Player, seconds: number, now: number, activity: { running: boolean; moving: boolean }): NeedsEvent[] {
    const events = tickNeeds(this.state(player.id, now), seconds, now, activity, this.random);
    this.sync(player, now);
    return events;
  }
  /** Applies a consumable from CONSUMABLES; false if unknown or the character cannot consume now. */
  consume(player: Player, itemId: string, now: number, portion = 1): boolean {
    const effects = CONSUMABLES[itemId];
    const applied = !!effects && applyConsumable(this.state(player.id, now), effects, now, portion);
    this.sync(player, now);
    return applied;
  }
  /** Whether finishing the drink `itemId` made the character sick (NEEDS.drunk.vomit); its effects apply at once. */
  sick(player: Player, itemId: string, now: number): boolean {
    const effects = CONSUMABLES[itemId], sick = !!effects && sickAfterDrink(this.state(player.id, now), effects, now, this.random);
    if (sick) this.sync(player, now);
    return sick;
  }
  relieve(player: Player, now: number, portion = 1): void { relieve(this.state(player.id, now), portion); this.sync(player, now); }
  damage(player: Player, amount: number, now: number): void { damage(this.state(player.id, now), amount, now); this.sync(player, now); }
  /** The administration's kill: HP, ring and heart, to zero. The Morte is started by the room. */
  kill(player: Player, now: number): void { const state = this.state(player.id, now); killNeeds(state); state.dead = true; this.sync(player, now); }
  /** Back from a death (the Morte's minigame won). */
  revive(player: Player, now: number): void { reviveNeeds(this.state(player.id, now)); this.sync(player, now); }

  /** One-shot administrative recovery; keep active HP bonuses and the monotonically increasing faint counter. */
  restore(player: Player, now: number): void {
    const state=this.state(player.id,now),bonuses=state.bonuses.filter(b=>b.until>now),hp=maxHp(state,now),faints=state.faints;
    Object.assign(state,createNeeds(now),{hp,bonuses,faints,faintCause:undefined});
    this.sync(player,now);
  }

  /** One roll per faint: with NEEDS.faint.itemLossChance, a random eligible item is removed. */
  loseItemOnFaint(playerId: string): string | undefined {
    if (this.random() >= NEEDS.faint.itemLossChance) return;
    const items = this.inventory.eligibleItems(playerId);
    if (!items.length) return;
    const item = items[Math.floor(this.random() * items.length)]!;
    return this.inventory.remove(playerId, item) ? item : undefined;
  }

  sync(player: Player, now: number): void {
    const state = this.state(player.id, now), whole = (value: number) => Math.round(Number.isFinite(value) ? value : 0);
    const values = { hp: whole(state.hp), hpMax: whole(maxHp(state, now)), stamina: whole(state.stamina), hunger: whole(state.hunger),
      thirst: whole(state.thirst), hpCore: whole(state.hpCore), staminaCore: whole(state.staminaCore), hungerCore: whole(state.hungerCore), thirstCore: whole(state.thirstCore), bladder: whole(state.bladder), drunk: whole(state.drunk), exhausted: state.exhausted,
      condition: state.condition, conditionUntil: state.conditionUntil, faintCause: state.condition === 'fainted' ? state.faintCause ?? '' : '' };
    for (const [key, value] of Object.entries(values)) if ((player as unknown as Record<string, unknown>)[key] !== value) (player as unknown as Record<string, unknown>)[key] = value;
  }
}
