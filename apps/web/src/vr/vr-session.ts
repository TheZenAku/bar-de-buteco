import * as pc from 'playcanvas';
import {setVrActive,vrLog,vrSupported,vrUnavailableReason,type VrSettings} from './vr-mode';
import {Panel,VrPanels,type NameTag,type ScreenHit} from './vr-panels';
import {createVrKeyboard} from './vr-keyboard';

/**
 * A WebXR session (Meta Quest 2 and any other headset) and everything that happens inside it. The world, the avatar and the
 * server do not know the player is wearing a headset: the headset only replaces the camera and the keyboard/mouse.
 *
 * How it fits the game (docs/sistemas/vr.md):
 *  - The camera entity becomes a child of the rig (`root`). WebXR writes the headset's pose into the camera's local transform at
 *    the start of every frame; BarScene then runs its usual camera code (first person, vehicles, TV and stage views) on that same
 *    entity just to learn where the eyes should be (`endFrame`'s anchor), and the rig is moved so the headset lands there. The
 *    headset's pose is put back afterwards. Walking in the room moves the head, not the avatar.
 *  - The heading of the head, plus the snap turns, is the camera heading the game already uses for walking and for the avatar's
 *    head (`beginFrame` gives it to CameraRig), so "forward" is where the nose points.
 *  - The page's HTML cannot be shown in a headset, so it is drawn to textures (dom-mirror.ts, vr-panels.ts) and clicked by laser.
 */
export interface VrHooks {
  /** A window, the phone, a table or a menu is open: the screen opens by itself and the world stops taking the stick. */
  windowOpen():boolean;
  /** On foot, on a bike, in a car or on a horse. */
  context():'walk'|'bike'|'car'|'horse';
  /** A key goes down or up, as the keyboard would send it. */
  key(code:string,down:boolean):void;
  /** The stick, as the touch stick: x right, y down. */
  move(x:number,y:number):void;
  sprint(on:boolean):void;
  /** The player (or, with `vehicle`, the vehicle) a ray points at, within `reach` metres. */
  pick(origin:pc.Vec3,direction:pc.Vec3,reach:number):{id:string;distance:number;vehicle?:true}|undefined;
  /** The menu of a player or vehicle (as a right click on it), at a point of the screen. */
  menu(id:string,x:number,y:number,vehicle?:boolean):void;
  notice(text:string):void;
  /** The names to float over the nearest people (up to `max`), in world coordinates. */
  names(max:number):NameTag[];
}

/** Where the eyes should be this frame, in the world (the camera code of BarScene decides). */
export interface VrAnchor {
  x:number;y:number;z:number;
  /** A view that is not the avatar's (the TV, the stage, the phone's selfie): the exact place, facing `faceYaw`. */
  special:boolean;
  /** The heading the headset should face when the rig is placed anew (the view starts, or a special one begins). */
  faceYaw?:number;
}

interface Hand {
  source:pc.XrInputSource;
  grip:pc.Entity;
  ray:pc.Entity;
  rayMaterial:pc.StandardMaterial;
  down:Record<string,boolean>;
  over:boolean;
  armed:boolean;
}
interface Pad {x:number;y:number;trigger:boolean;squeeze:boolean;stick:boolean;a:boolean;b:boolean}
const NONE:Pad={x:0,y:0,trigger:false,squeeze:false,stick:false,a:false,b:false};

const DEAD_ZONE=.2,TURN_RATE=1.9,SNAP_ARM=.35,SNAP_FIRE=.7;
const REACH=7;
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const wrapped=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
const ease=(rate:number,dt:number)=>1-Math.exp(-rate*dt);
/** The height of the eyes over the floor when the player has not been measured yet. */
const DEFAULT_HEIGHT=1.6;

function emissive(color:[number,number,number],alpha?:number):pc.StandardMaterial {
  const material=new pc.StandardMaterial();
  material.useLighting=false;material.useFog=false;material.useSkybox=false;
  material.diffuse.set(0,0,0);material.emissive.set(...color);
  if(alpha!==undefined){material.opacity=alpha;material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;}
  material.update();
  return material;
}

