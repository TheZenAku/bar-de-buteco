import test from 'node:test';
import assert from 'node:assert/strict';
import {AnimationClip,AnimationMixer,QuaternionKeyframeTrack,VectorKeyframeTrack,Vector3} from 'three';
import {readGlb,objects,retargetBase} from '../../tools/assets/lib/character-gltf.mjs';
import {createRetarget} from '../../tools/assets/lib/animation-retarget.mjs';
const publicRoot=new URL('../../apps/web/public/',import.meta.url);
const load=(id,bank=false)=>readGlb(new URL(`${bank?'animations':id.startsWith('base-')?'characters':'models'}/${id}.glb`,publicRoot));
function values(g,index){const a=g.json.accessors[index],v=g.json.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type];assert.ok(size);return Array.from({length:a.count*size},(_,i)=>g.bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+i*4));}
function animate(model,bank,name){
  const nodes=objects(model.json),raw=bank.json.animations.find(a=>a.name===name);assert.ok(raw);
  const tracks=raw.channels.map(ch=>{const s=raw.samplers[ch.sampler];return new(ch.target.path==='rotation'?QuaternionKeyframeTrack:VectorKeyframeTrack)(`${nodes[ch.target.node].uuid}.${ch.target.path==='rotation'?'quaternion':'position'}`,values(bank,s.input),values(bank,s.output));});
  const mixer=new AnimationMixer(nodes[0]);mixer.clipAction(new AnimationClip(name,-1,tracks)).play();
  return {nodes,at(t){mixer.setTime(t);nodes[0].updateMatrixWorld(true);}};
}
const limbs={upperarm:'lowerarm',lowerarm:'hand',upperleg:'lowerleg',lowerleg:'foot'};
for(const id of ['leandro','rafael','read','magrao','base-male','base-female']){
  test(`${id}: native limbs follow the source motion across different A/T poses without stretching`,()=>{
    const model=load(id),reference=load('nathan'),rig=createRetarget(objects(model.json),objects(reference.json));
    const rest=objects(model.json),lengths=rest.map(n=>n.parent?n.getWorldPosition(new Vector3()).distanceTo(n.parent.getWorldPosition(new Vector3())):0);
    for(const name of ['Idle','Walk','Dance','Drink','CardsSit','Sit']){
      const action=['Idle','Walk'].includes(name)?model:load(id,true),source=['Idle','Walk'].includes(name)?reference:load('nathan',true);
      const a=animate(model,action,name),b=animate(reference,source,name);
      for(const time of [.1,.6,1.1]){
        a.at(time);b.at(time);
        const target=new Map(rig.names.map((name,i)=>[name,a.nodes[i]])),sourceByName=new Map(b.nodes.map(n=>[n.name,n]));
        for(const [start,end] of Object.entries(limbs))for(const side of ['l','r']){
          const dir=(map,from,to)=>map.get(to).getWorldPosition(new Vector3()).sub(map.get(from).getWorldPosition(new Vector3())).normalize();
          const dot=dir(target,`${start}_${side}`,`${end}_${side}`).dot(dir(sourceByName,`${start}_${side}`,`${end}_${side}`));
          assert.ok(dot>.999,`${id}/${name}/${start}_${side}: wrong native calibration (${dot})`);
        }
        for(const [i,node] of a.nodes.entries()){
          if(!node.parent||rig.names[i]==='hip'||rig.names[i]==='root')continue;
          const distance=node.getWorldPosition(new Vector3()).distanceTo(node.parent.getWorldPosition(new Vector3()));
          assert.ok(Math.abs(distance-lengths[i])<1e-5,`${id}/${name}/${node.name}: bone length changed`);
        }
      }
    }
  });
  test(`${id}: reprocessing preserves native geometry, bind matrices and hierarchy and is repeatable`,()=>{
    const model=load(id),reference=load('nathan'),native=structuredClone(model.json);
    const first=retargetBase(model,reference),firstBytes=Buffer.from(first.bin);
    assert.deepEqual(first.json.nodes,native.nodes);assert.deepEqual(first.json.skins,native.skins);
    assert.deepEqual(first.json.meshes,native.meshes);assert.deepEqual(first.json.materials,native.materials);
    const boundary=first.json.asset.extras.baseAnimationData.bytes;
    assert.deepEqual(first.bin.subarray(0,boundary),model.bin.subarray(0,boundary),'all native geometry, texture and bind bytes stay intact');
    for(const skin of native.skins){const i=skin.inverseBindMatrices;assert.deepEqual(values(first,i),values({json:native,bin:model.bin},i));}
    const again=retargetBase(first,reference);
    assert.deepEqual(again.bin,firstBytes,'reprocessing must not grow or change the animation binary');
  });
}
test('AccuRig twist chains stay on their limbs and elbow/knee helpers animate',()=>{
  for(const id of ['leandro','rafael','read','magrao']){
    const model=load(id),a=animate(model,load(id,true),'Dance'),rig=createRetarget(objects(model.json),objects(load('nathan').json));
    const samples=[];
    for(const t of [.1,.6,1.1]){
      a.at(t);samples.push(a.nodes.map(n=>n.quaternion.clone()));
      for(const node of a.nodes.filter(n=>/twist02$/i.test(n.name))){
        if(!/(forearm|upperarm|calf|thigh)/i.test(node.name))continue;
        const main=node.parent.parent,endName=limbs[rig.names[a.nodes.indexOf(main)]?.replace(/_[lr]$/,'')];
        if(!endName)continue;
        const side=rig.names[a.nodes.indexOf(main)].slice(-1),end=a.nodes[rig.names.indexOf(`${endName}_${side}`)];
        const origin=main.getWorldPosition(new Vector3()),axis=end.getWorldPosition(new Vector3()).sub(origin).normalize(),point=node.getWorldPosition(new Vector3()).sub(origin);
        assert.ok(point.clone().addScaledVector(axis,-point.dot(axis)).length()<1e-4,`${id}/${node.name}: twist bends the limb`);
      }
    }
    for(const [i,node] of a.nodes.entries())if(/(?:elbow|knee)sharebone$/i.test(node.name))assert.ok(samples[0][i].angleTo(samples[2][i])>.001,`${id}/${node.name}: frozen helper`);
  }
});
test('matrix-encoded native transforms become equivalent animation-compatible TRS',()=>{
  const model=load('magrao'),original=objects(model.json).map(n=>n.matrixWorld.clone());
  for(const [i,node] of objects(model.json).entries()){
    node.updateMatrix();model.json.nodes[i].matrix=node.matrix.toArray();
    delete model.json.nodes[i].translation;delete model.json.nodes[i].rotation;delete model.json.nodes[i].scale;
  }
  const adapted=retargetBase(model,load('nathan')),after=objects(adapted.json);
  for(const [i,node] of after.entries()){
    assert.equal(adapted.json.nodes[i].matrix,undefined);
    assert.ok(node.matrixWorld.elements.every((v,c)=>Math.abs(v-original[i].elements[c])<1e-5),'matrix decomposition must preserve the native rig');
  }
  const animated=animate(adapted,adapted,'Walk');animated.at(.6);
  const hand=animated.nodes.find(n=>n.name==='hand_r').getWorldPosition(new Vector3());
  assert.ok(hand.toArray().every(Number.isFinite)&&hand.y>.5&&hand.y<1.8);
});
