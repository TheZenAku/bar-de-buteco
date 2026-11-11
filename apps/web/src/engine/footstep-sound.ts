import {placeListener} from './moto-sound';
import {footstepSurfaceAt,type FootstepSurface} from './footstep-surface';

interface Position {x:number;y:number;z:number}
export interface FootstepView extends Position {id:string;animation?:string;oldWalk?:boolean;blocked?:boolean;/** Foot touchdowns of the drawn legs so far (foot-contact.ts); steps sound on each. Without it, they follow distance. */contacts?:number}
interface Stride extends Position {distance:number;contacts?:number;lengthScale?:number;lastClip?:number;surface?:FootstepSurface;steps:number}
interface Voice {source:AudioBufferSourceNode;gain:GainNode;panner:PannerNode;filter:BiquadFilterNode;id:string}
const AUDIBLE=18,MAX_WALKERS=8,MAX_VOICES=24;
// Keep footsteps beneath voices and ambience, with the recordings' original dynamics.
const MIX_GAIN=.25;
const BANKS=['concrete','wood','grass'] as const;
type Bank=typeof BANKS[number];
const PROFILES:Record<FootstepSurface,{bank:Bank;cutoff:number;rate:number;gain:number}>={
  asphalt:{bank:'concrete',cutoff:2200,rate:.98,gain:.65},
  concrete:{bank:'concrete',cutoff:3400,rate:1,gain:.72},
  tile:{bank:'concrete',cutoff:4000,rate:1.02,gain:.72},
  wood:{bank:'wood',cutoff:3200,rate:1,gain:.68},
  grass:{bank:'grass',cutoff:3800,rate:1,gain:.62},
  dirt:{bank:'grass',cutoff:2400,rate:.97,gain:.65},
};

