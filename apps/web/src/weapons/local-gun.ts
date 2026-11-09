import {GUN,aimDirection,arsenalStats,arsenalWeapon,elevationOf,eyeOf,headingOf,isWeaponId,mapRay,muzzleOf,normalize,ownedInOrder,pelletDirections,reloadDuration,
  roundsLoaded,seededRandom,shotFollows,shotSeed,spreadNow,traceShot,
  type ArsenalView,type FireMode,type GunInput,type GunState,type PartId,type PartSlot,type PelletTrace,type ShotCommand,type ShotTarget,type Vec3,type WeaponId,
  type WeaponStats,type WorldRay} from '@bar/shared';
import {holsterTime,type LocalGunEvent,type LocalGunFrame,type LocalShotFx} from './contract';

/**
 * The local player's firearm, frame by frame and ahead of the room (docs/sistemas/armas.md#cliente): what is in hand, drawing and holstering,
 * aiming, the trigger and the cadence, every shot (its spread, its bullets traced against what is drawn), reloading, the bloom, the recoil handed to
 * the camera, the scope's sway and the held breath. No PlayCanvas here: the scene hands in what it sees (GunSense) and what is held (GunControls),
 * so the timing and the prediction are tested in Node. Times are performance.now() milliseconds.
 */

/** What the scene sees this frame. */
export interface GunSense {
  now:number;
  /** The rendered camera: where it is and where it looks (unit), drunk wobble and recoil included. Shots leave along this ray. */
  origin:Vec3;forward:Vec3;
  /** The local body as drawn: its feet, its skin, how fast it goes (m/s), and whether the run key is held while it moves. */
  feet:Vec3;skin:string|undefined;speed:number;sprinting:boolean;
  /** Who a shot could hit, as drawn (asked only when there is a shot to trace). */
  targets():readonly ShotTarget[];
  /** The map's solids (shared mapRay unless a test gives another). */
  world?:WorldRay;
  /** The room's time of the newest state drawn and how old it is (network.seen), stamped on each shot for lag compensation. */
  seen():{seen:number;ago:number};
  /** The world takes the hands: no window in front, not seated, riding or knocked down. Otherwise nothing fires and nothing aims. */
  free:boolean;
}
/** What the player holds this frame (mouse, keys, pad and touch merged by the controller). */
export interface GunControls {trigger:boolean;ads:boolean;breath:boolean}
/** A kick handed to the camera: radians up and to the right, and the share it gives back. */
export interface GunKick {up:number;side:number;recover:number}

// A semi press this close (ms) to when the weapon is ready again is kept and fired then, not lost.
const PRESS_BUFFER_MS=150;
// After a hitch, shots owed are caught up only this far back (ms): no burst of a dozen rounds after a frozen tab.
const CATCH_UP_MS=150;
// At most this many shots in one frame, and kept waiting for an input.
const SHOTS_PER_FRAME=6,QUEUE_MOST=18;
// Held breath (scoped): steady this long (s), then a shaky recovery this long (s); the meter refills over this long (s) and must be this full to hold again.
const BREATH_HOLD=3.5,BREATH_SHAKE=1.6,BREATH_REFILL=4,BREATH_AGAIN=.3;
// The muzzle against a wall: looked for this far past it (m).
const WALL_REACH=.12;
// How far the aim probe looks (m) for the frame's aim point and the blocked marker.
const PROBE_RANGE=150;
// Recoil of shots fired in the same frame (the camera has not moved yet): this share of the kicks before them tilts the next.
const SAME_FRAME_KICK=.6;
// While aiming the kick is a little smaller.
const ADS_KICK=.2;

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const smooth=(t:number)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

export interface GunView {
  on:boolean;weapon:WeaponId|'';stats:WeaponStats|undefined;mag:number;reserve:number;mode:FireMode|undefined;modeIndex:number;
  /** 0-1 of the reload going on (undefined: none). */
  reloading:number|undefined;
  ads:number;scoped:number;zoom:number;spread:number;
  /** The scope's drift right now (radians, right and down on screen). */
  sway:{x:number;y:number};
  /** The held breath's meter (1 full) and its state. */
  breath:{meter:number;holding:boolean;shaking:boolean};
  ready:boolean;lowered:boolean;arsenal:ArsenalView|undefined;
}

