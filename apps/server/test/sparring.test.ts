import test from 'node:test';
import assert from 'node:assert/strict';
import {FIGHT,SPARRING,SPARRING_FOE_PREFIX,SPARRING_TIERS,TICK_MS,normalizeHeading,type FightHit,type PlayerInput,type SparringClaim,type SparringResult,type SparringState,type SparringStatus} from '@bar/shared';
import {Player} from '../src/state.js';
import {FightDirector,type FightHost} from '../src/world/fight.js';
import {SparringAI,SparringDirector,waitText,type SparringHost} from '../src/world/sparring.js';

/** A seeded generator, so a fight is the same every run. */
const seeded=(seed:number)=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

/** The room as the sparring needs it: the fist fight with the sparring's hooks, the players, the messages, and an API stand-in. */
function ring(options:{status?:Partial<SparringStatus>;seed?:number}={}){
  const messages:{to:string;type:string;message:unknown}[]=[],log:string[]=[],claims:string[]=[],players=new Map<string,Player>();
  const hits:FightHit[]=[];
  let now=2_000_000,seq=0,npc=true,tier=0;
  const status:SparringStatus={tier:0,cooldownMs:0,unlimited:false,...options.status};
  const random=seeded(options.seed??7);
  // eslint-disable-next-line prefer-const
  let sparring!:SparringDirector;
  const host:FightHost={
    guardRefusal:player=>player.holding?'Largue o que está na mão.':'',
    keepsGuard:player=>player.connected&&!player.holding,
    kicks:()=>false,
    spared:target=>sparring.spares(target),
    bot:player=>sparring.isFoe(player.id),
    hittable:(target,at)=>sparring.isFoe(target.id)?sparring.hittable(target,at):target.connected&&(!target.interactionState||target.interactionState==='stagger'),
    damage:(target,amount)=>{if(!sparring.damage(target,amount)){const ring=Math.min(target.hp,amount);target.hp-=ring;}},
    knockout:target=>{if(!sparring.knocked(target))target.interactionState='thrown';},
    stun:target=>{target.interactionState='stagger';},
    push:(target,dx,dz)=>{target.x+=dx;target.z+=dz;},
    broadcast:hit=>hits.push(hit),
    refuse:()=>{},log:()=>{},random,
  };
  const fights=new FightDirector(host);
  const room:SparringHost={
    now:()=>now,random,
    addFoe:foe=>players.set(foe.id,foe),
    removeFoe:id=>players.delete(id),
    idleNpc:present=>{npc=present;},
    send:(to,type,message)=>messages.push({to,type,message}),
    guardRefusal:player=>host.guardRefusal(player),
    status:async()=>({...status,tier:tier||status.tier}),
    win:async(userId,requestId)=>{claims.push(requestId);const t=SPARRING_TIERS[status.tier]!;return {...status,prize:t.prize,balance:1000+t.prize,beaten:status.tier};},
    paid:()=>{},
    obstacles:()=>[],
    log:event=>log.push(event),
    takeSlot:()=>9,
    randomId:()=>`fight-${++seq}`,
  };
  sparring=new SparringDirector(room,fights);
  const add=(id:string)=>{
    const player=new Player().assign({id,x:SPARRING.spot.x,y:SPARRING.spot.y,z:SPARRING.spot.z+2.4,rotation:Math.PI,connected:true,skin:'nathan',hp:100,hpCore:100});
    players.set(id,player);fights.guard(player,{fight:true});return player;
  };
  /** One tick, in the room's order: the player's input, the sparring's, the fist fight's. */
  const tick=(player:Player,input:Partial<PlayerInput>={})=>{
    now+=TICK_MS;
    const full:PlayerInput={seq:++seq,dx:0,dz:0,running:false,rotation:player.rotation,fight:true,...input};
    fights.guard(player,full);
    if(!player.interactionState&&player.fist.fight)fights.move(player,full,now,false,[]);
    sparring.step(now);
    fights.step(now,players.values());
  };
  const state=()=>messages.filter(m=>m.type==='sparring.state').map(m=>m.message as SparringState);
  const result=()=>messages.find(m=>m.type==='sparring.result')?.message as SparringResult|undefined;
  return {sparring,fights,players,add,tick,state,result,messages,hits,log,claims,status,random,get now(){return now;},get npc(){return npc;},setTier:(index:number)=>{tier=index;status.tier=index;}};
}
type Ring=ReturnType<typeof ring>;
const foeOf=(r:Ring,player:Player)=>r.players.get(SPARRING_FOE_PREFIX+player.id)!;

/** A fighter that always attacks and never defends (the sparring's own bot, with the dials turned all the way to attack): the player of the tests. */
const aggressive=(r:Ring)=>new SparringAI({id:'easy',prize:0,hp:1,damage:1,reactMs:1e9,block:0,parry:0,gapMs:[0,0],combos:[['light','light','light']],circles:false},r.random,r.now);

