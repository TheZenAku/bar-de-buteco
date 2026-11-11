import assert from 'node:assert/strict';
import test from 'node:test';
import {FootContacts} from '../../apps/web/src/engine/foot-contact.ts';

/** Ankle height above the root over a gait cycle: one foot lifts while the other is planted, half a cycle apart. */
const ankle=(phase:number,lift:number)=>.08+lift*Math.max(0,Math.sin(phase*Math.PI*2));

for(const [gait,lift,seconds] of [['walk',.14,1.4],['jog',.3,1.03],['run',.4,.73]] as const){
  test(`${gait}: one step per touchdown, two per cycle, at any frame rate`,()=>{
    for(const fps of [30,60,144]){
      const feet=new FootContacts();let at:number[]=[];
      const frames=Math.round(fps*seconds*5);
      for(let f=0;f<frames;f++){
        const phase=f/fps/seconds;
        if(feet.sample(ankle(phase,lift),ankle(phase+.5,lift)))at.push(f/fps);
      }
      // The first cycle only learns where the planted ankle is.
      const steps=at.filter(t=>t>seconds);
      assert.ok(Math.abs(steps.length-8)<=1,`${gait} at ${fps} fps: ${steps.length} steps in 4 cycles`);
      for(let i=1;i<steps.length;i++)assert.ok(Math.abs(steps[i]!-steps[i-1]!-seconds/2)<2/fps+.01,`${gait} steps are evenly spaced`);
    }
  });
}

test('a new clip forgets the planted height of the last one, so its touchdowns still count',()=>{
  const feet=new FootContacts();
  // Walk plants the ankle low; Run's planted ankle sits higher and would never come back within reach of it.
  for(let f=0;f<60;f++)feet.sample(.08,.08,'Walk');
  let steps=0;
  for(let f=0;f<200;f++){const phase=f/60/.73;if(feet.sample(.2+.3*Math.max(0,Math.sin(phase*Math.PI*2)),.2+.3*Math.max(0,Math.sin((phase+.5)*Math.PI*2)),'Run'))steps++;}
  assert.ok(steps>=4,`${steps} steps in Run after Walk`);
});

test('jitter around the planted ankle never repeats a step, and a reset forgets the clip',()=>{
  const feet=new FootContacts();
  for(let f=0;f<200;f++)feet.sample(.08+(f%2)*.01,.08);
  assert.equal(feet.count,0);
  feet.sample(.3,.08);feet.sample(.08,.08);
  assert.equal(feet.count,1);
  feet.reset();
  assert.equal(feet.sample(.5,.5),false);
});