export class LocalGun {
  on=false;
  arsenal?:ArsenalView;
  /** In hand (or coming out), wanted next, and the last one drawn (X brings it back). */
  drawn:WeaponId|''='';
  want:WeaponId|''='';
  last:WeaponId|''='';
  stats?:WeaponStats;
  drawAt=0;holsterAt=0;
  private holsterMs=0;
  /** Rounds in each weapon (full on its first draw, as the room keeps them), and rounds of each calibre spent since the arsenal last came. */
  private readonly mags=new Map<WeaponId,number>();
  private readonly spent=new Map<string,number>();
  private readonly modes=new Map<WeaponId,number>();
  private readonly zoomSteps=new Map<WeaponId,number>();
  private adsRaw=0;
  private adsHeld=false;
  private triggerHeld=false;
  private triggerAt=0;
  private semiOwed=0;
  private burstLeft=0;
  private nextShotAt=0;
  private lastShotAt=-Infinity;
  /** The next shot's count (uint16): carries on from the room's gun.shots. */
  n=1;
  private readonly queue:ShotCommand[]=[];
  bloom=0;
  reload?:{at:number;duration:number;style:WeaponStats['reloadStyle'];from:number;to:number};
  /** The reload key's count (a new value is a press, GunInput.r). */
  private r=0;
  cycle?:LocalGunFrame['cycle'];
  private facingUntil=0;
  private kicks:GunKick[]=[];
  private events:LocalGunEvent[]=[];
  private dry=false;
  private breathMeter=1;
  private breathHolding=false;
  private shakeUntil=0;
  private breathHeldBefore=false;
  private lowered=false;
  private scopedBefore=false;
  private zoomNow=1;
  private swayX=0;private swayY=0;
  /** The probe of this frame: where the crosshair's ray lands and, when the muzzle's way is cut short, where the bullet would really stop. */
  aimPoint?:Vec3;
  blockedAt?:Vec3;
  private elevation=0;private heading=0;
  /** The time of this frame and of the one before (shots are stamped inside that span). */
  private clock=0;private frameAt=0;
  private spreadLast=0;
  private draw?:WeaponId;
  /** What was last sent to the room, and on which input, to read its answers (reconcile). */
  private sent:{seq:number;shots:number}[]=[];
  private sentW:WeaponId|''|undefined;
  private wSeq=0;
  private sentR=0;
  private rSeq=0;

  /** The local player's id (seeds the spread): set by the controller once it is known. */
  constructor(public localId:string){}

  // ---- What the player asks for (keys, pad, touch, the wheel).