test('talking: too far, the wait, a busy Zeca, and the challenge on offer (never a word of difficulty)',async()=>{
  const r=ring(),a=r.add('a'),b=r.add('b');
  a.z=SPARRING.spot.z+SPARRING.reach+1;
  assert.equal((await r.sparring.talk(a)).can,false);
  a.z=SPARRING.spot.z+2.4;
  const offer=await r.sparring.talk(a);
  assert.equal(offer.can,true);assert.ok(offer.line.length>20);
  assert.doesNotMatch(offer.line,/fácil|médio|difícil|nível/i,'the difficulty is never shown');
  r.status.cooldownMs=5*3600_000+12*60_000;
  const waiting=await r.sparring.talk(a);
  assert.equal(waiting.can,false);assert.match(waiting.line,/5 h 12 min/);
  assert.equal(await r.sparring.accept(a),'O Zeca só paga de novo daqui a 5 h 12 min.');
  assert.equal(r.players.size,2,'no foe was made');
  r.status.cooldownMs=0;
  assert.equal(await r.sparring.accept(a),'');
  assert.equal((await r.sparring.talk(b)).busy,true,'one fight at a time');
  assert.equal(await r.sparring.accept(b),'O Zeca está no meio de outra luta.');
  assert.equal(waitText(90*60_000),'1 h 30 min');assert.equal(waitText(20*60_000),'20 min');
});

test('the fight starts with a count: the foe is on the terrace, cannot be hit and does not throw until it ends; the player is brought to him',async()=>{
  const r=ring(),a=r.add('a');
  a.x+=1.5;a.z+=.4;
  assert.equal(await r.sparring.accept(a),'');
  const foe=foeOf(r,a);
  assert.ok(foe,'the foe is a body of the room');
  assert.deepEqual([foe.displayName,foe.skin,foe.fist.fight],[SPARRING.name,SPARRING.skin,true]);
  assert.equal(r.npc,false,'the idle Zeca steps out');
  assert.ok(Math.abs(Math.hypot(a.x-foe.x,a.z-foe.z)-2.1)<.01||Math.hypot(a.x-foe.x,a.z-foe.z)<3.2,'at fighting distance');
  assert.equal(r.messages.some(m=>m.type==='sparring.start'),true);
  assert.equal(r.state()[0]!.phase,'countdown');
  assert.equal(r.sparring.hittable(foe,r.now),false);
  const punch=aggressive(r);
  let seq=1000;
  for(let i=0;i<Math.floor(SPARRING.countdownMs/TICK_MS)-2;i++)r.tick(a,punch.think(a,foe,r.now,++seq));
  assert.equal(foe.hp,SPARRING_TIERS[0]!.hp,'untouched through the count');
  assert.equal(a.hp,100);assert.equal(foe.fist.punch,'');
  for(let i=0;i<6;i++)r.tick(a);
  assert.equal(r.state().at(-1)!.phase,'fight');
});

test('beating the foe wins: the prize is asked once, the real life was never touched, the foe lies down and then steps off',async()=>{
  const r=ring({seed:3}),a=r.add('a');
  assert.equal(await r.sparring.accept(a),'');
  const foe=foeOf(r,a),fighter=aggressive(r);
  let seq=5000;
  for(let i=0;i<Math.ceil((SPARRING.countdownMs+SPARRING.maxMs)/TICK_MS)&&!r.sparring.duelOf('a')?.phase.startsWith('over');i++)r.tick(a,fighter.think(a,foe,r.now,++seq));
  await new Promise(resolve=>setTimeout(resolve,10));
  const result=r.result()!;
  assert.ok(result,'the fight ended');
  assert.equal(result.won,true,JSON.stringify(result));assert.equal(result.reason,'ko');assert.equal(result.prize,SPARRING_TIERS[0]!.prize);
  assert.equal(r.claims.length,1,'the prize is claimed once');
  assert.equal(a.hp,100,'the real life bar is never touched');assert.equal(a.hpCore,100);
  assert.equal(r.state().at(-1)!.phase,'won');assert.equal(foe.animationState,'fallen');
  assert.equal(r.players.has(foe.id),true,'still on the floor');
  assert.equal(r.sparring.active,false);
  for(let i=0;i<Math.ceil(SPARRING.afterMs/TICK_MS)+2;i++)r.tick(a);
  assert.equal(r.players.has(foe.id),false,'the foe steps off');assert.equal(r.npc,true,'and Zeca is back on the terrace');
  assert.equal(r.claims.length,1);
  assert.equal(r.log.includes('sparring_win'),true);
});

