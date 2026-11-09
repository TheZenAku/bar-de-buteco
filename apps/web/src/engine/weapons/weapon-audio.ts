import {placeListener} from '../moto-sound';
import type {Surface,WeaponId} from '@bar/shared';
import {sharedSounds,weaponSounds,type MechSound} from './meta';

/**
 * The firearms heard (docs/sistemas/armas.md#som): real recordings from CC0 libraries (tools/assets/import-weapon-sounds.mjs, sound-meta.ts), loaded
 * per weapon the first time it is drawn or heard. One's own shot is played as its shooter hears it, centred; anyone else's from where it is, the near
 * takes up close and the far ones past ~35 m (crossfaded), late by the speed of sound, and not at all past the weapon's earshot. Everything goes
 * through a reverb send: a street's impulse response outside, a room's under a roof. Mechanical sounds follow the hands (reload, pump, bolt), the
 * impacts and casings where they land, the crack of a bullet passing close by. We cannot listen here: levels and ranges are reasoned, see the doc.
 */
const NEAR_FAR=[25,60] as const;
/** Positional voices: how loud at what distance, how fast that falls, the farthest heard. */
const SHOT_REF=8,SHOT_ROLLOFF=.9,MECH_RANGE=15,IMPACT_RANGE=40,SOUND_SPEED=343;
const BUS=.9,REVERB_SEND=.28;
/**
 * The mix: the recordings come loudness-balanced only within each category (sound-meta.ts: shots -12 dBFS, far -14, suppressed -15, mechanics -14,
 * interface -15, impacts -12, whizzes -13, casings -18), so the categories are set against each other here. Shots lead; the hands' work, the
 * impacts and the brass sit well under them, as a gun drowns them out in life; the hit marker is a tick, not an event.
 */
const GAIN={shot:1,far:.9,suppressed:.8,mech:.55,handling:.45,impact:.55,casing:.6,whiz:.7,hit:.45,cue:.6} as const;
export interface Ear {x:number;y:number;z:number;forward:{x:number;y:number;z:number};up:{x:number;y:number;z:number}}
type Place={x:number;y:number;z:number};

export class WeaponAudio {
  private context?:AudioContext;
  private bus?:GainNode;
  private reverbIn?:GainNode;
  private outdoor?:ConvolverNode;private indoor?:ConvolverNode;private outdoorGain?:GainNode;private indoorGain?:GainNode;
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly loading=new Set<string>();
  private readonly last=new Map<string,string>();
  private readonly loadedWeapons=new Set<WeaponId>();
  private sharedLoaded=false;
  private inside=0;
  /** The last sounds played (tests and telemetry). */
  readonly played:string[]=[];
  private readonly unlock=()=>{void this.graph()?.resume().catch(()=>{});};

