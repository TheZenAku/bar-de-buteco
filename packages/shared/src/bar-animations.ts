import map from './map-data.json';
import type {Position} from './index.js';
import {floorHeight,isWalkable} from './world.js';

/**
 * The characters' bar animations (18_animacoes_bar.py, export/animacoes/bar_<group>.glb): smoking, smoking a whole
 * cigarette (19_fumar_mixamo.py), vomiting, falling and getting up from the floor, sitting down at a table (pulling the
 * map's own chair), eating, getting up, clearing a table from its nearest corner, using a urinal, and Magrão pouring a
 * chopp or fetching a long neck at the counter.
 * The room syncs who does what and since when (animationState, animationStartedAt); every browser derives the clip and
 * its time from that with barTimeline, and the place it happens at with barFrame, so the bodies, the props and the
 * chairs move alike for everyone, and somebody arriving in the middle sees the action where it is.
 */
export const BAR_ANIMATIONS=map.barAnimations;
export type BarClip=keyof typeof map.barAnimations.clips;
export type BarGroup=keyof typeof map.barAnimations.groups;
export const barClipMs=(clip:BarClip):number=>Math.round(BAR_ANIMATIONS.clips[clip].duration*1000);
/** Where a clip's space sits on the map: its origin on the floor, and its +Z turned `yaw` radians (zero faces +Z). */
export interface BarFrame {x:number;y:number;z:number;yaw:number}
/** A point of a clip's space (metres, its yaw in radians) on the map. */
export function inFrame(frame:BarFrame,local:{x:number;z:number;yaw?:number}):Required<Position>&{rotation:number} {
  const cos=Math.cos(frame.yaw),sin=Math.sin(frame.yaw);
  return {x:frame.x+local.x*cos+local.z*sin,y:frame.y,z:frame.z-local.x*sin+local.z*cos,rotation:frame.yaw+(local.yaw??0)};
}

/** The urinals (Mictorio_Lugar_N): where a body stands facing the urinal (+Z), from the start to the end of `urinar`. */
export const URINALS=BAR_ANIMATIONS.urinals;
/** Magrão behind the counter (Balcao_Lugar_Magrao), facing the customers, and where he leaves the drink (Balcao_Entrega). */
export const MAGRAO_SPOT:Required<Position>&{rotation:number}={...BAR_ANIMATIONS.counter.magrao,rotation:BAR_ANIMATIONS.counter.magrao.yaw};
export const DRINK_DELIVERY=BAR_ANIMATIONS.counter.delivery;
/** Magrão's clips, and the animation state the room gives him for each. */
export const SERVE_STATES={'serve-chopp':'magrao_chopp','serve-chopp-dark':'magrao_chopp_escuro','serve-longneck':'magrao_longneck'} as const satisfies Record<string,BarClip>;
export type ServeState=keyof typeof SERVE_STATES;
/** What Magrão does for each drink sold at the counter: the chopp at the tap, the long neck from the freezer. */
export const SERVE_FOR_DRINK:Readonly<Record<string,ServeState>>={copo:'serve-chopp',garrafa:'serve-longneck'};
export const serveMs=(item:string):number=>barClipMs(SERVE_STATES[SERVE_FOR_DRINK[item]??'serve-chopp']);

const seats=new Map(map.seats.map(seat=>[seat.id,seat]));
/** A chair's space: the instance on the floor, facing its table (the seat's rotation is the chair's own). */
export const seatFrame=(seat:{x:number;y:number;z:number;rotation:number}):BarFrame=>({x:seat.x,y:seat.y,z:seat.z,yaw:seat.rotation});
/**
 * A place on a picnic table's bench (the backyard's tables 24-31): there is no chair to pull, so the body sits straight
 * down into the seated loop and gets up straight back, behind the bench.
 */
