import { BLACKJACK_TABLE, movePlayer, type Position } from '@bar/shared';
import { Npc } from '../state.js';

const routes: Record<string, Position[]> = {
<<<<<<< HEAD
  // Veranda, through the hall's east doorway, down the aisle along the counter to the stairs and back.
  tonico: [{x:15.3,y:.3,z:-2.6},{x:15.3,y:.3,z:-10.9},{x:14,y:.3,z:-10.9},{x:15.3,y:.3,z:-6}],
  // Backyard, in front of the stage.
  lurdinha: [{x:20.4,y:.3,z:-19.5},{x:30.6,y:.3,z:-19.5},{x:30.6,y:.3,z:-20.9},{x:20.4,y:.3,z:-20.9}],
};
export function createNpcs(): Npc[] {
  return [
    // Behind the L-shaped counter, facing the customers at Ponto_Balcao. Orders are run by BarService.
    new Npc().assign({ id: 'bartender', displayName: 'Seu Zé · bartender', color: '#efe0b5', x:18.6,y:.3,z:-7.5,rotation:-Math.PI/2,behavior:'idle' }),
    new Npc().assign({ id: 'tonico', displayName: 'Tonico', color: '#b75c46', ...routes.tonico[0] }),
    new Npc().assign({ id: 'lurdinha', displayName: 'Dona Lurdinha', color: '#709e98', ...routes.lurdinha[0] }),
    new Npc().assign({ id: 'dealer', displayName: 'Dealer', color: '#efe0b5', x: BLACKJACK_TABLE.x,y:BLACKJACK_TABLE.y,z:BLACKJACK_TABLE.z-0.95,behavior:'dealer' }),
=======
  // Straight legs between waypoints clear the tables, counter and blackjack table.
  tonico: [{ x: -0.8, z: 0.4 }, { x: 1.6, z: -1.8 }, { x: 5.6, z: -1.6 }, { x: 2.2, z: 0.6 }, { x: 0.8, z: 4.2 }],
  lurdinha: [{ x: -8.8, z: 3 }, { x: -8.8, z: -1.8 }, { x: -1.6, z: -1.8 }, { x: -1.6, z: 4 }],
};
export function createNpcs(): Npc[] {
  return [
    new Npc().assign({ id: 'bartender', displayName: 'Seu Zé · bartender', color: '#efe0b5', x: -6, z: -5.6, behavior: 'serving' }),
    new Npc().assign({ id: 'tonico', displayName: 'Tonico', color: '#b75c46', x: -0.8, z: 0.4 }),
    new Npc().assign({ id: 'lurdinha', displayName: 'Dona Lurdinha', color: '#709e98', x: -8.8, z: 3 }),
>>>>>>> 980e69a1f1f3166d1ad9aaacfccb84c5a3b52ec1
  ];
}
export class NpcDirector {
  private targets = new Map<string, number>();
  private pauses = new Map<string, number>();
  update(npcs: Iterable<Npc>, players: Iterable<Position>, event: string, now: number): void {
    const people = [...players];
    for (const npc of npcs) {
      if (npc.id === 'dealer') continue; // Table animation is controlled by the blackjack phase.
      if (npc.behavior === 'serving') continue; // Seu Zé finishes an order whatever happens.
      if (event === 'DRUNK_NPC' && npc.id === 'tonico' && npc.animationState === 'fallen') continue;
      if (event === 'PARTY') { npc.animationState = 'dance'; npc.behavior = 'reacting'; continue; }
      if (event === 'BLACKOUT') { npc.animationState = 'idle'; npc.behavior = 'reacting'; continue; }
      if (npc.id === 'bartender') { npc.animationState = 'idle'; npc.behavior = 'idle'; continue; }
      const route = routes[npc.id]!;
      const index = this.targets.get(npc.id) || 0;
      let target = route[index % route.length]!;
      const nearbyPeople=people.filter(p=>Math.abs((p.y??0)-npc.y)<.6);
      const approaching = event === 'DRUNK_NPC' && npc.id === 'tonico' && nearbyPeople.length > 0;
      if (approaching) target = nearbyPeople.reduce((a,b)=>Math.hypot(a.x-npc.x,a.z-npc.z)<Math.hypot(b.x-npc.x,b.z-npc.z)?a:b);
      const dx = target.x - npc.x, dz = target.z - npc.z, d = Math.hypot(dx, dz);
      if (d < (approaching ? 1.5 : 0.3)) {
        npc.animationState = approaching ? 'fallen' : 'idle'; npc.behavior = approaching ? 'interacting' : 'idle';
        if (approaching) npc.animationStartedAt = now;
        if (!approaching) {
          if (!this.pauses.has(npc.id)) this.pauses.set(npc.id, now + 4000);
          else if (now >= this.pauses.get(npc.id)!) { this.targets.set(npc.id, index + 1); this.pauses.delete(npc.id); }
        }
        continue;
      }
      const position = movePlayer(npc, { dx: dx / d * 0.32, dz: dz / d * 0.32, running: false });
      if (position.x === npc.x && position.z === npc.z && !approaching) this.targets.set(npc.id, index + 1);
      npc.x = position.x; npc.y = position.y!; npc.z = position.z; npc.rotation = Math.atan2(dx, dz);
      npc.animationState = 'walk'; npc.behavior = approaching ? 'reacting' : 'walking';
    }
  }
}
