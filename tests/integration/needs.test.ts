import test from 'node:test';
import assert from 'node:assert/strict';
import {NEEDS,CONSUMABLES,applyConsumable,canRun,createNeeds,damage,killNeeds,reviveNeeds,drunkStage,isConscious,maxHp,relieve,staminaCost,staminaRecovery,swayAngle,swayInput,tickNeeds,type NeedsEvent,type NeedsState} from '@bar/shared';

const STEP=.05;
/** Runs the 20 Hz needs tick for `seconds` from `clock.now`; returns every event. */
function run(state:NeedsState,clock:{now:number},seconds:number,activity={running:false,moving:false},random=()=>.99):NeedsEvent[]{
  const events:NeedsEvent[]=[];
  for(let t=0;t<seconds-1e-9;t+=STEP){clock.now+=STEP*1000;events.push(...tickNeeds(state,STEP,clock.now,activity,random));}
  return events;
}
function sane(state:NeedsState):void{
  for(const key of ['hp','stamina','hunger','thirst','bladder','drunk'] as const){
    assert.ok(Number.isFinite(state[key]),`${key} is a number`);assert.ok(state[key]>=0&&state[key]<=(key==='hp'?NEEDS.hp.max*10:100),`${key} within range: ${state[key]}`);
  }
}

test('every attribute starts full (bladder and drunkenness empty) on 0–100 scales, all tunable in NEEDS',()=>{
  const s=createNeeds(0);
  assert.deepEqual([s.hp,s.stamina,s.hunger,s.thirst,s.bladder,s.drunk],[100,100,100,100,0,0]);
  assert.deepEqual([s.hpCore,s.staminaCore,s.hungerCore,s.thirstCore],[100,100,100,100],'and so do their cores');
  assert.deepEqual([NEEDS.hp.max,NEEDS.stamina.max,NEEDS.hunger.max,NEEDS.thirst.max,NEEDS.bladder.max,NEEDS.drunk.max],[100,100,100,100,100,100]);
  assert.equal(NEEDS.faint.itemLossChance,.8);
});

test('1. damage takes the ring first, then the heart; both at zero is death, reported once',()=>{
  const s=createNeeds(0),clock={now:0};
  damage(s,30,0);assert.equal(s.hp,70);assert.equal(s.hpCore,100,'the ring takes it first');
  damage(s,100,0);assert.equal(s.hp,0);assert.equal(s.hpCore,70,'what is left past an empty ring takes the heart');
  damage(s,Number.NaN,0);damage(s,-50,0);assert.equal(s.hpCore,70,'invalid damage changes nothing');
  assert.equal(s.dead,false);
  damage(s,1000,0);assert.equal(s.hp,0);assert.equal(s.hpCore,0,'never negative');
  assert.deepEqual(run(s,clock,.5),[{type:'died'}]);assert.equal(s.dead,true);
  assert.deepEqual(run(s,clock,5),[],'once, not once per tick');assert.equal(s.condition,'normal','death is not a faint');
  reviveNeeds(s);assert.equal(s.dead,false);assert.equal(s.hp,NEEDS.hp.recoverTo);assert.equal(s.hpCore,0);
});

test('1b. the ring refills from the heart, spending it; an empty heart refills nothing',()=>{
  const s=createNeeds(0),clock={now:0};damage(s,30,0);
  run(s,clock,10);
  assert.ok(Math.abs(s.hp-85)<.2,`${NEEDS.cores.hp.refillPerSecond}/s for ten seconds: ${s.hp}`);
  assert.ok(Math.abs(s.hpCore-85)<.2,'every point the ring got came out of the heart');
  const empty=createNeeds(0);empty.hpCore=0;damage(empty,30,0);run(empty,clock,10);assert.equal(empty.hp,70);
});

