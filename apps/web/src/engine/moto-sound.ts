import {MOTO,MOTO_ENGINE,readMotoParts} from '@bar/shared';

/**
 * The bikes' engines, each heard from where it is (tools/assets/import-moto-sounds.mjs cuts the clips). Two loops always in step with the
 * bike, idle and riding, the second played faster as it goes faster; over them the clips of what just happened. What happens comes from the
 * room's state, so everyone hears the same bike: starting or failing to (`engine`, `engineAt`, `crank`), the throttle (`gas`), the speed.
 */
export const MOTO_CLIPS=['liga','desliga','idle','acelerando','parando','falha-1','falha-2','falha-3','falha-4'] as const;
export type MotoClip=typeof MOTO_CLIPS[number];
/** How loud it is from this close (metres), how fast that falls, and past where nothing plays. */
const REF_DISTANCE=6,ROLLOFF=1.3,AUDIBLE=85;
/** How many bikes run their loops at once: the nearest ones. */
const VOICES=4;
/** How fast the throttle reaches the sound (per second), opening and closing. */
const OPEN=9,CLOSE=6;
/** Letting go above this share of top speed, with the throttle having been open: the revs falling (parando). */
const COAST_FROM=.22,COAST_AGAIN_MS=1500;
/** How long `parando` covers the riding loop before handing back to it (s), and how long that takes. */
const COAST_HOLD=2.4,COAST_FADE=1.2;
const BUS=1.3;

export interface EngineView {engine:number;engineAt:number;crank:number;gas:boolean;speed:number;parts:string}
/**
 * The loops for this moment. `load` is the throttle after smoothing (0..1), `rev` the speed as a share of top speed. Pure, and in one place:
 * this is the sound of the bike. A rider's own rate tops out above the recording, which is about where the take's revs are at 1.
 */
export function engineMix(running:boolean,load:number,rev:number):{idle:number;idleRate:number;drive:number;driveRate:number} {
  if(!running)return {idle:0,idleRate:1,drive:0,driveRate:.6};
  const moving=Math.max(load,Math.min(1,rev*1.6));
  return {
    idle:Math.max(0,1-1.25*moving),idleRate:1+.08*load,
    drive:Math.min(1,load*(.55+.45*rev)+rev*.32),driveRate:.6+.46*rev+.1*load,
  };
}
/** The clip a change of the engine calls for: starting (or failing to) and stopping. Failing ends by itself. */
export function engineClip(before:Pick<EngineView,'engine'>,now:Pick<EngineView,'engine'|'crank'>):MotoClip|undefined {
  if(now.engine===before.engine)return;
  if(now.engine===MOTO_ENGINE.CRANKING)return now.crank?`falha-${now.crank}` as MotoClip:'liga';
  if(now.engine===MOTO_ENGINE.OFF&&before.engine===MOTO_ENGINE.ON)return 'desliga';
}
/** A tired engine does not hold its note: 1 with the motor sound, down to about .4 on dips that come and go. */
export function roughness(motor:number,time:number):number {
  if(motor>=50)return 1;
  const dip=Math.sin(time*5.3)*Math.sin(time*8.9+.7);
  return dip>.35?1-(1-motor/50)*.6:1;
}

interface Loop {source:AudioBufferSourceNode;gain:GainNode}
interface Shot {source:AudioBufferSourceNode;gain:GainNode;clip:MotoClip;endsAt:number}

class EngineVoice {
  readonly panner:PannerNode;
  private idle?:Loop;
  private drive?:Loop;
  private shot?:Shot;
  private load=0;
  private seen?:EngineView;
  private coastAt=-Infinity;
  /** `parando` covers the riding loop: 1 while it does. */
  private coast=0;
  private coastLeft=0;
  mix=engineMix(false,0,0);