export const onBench=(seatId:string):boolean=>!!seats.get(seatId)?.bench;
// From the bench's seat line to clear of the bench and the table's volume (the bench is 0.3 m deep, the body 0.34 m round).
const BENCH_EXIT=.55;
/** Where getting up leaves the body, facing the table: beside the chair (where `levantar` ends), or behind the bench. */
export function seatExit(seatId:string):(Required<Position>&{rotation:number})|undefined {
  const seat=seats.get(seatId);
  return seat&&inFrame(seatFrame(seat),seat.bench?{x:0,z:-BENCH_EXIT}:BAR_ANIMATIONS.clips.levantar.end);
}
/**
 * Where the room stands a body that got up: where `levantar` leaves it or, when that is a few centimetres into the table's
 * volume (the chairs' authored angles vary), the nearest free floor around it. Undefined only for an unknown seat.
 */
export function standUpSpot(seatId:string):(Required<Position>&{rotation:number})|undefined {
  const exit=seatExit(seatId);
  if(!exit||isWalkable(exit.x,exit.z,exit.y))return exit;
  for(let r=.05;r<=.4;r+=.05)for(let k=0;k<16;k++){
    const x=exit.x+Math.sin(k*Math.PI/8)*r,z=exit.z+Math.cos(k*Math.PI/8)*r,y=floorHeight(x,z,exit.y);
    if(y!==undefined&&Math.abs(y-exit.y)<.08&&isWalkable(x,z,y))return {...exit,x,y,z};
  }
}
/** The chair instance (INST_A_cadeira-vermelha) a seat is, pulled back by `sentar` and put back by `levantar`. */
export const seatChair=(seatId:string):number|undefined=>seats.get(seatId)?.chair;

/** The tables `limpar_mesa` was made for: the four-seat ones (Mesa_NN with lugares = 4). */
export const CLEANABLE_TABLES=map.tables.filter(table=>table.places===4);
/** The four corner spaces of a table: its centre on the floor turned by quarter turns, the corner at the clip's (+x, -z). */
export function tableCorners(table:(typeof map.tables)[number]):BarFrame[] {
  return [0,1,2,3].map(quarter=>({x:table.anchor.x,y:table.y,z:table.anchor.z,yaw:table.anchor.yaw+quarter*Math.PI/2}));
}
/** ancoraMesa: the corner space nearest to `position` (the module's quarter turn of the table). */
export function nearestCorner(table:(typeof map.tables)[number],position:Position):BarFrame {
  const {x,z,yaw}=table.anchor,dx=position.x-x,dz=position.z-z,cos=Math.cos(yaw),sin=Math.sin(yaw);
  const localX=dx*cos-dz*sin,localZ=dx*sin+dz*cos,quarter=Math.round((Math.atan2(-localZ,localX)-Math.PI/4)/(Math.PI/2));
  return {x,y:table.y,z,yaw:yaw+quarter*Math.PI/2};
}
/** Where a worker stands clearing a table from one of its corners. */
export const cornerSpot=(frame:BarFrame)=>inFrame(frame,BAR_ANIMATIONS.clips.limpar_mesa.start);

/** The room's states for the bar animations (AnimationState in index.ts). */
export const BAR_STATES=['stand-up','urinate','smoke','smoke-stop','cigarette','vomit','clean',...Object.keys(SERVE_STATES) as ServeState[]] as const;
interface Actor {animationState?:string;animation?:string;animationStartedAt?:number;interactionState?:string;currentTableId?:string;x:number;y?:number;z:number}
const stateOf=(actor:Actor)=>actor.animationState??actor.animation??'';

/**
 * Where the clip an actor plays happens: the chair of the seat, the urinal, the table corner they stand at, Magrão's
 * place; undefined when the clip is in the body's own space (smoking, vomiting, falling), at the avatar's feet.
 */
export function barFrame(actor:Actor,npcId=''):BarFrame|undefined {
  const state=stateOf(actor),place=actor.interactionState??'';
  if(npcId==='bartender'&&state in SERVE_STATES)return {...BAR_ANIMATIONS.counter.magrao};
  if((state==='sit'||state==='stand-up')&&place.startsWith('seat-')&&!actor.currentTableId){const seat=seats.get(place);return seat&&seatFrame(seat);}
  if(state==='urinate'){const urinal=URINALS.find(u=>u.id===place);return urinal&&{...urinal};}
  if(state==='clean'){
    // The room puts the worker on the corner spot (cornerSpot): the table and corner are the ones they stand at.
    for(const table of CLEANABLE_TABLES)for(const frame of tableCorners(table)){
      const spot=cornerSpot(frame);
      if(Math.hypot(spot.x-actor.x,spot.z-actor.z)<.15&&Math.abs(spot.y-(actor.y??spot.y))<.5)return frame;
    }
  }
}