test('2. a faint blocks consuming and ends: back to normal after recovering',()=>{
  const s=createNeeds(0),clock={now:0};s.drunk=95;run(s,clock,.05);
  assert.equal(isConscious(s),false);assert.equal(canRun(s),false);
  assert.equal(applyConsumable(s,CONSUMABLES.garrafa!,clock.now),false,'Cannot drink while unconscious');
  const woke=run(s,clock,NEEDS.faint.alcoholSeconds);
  assert.deepEqual(woke,[{type:'woke'}]);
  assert.equal(s.condition,'recovering');assert.ok(isConscious(s));
  assert.deepEqual(run(s,clock,NEEDS.faint.recoveringSeconds+.1),[{type:'recovered'}]);
  assert.equal(s.condition,'normal');assert.equal(s.faints,1);
});

test('4–5. running drains stamina, blocks running at zero until the minimum, regenerates after the delay',()=>{
  const s=createNeeds(0),clock={now:0},running={running:true,moving:true};
  run(s,clock,1,running);
  assert.ok(Math.abs(s.stamina-(100-NEEDS.stamina.runDrainPerSecond))<.01,`drains ${NEEDS.stamina.runDrainPerSecond}/s: ${s.stamina}`);
  const events=run(s,clock,15,running);
  assert.equal(s.stamina,0);assert.equal(s.exhausted,true);assert.equal(canRun(s),false);
  assert.equal(events.filter(e=>e.type==='exhausted').length,1);
  // Within the delay nothing comes back.
  run(s,clock,NEEDS.stamina.regenDelaySeconds-.1);assert.equal(s.stamina,0);
  run(s,clock,1);assert.ok(s.stamina>0&&s.stamina<NEEDS.stamina.exhaustedUntil);
  assert.equal(canRun(s),false,'Still exhausted below the minimum: tapping Shift does not help');
  run(s,clock,NEEDS.stamina.exhaustedUntil/NEEDS.stamina.regenPerSecond+.2);
  assert.equal(s.exhausted,false);assert.equal(canRun(s),true);
  run(s,clock,20);assert.equal(s.stamina,100,'Stops at the maximum');
  // Toggling run restarts the delay instead of skipping it.
  run(s,clock,.5,running);const after=s.stamina;run(s,clock,NEEDS.stamina.regenDelaySeconds-.2);assert.equal(s.stamina,after);
});

test('6. hunger and thirst slow stamina gradually (no cliff) and hunger makes running cost more',()=>{
  const values=[100,60,50,40,30,20,10,0].map(v=>staminaRecovery({hunger:v,thirst:100,bladder:0}));
  for(let i=1;i<values.length;i++)assert.ok(values[i]!<=values[i-1]!,'Never better with more hunger');
  assert.equal(values[0],1);assert.ok(values.at(-1)!>=1-NEEDS.staminaPenalties.hunger.penalty-1e-9);
  assert.ok(values[3]!-values[4]!<.1,'Small steps: gradual');
  assert.ok(staminaRecovery({hunger:100,thirst:10,bladder:0})<staminaRecovery({hunger:100,thirst:35,bladder:0}));
  assert.ok(staminaRecovery({hunger:100,thirst:100,bladder:100})<1,'A full bladder slows recovery too');
  assert.ok(staminaCost({hunger:0})>staminaCost({hunger:100}));
});

test('7. thirst: the ring drains and is refilled from its core; with both empty HP is lost gradually, then death',()=>{
  const s=createNeeds(0),clock={now:0};
  run(s,clock,60);
  assert.ok(s.thirst>99,'the ring is held up by the core');
  assert.ok(Math.abs((100-s.thirstCore)-NEEDS.thirst.drainPerMinute)<.2,`the core paid a minute of thirst: ${s.thirstCore}`);
  s.thirst=0;s.thirstCore=0;s.hpCore=0;
  run(s,clock,10);assert.ok(Math.abs(s.hp-(100-NEEDS.thirst.damagePerSecond*10))<.01,`gradual: ${s.hp}`);
  const events=run(s,clock,400);
  assert.deepEqual(events.filter(e=>e.type==='died'),[{type:'died'}]);assert.equal(s.hp,0);assert.equal(s.hpCore,0);
  sane(s);
});

