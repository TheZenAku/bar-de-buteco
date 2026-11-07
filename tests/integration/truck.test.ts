import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR_MODEL,INVENTORY_CAPACITY,NEW_CAR_PARTS,STORAGE,TRUCK,TRUCK_MODEL,canMountMoto,carSpec,hasStorage,isCar,isCarModel,isHatch,isTruck,motoDismountSpot,motoFits,motoObstacle,motoSpawnSpot,
  motoSteerAngle,parkedMoto,seatPosition,stepMoto,storageGap,storageLoad,storageLoadOfUnits,storageMoveSchema,storageRefusal,storageStackMax,vehicleFuelUse,vehicleName,vehicleOccupants,vehiclePhysics,vehicleSeats,vehicleTank,type MotoBody} from '@bar/shared';

const body=(x=0,z=7,yaw=Math.PI/2):MotoBody=>({model:TRUCK_MODEL,x,y:0,z,yaw,pitch:0,speed:0,steer:0});

test('the truck is a four-wheeler of its own size, with two seats and its own tank',()=>{
  assert.ok(isCarModel(TRUCK_MODEL)&&isCar({model:TRUCK_MODEL})&&isTruck({model:TRUCK_MODEL})&&!isHatch({model:TRUCK_MODEL}));
  assert.ok(isHatch({model:CAR_MODEL})&&!isTruck({model:CAR_MODEL})&&!isTruck({model:'moto-delivery'}));
  assert.equal(vehicleName(TRUCK_MODEL),'Caminhão Baú');assert.equal(carSpec(TRUCK_MODEL),TRUCK);assert.notEqual(carSpec(CAR_MODEL),TRUCK);
  assert.equal(vehiclePhysics(TRUCK_MODEL).HALF_LENGTH,TRUCK.HALF_LENGTH);assert.equal(vehiclePhysics(TRUCK_MODEL).WHEEL_TRACK,TRUCK.WHEEL_TRACK);
  assert.equal(vehiclePhysics('moto-delivery').WHEEL_TRACK,undefined);
  assert.equal(vehicleSeats(TRUCK_MODEL).length,TRUCK.SEATS);assert.equal(vehicleSeats(CAR_MODEL).length,4);
  assert.ok(vehicleTank(TRUCK_MODEL)>vehicleTank(CAR_MODEL));assert.ok(vehicleFuelUse(TRUCK_MODEL,10,true,1)*vehicleTank(TRUCK_MODEL)>vehicleFuelUse(CAR_MODEL,10,true,1)*vehicleTank(CAR_MODEL),'it drinks more litres');
  // The hull is the model's own: 2,2 m wide and 5,4 m long.
  assert.ok(TRUCK.HALF_WIDTH*2>=2.2&&TRUCK.HALF_LENGTH*2>=5.2&&TRUCK.HEIGHT>2.4);assert.ok(TRUCK.WHEELBASE>3);
});

test('it speeds up slowly, tops out near its speed, brakes in a few metres and turns in a wide circle',()=>{
  const input={throttle:1,steer:0,brake:false};
  let a=body(),b=body();for(let i=0;i<60;i++){a=stepMoto(a,input);b=stepMoto(b,input);}
  assert.deepEqual(a,b,'deterministic');assert.equal(a.model,TRUCK_MODEL);assert.ok(a.speed>3&&a.speed<9,`3 s of throttle: ${a.speed}`);
  assert.ok(Math.abs(a.x-body().x)>3,'it moved');
  // Free-running physics with no road: the top speed follows ENGINE − ROLLING = DRAG × TOP².
  const top=Math.sqrt((TRUCK.ENGINE-TRUCK.ROLLING)/TRUCK.DRAG);assert.ok(Math.abs(top-TRUCK.TOP_SPEED)<.6,`top ${top}`);
  const slower=stepMoto({...body(),speed:10},{throttle:0,steer:0,brake:true});assert.ok(slower.speed<10&&slower.speed>=0);
  // The wheel lock closes with speed, and the truck's is smaller than the hatch's at the same speed.
  assert.ok(motoSteerAngle(0,TRUCK_MODEL)>motoSteerAngle(20,TRUCK_MODEL));assert.ok(motoSteerAngle(12,TRUCK_MODEL)<motoSteerAngle(12,CAR_MODEL));
  const right=stepMoto({...body(),speed:5},{throttle:0,steer:1,brake:false});assert.ok(right.yaw<body().yaw);
  assert.ok(Number.isFinite(right.x)&&Number.isFinite(right.z)&&Number.isFinite(right.yawRate??0));
  // Walking pace turning has a radius a truck can make: wheelbase / tan(lock).
  const radius=TRUCK.WHEELBASE/Math.tan(TRUCK.MAX_STEER);assert.ok(radius>4&&radius<9,`radius ${radius}`);
});

