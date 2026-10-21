import { randomInt } from 'node:crypto';

export type EventKind = 'blackout' | 'troublemaker' | 'party';
export interface WorldEvent { kind: EventKind | 'none'; title: string; description: string; endsAt: number; }
const details: Record<EventKind, { title: string; description: string; weight: number }> = {
  blackout: { title: 'Quem apagou a luz?', description: 'O disjuntor caiu. Fique perto de alguém e espere a luz voltar.', weight: 3 },
  troublemaker: { title: 'Lá vem o Tonico', description: 'Tonico quer contar a mesma história para todo mundo. Dê uma volta com ele!', weight: 4 },
  party: { title: 'É festa no buteco!', description: 'Aumenta o som! Aperte G para entrar na dança.', weight: 3 },
};

/** Single global event. Card games are deliberately independent from this clock. */
export class EventDirector {
  current: WorldEvent = { kind: 'none', title: '', description: '', endsAt: 0 };
  nextAt: number;
  private previous: EventKind | undefined;
  constructor(private readonly intervalMin = 300_000, private readonly intervalMax = 600_000, now = Date.now()) {
    this.nextAt = now + this.interval();
  }
  update(now: number, occupancy: number): boolean {
    if (this.current.kind !== 'none') {
      if (now < this.current.endsAt) return false;
      this.stop(now);
      return true;
    }
    if (occupancy < 1 || now < this.nextAt) return false;
    const pool = (Object.keys(details) as EventKind[]).filter(k => k !== this.previous).flatMap(k => Array<EventKind>(details[k].weight).fill(k));
    this.start(pool[randomInt(pool.length)]!, now);
    return true;
  }
  start(kind: EventKind, now = Date.now()): void {
    if (this.current.kind !== 'none') throw new Error('Já existe um evento ativo. Encerre-o primeiro.');
    if (!Object.hasOwn(details, kind)) throw new Error('Evento inválido.');
    this.previous = kind;
    this.current = { kind, title: details[kind].title, description: details[kind].description, endsAt: now + randomInt(30_000, 90_001) };
  }
  stop(now = Date.now()): void {
    this.current = { kind: 'none', title: '', description: '', endsAt: 0 };
    this.nextAt = now + this.interval();
  }
  private interval(): number { return randomInt(this.intervalMin, this.intervalMax + 1); }
}
