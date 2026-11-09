// Writes packages/shared/src/fight-paths.ts: where each skin's fist goes while a punch can land, and the body it stands in, read from its animation bank.
// npm run assets:punches
//
// The room has no skeleton. It decides whether a punch landed from this table (docs/sistemas/luta.md), so a punch hits what the fist is drawn
// touching. Run it again whenever a punch's clip changes in convert-animations.mjs, or a skin is added; tests/integration/fight.test.ts checks that
// every player skin is here and that the windows still fit the clips.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const BANKS=process.env.BAR_ANIMATION_OUTPUT??path.join(root,'apps/web/public/animations');
const OUTPUT=path.join(root,'packages/shared/src/fight-paths.ts');
const STEP_MS=20;
/** The room's input step (TICK_MS in packages/shared): the body's way forward is sampled once per input. */
const TICK_MS=50;
/**
 * Which fist throws each punch, and the stretch of the clip (ms, as converted) written to the table: a little wider than the moments it can land
 * (FIGHT_MOVES.activeFrom/activeTo in packages/shared/src/fight.ts), so the room can sweep the whole way the fist went between two of its steps.
 */
const KICKERS=['rafael','rafael-rose'];
export const PUNCHES={
  Jab:{hand:'l',from:160,to:380,contact:300},
  Cross:{hand:'r',from:260,to:600,contact:480},
  Hook:{hand:'l',from:300,to:540,contact:425},
  Heavy:{hand:'r',from:520,to:800,contact:700},
  Elbow:{hand:'r',from:200,to:520,contact:330},
  // Rafael's kicks (his bank only): the ball is the ankle (`foot`), not the knuckles; the leg's thickness is FIGHT_MOVES' `radius`.
  Kick:{foot:'r',from:280,to:540,contact:415,only:KICKERS},
  KickHigh:{foot:'r',from:250,to:460,contact:355,only:KICKERS},
  KickFront:{foot:'l',from:340,to:555,contact:465,only:KICKERS},
};
// `contact`: where the punch is meant to land (its sweet spot). The aim turns the body so that this point of the fist's way meets the target, and the
// step in brings the target to this distance: a hook comes from the side and the haymaker from wide on the right, so neither lands straight ahead.
/** Where the fist's knuckles are: this share of the way from the wrist to the middle finger's first joint, and a little past it. */
const KNUCKLES=1.25;

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

/** One bank's clips as functions of time: where a bone is, in the avatar's axes (feet on the floor at y 0, +X its left, +Z its front). */
export function readBank(bytes){
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
  const clips=new Map();
  for(const animation of gltf.animations){
    const tracks=new Map();
    for(const channel of animation.channels){
      const sampler=animation.samplers[channel.sampler];
      if(!tracks.has(channel.target.node))tracks.set(channel.target.node,{});
      tracks.get(channel.target.node)[channel.target.path]={times:accessor(sampler.input),values:accessor(sampler.output),rotation:channel.target.path==='rotation'};
    }
    let duration=0,times;for(const track of tracks.values())for(const curve of Object.values(track)){duration=Math.max(duration,curve.times.at(-1));times??=curve.times;}
    // Root motion (convert-animations.mjs, `anchor`): how far the body itself has gone forward, one value per frame of the clip.
    const root=animation.extras?.root;
    clips.set(animation.name,{tracks,duration,root:root?{times,values:root.map(v=>[v]),rotation:false}:undefined});
  }
  const at=(clip,bone,ms)=>{
    const {tracks}=clips.get(clip),node=nodeNamed.get(bone);
    if(node===undefined)throw new Error(`no bone ${bone}`);
    const chain=[];for(let link=node;link!==undefined;link=parent.get(link))chain.unshift(link);
    let position=[0,0,0],turn=[0,0,0,1],scale=1;
    for(const link of chain){
      const data=gltf.nodes[link],track=tracks.get(link)??{};
      const translation=track.translation?sample(track.translation,ms/1000):data.translation??[0,0,0],rotation=track.rotation?sample(track.rotation,ms/1000):data.rotation??[0,0,0,1];
      const moved=rotate(turn,translation.map(v=>v*scale));
      position=[position[0]+moved[0],position[1]+moved[1],position[2]+moved[2]];turn=multiply(turn,rotation);scale*=(data.scale??[1,1,1])[0];
    }
    return position;
  };
  /** How far forward the clip carries the body `ms` into it (m; 0 for a clip that stays in place). */
  const travel=(clip,ms)=>{const root=clips.get(clip).root;return root?sample(root,ms/1000)[0]:0;};
  return {clips,at,travel};
}

const round=v=>+v.toFixed(3);
/** The knuckles of one hand, `ms` into a clip. */
export function fistAt(bank,clip,hand,ms){
  if(hand==='foot_l'||hand==='foot_r')return bank.at(clip,hand,ms);
  const wrist=bank.at(clip,`hand_${hand}`,ms);
  let finger;try{finger=bank.at(clip,`middle_01_${hand}`,ms);}catch{finger=bank.at(clip,`index_01_${hand}`,ms);}
  return wrist.map((v,k)=>v+(finger[k]-v)*KNUCKLES);
}