  constructor(private readonly volume:()=>number,private readonly ear:()=>Ear|undefined) {
    for(const event of ['pointerdown','keydown'])window.addEventListener(event,this.unlock);
  }
  private graph():AudioContext|undefined {
    if(this.context)return this.context;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
    try{
      const context=this.context=new AudioContext();
      // Gunfire is the loudest thing in the game: a limiter keeps a firefight from clipping.
      const limiter=context.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=6;limiter.ratio.value=10;limiter.attack.value=.001;limiter.release.value=.12;
      this.bus=context.createGain();this.bus.connect(limiter).connect(context.destination);
      this.reverbIn=context.createGain();this.reverbIn.gain.value=REVERB_SEND;
      this.outdoor=context.createConvolver();this.indoor=context.createConvolver();
      this.outdoorGain=context.createGain();this.indoorGain=context.createGain();this.indoorGain.gain.value=0;
      this.reverbIn.connect(this.outdoor).connect(this.outdoorGain).connect(this.bus);
      this.reverbIn.connect(this.indoor).connect(this.indoorGain).connect(this.bus);
      this.loadShared();
      return context;
    }catch{return;}
  }
  private fetch(url:string):void {
    const context=this.context;
    if(!context||this.buffers.has(url)||this.loading.has(url))return;
    this.loading.add(url);
    void fetch(`${import.meta.env.BASE_URL}${url}`).then(response=>{if(!response.ok)throw new Error(String(response.status));return response.arrayBuffer();})
      .then(data=>context.decodeAudioData(data)).then(buffer=>{this.buffers.set(url,buffer);this.attachReverb(url,buffer);})
      .catch(error=>console.warn(`armas: som ${url} indisponível`,error)).finally(()=>this.loading.delete(url));
  }
  private attachReverb(url:string,buffer:AudioBuffer):void {
    const shared=sharedSounds();
    if(!shared)return;
    if(url===shared.reverb.outdoor&&this.outdoor&&!this.outdoor.buffer)this.outdoor.buffer=buffer;
    if(url===shared.reverb.indoor&&this.indoor&&!this.indoor.buffer)this.indoor.buffer=buffer;
  }
  private loadShared():void {
    const shared=sharedSounds();
    if(this.sharedLoaded||!shared||!this.context)return;
    this.sharedLoaded=true;
    const lists=[shared.draw,shared.holster,shared.scopeIn,shared.zoom,shared.fireMode,shared.hit,shared.headshot,shared.kill,shared.whiz,shared.casingBrass,shared.casingShell,...Object.values(shared.impact)];
    for(const list of lists)for(const url of list)this.fetch(url);
    this.fetch(shared.reverb.outdoor);this.fetch(shared.reverb.indoor);
  }
  /** Loads a weapon's sounds (on its first draw, or the first time one is heard). */
  prepare(weapon:WeaponId):void {
    if(this.loadedWeapons.has(weapon)||!this.graph())return;
    const set=weaponSounds(weapon);if(!set)return;
    this.loadedWeapons.add(weapon);
    for(const list of [set.shot,set.near,set.far,set.suppressed??[],set.suppressedFar??[],...Object.values(set.mech)])for(const url of list??[])this.fetch(url);
  }
  /** One take of a set, never the same twice in a row; undefined while none has loaded. */
  private pick(key:string,list:readonly string[]|undefined):AudioBuffer|undefined {
    if(!list?.length)return;
    const ready=list.filter(url=>this.buffers.has(url));
    if(!ready.length)return;
    const previous=this.last.get(key),choices=ready.length>1?ready.filter(url=>url!==previous):ready;
    const url=choices[Math.floor(Math.random()*choices.length)]!;
    this.last.set(key,url);this.played.push(url);if(this.played.length>32)this.played.shift();
    return this.buffers.get(url);
  }
  /** Under a roof (the bar, a covered yard): the room's reverb; out in the street: the street's. Set by the caller a few times a second. */
  setInside(inside:boolean):void {
    const target=inside?1:0;
    if(target===this.inside||!this.context||!this.indoorGain||!this.outdoorGain)return;
    this.inside=target;
    const now=this.context.currentTime;
    this.indoorGain.gain.setTargetAtTime(target,now,.25);this.outdoorGain.gain.setTargetAtTime(1-target,now,.25);
  }
  private voice(buffer:AudioBuffer,level:number,rate:number,at?:Place,delay=0,refDistance=SHOT_REF,rolloff=SHOT_ROLLOFF,maxDistance=400,reverb=1):void {
    const context=this.context,bus=this.bus;
    if(!context||!bus||document.hidden)return;
    bus.gain.value=BUS*Math.max(0,Math.min(1,this.volume()));
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=level;
    source.connect(gain);
    let tail:AudioNode=gain;
    let panner:PannerNode|undefined;
    if(at){
      panner=context.createPanner();
      panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=refDistance;panner.rolloffFactor=rolloff;panner.maxDistance=maxDistance;
      if(panner.positionX){panner.positionX.value=at.x;panner.positionY.value=at.y;panner.positionZ.value=at.z;}else panner.setPosition(at.x,at.y,at.z);
      gain.connect(panner);tail=panner;
    }
    tail.connect(bus);
    let send:GainNode|undefined;
    if(reverb>0&&this.reverbIn){send=context.createGain();send.gain.value=reverb;tail.connect(send).connect(this.reverbIn);}
    source.start(context.currentTime+Math.max(0,delay));
    source.onended=()=>{source.disconnect();gain.disconnect();panner?.disconnect();send?.disconnect();};
  }
  private hear():{ear:Ear;distance:(at:Place)=>number}|undefined {
    const context=this.graph(),ear=this.ear();
    if(!context||!ear)return;
    placeListener(context,ear.x,ear.y,ear.z,ear.forward,ear.up);
    return {ear,distance:at=>Math.hypot(at.x-ear.x,at.y-ear.y,at.z-ear.z)};
  }