export class VrSession {
  /** Open between the headset going on and off. */
  active=false;
  /** Called when the session ends for any reason (the player took the headset off, the system menu closed it). */
  onEnd?:(reason:string)=>void;
  readonly root=new pc.Entity('VR rig');
  private panels?:VrPanels;
  private keyboard?:ReturnType<typeof createVrKeyboard>;
  private comfort?:Panel;
  private settings!:VrSettings;
  private readonly hands=new Map<string,Hand>();
  private handleEnd?:()=>void;
  private readonly cameraParent:pc.GraphNode;

  /** The headset's pose this frame, in the rig's space (as WebXR wrote it into the camera). */
  private readonly hmdPosition=new pc.Vec3();
  private readonly hmdRotation=new pc.Quat();
  /** Turning: radians the rig is turned (snap and smooth turns), and what the right stick is doing. */
  private turn=0;
  /** Where the head was when the rig was last centred (tracking space), and how high the eyes were then. */
  private originX=0;
  private originZ=0;
  private refHeight=DEFAULT_HEIGHT;
  private calibrated=false;
  private waited=0;
  private eyeY=0;
  private eyeSet=false;
  private face?:number;
  private wasSpecial=false;
  private viewYaw=0;
  /** Comfort: how much the view is moving or turning right now (0 to 1), smoothed. */
  private moving=0;
  private pulse=0;
  private anchorBefore?:{x:number;z:number};
  private latchedSprint=false;
  private sprinting=false;
  private heldKeys=new Set<string>();
  private pending:pc.Vec3=new pc.Vec3();
  private logged=false;
  /** A session was asked for and the browser has not answered yet (the first one can take over a minute while the headset's software starts). */
  private starting=false;
  /** XR frames seen since the session began, and when: the loading watchdog and the frame rate report. */
  private frames=0;
  private beganAt=0;
  private timers:ReturnType<typeof setTimeout>[]=[];
  /** Fixtures and tests (`simulate`): no headset, the head is `pose`. */
  private simulated=false;
  readonly pose={x:0,y:1.65,z:0,yaw:0,pitch:0};

  constructor(private readonly app:pc.AppBase,private readonly camera:pc.Entity,private readonly hooks:VrHooks) {
    this.cameraParent=camera.parent!;
  }

  /** Opens the session. Must run inside a click (the browser refuses otherwise). */
  async start(settings:VrSettings):Promise<void> {
    if(this.active||this.starting)return;
    this.starting=true;
    try{await this.open(settings);}finally{this.starting=false;}
  }