/** The table for one skin's bank: each punch's knuckles every STEP_MS, and the body standing in the guard (hips and head heights). */
export function measurePunches(bytes,id){
  const bank=readBank(bytes);
  if(!bank.clips.has('FightIdle'))return undefined;
  const hip=bank.at('FightIdle','hip',0),head=bank.at('FightIdle','head',0);
  const moves={};
  for(const [clip,{hand:fist_hand,foot,from,to,contact,only}] of Object.entries(PUNCHES)){
    if(only&&!only.includes(id))continue;
    const hand=foot?`foot_${foot}`:fist_hand;
    if(!bank.clips.has(clip))throw new Error(`the bank has no ${clip}`);
    const fist=[];
    for(let ms=from;ms<=to;ms+=STEP_MS)fist.push(...fistAt(bank,clip,hand,ms).map(round));
    // The sweet spot as it lands, with the way the body has gone by then (the clip stays in place, the room moves the body).
    const sweet=fistAt(bank,clip,hand,contact);sweet[2]+=bank.travel(clip,contact);
    const root=[];for(let ms=0;ms<=bank.clips.get(clip).duration*1000+1e-6;ms+=TICK_MS)root.push(round(bank.travel(clip,ms)));
    // `aim`: how far from the target the body turns (radians; + turns it to its left, so a fist landing on its right meets the target); `reach`: how far ahead the sweet spot is (m).
    moves[clip]={from,step:STEP_MS,fist,aim:round(-Math.atan2(sweet[0],sweet[2])),reach:round(Math.hypot(sweet[0],sweet[2])),height:round(sweet[1]),root};
  }
  return {hip:round(hip[1]),head:round(head[1]),moves};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const probe=process.argv.includes('--probe');
  const bodies={};
  for(const file of fs.readdirSync(BANKS).filter(file=>file.endsWith('.glb')&&!file.endsWith('-dances.glb')).sort()){
    const id=file.slice(0,-4),bytes=fs.readFileSync(path.join(BANKS,file));
    if(probe){
      if(id!==process.argv[process.argv.indexOf('--probe')+1])continue;
      const bank=readBank(bytes);
      for(const [clip,{hand:fist_hand,foot,only}] of Object.entries(PUNCHES)){
        if(only&&!only.includes(id))continue;
        const hand=foot?`foot_${foot}`:fist_hand;
        console.log(`\n${clip} (${hand}) ${Math.round(bank.clips.get(clip).duration*1000)} ms`);
        let last;
        for(let ms=0;ms<=bank.clips.get(clip).duration*1000;ms+=20){
          const p=fistAt(bank,clip,hand,ms),speed=last?Math.hypot(p[0]-last[0],p[1]-last[1],p[2]-last[2])/.02:0;last=p;
          console.log(`${String(ms).padStart(5)} x ${p[0].toFixed(2)} y ${p[1].toFixed(2)} z ${p[2].toFixed(2)} v ${speed.toFixed(1)}`);
        }
      }
      process.exit(0);
    }
    const table=measurePunches(bytes,id);
    if(table)bodies[id]=table;
  }
  const lines=Object.entries(bodies).map(([id,{hip,head,moves}])=>`  '${id}':{hip:${hip},head:${head},moves:{\n${Object.entries(moves).map(([clip,{from,step,fist,aim,reach,height,root}])=>`    ${clip}:{from:${from},step:${step},aim:${aim},reach:${reach},height:${height},fist:[${fist.join(',')}],root:[${root.join(',')}]},`).join('\n')}\n  }},`);
  fs.writeFileSync(OUTPUT,`// Generated by tools/assets/measure-punches.mjs (npm run assets:punches) from each skin's animation bank. Do not edit by hand.
/**
 * Where a punch's knuckles go, x, y, z in a row every \`step\` ms from \`from\` ms into its clip, in the avatar's axes: feet on the floor at y 0, +X its left,
 * +Z its front, where the body is at that moment. Its sweet spot: the body turns \`aim\` radians off the target for it to land there (+ to its left),
 * \`reach\` metres ahead of where the punch started, \`height\` up. \`root\`: how far forward the punch carries the body itself (m), every TICK_MS from
 * the throw (root motion: the clip stays in place and the room moves the body, punchStep).
 */
export interface FistPath {from:number;step:number;aim:number;reach:number;height:number;fist:readonly number[];root:readonly number[]}
/** A skin in the guard: how high its hips and head joint are (m), and its punches. */
export interface FightBody {hip:number;head:number;moves:Readonly<Record<string,FistPath>>}
export const FIGHT_BODIES:Readonly<Record<string,FightBody>>={
${lines.join('\n')}
};
`);
  console.log(`${path.relative(root,OUTPUT)}: ${Object.keys(bodies).join(', ')}`);
}
