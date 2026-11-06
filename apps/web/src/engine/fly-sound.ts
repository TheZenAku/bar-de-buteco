/**
 * The administrators' flight, heard by the flier: a wind that rises and brightens with speed, and the boom of the sound barrier
 * when the dash starts. Real CC0 recordings (docs/assets/sons-voo.md), played as they are: a loop and one explosion pitched down.
 * Only the local flier hears it; the room says nothing about sound.
 */
const CLIPS={vento:'voo/vento-loop.ogg',estrondo:'voo/estrondo.flac',corte:'kick/sound/ar-longo.wav'} as const;
type Clip=keyof typeof CLIPS;

export class FlySounds {
  private context?:AudioContext;
  private bus?:GainNode;
  private wind?:{gain:GainNode;filter:BiquadFilterNode;source:AudioBufferSourceNode};
  private readonly buffers=new Map<Clip,AudioBuffer>();
  private readonly unlock=()=>{void this.graph()?.resume().catch(()=>{});};

  constructor(private readonly volume:()=>number,private readonly base:string) {
    for(const event of ['pointerdown','keydown'])window.addEventListener(event,this.unlock);
  }
  private graph():AudioContext|undefined {
    if(this.context)return this.context;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{
      const context=this.context=new AudioContext(),limiter=context.createDynamicsCompressor();
      limiter.threshold.value=-8;limiter.ratio.value=8;limiter.attack.value=.002;
      this.bus=context.createGain();this.bus.connect(limiter).connect(context.destination);
      for(const [name,file] of Object.entries(CLIPS) as [Clip,string][])void fetch(`${this.base}${file}`).then(r=>r.arrayBuffer()).then(d=>context.decodeAudioData(d)).then(b=>this.buffers.set(name,b)).catch(error=>console.warn(`voo: som ${name} indisponível`,error));
      return context;
    }catch{return;}
  }
  /** Each frame: `air` 0 to 1 (in flight, eased) and `dash` 0 to 1 (how fast, eased). */
  update(air:number,dash:number):void {
    const context=this.graph(),bus=this.bus,buffer=this.buffers.get('vento');
    if(!context||!bus||!buffer||document.hidden){return;}
    bus.gain.value=Math.max(0,Math.min(1,this.volume()));
    if(!this.wind){
      if(air<.01)return;
      const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();
      source.buffer=buffer;source.loop=true;filter.type='lowpass';gain.gain.value=0;
      source.connect(filter).connect(gain).connect(bus);source.start();
      this.wind={source,gain,filter};
    }
    const {gain,filter,source}=this.wind,now=context.currentTime;
    gain.gain.setTargetAtTime(air*(.12+.75*dash),now,.08);
    filter.frequency.setTargetAtTime(500+6500*dash,now,.1);
    source.playbackRate.setTargetAtTime(.85+.5*dash,now,.15);
    if(air<.01&&gain.gain.value<.005){source.stop();source.disconnect();gain.disconnect();filter.disconnect();this.wind=undefined;}
  }
  /** The barrier: a low explosion over a long rising cut of air. */
  boom():void {
    const context=this.graph(),bus=this.bus;if(!context||!bus||document.hidden)return;
    for(const [clip,level,rate] of [['estrondo',1,.72],['corte',.7,.55]] as const){
      const buffer=this.buffers.get(clip);if(!buffer)continue;
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=level;
      source.connect(gain).connect(bus);source.start();source.onended=()=>{source.disconnect();gain.disconnect();};
    }
  }
  destroy():void {
    for(const event of ['pointerdown','keydown'])window.removeEventListener(event,this.unlock);
    void this.context?.close().catch(()=>{});
  }
}
