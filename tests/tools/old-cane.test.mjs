import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {AnimationClip,AnimationMixer,QuaternionKeyframeTrack,VectorKeyframeTrack,Vector3} from 'three';
import {objects,readGlb} from '../../tools/lib/character-gltf.mjs';
const root=fileURLToPath(new URL('../../apps/web/public/',import.meta.url));
function values({json,bin},index){const a=json.accessors[index],v=json.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type];return Array.from({length:a.count*width},(_,i)=>bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+i*4));}
function animate(model,bank,name){const nodes=objects(model.json),raw=bank.json.animations.find(a=>a.name===name);assert.ok(raw);const tracks=raw.channels.map(ch=>{const s=raw.samplers[ch.sampler];return new (ch.target.path==='rotation'?QuaternionKeyframeTrack:VectorKeyframeTrack)(`${nodes[ch.target.node].name}.${ch.target.path==='rotation'?'quaternion':'position'}`,values(bank,s.input),values(bank,s.output));});const mixer=new AnimationMixer(nodes[0]);mixer.clipAction(new AnimationClip(name,-1,tracks)).play();return {nodes,setTime(time){mixer.setTime(time);nodes[0].updateMatrixWorld(true);}};}

for(const id of ['nathan','leandro','rafael','read','magrao','base-male','base-female'])test(`${id}: cane imports only the 200-triangle prop; looping gait, hand attachment and idle remain valid`,()=>{
  const model=readGlb(path.join(root,id.startsWith('base-')?'characters':'models',`${id}.glb`)),bank=readGlb(path.join(root,'animations',`${id}.glb`)),prop=readGlb(path.join(root,'props',`old-cane-${id}.glb`));
  assert.deepEqual(bank.json.nodes.map(n=>n.name),model.json.nodes.map(n=>n.name));
  assert.equal(prop.json.meshes.length,1);assert.equal(prop.json.nodes.length,1);assert.equal(prop.json.nodes[0].name,'Acc_Male_Hand_Cane');
  assert.equal(prop.json.skins,undefined);assert.equal(prop.json.animations,undefined);assert.equal(prop.json.asset.extras.attachment,'hand_r');
  assert.equal(prop.json.meshes[0].primitives.reduce((s,p)=>s+prop.json.accessors[p.attributes.POSITION].count/3,0),200);
  assert.deepEqual(prop.json.materials.map(m=>m.name).sort(),['Cane_handle','Cane_ring','Cane_rubber','Cane_shaft']);
  for(const p of prop.json.meshes[0].primitives)assert.deepEqual(Object.keys(p.attributes).sort(),['NORMAL','POSITION']);
  const walk=bank.json.animations.find(a=>a.name==='OldCaneWalk');assert.ok(walk);
  for(const channel of walk.channels){const sampler=walk.samplers[channel.sampler],times=values(bank,sampler.input),data=values(bank,sampler.output),size=channel.target.path==='rotation'?4:3;assert.equal(times.at(-1),Math.fround(1.6));assert.ok(data.every(Number.isFinite));for(let c=0;c<size;c++)assert.ok(Math.abs(data[c]-data[data.length-size+c])<1e-5,'exact loop seam');}
  const posed=animate(model,bank,'OldCaneWalk');posed.setTime(0);const hand=posed.nodes.find(n=>n.name==='hand_r');let minY=Infinity,maxY=-Infinity;
  for(const p of prop.json.meshes[0].primitives){const data=values(prop,p.attributes.POSITION);for(let i=0;i<data.length;i+=3){const point=new Vector3().fromArray(data,i).applyMatrix4(hand.matrixWorld);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}}
  assert.ok(Math.abs(minY)<1e-4,`planted cane tip must touch the ground: ${minY}`);assert.ok(maxY>.65&&maxY<1.3,'prop is in metres despite different rig scales');
  const hipName=id==='rafael'?'pelvis':'hip',hips=[];
  for(const time of [0,.4,.8,1.2,1.59]){posed.setTime(time);hips.push(posed.nodes.find(n=>n.name===hipName).getWorldPosition(new Vector3()));}
  assert.ok(Math.max(...hips.map(p=>p.z))-Math.min(...hips.map(p=>p.z))<.01,'the clip must not move the player forward independently of the server');
  const idle=animate(model,model,'Idle'),hold=animate(model,bank,'OldCaneHold');
  for(const time of [0,.4,.8]){idle.setTime(time);hold.setTime(time);for(const name of [hipName,'head','upperleg_l','lowerleg_l','upperarm_l']){const a=idle.nodes.find(n=>n.name===name),b=hold.nodes.find(n=>n.name===name);if(a&&b)assert.ok(1-Math.abs(a.quaternion.dot(b.quaternion))<1e-5,`holding a cane must preserve idle on ${name}`);}}
});
