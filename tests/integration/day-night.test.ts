import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY_NIGHT,daylightAt,gameHour} from '../../apps/web/src/engine/day-night';
import {CITY_FOG,cityFog} from '@bar/shared';
const at=(hour:number)=>DAY_NIGHT.epochMs+(hour-DAY_NIGHT.offsetHours)/24*DAY_NIGHT.durationMs;
test('day-night clock is periodic, deterministic and handles negative times',()=>{
  for(const hour of [0,5.5,6,12,17.5,18,23.99]){
    assert.ok(Math.abs(gameHour(at(hour))-hour)<1e-8);
    assert.ok(Math.abs(gameHour(at(hour)+DAY_NIGHT.durationMs*100)-hour)<1e-8);
    assert.ok(Math.abs(gameHour(at(hour)-DAY_NIGHT.durationMs)-hour)<1e-8);
  }
});
test('sun rises in the east, lights from above, sets in the west and never shines up from below the ground',()=>{
  const morning=daylightAt(at(7)),noon=daylightAt(at(12)),evening=daylightAt(at(17)),midnight=daylightAt(at(0));
  assert.ok(morning.sunDirection[0]>.9);assert.ok(evening.sunDirection[0]<-.9);
  assert.ok(noon.sunDirection[1]>.9&&noon.sunDirection[2]>.3);
  assert.equal(midnight.sunIntensity,0);assert.ok(midnight.moonIntensity>0);
  for(let hour=0;hour<24;hour+=.02){const s=daylightAt(at(hour));assert.ok(Math.abs(Math.hypot(...s.sunDirection)-1)<1e-8);if(s.sunDirection[1]<=0)assert.equal(s.sunIntensity,0);if(s.moonDirection[1]<=0)assert.equal(s.moonIntensity,0);}
});
test('lighting, sky and fog change continuously including the midnight seam',()=>{
  for(let hour=0;hour<24;hour+=.05){
    const a=daylightAt(at(hour)),b=daylightAt(at(hour+.001));
    for(const key of ['sunIntensity','moonIntensity','night','exposure'] as const)assert.ok(Math.abs(a[key]-b[key])<.02);
    // Distances are hundreds of metres on the expanded map; continuity is measured at that scale.
    const fogA=cityFog(a.night),fogB=cityFog(b.night);
    for(const key of ['start','end'] as const)assert.ok(Math.abs(fogA[key]-fogB[key])<.25);
    for(const key of ['top','horizon','ambient','sunColor'] as const)for(let i=0;i<3;i++)assert.ok(Math.abs(a[key][i]-b[key][i])<.01);
    assert.ok(fogA.end>fogA.start&&fogA.start>=80&&fogA.start<=CITY_FOG.start&&fogA.end>=540&&fogA.end<=CITY_FOG.end);
  }
  assert.deepEqual(daylightAt(at(0)),daylightAt(at(24)));
});
test('the day takes the fog the city was authored with, and the night closes it in a little',()=>{
  const noon=cityFog(daylightAt(at(12)).night),midnight=cityFog(daylightAt(at(0)).night);
  assert.deepEqual(noon,CITY_FOG);
  assert.ok(midnight.end<noon.end&&midnight.start<noon.start);
});