  /** The arsenal the room sent (weapon.arsenal): stats follow the parts and upgrades; `draw` draws that weapon. */
  setArsenal(view:ArsenalView):void {
    this.arsenal=view;this.spent.clear();
    for(const id of [...this.mags.keys()]){const stats=arsenalStats(view,id);if(!stats)this.mags.delete(id);else this.mags.set(id,Math.min(this.mags.get(id)!,stats.mag));}
    if(this.drawn){
      const stats=arsenalStats(view,this.drawn);
      if(stats)this.stats=stats;else{this.want='';}
    }
    if(this.want&&!arsenalWeapon(view,this.want))this.want='';
    if(view.draw&&arsenalWeapon(view,view.draw)){if(this.on)this.want=view.draw;else this.draw=view.draw;}
  }
  /** Draw this weapon ('' holsters); a weapon not owned is ignored. */
  select(id:WeaponId|''):boolean {
    if(!this.on||(id&&!arsenalWeapon(this.arsenal,id)))return false;
    this.want=id;return true;
  }
  /** X: holster, or draw the last weapon back (the first owned when none was drawn yet). */
  holsterToggle():void {
    if(!this.on)return;
    if(this.want)this.want='';
    else this.select(this.last&&arsenalWeapon(this.arsenal,this.last)?this.last:ownedInOrder(this.arsenal)[0]??'');
  }
  /** The next or previous owned weapon in the wheel's order (RB, LB tap). */
  step(direction:1|-1):void {
    const owned=ownedInOrder(this.arsenal);
    if(!this.on||!owned.length)return;
    const from=owned.indexOf((this.want||this.last) as WeaponId);
    this.select(owned[((from<0?(direction>0?-1:0):from)+direction+owned.length)%owned.length]!);
  }
  /** V / Y: the next fire mode of the weapon in hand. */
  cycleMode():boolean {
    const stats=this.stats;
    if(!this.drawn||!stats||stats.modes.length<2)return false;
    this.modes.set(this.drawn,(this.modeIndex+1)%stats.modes.length);this.burstLeft=0;this.events.push('mode');return true;
  }
  /** R: reload. Returns why not ('' when it starts, or when there is nothing to say). */
  requestReload(now:number):string {
    const stats=this.stats;this.clock=now;
    if(!this.on||!this.drawn||!stats)return 'Saque uma arma para recarregar.';
    if(this.reload||!this.ready(now)||this.holsterAt)return '';
    const mag=this.mag,reserve=this.reserve;
    if(mag>=stats.mag)return '';
    if(reserve<=0)return 'Sem munição para essa arma.';
    this.startReload(now,stats,mag,reserve);return '';
  }
  /** Mouse wheel / D-pad while scoped: the scope's next magnification. */
  zoomStep(direction:1|-1):boolean {
    const stats=this.stats;
    if(!this.drawn||!stats||stats.zooms.length<2||this.scopeBlend<.5)return false;
    const at=this.zoomSteps.get(this.drawn)??0;
    // The steps go from the biggest magnification down (luneta: 8x, 4x): "in" is the bigger one.
    const order=[...stats.zooms.keys()].sort((a,b)=>stats.zooms[b]!-stats.zooms[a]!);
    const rank=order.indexOf(at),to=order[clamp(rank-direction,0,order.length-1)]!;
    if(to===at)return true;
    this.zoomSteps.set(this.drawn,to);this.events.push('zoom');return true;
  }

  // ---- Reading it.

  get modeIndex():number {return this.drawn?Math.min(this.modes.get(this.drawn)??0,(this.stats?.modes.length??1)-1):0;}
  get mode():FireMode|undefined {return this.stats?.modes[this.modeIndex];}
  get mag():number {
    if(!this.drawn)return 0;
    const stored=this.mags.get(this.drawn)??this.stats?.mag??0;
    const reload=this.reload,stats=this.stats;
    if(reload&&stats&&reload.style==='shell')return roundsLoaded(stats,reload.from,this.clock-reload.at,reload.to-reload.from);
    return stored;
  }
  /** Rounds in a weapon's magazine (undefined: never drawn, so full): the weapon wheel's rings. */
  magOf(id:WeaponId):number|undefined {return id===this.drawn?this.mag:this.mags.get(id);}
  get reserve():number {
    const stats=this.stats,arsenal=this.arsenal;
    if(!stats||!arsenal)return 0;
    if(arsenal.infinite)return Infinity;
    return Math.max(0,(arsenal.ammo[stats.caliber]??0)-(this.spent.get(stats.caliber)??0));
  }
  ready(now:number):boolean {return !!this.drawn&&!!this.stats&&!this.holsterAt&&now>=this.drawAt+this.stats.drawMs;}
  get adsBlend():number {return smooth(this.adsRaw);}
  get scopeBlend():number {return this.stats?.scope&&!this.reload?smooth(this.adsRaw):0;}
  /** The magnification the camera should have now (1: none), eased. */
  get zoom():number {return this.zoomNow;}
  get adsWanted():boolean {return this.adsHeld;}
  /** The body turns to the aim: aiming, holding the trigger, or just after a shot from the hip. */
  facingAim(now:number):boolean {return !!this.drawn&&(this.adsHeld||this.adsRaw>0||this.triggerHeld||now<this.facingUntil);}
  /** Aiming or shooting: never a run (the input goes with running off). */
  get walking():boolean {return !!this.drawn&&(this.adsHeld||this.triggerHeld);}
  /** The kicks since the last call, for the camera. */
  takeKicks():GunKick[] {const out=this.kicks;this.kicks=[];return out;}
  view(now:number):GunView {
    const stats=this.stats,reload=this.reload;
    return {on:this.on,weapon:this.drawn,stats,mag:this.mag,reserve:this.reserve,mode:this.mode,modeIndex:this.modeIndex,
      reloading:reload?clamp((now-reload.at)/Math.max(1,reload.duration),0,1):undefined,ads:this.adsBlend,scoped:this.scopeBlend,zoom:this.zoomNow,
      spread:this.spreadLast,sway:{x:this.swayX,y:this.swayY},breath:{meter:this.breathMeter,holding:this.breathHolding,shaking:now<this.shakeUntil},
      ready:this.ready(now),lowered:this.lowered,arsenal:this.arsenal};
  }