  constructor(private readonly bank:MotoSoundBank,private readonly context:AudioContext,bus:AudioNode) {
    this.panner=context.createPanner();
    this.panner.panningModel='equalpower';this.panner.distanceModel='inverse';this.panner.refDistance=REF_DISTANCE;this.panner.rolloffFactor=ROLLOFF;this.panner.maxDistance=AUDIBLE*2;
    this.panner.connect(bus);
  }
  private startLoop(clip:MotoClip):Loop|undefined {
    const buffer=this.bank.buffer(clip);
    if(!buffer)return;
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;source.loop=true;gain.gain.value=0;
    source.connect(gain).connect(this.panner);
    // Not every bike's beat together, starting mid-take.
    source.start(0,Math.random()*buffer.duration);
    return {source,gain};
  }
  private stopLoop(loop:Loop|undefined):void {if(!loop)return;loop.source.stop();loop.source.disconnect();loop.gain.disconnect();}
  private play(clip:MotoClip):void {
    const buffer=this.bank.buffer(clip);
    this.bank.note(clip);
    this.cut(.05);
    if(!buffer)return;
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;source.connect(gain).connect(this.panner);source.start();
    const shot={source,gain,clip,endsAt:this.context.currentTime+buffer.duration};
    source.onended=()=>{if(this.shot===shot)this.shot=undefined;gain.disconnect();};
    this.shot=shot;
  }
  private cut(fade:number):void {
    const shot=this.shot;
    if(!shot)return;
    const at=this.context.currentTime;
    shot.gain.gain.setTargetAtTime(0,at,fade/3);shot.source.stop(at+fade);
    this.shot=undefined;
  }
  /** One frame. `hot`: among the nearest, its loops run. `gasNow`: the rider's own key, ahead of the room. */
  update(view:EngineView,dt:number,hot:boolean,gasNow:boolean|undefined,time:number):void {
    const before=this.seen,running=view.engine===MOTO_ENGINE.ON,gas=running&&(gasNow??view.gas);
    if(before&&before.engineAt!==view.engineAt){
      const clip=engineClip(before,view);
      if(clip)this.play(clip);
      // Got off in the middle of a try: the starter stops with the hand.
      else if(this.shot?.clip.startsWith('falha')&&this.shot.endsAt-this.context.currentTime>.3)this.cut(.12);
    }
    const rev=Math.min(1,Math.abs(view.speed)/MOTO.TOP_SPEED);
    if(gas&&this.shot?.clip==='parando'){this.cut(.15);this.coast=0;}
    if(!gas&&before&&this.load>.5&&rev>COAST_FROM&&running&&performance.now()-this.coastAt>COAST_AGAIN_MS){
      this.coastAt=performance.now();this.play('parando');this.coast=1;this.coastLeft=COAST_HOLD;
    }
    if(this.coastLeft>0)this.coastLeft-=dt;
    else if(this.coast>0)this.coast=Math.max(0,this.coast-dt/COAST_FADE);
    this.load+=((gas?1:0)-this.load)*(1-Math.exp(-(gas?OPEN:CLOSE)*dt));
    const mix=this.mix=engineMix(running,this.load,rev);
    this.seen=view;
    if(hot&&running){this.idle??=this.startLoop('idle');this.drive??=this.startLoop('acelerando');}
    else if(!running||!hot){
      // Faded out by the gains below first; stopped when silent, which also frees the far bikes' voices.
      if(this.idle&&this.idle.gain.gain.value<.002){this.stopLoop(this.idle);this.idle=undefined;}
      if(this.drive&&this.drive.gain.gain.value<.002){this.stopLoop(this.drive);this.drive=undefined;}
    }
    const parts=readMotoParts(view.parts),rough=roughness(parts.motor,time),loud=parts.escapamento<35?1.3:1,at=this.context.currentTime;
    const smooth=.04;
    // `liga` carries the first moments itself: the idle comes in under it.
    const under=this.shot?.clip==='liga'?.45:1;
    if(this.idle){this.idle.gain.gain.setTargetAtTime((hot?mix.idle*(1-this.coast):0)*under*rough*loud,at,running?.12:smooth);this.idle.source.playbackRate.setTargetAtTime(mix.idleRate,at,.08);}
    if(this.drive){this.drive.gain.gain.setTargetAtTime((hot?mix.drive*(1-this.coast):0)*rough*loud,at,running?.1:smooth);this.drive.source.playbackRate.setTargetAtTime(mix.driveRate,at,.1);}
  }
  place(x:number,y:number,z:number):void {
    const {panner}=this;
    if(panner.positionX){panner.positionX.value=x;panner.positionY.value=y;panner.positionZ.value=z;}
    else panner.setPosition(x,y,z);
  }
  telemetry() {
    return {clip:this.shot?.clip??'',loops:!!this.idle&&!!this.drive,idle:+(this.idle?.gain.gain.value??0).toFixed(3),drive:+(this.drive?.gain.gain.value??0).toFixed(3),rate:+(this.drive?.source.playbackRate.value??0).toFixed(3),load:+this.load.toFixed(2),coast:+this.coast.toFixed(2)};
  }
  destroy():void {
    this.cut(.05);this.stopLoop(this.idle);this.stopLoop(this.drive);this.idle=this.drive=undefined;
    setTimeout(()=>this.panner.disconnect(),200);
  }
}

