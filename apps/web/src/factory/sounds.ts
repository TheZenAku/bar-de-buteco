/**
 * The plant's sounds, synthesized on the spot (no files to load), like the tables' (blackjack/sounds.ts): the panel's
 * clicks and answers, the clock-in chime, the PPE, a bag lifted and poured, water, the coins of a wage, the alarms; and
 * the plant's own hum that follows the machines that are running and fades with the distance to them.
 * `volume` is the game's general volume (0–1). Nothing here has been heard by ear yet: the levels are a first guess.
 */
export function createFactorySounds(volume:()=>number){
  let context:AudioContext|undefined,master:GainNode|undefined,enabled=true;
  function audio():AudioContext|undefined {
    if(!enabled||volume()<=0)return;
    try{
      if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);}
      if(context.state==='suspended')void context.resume();
    }catch{return;}
    master!.gain.value=volume();
    return context;
  }
  function envelope(ctx:AudioContext,at:number,length:number,level:number,attack=.006):GainNode {
    const gain=ctx.createGain();gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(level*.5,at+attack);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    gain.connect(master!);return gain;
  }
  /** A pitched note; `slide` glides to that frequency by the end. */
  function tone(delayMs:number,frequency:number,length:number,level:number,type:OscillatorType='sine',slide?:number):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,osc=ctx.createOscillator();
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);
    if(slide)osc.frequency.exponentialRampToValueAtTime(slide,at+length);
    osc.connect(envelope(ctx,at,length,level));osc.start(at);osc.stop(at+length+.03);
  }
  /** Filtered noise: powder, cloth, water. `from`/`to`: the band's centre at the start and end. */
  function noise(delayMs:number,length:number,from:number,to:number,level:number,q=1.2,type:BiquadFilterType='bandpass'):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter();
    source.buffer=buffer;filter.type=type;filter.Q.value=q;
    filter.frequency.setValueAtTime(from,at);filter.frequency.exponentialRampToValueAtTime(Math.max(20,to),at+length);
    source.connect(filter).connect(envelope(ctx,at,length,level,Math.min(.05,length/4)));source.start(at);source.stop(at+length+.03);
  }

  // The plant's hum: three always-running voices whose loudness is set from outside.
  let hum:{dryer:GainNode;agitator:GainNode;bagging:GainNode}|undefined;
  function ensureHum():typeof hum {
    const ctx=audio();if(!ctx)return;
    if(hum)return hum;
    const voice=(source:AudioNode):GainNode=>{const gain=ctx.createGain();gain.gain.value=0;source.connect(gain).connect(master!);return gain;};
    const loop=(seconds:number)=>{const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.start();return source;};
    // Dryer: a low rushing of air, slowly breathing.
    const air=ctx.createBiquadFilter();air.type='lowpass';air.frequency.value=420;loop(2).connect(air);
    const breath=ctx.createOscillator(),breathDepth=ctx.createGain();breath.frequency.value=.35;breathDepth.gain.value=120;breath.connect(breathDepth).connect(air.frequency);breath.start();
    // Agitators: two detuned low saws through a low-pass, the motor's drone.
    const drone=ctx.createBiquadFilter();drone.type='lowpass';drone.frequency.value=260;
    for(const frequency of [54,81.5]){const osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.value=frequency;osc.connect(drone);osc.start();}
    // Bagging machine: a rattling, faster rustle.
    const rattle=ctx.createBiquadFilter();rattle.type='bandpass';rattle.frequency.value=1700;rattle.Q.value=.7;loop(1).connect(rattle);
    const chop=ctx.createOscillator(),chopDepth=ctx.createGain();chop.frequency.value=7;chopDepth.gain.value=700;chop.connect(chopDepth).connect(rattle.frequency);chop.start();
    hum={dryer:voice(air),agitator:voice(drone),bagging:voice(rattle)};return hum;
  }

  return {
    get enabled(){return enabled;},
    set enabled(value:boolean){enabled=value;if(!value)this.hum(0,0,0);},
    /** Called from a click, so the browser lets the audio start. */
    unlock():void {audio();},
    click():void {tone(0,1500,.03,.12,'square');},
    /** An order the plant accepted. */
    ok():void {tone(0,660,.1,.2,'triangle');tone(70,990,.14,.18,'triangle');},
    /** An order it refused. */
    deny():void {tone(0,196,.2,.22,'sawtooth',150);tone(60,185,.2,.16,'sawtooth',140);},
    /** The panel's tab or a quiet confirmation. */
    tick():void {tone(0,2100,.02,.07,'square');},
    clockIn():void {[523,659,784].forEach((f,i)=>tone(i*110,f,.3,.2,'triangle'));},
    clockOut():void {[784,659,523].forEach((f,i)=>tone(i*110,f,.3,.18,'triangle'));},
    ppe():void {noise(0,.14,3000,1500,.4,.8);noise(120,.1,2400,1200,.35,.8);tone(240,1800,.05,.1,'square');tone(280,1200,.06,.1,'square');},
    pick():void {noise(0,.18,900,500,.5,.6);tone(120,120,.12,.3,'sine',70);},
    pour():void {noise(0,.9,1400,700,.55,.5,'bandpass');noise(100,.8,3500,2000,.25,.7,'highpass');tone(0,90,.25,.2,'sine',60);},
    water():void {noise(0,.7,2600,1800,.35,.6);noise(60,.6,900,1500,.2,.5);},
    valve():void {tone(0,140,.18,.25,'square',90);noise(0,.2,700,400,.2);},
    seam():void {for(let i=0;i<5;i++)tone(i*70,900+(i%2)*120,.04,.12,'square');},
    stack():void {tone(0,100,.18,.35,'sine',55);noise(0,.1,500,250,.35,.6);},
    coin(delayMs=0):void {tone(delayMs,1568,.09,.2,'triangle');tone(delayMs+80,2093,.22,.22,'triangle');},
    /** A step of the process finished by itself. */
    stage():void {tone(0,784,.12,.14,'sine');tone(100,1047,.2,.14,'sine');},
    warning():void {tone(0,880,.12,.2,'square');tone(160,880,.12,.2,'square');},
    /** The intercom: two rising chimes, like a doorbell. */
    doorbell():void {tone(0,880,.22,.2,'sine');tone(240,1175,.4,.2,'sine');tone(900,880,.22,.2,'sine');tone(1140,1175,.4,.2,'sine');},
    alarm():void {for(let i=0;i<3;i++){tone(i*220,1040,.1,.22,'square');tone(i*220+110,780,.1,.22,'square');}},
    emergency():void {for(let i=0;i<4;i++)tone(i*320,420,.3,.3,'sawtooth',640);},
    /** The hum's loudness for each machine group, 0–1 (nearness × running); call a few times a second. */
    hum(dryer:number,agitator:number,bagging:number):void {
      const voices=dryer+agitator+bagging>0.001?ensureHum():hum;if(!voices||!context)return;
      const now=context.currentTime;
      voices.dryer.gain.setTargetAtTime(dryer*.35,now,.3);voices.agitator.gain.setTargetAtTime(agitator*.22,now,.3);voices.bagging.gain.setTargetAtTime(bagging*.12,now,.3);
    },
  };
}
export type FactorySounds=ReturnType<typeof createFactorySounds>;
