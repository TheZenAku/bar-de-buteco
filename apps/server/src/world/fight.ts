import {BLOCK,FIGHT,FIGHT_MOVES,clipMs,realMs,HIT_REACTIONS,blockCovers,blockVerdict,chipOf,isKick,NO_PUNCH,oneWayOf,PATCH_MS,TICK_MS,fightMove,hitReaction,punchById,punchClear,punchContact,punchInReach,punchStep,punchThrowable,rewindOf,streamOf,throwPunch,
  type BlockSpan,type Collider,type FightHit,type FightPose,type PlayerInput,type PunchId,type RagdollStart} from '@bar/shared';
import type {Player} from '../state.js';

/** What the fight needs from the room: who may be hit or keep the guard, life, the knockout, the wire. Kept apart so it runs without a room (test/fight.test.ts). */
export interface FightHost {
  /** Whether the guard can go up now: '' if so, or why not (shown to the player once). */
  guardRefusal(player:Player):string;
  /** Whether the guard stays up: anything that takes the player (a chair, a bike, a drink in hand, fainting) lowers it. */
  keepsGuard(player:Player):boolean;
  /** Whether a blow on this player never takes their real life nor knocks them out (the sparring's ring: its lives are the fight's own). */
  spared?(target:Player):boolean;
  /** Whether this body is a bot: its parry window is the plain one (it has no trip or interpolation to make up for). */
  bot?(player:Player):boolean;
  /** Whether this player has bought a kick skill: only then do the kick presses of the guard throw (the skin's clips are checked by the rules). */
  kicks(player:Player):boolean;
  /** Who a punch may hit now: up and free (or fighting), not just back on their feet. */
  hittable(target:Player,now:number):boolean;
  /** Takes life: the ring first, then the heart's reserve (needs.ts). */
  damage(target:Player,amount:number,now:number):void;
  /** The knockout: the body flies, and out of life the Morte comes when it lands (BarRoom.startThrown). */
  knockout(target:Player,start:RagdollStart,hurt:number):void;
  /** The one hit is taken out of what they were doing and held until Player.fist.stunUntil. */
  stun(target:Player):void;
  /** Moves a body by this much, against walls and furniture (the push of a blow). */
  push(target:Player,dx:number,dz:number):void;
  /** Tells everyone near the one hit. */
  broadcast(hit:FightHit,near:Player):void;
  refuse(player:Player,message:string):void;
  log(event:string,details:Record<string,unknown>):void;
  random():number;
}

/** Where a body was, tick by tick, for the last FIGHT.historyMs: the room turns targets back to where the puncher (or the shooter, world/weapons.ts) saw them. */
export class Track {
  private static readonly SIZE=Math.ceil(FIGHT.historyMs/TICK_MS)+4;
  private readonly data=new Float64Array(Track.SIZE*5);
  private count=0;private head=0;
  add(t:number,x:number,y:number,z:number,rotation:number):void {
    const k=this.head*5;this.data[k]=t;this.data[k+1]=x;this.data[k+2]=y;this.data[k+3]=z;this.data[k+4]=rotation;
    this.head=(this.head+1)%Track.SIZE;this.count=Math.min(this.count+1,Track.SIZE);
  }
  private slot(i:number):number {return ((this.head-this.count+i)%Track.SIZE+Track.SIZE)%Track.SIZE*5;}
  /** Where it was at `t` (between two ticks, in between); before the oldest record, the oldest; after the newest, the newest. */
  at(t:number,fallback:FightPose):FightPose {
    if(!this.count)return fallback;
    const d=this.data;
    let newer=this.slot(this.count-1);
    if(t>=d[newer]!)return {x:d[newer+1]!,y:d[newer+2]!,z:d[newer+3]!,rotation:d[newer+4]!};
    for(let i=this.count-2;i>=0;i--){
      const older=this.slot(i);
      if(t>=d[older]!){
        const span=d[newer]!-d[older]!,f=span>0?(t-d[older]!)/span:1,turn=Math.atan2(Math.sin(d[newer+4]!-d[older+4]!),Math.cos(d[newer+4]!-d[older+4]!));
        return {x:d[older+1]!+(d[newer+1]!-d[older+1]!)*f,y:d[older+2]!+(d[newer+2]!-d[older+2]!)*f,z:d[older+3]!+(d[newer+3]!-d[older+3]!)*f,rotation:d[older+4]!+turn*f};
      }
      newer=older;
    }
    return {x:d[newer+1]!,y:d[newer+2]!,z:d[newer+3]!,rotation:d[newer+4]!};
  }
  clear():void {this.count=0;}
}

