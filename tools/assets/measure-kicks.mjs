// Writes packages/shared/src/kick-paths.ts: where Rafael's hips and feet go while a kick can land, read from his animation bank. npm run assets:kicks
//
// The room has no skeleton. It decides whether a kick landed from this table, so a kick hits what the foot is drawn touching. Run it again
// whenever a kick's clip changes (AirKick is still a stand-in, see docs/sistemas/perfil.md); tests/integration/kick.test.ts fails until then.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const BANK=path.join(root,'apps/web/public/animations/rafael.glb');
const OUTPUT=path.join(root,'packages/shared/src/kick-paths.ts');
const STEP_MS=50;
// While the foot is on its way and up (ms): before that it is still on the floor, after that it is coming back.
const KICKS={
  Kick:{from:270,to:570,feet:['foot_r']},
  AirKick:{from:900,to:1450,feet:['foot_l','foot_r']},
};

const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rotate=(q,v)=>{
  const [x,y,z,w]=q,tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);
  return [v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx];
};
function sample(track,time){
  const {times,values,rotation}=track;
  if(time<=times[0])return values[0];
  if(time>=times[times.length-1])return values[values.length-1];
  let i=0;while(times[i+1]<time)i++;
  const f=(time-times[i])/(times[i+1]-times[i]),a=values[i],b=values[i+1];
  if(!rotation)return a.map((v,k)=>v+(b[k]-v)*f);
  const sign=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]<0?-1:1,mixed=a.map((v,k)=>v+(sign*b[k]-v)*f),size=Math.hypot(...mixed);
  return mixed.map(v=>v/size);
}

/** The table, from the bytes of a skin's animation bank: forward kinematics over the clip's own curves, in the avatar's axes (+Z is its front). */
export function measureKicks(bytes){
  const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binary=20+jsonLength+8;
  const accessor=index=>{
    const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4}[a.type],start=binary+(view.byteOffset??0)+(a.byteOffset??0),out=[];
    for(let k=0;k<a.count;k++){
      const item=[];for(let c=0;c<size;c++)item.push(bytes.readFloatLE(start+(k*size+c)*4));
      out.push(size===1?item[0]:item);
    }
    return out;
  };
  const parent=new Map();
  gltf.nodes.forEach((node,index)=>(node.children??[]).forEach(child=>parent.set(child,index)));
  const nodeNamed=new Map(gltf.nodes.map((node,index)=>[node.name,index]));
  const table={};
  for(const [clip,{from,to,feet}] of Object.entries(KICKS)){
    const animation=gltf.animations.find(item=>item.name===clip);
    if(!animation)throw new Error(`rafael.glb has no clip ${clip}`);
    const tracks=new Map();
    for(const channel of animation.channels){
      const sampler=animation.samplers[channel.sampler];
      if(!tracks.has(channel.target.node))tracks.set(channel.target.node,{});
      tracks.get(channel.target.node)[channel.target.path]={times:accessor(sampler.input),values:accessor(sampler.output),rotation:channel.target.path==='rotation'};
    }
    const worldAt=(node,time)=>{
      const chain=[];for(let at=node;at!==undefined;at=parent.get(at))chain.unshift(at);
      let position=[0,0,0],turn=[0,0,0,1],scale=1;
      for(const link of chain){
        const data=gltf.nodes[link],track=tracks.get(link)??{};
        const translation=track.translation?sample(track.translation,time):data.translation??[0,0,0],rotation=track.rotation?sample(track.rotation,time):data.rotation??[0,0,0,1];
        const moved=rotate(turn,translation.map(v=>v*scale));
        position=[position[0]+moved[0],position[1]+moved[1],position[2]+moved[2]];turn=multiply(turn,rotation);scale*=(data.scale??[1,1,1])[0];
      }
      return position;
    };
    const way=bone=>{
      const node=nodeNamed.get(bone);
      if(node===undefined)throw new Error(`rafael.glb has no bone ${bone}`);
      const path=[];
      for(let ms=from;ms<=to;ms+=STEP_MS)path.push(...worldAt(node,ms/1000).map(v=>+v.toFixed(3)));
      return path;
    };
    // Root motion: where the clip carries the body (forward, and to its left), every TICK_MS from the start, as the room moves it.
    const times=accessor(animation.samplers[0].input),last=times.at(-1),along=values=>{
      if(!values)return undefined;
      const out=[];for(let ms=0;ms<=last*1000+1e-6;ms+=50)out.push(+sample({times,values:values.map(v=>[v]),rotation:false},ms/1000)[0].toFixed(4));
      return out;
    };
    table[clip]={from,step:STEP_MS,hip:way('hip'),feet:feet.map(way),root:along(animation.extras?.root)??[0],...(animation.extras?.rootX?{rootX:along(animation.extras.rootX)}:{})};
  }
  return table;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const table=measureKicks(fs.readFileSync(BANK));
  const lines=Object.entries(table).map(([clip,{from,step,hip,feet,root,rootX}])=>`  ${clip}:{from:${from},step:${step},hip:[${hip.join(',')}],feet:[\n${feet.map(foot=>`    [${foot.join(',')}],`).join('\n')}\n  ],root:[${root.join(',')}]${rootX?`,rootX:[${rootX.join(',')}]`:''}},`);
  fs.writeFileSync(OUTPUT,`// Generated by tools/assets/measure-kicks.mjs (npm run assets:kicks) from Rafael's animation bank. Do not edit by hand.
/** The hips' and each kicking foot's way through a kick, x, y, z in a row every \`step\` ms from \`from\`, in the avatar's axes: feet on the floor at y 0, +X its left, +Z its front. */
/** \`root\` (and \`rootX\`, to its left): where the clip carries the body itself, every 50 ms from the start (root motion: the room moves the body, the ways above are from where it is). */
export interface KickPath {from:number;step:number;hip:readonly number[];feet:readonly (readonly number[])[];root:readonly number[];rootX?:readonly number[]}
export const KICK_PATHS:Record<string,KickPath>={
${lines.join('\n')}
};
`);
  console.log(`${path.relative(root,OUTPUT)}: ${Object.keys(table).join(', ')}`);
}