  private async open(settings:VrSettings):Promise<void> {
    const t0=performance.now(),took=()=>`${Math.round(performance.now()-t0)} ms`;
    vrLog('pedido para entrar no VR');
    const supported=await vrSupported();
    vrLog(`immersive-vr suportado=${supported} (${took()})`);
    if(!supported)throw new Error(vrUnavailableReason());
    const xr=this.app.xr;
    vrLog(`PlayCanvas xr.supported=${xr?.supported} disponível=${xr?.isAvailable(pc.XRTYPE_VR)}`);
    if(xr&&!this.logged){
      this.logged=true;
      xr.on('start',()=>vrLog('evento xr start'));
      xr.on('end',()=>vrLog('evento xr end'));
      xr.on('error',(e:unknown)=>vrLog(`evento xr error: ${e instanceof Error?e.message:String(e)}`));
      xr.on('visibility:change',(state:string)=>vrLog(`visibilidade da sessão: ${state}`));
    }
    if(!xr?.supported||!xr.isAvailable(pc.XRTYPE_VR)){
      // The availability arrives a moment after the page loads; a click soon after still works in browsers that answer.
      await new Promise(resolve=>setTimeout(resolve,150));
      if(!xr?.isAvailable(pc.XRTYPE_VR))throw new Error(vrUnavailableReason());
    }
    this.settings=settings;
    this.app.root.addChild(this.root);
    const here=this.camera.getPosition();
    this.root.setPosition(here.x,here.y-DEFAULT_HEIGHT,here.z);
    this.root.addChild(this.camera);
    try{
      await new Promise<void>((resolve,reject)=>{
        const slow=setTimeout(()=>this.hooks.notice('Abrindo o VR… na primeira vez o Link/SteamVR pode levar mais de um minuto para iniciar. Não clique de novo: espere o headset mostrar o jogo.'),5000);
        // Never given up on: a session the browser opens late would find the game unprepared (the camera would stay on the screen).
        const timer=setTimeout(()=>reject(new Error('O navegador não abriu o VR em 5 minutos. Confira o Link/Air Link e o SteamVR/Oculus no PC.')),300000);
        xr.start(this.camera.camera!,pc.XRTYPE_VR,pc.XRSPACE_LOCALFLOOR,{framebufferScaleFactor:settings.resolution,callback:(error:Error|null)=>{clearTimeout(timer);clearTimeout(slow);if(error)reject(error);else resolve();}});
      });
    }catch(error){
      vrLog(`falha ao abrir a sessão (${took()}): ${error instanceof Error?error.message:String(error)}`);
      this.cameraParent.addChild(this.camera);this.root.remove();
      throw error instanceof Error?error:new Error('O navegador recusou abrir o VR.');
    }
    vrLog(`sessão aberta (${took()}); framebuffer ${xr.session?'ok':'?'}, taxa ${xr.frameRate??'?'} Hz`);
    this.begin();
    this.handleEnd=()=>this.finish('A sessão VR terminou.');
    xr.on('end',this.handleEnd);
  }

  /** Runs everything but the headset itself: for fixtures and tests, where `pose` is the head and there are no controllers. */
  simulate(settings:VrSettings):void {
    if(this.active)return;
    this.settings=settings;this.simulated=true;
    this.app.root.addChild(this.root);
    const here=this.camera.getPosition();
    this.root.setPosition(here.x,here.y-DEFAULT_HEIGHT,here.z);
    this.root.addChild(this.camera);
    this.begin();
  }

  private begin():void {
    this.active=true;this.frames=0;this.beganAt=performance.now();
    this.timers.push(setTimeout(()=>{if(this.active&&!this.frames){this.hooks.notice('O VR não recebeu nenhum quadro em 12 s: o computador não conseguiu desenhar o bar a tempo. Saindo do VR; baixe a resolução do VR nas Configurações.');this.stop();}},12000));
    this.timers.push(setTimeout(()=>{if(!this.active||this.simulated)return;const fps=Math.round(this.frames/((performance.now()-this.beganAt)/1000));this.hooks.notice(`VR a ${fps} quadros por segundo${fps<50?': pesado para este computador. Baixe a resolução do VR nas Configurações.':'.'}`);},8000));
    this.calibrated=false;this.waited=0;this.eyeSet=false;this.turn=0;this.moving=0;this.pulse=0;this.anchorBefore=undefined;
    this.face=undefined;this.wasSpecial=false;
    this.panels=new VrPanels(this.app,this.root,this.camera);
    this.keyboard=createVrKeyboard();
    this.comfort=new Panel(this.app.graphicsDevice,'VR comfort',this.comfortMesh(),250);
    this.camera.addChild(this.comfort.entity);
    this.comfort.entity.setLocalPosition(0,0,-.22);
    this.comfort.entity.enabled=false;
    this.drawComfort();
    setVrActive(true);
  }

  /** Ends the session (the headset's own system menu can end it too: `onEnd` hears both). */
  stop():void {
    if(!this.active){return;}
    if(!this.simulated&&this.app.xr?.active)this.app.xr.end();else this.finish('Saiu do VR.');
  }

