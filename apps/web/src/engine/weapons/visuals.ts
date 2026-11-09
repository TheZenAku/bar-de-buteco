import * as pc from 'playcanvas';
import {GUN,decodeKit,encodeKit,isWeaponId,mapRay,weaponStats,type GunState,type PartId,type PartSlot,type Vec3,type WeaponHitEvent,type WeaponId,type WeaponShotEvent,type WeaponStats} from '@bar/shared';
import type {LocalGunFrame,WeaponVisualsApi} from '../../weapons/contract';
import type {HandRig} from '../drink-props';
import type {SceneActor} from '../scene-types';
import type {DamageKind} from '../../fight/damage-numbers';
import {GunPose,type PoseEvents,type PoseInput} from './gun-pose';
import {WeaponFx} from './weapon-fx';
import {WeaponAudio} from './weapon-audio';
import {dropWeapon,makeWeapon,preloadWeapon,realReady,type WeaponInstance} from './weapon-models';
import type {MechSound} from './meta';

/**
 * The firearms on the avatars (docs/sistemas/armas.md#cliente): the weapon in hand with its parts, the aiming pose, the reload and action motions,
 * muzzle flashes, tracers, impacts, casings and sounds, for the local player (from LocalGunFrame, ahead of the room) and for everyone else (from
 * Player.gun and the room's weapon.shot / weapon.hit). BarScene calls `local(frame)` each frame before the head looks, `pose(dt)` right after them
 * (the clips and the head look have posed the skeleton) and `restore()` at frameupdate, before the head looks are restored.
 */
export interface WeaponAvatar {
  root:pc.Entity;actor:SceneActor;
  /** Drawn heading in degrees. */
  yaw:number;speed?:number;resting?:boolean;ragdoll?:unknown;deathHidden?:boolean;npc:boolean;
  skin?:{model:pc.Entity;clip:string;drinkHand?:HandRig;rightHand?:HandRig;
    bones:{head:pc.Entity;upperarm_l:pc.Entity;lowerarm_l:pc.Entity;hand_l:pc.Entity;upperarm_r:pc.Entity;lowerarm_r:pc.Entity;hand_r:pc.Entity}};
}
/** What the scene lends the weapons. */
export interface WeaponHost {
  localId():string;
  camera:pc.Entity;
  serverNow():number;
  /** The master/effects volume (0-1), as the other world sounds take it. */
  volume():number;
  /** 0 at night to 1 at noon: the flashlights come on in the dark, smoke and blood take the light. */
  daylight():number;
  avatars():Iterable<WeaponAvatar>;
  avatar(id:string):WeaponAvatar|undefined;
  damage(at:{x:number;y:number;z:number},text:string,kind:DamageKind):void;
  flinch(id:string,yaw:number,degrees:number):void;
}

interface Armed {
  avatar:WeaponAvatar;
  /** The skin's model the pose was built on (a skin change rebuilds the avatar). */
  model?:pc.Entity;
  pose?:GunPose;
  weapon?:WeaponInstance;
  /** The weapon in the hands now (while holstering, the one going back), its kit, stats. */
  shown:WeaponId|'';kit:string;stats?:WeaponStats;parts:Partial<Record<PartSlot,PartId>>;
  drawAt:number;holsterAt:number;
  /** Running now, with a gap between starting and stopping (the speed flickers around one threshold). */
  running:boolean;
  lastShotAt:number;shots:number;lastN:number;
  cycle?:{at:number;duration:number;action:'pump'|'lever'|'bolt'|'double'};
  carry?:pc.Entity;carryKind:string;
  /** The muzzle and the barrel's way as drawn (for flashes and tracers of the next shots). */
  drawn:boolean;
  /** The pose's callbacks (made once). */
  events?:PoseEvents;
}

const statsCache=new Map<string,WeaponStats>();
function statsOf(w:WeaponId,kit:string):WeaponStats {
  const key=`${w}|${kit}`;
  let stats=statsCache.get(key);
  if(!stats){stats=weaponStats(w,decodeKit(kit));statsCache.set(key,stats);}
  return stats;
}
const AUTOMATIC_MS=150;
const v1=new pc.Vec3(),v2=new pc.Vec3(),v3=new pc.Vec3(),aimPoint=new pc.Vec3(),beam=new pc.Vec3();

