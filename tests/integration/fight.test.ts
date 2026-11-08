import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FIGHT,FIGHT_BODIES,FIGHT_MOVES,HIT_REACTIONS,NO_PUNCH,PUNCH_IDS,SKINS,TICK_MS,fightBody,fightMove,fistAt,fistPath,hitReaction,punchAim,punchAllowed,punchClear,punchContact,punchInReach,
  punchStep,rewindOf,seenAt,streamOf,throwPunch,type FightPose,type PunchId,type PunchStream} from '@bar/shared';
// @ts-expect-error The tool is a plain script, with no types.
import {measurePunches,PUNCHES} from '../../tools/assets/measure-punches.mjs';

// The open street: nothing but floor around, far from the bar's walls (as the kick's test).
const OPEN={x:60,y:0,z:7};
const durations=JSON.parse(fs.readFileSync(new URL('../../apps/web/public/animations/durations.json',import.meta.url),'utf8')) as Record<string,number>;
const players=SKINS.filter(skin=>!skin.adminOnly).map(skin=>skin.id);
const still=(pose:FightPose)=>()=>pose;
const dt=TICK_MS/1000;

/** A punch thrown at someone `away` metres ahead along the view, `side` metres to the left: the aim, the step in, then the whole of the fist's way. */
function throwAt(skin:string,move:PunchId,away:number,side=0,targetSkin=skin){
  const target={x:OPEN.x+side,y:0,z:OPEN.z+away,rotation:Math.PI};
  const aim=punchAim(skin,move,OPEN,0,[{id:'t',...target,skin:targetSkin}]);
  let stream:PunchStream=throwPunch({m:move,n:1,lunge:aim.lunge},100,aim.yaw),at:{x:number;y:number;z:number}={...OPEN};
  for(let seq=100;seq<100+FIGHT_MOVES[move].lockSteps;seq++)at=fightMove(at,stream,seq,{dx:0,dz:0},dt,false,[]);
  const puncher={...at,rotation:stream.yaw};
  return {aim,puncher,target,contact:punchContact(skin,move,0,FIGHT_MOVES[move].durationMs,still(puncher),targetSkin,still(target))};
}

test('every player skin has its fists measured from its own clips, and the table is what the banks say',()=>{
  for(const id of players)assert.ok(FIGHT_BODIES[id],`${id} has its fight body (npm run assets:punches)`);
  // Run npm run assets:punches when this fails: a punch's clip changed, or a skin was added.
  for(const id of Object.keys(FIGHT_BODIES)){
    const table=measurePunches(fs.readFileSync(new URL(`../../apps/web/public/animations/${id}.glb`,import.meta.url)));
    assert.deepEqual(table,JSON.parse(JSON.stringify(FIGHT_BODIES[id])),id);
  }
});

test('the frame data fits the clips: lengths, the windows inside the measured way, the step in before the fist lands, the feet planted until it is back',()=>{
  for(const id of PUNCH_IDS){
    const move=FIGHT_MOVES[id],path=PUNCHES[move.clip] as {from:number;to:number};
    assert.equal(move.durationMs,durations[move.clip],`${id}: the clip's length`);
    assert.ok(move.activeFrom>=path.from&&move.activeTo<=path.to,`${id}: the window is inside the table`);
    assert.ok(move.activeTo<move.durationMs,`${id}: lands before the clip ends`);
    assert.ok(move.lungeSteps*TICK_MS<=move.activeFrom,`${id}: the step in ends before the fist can land`);
    assert.ok(move.lockSteps*TICK_MS>=move.activeTo,`${id}: the feet stay planted while the fist can land`);
    assert.ok(move.chainSteps>=move.lockSteps,`${id}: the chain window opens when the feet are free`);
    assert.ok(move.swingMs<move.activeFrom+20,`${id}: the fist is heard before it lands`);
  }
  for(const [clip,ms] of Object.entries(HIT_REACTIONS))assert.equal(ms,durations[clip],`${clip}'s length`);
  for(const clip of ['FightIdle','FightBack','FightLeft','FightRight'])assert.ok(durations[clip],`${clip} is in the banks`);
});

test('the light punches chain jab, cross, hook and back to the jab; the heavy one goes any time the feet are free; nothing while they are planted',()=>{
  let stream:PunchStream=NO_PUNCH,seq=10;
  assert.equal(punchAllowed(stream,seq,'light'),'jab');
  const order:PunchId[]=[];
  for(let i=0;i<5;i++){
    const move=punchAllowed(stream,seq,'light')!;order.push(move);
    stream=throwPunch({m:move,n:i,lunge:0},seq,0);
    for(let step=1;step<FIGHT_MOVES[move].lockSteps;step++){
      assert.equal(punchAllowed(stream,seq+step,'light'),undefined,`${move}: planted at step ${step}`);
      assert.equal(punchAllowed(stream,seq+step,'heavy'),undefined);
    }
    seq+=FIGHT_MOVES[move].lockSteps;
  }
  assert.deepEqual(order,['jab','cross','hook','jab','cross']);
  // Too late for the chain: it starts over.
  assert.equal(punchAllowed(stream,stream.seq+FIGHT_MOVES.cross.chainSteps+1,'light'),'jab');
  assert.equal(punchAllowed(stream,stream.seq+FIGHT_MOVES.cross.lockSteps,'heavy'),'heavy');
  // The heavy one ends any chain.
  const heavy=throwPunch({m:'heavy',n:9,lunge:0},50,0);
  assert.equal(punchAllowed(heavy,50+FIGHT_MOVES.heavy.lockSteps,'light'),'jab');
});

