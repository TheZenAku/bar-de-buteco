import fs from 'node:fs';
import {createRetarget} from './animation-retarget.mjs';
import {AnimationClip,AnimationMixer,Matrix4,Object3D,Quaternion,QuaternionKeyframeTrack,Vector3,VectorKeyframeTrack} from 'three';

export function readGlb(file){const b=fs.readFileSync(file),n=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
export function writeGlb(file,json,bin){
  const data=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);json.buffers=[{byteLength:data.length}];
  const raw=Buffer.from(JSON.stringify(json)),text=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+data.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(data.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(file,Buffer.concat([header,text,bh,data]));
}
export function objects(json){const nodes=json.nodes.map((n,i)=>{const o=new Object3D();o.name=n.name??`node_${i}`;if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);else{o.position.fromArray(n.translation??[0,0,0]);o.quaternion.fromArray(n.rotation??[0,0,0,1]);o.scale.fromArray(n.scale??[1,1,1]);}return o;});json.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));for(const i of json.scenes[json.scene??0].nodes)nodes[i].updateMatrixWorld(true);return nodes;}
export function retargetBase(target,reference){
  const json=target.json,source=objects(reference.json),nodes=objects(json),byName=new Map(source.map(n=>[n.name,n]));
  // glTF animation targets require TRS rather than a matrix. Keep the same native transform.
  json.nodes.forEach((n,i)=>{if(n.matrix){n.translation=nodes[i].position.toArray();n.rotation=nodes[i].quaternion.toArray();n.scale=nodes[i].scale.toArray();delete n.matrix;}});
  nodes.forEach((n,i)=>{n.userData.retargetMesh=json.nodes[i].mesh!==undefined;});
  const rig=createRetarget(nodes,source),hipIndex=rig.names.indexOf('hip'),hip=nodes[hipIndex];
  if(!hip)throw new Error('Native rig has no mapped hip');
  const hipStart=hip.getWorldPosition(new Vector3()),sourceHip=byName.get('hip').getWorldPosition(new Vector3()),ratio=hipStart.y/sourceHip.y;
  // Save the boundary so repeating the operation never appends animation data indefinitely.
  const previous=json.asset.extras?.baseAnimationData;
  if(previous){json.accessors.length=previous.accessors;json.bufferViews.length=previous.views;target.bin=target.bin.subarray(0,previous.bytes);}
  json.asset.extras={...json.asset.extras,retarget:'native-directions-v2',baseAnimationData:{accessors:json.accessors.length,views:json.bufferViews.length,bytes:target.bin.length}};
  const chunks=[target.bin];let offset=target.bin.length;const pad=Buffer.alloc((4-offset%4)%4);chunks.push(pad);offset+=pad.length;
  function values(index){const a=reference.json.accessors[index],v=reference.json.bufferViews[a.bufferView],size=a.type==='VEC4'?4:a.type==='VEC3'?3:1;const start=(v.byteOffset??0)+(a.byteOffset??0);return Float32Array.from({length:a.count*size},(_,i)=>reference.bin.readFloatLE(start+i*4));}
  function accessor(data,size){const array=Float32Array.from(data),b=Buffer.from(array.buffer),view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length})-1;chunks.push(b);offset+=b.length;const a={bufferView:view,componentType:5126,count:data.length/size,type:size===1?'SCALAR':`VEC${size}`};if(size===1){a.min=[data[0]];a.max=[data.at(-1)];}return json.accessors.push(a)-1;}
  json.animations=[];
  for(const name of ['Idle','Walk','Pose']){
    const raw=reference.json.animations.find(a=>a.name===name);
    const tracks=raw.channels.map(ch=>{const s=raw.samplers[ch.sampler],n=source[ch.target.node],type=ch.target.path==='rotation'?QuaternionKeyframeTrack:VectorKeyframeTrack;return new type(`${n.uuid}.${ch.target.path==='rotation'?'quaternion':ch.target.path==='translation'?'position':'scale'}`,values(s.input),values(s.output));});
    const clip=new AnimationClip(name,-1,tracks),mixer=new AnimationMixer(source[0]);mixer.clipAction(clip).play();
    const times=Array.from({length:Math.ceil(clip.duration*30)+1},(_,i)=>Math.min(i/30,clip.duration)),rotations=nodes.map(()=>[]),translations=[];
    let firstHip;
    for(const t of times){
      mixer.setTime(Math.min(t,Math.max(0,clip.duration-1e-6)));source[0].updateMatrixWorld(true);
      const pose=new Map(source.map(n=>[n.name,n.getWorldQuaternion(new Quaternion())]));
      rig.pose(pose).forEach((q,i)=>rotations[i].push(...q.toArray()));
      const p=byName.get('hip').getWorldPosition(new Vector3());firstHip??=p.clone();
      const targetPosition=hipStart.clone();targetPosition.x+=(p.x-firstHip.x)*ratio;targetPosition.z+=(p.z-firstHip.z)*ratio;targetPosition.y+=(p.y-sourceHip.y)*ratio;
      translations.push(...hip.parent.worldToLocal(targetPosition).toArray());
    }
    const animation={name,channels:[],samplers:[]},input=accessor(times,1);
    for(let i=0;i<nodes.length;i++){
      if(json.nodes[i].mesh!==undefined)continue;
      const sampler=animation.samplers.push({input,output:accessor(rotations[i],4),interpolation:'LINEAR'})-1;
      animation.channels.push({sampler,target:{node:i,path:'rotation'}});
      // Every clip restores the authored root transform; never zero a native Z-up root at runtime.
      if(rig.names[i]==='root')animation.channels.push({sampler:animation.samplers.push({input,output:accessor(times.flatMap(()=>nodes[i].position.toArray()),3),interpolation:'LINEAR'})-1,target:{node:i,path:'translation'}});
    }
    animation.channels.push({sampler:animation.samplers.push({input,output:accessor(translations,3),interpolation:'LINEAR'})-1,target:{node:hipIndex,path:'translation'}});
    json.animations.push(animation);mixer.stopAllAction();mixer.uncacheRoot(source[0]);
    source.forEach((n,i)=>{n.position.fromArray(reference.json.nodes[i].translation??[0,0,0]);n.quaternion.fromArray(reference.json.nodes[i].rotation??[0,0,0,1]);});
  }
  return {json,bin:Buffer.concat(chunks)};
}