interface Fighter {
  track:Track;
  /** The punch on its way: which, when the room took it, how far back the others are looked for, how far into it the fist has been followed. */
  active?:{move:PunchId;at:number;rewind:number;checked:number;skin:string;n:number};
  /** A blow's push still to come: per tick, and how many ticks; `free`: the one pushed is on their feet (a blocker), not staggered. */
  knock?:{dx:number;dz:number;left:number;free?:boolean};
  /** The guard was refused and the player told: not again until the browser stops asking. */
  refused?:boolean;
  /** The block key's presses on the player's own timeline (BlockSpan), the last few; when the last press was (estimated, ms). */
  spans:BlockSpan[];lastPress:number;
  /** The guard meter (fine; the state carries it rounded), when it may start to refill, and until when the counter of a parry hits harder. */
  meter:number;regenAt:number;riposteUntil:number;
  /** How long the browser's inputs take to get here, one way (ms), from the last report (oneWayOf). */
  oneWay:number;
  /** Until when the stun (a parry's) cannot be cut short by the block; and whether the next block raised is a plain one (it came up through a stun, not from a press). */
  noCancelUntil:number;plain:boolean;
}
/** A blow on someone with the guard up, waiting for any block pressed before it to arrive (BLOCK.deferMaxMs). */
interface Pending {puncher:Player;target:Player;active:NonNullable<Fighter['active']>;contact:{ms:number;x:number;y:number;z:number};due:number}

/**
 * The fist fight in the room (docs/sistemas/luta.md). Inputs throw punches and move fighters (`guard`, `move`, called by BarRoom.step in the inputs'
 * order); each tick `step` follows every fist on its way against the others where the puncher saw them, lands the first it meets, and ends stuns,
 * pushes and clips. The rules themselves are shared with the browser (packages/shared/src/fight.ts).
 */
export class FightDirector {
  private readonly fighters=new Map<string,Fighter>();
  private pending:Pending[]=[];
  /** The room's clock as of the last input or step: where a block released by a lowered guard ends. */
  private clock=0;
  constructor(private readonly host:FightHost){}

  private fighter(id:string):Fighter {
    let fighter=this.fighters.get(id);
    if(!fighter){fighter={track:new Track(),spans:[],lastPress:-1e9,meter:BLOCK.meter,regenAt:0,riposteUntil:0,oneWay:0,noCancelUntil:0,plain:false};this.fighters.set(id,fighter);}
    return fighter;
  }
  /** The player left the room. */
  forget(id:string):void {this.fighters.delete(id);this.pending=this.pending.filter(item=>item.puncher.id!==id&&item.target.id!==id);}
  /** Held by a punch or a blow: the room refuses other actions meanwhile (BarRoom.handle). */
  busy(player:Player,seq:number,now:number):boolean {
    return now<player.fist.stunUntil||punchStep(streamOf(player.fist),seq+1,player.skin).locked;
  }
  /** A punch on its way (tests, admin). */
  activeOf(id:string){return this.fighters.get(id)?.active;}

