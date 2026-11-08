import assert from 'node:assert/strict';
import test from 'node:test';
import {CLASSICA_DEFAULT_COLOR,MOTO,MOTO_CLASSICA,MOTO_CLASSICA_MODEL,MOTO_CLASSICA_NAME,NEW_MOTO_PARTS,VEHICLE_MODELS,isCar,isClassica,isFogo,motoFits,motoSpawnSchema,motoSpawnSpot,priceEntries,readDriveParts,stepMoto,vehicleDefinition,vehicleName,vehiclePhoto,vehiclePhysics,vehiclePriceKey,type MotoBody} from '@bar/shared';

test('the Clássica Raiada is in the catalogue, paintable, and rides like a motorcycle', () => {
  assert.ok(VEHICLE_MODELS.includes(MOTO_CLASSICA_MODEL));
  assert.equal(vehicleName(MOTO_CLASSICA_MODEL),MOTO_CLASSICA_NAME);
  assert.equal(vehiclePhoto(MOTO_CLASSICA_MODEL),'moto/foto-classica.webp');
  assert.equal(vehiclePriceKey(MOTO_CLASSICA_MODEL),'vehicle:moto-classica');
  assert.equal(vehicleDefinition(MOTO_CLASSICA_MODEL)?.defaultColor,CLASSICA_DEFAULT_COLOR);assert.ok(vehicleDefinition(MOTO_CLASSICA_MODEL)?.paintable);
  assert.ok(isClassica({model:MOTO_CLASSICA_MODEL}));assert.ok(!isFogo({model:MOTO_CLASSICA_MODEL}));assert.ok(!isCar({model:MOTO_CLASSICA_MODEL}));
  assert.equal(vehiclePhysics(MOTO_CLASSICA_MODEL),MOTO_CLASSICA);assert.equal(MOTO_CLASSICA.WHEEL_RADIUS,.30);assert.equal(MOTO_CLASSICA.WHEELBASE,1.372);
  assert.equal(MOTO_CLASSICA.TOP_SPEED,MOTO.TOP_SPEED,'same engine as the delivery bike');
  assert.equal(motoSpawnSchema.parse({model:MOTO_CLASSICA_MODEL}).model,MOTO_CLASSICA_MODEL);
  assert.ok(priceEntries().some(price=>price.key==='vehicle:moto-classica'&&price.defaultValue>0),'the price is editable in the administration');
  assert.ok(Object.keys(readDriveParts({model:MOTO_CLASSICA_MODEL,parts:NEW_MOTO_PARTS})).length>0,'it wears like any motorcycle');
});

test('the Clássica Raiada accelerates and parks on the street like the delivery bike', () => {
  const near={x:-13.25,y:.15,z:-8.3},spot=motoSpawnSpot(near,Math.PI/2,[],[],MOTO_CLASSICA_MODEL);
  assert.ok(spot);assert.ok(motoFits(spot.x,spot.z,spot.yaw,spot.y,MOTO_CLASSICA_MODEL));
  let body:MotoBody={model:MOTO_CLASSICA_MODEL,x:spot.x,y:spot.y,z:spot.z,yaw:spot.yaw,pitch:0,speed:0,steer:0};
  const start=body.x;
  for(let i=0;i<30;i++)body=stepMoto(body,{throttle:1,steer:0,brake:false});
  assert.equal(body.model,MOTO_CLASSICA_MODEL);assert.ok(body.speed>0&&Math.abs(body.x-start)+Math.abs(body.z-spot.z)>1);
});