  private finish(reason:string):void {
    if(!this.active)return;
    this.active=false;this.simulated=false;
    for(const timer of this.timers)clearTimeout(timer);
    this.timers=[];
    if(this.handleEnd)this.app.xr?.off('end',this.handleEnd);
    this.handleEnd=undefined;
    this.releaseKeys();
    vrLog(`sessão encerrada: ${reason} (${this.frames} quadros)`);
    this.hooks.move(0,0);this.hooks.sprint(false);
    for(const hand of this.hands.values())this.destroyHand(hand);
    this.hands.clear();
    this.panels?.destroy();this.panels=undefined;
    this.keyboard?.destroy();this.keyboard=undefined;
    this.comfort?.destroy();this.comfort=undefined;
    // The camera goes back to the world, level, where the avatar's view will take it at once.
    this.cameraParent.addChild(this.camera);
    this.camera.setLocalScale(1,1,1);
    this.root.remove();
    setVrActive(false);
    this.onEnd?.(reason);
  }

  // ---- The frame: beginFrame → (BarScene's camera code) → endFrame ----

  /** First thing in the frame: the headset's pose, and the heading it gives the game (CameraRig takes it as its yaw and pitch). */
  beginFrame(dt:number):{yaw:number;pitch:number}|null {
    if(!this.active)return null;
    this.frames++;
    if(this.frames===1)vrLog(`primeiro quadro XR, ${Math.round(performance.now()-this.beganAt)} ms depois de abrir`);
    if(this.simulated){
      this.hmdPosition.set(this.pose.x,this.pose.y,this.pose.z);
      this.hmdRotation.setFromEulerAngles(-this.pose.pitch*pc.math.RAD_TO_DEG,this.pose.yaw*pc.math.RAD_TO_DEG,0);
    }else{
      this.hmdPosition.copy(this.camera.getLocalPosition());
      this.hmdRotation.copy(this.camera.getLocalRotation());
    }
    if(!this.calibrated){
      this.waited+=dt;
      // The floor-level tracking can take a few frames to report a real height.
      if(this.hmdPosition.y>.8||this.waited>1.5)this.recentre(false);
    }
    const forward=this.hmdRotation.transformVector(pc.Vec3.FORWARD,this.pending);
    const c=Math.cos(this.turn),s=Math.sin(this.turn),wx=forward.x*c+forward.z*s,wz=-forward.x*s+forward.z*c;
    this.viewYaw=Math.atan2(-wx,-wz);
    return {yaw:this.viewYaw,pitch:-Math.asin(clamp(forward.y,-1,1))};
  }

  /** The player's height and place in the tracking space become the centre: the avatar's eyes are where the head is now. */
  recentre(announce=true):void {
    this.originX=this.hmdPosition.x;this.originZ=this.hmdPosition.z;
    this.refHeight=this.hmdPosition.y>.8?this.hmdPosition.y:DEFAULT_HEIGHT;
    this.calibrated=true;
    if(announce)this.hooks.notice('VR recentralizado na sua posição e altura.');
  }

  /** After the camera code: places the rig so the headset's eyes are at `anchor`, then reads the controllers. */
  endFrame(dt:number,anchor:VrAnchor):void {
    if(!this.active||!this.panels)return;
    // A view that begins (or the very first one): the headset faces the way the game wants to look.
    if(anchor.special!==this.wasSpecial||this.face===undefined&&anchor.faceYaw!==undefined){
      if(anchor.faceYaw!==undefined)this.turn+=wrapped(anchor.faceYaw-this.viewYaw);
      this.wasSpecial=anchor.special;this.face=anchor.faceYaw??0;
    }
    const c=Math.cos(this.turn),s=Math.sin(this.turn);
    const offX=this.originX*c+this.originZ*s,offZ=-this.originX*s+this.originZ*c;
    // The eyes' height follows the avatar's smoothly (the walk bobs the head: a headset must not).
    if(!this.eyeSet||anchor.special||Math.abs(anchor.y-this.eyeY)>1.2){this.eyeY=anchor.y;this.eyeSet=true;}
    else this.eyeY+=(anchor.y-this.eyeY)*ease(6,dt);
    this.root.setLocalEulerAngles(0,this.turn*pc.math.RAD_TO_DEG,0);
    this.root.setPosition(anchor.x-offX,this.eyeY-this.refHeight,anchor.z-offZ);
    this.camera.setLocalPosition(this.hmdPosition);this.camera.setLocalRotation(this.hmdRotation);
    // Walked far from the middle of the play space: the centre follows (a step at a time, never a jump in view).
    const away=Math.hypot(this.hmdPosition.x-this.originX,this.hmdPosition.z-this.originZ);
    if(away>1.4){const k=ease(1.5,dt);this.originX+=(this.hmdPosition.x-this.originX)*k;this.originZ+=(this.hmdPosition.z-this.originZ)*k;}

    const speed=this.anchorBefore&&dt>0&&!anchor.special?Math.hypot(anchor.x-this.anchorBefore.x,anchor.z-this.anchorBefore.z)/dt:0;
    this.anchorBefore={x:anchor.x,z:anchor.z};
    this.control(dt,Math.min(speed,12));
  }

