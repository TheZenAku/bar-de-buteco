import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import map from '../../packages/shared/src/map-data.json';
import {findSpawn,isWalkable,movePlayer,distance,nearestInteraction,canInteract,cameraFraction,BLACKJACK_TABLE,INTERACTABLES,MAP_MARKERS,type Interactable,type Position} from '@bar/shared';

// Walks straight to each waypoint with the authoritative movement, like a player holding a key.
function walk(start:Position,waypoints:readonly (readonly [number,number])[]):Position {
  let position=start;
  for(const [x,z] of waypoints){
    for(let i=0;i<400;i++){
      const dx=x-position.x,dz=z-position.z,d=Math.hypot(dx,dz);
      if(d<.025)break;
      const next=movePlayer(position,{dx:dx/d,dz:dz/d,running:false},Math.min(.05,d/3.5));
      assert.ok(Math.abs((next.y??0)-(position.y??0))<.27,'No instantaneous floor jump');
      position=next;
    }
    assert.ok(Math.hypot(x-position.x,z-position.z)<.03,`Stuck before ${x},${z} at ${JSON.stringify(position)}`);
  }
  return position;
}
// Routes used by the browser test: from the pavement through the veranda's east opening, along the counter
// aisle, up both stair flights to the upstairs games hall.
const TO_UPSTAIRS=[[14.8,1],[14.8,-2.6],[15.3,-4.6],[15.3,-10.9],[14,-10.9],[14,-14.3],[15.85,-14.3],[15.85,-11.2],[15.85,-9]] as const;

test('published map and collision export match the supplied BarBoteco assets exactly',()=>{
  for(const [name,hash] of [['bar_boteco.glb',map.visualHash],['bar_boteco_colisao.glb',map.collisionHash]]){
    const source=readFileSync(new URL(`../../assets-bar/map/BarBoteco/export/${name}`,import.meta.url));
    const published=readFileSync(new URL(`../../apps/web/public/maps/${name}`,import.meta.url));
    assert.equal(createHash('sha256').update(published).digest('hex'),hash);
    assert.ok(source.equals(published),'Import must preserve all supplied geometry and embedded textures');
  }
  // Empty COLPORTA pivots are hierarchy; the 16 actual door leaves remain dynamic (doors.test.ts).
  assert.equal(map.colliders.length,1550);
  assert.equal(map.doors.length,16);
  assert.equal(map.tables.length,31);
  assert.equal(map.seats.length,124);
  assert.deepEqual(map.bounds,{minX:-103,maxX:135,minZ:-117,maxZ:91});
  assert.deepEqual(['Ponto_Praca','Ponto_Igreja','Ponto_Campinho','Ponto_Escola','Ponto_Onibus'].map(id=>id in map.markers),[true,true,true,true,true]);
  assert.deepEqual(map.effects.map(effect=>effect.type).sort(),['brasas','fogo','fumaca','torneira','torneira']);
  assert.ok(map.effects.every(effect=>Number.isFinite(effect.x)&&Number.isFinite(effect.y)&&Number.isFinite(effect.z)));
});

test('capacity spawn positions avoid street furniture and every authored solid',()=>{
  const positions:Position[]=[];
  for(let i=0;i<128;i++){
    const point=findSpawn(positions);
    assert.ok(isWalkable(point.x,point.z,point.y));
    assert.ok(positions.every(other=>distance(point,other)>.74));
    positions.push(point);
  }
});

test('authoritative movement climbs both stair flights and comes back down without changing floors through walls',()=>{
  let position:Position={x:14,y:.3,z:-10.9};
  for(const [x,z,y] of [[14,-14.3,1.88],[15.85,-14.3,1.88],[15.85,-11.2,3.45],[15.85,-14.3,1.88],[14,-14.3,1.88],[14,-10.9,.3]] as const){
    position=walk(position,[[x,z]]);
    assert.ok(Math.abs(position.y!-y)<.02,`Expected floor ${y} at ${x},${z}, got ${position.y}`);
  }
  assert.notEqual(nearestInteraction({x:BLACKJACK_TABLE.x,y:.3,z:BLACKJACK_TABLE.z})?.id,'blackjack-1','Cannot reach the upstairs table from the floor below');
});

test('the browser routes reach upstairs, the blackjack table, the counter, a seat and the jukebox',()=>{
  const spawn=findSpawn();
  const upstairs=walk(spawn,TO_UPSTAIRS);
  assert.ok(Math.abs(upstairs.y!-3.45)<.02);
  const atTable=walk(upstairs,[[15.85,-7.4],[16.28,-7.4]]);
  assert.equal(nearestInteraction(atTable)?.id,'blackjack-1');
  const inAisle=walk(atTable,[[15.85,-7.4],...[...TO_UPSTAIRS].reverse().slice(1,6),[15.3,-7.5]]);
  assert.equal(nearestInteraction(inAisle),undefined,'The counter is used by touching it');
  const atCounter=walk(inAisle,[[16.9,-7.5]]);
  assert.ok(Math.abs(atCounter.y!-.3)<.02);
  assert.equal(nearestInteraction(atCounter)?.id,'counter');
  assert.equal(nearestInteraction(walk(atCounter,[[14.45,-7.6]]))?.type,'seat');
  const jukebox=INTERACTABLES.find(i=>i.id==='jukebox')!;
  assert.equal(nearestInteraction(walk(atCounter,[[14.3,-9.3],[jukebox.x,jukebox.z]]))?.id,'jukebox');
});

test('objects are used only when touched and never through a wall',()=>{
  const counter=INTERACTABLES.find(i=>i.id==='counter')!;
  assert.equal(canInteract(counter,MAP_MARKERS.Ponto_Balcao),false,'The old 2 m reach is gone');
  assert.equal(canInteract(counter,{x:16.9,y:.3,z:-7.5}),true);
  // Along the short leg of the L as well.
  assert.equal(canInteract(counter,{x:20,y:.3,z:-4.1}),true);
  // A chair just across the front wall (z -3.7 to -3.5) is close enough to reach, but the wall is in between.
  const chair:Interactable={id:'test-chair',type:'seat',label:'Sentar',x:20.2,y:.3,z:-3.85,rotation:0};
  assert.equal(canInteract(chair,{x:20.2,y:.3,z:-3.16}),false);
  assert.equal(canInteract(chair,{x:20.2,y:.3,z:-4.3}),true);
});

test('the backyard stage is climbed by its steps',()=>{
  const onStage=walk({x:20.4,y:.3,z:-22.8},[[22.5,-22.8]]);
  assert.ok(Math.abs(onStage.y!-.9)<.02,`On the stage at ${onStage.y}`);
});

test('walls, ceilings and upper-floor edges stop the camera and the player',()=>{
  let position:Position={x:4.2,y:.3,z:-10};
  for(let i=0;i<100;i++)position=movePlayer(position,{dx:-1,dz:0,running:true});
  assert.ok(position.x>=4.03,'Ground-floor exterior wall must be solid');
  assert.ok(isWalkable(position.x,position.z,position.y));
  const ratio=cameraFraction({x:6,y:1.55,z:-5},{x:6,y:5,z:-2});
  assert.ok(ratio>0&&ratio<.6,'Camera must remain below the slab');
  assert.ok(cameraFraction({x:12,y:1.55,z:-1.5},{x:12,y:5,z:-1.5})<.4,'Camera must remain below the veranda ceiling');
  position={x:14,y:3.45,z:-11};
  for(let i=0;i<20;i++)position=movePlayer(position,{dx:0,dz:-1,running:true});
  assert.ok(position.y!>3,'Upper-floor guardrail must prevent falling through the stair void');
});
