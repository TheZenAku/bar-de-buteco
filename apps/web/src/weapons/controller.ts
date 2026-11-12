import {armedPace,arsenalStats,bodyZones,cleanArsenal,mapRay,normalizeHeading,ownedInOrder,rayBody,type Vec3,type ArsenalView,type GunInput,type PartId,type PartSlot,type PlayerInput,type PlayerState,
  type UpgradeTrack,type WeaponHitEvent,type WeaponId,type WeaponShotEvent} from '@bar/shared';
import {LocalGun,type GunView} from './local-gun';
import {AimAssist,wrapped,type InputDevice,type AssistOutput} from './aim-assist';
import {WeaponHud} from './hud';
import {PAD,PadReader,rumble,stickLook,type PadFrame} from '../gamepad/gamepad';
import {PadMapper} from '../gamepad/pad-mapper';
import type {AimCamera,AimSettings,PadSettings,ShoulderSide} from './aim-settings';
import {actionOf,inputCode,keyLabel,mouseCode,type WeaponAction,type WeaponKeys} from './key-bindings';
import type {GunScenePort,WeaponSceneHooks} from './scene-hooks';
import type {LocalGunFrame,WeaponVisualsApi} from './contract';

/** What the crosshair is on: the nearest of the map and the bodies along the camera's ray, or a point far along it. */
const SIGHT_RANGE=300;
function sightPoint(origin:Vec3,forward:Vec3,targets:ReturnType<GunScenePort['targets']>):Vec3 {
  const end:Vec3=[origin[0]+forward[0]*SIGHT_RANGE,origin[1]+forward[1]*SIGHT_RANGE,origin[2]+forward[2]*SIGHT_RANGE];
  let t=SIGHT_RANGE;
  const wall=mapRay(origin,end);if(wall)t=wall.fraction*SIGHT_RANGE;
  for(const target of targets){const body=rayBody(origin,forward,t,bodyZones(target.skin,target.pose));if(body&&body.t<t)t=body.t;}
  // Keep the real hit distance. Replacing a nearby wall or body with a farther point introduces shoulder parallax, visibly moving the object that
  // was under the crosshair. CameraRig releases geometrically impossible near points instead of turning the view around.
  return [origin[0]+forward[0]*t,origin[1]+forward[1]*t,origin[2]+forward[2]*t];
}

/**
 * The local player's firearms in the page (docs/sistemas/armas.md#cliente): it gathers the mouse, the keys, the gamepad and the touch buttons, runs
 * LocalGun each frame with the camera the scene rendered, applies aim assistance and the pad's look to the camera rig, draws the HUD, speaks to
 * the room through the networking's hooks, and hands the avatar side its LocalGunFrame. main.ts builds one and attaches it to the scene.
 *
 * The interface agents build on (the weapon wheel, the Arsenal window, the Esc menu's rows): view(), select(), cycleMode(), reload(),
 * holsterToggle(), swapShoulder(), wheel(open), wheelPointer(), wheelChoice(), on('arsenal'|'wheel'|'notice'|'change'), requestArsenal(),
 * configure(), upgrade().
 */
export interface WeaponsHost {
  /** The local player's id (undefined before logging in). */
  me():string|undefined;
  serverNow():number;
  /** network.seen(): the newest state's room time and its age. */
  seen():{seen:number;ago:number};
  send(type:string,payload?:unknown):void;
  settings():{aim:AimSettings;pad:PadSettings;shoulder:ShoulderSide;aimCamera:AimCamera;keys:WeaponKeys;lite:boolean};
  saveShoulder(side:ShoulderSide):void;
  notice(text:string,error?:boolean):void;
  /** In the world with nothing in front of it (no window, menu, phone, minigame). */
  playable():boolean;
  /** A window or a menu takes the pad's buttons as keys (arrows, Enter, Escape). */
  menuOpen():boolean;
  /** mouse-capture.ts: take or let go of the mouse now (one request per gesture). */
  captureSync():void;
  /** The fist guard is up (the pad's triggers punch then). */
  guard():boolean;
  /** A player's name, for "Você derrubou …". */
  name(id:string):string;
}
export type WeaponsEvent='arsenal'|'wheel'|'notice'|'change';
/** What view() tells the interface: the gun as LocalGun sees it, plus the device in use, the wheel and the lock. */
export interface WeaponsView extends GunView {device:InputDevice;wheelOpen:boolean;locked:boolean;owned:WeaponId[]}