  /** The guard as the input asks for it: up when the room allows it (refused once, told once), down whenever asked. */
  guard(player:Player,input:Pick<PlayerInput,'fight'|'block'>,now=this.clock):void {
    const fighter=this.fighter(player.id),wanted=!!input.fight,fist=player.fist;
    // The stun ends with the clock, not a step later (the input that arrives as it ends is not lost), and a held block cuts it short after BLOCK.hitFreeMs.
    if(fist.stunUntil&&fist.fight&&(now>=fist.stunUntil||(input.block&&player.interactionState==='stagger'&&now>=fist.hitAt+BLOCK.hitFreeMs&&now>=fighter.noCancelUntil&&now>=fist.breakUntil))){
      // Cut short by the block: its raise is a plain block (not a parry), and the flinch ends with it.
      if(now<fist.stunUntil){fighter.plain=true;if(player.animationState==='hit')player.animationState='idle';}
      fist.stunUntil=0;if(player.interactionState==='stagger')player.interactionState='';
    }
    if(!wanted)fighter.refused=false;
    if(wanted===player.fist.fight)return;
    if(!wanted){this.lower(player);return;}
    const why=this.host.guardRefusal(player);
    if(why){if(!fighter.refused){fighter.refused=true;this.host.refuse(player,why);}return;}
    this.clearStream(player);
    player.fist.fight=true;
    // The guard takes the arms and the body: crossed arms open, a dance or a wave stops.
    player.armsCrossed=false;
    if(!['idle','walk','run','hit'].includes(player.animationState)){player.animationState='idle';player.animationStartedAt=Date.now();}
  }
  /** A punch whose fist is done (past its window): the block may come up through the rest of its recovery, the press is not lost to the swing. */
  private recovered(player:Player,now:number):boolean {
    const move=punchById(player.fist.punch);
    return !!move&&clipMs(now-player.fist.at)>=move.activeTo;
  }
  /** The guard comes down; the last punch is forgotten (the next one starts a chain), and one on its way stops counting. */
  lower(player:Player):void {
    player.fist.fight=false;
    this.clearStream(player);
    const fighter=this.fighters.get(player.id);
    if(fighter){fighter.active=undefined;this.drop(player,fighter);}
    if(player.animationState==='punch')player.animationState='idle';
  }
  private clearStream(player:Player):void {
    const fist=player.fist;
    if(fist.punch||fist.seq!==NO_PUNCH.seq){fist.punch='';fist.seq=NO_PUNCH.seq;fist.yaw=0;fist.lunge=0;}
  }

  /** The block goes up with this input: when the press was, on the blocker's timeline (the input's trip back), and whether it opens a parry window. */
  private raise(player:Player,fighter:Fighter,input:PlayerInput,now:number):void {
    if(input.blockAt)fighter.oneWay=oneWayOf(now,input.blockAt);
    const pressAt=now-fighter.oneWay;
    fighter.spans.push({from:pressAt,to:Infinity,parry:!fighter.plain&&pressAt-fighter.lastPress>=BLOCK.parryCooldownMs,early:this.host.bot?.(player)?BLOCK.botParryMs:BLOCK.parryMs,late:this.host.bot?.(player)?0:BLOCK.parryLateMs});
    fighter.plain=false;
    if(fighter.spans.length>6)fighter.spans.shift();
    fighter.lastPress=pressAt;
    player.fist.block=true;
    // The hands come up: a swing not thrown yet is forgotten, a punch's clip ends.
    fighter.active=undefined;
    if(player.animationState==='punch')player.animationState='idle';
  }
  /** The block comes down (released, stunned, the guard lowered): its span ends where the release was, on the blocker's timeline. */
  private drop(player:Player,fighter:Fighter):void {
    const open=fighter.spans.at(-1);
    if(open&&open.to===Infinity)open.to=Math.max(open.from,this.clock-fighter.oneWay);
    player.fist.block=false;
  }