/** A seated customer's food (served from their seat): since when they eat, and when they finished (0 while eating). */
export interface Meal {startedAt:number;endedAt:number}
/** A clip at a moment: `time` seconds into it, begun at `startedAt` (server ms), entered with a `blend` of seconds. */
export interface BarStep {clip:BarClip;time:number;startedAt:number;blend:number}
// Seconds of the cross-fade into an action (animacoes_bar.js TRANSICAO), out of a loop into the next step, and into a fall.
const ENTER=.3,FROM_LOOP=.4,FALL=.15;

/** One clip after the other, each once, from `startedAt`; the last loops (a loop clip) or holds its last frame. */
function chain(clips:readonly BarClip[],startedAt:number,now:number,blend:number):BarStep {
  let start=startedAt;
  for(let i=0;i<clips.length;i++){
    const clip=clips[i]!,ms=barClipMs(clip);
    if(i===clips.length-1||now<start+ms){
      const age=Math.max(0,now-start);
      return {clip,time:(BAR_ANIMATIONS.clips[clip].loop?age%ms:Math.min(age,ms))/1000,startedAt:start,blend:i?0:blend};
    }
    start+=ms;
  }
  throw new Error('chain sem clipes');
}

/** Seated at a table: sitting down (not on a bench), the loop, and eating whatever food is in front of them. */
function seated(sat:number,now:number,meal?:Meal,bench=false):BarStep {
  const down=bench?sat:sat+barClipMs('sentar');
  if(now<down)return chain(['sentar'],sat,now,ENTER);
  let loopFrom=down;
  if(meal&&meal.startedAt<=now){
    const begin=Math.max(meal.startedAt,down),eaten=meal.endedAt&&Math.max(meal.endedAt,begin+barClipMs('comer_comecar'));
    if(!eaten||now<eaten)return chain(['comer_comecar','comer_loop'],begin,now,FROM_LOOP);
    if(now<eaten+barClipMs('comer_terminar'))return chain(['comer_terminar'],eaten,now,FROM_LOOP);
    loopFrom=eaten+barClipMs('comer_terminar');
  }
  return chain(['sentado_loop'],loopFrom,now,0);
}

/**
 * The bar clip an actor plays at `now` (server ms), from the room's state: undefined when none applies (walking, idle,
 * the game's own gestures). `meal` only matters at a table.
 */
export function barTimeline(actor:Actor,now:number,npcId='',meal?:Meal):BarStep|undefined {
  const state=stateOf(actor),from=actor.animationStartedAt??0,place=actor.interactionState??'';
  if(npcId==='bartender'&&state in SERVE_STATES)return chain([SERVE_STATES[state as ServeState]],from,now,ENTER);
  switch(state){
    case 'sit':return place.startsWith('seat-')&&!actor.currentTableId?seated(from,now,meal,onBench(place)):undefined;
    // `from` is when getting up begins: asked for while sitting down, it waits for the body to be on the chair.
    case 'stand-up':return now<from?seated(from-barClipMs('sentar'),now,meal):chain(['levantar'],from,now,FROM_LOOP);
    case 'urinate':return chain(['urinar'],from,now,ENTER);
    case 'smoke':return chain(['fumar_acender','fumar_loop'],from,now,ENTER);
    // Asked to stop while still lighting up: the cigarette goes out once it is lit.
    case 'smoke-stop':return now<from?chain(['fumar_acender'],from-barClipMs('fumar_acender'),now,ENTER):chain(['fumar_apagar'],from,now,FROM_LOOP);
    // A whole cigarette, from the pack in the pocket to the butt stepped on (animacoes_bar.js fumarCigarro).
    case 'cigarette':return chain(['fumar_mixamo'],from,now,ENTER);
    case 'vomit':return chain(['vomitar'],from,now,ENTER);
    case 'fallen':return chain(['cair'],from,now,FALL);
    case 'recover':return chain(['levantar_chao'],from,now,0);
    case 'clean':return chain(['limpar_mesa'],from,now,ENTER);
  }
}
