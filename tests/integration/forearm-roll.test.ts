import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rollHalfTurns,unflipForearms} from '../../apps/web/src/engine/forearm-roll';

/** Reads one animation of a GLB as {bone.localRotation: {times, values}} (Float32 accessors only: all the bar clips are baked). */
function readRotations(file:string,clip:string){
  const buffer=readFileSync(new URL(`../../assets-bar/map/BarBoteco/export/animacoes/${file}`,import.meta.url));
  const jsonLength=buffer.readUInt32LE(12),json=JSON.parse(buffer.subarray(20,20+jsonLength).toString()),bin=buffer.subarray(20+jsonLength+8);
  const read=(index:number)=>{
    const accessor=json.accessors[index],view=json.bufferViews[accessor.bufferView],size={SCALAR:1,VEC3:3,VEC4:4}[accessor.type as 'SCALAR'|'VEC3'|'VEC4'];
    const offset=(view.byteOffset??0)+(accessor.byteOffset??0),out=new Float32Array(accessor.count*size);
    for(let i=0;i<out.length;i++)out[i]=bin.readFloatLE(offset+i*4);
    return out;
  };
  const animation=json.animations.find((a:{name:string})=>a.name===clip),bones=new Map<string,{times:Float32Array;values:Float32Array;size:number;cubic:boolean;step:boolean}>();
  for(const channel of animation.channels){
    if(channel.target.path!=='rotation')continue;
    const sampler=animation.samplers[channel.sampler],name:string=json.nodes[channel.target.node].name;
    bones.set(`${name.replace(/^mixamorig:/,'')}.localRotation`,{times:read(sampler.input),values:read(sampler.output),size:4,cubic:false,step:false});
  }
  return bones;
}
/** Names the bar clips' retarget uses (mixamo-retarget boneName). */
const canonical=new Map([['LeftForeArm','lowerarm_l'],['LeftHand','hand_l'],['RightForeArm','lowerarm_r'],['RightHand','hand_r']]);
function clipOf(file:string,name:string){
  const bones=new Map<string,ReturnType<typeof readRotations> extends Map<string,infer C>?C:never>();
  for(const [key,curve] of readRotations(file,name)){const [bone,path]=key.split('.') as [string,string];bones.set(`${canonical.get(bone)??bone}.${path}`,curve);}
  return {name,duration:0,bones};
}
const angle=(a:ArrayLike<number>,i:number,b:ArrayLike<number>,j:number)=>{
  const dot=a[i]!*b[j]!+a[i+1]!*b[j+1]!+a[i+2]!*b[j+2]!+a[i+3]!*b[j+3]!;return 2*Math.acos(Math.min(1,Math.abs(dot)))*180/Math.PI;
};
const biggestStep=(values:ArrayLike<number>)=>{let top=0;for(let f=1;f<values.length/4;f++)top=Math.max(top,angle(values,f*4,values,(f-1)*4));return top;};
const multiply=(a:ArrayLike<number>,i:number,b:ArrayLike<number>,j:number)=>{
  const ax=a[i]!,ay=a[i+1]!,az=a[i+2]!,aw=a[i+3]!,bx=b[j]!,by=b[j+1]!,bz=b[j+2]!,bw=b[j+3]!;
  return [aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz];
};

test('Magrão taking the long neck: the left forearm no longer wrings by a half turn between two frames, and the hand ends up exactly where it was', () => {
  const clip=clipOf('bar_magrao.glb','magrao_longneck'),arm=clip.bones.get('lowerarm_l.localRotation')!,palm=clip.bones.get('hand_l.localRotation')!;
  assert.ok(biggestStep(arm.values)>150,'the authored clip has the jump (frames 107→108 and 114→115)');
  const handWorld=(f:number,a:ArrayLike<number>,h:ArrayLike<number>)=>multiply(a,f*4,h,f*4);
  const before=Array.from({length:400},(_,f)=>handWorld(f,arm.values,palm.values));
  assert.ok(unflipForearms(clip)>0);
  const fixed=clip.bones.get('lowerarm_l.localRotation')!,fixedPalm=clip.bones.get('hand_l.localRotation')!;
  assert.ok(biggestStep(fixed.values)<60,`forearm steps at most ${biggestStep(fixed.values).toFixed(1)}°`);
  assert.ok(biggestStep(fixedPalm.values)<60,`hand steps at most ${biggestStep(fixedPalm.values).toFixed(1)}°`);
  for(let f=0;f<400;f++){
    const now=handWorld(f,fixed.values,fixedPalm.values);
    assert.ok(angle(before[f]!,0,now,0)<.2,`frame ${f}: the hand keeps its world rotation`);
  }
});

test('forearm roll: a smooth arm is left alone, a jump is carried over frame by frame', () => {
  const turn=(degrees:number)=>{const h=degrees*Math.PI/360;return [0,Math.sin(h),0,Math.cos(h)];};
  assert.deepEqual([...rollHalfTurns(new Float32Array([...turn(-60),...turn(-70),...turn(-80),...turn(-90)]),4)],[0,0,0,0]);
  // -88° then +90° (a 178° jump), then back at -84°.
  assert.deepEqual([...rollHalfTurns(new Float32Array([...turn(-88),...turn(90),...turn(88),...turn(-84)]),4)],[0,-1,-1,0]);
});
