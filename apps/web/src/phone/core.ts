import type {PhoneContact,PhonePing,PhoneProfile,PublicUser,WorldState} from '@bar/shared';
import {escape as e} from '../api';

/** What the phone needs from the game (main.ts). */
export interface PhoneHost {
  user():PublicUser|undefined;
  world():WorldState|undefined;
  serverNow():number;
  /** A room message (calls and pings). */
  send(type:string,payload?:unknown):void;
  /** A binary room message (a video call's frames). */
  sendBytes(type:string,bytes:Uint8Array):void;
  /** A notice on the game's HUD, used while the phone is put away. */
  notice(title:string,text:string,initials?:string):void;
  error(text:string):void;
  /** Coins as the HUD shows them (undefined until known). */
  wallet():number|undefined;
  /** Coins changed through the phone (Pix): the HUD wallet and the room catch up. */
  balance(balance:number):void;
  /** The game view as a JPEG, cropped from its middle (BarScene.capture). */
  capture(width:number,height:number,quality?:number):Promise<Blob|null>;
  setSelfie(on:boolean):void;
  /** The camera's zoom (1 = the game's own view). */
  setZoom(factor:number):void;
  canvas:HTMLCanvasElement;
  microphone:{active():boolean;set(on:boolean):Promise<boolean>;unavailable():string};
  setCallPeer(id?:string):void;
  /** The game's general volume, 0–1. */
  volume():number;
}

export interface PhoneSettings {wallpaper:string;dark:boolean;dnd:boolean;ringtone:number;ringVolume:number;keyClicks:boolean;size:'s'|'m'|'l'}
export const DEFAULT_SETTINGS:PhoneSettings={wallpaper:'aurora',dark:true,dnd:false,ringtone:0,ringVolume:.8,keyClicks:true,size:'m'};
export interface RecentCall {peerId:string;name:string;color:string;kind:'out'|'in'|'missed';at:number;seconds:number;video?:boolean}
/** `photo`: the version of their Highgram photo, when they have one. */
export interface Person {id:string;name:string;color:string;number?:string;photo?:number}

/** What an app gets: the game, the phone's own state and navigation. */
export interface PhoneContext {
  host:PhoneHost;
  settings():PhoneSettings;
  updateSettings(patch:Partial<PhoneSettings>):void;
  profile():PhoneProfile|undefined;
  refreshProfile():Promise<PhoneProfile|undefined>;
  /** Players in the bar right now (from the room state the game already has), without yourself. */
  nearby():Person[];
  contact(id:string):PhoneContact|undefined;
  open(app:string,arg?:unknown):void;
  home():void;
  call(person:Person,video?:boolean):void;
  banner(app:string,title:string,text:string,initials?:string):void;
  onPing(listener:(ping:PhonePing)=>void):()=>void;
  store:LocalStore;
  gallery:Gallery;
  sounds:PhoneSounds;
  setBadge(app:string,count:number):void;
}
export interface PhoneApp {
  id:string;name:string;icon:string;
  /** The icon's background (CSS). */
  tint:string;
  dock?:boolean;
  /** Draws the app into `view`; the function it returns runs when the app closes. */
  open(view:HTMLElement,ctx:PhoneContext,arg?:unknown):void|(()=>void);
}

/** A Highgram profile photo; the version in the URL makes a new photo a new address (the API caches them forever). */
export const avatarUrl=(id:string,photo:number)=>`/api/phone/gram/avatars/${encodeURIComponent(id)}?v=${photo}`;
/** The person's Highgram photo, or their initial on their colour. */
/**
 * Another app opening the camera to get a photo or video back: when one is taken, the camera opens `then` with `back`
 * plus `captured` (the gallery item's id); Voltar opens `then` with `back` alone.
 */