  // ---- Controllers ----

  private pad(hand:Hand|undefined):Pad {
    const source=hand?.source;
    if(!source)return NONE;
    const gamepad=source.gamepad;
    if(!gamepad)return {...NONE,trigger:source.selecting,squeeze:source.squeezing};
    const axes=gamepad.axes,buttons=gamepad.buttons;
    const rawX=axes.length>=4?axes[2]??0:axes[0]??0,rawY=axes.length>=4?axes[3]??0:axes[1]??0;
    const length=Math.hypot(rawX,rawY),scale=length>DEAD_ZONE?(length-DEAD_ZONE)/(1-DEAD_ZONE)/length:0;
    const held=(index:number)=>!!buttons[index]?.pressed;
    return {x:clamp(rawX*scale,-1,1),y:clamp(rawY*scale,-1,1),trigger:held(0)||source.selecting,squeeze:held(1),stick:held(3),a:held(4),b:held(5)};
  }
  /** True once, on the frame a button goes down. */
  private edge(hand:Hand|undefined,name:string,value:boolean):boolean {
    if(!hand)return false;
    const before=hand.down[name]??false;hand.down[name]=value;
    return value&&!before;
  }
  /** A key held for as long as a button is: pressed on the way down, released on the way up. */
  private hold(code:string,on:boolean):void {
    if(on===this.heldKeys.has(code))return;
    if(on){this.heldKeys.add(code);this.hooks.key(code,true);}
    else{this.heldKeys.delete(code);this.hooks.key(code,false);}
  }
  private tap(code:string):void {this.hooks.key(code,true);this.hooks.key(code,false);}
  private releaseKeys():void {for(const code of [...this.heldKeys])this.hold(code,false);}

  private sync():void {
    const xr=this.app.xr;
    if(!xr)return;
    const seen=new Set<string>();
    for(const source of xr.input.inputSources){
      if(source.targetRayMode==='screen'||source.targetRayMode==='gaze')continue;
      const key=source.handedness==='left'||source.handedness==='right'?source.handedness:`other-${source.id}`;
      seen.add(key);
      let hand=this.hands.get(key);
      if(!hand||hand.source!==source){
        if(hand)this.destroyHand(hand);
        hand=this.createHand(source,key);this.hands.set(key,hand);
        if(key==='left')this.panels?.mount(hand.grip);
      }
    }
    for(const [key,hand] of this.hands)if(!seen.has(key)){
      this.destroyHand(hand);this.hands.delete(key);
      if(key==='left')this.panels?.mount(null);
    }
  }
  private createHand(source:pc.XrInputSource,key:string):Hand {
    const grip=new pc.Entity(`VR hand ${key}`);
    const body=new pc.Entity('body');
    // The avatar's own hand follows the controller (BarScene.vrArms), so the controller is only drawn as a small marker.
    body.addComponent('render',{type:'box',material:emissive(key==='left'?[.25,.2,.55]:[.6,.14,.45])});
    body.setLocalScale(.02,.012,.05);body.setLocalPosition(0,0,.06);
    const knob=new pc.Entity('knob');
    knob.addComponent('render',{type:'sphere',material:emissive([1,.85,.4])});
    knob.setLocalScale(.02,.02,.02);knob.setLocalPosition(0,.02,-.02);
    grip.addChild(body);grip.addChild(knob);
    this.root.addChild(grip);
    const ray=new pc.Entity(`VR ray ${key}`);
    const rayMaterial=emissive([.6,.9,1],.8);
    ray.addComponent('render',{type:'box',material:rayMaterial,castShadows:false});
    this.app.root.addChild(ray);
    return {source,grip,ray,rayMaterial,down:{},over:false,armed:true};
  }
  private destroyHand(hand:Hand):void {hand.grip.destroy();hand.ray.destroy();}

