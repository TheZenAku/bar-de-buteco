import test from 'node:test';
import assert from 'node:assert/strict';
import {FIGHT,FIGHT_MOVES,TICK_MS,fistPath,punchAim,punchRoot,type FightHit,type PlayerInput,type PunchId} from '@bar/shared';
import {Player} from '../src/state.js';
import {FightDirector,type FightHost} from '../src/world/fight.js';

// The open street, far from walls (as the kick's tests).
const OPEN={x:60,z:7};

function room(){
  /** Whether the players here have bought a kick skill. */
  const owns={kick:true};
  const hits:FightHit[]=[],kos:string[]=[],refusals:string[]=[],pushes:number[]=[];
  const host:FightHost={
    guardRefusal:player=>player.holding?'Largue o que está na mão.':'',
    keepsGuard:player=>player.connected&&!player.holding,
    kicks:()=>owns.kick,
    hittable:target=>target.connected&&(!target.interactionState||target.interactionState==='stagger'),
    damage:(target,amount)=>{const ring=Math.min(target.hp,amount);target.hp-=ring;target.hpCore=Math.max(0,target.hpCore-(amount-ring));},
    knockout:target=>{target.interactionState='thrown';kos.push(target.id);},
    stun:target=>{target.interactionState='stagger';},
    push:(target,dx,dz)=>{target.x+=dx;target.z+=dz;pushes.push(Math.hypot(dx,dz));},
    broadcast:hit=>hits.push(hit),
    refuse:(_player,message)=>refusals.push(message),
    log:()=>{},random:()=>.5,
  };
  const fights=new FightDirector(host),players:Player[]=[];
  let now=1_000_000,seq=0;
  const add=(id:string,x:number,z:number,rotation:number)=>{
    const player=new Player().assign({id,x,y:0,z,rotation,connected:true,skin:'nathan',hp:100,hpCore:100});
    players.push(player);
    // Its guard up, as the first input with `fight` does.
    fights.guard(player,{fight:true});
    return player;
  };
  /** One tick: each player's input (none: still, guard up), then the room's step. */
  const tick=(inputs:Map<Player,Partial<PlayerInput>>=new Map())=>{
    now+=TICK_MS;seq++;
    for(const player of players){
      const input:PlayerInput={seq,dx:0,dz:0,running:false,rotation:player.rotation,fight:player.fist.fight,...inputs.get(player)};
      fights.guard(player,input);
      if(!player.interactionState&&player.fist.fight)fights.move(player,input,now,false,[]);
      player.lastProcessedInput=seq;
    }
    fights.step(now,players);
  };
  const punch=(player:Player,m:PunchId,target?:Player,seen=now,ago=120)=>{
    const aim=target?punchAim(player.skin,m,player,player.rotation,[{id:target.id,x:target.x,y:target.y,z:target.z,skin:target.skin}]):{yaw:player.rotation,lunge:0};
    return {punch:{m,n:7,lunge:aim.lunge,seen,ago},rotation:aim.yaw} satisfies Partial<PlayerInput>;
  };
  return {fights,players,add,tick,punch,owns,hits,kos,refusals,pushes,get now(){return now;},get seq(){return seq;}};
}
const ideal=(move:PunchId,skin='nathan')=>fistPath(skin,move).reach+FIGHT.bodyRadius;

test('a jab lands on the one in front: life, stun, the push, the message, and the stun ends on time',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal('jab'),Math.PI);
  r.tick(new Map([[a,r.punch(a,'jab',b)]]));
  assert.equal(a.fist.punch,'jab');assert.equal(a.animationState,'punch');
  const thrownAt=a.fist.at;
  for(let i=0;i<10&&!r.hits.length;i++)r.tick();
  assert.equal(r.hits.length,1);
  const hit=r.hits[0]!,move=FIGHT_MOVES.jab;
  assert.deepEqual([hit.by,hit.to,hit.move,hit.n,hit.damage,hit.ko,hit.reaction],['a','b','jab',7,move.damage,false,'HitLight']);
  assert.ok(hit.at-thrownAt>=move.activeFrom&&hit.at-thrownAt<=move.activeTo+TICK_MS,`lands in its window (${hit.at-thrownAt} ms)`);
  assert.equal(b.hp,100-move.damage);
  assert.equal(b.interactionState,'stagger');assert.equal(b.animationState,'hit');assert.equal(b.fist.hit,'HitLight');
  assert.equal(b.fist.stunUntil,hit.at+move.stunMs);
  const before={x:b.x,z:b.z};
  for(let i=0;i<4;i++)r.tick();
  assert.ok(Math.abs(Math.hypot(b.x-before.x,b.z-before.z)-move.knockback)<1e-6,`pushed back ${move.knockback} m`);
  assert.ok(b.z>before.z,'away from the puncher');
  while(r.now<hit.stunUntil)r.tick();
  r.tick();
  assert.equal(b.interactionState,'');
  assert.equal(r.hits.length,1,'one punch, one hit');
});