  /**
   * One input with the guard up: a punch thrown with it (when the rules allow it, the same rules the browser predicted with), then the feet planted
   * or stepping in while a punch holds them, else a walk at the guard's pace. Returns whether the body moved.
   */
  move(player:Player,input:PlayerInput,now:number,stagePass:boolean,obstacles:readonly Collider[]):boolean {
    this.clock=now;
    const fist=player.fist,fighter=this.fighter(player.id);
    let stream=streamOf(fist);
    const command=input.punch;
    if(command)fighter.oneWay=oneWayOf(now,command);
    // The block: held with the feet free (not while a punch plants them, nor stunned or broken); it takes the hands, so no punch goes with it.
    const free=(!punchStep(stream,input.seq,player.skin).locked||this.recovered(player,now))&&now>=fist.stunUntil&&now>=fist.breakUntil;
    const blocking=!!input.block&&free;
    if(blocking&&!fist.block)this.raise(player,fighter,input,now);
    else if(!blocking&&fist.block)this.drop(player,fighter);
    if(!blocking&&command&&now>=fist.stunUntil&&punchThrowable(stream,input.seq,command.m,player.skin)&&(!isKick(command.m)||this.host.kicks(player))){
      stream=throwPunch(command,input.seq,input.rotation);
      fist.punch=stream.move;fist.seq=stream.seq;fist.yaw=stream.yaw;fist.lunge=stream.lunge;fist.n=stream.n;fist.at=now;
      player.animationState='punch';player.animationStartedAt=now;
      fighter.active={move:command.m,at:now,rewind:rewindOf(now,command,PATCH_MS),checked:0,skin:player.skin,n:stream.n};
    }
    const {locked}=punchStep(stream,input.seq,player.skin),next=fightMove(player,stream,input.seq,input,TICK_MS/1000,stagePass,obstacles,player.skin,player.animationState==='punch');
    const moving=next.x!==player.x||next.z!==player.z;
    player.x=next.x;player.y=next.y;player.z=next.z;
    player.rotation=locked?stream.yaw:input.rotation;
    if(!locked){
      if(input.dx||input.dz)player.animationState=input.running?'run':'walk';
      else if(player.animationState==='walk'||player.animationState==='run')player.animationState='idle';
    }
    return moving;
  }

  /** One tick, after everyone's inputs: where each body is (for the history), the punches on their way, the pushes, and what ends now. */
  step(now:number,players:Iterable<Player>):void {
    this.clock=now;
    const all=[...players];
    for(const player of all){
      const fighter=this.fighter(player.id);
      fighter.track.add(now,player.x,player.y,player.z,player.rotation);
      const fist=player.fist;
      if(fist.fight&&!this.host.keepsGuard(player))this.lower(player);
      if(fighter.knock){
        if(fighter.knock.free||player.interactionState==='stagger')this.host.push(player,fighter.knock.dx,fighter.knock.dz);
        if(--fighter.knock.left<=0)fighter.knock=undefined;
      }
      if(fist.stunUntil&&now>=fist.stunUntil){fist.stunUntil=0;if(player.interactionState==='stagger')player.interactionState='';}
      if(player.animationState==='hit'&&now>=fist.hitAt+(HIT_REACTIONS[fist.hit as keyof typeof HIT_REACTIONS]??1000))player.animationState='idle';
      const move=punchById(fist.punch);
      if(player.animationState==='punch'&&(!move||now>=fist.at+realMs(move.durationMs)))player.animationState='idle';
      // The guard meter: refills once the blocker has been left alone a moment, partly back when a broken guard recovers.
      if(fist.breakUntil&&now>=fist.breakUntil){fist.breakUntil=0;fighter.meter=BLOCK.meter*BLOCK.breakRefill/100;fighter.regenAt=now;}
      else if(!fist.breakUntil&&!fist.block&&fighter.meter<BLOCK.meter&&now>=fighter.regenAt)fighter.meter=Math.min(BLOCK.meter,fighter.meter+BLOCK.regenPerS*TICK_MS/1000);
      const shown=Math.round(fighter.meter);
      if(fist.guard!==shown)fist.guard=shown;
    }
    this.settle(now);
    for(const puncher of all){
      const fighter=this.fighters.get(puncher.id),active=fighter?.active;
      if(!active)continue;
      if(!puncher.connected||!puncher.fist.fight||puncher.fist.at!==active.at){fighter.active=undefined;continue;}
      // The blow's own time (clip milliseconds: the windows and the fist's way are the clip's), from the real time since the room took it.
      const toMs=clipMs(now-active.at),blow=FIGHT_MOVES[active.move];
      if(toMs>=blow.activeFrom-FIGHT.sweepMs)this.follow(puncher,fighter,active,toMs,all,now);
      if(fighter.active&&toMs>=blow.activeTo)fighter.active=undefined;
    }
  }