  /** The local player's own shot: as heard behind the gun, centred, a little different each time. */
  ownShot(weapon:WeaponId,suppressed:boolean):void {
    if(!this.graph())return;
    this.prepare(weapon);
    const set=weaponSounds(weapon);
    const buffer=this.pick(`${weapon}:own:${suppressed}`,suppressed?set?.suppressed??set?.shot:set?.shot);
    if(buffer)this.voice(buffer,(suppressed?GAIN.suppressed:GAIN.shot)*(.9+Math.random()*.1),.97+Math.random()*.06,undefined,0,0,0,0,suppressed?.5:1);
  }
  /** Someone else's shot from `at`: near and far takes by distance, late by the trip of the sound, nothing past `earshot`. */
  worldShot(weapon:WeaponId,suppressed:boolean,at:Place,earshot:number):void {
    const heard=this.hear();if(!heard)return;
    const distance=heard.distance(at);
    if(distance>earshot)return;
    this.prepare(weapon);
    const set=weaponSounds(weapon);
    const far=Math.max(0,Math.min(1,(distance-NEAR_FAR[0])/(NEAR_FAR[1]-NEAR_FAR[0])));
    const delay=distance/SOUND_SPEED,rate=.97+Math.random()*.06;
    // Fading out towards the edge of earshot (the inverse law alone never reaches silence).
    const edge=Math.max(0,Math.min(1,(earshot-distance)/(earshot*.35)));
    const near=this.pick(`${weapon}:near:${suppressed}`,suppressed?set?.suppressed??set?.near:set?.near);
    if(near&&far<1)this.voice(near,(1-far)*edge*(suppressed?GAIN.suppressed:GAIN.shot),rate,at,delay);
    const away=this.pick(`${weapon}:far:${suppressed}`,suppressed?set?.suppressedFar??set?.far:set?.far);
    if(away&&far>0)this.voice(away,far*edge*GAIN.far,rate,at,delay,SHOT_REF*3,.6);
  }
  /** A sound of the mechanism (reload, pump, lever, bolt, hammer, dry fire), from the gun; the local player's always, others' close by. */
  mech(weapon:WeaponId,sound:MechSound,at:Place|undefined):void {
    const heard=this.hear();if(!heard)return;
    if(at&&heard.distance(at)>MECH_RANGE)return;
    this.prepare(weapon);
    const buffer=this.pick(`${weapon}:${sound}`,weaponSounds(weapon)?.mech[sound]);
    if(buffer)this.voice(buffer,GAIN.mech,.97+Math.random()*.06,at,0,2,1.4,MECH_RANGE*2,.6);
  }
  /** A shared sound of handling the gun (draw, holster, scope, zoom, fire mode), the local player's: centred. */
  handling(name:'draw'|'holster'|'scopeIn'|'zoom'|'fireMode'):void {
    if(!this.graph())return;
    const buffer=this.pick(name,sharedSounds()?.[name]);
    if(buffer)this.voice(buffer,GAIN.handling,.97+Math.random()*.06,undefined,0,0,0,0,.3);
  }
  impact(surface:Surface,at:Place):void {
    const heard=this.hear();if(!heard)return;
    const distance=heard.distance(at);if(distance>IMPACT_RANGE)return;
    const buffer=this.pick(`impact:${surface}`,sharedSounds()?.impact[surface]);
    if(buffer)this.voice(buffer,GAIN.impact,.94+Math.random()*.12,at,distance/SOUND_SPEED,3,1.2,IMPACT_RANGE*2,.6);
  }
  casing(kind:'brass'|'shell',at:Place,strength:number):void {
    const heard=this.hear();if(!heard||heard.distance(at)>MECH_RANGE)return;
    const shared=sharedSounds();
    const buffer=this.pick(`casing:${kind}`,kind==='shell'?shared?.casingShell:shared?.casingBrass);
    if(buffer)this.voice(buffer,GAIN.casing*(.4+.6*strength),.92+Math.random()*.16,at,0,1.5,1.4,MECH_RANGE*2,.3);
  }
  /** The crack of a bullet passing within a couple of metres, at the closest point of its way. */
  whiz(at:Place,closeness:number):void {
    const heard=this.hear();if(!heard)return;
    const buffer=this.pick('whiz',sharedSounds()?.whiz);
    if(buffer)this.voice(buffer,GAIN.whiz*(.4+.6*closeness),.95+Math.random()*.1,at,0,1.5,1,30,.4);
  }
  /** The hit marker's sounds (2D, short). */
  cue(name:'hit'|'headshot'|'kill'):void {
    if(!this.graph())return;
    const buffer=this.pick(`cue:${name}`,sharedSounds()?.[name]);
    if(buffer)this.voice(buffer,name==='hit'?GAIN.hit:GAIN.cue,1,undefined,0,0,0,0,0);
  }
  telemetry() {return {state:this.context?.state??'',ready:this.buffers.size,inside:this.inside,played:[...this.played]};}
  destroy():void {
    for(const event of ['pointerdown','keydown'])window.removeEventListener(event,this.unlock);
    void this.context?.close().catch(()=>{});
  }
}
