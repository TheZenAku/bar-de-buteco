import {placeListener} from './moto-sound';

/**
 * A blow, heard from where it happens: the leg cutting the air, the foot landing, the body hitting what it hits, in a fall from a bike too. Real recordings
 * from CC0 packs (tools/assets/import-kick-sounds.mjs, docs/assets/sons-golpes.md). The room says nothing about them: each browser hears what it is drawing.
 */
const SWINGS=['ar-1','ar-2','ar-3'],SWING_LONG='ar-longo',HITS=['chute-1','chute-2','chute-3','chute-4'],HIT_WEIGHT='chute-peso',FALLS=['queda-1','queda-2','queda-3','queda-4'];
export const BLOW_CLIPS=[...SWINGS,SWING_LONG,...HITS,HIT_WEIGHT,...FALLS];
/** How loud it is from this close (metres), how fast that falls, and past where nothing plays. */
const REF_DISTANCE=4,ROLLOFF=1.2,AUDIBLE=45;
const BUS=1.1;
/** A body landing, by how fast it hit (m/s): from a light knock to all its weight. Slower sounds heavier: the recordings are a light towel on a floor. */
const FALL_QUIET=1,FALL_FULL=7,FALL_RATE=[.92,.68] as const;

export interface BlowEar {x:number;y:number;z:number;forward:{x:number;y:number;z:number};up:{x:number;y:number;z:number}}
type Place={x:number;y:number;z:number};

export class BlowSounds {
  private context?:AudioContext;
  private bus?:GainNode;
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly last=new Map<readonly string[],string>();
  /** The last clips played, oldest first (tests and telemetry). */
  private readonly played:string[]=[];
  // Loaded on the first click or key, entering the bar always is one: the first kick must not be silent while they download.
  private readonly unlock=()=>{void this.graph()?.resume().catch(()=>{});};

  /** `volume`: the player's master volume (settings). `base`: where the site's public files are. `ear`: the camera. */
  constructor(private readonly volume:()=>number,private readonly base:string,private readonly ear:()=>BlowEar|undefined) {
    for(const event of ['pointerdown','keydown'])window.addEventListener(event,this.unlock);
  }
  private graph():AudioContext|undefined {
    if(this.context)return this.context;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{
      const context=this.context=new AudioContext();
      // A crowd brawling must not clip.
      const limiter=context.createDynamicsCompressor();limiter.threshold.value=-8;limiter.ratio.value=8;limiter.attack.value=.002;
      this.bus=context.createGain();
      this.bus.connect(limiter).connect(context.destination);
      this.synthesize(context);
      for(const clip of BLOW_CLIPS)void fetch(`${this.base}kick/sound/${clip}.wav`).then(response=>response.arrayBuffer()).then(data=>context.decodeAudioData(data)).then(buffer=>this.buffers.set(clip,buffer)).catch(error=>console.warn(`golpe: som ${clip} indisponível`,error));
      return context;
    }catch{return;}
  }
  /**
   * The two sounds of a defence, made here (no recording of them is in the packs): a block is a dull thud of forearms (low noise burst with a short
   * body under it), a parry a bright ring (two inharmonic partials decaying over a click). Deterministic, so every browser rings the same.
   */
  private synthesize(context:AudioContext):void {
    const rate=context.sampleRate,make=(seconds:number,sample:(t:number,i:number)=>number)=>{
      const buffer=context.createBuffer(1,Math.ceil(rate*seconds),rate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=sample(i/rate,i);
      return buffer;
    };
    let seed=1;
    const noise=()=>{seed=(seed*16807)%2147483647;return seed/1073741823-1;};
    let low=0;
    this.buffers.set('block',make(.16,(t)=>{
      low+=(noise()-low)*.12;
      return Math.max(-1,Math.min(1,(low*5.5*Math.exp(-t*38)+Math.sin(2*Math.PI*118*t)*.8*Math.exp(-t*30))*.85));
    }));
    this.buffers.set('parry',make(.45,(t)=>{
      const click=noise()*Math.exp(-t*420)*.9,ring=Math.sin(2*Math.PI*1760*t)*.45*Math.exp(-t*9)+Math.sin(2*Math.PI*2637*t)*.3*Math.exp(-t*13)+Math.sin(2*Math.PI*880*t)*.25*Math.exp(-t*7);
      return Math.max(-1,Math.min(1,click+ring));
    }));
  }
  /** One of the set, never the same twice in a row. */
  private pick(set:readonly string[]):string {
    const others=set.filter(clip=>clip!==this.last.get(set)),clip=others[Math.floor(Math.random()*others.length)]!;
    this.last.set(set,clip);
    return clip;
  }
  private play(clip:string,at:Place,level:number,rate:number):void {
    const context=this.graph(),bus=this.bus,buffer=this.buffers.get(clip),ear=this.ear();
    if(!context||!bus||!buffer||document.hidden)return;
    if(ear){
      if(Math.hypot(at.x-ear.x,at.y-ear.y,at.z-ear.z)>AUDIBLE)return;
      placeListener(context,ear.x,ear.y,ear.z,ear.forward,ear.up);
    }
    bus.gain.value=BUS*Math.max(0,Math.min(1,this.volume()));
    const source=context.createBufferSource(),gain=context.createGain(),panner=context.createPanner();
    panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=REF_DISTANCE;panner.rolloffFactor=ROLLOFF;panner.maxDistance=AUDIBLE*2;
    if(panner.positionX){panner.positionX.value=at.x;panner.positionY.value=at.y;panner.positionZ.value=at.z;}
    else panner.setPosition(at.x,at.y,at.z);
    source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=level;
    source.connect(gain).connect(panner).connect(bus);source.start();
    source.onended=()=>{source.disconnect();gain.disconnect();panner.disconnect();};
    this.played.push(clip);if(this.played.length>24)this.played.shift();
  }
  /** The leg going through the air, whether it lands or not. */
  swing(heavy:boolean,at:Place):void {
    if(heavy)this.play(SWING_LONG,at,.8,1);
    else this.play(this.pick(SWINGS),at,.7,.95+Math.random()*.12);
  }
  /** The foot landing; the flying kick has the weight of the whole body behind it. */
  hit(heavy:boolean,at:Place):void {
    this.play(this.pick(HITS),at,1,.94+Math.random()*.12);
    if(heavy)this.play(HIT_WEIGHT,at,.9,.9+Math.random()*.08);
  }
  /** A blow met a block. */
  block(at:Place):void {this.play('block',at,.95,.92+Math.random()*.16);}
  /** A parry: the ring over the thud. */
  parry(at:Place):void {this.play('block',at,.7,1.1);this.play('parry',at,.85,.97+Math.random()*.06);}
  /** A body landing, or hitting a wall, at `speed` m/s. */
  fall(speed:number,at:Place):void {
    const hard=Math.max(0,Math.min(1,(speed-FALL_QUIET)/(FALL_FULL-FALL_QUIET)));
    this.play(this.pick(FALLS),at,.25+.75*hard,FALL_RATE[0]+(FALL_RATE[1]-FALL_RATE[0])*hard+(Math.random()-.5)*.05);
  }
  telemetry() {return {state:this.context?.state??'',ready:this.buffers.size,played:[...this.played]};}
  destroy():void {
    for(const event of ['pointerdown','keydown'])window.removeEventListener(event,this.unlock);
    void this.context?.close().catch(()=>{});
  }
}
