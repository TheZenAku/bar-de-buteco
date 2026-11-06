import type {Clip,Curve} from './mixamo-retarget';

/**
 * The bar clips come out of Blender's IK with the forearm roll free to land on either side of a half turn: between two
 * frames the forearm twists 178° about its own axis and the hand twists back, so the hand ends up where it was but the
 * arm's skin wrings like a candy wrapper (Magrão's left arm taking the freezer lid, 0.1 s apart, twice). The same
 * pose has a continuous twin: carry the half turn from the forearm over to the hand, frame by frame, so the roll
 * never jumps (the forearm turns the short way, the hand's world rotation is untouched).
 */
const ARMS:readonly (readonly [forearm:string,hand:string])[]=[['lowerarm_l','hand_l'],['lowerarm_r','hand_r']];
const ROT='localRotation';

/** a·b for quaternions (x, y, z, w) in arrays at the given offsets. */
function multiply(a:ArrayLike<number>,ai:number,b:ArrayLike<number>,bi:number,out:Float32Array,oi:number){
  const ax=a[ai]!,ay=a[ai+1]!,az=a[ai+2]!,aw=a[ai+3]!,bx=b[bi]!,by=b[bi+1]!,bz=b[bi+2]!,bw=b[bi+3]!;
  out[oi]=aw*bx+ax*bw+ay*bz-az*by;out[oi+1]=aw*by-ax*bz+ay*bw+az*bx;out[oi+2]=aw*bz+ax*by-ay*bx+az*bw;out[oi+3]=aw*bw-ax*bx-ay*by-az*bz;
}

/**
 * How many half turns (-1, 0 or 1, per frame) keep a forearm's roll about its own (Y) axis continuous, the first frame
 * staying as it is. The twist is read from the form of the quaternion with w ≥ 0 (the sign of a quaternion is free).
 */
export function rollHalfTurns(values:ArrayLike<number>,frames:number):Int8Array {
  const turns=new Int8Array(frames);
  let previous=0;
  for(let f=0;f<frames;f++){
    const sign=values[f*4+3]!<0?-1:1,twist=2*Math.atan2(sign*values[f*4+1]!,sign*values[f*4+3]!);
    let best=0,distance=Infinity;
    if(f===0)distance=0;
    else for(const k of [-1,0,1]){const d=Math.abs(twist+k*Math.PI-previous);if(d<distance){distance=d;best=k;}}
    turns[f]=best;
    previous=twist+best*Math.PI;
  }
  return turns;
}

/** The clip with each forearm's half-turn jumps carried over to its hand. Returns how many frames it changed. */
export function unflipForearms(clip:Clip):number {
  let changed=0;
  for(const [forearm,hand] of ARMS){
    const a=clip.bones.get(`${forearm}.${ROT}`),b=clip.bones.get(`${hand}.${ROT}`);
    if(!a||!b||a.size!==4||b.size!==4||a.cubic||b.cubic||a.step||b.step||a.times.length!==b.times.length)continue;
    const frames=a.times.length,turns=rollHalfTurns(a.values,frames);
    if(!turns.some(Boolean))continue;
    const arm=new Float32Array(a.values),palm=new Float32Array(b.values);
    for(let f=0;f<frames;f++){
      const k=turns[f]!;
      if(!k)continue;
      const half=new Float32Array([0,k,0,0]),back=new Float32Array([0,-k,0,0]);
      multiply(a.values,f*4,half,0,arm,f*4);
      multiply(back,0,b.values,f*4,palm,f*4);
      changed++;
    }
    const set=(name:string,source:Curve,values:Float32Array)=>clip.bones.set(`${name}.${ROT}`,{...source,values});
    set(forearm,a,arm);set(hand,b,palm);
  }
  return changed;
}
