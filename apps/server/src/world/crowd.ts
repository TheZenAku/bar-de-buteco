import { AOI_RADIUS, CROWD, CROWD_RECORD, FULL_DETAIL_KEEP, FULL_DETAIL_MAX, writeCrowdRecord } from '@bar/shared';

/** What the planner needs to know about a player: copied out of the schema once per refresh (schema reads are slow, and the loops below read each one many times). */
export interface CrowdEntry {
  id: string; slot: number; x: number; y: number; z: number; rotation: number; skin: number;
  /** 0 idle, 1 walk, 2 run. */
  gait: number;
  /** On a bike or thrown: a model for everybody, from any distance. */
  rider: boolean;
  /** Sitting or in an activity that has no sprite: left out of the crowd. */
  noSprite: boolean;
  /** Players sharing this key (a card table, a pool table...) are models for each other whatever the distance. */
  group: string;
}

/** Cells of the grid the models are found in (a few metres: the K nearest of a packed crowd are a few cells away) and of the one the sprites are. */
const FINE = 6, COARSE = 24;
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
/** Sprites kept per cell of viewers: the message's worth, plus the models that may be among the nearest and are taken out again. */
const CELL_SPRITES = CROWD.max + FULL_DETAIL_MAX + 1;

/**
 * Who each client sees as a model and who as a sprite (shared/crowd.ts). One instance per room; `build` once per
 * refresh, then `models` / `sprites` per viewer. Two uniform grids keep the work per viewer small however many are packed
 * together: the models are found ring by ring outwards from the viewer's own cell and the search stops when the K nearest
 * are surely in hand, and the sprites are worked out once per cell of viewers and shared by everyone standing in it.
 */
export class CrowdPlanner {
  private entries: CrowdEntry[] = [];
  private fine = new Map<number, number[]>();
  private coarse = new Map<number, number[]>();
  private groups = new Map<string, number[]>();
  private records = new Uint8Array(0);
  /** Riders and thrown bodies are seen from anywhere (the bikes have no area of interest). */
  private forced: string[] = [];
  private indexOf = new Map<string, number>();
  private marked = new Uint8Array(0);
  private cells = new Map<number, Int32Array>();

  build(entries: CrowdEntry[], withRecords: boolean): void {
    this.entries = entries; this.fine.clear(); this.coarse.clear(); this.groups.clear(); this.indexOf.clear(); this.cells.clear();
    this.forced = entries.filter(entry => entry.rider).map(entry => entry.id);
    if (this.marked.length < entries.length) this.marked = new Uint8Array(entries.length);
    const put = (grid: Map<number, number[]>, k: number, index: number) => { const cell = grid.get(k); if (cell) cell.push(index); else grid.set(k, [index]); };
    entries.forEach((entry, index) => {
      this.indexOf.set(entry.id, index);
      put(this.fine, key(Math.floor(entry.x / FINE), Math.floor(entry.z / FINE)), index);
      put(this.coarse, key(Math.floor(entry.x / COARSE), Math.floor(entry.z / COARSE)), index);
      if (entry.group) { const mates = this.groups.get(entry.group); if (mates) mates.push(index); else this.groups.set(entry.group, [index]); }
    });
    if (!withRecords) return;
    if (this.records.length < entries.length * CROWD_RECORD) this.records = new Uint8Array(Math.ceil(entries.length * 1.5) * CROWD_RECORD);
    const view = new DataView(this.records.buffer);
    entries.forEach((e, i) => writeCrowdRecord(view, i * CROWD_RECORD, e.slot, e.x, e.y, e.z, e.rotation, e.skin, e.gait));
  }

