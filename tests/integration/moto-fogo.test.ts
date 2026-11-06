import assert from 'node:assert/strict';
import test from 'node:test';
import {FOGO_DEFAULT_COLOR,DEFAULT_CAR_COLOR,defaultVehicleColor,MOTO,MOTO_FOGO,MOTO_FOGO_MODEL,MOTO_FOGO_NAME,NEW_MOTO_PARTS,VEHICLE_MODELS,isCar,isFogo,motoFits,motoSpawnSchema,motoSpawnSpot,priceEntries,readDriveParts,stepMoto,vehicleName,vehiclePhoto,vehiclePhysics,vehiclePriceKey,type MotoBody} from '@bar/shared';

test('the Caveira em Chamas is in the catalogue and rides like a motorcycle', () => {
  assert.ok(VEHICLE_MODELS.includes(MOTO_FOGO_MODEL));
  assert.equal(vehicleName(MOTO_FOGO_MODEL),MOTO_FOGO_NAME);
  assert.equal(vehiclePhoto(MOTO_FOGO_MODEL),'moto/foto-fogo.webp');
  assert.equal(vehiclePriceKey(MOTO_FOGO_MODEL),'vehicle:moto-fogo');
  assert.equal(defaultVehicleColor(MOTO_FOGO_MODEL),FOGO_DEFAULT_COLOR,'a new Caveira keeps its original red');assert.equal(defaultVehicleColor('carro-hatch'),DEFAULT_CAR_COLOR);
  assert.equal(vehiclePriceKey('moto-delivery'),'vehicle:moto');
  assert.equal(vehiclePriceKey('carro-hatch'),'vehicle:carro');
  assert.ok(isFogo({model:MOTO_FOGO_MODEL}));assert.ok(!isFogo({model:'moto-delivery'}));assert.ok(!isCar({model:MOTO_FOGO_MODEL}));
  assert.equal(vehiclePhysics(MOTO_FOGO_MODEL),MOTO_FOGO);assert.equal(MOTO_FOGO.WHEEL_RADIUS,.297);assert.equal(MOTO_FOGO.WHEELBASE,1.5128);
  assert.equal(MOTO_FOGO.TOP_SPEED,MOTO.TOP_SPEED,'same engine as the delivery bike');assert.equal(vehiclePhysics('moto-delivery'),MOTO);
  assert.equal(motoSpawnSchema.parse({model:MOTO_FOGO_MODEL}).model,MOTO_FOGO_MODEL);
  assert.throws(()=>motoSpawnSchema.parse({model:'inexistente'}));
  assert.ok(priceEntries().some(price=>price.key==='vehicle:moto-fogo'&&price.defaultValue>0),'the price is editable in the administration');
  assert.ok(Object.keys(readDriveParts({model:MOTO_FOGO_MODEL,parts:NEW_MOTO_PARTS})).length>0,'it wears like any motorcycle');
});

test('the Caveira em Chamas accelerates and parks on the street like the delivery bike', () => {
  const near={x:-13.25,y:.15,z:-8.3},spot=motoSpawnSpot(near,Math.PI/2,[],[],MOTO_FOGO_MODEL);
  assert.ok(spot);assert.ok(motoFits(spot.x,spot.z,spot.yaw,spot.y,MOTO_FOGO_MODEL));
  let body:MotoBody={model:MOTO_FOGO_MODEL,x:spot.x,y:spot.y,z:spot.z,yaw:spot.yaw,pitch:0,speed:0,steer:0};
  const start=body.x;
  for(let i=0;i<30;i++)body=stepMoto(body,{throttle:1,steer:0,brake:false});
  assert.equal(body.model,MOTO_FOGO_MODEL);assert.ok(body.speed>0&&Math.abs(body.x-start)+Math.abs(body.z-spot.z)>1);
});