export class WeaponVisuals implements WeaponVisualsApi {
  private frame?:LocalGunFrame;
  private readonly armed=new Map<string,Armed>();
  private readonly fx:WeaponFx;
  private readonly audio:WeaponAudio;
  /** The local player's shots whose bullets were drawn hitting a body (the room's hit then brings only the number). */
  private readonly bled=new Set<number>();
  private insideAt=0;
  /** The local frame's parts and their kit string (made again only when the parts object changes). */
  private kitOf?:object;private kit='';
  private carryMaterial?:pc.StandardMaterial;

  constructor(readonly app:pc.AppBase,private readonly host?:WeaponHost){
    this.audio=new WeaponAudio(()=>host?.volume()??1,()=>{
      if(!host)return undefined;
      const ear=host.camera.getPosition();
      return {x:ear.x,y:ear.y,z:ear.z,forward:host.camera.forward,up:host.camera.up};
    });
    this.fx=new WeaponFx(app,()=>host?.daylight()??1,{
      casing:(kind,at,strength)=>this.audio.casing(kind,at,strength),
      magazine:at=>this.audio.casing('brass',at,.2),
    });
  }

  /** Whether this actor has a weapon in hand (or one going back into the holster): the other arm poses (drinks, crossed arms, cigarettes) stay off. */
  isArmed(actor:SceneActor):boolean {
    const state=this.armed.get(actor.id);
    if(state?.shown&&state.drawn)return true;
    if(actor.id===this.host?.localId())return !!this.frame?.on&&!!this.frame.weapon;
    return !!actor.gun?.on&&!!actor.gun.w;
  }
  /** The legs' clip for an armed body (BarScene.gunClip): undefined to let the usual clips decide. */
  aiming(id:string):boolean {
    if(id===this.host?.localId())return !!this.frame&&(this.frame.facingAim||this.frame.ads>.05)&&!this.frame.lowered;
    const state=this.armed.get(id),gun=this.host?.avatar(id)?.actor.gun;
    return !!gun?.ads||!!state&&performance.now()-state.lastShotAt<GUN.facingHoldMs;
  }

  local(frame:LocalGunFrame|undefined):void {
    this.frame=frame;
    if(!frame||!this.host)return;
    const id=this.host.localId();
    if(frame.weapon)this.audio.prepare(frame.weapon);
    for(const event of frame.events){
      if(event==='draw'){this.audio.handling('draw');if(frame.weapon)preloadWeapon(this.app,frame.weapon);}
      else if(event==='holster')this.audio.handling('holster');
      else if(event==='mode'){this.audio.handling('fireMode');if(frame.weapon)this.audio.mech(frame.weapon,'select',undefined);}
      else if(event==='scopeIn')this.audio.handling('scopeIn');
      else if(event==='zoom')this.audio.handling('zoom');
    }
    if(frame.dry&&frame.weapon)this.audio.mech(frame.weapon,'dry',undefined);
    const weapon=frame.weapon;
    if(!weapon||!frame.stats||!this.host.avatar(id))return;
    const state=this.state(id);
    for(const shot of frame.shots){
      state.lastShotAt=shot.at;state.shots=(state.shots+1)%65536;
      const pose=state.pose,muzzle=pose&&state.drawn?pose.muzzle:this.fallbackMuzzle(state.avatar,frame.stats);
      const dir=pose&&state.drawn?pose.muzzleDir:v3.set(Math.sin(frame.heading),Math.sin(frame.elevation),Math.cos(frame.heading)).normalize();
      this.fx.flash(muzzle,dir,frame.stats.flash*(shot.suppressed?.15:1),frame.stats.interval*1.3);
      this.audio.ownShot(weapon,shot.suppressed);
      const tracerEvery=frame.stats.interval<AUTOMATIC_MS?2:1;
      shot.pellets.forEach((pellet,i)=>{
        v1.set(pellet.end[0],pellet.end[1],pellet.end[2]);
        if((shot.n%tracerEvery===0)&&(i<3))this.fx.tracer(muzzle,v1,frame.stats!.pellets>1?.012:.02);
        if(pellet.kind==='world'&&pellet.normal&&pellet.surface){v2.set(pellet.normal[0],pellet.normal[1],pellet.normal[2]);this.fx.impact(v1,v2,pellet.surface,frame.stats!.pellets>1?.6:1);if(i<2)this.audio.impact(pellet.surface,v1);}
        else if(pellet.kind==='body'){v2.set(pellet.dir[0],pellet.dir[1],pellet.dir[2]);this.fx.blood(v1,v2,frame.stats!.pellets>1?.5:1);this.bled.add(shot.n);}
      });
      if(this.bled.size>64)this.bled.delete(this.bled.values().next().value!);
      this.afterShot(state,frame.stats,shot.empty);
      pose?.kick(frame.stats);
    }
  }

