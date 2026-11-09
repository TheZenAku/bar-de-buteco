/** A C-major pentatonic, so walking down a list plays a little tune instead of one tick over and over. */
const SCALE=[0,2,4,7,9,12,14,16];
const hz=(semitones:number,base=1046.5)=>base*2**(semitones/12);

/**
 * The menu's sounds (pause-menu.ts), synthesised like the phone's (phone/core.ts PhoneSounds): no audio files. Short and
 * soft, so a hundred moves through the lists never tire: a tick per row, pitched by its place; two notes for a section;
 * a rising pair to confirm and a falling one to go back; a breath of filtered noise to open and close.
 */
export class MenuSounds {
  private context?:AudioContext;
  private out?:GainNode;
  private noiseBuffer?:AudioBuffer;
  private lastMove=0;
  constructor(private volume:()=>number){}
  private audio():AudioContext|undefined {
    try{
      if(!this.context){
        this.context=new AudioContext();
        // A gentle compressor keeps quick runs of ticks from stacking into a click.
        const squeeze=this.context.createDynamicsCompressor();squeeze.threshold.value=-18;squeeze.ratio.value=4;squeeze.attack.value=.002;squeeze.release.value=.08;
        this.out=this.context.createGain();this.out.connect(squeeze).connect(this.context.destination);
      }
    }catch{return;}
    if(this.context.state==='suspended')void this.context.resume().catch(()=>{});
    return this.context;
  }
  private level():number {const v=this.volume();return Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;}
  /** A struck note: a quick attack, an exponential tail, and a faint upper partial that gives it a glassy edge. */
  private note(frequency:number,at:number,length:number,level:number,type:OscillatorType='sine',partial=.12):void {
    const context=this.audio(),volume=level*this.level();if(!context||!this.out||volume<=0)return;
    const start=context.currentTime+at,gain=context.createGain();
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.004);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
    gain.connect(this.out);
    for(const [ratio,share] of [[1,1],[3,partial]] as const){
      const oscillator=context.createOscillator(),amount=context.createGain();
      oscillator.type=type;oscillator.frequency.value=frequency*ratio;amount.gain.value=share;
      oscillator.connect(amount).connect(gain);oscillator.start(start);oscillator.stop(start+length+.03);
    }
  }
  private noise():AudioBuffer|undefined {
    const context=this.audio();if(!context)return;
    if(!this.noiseBuffer){
      const length=Math.floor(context.sampleRate*.5),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
      this.noiseBuffer=buffer;
    }
    return this.noiseBuffer;
  }
  /** Filtered noise whose band slides from `from` to `to` Hz: the air of a panel sliding in or out. */
  private breath(from:number,to:number,length:number,level:number,at=0):void {
    const context=this.audio(),buffer=this.noise(),volume=level*this.level();if(!context||!buffer||!this.out||volume<=0)return;
    const start=context.currentTime+at,source=context.createBufferSource(),band=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;band.type='bandpass';band.Q.value=1.4;
    band.frequency.setValueAtTime(from,start);band.frequency.exponentialRampToValueAtTime(to,start+length);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+length*.35);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
    source.connect(band).connect(gain).connect(this.out);source.start(start);source.stop(start+length+.02);
  }
  /** A hair of noise above 4 kHz: the click of a switch under the note. */
  private click(level:number,at=0):void {
    const context=this.audio(),buffer=this.noise(),volume=level*this.level();if(!context||!buffer||!this.out||volume<=0)return;
    const start=context.currentTime+at,source=context.createBufferSource(),high=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;high.type='highpass';high.frequency.value=4200;
    gain.gain.setValueAtTime(volume,start);gain.gain.exponentialRampToValueAtTime(.0001,start+.012);
    source.connect(high).connect(gain).connect(this.out);source.start(start,Math.random()*.3);source.stop(start+.02);
  }
  /** Called in the gesture that opens the menu: a browser starts audio only from one. */
  unlock():void {this.audio();}
  open():void {this.breath(380,2600,.24,.07);this.note(hz(-12-5),.03,.42,.05,'sine',.05);this.note(hz(-12+2),.07,.5,.045,'sine',.08);}
  close():void {this.breath(2200,320,.2,.06);this.note(hz(-12-5),0,.3,.04,'sine',.05);}
  /** One row: the pitch climbs with its place in the list, wrapping every octave and a half. */
  move(index:number):void {
    const now=performance.now();if(now-this.lastMove<28)return;this.lastMove=now;
    this.click(.05);this.note(hz(SCALE[((index%SCALE.length)+SCALE.length)%SCALE.length]!),0,.07,.03,'triangle',.08);
  }
  /** Another section: two notes, up for the next one and down for the previous. */
  tab(direction:number):void {
    const [a,b]=direction<0?[7,0]:[0,7];
    this.breath(900,1800,.12,.025);this.note(hz(a-5),0,.11,.04,'triangle');this.note(hz(b-5),.055,.16,.04,'triangle');
  }
  select():void {this.click(.06);this.note(hz(-5),0,.18,.05,'sine',.2);this.note(hz(2),.06,.32,.05,'sine',.2);}
  back():void {this.note(hz(0),0,.1,.035,'triangle');this.note(hz(-5),.05,.16,.035,'triangle');}
  toggle(on:boolean):void {this.click(.07);if(on){this.note(hz(-3),0,.09,.04,'triangle');this.note(hz(4),.045,.16,.045,'triangle');}else{this.note(hz(4),0,.09,.04,'triangle');this.note(hz(-3),.045,.16,.035,'triangle');}}
  /** A slider or a choice stepped: higher as the value grows, so the ear follows the bar. */
  step(share:number):void {
    const now=performance.now();if(now-this.lastMove<22)return;this.lastMove=now;
    this.click(.04);this.note(hz(-7+Math.max(0,Math.min(1,share))*19),0,.06,.03,'triangle',.05);
  }
  /** Not possible here (a disabled row, a key with nothing to do): a soft low knock. */
  deny():void {this.note(140,0,.12,.06,'sine',.02);this.note(110,.02,.14,.04,'triangle',0);}
}