  // ---- Each frame.

  update(dt:number,controls:GunControls,sense:GunSense):LocalGunFrame {
    const now=sense.now,shots:LocalShotFx[]=[];
    this.dry=false;this.clock=now;
    const free=this.on&&sense.free;
    this.heading=headingOf(sense.forward);this.elevation=clamp(elevationOf(sense.forward),-GUN.pitchMax,GUN.pitchMax);
    this.stepDraw(now);
    const stats=this.drawn?this.stats:undefined,ready=this.ready(now);
    // Aiming: eased over the weapon's time; a draw or a holster under way, a window or a run without it let go stop it.
    this.adsHeld=free&&controls.ads&&!!stats&&!this.holsterAt;
    const aimable=this.adsHeld&&now>=this.drawAt+(stats?.drawMs??0)*.5;
    if(stats)this.adsRaw=clamp(this.adsRaw+(aimable?1:-1)*dt*1000/Math.max(60,stats.adsMs),0,1);
    else this.adsRaw=0;
    const scoped=this.scopeBlend;
    if(scoped>.5!==this.scopedBefore){this.scopedBefore=scoped>.5;this.events.push(scoped>.5?'scopeIn':'scopeOut');}
    // The magnification: the iron sights' or optic's while aiming, a scope's chosen step through it.
    const zoomGoal=stats?1+((stats.scope?stats.zooms[this.zoomSteps.get(this.drawn as WeaponId)??0]!:stats.zoom)-1)*this.adsBlend:1;
    this.zoomNow+=(zoomGoal-this.zoomNow)*(1-Math.exp(-16*dt));
    if(Math.abs(zoomGoal-this.zoomNow)<.002)this.zoomNow=zoomGoal;
    if(stats)this.bloom=Math.max(0,this.bloom-stats.spread.recovery*dt);else this.bloom=0;
    // The cone as it is now (the crosshair opens with it), before this frame's shots widen it.
    if(stats)this.spreadLast=Math.min(.6,spreadNow(stats,{ads:this.adsBlend,speed:sense.speed,bloom:this.bloom}));
    this.stepBreath(dt,now,free&&controls.breath&&scoped>.5);
    this.stepSway(now,stats,sense.speed);
    // The reload: a whole one fills at its end; round by round, the rounds count up as it goes (mag reads them).
    if(this.reload&&stats&&now>=this.reload.at+this.reload.duration)this.finishReload(stats,this.reload.to);
    if(this.cycle&&now>=this.cycle.at+this.cycle.duration)this.cycle=undefined;
    // The probe: where the crosshair's ray lands, and whether the barrel is against something.
    this.probe(sense,stats);
    this.lowered=!!stats&&((sense.sprinting&&!this.adsHeld&&!controls.trigger)||this.againstWall);
    // The trigger.
    const trigger=free&&controls.trigger&&!!stats;
    if(trigger&&!this.triggerHeld)this.press(now,stats!);
    if(trigger&&!this.triggerHeld)this.triggerAt=now;
    this.triggerHeld=trigger;
    if(stats&&ready&&!this.lowered)this.fire(now,stats,sense,shots);
    else {this.burstLeft=0;if(!trigger)this.semiOwed=0;}
    this.frameAt=now;
    const events=this.events;this.events=[];
    const reload=this.reload;
    return {on:this.on,weapon:this.drawn,parts:this.parts(),stats,drawAt:this.drawAt,holsterAt:this.holsterAt,ads:this.adsBlend,scoped,
      heading:this.heading,elevation:this.elevation,aimPoint:this.aimPoint,facingAim:this.facingAim(now),lowered:this.lowered,
      reload:reload?{...reload}:undefined,cycle:this.cycle,shots,dry:this.dry,events,mag:this.mag};
  }
  private parts():Partial<Record<PartSlot,PartId>> {return this.drawn?arsenalWeapon(this.arsenal,this.drawn)?.parts??{}:{};}