  remoteShot(event:WeaponShotEvent):void {
    if(!this.host||!isWeaponId(event.w))return;
    const stats=statsOf(event.w,event.kit);
    const avatar=this.host.avatar(event.by);
    const state=avatar?this.state(event.by):undefined;
    const pose=state?.pose,drawn=!!state?.drawn&&!!pose;
    const muzzle=drawn?pose!.muzzle:v3.set(event.o[0],event.o[1],event.o[2]);
    const first=event.e[0];
    const dir=drawn?pose!.muzzleDir:first?v2.set(first[0]-event.o[0],first[1]-event.o[1],first[2]-event.o[2]).normalize():v2.set(0,0,1);
    const camera=this.host.camera.getPosition();
    const near=camera.distance(muzzle)<200;
    if(near)this.fx.flash(muzzle,dir,stats.flash*(event.sup?.15:1),stats.interval*1.3);
    this.audio.worldShot(event.w,event.sup,muzzle,stats.earshot);
    const tracerEvery=stats.interval<AUTOMATIC_MS?2:1;
    const head=this.listenerHead(v1);
    event.e.forEach((end,i)=>{
      const to=new pc.Vec3(end[0],end[1],end[2]);
      if(near&&event.n%tracerEvery===0&&i<3)this.fx.tracer(muzzle,to,stats.pellets>1?.012:.02);
      if(end[3]===1){
        // The world's face where it stopped: the same ray again, a little past.
        const way=v2.sub2(to,muzzle).normalize();
        const hit=mapRay([to.x-way.x*.3,to.y-way.y*.3,to.z-way.z*.3],[to.x+way.x*.2,to.y+way.y*.2,to.z+way.z*.2]);
        const normal=hit?new pc.Vec3(hit.normal[0],hit.normal[1],hit.normal[2]):way.clone().mulScalar(-1);
        if(camera.distance(to)<80){this.fx.impact(to,normal,hit?.surface??'concreto',stats.pellets>1?.6:1);if(i<2)this.audio.impact(hit?.surface??'concreto',to);}
      }else if(end[3]===2&&camera.distance(to)<80)this.fx.blood(to,v2.sub2(to,muzzle).normalize(),stats.pellets>1?.5:1);
      // A bullet passing close to the listener's head: its crack.
      if(head&&event.by!==this.host!.localId()){
        v3.sub2(to,muzzle);const length=v3.length();
        if(length>1){
          v3.mulScalar(1/length);
          const t=v2.sub2(head,muzzle).dot(v3);
          if(t>1&&t<length-.5){const closest=v2.copy(muzzle).add(v3.mulScalar(t)),d=closest.distance(head);if(d<2.2&&i===0)this.audio.whiz(closest,1-d/2.2);}
        }
      }
    });
    if(state){
      state.lastShotAt=performance.now();state.shots=(state.shots+1)%65536;state.lastN=event.n;
      this.afterShot(state,stats,false);
      pose?.kick(stats);
    }
  }

