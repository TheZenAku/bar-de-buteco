import assert from 'node:assert/strict';
import test from 'node:test';
import {MOTO,MOTO_SCOOTER,MOTO_SCOOTER_MODEL,MOTO_SCOOTER_NAME,NEW_MOTO_PARTS,VEHICLE_MODELS,isCar,isScooter,motoFits,motoSpawnSchema,motoSpawnSpot,priceEntries,readDriveParts,stepMoto,vehicleDefinition,vehicleName,vehicleOffers,vehiclePhoto,vehiclePhysics,vehiclePriceKey,type MotoBody} from '@bar/shared';

test('the Scooter de Entrega is in the catalogue and the shop, and rides like a motorcycle', () => {
  assert.ok(VEHICLE_MODELS.includes(MOTO_SCOOTER_MODEL));
  assert.equal(vehicleName(MOTO_SCOOTER_MODEL),MOTO_SCOOTER_NAME);
  assert.equal(vehiclePhoto(MOTO_SCOOTER_MODEL),'moto/foto-scooter.webp');
  assert.equal(vehiclePriceKey(MOTO_SCOOTER_MODEL),'vehicle:moto-scooter');
  assert.ok(!vehicleDefinition(MOTO_SCOOTER_MODEL)?.paintable,'red with the house box: not paintable');
  assert.ok(isScooter({model:MOTO_SCOOTER_MODEL}));assert.ok(!isCar({model:MOTO_SCOOTER_MODEL}));
  assert.equal(vehiclePhysics(MOTO_SCOOTER_MODEL),MOTO_SCOOTER);assert.equal(MOTO_SCOOTER.WHEEL_RADIUS,.225);assert.equal(MOTO_SCOOTER.TOP_SPEED,MOTO.TOP_SPEED);
  assert.equal(motoSpawnSchema.parse({model:MOTO_SCOOTER_MODEL}).model,MOTO_SCOOTER_MODEL);
  assert.ok(priceEntries().some(price=>price.key==='vehicle:moto-scooter'&&price.defaultValue>0),'the price is editable in the administration');
  assert.ok(vehicleOffers({}).some(offer=>offer.model===MOTO_SCOOTER_MODEL),'HighMotors sells it');
  assert.ok(Object.keys(readDriveParts({model:MOTO_SCOOTER_MODEL,parts:NEW_MOTO_PARTS})).length>0,'it wears like any motorcycle');
});

test('the Scooter de Entrega accelerates and parks on the street like the delivery bike', () => {
  const near={x:-13.25,y:.15,z:-8.3},spot=motoSpawnSpot(near,Math.PI/2,[],[],MOTO_SCOOTER_MODEL);
  assert.ok(spot);assert.ok(motoFits(spot.x,spot.z,spot.yaw,spot.y,MOTO_SCOOTER_MODEL));
  let body:MotoBody={model:MOTO_SCOOTER_MODEL,x:spot.x,y:spot.y,z:spot.z,yaw:spot.yaw,pitch:0,speed:0,steer:0};
  const start=body.x;
  for(let i=0;i<30;i++)body=stepMoto(body,{throttle:1,steer:0,brake:false});
  assert.equal(body.model,MOTO_SCOOTER_MODEL);assert.ok(body.speed>0&&Math.abs(body.x-start)+Math.abs(body.z-spot.z)>1);
});
