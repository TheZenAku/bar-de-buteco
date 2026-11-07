import {isCar,isTruck,type MotoState} from '@bar/shared';
import {placeListener} from './moto-sound';
type Point={x:number;y:number;z:number};
export interface BrakeAudioView extends Point {state:MotoState;speed:number;lateralSpeed:number;held:boolean}
export const BRAKE_CLIPS=['aciona','solta','pneu'] as const;
type Clip=typeof BRAKE_CLIPS[number];
const REACH=70,MAX_VOICES=6;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
/** Acceleration and the service brake never trigger this layer. No tire squeal at rest. */
export function brakeMix(held:boolean,speed:number,lateralSpeed:number,model?:string){
  const motion=Math.hypot(speed,lateralSpeed),level=held&&motion>.65?(.08+.47*clamp((motion-.65)/10,0,1)):0;
  return {level:level*(isTruck({model})?1.05:isCar({model})?1:.7),rate:(isTruck({model})?.9:isCar({model})?1:1.12)*(.96+.06*clamp(motion/15,0,1))};
}
interface Sound {source:AudioBufferSourceNode;gain:GainNode;clip:Clip}
interface Voice {panner:PannerNode;held:boolean;shot?:Sound;skid?:Sound;pending?:{clip:Clip;until:number};level:number}

/** Shared positional brake audio for every vehicle, using predicted Space locally and the room's state for observers. */
export class VehicleBrakeSounds {
  private context?:AudioContext;
  private bus?:GainNode;
  private readonly buffers=new Map<Clip,AudioBuffer>();
  private readonly voices=new Map<string,Voice>();
  private readonly played:{id:string;clip:Clip}[]=[];
  private readonly errors:Clip[]=[];
  private destroyed=false;
  private readonly unlock=()=>{void this.context?.resume().catch(()=>{});};
  private readonly visibility=()=>{if(this.context&&this.bus)this.bus.gain.setTargetAtTime(this.level(),this.context.currentTime,.025);};
  constructor(private readonly volume:()=>number,private readonly base:string){
    for(const event of ['pointerdown','keydown'])window.addEventListener(event,this.unlock);
    document.addEventListener('visibilitychange',this.visibility);
  }
  private level(){return document.hidden?0:clamp(this.volume(),0,1);}
  private graph(){
    if(this.context)return this.context;
    if(this.destroyed||navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    const context=this.context=new AudioContext(),limiter=context.createDynamicsCompressor();
    limiter.threshold.value=-8;limiter.ratio.value=5;limiter.attack.value=.005;limiter.release.value=.15;
    this.bus=context.createGain();this.bus.gain.value=this.level();this.bus.connect(limiter).connect(context.destination);
    for(const clip of BRAKE_CLIPS)void fetch(`${this.base}veiculos/sound/${clip}.wav`).then(response=>{if(!response.ok)throw Error(`HTTP ${response.status}`);return response.arrayBuffer();})
      .then(data=>context.decodeAudioData(data)).then(buffer=>{if(!this.destroyed)this.buffers.set(clip,buffer);})
      .catch(error=>{if(!this.destroyed){this.errors.push(clip);console.warn(`vehicle brake: ${clip}`,error);}});
    return context;
  }
  private release(sound:Sound|undefined){if(!sound||!this.context)return;const now=this.context.currentTime;sound.gain.gain.setTargetAtTime(0,now,.02);sound.source.stop(now+.09);}
  private play(id:string,voice:Voice,clip:Clip,loop=false):Sound|undefined{
    const buffer=this.buffers.get(clip),context=this.context;if(!buffer||!context)return;
    const source=context.createBufferSource(),gain=context.createGain(),sound={source,gain,clip};
    source.buffer=buffer;source.loop=loop;gain.gain.value=0;source.connect(gain).connect(voice.panner);
    source.onended=()=>{source.disconnect();gain.disconnect();if(voice.shot===sound)voice.shot=undefined;};source.start();
    this.played.push({id,clip});if(this.played.length>32)this.played.shift();return sound;
  }
  private remove(voice:Voice){this.release(voice.skid);this.release(voice.shot);setTimeout(()=>voice.panner.disconnect(),150);}
  update(vehicles:readonly BrakeAudioView[],ear:Point,forward:Point,up:Point){
    if(this.destroyed)return;
    const away=(v:Point)=>Math.hypot(v.x-ear.x,v.y-ear.y,v.z-ear.z),close=vehicles.filter(v=>away(v)<REACH);
    const context=this.context??(close.length?this.graph():undefined);if(!context||!this.bus)return;
    this.bus.gain.setTargetAtTime(this.level(),context.currentTime,.03);placeListener(context,ear.x,ear.y,ear.z,forward,up);
    const hot=close.filter(v=>v.held||this.voices.has(v.state.id)).sort((a,b)=>away(a)-away(b)).slice(0,MAX_VOICES),keep=new Set<string>();
    for(const view of hot){
      const id=view.state.id;let voice=this.voices.get(id);
      if(!voice){const panner=context.createPanner();panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=5;panner.rolloffFactor=1.4;panner.maxDistance=REACH;panner.connect(this.bus);voice={panner,held:false,level:0};this.voices.set(id,voice);}
      if(view.held!==voice.held){
        voice.pending={clip:view.held?'aciona':'solta',until:context.currentTime+1.2};voice.held=view.held;
      }
      if(voice.pending){
        if(voice.pending.until<context.currentTime)voice.pending=undefined;
        else if(this.buffers.has(voice.pending.clip)){
          this.release(voice.shot);voice.shot=this.play(id,voice,voice.pending.clip);
          voice.shot?.gain.gain.setTargetAtTime(isCar(view.state)?.9:.6,context.currentTime,.005);voice.pending=undefined;
        }
      }
      const mix=brakeMix(view.held,view.speed,view.lateralSpeed,view.state.model);voice.level=mix.level;
      if(mix.level>0){
        voice.skid??=this.play(id,voice,'pneu',true);
        voice.skid?.gain.gain.setTargetAtTime(mix.level,context.currentTime,.04);voice.skid?.source.playbackRate.setTargetAtTime(mix.rate,context.currentTime,.1);
      }else if(voice.skid){this.release(voice.skid);voice.skid=undefined;}
      voice.panner.positionX.value=view.x;voice.panner.positionY.value=view.y+.35;voice.panner.positionZ.value=view.z;
      if(view.held||voice.shot||voice.pending)keep.add(id);
    }
    for(const [id,voice] of this.voices)if(!keep.has(id)){this.remove(voice);this.voices.delete(id);}
  }
  telemetry(id?:string){const v=id?this.voices.get(id):undefined;return {state:this.context?.state??'',ready:this.buffers.size,errors:[...this.errors],playing:this.voices.size,played:[...this.played],voice:v?{held:v.held,skidding:!!v.skid,level:v.level,clip:v.shot?.clip??''}:undefined};}
  destroy(){this.destroyed=true;for(const event of ['pointerdown','keydown'])window.removeEventListener(event,this.unlock);document.removeEventListener('visibilitychange',this.visibility);for(const voice of this.voices.values())this.remove(voice);this.voices.clear();this.buffers.clear();void this.context?.close().catch(()=>{});}
}
