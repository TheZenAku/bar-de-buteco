import {HORSE} from '@bar/shared';
import {placeListener} from './moto-sound';

const AUDIBLE=45,VOICES=4,FADE=.06;
interface Position {x:number;y:number;z:number}
export interface HorseSoundView extends Position {id:string;speed:number;animation?:string}
interface Voice {source:AudioBufferSourceNode;gain:GainNode;panner:PannerNode}

/** One recorded gallop cycle, played from each nearby horse with the rider's cadence. */
export class HorseSounds {
  private context?:AudioContext;
  private bus?:GainNode;
  private buffer?:AudioBuffer;
  private loading=false;
  private destroyed=false;
  private readonly voices=new Map<string,Voice>();
  private readonly unlock=()=>{void this.context?.resume().catch(()=>{});};
  private readonly hidden=()=>{
    if(document.hidden)this.clear();
    if(this.bus&&this.context)this.bus.gain.setTargetAtTime(document.hidden?0:this.level(),this.context.currentTime,.02);
  };
  constructor(private readonly volume:()=>number,private readonly base:string) {
    for(const event of ['pointerdown','keydown'])window.addEventListener(event,this.unlock);
    document.addEventListener('visibilitychange',this.hidden);
  }
  private level():number {return Math.max(0,Math.min(1,this.volume()));}
  private graph():AudioContext|undefined {
    if(this.context)return this.context;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{
      const context=this.context=new AudioContext(),limiter=context.createDynamicsCompressor();
      limiter.threshold.value=-10;limiter.ratio.value=6;
      this.bus=context.createGain();this.bus.gain.value=this.level();
      this.bus.connect(limiter).connect(context.destination);
      return context;
    }catch{return;}
  }
  private load(context:AudioContext):void {
    if(this.loading)return;
    this.loading=true;
    void fetch(`${this.base}mounts/sound/gallop.wav`).then(response=>{
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(data=>context.decodeAudioData(data)).then(buffer=>{
      if(!this.destroyed)this.buffer=buffer;
    }).catch(error=>{if(!this.destroyed)console.warn('Cavalo: som de galope indisponível.',error);});
  }
  private stop(id:string):void {
    const voice=this.voices.get(id),context=this.context;
    if(!voice||!context)return;
    voice.gain.gain.cancelScheduledValues(context.currentTime);
    voice.gain.gain.setTargetAtTime(0,context.currentTime,FADE/3);
    voice.source.stop(context.currentTime+FADE);
    this.voices.delete(id);
  }
  private clear():void {for(const id of this.voices.keys())this.stop(id);}
  update(horses:readonly HorseSoundView[],ear:Position,forward:Position,up:Position):void {
    if(this.destroyed)return;
    const distance=(horse:Position)=>Math.hypot(horse.x-ear.x,horse.y-ear.y,horse.z-ear.z);
    const near=document.hidden?[]:horses.filter(horse=>horse.animation==='horse-gallop'&&horse.speed>.35&&distance(horse)<AUDIBLE)
      .sort((a,b)=>distance(a)-distance(b)).slice(0,VOICES);
    for(const id of this.voices.keys())if(!near.some(horse=>horse.id===id))this.stop(id);
    if(!near.length&&!this.context)return;
    const context=this.context??(near.length&&this.level()>0?this.graph():undefined);
    if(!context||!this.bus)return;
    const at=context.currentTime;
    this.bus.gain.setTargetAtTime(document.hidden?0:this.level(),at,.03);
    placeListener(context,ear.x,ear.y,ear.z,forward,up);
    if(!near.length)return;
    this.load(context);
    if(!this.buffer)return;
    for(const horse of near){
      let voice=this.voices.get(horse.id);
      if(!voice){
        const source=context.createBufferSource(),gain=context.createGain(),panner=context.createPanner();
        source.buffer=this.buffer;source.loop=true;gain.gain.value=0;
        panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=4;panner.rolloffFactor=1.4;panner.maxDistance=AUDIBLE;
        source.connect(gain).connect(panner).connect(this.bus);
        source.onended=()=>{source.disconnect();gain.disconnect();panner.disconnect();};
        source.start();voice={source,gain,panner};this.voices.set(horse.id,voice);
      }
      voice.panner.positionX.value=horse.x;voice.panner.positionY.value=horse.y;voice.panner.positionZ.value=horse.z;
      // At 9 m/s HorseGallop takes .407 s; the recording takes .391 s.
      voice.source.playbackRate.setTargetAtTime(.96*Math.max(.5,Math.min(1.2,horse.speed/HORSE.fastSpeed)),at,.06);
      // Also reach silence smoothly at the audible boundary, where inverse distance alone never reaches zero.
      const edge=Math.min(1,(AUDIBLE-distance(horse))/8);
      voice.gain.gain.setTargetAtTime(.8*edge,at,FADE/3);
    }
  }
  telemetry(id?:string){
    const voice=id?this.voices.get(id):undefined;
    return {state:this.context?.state??'',ready:!!this.buffer,volume:this.bus?.gain.value??0,voices:this.voices.size,
      playing:!!voice,rate:voice?.source.playbackRate.value??0,gain:voice?.gain.gain.value??0,
      position:voice?[voice.panner.positionX.value,voice.panner.positionY.value,voice.panner.positionZ.value]:undefined};
  }
  destroy():void {
    this.destroyed=true;
    for(const event of ['pointerdown','keydown'])window.removeEventListener(event,this.unlock);
    document.removeEventListener('visibilitychange',this.hidden);
    this.clear();this.buffer=undefined;
    void this.context?.close().catch(()=>{});
  }
}
