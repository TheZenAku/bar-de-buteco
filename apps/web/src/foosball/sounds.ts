/**
 * The pebolim table's sounds, synthesized on the spot (no files to load): the ball off a figure (louder the harder it was
 * struck), off the wooden walls and the metal posts, a goal dropping into the box with the bar cheering, the referee's
 * whistle, the countdown, and the end of a match. `volume` is the game's general volume; the table's own switch mutes them.
 */
export function createFoosballSounds(volume:()=>number){
  let context:AudioContext|undefined,enabled=true,noiseBuffer:AudioBuffer|undefined;
  function audio():AudioContext|undefined {
    if(!enabled||volume()<=0)return;
    try{context??=new AudioContext();if(context.state==='suspended')void context.resume();}catch{return;}
    return context;
  }
  function out(ctx:AudioContext,level:number,at:number,length:number,attack=.003):GainNode {
    const gain=ctx.createGain();gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(Math.max(.0002,level*volume()*.55),at+attack);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    gain.connect(ctx.destination);return gain;
  }
  function noise(ctx:AudioContext):AudioBuffer {
    if(noiseBuffer)return noiseBuffer;
    noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    return noiseBuffer;
  }
  /** Filtered noise: wood, felt, a crowd. */
  function hiss(delayMs:number,length:number,from:number,to:number,level:number,q=1.2,attack=.003):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter();
    source.buffer=noise(ctx);filter.type='bandpass';filter.Q.value=q;
    filter.frequency.setValueAtTime(from,at);filter.frequency.exponentialRampToValueAtTime(to,at+length);
    source.connect(filter).connect(out(ctx,level,at,length,attack));source.start(at,Math.random());source.stop(at+length+.05);
  }
  function tone(delayMs:number,frequency:number,length:number,level:number,type:OscillatorType='sine',slideTo?:number):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,osc=ctx.createOscillator();
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);
    if(slideTo)osc.frequency.exponentialRampToValueAtTime(slideTo,at+length);
    osc.connect(out(ctx,level,at,length));osc.start(at);osc.stop(at+length+.02);
  }
  /** A pea whistle: a trill around 2.9 kHz. */
  function whistle(delayMs:number,length:number,level=.16):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,osc=ctx.createOscillator(),trill=ctx.createOscillator(),depth=ctx.createGain();
    osc.type='square';osc.frequency.value=2900;trill.frequency.value=28;depth.gain.value=160;
    trill.connect(depth).connect(osc.frequency);
    const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=2900;filter.Q.value=4;
    osc.connect(filter).connect(out(ctx,level,at,length,.02));osc.start(at);trill.start(at);osc.stop(at+length+.05);trill.stop(at+length+.05);
  }
  // Hits come in bursts (a frame carries several): a few per moment are enough.
  let lastHit=0;
  const level=(speed:number)=>Math.min(1,.18+speed/5);
  return {
    get enabled(){return enabled;},
    set enabled(value:boolean){enabled=value;},
    /** Called from a click, so the browser lets the audio start. */
    unlock():void {audio();},
    /** The ball off a figure: a dull rubber "toc", a hard strike adds a crack. */
    hit(kind:'man'|'kick'|'wall'|'post',speed:number):void {
      const now=performance.now();if(now-lastHit<28)return;lastHit=now;
      const l=level(speed);
      if(kind==='kick'){tone(0,140+speed*25,.09,.5*l,'triangle',70);hiss(0,.05,2600,900,.55*l);}
      else if(kind==='man')tone(0,260+speed*40,.06,.32*l,'triangle',150);
      else if(kind==='wall'){hiss(0,.07,1400,500,.6*l,2.5);tone(0,180,.07,.18*l,'sine',120);}
      else {tone(0,1850,.28,.16*l,'sine',1780);tone(0,2730,.18,.08*l);}
    },
    /** The countdown before a serve, and the whistle as the ball comes alive. */
    count():void {tone(0,880,.12,.12,'sine');},
    whistle():void {whistle(0,.32);},
    /** In: the ball drops into the box (two knocks), and the bar shouts. */
    goal(mine:boolean):void {
      hiss(0,.09,900,300,.9,1.5);hiss(110,.08,800,280,.6,1.5);
      hiss(80,1.6,700,1100,mine?.55:.32,.6,.18);hiss(120,1.4,1600,2200,mine?.3:.18,.8,.25);
      if(mine)[523,659,784,1047].forEach((f,i)=>tone(260+i*90,f,.3,.15,'triangle'));
    },
    /** The end: three whistles, and a win or a loss for whoever played. */
    final(result:'win'|'loss'|''):void {
      whistle(0,.22);whistle(300,.22);whistle(600,.7);
      if(result==='win')[523,659,784,1047,1319].forEach((f,i)=>tone(1400+i*110,f,.4,.17,'triangle'));
      if(result==='loss')tone(1400,262,.5,.18,'triangle',175);
    },
    /** A foul or a pause: a short double whistle. */
    foul():void {whistle(0,.14);whistle(200,.3);},
    chip():void {tone(0,3300,.05,.12,'triangle');tone(28,4300,.05,.1,'triangle');},
  };
}
export type FoosballSounds=ReturnType<typeof createFoosballSounds>;
