import {MOTO_ENGINE,readCarParts,type MotoState} from '@bar/shared';
import {placeListener} from './moto-sound';
type Engine={a:OscillatorNode;b:OscillatorNode;gain:GainNode;filter:BiquadFilterNode;panner:PannerNode};
/** Low engine harmonics for the new model; positional and scaled by the game's master volume. */
export class CarSounds {
  private context?:AudioContext;private engines=new Map<string,Engine>();private wanted=false;
  private unlock=()=>{if(this.wanted)void this.graph()?.resume().catch(()=>{});};
  constructor(private readonly volume:()=>number){window.addEventListener('pointerdown',this.unlock);window.addEventListener('keydown',this.unlock);}
  private graph():AudioContext|undefined {if(this.context)return this.context;if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;try{return this.context=new AudioContext();}catch{return;}}
  update(cars:readonly {state:MotoState;x:number;y:number;z:number;speed:number}[],ear:{x:number;y:number;z:number},forward:{x:number;y:number;z:number},up:{x:number;y:number;z:number}):void {
    this.wanted=cars.some(c=>c.state.engine!==MOTO_ENGINE.OFF);
    const ctx=this.context??(this.wanted?this.graph():undefined);if(!ctx)return;
    placeListener(ctx,ear.x,ear.y,ear.z,forward,up);
    for(const car of cars){
      const distance=Math.hypot(car.x-ear.x,car.y-ear.y,car.z-ear.z),running=car.state.engine===MOTO_ENGINE.ON,starting=car.state.engine===MOTO_ENGINE.CRANKING;
      let engine=this.engines.get(car.state.id);if(!engine&&(running||starting)&&distance<65){
        const a=ctx.createOscillator(),b=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),panner=ctx.createPanner();
        a.type='sawtooth';b.type='triangle';filter.type='lowpass';gain.gain.value=0;panner.panningModel='equalpower';panner.refDistance=4;panner.rolloffFactor=1.5;panner.maxDistance=80;
        a.connect(filter);b.connect(filter);filter.connect(gain).connect(panner).connect(ctx.destination);a.start();b.start();engine={a,b,gain,filter,panner};this.engines.set(car.state.id,engine);
      }
      if(!engine)continue;
      const rpm=starting?24:38+Math.min(75,Math.abs(car.speed)*2)+(car.state.gas?15:0),parts=readCarParts(car.state.parts);
      engine.a.frequency.setTargetAtTime(rpm,ctx.currentTime,.08);engine.b.frequency.setTargetAtTime(rpm*2.01,ctx.currentTime,.08);
      engine.filter.frequency.setTargetAtTime(starting?180:280+rpm*3,ctx.currentTime,.1);
      engine.gain.gain.setTargetAtTime(!document.hidden&&distance<65&&(running||starting)?this.volume()*(starting?.06:.09)*(1+(100-parts.escapamento!)/150):0,ctx.currentTime,.12);
      engine.panner.positionX.value=car.x;engine.panner.positionY.value=car.y+.6;engine.panner.positionZ.value=car.z;
    }
    for(const [id,engine] of this.engines)if(!cars.some(c=>c.state.id===id)){engine.a.stop();engine.b.stop();engine.a.disconnect();engine.b.disconnect();engine.filter.disconnect();engine.gain.disconnect();engine.panner.disconnect();this.engines.delete(id);}
  }
  telemetry(id?:string){return {state:this.context?.state??'',playing:id?this.engines.has(id):this.engines.size>0,model:'carro-hatch'};}
  destroy():void {window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);void this.context?.close().catch(()=>{});this.engines.clear();}
}
