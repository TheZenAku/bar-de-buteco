// The supplied Tripo horse is rigged, but contains no animation. Bake a four-beat
// walk, a suspended four-beat gallop and a quiet idle onto its native rig.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Quaternion,Vector3} from 'three';
import {readGlb,writeGlb,objects} from './lib/character-gltf.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/skins/Tiao/cavalo/Cavalo.glb');
const {json,bin}=readGlb(source),nodes=objects(json),byName=new Map(nodes.map(n=>[n.name,n]));
const rest=nodes.map(n=>({p:n.position.clone(),q:n.quaternion.clone(),s:n.scale.clone()}));
const world=()=>{for(const index of json.scenes[json.scene??0].nodes)nodes[index].updateMatrixWorld(true);};
world();
const legs=[
  ['tripo::0_Left_Limb_0','tripo::0_Left_Limb_1','tripo::0_Left_Limb_2',0,.34],
  ['tripo::0_Right_Limb_0','tripo::0_Right_Limb_1','tripo::0_Right_Limb_2',.5,.48],
  ['tripo::1_Left_Limb_0','tripo::1_Left_Limb_1','tripo::1_Left_Limb_2',.75,0],
  ['tripo::1_Right_Limb_1','tripo::1_Right_Limb_2','tripo::1_Right_Limb_3',.25,.13],
].map(([a,b,c,phase,contact])=>{
  const upper=byName.get(a),lower=byName.get(b),end=byName.get(c);
  if(!upper||!lower||!end)throw new Error('Horse skeleton changed; review the limb mapping.');
  const pivot=upper.parent,at=end.getWorldPosition(new Vector3()),anchor=pivot.getWorldPosition(new Vector3()),hip=upper.getWorldPosition(new Vector3()),knee=lower.getWorldPosition(new Vector3());
  return {upper,lower,end,pivot,phase,contact,centerX:anchor.x,at,q:end.getWorldQuaternion(new Quaternion()),length:anchor.distanceTo(hip)+hip.distanceTo(knee)+knee.distanceTo(at)-.001};
});
function rotateWorld(node,q){const wanted=q.clone().multiply(node.getWorldQuaternion(new Quaternion()));node.quaternion.copy(node.parent.getWorldQuaternion(new Quaternion()).invert().multiply(wanted));world();}
function aim(node,from,to){rotateWorld(node,new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()));}
function reach({upper,lower,end,pivot,q},target,articulate=false){
  // Include the scapula / hip joint when galloping instead of crouching the entire torso.
  if(articulate){const anchor=pivot.getWorldPosition(new Vector3());aim(pivot,upper.getWorldPosition(new Vector3()).sub(anchor),target.clone().sub(anchor));}
  const a=upper.getWorldPosition(new Vector3()),b=lower.getWorldPosition(new Vector3()),c=end.getWorldPosition(new Vector3());
  const l1=a.distanceTo(b),l2=b.distanceTo(c),dir=target.clone().sub(a),d=Math.min(l1+l2-1e-5,Math.max(Math.abs(l1-l2)+1e-5,dir.length()));dir.normalize();
  // Front knees bend forward (-X), hind hocks back (+X).
  const pole=new Vector3(a.x<0?-1:1,0,0),bend=pole.addScaledVector(dir,-pole.dot(dir)).normalize();
  const cosine=Math.max(-1,Math.min(1,(l1*l1+d*d-l2*l2)/(2*l1*d)));
  const elbow=a.clone().addScaledVector(dir,l1*cosine).addScaledVector(bend,l1*Math.sqrt(1-cosine*cosine));
  aim(upper,b.sub(a),elbow.sub(a));
  const moved=lower.getWorldPosition(new Vector3());aim(lower,end.getWorldPosition(new Vector3()).sub(moved),a.addScaledVector(dir,d).sub(moved));
  end.quaternion.copy(end.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));world();
}
const chunks=[bin,Buffer.alloc((4-bin.length%4)%4)];let offset=chunks.reduce((n,b)=>n+b.length,0);
function accessor(values,size){const a=Float32Array.from(values),b=Buffer.from(a.buffer),view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length})-1;chunks.push(b);offset+=b.length;
  return json.accessors.push({bufferView:view,componentType:5126,count:a.length/size,type:size===1?'SCALAR':`VEC${size}`,...(size===1?{min:[values[0]],max:[values.at(-1)]}:{})})-1;}
