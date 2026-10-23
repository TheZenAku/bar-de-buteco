import catalog from './assets/ambient.json';
import {AMBIENT_MIX,AmbientQueue,fadeCurve,type AmbientTrack} from './ambient-mix';

interface Deck {
  media:HTMLAudioElement;gain:GainNode;source:MediaElementAudioSourceNode;
  track?:AmbientTrack;generation:number;starting:boolean;started:boolean;ending:boolean;
}
interface Transition {from:Deck;to:Deck;until:number;}
const KEY='bar:ambient:enabled';
const unit=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
function hold(parameter:AudioParam,time:number):void {
  if(typeof parameter.cancelAndHoldAtTime==='function')parameter.cancelAndHoldAtTime(time);
  else {const value=parameter.value;parameter.cancelScheduledValues(0);parameter.setValueAtTime(value,time);}
}

/** Two streamed recordings, mixed locally. No decoding an entire playlist into RAM. */
export class BarAudio {
  private context?:AudioContext;
  private bus?:GainNode;
  private decks:Deck[]=[];
  private current?:Deck;
  private transition?:Transition;
  private timer?:ReturnType<typeof setInterval>;
  private pauseTimer?:ReturnType<typeof setTimeout>;
  private queue:AmbientQueue;
  private failed=new Set<string>();
  private active=false;
  private preference=true;
  private suppressed=false;
  private level=1;
  private target=-1;
  private blocked=false;
  private disposed=false;
  constructor(tracks:readonly AmbientTrack[]=catalog){
    this.queue=new AmbientQueue(tracks);
    try{this.preference=localStorage.getItem(KEY)!=='false';}catch{/* In-memory preferences still work. */}
    document.addEventListener('visibilitychange',this.visibility);
    window.addEventListener('pagehide',this.pageHide);
    window.addEventListener('pageshow',this.visibility);
  }
  get enabled():boolean{return this.preference;}
  get volume():number{return this.level;}
  set volume(value:number){this.level=unit(value);this.update();}
  setSuppressed(value:boolean):void {if(this.suppressed!==value){this.suppressed=value;this.mix();}}
  toggle():boolean {
    this.preference=!this.preference;
    try{localStorage.setItem(KEY,String(this.preference));}catch{}
    if(this.preference){this.failed.clear();this.unlock();}
    this.update();return this.preference;
  }
  /** Called in the Enter button's gesture, before loading the world asynchronously. */
  unlock=():void=>{
    if(this.disposed)return;
    try{
      this.createGraph();
      void this.context!.resume().then(()=>{if(this.disposed)return;this.blocked=false;this.update();}).catch(()=>{this.blocked=true;});
    }catch{/* An unavailable audio device must not prevent entering the game. */}
  };
  setActive(value:boolean):void {
    if(this.active===value)return;
    this.active=value;
    if(value){document.addEventListener('pointerdown',this.gesture);document.addEventListener('keydown',this.gesture);}
    else {document.removeEventListener('pointerdown',this.gesture);document.removeEventListener('keydown',this.gesture);}
    this.update();
  }
  private gesture=():void=>{if(this.wanted()&&(this.blocked||this.context?.state!=='running'))this.unlock();};
  private visibility=():void=>this.update();
  private pageHide=():void=>{
    if(this.context&&this.bus){hold(this.bus.gain,this.context.currentTime);this.bus.gain.setValueAtTime(0,this.context.currentTime);this.target=-1;}
    this.pause(true);
  };
  private wanted():boolean{return this.active&&this.preference&&this.level>0&&!document.hidden&&!this.disposed;}
  private createGraph():void {
    if(this.context)return;
    const context=this.context=new AudioContext();
    this.bus=context.createGain();this.bus.gain.value=0;
    // Remove inaudible/low-frequency handling rumble, leaving headroom for voices.
    const filter=context.createBiquadFilter();filter.type='highpass';filter.frequency.value=65;filter.Q.value=.5;
    this.bus.connect(filter).connect(context.destination);
    this.decks=Array.from({length:2},()=>{
      const media=new Audio();media.preload='auto';
      const source=context.createMediaElementSource(media),gain=context.createGain();gain.gain.value=0;
      source.connect(gain).connect(this.bus!);
      return {media,source,gain,generation:0,starting:false,started:false,ending:false};
    });
  }
  private update():void {
    if(this.disposed)return;
    clearTimeout(this.pauseTimer);this.pauseTimer=undefined;
    this.mix();
    if(!this.wanted()||this.blocked){
      clearInterval(this.timer);this.timer=undefined;
      if(this.context)this.pauseTimer=setTimeout(()=>this.pause(!this.active),1000);
      return;
    }
    if(!this.context)return; // Wait for the first user gesture.
    if(this.context.state!=='running'){
      void this.context.resume().then(()=>{if(this.context?.state==='running')this.update();}).catch(()=>{this.blocked=true;});return;
    }
    for(const deck of this.decks)if(deck.started&&deck.media.paused&&!deck.media.ended&&!deck.starting)this.resume(deck);
    if(!this.timer)this.timer=setInterval(()=>this.tick(),250);
    this.tick();
  }
  private mix():void {
    if(!this.context||!this.bus)return;
    const target=this.wanted()&&!this.blocked?AMBIENT_MIX.gain*this.level*(this.suppressed?AMBIENT_MIX.duck:1):0;
    if(this.target===target)return;
    const now=this.context.currentTime,previous=this.target;this.target=target;
    hold(this.bus.gain,now);
    this.bus.gain.setTargetAtTime(target,now,target===0?.12:previous<=0?1.2:.6);
  }
  private pause(release:boolean):void {
    clearInterval(this.timer);this.timer=undefined;
    for(const deck of this.decks){deck.media.pause();if(release)this.clear(deck);}
    if(release){this.current=undefined;this.transition=undefined;this.failed.clear();}
    if(this.context?.state==='running')void this.context.suspend().catch(()=>{});
  }
  private clear(deck:Deck):void {
    deck.generation++;deck.starting=false;deck.started=false;deck.ending=false;deck.track=undefined;
    deck.media.onerror=null;deck.media.pause();deck.media.removeAttribute('src');deck.media.load();
    if(this.context){hold(deck.gain.gain,this.context.currentTime);deck.gain.gain.setValueAtTime(0,this.context.currentTime);}
  }
  private prepare(deck:Deck):void {
    const track=this.queue.next(this.failed);if(!track)return;
    deck.track=track;const generation=++deck.generation;
    deck.media.onerror=()=>{if(deck.generation===generation)this.failure(deck);};
    deck.media.src=track.url;deck.media.load();
  }
  private failure(deck:Deck):void {
    if(deck.track)this.failed.add(deck.track.id);
    if(this.transition){
      const survivor=this.transition.from===deck?this.transition.to:this.transition.from;
      this.transition=undefined;this.current=survivor;
      hold(survivor.gain.gain,this.context!.currentTime);survivor.gain.gain.setTargetAtTime(1,this.context!.currentTime,.3);
    }else if(this.current===deck)this.current=undefined;
    this.clear(deck);
  }
  private playError(deck:Deck,error:unknown):void {
    if(error instanceof DOMException&&error.name==='NotAllowedError'){
      this.blocked=true;this.update(); // Retry only after another real gesture.
    }else if(!(error instanceof DOMException&&error.name==='AbortError'))this.failure(deck);
  }
  private resume(deck:Deck):void {
    deck.starting=true;const generation=deck.generation;
    void deck.media.play().then(()=>{if(deck.generation===generation)deck.starting=false;}).catch(error=>{if(deck.generation!==generation)return;deck.starting=false;this.playError(deck,error);});
  }
  private start(deck:Deck,from?:Deck):void {
    if(deck.starting)return;
    deck.starting=true;const generation=deck.generation;
    void deck.media.play().then(()=>{
      if(deck.generation!==generation)return;
      deck.starting=false;deck.started=true;
      if(!this.wanted()||this.blocked){deck.media.pause();return;}
      const now=this.context!.currentTime;
      deck.gain.gain.cancelScheduledValues(now);deck.gain.gain.setValueAtTime(0,now);
      if(from&&this.current===from&&!from.media.ended){
        const remaining=from.media.duration-from.media.currentTime;
        const seconds=Math.max(.1,Math.min(AMBIENT_MIX.crossfade,remaining,deck.media.duration/4));
        const outgoingLevel=from.gain.gain.value;
        hold(from.gain.gain,now);
        from.gain.gain.setValueCurveAtTime(fadeCurve(false).map(value=>value*outgoingLevel),now,seconds);
        deck.gain.gain.setValueCurveAtTime(fadeCurve(true),now,seconds);
        this.transition={from,to:deck,until:now+seconds};
      }else{
        if(from)this.clear(from);
        this.current=deck;deck.gain.gain.linearRampToValueAtTime(1,now+3);
      }
    }).catch(error=>{if(deck.generation!==generation)return;deck.starting=false;this.playError(deck,error);});
  }
  private tick():void {
    if(!this.wanted()||this.blocked||this.context?.state!=='running')return;
    if(this.transition){
      if(this.context.currentTime<this.transition.until)return;
      const {from,to}=this.transition;this.transition=undefined;this.current=to;this.clear(from);
    }
    if(this.current?.media.ended){this.clear(this.current);this.current=undefined;}
    const spare=this.decks.find(deck=>deck!==this.current)!;
    if(!this.current){
      const next=this.decks.find(deck=>deck.track)??spare;
      if(!next.track)this.prepare(next);
      if(next.media.readyState>=3&&next.track)this.start(next);
      return;
    }
    const remaining=this.current.media.duration-this.current.media.currentTime;
    if(remaining>AMBIENT_MIX.preload)return;
    if(!spare.track)this.prepare(spare);
    if(spare.track&&spare.media.readyState>=3&&remaining<=Math.min(AMBIENT_MIX.crossfade,this.current.media.duration/4,spare.media.duration/4))this.start(spare,this.current);
    else if(remaining<=1.5&&!this.current.ending){
      // A slow/missing next file may leave a gap, but the current recording still ends gently.
      this.current.ending=true;const now=this.context.currentTime;
      hold(this.current.gain.gain,now);this.current.gain.gain.setTargetAtTime(0,now,.2);
    }
  }
  telemetry():object {
    return {enabled:this.preference,active:this.active,blocked:this.blocked,context:this.context?.state??'uninitialized',volume:this.level,target:this.target,ducked:this.suppressed,crossfading:!!this.transition,failed:[...this.failed],
      decks:this.decks.map(deck=>({id:deck.track?.id,time:deck.media.currentTime,duration:Number.isFinite(deck.media.duration)?deck.media.duration:0,paused:deck.media.paused,gain:deck.gain.gain.value,ready:deck.media.readyState}))};
  }
  destroy():void {
    this.setActive(false);this.disposed=true;clearTimeout(this.pauseTimer);this.pause(true);
    document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pagehide',this.pageHide);window.removeEventListener('pageshow',this.visibility);
    for(const deck of this.decks){deck.source.disconnect();deck.gain.disconnect();}
    void this.context?.close().catch(()=>{});this.decks=[];
  }
}