  hit(event:WeaponHitEvent,me:string):void {
    if(!this.host)return;
    const at={x:event.x,y:event.y,z:event.z},damage=Math.round(event.damage);
    this.host.flinch(event.to,event.yaw,Math.min(24,6+event.damage*.16));
    if(event.by===me)this.host.damage(at,event.ko?`${damage} KO`:String(damage),event.ko?'ko':event.zone==='head'?'heavy':'hit');
    else if(event.to===me)this.host.damage(at,String(damage),'taken');
    // The room's word on a hit the shooter's browser drew as a miss (or someone else's): the blood now.
    if(event.by!==me||!this.bled.has(event.n)){
      v1.set(event.x,event.y,event.z);v2.set(Math.sin(event.yaw),0,Math.cos(event.yaw));
      if(event.by===me||event.to===me)this.fx.blood(v1,v2,Math.min(1.2,.5+event.damage/60));
    }
  }

  muzzle(id:string):Vec3|undefined {
    const state=this.armed.get(id);
    if(!state?.pose||!state.drawn)return undefined;
    const m=state.pose.muzzle;
    return [m.x,m.y,m.z];
  }
  cue(name:'hit'|'headshot'|'kill'):void {this.audio.cue(name);}

  /** The flashes, tracers and the rest, telemetry for tests. */
  telemetry() {
    return {fx:{...this.fx.stats,...this.fx.showing},audio:this.audio.telemetry(),
      armed:[...this.armed].map(([id,s])=>({id,weapon:s.shown,drawn:s.drawn,real:!!s.weapon?.real,muzzle:s.pose?[+s.pose.muzzle.x.toFixed(3),+s.pose.muzzle.y.toFixed(3),+s.pose.muzzle.z.toFixed(3)]:null}))};
  }

  private state(id:string):Armed {
    let state=this.armed.get(id);
    const avatar=this.host!.avatar(id)!;
    if(!state){state={avatar,shown:'',kit:'',parts:{},drawAt:0,holsterAt:0,running:false,lastShotAt:-1e9,shots:0,lastN:-1,carryKind:'',drawn:false};this.armed.set(id,state);}
    if(avatar&&state.avatar!==avatar){this.dispose(state);state.avatar=avatar;}
    return state;
  }
  private dispose(state:Armed):void {
    dropWeapon(state.weapon);state.weapon=undefined;state.pose?.restore();state.pose=undefined;state.model=undefined;
    state.carry?.destroy();state.carry=undefined;state.carryKind='';state.drawn=false;
  }
  private fallbackMuzzle(avatar:WeaponAvatar,stats:WeaponStats):pc.Vec3 {
    const p=avatar.root.getPosition(),r=avatar.yaw*Math.PI/180;
    return v3.set(p.x+Math.sin(r)*stats.reach-Math.cos(r)*.15,p.y+1.4,p.z+Math.cos(r)*stats.reach+Math.sin(r)*.15);
  }
  /** After a shot: a casing from the self-loaders' port; the hand-worked action of the others starts (the remote ones: the local logic sends its own). */
  private afterShot(state:Armed,stats:WeaponStats,empty:boolean):void {
    const local=state.avatar.actor.id===this.host?.localId();
    if(!local&&(stats.action==='pump'||stats.action==='lever'||stats.action==='bolt')&&!empty){
      const start=performance.now()+110;
      state.cycle={at:start,duration:Math.max(260,Math.min(stats.interval-150,stats.action==='bolt'?1000:620)),action:stats.action};
    }
    if(stats.action==='double'&&!local)state.cycle={at:performance.now()+60,duration:300,action:'double'};
    if(stats.action==='self'&&stats.id!=='revolver'&&state.weapon&&state.pose&&state.drawn){
      const eject=state.weapon.meta.eject??[.02,.08,-.04];
      v1.set(eject[0],eject[1],eject[2]);state.weapon.root.getRotation().transformVector(v1,v1);v1.add(state.weapon.root.getPosition());
      state.weapon.root.getRotation().transformVector(v2.set(1,.55,.3),v2);v2.mulScalar(2+Math.random()*.8);
      this.fx.casing('brass',v1,v2,stats.hold==='rifle'&&stats.caliber!=='9mm'?'rifle':'pistol');
    }
  }
  private listenerHead(out:pc.Vec3):pc.Vec3|undefined {
    const me=this.host?.avatar(this.host.localId());
    const head=me?.skin?.bones.head;
    if(head)return out.copy(head.getPosition());
    return this.host?out.copy(this.host.camera.getPosition()):undefined;
  }

