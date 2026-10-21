import fs from 'node:fs';
import {AnimationClip,AnimationMixer,Object3D,Quaternion,QuaternionKeyframeTrack,Vector3,VectorKeyframeTrack} from 'three';

export function readGlb(file){const b=fs.readFileSync(file),n=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
export function writeGlb(file,json,bin){
  const data=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);json.buffers=[{byteLength:data.length}];
  const raw=Buffer.from(JSON.stringify(json)),text=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+data.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(data.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(file,Buffer.concat([header,text,bh,data]));
}
export function objects(json){const nodes=json.nodes.map((n,i)=>{const o=new Object3D();o.name=n.name??`node_${i}`;o.position.fromArray(n.translation??[0,0,0]);o.quaternion.fromArray(n.rotation??[0,0,0,1]);o.scale.fromArray(n.scale??[1,1,1]);return o;});json.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));for(const i of json.scenes[json.scene??0].nodes)nodes[i].updateMatrixWorld(true);return nodes;}
export function topological(json){
  const order=[];const visit=i=>{order.push(i);json.nodes[i].children?.forEach(visit);};json.scenes[json.scene??0].nodes.forEach(visit);
  const map=new Map(order.map((old,i)=>[old,i]));json.nodes=order.map(i=>({...json.nodes[i],children:json.nodes[i].children?.map(c=>map.get(c))}));
  for(const scene of json.scenes)scene.nodes=scene.nodes.map(i=>map.get(i));
  for(const skin of json.skins??[]){skin.joints=skin.joints.map(i=>map.get(i));if(skin.skeleton!==undefined)skin.skeleton=map.get(skin.skeleton);}
}
export function retargetBase(target,reference){
  const json=target.json,source=objects(reference.json),nodes=objects(json),byName=new Map(source.map(n=>[n.name,n]));
  const bind=new Map(source.map(n=>[n.name,n.getWorldQuaternion(new Quaternion())]));
  const targetBind=nodes.map(n=>n.getWorldQuaternion(new Quaternion())),parents=nodes.map(n=>nodes.indexOf(n.parent));
  const hip=nodes.find(n=>n.name==='hip'),hipIndex=nodes.indexOf(hip),hipStart=hip.getWorldPosition(new Vector3()),ratio=hipStart.y/.956;
  const chunks=[target.bin];let offset=target.bin.length;const pad=Buffer.alloc((4-offset%4)%4);chunks.push(pad);offset+=pad.length;
  function values(index){const a=reference.json.accessors[index],v=reference.json.bufferViews[a.bufferView],size=a.type==='VEC4'?4:a.type==='VEC3'?3:1;const start=(v.byteOffset??0)+(a.byteOffset??0);return Float32Array.from({length:a.count*size},(_,i)=>reference.bin.readFloatLE(start+i*4));}
  function accessor(data,size){const array=Float32Array.from(data),b=Buffer.from(array.buffer),view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length})-1;chunks.push(b);offset+=b.length;const a={bufferView:view,componentType:5126,count:data.length/size,type:size===1?'SCALAR':`VEC${size}`};if(size===1){a.min=[data[0]];a.max=[data.at(-1)];}return json.accessors.push(a)-1;}
  json.animations=[];
  for(const name of ['Idle','Walk','Pose']){
    const raw=reference.json.animations.find(a=>a.name===name);
    const tracks=raw.channels.map(ch=>{const s=raw.samplers[ch.sampler],n=source[ch.target.node],type=ch.target.path==='rotation'?QuaternionKeyframeTrack:VectorKeyframeTrack;return new type(`${n.name}.${ch.target.path==='rotation'?'quaternion':ch.target.path==='translation'?'position':'scale'}`,values(s.input),values(s.output));});
    const clip=new AnimationClip(name,-1,tracks),mixer=new AnimationMixer(source[0]);mixer.clipAction(clip).play();
    const times=Array.from({length:Math.ceil(clip.duration*30)+1},(_,i)=>Math.min(i/30,clip.duration)),rotations=nodes.map(()=>[]),translations=[];
    for(const t of times){
      mixer.setTime(Math.min(t,clip.duration-1e-6));source[0].updateMatrixWorld(true);const desired=[];
      nodes.forEach((node,i)=>{let local=node.quaternion.clone();const parent=parents[i]<0?new Quaternion():desired[parents[i]];
        if(node.name!=='root'&&byName.has(node.name)&&json.nodes[i].mesh===undefined){const world=byName.get(node.name).getWorldQuaternion(new Quaternion()).multiply(bind.get(node.name).clone().invert()).multiply(targetBind[i]);local=parent.clone().invert().multiply(world).normalize();}
        desired[i]=parent.clone().multiply(local);rotations[i].push(...local.toArray());});
      const p=hipStart.clone();p.y+=(byName.get('hip').getWorldPosition(new Vector3()).y-.956)*ratio;translations.push(...hip.parent.worldToLocal(p).toArray());
    }
    const animation={name,channels:[],samplers:[]},input=accessor(times,1);
    for(let i=0;i<nodes.length;i++){
      if(json.nodes[i].mesh!==undefined)continue;
      const sampler=animation.samplers.push({input,output:accessor(rotations[i],4),interpolation:'LINEAR'})-1;
      animation.channels.push({sampler,target:{node:i,path:'rotation'}});
    }
    animation.channels.push({sampler:animation.samplers.push({input,output:accessor(translations,3),interpolation:'LINEAR'})-1,target:{node:hipIndex,path:'translation'}});
    json.animations.push(animation);mixer.stopAllAction();mixer.uncacheRoot(source[0]);
    source.forEach((n,i)=>{n.position.fromArray(reference.json.nodes[i].translation??[0,0,0]);n.quaternion.fromArray(reference.json.nodes[i].rotation??[0,0,0,1]);});
  }
  return {json,bin:Buffer.concat(chunks)};
}