  /** Switching is a holster, then a draw; drawing starts the weapon's draw time. */
  private stepDraw(now:number):void {
    if(this.want===this.drawn){if(this.holsterAt&&this.drawn){this.holsterAt=0;}return;}
    if(this.drawn&&!this.holsterAt){
      this.holsterAt=now;this.holsterMs=holsterTime(this.stats?.drawMs??400);
      this.cancelReload();this.semiOwed=this.burstLeft=0;
    }
    if(this.drawn&&now<this.holsterAt+this.holsterMs)return;
    if(this.drawn){this.drawn='';this.holsterAt=0;this.stats=undefined;this.adsRaw=0;this.cycle=undefined;this.events.push('holster');}
    if(!this.want)return;
    const stats=arsenalStats(this.arsenal,this.want);
    if(!stats){this.want='';return;}
    this.drawn=this.want;this.last=this.want;this.stats=stats;this.drawAt=now;this.bloom=0;this.adsRaw=0;
    if(!this.mags.has(this.drawn))this.mags.set(this.drawn,stats.mag);
    this.events.push('draw');
  }

  private press(now:number,stats:WeaponStats):void {
    if(!this.ready(now)||this.lowered)return;
    const reload=this.reload;
    if(reload){
      // Round by round: a press fires what is already in (the room does the same); a whole reload has to finish.
      if(reload.style!=='shell')return;
      const loaded=this.mag;
      if(loaded<=0)return;
      this.finishReload(stats,loaded);
    }
    if(this.mag<=0){
      this.dry=true;
      if(this.reserve>0)this.startReload(now,stats,0,this.reserve);
      return;
    }
    const mode=this.mode;
    if(mode==='burst'){if(!this.burstLeft)this.burstLeft=stats.burst;}
    else if(mode==='semi'&&this.nextShotAt-now<=PRESS_BUFFER_MS)this.semiOwed=1;
  }

  private fire(now:number,stats:WeaponStats,sense:GunSense,shots:LocalShotFx[]):void {
    const mode=this.mode;
    // A weapon idle before this frame fires at the press (now); a frame that came late is caught up only so far back.
    if(this.nextShotAt<this.frameAt)this.nextShotAt=now;
    if(this.nextShotAt<now-CATCH_UP_MS)this.nextShotAt=now-CATCH_UP_MS;
    let up=0,side=0,targets:readonly ShotTarget[]|undefined;
    while(shots.length<SHOTS_PER_FRAME){
      const wanted=this.burstLeft>0||this.semiOwed>0||(mode==='auto'&&this.triggerHeld);
      if(!wanted||this.reload)break;
      if(this.mag<=0){this.burstLeft=this.semiOwed=0;break;}
      // Each shot at its own moment: as soon as the weapon allows, never before the press.
      const at=this.nextShotAt;
      if(at>now)break;
      targets??=sense.targets();
      shots.push(this.shoot(at,stats,sense,targets,up,side));
      const kick=this.kicks.at(-1)!;up+=kick.up*SAME_FRAME_KICK;side+=kick.side*SAME_FRAME_KICK;
      this.nextShotAt=at+stats.interval;
      if(this.burstLeft>0){this.burstLeft--;if(!this.burstLeft)this.nextShotAt=at+stats.interval*2.5;}
      if(this.semiOwed>0)this.semiOwed--;
    }
  }

