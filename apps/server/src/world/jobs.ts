import { randomUUID } from 'node:crypto';
import { JOBS, JOB_START_RADIUS, canInteract, jobById, stationInteractable, type JobDefinition, type JobSlotsView, type JobStation, type JobTaskView, type Position } from '@bar/shared';

interface Task { station: JobStation; index: number; requestId: string; deadline: number; startedAt?: number }
export interface Shift { jobId: string; playerId: string; shiftId: string; startedAt: number; endsAt: number; task: Task; tasks: number; earned: number }
export interface Payment { playerId: string; jobId: string; reason: string; requestId: string; amount: number; attempts: number }
export type JobEvent =
  | { type: 'paid'; playerId: string; payment: Payment }
  | { type: 'ended'; playerId: string; reason: string };
interface Settings { enabled: boolean; pay: number; slots: number }

/**
 * Jobs with a few slots each: a shift hands out one station at a time, the player holds the action there
 * for its duration and is paid per finished task (the API caps job pay per day). Idle workers lose the
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

  shift(playerId: string): Shift | undefined { return this.shifts.get(playerId); }
  workers(jobId: string): Shift[] { return [...this.shifts.values()].filter(s => s.jobId === jobId); }

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
    const shift: Shift = { jobId, playerId, shiftId: randomUUID(), startedAt: now, endsAt: now + job.shiftMaxMs, task: this.nextTask(job, now), tasks: 0, earned: 0 };
    this.shifts.set(playerId, shift);
    return shift;
  }

  /** Ends a shift (the player quit, left, fainted or was removed by an administrator). */
  stop(playerId: string, now: number): Shift | undefined {
    const shift = this.shifts.get(playerId);
    if (!shift) return;
    this.shifts.delete(playerId);
    this.cooldowns.set(playerId, now + jobById(shift.jobId)!.cooldownMs);
    return shift;
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
  interrupt(playerId: string): void { const task = this.shifts.get(playerId)?.task; if (task) task.startedAt = undefined; }

  tick(now: number): JobEvent[] {
    const events: JobEvent[] = [];
    for (const shift of [...this.shifts.values()]) {
      const job = jobById(shift.jobId)!, task = shift.task;
      if (task.startedAt !== undefined && now >= task.startedAt + task.station.durationMs) {
        const pay = this.settings.get(job.id)!.pay;
        const payment: Payment = { playerId: shift.playerId, jobId: job.id, reason: `job:${job.id}:${shift.shiftId}:${task.index}`, requestId: task.requestId, amount: pay, attempts: 0 };
        shift.tasks++; shift.task = this.nextTask(job, now, task.station.id, task.index + 1);
        const total = this.totals.get(job.id) ?? { tasks: 0, paid: 0 }; total.tasks++; this.totals.set(job.id, total);
        events.push({ type: 'paid', playerId: shift.playerId, payment });
        if (now >= shift.endsAt) { this.stop(shift.playerId, now); events.push({ type: 'ended', playerId: shift.playerId, reason: 'Fim do turno. Bom trabalho! Descanse um pouco antes do próximo.' }); }
      } else if (task.startedAt === undefined && now >= task.deadline) {
        this.stop(shift.playerId, now); events.push({ type: 'ended', playerId: shift.playerId, reason: 'Você ficou parado e perdeu o turno.' });
      } else if (task.startedAt === undefined && now >= shift.endsAt) {
        this.stop(shift.playerId, now); events.push({ type: 'ended', playerId: shift.playerId, reason: 'Fim do turno. Bom trabalho!' });
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
    const { station, deadline, startedAt } = shift.task;
    return { jobId: shift.jobId, stationId: station.id, label: station.label, action: station.action, durationMs: station.durationMs, deadline, startedAt, earned: shift.earned, tasks: shift.tasks, shiftEndsAt: shift.endsAt };
  }
  slots(): JobSlotsView[] {
    return JOBS.map(job => { const s = this.settings.get(job.id)!; return { id: job.id, name: job.name, slots: s.slots, workers: this.workers(job.id).length, pay: s.pay, enabled: s.enabled }; });
  }
  /** Administration: open/close a job, change its pay or slots. Workers above a reduced slot count keep their shift. */
  configure(jobId: string, patch: Partial<Settings>): void {
    const s = this.settings.get(jobId); if (!s) throw new Error('Emprego desconhecido.');
    if (patch.pay !== undefined) s.pay = Math.max(0, Math.min(100, Math.round(patch.pay)));
    if (patch.slots !== undefined) s.slots = Math.max(0, Math.min(16, Math.round(patch.slots)));
    if (patch.enabled !== undefined) s.enabled = patch.enabled;
  }

  private nextTask(job: JobDefinition, now: number, previous?: string, index = 0): Task {
    const options = job.stations.filter(s => s.id !== previous);
    const station = options[Math.floor(Math.random() * options.length)]!;
    return { station, index, requestId: randomUUID(), deadline: now + job.taskTimeoutMs };
  }
}
