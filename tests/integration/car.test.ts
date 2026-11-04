import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR,CAR_MODEL,CAR_PARTS,MOTO_ENGINE,PLAYER_RADIUS,NEW_CAR_PARTS,NEW_MOTO_PARTS,boxContains,canMountMoto,carDriveParts,isRidingMoto,motoDistance,motoDismountSpot,motoFits,motoHandling,motoObstacle,motoSpawnSpot,movePlayer,parkedMoto,passengerInteraction,readCarParts,stepMoto,vehicleFuelUse,vehiclePowered,vehicleOccupants,vehiclePhysics,wearCarParts,writeCarParts,type MotoBody} from '@bar/shared';
const body=(x=0,z=7,yaw=Math.PI/2):MotoBody=>({model:CAR_MODEL,x,y:0,z,yaw,pitch:0,speed:0,steer:0});
test('the car uses its authored footprint and four wheels, keeps deterministic motion and turns to the right',()=>{
  assert.equal(vehiclePhysics(CAR_MODEL).HALF_LENGTH,1.8);assert.equal(CAR.WHEELBASE,2.314);
  const start=body(),input={throttle:1,steer:0,brake:false};let a=start,b=start;
  for(let i=0;i<30;i++){a=stepMoto(a,input);b=stepMoto(b,input);}assert.deepEqual(a,b);assert.ok(a.x>start.x+3);assert.equal(a.model,CAR_MODEL);
  const right=stepMoto({...body(),speed:5},{throttle:0,steer:1,brake:false});assert.ok(right.yaw<start.yaw);
  const obstacle=motoObstacle({id:'car',...start});assert.equal(obstacle.turn!.lz,1.8);assert.equal(obstacle.turn!.lx,.76);
  assert.equal(motoFits(14,-6,0,.3,CAR_MODEL),undefined,'never spawns inside the bar');
});
test('garage spawns clear the car-sized hull, other cars and all four passengers exit on walkable sides',()=>{
  const near={x:-13.25,y:.15,z:-8.3},spot=motoSpawnSpot(near,Math.PI/2,[],[],CAR_MODEL)!;assert.ok(spot);
  assert.ok(motoFits(spot.x,spot.z,spot.yaw,spot.y,CAR_MODEL));
  const second=motoSpawnSpot(near,Math.PI/2,[{...spot,model:CAR_MODEL}],[],CAR_MODEL)!;assert.ok(second);assert.ok(Math.hypot(spot.x-second.x,spot.z-second.z)>3.9);
  for(let seat=0;seat<4;seat++){const exit=motoDismountSpot({...body(),...spot},seat);assert.ok(Math.hypot(exit.x-spot.x,exit.z-spot.z)>1);}
});
test('four seats are real capacity; moving, locked or full cars reject boarding',()=>{
  const car={...parkedMoto({id:'hatch',...body()}),model:CAR_MODEL,parts:NEW_CAR_PARTS,passengers:['','','']};
  const near={x:car.x,y:car.y,z:car.z+1};assert.ok(canMountMoto(car,near));
  car.riderId='driver';car.passengers=['a','b',''];assert.ok(canMountMoto(car,near));car.passengers[2]='c';assert.ok(!canMountMoto(car,near));assert.equal(vehicleOccupants(car).filter(Boolean).length,4);
  car.passengers[2]='';car.speed=2;assert.ok(!canMountMoto(car,near));car.speed=0;car.locked=true;car.ownerId='owner';assert.ok(!canMountMoto(car,near,0,'other'));assert.ok(canMountMoto(car,near,0,'owner'));
  assert.ok(isRidingMoto(passengerInteraction('hatch',2)));
});
test('each of 18 car parts survives serialization and four tyres affect the drivetrain independently',()=>{
  assert.equal(CAR_PARTS.length,18);const parts=readCarParts(NEW_CAR_PARTS);assert.equal(writeCarParts(parts),NEW_CAR_PARTS);
  const healthy=motoHandling({id:'car',model:CAR_MODEL,parts:NEW_CAR_PARTS});
  for(const id of ['pneu_de','pneu_dd','pneu_te','pneu_td']){const damaged=writeCarParts({...parts,[id]:0}),drive=carDriveParts(damaged),handling=motoHandling({id:'car',model:CAR_MODEL,parts:damaged});assert.ok(handling.rolling>healthy.rolling);assert.equal(id.startsWith('pneu_d')?drive.pneu_dianteiro:drive.pneu_traseiro,0);}
  const broken=wearCarParts(NEW_CAR_PARTS,28,'front',()=>.5),hit=readCarParts(broken);assert.ok(hit.motor!<100&&hit.farol!<100&&hit.capo!<100);assert.ok(hit.pneu_de!<hit.pneu_te!);
  assert.equal(NEW_MOTO_PARTS.split(',').length,12,'the motorcycle keeps its own contract');
});
test('walking and running collide with rotated cars and motorcycles at every substep, without blocking an exit from a trapped hull',()=>{
  for(const model of [CAR_MODEL,'moto-delivery'])for(const yaw of [0,Math.PI/2,Math.PI/4,-Math.PI/3]){
    const car={id:'solid',...body(50,7,yaw),model},obstacle=motoObstacle(car),dx=Math.sin(yaw),dz=Math.cos(yaw);
    let player={x:car.x-dx*4,y:car.y,z:car.z-dz*4};
    for(let i=0;i<90;i++){
      player=movePlayer(player,{dx,dz,running:true},.1,false,false,[obstacle]);
      assert.ok(!boxContains(obstacle,player.x,player.z,PLAYER_RADIUS-1e-6),`${model} yaw ${yaw}: player entered vehicle`);
    }
    if(yaw===0||yaw===Math.PI/2)assert.ok((player.x-car.x)*dx+(player.z-car.z)*dz<0,'cannot cross the hull');
    let trapped={x:car.x,y:car.y,z:car.z};
    for(let i=0;i<30;i++)trapped=movePlayer(trapped,{dx:0,dz:1,running:false},.05,false,false,[obstacle]);
    assert.ok(motoDistance(car,trapped)>PLAYER_RADIUS,'someone already overlapped can leave');
    const upstairs=movePlayer({x:50,y:5,z:7},{dx:0,dz:0,running:false},.05,false,false,[obstacle]);
    assert.equal(upstairs.y,5,'a vehicle below does not alter another floor');
  }
});
test('fuel consumption follows tank capacity, motion and engine power state',()=>{
  const idle=vehicleFuelUse(CAR_MODEL,0,false,1),driving=vehicleFuelUse(CAR_MODEL,20,true,1);
  assert.ok(idle>0&&driving>idle);assert.ok(vehicleFuelUse('moto-delivery',20,true,1)>0);
  assert.equal(vehicleFuelUse(CAR_MODEL,20,true,0),0);
  assert.equal(vehiclePowered({engine:MOTO_ENGINE.OFF,ignition:true}),false);
  assert.equal(vehiclePowered({engine:MOTO_ENGINE.CRANKING,ignition:true}),false);
  assert.equal(vehiclePowered({engine:MOTO_ENGINE.ON,ignition:false}),false);
  assert.equal(vehiclePowered({engine:MOTO_ENGINE.ON,ignition:true}),true);
});
