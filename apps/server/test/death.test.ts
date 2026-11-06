import test from 'node:test';
import assert from 'node:assert/strict';
import {DEATH,DEATH_CLIPS,MORTE_FRASES,MORTE_FRASES_ERRO,deathDurationMs,deathFrame,deathStarts,dominantCategory,isWalkable,pickPhrase,planDeath,sequenceLength,showDurationMs,type DeathPlan,type DeathScreen} from '@bar/shared';
import {DeathDirector,type DeathHost} from '../src/world/death.js';

function harness(random=()=>0.37){
  let clock=1_000_000;
  const events:string[]=[],screens:DeathScreen[]=[],scenes:DeathPlan[]=[],logs:Array<[string,Record<string,unknown>]>=[];
  const body={x:2,y:0,z:3,rotation:1,name:'Zeca'};
  const host:DeathHost={
    now:()=>clock,random:()=>random(),body:id=>id==='zeca'?body:undefined,
    hold:(id,state)=>{events.push(`hold:${state}`);},
    scene:plan=>{scenes.push(plan);events.push('scene');},
    screen:(id,message)=>{screens.push(message);},
    respawn:()=>{events.push('respawn');},
    category:()=>'bebidas',log:(event,details)=>{logs.push([event,details]);},
  };
  const director=new DeathDirector(host);
  const advance=(ms:number,step=50)=>{for(let spent=0;spent<ms;spent+=step){clock+=Math.min(step,ms-spent);director.update(clock);}};
  return {director,advance,events,screens,scenes,logs,now:()=>clock,set:(t:number)=>{clock=t;}};
}
const last=(screens:DeathScreen[],phase:DeathScreen['phase'])=>[...screens].reverse().find(s=>s.phase===phase) as any;

test('timeline: the five clips in order, the Morte floats from where she rises to the blow, the impact and the taking land on their frames',()=>{
  const plan=planDeath('d',{id:'v',x:0,y:0,z:0,rotation:0},0);
  assert.ok(plan.floatMs>=DEATH.minFloatMs);
  const starts=deathStarts(plan);
  assert.deepEqual(['rise','float','strike','laugh','leave'].map(clip=>deathFrame(plan,starts[clip as keyof typeof starts]+10).clip),['rise','float','strike','laugh','leave']);
  assert.equal(deathStarts(plan).leave+DEATH_CLIPS.leave.ms,plan.startedAt+deathDurationMs(plan));
  const start=deathFrame(plan,starts.float),end=deathFrame(plan,starts.strike-1);
  assert.ok(Math.hypot(start.x-plan.sx,start.z-plan.sz)<.05);assert.ok(Math.hypot(end.x-plan.ax,end.z-plan.az)<.05);
  assert.ok(Math.hypot(plan.ax-plan.vx,plan.az-plan.vz)<=DEATH.attackDistance+1e-6,'the blow lands at the attack distance');
  assert.ok(Math.hypot(plan.sx-plan.vx,plan.sz-plan.vz)>DEATH.attackDistance+1,'she rises well away');
  assert.equal(deathFrame(plan,starts.strike+DEATH.impactMs-1).impacted,false);assert.equal(deathFrame(plan,starts.strike+DEATH.impactMs).impacted,true);
  assert.equal(deathFrame(plan,starts.leave+DEATH.takenMs-1).taken,false);assert.equal(deathFrame(plan,starts.leave+DEATH.takenMs).taken,true);
  assert.equal(deathFrame(plan,plan.startedAt+deathDurationMs(plan)).done,true);
  // She rises where a body can stand, floats over walkable ground, and faces the victim.
  assert.ok(isWalkable(plan.sx,plan.sz,plan.vy));
  const face=deathFrame(plan,starts.rise+100);assert.ok(Math.abs(Math.sin(face.yaw)*(plan.vz-plan.sz)-Math.cos(face.yaw)*(plan.vx-plan.sx))<1e-6,'looking at the victim');
});

