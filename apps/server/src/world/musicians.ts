import { MUSICIANS, STAGE_SPOTS, musicianPhase } from '@bar/shared';
import type { MapSchema } from '@colyseus/schema';
import { MusicianSpot } from '../state.js';

/** A show that ended: its stop clip ran out (or its player is gone) and the spot is free again. */
export interface MusicianEnd { playerId: string; spotId: string }

/**
 * Who plays at each of the stage's musicians' spots, one player per spot, and the phases of each show, synced to every
 * browser through the room state (packages/shared/src/musicians.ts). The clips' lengths in map-data time the phases.
 */
export class Musicians {
  /** When each playing spot's player lost the connection (spot id → server ms). */
  private readonly lostAt = new Map<string, number>();
  constructor(private readonly spots: MapSchema<MusicianSpot>, private readonly dropMs: number = MUSICIANS.dropMs) {
    for (const spot of STAGE_SPOTS) spots.set(spot.id, new MusicianSpot().assign({ id: spot.id }));
  }

  spotOf(playerId: string): MusicianSpot | undefined { return [...this.spots.values()].find(spot => spot.playerId === playerId); }

  /** The player takes the spot's instrument now. Refused while someone else plays there. */
  start(spotId: string, playerId: string, now: number): void {
    const spot = this.spots.get(spotId);
    if (!spot) throw new Error('Esse lugar do palco não existe.');
    if (spot.playerId) throw new Error('Esse lugar do palco já tem músico. Espere a vez.');
    if (this.spotOf(playerId)) throw new Error('Você já está tocando no palco.');
    spot.assign({ playerId, phase: 'entrando', startedAt: now, stopping: false });
  }

  /** Starts putting the instrument back: at once from the loop, else right after the start clip. False when not playing. */
  stop(playerId: string, now: number): boolean {
    const spot = this.spotOf(playerId);
    if (!spot) return false;
    this.advance(spot, now);
    if (spot.phase === 'loop') spot.assign({ phase: 'saindo', startedAt: now });
    else if (spot.phase !== 'saindo') spot.stopping = true;
    return true;
  }

  /** Frees the player's spot at once, without the stop clip (a fall, an expulsion). */
  release(playerId: string): boolean {
    const spot = this.spotOf(playerId);
    if (!spot) return false;
    this.free(spot);
    return true;
  }

  /**
   * Advances every show. `connected` tells whether a player is online (undefined once their avatar has left the bar):
   * a dropped connection stops the show after dropMs, a vanished avatar frees the spot at once.
   * Returns the shows that ended now.
   */
  update(now: number, connected: (playerId: string) => boolean | undefined): MusicianEnd[] {
    const ended: MusicianEnd[] = [];
    for (const spot of this.spots.values()) {
      if (!spot.playerId) continue;
      const online = connected(spot.playerId);
      if (online === undefined) { ended.push({ playerId: spot.playerId, spotId: spot.id }); this.free(spot); continue; }
      if (online) this.lostAt.delete(spot.id);
      else {
        const lost = this.lostAt.get(spot.id) ?? now;
        this.lostAt.set(spot.id, lost);
        if (now - lost >= this.dropMs) this.stop(spot.playerId, now);
      }
      this.advance(spot, now);
      if (spot.phase === 'fim') { ended.push({ playerId: spot.playerId, spotId: spot.id }); this.free(spot); }
    }
    return ended;
  }

  /** Who plays where, for the administration panel. */
  snapshot(): Array<{ spot: string; playerId: string; phase: string; startedAt: number }> {
    return [...this.spots.values()].map(spot => ({ spot: spot.id, playerId: spot.playerId, phase: spot.phase, startedAt: spot.startedAt }));
  }

  /** The take and start clips run into the next phase by themselves; the boundaries stay exact even with a late tick. */
  private advance(spot: MusicianSpot, now: number): void {
    const current = musicianPhase(spot as Parameters<typeof musicianPhase>[0], now);
    if (current && (current.phase !== spot.phase || current.startedAt !== spot.startedAt)) spot.assign(current);
  }

  private free(spot: MusicianSpot): void {
    this.lostAt.delete(spot.id);
    spot.assign({ playerId: '', phase: '', startedAt: 0, stopping: false });
  }
}
