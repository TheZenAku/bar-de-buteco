import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pc from 'playcanvas';
import {MOTO} from '@bar/shared';

const exported=new URL('../../assets-bar/map/BarBoteco/export/',import.meta.url);
const published=new URL('../../apps/web/public/moto/',import.meta.url);
function glb(file:URL){const bytes=fs.readFileSync(file);return JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));}

test('the published motorcycle is v4 and the bag remains the independent v3 asset',()=>{
  for(const [version,files] of [['moto_v4',['moto_delivery.glb','moto_delivery_colisao.glb','moto_delivery.js']],['moto_v3',['moto_bag.glb','moto_bag.js']]] as const)
    for(const file of files)assert.deepEqual(fs.readFileSync(new URL(file,published)),fs.readFileSync(new URL(`${version}/${file}`,exported)));
  const bike=glb(new URL('moto_delivery.glb',published)),bag=glb(new URL('moto_bag.glb',published));
  assert.deepEqual(bike.meshes.map((m:any)=>m.name).sort(),['Moto','Moto_Placa','Luz_Farol','Luz_Freio','Luz_Lanterna','Luz_Seta_D','Luz_Seta_E'].sort());
  assert.ok(!bike.nodes.some((n:any)=>n.name.startsWith('bag_')));
  assert.ok(bag.nodes.some((n:any)=>n.name==='bag_tampa'));
  for(const model of [bike,bag])assert.ok(model.images.length&&model.images.every((i:any)=>i.bufferView!==undefined&&!i.uri));
});

test('shared v4 physics encloses the measured complete GLB and preserves metric wheel/seat dimensions',()=>{
  const model=glb(new URL('moto_delivery.glb',published));
  const entities:pc.Entity[]=model.nodes.map((n:any)=>{
    const e=new pc.Entity(n.name);e.setLocalPosition(...(n.translation??[0,0,0]) as [number,number,number]);
    e.setLocalRotation(...(n.rotation??[0,0,0,1]) as [number,number,number,number]);
    e.setLocalScale(...(n.scale??[1,1,1]) as [number,number,number]);return e;
  });
  model.nodes.forEach((n:any,i:number)=>n.children?.forEach((child:number)=>entities[i]!.addChild(entities[child]!)));
  const point=(name:string)=>entities.find(e=>e.name===name)!.getPosition();
  assert.equal(MOTO.SCALE,1);
  assert.ok(Math.abs(point('roda_dianteira').z-point('roda_traseira').z-MOTO.WHEELBASE)<.0001);
  assert.ok(Math.abs(point('roda_traseira').y-MOTO.WHEEL_RADIUS)<.0001);
  assert.ok(Math.abs(point('ponto_piloto').y-.80)<.004);
  const min=new pc.Vec3(Infinity,Infinity,Infinity),max=new pc.Vec3(-Infinity,-Infinity,-Infinity),p=new pc.Vec3();
  model.nodes.forEach((n:any,i:number)=>{
    if(n.mesh===undefined)return;
    for(const primitive of model.meshes[n.mesh].primitives){
      const a=model.accessors[primitive.attributes.POSITION];
      for(const x of [a.min[0],a.max[0]])for(const y of [a.min[1],a.max[1]])for(const z of [a.min[2],a.max[2]]){
        entities[i]!.getWorldTransform().transformPoint(new pc.Vec3(x,y,z),p);min.min(p);max.max(p);
      }
    }
  });
  assert.ok(min.x>=-MOTO.HALF_WIDTH&&max.x<=MOTO.HALF_WIDTH);
  assert.ok(min.z>=MOTO.CENTRE_Z-MOTO.HALF_LENGTH&&max.z<=MOTO.CENTRE_Z+MOTO.HALF_LENGTH);
  assert.ok(min.y>=-.0001&&max.y<=MOTO.HEIGHT);
  assert.ok(Math.abs(max.x-min.x-.840067)<.0001);
  assert.ok(Math.abs(max.z-min.z-2.002950)<.0001);
  assert.ok(Math.abs(max.y-1.199489)<.0001);
});