  private shoot(at:number,stats:WeaponStats,sense:GunSense,targets:readonly ShotTarget[],up:number,side:number):LocalShotFx {
    const n=this.n;this.n=(this.n+1)&0xffff;
    const ads=this.adsBlend,scoped=this.scopeBlend>.5;
    const spread=Math.min(.6,spreadNow(stats,{ads,speed:sense.speed,bloom:this.bloom}));
    this.spreadLast=spread;
    // The cone's centre: the camera's ray, turned by the scope's drift and by the kicks of shots earlier in this same frame.
    const swayX=scoped?this.swayX:0,swayY=scoped?this.swayY:0;
    const centre=normalize(aimDirection(this.heading-swayX-side,clamp(this.elevation-swayY+up,-GUN.pitchMax,GUN.pitchMax)));
    const dirs=pelletDirections(shotSeed(this.localId,n),centre,spread,stats.pellets,stats.spread.pellet);
    const pose={x:sense.feet[0],y:sense.feet[1],z:sense.feet[2],rotation:headingOf(centre)};
    const muzzle=muzzleOf(sense.skin,pose,elevationOf(centre),stats.hold,stats.reach);
    const pellets:PelletTrace[]=traceShot(sense.origin,dirs,muzzle,eyeOf(sense.skin,pose),stats.range.max,targets,sense.world??mapRay);
    const {seen,ago}=sense.seen();
    this.queue.push({n,o:[...sense.origin] as Vec3,d:centre,sp:spread,seen,ago:Math.round(clamp(ago,0,10_000)),dt:Math.round(clamp(at-this.lastShotAt,0,600_000))});
    if(this.queue.length>QUEUE_MOST)this.queue.splice(0,this.queue.length-QUEUE_MOST);
    this.lastShotAt=at;
    const mag=Math.max(0,this.mag-1);this.mags.set(this.drawn as WeaponId,mag);
    this.bloom=Math.min(stats.spread.bloomMax,this.bloom+stats.spread.bloom);
    // The kick: up, and to a side by chance with the weapon's lean; the same for this shot in every replay (seeded).
    const random=seededRandom(shotSeed(this.localId,n)^0x5bd1e995),scale=1-ADS_KICK*ads;
    this.kicks.push({up:stats.recoil.v*scale*(.85+.3*random()),side:(stats.recoil.h*(random()*2-1)+stats.recoil.h*stats.recoil.bias)*scale,recover:stats.recoil.recover});
    if(!ads)this.facingUntil=at+GUN.facingHoldMs;
    if(mag>0&&(stats.action==='pump'||stats.action==='lever'||stats.action==='bolt'))this.cycle={at,duration:stats.interval*.85,action:stats.action};
    else if(stats.action==='double'&&mag===1)this.cycle={at,duration:stats.interval,action:'double'};
    return {n,at,pellets,suppressed:stats.suppressed,empty:mag===0};
  }

  private startReload(now:number,stats:WeaponStats,mag:number,reserve:number):void {
    const missing=Math.max(0,Math.min(stats.mag-mag,reserve));
    if(!missing)return;
    this.reload={at:now,duration:reloadDuration(stats,mag,reserve),style:stats.reloadStyle,from:mag,to:mag+missing};
    this.r=(this.r+1)&0xff;this.burstLeft=this.semiOwed=0;this.cycle=undefined;
    this.events.push('reloadStart');
  }
  private finishReload(stats:WeaponStats,to:number):void {
    const reload=this.reload;
    if(!reload||!this.drawn)return;
    this.reload=undefined;
    const loaded=Math.max(0,to-reload.from);
    this.mags.set(this.drawn,Math.min(stats.mag,to));
    if(!this.arsenal?.infinite)this.spent.set(stats.caliber,(this.spent.get(stats.caliber)??0)+loaded);
    this.events.push('reloadEnd');
  }
  private cancelReload():void {if(this.reload){this.reload=undefined;this.events.push('reloadEnd');}}

