import { movePlayer, type Position } from '@bar/shared';
import { Npc } from '../state.js';

const routes: Record<string, Position[]> = {
  // Straight legs between waypoints clear the tables, counter and blackjack table.
  tonico: [{ x: -0.8, z: 0.4 }, { x: 1.6, z: -1.8 }, { x: 5.6, z: -1.6 }, { x: 2.2, z: 0.6 }, { x: 0.8, z: 4.2 }],
  lurdinha: [{ x: -8.8, z: 3 }, { x: -8.8, z: -1.8 }, { x: -1.6, z: -1.8 }, { x: -1.6, z: 4 }],
};
export function createNpcs(): Npc[] {
  return [
    new Npc().assign({ id: 'bartender', displayName: 'Seu Zé · bartender', color: '#efe0b5', x: -6, z: -5.6, behavior: 'serving' }),
    new Npc().assign({ id: 'tonico', displayName: 'Tonico', color: '#b75c46', x: -0.8, z: 0.4 }),
    new Npc().assign({ id: 'lurdinha', displayName: 'Dona Lurdinha', color: '#709e98', x: -8.8, z: 3 }),
  ];
}
export class NpcDirector {
  private targets = new Map<string, number>();
  private pauses = new Map<string, number>();
  update(npcs: Iterable<Npc>, players: Iterable<Position>, event: string, now: number): void {
    const people = [...players];
    for (const npc of npcs) {
      if (event === 'PARTY') { npc.animationState = 'dance'; npc.behavior = 'reacting'; continue; }
      if (event === 'BLACKOUT') { npc.animationState = 'idle'; npc.behavior = 'reacting'; continue; }
      if (npc.id === 'bartender') { npc.animationState = 'idle'; npc.behavior = 'serving'; continue; }
      const route = routes[npc.id]!;
      const index = this.targets.get(npc.id) || 0;
      let target = route[index % route.length]!;
      const approaching = event === 'DRUNK_NPC' && npc.id === 'tonico' && people.length > 0;
      if (approaching) target = people.reduce((a, b) => Math.hypot(a.x - npc.x, a.z - npc.z) < Math.hypot(b.x - npc.x, b.z - npc.z) ? a : b);
      const dx = target.x - npc.x, dz = target.z - npc.z, d = Math.hypot(dx, dz);
      if (d < (approaching ? 1.5 : 0.3)) {
        npc.animationState = 'idle'; npc.behavior = approaching ? 'interacting' : 'idle';
        if (!approaching) {
          if (!this.pauses.has(npc.id)) this.pauses.set(npc.id, now + 4000);
          else if (now >= this.pauses.get(npc.id)!) { this.targets.set(npc.id, index + 1); this.pauses.delete(npc.id); }
        }
        continue;
      }
      const position = movePlayer(npc, { dx: dx / d * 0.32, dz: dz / d * 0.32, running: false });
      if (position.x === npc.x && position.z === npc.z && !approaching) this.targets.set(npc.id, index + 1);
      npc.x = position.x; npc.z = position.z; npc.rotation = Math.atan2(dx, dz);
      npc.animationState = 'walk'; npc.behavior = approaching ? 'reacting' : 'walking';
    }
  }
}
