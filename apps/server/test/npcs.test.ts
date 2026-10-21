import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcs, NpcDirector } from '../src/world/npcs.js';
import {isWalkable} from '@bar/shared';

test('salon and veranda patrols stay clear of the imported furniture',()=>{
  const director=new NpcDirector(),npcs=createNpcs();
  const previous=new Map<string,{x:number;z:number;stuck:number}>();
  for(let now=0;now<120000;now+=50){
    director.update(npcs,[],'',now);
    for(const npc of npcs){
      assert.ok(isWalkable(npc.x,npc.z,npc.y),`${npc.id} entered an imported solid`);
      const last=previous.get(npc.id);
      const stuck=last&&npc.animationState==='walk'&&Math.hypot(npc.x-last.x,npc.z-last.z)<.001?last.stuck+1:0;
      assert.ok(stuck<5,`${npc.id} patrol is stuck against furniture`);
      previous.set(npc.id,{x:npc.x,z:npc.z,stuck});
    }
  }
});

test('Tonico stays fallen during the drunk event and resumes afterwards; dealer follows only the table', () => {
  const director = new NpcDirector();
  const npcs = createNpcs();
  const tonico = npcs.find(npc => npc.id === 'tonico')!;
  const dealer = npcs.find(npc => npc.id === 'dealer')!;
  const people = [{ x: tonico.x + 0.5, z: tonico.z }];
  director.update(npcs, people, 'DRUNK_NPC', 1000);
  assert.equal(tonico.animationState, 'fallen');
  assert.equal(tonico.animationStartedAt, 1000);
  director.update(npcs, [{x: 9, z: 6}], 'DRUNK_NPC', 3000);
  assert.equal(tonico.animationState, 'fallen');
  assert.equal(tonico.animationStartedAt, 1000);
  director.update(npcs, people, '', 4000);
  assert.notEqual(tonico.animationState, 'fallen');
  dealer.animationState = 'deal';
  const position = {x: dealer.x, z: dealer.z};
  director.update(npcs, people, 'PARTY', 5000);
  assert.equal(dealer.animationState, 'deal');
  assert.deepEqual({x: dealer.x, z: dealer.z}, position);
});
