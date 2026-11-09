import {FIGHT,FIGHT_MOVES,HIT_REACTIONS,NO_PUNCH,PATCH_MS,TICK_MS,fightMove,hitReaction,punchAllowed,punchById,punchClear,punchContact,punchInReach,punchKind,punchStep,rewindOf,streamOf,throwPunch,
  type Collider,type FightHit,type FightPose,type PlayerInput,type PunchId,type RagdollStart} from '@bar/shared';
import type {Player} from '../state.js';

/** What the fight needs from the room: who may be hit or keep the guard, life, the knockout, the wire. Kept apart so it runs without a room (test/fight.test.ts). */
export interface FightHost {
  /** Whether the guard can go up now: '' if so, or why not (shown to the player once). */
  guardRefusal(player:Player):string;
  /** Whether the guard stays up: anything that takes the player (a chair, a bike, a drink in hand, fainting) lowers it. */
  keepsGuard(player:Player):boolean;
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

/** Where a body was, tick by tick, for the last FIGHT.historyMs: the room turns targets back to where the puncher saw them. */
class Track {
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
  /** A blow's push still to come: per tick, and how many ticks. */
  knock?:{dx:number;dz:number;left:number};
  /** The guard was refused and the player told: not again until the browser stops asking. */
  refused?:boolean;
}

/**
 * The fist fight in the room (docs/sistemas/luta.md). Inputs throw punches and move fighters (`guard`, `move`, called by BarRoom.step in the inputs'
 * order); each tick `step` follows every fist on its way against the others where the puncher saw them, lands the first it meets, and ends stuns,
 * pushes and clips. The rules themselves are shared with the browser (packages/shared/src/fight.ts).
 */
export class FightDirector {
  private readonly fighters=new Map<string,Fighter>();
  constructor(private readonly host:FightHost){}

  private fighter(id:string):Fighter {
    let fighter=this.fighters.get(id);
    if(!fighter){fighter={track:new Track()};this.fighters.set(id,fighter);}
    return fighter;
  }
  /** The player left the room. */
  forget(id:string):void {this.fighters.delete(id);}
  /** Held by a punch or a blow: the room refuses other actions meanwhile (BarRoom.handle). */
  busy(player:Player,seq:number,now:number):boolean {
    return now<player.fist.stunUntil||punchStep(streamOf(player.fist),seq+1).locked;
  }
  /** A punch on its way (tests, admin). */
  activeOf(id:string){return this.fighters.get(id)?.active;}

