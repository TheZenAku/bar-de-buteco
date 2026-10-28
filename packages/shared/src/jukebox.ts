import {z} from 'zod';
import map from './map-data.json';
import type {Position} from './index.js';

/** Metres, matching the authored Tela_TV material in BarBoteco (no model replacement). */
export const TELEVISIONS = [
  {id:'tv-hall',x:7.3,y:2.33,z:-11.447,width:1.06,height:.6,yaw:0},
  {id:'tv-left',x:3.753,y:2.33,z:-10,width:1.06,height:.6,yaw:90},
  {id:'tv-counter',x:20,y:2.33,z:-3.753,width:1.06,height:.6,yaw:180},
  {id:'tv-upstairs',x:17.5,y:5.38,z:-3.753,width:1.06,height:.6,yaw:180},
  // The stage's big screen, between the back pillars (COL_Predio_Palco_Pilar.002/.003), facing the backyard.
  // It hangs above the stage floor, so it is used from the sound desk in front of the stage (Ponto_Palco).
  {id:'telao',x:26.65,y:3,z:-25.4,width:4.8,height:2.7,yaw:0,control:{x:26.6,y:.3,z:-19.8}},
] as const;
// The map's own jukebox (12_jukebox.py): against the base of the stairs, facing the hall (+Z), clear of the back
// corridor and the steps. Its solid volume is the export's COL_Int_Jukebox; maxY is the top of the cabinet.
export const JUKEBOX_PLACEMENT={x:map.jukebox.x,y:map.jukebox.y,z:map.jukebox.z,hx:map.jukebox.hx,hz:map.jukebox.hz,maxY:map.jukebox.maxY};
export const JUKEBOX_AUDIO = {fullDistance:5,quietDistance:15,maxDistance:20,smoothingSeconds:.25};
// A TV is quieter than the jukebox: its sound fades out sooner around its own screen.
export const TV_AUDIO = {fullDistance:3,quietDistance:9,maxDistance:14,smoothingSeconds:.25};
// The stage screen fills the backyard.
export const TELAO_AUDIO = {fullDistance:7,quietDistance:20,maxDistance:30,smoothingSeconds:.25};
/**
 * Independent YouTube sources. The jukebox is sound only; a TV group shows one shared video on every screen
 * it lists. They share helpers, never state: separate maps, messages, players and volumes.
 */
export interface MediaSystem {
  readonly id:string;readonly kind:'jukebox'|'tv';readonly label:string;
  /** TV screens (TELEVISIONS ids) that show this source; empty for the jukebox. */
  readonly screens:readonly string[];
  /** Where the sound comes from: the jukebox, or each of the group's screens. */
  readonly sources:readonly Required<Position>[];
  readonly audio:typeof JUKEBOX_AUDIO;
}
export const JUKEBOX_SYSTEMS:readonly MediaSystem[] = [{id:'jukebox',kind:'jukebox',label:'Jukebox',screens:[],sources:[{x:JUKEBOX_PLACEMENT.x,y:JUKEBOX_PLACEMENT.y,z:JUKEBOX_PLACEMENT.z}],audio:JUKEBOX_AUDIO}];
export const TV_LABELS:Record<string,string> = {'tv-hall':'TV do salão','tv-left':'TV da parede lateral','tv-counter':'TV do balcão','tv-upstairs':'TV do andar de cima','telao':'Telão do palco'};
// The ground floor's TVs (hall, side wall and counter) always show the same video; upstairs has its own.
const TV_GROUPS=[
  {id:'tv-main',label:'TVs do salão',screens:['tv-hall','tv-left','tv-counter']},
  {id:'tv-upstairs',label:'TV do andar de cima',screens:['tv-upstairs']},
  {id:'telao',label:'Telão do palco',screens:['telao']},
] as const;
export const TV_SYSTEMS:readonly MediaSystem[] = TV_GROUPS.map(group=>({id:group.id,kind:'tv' as const,label:group.label,screens:group.screens,
  sources:group.screens.map(id=>{const tv=TELEVISIONS.find(t=>t.id===id)!;return {x:tv.x,y:tv.y,z:tv.z};}),audio:group.id==='telao'?TELAO_AUDIO:TV_AUDIO}));
