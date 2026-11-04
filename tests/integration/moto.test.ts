import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTO,MAP_COLLIDERS,canMountMoto,floorHeight,isWalkable,motoDismountSpot,motoSpawnSpot,motoSteerAngle,nearestFreeMoto,parkedMoto,roadHeight,solidColliders,stepMoto,type MotoBody,type MotoIntent} from '@bar/shared';

/** The kerb in front of the bar, between the street lamp and the silver car. */
const spot={id:'moto-1',x:13.6,y:0,z:3.85,yaw:-Math.PI/2};
const ride=(start:MotoBody,intent:Partial<MotoIntent>,ticks:number,each?:(body:MotoBody)=>void)=>{
  let body=start;
  for(let i=0;i<ticks;i++){body=stepMoto(body,{throttle:0,steer:0,brake:false,...intent});each?.(body);}
  return body;
};
const at=(x:number,z:number,yaw:number,y=0):MotoBody=>({x,y,z,yaw,pitch:0,speed:0,steer:0});
/** The hull's corners over a solid, by the same box the step uses. */
function hullInSolid(body:MotoBody):string|undefined {
  const s=Math.sin(body.yaw),c=Math.cos(body.yaw);
  for(let along=-1;along<=1;along+=.25)for(let side=-1;side<=1;side+=.5){
    const lx=side*MOTO.HALF_WIDTH,lz=MOTO.CENTRE_Z+along*MOTO.HALF_LENGTH,x=body.x+c*lx+s*lz,z=body.z-s*lx+c*lz;
    const solid=solidColliders().find(b=>!b.ramp&&(b.maxY??Infinity)>body.y+.26&&(b.minY??-Infinity)<body.y+MOTO.HEIGHT&&Math.abs(x-b.x)<b.hx-.005&&Math.abs(z-b.z)<b.hz-.005);
    if(solid)return solid.id;
  }
}

test('a bike spawns on the free street nearest the administrator, pointing the same way when it fits',()=>{
  const near={x:16,y:0,z:3.85},found=motoSpawnSpot(near,-Math.PI/2,[])!;
  assert.ok(found,'A street right there');
  assert.equal(found.yaw,-Math.PI/2);
  assert.ok(Math.hypot(found.x-near.x,found.z-near.z)<4,`Near: ${found.x},${found.z}`);
  assert.ok(found.x<near.x,'Ahead of the administrator');
  const body:MotoBody={...found,speed:0,steer:0};
  assert.equal(hullInSolid(body),undefined);
  assert.ok(stepMoto(body,{throttle:1,steer:0,brake:false}).speed>0);
  // Never on another bike.
  const second=motoSpawnSpot(near,-Math.PI/2,[found])!;
  assert.ok(Math.hypot(second.x-found.x,second.z-found.z)>=MOTO.HALF_LENGTH*2);
  // From inside the bar and from the terrace: the street outside, on the street's own height.
  for(const inside of [{x:10,y:.3,z:-6},{x:6,y:3.4,z:-8}]){
    const out=motoSpawnSpot(inside,0,[])!;
    assert.ok(out,`A street from ${inside.x},${inside.z}`);
    assert.notEqual(roadHeight(out.x,out.z,out.y+.2),undefined,`On a street from above, at ${out.x},${out.z}`);
    assert.ok(Math.abs(floorHeight(out.x,out.z,out.y+.2)!-out.y)<.1,`The street is the top floor there, at ${out.x},${out.z}`);
    assert.equal(hullInSolid({...out,speed:0,steer:0}),undefined);
    assert.ok(out.y<.3,`On the street: y ${out.y}`);
  }
  // Out of the world, nothing to spawn on.
  assert.equal(motoSpawnSpot({x:2000,y:0,z:2000},0,[]),undefined);
});

test('the parked spot is free, on the street, and it is reached from the pavement in front of the bar',()=>{
  const parked=parkedMoto(spot);
  assert.equal(hullInSolid(parked),undefined);
  assert.equal(stepMoto(parked,{throttle:0,steer:0,brake:false}).speed,0);
  assert.ok(canMountMoto(parked,{x:spot.x,y:.15,z:2.7}));
  assert.ok(!canMountMoto(parked,{x:spot.x,y:.15,z:1.6}),'From the spawn it takes a few steps');
  assert.ok(!canMountMoto({...parked,riderId:'someone'},{x:spot.x,y:0,z:spot.z+.8}),'Nobody gets on a ridden bike');
  assert.equal(nearestFreeMoto({x:spot.x,y:0,z:spot.z+.8},[parked])?.id,spot.id);
});

test('throttle moves it where its nose points, at a scooter\'s speed, and it stops',()=>{
  const start=at(0,7,Math.PI/2);
  const going=ride(start,{throttle:1},20);
  assert.ok(going.x>start.x+1&&Math.abs(going.z-start.z)<1e-9,'Heading +X, it goes +X');
  assert.ok(going.speed>0);
  const flat=ride(at(-110,7,Math.PI/2),{throttle:1},300);
  assert.ok(flat.speed*3.6>50&&flat.speed*3.6<60,`Top speed ${flat.speed*3.6} km/h`);
  const fast=ride(start,{throttle:1},100),coasting=ride(fast,{},20),braked=ride(fast,{throttle:-1},20),held=ride(fast,{brake:true},20);
  assert.ok(coasting.speed<fast.speed&&coasting.speed>0);
  assert.ok(braked.speed<coasting.speed*.4,'S brakes');
  assert.ok(held.speed<coasting.speed*.6,'Space brakes');
  const stopped=ride(fast,{throttle:-1},200);
  assert.ok(stopped.speed<0&&stopped.speed>=-MOTO.REVERSE_SPEED,'S held past a stop is reverse');
  const back=ride(at(0,7,Math.PI/2),{throttle:-1},60);
  assert.ok(back.x<0&&back.speed<0,'Reverse goes backwards');
  assert.ok(ride(fast,{brake:true},200).speed===0,'The handbrake holds it still, no reverse');
});