  /** What an avatar holds this frame, from the local frame or the room's state. */
  private wanted(id:string,avatar:WeaponAvatar,state:Armed,now:number,serverNow:number):{w:WeaponId|'';kit:string;parts:Partial<Record<PartSlot,PartId>>;drawAt:number;holsterAt:number}|undefined {
    const local=id===this.host!.localId();
    if(local){
      const f=this.frame;
      if(!f?.on)return {w:'',kit:'',parts:{},drawAt:0,holsterAt:state.holsterAt||now};
      if(f.parts!==this.kitOf){this.kitOf=f.parts;this.kit=encodeKit(f.parts);}
      const kit=this.kit;
      return {w:f.weapon,kit,parts:f.parts,drawAt:f.drawAt,holsterAt:f.holsterAt};
    }
    const gun:Partial<GunState>|undefined=avatar.actor.gun;
    const w=gun?.on&&gun.w&&isWeaponId(gun.w)?gun.w:'';
    const toLocal=(t:number)=>now-(serverNow-t);
    const drawAt=w&&gun?.drawAt&&serverNow-gun.drawAt<3000?toLocal(gun.drawAt):w&&state.shown!==w?0:state.drawAt;
    return {w,kit:gun?.kit??'',parts:decodeKit(gun?.kit),drawAt,holsterAt:w?0:state.holsterAt||now};
  }

  /** Every frame, after the head looks: the weapons in hand, the bodies holding them, the effects. */
  pose(dt:number):void {
    const host=this.host;
    if(!host)return;
    const now=performance.now(),serverNow=host.serverNow(),localId=host.localId();
    let torches=0;
    const camera=host.camera.getPosition();
    const dark=host.daylight()<.45;
    const lights:{state:Armed;distance:number}[]=[];
    for(const avatar of host.avatars()){
      const id=avatar.actor.id;
      const existing=this.armed.get(id);
      if(avatar.npc||(!existing&&!avatar.actor.gun?.on&&id!==localId))continue;
      const state=existing??this.state(id);
      if(state.avatar!==avatar){this.dispose(state);state.avatar=avatar;}
      const want=this.wanted(id,avatar,state,now,serverNow);
      if(!want)continue;
      // What is in the hands: a new weapon comes out at once; going to none, the old one goes back first.
      if(want.w&&(want.w!==state.shown||want.kit!==state.kit)){
        dropWeapon(state.weapon);state.weapon=undefined;
        state.shown=want.w;state.kit=want.kit;state.parts=want.parts;state.stats=id===localId?this.frame?.stats??statsOf(want.w,want.kit):statsOf(want.w,want.kit);
        state.drawAt=want.drawAt;state.holsterAt=0;
      }else if(want.w){state.drawAt=want.drawAt;state.holsterAt=want.holsterAt>want.drawAt?want.holsterAt:0;if(id===localId&&this.frame?.stats)state.stats=this.frame.stats;}
      else if(state.shown&&!state.holsterAt)state.holsterAt=want.holsterAt||now;
      const skin=avatar.skin;
      const hidden=!state.shown||!skin||avatar.resting||!!avatar.ragdoll||!!avatar.deathHidden||['ride','ragdoll','fallen','recover','sit'].includes(avatar.actor.animation??'');
      if(hidden){
        if(state.weapon)state.weapon.root.enabled=false;
        if(state.carry)state.carry.enabled=false;
        state.drawn=false;
        if(state.shown&&state.holsterAt&&now-state.holsterAt>1500){state.shown='';dropWeapon(state.weapon);state.weapon=undefined;}
        continue;
      }
      if(state.model!==skin!.model){state.pose?.restore();state.pose=new GunPose({model:skin!.model,bones:skin!.bones,left:skin!.drinkHand,right:skin!.rightHand});state.model=skin!.model;}
      const stats=state.stats!;
      if(!state.weapon||state.weapon.destroyed||(!state.weapon.real&&realReady(state.shown as WeaponId,state.parts))){
        dropWeapon(state.weapon);
        state.weapon=makeWeapon(this.app,avatar.root,state.shown as WeaponId,state.parts,state.kit);
      }
      const input=this.input(id===localId,avatar,state,stats,now,serverNow);
      const events=state.events??=this.events(state,id===localId);
      const shown=state.pose!.apply(input,state.weapon,dt,events);
      state.drawn=shown;
      state.weapon.root.enabled=shown&&!(id===localId&&(this.frame?.scoped??0)>.5);
      this.carry(state);
      if(!shown&&state.holsterAt){state.shown='';dropWeapon(state.weapon);state.weapon=undefined;if(state.carry)state.carry.enabled=false;continue;}
      if(!shown)continue;
      if(state.weapon.laser&&state.weapon.root.enabled)this.laser(state);
      if(dark&&state.weapon.light)lights.push({state,distance:camera.distance(avatar.root.getPosition())});
    }
    if(lights.length){
      lights.sort((a,b)=>a.distance-b.distance);
      for(const {state} of lights){
        if(torches>=3||!state.weapon?.beam)break;
        state.weapon.root.getRotation().transformVector(state.weapon.beam,v1);v1.add(state.weapon.root.getPosition());
        this.fx.torch(torches++,state.avatar.actor.id,v1,state.pose!.muzzleDir);
      }
    }
    this.fx.torchesUsed(torches);
    // Under a roof or not, for the reverb: a few times a second, straight up from the listener.
    if(now-this.insideAt>500){
      this.insideAt=now;
      const roof=mapRay([camera.x,camera.y+.3,camera.z],[camera.x,camera.y+25,camera.z]);
      this.audio.setInside(!!roof);
    }
    this.fx.update(dt,host.camera);
  }

