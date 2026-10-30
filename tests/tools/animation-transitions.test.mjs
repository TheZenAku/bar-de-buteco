import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as pc from 'playcanvas';
import {objects,readGlb} from '../../tools/assets/lib/character-gltf.mjs';
import {completeBasePose} from '../../apps/web/src/engine/animation-tracks.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const banks=process.env.BAR_ANIMATION_OUTPUT??path.join(root,'apps/web/public/animations');
function values(glb,index){
  const a=glb.json.accessors[index],v=glb.json.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4}[a.type];
  return Array.from({length:a.count*size},(_,i)=>glb.bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+i*4));
}
function avatar(model,...banks){
  const native=objects(model.json),nodes=native.map(n=>{
    const node=new pc.GraphNode(n.name);
    node.setLocalPosition(...n.position.toArray());node.setLocalRotation(...n.quaternion.toArray());node.setLocalScale(...n.scale.toArray());
    return node;
  });
  model.json.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].addChild(nodes[child])));
  const graph=nodes[model.json.scenes[model.json.scene??0].nodes[0]];
  const evaluator=new pc.AnimEvaluator(new pc.DefaultAnimBinder(graph));
  function readTrack(data,raw){
    const inputs=[],outputs=[],curves=[];
    for(const channel of raw.channels){
      const sampler=raw.samplers[channel.sampler],property=channel.target.path;
      const index=inputs.length;
      inputs.push(new pc.AnimData(1,values(data,sampler.input)));
      outputs.push(new pc.AnimData(property==='rotation'?4:3,values(data,sampler.output)));
      const entityPath=[];
      for(let node=nodes[channel.target.node];node;node=node.parent)entityPath.unshift(node.name);
      curves.push(new pc.AnimCurve([{entityPath,component:'graph',
        propertyPath:[{rotation:'localRotation',translation:'localPosition',scale:'localScale'}[property]]}],index,index,pc.INTERPOLATION_LINEAR));
    }
    return new pc.AnimTrack(raw.name,Math.max(...inputs.map(i=>i.data.at(-1))),inputs,outputs,curves);
  }
  const tracks=new Map();
  // Capture missing bone transforms before any clip runs, just as makeSkin does.
  for(const raw of model.json.animations)tracks.set(`Base ${raw.name}`,completeBasePose(readTrack(model,raw),graph));
  for(const bank of banks)for(const raw of bank.json.animations)tracks.set(raw.name,readTrack(bank,raw));
  return {nodes,play(name,time){
    const track=tracks.get(name);assert.ok(track,`${name} exists`);
    // A completed transition removes the previous clip. The engine does not reset
    // properties that the next clip omits, so evaluate both on the same graph.
    evaluator.removeClips();
    evaluator.addClip(new pc.AnimClip(track,time,1,true,false));
    evaluator.update(0);
  }};
}

function transition(skin,from,to){
  test(`${skin} ${from} -> ${to}: the completed pose matches playing ${to} on a fresh character`,()=>{
    const model=readGlb(path.join(root,`apps/web/public/models/${skin}.glb`));
    const bank=readGlb(path.join(banks,`${skin}.glb`)),dances=readGlb(path.join(banks,`${skin}-dances.glb`));
    const fresh=avatar(model,bank,dances),reused=avatar(model,bank,dances);
    fresh.play(to,.4);reused.play(from,.7);reused.play(to,.4);
    for(const [i,clean] of fresh.nodes.entries()){
      const used=reused.nodes[i],name=clean.name;
      assert.ok(clean.getLocalPosition().distance(used.getLocalPosition())<1e-6,
        `${name} retained a translation from ${from}: ${used.getLocalPosition()} instead of ${clean.getLocalPosition()}`);
      assert.ok(Math.abs(clean.getLocalRotation().dot(used.getLocalRotation()))>1-1e-6,`${name} retained a rotation from ${from}`);
    }
  });
}

for(const [from,to] of [['Fallen','Run'],['Sit','Drink'],['Recover','CardsSit'],
  ['Fallen','OldCaneWalk'],['Drink','OldCaneHold'],['OldCaneWalk','Drink'],
  ['Sit','Base Idle'],['Recover','Base Pose'],['Dance Samba Dancing','Base Walk'],['Run','Sit']])transition('nathan',from,to);

// Both newly selected Mixamo clips must restore a complete pose, including the
// Nathan root and each native rig's hip, after actions with different translations.
for(const skin of ['nathan','leandro','rafael','read','magrao','gilmar-gordo']){
  for(const [from,to] of [['Sit','Idle'],['Drink','Idle'],['AngrySit','Walk'],['Walk','AngrySit']])transition(skin,from,to);
}
