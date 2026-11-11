import catalog from './assets/city-sounds.json';
import {AMBIENT_MIX} from './ambient-mix';
import {CityAmbience} from './city-ambience/engine';
import type {AmbienceInput,CitySounds} from './city-ambience/model';

const KEY='bar:ambient:enabled';
/** Plenty for ambience (nothing above 16 kHz is kept) and a third less decoded audio in memory than at 48 kHz. */
const SAMPLE_RATE=32000;
const unit=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
function hold(parameter:AudioParam,time:number):void {
  if(typeof parameter.cancelAndHoldAtTime==='function')parameter.cancelAndHoldAtTime(time);
  else {const value=parameter.value;parameter.cancelScheduledValues(0);parameter.setValueAtTime(value,time);}
}

/**
 * The bar's ambient sound: owns the audio device, the master level and the browser's rules about when sound may play, and hands the city itself
 * to CityAmbience (city-ambience/): layers of real recordings that follow the hour, the weather and where the player stands.
 */
export class BarAudio {
  private context?:AudioContext;
  private bus?:GainNode;
  private city?:CityAmbience;
  private source?:()=>AmbienceInput|undefined;
  private pauseTimer?:ReturnType<typeof setTimeout>;
  private active=false;
  private preference=true;
  private suppressed=false;
  private level=1;
  private target=-1;
  private blocked=false;
  private disposed=false;
  constructor(private readonly sounds:CitySounds=catalog as unknown as CitySounds){
    try{this.preference=localStorage.getItem(KEY)!=='false';}catch{/* In-memory preferences still work. */}
    document.addEventListener('visibilitychange',this.visibility);
    window.addEventListener('pagehide',this.pageHide);
    window.addEventListener('pageshow',this.visibility);
  }
  get enabled():boolean{return this.preference;}
  get volume():number{return this.level;}
  set volume(value:number){this.level=unit(value);this.update();}
  /** Where the listener is and what the day is like, asked a few times a second while the bar is open. */
  setSource(source:(()=>AmbienceInput|undefined)|undefined):void {this.source=source;this.city?.setSource(source);}
  setSuppressed(value:boolean):void {if(this.suppressed!==value){this.suppressed=value;this.mix();}}
  toggle():boolean {
    this.preference=!this.preference;
    try{localStorage.setItem(KEY,String(this.preference));}catch{}
    if(this.preference)this.unlock();
    this.update();return this.preference;
  }
  /** Called in the Enter button's gesture, before loading the world asynchronously. */
  unlock=():void=>{
    if(this.disposed)return;
    try{
      this.createGraph();
      void this.context!.resume().then(()=>{if(this.disposed)return;this.blocked=false;this.update();}).catch(()=>{this.blocked=true;});
    }catch{/* An unavailable audio device must not prevent entering the game. */}
  };
  setActive(value:boolean):void {
    if(this.active===value)return;
    this.active=value;
    if(value){document.addEventListener('pointerdown',this.gesture);document.addEventListener('keydown',this.gesture);}
    else {document.removeEventListener('pointerdown',this.gesture);document.removeEventListener('keydown',this.gesture);}
    this.update();
  }
  private gesture=():void=>{if(this.wanted()&&(this.blocked||this.context?.state!=='running'))this.unlock();};
  private visibility=():void=>this.update();
  private pageHide=():void=>{
    if(this.context&&this.bus){hold(this.bus.gain,this.context.currentTime);this.bus.gain.setValueAtTime(0,this.context.currentTime);this.target=-1;}
    this.pause(true);
  };
  private wanted():boolean{return this.active&&this.preference&&this.level>0&&!document.hidden&&!this.disposed;}
  private createGraph():void {
    if(this.context)return;
    let context:AudioContext;
    try{context=new AudioContext({sampleRate:SAMPLE_RATE});}catch{context=new AudioContext();}
    this.context=context;
    this.bus=context.createGain();this.bus.gain.value=0;
    // Remove inaudible/low-frequency handling rumble, leaving headroom for voices.
    const filter=context.createBiquadFilter();filter.type='highpass';filter.frequency.value=65;filter.Q.value=.5;
    this.bus.connect(filter).connect(context.destination);
    this.city=new CityAmbience(context,this.bus,this.sounds);this.city.setSource(this.source);
  }
  private update():void {
    if(this.disposed)return;
    clearTimeout(this.pauseTimer);this.pauseTimer=undefined;
    this.mix();
    if(!this.wanted()||this.blocked){
      this.city?.stop(false);
      if(this.context)this.pauseTimer=setTimeout(()=>this.pause(!this.active),1000);
      return;
    }
    if(!this.context)return; // Wait for the first user gesture.
    if(this.context.state!=='running'){
      void this.context.resume().then(()=>{if(this.context?.state==='running')this.update();}).catch(()=>{this.blocked=true;});return;
    }
    this.city?.start();
  }
  private mix():void {
    if(!this.context||!this.bus)return;
    const target=this.wanted()&&!this.blocked?AMBIENT_MIX.gain*this.level*(this.suppressed?AMBIENT_MIX.duck:1):0;
    if(this.target===target)return;
    const now=this.context.currentTime,previous=this.target;this.target=target;
    hold(this.bus.gain,now);
    this.bus.gain.setTargetAtTime(target,now,target===0?.12:previous<=0?AMBIENT_MIX.fadeIn:.6);
  }
  private pause(release:boolean):void {
    this.city?.stop(release);
    if(this.context?.state==='running')void this.context.suspend().catch(()=>{});
  }
  /** Plays one kind of one-off sound now (dev tools). */
  trigger(kind:string):boolean {return this.city?.trigger(kind)??false;}
  telemetry():object {
    return {enabled:this.preference,active:this.active,blocked:this.blocked,context:this.context?.state??'uninitialized',sampleRate:this.context?.sampleRate,volume:this.level,target:this.target,ducked:this.suppressed,
      city:this.city?.telemetry()};
  }
  destroy():void {
    this.setActive(false);this.disposed=true;clearTimeout(this.pauseTimer);this.pause(true);
    document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pagehide',this.pageHide);window.removeEventListener('pageshow',this.visibility);
    this.city?.destroy();this.city=undefined;
    void this.context?.close().catch(()=>{});
  }
}
