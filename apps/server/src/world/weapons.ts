import {GUN,arsenalWeapon,armedPace,damageOf,elevationOf,encodeKit,eyeOf,gunRewindOf,headingOf,killImpulse,mapRay,minSpread,muzzleOf,normalize,originPlausible,pelletDirections,
  reloadDuration,reloadInterruptible,roundsLoaded,shotFollows,shotSeed,traceShot,weaponStats,
  type ArsenalView,type GunInput,type GunPose,type PelletEnd,type PelletTrace,type RagdollStart,type ShotCommand,type ShotTarget,type WeaponHitEvent,type WeaponId,
  type WeaponShotEvent,type WeaponStats,type WorldRay} from '@bar/shared';
import type {Player} from '../state.js';
import {Track} from './fight.js';

/** What the firearms need from the room: who may hold a gun and who may be hit, life, the knockout, the wire. Kept apart so it runs without a room (test/weapons.test.ts). */
export interface WeaponHost {
  /** Every body in the room (players, bots, training dummies): the shots' targets. */
  players():Iterable<Player>;
  /** Why this player may not hold a gun now ('' when they may): seated, riding, hands busy, the guard up, out of it. A drawn gun is put away when it stops being ''. */
  refusal(player:Player):string;
  /** Who a bullet may hit now: up and on foot, not just back up. */
  hittable(target:Player,now:number):boolean;
  /** Whether a hit on this player never takes their real life nor knocks them out (the sparring's ring). */
  spared?(target:Player):boolean;
  /** Takes life: the ring first, then the heart's reserve (or a dummy's or the ring's own lives). */
  damage(target:Player,amount:number,now:number):void;
  /** The knockout: the body flies, and out of life the Morte comes when it lands (BarRoom.startThrown). `hurt` is the shot's damage. */
  knockout(target:Player,start:RagdollStart,hurt:number):void;
  /** A gun came out: whatever else had the hands (crossed arms, a dance, a cigarette) lets go. */
  drew?(player:Player):void;
  /** A shot, to everyone within `radius` metres of the shooter except the shooter (weapon.shot). */
  shot(shooter:Player,event:WeaponShotEvent,radius:number):void;
  /** A hit, to the shooter, the one hit and everyone who sees the one hit (weapon.hit). */
  hit(shooter:Player,target:Player,event:WeaponHitEvent):void;
  refuse(player:Player,message:string):void;
  log(event:string,details:Record<string,unknown>):void;
  random():number;
  /** The map, as the bullets meet it (tests give a stand-in). */
  world?:WorldRay;
}

interface Armed {
  player:Player;view:ArsenalView;
  /** The weapon in hand as fitted and upgraded. */
  stats?:WeaponStats;
  /** Rounds left in each weapon (full the first time it is drawn). */
  rounds:Map<WeaponId,number>;
  /** The cadence's bucket: shots that may go now (up to 1+GUN.burstAllowance), refilled one per interval. */
  tokens:number;tokenAt:number;
  /** The reload key's last count (a new value is a press). */
  reloadKey?:number;
  /** A weapon the room refused or put away: the browser's inputs still asking for it change nothing until it asks for something else. */
  latched?:string;
  /** Kinds of dropped shots already logged for this player (logged once). */
  warned:Set<string>;
}

const round3=(value:number)=>Math.round(value*1000)/1000;
const BUCKET=1+GUN.burstAllowance;

/**
 * The firearms in the room (docs/sistemas/armas.md). Everything rides on the inputs (`input`, called by BarRoom.step in their order, right after the
 * fist's guard): the weapon drawn, aiming, the reload key and every shot, which is judged here, against the others where the shooter saw them (lag
 * compensation from a pose history kept by `step`), with the shared hitscan (traceShot) the browser also ran. Each tick `step` finishes reloads and
 * puts away a gun its holder can no longer hold.
 */
export class WeaponDirector {
  private readonly armed=new Map<string,Armed>();
  private readonly tracks=new Map<string,Track>();
  private readonly world:WorldRay;
  constructor(private readonly host:WeaponHost){this.world=host.world??mapRay;}

