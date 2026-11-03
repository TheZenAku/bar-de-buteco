// The collection's sounds, made here rather than files: a card's snap is a burst of noise, a new card's chime a few bells, more of them for a rarer one.
let context:AudioContext|undefined,noise:AudioBuffer|undefined;
function audio():AudioContext|undefined {
  try{
    context??=new AudioContext();
    if(context.state==='suspended')void context.resume();
    if(!noise){
      noise=context.createBuffer(1,context.sampleRate/4,context.sampleRate);
      const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    return context;
  }catch{return undefined;}
}
function snap(volume:number,frequency:number,duration:number,at=0):void {
  const ctx=audio();if(!ctx||!noise||volume<=0)return;
  const when=ctx.currentTime+at,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=noise;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.9;
  gain.gain.setValueAtTime(volume,when);gain.gain.exponentialRampToValueAtTime(.0005,when+duration);
  source.connect(filter).connect(gain).connect(ctx.destination);source.start(when);source.stop(when+duration);
}
function bell(volume:number,frequency:number,at:number,duration=.9):void {
  const ctx=audio();if(!ctx||volume<=0)return;
  const when=ctx.currentTime+at,gain=ctx.createGain();
  gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(volume,when+.012);gain.gain.exponentialRampToValueAtTime(.0005,when+duration);
  gain.connect(ctx.destination);
  for(const [ratio,share] of [[1,1],[2.01,.34],[3.02,.12]] as const){
    const osc=ctx.createOscillator(),partial=ctx.createGain();
    osc.frequency.value=frequency*ratio;partial.gain.value=share;
    osc.connect(partial).connect(gain);osc.start(when);osc.stop(when+duration);
  }
}
// A major chord going up: the rarer the card (0 to 4), the more of it rings.
const CHIME=[523.25,659.25,783.99,1046.5,1318.5,1568];
export const cardSounds={
  flick(volume:number){snap(volume*.16,2600,.07);},
  flip(volume:number){snap(volume*.2,1900,.05);snap(volume*.16,3100,.07,.09);},
  deal(volume:number,cards:number){for(let i=0;i<cards;i++)snap(volume*.11,2300+i*90,.06,i*.045);},
  equip(volume:number){snap(volume*.2,1200,.09);bell(volume*.13,659.25,.02,.4);bell(volume*.11,987.77,.09,.5);},
  skill(volume:number){bell(volume*.13,783.99,0,.5);bell(volume*.12,1174.66,.08,.6);},
  reveal(volume:number,rarity:number){
    snap(volume*.26,1400,.16);
    const notes=2+rarity;
    for(let i=0;i<notes;i++)bell(volume*.14,CHIME[i]!,.1+i*.075,.8+rarity*.2);
  },
};
