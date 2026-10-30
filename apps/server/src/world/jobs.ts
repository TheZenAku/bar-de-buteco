import { randomUUID } from 'node:crypto';
import { JOBS, JOB_START_RADIUS, MAX_WORKER_ORDERS, canInteract, deliveryStation, jobById, pickupStation, stationInteractable, type JobDefinition, type JobSlotsView, type JobStation, type JobTaskKind, type JobTaskView, type Position } from '@bar/shared';
import type { TableOrder } from './waiter.js';

/** A table order a customer gave to a worker: `picked` once it is on the worker's tray. */
export interface WorkerOrder { order: TableOrder; customer: string; table: number; picked: boolean }
interface Task { station: JobStation; kind: JobTaskKind; index: number; requestId: string; deadline: number; startedAt?: number; order?: WorkerOrder }
export interface Shift { jobId: string; playerId: string; shiftId: string; startedAt: number; endsAt: number; task: Task; tasks: number; earned: number; orders: WorkerOrder[] }
export interface Payment { playerId: string; jobId: string; reason: string; requestId: string; amount: number; attempts: number }
export type JobEvent =
  | { type: 'paid'; playerId: string; payment: Payment; station: JobStation; kind: JobTaskKind; order?: WorkerOrder }
  | { type: 'ended'; playerId: string; reason: string; orders: WorkerOrder[] }
  /** The task waiting for the worker changed by itself (its table was cleared by someone else): the worker is told. */
  | { type: 'changed'; playerId: string };
interface Settings { enabled: boolean; pay: number; slots: number }
/** Which customer tables have finished items waiting (apps/server/src/world/served.ts). */
export interface DirtyTables { dirtyTables(): number[]; isDirty(table: number): boolean }

/**
 * Jobs with a few slots each: a shift hands out one station at a time, the player holds the action there
 * for its duration and is paid per finished task (the API caps job pay per day). Tables are handed out only while
 * something finished waits on them, oldest first, one worker per table. Orders customers give to a worker come
 * before anything else: picked up at the counter, then put on the customer's table. Idle workers lose the
 * shift; a shift has a maximum length and a cooldown afterwards, so a slot never stays taken by one player.
 * Payments keep their request id until the API confirms them, so a retry never pays twice.
 */
export class JobDirector {
  private shifts = new Map<string, Shift>();
  private cooldowns = new Map<string, number>();
  private settings = new Map<string, Settings>(JOBS.map(job => [job.id, { enabled: true, pay: job.pay, slots: job.slots }]));
  /** Payments the API has not confirmed yet (it was unreachable); retried by the room's maintenance. */
  readonly unpaid: Payment[] = [];
  readonly totals = new Map<string, { tasks: number; paid: number }>();

  constructor(private readonly tables: DirtyTables = { dirtyTables: () => [], isDirty: () => false }) {}

  shift(playerId: string): Shift | undefined { return this.shifts.get(playerId); }
  workers(jobId: string): Shift[] { return [...this.shifts.values()].filter(s => s.jobId === jobId); }
  get working(): number { return this.shifts.size; }

  start(playerId: string, jobId: string, position: Position, now: number): Shift {
    const job = jobById(jobId), settings = this.settings.get(jobId);
    if (!job || !settings) throw new Error('Emprego desconhecido.');
    if (!settings.enabled) throw new Error(`${job.name}: vagas fechadas pela administração.`);
    if (this.shifts.has(playerId)) throw new Error('Você já está trabalhando.');
    const cooldown = this.cooldowns.get(playerId) ?? 0;
    if (now < cooldown) throw new Error(`Descanse mais ${Math.ceil((cooldown - now) / 1000)} s antes de pegar outro turno.`);
    if (Math.hypot(position.x - job.start.x, position.z - job.start.z) > JOB_START_RADIUS || Math.abs((position.y ?? .3) - job.start.y) > .6)
      throw new Error(`Vá até o balcão para começar como ${job.name.toLowerCase()}.`);
    if (this.workers(jobId).length >= settings.slots) throw new Error(`Todas as ${settings.slots} vagas de ${job.name.toLowerCase()} estão ocupadas.`);
    const shift: Shift = { jobId, playerId, shiftId: randomUUID(), startedAt: now, endsAt: now + job.shiftMaxMs, task: undefined!, tasks: 0, earned: 0, orders: [] };
    shift.task = this.nextTask(job, shift, now);
    this.shifts.set(playerId, shift);
    return shift;
  }

