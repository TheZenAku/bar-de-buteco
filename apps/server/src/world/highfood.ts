import { randomUUID } from 'node:crypto';
import { DELIVERY_SPOTS, HIGHFOOD, HIGHFOOD_LINES, HIGHFOOD_RESTAURANTS, cityZone, deliveryPay, fillLine, gpsRoute, ratingWait, type CustomerProfile, type DeliverySpot, type HighfoodOrderView, type HighfoodState, type HighfoodStatus, type Position, type PriceTable } from '@bar/shared';

/** An order as the room knows it: what the app sees and what it does not need to. */
export interface FoodOrder extends HighfoodOrderView { profile: CustomerProfile; spot: DeliverySpot; acceptedAt: number; unloadEndsAt?: number }
export interface Shift { userId: string; status: HighfoodStatus; since: number; nextAt?: number; offer?: FoodOrder; order?: FoodOrder; ignored: number; done: number; earned: number; rating: number | null }
export type DeskEvent =
  | { kind: 'changed'; userId: string }
  /** The offer ran out unanswered; `offline`: too many in a row, and the shift ended. */
  | { kind: 'missed'; userId: string; offline: boolean }
  | { kind: 'gave-up'; userId: string; order: FoodOrder };

const view = (order: FoodOrder): HighfoodOrderView => { const { profile: _profile, spot: _spot, acceptedAt: _at, unloadEndsAt: _ends, ...rest } = order; return rest; };

/**
 * The shifts of everyone on Highfood: when an order comes up, how long it waits and when a customer gives up. No sockets and
 * no money here; BarRoom tells the player, draws the customer and asks the API to pay. Only one order at a time per courier,
 * and the next one comes only some time after the last one ended.
 */
export class HighfoodDesk {
  readonly shifts = new Map<string, Shift>();
  constructor(private customers: () => readonly CustomerProfile[], private prices: () => PriceTable, private random: () => number = Math.random) {}

  private wait(shift: Shift, now: number): void {
    const span = HIGHFOOD.WAIT_MIN_MS + this.random() * (HIGHFOOD.WAIT_MAX_MS - HIGHFOOD.WAIT_MIN_MS);
    shift.status = 'waiting'; shift.since = now; shift.nextAt = now + span * ratingWait(shift.rating ?? 5); shift.offer = undefined; shift.order = undefined;
  }
  start(userId: string, rating: number | null, now: number): Shift {
    const shift: Shift = { userId, status: 'waiting', since: now, ignored: 0, done: 0, earned: 0, rating };
    this.wait(shift, now);
    this.shifts.set(userId, shift);
    return shift;
  }
  /** Ends the shift; an order under way comes back to be counted as lost. */
  stop(userId: string): FoodOrder | undefined {
    const order = this.shifts.get(userId)?.order;
    this.shifts.delete(userId);
    return order;
  }
  of(userId: string): Shift | undefined { return this.shifts.get(userId); }
  orderOf(userId: string): FoodOrder | undefined { return this.shifts.get(userId)?.order; }
  stateOf(userId: string): HighfoodState {
    const shift = this.shifts.get(userId);
    if (!shift) return { status: 'off', since: 0, done: 0, earned: 0 };
    return { status: shift.status, since: shift.since, done: shift.done, earned: shift.earned, ...(shift.nextAt ? { nextAt: shift.nextAt } : {}), ...(shift.offer ? { offer: view(shift.offer) } : {}), ...(shift.order ? { order: view(shift.order) } : {}) };
  }