test('a punch plants the feet for its inputs and steps in only as far as it allows, the same every time',()=>{
  for(const id of PUNCH_IDS){
    const move=FIGHT_MOVES[id];
    for(const asked of [-1,0,.2,5]){
      const stream=throwPunch({m:id,n:0,lunge:asked},7,.6);
      let at={...OPEN,y:0};
      for(let seq=7;seq<7+move.lockSteps;seq++){
        assert.ok(punchStep(stream,seq).locked);
        // Keys held do nothing while planted.
        at=fightMove(at,stream,seq,{dx:1,dz:0},dt,false,[]);
      }
      assert.equal(punchStep(stream,7+move.lockSteps).locked,false);
      const travelled=Math.hypot(at.x-OPEN.x,at.z-OPEN.z)*(asked<0?-1:1),expected=Math.max(-FIGHT.backStep,Math.min(move.lungeMax,asked));
      assert.ok(Math.abs(travelled-expected)<1e-6,`${id} asked ${asked}: stepped ${travelled}`);
      if(Math.abs(expected)>1e-9){const heading=Math.atan2(at.x-OPEN.x,at.z-OPEN.z);assert.ok(Math.abs(Math.sin(heading-(expected<0?.6+Math.PI:.6)))<1e-6,'along the punch');}
    }
  }
  // Walking in the guard: FIGHT.speed, whatever the run key says.
  const walked=fightMove(OPEN,NO_PUNCH,1,{dx:0,dz:1},dt,false,[]);
  assert.ok(Math.abs(walked.z-OPEN.z-FIGHT.speed*dt)<1e-9);
});

test('every punch of every skin lands on someone in front at the distance the aim takes it to, on any other skin',()=>{
  for(const skin of players)for(const id of PUNCH_IDS)for(const other of ['nathan','gilmar-gordo','rafael']){
    const ideal=fistPath(skin,id).reach+FIGHT.bodyRadius;
    for(const away of [ideal-.25,ideal,ideal+FIGHT_MOVES[id].lungeMax*.9]){
      const {contact}=throwAt(skin,id,away,0,other);
      assert.ok(contact,`${skin} ${id} at ${away.toFixed(2)} m on ${other}`);
      const move=FIGHT_MOVES[id];
      assert.ok(contact.ms>=move.activeFrom&&contact.ms<=move.activeTo,`${skin} ${id}: lands in its window`);
      const box=fightBody(other);
      assert.ok(contact.y>=box.hip&&contact.y<=box.head+FIGHT.bodyTo+1e-9,`${skin} ${id}: lands on the body (${contact.y.toFixed(2)})`);
    }
  }
});

test('a punch misses whoever is out of its reach, behind, or to the side the fist never goes',()=>{
  for(const skin of players)for(const id of PUNCH_IDS){
    const path=fistPath(skin,id),far=path.reach+FIGHT.bodyRadius+FIGHT_MOVES[id].lungeMax+.45;
    assert.equal(throwAt(skin,id,far).contact,undefined,`${skin} ${id}: too far (${far.toFixed(2)} m)`);
    const puncher={...OPEN,rotation:0};
    assert.equal(punchContact(skin,id,0,2000,still(puncher),'nathan',still({x:OPEN.x,y:0,z:OPEN.z-.9,rotation:0})),undefined,`${skin} ${id}: behind`);
    assert.equal(punchContact(skin,id,0,2000,still(puncher),'nathan',still({x:OPEN.x+1.6,y:0,z:OPEN.z+.2,rotation:0})),undefined,`${skin} ${id}: far to the left`);
  }
  // Up a floor: the fist does not reach.
  const puncher={...OPEN,rotation:0};
  assert.equal(punchContact('nathan','jab',0,2000,still(puncher),'nathan',still({x:OPEN.x,y:2.6,z:OPEN.z+.9,rotation:0})),undefined);
});

