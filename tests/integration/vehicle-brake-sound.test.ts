import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {VEHICLE_CATALOG} from '@bar/shared';
import {brakeMix,BRAKE_CLIPS} from '../../apps/web/src/engine/vehicle-brake-sound.ts';

test('every vehicle brakes audibly in motion, never squeals at rest or under acceleration alone',()=>{
  for(const {model} of VEHICLE_CATALOG){
    assert.equal(brakeMix(false,20,5,model).level,0);
    assert.equal(brakeMix(true,0,0,model).level,0);
    assert.equal(brakeMix(true,.1,.1,model).level,0);
    assert.ok(brakeMix(true,5,0,model).level>0);
    assert.ok(brakeMix(true,-5,0,model).level>0);
    assert.ok(brakeMix(true,0,3,model).level>0);
    assert.ok(brakeMix(true,20,0,model).level>brakeMix(true,2,0,model).level);
    assert.equal(brakeMix(false,2,0,model).level,0);
  }
});
test('brake recordings ship in PCM 48 kHz with headroom and original source hashes',()=>{
  const base=new URL('../../apps/web/public/veiculos/sound/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
  assert.deepEqual(manifest.map((c:any)=>c.name),[...BRAKE_CLIPS]);
  for(const clip of manifest){
    const raw=readFileSync(new URL(clip.name+'.wav',base));
    assert.equal(raw.readUInt32LE(24),48000);assert.equal(raw.readUInt16LE(34),16);
    assert.equal(createHash('sha256').update(raw).digest('hex'),clip.sha256);
    const original=readFileSync(new URL(`../../assets-bar/sounds/veiculos/${clip.file}.wav`,import.meta.url));
    assert.equal(createHash('sha256').update(original).digest('hex'),clip.sourceSha256);
    const samples=Array.from({length:(raw.length-44)/2},(_,i)=>raw.readInt16LE(44+i*2)/32768);
    assert.ok(samples.every(v=>Math.abs(v)<.86));
    if(clip.loop){const delta=samples.slice(1).map((v,i)=>Math.abs(v-samples[i])).sort((a,b)=>a-b);assert.ok(Math.abs(samples[0]-samples.at(-1)!)<delta[Math.floor(delta.length*.999)]+.002);}
    else {assert.equal(samples[0],0);assert.equal(samples.at(-1),0);}
  }
});