  private input(local:boolean,avatar:WeaponAvatar,state:Armed,stats:WeaponStats,now:number,serverNow:number):PoseInput {
    const actor=avatar.actor,running=state.running=(avatar.speed??0)>(state.running?3.7:4.4),bodyYaw=avatar.yaw*Math.PI/180;
    if(local&&this.frame){
      const f=this.frame;
      if(f.aimPoint)aimPoint.set(f.aimPoint[0],f.aimPoint[1],f.aimPoint[2]);
      return {now,stats,bodyYaw,heading:f.heading,elevation:f.elevation,aimPoint:f.aimPoint?aimPoint:undefined,
        aiming:(f.facingAim||f.ads>.05)&&!f.lowered,ads:f.ads,running,lowered:f.lowered,drawAt:state.drawAt,holsterAt:state.holsterAt,
        reload:f.reload,cycle:f.cycle,empty:f.mag<=0,lastShotAt:state.lastShotAt,shots:state.shots};
    }
    const gun=actor.gun??{};
    const toLocal=(t:number)=>now-(serverNow-t);
    const reload=gun.reloadAt&&gun.reloadUntil&&serverNow<gun.reloadUntil+200&&serverNow>=gun.reloadAt
      ?{at:toLocal(gun.reloadAt),duration:Math.max(1,gun.reloadUntil-gun.reloadAt),style:stats.reloadStyle,from:gun.reloadFrom??0,to:stats.mag,key:gun.reloadAt}:undefined;
    const aiming=!!gun.ads||now-state.lastShotAt<GUN.facingHoldMs;
    return {now,stats,bodyYaw,heading:actor.rotation??bodyYaw,elevation:gun.pitch??0,aiming,ads:gun.ads?1:0,running,lowered:false,
      drawAt:state.drawAt,holsterAt:state.holsterAt,reload,cycle:state.cycle,empty:(gun.mag??1)<=0&&!reload,lastShotAt:state.lastShotAt,shots:state.shots};
  }

  private events(state:Armed,local:boolean):PoseEvents {
    return {
      mech:(sound:MechSound,at:pc.Vec3)=>{if(state.shown)this.audio.mech(state.shown,sound,local?undefined:at);},
      casing:(kind,at,velocity)=>this.fx.casing(kind,at,velocity,state.stats?.hold==='rifle'?'rifle':'pistol'),
      magazine:(at,rotation,velocity,long)=>this.fx.magazine(at,rotation,velocity,long),
    };
  }

