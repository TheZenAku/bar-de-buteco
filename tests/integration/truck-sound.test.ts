import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {truckEngineMix,TRUCK_CLIPS} from '../../apps/web/src/engine/truck-sound.ts';

test('diesel gears drop RPM at upshifts, reverse has its own gear and throttle raises stationary RPM',()=>{
  assert.equal(truckEngineMix(false,12,1).rpm,0);
  assert.equal(truckEngineMix(false,12,1).drive,0);
  assert.ok(truckEngineMix(true,0,1).rpm>truckEngineMix(true,0,0).rpm);
  assert.ok(truckEngineMix(true,12.9/3.6,1).rpm>truckEngineMix(true,13.1/3.6,1).rpm);
  assert.equal(truckEngineMix(true,-2,1).gear,-1);
  assert.equal(truckEngineMix(true,23,1).gear,6);
  for(let speed=-5;speed<40;speed+=.1){const mix=truckEngineMix(true,speed,1);assert.ok(mix.rate>=.85&&mix.rate<=1.14);assert.ok(mix.idle>=0&&mix.drive<=.58);}
});

test('shipped truck recordings preserve lossless 48 kHz PCM, headroom and clean loop joins',()=>{
  const base=new URL('../../apps/web/public/caminhao/sound/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
  assert.deepEqual(manifest.map((v:any)=>v.name).sort(),[...TRUCK_CLIPS].sort());
  assert.equal(manifest.find((v:any)=>v.name==='carga').file,'1146','Acceleration uses the replacement recording');
  for(const clip of manifest){
    const raw=readFileSync(new URL(clip.name+'.wav',base));
    assert.equal(createHash('sha256').update(raw).digest('hex'),clip.sha256);
    assert.equal(raw.readUInt32LE(24),48000);assert.equal(raw.readUInt16LE(34),16);assert.equal(raw.readUInt16LE(22),1);
    const samples=Array.from({length:(raw.length-44)/2},(_,i)=>raw.readInt16LE(44+i*2)/32768);
    const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);
    assert.ok(rms>.04&&rms<.26,`${clip.name}: audible, controlled recording`);
    assert.ok(samples.every(v=>Math.abs(v)<.89),`${clip.name}: headroom`);
    if(clip.loop){
      const delta=samples.slice(1).map((v,i)=>Math.abs(v-samples[i])).sort((a,b)=>a-b);
      assert.ok(Math.abs(samples[0]-samples.at(-1)!)<=delta[Math.floor(delta.length*.999)]+.002,`${clip.name}: join within normal waveform changes`);
    }else{assert.equal(samples[0],0);assert.equal(samples.at(-1),0);}
  }
});