  private stepBreath(dt:number,now:number,held:boolean):void {
    const shaking=now<this.shakeUntil;
    const holding=held&&!shaking&&(this.breathHolding||this.breathMeter>=BREATH_AGAIN||!this.breathHeldBefore)&&this.breathMeter>0;
    this.breathHeldBefore=held;
    if(holding!==this.breathHolding){this.breathHolding=holding;this.events.push(holding?'breathIn':'breathOut');}
    if(holding){
      this.breathMeter=Math.max(0,this.breathMeter-dt/BREATH_HOLD);
      if(this.breathMeter<=0){this.breathHolding=false;this.shakeUntil=now+BREATH_SHAKE*1000;this.events.push('breathOut');}
    } else this.breathMeter=Math.min(1,this.breathMeter+dt/BREATH_REFILL);
  }
  /** The drift of an aimed weapon: a slow figure of two sines, wider moving, almost none holding the breath, wild right after. */
  private stepSway(now:number,stats:WeaponStats|undefined,speed:number):void {
    if(!stats||this.adsRaw<=0){this.swayX=this.swayY=0;return;}
    const t=now/1000,scoped=this.scopeBlend;
    const amount=stats.sway*(scoped>.5?1:.25)*this.adsBlend*(1+Math.min(1.5,speed/3.5))*(this.breathHolding?.06:now<this.shakeUntil?2.2:1);
    this.swayX=amount*(Math.sin(t*.83)*.7+Math.sin(t*2.1+.4)*.3);
    this.swayY=amount*(Math.sin(t*1.31+1.1)*.6+Math.sin(t*.47)*.4)*.8;
  }

  private againstWall=false;
  private probe(sense:GunSense,stats:WeaponStats|undefined):void {
    this.aimPoint=this.blockedAt=undefined;this.againstWall=false;
    if(!stats||!this.on)return;
    const world=sense.world??mapRay,pose={x:sense.feet[0],y:sense.feet[1],z:sense.feet[2],rotation:this.heading};
    const muzzle=muzzleOf(sense.skin,pose,this.elevation,stats.hold,stats.reach),eye=eyeOf(sense.skin,pose);
    // The barrel against a wall: from the shoulder line to just past the muzzle.
    const aim=aimDirection(this.heading,this.elevation);
    const shoulder:Vec3=[pose.x,eye[1]-.25,pose.z];
    this.againstWall=!!world(shoulder,[muzzle[0]+aim[0]*WALL_REACH,muzzle[1]+aim[1]*WALL_REACH,muzzle[2]+aim[2]*WALL_REACH]);
    const [trace]=traceShot(sense.origin,[sense.forward],muzzle,eye,Math.min(PROBE_RANGE,stats.range.max),[],world);
    if(!trace)return;
    this.aimPoint=trace.blocked?undefined:trace.end;
    if(trace.blocked)this.blockedAt=trace.end;
    if(!this.aimPoint){
      // Still a point to converge on: along the camera's ray, as far as the cut way went.
      const far=Math.min(PROBE_RANGE,stats.range.max);
      this.aimPoint=[sense.origin[0]+sense.forward[0]*far,sense.origin[1]+sense.forward[1]*far,sense.origin[2]+sense.forward[2]*far];
    }
  }

  // ---- The wire.

