export type AdmissionPhase = 'outside' | 'entering' | 'inside' | 'leaving';

export interface AdmissionAttempt {
  readonly generation: number;
}

export interface AdmissionDeparture {
  readonly generation: number;
}

/**
 * Serializes admission and departure without knowing anything about the UI or
 * transports. Tokens make every continuation after an await prove that it
 * still belongs to the active transition.
 */
export class AdmissionLifecycle {
  private generation = 0;
  private currentPhase: AdmissionPhase = 'outside';

  get phase(): AdmissionPhase { return this.currentPhase; }

  beginEntry(): AdmissionAttempt | undefined {
    if (this.currentPhase !== 'outside') return;
    this.currentPhase = 'entering';
    return { generation: ++this.generation };
  }

  isCurrentEntry(attempt: AdmissionAttempt): boolean {
    return this.currentPhase === 'entering' && attempt.generation === this.generation;
  }

  completeEntry(attempt: AdmissionAttempt): boolean {
    if (!this.isCurrentEntry(attempt)) return false;
    this.currentPhase = 'inside';
    return true;
  }

  beginExit(): AdmissionDeparture | undefined {
    if (this.currentPhase === 'outside' || this.currentPhase === 'leaving') return;
    this.currentPhase = 'leaving';
    return { generation: ++this.generation };
  }

  failEntry(attempt: AdmissionAttempt): AdmissionDeparture | undefined {
    if (!this.isCurrentEntry(attempt)) return;
    this.currentPhase = 'leaving';
    return { generation: ++this.generation };
  }

  completeExit(departure: AdmissionDeparture): boolean {
    if (this.currentPhase !== 'leaving' || departure.generation !== this.generation) return false;
    this.currentPhase = 'outside';
    return true;
  }
}
