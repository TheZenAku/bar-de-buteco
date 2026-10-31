import {z} from 'zod';
import map from './map-data.json';
import type {Position} from './index.js';
import {mediaIsStream,parseMediaLink,type MediaProvider} from './media-links.js';

// The stage's front edge, on the side its screen faces (15_palco.py: the audience side). Touching it, from the backyard
// floor or from the deck, uses the screen; its control spot is the floor in front of the middle of that edge.
const deck=map.stage.deck,facing={x:Math.round(Math.sin(map.stage.screen.yaw*Math.PI/180)),z:Math.round(Math.cos(map.stage.screen.yaw*Math.PI/180))};
export const STAGE_FRONT={id:'stage-front',x:deck.x+facing.x*deck.hx,z:deck.z+facing.z*deck.hz,hx:facing.x?.05:deck.hx,hz:facing.z?.05:deck.hz};
/** Metres, matching the authored Tela_TV material in BarBoteco (no model replacement). */
export const TELEVISIONS = [
  {id:'tv-hall',x:7.3,y:2.33,z:-11.447,width:1.06,height:.6,yaw:0},
  {id:'tv-left',x:3.753,y:2.33,z:-10,width:1.06,height:.6,yaw:90},
  {id:'tv-counter',x:20,y:2.33,z:-3.753,width:1.06,height:.6,yaw:180},
  {id:'tv-upstairs',x:17.5,y:5.38,z:-3.753,width:1.06,height:.6,yaw:180},
  // The stage's LED screen (15_palco.py: Telao_Tela on the back truss, facing the audience). It hangs above the stage
  // floor, so it is used at the stage's front edge (STAGE_FRONT), without a stage pass.
  {id:'telao',...map.stage.screen,control:{x:STAGE_FRONT.x+facing.x*.5,y:deck.minY,z:STAGE_FRONT.z+facing.z*.5}},
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
 * Independent sources (any platform of media-links.ts). The jukebox is sound only; a TV group shows one shared video on every screen
 * it lists. They share helpers, never state: separate maps, messages, players and volumes.
 */
export interface MediaSystem {
  readonly id:string;readonly kind:'jukebox'|'tv';readonly label:string;
  /** TV screens (TELEVISIONS ids) that show this source; empty for the jukebox. */
  readonly screens:readonly string[];
  /** Where the sound comes from: the jukebox, or each of the group's screens. */
  readonly sources:readonly Required<Position>[];
  readonly audio:typeof JUKEBOX_AUDIO;
  /** Sound area: the bar (jukebox and TVs) or the backyard stage (its screen). Two areas never play over each other (areaMix). */
  readonly area:'bar'|'stage';
}
export const JUKEBOX_SYSTEMS:readonly MediaSystem[] = [{id:'jukebox',kind:'jukebox',label:'Jukebox',screens:[],sources:[{x:JUKEBOX_PLACEMENT.x,y:JUKEBOX_PLACEMENT.y,z:JUKEBOX_PLACEMENT.z}],audio:JUKEBOX_AUDIO,area:'bar'}];
export const TV_LABELS:Record<string,string> = {'tv-hall':'TV do salão','tv-left':'TV da parede lateral','tv-counter':'TV do balcão','tv-upstairs':'TV do andar de cima','telao':'Telão do palco'};
// The ground floor's TVs (hall, side wall and counter) always show the same video; upstairs has its own.
const TV_GROUPS=[
  {id:'tv-main',label:'TVs do salão',screens:['tv-hall','tv-left','tv-counter']},
  {id:'tv-upstairs',label:'TV do andar de cima',screens:['tv-upstairs']},
  {id:'telao',label:'Telão do palco',screens:['telao']},
] as const;
export const TV_SYSTEMS:readonly MediaSystem[] = TV_GROUPS.map(group=>({id:group.id,kind:'tv' as const,label:group.label,screens:group.screens,
  sources:group.screens.map(id=>{const tv=TELEVISIONS.find(t=>t.id===id)!;return {x:tv.x,y:tv.y,z:tv.z};}),
  audio:group.id==='telao'?TELAO_AUDIO:TV_AUDIO,area:group.id==='telao'?'stage' as const:'bar' as const}));
const distance3=(a:Position,b:Position)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
/** The source of a system closest to the listener, with its index (the screen at that index, for TVs). */
export function nearestMediaSource(system:MediaSystem,listener:Position):{index:number;distance:number} {
  let index=0,best=Infinity;system.sources.forEach((source,i)=>{const d=distance3(listener,source);if(d<best){best=d;index=i;}});
  return {index,distance:best};
}
// Additional distance beyond the existing touching interaction, on client and server.
export const JUKEBOX_INTERACTION_SLACK = .2;
/** A live broadcast's timeline counts in the stream's own seconds, which can run for days. */
export const MEDIA_MAX_SECONDS=1e9;
/** Videos waiting on one source, and how many of them one person may have there. */
export const MEDIA_QUEUE={max:20,perPlayer:3} as const;
/** A video waiting its turn. `by` put it in the queue and paid for it. `thumb`: its cover, as its platform gives it. */
export interface MediaQueueEntry {key:string;provider:MediaProvider|'';videoId:string;title:string;thumb:string;by:string;byName:string}
export type JukeboxStatus='off'|'playing'|'paused';
export interface JukeboxState {
  id:string;
  /** The platform of the link playing, and its id there (a direct link's id is its address). */
  provider:MediaProvider|'';videoId:string;
  status:JukeboxStatus;position:number;updatedAt:number;updatedBy:string;
  /** Bumped by every change to the playback (not by the queue): players resync on it, and commands compare-and-swap it. */
  revision:number;
  /** The queue entry playing now, its title as its platform gives it (plain text; '' while unknown) and its cover. */
  key:string;title:string;thumb:string;
  /**
   * Who controls the video playing: whoever put it on, from wherever they can hear it. Empty once they leave the bar;
   * then anyone at the screen takes it over with a command.
   */
  by:string;byName:string;
  /** A live broadcast: the timeline counts in the stream's seconds, and its live edge is the stream's elapsed time. */
  live:boolean;
  queue:MediaQueueEntry[];
}
const commandBase={id:z.string().max(64),revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)};
export const jukeboxCommandSchema=z.discriminatedUnion('action',[
  // A new video: it plays at once on an idle source and waits in the queue otherwise.
  z.object({...commandBase,action:z.literal('play'),url:z.string().max(2048)}).strict(),
  // The controller's: pause, resume, the next video (switching off after the last one) and a jump to any moment.
  z.object({...commandBase,action:z.enum(['pause','resume','skip'])}).strict(),
  z.object({...commandBase,action:z.literal('seek'),position:z.number().finite().min(0).max(MEDIA_MAX_SECONDS)}).strict(),
  // One's own video taken out of the queue.
  z.object({...commandBase,action:z.literal('remove'),entry:z.string().min(1).max(64)}).strict(),
]);
export type JukeboxCommand=z.infer<typeof jukeboxCommandSchema>;
/** Who sends a command, as the queue shows them. */
export interface MediaActor {id:string;name:string}
export function initialJukebox(id:string):JukeboxState{return {id,provider:'',videoId:'',status:'off',position:0,updatedAt:0,updatedBy:'',revision:0,key:'',title:'',thumb:'',by:'',byName:'',live:false,queue:[]};}
export function jukeboxTime(state:JukeboxState,now:number):number {
  return Math.min(MEDIA_MAX_SECONDS,Math.max(0,state.position+(state.status==='playing'?Math.max(0,now-state.updatedAt)/1000:0)));
}
function startMedia(state:JukeboxState,entry:MediaQueueEntry,now:number,updatedBy:string):JukeboxState {
  return {...state,key:entry.key,provider:entry.provider,videoId:entry.videoId,title:entry.title,thumb:entry.thumb,by:entry.by,byName:entry.byName,live:mediaIsStream(entry.provider,entry.videoId),status:'playing',position:0,updatedAt:now,updatedBy,revision:state.revision+1};
}
/** The next video in the queue starts from its beginning; after the last one the source switches off. */
export function advanceMedia(state:JukeboxState,now:number,updatedBy:string):JukeboxState {
  const [next,...queue]=state.queue;
  return next?startMedia({...state,queue},next,now,updatedBy)
    :{...state,queue,key:'',provider:'',videoId:'',title:'',thumb:'',by:'',byName:'',live:false,status:'off',position:0,updatedAt:now,updatedBy,revision:state.revision+1};
}
/**
 * Compare-and-swap for the playback: two people cannot overwrite the same revision. Adding to the queue and taking
 * one's own video out of it never conflict, so they skip that check. `added`: the new entry's key, and the title and
 * cover the server checked (the platform's oEmbed), for `play`.
 */