const distance3=(a:Position,b:Position)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
/** The source of a system closest to the listener, with its index (the screen at that index, for TVs). */
export function nearestMediaSource(system:MediaSystem,listener:Position):{index:number;distance:number} {
  let index=0,best=Infinity;system.sources.forEach((source,i)=>{const d=distance3(listener,source);if(d<best){best=d;index=i;}});
  return {index,distance:best};
}
// Additional distance beyond the existing touching interaction, on client and server.
export const JUKEBOX_INTERACTION_SLACK = .2;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export function youtubeVideoId(input:string):string|null {
  if(input.length>2048||/[\u0000-\u0020\u007f\\]/.test(input))return null;
  let url:URL;try{url=new URL(input);}catch{return null;}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)return null;
  const host=url.hostname.toLowerCase();let id:string|null=null;
  if(host==='youtu.be') {const match=url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);id=match?.[1]??null;}
  else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
    if(url.pathname==='/watch'&&url.searchParams.getAll('v').length===1)id=url.searchParams.get('v');
    else id=url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1]??null;
  }
  return id&&VIDEO_ID.test(id)?id:null;
}
export type JukeboxStatus='off'|'playing'|'paused'|'stopped'|'ended';
export interface JukeboxState {
  id:string;videoId:string;status:JukeboxStatus;position:number;updatedAt:number;updatedBy:string;revision:number;
}
export const jukeboxCommandSchema=z.object({id:z.string().max(64),revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),action:z.enum(['play','pause','resume','stop','off']),url:z.string().max(2048).optional()}).strict();
export type JukeboxCommand=z.infer<typeof jukeboxCommandSchema>;
export function initialJukebox(id:string):JukeboxState{return {id,videoId:'',status:'off',position:0,updatedAt:0,updatedBy:'',revision:0};}
export function jukeboxTime(state:JukeboxState,now:number):number {
  return Math.min(86400,Math.max(0,state.position+(state.status==='playing'?Math.max(0,now-state.updatedAt)/1000:0)));
}
/** Synchronous compare-and-swap: two clients cannot overwrite the same revision. */
export function commandJukebox(state:JukeboxState,command:JukeboxCommand,userId:string,now:number):JukeboxState {
  if(command.id!==state.id)throw new Error('Aparelho desconhecido.');
  if(command.revision!==state.revision)throw new Error('Outra pessoa alterou a reprodução. Confira o estado e tente novamente.');
  const next={...state,position:jukeboxTime(state,now),updatedAt:now,updatedBy:userId,revision:state.revision+1};
  if(command.action==='play'){
    const id=youtubeVideoId(command.url?.trim()??'');if(!id)throw new Error('Cole um link válido de vídeo do YouTube.');
    next.videoId=id;next.position=0;next.status='playing';
  } else if(command.action==='off'){next.videoId='';next.position=0;next.status='off';}
  else {
    if(!state.videoId)throw new Error('Escolha um vídeo primeiro.');
    if(command.action==='pause'){if(state.status!=='playing')throw new Error('Nada está tocando agora.');next.status='paused';}
    else if(command.action==='resume'){next.status='playing';if(state.status==='ended')next.position=0;}
    else {next.position=0;next.status='stopped';}
  }
  return next;
}
/** Distance attenuation only. YouTube cannot be connected to Web Audio's PannerNode. */
export function jukeboxGain(listener:Position,source:Position,config=JUKEBOX_AUDIO):number {
  const d=Math.hypot(listener.x-source.x,(listener.y??0)-(source.y??0),listener.z-source.z);
  if(d<=config.fullDistance)return 1;if(d>=config.maxDistance)return 0;
  const smooth=(a:number,b:number,t:number)=>{t=Math.max(0,Math.min(1,t));return a+(b-a)*t*t*(3-2*t);};
  return d<=config.quietDistance?smooth(1,.07,(d-config.fullDistance)/(config.quietDistance-config.fullDistance)):smooth(.07,0,(d-config.quietDistance)/(config.maxDistance-config.quietDistance));
}
/** A system is as loud as its closest source: a TV group sounds from the screen nearest to the listener. */
export function mediaGain(listener:Position,system:MediaSystem):number {
  return jukeboxGain(listener,system.sources[nearestMediaSource(system,listener).index]!,system.audio);
}