  /** The system is on for this player (/armas) with this arsenal. */
  enable(player:Player,view:ArsenalView):void {
    const previous=this.armed.get(player.id);
    this.armed.set(player.id,{player,view,rounds:previous?.rounds??new Map(),tokens:BUCKET,tokenAt:0,reloadKey:previous?.reloadKey,warned:new Set()});
    player.gun.on=true;
  }
  /** Off: the gun is put away and the system closed. */
  disable(player:Player):void {
    const armed=this.armed.get(player.id);
    if(armed)this.holster(player,false);
    player.gun.assign({on:false,w:'',kit:'',ads:false,mag:0,reloadAt:0,reloadUntil:0,reloadFrom:0});
    this.armed.delete(player.id);
  }
  /** The player left the room. */
  forget(id:string):void {this.armed.delete(id);this.tracks.delete(id);}
  isOn(id:string):boolean {return this.armed.has(id);}
  arsenalOf(id:string):ArsenalView|undefined {return this.armed.get(id)?.view;}
  /** The arsenal changed (a part fitted, an upgrade): the weapon in hand follows, its rounds no more than it now holds. */
  setArsenal(player:Player,view:ArsenalView):void {
    const armed=this.armed.get(player.id);
    if(!armed)return;
    armed.view=view;
    const gun=player.gun;
    if(!gun.w)return;
    const owned=arsenalWeapon(view,gun.w);
    if(!owned?.equipped){this.holster(player,true);return;}
    const stats=weaponStats(owned.id,owned.parts,owned.upgrades);
    armed.stats=stats;gun.kit=encodeKit(owned.parts);
    if(gun.mode>=stats.modes.length)gun.mode=0;
    if(gun.reloadUntil)this.endReload(armed,Date.now());
    if(gun.mag>stats.mag)gun.mag=stats.mag;
    armed.rounds.set(owned.id,gun.mag);
  }
  /** Whether a weapon is in hand. */
  drawn(player:Player):boolean {return !!player.gun.w;}
  /** The walking pace while aiming (m/s, never a run), or undefined: the usual walk. The browser predicts the same (armedPace). */
  pace(player:Player):number|undefined {
    const armed=this.armed.get(player.id);
    return player.gun.w&&armed?.stats?armedPace(armed.stats,player.gun.ads):undefined;
  }
  /**
   * The gun is put away (a chair, a bike, the system off, death). `latch`: the browser may still be asking for it on inputs on their way; those are
   * ignored until it asks for something else (it sees `gun.w` empty and follows).
   */
  holster(player:Player,latch=true):void {
    const armed=this.armed.get(player.id),gun=player.gun;
    if(!gun.w)return;
    if(armed){
      if(gun.reloadUntil)this.endReload(armed,Date.now());
      armed.rounds.set(gun.w as WeaponId,gun.mag);
      if(latch)armed.latched=gun.w;
      armed.stats=undefined;
    }
    gun.assign({w:'',kit:'',ads:false,mag:0,reloadAt:0,reloadUntil:0,reloadFrom:0});
  }

  /** One input: the reload key, the weapon wanted, aiming, the fire mode, then each shot in order. Nothing while the system is off. */
  input(player:Player,input:{gun?:GunInput},now:number):void {
    const armed=this.armed.get(player.id),wanted=input.gun,gun=player.gun;
    if(!armed||!gun.on||!wanted)return;
    // The reload key first: a press on the input that draws reloads nothing (and the first count seen is where it starts).
    if(wanted.r!==undefined&&wanted.r!==armed.reloadKey){const press=armed.reloadKey!==undefined;armed.reloadKey=wanted.r;if(press&&gun.w)this.reload(armed,now);}
    let w:string=wanted.w;
    if(armed.latched!==undefined){if(w===armed.latched)w=gun.w;else armed.latched=undefined;}
    if(w!==gun.w){if(w)this.draw(armed,w as WeaponId,now);else this.holster(player,false);}
    if(gun.w&&armed.stats){
      gun.ads=!!wanted.ads;
      if(wanted.p!==undefined)gun.pitch=Math.max(-GUN.pitchMax,Math.min(GUN.pitchMax,wanted.p));
      if(wanted.m!==undefined)gun.mode=wanted.m<armed.stats.modes.length?wanted.m:0;
    }else gun.ads=false;
    for(const shot of wanted.s??[])this.fire(armed,wanted.w,shot,now);
  }

  /** One tick: the poses' history, reloads that end, guns their holders can no longer hold. */
  step(now:number,players:Iterable<Player>):void {
    for(const player of players){
      let track=this.tracks.get(player.id);
      if(!track){track=new Track();this.tracks.set(player.id,track);}
      track.add(now,player.x,player.y,player.z,player.rotation);
    }
    for(const armed of this.armed.values()){
      const {player}=armed,gun=player.gun;
      if(!gun.w)continue;
      if(!gun.on||this.host.refusal(player)){this.holster(player,true);continue;}
      if(gun.reloadUntil&&armed.stats){
        // Round by round, the rounds go in as they are pushed (the browser counts the same, roundsLoaded).
        if(reloadInterruptible(armed.stats))gun.mag=roundsLoaded(armed.stats,gun.reloadFrom,now-gun.reloadAt,this.reserve(armed,armed.stats));
        if(now>=gun.reloadUntil)this.endReload(armed,now);
      }
    }
  }