  /** What the left hand carries during a reload: a magazine, a shell, a speed loader. */
  private carry(state:Armed):void {
    const kind=state.pose?.carrying??'';
    if(!kind){if(state.carry)state.carry.enabled=false;return;}
    if(state.carryKind!==kind||!state.carry){
      state.carry?.destroy();
      const e=new pc.Entity('Armas na mão');
      const material=this.carryMaterial??=(()=>{const m=new pc.StandardMaterial();m.diffuse=new pc.Color(.09,.09,.1);m.useMetalness=true;m.metalness=.5;m.gloss=.45;m.update();return m;})();
      const shell=state.stats?.caliber==='12ga';
      const add=(type:'box'|'cylinder',x:number,y:number,z:number,sx:number,sy:number,sz:number,color?:pc.Color)=>{
        const c=new pc.Entity();c.addComponent('render',{type,castShadows:false,receiveShadows:true});
        if(color){const m=new pc.StandardMaterial();m.diffuse=color;m.useMetalness=true;m.metalness=shell?.1:.9;m.gloss=.6;m.update();c.render!.meshInstances[0]!.material=m;}
        else c.render!.meshInstances[0]!.material=material;
        c.setLocalPosition(x,y,z);c.setLocalScale(sx,sy,sz);e.addChild(c);
      };
      const round=shell?new pc.Color(.62,.07,.06):new pc.Color(.78,.58,.24);
      if(kind==='mag'){const long=state.stats?.hold==='rifle';add('box',0,0,0,long?.024:.02,long?.13:.1,long?.055:.03);}
      else if(kind==='shell')add('cylinder',0,0,0,shell?.021:.01,shell?.065:.03,shell?.021:.01,round);
      else if(kind==='shells'){add('cylinder',-.012,0,0,.021,.065,.021,round);add('cylinder',.012,0,0,.021,.065,.021,round);}
      else{add('cylinder',0,0,0,.04,.012,.04);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;add('cylinder',Math.cos(a)*.012,.012,Math.sin(a)*.012,.009,.02,.009,round);}}
      state.avatar.root.addChild(e);state.carry=e;state.carryKind=kind;
    }
    state.carry.enabled=!!state.weapon?.root.enabled;
    state.carry.setPosition(state.pose!.carryAt);state.carry.setRotation(state.pose!.carryRot);
  }

  private laser(state:Armed):void {
    const weapon=state.weapon!;if(!weapon.beam)return;
    weapon.root.getRotation().transformVector(weapon.beam,v1);v1.add(weapon.root.getPosition());
    const dir=state.pose!.muzzleDir;
    v2.copy(v1).add(v3.copy(dir).mulScalar(60));
    const hit=mapRay([v1.x,v1.y,v1.z],[v2.x,v2.y,v2.z]);
    if(hit)v2.lerp(v1,v2,hit.fraction);
    // Bodies stop it too (where they are drawn): the nearest one on the beam.
    let best=hit?hit.fraction*60:60;
    for(const avatar of this.host!.avatars()){
      if(avatar===state.avatar||avatar.npc)continue;
      const p=avatar.root.getPosition();
      v3.set(p.x,p.y+1.2,p.z).sub(v1);const t=v3.dot(dir);
      if(t<=0||t>=best)continue;
      const off=v3.sub(beam.copy(dir).mulScalar(t));
      if(Math.hypot(off.x,off.z)<.22&&Math.abs(off.y)<.75){best=t;v2.copy(v1).add(beam.copy(dir).mulScalar(t-.2));}
    }
    this.fx.laser(v1,v2,best<60);
  }

  /** Back to the clips' pose (frameupdate), before the head looks restore theirs. */
  restore():void {for(const state of this.armed.values())state.pose?.restore();}

  destroy():void {
    for(const state of this.armed.values())this.dispose(state);
    this.armed.clear();
    this.fx.destroy();this.audio.destroy();this.carryMaterial?.destroy();
  }
}