json.animations=[];
const gaits={HorseWalk:{duration:.85,stance:.65,stride:.25,lift:.085},HorseGallop:{duration:.82,stance:.21,stride:.32,lift:.16}};
const softMin=(a,b)=>.5*(a+b-Math.hypot(a-b,.003));
function smoothHeights(frames){
  const raw=frames.slice(0,-1).map(f=>f.height),count=raw.length,kernel=Array.from({length:13},(_,i)=>Math.exp(-.5*((i-6)/3)**2)),sum=kernel.reduce((a,b)=>a+b,0);
  let heights=raw;
  for(let pass=0;pass<2;pass++)heights=heights.map((_,i)=>kernel.reduce((total,weight,j)=>total+weight*heights[(i+j-6+count)%count],0)/sum);
  // A shared clearance keeps the smoothed torso within every planted leg's reach.
  const clearance=Math.max(0,...heights.map((h,i)=>h-raw[i]))+.0002;
  heights=heights.map(h=>h-clearance);heights.push(heights[0]);return heights;
}
for(const [name,duration] of [['HorseIdle',4],...Object.entries(gaits).map(([name,gait])=>[name,gait.duration])]){
  const count=Math.ceil(duration*(name==='HorseGallop'?120:60)),times=Array.from({length:count+1},(_,i)=>duration*i/count),rotations=nodes.map(()=>[]),positions=nodes.map(()=>[]),frames=[];
  for(const t of times){
    nodes.forEach((n,i)=>{n.position.copy(rest[i].p);n.quaternion.copy(rest[i].q);n.scale.copy(rest[i].s);});world();
    const phase=t/duration*Math.PI*2,gait=gaits[name],galloping=name==='HorseGallop';
    // The walk bends the knees gently. The gallop uses the entire limb chain,
    // keeping the torso near its standing height with a little lift in suspension.
    const body=byName.get('tripo::Root');
    if(!galloping)body.position.y+=gait?-.04+.003*(1-Math.cos(phase*2)):-.003+.002*Math.sin(phase);
    world();
    if(galloping)rotateWorld(body,new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.018*Math.sin(phase)));
    rotateWorld(byName.get('tripo::Head_0'),new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.sin(phase)*(galloping?.04:gait?.025:.012)));
    rotateWorld(byName.get('tripo::Tail_0'),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),(galloping?.12:.04)*Math.sin(phase)));
    const targets=legs.map(leg=>{
      const target=leg.at.clone();
      if(gait){
        // Hind pair, then front pair, then suspension: a gallop rather than a sped-up walk.
        const p=((t/duration+(galloping?-leg.contact:leg.phase))%1+1)%1,{stance,stride,lift}=gait,swing=(p-stance)/(1-stance);
        if(galloping){
          // Hermite recovery matches the grounded hoof's velocity at lift-off and landing.
          const s=swing,s2=s*s,s3=s2*s,tangent=stride*(1-stance)/stance;
          target.x=leg.centerX+(p<stance?stride*(p/stance-.5):stride*(.5-3*s2+2*s3)+tangent*(2*s3-3*s2+s));
          target.y+=p<stance?0:lift*Math.sin(Math.PI*s)*(1+.35*Math.cos(Math.PI*s)**2);
        }else{
          target.x+=p<stance?stride*(p/stance-.5):stride*.5*Math.cos(Math.PI*swing);
          target.y+=p<stance?0:lift*Math.sin(Math.PI*swing);
        }
      }
      return target;
    });
    let height=0;
    if(galloping){
      const cycle=t/duration,flight=cycle>.70?Math.sin(Math.PI*(cycle-.70)/.30):0;
      height=-.004+.025*flight*flight;
      // Compress only as far as the current hoof contacts require. Never shorten bones
      // or pull the body down by a fixed amount to make an oversized stride reach.
      legs.forEach((leg,i)=>{
        const anchor=leg.pivot.getWorldPosition(new Vector3()),target=targets[i],dx=target.x-anchor.x,dz=target.z-anchor.z;
        height=softMin(height,target.y+Math.sqrt(Math.max(0,leg.length**2-dx*dx-dz*dz))-anchor.y);
      });
    }
    frames.push({targets,height,pose:nodes.map(n=>({p:n.position.clone(),q:n.quaternion.clone()}))});
  }
  const heights=name==='HorseGallop'?smoothHeights(frames):frames.map(f=>f.height);
  frames.forEach((frame,index)=>{
    nodes.forEach((n,i)=>{n.position.copy(frame.pose[i].p);n.quaternion.copy(frame.pose[i].q);});
    byName.get('tripo::Root').position.y+=heights[index];world();
    legs.forEach((leg,i)=>reach(leg,frame.targets[i],name==='HorseGallop'));
    nodes.forEach((n,i)=>{rotations[i].push(...n.quaternion.toArray());positions[i].push(...n.position.toArray());});
  });
  const animation={name,channels:[],samplers:[]},input=accessor(times,1);
  nodes.forEach((n,i)=>{if(json.nodes[i].mesh!==undefined)return;for(const [property,data,size] of [['rotation',rotations[i],4],['translation',positions[i],3]]){
    animation.channels.push({sampler:animation.samplers.push({input,output:accessor(data,size),interpolation:'LINEAR'})-1,target:{node:i,path:property}});
  }});json.animations.push(animation);
}
// Source faces -X. This single wrapper converts it to the game's +Z and metres.
const scale=2.4;
nodes.forEach((n,i)=>{n.position.copy(rest[i].p);n.quaternion.copy(rest[i].q);});world();
const spine=byName.get('tripo::Spine_1'),spineIndex=nodes.indexOf(spine);
const saddle=spine.worldToLocal(new Vector3(.025,.622,-.009));
const seat=json.nodes.push({name:'HorseSaddle',translation:saddle.toArray()})-1;
json.nodes[spineIndex].children??=[];json.nodes[spineIndex].children.push(seat);
for(const [side,z] of [['L',.045],['R',-.045]]){
  const head=byName.get('tripo::Head_0'),point=head.worldToLocal(new Vector3(-.455,.655,z));
  const index=json.nodes.push({name:`HorseRein${side}`,translation:point.toArray()})-1;
  json.nodes[nodes.indexOf(head)].children.push(index);
}
const wrapper=json.nodes.push({name:'Horse',rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray(),scale:[scale,scale,scale],children:json.scenes[json.scene??0].nodes})-1;
json.scenes[json.scene??0].nodes=[wrapper];
const pace=gait=>gait.stride*scale/(gait.duration*gait.stance);
json.asset.extras={...json.asset.extras,source:'assets-bar/skins/Tiao/cavalo/Cavalo.glb',animation:'B.A.R. native rig walk + upright gallop; full-limb IK; 120 Hz gallop',walkPace:pace(gaits.HorseWalk),gallopPace:pace(gaits.HorseGallop),gaits,saddle:'HorseSaddle'};
const output=path.join(root,'apps/web/public/mounts');fs.mkdirSync(output,{recursive:true});
writeGlb(path.join(output,'tiao-horse.glb'),json,Buffer.concat(chunks));
console.log(`Horse imported: idle + walk + gallop, ${json.nodes.length} nodes; paces ${pace(gaits.HorseWalk).toFixed(3)} / ${pace(gaits.HorseGallop).toFixed(3)} m/s`);
