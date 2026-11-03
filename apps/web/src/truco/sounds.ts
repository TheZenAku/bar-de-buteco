import {createTableSounds} from '../blackjack/sounds';

/**
 * The table's sounds: the blackjack's for cards, the turn and the end, and three of its own, synthesized the same way: the
 * riffle of a shuffle, the thump of a call hitting the table, and a soft tick for a face being made.
 */
export function createTrucoSounds(volume:()=>number){
  const table=createTableSounds(volume);
  let context:AudioContext|undefined;
  function audio():AudioContext|undefined {
    if(!table.enabled||volume()<=0)return;
    try{context??=new AudioContext();if(context.state==='suspended')void context.resume();}catch{return;}
    return context;
  }
  function out(ctx:AudioContext,level:number,at:number,length:number):GainNode {
    const gain=ctx.createGain();gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(level*volume()*.5,at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    gain.connect(ctx.destination);return gain;
  }
  function tone(delayMs:number,from:number,to:number,length:number,level:number,type:OscillatorType='sine'):void {
    const ctx=audio();if(!ctx)return;
    const at=ctx.currentTime+delayMs/1000,osc=ctx.createOscillator();
    osc.type=type;osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(to,at+length);
    osc.connect(out(ctx,level,at,length));osc.start(at);osc.stop(at+length+.02);
  }
  return {
    get enabled(){return table.enabled;},
    set enabled(value:boolean){table.enabled=value;},
    unlock():void {table.unlock();},
    card:table.card,flip:table.flip,turn:table.turn,natural:table.natural,lose:table.lose,
    shuffle():void {for(let i=0;i<7;i++)table.card(i*85);},
    call():void {tone(0,150,48,.42,.55,'triangle');tone(10,620,1240,.26,.16,'sawtooth');tone(160,930,1860,.3,.12,'sawtooth');},
    signal():void {tone(0,1300,1000,.07,.07);},
  };
}
