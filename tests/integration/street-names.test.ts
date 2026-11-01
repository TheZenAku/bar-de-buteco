import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DELIVERY_SPOTS,STREET_LABELS,cityZone} from '@bar/shared';
import {REAL_STREETS,realStreet} from '../../tools/assets/street-names';

const streetsOf=(zone:string)=>new Set(Object.values(REAL_STREETS[zone]!));
const everyStreet=new Set(Object.values(REAL_STREETS).flatMap(zone=>Object.values(zone)));

test('every address and every name on the map is a street from the plans: run npm run assets:gps if not',()=>{
  for(const spot of DELIVERY_SPOTS)assert.ok(everyStreet.has(spot.street),`${spot.street} (${spot.x}, ${spot.z})`);
  for(const label of STREET_LABELS)assert.ok(everyStreet.has(label.name),label.name);
});

test('an address reads as a street of its neighbourhood, but for the stretches across a border',()=>{
  const inside=DELIVERY_SPOTS.filter(spot=>streetsOf(cityZone(spot.x,spot.z)).has(spot.street)).length;
  assert.ok(inside/DELIVERY_SPOTS.length>.94,`${inside} of ${DELIVERY_SPOTS.length}`);
});

test('all four neighbourhoods have addresses and names on the map',()=>{
  for(const zone of Object.keys(REAL_STREETS)){
    assert.ok(DELIVERY_SPOTS.some(spot=>cityZone(spot.x,spot.z)===zone&&streetsOf(zone).has(spot.street)),zone);
    assert.ok(STREET_LABELS.some(label=>cityZone(label.x,label.z)===zone&&streetsOf(zone).has(label.name)),zone);
  }
});

test('the name goes by name first, then by the line the street runs along, and by the neighbourhood',()=>{
  assert.equal(realStreet('Parque Olaria','Avenida Principal',0,136,false),'Av. Sete de Setembro');
  assert.equal(realStreet('Distrito Industrial','Avenida Principal',300,136,false),'Av. Santa Bárbara');
  assert.equal(realStreet('Centro','',-5,0,true),'Rua Dona Margarida');
  assert.equal(realStreet('Centro','',0,9,false),'Rua João Lino');
  // Running along z, the line is an x: a z line of the same number does not count.
  assert.equal(realStreet('Centro','',47,-13,false),undefined);
  assert.equal(realStreet('Centro','',20,0,true),undefined);
  assert.equal(realStreet('Lugar Nenhum','Avenida Principal',0,0,false),undefined);
});

test('the signs on the corners: the atlas and the bar\'s embedded copy say the same',()=>{
  const atlas=fs.readFileSync(new URL('../../apps/web/public/maps/cidade/texturas/atlas_bairro.jpg',import.meta.url));
  const glb=fs.readFileSync(new URL('../../apps/web/public/maps/bar_boteco.glb',import.meta.url));
  const length=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+length).toString('utf8')),start=20+length+8;
  const view=gltf.bufferViews[gltf.images.find((image:{name:string})=>image.name==='atlas_bairro').bufferView];
  assert.ok(glb.subarray(start+view.byteOffset,start+view.byteOffset+view.byteLength).equals(atlas));
});
