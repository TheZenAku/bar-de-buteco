import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import map from '../../packages/shared/src/map-data.json';
import {findSpawn,isWalkable,movePlayer,distance,nearestInteraction,canInteract,cameraFraction,onStage,BLACKJACK_TABLE,INTERACTABLES,MAP_MARKERS,STAGE,STAGE_ENTRY,TV_SPOTS,type Interactable,type Position} from '@bar/shared';
import {STAGE_SPOTS,STAGE_AREA,inStageArea,tableByNumber,musicianRole,stageSpot} from '@bar/shared';

// Walks straight to each waypoint with the authoritative movement, like a player holding a key.
function walk(start:Position,waypoints:readonly (readonly [number,number])[],stagePass=false):Position {
  let position=start;
  for(const [x,z] of waypoints){
    for(let i=0;i<400;i++){
      const dx=x-position.x,dz=z-position.z,d=Math.hypot(dx,dz);
      if(d<.025)break;
      const next=movePlayer(position,{dx:dx/d,dz:dz/d,running:false},Math.min(.05,d/3.5),false,stagePass);
      assert.ok(Math.abs((next.y??0)-(position.y??0))<.27,'No instantaneous floor jump');
      position=next;
    }
    assert.ok(Math.hypot(x-position.x,z-position.z)<.03,`Stuck before ${x},${z} at ${JSON.stringify(position)}`);
  }
  return position;
}
// Routes used by the browser test: from the pavement through the veranda's east opening, along the counter
// aisle, up both stair flights to the upstairs games hall.
const TO_UPSTAIRS=[[14.8,1],[14.8,-2.6],[15.3,-4.6],[15.3,-10.2],[14,-10.2],[14,-14.3],[15.85,-14.3],[15.85,-11.2],[15.85,-9]] as const;

test('published map and collision export match the supplied BarBoteco assets exactly',()=>{
  for(const [name,hash] of [['bar_boteco.glb',map.visualHash],['bar_boteco_colisao.glb',map.collisionHash]]){
    const source=readFileSync(new URL(`../../assets-bar/map/BarBoteco/export/${name}`,import.meta.url));
    const published=readFileSync(new URL(`../../apps/web/public/maps/${name}`,import.meta.url));
    assert.equal(createHash('sha256').update(published).digest('hex'),hash);
    assert.ok(source.equals(published),'Import must preserve all supplied geometry and embedded textures');
  }
  // Empty COLPORTA pivots are hierarchy; the 16 actual door leaves remain dynamic (doors.test.ts).
  assert.equal(map.colliders.length,1557);
  assert.equal(map.doors.length,16);
  assert.equal(map.seats.length,124);
  assert.deepEqual(map.bounds,{minX:-103,maxX:135,minZ:-117,maxZ:91});
  assert.deepEqual(['Ponto_Praca','Ponto_Igreja','Ponto_Campinho','Ponto_Escola','Ponto_Onibus'].map(id=>id in map.markers),[true,true,true,true,true]);
  assert.deepEqual(map.effects.map(effect=>effect.type).sort(),['brasas','fogo','fumaca','luz_jukebox','luz_jukebox_ponto','luz_palco','luz_palco_ponto','torneira','torneira']);
  assert.ok(map.effects.every(effect=>Number.isFinite(effect.x)&&Number.isFinite(effect.y)&&Number.isFinite(effect.z)));
});