  private reserve(armed:Armed,stats:WeaponStats):number {return armed.view.infinite?Infinity:Math.max(0,armed.view.ammo[stats.caliber]??0);}

  private draw(armed:Armed,w:WeaponId,now:number):void {
    const {player}=armed,gun=player.gun,owned=arsenalWeapon(armed.view,w);
    const why=!owned?'Você não tem essa arma.':!owned.equipped?'Equipe essa arma antes de usá-la.':this.host.refusal(player);
    if(why){armed.latched=w;this.host.refuse(player,why);return;}
    // Another weapon in hand goes away first (a reload on it stops with what is in).
    if(gun.w)this.holster(player,false);
    const stats=weaponStats(owned!.id,owned!.parts,owned!.upgrades);
    armed.stats=stats;
    const initialMag=armed.view.infinite?stats.mag:0;
    gun.assign({w,kit:encodeKit(owned!.parts),drawAt:now,ads:false,mag:Math.min(stats.mag,armed.rounds.get(w)??initialMag),reloadAt:0,reloadUntil:0,reloadFrom:0,
      mode:gun.mode<stats.modes.length?gun.mode:0});
    armed.rounds.set(w,gun.mag);
    this.host.drew?.(player);
  }

  /** The reload key: only with a gun drawn, not already full nor reloading, and with rounds to put in. */
  private reload(armed:Armed,now:number):void {
    const gun=armed.player.gun,stats=armed.stats;
    if(!stats||gun.reloadUntil||gun.mag>=stats.mag)return;
    const reserve=this.reserve(armed,stats);
    if(reserve<=0)return;
    gun.assign({reloadAt:now,reloadFrom:gun.mag,reloadUntil:now+reloadDuration(stats,gun.mag,reserve)});
  }
  /** The reload ends (done, cut short by a shot, or the gun put away): what went in stays, and leaves the reserve. */
  private endReload(armed:Armed,now:number):void {
    const gun=armed.player.gun,stats=armed.stats;
    if(stats){
      const mag=roundsLoaded(stats,gun.reloadFrom,now-gun.reloadAt,this.reserve(armed,stats)),used=mag-gun.reloadFrom;
      if(used>0&&!armed.view.infinite)armed.view={...armed.view,ammo:{...armed.view.ammo,[stats.caliber]:Math.max(0,(armed.view.ammo[stats.caliber]??0)-used)}};
      gun.mag=Math.max(gun.mag,mag);
      armed.rounds.set(stats.id,gun.mag);
    }
    gun.assign({reloadAt:0,reloadUntil:0,reloadFrom:0});
  }

  /** A shot the room does not take (the browser drew it already): logged once per kind and player, so a cheat or a bug is seen without flooding. */
  private drop(armed:Armed,why:string,details:Record<string,unknown>={}):void {
    if(armed.warned.has(why))return;
    armed.warned.add(why);
    this.host.log('weapon_drop',{playerId:armed.player.id,why,...details});
  }