test('the fist is followed all along its way: a fast hook does not pass through a body between two of the room\'s steps',()=>{
  const puncher={...OPEN,rotation:0},path=fistPath('nathan','hook');
  // Find a body the sweep goes through between two table samples, and check it in one big step.
  const target={x:OPEN.x,y:0,z:OPEN.z+path.reach+FIGHT.bodyRadius-.05,rotation:Math.PI};
  const whole=punchContact('nathan','hook',0,2000,still(puncher),'nathan',still(target));
  assert.ok(whole);
  const once=punchContact('nathan','hook',FIGHT_MOVES.hook.activeFrom,FIGHT_MOVES.hook.activeTo,still(puncher),'nathan',still(target));
  assert.deepEqual(once,whole);
  // Split at any point, the two halves find the same blow.
  for(let split=FIGHT_MOVES.hook.activeFrom;split<FIGHT_MOVES.hook.activeTo;split+=17){
    const first=punchContact('nathan','hook',0,split,still(puncher),'nathan',still(target));
    const second=first?undefined:punchContact('nathan','hook',split,2000,still(puncher),'nathan',still(target));
    assert.ok(first||second,`split at ${split}`);
  }
  // The fist's knuckles follow the table between its samples.
  const a=fistAt(path,path.from+path.step),b=fistAt(path,path.from+path.step*2),mid=fistAt(path,path.from+path.step*1.5);
  for(let k=0;k<3;k++)assert.ok(Math.abs(mid[k]!-(a[k]!+b[k]!)/2)<1e-9);
});

test('the aim turns the body so the sweet spot meets the target, steps in when far and back when too close, and leaves the view alone with nobody near',()=>{
  const path=fistPath('nathan','heavy');
  const aim=punchAim('nathan','heavy',OPEN,0,[{id:'a',x:OPEN.x,y:0,z:OPEN.z+1.6}]);
  assert.equal(aim.target,'a');
  assert.ok(Math.abs(aim.yaw-path.aim)<1e-9,'the haymaker faces off to land from the side');
  assert.ok(aim.lunge>0&&aim.lunge<=FIGHT_MOVES.heavy.lungeMax);
  assert.ok(punchAim('nathan','jab',OPEN,0,[{id:'a',x:OPEN.x,y:0,z:OPEN.z+.45}]).lunge<0,'too close: a step back');
  const none=punchAim('nathan','jab',OPEN,1.2,[{id:'far',x:OPEN.x,y:0,z:OPEN.z+FIGHT.aimRange+.5},{id:'behind',x:OPEN.x,y:0,z:OPEN.z-1}]);
  assert.deepEqual(none,{yaw:1.2,lunge:0});
  // Of two, the one nearer the view's middle.
  const two=punchAim('nathan','jab',OPEN,0,[{id:'side',x:OPEN.x+1,y:0,z:OPEN.z+.8},{id:'front',x:OPEN.x,y:0,z:OPEN.z+1.2}]);
  assert.equal(two.target,'front');
});

test('lag compensation looks back as far as the puncher was seeing, never into the future nor past its limit',()=>{
  // Drawn 100 ms behind the newest state just arrived, catching up as the glide goes.
  assert.equal(seenAt(10_000,0),9_900);
  assert.equal(seenAt(10_000,120),10_000);
  assert.equal(rewindOf(10_150,{seen:10_000,ago:60}),200);
  assert.equal(rewindOf(10_150,{seen:10_200,ago:0}),0,'a state from the future is a lie');
  assert.equal(rewindOf(20_000,{seen:10_000,ago:0}),FIGHT.rewindMaxMs);
  assert.equal(rewindOf(10_000,{seen:9_990,ago:500}),10);
});

test('reach, walls and reactions',()=>{
  assert.ok(punchInReach('nathan','jab',OPEN,{x:OPEN.x,y:0,z:OPEN.z+1.4}));
  assert.equal(punchInReach('nathan','jab',OPEN,{x:OPEN.x,y:0,z:OPEN.z+2.6}),false);
  assert.ok(punchClear(OPEN,{x:OPEN.x,y:0,z:OPEN.z+1}));
  // From behind (the target faces away from the puncher) the body lurches forward instead.
  assert.equal(hitReaction('jab',OPEN,{x:OPEN.x,y:0,z:OPEN.z+1,rotation:Math.PI}),'HitLight');
  assert.equal(hitReaction('jab',OPEN,{x:OPEN.x,y:0,z:OPEN.z+1,rotation:0}),'HitBack');
  assert.equal(hitReaction('heavy',OPEN,{x:OPEN.x,y:0,z:OPEN.z+1,rotation:Math.PI}),'HitHeavy');
});

test('the room\'s fist state reads back as the stream it was',()=>{
  const stream=throwPunch({m:'cross',n:42,lunge:.3},1234,-.7);
  assert.deepEqual(streamOf({punch:stream.move,seq:stream.seq,yaw:stream.yaw,lunge:stream.lunge,n:stream.n}),stream);
  assert.deepEqual(streamOf({punch:'',seq:5}),NO_PUNCH);
  assert.deepEqual(streamOf({punch:'uppercut',seq:5}),NO_PUNCH);
  assert.deepEqual(streamOf(undefined),NO_PUNCH);
});