  /** The guard as the input asks for it: up when the room allows it (refused once, told once), down whenever asked. */
  guard(player:Player,input:Pick<PlayerInput,'fight'>):void {
    const fighter=this.fighter(player.id),wanted=!!input.fight;
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
  /** The guard comes down; the last punch is forgotten (the next one starts a chain), and one on its way stops counting. */
  lower(player:Player):void {
    player.fist.fight=false;
    this.clearStream(player);
    const fighter=this.fighters.get(player.id);
    if(fighter)fighter.active=undefined;
    if(player.animationState==='punch')player.animationState='idle';
  }
  private clearStream(player:Player):void {
    const fist=player.fist;
    if(fist.punch||fist.seq!==NO_PUNCH.seq){fist.punch='';fist.seq=NO_PUNCH.seq;fist.yaw=0;fist.lunge=0;}
  }

  /**
   * One input with the guard up: a punch thrown with it (when the rules allow it, the same rules the browser predicted with), then the feet planted
   * or stepping in while a punch holds them, else a walk at the guard's pace. Returns whether the body moved.
   */
  move(player:Player,input:PlayerInput,now:number,stagePass:boolean,obstacles:readonly Collider[]):boolean {
    const fist=player.fist;
    let stream=streamOf(fist);
    const command=input.punch;
    if(command&&now>=fist.stunUntil&&punchAllowed(stream,input.seq,punchKind(command.m))===command.m){
      stream=throwPunch(command,input.seq,input.rotation);
      fist.punch=stream.move;fist.seq=stream.seq;fist.yaw=stream.yaw;fist.lunge=stream.lunge;fist.n=stream.n;fist.at=now;
      player.animationState='punch';player.animationStartedAt=now;
      this.fighter(player.id).active={move:command.m,at:now,rewind:rewindOf(now,command,PATCH_MS),checked:0,skin:player.skin,n:stream.n};
    }
    const {locked}=punchStep(stream,input.seq),next=fightMove(player,stream,input.seq,input,TICK_MS/1000,stagePass,obstacles,player.skin,player.animationState==='punch');
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
    const all=[...players];
    for(const player of all){
      const fighter=this.fighter(player.id);
      fighter.track.add(now,player.x,player.y,player.z,player.rotation);
      const fist=player.fist;
      if(fist.fight&&!this.host.keepsGuard(player))this.lower(player);
      if(fighter.knock){
        if(player.interactionState==='stagger')this.host.push(player,fighter.knock.dx,fighter.knock.dz);
        if(--fighter.knock.left<=0)fighter.knock=undefined;
      }
      if(fist.stunUntil&&now>=fist.stunUntil){fist.stunUntil=0;if(player.interactionState==='stagger')player.interactionState='';}
      if(player.animationState==='hit'&&now>=fist.hitAt+(HIT_REACTIONS[fist.hit as keyof typeof HIT_REACTIONS]??1000))player.animationState='idle';
      const move=punchById(fist.punch);
      if(player.animationState==='punch'&&(!move||now>=fist.at+move.durationMs))player.animationState='idle';
    }
    for(const puncher of all){
      const fighter=this.fighters.get(puncher.id),active=fighter?.active;
      if(!active)continue;
      if(!puncher.connected||!puncher.fist.fight||puncher.fist.at!==active.at){fighter.active=undefined;continue;}
      const toMs=now-active.at,blow=FIGHT_MOVES[active.move];
      if(toMs>=blow.activeFrom-FIGHT.sweepMs)this.follow(puncher,fighter,active,toMs,all,now);
      if(fighter.active&&toMs>=blow.activeTo)fighter.active=undefined;
    }
  }

  /** The fist from where it was last followed to `toMs`, against everyone it could reach: the first it meets is hit. */
  private follow(puncher:Player,fighter:Fighter,active:NonNullable<Fighter['active']>,toMs:number,all:readonly Player[],now:number):void {
    const fromMs=active.checked;active.checked=toMs;
    const self=(ms:number)=>fighter.track.at(active.at+ms,puncher);
    let best:{target:Player;contact:NonNullable<ReturnType<typeof punchContact>>}|undefined;
    for(const target of all){
      if(target===puncher||Math.abs(target.x-puncher.x)>4||Math.abs(target.z-puncher.z)>4)continue;
      if(!this.host.hittable(target,now)||!punchInReach(active.skin,active.move,puncher,target)||!punchClear(puncher,target))continue;
      const track=this.fighter(target.id).track;
      const contact=punchContact(active.skin,active.move,fromMs,toMs,self,target.skin,ms=>track.at(active.at+ms-active.rewind,target));
      if(contact&&(!best||contact.ms<best.contact.ms))best={target,contact};
    }
    if(!best)return;
    fighter.active=undefined;
    this.land(puncher,best.target,active,best.contact,now);
  }

  private land(puncher:Player,target:Player,active:NonNullable<Fighter['active']>,contact:{ms:number;x:number;y:number;z:number},now:number):void {
    const blow=FIGHT_MOVES[active.move],away=Math.hypot(target.x-puncher.x,target.z-puncher.z);
    const yaw=away>.05?Math.atan2(target.x-puncher.x,target.z-puncher.z):puncher.rotation;
    const reaction=hitReaction(active.move,puncher,target),ko=blow.damage>=target.hp+target.hpCore;
    const victim=this.fighter(target.id);
    victim.active=undefined;victim.knock=undefined;
    let stunUntil=0;
    if(ko){
      this.lower(target);
      this.host.knockout(target,{x:target.x,y:target.y,z:target.z,yaw:target.rotation,vx:Math.sin(yaw)*blow.launch.speed,vz:Math.cos(yaw)*blow.launch.speed,
        closing:blow.launch.closing,lift:blow.launch.lift,by:puncher.id,seated:false,seed:Math.floor(this.host.random()*0xffffffff)},blow.damage);
    }else{
      this.host.damage(target,blow.damage,now);
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
    const hit:FightHit={by:puncher.id,to:target.id,move:active.move,n:active.n,damage:blow.damage,hp:target.hp,x:+contact.x.toFixed(3),y:+contact.y.toFixed(3),z:+contact.z.toFixed(3),
      yaw:+yaw.toFixed(3),reaction,at:now,stunUntil,ko};
    this.host.broadcast(hit,target);
    this.host.log(ko?'fight_ko':'fight_hit',{playerId:target.id,by:puncher.id,move:active.move,hp:blow.damage,rewind:Math.round(active.rewind),at:contact.ms});
  }
}
