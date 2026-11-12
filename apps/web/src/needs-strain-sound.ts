import type {CoreKey} from '@bar/shared';

/** How deep into its reserve each need is, 0–1 (reserveStrain in @bar/shared). */
export type Strains=Record<CoreKey,number>;
export const NO_STRAIN:Strains={hp:0,stamina:0,hunger:0,thirst:0};

/** A running sound: its level node, the level it has at full strain, and how to stop it. */
interface Loop {gain:GainNode;peak:number;quiet?:number;stop():void}

/**
 * The sounds of living on the reserve (needs-strain.ts), synthesised like the menu's and the phone's: no audio files. Each need
 * has its own character, and none of them is a sigh:
 *  - stamina: a drained machine. A saw drone whose pitch and filter fall away every couple of seconds, with a strained flutter on
 *    its level and a rasp of noise: energy running out.
 *  - life: a muffled double heartbeat (`heartbeat`, driven by the screen's pulse so the two stay together), a thin ringing and
 *    the rush of blood.
 *  - hunger: a stomach growl now and then (`growl`), a low saw gliding down through a formant, with a wet gurgle of noise.
 *  - thirst: dry air: a thin band of wind that swells and fades, and the odd crackle of something parched (`crackle`).
 * The levels follow the strain, so they come in and go out softly. Nothing here has been heard by a person yet.
 */
export class StrainSounds {
  private context?:AudioContext;
  private out?:GainNode;
  private noiseBuffer?:AudioBuffer;
  private loops:Partial<Record<'stamina'|'hp'|'thirst',Loop>>={};
  private nextAt={hunger:0,thirst:0};
  constructor(private volume:()=>number){}

  private audio():AudioContext|undefined {
    try{
      if(!this.context){
        this.context=new AudioContext();
        const squeeze=this.context.createDynamicsCompressor();squeeze.threshold.value=-20;squeeze.ratio.value=4;squeeze.attack.value=.004;squeeze.release.value=.2;
        this.out=this.context.createGain();this.out.connect(squeeze).connect(this.context.destination);
      }
    }catch{return;}
    if(this.context.state==='suspended')void this.context.resume().catch(()=>{});
    return this.context;
  }
  private level():number {const v=this.volume();return Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;}
  private noise(context:AudioContext):AudioBuffer {
    if(!this.noiseBuffer){
      const length=Math.floor(context.sampleRate*2),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
      this.noiseBuffer=buffer;
    }
    return this.noiseBuffer;
  }
  private bed(context:AudioContext):AudioBufferSourceNode {
    const source=context.createBufferSource();source.buffer=this.noise(context);source.loop=true;return source;
  }
  private loop(peak:number,build:(context:AudioContext,gain:GainNode,sources:AudioScheduledSourceNode[])=>void):Loop|undefined {
    const context=this.audio(),out=this.out;if(!context||!out)return;
    const gain=context.createGain(),sources:AudioScheduledSourceNode[]=[];gain.gain.value=0;gain.connect(out);
    build(context,gain,sources);for(const source of sources)source.start();
    return {gain,peak,stop:()=>{for(const source of sources){try{source.stop();}catch{/* already stopped */}}gain.disconnect();}};
  }

  /** The drained machine: see the class comment. */
  private stamina():Loop|undefined {
    return this.loop(.2,(c,gain,sources)=>{
      const body=c.createGain();body.gain.value=.55;
      const tone=c.createOscillator();tone.type='sawtooth';tone.frequency.value=92;
      const lowpass=c.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=380;lowpass.Q.value=5;
      tone.connect(lowpass).connect(body).connect(gain);
      // The drain: an inverted saw lowers the pitch and closes the filter once every 1.8 s, then it starts over.
      const fall=c.createOscillator();fall.type='sawtooth';fall.frequency.value=.55;
      const pitch=c.createGain();pitch.gain.value=-34;const close=c.createGain();close.gain.value=-160;
      fall.connect(pitch).connect(tone.frequency);fall.connect(close).connect(lowpass.frequency);
      // The strain: a quick flutter on the level.
      const flutter=c.createOscillator();flutter.frequency.value=6.2;const depth=c.createGain();depth.gain.value=.3;flutter.connect(depth).connect(body.gain);
      const rasp=this.bed(c),band=c.createBiquadFilter(),share=c.createGain();band.type='bandpass';band.frequency.value=700;band.Q.value=1.1;share.gain.value=.14;
      rasp.connect(band).connect(share).connect(gain);
      sources.push(tone,fall,flutter,rasp);
    });
  }
  /** Ringing in the ears and the rush of blood: the bed of the heartbeat. */
  private life():Loop|undefined {
    return this.loop(.05,(c,gain,sources)=>{
      const ring=c.createOscillator();ring.frequency.value=3150;const thin=c.createGain();thin.gain.value=.22;ring.connect(thin).connect(gain);
      const rush=this.bed(c),low=c.createBiquadFilter(),share=c.createGain();low.type='lowpass';low.frequency.value=280;share.gain.value=1.1;
      rush.connect(low).connect(share).connect(gain);
      sources.push(ring,rush);
    });
  }
  /** Dry air: a thin band of wind that swells and fades. */
  private thirst():Loop|undefined {
    return this.loop(.06,(c,gain,sources)=>{
      const wind=this.bed(c),high=c.createBiquadFilter(),band=c.createBiquadFilter(),swell=c.createGain();
      high.type='highpass';high.frequency.value=1500;band.type='bandpass';band.frequency.value=3400;band.Q.value=.7;swell.gain.value=.5;
      wind.connect(high).connect(band).connect(swell).connect(gain);
      const slow=c.createOscillator();slow.frequency.value=.27;const depth=c.createGain();depth.gain.value=.45;slow.connect(depth).connect(swell.gain);
      sources.push(wind,slow);
    });
  }

