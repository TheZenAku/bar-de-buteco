import {isCar,type MotoState} from '@bar/shared';
import {placeListener} from './moto-sound';

type Position={x:number;y:number;z:number};
type Voice={oscillators:OscillatorNode[];gain:GainNode;filter:BiquadFilterNode;panner:PannerNode};
/** Sustained, positional horns: one sharper motorcycle tone, two lower car tones. */
export class VehicleHorns {
  private context?:AudioContext;
  private readonly voices=new Map<string,Voice>();
  private readonly unlock=()=>{void this.context?.resume().catch(()=>{});};
  constructor(private readonly volume:()=>number){window.addEventListener('keydown',this.unlock);window.addEventListener('pointerdown',this.unlock);}
  private graph():AudioContext|undefined {
    if(this.context)return this.context;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{return this.context=new AudioContext();}catch{return;}
  }
  update(vehicles:readonly {state:MotoState;position:Position}[],ear:Position,forward:Position,up:Position):void {
    const near=document.hidden?[]:vehicles.filter(v=>v.state.horn&&Math.hypot(v.position.x-ear.x,v.position.y-ear.y,v.position.z-ear.z)<65)
      .sort((a,b)=>Math.hypot(a.position.x-ear.x,a.position.z-ear.z)-Math.hypot(b.position.x-ear.x,b.position.z-ear.z)).slice(0,6);
    const context=this.context??(near.length&&this.volume()>0?this.graph():undefined);if(!context)return;
    placeListener(context,ear.x,ear.y,ear.z,forward,up);
    for(const [id,voice] of this.voices)if(!near.some(v=>v.state.id===id)){
      voice.gain.gain.setTargetAtTime(0,context.currentTime,.015);
      for(const oscillator of voice.oscillators)oscillator.stop(context.currentTime+.08);
      this.voices.delete(id);
    }
    for(const vehicle of near){
      let voice=this.voices.get(vehicle.state.id);
      if(!voice){
        const gain=context.createGain(),filter=context.createBiquadFilter(),panner=context.createPanner();
        gain.gain.value=0;filter.type='lowpass';filter.frequency.value=isCar(vehicle.state)?1500:2200;
        panner.panningModel='equalpower';panner.refDistance=5;panner.maxDistance=65;panner.rolloffFactor=1.3;
        filter.connect(gain).connect(panner).connect(context.destination);
        const oscillators=(isCar(vehicle.state)?[350,440]:[510]).map(frequency=>{
          const oscillator=context.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=frequency;oscillator.connect(filter);oscillator.start();return oscillator;
        });
        voice={gain,filter,panner,oscillators};
        oscillators[0]!.onended=()=>{oscillators.forEach(o=>o.disconnect());gain.disconnect();filter.disconnect();panner.disconnect();};
        this.voices.set(vehicle.state.id,voice);
      }
      voice.gain.gain.setTargetAtTime(Math.max(0,Math.min(1,this.volume()))*.12,context.currentTime,.015);
      voice.panner.positionX.value=vehicle.position.x;voice.panner.positionY.value=vehicle.position.y+.7;voice.panner.positionZ.value=vehicle.position.z;
    }
  }
  telemetry(id:string){return {playing:this.voices.has(id),state:this.context?.state??'',gain:this.voices.get(id)?.gain.gain.value??0};}
  destroy():void {window.removeEventListener('keydown',this.unlock);window.removeEventListener('pointerdown',this.unlock);for(const voice of this.voices.values())voice.oscillators.forEach(o=>o.stop());this.voices.clear();void this.context?.close().catch(()=>{});}
}