test('7b. hunger empty (ring and core) costs HP too; grace after waking',()=>{
  const s=createNeeds(0),clock={now:0};s.hunger=0;s.hungerCore=0;s.hpCore=0;s.dehydrationGraceUntil=5000;
  run(s,clock,4.9);assert.equal(s.hp,100,'grace');
  run(s,clock,10);assert.ok(Math.abs(s.hp-(100-NEEDS.hunger.damagePerSecond*10))<.05,`${s.hp}`);
});

test('7c. eating fills the core gradually, and the ring draws on it',()=>{
  const s=createNeeds(0),clock={now:0};s.hungerCore=10;s.hunger=60;
  assert.ok(applyConsumable(s,CONSUMABLES.coxinha!,0));
  assert.equal(s.hungerCore,10,'not at once');assert.equal(s.intake.hunger,CONSUMABLES.coxinha!.hunger);
  run(s,clock,1);assert.ok(s.hungerCore>10+NEEDS.cores.absorbPerSecond*.5,`gradually: ${s.hungerCore}`);
  run(s,clock,25);assert.equal(s.intake.hunger,0);assert.ok(s.hunger>=99.9,'the ring filled from it');
  const salty=createNeeds(0);applyConsumable(salty,CONSUMABLES.torresmo!,0);assert.equal(salty.thirstCore,100+CONSUMABLES.torresmo!.thirst!,'what takes away is taken from the core at once');
});

test('7d. the stamina core is the price of resting: with it empty the bar still comes back, slowly',()=>{
  const s=createNeeds(0),clock={now:0};s.stamina=0;s.exhausted=true;
  run(s,clock,2);const rested=s.stamina,spent=100-s.staminaCore;
  assert.ok(rested>20&&Math.abs(spent-rested*NEEDS.cores.stamina.cost)<.01,`${rested} for ${spent}`);
  const dry=createNeeds(0);dry.stamina=0;dry.staminaCore=0;run(dry,clock,2);
  assert.ok(dry.stamina>0&&dry.stamina<rested/3,`a trickle: ${dry.stamina}`);
});

test('7e. the administration kills: ring and heart to zero, one death',()=>{
  const s=createNeeds(0),clock={now:0};killNeeds(s);
  assert.equal(s.hp,0);assert.equal(s.hpCore,0);
  assert.deepEqual(run(s,clock,.5),[{type:'died'}]);
});

test('8. alcohol changes drunkenness and bladder separately; it is not water',()=>{
  const s=createNeeds(0);s.thirst=50;
  assert.ok(applyConsumable(s,CONSUMABLES.garrafa!,0));
  assert.equal(s.drunk,CONSUMABLES.garrafa!.drunk);assert.equal(s.bladder,CONSUMABLES.garrafa!.bladder);
  assert.equal(s.intake.thirst,CONSUMABLES.garrafa!.thirst!,'Only the thirst declared for the drink');
  assert.ok(s.intake.thirst<20);
  relieve(s);assert.equal(s.bladder,0);assert.equal(s.drunk,CONSUMABLES.garrafa!.drunk,'The toilet does not sober');
  // Half a drink counts half.
  const h=createNeeds(0);applyConsumable(h,CONSUMABLES.copo!,0,.5);assert.equal(h.bladder,CONSUMABLES.copo!.bladder!/2);
  // Hunger makes alcohol hit harder.
  const hungry=createNeeds(0);hungry.hunger=0;applyConsumable(hungry,CONSUMABLES.garrafa!,0);
  assert.equal(hungry.drunk,CONSUMABLES.garrafa!.drunk!*(1+NEEDS.drunk.hungerSensitivity));
  // A bladder full of beer never faints anyone.
  const full=createNeeds(0),clock={now:0};full.bladder=100;assert.deepEqual(run(full,clock,30),[]);
});