test('it fits where its hull does, parks clear of other trucks and everyone gets out on walkable sides',()=>{
  const start=body(),obstacle=motoObstacle({id:'truck',...start});assert.equal(obstacle.turn!.lz,TRUCK.HALF_LENGTH);assert.equal(obstacle.turn!.lx,TRUCK.HALF_WIDTH);
  assert.equal(motoFits(14,-6,0,.3,TRUCK_MODEL),undefined,'never spawns inside the bar');
  const near={x:-13.25,y:.15,z:-8.3},spot=motoSpawnSpot(near,Math.PI/2,[],[],TRUCK_MODEL)!;assert.ok(spot,'a street spot for a 6,6 m truck near the garage');
  assert.ok(motoFits(spot.x,spot.z,spot.yaw,spot.y,TRUCK_MODEL));
  const second=motoSpawnSpot(near,Math.PI/2,[{...spot,model:TRUCK_MODEL}],[],TRUCK_MODEL)!;assert.ok(second);assert.ok(Math.hypot(spot.x-second.x,spot.z-second.z)>TRUCK.HALF_LENGTH*2-.5);
  for(let seat=0;seat<TRUCK.SEATS;seat++){const exit=motoDismountSpot({...body(),...spot},seat);assert.ok(Math.hypot(exit.x-spot.x,exit.z-spot.z)>TRUCK.HALF_WIDTH);}
  // The seat positions sit inside the cab, driver on the left.
  const driver=seatPosition({x:0,y:0,z:0,yaw:0,model:TRUCK_MODEL},0),passenger=seatPosition({x:0,y:0,z:0,yaw:0,model:TRUCK_MODEL},1);
  assert.ok(driver.x>0&&passenger.x<0);assert.ok(Math.abs(driver.z-passenger.z)<.01);
});

test('two seats are the real capacity; moving, locked or full trucks reject boarding',()=>{
  const truck={...parkedMoto({id:'truck',...body()}),model:TRUCK_MODEL,parts:NEW_CAR_PARTS,passengers:['','','']};
  const near={x:truck.x,y:truck.y,z:truck.z+1};assert.ok(canMountMoto(truck,near));
  truck.riderId='driver';assert.ok(canMountMoto(truck,near));truck.passengers[0]='guest';assert.ok(!canMountMoto(truck,near));assert.equal(vehicleOccupants(truck).filter(Boolean).length,2);
  truck.passengers[0]='';truck.speed=2;assert.ok(!canMountMoto(truck,near));truck.speed=0;truck.locked=true;truck.ownerId='owner';assert.ok(!canMountMoto(truck,near,0,'other'));assert.ok(canMountMoto(truck,near,0,'owner'));
});

test('the hold: only at the back, only for the key holder, only while the truck is still',()=>{
  const truck={model:TRUCK_MODEL,x:50,z:7,yaw:Math.PI/2,ownerId:'owner',vehicleId:'v1'};
  /** A point in the truck's frame: +z forward, +x left (the same maths as the room's). */
  const at=(x:number,z:number)=>({x:truck.x+Math.cos(truck.yaw)*x+Math.sin(truck.yaw)*z,z:truck.z-Math.sin(truck.yaw)*x+Math.cos(truck.yaw)*z});
  const rear=TRUCK.CENTRE_Z-TRUCK.HALF_LENGTH;
  assert.ok(Math.abs(storageGap(truck,at(0,rear-1.15))-1.15)<1e-9);assert.ok(storageGap(truck,at(.5,rear-.3))<.4);
  for(const [name,point] of [['beside',at(TRUCK.HALF_WIDTH+1,0)],['in front',at(0,TRUCK.HALF_LENGTH+1)],['too far',at(0,rear-STORAGE.REACH-.5)],['off to the side',at(TRUCK.HALF_WIDTH+STORAGE.SIDE+.5,rear-1)],['inside the hull',at(0,0)]] as const)
    assert.equal(storageGap(truck,point),Infinity,name);
  assert.ok(hasStorage(TRUCK_MODEL)&&!hasStorage(CAR_MODEL)&&!hasStorage('moto-delivery')&&!hasStorage(undefined));
  const gap=storageGap(truck,at(0,rear-1.2));
  assert.equal(storageRefusal(truck,'owner',gap,0),'');
  assert.match(storageRefusal(truck,'guest',gap,0),/chave/);assert.match(storageRefusal(truck,'owner',gap,STORAGE.MAX_SPEED+.5),/parar/);
  assert.match(storageRefusal(truck,'owner',Infinity,0),/traseira/);assert.match(storageRefusal({...truck,phase:'down'},'owner',gap,0),/condições/);
  assert.match(storageRefusal({...truck,model:CAR_MODEL},'owner',gap,0),/não tem baú/);assert.match(storageRefusal({...truck,vehicleId:''},'owner',gap,0),/emplacados/);
  // Slack is what latency is given, and nothing else.
  assert.match(storageRefusal(truck,'owner',STORAGE.REACH+.2,0),/traseira/);assert.equal(storageRefusal(truck,'owner',STORAGE.REACH+.2,0,.3),'');
});

test('the hold\'s limits and moves are what the API and the room both read',()=>{
  assert.equal(STORAGE.SLOTS,24);assert.ok(STORAGE.SLOTS>INVENTORY_CAPACITY);assert.equal(storageStackMax('agua'),100);assert.equal(storageStackMax('curativo'),50);assert.equal(storageStackMax('nada'),0);
  assert.equal(storageLoadOfUnits(0),0);assert.equal(storageLoadOfUnits(1),1);assert.equal(storageLoadOfUnits(24),1);assert.equal(storageLoadOfUnits(25),2);assert.equal(storageLoadOfUnits(70),3);assert.equal(storageLoadOfUnits(5000),3);
  assert.equal(storageLoad([{itemId:'agua',quantity:20},{itemId:'cafe',quantity:5}]),2);assert.equal(storageLoad([]),0);
  const good={motoId:'moto-1',itemId:'agua',quantity:3,direction:'deposit',requestId:crypto.randomUUID()};
  assert.ok(storageMoveSchema.safeParse(good).success);
  for(const bad of [{...good,quantity:0},{...good,quantity:1.5},{...good,quantity:STORAGE.MAX_MOVE+1},{...good,itemId:'ouro'},{...good,direction:'swap'},{...good,requestId:'x'},{...good,extra:1},{motoId:'moto-1'}])
    assert.ok(!storageMoveSchema.safeParse(bad).success,JSON.stringify(bad));
});
