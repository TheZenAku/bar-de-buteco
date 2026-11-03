/**
 * The pool table's sounds, synthesized on the spot (no files to load): the click of ball on ball (sharper the harder),
 * the dull knock of a cushion, a ball dropping into a pocket and rolling down, the cue's tip, a hop on the slate, a foul,
 * the player's turn and the end of a rack. `volume` is the game's general volume; the table's own switch mutes them.
 */
export function createPoolSounds(volume:()=>number){
  let context:AudioContext|undefined,enabled=true,noiseBuffer:AudioBuffer|undefined;
  function audio():AudioContext|undefined {
    if(!enabled||volume()<=0)return;
    try{context??=new AudioContext();if(context.state==='suspended')void context.resume();}catch{return;}
    return context;
  }
  function out(ctx:AudioContext,level:number,at:number,length:number,attack=.002):GainNode {
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
  function hiss(delayMs:number,length:number,from:number,to:number,level:number,q=1.2,attack=.002):void {
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
  let lastClick=0;
  const level=(speed:number)=>Math.min(1,.12+speed/4);
  return {
    get enabled(){return enabled;},
    set enabled(value:boolean){enabled=value;},
    /** Called from a click, so the browser lets the audio start. */
    unlock():void {audio();},
    /** A sound of a stroke's playback: kind 0 ball, 1 cushion, 2 pocket, 3 the cue's tip, 4 the slate; speed in m/s. */
    hit(kind:number,speed:number):void {
      const now=performance.now(),l=level(speed);
      if(kind===0){
        // Phenolic balls: a bright, very short click (several in a break, a few are enough).
        if(now-lastClick<12)return;lastClick=now;
        tone(0,2400+speed*400,.035,.55*l,'triangle',1900);hiss(0,.03,5200,3000,.45*l,2);
      }else if(kind===1){hiss(0,.08,700,260,.55*l,1.6);tone(0,140,.07,.3*l,'sine',90);}
      else if(kind===2){
        // Into the pocket: the drop, a knock in the gutter, rolling away.
        tone(0,210,.12,.5,'triangle',120);hiss(30,.09,900,400,.5,1.4);hiss(140,.45,500,260,.22,.8,.05);tone(160,95,.18,.25,'sine',70);
      }else if(kind===3){tone(0,520+speed*60,.05,.5*l,'triangle',300);hiss(0,.035,2600,1300,.35*l,2.2);}
      else if(kind===4)hiss(0,.06,1100,420,.35*l,1.5);
    },
    /** It is the player's turn. */
    turn():void {tone(0,660,.12,.12,'sine');tone(110,990,.16,.1,'sine');},
    /** A foul: a low double note. */
    foul():void {tone(0,220,.16,.22,'square',180);tone(190,165,.24,.2,'square',130);},
    /** A ball of the player's dropped (on top of the pocket's sound): a soft chime. */
    pot():void {tone(60,1175,.18,.08,'sine');},
    /** The end of a rack, won or lost; '' for someone watching. */
    final(result:'win'|'loss'|''):void {
      if(result!=='loss')[523,659,784,1047,1319].forEach((f,i)=>tone(i*110,f,.4,result?.17:.1,'triangle'));
      else{tone(0,392,.3,.16,'triangle');tone(260,330,.3,.16,'triangle');tone(520,262,.6,.18,'triangle',175);}
    },
  };
}
export type PoolSounds=ReturnType<typeof createPoolSounds>;
