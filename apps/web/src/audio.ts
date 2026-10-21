export class BarAudio {
  private context?:AudioContext;
  private timer?:ReturnType<typeof setInterval>;
  enabled=false;
  private party=false;
  private beat=0;
  toggle():boolean {
    this.enabled=!this.enabled;
    if(this.enabled){this.context??=new AudioContext();void this.context.resume();this.timer=setInterval(()=>this.playBeat(),280);}
    else {clearInterval(this.timer);this.timer=undefined;}
    return this.enabled;
  }
  setParty(value:boolean):void {this.party=value;}
  private playBeat():void {
    if(!this.context||!this.enabled)return;
    const notes=this.party?[130.81,164.81,196,261.63,196,164.81,146.83,196]:[110,0,130.81,0,146.83,0,130.81,0];
    const frequency=notes[this.beat++%notes.length];
    if(!frequency)return;
    const oscillator=this.context.createOscillator(),gain=this.context.createGain(),now=this.context.currentTime;
    oscillator.type='sine';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(0.035,now+0.015);gain.gain.exponentialRampToValueAtTime(0.001,now+0.22);
    oscillator.connect(gain).connect(this.context.destination);oscillator.start(now);oscillator.stop(now+0.25);
  }
}
