import {MOTO_ENGINE,type MotoState} from '@bar/shared';
import {placeListener} from './moto-sound';

export const TRUCK_CLIPS=['idle','carga','partida','arranque','desliga','buzina','re'] as const;
type Clip=typeof TRUCK_CLIPS[number];
type Point={x:number;y:number;z:number};
export interface TruckAudioView extends Point {state:MotoState;speed:number;gasNow?:boolean}
const REACH=90,MAX_VOICES=4;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

/** Six diesel gears, with a drop in revs at each upshift. Speed is in metres/second. */
export function truckEngineMix(running:boolean,speed:number,load:number){
  const kmh=Math.abs(speed)*3.6,steps=[0,13,27,43,62,80];
  const index=speed<-.15?0:Math.max(0,steps.filter(at=>kmh>=at).length-1);
  const span=(steps[index+1]??100)-steps[index];
  const progress=clamp((kmh-steps[index])/span,0,1),moving=kmh>1;
  const rpm=!running?0:moving?950+progress*1250+load*170:750+load*850;
  const blend=running?clamp(load*.78+Math.min(1,kmh/18)*.35,0,1):0;
  return {rpm,gear:speed<-.15?-1:moving?index+1:0,idle:running?Math.cos(blend*Math.PI/2)*.64:0,drive:running?Math.sin(blend*Math.PI/2)*.58:0,rate:clamp(rpm/1700,.85,1.14)};
}

interface Sound {source:AudioBufferSourceNode;gain:GainNode;clip:Clip}
class TruckVoice {
  readonly panner:PannerNode;
  private readonly engineFilter:BiquadFilterNode;
  private readonly loops=new Map<Clip,Sound>();
  private shot?:Sound;
  private pending?:{clip:Clip;until:number};
  private before?:{engine:number;engineAt:number};
  private load=0;
  private rpm=750;
  mix=truckEngineMix(false,0,0);
  constructor(private readonly owner:TruckSounds,private readonly context:AudioContext,bus:AudioNode){
    this.panner=context.createPanner();this.panner.panningModel='equalpower';this.panner.distanceModel='inverse';this.panner.refDistance=7;this.panner.rolloffFactor=1.4;this.panner.maxDistance=REACH;
    this.panner.connect(bus);
    this.engineFilter=context.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=1400;this.engineFilter.Q.value=.55;this.engineFilter.connect(this.panner);
  }
  private make(clip:Clip,loop:boolean):Sound|undefined{
    const buffer=this.owner.buffer(clip);if(!buffer)return;
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;source.loop=loop;gain.gain.value=0;source.connect(gain).connect(clip==='buzina'||clip==='re'?this.panner:this.engineFilter);
    source.onended=()=>{source.disconnect();gain.disconnect();if(this.shot?.source===source)this.shot=undefined;};
    source.start(0,loop&&clip==='idle'?Math.random()*buffer.duration:0);
    this.owner.note(clip);return {source,gain,clip};
  }
  private release(sound:Sound|undefined,fade=.09){
    if(!sound)return;const now=this.context.currentTime;
    sound.gain.gain.cancelScheduledValues(now);sound.gain.gain.setTargetAtTime(0,now,fade/4);sound.source.stop(now+fade);
  }
  private loop(clip:Clip,level:number,rate=1){
    let sound=this.loops.get(clip);
    if(level<=0){if(sound){this.release(sound);this.loops.delete(clip);}return;}
    if(!sound){sound=this.make(clip,true);if(!sound)return;this.loops.set(clip,sound);}
    sound.gain.gain.setTargetAtTime(level,this.context.currentTime,.08);
    sound.source.playbackRate.setTargetAtTime(rate,this.context.currentTime,.15);
  }
  update(view:TruckAudioView,dt:number){
    const {state}=view,running=state.engine===MOTO_ENGINE.ON,cranking=state.engine===MOTO_ENGINE.CRANKING;
    const changed=!this.before||this.before.engine!==state.engine||this.before.engineAt!==state.engineAt;
    if(changed){
      if(cranking&&!state.crank)this.pending={clip:'partida',until:this.context.currentTime+3};
      else if(state.engine===MOTO_ENGINE.OFF&&this.before?.engine===MOTO_ENGINE.ON)this.pending={clip:'desliga',until:this.context.currentTime+2};
      else if(!running)this.pending=undefined;
      if(running&&(this.shot?.clip==='desliga'||this.pending?.clip==='desliga')){this.pending=undefined;this.release(this.shot);this.shot=undefined;}
      if(!running||cranking){this.release(this.shot);this.shot=undefined;}
    }
    this.before={engine:state.engine,engineAt:state.engineAt};
    if(this.pending){
      if(this.context.currentTime>this.pending.until)this.pending=undefined;
      else if(this.owner.buffer(this.pending.clip)){
        this.release(this.shot);this.shot=this.make(this.pending.clip,false);
        this.shot?.gain.gain.setTargetAtTime(.8,this.context.currentTime,.012);this.pending=undefined;
      }
    }
    this.load+=((running&&(view.gasNow??state.gas)?1:0)-this.load)*(1-Math.exp(-dt*7));
    this.mix=truckEngineMix(running,view.speed,this.load);
    this.rpm+=(this.mix.rpm-this.rpm)*(1-Math.exp(-dt*8));
    const under=this.shot?.clip==='partida'?.35:1;
    this.loop('idle',this.mix.idle*under,clamp(this.rpm/750,.96,1.08));
    this.loop('carga',this.mix.drive*under,this.mix.rate);
    this.loop('arranque',cranking&&!!state.crank ? .65:0);
    this.loop('buzina',state.horn ? .95:0);
    this.loop('re',running&&view.speed<-.2 ? .62:0);
    this.panner.positionX.value=view.x;this.panner.positionY.value=view.y+.9;this.panner.positionZ.value=view.z;
  }
  get active(){return !!this.shot||!!this.pending;}
  telemetry(){return {rpm:Math.round(this.rpm),gear:this.mix.gear,load:+this.load.toFixed(3),mix:this.mix,loops:[...this.loops.keys()],clip:this.shot?.clip??'',horn:this.loops.has('buzina'),reverse:this.loops.has('re')};}
  destroy(){this.pending=undefined;this.release(this.shot);for(const sound of this.loops.values())this.release(sound);this.loops.clear();setTimeout(()=>{this.engineFilter.disconnect();this.panner.disconnect();},150);}
}