  /** Every input goes while the system is on (the room reads the gun from each one): networking's idle suppression lets it through. */
  get active():boolean {return this.on&&!!this.arsenal;}
  /** The gun field of input `seq`: what is in hand, aiming, the elevation, the reload count, the mode, and up to GUN.shotsPerInput shots. */
  decorate(seq:number):GunInput|undefined {
    if(!this.on||!this.arsenal)return undefined;
    const s=this.queue.splice(0,GUN.shotsPerInput);
    if(s.length)this.sent.push({seq,shots:s.length});
    if(this.drawn!==this.sentW){this.sentW=this.drawn;this.wSeq=seq;}
    if(this.r!==this.sentR){this.sentR=this.r;this.rSeq=seq;}
    return {w:this.drawn,...(this.drawn?{ads:this.adsHeld,p:Math.round(this.elevation*1000)/1000,r:this.r,m:this.modeIndex}:{r:this.r}),...(s.length?{s}:{})};
  }
  /**
   * The room's word on the gun (Player.gun) after input `acked`: it turned the system on or off, holstered or refused a draw, settled the rounds.
   * The rounds predicted are the room's less the shots it has not seen yet; a reload of ours is trusted until the room has finished its own.
   */
  reconcile(gun:Partial<GunState>|undefined,acked:number,serverNow:number,now:number):void {
    this.sent=this.sent.filter(item=>item.seq>acked);
    if(!gun?.on){if(this.on)this.turnOff();return;}
    const w=isWeaponId(gun.w)?gun.w:'';
    if(!this.on){
      // Nothing can be drawn before the arsenal is here (the controller asks for it): the system waits for it.
      if(!this.arsenal)return;
      this.on=true;this.n=((gun.shots??0)+1)&0xffff;
      // Back after a reload of the page with a weapon out: take it as the room has it.
      if(w&&arsenalWeapon(this.arsenal,w)){this.want=this.drawn=this.last=w;this.stats=arsenalStats(this.arsenal,w);this.drawAt=now-Math.max(0,serverNow-(gun.drawAt??serverNow));this.mags.set(w,gun.mag??0);this.sentW=w;}
      if(this.draw){this.select(this.draw);this.draw=undefined;}
      return;
    }
    // The room did not take what was sent (a draw refused, a holster it made): its weapon wins, unless something newer is on its way.
    if(this.sentW!==undefined&&acked>=this.wSeq&&w!==this.sentW&&this.want===this.drawn){
      if(this.drawn&&!w)this.events.push('holster');
      this.want=this.drawn=w;this.sentW=w;this.wSeq=acked;this.reload=undefined;this.cycle=undefined;this.adsRaw=0;
      this.stats=w?arsenalStats(this.arsenal,w):undefined;
      if(w){this.last=w;this.drawAt=now-Math.max(0,serverNow-(gun.drawAt??serverNow));this.events.push('draw');}
    }
    if(!this.drawn||w!==this.drawn)return;
    // Shot counts: a gap is fine (shotFollows takes up to 64 ahead); behind the room or too far ahead starts again after it.
    if(!this.sent.length&&!this.queue.length&&!shotFollows(gun.shots??0,this.n))this.n=((gun.shots??0)+1)&0xffff;
    const flying=this.sent.reduce((sum,item)=>sum+item.shots,0)+this.queue.length;
    const roomReloading=(gun.reloadUntil??0)>serverNow;
    if(this.reload||roomReloading||acked<this.rSeq)return;
    const mag=Math.max(0,(gun.mag??0)-flying);
    if(mag!==this.mags.get(this.drawn))this.mags.set(this.drawn,mag);
  }
  /** Movement while aiming: the room walks this body at armedPace when the input aims (shared rule). */
  private turnOff():void {
    if(this.drawn)this.events.push('holster');
    this.on=false;this.want=this.drawn='';this.stats=undefined;this.adsRaw=0;this.reload=undefined;this.cycle=undefined;
    this.queue.length=0;this.sent=[];this.sentW=undefined;this.semiOwed=this.burstLeft=0;this.triggerHeld=false;this.mags.clear();
  }
  /** Lets go of everything held (a window opened, the tab lost focus): the trigger and the aim. */
  release():void {this.triggerHeld=false;this.semiOwed=this.burstLeft=0;this.adsHeld=false;}
  /** The shots waiting for an input (tests). */
  get queued():readonly ShotCommand[] {return this.queue;}
}