  /**
   * The players this viewer holds as models: itself, the riders and the ones at its own table, then the nearest ones
   * inside the area of interest, FULL_DETAIL_MAX in all. Those already held count as nearer (FULL_DETAIL_KEEP) and may
   * stay out to a slightly larger radius, so two players trading places at the edge do not swap every refresh.
   */
  models(viewer: CrowdEntry, held: ReadonlySet<string>): Set<string> {
    const chosen = new Set<string>([viewer.id]);
    if (viewer.group) for (const index of this.groups.get(viewer.group) ?? []) chosen.add(this.entries[index]!.id);
    for (const id of this.forced) chosen.add(id);
    const room = FULL_DETAIL_MAX - chosen.size, ranked: Array<{ id: string; d: number }> = [];
    if (room > 0) {
      const reach = AOI_RADIUS * FULL_DETAIL_KEEP, rings = Math.ceil(reach / FINE), cx = Math.floor(viewer.x / FINE), cz = Math.floor(viewer.z / FINE);
      for (let r = 0; r <= rings; r++) {
        // Nothing in ring r is nearer than (r - 1) cells, and a held player counts for 1 / KEEP of its distance.
        if (ranked.length >= room && (r - 1) * FINE / FULL_DETAIL_KEEP >= ranked[ranked.length - 1]!.d) break;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cell = this.fine.get(key(cx + dx, cz + dz)); if (!cell) continue;
          for (const index of cell) {
            const other = this.entries[index]!, ax = other.x - viewer.x, az = other.z - viewer.z, raw = Math.sqrt(ax * ax + az * az);
            if (raw > reach || other === viewer) continue;
            // The best this one can do is the held rate: if even that is no better than the farthest chosen, skip the lookups.
            if (ranked.length >= room && raw / FULL_DETAIL_KEEP >= ranked[ranked.length - 1]!.d) continue;
            const d = held.has(other.id) ? raw / FULL_DETAIL_KEEP : raw;
            if (d > AOI_RADIUS || chosen.has(other.id)) continue;
            if (ranked.length >= room && d >= ranked[ranked.length - 1]!.d) continue;
            let at = ranked.length; while (at > 0 && ranked[at - 1]!.d > d) at--;
            ranked.splice(at, 0, { id: other.id, d }); if (ranked.length > room) ranked.pop();
          }
        }
      }
    }
    for (const { id } of ranked) chosen.add(id);
    return chosen;
  }

  private scratchFound = new Int32Array(0);
  private scratchBin = new Uint8Array(0);

  /** The nearest sprites to a point, as entry numbers, nearest first (whole 5 m bins, the last one cut): shared by the viewers of one cell. */
  private around(x: number, z: number): Int32Array {
    if (this.scratchFound.length < this.entries.length) { this.scratchFound = new Int32Array(this.entries.length); this.scratchBin = new Uint8Array(this.entries.length); }
    const { scratchFound: found, scratchBin: at } = this;
    const BIN = 5, bins = Math.ceil(CROWD.radius / BIN) + 1, counts = new Int32Array(bins);
    const r = Math.ceil(CROWD.radius / COARSE), cx = Math.floor(x / COARSE), cz = Math.floor(z / COARSE), limit = CROWD.radius * CROWD.radius;
    let n = 0;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const cell = this.coarse.get(key(cx + dx, cz + dz)); if (!cell) continue;
      for (const index of cell) {
        const other = this.entries[index]!; if (other.noSprite) continue;
        const ax = other.x - x, az = other.z - z, d2 = ax * ax + az * az;
        if (d2 > limit) continue;
        const b = Math.min(bins - 1, (Math.sqrt(d2) / BIN) | 0);
        found[n] = index; at[n++] = b; counts[b]!++;
      }
    }
    // Counting sort by bin, stopping where the list is full (the bin that does not fit whole is cut).
    let last = bins - 1, taken = 0;
    for (let b = 0; b < bins; b++) { if (taken + counts[b]! > CELL_SPRITES) { last = b; break; } taken += counts[b]!; }
    const start = new Int32Array(bins); let sum = 0;
    for (let b = 0; b <= last; b++) { start[b] = sum; sum += Math.min(counts[b]!, b === last ? CELL_SPRITES - taken : counts[b]!); }
    const out = new Int32Array(sum), limitLast = start[last]! + (CELL_SPRITES - taken);
    for (let i = 0; i < n; i++) {
      const b = at[i]!; if (b > last) continue;
      if (b === last && start[b]! >= limitLast) continue;
      out[start[b]!++] = found[i]!;
    }
    return out;
  }

  /**
   * The sprites for this viewer: everybody within CROWD.radius that is not a model, CROWD.max of them, nearest first, as
   * the wire records. They are worked out for the middle of the viewer's 6 m cell and shared by all who stand in it
   * (a few metres of difference does not show at the distance a sprite is drawn from).
   */
  sprites(viewer: CrowdEntry, models: ReadonlySet<string>): Uint8Array {
    const k = key(Math.floor(viewer.x / FINE), Math.floor(viewer.z / FINE));
    let candidates = this.cells.get(k);
    if (!candidates) { candidates = this.around((Math.floor(viewer.x / FINE) + .5) * FINE, (Math.floor(viewer.z / FINE) + .5) * FINE); this.cells.set(k, candidates); }
    const { marked, entries } = this;
    for (const id of models) { const at = this.indexOf.get(id); if (at !== undefined) marked[at] = 1; }
    const out = new Uint8Array(Math.min(candidates.length, CROWD.max) * CROWD_RECORD);
    let written = 0;
    for (const index of candidates) {
      if (marked[index] || entries[index] === viewer) continue;
      out.set(this.records.subarray(index * CROWD_RECORD, (index + 1) * CROWD_RECORD), written++ * CROWD_RECORD);
      if (written >= CROWD.max) break;
    }
    for (const id of models) { const at = this.indexOf.get(id); if (at !== undefined) marked[at] = 0; }
    return written * CROWD_RECORD === out.length ? out : out.slice(0, written * CROWD_RECORD);
  }
}