test('steering right turns it right, tighter when slow, and the rear wheel follows',()=>{
  // Facing +Z, the rider's right is −X (their left is +X): yaw goes down.
  const start={...at(30,7,0),speed:8};
  const turned=ride(start,{steer:1,throttle:.3},15);
  assert.ok(turned.yaw<-.2&&turned.x<start.x,`Yaw ${turned.yaw}, x ${turned.x}`);
  assert.ok(turned.steer>.9);
  const left=ride(start,{steer:-1,throttle:.3},15);
  assert.ok(left.yaw>.2&&left.x>start.x);
  const firstSteer=ride(start,{steer:1},1).steer;
  assert.ok(firstSteer>0&&firstSteer<.3,'Responsive steering still ramps rather than snapping to full lock');
  assert.ok(motoSteerAngle(1)>motoSteerAngle(15));
  assert.ok(Math.abs(ride(left,{},20).steer)<1e-9,'It comes back by itself');
  // In reverse the nose goes the other way.
  const reversing=ride({...at(30,7,0),speed:-2},{steer:1},10);
  assert.ok(reversing.yaw>0);
  assert.equal(ride(at(30,7,0),{steer:1},10).yaw,0,'At rest the handlebar turns but the bike does not');
});

test('it stops at solids instead of crossing them, flat out and on every tick',()=>{
  const car=MAP_COLLIDERS.find(c=>c.id==='COL_Ext_Arquibancada')!;
  // Head on into the grandstand, the only long solid with a clear run-up now the parked cars are gone.
  const start=at(car.x-car.hx-10,car.z,Math.PI/2);
  let hit=false;
  const end=ride(start,{throttle:1},200,body=>{
    assert.equal(hullInSolid(body),undefined,`Inside a solid at ${body.x},${body.z}`);
    if(body.speed<=0)hit=true;
  });
  assert.ok(hit,'It was stopped');
  assert.ok(end.x<car.x-car.hx,`Still in front of the car, at ${end.x}`);
  // A wall at an angle: it slides along it, slower, and does not cross.
  const wall=MAP_COLLIDERS.find(c=>c.id==='COL_Viz_Loja.014')!;
  const slid=ride({...at(wall.x-wall.hx-3,8,.7),speed:10},{throttle:1},120,body=>assert.equal(hullInSolid(body),undefined));
  assert.ok(slid.z<wall.z+wall.hz||slid.x<wall.x-wall.hx,'Never through the shop');
  // Every direction into the pavement's posts and cars from the bar's front: never inside anything.
  for(let i=0;i<16;i++)ride({...at(14,7,i/16*Math.PI*2),speed:15},{throttle:1,steer:i%3-1},120,body=>assert.equal(hullInSolid(body),undefined,`Heading ${i}`));
});

test('it climbs the kerb, keeps to streets and pavements, and never goes into the bar',()=>{
  // Up from the street onto the pavement, at the entrance gap in the veranda's rail.
  const up=ride(at(7,6,Math.PI),{throttle:.6},120,body=>{
    assert.ok(body.y>=0&&body.y<=.16);
    assert.ok(body.z-MOTO.HALF_LENGTH-.05>-.1,`Off the veranda: z ${body.z}`);
  });
  assert.ok(Math.abs(up.y-.15)<.001,`On the pavement at ${up.y}`);
  // The slope between the axles while one wheel is up.
  let tilted=0;
  ride(at(7,6,Math.PI),{throttle:.4},60,body=>{tilted=Math.max(tilted,Math.abs(body.pitch));});
  assert.ok(tilted>.05&&tilted<.2);
});

test('the same inputs give the same bike, as the prediction needs',()=>{
  const inputs=Array.from({length:200},(_,i)=>({throttle:i%50<40?1:-1,steer:Math.sin(i/9),brake:i%70===0}));
  const run=()=>inputs.reduce((body,input)=>stepMoto(body,input),parkedMoto(spot) as MotoBody);
  assert.deepEqual(run(),run());
});

test('the rider gets off on the bike\'s left when there is room, and always on a walkable spot',()=>{
  const parked=parkedMoto(spot),off=motoDismountSpot(parked);
  const s=Math.sin(parked.yaw),c=Math.cos(parked.yaw),left=(off.x-parked.x)*c-(off.z-parked.z)*s;
  assert.ok(left>.9,`Left of the bike (+X local): ${left}`);
  assert.ok(isWalkable(off.x,off.z,off.y));
  // Against the silver car: the other side.
  const car=MAP_COLLIDERS.find(c=>c.id==='COL_Ext_Arquibancada')!;
  const beside=motoDismountSpot({...parked,x:car.x,z:car.z+car.hz+.5});
  assert.ok(isWalkable(beside.x,beside.z,beside.y));
});
