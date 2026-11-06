/**
 * The sounds of the death (docs/sistemas/morte.md), all synthesized with WebAudio: no files, nothing to load.
 * The context is made on the first sound (after the game has been interacted with), and at most MAX_VOICES sounds play at once;
 * a sound that would be the seventh is skipped. The loudness follows the master volume and, for the scene, the distance (`proximity`).
 */
const MAX_VOICES=6;

export class DeathAudio {
  /** 0–1: how close the scene is to the listener. The victim hears it all. */
  proximity=1;
  private context?:AudioContext;
  private master?:GainNode;
  private reverb?:ConvolverNode;
  private voices=0;
  private ambient?:{stop:()=>void};
  private beat?:ReturnType<typeof setTimeout>;
  private noiseBuffer?:AudioBuffer;
  constructor(private readonly volume:()=>number){}

  /** Whether a sound can play now: the browser allows audio and there is a free voice. */
  private ready():AudioContext|undefined {
    if(typeof AudioContext==='undefined')return undefined;
    try{
      if(!this.context){
        this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);
        this.reverb=this.context.createConvolver();this.reverb.buffer=this.impulse(this.context,2.4,2.6);
        const wet=this.context.createGain();wet.gain.value=.45;this.reverb.connect(wet);wet.connect(this.master);
      }
      if(this.context.state==='suspended')void this.context.resume();
      this.master!.gain.value=Math.max(0,Math.min(1,this.volume()))*.9;
      return this.context;
    }catch{return undefined;}
  }
  private impulse(context:AudioContext,seconds:number,decay:number):AudioBuffer {
    const length=Math.floor(context.sampleRate*seconds),buffer=context.createBuffer(2,length,context.sampleRate);
    for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,decay);}
    return buffer;
  }
  private noise(context:AudioContext):AudioBuffer {
    if(!this.noiseBuffer){const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;this.noiseBuffer=buffer;}
    return this.noiseBuffer;
  }
  /** Runs one sound if there is a free voice; `build` connects its nodes to `out` and says when it ends (seconds from now). */
  private voice(level:number,build:(context:AudioContext,out:GainNode,wet:AudioNode)=>number,spatial=true):void {
    const context=this.ready();if(!context||!this.master||this.voices>=MAX_VOICES)return;
    const out=context.createGain();out.gain.value=level*(spatial?this.proximity:1);out.connect(this.master);
    const lifetime=build(context,out,this.reverb!);
    this.voices++;
    setTimeout(()=>{this.voices=Math.max(0,this.voices-1);try{out.disconnect();}catch{/* already gone */}},Math.ceil(lifetime*1000)+120);
  }
  private tone(context:AudioContext,out:AudioNode,type:OscillatorType,frequency:number,start:number,duration:number,peak:number,endFrequency?:number):void {
    const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+start;
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);if(endFrequency)oscillator.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(peak,at+Math.min(.02,duration/4));gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain);gain.connect(out);oscillator.start(at);oscillator.stop(at+duration+.05);
  }
  private burst(context:AudioContext,out:AudioNode,start:number,duration:number,peak:number,filter:{type:BiquadFilterType;from:number;to?:number;q?:number}):void {
    const source=context.createBufferSource(),biquad=context.createBiquadFilter(),gain=context.createGain(),at=context.currentTime+start;
    source.buffer=this.noise(context);source.loop=true;biquad.type=filter.type;biquad.Q.value=filter.q??1;
    biquad.frequency.setValueAtTime(filter.from,at);if(filter.to)biquad.frequency.exponentialRampToValueAtTime(filter.to,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(peak,at+Math.min(.03,duration/3));gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(biquad);biquad.connect(gain);gain.connect(out);source.start(at,Math.random());source.stop(at+duration+.05);
  }

  /** The room's mood while she is there: a deep drone (40–60 Hz) and low wind; whispers come and go. */
  sceneBegin():void {
    this.ambient?.stop();
    const context=this.ready();if(!context||!this.master)return;
    const out=context.createGain();out.gain.value=0;out.connect(this.master);
    out.gain.linearRampToValueAtTime(.2*this.proximity,context.currentTime+2.5);
    const nodes:Array<{stop:(when?:number)=>void}>=[];
    for(const [frequency,detune] of [[44,0],[55,6],[59,-5]] as const){
      const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.detune.value=detune;gain.gain.value=.5;
      oscillator.connect(gain);gain.connect(out);oscillator.start();nodes.push(oscillator);
    }
    const wind=context.createBufferSource(),filter=context.createBiquadFilter(),lfo=context.createOscillator(),lfoGain=context.createGain(),windGain=context.createGain();
    wind.buffer=this.noise(context);wind.loop=true;filter.type='bandpass';filter.frequency.value=420;filter.Q.value=.7;windGain.gain.value=.35;
    lfo.frequency.value=.13;lfoGain.gain.value=220;lfo.connect(lfoGain);lfoGain.connect(filter.frequency);
    wind.connect(filter);filter.connect(windGain);windGain.connect(out);wind.start();lfo.start();nodes.push(wind,lfo);
    const whispers=setInterval(()=>this.whisper(),2600+Math.random()*1200);
    // The bed counts as one of the voices.
    this.voices++;
    this.ambient={stop:()=>{
      this.voices=Math.max(0,this.voices-1);clearInterval(whispers);const at=context.currentTime;out.gain.cancelScheduledValues(at);out.gain.setValueAtTime(out.gain.value,at);out.gain.linearRampToValueAtTime(0,at+2.2);
      setTimeout(()=>{nodes.forEach(node=>{try{node.stop();}catch{/* stopped */}});try{out.disconnect();}catch{/* gone */}},2400);
    }};
  }
  sceneEnd():void {this.ambient?.stop();this.ambient=undefined;}
  private whisper():void {
    this.voice(.22,(context,out,wet)=>{
      for(let i=0;i<3;i++)this.burst(context,out,i*.18,.5+Math.random()*.4,.9,{type:'bandpass',from:1400+Math.random()*1800,to:900+Math.random()*900,q:9});
      out.connect(wet);return 1.6;
    });
  }

  /** Cracking earth and a funeral bell, when she rises. */
  rise():void {
    this.voice(.7,(context,out,wet)=>{
      this.burst(context,out,0,.9,1,{type:'lowpass',from:700,to:90,q:.8});
      for(let i=0;i<6;i++)this.burst(context,out,.08+i*.11+Math.random()*.06,.07,.8,{type:'highpass',from:900+Math.random()*1200});
      this.tone(context,out,'sine',52,0,1.4,.9,34);
      out.connect(wet);return 1.6;
    });
    setTimeout(()=>this.bell(),700);
  }
  private bell():void {
    this.voice(.5,(context,out,wet)=>{
      for(const [ratio,peak,length] of [[1,.9,5],[2.01,.5,4],[2.76,.45,3.4],[5.4,.2,2],[8.9,.1,1.2]] as const)this.tone(context,out,'sine',146.8*ratio,0,length,peak);
      out.connect(wet);return 5.2;
    });
  }
  /** A dragging step: a dull rub with a soft thud. */
  step():void {
    this.voice(.34,(context,out)=>{this.burst(context,out,0,.35,.8,{type:'lowpass',from:500,to:160});this.tone(context,out,'sine',70,0,.18,.6,45);return .5;});
  }
  /** The scythe cutting the air. */
  whoosh():void {
    this.voice(.55,(context,out,wet)=>{this.burst(context,out,0,.75,1,{type:'bandpass',from:350,to:2600,q:1.4});out.connect(wet);return .9;});
  }
  /** The blow: heavy, low and metallic. */
  impact():void {
    this.voice(.95,(context,out,wet)=>{
      this.tone(context,out,'sine',78,0,.9,1,28);
      this.tone(context,out,'square',410,0,.35,.25,180);this.tone(context,out,'sawtooth',1180,0,.22,.12,600);
      this.burst(context,out,0,.5,.8,{type:'lowpass',from:2400,to:140});
      out.connect(wet);return 1.2;
    });
  }
  /** A reverberating laugh that fades: pulses of a vibrating voice through formants. */
  laugh(durationMs:number):void {
    const seconds=durationMs/1000;
    this.voice(.5,(context,out,wet)=>{
      const pulses=Math.floor(seconds*3.4);
      for(let i=0;i<pulses;i++){
        const start=i*(seconds/pulses),fall=1-i/pulses*.85,base=95+Math.random()*30;
        for(const [formant,q] of [[620,6],[1250,8]] as const){
          const oscillator=context.createOscillator(),vibrato=context.createOscillator(),vibratoGain=context.createGain(),filter=context.createBiquadFilter(),gain=context.createGain(),at=context.currentTime+start;
          oscillator.type='sawtooth';oscillator.frequency.setValueAtTime(base*1.5,at);oscillator.frequency.exponentialRampToValueAtTime(base,at+.32);
          vibrato.frequency.value=9;vibratoGain.gain.value=6;vibrato.connect(vibratoGain);vibratoGain.connect(oscillator.frequency);
          filter.type='bandpass';filter.frequency.value=formant+Math.random()*120;filter.Q.value=q;
          gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.55*fall,at+.05);gain.gain.exponentialRampToValueAtTime(.001,at+.36);
          oscillator.connect(filter);filter.connect(gain);gain.connect(out);oscillator.start(at);vibrato.start(at);oscillator.stop(at+.4);vibrato.stop(at+.4);
        }
      }
      out.connect(wet);return seconds+2.5;
    });
  }
  /** She goes: a rising mist, whispers and then silence. */
  leave():void {
    this.voice(.6,(context,out,wet)=>{
      this.burst(context,out,0,3.4,.8,{type:'bandpass',from:240,to:1700,q:.9});
      for(let i=0;i<5;i++)this.burst(context,out,.5+i*.5,.5,.5,{type:'bandpass',from:1600,to:1000,q:9});
      out.connect(wet);return 4;
    });
  }

  /** Total silence for a second, then a heartbeat that keeps going until `stopBeat`. Only the victim hears it. */
  blackout():void {
    this.stopBeat();
    this.beat=setTimeout(()=>this.heartbeat(62),1000);
  }
  /** A beat that repeats at `bpm`; ask again with another rate to change it. */
  heartbeat(bpm:number):void {
    if(this.beat)clearTimeout(this.beat);
    const once=()=>{
      this.voice(.9,(context,out)=>{this.tone(context,out,'sine',62,0,.18,1,38);this.tone(context,out,'sine',55,.22,.2,.7,34);return .5;},false);
      this.beat=setTimeout(once,60000/bpm);
    };
    once();
  }
  stopBeat():void {if(this.beat){clearTimeout(this.beat);this.beat=undefined;}}
  /** The clock of the attempt: a dry tick. */
  tick():void {this.voice(.3,(context,out)=>{this.tone(context,out,'square',1800,0,.025,.5);this.tone(context,out,'sine',420,0,.05,.4);return .12;},false);}
  /** The sequence lighting a button, or a press of it: each button has its own pitch. */
  note(button:number,length=.3):void {
    const frequency=[262,330,392,523][button]??262;
    this.voice(.38,(context,out)=>{this.tone(context,out,'triangle',frequency,0,length,.8);return length+.1;},false);
  }
  /** A dry snap on a mistake. */
  error():void {
    this.voice(.8,(context,out,wet)=>{this.burst(context,out,0,.12,1,{type:'highpass',from:1500});this.tone(context,out,'sawtooth',160,0,.5,.7,50);out.connect(wet);return .8;},false);
  }
  /** A breath in and a bell, when it is right. */
  success():void {
    this.stopBeat();
    this.voice(.6,(context,out,wet)=>{
      this.burst(context,out,0,.9,.7,{type:'bandpass',from:500,to:2200,q:.8});
      for(const [ratio,peak] of [[1,.8],[2.01,.4],[3,.2]] as const)this.tone(context,out,'sine',523*ratio,.5,2.6,peak);
      out.connect(wet);return 3.4;
    },false);
  }
  /** Everything stops (the death ended, or the room was left). */
  stopAll():void {this.stopBeat();this.sceneEnd();}
  destroy():void {this.stopAll();void this.context?.close();this.context=undefined;}
}