test('lag compensation: a punch at someone where the puncher saw them lands; judged where they are now, it would miss',()=>{
  for(const [rewind,lands] of [[FIGHT.rewindMaxMs,true],[0,false]] as const){
    const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal('jab'),Math.PI);
    for(let i=0;i<6;i++)r.tick();
    // The room takes the punch on the next tick; the puncher was seeing the world as it was `rewind` ms before that.
    const takenAt=r.now+TICK_MS,aimed=r.punch(a,'jab',b,takenAt-rewind,120);
    r.tick(new Map([[a,aimed]]));
    // B steps back out of reach 100 ms later: the puncher, behind by the rewind, still sees B in front when the fist arrives.
    r.tick();r.tick();
    b.z+=.55;
    for(let i=0;i<10;i++)r.tick();
    assert.equal(r.hits.length,lands?1:0,`rewind ${rewind} ms`);
    if(lands)assert.equal(b.hp,100-FIGHT_MOVES.jab.damage);
  }
});

test('a rewind never reaches past its limit: a stale view does not land on someone long gone',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal('jab'),Math.PI);
  for(let i=0;i<30;i++)r.tick();
  const aimed=r.punch(a,'jab',b,r.now-900,0);
  // B left half a second ago: past FIGHT.rewindMaxMs.
  b.z+=.8;
  for(let i=0;i<12;i++)r.tick();
  r.tick(new Map([[a,aimed]]));
  for(let i=0;i<10;i++)r.tick();
  assert.equal(r.hits.length,0);
});

test('the chain thrown in rhythm lands whole on someone who stands there: the pushes never take them out of the next punch\'s reach',()=>{
  for(const skin of ['nathan','gabriel','tiao']){
    const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+fistPath(skin,'jab').reach+FIGHT.bodyRadius,Math.PI);
    a.skin=skin;
    for(const move of ['jab','cross','hook'] as const){
      r.tick(new Map([[a,r.punch(a,move,b)]]));
      for(let i=1;i<FIGHT_MOVES[move].lockSteps;i++)r.tick();
    }
    for(let i=0;i<10;i++)r.tick();
    assert.deepEqual(r.hits.map(hit=>hit.move),['jab','cross','hook'],skin);
  }
});

test('the blow that empties the heart knocks out: the body flies and the guard comes down',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal('heavy'),Math.PI);
  // The ring and the heart's reserve together are less than the haymaker takes.
  b.hp=12;b.hpCore=8;
  r.tick(new Map([[a,r.punch(a,'heavy',b)]]));
  for(let i=0;i<20&&!r.hits.length;i++)r.tick();
  assert.equal(r.hits[0]?.ko,true);
  assert.deepEqual(r.kos,['b']);
  assert.equal(b.fist.fight,false);
});

test('a blow cuts short the punch the one hit was throwing: their heavy never lands',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal('jab'),Math.PI);
  // B winds up a haymaker (slow), A answers with a jab (fast).
  r.tick(new Map([[b,r.punch(b,'heavy',a)]]));
  r.tick(new Map([[a,r.punch(a,'jab',b)]]));
  for(let i=0;i<30;i++)r.tick();
  assert.deepEqual(r.hits.map(hit=>hit.by),['a']);
  assert.equal(b.fist.punch,'',"B's punch is forgotten: the next one starts a new chain");
  assert.equal(r.fights.activeOf('b'),undefined);
});

test('a punch plants the feet: keys held do nothing until it lets go (the body only goes with the clip\'s own step), and a second punch is not taken meanwhile',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0);
  r.tick(new Map([[a,{...r.punch(a,'jab'),dx:1}]]));
  const start={x:a.x,z:a.z},move=FIGHT_MOVES.jab;
  for(let i=1;i<move.lockSteps;i++){
    assert.ok(r.fights.busy(a,a.lastProcessedInput,r.now));
    r.tick(new Map([[a,{dx:1,...(i===2?r.punch(a,'cross'):{})}]]));
    assert.equal(a.x,start.x,`planted at step ${i}`);
    assert.ok(Math.abs(a.z-start.z-punchRoot('nathan','jab',i+1)+punchRoot('nathan','jab',1))<1e-6,`only the jab's own step at step ${i}`);
  }
  assert.equal(a.fist.punch,'jab','the cross pressed meanwhile was not thrown (the browser keeps it for when the feet are free)');
  r.tick(new Map([[a,{dx:1}]]));
  assert.ok(a.x>start.x,'walks again');
  assert.ok(Math.abs(a.x-start.x-FIGHT.speed*TICK_MS/1000)<1e-6,'at the guard\'s pace');
  assert.ok(Math.abs(a.z-start.z-punchRoot('nathan','jab',move.lockSteps)+punchRoot('nathan','jab',1))<1e-6,'and the jab\'s step back stops with the player\'s own');
  // Free feet: the chain goes on.
  r.tick(new Map([[a,r.punch(a,'cross')]]));
  assert.equal(a.fist.punch,'cross');
});