const NO_ASSIST:AssistOutput={yaw:0,pitch:0,lookScale:1,stickLooks:true,onBody:false,autoFire:false};
// The right stick at its base speeds (rad/s at full push); the look-speed setting multiplies them.
const PAD_YAW=3.2,PAD_PITCH=2.2;
// A lock reaches at most this far (m), through a scope farther.
const LOCK_RANGE=60,LOCK_RANGE_SCOPED=120;
// The mouse wheel's notch (pixels of travel) for a scope's zoom step; the wheel pointer's travel per pixel of mouse.
const WHEEL_NOTCH=50,WHEEL_POINTER=1/110;
// The wheel's pointer is on a weapon past this far from the centre; nearer, on the centre (holster).
const WHEEL_PICK=.35;
// A CapsLock press shorter than this (ms) with the pointer still is a tap: the wheel stays open until a click or another tap.
const WHEEL_TAP_MS=200;
// `adsBlend` reaches its end before the rig's shoulder and follow springs finish settling. Keep the world point under the crosshair through that
// short tail too; otherwise the last few centimetres of camera travel show up as a small aim jump after RMB has apparently finished zooming.
const AIM_HOLD_SETTLE=0.3;

export class WeaponsController implements WeaponSceneHooks {
  gun=new LocalGun('');
  private scene?:GunScenePort;
  private visuals?:WeaponVisualsApi;
  private readonly hud:WeaponHud;
  private readonly assist=new AimAssist();
  private assistOut:AssistOutput=NO_ASSIST;
  private readonly reader=new PadReader();
  private readonly mapper:PadMapper;
  private pad?:PadFrame;
  private padObject?:Gamepad|null;
  private frameNo=0;
  /** Aiming down the sights asked last frame, and whether the camera is holding the aimed point through the change (holdAim). */
  private adsWas=false;
  private holding=false;
  /** Seconds spent at the requested ADS endpoint while the held point is still centred. */
  private holdSettled=0;
  private polledFrame=-1;
  private padSample?:number[];
  private ramp=0;
  /** The device of the last real input: the assistance and the hints follow it. */
  device:InputDevice='mouse';
  private readonly held={lmb:false,rmb:false,breath:false,padFire:false,padAim:false,padBreath:false,touchFire:false,touchAim:false,touchBreath:false};
  private wheelOpen=false;
  private readonly wheelPoint={x:0,y:0};
  private wheeled=0;
  /** How CapsLock holds the wheel open: while held, or until a click or a second tap; when it went down; whether the pointer moved since. */
  private wheelKey?:'hold'|'toggle';
  private wheelKeyAt=0;
  private wheelMoved=false;
  private armedBefore=false;
  private onBefore=false;
  private drawnBefore:WeaponId|''='';
  private arsenalAskedAt=-Infinity;
  private readonly listeners=new Map<WeaponsEvent,Set<(detail?:unknown)=>void>>();