/** The clips, downloaded once the first bike is near enough to matter, and the bus they all go through. */
class MotoSoundBank {
  private readonly buffers=new Map<MotoClip,AudioBuffer>();
  private loading=false;
  /** The last clips played, oldest first (tests and telemetry). */
  readonly played:string[]=[];
  constructor(private readonly context:AudioContext,private readonly base:string) {}
  buffer(clip:MotoClip):AudioBuffer|undefined {return this.buffers.get(clip);}
  load():void {
    if(this.loading)return;
    this.loading=true;
    for(const clip of MOTO_CLIPS)void fetch(`${this.base}moto/sound/${clip}.wav`).then(response=>response.arrayBuffer()).then(data=>this.context.decodeAudioData(data)).then(buffer=>this.buffers.set(clip,buffer)).catch(error=>console.warn(`moto: som ${clip} indisponível`,error));
  }
  get ready():number {return this.buffers.size;}
  note(clip:MotoClip):void {this.played.push(clip);if(this.played.length>24)this.played.shift();}
}

export class MotoSounds {
  private context?:AudioContext;
  private bus?:GainNode;
  private bank?:MotoSoundBank;
  private readonly voices=new Map<string,EngineVoice>();
  private time=0;
  private readonly unlock=()=>{void this.context?.resume().catch(()=>{});};
  /** `volume`: the player's master volume (settings). `base`: where the site's public files are. */
  constructor(private readonly volume:()=>number,private readonly base:string) {
    for(const event of ['pointerdown','keydown'])window.addEventListener(event,this.unlock);
    document.addEventListener('visibilitychange',this.hidden);
  }
  /** A hidden tab draws no frames: nothing would fade or stop the engines there. */
  private readonly hidden=()=>{if(this.context&&this.bus)this.bus.gain.setTargetAtTime(document.hidden?0:this.level(),this.context.currentTime,.05);};
  private level():number {return BUS*Math.max(0,Math.min(1,this.volume()));}
  private graph():AudioContext|undefined {
    if(this.context)return this.context;
    // Before the player's first click or key the browser would refuse it, and complain: entering the bar always is one.
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{
      const context=this.context=new AudioContext();
      this.bank=new MotoSoundBank(context,this.base);this.bank.load();
      // Several engines at once must not clip.
      const limiter=context.createDynamicsCompressor();limiter.threshold.value=-10;limiter.ratio.value=6;
      this.bus=context.createGain();this.bus.gain.value=this.level();
      this.bus.connect(limiter).connect(context.destination);
      return context;
    }catch{return;}
  }
  /** The ear is the camera: `forward` and `up` as it looks. */
  listen(context:AudioContext,x:number,y:number,z:number,forward:{x:number;y:number;z:number},up:{x:number;y:number;z:number}):void {
    const l=context.listener;
    if(l.positionX){l.positionX.value=x;l.positionY.value=y;l.positionZ.value=z;l.forwardX.value=forward.x;l.forwardY.value=forward.y;l.forwardZ.value=forward.z;l.upX.value=up.x;l.upY.value=up.y;l.upZ.value=up.z;}
    else{l.setPosition(x,y,z);l.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);}
  }
  update(dt:number,bikes:readonly {id:string;view:EngineView;x:number;y:number;z:number;gasNow?:boolean}[],ear:{x:number;y:number;z:number},forward:{x:number;y:number;z:number},up:{x:number;y:number;z:number}):void {
    this.time+=dt;
    if(!bikes.length&&!this.voices.size)return;
    const context=this.graph();
    if(!context||!this.bus)return;
    this.bus.gain.setTargetAtTime(document.hidden?0:this.level(),context.currentTime,.1);
    this.listen(context,ear.x,ear.y,ear.z,forward,up);
    const away=(bike:{x:number;y:number;z:number})=>Math.hypot(bike.x-ear.x,bike.y-ear.y,bike.z-ear.z);
    const near=bikes.filter(bike=>bike.view.engine===MOTO_ENGINE.ON&&away(bike)<AUDIBLE).sort((a,b)=>away(a)-away(b)).slice(0,VOICES);
    for(const bike of bikes){
      let voice=this.voices.get(bike.id);
      if(!voice){voice=new EngineVoice(this.bank!,context,this.bus);this.voices.set(bike.id,voice);}
      voice.place(bike.x,bike.y,bike.z);
      voice.update(bike.view,dt,near.includes(bike),bike.gasNow,this.time);
    }
    for(const [id,voice] of this.voices)if(!bikes.some(bike=>bike.id===id)){voice.destroy();this.voices.delete(id);}
  }
  telemetry(id?:string) {
    return {state:this.context?.state??'',ready:this.bank?.ready??0,played:[...(this.bank?.played??[])],voice:id?this.voices.get(id)?.telemetry():undefined,listener:this.voices.size};
  }
  destroy():void {
    for(const event of ['pointerdown','keydown'])window.removeEventListener(event,this.unlock);
    document.removeEventListener('visibilitychange',this.hidden);
    for(const voice of this.voices.values())voice.destroy();
    this.voices.clear();
    void this.context?.close().catch(()=>{});
  }
}