  /** The fist from where it was last followed to `toMs`, against everyone it could reach: the first it meets is hit. */
  private follow(puncher:Player,fighter:Fighter,active:NonNullable<Fighter['active']>,toMs:number,all:readonly Player[],now:number):void {
    const fromMs=active.checked;active.checked=toMs;
    const self=(ms:number)=>fighter.track.at(active.at+realMs(ms),puncher);
    let best:{target:Player;contact:NonNullable<ReturnType<typeof punchContact>>}|undefined;
    for(const target of all){
      if(target===puncher||Math.abs(target.x-puncher.x)>4||Math.abs(target.z-puncher.z)>4)continue;
      if(!this.host.hittable(target,now)||!punchInReach(active.skin,active.move,puncher,target)||!punchClear(puncher,target))continue;
      const track=this.fighter(target.id).track;
      const contact=punchContact(active.skin,active.move,fromMs,toMs,self,target.skin,ms=>track.at(active.at+realMs(ms)-active.rewind,target));
      if(contact&&(!best||contact.ms<best.contact.ms))best={target,contact};
    }
    if(!best)return;
    fighter.active=undefined;
    const victim=this.fighter(best.target.id),hitMs=active.at+realMs(best.contact.ms);
    // Someone with the guard up may have pressed the block before this blow, as they saw it, with the press still on its way here: wait for it.
    // A block already held past the parry window is settled at once (no press can change it).
    const held=victim.spans.at(-1);
    const sure=!!best.target.fist.block&&!!held&&held.to===Infinity&&hitMs-held.from>(held.early??BLOCK.parryMs);
    if(best.target.fist.fight&&!sure){
      this.pending.push({puncher,target:best.target,active,contact:best.contact,due:now+Math.max(TICK_MS/2,Math.min(BLOCK.deferMaxMs,victim.oneWay+(this.host.bot?.(best.target)?0:BLOCK.parryLateMs)+TICK_MS/2))});
      return;
    }
    this.resolve(puncher,best.target,active,best.contact,now);
  }

  /** The blows that waited for a block to arrive, due now: each is settled against the block as the room knows it by this tick. */
  private settle(now:number):void {
    if(!this.pending.length)return;
    const due=this.pending.filter(item=>item.due<=now);
    if(!due.length)return;
    this.pending=this.pending.filter(item=>item.due>now);
    for(const item of due){
      const {puncher,target}=item;
      // Gone, or already taken out of the fight by something else in the meantime: the blow is lost.
      if(!puncher.connected||!target.connected||!this.host.hittable(target,now)||now<target.fist.stunUntil)continue;
      this.resolve(puncher,target,item.active,item.contact,now);
    }
  }

  /** A blow that met a body: the block it ran into, if any, decides what it does. */
  private resolve(puncher:Player,target:Player,active:NonNullable<Fighter['active']>,contact:{ms:number;x:number;y:number;z:number},now:number):void {
    const victim=this.fighter(target.id),hitMs=active.at+realMs(contact.ms);
    if(target.fist.fight){
      const there=victim.track.at(hitMs,target),from=this.fighter(puncher.id).track.at(hitMs,puncher);
      const verdict=blockCovers(there,from)?blockVerdict(victim.spans,hitMs):'none';
      if(verdict==='parry')return this.parry(puncher,target,active,contact,now);
      if(verdict==='block')return this.block(puncher,target,active,contact,now);
    }
    this.land(puncher,target,active,contact,now);
  }