  /** Ends a shift (the player quit, left, fainted or was removed by an administrator). Its orders go back to the room. */
  stop(playerId: string, now: number): Shift | undefined {
    const shift = this.shifts.get(playerId);
    if (!shift) return;
    this.shifts.delete(playerId);
    this.cooldowns.set(playerId, now + jobById(shift.jobId)!.cooldownMs);
    return shift;
  }

  /** A customer gives an order to a worker: it comes before the worker's next station (now, if not started yet). */
  take(playerId: string, order: TableOrder, customer: string, table: number, now: number): void {
    const shift = this.shifts.get(playerId);
    if (!shift) throw new Error('Essa pessoa não está mais trabalhando. Peça ao Tonico.');
    if (shift.orders.length >= MAX_WORKER_ORDERS) throw new Error('Essa pessoa já está com pedidos demais. Peça ao Tonico.');
    shift.orders.push({ order, customer, table, picked: false });
    if (shift.task.startedAt === undefined && shift.task.kind === 'station') shift.task = this.nextTask(jobById(shift.jobId)!, shift, now, shift.task.station.id, shift.task.index);
  }
  /** Who has a customer's order, and whether it is still at the counter. */
  holder(customerId: string): { shift: Shift; entry: WorkerOrder } | undefined {
    for (const shift of this.shifts.values()) { const entry = shift.orders.find(o => o.order.playerId === customerId); if (entry) return { shift, entry }; }
  }
  /** Removes a customer's order from their worker; the worker moves on to the next task when it was the current one. */
  drop(customerId: string, now: number): { shift: Shift; entry: WorkerOrder } | undefined {
    const found = this.holder(customerId);
    if (!found) return;
    const { shift, entry } = found;
    shift.orders = shift.orders.filter(o => o !== entry);
    if (shift.task.order === entry) shift.task = this.nextTask(jobById(shift.jobId)!, shift, now, undefined, shift.task.index);
    return found;
  }

  /** The worker touches the current station and begins the action. */
  begin(playerId: string, position: Position, now: number): Task {
    const shift = this.shifts.get(playerId);
    if (!shift) throw new Error('Você não está trabalhando agora.');
    if (shift.task.startedAt) throw new Error('Você já está nessa tarefa.');
    if (!canInteract(stationInteractable(shift.task.station), position, .3)) throw new Error(`Chegue perto: ${shift.task.station.label.toLowerCase()}.`);
    shift.task.startedAt = now;
    return shift.task;
  }
  /** Leaving the station before the end restarts the same task (no pay). */
  interrupt(playerId: string): Task | undefined { const task = this.shifts.get(playerId)?.task; if (task) task.startedAt = undefined; return task; }

  tick(now: number): JobEvent[] {
    const events: JobEvent[] = [];
    for (const shift of [...this.shifts.values()]) {
      const job = jobById(shift.jobId)!, task = shift.task;
      if (task.startedAt !== undefined && now >= task.startedAt + task.station.durationMs) {
        const pay = this.settings.get(job.id)!.pay;
        const payment: Payment = { playerId: shift.playerId, jobId: job.id, reason: `job:${job.id}:${shift.shiftId}:${task.index}`, requestId: task.requestId, amount: pay, attempts: 0 };
        // The order is on the tray once picked up, and off the worker's list once on the table.
        if (task.kind === 'pickup') task.order!.picked = true;
        if (task.kind === 'deliver') shift.orders = shift.orders.filter(o => o !== task.order);
        shift.tasks++; shift.task = this.nextTask(job, shift, now, task.station.id, task.index + 1);
        const total = this.totals.get(job.id) ?? { tasks: 0, paid: 0 }; total.tasks++; this.totals.set(job.id, total);
        events.push({ type: 'paid', playerId: shift.playerId, payment, station: task.station, kind: task.kind, order: task.order });
        if (now >= shift.endsAt && !shift.orders.length) { this.stop(shift.playerId, now); events.push({ type: 'ended', playerId: shift.playerId, reason: 'Fim do turno. Bom trabalho! Descanse um pouco antes do próximo.', orders: [] }); }
      } else if (task.startedAt === undefined && now >= task.deadline) {
        this.stop(shift.playerId, now); events.push({ type: 'ended', playerId: shift.playerId, reason: 'Você ficou parado e perdeu o turno.', orders: shift.orders });
      } else if (task.startedAt === undefined && now >= shift.endsAt && !shift.orders.length) {
        this.stop(shift.playerId, now); events.push({ type: 'ended', playerId: shift.playerId, reason: 'Fim do turno. Bom trabalho!', orders: [] });
      } else if (task.startedAt === undefined && task.station.table !== undefined && task.kind === 'station' && !this.tables.isDirty(task.station.table)) {
        // Somebody else collected it (or it went on its own): another task, with a fresh deadline.
        shift.task = this.nextTask(job, shift, now, task.station.id, task.index);
        events.push({ type: 'changed', playerId: shift.playerId });
      }
    }
    return events;
  }

