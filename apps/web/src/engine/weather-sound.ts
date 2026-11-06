import {lightningAt,type WeatherSample} from '@bar/shared';

/** Procedural rain and distant thunder. One small noise buffer; no downloads or timers per raindrop. */
export class WeatherSounds {
  private context?:AudioContext;
  private noise?:AudioBuffer;
  private rain?:AudioBufferSourceNode;
  private bus?:GainNode;
  private rainGain?:GainNode;
  private filter?:BiquadFilterNode;
  private wanted=0;
  private sheltered=false;
  private active=true;
  private lastThunder=0;
  private previousTime?:number;
  private readonly thunders=new Set<AudioBufferSourceNode>();
  private unlock=()=>{if(this.active&&this.wanted>0&&!document.hidden){const ctx=this.graph();void ctx?.resume().catch(()=>{});}};
  private visibility=()=>{if(document.hidden||!this.active){if(this.bus&&this.context){this.bus.gain.cancelScheduledValues(0);this.bus.gain.setValueAtTime(0,this.context.currentTime);}this.stopThunder();}else this.unlock();};
  constructor(private readonly volume:()=>number){
    window.addEventListener('pointerdown',this.unlock);window.addEventListener('keydown',this.unlock);
    document.addEventListener('visibilitychange',this.visibility);
  }
  private graph():AudioContext|undefined {
    if(this.context)return this.context;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{
      const ctx=this.context=new AudioContext();
      this.bus=ctx.createGain();this.bus.gain.value=0;this.bus.connect(ctx.destination);
      this.noise=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate);
      const data=this.noise.getChannelData(0);let low=0;
      for(let i=0;i<data.length;i++){low=(low+(Math.random()*2-1)*.08)/1.04;data[i]=low*3;}
      this.rain=ctx.createBufferSource();this.rain.buffer=this.noise;this.rain.loop=true;
      this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=4000;
      this.rainGain=ctx.createGain();this.rainGain.gain.value=0;
      this.rain.connect(this.filter).connect(this.rainGain).connect(this.bus);this.rain.start();
      return ctx;
    }catch{return;}
  }
  setActive(active:boolean):void {this.active=active;this.previousTime=undefined;this.visibility();}
  private stopThunder():void {for(const source of this.thunders){try{source.stop();}catch{}}this.thunders.clear();}
  update(time:number,weather:WeatherSample,sheltered:boolean):void {
    this.wanted=weather.rain;this.sheltered=sheltered;
    const previous=this.previousTime;this.previousTime=time;
    const strike=lightningAt(time,weather);
    const crossed=previous!==undefined&&time>=previous&&time-previous<1500&&previous<strike.thunderAt&&time>=strike.thunderAt;
    const audible=this.active&&!document.hidden&&this.volume()>0;
    const ctx=this.context??(audible&&weather.rain>.01?this.graph():undefined);
    if(!ctx||!this.bus||!this.rainGain||!this.filter)return;
    const now=ctx.currentTime;
    this.bus.gain.setTargetAtTime(audible?Math.max(0,Math.min(1,this.volume())):0,now,.1);
    this.rainGain.gain.setTargetAtTime(weather.rain*(sheltered?.033:.132),now,.4);
    this.filter.frequency.setTargetAtTime(sheltered?750:4000,now,.3);
    if(crossed&&strike.strength>.1&&this.lastThunder!==strike.strikeAt){
      this.lastThunder=strike.strikeAt;
      if(audible&&ctx.state==='running')this.thunder(strike.strength);
    }
  }
  private thunder(strength:number):void {
    const ctx=this.context!,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),now=ctx.currentTime;
    source.buffer=this.noise!;source.loop=true;source.playbackRate.value=.55;
    filter.type='lowpass';filter.frequency.value=this.sheltered?180:330;filter.Q.value=.6;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(strength*(this.sheltered?.132:.3),now+.14);gain.gain.exponentialRampToValueAtTime(.001,now+4.5);
    source.connect(filter).connect(gain).connect(this.bus!);source.start();source.stop(now+4.6);this.thunders.add(source);
    source.onended=()=>{this.thunders.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
  }
  telemetry(){return {state:this.context?.state??'',rain:this.wanted,sheltered:this.sheltered,thunder:this.lastThunder};}
  destroy():void {
    window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);document.removeEventListener('visibilitychange',this.visibility);
    this.stopThunder();this.rain?.stop();void this.context?.close().catch(()=>{});
  }
}