  /** The blow ran into a block: a sliver of its life gets through, the guard meter pays for the rest, and a spent meter breaks the guard. */
  private block(puncher:Player,target:Player,active:NonNullable<Fighter['active']>,contact:{ms:number;x:number;y:number;z:number},now:number):void {
    const blow=FIGHT_MOVES[active.move],victim=this.fighter(target.id),fist=target.fist;
    const away=Math.hypot(target.x-puncher.x,target.z-puncher.z),yaw=away>.05?Math.atan2(target.x-puncher.x,target.z-puncher.z):puncher.rotation;
    const chip=chipOf(active.move,target.hp+target.hpCore);
    if(chip>0)this.host.damage(target,chip,now);
    victim.meter=Math.max(0,victim.meter-blow.damage*BLOCK.drain);victim.regenAt=now+BLOCK.regenDelayMs;fist.guard=Math.round(victim.meter);
    const broken=victim.meter<=0;
    let stunUntil=0;
    if(broken){
      this.drop(target,victim);
      fist.breakUntil=stunUntil=now+BLOCK.breakMs;
      fist.hitAt=now;fist.hit='HitHeavy';fist.hitYaw=yaw;fist.stunUntil=stunUntil;
      target.animationState='hit';target.animationStartedAt=now;
      this.host.stun(target);
    }
    const ticks=Math.max(1,Math.round(FIGHT.knockbackMs/TICK_MS)),push=blow.knockback*(broken?1:BLOCK.push);
    if(push>0)victim.knock={dx:Math.sin(yaw)*push/ticks,dz:Math.cos(yaw)*push/ticks,left:ticks,free:!broken};
    // The blow that met a held block throws the puncher back a moment: the chain ends there, and the one defending has the opening to counter.
    let recoilUntil=0;
    if(!broken){
      const thrower=this.fighter(puncher.id),hurt=puncher.fist;
      recoilUntil=thrower.noCancelUntil=now+BLOCK.recoilMs;
      thrower.active=undefined;this.clearStream(puncher);
      hurt.hitAt=now;hurt.hit='HitLight';hurt.hitYaw=yaw+Math.PI;hurt.stunUntil=recoilUntil;
      puncher.animationState='hit';puncher.animationStartedAt=now;
      this.host.stun(puncher);
    }
    this.say(puncher,target,active,contact,now,{damage:chip,yaw,reaction:broken?'HitHeavy':blow.reaction,stunUntil,ko:false,guard:broken?'break':'block',recoilUntil});
    this.host.log('fight_block',{playerId:target.id,by:puncher.id,move:active.move,hp:chip,meter:Math.round(victim.meter),broken});
  }

  /** The blow was parried: nothing gets through, the puncher is thrown off balance, the parrier's meter comes back and their next blow hits harder. */
  private parry(puncher:Player,target:Player,active:NonNullable<Fighter['active']>,contact:{ms:number;x:number;y:number;z:number},now:number):void {
    const victim=this.fighter(target.id),thrower=this.fighter(puncher.id),fist=puncher.fist;
    const away=Math.hypot(puncher.x-target.x,puncher.z-target.z),yaw=away>.05?Math.atan2(puncher.x-target.x,puncher.z-target.z):target.rotation;
    victim.meter=Math.min(BLOCK.meter,victim.meter+BLOCK.parryRefill);victim.riposteUntil=now+BLOCK.riposteMs;target.fist.guard=Math.round(victim.meter);
    // The puncher: whatever they had on its way is cut short, and the next chain starts when they can act again.
    thrower.active=undefined;thrower.knock=undefined;
    this.clearStream(puncher);
    const stunUntil=now+BLOCK.parryStunMs;
    thrower.noCancelUntil=stunUntil;
    fist.hitAt=now;fist.hit='HitMedium';fist.hitYaw=yaw;fist.stunUntil=stunUntil;
    puncher.animationState='hit';puncher.animationStartedAt=now;
    this.host.stun(puncher);
    const ticks=Math.max(1,Math.round(FIGHT.knockbackMs/TICK_MS));
    thrower.knock={dx:Math.sin(yaw)*BLOCK.parryPush/ticks,dz:Math.cos(yaw)*BLOCK.parryPush/ticks,left:ticks};
    this.say(puncher,target,active,contact,now,{damage:0,yaw:Math.atan2(target.x-puncher.x,target.z-puncher.z),reaction:'HitMedium',stunUntil,ko:false,guard:'parry'});
    this.host.log('fight_parry',{playerId:target.id,by:puncher.id,move:active.move});
  }

