import {BEDS,DEFAULT_INPUT,SPOTS,SpotScheduler,bedGain,distanceCutoff,distanceGain,loopWithCrossfade,panOf,worldOf,
  type AmbienceInput,type BedRule,type CatalogEntry,type CitySounds,type SpotCall,type World} from './model';

/** Seconds of the end of a bed blended into its start. */
const LOOP_FADE=4;
/** How long a layer that nobody needs stays in memory before it is let go (decoded audio is ~4 MB per 30 s). */
const KEEP_SECONDS=90;
const TICK_MS=100;
const WORLD_EVERY=.25;
/** A layer quieter than this is not worth a decoded buffer or two playing sources. */
const AUDIBLE=.012;
/** Decoded one-off sounds kept for the next time, in bytes (mono 32-bit float: ~128 kB a second): about three minutes of recordings. */
const CACHE_BYTES=24*1024*1024;
/** Highest cutoff of the filters: the context runs at 32 kHz, and a filter above its Nyquist limit is clamped with a warning. */
const OPEN=15500;

interface Bed {
  rule:BedRule;entry:CatalogEntry;
  buffer?:AudioBuffer;loading:boolean;failed:boolean;
  gain:GainNode;sources:AudioBufferSourceNode[];nodes:AudioNode[];
  /** Last time something wanted it. */
  wantedAt:number;target:number;applied:number;
}
interface Voice {
  call:SpotCall;source:AudioBufferSourceNode;gain:GainNode;swell:GainNode;pan:StereoPannerNode;filter:BiquadFilterNode;
  x:number;z:number;endsAt:number;
}

/**
 * The city's sound, played: the layers loop under everything and rise and fall with the place, and the one-off sounds are called by the
 * scheduler, put in the world and followed as the listener turns. All of it goes through `destination`; it owns no AudioContext.
 */
export class CityAmbience {
  private readonly beds=new Map<string,Bed>();
  private readonly spots=new Map<string,CatalogEntry>();
  /** Decoded spots, by url, least recently used first (a Map keeps insertion order; a hit re-inserts). */
  private readonly buffers=new Map<string,{pending:Promise<AudioBuffer|undefined>;bytes:number}>();
  private readonly failed=new Set<string>();
  private readonly voices=new Set<Voice>();
  private readonly scheduler:SpotScheduler;
  private readonly outside:GainNode;
  private readonly muffle:BiquadFilterNode;
  private timer?:ReturnType<typeof setInterval>;
  private input:AmbienceInput=DEFAULT_INPUT;
  private world:World=worldOf(DEFAULT_INPUT);
  private worldAt=-Infinity;
  private started=0;
  private muffled=-1;
  private readonly nodesToClose:AudioNode[]=[];
  private disposed=false;
  /** Spots started since the start, by kind (telemetry, tests). */
  readonly played:Record<string,number>={};

  constructor(private readonly context:AudioContext,destination:AudioNode,sounds:CitySounds,
    private readonly random:()=>number=Math.random,private readonly load:(url:string)=>Promise<ArrayBuffer>=url=>fetch(url).then(response=>{if(!response.ok)throw new Error(String(response.status));return response.arrayBuffer();})){
    for(const entry of sounds.spots)this.spots.set(entry.id,entry);
    this.scheduler=new SpotScheduler(this.spots,random);
    // The street and everything outdoors passes through one dulling filter: with a roof overhead it closes, as a wall does.
    this.outside=context.createGain();this.muffle=context.createBiquadFilter();this.muffle.type='lowpass';this.muffle.frequency.value=OPEN;this.muffle.Q.value=.4;
    this.outside.connect(this.muffle).connect(destination);
    const byId=new Map(sounds.beds.map(entry=>[entry.id,entry]));
    for(const rule of BEDS){
      const entry=byId.get(rule.id);if(!entry)continue;
      const gain=context.createGain();gain.gain.value=0;gain.connect(rule.interior?destination:this.outside);
      this.beds.set(rule.id,{rule,entry,loading:false,failed:false,gain,sources:[],nodes:[],wantedAt:-Infinity,target:0,applied:-1});
    }
    this.nodesToClose.push(this.outside,this.muffle);
  }

  private source?:()=>AmbienceInput|undefined;
  /** Where the listener is, asked a few times a second. */
  setSource(source:(()=>AmbienceInput|undefined)|undefined):void {this.source=source;}
  setInput(input:AmbienceInput|undefined):void {this.input=input??DEFAULT_INPUT;}
  get running():boolean {return !!this.timer;}
  start():void {
    if(this.timer||this.disposed)return;
    this.started=this.context.currentTime;this.worldAt=-Infinity;
    this.timer=setInterval(()=>this.tick(),TICK_MS);this.tick();
  }
  /** Stops the clock. `release` also lets go of every decoded layer and playing sound (leaving the bar). */
  stop(release:boolean):void {
    clearInterval(this.timer);this.timer=undefined;
    if(!release)return;
    for(const voice of [...this.voices])this.endVoice(voice,true);
    for(const bed of this.beds.values())this.unload(bed);
    this.buffers.clear();
  }
  destroy():void {
    this.disposed=true;this.stop(true);
    for(const bed of this.beds.values())bed.gain.disconnect();
    for(const node of this.nodesToClose)node.disconnect();
  }

