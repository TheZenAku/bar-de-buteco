import { CONSUMABLES, applyConsumable, canRun, createNeeds, damage, maxHp, relieve, tickNeeds, NEEDS, type NeedsEvent, type NeedsState } from '@bar/shared';
import type { Player } from '../state.js';

/**
 * What the needs system asks of an inventory. There is no inventory yet: the bar plugs NO_INVENTORY in,
 * and the future inventory implements this interface (and calls BarRoom.consume for food and drinks).
 */
export interface InventoryPort {
  /** Items that may be lost when the character faints (e.g. not quest or bound items). */
  eligibleItems(playerId: string): readonly string[];
  /** Removes one item; returns whether it was removed. */
  remove(playerId: string, itemId: string): boolean;
}
export const NO_INVENTORY: InventoryPort = { eligibleItems: () => [], remove: () => false };

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
  relieve(player: Player, now: number, portion = 1): void { relieve(this.state(player.id, now), portion); this.sync(player, now); }
  damage(player: Player, amount: number, now: number): void { damage(this.state(player.id, now), amount, now); this.sync(player, now); }

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
      thirst: whole(state.thirst), bladder: whole(state.bladder), drunk: whole(state.drunk), exhausted: state.exhausted,
      condition: state.condition, conditionUntil: state.conditionUntil, faintCause: state.condition === 'fainted' ? state.faintCause ?? '' : '' };
    for (const [key, value] of Object.entries(values)) if ((player as unknown as Record<string, unknown>)[key] !== value) (player as unknown as Record<string, unknown>)[key] = value;
  }
}