  /** A random place with a customer in reach from where the courier is now, and the way there. */
  private makeOffer(shift: Shift, from: Position, now: number): FoodOrder | undefined {
    const people = this.customers();
    if (!people.length) return;
    const busy = [...this.shifts.values()].flatMap(other => [other.order, other.offer].filter(Boolean) as FoodOrder[]);
    const free = people.filter(person => !busy.some(order => order.profile.id === person.id));
    const near = DELIVERY_SPOTS.filter(spot => {
      const distance = Math.hypot(spot.x - from.x, spot.z - from.z);
      return distance >= HIGHFOOD.SPOT_MIN && distance <= HIGHFOOD.SPOT_MAX && !busy.some(order => Math.hypot(order.spot.x - spot.x, order.spot.z - spot.z) < 15);
    });
    if (!near.length) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      const spot = near[Math.floor(this.random() * near.length)]!;
      const route = gpsRoute(from, { x: spot.parkX, z: spot.parkZ });
      if (!route || route.length < HIGHFOOD.ROUTE_MIN || route.length > HIGHFOOD.ROUTE_MAX) continue;
      const pool = free.length ? free : people, profile = pool[Math.floor(this.random() * pool.length)]!;
      const restaurant = HIGHFOOD_RESTAURANTS[Math.floor(this.random() * HIGHFOOD_RESTAURANTS.length)]!;
      const items = [...restaurant.items].sort(() => this.random() - .5).slice(0, 1 + Math.floor(this.random() * 3));
      const estimate = deliveryPay(this.prices(), { length: route.length, onTime: true, crashes: 0, wornBox: false }, 0);
      return {
        id: randomUUID(), customer: { id: profile.id, name: profile.name, look: profile.look, image: profile.image }, restaurant: restaurant.name, kind: restaurant.kind, items,
        address: `${spot.street}, ${spot.number}`, neighbourhood: cityZone(spot.x, spot.z), place: spot.place, x: spot.x, y: spot.y, z: spot.z, parkX: spot.parkX, parkZ: spot.parkZ,
        length: Math.round(route.length), pay: estimate.total, expiresAt: now + HIGHFOOD.OFFER_MS, promiseAt: 0, crashes: 0, stage: 'going', profile, spot, acceptedAt: 0,
      };
    }
  }

  /** The clock: new offers, offers nobody answered, customers tired of waiting. */
  update(now: number, where: (userId: string) => Position | undefined): DeskEvent[] {
    const events: DeskEvent[] = [];
    for (const shift of this.shifts.values()) {
      if (shift.status === 'waiting' && shift.nextAt !== undefined && now >= shift.nextAt) {
        const from = where(shift.userId), offer = from && this.makeOffer(shift, from, now);
        // Nothing fits right now (off the map, say): it looks again in a moment.
        if (!offer) { shift.nextAt = now + 5000; continue; }
        shift.status = 'offer'; shift.since = now; shift.offer = offer; shift.nextAt = undefined;
        events.push({ kind: 'changed', userId: shift.userId });
      } else if (shift.status === 'offer' && shift.offer && now >= shift.offer.expiresAt) {
        shift.ignored++;
        const offline = shift.ignored >= HIGHFOOD.MAX_IGNORED;
        if (offline) this.shifts.delete(shift.userId); else this.wait(shift, now);
        events.push({ kind: 'missed', userId: shift.userId, offline });
      } else if (shift.status === 'order' && shift.order && now >= shift.order.acceptedAt + (shift.order.promiseAt - shift.order.acceptedAt) * HIGHFOOD.GIVE_UP_FACTOR) {
        const order = shift.order;
        this.wait(shift, now);
        events.push({ kind: 'gave-up', userId: shift.userId, order });
      }
    }
    return events;
  }

  accept(userId: string, orderId: string, now: number): FoodOrder {
    const shift = this.shifts.get(userId);
    if (!shift || shift.status !== 'offer' || shift.offer?.id !== orderId) throw new Error('Esse pedido não está mais disponível.');
    const order = shift.offer;
    order.acceptedAt = now; order.promiseAt = now + HIGHFOOD.PROMISE_START_MS + order.length / HIGHFOOD.PROMISE_SPEED * 1000;
    shift.offer = undefined; shift.order = order; shift.status = 'order'; shift.since = now; shift.ignored = 0;
    return order;
  }
  decline(userId: string, orderId: string, now: number): void {
    const shift = this.shifts.get(userId);
    if (!shift || shift.status !== 'offer' || shift.offer?.id !== orderId) throw new Error('Esse pedido não está mais disponível.');
    shift.ignored = 0;
    this.wait(shift, now);
  }
  /** Gives up on the order under way; it comes back to be counted as lost. */
  cancel(userId: string, now: number): FoodOrder {
    const shift = this.shifts.get(userId), order = shift?.order;
    if (!shift || !order) throw new Error('Você não tem um pedido em andamento.');
    this.wait(shift, now);
    return order;
  }
  /** Handed over: the next order starts its wait. */
  delivered(userId: string, paid: number, stars: number, now: number): void {
    const shift = this.shifts.get(userId);
    if (!shift) return;
    shift.done++; shift.earned += paid;
    // An average that follows the latest deliveries, until the app asks the API again.
    shift.rating = shift.rating === null ? stars : shift.rating + (stars - shift.rating) * .1;
    this.wait(shift, now);
  }
  crashed(userId: string): boolean {
    const order = this.orderOf(userId);
    if (!order) return false;
    order.crashes++;
    return true;
  }
}

/** What the customer says on handing over: one of theirs, now and then a common one. */
export function customerLine(order: FoodOrder, courier: string, random: () => number = Math.random): string {
  const own = order.profile.lines, pool = own.length && random() < .85 ? own : HIGHFOOD_LINES;
  return fillLine(pool[Math.floor(random() * pool.length)]!, courier.split(/\s+/)[0] ?? courier, order.items[0] ?? 'o pedido');
}
