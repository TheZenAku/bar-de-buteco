import {z} from 'zod';
import type {Position} from './index.js';

/** Metres, matching the authored Tela_TV material in BarBoteco (no model replacement). */
export const TELEVISIONS = [
  {id:'tv-hall',x:7.3,y:2.33,z:-11.447,width:1.06,height:.6,yaw:0},
  {id:'tv-left',x:3.753,y:2.33,z:-10,width:1.06,height:.6,yaw:90},
  {id:'tv-counter',x:20,y:2.33,z:-3.753,width:1.06,height:.6,yaw:180},
  {id:'tv-upstairs',x:17.5,y:5.38,z:-3.753,width:1.06,height:.6,yaw:180},
] as const;
export const JUKEBOX_PLACEMENT={x:12.3,y:.3,z:-10.3,hx:.45,hz:.3};
export const JUKEBOX_SYSTEMS = [{id:'jukebox',tvId:'tv-hall',source:JUKEBOX_PLACEMENT}] as const;
export const JUKEBOX_AUDIO = {fullDistance:5,quietDistance:15,maxDistance:20,smoothingSeconds:.25};
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
  id:string;tvId:string;videoId:string;status:JukeboxStatus;position:number;updatedAt:number;updatedBy:string;revision:number;
}
export const jukeboxCommandSchema=z.object({id:z.string().max(64),revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),action:z.enum(['play','pause','resume','stop','off']),url:z.string().max(2048).optional()}).strict();
export type JukeboxCommand=z.infer<typeof jukeboxCommandSchema>;
export function initialJukebox(id:string,tvId:string):JukeboxState{return {id,tvId,videoId:'',status:'off',position:0,updatedAt:0,updatedBy:'',revision:0};}
export function jukeboxTime(state:JukeboxState,now:number):number {
  return Math.min(86400,Math.max(0,state.position+(state.status==='playing'?Math.max(0,now-state.updatedAt)/1000:0)));
}
/** Synchronous compare-and-swap: two clients cannot overwrite the same revision. */
export function commandJukebox(state:JukeboxState,command:JukeboxCommand,userId:string,now:number):JukeboxState {
  if(command.id!==state.id)throw new Error('Jukebox desconhecida.');
  if(command.revision!==state.revision)throw new Error('Outra pessoa alterou a jukebox. Confira o estado e tente novamente.');
  const next={...state,position:jukeboxTime(state,now),updatedAt:now,updatedBy:userId,revision:state.revision+1};
  if(command.action==='play'){
    const id=youtubeVideoId(command.url?.trim()??'');if(!id)throw new Error('Cole um link válido de vídeo do YouTube.');
    next.videoId=id;next.position=0;next.status='playing';
  } else if(command.action==='off'){next.videoId='';next.position=0;next.status='off';}
  else {
    if(!state.videoId)throw new Error('Escolha um vídeo primeiro.');
    if(command.action==='pause'){if(state.status!=='playing')throw new Error('A jukebox não está reproduzindo.');next.status='paused';}
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