  /** Where the wrist of the avatar's hand should be: just behind the palm of the controller in that hand, in the world (null: no controller). */
  wristTarget(handedness:'left'|'right',out:pc.Vec3):pc.Vec3|null {
    return this.handPose(handedness,out,new pc.Vec3(),new pc.Vec3())?out:null;
  }
  /**
   * The pose the avatar's hand copies from the controller in that hand, in the world: the wrist (just behind the palm), where the
   * fingers point (the grip's -Z) and which way the palm faces (the grip's +X for the left hand, -X for the right).
   */
  handPose(handedness:'left'|'right',wrist:pc.Vec3,fingers:pc.Vec3,palm:pc.Vec3):boolean {
    const hand=this.hands.get(handedness);
    if(!this.active||!hand||!hand.source.grip)return false;
    const position=hand.source.getPosition(),rotation=hand.source.getRotation();
    if(!position||!rotation)return false;
    rotation.transformVector(this.pending.set(0,0,.06),wrist).add(position);
    rotation.transformVector(this.pending.set(0,0,-1),fingers);
    rotation.transformVector(this.pending.set(handedness==='left'?1:-1,0,0),palm);
    return true;
  }

  /** A short buzz in a controller: a click, a touch of something that can be pressed. */
  buzz(handedness:'left'|'right',strength:number,ms:number):void {
    const gamepad=this.hands.get(handedness)?.source.gamepad as (Gamepad&{hapticActuators?:Array<{pulse?(value:number,duration:number):Promise<boolean>}>;vibrationActuator?:{playEffect?(type:string,params:object):Promise<unknown>}})|null|undefined;
    try{
      const actuator=gamepad?.hapticActuators?.[0];
      if(actuator?.pulse){void actuator.pulse(strength,ms);return;}
      void gamepad?.vibrationActuator?.playEffect?.('dual-rumble',{duration:ms,strongMagnitude:strength,weakMagnitude:strength});
    }catch{/* No haptics on this controller. */}
  }

