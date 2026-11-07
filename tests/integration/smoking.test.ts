import {test} from 'node:test';import assert from 'node:assert/strict';
import {SMOKING,smokingTimeline} from '@bar/shared';
test('lighting, persistent mouth attachment, occasional puffs and extinguishing use the room clock',()=>{
  const since=10000,s={smokingSince:since};
  assert.equal(smokingTimeline({},since).phase,'off');
  assert.equal(smokingTimeline(s,since+400).phase,'lighting');
  assert.ok(smokingTimeline(s,since+2200).flame>.9);
  assert.equal(smokingTimeline(s,since+SMOKING.lightMs).phase,'lit');
  for(let t=SMOKING.lightMs;t<90000;t+=50){const p=smokingTimeline(s,since+t,'actor');assert.equal(p.right,0);assert.equal(p.left,0);assert.equal(p.mouth,1);assert.equal(p.phase,'lit');}
  const phases=Array.from({length:1600},(_,i)=>smokingTimeline(s,since+SMOKING.lightMs+i*50,'actor'));
  assert.ok(phases.some(p=>p.inhale>.9));assert.ok(phases.some(p=>p.exhale>.9));
  assert.ok(phases.filter(p=>p.exhale>0).length<phases.length*.2,'Puffs are occasional, not a continuous cloud');
  const stop=since+20000;assert.equal(smokingTimeline({...s,smokingStopAt:stop},stop+400).phase,'extinguishing');
  assert.equal(smokingTimeline({...s,smokingStopAt:stop},stop+SMOKING.putOutMs).phase,'off');
  assert.equal(smokingTimeline({...s,smokingStopAt:since+SMOKING.lightMs},since+1000).phase,'lighting','An early second F finishes lighting before taking it out');
});