test('9. drunkenness progresses by stage, wears off, and stumbles never loop',()=>{
  assert.deepEqual([0,19,20,45,70,89,90,100].map(drunkStage),[0,0,1,2,3,3,4,4]);
  const s=createNeeds(0),clock={now:0};
  for(let i=0;i<6;i++)applyConsumable(s,CONSUMABLES.garrafa!,0);
  assert.equal(drunkStage(s.drunk),3);assert.equal(canRun(s),false,'No running from stage 3');
  const before=s.drunk;run(s,clock,60);assert.ok(Math.abs(before-s.drunk-NEEDS.drunk.soberPerMinute)<.01,'Sobers at the configured rate');
  // Always-unlucky dice: still at most one stumble per cooldown.
  s.drunk=85;
  const events=run(s,clock,60,{running:false,moving:true},()=>0);
  const stumbles=events.filter(e=>e.type==='stumble').length;
  assert.ok(stumbles>=1&&stumbles<=Math.ceil(60/NEEDS.drunk.stumbleCooldownSeconds),`${stumbles} stumbles in a minute`);
  assert.equal(events.filter(e=>e.type==='steady').length,stumbles-(s.condition==='stumbling'?1:0));
  // Standing still never stumbles.
  const still=createNeeds(0),c2={now:0};still.drunk=80;assert.deepEqual(run(still,c2,60,{running:false,moving:false},()=>0),[]);
  // The drunk walk drifts deterministically (same angle on the server and in the prediction), not when sober.
  assert.equal(swayAngle(10,0,'a'),0);assert.equal(swayAngle(10,50,'a'),swayAngle(10,50,'a'));
  const input=swayInput({dx:0,dz:-1,running:false},10,80,'player');
  assert.ok(Math.abs(Math.hypot(input.dx,input.dz)-1)<1e-9,'Same speed, other heading');
  assert.ok(Math.abs(swayAngle(10,80,'player'))<=NEEDS.drunk.swayDegrees[3]*Math.PI/180+1e-9);
});

test('9–10. stage 4 faints once from alcohol and wakes sober enough not to faint again',()=>{
  const s=createNeeds(0),clock={now:0};s.drunk=95;
  const events=run(s,clock,NEEDS.faint.alcoholSeconds+NEEDS.faint.recoveringSeconds+1,{running:false,moving:true},()=>0);
  assert.deepEqual(events.map(e=>e.type),['faint','woke','recovered']);
  assert.deepEqual(events[0],{type:'faint',cause:'alcohol'});
  assert.ok(drunkStage(s.drunk)<3,'Woke at a lower stage');
  assert.equal(NEEDS.faint.alcoholRecoveryMarker,'Spawn_Jogador');
  assert.equal(s.hp,100,'Alcohol faint does not cost HP');
});

test('11. foods fill the cores gradually and raise the ring ceiling for a while, without corrupting HP',()=>{
  const s=createNeeds(0),clock={now:0};s.hungerCore=20;s.hpCore=50;
  const stew={name:'Caldo de mocotó',hunger:40,hp:10,maxHp:{amount:20,seconds:30}};
  assert.ok(applyConsumable(s,stew,0));
  run(s,clock,10);assert.ok(Math.abs(s.hungerCore-60)<1,`${s.hungerCore}`);assert.ok(s.hpCore>=30,'the heart took the stew (and paid for the raised ceiling)');assert.equal(maxHp(s,clock.now),120);
  run(s,clock,31);assert.equal(maxHp(s,clock.now),100);assert.ok(s.hp<=100,'Bonus ends, HP brought down to the maximum');
  applyConsumable(s,{name:'Inválido',hp:Number.NaN,hunger:Infinity,maxHp:{amount:-5,seconds:10}},clock.now);
  run(s,clock,10);sane(s);assert.equal(maxHp(s,clock.now),100);
});

test('values stay finite and in range with absurd inputs and long sessions',()=>{
  const s=createNeeds(0),clock={now:0};
  tickNeeds(s,Number.NaN,1,{running:true,moving:true});tickNeeds(s,1e9,2,{running:true,moving:true});
  sane(s);
  run(s,clock,600,{running:true,moving:true},()=>.5);sane(s);
});