test('every customer table keeps the number written on it in the map, and every seat knows its table',()=>{
  assert.deepEqual(map.tables.map(table=>table.number),Array.from({length:39},(_,i)=>i+1));
  const count=(area:string)=>map.tables.filter(table=>table.area===area).length;
  assert.deepEqual({salao:count('salao'),varanda:count('varanda'),quintal:count('quintal'),superior:count('superior'),terraco:count('terraco')},
    {salao:11,varanda:9,quintal:11,superior:2,terraco:6});
  assert.ok(map.tables.every(table=>table.floor===(table.y>2?1:0)&&table.top>table.y+.6&&table.top<table.y+.85));
  assert.equal(new Set(map.tables.map(table=>table.collider)).size,39,'one number per table');
  // Picnic tables (24-31) have built-in benches; every chair belongs to a numbered café table nearby.
  for(const seat of map.seats){
    const table=map.tables.find(t=>t.number===seat.table)!;
    assert.ok(table&&table.places===4&&Math.hypot(seat.x-table.x,seat.z-table.z)<.9,`${seat.id} → mesa ${seat.table}`);
  }
  assert.equal(INTERACTABLES.find(i=>i.id==='seat-1')?.label,'Sentar · mesa 1');
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

test('the backyard stage is climbed by its steps, and only with a pass',()=>{
  // 15_palco.py: the deck stands 0.6 m above the backyard and its two steps are on the west side.
  assert.deepEqual([STAGE.deck.minY,STAGE.deck.maxY,STAGE.steps.length],[.3,.9,2]);
  assert.ok(isWalkable(STAGE_ENTRY.x,STAGE_ENTRY.z,STAGE_ENTRY.y),'the foot of the steps is free floor');
  assert.equal(nearestInteraction(STAGE_ENTRY)?.id,'stage','the pass is bought at the foot of the steps');
  // Up the steps and between the left PA (COL_Palco_PA_Esq) and the sound desk (COL_Palco_Mesa_Som).
  const up=walk(STAGE_ENTRY,[[22.5,-23.1]],true);
  assert.ok(Math.abs(up.y!-.9)<.02&&onStage(up),`On the stage at ${up.y}`);
  // Without a pass the steps stop the body like a wall, from any side.
  for(const z of [-22.4,-22.8,-23.2]){
    let position:Position={x:STAGE_ENTRY.x,y:.3,z};
    for(let i=0;i<60;i++)position=movePlayer(position,{dx:1,dz:0,running:false});
    assert.ok(!onStage(position)&&Math.abs(position.y!-.3)<.02,`Kept off the stage at ${JSON.stringify(position)}`);
  }
  // Nor is the deck reached from its front or its back: it is 0.6 m above the floor.
  let position:Position={...TV_SPOTS.telao!};
  for(let i=0;i<60;i++)position=movePlayer(position,{dx:0,dz:-1,running:false},.05,false,true);
  assert.ok(!onStage(position),'The front edge is too high to climb, even with a pass');
  // A pass that runs out up there: free to move about and to come down, never back up.
  position=walk(up,[[24,-23.1]]);assert.ok(onStage(position),'Moves about the stage');
  position=walk(position,[[22.5,-23.1],[STAGE_ENTRY.x,STAGE_ENTRY.z]]);assert.ok(!onStage(position)&&Math.abs(position.y!-.3)<.02,'Comes down the steps');
  for(let i=0;i<60;i++)position=movePlayer(position,{dx:1,dz:0,running:false});
  assert.ok(!onStage(position),'and cannot go back up');
});

test('the telão is used at the stage\'s front edge, from the backyard (its blip) and from the deck; the stage\'s area is the backyard',()=>{
  const telao=INTERACTABLES.find(i=>i.id==='telao')!,blip=TV_SPOTS.telao!;
  // The blip: the middle of the front edge, on free backyard floor, where E reaches the telão first.
  assert.ok(Math.abs(blip.x-STAGE.deck.x)<.01&&Math.abs(blip.y-STAGE.deck.minY)<.01&&isWalkable(blip.x,blip.z,blip.y));
  assert.equal(nearestInteraction(blip)?.id,'telao');
  // Up on the deck (0.6 m above the backyard, exactly the reach in height) the front edge reaches it too.
  let fromDeck=0,fromBack=0;
  for(let x=STAGE.deck.x-STAGE.deck.hx;x<=STAGE.deck.x+STAGE.deck.hx;x+=.1)for(let z=STAGE.deck.z-STAGE.deck.hz;z<=STAGE.deck.z+STAGE.deck.hz;z+=.1){
    if(!isWalkable(x,z,STAGE.deck.maxY)||!canInteract(telao,{x,y:STAGE.deck.maxY,z}))continue;
    fromDeck++;if(z<STAGE.deck.z)fromBack++;
  }
  assert.ok(fromDeck>50,`the telão reached from ${fromDeck} points of the deck`);
  assert.equal(fromBack,0,'only near the front edge');
  // So are the stage's steps, as their pass says: from below and from the deck.
  assert.ok(canInteract(INTERACTABLES.find(i=>i.id==='stage')!,{x:STAGE.steps[0]!.x+STAGE.steps[0]!.hx+.35,y:STAGE.deck.maxY,z:STAGE.steps[0]!.z}));
  // The stage's area (its blips): the backyard inside the lot's walls, up to the building's back wall.
  assert.ok(STAGE_AREA.minX<=0.1&&STAGE_AREA.maxX>=31.8&&STAGE_AREA.minZ<=-25.8&&Math.abs(STAGE_AREA.maxZ+15)<.05,JSON.stringify(STAGE_AREA));
  for(const p of [STAGE_ENTRY,blip,{x:STAGE.deck.x,y:STAGE.deck.maxY,z:STAGE.deck.z},MAP_MARKERS.Ponto_Palco,MAP_MARKERS.Ponto_Churrasqueira,
    ...[21,24,31].map(n=>{const t=tableByNumber(n)!;return {x:t.x,y:.3,z:t.z};})])assert.ok(inStageArea(p),`in the backyard: ${JSON.stringify(p)}`);
  for(const p of [MAP_MARKERS.Spawn_Jogador,MAP_MARKERS.Ponto_Balcao,MAP_MARKERS.Ponto_Terraco,MAP_MARKERS.Ponto_Lounge,{x:14,y:.3,z:-9},{x:26,y:.3,z:-13},
    ...[1,12,34].map(n=>{const t=tableByNumber(n)!;return {x:t.x,y:t.y??.3,z:t.z};})])assert.ok(!inStageArea(p),`outside the backyard: ${JSON.stringify(p)}`);
});

test('the stage has four musicians\' spots, each with its four clips published, taken from the deck within reach',()=>{
  assert.deepEqual(STAGE_SPOTS.map(spot=>spot.id),['violao','cavaquinho','bateria','vocal']);
  for(const spot of STAGE_SPOTS){
    // 16_animacoes_palco.py: one GLB per spot, served as exported; the room times the phases by its clips.
    const source=readFileSync(new URL(`../../assets-bar/map/BarBoteco/export/animacoes/${spot.animation.file}`,import.meta.url));
    const published=readFileSync(new URL(`../../apps/web/public/palco/${spot.animation.file}`,import.meta.url));
    assert.ok(source.equals(published),`${spot.animation.file} is published as exported`);
    assert.equal(createHash('sha256').update(published).digest('hex').slice(0,12),spot.animation.hash);
    const glb=JSON.parse(published.subarray(20,20+published.readUInt32LE(12)).toString());
    assert.deepEqual(spot.clips.map(name=>glb.animations.some((a:{name:string})=>a.name===name)),[true,true,true,true],`${spot.id}: take, start, loop and stop clips`);
    assert.ok(spot.animation.durations.every(seconds=>seconds>1&&seconds<10),`${spot.id}: clip lengths ${spot.animation.durations}`);
    assert.equal(spot.animation.durations[2],4.8,'every loop lasts 4.8 s');
    assert.ok(onStage(spot)&&Math.abs(spot.y-STAGE.deck.maxY)<.01,`${spot.id} stands on the deck`);
    // The instrument on the map hides while the GLB's copy is in the hands (the singer's microphone stays on its stand).
    assert.equal(spot.instrument,{violao:'Palco_Violao',cavaquinho:'Palco_Cavaquinho',bateria:'Palco_Baquetas',vocal:''}[spot.id]);
    // E takes it from some free floor of the deck within reach, never from the backyard below.
    const object=INTERACTABLES.find(i=>i.id===`palco-${spot.id}`)!;
    assert.deepEqual([object.type,object.spot,object.label],['musician',spot.id,musicianRole(spot.id).label]);
    let reachable=0;
    for(let x=STAGE.deck.x-STAGE.deck.hx;x<=STAGE.deck.x+STAGE.deck.hx;x+=.1)for(let z=STAGE.deck.z-STAGE.deck.hz;z<=STAGE.deck.z+STAGE.deck.hz;z+=.1){
      const floor={x,y:STAGE.deck.maxY,z},below={x,y:.3,z:z+(STAGE.deck.hz+.5)};
      if(isWalkable(x,z,floor.y)&&canInteract(object,floor))reachable++;
      if(isWalkable(below.x,below.z,below.y))assert.equal(canInteract(object,below),false,`${spot.id} out of reach from the backyard at ${below.x},${below.z}`);
    }
    assert.ok(reachable>20,`${spot.id} reachable from ${reachable} points of the deck`);
  }
  // The drum kit's volume covers the drummer's spot: it is taken by proximity, never by standing on it.
  const drums=stageSpot('bateria')!;
  assert.equal(isWalkable(drums.x,drums.z,drums.y),false);
  // A spot in use is left out of what E reaches, so the next free one (or nothing) is offered instead.
  const near={x:drums.x-1.05,y:STAGE.deck.maxY,z:drums.z};
  assert.ok(isWalkable(near.x,near.z,near.y));
  assert.equal(nearestInteraction(near)?.id,'palco-bateria');
  assert.notEqual(nearestInteraction(near,object=>object.id!=='palco-bateria')?.id,'palco-bateria');
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