test('the whole death: scene, five seconds of dark with a phrase, a wrong press (2 s of red), a new sequence, a right one, respawn',()=>{
  const h=harness();
  assert.equal(h.director.kill('nobody'),false,'no body, no death');
  assert.equal(h.director.kill('zeca'),true);
  assert.equal(h.director.kill('zeca'),false,'a second order while dying is ignored');
  assert.deepEqual(h.events,['hold:death','scene']);assert.equal(h.logs[0]![0],'death_start');
  const plan=h.scenes[0]!,end=plan.startedAt+deathDurationMs(plan);
  // The body goes at the 100th frame of the leaving clip, not before.
  h.set(deathStarts(plan).leave+DEATH.takenMs-100);h.director.update(h.now());assert.ok(!h.events.includes('hold:death-gone'));
  h.set(deathStarts(plan).leave+DEATH.takenMs+10);h.director.update(h.now());assert.ok(h.events.includes('hold:death-gone'));
  assert.equal(h.screens.length,0,'the victim has no dark during the scene');
  h.set(end-1);h.director.update(h.now());assert.equal(h.director.phaseOf('zeca'),'scene');
  h.set(end);h.director.update(h.now());
  const dark=last(h.screens,'blackout');assert.equal(dark.until-h.now(),DEATH.blackoutMs);
  assert.ok(Object.values(MORTE_FRASES.bebidas).some(text=>text===dark.phrase),`a phrase of the drinking category: ${dark.phrase}`);
  // Presses in the dark do nothing.
  h.director.press('zeca',0);assert.equal(h.director.phaseOf('zeca'),'blackout');
  h.advance(DEATH.blackoutMs);
  assert.equal(h.director.phaseOf('zeca'),'play');
  const first=last(h.screens,'play'),sequence=[...first.sequence] as number[];
  assert.equal(sequence.length,sequenceLength(0));assert.equal(sequence.length,4);
  assert.equal(first.inputFrom-first.showStartedAt,showDurationMs(4));
  // Pressing while it is still being shown is ignored (not a mistake).
  h.director.press('zeca',(sequence[0]!+1)%4);assert.equal(h.director.phaseOf('zeca'),'play');assert.equal(last(h.screens,'error'),undefined);
  h.set(first.inputFrom+10);
  h.director.press('zeca',sequence[0]!);assert.equal(last(h.screens,'press').progress,1);
  // A wrong press: the red phrase for 2 s, nothing else counts, then a new random sequence.
  h.director.press('zeca',(sequence[1]!+1)%4);
  const error=last(h.screens,'error');assert.equal(h.director.phaseOf('zeca'),'error');assert.equal(error.until-h.now(),DEATH.errorHoldMs);
  assert.ok(MORTE_FRASES_ERRO.map(text=>text.replaceAll('{nome}','Zeca')).includes(error.phrase));
  h.director.press('zeca',sequence[1]!);assert.equal(last(h.screens,'press').progress,1,'frozen while the red phrase is up');
  h.advance(DEATH.errorHoldMs-100);assert.equal(h.director.phaseOf('zeca'),'error');
  h.advance(100);assert.equal(h.director.phaseOf('zeca'),'play');
  const second=last(h.screens,'play');assert.notEqual(second,first);assert.equal(second.sequence.length,4);
  // The player has not come back yet: no respawn so far.
  assert.ok(!h.events.includes('respawn'));
  h.set(second.inputFrom+10);
  for(const button of second.sequence as number[])h.director.press('zeca',button);
  assert.equal(last(h.screens,'won')?.phase,'won');assert.equal(h.director.isDead('zeca'),false);
  assert.equal(h.events.filter(e=>e==='respawn').length,1);
  const ended=h.logs.at(-1)!;assert.deepEqual([ended[0],ended[1].reason,ended[1].errors],['death_end','won',1]);
  // And a new death is possible afterwards.
  assert.equal(h.director.kill('zeca'),true);
});

test('ten seconds without an answer is a mistake; the length grows by one with each round won and stops at seven',()=>{
  const h=harness();h.director.kill('zeca');const plan=h.scenes[0]!;
  h.set(plan.startedAt+deathDurationMs(plan));h.director.update(h.now());h.advance(DEATH.blackoutMs);
  const play=last(h.screens,'play');h.set(play.until-1);h.director.update(h.now());assert.equal(h.director.phaseOf('zeca'),'play');
  h.set(play.until);h.director.update(h.now());assert.equal(h.director.phaseOf('zeca'),'error');
  assert.deepEqual([0,1,2,3,4,10].map(sequenceLength),[4,5,6,7,7,7]);
});

test('leaving during the death ends it: the player is put on the respawn point at once',()=>{
  const h=harness();h.director.kill('zeca');h.advance(3000);
  h.director.disconnected('zeca');assert.equal(h.director.isDead('zeca'),false);
  assert.equal(h.events.at(-1),'respawn');assert.equal(h.logs.at(-1)![1].reason,'disconnected');
  h.director.press('zeca',0);// nothing to press any more
});

test('phrases: a category by what was done most, "{nome}" filled, never the same one twice in a row',()=>{
  assert.equal(dominantCategory({bebidas:3,jogos:5}),'jogos');assert.equal(dominantCategory({}),'geral');assert.equal(dominantCategory(undefined),'geral');
  let previous:string|undefined;
  for(let i=0;i<200;i++){const phrase=pickPhrase('geral','Zeca',previous);assert.notEqual(phrase,previous);assert.ok(!phrase.includes('{nome}'));previous=phrase;}
  assert.ok(Array.from({length:50},(_,i)=>pickPhrase('geral','Zeca',undefined,()=>i/50)).some(text=>text.includes('Zeca')));
});
