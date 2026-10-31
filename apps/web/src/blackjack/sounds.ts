/**
 * The table's sounds, synthesized on the spot (no files to load): a card sliding off the shoe, the hole card turning,
 * chips, the player's turn, a win, a natural and a loss. Scheduled on the audio clock, so a dealt row of cards sounds
 * in step with its animation. `volume` is the game's general volume; the table's own switch mutes them.
 */
export function createTableSounds(volume:()=>number){
  let context:AudioContext|undefined,enabled=true;
  function audio():AudioContext|undefined {
    if(!enabled||volume()<=0)return;
    try{context??=new AudioContext();if(context.state==='suspended')void context.resume();}catch{return;}
    return context;
  }
  function out(ctx:AudioContext,level:number,at:number,length:number):GainNode {
    const gain=ctx.createGain();gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(level*volume()*.5,at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    gain.connect(ctx.destination);return gain;
  }
  /** Filtered noise: paper and felt. */
  function noise(delayMs:number,length:number,from:number,to:number,level:number):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter();
    source.buffer=buffer;filter.type='bandpass';filter.Q.value=1.4;
    filter.frequency.setValueAtTime(from,at);filter.frequency.exponentialRampToValueAtTime(to,at+length);
    source.connect(filter).connect(out(ctx,level,at,length));source.start(at);source.stop(at+length+.02);
  }
  function tone(delayMs:number,frequency:number,length:number,level:number,type:OscillatorType='sine',slideTo?:number):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,osc=ctx.createOscillator();
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);
    if(slideTo)osc.frequency.exponentialRampToValueAtTime(slideTo,at+length);
    osc.connect(out(ctx,level,at,length));osc.start(at);osc.stop(at+length+.02);
  }
  return {
    get enabled(){return enabled;},
    set enabled(value:boolean){enabled=value;},
    /** Called from a click, so the browser lets the audio start. */
    unlock():void {audio();},
    card(delayMs=0):void {noise(delayMs,.09,3800,900,.55);},
    flip(delayMs=0):void {noise(delayMs,.05,2600,1400,.45);noise(delayMs+70,.06,1800,700,.4);},
    chip(delayMs=0):void {tone(delayMs,3300,.05,.18,'triangle');tone(delayMs+28,4300,.05,.14,'triangle');noise(delayMs,.03,6000,4000,.2);},
    turn():void {tone(0,880,.18,.22);tone(90,1320,.22,.16);},
    win():void {[523,659,784].forEach((f,i)=>tone(i*90,f,.28,.22,'triangle'));},
    natural():void {[523,659,784,1047].forEach((f,i)=>tone(i*85,f,.34,.24,'triangle'));tone(380,1568,.5,.12);},
    push():void {tone(0,440,.2,.15,'sine');},
    lose():void {tone(0,262,.36,.2,'triangle',175);},
  };
}
export type TableSounds=ReturnType<typeof createTableSounds>;