test('the guard: refused once while the hands are busy, lowered by anything that takes the player, and a stunned player throws nothing',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal('jab'),Math.PI);
  r.fights.guard(a,{fight:false});
  a.holding='copo';
  for(let i=0;i<3;i++)r.fights.guard(a,{fight:true});
  assert.equal(a.fist.fight,false);assert.equal(r.refusals.length,1,'told once');
  a.holding='';r.fights.guard(a,{fight:true});
  assert.equal(a.fist.fight,true);
  a.holding='copo';r.tick();
  assert.equal(a.fist.fight,false,'a drink in hand lowers it');
  a.holding='';r.fights.guard(a,{fight:true});
  // B is hit, then tries to punch while stunned.
  r.tick(new Map([[a,r.punch(a,'jab',b)]]));
  for(let i=0;i<10&&!r.hits.length;i++)r.tick();
  assert.equal(r.hits.length,1);
  assert.ok(r.fights.busy(b,b.lastProcessedInput,r.now));
  b.interactionState='';// as if the room let the input through
  r.fights.move(b,{seq:999,dx:0,dz:0,running:false,fight:true,...r.punch(b,'jab',a)},r.now,false,[]);
  assert.equal(b.fist.punch,'');
});

test('the guard walks short steps, and runs with Shift (the room checks the stamina before)',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0);
  r.tick(new Map([[a,{dz:1}]]));
  assert.ok(Math.abs(a.z-OPEN.z-FIGHT.speed*TICK_MS/1000)<1e-6);assert.equal(a.animationState,'walk');
  const from=a.z;r.tick(new Map([[a,{dz:1,running:true}]]));
  assert.ok(Math.abs(a.z-from-FIGHT.runSpeed*TICK_MS/1000)<1e-6);assert.equal(a.animationState,'run');
  assert.equal(a.fist.fight,true,'The guard stays up');
});

test('Rafaels kicks ride the same stream: they land with more damage, stun and a push, never a flight; without the skill, or on another skin, they are refused',()=>{
  for(const id of ['frontKick','bodyKick','roundKick'] as const){
    const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal(id,'rafael'),Math.PI);
    a.skin='rafael';
    // Not every kick starts a chain: the body kick follows the cross and the round kick the hook, with their feet free again.
    const lead={bodyKick:'cross',roundKick:'hook'}[id as string];
    if(lead){a.fist.punch=lead;a.fist.seq=r.seq+1-FIGHT_MOVES[lead as PunchId].lockSteps;}
    r.tick(new Map([[a,r.punch(a,id,b)]]));
    assert.equal(a.fist.punch,id,`${id} is thrown`);
    for(let i=0;i<24&&!r.hits.length;i++)r.tick();
    const hit=r.hits[0]!,move=FIGHT_MOVES[id];
    assert.ok(hit,`${id} lands`);
    assert.deepEqual([hit.move,hit.damage,hit.ko,hit.reaction],[id,move.damage,false,move.reaction]);
    assert.ok(move.damage>FIGHT_MOVES.hook.damage);
    assert.equal(b.hp,100-move.damage);assert.equal(b.interactionState,'stagger','held, not thrown');assert.equal(r.kos.length,0);
    const before={x:b.x,z:b.z};
    for(let i=0;i<4;i++)r.tick();
    assert.ok(Math.abs(Math.hypot(b.x-before.x,b.z-before.z)-move.knockback)<1e-6,`${id}: pushed ${move.knockback} m`);
  }
  // Another skin's browser cannot throw a kick, and neither can one that has not bought the skill.
  const other=room(),n=other.add('n',OPEN.x,OPEN.z,0);
  other.tick(new Map([[n,other.punch(n,'frontKick')]]));
  assert.equal(n.fist.punch,'');
  const unpaid=room(),u=unpaid.add('u',OPEN.x,OPEN.z,0);u.skin='rafael';unpaid.owns.kick=false;
  unpaid.tick(new Map([[u,unpaid.punch(u,'frontKick')]]));
  assert.equal(u.fist.punch,'');
  unpaid.tick(new Map([[u,unpaid.punch(u,'jab')]]));
  assert.equal(u.fist.punch,'jab','the punches stay open');
});

test('a combo thrown in rhythm lands whole: jab, cross, then the body kick on someone who stands there',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z,0),b=r.add('b',OPEN.x,OPEN.z+ideal('jab','rafael'),Math.PI);
  a.skin='rafael';b.skin='rafael';b.hp=1000;
  const order:string[]=[];
  for(const id of ['jab','cross','bodyKick'] as const){
    // The press is repeated every tick, as the controller's buffer does: the room takes it once the feet are free.
    for(let i=0;i<40&&a.fist.punch!==id;i++)r.tick(new Map([[a,r.punch(a,id,b)]]));
    order.push(a.fist.punch);
    for(let i=0;i<40&&r.hits.length<order.length;i++)r.tick();
  }
  assert.deepEqual(order,['jab','cross','bodyKick']);
  assert.deepEqual(r.hits.map(hit=>hit.move),['jab','cross','bodyKick']);
});