test('standing there loses: the foe\'s blows take the fight\'s life, never the real one, and no prize is asked',async()=>{
  for(const index of [0,1,2]){
    const r=ring({seed:11+index,status:{tier:index}}),a=r.add('a');
    assert.equal(await r.sparring.accept(a),'');
    for(let i=0;i<Math.ceil((SPARRING.countdownMs+SPARRING.maxMs)/TICK_MS)&&!r.result();i++)r.tick(a);
    const result=r.result()!;
    assert.equal(result.won,false,`step ${index}`);assert.ok(['down','time'].includes(result.reason),result.reason);
    assert.equal(a.hp,100);assert.equal(a.hpCore,100);assert.equal(r.claims.length,0);
    assert.notEqual(a.interactionState,'thrown','a sparring never knocks the player out');
  }
});

test('the ladder is felt: the harder the step, the more of the fight\'s life a player who only attacks loses in the same time',async()=>{
  const taken:number[]=[];
  for(const index of [0,1,2]){
    // The same fighter against each step, for the same time, over several seeds.
    let total=0;
    for(let seed=1;seed<=5;seed++){
      const r=ring({seed:seed*17,status:{tier:index}}),a=r.add('a');
      await r.sparring.accept(a);
      const foe=foeOf(r,a),fighter=aggressive(r);
      let seq=100;
      // The foe's life is kept up (nobody wins): what is measured is how much it hits and how little it lets through.
      for(let i=0;i<Math.ceil((SPARRING.countdownMs+14_000)/TICK_MS)&&!r.result();i++){foe.hp=SPARRING_TIERS[index]!.hp;r.tick(a,fighter.think(a,foe,r.now,++seq));}
      const fight=r.state().at(-1)!;
      total+=fight.you.max-fight.you.hp;
    }
    taken.push(total/5);
  }
  assert.ok(taken[0]!<taken[1]!,`easy ${taken[0]} < medium ${taken[1]}`);
  assert.ok(taken[1]!<taken[2]!,`medium ${taken[1]} < hard ${taken[2]}`);
});

test('the fight is called off when the player leaves, drifts away, or a stunt takes them out of it, and counts for nothing',async()=>{
  for(const how of ['leave','far','sit','left-room'] as const){
    const r=ring(),a=r.add('a');
    await r.sparring.accept(a);
    for(let i=0;i<4;i++)r.tick(a);
    if(how==='leave')r.sparring.left('a');
    if(how==='far')a.x+=SPARRING.leash+2;
    if(how==='sit')a.interactionState='seat-1';
    if(how==='left-room')a.connected=false;
    r.tick(a);
    const result=r.result()!;
    assert.equal(result?.won,false,how);assert.equal(result.reason,'left',how);assert.equal(r.claims.length,0);
  }
});

test('a won fight whose prize the API refuses (a wait that started meanwhile) is said to be unpaid, and gives nothing else',async()=>{
  const r=ring({seed:3}),a=r.add('a');
  (r.sparring as unknown as {host:SparringHost}).host.win=async()=>{throw Object.assign(new Error('cooldown'),{status:409});};
  await r.sparring.accept(a);
  const foe=foeOf(r,a),fighter=aggressive(r);let seq=1;
  for(let i=0;i<4000&&!r.result();i++)r.tick(a,fighter.think(a,foe,r.now,++seq));
  await new Promise(resolve=>setTimeout(resolve,10));
  const result=r.result()!;
  assert.equal(result.won,true);assert.equal(result.prize,0);assert.match(result.message,/6 horas/);
});

test('nobody stands inside anybody: walking into him, he gives way and never ends up behind the player or on top of him',async()=>{
  for(const index of [0,2]){
    const r=ring({seed:21+index,status:{tier:index}}),a=r.add('a');
    assert.equal(await r.sparring.accept(a),'');
    const foe=foeOf(r,a);
    let closest=9,behind=0,fighting=0;
    for(let i=0;i<Math.ceil((SPARRING.countdownMs+12_000)/TICK_MS)&&!r.result();i++){
      foe.hp=SPARRING_TIERS[index]!.hp;
      const heading=Math.atan2(foe.x-a.x,foe.z-a.z);
      // The player keeps walking straight at him, as someone pressing the attack does.
      r.tick(a,{dx:Math.sin(heading),dz:Math.cos(heading),rotation:heading});
      if(r.sparring.duelOf('a')?.phase!=='fight')continue;
      fighting++;
      const away=Math.hypot(foe.x-a.x,foe.z-a.z);closest=Math.min(closest,away);
      if(Math.abs(normalizeHeading(Math.atan2(foe.x-a.x,foe.z-a.z)-a.rotation))>1.5)behind++;
    }
    assert.ok(fighting>200);
    assert.ok(closest>=FIGHT.bodyGap-.15,`step ${index}: the closest they came was ${closest.toFixed(2)} m`);
    assert.equal(behind,0,`step ${index}: he never got behind the player`);
  }
});