  /** Tells everyone near what a blow did. */
  private say(puncher:Player,target:Player,active:NonNullable<Fighter['active']>,contact:{x:number;y:number;z:number},now:number,
    result:Pick<FightHit,'damage'|'yaw'|'reaction'|'stunUntil'|'ko'|'guard'|'recoilUntil'>):void {
    const hit:FightHit={by:puncher.id,to:target.id,move:active.move,n:active.n,hp:target.hp,x:+contact.x.toFixed(3),y:+contact.y.toFixed(3),z:+contact.z.toFixed(3),at:now,...result,yaw:+result.yaw.toFixed(3)};
    this.host.broadcast(hit,target);
  }

  private land(puncher:Player,target:Player,active:NonNullable<Fighter['active']>,contact:{ms:number;x:number;y:number;z:number},now:number):void {
    const blow=FIGHT_MOVES[active.move],away=Math.hypot(target.x-puncher.x,target.z-puncher.z);
    const yaw=away>.05?Math.atan2(target.x-puncher.x,target.z-puncher.z):puncher.rotation;
    // A parry's counter: the first blow within BLOCK.riposteMs hits harder, and spends it.
    const thrower=this.fighter(puncher.id),dealt=now<thrower.riposteUntil?Math.round(blow.damage*BLOCK.riposte):blow.damage;
    if(dealt!==blow.damage)thrower.riposteUntil=0;
    const reaction=hitReaction(active.move,puncher,target),ko=!this.host.spared?.(target)&&dealt>=target.hp+target.hpCore;
    const victim=this.fighter(target.id);
    // A blow takes the swing it hits out of the other's hand: whoever is hit before their own fist is out (their window has not opened) feels it and loses the
    // swing. Only a fist already in its window is a trade and still lands (both landed in the same instant). With a looser rule, a hit on a foe half way into his
    // swing changed nothing: his punch came through anyway, "he does not feel it".
    const hitAt=active.at+realMs(contact.ms),swing=victim.active;
    if(!swing||clipMs(hitAt-swing.at)<FIGHT_MOVES[swing.move].activeFrom)victim.active=undefined;
    // The same for his blow that already met a body and waits for a block to arrive (pending): if his fist was not out when this one landed, it is lost.
    this.pending=this.pending.filter(item=>item.puncher!==target||clipMs(hitAt-item.active.at)>=FIGHT_MOVES[item.active.move].activeFrom);
    victim.knock=undefined;
    // A guard that was up and failed (from behind, or no block yet) is down as the blow lands.
    this.drop(target,victim);victim.regenAt=now+BLOCK.regenDelayMs;
    let stunUntil=0;
    if(ko){
      this.lower(target);
      this.host.knockout(target,{x:target.x,y:target.y,z:target.z,yaw:target.rotation,vx:Math.sin(yaw)*blow.launch.speed,vz:Math.cos(yaw)*blow.launch.speed,
        closing:blow.launch.closing,lift:blow.launch.lift,by:puncher.id,seated:false,seed:Math.floor(this.host.random()*0xffffffff)},dealt);
    }else{
      this.host.damage(target,dealt,now);
      const fist=target.fist;
      // A punch of theirs on its way is cut short, and the next one starts a new chain once they can act.
      this.clearStream(target);
      stunUntil=now+blow.stunMs;
      fist.hitAt=now;fist.hit=reaction;fist.hitYaw=yaw;fist.stunUntil=stunUntil;
      target.animationState='hit';target.animationStartedAt=now;
      this.host.stun(target);
      const ticks=Math.max(1,Math.round(FIGHT.knockbackMs/TICK_MS));
      if(blow.knockback>0)victim.knock={dx:Math.sin(yaw)*blow.knockback/ticks,dz:Math.cos(yaw)*blow.knockback/ticks,left:ticks};
    }
    const hit:FightHit={by:puncher.id,to:target.id,move:active.move,n:active.n,damage:dealt,hp:target.hp,x:+contact.x.toFixed(3),y:+contact.y.toFixed(3),z:+contact.z.toFixed(3),
      yaw:+yaw.toFixed(3),reaction,at:now,stunUntil,ko};
    this.host.broadcast(hit,target);
    this.host.log(ko?'fight_ko':'fight_hit',{playerId:target.id,by:puncher.id,move:active.move,hp:dealt,rewind:Math.round(active.rewind),at:contact.ms});
  }
}