  private control(dt:number,speed:number):void {
    const panels=this.panels!,{hooks}=this;
    if(!this.simulated)this.sync();
    const left=this.hands.get('left'),right=this.hands.get('right');
    const L=this.pad(left),R=this.pad(right);
    for(const hand of this.hands.values()){
      const {source,grip}=hand;
      if(source.grip){grip.setLocalPosition(source.getLocalPosition()!);grip.setLocalRotation(source.getLocalRotation()!);}
      grip.enabled=source.grip;
    }
    const windowOpen=hooks.windowOpen();
    const typing=!!this.keyboard?.visible;
    if((windowOpen||typing)&&!panels.isOpen)panels.open(true);
    else if(!windowOpen&&!typing&&panels.isOpen&&panels.wasAutoOpened)panels.close();
    const screen=panels.isOpen;
    const context=hooks.context();
    const vehicle=context==='bike'||context==='car';

    // -- Menu: Y (left) closes a window, or opens and closes the screen; B (right) only closes a window. --
    if(this.edge(left,'y',L.b)){if(windowOpen)this.tap('Escape');else if(screen)panels.close();else panels.open(false);}
    const bDown=this.edge(right,'b',R.b);
    if(bDown){
      if(windowOpen)this.tap('Escape');
      else if(screen)panels.close();
      else if(vehicle)this.tap('KeyH');
      else this.tap('KeyV');
    }

    // -- Lasers --
    let cursor:ScreenHit|null=null,pointed:{id:string;distance:number;vehicle?:true}|undefined,rayLength:Record<string,number>={};
    for(const [key,hand] of this.hands){
      const {source}=hand;
      const origin=source.getOrigin(),direction=source.getDirection();
      const pad=key==='left'?L:key==='right'?R:NONE;
      const hit=screen?panels.rayScreen(origin,direction):null;
      if(hit&&(!cursor||key==='right'))cursor=hit;
      if(screen){
        const pressed=pad.trigger||(key==='right'&&R.a);
        const clickable=panels.laser(key,hit,pressed);
        if(clickable&&!hand.over)this.buzz(key==='left'?'left':'right',.12,18);
        hand.over=clickable;
        if(pressed&&this.edge(hand,'click',true))this.buzz(key==='left'?'left':'right',.45,35);
        else if(!pressed)hand.down.click=false;
        panels.scroll(hit,pad.y*dt*900);
        rayLength[key]=hit?hit.distance:3;
      }else if(key==='right'){
        pointed=hooks.pick(origin,direction,REACH);
        rayLength[key]=pointed?pointed.distance:.22;
        if(Boolean(pointed)!==hand.over){hand.over=!!pointed;if(pointed)this.buzz('right',.15,20);}
      }else rayLength[key]=.0;
      this.drawRay(hand,origin,direction,rayLength[key]??0,!!hit||!!pointed||hand.over);
    }
    panels.showCursor(cursor);

    // -- The world --
    if(screen||windowOpen){
      hooks.move(0,0);this.setSprint(false);this.releaseKeys();
      this.latchedSprint=false;
      if(screen)this.keyboardKeep();
    }else{
      // The left stick walks (steers and gives gas in a vehicle).
      hooks.move(L.x,L.y);
      const moving=Math.hypot(L.x,L.y)>.05;
      if(this.edge(left,'stick',L.stick)&&moving)this.latchedSprint=!this.latchedSprint;
      if(!moving)this.latchedSprint=false;
      if(vehicle){
        this.setSprint(false);
        this.hold('Space',L.squeeze||L.trigger);
        this.hold('KeyF',R.trigger);
        this.hold('ShiftLeft',R.squeeze);
        if(this.edge(left,'x',L.a))this.tap('KeyR');
      }else{
        this.setSprint(this.latchedSprint||L.squeeze);
        this.hold('Space',false);this.hold('KeyF',false);
        this.hold('ShiftLeft',context==='horse'&&(this.latchedSprint||L.squeeze));
        if(this.edge(left,'x',L.a))this.tap('KeyK');
        if(this.edge(left,'trigger',L.trigger))this.tap('KeyT');
        if(this.edge(right,'squeeze',R.squeeze))this.tap('KeyG');
      }
      if(this.edge(right,'a',R.a))this.tap('KeyE');
      if(!vehicle&&this.edge(right,'trigger',R.trigger)){
        if(pointed)hooks.menu(pointed.id,window.innerWidth/2,window.innerHeight/2,pointed.vehicle);else this.tap('KeyE');
      }
      if(vehicle)this.edge(right,'trigger',R.trigger);
      // The right stick turns: in steps (a push and a return), or smoothly.
      const amount=R.x;
      if(this.settings.turn==='smooth'){
        this.turn-=amount*TURN_RATE*dt;
        this.pulse=Math.max(this.pulse,Math.abs(amount)*.7);
      }else if(right){
        if(Math.abs(R.x)<SNAP_ARM)right.armed=true;
        else if(right.armed&&Math.abs(R.x)>SNAP_FIRE){
          right.armed=false;
          this.turn-=Math.sign(R.x)*this.settings.snapDegrees*pc.math.DEG_TO_RAD;
          this.pulse=1;this.buzz('right',.2,18);
        }
      }
      if(this.edge(right,'stick',R.stick))this.recentre();
    }
    if(screen&&this.edge(right,'stick',R.stick))this.recentre();

    // -- Comfort: a ring closes in while the view moves or turns. --
    const target=this.settings.comfort?clamp(speed/4.5,0,1)*.9:0;
    this.moving+=(target-this.moving)*ease(target>this.moving?6:3,dt);
    this.pulse=Math.max(0,this.pulse-dt*3.2);
    const level=Math.max(this.moving,this.pulse*.85*(this.settings.comfort?1:0));
    if(this.comfort){
      this.comfort.entity.enabled=level>.02&&this.comfort.ready;
      if(level>.02){
        this.comfort.alpha=Math.min(1,level*1.5);
        const size=1.9-.75*level;
        this.comfort.entity.setLocalScale(size,size,1);
      }
    }

    // -- Panels --
    panels.names(hooks.names(10),this.camera.getPosition());
    const forward=this.hmdRotation.transformVector(pc.Vec3.FORWARD,new pc.Vec3());
    const watchRaised=this.watchRaised(left);
    panels.update(performance.now()/1000,dt,{x:this.hmdPosition.x,y:this.hmdPosition.y,z:this.hmdPosition.z,yaw:Math.atan2(forward.x,forward.z)},watchRaised);
  }
  /** While a stick is held the keyboard of the screen stays out of the way; here only a hook for later layouts. */
  private keyboardKeep():void {}
  private setSprint(on:boolean):void {
    if(on===this.sprinting)return;
    this.sprinting=on;this.hooks.sprint(on);
  }