  constructor(game:HTMLElement,private readonly host:WeaponsHost) {
    this.hud=new WeaponHud(game);
    this.mapper=new PadMapper({
      menu:()=>this.host.menuOpen(),
      press:code=>{this.dispatch(code,'keydown');this.dispatch(code,'keyup');},
      hold:(code,down)=>this.dispatch(code,down?'keydown':'keyup'),
      move:(x,y)=>this.scene?.setTouchAxis(x,y),
      sprint:on=>this.scene?.setTouchSprint(on),
      system:()=>this.gun.on,drawn:()=>this.gun.on&&!!this.gun.drawn,scoped:()=>this.gun.scopeBlend>.5,guard:()=>this.host.guard(),
      aim:down=>{this.held.padAim=down;},trigger:down=>{this.held.padFire=down;},breath:down=>{this.held.padBreath=down;},
      reload:()=>{this.reload();},holster:()=>{this.gun.holsterToggle();this.changed();},mode:()=>{this.gun.cycleMode();},step:direction=>{this.gun.step(direction);this.changed();},
      zoom:direction=>{this.gun.zoomStep(direction);},arsenal:()=>this.emit('arsenal'),shoulder:()=>this.swapShoulder(),wheel:open=>this.wheel(open),
    });
    // The device in use: the last real input wins (synthetic keys from the pad and the touch overlay are not trusted events).
    const mouse=(event:Event)=>{if(event.isTrusted)this.device='mouse';};
    window.addEventListener('keydown',mouse,{capture:true,passive:true});
    window.addEventListener('mousedown',mouse,{capture:true,passive:true});
    window.addEventListener('mousemove',event=>{if(event.isTrusted&&(event.movementX||event.movementY))this.device='mouse';},{capture:true,passive:true});
    window.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')this.device='touch';},{capture:true,passive:true});
    window.addEventListener('gamepadconnected',event=>{const id=(event as GamepadEvent).gamepad.id.replace(/\s*\(.*$/,'').trim().slice(0,40);this.host.notice(`Controle conectado${id?`: ${id}`:''}.`);});
    window.addEventListener('gamepaddisconnected',()=>{this.mapper.release();this.held.padAim=this.held.padFire=this.held.padBreath=false;this.host.notice('Controle desconectado.');});
  }

  /** The scene is ready: it calls the hooks from now on. */
  attach(scene:GunScenePort,visuals:WeaponVisualsApi):void {
    this.scene=scene;this.visuals=visuals;
    scene.rig.setSide(this.host.settings().shoulder==='left'?-1:1);
  }
  /** The shoulder setting changed elsewhere (the Esc menu). */
  setShoulder(side:ShoulderSide):void {this.scene?.rig.setSide(side==='left'?-1:1);}

  // ---- Events for the interface.
  on(event:WeaponsEvent,listener:(detail?:unknown)=>void):()=>void {
    let set=this.listeners.get(event);if(!set)this.listeners.set(event,set=new Set());set.add(listener);
    return ()=>set!.delete(listener);
  }
  private emit(event:WeaponsEvent,detail?:unknown):void {for(const listener of this.listeners.get(event)??[])listener(detail);}
  private changed():void {
    const armed=this.armed();
    if(armed!==this.armedBefore){this.armedBefore=armed;this.host.captureSync();}
    this.emit('change');
  }
  private dispatch(code:string,type:'keydown'|'keyup'):void {
    const key=code.startsWith('Key')?code.slice(3).toLowerCase():code.startsWith('Digit')?code.slice(5):code;
    document.body.dispatchEvent(new KeyboardEvent(type,{code,key,bubbles:true,cancelable:true}));
  }
  private get id():string {
    const me=this.host.me()??'';
    // A new login is a new gun (its counts, its rounds).
    if(me!==this.gun.localId){if(this.gun.localId)this.gun=new LocalGun(me);else this.gun.localId=me;}
    return me;
  }

  // ---- The interface's API.
  view():WeaponsView {
    return {...this.gun.view(performance.now()),device:this.device,wheelOpen:this.wheelOpen,locked:!!this.assist.locked,owned:ownedInOrder(this.gun.arsenal)};
  }
  get drawn():boolean {return this.gun.on&&!!this.gun.drawn;}
  get scoped():boolean {return this.gun.scopeBlend>.5;}
  /** Aiming is held (or toggled on, on touch). */
  get aiming():boolean {return this.drawn&&this.adsHeld();}
  select(id:WeaponId|''):boolean {const done=this.gun.select(id);if(done)this.changed();return done;}
  cycleMode():boolean {return this.gun.cycleMode();}
  reload():string {const why=this.gun.requestReload(performance.now());if(why)this.notify(why);return why;}
  holsterToggle():void {this.gun.holsterToggle();this.changed();}
  swapShoulder():void {
    const rig=this.scene?.rig;if(!rig)return;
    rig.swapShoulder();this.host.saveShoulder(rig.side===1?'right':'left');
  }
  /** The weapon wheel (CapsLock held or tapped, LB held, the touch button): while open nothing fires or aims, and the mouse or the right stick moves its pointer. */
  wheel(open:boolean):void {
    if(open===this.wheelOpen||(open&&!this.gun.on))return;
    this.wheelOpen=open;
    if(open){this.wheelPoint.x=this.wheelPoint.y=0;this.wheelMoved=false;this.emit('wheel',true);return;}
    this.wheelKey=undefined;
    // Letting go picks what the pointer is on (the wheel's interface reads the same choice to light it).
    const choice=this.wheelChoice();
    this.emit('wheel',false);
    this.select(choice);
  }
  /** The wheel's pointer: x right, y down, inside the unit circle. */
  wheelPointer():{x:number;y:number} {return {...this.wheelPoint};}
  /**
   * The weapon the wheel's pointer is on: the owned weapons go round the wheel from the top, clockwise, in the wheel's order; the centre is ''
   * (letting go there holsters, docs/sistemas/armas.md#controles).
   */
  wheelChoice():WeaponId|'' {
    const {x,y}=this.wheelPoint,slots=this.wheelSlots();
    if(Math.hypot(x,y)<WHEEL_PICK||!slots.length)return '';
    const angle=Math.atan2(y,x);
    let best:{slot:WeaponId;off:number}|undefined;
    slots.forEach((slot,i)=>{const at=-Math.PI/2+i*Math.PI*2/slots.length,off=Math.abs(wrapped(angle-at));if(!best||off<best.off)best={slot,off};});
    return best!.slot;
  }
  /** Puts the wheel's pointer on a weapon's sector ('' the centre): a finger's tap or an unlocked mouse's hover picks through the same choice. */
  wheelAim(id:WeaponId|''):void {
    if(!this.wheelOpen)return;
    const slots=this.wheelSlots(),i=id?slots.indexOf(id):-1;
    if(i<0){this.wheelPoint.x=this.wheelPoint.y=0;}
    else{const at=-Math.PI/2+i*Math.PI*2/slots.length;this.wheelPoint.x=Math.cos(at)*.8;this.wheelPoint.y=Math.sin(at)*.8;}
    this.wheelMoved=true;
  }
  /** The wheel's slots round the ring, in order (see wheelChoice). */
  wheelSlots():WeaponId[] {return ownedInOrder(this.gun.arsenal);}
  requestArsenal():void {this.host.send('weapon.arsenal',{});this.arsenalAskedAt=performance.now();}
  configure(weapon:WeaponId,slot:PartSlot,part:PartId|null):void {this.host.send('weapon.configure',{weapon,slot,part});}
  upgrade(weapon:WeaponId,track:UpgradeTrack):void {this.host.send('weapon.upgrade',{weapon,track});}
  private notify(text:string):void {this.host.notice(text,true);this.emit('notice',text);}

  // ---- The scene's hooks.
  armed():boolean {return this.gun.on&&(!!this.gun.drawn||!!this.gun.want);}
  facingAim():boolean {
    // In first person the weapon is the view: leaving the body in its old heading until ADS or the first shot makes the hands and barrel visibly
    // lag behind the reticle. Keep the armed stance following the camera for the whole time the gun is in hand.
    return this.gun.on&&(this.gun.facingAim(performance.now())||!!this.gun.drawn&&this.scene?.rig.mode==='first');
  }
  /** The view's zoom: a scope's as it is; a plain sight's scaled by the tuning (AimCamera.zoom). */
  zoom():number {
    if(!this.gun.on||!this.gun.drawn)return 1;
    return this.gun.stats?.scope?this.gun.zoom:Math.max(.2,1+(this.gun.zoom-1)*this.host.settings().aimCamera.zoom);
  }

  key(code:string,down:boolean,repeat:boolean):boolean {
    // The touch overlay's buttons (touch-controls.ts): always the weapons'.
    if(code.startsWith('Weapon')){this.device='touch';this.touchKey(code,down);return true;}
    return this.input(inputCode(code),down,repeat);
  }
  /** The keys the player chose (key-bindings.ts), as the settings hold them. */
  get keys():WeaponKeys {return this.host.settings().keys;}
  /** What an action's key reads as, for hints ('' when it has none). */
  keyName(action:WeaponAction):string {return keyLabel(this.keys[action]);}
  /**
   * A keyboard key or a mouse side button (`Mouse4`, `Mouse5`) went down or up. The bound actions run here; the digits pick by the wheel's order.
   * Returns whether the game must not see it (a bound key is the weapons' only while /armas is on: the others fall through to their old uses).
   */
  private input(code:string,down:boolean,repeat:boolean):boolean {
    const gun=this.gun,action=actionOf(this.keys,code);
    if(action==='breath'){
      this.held.breath=down;
      // Shift is also the sprint (the game must see it); any other key given to the breath is the gun's while it is out.
      return code!=='ShiftLeft'&&gun.on&&!!gun.drawn;
    }
    if(action==='wheel')return this.wheelKeyPress(down,repeat);
    if(!down)return false;
    if(!gun.on||!this.host.playable())return false;
    const free=this.scene?.free()??false;
    if(action==='arsenal'){if(!repeat)this.emit('arsenal');return true;}
    if(!free)return false;
    const drawn=!!gun.drawn||!!gun.want;
    // Only the keys that mean something with the gun out are taken; a repeat is swallowed, never acted on twice.
    if(action==='holster'||action==='shoulder')return repeat?true:(action==='holster'?(gun.holsterToggle(),this.changed(),true):(this.swapShoulder(),true));
    if(!drawn)return false;
    if(action==='reload'||action==='mode'||action==='next'||action==='prev'){
      if(repeat)return true;
      if(action==='reload')this.reload();
      else if(action==='mode')gun.cycleMode();
      else{gun.step(action==='next'?1:-1);this.changed();}
      return true;
    }
    if(repeat)return false;
    const digit=/^Digit(\d)$/.exec(code);
    if(digit){const id=ownedInOrder(gun.arsenal)[digit[1]==='0'?9:Number(digit[1])-1];if(id)this.select(id);return true;}
    return false;
  }
  /**
   * The wheel's key (Caps Lock by default; Tab moved the page's focus). Held: open while down, letting go picks. A quick tap (under 200 ms, the
   * pointer still) leaves it open until a click or another tap picks: macOS sends CapsLock only when the lock changes (a press is a keydown, the
   * next press a keyup), which the same rule reads as a hold ended by the next press. Any key or side button works the same way.
   */
  private wheelKeyPress(down:boolean,repeat:boolean):boolean {
    const now=performance.now();
    if(down){
      if(repeat)return this.gun.on;
      if(this.wheelOpen&&this.wheelKey==='toggle'){this.wheel(false);return true;}
      if(!this.wheelOpen&&this.gun.on&&this.host.playable()&&(this.scene?.free()??false)){this.wheel(true);this.wheelKey='hold';this.wheelKeyAt=now;}
      return this.gun.on;
    }
    if(!this.wheelOpen||this.wheelKey!=='hold')return this.gun.on;
    if(now-this.wheelKeyAt<WHEEL_TAP_MS&&!this.wheelMoved)this.wheelKey='toggle';
    else this.wheel(false);
    return true;
  }
  private touchKey(code:string,down:boolean):void {
    const gun=this.gun;
    switch(code){
      case 'WeaponFire':this.held.touchFire=down;break;
      case 'WeaponAim':if(down)this.held.touchAim=!this.held.touchAim;break;
      case 'WeaponBreath':this.held.touchBreath=down;break;
      case 'WeaponReload':if(down)this.reload();break;
      case 'WeaponZoomIn':if(down)gun.zoomStep(1);break;
      case 'WeaponZoomOut':if(down)gun.zoomStep(-1);break;
      case 'WeaponHolster':if(down){gun.holsterToggle();this.changed();}break;
      // The wheel's touch interface comes with the wheel; until then the button goes to the next weapon.
      case 'WeaponWheel':if(down){if(this.listeners.get('wheel')?.size)this.wheel(!this.wheelOpen);else{gun.step(1);this.changed();}}break;
    }
  }
  button(button:number,down:boolean):boolean {
    // The mouse's side buttons (back, forward) are bindable like keys; the middle one is the mouse capture's (mouse-capture.ts).
    if(button>=3)return mouseCode(button)?this.input(mouseCode(button),down,false):false;
    if(!down){
      const was=button===0?this.held.lmb:button===2?this.held.rmb:false;
      if(button===0)this.held.lmb=false;if(button===2)this.held.rmb=false;
      return was;
    }
    // A click with the wheel open picks what its pointer is on.
    if(this.wheelOpen){if(button===0){this.wheel(false);return true;}return false;}
    if(!this.drawn||!this.host.playable()||!this.scene?.free())return false;
    if(button===0){this.held.lmb=true;return true;}
    if(button===2){this.held.rmb=true;return true;}
    return false;
  }
  pointer(dx:number,dy:number):boolean {
    if(!this.wheelOpen)return false;
    if(dx||dy)this.wheelMoved=true;
    const x=this.wheelPoint.x+dx*WHEEL_POINTER,y=this.wheelPoint.y+dy*WHEEL_POINTER,length=Math.hypot(x,y),scale=length>1?1/length:1;
    this.wheelPoint.x=x*scale;this.wheelPoint.y=y*scale;
    return true;
  }
  /** The mouse wheel while scoped: the scope's zoom steps (a notch at a time). */
  scroll(deltaY:number):boolean {
    if(!this.drawn||this.gun.scopeBlend<=.5||!Number.isFinite(deltaY)||!deltaY)return false;
    if(deltaY*this.wheeled<0)this.wheeled=0;
    this.wheeled+=deltaY;
    if(Math.abs(this.wheeled)>=WHEEL_NOTCH){this.gun.zoomStep(this.wheeled<0?1:-1);this.wheeled=0;}
    return true;
  }
  blur():void {this.release();}
  /** Lets go of everything held: a window or the pause menu opened, the page lost focus. */
  release():void {
    const held=this.held;
    held.lmb=held.rmb=held.breath=held.padFire=held.padAim=held.padBreath=held.touchFire=held.touchAim=held.touchBreath=false;
    this.mapper.release();this.gun.release();
    this.scene?.rig.holdAim(undefined);this.holding=false;this.holdSettled=0;
    if(this.wheelOpen){this.wheelOpen=false;this.wheelKey=undefined;this.emit('wheel',false);}
  }

  /** Reads the pad once a frame (before() or frame(), whichever runs first) and maps it. */
  private poll():void {
    if(this.polledFrame===this.frameNo)return;
    this.polledFrame=this.frameNo;
    const now=performance.now();
    let pads:(Gamepad|null)[]=[];
    try{pads=navigator.getGamepads?Array.from(navigator.getGamepads()):[];}catch{/* Blocked by a permissions policy. */}
    this.pad=this.reader.read(pads,now);
    this.padObject=this.pad?pads.find(item=>item?.connected&&item.id===this.pad!.id):undefined;
    // The pad takes over only when it CHANGES (a press, a stick moved): a pad plugged in with a drifting stick or a stuck axis (also wheels, HOTAS and
    // some mice or keyboards show up as pads) is "active" every frame and used to override the mouse, switching on the assist and the stick's look.
    const sample=this.pad?[this.pad.left.x,this.pad.left.y,this.pad.right.x,this.pad.right.y,this.pad.lt,this.pad.rt,...Object.values(PAD).map(button=>this.pad!.down(button as never)?1:0)]:undefined;
    const before=this.padSample;this.padSample=sample;
    if(this.pad?.active&&sample&&(!before||before.length!==sample.length||sample.some((v,i)=>Math.abs(v-before[i]!)>.08)))this.device='gamepad';
    if(this.pad&&this.wheelOpen&&this.pad.right.m>.5){this.wheelPoint.x=this.pad.right.x;this.wheelPoint.y=this.pad.right.y;this.wheelMoved=true;}
    this.mapper.frame(this.pad,now);
  }

  before(dt:number):void {
    this.poll();
    const scene=this.scene;
    if(!scene)return;
    const rig=scene.rig,gun=this.gun,now=performance.now(),settings=this.host.settings();
    const drawn=gun.on&&!!gun.drawn&&scene.free();
    const stats=gun.stats;
    // The look while aiming slows with the zoom (the same turn on screen), times the player's own setting.
    const aimScale=drawn?1/Math.max(1,gun.zoom)*(1+((gun.scopeBlend>.5?settings.aim.scopeSensitivity:settings.aim.adsSensitivity)-1)*gun.adsBlend):1;
    let out=NO_ASSIST;
    if(drawn&&stats&&this.device!=='mouse'&&this.host.playable()){
      const camera=scene.camera();
      out=this.assist.update({dt,now,device:this.device,padMode:settings.aim.assistPad,touchAssist:settings.aim.assistTouch,autoFire:settings.aim.autoFire,
        aiming:this.adsHeld(),firing:this.triggerHeld(),stick:this.device==='gamepad'&&this.pad?{x:this.pad.right.x,y:this.pad.right.y}:{x:0,y:0},
        camera:camera.origin,view:{yaw:rig.yaw,pitch:rig.pitch},targets:scene.targets(),range:Math.min(stats.range.max,stats.scope?LOCK_RANGE_SCOPED:LOCK_RANGE)});
      if(out.yaw||out.pitch)rig.nudge(out.yaw,out.pitch);
    } else this.assist.reset();
    this.assistOut=out;
    // The right stick: the look, unless a lock walks the reticle with it or the wheel takes it.
    const pad=this.pad;
    if(pad&&this.device==='gamepad'&&pad.right.m>0&&out.stickLooks&&!this.wheelOpen&&this.host.playable()){
      const look=stickLook(pad.right,dt,{yawSpeed:PAD_YAW*settings.pad.lookSpeed,pitchSpeed:PAD_PITCH*settings.pad.lookSpeed,curve:settings.pad.curve,invertY:settings.pad.invertY},
        aimScale*out.lookScale,this.ramp,drawn&&gun.adsWanted);
      this.ramp=look.ramp;rig.look(look.yaw,look.pitch);
    } else this.ramp=0;
    // The mouse and the fingers: the zoom's slowing; a finger also gets the friction.
    rig.lookScale=aimScale*(this.device==='touch'?out.lookScale:1);
    // The body faces the aim, frame by frame (inputs go 20 times a second).
    if(drawn&&(gun.facingAim(now)||rig.mode==='first'))scene.face(normalizeHeading(rig.yaw+Math.PI));
  }
  private adsHeld():boolean {return this.held.rmb||this.held.padAim||this.held.touchAim;}
  private triggerHeld():boolean {return this.held.lmb||this.held.padFire||this.held.touchFire;}

  frame(dt:number):LocalGunFrame|undefined {
    this.poll();
    this.frameNo++;
    const scene=this.scene,gun=this.gun,now=performance.now(),settings=this.host.settings();
    if(!scene)return undefined;
    const rig=scene.rig,playable=this.host.playable();
    // A window in front: nothing stays held behind it.
    if(!playable&&(this.triggerHeld()||this.adsHeld()||this.wheelOpen))this.release();
    const local=scene.local();
    if((!gun.on&&!gun.drawn)||!local){
      if(this.holding){rig.holdAim(undefined);this.holding=false;this.holdSettled=0;}
      if(rig.armed||rig.lookScale!==1){rig.armed=false;rig.aim(0);rig.scope(0);rig.lookScale=1;}
      this.hud.update({visible:false,view:gun.view(now),fov:57,width:1,height:1,locked:false,lite:settings.lite,now});
      this.track();
      return undefined;
    }
    const camera=scene.camera(),free=playable&&scene.free()&&!this.wheelOpen;
    const autoFire=this.assistOut.autoFire&&this.device==='touch';
    // Into the aim or out of it: the camera keeps what the crosshair was on (it moves, so its middle would land elsewhere).
    const adsNow=free&&this.adsHeld();
    if(adsNow!==this.adsWas){
      this.adsWas=adsNow;
      if(gun.drawn&&scene.free()){rig.holdAim(sightPoint(camera.origin,camera.forward,scene.targets()));this.holding=true;this.holdSettled=0;}
    }
    const frame=gun.update(dt,{trigger:free&&(this.triggerHeld()||autoFire),ads:free&&this.adsHeld(),breath:this.held.breath||this.held.padBreath||this.held.touchBreath},
      {now,origin:camera.origin,forward:camera.forward,feet:local.feet,skin:local.skin,speed:local.speed,sprinting:scene.sprintHeld()&&local.speed>.5,
        targets:()=>scene.targets(),seen:()=>this.host.seen(),free});
    // The first-person weapon stays shouldered along the view even at hip fire. ADS still controls how far the sight itself comes onto the eye.
    if(gun.drawn&&rig.mode==='first')frame.facingAim=true;
    for(const kick of gun.takeKicks())rig.recoil(kick.up,kick.side,kick.recover);
    if(frame.shots.length&&this.device==='gamepad'&&settings.pad.vibration)rumble(this.padObject,'shot');
    // The camera's opt-ins follow the gun (the rig reads them on its next follow).
    const drawn=!!gun.drawn&&scene.free();
    // The rig still has a short positional tail after adsBlend reaches its endpoint. Keep the same world point centred through that tail; a real
    // look input clears rig.holdingAim at once, so this never fights the mouse, stick or touch drag.
    if(this.holding){
      const atEndpoint=adsNow?gun.adsBlend>=1:gun.adsBlend<=0;
      this.holdSettled=atEndpoint?this.holdSettled+Math.max(0,dt):0;
      if(!drawn||!rig.holdingAim||this.holdSettled>=AIM_HOLD_SETTLE){rig.holdAim(undefined);this.holding=false;this.holdSettled=0;}
    }
    rig.tuneAim(settings.aimCamera);
    rig.armed=drawn;rig.aim(drawn?gun.adsBlend:0,gun.stats&&gun.stats.hold!=='rifle'?'pistol':'rifle');// A long gun's optic that is not a scope (red dot, reflex, holographic, ACOG): the view goes into the eyes, along the aim, as the sight's own line does
    // (GunPose brings the sight onto the eye's line), and the glass is clear: the world is seen through the sight, the dot floating on it.
    const sightView=!!gun.stats&&gun.stats.reticle!=='iron'&&!gun.stats.scope&&gun.stats.hold==='rifle';
    rig.scope(drawn?(sightView?gun.adsBlend:gun.scopeBlend):0);
    if(!drawn)rig.lookScale=1;
    const blocked=drawn&&gun.blockedAt?scene.project(gun.blockedAt):undefined;
    this.hud.update({visible:drawn&&playable,view:gun.view(now),fov:camera.fov,width:camera.width,height:camera.height,blocked,locked:!!this.assist.locked,lite:settings.lite,now,device:this.device,reloadKey:keyLabel(settings.keys.reload)});
    this.track();
    return frame;
  }
  /** Changes the room or a timer made (on, off, a weapon out or put away): the mouse capture and the interface hear of them. */
  private track():void {
    const on=this.gun.on,drawn=this.gun.drawn;
    if(on!==this.onBefore||drawn!==this.drawnBefore){this.onBefore=on;this.drawnBefore=drawn;this.changed();}
  }

  // ---- The networking's hooks.
  /** The gun field of input `seq`, whether every input must go now (a weapon out), and whether it walks (aiming, firing: no run). */
  decorate(seq:number,_self:PlayerState):{input:GunInput;active:boolean;walk:boolean}|undefined {
    void this.id;
    const gun=this.gun,active=gun.active,input=gun.decorate(seq);
    return input?{input,active,walk:gun.walking}:undefined;
  }
  /** The room's state for the local player after input `acked`. */
  reconcile(self:PlayerState,acked:number):void {
    if(!this.id)return;
    this.gun.reconcile(self.gun,acked,this.host.serverNow(),performance.now());
    // On with no arsenal yet (a reload of the page, a lost message): ask for it, now and then.
    if(self.gun?.on&&!this.gun.arsenal&&performance.now()-this.arsenalAskedAt>3000)this.requestArsenal();
  }
  /** The walking pace the room gives this input (aiming slows it): prediction must use the same. */
  pace(input:Pick<PlayerInput,'gun'>):number|undefined {
    const gun=input.gun;
    return gun?.ads&&gun.w?armedPace(arsenalStats(this.gun.arsenal,gun.w),true):undefined;
  }
  /** weapon.arsenal: the weapons owned, their parts and upgrades, the rounds; `draw` draws one. */
  arsenal(view:ArsenalView):void {void this.id;this.gun.setArsenal(cleanArsenal(view));this.emit('change');}
  /** weapon.shot: someone else's shot (the room does not send the local player's own). */
  shot(event:WeaponShotEvent):void {if(event.by!==this.host.me())this.visuals?.remoteShot(event);}
  /** weapon.hit: a shot that hit someone near; the shooter's marker and the victim's warning. */
  hit(event:WeaponHitEvent):void {
    const me=this.host.me()??'',now=performance.now(),settings=this.host.settings();
    this.visuals?.hit(event,me);
    if(event.by===me&&event.to!==me){
      const kind=event.ko?'ko':event.zone==='head'?'head':'hit';
      this.hud.hit(kind);
      this.visuals?.cue(event.ko?'kill':kind==='head'?'headshot':'hit');
      if(event.ko)this.hud.knockout(`Você derrubou ${this.host.name(event.to)}`);
      if(this.device==='gamepad'&&settings.pad.vibration&&event.ko)rumble(this.padObject,'heavy');
    }
    if(event.to===me){
      // Where it came from: the bullet's heading turned round, against where the camera looks (clockwise on screen).
      const rig=this.scene?.rig,from=event.yaw+Math.PI,view=rig?rig.yaw+Math.PI:from;
      this.hud.hurtFrom(-wrapped(from-view),event.damage/60,now);
      if(this.device==='gamepad'&&settings.pad.vibration)rumble(this.padObject,'hit');
    }
  }
  destroy():void {this.hud.destroy();}
}