export interface CameraRequest {then:string;back?:Record<string,unknown>;mode?:'photo'|'video';selfie?:boolean;only?:'photo'|'video'}
export const avatar=(person:{name:string;color?:string;id?:string;photo?:number},size=44)=>`<span class="ph-avatar${person.photo&&person.id?' has-photo':''}" style="--av:${e(person.color||'#7c6a9a')};--size:${size}px" aria-hidden="true">${e((person.name.trim()[0]??'?').toUpperCase())}${person.photo&&person.id?`<img src="${avatarUrl(person.id,person.photo)}" alt="" loading="lazy" draggable="false">`:''}</span>`;
export const initials=(name:string)=>name.trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
export function timeAgo(at:number,now=Date.now()):string {
  const seconds=Math.max(0,(now-at)/1000);
  if(seconds<60)return 'agora';if(seconds<3600)return `${Math.floor(seconds/60)} min`;if(seconds<86400)return `${Math.floor(seconds/3600)} h`;
  if(seconds<604800)return `${Math.floor(seconds/86400)} d`;
  return new Date(at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}
export const hourMinute=(at:number)=>new Date(at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
export const duration=(seconds:number)=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
/** A header with a back button, a centred title and an optional right side. */
export const header=(title:string,back='Voltar',right='')=>`<header class="ph-head"><button class="ph-back" data-ph="back" type="button">‹ ${e(back)}</button><h2>${title}</h2><span class="ph-head-right">${right}</span></header>`;

/** Per-account phone data kept in this browser (settings, recent calls, notes, calendar). */
export class LocalStore {
  constructor(private owner:()=>string){}
  private key(name:string):string {return `bar:phone:v1:${this.owner()}:${name}`;}
  get<T>(name:string,fallback:T):T {
    try{
      const raw=localStorage.getItem(this.key(name));if(!raw)return fallback;
      const value=JSON.parse(raw) as T;
      // Objects keep the defaults of fields added after they were saved.
      return fallback&&typeof fallback==='object'&&!Array.isArray(fallback)&&value&&typeof value==='object'&&!Array.isArray(value)?{...fallback,...value}:value;
    }catch{return fallback;}
  }
  set(name:string,value:unknown):void {try{localStorage.setItem(this.key(name),JSON.stringify(value));}catch{/* Private mode or full storage: it lasts this session. */}}
}

/** A photo or, with `kind: 'video'`, a recorded video and its length. */
export interface Photo {id:string;owner:string;at:number;blob:Blob;kind?:'photo'|'video';ms?:number}
/** The camera roll: photos and videos stay in this browser (IndexedDB), up to MAX per account; in memory where storage is blocked. */
export class Gallery {
  static readonly MAX=60;
  private database?:Promise<IDBDatabase|undefined>;
  private memory:Photo[]=[];
  private urls=new Map<string,string>();
  constructor(private owner:()=>string){}
  private open():Promise<IDBDatabase|undefined> {
    this.database??=new Promise(resolve=>{
      try{
        const request=indexedDB.open('bar-phone',1);
        request.onupgradeneeded=()=>{const store=request.result.createObjectStore('photos',{keyPath:'id'});store.createIndex('owner','owner');};
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(undefined);request.onblocked=()=>resolve(undefined);
      }catch{resolve(undefined);}
    });
    return this.database;
  }
  private async store(mode:IDBTransactionMode):Promise<IDBObjectStore|undefined> {return (await this.open())?.transaction('photos',mode).objectStore('photos');}
  async list():Promise<Photo[]> {
    const store=await this.store('readonly');
    const all=store?await new Promise<Photo[]>(resolve=>{const request=store.index('owner').getAll(this.owner());request.onsuccess=()=>resolve(request.result as Photo[]);request.onerror=()=>resolve([]);}):this.memory.filter(photo=>photo.owner===this.owner());
    return all.sort((a,b)=>b.at-a.at);
  }
  async add(blob:Blob,video?:{ms:number}):Promise<Photo> {
    const photo:Photo={id:crypto.randomUUID(),owner:this.owner(),at:Date.now(),blob,...(video?{kind:'video' as const,ms:video.ms}:{})};
    const store=await this.store('readwrite');
    if(store)await new Promise<void>(resolve=>{const request=store.put(photo);request.onsuccess=()=>resolve();request.onerror=()=>resolve();});
    else this.memory.push(photo);
    for(const old of (await this.list()).slice(Gallery.MAX))await this.remove(old.id);
    return photo;
  }
  async remove(id:string):Promise<void> {
    const store=await this.store('readwrite');
    if(store)await new Promise<void>(resolve=>{const request=store.delete(id);request.onsuccess=()=>resolve();request.onerror=()=>resolve();});
    this.memory=this.memory.filter(photo=>photo.id!==id);
    const url=this.urls.get(id);if(url){URL.revokeObjectURL(url);this.urls.delete(id);}
  }
  async get(id:string):Promise<Photo|undefined> {return (await this.list()).find(photo=>photo.id===id);}
  url(photo:Photo):string {let url=this.urls.get(photo.id);if(!url){url=URL.createObjectURL(photo.blob);this.urls.set(photo.id,url);}return url;}
}

export const RINGTONES=['Highland','Boteco','Clássico'] as const;
/** Ringtones, the ringback, notifications and the shutter, synthesised (no audio files). */
export class PhoneSounds {
  private context?:AudioContext;
  private loop?:ReturnType<typeof setInterval>;
  constructor(private volume:()=>number){}
  private audio():AudioContext|undefined {
    try{this.context??=new AudioContext();}catch{return;}
    if(this.context.state==='suspended')void this.context.resume().catch(()=>{});
    return this.context;
  }
  unlock():void {this.audio();}
  /** A struck note: sine with a quick fifth partial, decaying like a marimba bar or a bell. */
  private note(frequency:number,at:number,length:number,level:number,type:OscillatorType='sine'):void {
    const context=this.audio();if(!context)return;
    const start=context.currentTime+at,gain=context.createGain(),volume=level*this.volume();
    if(volume<=0)return;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
    gain.connect(context.destination);
    for(const [ratio,share] of [[1,1],[4,.18]] as const){
      const oscillator=context.createOscillator();oscillator.type=type;oscillator.frequency.value=frequency*ratio;
      const partial=context.createGain();partial.gain.value=share;oscillator.connect(partial).connect(gain);
      oscillator.start(start);oscillator.stop(start+length+.05);
    }
  }
  private repeat(every:number,play:()=>void):void {this.stop();play();this.loop=setInterval(play,every);}
  stop():void {clearInterval(this.loop);this.loop=undefined;}
  ring(tone:number,level:number):void {
    const patterns:Array<()=>void>=[
      ()=>[659,784,988,784,1319,988].forEach((f,i)=>this.note(f,i*.16,.5,.22*level)),
      ()=>[523,523,659,784,659,523,392,523].forEach((f,i)=>this.note(f,i*.14,.32,.2*level,'triangle')),
      ()=>{for(let i=0;i<18;i++)this.note(i%2?1180:960,i*.055,.06,.11*level,'square');},
    ];
    this.repeat(tone===2?3000:2400,patterns[tone]??patterns[0]!);
  }
  /** The Brazilian ringback: 425 Hz, one second on, four off. */
  ringback():void {this.repeat(5000,()=>this.note(425,0,1,.08));}
  busy():void {this.stop();for(let i=0;i<3;i++)this.note(425,i*.5,.25,.08);}
  ding():void {this.note(1175,0,.35,.14);this.note(1568,.12,.5,.12);}
  click():void {this.note(1800,0,.03,.05,'triangle');}
  shutter():void {
    const context=this.audio();if(!context||this.volume()<=0)return;
    const length=Math.floor(context.sampleRate*.09),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length)**3*(i<length/2?1:.6);
    const source=context.createBufferSource(),gain=context.createGain();gain.gain.value=.35*this.volume();
    source.buffer=buffer;source.connect(gain).connect(context.destination);source.start();
  }
}