export function commandJukebox(state:JukeboxState,command:JukeboxCommand,actor:MediaActor,now:number,added?:{key:string;title:string;thumb?:string}):JukeboxState {
  if(command.id!==state.id)throw new Error('Aparelho desconhecido.');
  if(command.action==='play'){
    const link=parseMediaLink(command.url);if('error' in link)throw new Error(link.error);
    if(state.videoId===link.id||state.queue.some(entry=>entry.videoId===link.id))throw new Error('Este vídeo já está na fila.');
    const entry={key:added?.key??String(now),provider:link.provider,videoId:link.id,title:added?.title||link.title,thumb:added?.thumb??'',by:actor.id,byName:actor.name};
    if(state.status==='off')return startMedia(state,entry,now,actor.id);
    if(state.queue.length>=MEDIA_QUEUE.max)throw new Error(`A fila está cheia (${MEDIA_QUEUE.max} vídeos). Espere ela andar.`);
    if(state.queue.filter(other=>other.by===actor.id).length>=MEDIA_QUEUE.perPlayer)throw new Error(`Você já tem ${MEDIA_QUEUE.perPlayer} vídeos na fila. Espere um deles tocar.`);
    return {...state,queue:[...state.queue,entry]};
  }
  if(command.action==='remove'){
    const entry=state.queue.find(other=>other.key===command.entry);if(!entry)throw new Error('Este vídeo já saiu da fila.');
    if(entry.by!==actor.id)throw new Error('Só quem pôs o vídeo na fila pode tirá-lo.');
    return {...state,queue:state.queue.filter(other=>other!==entry)};
  }
  if(command.revision!==state.revision)throw new Error('Outra pessoa alterou a reprodução. Confira o estado e tente novamente.');
  if(!state.videoId)throw new Error('Nada está tocando agora.');
  if(state.by&&state.by!==actor.id)throw new Error(`Quem controla este vídeo é ${state.byName||'quem o colocou'}. Ponha o seu na fila.`);
  if(command.action==='skip')return advanceMedia(state,now,actor.id);
  // Nobody controls it (whoever put it on left the bar): this command takes it over.
  const next={...state,by:actor.id,byName:actor.name,position:jukeboxTime(state,now),updatedAt:now,updatedBy:actor.id,revision:state.revision+1};
  if(command.action==='pause'){if(state.status!=='playing')throw new Error('O vídeo já está pausado.');next.status='paused';}
  else if(command.action==='resume'){if(state.status!=='paused')throw new Error('O vídeo já está tocando.');next.status='playing';}
  else if(command.action==='seek')next.position=command.position;
  return next;
}
/** Switches a source off and empties its queue (the administration). */
export function clearMedia(state:JukeboxState,now:number,updatedBy:string):JukeboxState {return advanceMedia({...state,queue:[]},now,updatedBy);}
const reportBase={id:z.string().max(64),revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),videoId:z.string().min(1).max(2048).regex(/^[^\s<>"\\]+$/)};
/** `<prefix>.ended`: the video reached its end in the reporter's player. */
export const mediaEndedSchema=z.object({...reportBase,duration:z.number().finite().positive().max(MEDIA_MAX_SECONDS)}).strict();
/** `<prefix>.failed`: the platform refused to play it there (an onError code). */
export const mediaFailedSchema=z.object({...reportBase,code:z.number().int().min(0).max(9999)}).strict();
/** `<prefix>.live`: it is a live broadcast whose live edge, in the reporter's player, is `edge` seconds into the stream. */
export const mediaLiveSchema=z.object({...reportBase,edge:z.number().finite().min(0).max(MEDIA_MAX_SECONDS)}).strict();
/** Errors for a video that cannot play on other sites at all: removed, private, embedding off, bad id (YouTube's codes, which every player in apps/web/src/media speaks). */
export const PLAYBACK_REFUSED:readonly number[]=[2,100,101,150];
/** Whoever controls the video tells what its player sees; while nobody does, anyone may. */
export function mediaReporter(state:JukeboxState,userId:string):boolean {return !state.by||state.by===userId;}
const reportApplies=(state:JukeboxState,report:{revision:number;videoId:string},userId:string)=>mediaReporter(state,userId)&&state.status!=='off'&&state.revision===report.revision&&state.videoId===report.videoId;
/** Seconds an end may come before the shared timeline gets there (players load and buffer a little behind it). */
const END_SLACK=8;
/** The video ended: the queue moves on. Null for a stale, early or unauthorised report. */
export function endMedia(state:JukeboxState,report:z.infer<typeof mediaEndedSchema>,userId:string,now:number):JukeboxState|null {
  if(!reportApplies(state,report,userId)||state.status!=='playing'||jukeboxTime(state,now)<report.duration-END_SLACK)return null;
  return advanceMedia(state,now,userId);
}
/** The platform refused to play the video: the queue moves on. */
export function failMedia(state:JukeboxState,report:z.infer<typeof mediaFailedSchema>,userId:string,now:number):JukeboxState|null {
  return reportApplies(state,report,userId)&&PLAYBACK_REFUSED.includes(report.code)?advanceMedia(state,now,userId):null;
}
/**
 * A live broadcast: the shared timeline jumps to its live edge. A video's own seconds start at 0, so a live stream put on
 * at 0 would play from the beginning of its recording, hours behind the broadcast. YouTube counts a live stream's time
 * from when it began, the same for every viewer, so the timeline stays in sync from there.
 */
export function liveMedia(state:JukeboxState,report:z.infer<typeof mediaLiveSchema>,userId:string,now:number):JukeboxState|null {
  if(!reportApplies(state,report,userId)||state.live)return null;
  return {...state,live:true,position:report.edge,updatedAt:now,updatedBy:userId,revision:state.revision+1};
}
/** Distance attenuation only. An embedded player cannot be connected to Web Audio's PannerNode. */
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
/** Below this share of the two areas' loudness an area is silent; above its mirror it plays alone. */
const AREA_CROSSFADE=[.3,.7] as const;
/**
 * The stage's screen and the bar's jukebox and TVs never play over each other: where both reach the listener, the area
 * that sounds louder there takes over and the other fades out, with a short crossfade where both are about as loud.
 * `playing`: the sources playing right now (a paused one makes no sound, so it never silences the other area).
 * Sources of the same area still mix as before.
 */
export function areaMix(listener:Position,system:MediaSystem,playing:readonly MediaSystem[]):number {
  const loudest=(inArea:boolean)=>Math.max(0,...playing.filter(other=>(other.area===system.area)===inArea).map(other=>mediaGain(listener,other)));
  const own=Math.max(mediaGain(listener,system),loudest(true)),other=loudest(false);
  if(other<=0)return 1;if(own<=0)return 0;
  const [from,to]=AREA_CROSSFADE,t=Math.max(0,Math.min(1,(own/(own+other)-from)/(to-from)));
  return t*t*(3-2*t);
}