/** Recorded, spatial footsteps driven by distance travelled, never by keys or a looping timer. */
export class FootstepSounds {
  private context?:AudioContext;
  private bus?:GainNode;
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly strides=new Map<string,Stride>();
  private readonly voices=new Set<Voice>();
  private readonly abort=new AbortController();
  private destroyed=false;
  private active=false;
  private readonly unlock=()=>{if(this.active&&!document.hidden&&this.level()>0)void this.graph()?.resume().catch(()=>{});};
  private readonly hidden=()=>{if(document.hidden)this.silence();};
  constructor(private readonly volume:()=>number,private readonly base:string){
    window.addEventListener('pointerdown',this.unlock);window.addEventListener('keydown',this.unlock);
    document.addEventListener('visibilitychange',this.hidden);
  }
  private level():number {const value=this.volume();return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;}
  private graph():AudioContext|undefined {
    if(this.destroyed)return;
    if(this.context)return this.context;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{
      const context=new AudioContext(),bus=context.createGain(),limiter=context.createDynamicsCompressor();
      limiter.threshold.value=-6;limiter.ratio.value=2;limiter.attack.value=.01;
      bus.gain.value=this.level()*MIX_GAIN;bus.connect(limiter).connect(context.destination);
      this.context=context;this.bus=bus;
      for(const bank of BANKS)for(let index=0;index<5;index++){
        const clip=`footstep_${bank}_${String(index).padStart(3,'0')}`;
        void fetch(`${this.base}footsteps/${clip}.ogg`,{signal:this.abort.signal}).then(response=>{
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        }).then(data=>context.decodeAudioData(data)).then(buffer=>{
          if(!this.destroyed)this.buffers.set(clip,buffer);
        }).catch(error=>{if(!this.destroyed)console.warn(`Passos: som ${clip} indisponível.`,error);});
      }
      return context;
    }catch{return;}
  }
  setActive(active:boolean):void {this.active=active;if(!active)this.silence();}
  private release(voice:Voice):void {
    voice.source.disconnect();voice.gain.disconnect();voice.panner.disconnect();voice.filter.disconnect();this.voices.delete(voice);
  }
  private stop(voice:Voice):void {
    const now=this.context!.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0,now,.006);
    voice.source.stop(now+.025);this.voices.delete(voice);
  }
  private silence():void {
    this.strides.clear();for(const voice of this.voices)this.stop(voice);
    if(this.bus&&this.context)this.bus.gain.setTargetAtTime(0,this.context.currentTime,.008);
  }
  update(dt:number,walkers:readonly FootstepView[],ear:Position,forward:Position,up:Position):void {
    if(this.destroyed)return;
    if(!this.active||document.hidden||this.level()===0){this.silence();return;}
    const distance=(at:Position)=>Math.hypot(at.x-ear.x,at.y-ear.y,at.z-ear.z);
    const near=walkers.filter(walker=>!walker.blocked&&['walk','run','wander','drunk-walk'].includes(walker.animation??'')&&distance(walker)<AUDIBLE)
      .sort((a,b)=>distance(a)-distance(b)).slice(0,MAX_WALKERS);
    for(const id of this.strides.keys())if(!near.some(walker=>walker.id===id))this.strides.delete(id);
    for(const voice of this.voices)if(!near.some(walker=>walker.id===voice.id))this.stop(voice);
    const context=this.context??(near.length?this.graph():undefined);
    if(context&&this.bus){
      this.bus.gain.setTargetAtTime(this.level()*MIX_GAIN,context.currentTime,.02);
      placeListener(context,ear.x,ear.y,ear.z,forward,up);
    }
    for(const walker of near){
      let stride=this.strides.get(walker.id);
      if(!stride){stride={x:walker.x,y:walker.y,z:walker.z,distance:0,steps:0};this.strides.set(walker.id,stride);continue;}
      const travel=Math.hypot(walker.x-stride.x,walker.z-stride.z),rise=Math.abs(walker.y-stride.y);
      stride.x=walker.x;stride.y=walker.y;stride.z=walker.z;
      // Discard snaps, paused frames and sub-centimetre network jitter; never catch up a backlog of steps.
      if(dt<=0||dt>.25||travel>Math.max(1,dt*10)||rise>.55){stride.distance=0;continue;}
      if(travel<.001||travel/dt<.08){stride.contacts=walker.contacts;continue;}
      const running=walker.animation==='run'&&!walker.oldWalk;
      if(walker.contacts!==undefined){
        // The legs set the beat: a step for each touchdown they drew since last frame (never a backlog).
        const touched=stride.contacts!==undefined&&walker.contacts>stride.contacts;stride.contacts=walker.contacts;
        // Safety net: legs that sound nothing for two strides' travel (a gait the detector cannot read) fall back to distance, so steps never go silent.
        stride.distance=touched?0:stride.distance+travel;
        if(!touched&&stride.distance<(walker.oldWalk?.3:running?1.55:.8)*2)continue;
        stride.lengthScale=undefined;stride.distance=0;
        const surface=footstepSurfaceAt(walker.x,walker.y,walker.z);stride.surface=surface;
        if(surface&&context?.state==='running')this.step(walker,stride,surface,running,Math.min(1,(AUDIBLE-distance(walker))/4));
        continue;
      }
      const length=(walker.oldWalk?.3:running?1.55:.8)*(stride.lengthScale??1);
      stride.distance+=travel;
      if(stride.distance<length)continue;
      stride.distance%=length;
      // Tiny differences between successive strides avoid a metronomic rhythm without drifting from travel.
      stride.lengthScale=.98+Math.random()*.04;
      const surface=footstepSurfaceAt(walker.x,walker.y,walker.z);stride.surface=surface;
      if(surface&&context?.state==='running')this.step(walker,stride,surface,running,Math.min(1,(AUDIBLE-distance(walker))/4));
    }
  }
  private step(at:FootstepView,stride:Stride,surface:FootstepSurface,running:boolean,edge:number):void {
    const profile=PROFILES[surface];
    const options=Array.from({length:5},(_,i)=>i).filter(i=>i!==stride.lastClip&&this.buffers.has(`footstep_${profile.bank}_${String(i).padStart(3,'0')}`));
    if(!options.length||this.voices.size>=MAX_VOICES)return;
    const index=options[Math.floor(Math.random()*options.length)]!;stride.lastClip=index;
    const context=this.context!,source=context.createBufferSource(),gain=context.createGain(),panner=context.createPanner(),filter=context.createBiquadFilter();
    source.buffer=this.buffers.get(`footstep_${profile.bank}_${String(index).padStart(3,'0')}`)!;
    // Preserve the recorded shoe's timbre: sprinting changes cadence and weight, not its pitch.
    source.playbackRate.value=profile.rate*(.99+Math.random()*.02);
    const now=context.currentTime,duration=source.buffer.duration/source.playbackRate.value;
    const level=profile.gain*(running?1:.8)*(stride.steps%2?.97:1.03)*(.97+Math.random()*.06)*edge;
    // Round off sharp attacks and fade the recording's tail to prevent clicks.
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(level,now+Math.min(.004,duration/4));
    gain.gain.setValueAtTime(level,now+Math.max(duration/2,duration-.025));
    gain.gain.linearRampToValueAtTime(0,now+duration);
    filter.type='lowpass';filter.frequency.value=profile.cutoff;filter.Q.value=.5;
    panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=3;panner.rolloffFactor=1.5;panner.maxDistance=AUDIBLE;
    panner.positionX.value=at.x;panner.positionY.value=at.y+.1;panner.positionZ.value=at.z;
    source.connect(filter).connect(gain).connect(panner).connect(this.bus!);
    const voice={source,gain,panner,filter,id:at.id};this.voices.add(voice);
    source.onended=()=>this.release(voice);source.start();stride.steps++;
  }
  telemetry(){return {state:this.context?.state??'',ready:this.buffers.size,active:this.active,voices:this.voices.size,walkers:[...this.strides].map(([id,stride])=>({id,steps:stride.steps,surface:stride.surface}))};}
  destroy():void {
    this.destroyed=true;this.active=false;this.abort.abort();this.silence();this.buffers.clear();
    window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);document.removeEventListener('visibilitychange',this.hidden);
    void this.context?.close().catch(()=>{});
  }
}
