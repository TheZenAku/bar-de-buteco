import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {polishWalkCycle} from '../../tools/assets/lib/walk-cycle.mjs';
import {readGlb} from '../../tools/assets/lib/character-gltf.mjs';
import {walkPlaybackRate,walkTransitionSeconds} from '../../apps/web/src/engine/walk-playback.ts';

const values=(g,index)=>{
  const a=g.json.accessors[index],view=g.json.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4}[a.type];
  return Array.from({length:a.count*size},(_,i)=>g.bin.readFloatLE((view.byteOffset??0)+(a.byteOffset??0)+i*4));
};
const velocity=(a,b,dt)=>{
  const q=a.clone().invert().multiply(b);if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
  return new Vector3(q.x,q.y,q.z).multiplyScalar(2/dt);
};

test('walk interpolation rounds the angular motion, closes the seam and keeps pelvis height within its authored range',()=>{
  const rotations=[0,.6,0,-.6,0].flatMap((angle,i)=>{
    const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle);
    // Source exporters can alternate quaternion signs without changing the pose.
    return q.toArray().map(v=>i%2?-v:v);
  });
  const result=polishWalkCycle([0,.25,.5,.75,1],[rotations],[[0,1,0,0,1.04,0,0,1,0,0,.96,0,0,1,0]]);
  assert.equal(result.duration,1.2);assert.equal(result.times.length,73);
  const q=i=>new Quaternion().fromArray(result.rotations[0],i*4),last=result.times.length-1;
  assert.ok(q(0).angleTo(q(last))<1e-7);
  assert.ok(velocity(q(0),q(1),1/60).distanceTo(velocity(q(last-1),q(last),1/60))<1e-5,'angular velocity continues through the seam');
  const half=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.3);
  assert.ok(q(9).angleTo(half)>.02,'intermediate poses use spherical cubic motion instead of duplicating linear source keys');
  for(let i=0;i<=last;i++){
    assert.ok(Math.abs(q(i).length()-1)<1e-8);
    if(i)assert.ok(q(i-1).dot(q(i))>0,'keys take the short way around');
    const height=result.translations[0][i*3+1];assert.ok(height>=.96-1e-8&&height<=1.04+1e-8,'no extra hip bounce');
  }
});

for(const skin of ['nathan','leandro','rafael','rafael-rose','read','magrao','tonico','gilmar-gordo','gabriel','flavio-hipotetico','tiao','primo']){
  test(`${skin}: walk has 85 poses at 60 Hz, a 1.4-second cycle and smooth rotation across its loop`,()=>{
    const g=readGlb(new URL(`../../apps/web/public/animations/${skin}.glb`,import.meta.url));
    const raw=g.json.animations.find(a=>a.name==='Walk');assert.ok(raw);
    for(const channel of raw.channels){
      const sampler=raw.samplers[channel.sampler],times=values(g,sampler.input),data=values(g,sampler.output);
      assert.equal(times.length,85);assert.ok(Math.abs(times.at(-1)-1.4)<1e-6);
      for(let i=1;i<times.length;i++)assert.ok(Math.abs(times[i]-times[i-1]-1/60)<1e-6);
      assert.ok(data.every(Number.isFinite));
      if(channel.target.path!=='rotation')continue;
      const q=i=>new Quaternion().fromArray(data,i*4),last=times.length-1;
      assert.ok(q(0).angleTo(q(last))<.001);
      const jump=velocity(q(0),q(1),1/60).distanceTo(velocity(q(last-1),q(last),1/60));
      assert.ok(jump<1.1,`${g.json.nodes[channel.target.node].name}: abrupt angular velocity change at the seam (${jump})`);
    }
  });
}

test('walk cadence accelerates and slows gradually without depending on render frame rate',()=>{
  const at=fps=>{let rate;for(let i=0;i<fps;i++)rate=walkPlaybackRate(rate,3.5,1/fps);return rate;};
  assert.ok(Math.abs(at(30)-at(144))<1e-10);
  const first=walkPlaybackRate(undefined,3.5,1/60);
  assert.ok(first>.5&&first<.7,'first frame eases into walking instead of immediately reaching the maximum cadence');
  const slower=walkPlaybackRate(2.2,1,1/60);
  assert.ok(slower<2.2&&slower>2,'a slower movement snapshot does not snap the legs to a new cadence');
  assert.equal(walkPlaybackRate(1,3.5,0),1);
  assert.ok(at(60)<=2.2);
});

test('walking blends ease starts and stops while respecting action-specific transition timings',()=>{
  assert.equal(walkTransitionSeconds('Idle','Walk'),.32);
  assert.equal(walkTransitionSeconds('Walk','Idle'),.28);
  assert.equal(walkTransitionSeconds('Run','Walk'),.32);
  for(const action of ['Bar fumar_loop','Sit','Palco tocar','Kick','Drink']){
    assert.equal(walkTransitionSeconds(action,'Walk'),undefined);
    assert.equal(walkTransitionSeconds('Walk',action),undefined);
  }
});