  /** Called every frame with the strains: the loops follow them, hunger and thirst throw their one-off sounds now and then. */
  update(strains:Strains,now:number):void {
    const master=this.level();
    for(const [name,build] of [['stamina',()=>this.stamina()],['hp',()=>this.life()],['thirst',()=>this.thirst()]] as const){
      const target=master>0?strains[name]:0;let loop=this.loops[name];
      if(!loop){if(target<.03)continue;loop=build();if(!loop)continue;this.loops[name]=loop;}
      loop.quiet=target<.03?loop.quiet??now:undefined;
      if(loop.quiet!==undefined&&now-loop.quiet>2500){loop.stop();delete this.loops[name];continue;}
      loop.gain.gain.setTargetAtTime(target*loop.peak*master,this.context!.currentTime,.3);
    }
    if(master>0&&strains.hunger>.08&&now>=this.nextAt.hunger){this.growl(strains.hunger*master);this.nextAt.hunger=now+(9000-6000*strains.hunger)*(.7+Math.random()*.6);}
    if(master>0&&strains.thirst>.08&&now>=this.nextAt.thirst){this.crackle(strains.thirst*master);this.nextAt.thirst=now+(1700-1100*strains.thirst)*(.5+Math.random());}
  }
  /** One heartbeat, "lub-dub": two soft thumps of a falling sine, muffled. `level` is the strain. */
  heartbeat(level:number):void {
    const context=this.audio(),volume=level*this.level();if(!context||!this.out||volume<.01)return;
    for(const [at,frequency,amount] of [[0,62,.5],[.2,72,.32]] as const){
      const start=context.currentTime+at,osc=context.createOscillator(),muffle=context.createBiquadFilter(),gain=context.createGain();
      osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(frequency*.55,start+.16);
      muffle.type='lowpass';muffle.frequency.value=170;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(amount*volume,start+.01);gain.gain.exponentialRampToValueAtTime(.0001,start+.24);
      osc.connect(muffle).connect(gain).connect(this.out);osc.start(start);osc.stop(start+.28);
    }
  }
  /** A stomach growl: a low saw gliding down through a moving formant, and a wet gurgle of noise over it. */
  private growl(level:number):void {
    const context=this.audio();if(!context||!this.out)return;
    const start=context.currentTime,length=.9+Math.random()*.9,top=.2*level;
    const osc=context.createOscillator(),formant=context.createBiquadFilter(),gain=context.createGain();
    osc.type='sawtooth';osc.frequency.setValueAtTime(76+Math.random()*22,start);osc.frequency.exponentialRampToValueAtTime(44,start+length);
    const wobble=context.createOscillator(),depth=context.createGain();wobble.frequency.value=11+Math.random()*5;depth.gain.value=9;wobble.connect(depth).connect(osc.frequency);
    formant.type='bandpass';formant.Q.value=3;formant.frequency.setValueAtTime(130,start);formant.frequency.linearRampToValueAtTime(270,start+length*.45);formant.frequency.linearRampToValueAtTime(115,start+length);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(top,start+length*.28);gain.gain.setValueAtTime(top,start+length*.55);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
    osc.connect(formant).connect(gain).connect(this.out);
    const gurgle=context.createBufferSource(),wet=context.createBiquadFilter(),share=context.createGain();
    gurgle.buffer=this.noise(context);wet.type='bandpass';wet.Q.value=2.2;wet.frequency.setValueAtTime(190,start);wet.frequency.linearRampToValueAtTime(330,start+length*.5);wet.frequency.linearRampToValueAtTime(160,start+length);share.gain.value=.55;
    gurgle.connect(wet).connect(share).connect(gain);
    for(const source of [osc,wobble])source.start(start);for(const source of [osc,wobble])source.stop(start+length+.05);
    gurgle.start(start,Math.random()*1.5);gurgle.stop(start+length+.05);
  }
  /** Something dry cracking: two to four tiny clicks of high noise, close together. */
  private crackle(level:number):void {
    const context=this.audio();if(!context||!this.out)return;
    let at=0;
    for(let i=0,clicks=2+Math.floor(Math.random()*3);i<clicks;i++){
      const start=context.currentTime+at,source=context.createBufferSource(),high=context.createBiquadFilter(),gain=context.createGain();
      source.buffer=this.noise(context);high.type='highpass';high.frequency.value=4300;
      gain.gain.setValueAtTime(.11*level,start);gain.gain.exponentialRampToValueAtTime(.0001,start+.011+Math.random()*.01);
      source.connect(high).connect(gain).connect(this.out);source.start(start,Math.random()*1.7);source.stop(start+.03);
      at+=.02+Math.random()*.07;
    }
  }
}
