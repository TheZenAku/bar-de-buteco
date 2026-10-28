import fs from 'node:fs';
import path from 'node:path';
import {AnimationClip,AnimationMixer,Group,Matrix4,Quaternion,QuaternionKeyframeTrack,Vector3,VectorKeyframeTrack} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {objects,writeGlb} from './character-gltf.mjs';
import {createRetarget} from './animation-retarget.mjs';

const aliases={pelvis:'hip',Head:'head',neck_01:'neck',clavicle_l:'shoulder_l',clavicle_r:'shoulder_r',thigh_l:'upperleg_l',thigh_r:'upperleg_r',calf_l:'lowerleg_l',calf_r:'lowerleg_r',ball_l:'toe_l',ball_r:'toe_r'};
const load=file=>{const b=fs.readFileSync(file);return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');};
let cached;
function sourceData(root){
  if(cached)return cached;
  const prop=load(path.join(root,'assets-bar/anim/A_Male_Walk_OldCane.fbx')),motion=load(path.join(root,'assets-bar/anim/A_Male_Walk_OldCane_walkstyle.fbx'));
  prop.updateMatrixWorld(true);const cane=prop.getObjectByName('Acc_Male_Hand_Cane'),clip=motion.animations[0];
  if(!cane?.isSkinnedMesh||!clip?.duration)throw new Error('Bengala ou animação OldCane ausente nos arquivos de origem.');
  const hand=cane.skeleton.bones.findIndex(b=>b.name==='hand_r'),si=cane.geometry.attributes.skinIndex,sw=cane.geometry.attributes.skinWeight;
  for(let i=0;i<si.count;i++)for(let c=0;c<4;c++)if(sw.array[i*4+c]>1e-6&&si.array[i*4+c]!==hand)throw new Error('A bengala deve estar 100% vinculada a hand_r.');
  const canonical=new Matrix4().makeRotationY(Math.PI).multiply(new Matrix4().makeScale(.01,.01,.01));
  const bind=new Map(cane.skeleton.bones.map((bone,i)=>[aliases[bone.name]??bone.name,canonical.clone().multiply(cane.skeleton.boneInverses[i].clone().invert())]));
  const wrapper=new Group();wrapper.rotation.y=Math.PI;wrapper.scale.setScalar(.01);wrapper.add(motion);wrapper.updateMatrixWorld(true);
  const bones=new Map();motion.traverse(n=>{if(n.isBone)bones.set(aliases[n.name]??n.name,n);});
  const mixer=new AnimationMixer(motion);mixer.clipAction(clip).play();
  const handLocal=cane.geometry.clone().applyMatrix4(cane.skeleton.boneInverses[hand].clone().multiply(cane.bindMatrix));
  cached={cane,handLocal,bind,bones,wrapper,mixer,clip};return cached;
}

export function appendOldCane({root,id,model,reference,json,accessor,props}){
  const source=sourceData(root),nodes=objects(model.json);
  nodes.forEach((n,i)=>{n.userData.retargetMesh=model.json.nodes[i].mesh!==undefined;});
  const rig=createRetarget(nodes,objects(reference.json)),{names,bind}=rig;
  const hip=names.indexOf('hip'),hipStart=model.nodes[hip].getWorldPosition(new Vector3()),sourceHip=new Vector3().setFromMatrixPosition(source.bind.get('hip'));
  const ratio=hipStart.y/sourceHip.y,hand=names.indexOf('hand_r');if(hip<0||hand<0)throw new Error(`${id}: rig sem quadril ou mão direita.`);
  const handBind=new Matrix4().compose(new Vector3(),bind[hand],nodes[hand].getWorldScale(new Vector3()));
  const sourceBind=new Map([...source.bind].map(([name,matrix])=>[name,new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix)).normalize()]));
  const duration=Math.round(source.clip.duration*30+1)/30;
  const times=Array.from({length:Math.round(duration*30)+1},(_,i)=>i/30);
  const worldPose=()=>new Map([...source.bones].map(([name,bone])=>[name,bone.getWorldQuaternion(new Quaternion())]));
  const setSource=time=>{source.mixer.setTime(time);source.wrapper.updateMatrixWorld(true);};
  setSource(0);const hold=worldPose();
  const rightArm=name=>name==='shoulder_r'||name==='upperarm_r'||name==='lowerarm_r'||name==='hand_r'||/^(thumb|index|middle|ring|pinky)_.*_r$/.test(name);
  const idle=model.json.animations.find(a=>a.name==='Idle');
  const bytes=fs.readFileSync(path.join(root,'apps/web/public/models',`${id}.glb`));
  const length=bytes.readUInt32LE(12),bin=bytes.subarray(28+length);
  const values=index=>{const a=model.json.accessors[index],v=model.json.bufferViews[a.bufferView],size=a.type==='VEC4'?4:a.type==='VEC3'?3:1;return Float32Array.from({length:a.count*size},(_,i)=>bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+i*4));};
  const idleTracks=idle.channels.map(ch=>{const s=idle.samplers[ch.sampler],type=ch.target.path==='rotation'?QuaternionKeyframeTrack:VectorKeyframeTrack;return new type(`${nodes[ch.target.node].name}.${ch.target.path==='rotation'?'quaternion':ch.target.path==='translation'?'position':'scale'}`,values(s.input),values(s.output));});
  const idleClip=new AnimationClip('SourceIdle',-1,idleTracks),idleMixer=new AnimationMixer(nodes[0]);idleMixer.clipAction(idleClip).play();
  let walkStart;
  for(const name of ['OldCaneWalk','OldCaneHold']){
    const walk=name==='OldCaneWalk',sampleTimes=walk?times:Array.from({length:Math.ceil(idleClip.duration*30)+1},(_,i)=>Math.min(i/30,idleClip.duration));
    const rotations=nodes.map(()=>[]),translations=nodes.map(()=>[]);
    for(const [frame,time] of sampleTimes.entries()){
      if(walk)setSource(frame===sampleTimes.length-1?0:Math.min(time,source.clip.duration-1e-6));
      else{idleMixer.setTime(Math.min(time,idleClip.duration-1e-6));nodes[0].updateMatrixWorld(true);}
      const pose=walk?worldPose():hold;
      const nativePose=rig.pose(pose,sourceBind,walk?()=>true:rightArm,walk?undefined:nodes.map(n=>n.quaternion.clone()));
      for(const [index,node] of nodes.entries()){
        rotations[index].push(...nativePose[index].toArray());
        const position=walk?new Vector3().fromArray(model.json.nodes[index].translation??[0,0,0]):node.position.clone();
        if(walk&&index===hip){
          const p=source.bones.get('hip').getWorldPosition(new Vector3()).sub(sourceHip).multiplyScalar(ratio).add(hipStart);
          position.copy(node.parent.worldToLocal(p));
        }
        translations[index].push(...position.toArray());
      }
    }
    if(walk){const posed=objects(model.json);for(let i=0;i<posed.length;i++){posed[i].quaternion.fromArray(rotations[i],0);posed[i].position.fromArray(translations[i],0);}posed[0].updateMatrixWorld(true);walkStart=posed[hand].matrixWorld.clone();}
    const animation={name,channels:[],samplers:[]},input=accessor(sampleTimes,1);
    for(const [index,node] of nodes.entries()){
      if(model.json.nodes[index].mesh!==undefined)continue;
      for(const [property,data,size] of [['rotation',rotations[index],4],['translation',translations[index],3]]){
        if(property==='translation'&&index!==hip&&names[index]!=='root')continue;
        animation.channels.push({sampler:animation.samplers.push({input,output:accessor(data,size),interpolation:'LINEAR'})-1,target:{node:index,path:property}});
      }
    }
    json.animations.push(animation);
    console.log(`${id}: ${name}, ${sampleTimes.at(-1).toFixed(2)}s`);
  }
  idleMixer.stopAllAction();idleMixer.uncacheRoot(nodes[0]);
  // Only this mesh is exported; no source body, rig, outfit or other attachments.
  const geometry=source.handLocal.clone();
  const correction=handBind.clone().invert().setPosition(0,0,0).multiply(source.bind.get('hand_r').clone().setPosition(0,0,0)).multiply(new Matrix4().makeScale(ratio,ratio,ratio));
  geometry.applyMatrix4(correction);
  // Native skins have different arm/leg proportions. Fit length about the grip,
  // keeping a rigid attachment to hand_r and placing the planted tip on the floor.
  let tipY=Infinity;for(let i=0;i<geometry.attributes.position.count;i++)tipY=Math.min(tipY,new Vector3().fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(walkStart).y);
  const gripY=new Vector3().setFromMatrixPosition(walkStart).y,fit=gripY/(gripY-tipY);
  if(!Number.isFinite(fit)||fit<=0)throw new Error(`${id}: invalid native hand frame for cane attachment`);
  geometry.scale(fit,fit,fit);
  const propJson={asset:{version:'2.0',generator:'B.A.R. OldCane importer',extras:{source:'A_Male_Walk_OldCane.fbx',attachment:'hand_r',triangles:200}},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Acc_Male_Hand_Cane',mesh:0}],meshes:[{primitives:[]}],materials:[],accessors:[],bufferViews:[],buffers:[]};
  const chunks=[];let offset=0;
  const add=(data,size)=>{const array=Float32Array.from(data),b=Buffer.from(array.buffer),bufferView=propJson.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length})-1;chunks.push(b);offset+=b.length;const a={bufferView,componentType:5126,type:`VEC${size}`,count:array.length/size};if(size===3){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++){a.min[i%3]=Math.min(a.min[i%3],array[i]);a.max[i%3]=Math.max(a.max[i%3],array[i]);}}return propJson.accessors.push(a)-1;};
  const color=geometry.attributes.color,groups=new Map();
  const index=geometry.index?Array.from(geometry.index.array):Array.from({length:geometry.attributes.position.count},(_,i)=>i);
  for(let i=0;i<index.length;i+=3){const vertices=index.slice(i,i+3),first=vertices[0],r=color.getX(first),g=color.getY(first),b=color.getZ(first);
    const material=r>=g&&r>=b?'shaft':g>=b?'handle':new Vector3().fromBufferAttribute(source.handLocal.attributes.position,first).length()>.7?'rubber':'ring';
    if(!groups.has(material))groups.set(material,[]);groups.get(material).push(...vertices);
  }
  for(const [name,indices] of groups){const positions=[],normals=[];for(const i of indices){positions.push(...new Vector3().fromBufferAttribute(geometry.attributes.position,i).toArray());normals.push(...new Vector3().fromBufferAttribute(geometry.attributes.normal,i).toArray());}
    const material=propJson.materials.push({name:`Cane_${name}`,pbrMetallicRoughness:{baseColorFactor:{shaft:[.28,.12,.045,1],handle:[.12,.045,.018,1],ring:[.62,.49,.22,1],rubber:[.025,.028,.025,1]}[name],metallicFactor:name==='ring'?.8:0,roughnessFactor:name==='rubber'?.95:name==='ring'?.3:.65}})-1;
    propJson.meshes[0].primitives.push({attributes:{POSITION:add(positions,3),NORMAL:add(normals,3)},material});
  }
  fs.mkdirSync(props,{recursive:true});writeGlb(path.join(props,`old-cane-${id}.glb`),propJson,Buffer.concat(chunks));
}