/** Recorded diesel, horn and reverse alarm. Only nearby trucks allocate sources. */
export class TruckSounds {
  private context?:AudioContext;
  private bus?:GainNode;
  private readonly buffers=new Map<Clip,AudioBuffer>();
  private readonly voices=new Map<string,TruckVoice>();
  private readonly played:Clip[]=[];
  private readonly errors:Clip[]=[];
  private destroyed=false;
  private readonly unlock=()=>{void this.context?.resume().catch(()=>{});};
  private readonly visibility=()=>{if(this.context&&this.bus)this.bus.gain.setTargetAtTime(this.level(),this.context.currentTime,.025);};
  constructor(private readonly volume:()=>number,private readonly base:string){
    for(const event of ['pointerdown','keydown'])window.addEventListener(event,this.unlock);
    document.addEventListener('visibilitychange',this.visibility);
  }
  private level(){return document.hidden?0:clamp(this.volume(),0,1);}
  buffer(clip:Clip){return this.buffers.get(clip);}
  note(clip:Clip){this.played.push(clip);if(this.played.length>32)this.played.shift();}
  private graph(){
    if(this.context)return this.context;
    if(this.destroyed||navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    const context=this.context=new AudioContext(),limiter=context.createDynamicsCompressor();
    limiter.threshold.value=-9;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.005;limiter.release.value=.2;
    this.bus=context.createGain();this.bus.gain.value=this.level();this.bus.connect(limiter).connect(context.destination);
    for(const clip of TRUCK_CLIPS)void fetch(`${this.base}caminhao/sound/${clip}.wav`)
      .then(response=>{if(!response.ok)throw Error(`HTTP ${response.status}`);return response.arrayBuffer();})
      .then(data=>context.decodeAudioData(data)).then(buffer=>{if(!this.destroyed)this.buffers.set(clip,buffer);})
      .catch(error=>{if(!this.destroyed){this.errors.push(clip);console.warn(`truck audio: ${clip}`,error);}});
    return context;
  }
  update(dt:number,trucks:readonly TruckAudioView[],ear:Point,forward:Point,up:Point){
    if(this.destroyed)return;
    const distance=(v:Point)=>Math.hypot(v.x-ear.x,v.y-ear.y,v.z-ear.z);
    const nearby=trucks.filter(v=>distance(v)<REACH&&(v.state.engine!==MOTO_ENGINE.OFF||v.state.horn||this.voices.has(v.state.id)))
      .sort((a,b)=>distance(a)-distance(b)).slice(0,MAX_VOICES);
    // Warm the recordings while approaching a parked truck, before its first start.
    const context=this.context??(trucks.some(v=>distance(v)<REACH)?this.graph():undefined);if(!context||!this.bus)return;
    this.bus.gain.setTargetAtTime(this.level(),context.currentTime,.035);placeListener(context,ear.x,ear.y,ear.z,forward,up);
    const keep=new Set<string>();
    for(const truck of nearby){
      let voice=this.voices.get(truck.state.id);
      if(!voice){voice=new TruckVoice(this,context,this.bus);this.voices.set(truck.state.id,voice);}
      voice.update(truck,clamp(dt,0,.1));
      if(truck.state.engine!==MOTO_ENGINE.OFF||truck.state.horn||voice.active)keep.add(truck.state.id);
    }
    for(const [id,voice] of this.voices)if(!keep.has(id)){voice.destroy();this.voices.delete(id);}
  }
  telemetry(id?:string){const voice=id?this.voices.get(id)?.telemetry():undefined;return {model:'caminhao-bau',state:this.context?.state??'',ready:this.buffers.size,errors:[...this.errors],playing:this.voices.size,played:[...this.played],voice,horn:{playing:!!voice?.horn}};}
  destroy(){
    this.destroyed=true;for(const event of ['pointerdown','keydown'])window.removeEventListener(event,this.unlock);
    document.removeEventListener('visibilitychange',this.visibility);for(const voice of this.voices.values())voice.destroy();this.voices.clear();this.buffers.clear();void this.context?.close().catch(()=>{});
  }
}