  paid(payment: Payment, applied: number): void {
    const shift = this.shifts.get(payment.playerId); if (shift?.jobId === payment.jobId) shift.earned += applied;
    const total = this.totals.get(payment.jobId); if (total) total.paid += applied;
  }

  view(playerId: string): JobTaskView | undefined {
    const shift = this.shifts.get(playerId); if (!shift) return;
    const { station, kind, deadline, startedAt } = shift.task;
    return { jobId: shift.jobId, stationId: station.id, kind, label: station.label, action: station.action, durationMs: station.durationMs, deadline, startedAt, earned: shift.earned, tasks: shift.tasks, shiftEndsAt: shift.endsAt, station };
  }
  slots(): JobSlotsView[] {
    return JOBS.map(job => { const s = this.settings.get(job.id)!; return { id: job.id, name: job.name, slots: s.slots, workers: this.workers(job.id).length, pay: s.pay, enabled: s.enabled }; });
  }
  /** Administration: open/close a job, change its pay or slots. Workers above a reduced slot count keep their shift. */
  configure(jobId: string, patch: Partial<Settings>): void {
    const s = this.settings.get(jobId); if (!s) throw new Error('Emprego desconhecido.');
    if (patch.pay !== undefined) s.pay = Math.max(0, Math.min(1000, Math.round(patch.pay)));
    if (patch.slots !== undefined) s.slots = Math.max(0, Math.min(16, Math.round(patch.slots)));
    if (patch.enabled !== undefined) s.enabled = patch.enabled;
  }

  /**
   * The worker's next task: their first order (to pick up, or on the tray to deliver); else the table waiting longest
   * that no other worker is on; else a station other than the last one.
   */
  private nextTask(job: JobDefinition, shift: Shift, now: number, previous?: string, index = 0): Task {
    const task = (station: JobStation, kind: JobTaskKind, order?: WorkerOrder, slack = 1): Task =>
      ({ station, kind, order, index, requestId: randomUUID(), deadline: now + job.taskTimeoutMs * slack });
    const order = shift.orders[0];
    if (order) {
      // Walking an order to the far tables takes longer than a station.
      if (!order.picked) return task(pickupStation(order.customer), 'pickup', order, 1.5);
      const station = deliveryStation(order.table, order.customer, order.order.items.length);
      if (station) return task(station, 'deliver', order, 1.5);
    }
    const taken = new Set([...this.shifts.values()].filter(s => s !== shift).map(s => s.task.station.table));
    // The table just cleared is still listed as dirty until the room takes its leftovers away.
    taken.add(job.stations.find(s => s.id === previous)?.table);
    const table = this.tables.dirtyTables().find(t => !taken.has(t));
    const stations = job.stations;
    const dirty = table === undefined ? undefined : stations.find(s => s.table === table);
    if (dirty) return task(dirty, 'station');
    const options = stations.filter(s => s.table === undefined && s.id !== previous);
    return task(options[Math.floor(Math.random() * options.length)]!, 'station');
  }
}