  private tick():void {
    if(this.disposed||this.context.state!=='running')return;
    const now=this.context.currentTime;
    if(now-this.worldAt>=WORLD_EVERY){if(this.source)this.input=this.source()??DEFAULT_INPUT;this.world=worldOf(this.input);this.worldAt=now;this.mixBeds(now);this.mixOutside(now);}
    this.followVoices(now);
    if(now-this.started<2)return; // let the layers come in before the first one-offs
    const calls=this.scheduler.step(now,this.input,this.world,this.voices.size,id=>this.spots.has(id)&&!this.failed.has(id));
    for(const call of calls)void this.play(call);
  }

  // ---- layers
  private mixBeds(now:number):void {
    const seconds=now-this.started;
    for(const bed of this.beds.values()){
      // Inside, the street's layers drop to a murmur and the room's own tone takes over.
      const exposure=bed.rule.interior?1:1-this.world.indoors*.72;
      const target=bedGain(bed.rule,this.world,seconds)*exposure;
      bed.target=target;
      if(target>AUDIBLE){
        bed.wantedAt=now;
        if(!bed.buffer&&!bed.loading&&!bed.failed)void this.loadBed(bed);
      }
      // Only when it moved enough to matter: every call adds an event to the parameter's timeline.
      const goal=bed.sources.length?target:0;
      if(Math.abs(goal-bed.applied)>.006){bed.gain.gain.setTargetAtTime(goal,now,2.5);bed.applied=goal;}
      if(bed.buffer&&now-bed.wantedAt>KEEP_SECONDS)this.unload(bed);
    }
  }
  private async loadBed(bed:Bed):Promise<void> {
    bed.loading=true;
    try{
      const decoded=await this.decode(bed.entry.url);
      if(!decoded||this.disposed){bed.failed=!decoded;return;}
      // The loop is made once per load, from the decoded channel: the files stay plain recordings.
      const data=decoded.getChannelData(0),loop=loopWithCrossfade(data,Math.floor(LOOP_FADE*decoded.sampleRate));
      const buffer=this.context.createBuffer(1,loop.length,decoded.sampleRate);buffer.copyToChannel(loop as Float32Array<ArrayBuffer>,0);
      bed.buffer=buffer;this.attach(bed);
    }catch{bed.failed=true;}
    finally{bed.loading=false;}
  }
  /** One recording, two sources starting at different points of it and panned apart: a mono layer that fills the width. */
  private attach(bed:Bed):void {
    const buffer=bed.buffer;if(!buffer||bed.sources.length)return;
    const now=this.context.currentTime;
    [[-.7,0],[.7,.5]].forEach(([pan,shift])=>{
      const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;
      const side=this.context.createGain();side.gain.value=.62;
      const panner=this.context.createStereoPanner();panner.pan.value=pan!;
      source.connect(side).connect(panner).connect(bed.gain);
      source.start(now,(buffer.duration*shift!+this.random()*buffer.duration*.2)%buffer.duration);
      bed.sources.push(source);bed.nodes.push(side,panner);
    });
    bed.gain.gain.setValueAtTime(0,now);bed.gain.gain.setTargetAtTime(bed.target,now,2.5);bed.applied=bed.target;
  }
  private unload(bed:Bed):void {
    for(const source of bed.sources){try{source.stop();}catch{}source.disconnect();}
    for(const node of bed.nodes)node.disconnect();
    bed.sources=[];bed.nodes=[];bed.buffer=undefined;bed.loading=false;
    bed.gain.gain.cancelScheduledValues(0);bed.gain.gain.value=0;bed.applied=-1;
  }
  /** A roof overhead closes the street: quieter and duller, over a couple of seconds. */
  private mixOutside(now:number):void {
    const indoors=this.world.indoors;
    if(Math.abs(indoors-this.muffled)<.02)return;this.muffled=indoors;
    // Cutoff and level slide with how shut in the listener is, so the veranda sits between the street and a room.
    this.muffle.frequency.setTargetAtTime(OPEN*Math.pow(950/OPEN,indoors),now,.5);
    this.outside.gain.setTargetAtTime(1-indoors*.45,now,.5);
  }

