import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DOORS,DOOR_LEAVES,PLAYER_RADIUS,TV_SPOTS,TV_SYSTEMS,INTERACTABLES,canInteract,doorSwing,inDoorSweep,isDoorOpen,isWalkable,leafBox,movePlayer,nearestInteraction,setDoorStates,type Position} from '@bar/shared';

function walk(start:Position,x:number,z:number):Position {
  let p=start;
  for(let i=0;i<300;i++){const dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);if(d<.02)break;p=movePlayer(p,{dx:dx/d,dz:dz/d,running:false},Math.min(.05,d/3.5));}
  return p;
}
const reset=()=>setDoorStates(DOORS.map(d=>[d.id,true] as const));

test('every door leaf turns about its exported hinge between the closed and the authored open heading',()=>{
  const glb=readFileSync(new URL('../../apps/web/public/maps/bar_boteco.glb',import.meta.url)),json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
  const nodes=json.nodes.filter((n:any)=>n.extras?.porta);
  assert.equal(DOOR_LEAVES.length,16);assert.equal(nodes.length,16);
  assert.equal(DOORS.length,15,'The backyard corridor door has two leaves');
  assert.deepEqual(DOORS.find(d=>d.id==='Porta_Quintal_Corredor')!.leaves.map(l=>l.id),['Porta_Quintal_Corredor_E','Porta_Quintal_Corredor_D']);
  for(const leaf of DOOR_LEAVES){
    const node=nodes.find((n:any)=>n.name===leaf.id);
    assert.deepEqual([leaf.x,leaf.y,leaf.z].map(v=>+v.toFixed(4)),node.translation.map((v:number)=>+v.toFixed(4)),`${leaf.id}: hinge is the node origin`);
    assert.equal(leaf.closedYaw,node.extras.angulo_fechada_graus);
    assert.ok(Math.abs(Math.abs(doorSwing(leaf))-95)<1e-4,`${leaf.id}: swings 95° as built in 04_predio.py`);
    // Closed, the leaf lies along a wall axis and keeps the dimensions authored in the exported mesh.
    const closed=leafBox(leaf,leaf.closedYaw);
    assert.ok(Math.abs(Math.max(closed.hx,closed.hz)-(leaf.max[0]!-leaf.min[0]!)/2)<1e-6
      &&Math.abs(Math.min(closed.hx,closed.hz)-(leaf.max[2]!-leaf.min[2]!)/2)<1e-6,`${leaf.id}: closed leaf box`);
  }
});

test('a closed door blocks its doorway, an open one lets people through, and each door is independent',()=>{
  reset();
  const hall={x:5.45,y:.3,z:-10.95},inside={x:5.45,z:-12.15};
  assert.ok(isWalkable(inside.x,inside.z,.3),'The men\'s room floor behind the door');
  const through=walk(hall,inside.x,inside.z);
  assert.ok(Math.hypot(through.x-inside.x,through.z-inside.z)<.05,'Open door: walks into the room');
  setDoorStates([['Porta_WC_Masc',false]]);
  assert.equal(isDoorOpen('Porta_WC_Masc'),false);
  const blocked=walk(hall,inside.x,inside.z);
  assert.ok(blocked.z>-11.575+PLAYER_RADIUS-.01,`Closed door stops at the leaf, got z ${blocked.z}`);
  assert.equal(isDoorOpen('Porta_WC_Fem'),true,'Closing one door leaves the others alone');
  const ladies=walk({x:9.25,y:.3,z:-10.95},9.25,-12.15);
  assert.ok(ladies.z<-12.1,'The next door still lets people through');
  setDoorStates([['Porta_WC_Masc',true]]);
  assert.ok(walk(hall,inside.x,inside.z).z<-12.1,'Opened again: passable');
  reset();
});

test('every open door can be crossed both ways, even off-centre: the body turns sideways in the doorway',()=>{
  reset();
  const push=(start:Position,dx:number,dz:number,n:number)=>{let p=start;for(let i=0;i<n;i++)p=movePlayer(p,{dx,dz,running:false});return p;};
  let crossings=0;
  for(const door of DOORS){
    const yaw=door.leaves[0]!.closedYaw*Math.PI/180,nx=Math.sin(yaw),nz=Math.cos(yaw),ux=Math.cos(yaw),uz=-Math.sin(yaw);
    for(const side of [1,-1]){
      const start={x:door.x+nx*.9*side+ux*.15,y:door.y,z:door.z+nz*.9*side+uz*.15};
      if(!isWalkable(start.x,start.z,start.y))continue; // furniture right by the door on this side
      const inside=push(start,-nx*side,-nz*side,12);
      assert.ok(((inside.x-door.x)*nx+(inside.z-door.z)*nz)*side<-.3,`${door.id}: enters from side ${side}`);
      const back=push(inside,nx*side,nz*side,12);
      assert.ok(((back.x-door.x)*nx+(back.z-door.z)*nz)*side>.3,`${door.id}: comes back out`);
      crossings++;
    }
  }
  assert.ok(crossings>=DOORS.length*2-3,`${crossings} crossings`);
  // Closed, the same push stops at the leaf.
  setDoorStates([['Porta_WC_Masc',false]]);
  assert.ok(push({x:5.3,y:.3,z:-10.95},0,-1,40).z>-11.2);
  reset();
});

test('doors never swing through a body and are used by touching them from either side, not through walls',()=>{
  reset();
  const door=DOORS.find(d=>d.id==='Porta_WC_Masc')!;
  assert.equal(inDoorSweep(door,{x:door.x,y:.3,z:door.z},PLAYER_RADIUS),true,'Standing in the doorway');
  assert.equal(inDoorSweep(door,{x:door.x,y:.3,z:door.z+2},PLAYER_RADIUS),false);
  assert.equal(inDoorSweep(door,{x:door.x,y:3.45,z:door.z},PLAYER_RADIUS),false,'The door upstairs is another floor');
  const object=INTERACTABLES.find(i=>i.id===door.id)!;
  assert.equal(object.type,'door');
  assert.equal(canInteract(object,{x:5.45,y:.3,z:-11.15}),true,'From the hall');
  assert.equal(canInteract(object,{x:5.45,y:.3,z:-12.0}),true,'From inside the room');
  assert.equal(canInteract(object,{x:5.45,y:.3,z:-10.2}),false,'Too far');
  assert.equal(canInteract(object,{x:5.45,y:3.45,z:-11.15}),false,'Not from the floor above');
});

test('each TV is used from a free spot on the floor in front of its own screen',()=>{
  const screens=TV_SYSTEMS.flatMap(system=>system.screens.map(screen=>({screen,system:system.id})));
  // Four TVs plus the stage screen, used from the sound desk in front of the stage.
  assert.equal(screens.length,5);
  for(const {screen,system} of screens){
    const spot=TV_SPOTS[screen]!,object=INTERACTABLES.find(i=>i.id===screen)!;
    assert.equal(object.type,'television');assert.equal(object.media,system,`${screen}: controls its group`);
    assert.ok(isWalkable(spot.x,spot.z,spot.y),`${screen}: spot is walkable`);
    assert.equal(nearestInteraction(spot)?.id,screen,`${screen}: the nearest object from its spot`);
  }
  assert.equal(nearestInteraction(TV_SPOTS['tv-hall']!)?.type,'television');
});
