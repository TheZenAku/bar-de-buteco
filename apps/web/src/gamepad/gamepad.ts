/**
 * Gamepads (docs/sistemas/controle.md): the browser's standard mapping read once a frame, with a radial dead zone on each stick, a response curve
 * and an acceleration ramp for looking, button edges and hold times, and the rumble. The game had no pad outside VR: the mapper below presses the
 * same keys the keyboard does (and the made-up codes the touch overlay uses), feeds the left stick to the scene's touch axis, and calls the
 * weapons directly. Pure where it can be: the reader takes `navigator.getGamepads()`'s list, so it runs in Node tests.
 */

/** The standard mapping's buttons, in Xbox names. */
export const PAD={A:0,B:1,X:2,Y:3,LB:4,RB:5,LT:6,RT:7,VIEW:8,START:9,L3:10,R3:11,UP:12,DOWN:13,LEFT:14,RIGHT:15} as const;
export type PadButton=typeof PAD[keyof typeof PAD];

export interface Stick {x:number;y:number;m:number}
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
/**
 * A radial dead zone: inside `inner` nothing; from there to `outer` the push is rescaled to 0-1, so the first millimetres past the dead zone are
 * not lost and the rim reaches 1 even on a worn stick. Direction is kept (no square dead zone snapping to the axes).
 */
export function radial(x:number,y:number,inner=.12,outer=.98):Stick {
  const length=Math.hypot(x,y);
  if(!Number.isFinite(length)||length<=inner)return {x:0,y:0,m:0};
  const m=clamp((length-inner)/(outer-inner),0,1);
  return {x:x/length*m,y:y/length*m,m};
}
/** The look's response: small pushes fine, the rim fast (power > 1). */
export const lookCurve=(m:number,power:number)=>Math.pow(clamp(m,0,1),clamp(power,1,3));

/** How the right stick turns the view: radians per second at full push, sideways and up and down. */
export interface PadLookFeel {yawSpeed:number;pitchSpeed:number;curve:number;invertY:boolean}
export const DEFAULT_LOOK_FEEL:PadLookFeel={yawSpeed:3.2,pitchSpeed:2.2,curve:1.8,invertY:false};
// Held at the rim outside aiming, the turn speeds up to this much over this long (s); under this push it drops back at once.
const RAMP_MOST=1.6,RAMP_TIME=.4,RAMP_FROM=.95;
/**
 * The view's turn this frame from the right stick, in the rig's angles (CameraRig.look: yaw up turns left, pitch up looks down). `scale` slows it
 * (aiming: the zoom; friction); `ramp` is the acceleration state, carried from frame to frame.
 */
export function stickLook(stick:Stick,dt:number,feel:PadLookFeel,scale:number,ramp:number,aiming:boolean):{yaw:number;pitch:number;ramp:number} {
  if(!stick.m)return {yaw:0,pitch:0,ramp:0};
  const nextRamp=!aiming&&stick.m>=RAMP_FROM?Math.min(1,ramp+dt/RAMP_TIME):0;
  const speed=lookCurve(stick.m,feel.curve)/stick.m*scale*(1+(RAMP_MOST-1)*nextRamp*nextRamp);
  return {yaw:-stick.x*speed*feel.yawSpeed*dt,pitch:(feel.invertY?-1:1)*stick.y*speed*feel.pitchSpeed*dt,ramp:nextRamp};
}

/** One frame of a pad: sticks after their dead zones, triggers 0-1, buttons with their edges. */
export interface PadFrame {
  id:string;left:Stick;right:Stick;lt:number;rt:number;
  down(button:PadButton):boolean;
  /** Pressed or let go this frame. */
  pressed(button:PadButton):boolean;released(button:PadButton):boolean;
  /** How long it has been held (ms; 0 if not down), and how long it was held when let go this frame. */
  heldFor(button:PadButton):number;heldWas(button:PadButton):number;
  /** Anything pushed or pressed: the pad is the device in use. */
  active:boolean;
}
type PadLike={id:string;connected:boolean;mapping:string;buttons:readonly {pressed:boolean;value:number}[];axes:readonly number[]}|null;
// A trigger counts as pressed past this pull.
const TRIGGER_DOWN=.35,TRIGGER_UP=.25;

export class PadReader {
  private before:boolean[]=[];
  private since:number[]=[];
  private index=-1;
  /** The first connected pad (standard mapping preferred), read at `now`; undefined when there is none. */
  read(pads:readonly PadLike[]|undefined|null,now:number,inner=.12):PadFrame|undefined {
    const list=pads?Array.from(pads):[];
    let pad=this.index>=0?list[this.index]:null;
    if(!pad?.connected){
      this.index=list.findIndex(item=>item?.connected&&item.mapping==='standard');
      if(this.index<0)this.index=list.findIndex(item=>item?.connected);
      pad=this.index>=0?list[this.index]:null;
      this.before=[];this.since=[];
    }
    if(!pad?.connected)return undefined;
    const value=(i:number)=>pad!.buttons[i]?.value??0;
    const lt=value(PAD.LT),rt=value(PAD.RT);
    const down=pad.buttons.map((button,i)=>i===PAD.LT||i===PAD.RT?(value(i)>=(this.before[i]?TRIGGER_UP:TRIGGER_DOWN)):button.pressed);
    const was=this.before,since=this.since,held:number[]=[];
    for(let i=0;i<down.length;i++){
      if(down[i]&&!was[i])since[i]=now;
      held[i]=was[i]&&!down[i]?now-(since[i]??now):0;
    }
    this.before=down;
    const axis=(i:number)=>{const v=pad!.axes[i]??0;return Number.isFinite(v)?v:0;};
    const left=radial(axis(0),axis(1),inner),right=radial(axis(2),axis(3),inner);
    return {
      id:pad.id,left,right,lt,rt,
      down:button=>!!down[button],
      pressed:button=>!!down[button]&&!was[button],
      released:button=>!down[button]&&!!was[button],
      heldFor:button=>down[button]?now-(since[button]??now):0,
      heldWas:button=>held[button]??0,
      active:left.m>0||right.m>0||lt>.2||rt>.2||down.some(Boolean),
    };
  }
}

/** A key pressed again and again while a direction is held (menus): once at once, then after a pause, then steadily. */
export class Repeater {
  private at=new Map<string,number>();
  /** Whether `key` (held: `on`) fires this frame. */
  step(key:string,on:boolean,now:number,first=380,every=110):boolean {
    if(!on){this.at.delete(key);return false;}
    const next=this.at.get(key);
    if(next===undefined){this.at.set(key,now+first);return true;}
    if(now>=next){this.at.set(key,now+every);return true;}
    return false;
  }
  clear():void {this.at.clear();}
}

/** A rumble: light on the player's own shots, strong when hit. */
export function rumble(pad:unknown,kind:'shot'|'hit'|'heavy'):void {
  const actuator=(pad as {vibrationActuator?:{playEffect?(type:string,params:object):Promise<unknown>}}|null)?.vibrationActuator;
  if(!actuator?.playEffect)return;
  const effect=kind==='shot'?{duration:45,weakMagnitude:.35,strongMagnitude:.1}:kind==='heavy'?{duration:90,weakMagnitude:.5,strongMagnitude:.45}:{duration:220,weakMagnitude:.6,strongMagnitude:.95};
  void actuator.playEffect('dual-rumble',{startDelay:0,...effect}).catch(()=>{});
}