  private fire(armed:Armed,w:string,shot:ShotCommand,now:number):void {
    const {player}=armed,gun=player.gun,stats=armed.stats;
    if(!stats||!gun.w||gun.w!==w){this.drop(armed,'weapon',{w,drawn:gun.w});return;}
    if(!shotFollows(gun.shots,shot.n)){this.drop(armed,'count',{n:shot.n,last:gun.shots});return;}
    if(now<gun.drawAt+stats.drawMs-80){this.drop(armed,'draw',{early:gun.drawAt+stats.drawMs-now});return;}
    if(gun.reloadUntil){
      // Round by round, a shot stops the reload with the rounds already in; a whole reload holds the trigger until it is done.
      const loaded=reloadInterruptible(stats)?roundsLoaded(stats,gun.reloadFrom,now-gun.reloadAt,this.reserve(armed,stats)):0;
      if(loaded<=0){this.drop(armed,'reload');return;}
      this.endReload(armed,now);
    }
    if(gun.mag<=0){this.drop(armed,'empty');return;}
    if(shot.dt<stats.interval-GUN.fireLeewayMs){this.drop(armed,'cadence',{dt:shot.dt,interval:Math.round(stats.interval)});return;}
    armed.tokens=Math.min(BUCKET,armed.tokens+(now-armed.tokenAt)/stats.interval);armed.tokenAt=now;
    if(armed.tokens<1){this.drop(armed,'bucket');return;}
    const pose:GunPose={x:player.x,y:player.y,z:player.z,rotation:player.rotation},eye=eyeOf(player.skin,pose);
    if(!originPlausible(shot.o,eye,GUN.originSlack)){this.drop(armed,'origin');return;}
    // The camera point must be on the shooter's side of the walls (a camera pushed through a wall would shoot from the other side).
    const toCamera=Math.hypot(shot.o[0]-eye[0],shot.o[1]-eye[1],shot.o[2]-eye[2]),wall=toCamera>.3?this.world(eye,shot.o):undefined;
    if(wall&&wall.fraction*toCamera<toCamera-.25){this.drop(armed,'camera');return;}
    armed.tokens--;

    const aim=normalize(shot.d),spread=Math.max(shot.sp,minSpread(stats));
    const dirs=pelletDirections(shotSeed(player.id,shot.n),aim,spread,stats.pellets,stats.spread.pellet);
    const muzzle=muzzleOf(player.skin,{...pose,rotation:headingOf(aim)},elevationOf(aim),stats.hold,stats.reach);
    const rewind=gunRewindOf(now,shot),box=stats.range.max+2;
    const targets:ShotTarget[]=[],bodies=new Map<string,Player>();
    for(const other of this.host.players()){
      if(other===player||Math.abs(other.x-player.x)>box||Math.abs(other.z-player.z)>box||!this.host.hittable(other,now))continue;
      const live:GunPose={x:other.x,y:other.y,z:other.z,rotation:other.rotation};
      targets.push({id:other.id,skin:other.skin,pose:rewind>0?this.tracks.get(other.id)?.at(now-rewind,live)??live:live});
      bodies.set(other.id,other);
    }
    const traces=traceShot(shot.o,dirs,muzzle,eye,stats.range.max,targets,this.world,GUN.bodySlack);
    gun.mag--;gun.shots=shot.n;
    armed.rounds.set(stats.id,gun.mag);

    const ends:PelletEnd[]=traces.map(trace=>[round3(trace.end[0]),round3(trace.end[1]),round3(trace.end[2]),trace.kind==='body'?2:trace.kind==='world'?1:0]);
    this.host.shot(player,{by:player.id,w:stats.id,n:shot.n,at:now,o:[round3(muzzle[0]),round3(muzzle[1]),round3(muzzle[2])],e:ends,sup:stats.suppressed,kit:gun.kit},stats.earshot);

    const struck=new Map<string,PelletTrace[]>();
    for(const trace of traces)if(trace.kind==='body'&&trace.target){const list=struck.get(trace.target);if(list)list.push(trace);else struck.set(trace.target,[trace]);}
    for(const [id,list] of struck){
      const target=bodies.get(id)!;
      let damage=Math.round(list.reduce((sum,trace)=>sum+damageOf(stats,trace.zone!,trace.distance),0));
      if(damage<=0)continue;
      // A headshot kills at once, whatever the weapon (the owner's rule, 2026-11-09): all the life left, ring and core. The sparring spare still holds.
      if(list.some(trace=>trace.zone==='head'&&damageOf(stats,'head',trace.distance)>0))damage=Math.max(damage,Math.ceil(target.hp+target.hpCore));
      const first=list[0]!,zone=list.some(trace=>trace.zone==='head')?'head':first.zone!;
      const ko=!this.host.spared?.(target)&&damage>=target.hp+target.hpCore;
      const flat=Math.hypot(first.dir[0],first.dir[2])||1,yaw=Math.atan2(first.dir[0],first.dir[2]);
      if(ko){
        // Along the bullet, a little up: a shotgun up close throws harder (killImpulse).
        const push=killImpulse(stats,first.distance);
        this.host.knockout(target,{x:target.x,y:target.y,z:target.z,yaw:target.rotation,vx:first.dir[0]/flat*push,vz:first.dir[2]/flat*push,closing:push*.35,lift:.5+push*.15,
          by:player.id,seated:false,seed:Math.floor(this.host.random()*0xffffffff)},damage);
      }else this.host.damage(target,damage,now);
      const hit:WeaponHitEvent={by:player.id,to:id,w:stats.id,n:shot.n,zone,damage,hp:ko?0:Math.max(0,Math.round(target.hp+target.hpCore)),ko,
        x:round3(first.end[0]),y:round3(first.end[1]),z:round3(first.end[2]),yaw:round3(yaw),at:now,pellets:list.length};
      this.host.hit(player,target,hit);
      this.host.log(ko?'weapon_ko':'weapon_hit',{playerId:id,by:player.id,w:stats.id,zone,hp:damage,pellets:list.length,distance:Math.round(first.distance*10)/10,rewind:Math.round(rewind)});
    }
  }
}