  /** The left controller's face is toward the eyes and near them. */
  private watchRaised(left:Hand|undefined):boolean {
    if(!left||!left.source.grip)return false;
    const grip=left.grip;
    const position=grip.getPosition(),eye=this.camera.getPosition();
    const toEye=new pc.Vec3().sub2(eye,position),distance=toEye.length();
    if(distance>.8||distance<.08)return false;
    const normal=grip.getRotation().transformVector(pc.Vec3.UP,new pc.Vec3());
    return normal.dot(toEye.mulScalar(1/distance))>.5;
  }

  private drawRay(hand:Hand,origin:pc.Vec3,direction:pc.Vec3,length:number,hot:boolean):void {
    const {ray,rayMaterial}=hand;
    ray.enabled=length>.01&&hand.source.grip;
    if(!ray.enabled)return;
    const middle=new pc.Vec3().copy(direction).mulScalar(length/2).add(origin);
    ray.setPosition(middle);
    ray.lookAt(new pc.Vec3().copy(middle).add(direction));
    ray.setLocalScale(hot?.006:.003,hot?.006:.003,length);
    const color=hot?[1,.35,.8]:[.6,.9,1];
    if(rayMaterial.emissive.r!==color[0]||rayMaterial.emissive.g!==color[1]){rayMaterial.emissive.set(color[0]!,color[1]!,color[2]!);rayMaterial.update();}
  }

  // ---- The comfort ring ----

  private comfortMesh():pc.Mesh {
    const mesh=new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions([-.5,.5,0,.5,.5,0,.5,-.5,0,-.5,-.5,0]);
    mesh.setNormals([0,0,1,0,0,1,0,0,1,0,0,1]);
    mesh.setUvs(0,[0,1,1,1,1,0,0,0]);
    mesh.setIndices([0,2,1,0,3,2]);
    mesh.update();
    return mesh;
  }
  private drawComfort():void {
    const panel=this.comfort;
    if(!panel)return;
    const canvas=panel.canvas;canvas.width=canvas.height=256;
    const g=panel.context.createRadialGradient(128,128,0,128,128,128);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,'rgba(0,0,0,0)');g.addColorStop(.78,'rgba(0,0,0,.85)');g.addColorStop(1,'rgba(0,0,0,1)');
    panel.context.fillStyle=g;panel.context.fillRect(0,0,256,256);
    panel.upload();
  }

  telemetry() {
    const p=this.root.getPosition();
    return {active:this.active,turn:+this.turn.toFixed(3),viewYaw:+this.viewYaw.toFixed(3),height:+this.refHeight.toFixed(3),root:[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)],
      hands:[...this.hands.keys()],screen:this.panels?.isOpen??false,keyboard:this.keyboard?.visible??false};
  }
}
