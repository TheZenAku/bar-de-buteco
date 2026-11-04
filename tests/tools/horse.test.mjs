import test from 'node:test';
import assert from 'node:assert/strict';
import {AnimationClip,AnimationMixer,LoopOnce,QuaternionKeyframeTrack,VectorKeyframeTrack,Vector3} from 'three';
import {readGlb,objects} from '../../tools/assets/lib/character-gltf.mjs';

const {json,bin}=readGlb(new URL('../../apps/web/public/mounts/tiao-horse.glb',import.meta.url));
function values(index){const a=json.accessors[index],v=json.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4}[a.type],offset=(v.byteOffset??0)+(a.byteOffset??0);return Float32Array.from({length:a.count*size},(_,i)=>bin.readFloatLE(offset+i*4));}
function playback(name){
  const nodes=objects(json),root=nodes[json.scenes[0].nodes[0]],raw=json.animations.find(a=>a.name===name);
  const tracks=raw.channels.map(c=>{const s=raw.samplers[c.sampler],Type=c.target.path==='rotation'?QuaternionKeyframeTrack:VectorKeyframeTrack;return new Type(`${nodes[c.target.node].uuid}.${c.target.path==='rotation'?'quaternion':'position'}`,values(s.input),values(s.output));});
  const clip=new AnimationClip(name,-1,tracks),mixer=new AnimationMixer(root);mixer.clipAction(clip).setLoop(LoopOnce,1).play();
  return {nodes,root,clip,mixer};
}
test('horse preserves its native skin and embedded textures, with three complete finite looping clips',()=>{
  assert.deepEqual(json.animations.map(a=>a.name),['HorseIdle','HorseWalk','HorseGallop']);
  assert.equal(json.skins.length,1);assert.ok(json.skins[0].joints.length>20);
  assert.ok(json.images.every(image=>image.bufferView!==undefined&&!image.uri));
  assert.ok(json.nodes.some(n=>n.name==='HorseSaddle'));
  for(const animation of json.animations)for(const channel of animation.channels){
    const s=animation.samplers[channel.sampler],data=values(s.output),size=channel.target.path==='rotation'?4:3;
    assert.ok(data.every(Number.isFinite));
    for(let i=0;i<size;i++)assert.ok(Math.abs(data[i]-data[data.length-size+i])<1e-5,`${animation.name}/${json.nodes[channel.target.node].name} must close its loop`);
  }
});

test('gallop has four hoof contacts, a suspended phase, planted stance and saddle bounce',()=>{
  const {nodes,root,clip,mixer}=playback('HorseGallop');
  const feet=['tripo::0_Left_Limb_2','tripo::0_Right_Limb_2','tripo::1_Left_Limb_2','tripo::1_Right_Limb_3'].map(name=>nodes.find(n=>n.name===name));
  const saddle=nodes.find(n=>n.name==='HorseSaddle'),ground=feet.map(foot=>foot.getWorldPosition(new Vector3()).y);
  const joints=[...new Set(feet.flatMap(foot=>[foot,foot.parent,foot.parent.parent,foot.parent.parent.parent]))],lengths=joints.map(j=>j.position.length());
  const samples=Array.from({length:144},(_,i)=>{
    const t=clip.duration*i/144;mixer.setTime(t);root.updateMatrixWorld(true);
    joints.forEach((joint,j)=>assert.ok(Math.abs(joint.position.length()-lengths[j])<1e-6,'the entire limb keeps its native bone lengths'));
    return {feet:feet.map(foot=>{const p=foot.getWorldPosition(new Vector3());return {y:p.y,z:p.z+json.asset.extras.gallopPace*t};}),saddle:saddle.getWorldPosition(new Vector3()).y};
  });
  const contacts=[];
  for(let j=0;j<feet.length;j++){
    const ys=samples.map(s=>s.feet[j].y),planted=samples.map(s=>Math.abs(s.feet[j].y-ground[j])<.003);
    assert.ok(Math.max(...ys)-Math.min(...ys)>.28,'each hoof lifts well above its walking arc');
    assert.ok(planted.filter(Boolean).length>=25&&planted.filter(Boolean).length<65,'short stance followed by a long recovery');
    for(let i=1;i<samples.length;i++)if(planted[i]&&planted[i-1])assert.ok(Math.abs(samples[i].feet[j].z-samples[i-1].feet[j].z)<.004,'a supporting hoof does not slide at the authored pace');
    contacts.push(planted.findIndex((on,i)=>on&&!planted[(i+planted.length-1)%planted.length]));
  }
  assert.equal(new Set(contacts).size,4,'each leg lands on a separate beat');
  assert.ok(samples.filter(s=>s.feet.every((p,j)=>p.y>ground[j]+.015)).length>=8,'all four hooves leave the ground together');
  const heights=samples.map(s=>s.saddle);assert.ok(Math.max(...heights)-Math.min(...heights)>.08,'the saddle follows the galloping body');
});

test('gallop stays near standing height without crouching below the walking torso',()=>{
  const heights=name=>{
    const {nodes,root,clip,mixer}=playback(name),saddle=nodes.find(n=>n.name==='HorseSaddle');
    return Array.from({length:360},(_,i)=>{mixer.setTime(clip.duration*i/360);root.updateMatrixWorld(true);return saddle.getWorldPosition(new Vector3()).y;});
  };
  const idle=heights('HorseIdle'),walk=heights('HorseWalk'),gallop=heights('HorseGallop'),average=ys=>ys.reduce((a,b)=>a+b,0)/ys.length;
  assert.ok(Math.min(...gallop)>=Math.min(...walk)-.005,'accelerating must not sink the horse below its walking posture');
  assert.ok(average(gallop)>=average(idle)-.055,'the running torso stays within 5.5 cm of standing height on average');
  assert.ok(Math.min(...gallop)>=average(idle)-.10,'even the deepest landing stays within 10 cm of standing height');
  assert.ok(Math.max(...gallop)<=average(idle)+.08,'suspension has a restrained upward bounce');
  for(let i=0;i<gallop.length;i++)assert.ok(Math.abs(gallop[i]-gallop[(i+1)%gallop.length])<.0035,'body height changes smoothly, including across the loop');
});
test('native horse gait plants hooves during stance and lifts each leg without stretching the skeleton',()=>{
  const {nodes,root,clip,mixer}=playback('HorseWalk');
  const names=['tripo::0_Left_Limb_2','tripo::0_Right_Limb_2','tripo::1_Left_Limb_2','tripo::1_Right_Limb_3'];
  const feet=names.map(name=>nodes.find(n=>n.name===name)),heights=feet.map(()=>[]),lengths=feet.map(foot=>foot.position.length());
  for(let i=0;i<60;i++){
    mixer.setTime(clip.duration*i/60);root.updateMatrixWorld(true);
    feet.forEach((foot,j)=>{heights[j].push(foot.getWorldPosition(new Vector3()).y);assert.ok(Math.abs(foot.position.length()-lengths[j])<1e-6);});
  }
  for(const ys of heights){assert.ok(Math.max(...ys)-Math.min(...ys)>.15);assert.ok(ys.filter(y=>y<Math.min(...ys)+.002).length>=30,'hoof stays planted for most of the stride');}
});