  // ---- spots
  private decode(url:string):Promise<AudioBuffer|undefined> {
    const known=this.buffers.get(url);
    if(known){this.buffers.delete(url);this.buffers.set(url,known);return known.pending;}
    const record={pending:Promise.resolve<AudioBuffer|undefined>(undefined),bytes:0};
    record.pending=this.load(url).then(bytes=>this.context.decodeAudioData(bytes)).then(buffer=>{record.bytes=buffer.length*4*buffer.numberOfChannels;this.trim();return buffer;}).catch(()=>undefined);
    this.buffers.set(url,record);
    return record.pending;
  }
  /** Lets go of the least recently used recordings once the cache is over budget; one still playing keeps its own reference until it ends. */
  private trim():void {
    let total=0;for(const record of this.buffers.values())total+=record.bytes;
    for(const [url,record] of this.buffers){
      if(total<=CACHE_BYTES||this.buffers.size<=1)break;
      this.buffers.delete(url);total-=record.bytes;
    }
  }
  private async play(call:SpotCall):Promise<void> {
    const entry=this.spots.get(call.sound);if(!entry)return;
    const buffer=await this.decode(entry.url);
    if(!buffer){this.failed.add(call.sound);this.buffers.delete(entry.url);return;}
    if(this.disposed||!this.timer||this.context.state!=='running')return;
    const context=this.context,now=context.currentTime;
    const source=context.createBufferSource();source.buffer=buffer;
    const gain=context.createGain(),swell=context.createGain(),pan=context.createStereoPanner(),filter=context.createBiquadFilter();
    filter.type='lowpass';filter.Q.value=.5;
    const {placement}=call,distance=Math.hypot(placement.x-this.input.x,placement.z-this.input.z);
    filter.frequency.value=distanceCutoff(distance);pan.pan.value=panOf(this.input,placement.x,placement.z);
    const peak=call.gain;
    // A slice of a long recording starts and ends softly; a whole short one only avoids the click.
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(peak,now+Math.max(.02,call.fade));
    gain.gain.setValueAtTime(peak,now+Math.max(call.fade,call.duration-call.fade));gain.gain.linearRampToValueAtTime(0,now+call.duration);
    source.connect(filter).connect(pan).connect(swell).connect(gain).connect(this.outside);
    const offset=Math.min(call.offset,Math.max(0,buffer.duration-.05));
    source.start(now,offset,Math.min(call.duration,buffer.duration-offset));
    const voice:Voice={call,source,gain,swell,pan,filter,x:placement.x,z:placement.z,endsAt:now+call.duration+.05};
    source.onended=()=>this.endVoice(voice,false);
    this.voices.add(voice);this.played[call.rule.id]=(this.played[call.rule.id]??0)+1;
  }
  /** Sources keep their place in the world: moving ones travel their street, and all of them stay put as the listener turns. */
  private followVoices(now:number):void {
    for(const voice of this.voices){
      if(voice.call.placement.vx||voice.call.placement.vz){
        const step=TICK_MS/1000;voice.x+=voice.call.placement.vx*step;voice.z+=voice.call.placement.vz*step;
      }
      const distance=Math.hypot(voice.x-this.input.x,voice.z-this.input.z);
      voice.pan.pan.setTargetAtTime(panOf(this.input,voice.x,voice.z),now,.08);
      voice.filter.frequency.setTargetAtTime(distanceCutoff(distance),now,.15);
      // The gain the scheduler chose was for the distance it started at; a passing source swells and fades with how near it is now.
      if(voice.call.placement.vx||voice.call.placement.vz){
        const ratio=distanceGain(distance)/distanceGain(voice.call.placement.distance);
        voice.swell.gain.setTargetAtTime(Math.min(1.6,ratio),now,.2);
      }
    }
  }
  private endVoice(voice:Voice,stopNow:boolean):void {
    if(!this.voices.delete(voice))return;
    voice.source.onended=null;
    if(stopNow){try{voice.source.stop();}catch{}}
    voice.source.disconnect();voice.filter.disconnect();voice.pan.disconnect();voice.swell.disconnect();voice.gain.disconnect();
  }

  /** Plays one kind now, for trying it by ear (barDebug). */
  trigger(kind:string):boolean {
    const rule=SPOTS.find(candidate=>candidate.id===kind);if(!rule)return false;
    const call=this.scheduler.make(rule,this.input,this.context.currentTime,id=>this.spots.has(id)&&!this.failed.has(id));
    if(!call)return false;
    void this.play(call);return true;
  }
  telemetry():object {
    return {running:this.running,world:this.world,muffled:this.muffled,
      beds:[...this.beds.values()].map(bed=>({id:bed.rule.id,target:+bed.target.toFixed(3),gain:+bed.gain.gain.value.toFixed(3),loaded:!!bed.buffer,loading:bed.loading,failed:bed.failed})),
      voices:[...this.voices].map(voice=>({sound:voice.call.sound,kind:voice.call.rule.id,x:Math.round(voice.x),z:Math.round(voice.z),left:+(voice.endsAt-this.context.currentTime).toFixed(1)})),
      played:this.played,failed:[...this.failed]};
  }
}
