import data from './gates-data.json';
import type {Collider} from '../index.js';

/**
 * EMPRESA BRASIL's dynamic leaves, all exported SHUT in empresa_brasil_portoes.glb + .json (v2; the numbers in gates-data.json come from
 * tools/assets/factory-gates-data.mjs, one entry per leaf of the JSON): the vehicle gate (EB_Portao), the control room's glass door
 * (EB_Porta_Auto_Folha), the four swing doors of the production floor (EB_Porta_Impacto_*), the workshop's door and roller shutter and the
 * staff's emergency door. What opens each one depends on its `mode`:
 *  - 'interfone': the vehicle gate. Never by proximity. Staff (owner, manager, hired employee) ring the intercom and it opens for a while
 *    (GATE_HOLD_OPEN_S); whoever is outside only calls; the operators on shift open and shut it from the control room's computer.
 *  - 'automatica': opens when a person comes near (the control room's door).
 *  - 'impacto': swing door; opens away from whoever pushes it and shuts when the doorway is free.
 *  - 'manual': E opens and shuts it (the bar's door mechanism).
 * The state of each leaf is its entry in the synced door states (`open`, `changedAt`, `side`). Where the leaf is drawn and where its collision
 * box stands are functions of that state and the clock (`gateOpenness`), so the room, the browser's prediction and the drawing agree.
 */
export type GateKind='correr'|'giratoria'|'enrolar';
export type GateMode='interfone'|'automatica'|'impacto'|'manual';
export interface FactoryGate {
  /** Its entry in the synced door states, and the node of empresa_brasil_portoes.glb. */
  id:string;label:string;kind:GateKind;mode:GateMode;
  /** The node's origin where the leaf stands shut (game coordinates): the hinge of a door, the top of a roller shutter. */
  origin:readonly [number,number,number];
  /** Seconds the leaf takes to run its whole way. */
  seconds:number;
  /** Metres: the reach of the leaf's trigger (a person near; E for the manual ones). */
  radius:number;
  /** 'correr': the unit axis the leaf slides along, how far (m), and how far along it the trigger's centre lies (the leaf starts before a body is at the opening). 'enrolar': how tall the shutter is (travel). */
  axis:readonly [number,number,number];travel:number;lead:number;centre:{x:number;z:number};
  /** 'giratoria': the open angle (degrees about +Y, relative to the shut pose; its sign is the way it swings) and whether it also swings the other way (the swing doors). */
  angle:number;swing:boolean;
  /** 'enrolar': the Y scale of the leaf when open (the node's origin is its top, which stays). */
  openScale:number;
  /** Metres around the shut leaf's box in which a body keeps the leaf from shutting on it (plus the body's own size). */
  keepClear:number;
  /** The leaf's collision box while it is shut (axis-aligned). */
  box:{min:readonly [number,number,number];max:readonly [number,number,number]};
  collider:Collider;
}
/** What the room publishes for a leaf (a door state of the synced world). `side`: +1 a swing door opened as authored, -1 the other way. */
export interface GateState {open:boolean;changedAt:number;side?:number}
/** A body the leaves react to: where it is and how much room it needs around it (a person, a truck). */
export interface GateBody {x:number;z:number;size:number;vehicle?:boolean}

interface RawGate {
  id:string;kind:GateKind;mode:GateMode;origin:[number,number,number];radius:number;seconds:number;box:{min:[number,number,number];max:[number,number,number]};
  axis?:[number,number,number];travel?:number;lead?:number;angle?:number;swing?:boolean;openScale?:number;
}
const LABELS:Record<string,string>={
  EB_Portao:'Portão de veículos',EB_Porta_Auto_Folha:'Porta da sala de controle',EB_Oficina_Porta:'Porta da oficina mecânica',
  EB_Oficina_Portao_Enrolar:'Portão de enrolar da oficina',EB_Porta_Entrada:'Porta de pessoal (saída de emergência)',
};
/** My calls where the model's JSON is silent: the keep-clear margin of a leaf that shuts on the doorway. */
const KEEP_CLEAR:Record<string,number>={EB_Portao:1.2,EB_Porta_Auto_Folha:.8};
/** How far past its radius (m) the last person must be before the control room's door shuts, and before a swing door does. */
export const GATE_HYSTERESIS=2.5;
export const SWING_HYSTERESIS=.5;
/** Body sizes (m) for the keep-clear rule. */
export const GATE_PERSON_SIZE=.34;
export const GATE_VEHICLE_SIZE=3;
/** Seconds the vehicle gate stays open after staff rang the intercom (it shuts once the doorway is free). */
export const GATE_HOLD_OPEN_S=30;
/** A leaf that is shutting and has opened more than this reopens when somebody steps into its way. */
const REOPEN_FROM=.02;

export const FACTORY_GATES:readonly FactoryGate[]=(data.gates as unknown as RawGate[]).map(raw=>{
  const [minX,minY,minZ]=raw.box.min,[maxX,maxY,maxZ]=raw.box.max,axis=raw.axis??[0,0,0],lead=raw.lead??0;
  return {
    id:raw.id,label:LABELS[raw.id]??(raw.mode==='impacto'?'Porta de vai-e-vem':'Porta'),kind:raw.kind,mode:raw.mode,origin:raw.origin,seconds:raw.seconds,radius:raw.radius,
    axis,travel:raw.travel??0,lead,centre:{x:raw.origin[0]+axis[0]*lead,z:raw.origin[2]+axis[2]*lead},
    angle:raw.angle??0,swing:!!raw.swing,openScale:raw.openScale??1,
    keepClear:KEEP_CLEAR[raw.id]??.5,box:raw.box,
    collider:{id:raw.id,x:(minX+maxX)/2,z:(minZ+maxZ)/2,hx:(maxX-minX)/2,hz:(maxZ-minZ)/2,minY,maxY},
  };
});
export const FACTORY_GATE_IDS:readonly string[]=FACTORY_GATES.map(gate=>gate.id);
export const gateById=(id:string):FactoryGate|undefined=>FACTORY_GATES.find(gate=>gate.id===id);

/**
 * The intercom of the vehicle gate: the post stands on the pavement beside it (the sector's EB_Interfone; its lamp, EB_Interfone_Lampada, is in the gates'
 * GLB). Outsiders ring here; `reach` is how close a player must be (Ponto_EB_Interfone).
 */
export const FACTORY_INTERCOM={...data.interfone,ringCooldownS:8,ringTtlS:60} as const;

// ---- where a leaf is: a function of its published state and the clock ----
/** The easing of a leaf's run (the drawing and the collision use the same curve). */
export const gateEase=(u:number):number=>u*u*(3-2*u);
/** How far open the leaf is, 0 (shut) to 1 (open), linear in time. A state nobody changed yet (changedAt 0) is as it says. */
export function gateOpenness(gate:FactoryGate,state:GateState,now:number):number {
  if(!(state.changedAt>0))return state.open?1:0;
  const done=Math.min(1,Math.max(0,(now-state.changedAt)/(gate.seconds*1000)));
  return state.open?done:1-done;
}
/** The `changedAt` for a leaf told to open or shut now: back-dated so that it carries on from where it is (a leaf turned round half way does not jump). */
export function gateRetime(gate:FactoryGate,state:GateState,open:boolean,now:number):number {
  const here=gateOpenness(gate,state,now);
  return Math.round(now-(open?here:1-here)*gate.seconds*1000);
}
export const gateSide=(state:Pick<GateState,'side'>):1|-1=>(state.side??0)<0?-1:1;

/** A swing door's box turned about its hinge (the node's origin) by `degrees`: its real rectangle (`turn`) and the box that encloses it. */
function turnedBox(gate:FactoryGate,degrees:number):Collider {
  const c=gate.collider;
  if(Math.abs(degrees)<1e-6)return c;
  const a=degrees*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a),dx=c.x-gate.origin[0],dz=c.z-gate.origin[2];
  return {id:gate.id,x:gate.origin[0]+dx*cos+dz*sin,z:gate.origin[2]-dx*sin+dz*cos,hx:Math.abs(cos)*c.hx+Math.abs(sin)*c.hz,hz:Math.abs(sin)*c.hx+Math.abs(cos)*c.hz,
    minY:c.minY,maxY:c.maxY,turn:{ux:cos,uz:-sin,lx:c.hx,lz:c.hz}};
}
/** The leaf's collision box at an eased position (0 shut .. 1 open) and, for a swing door, on the given side. */
export function gateBoxAt(gate:FactoryGate,eased:number,side:1|-1=1):Collider {
  const c=gate.collider;
  if(eased<=0)return c;
  if(gate.kind==='correr'){const d=gate.travel*eased;return {...c,x:c.x+gate.axis[0]*d,z:c.z+gate.axis[2]*d};}
  if(gate.kind==='giratoria')return turnedBox(gate,side*gate.angle*eased);
  // A roller shutter's slats roll up into the head (its origin is its top): the box shrinks towards the top.
  const top=c.maxY!,scale=1+(gate.openScale-1)*eased;
  return {...c,minY:top-(top-c.minY!)*scale};
}
/** Where the leaf's box is right now. */
export function gateSolid(gate:FactoryGate,state:GateState,now:number):Collider {
  return gateBoxAt(gate,gateEase(gateOpenness(gate,state,now)),gateSide(state));
}

/** Whether a static solid of the sector is this leaf's own shut box (to within a few centimetres): the leaf's moving box replaces it. */
export function replacesStatic(gate:FactoryGate,solid:Collider):boolean {
  const k=gate.collider,close=(a:number|undefined,b:number|undefined)=>a!==undefined&&b!==undefined&&Math.abs(a-b)<=.06;
  return !solid.turn&&close(solid.x,k.x)&&close(solid.z,k.z)&&close(solid.hx,k.hx)&&close(solid.hz,k.hz)&&close(solid.minY,k.minY)&&close(solid.maxY,k.maxY);
}

// ---- who is in the way ----
const FRACTIONS=[.15,.3,.45,.6,.75,.9,1];
const arcs=new Map<string,readonly Collider[]>();
/** The boxes a swing door passes through on its way from shut to open on one side (the shut box itself left out: it is solid anyway). */
function arc(gate:FactoryGate,side:1|-1):readonly Collider[] {
  const key=`${gate.id}:${side}`;let boxes=arcs.get(key);
  if(!boxes){boxes=FRACTIONS.map(fraction=>gateBoxAt(gate,fraction,side));arcs.set(key,boxes);}
  return boxes;
}
/** Whether a body of radius `r` reaches into a (possibly turned) box. */
function reaches(c:Collider,x:number,z:number,r:number):boolean {
  if(Math.abs(x-c.x)>=c.hx+r-1e-5||Math.abs(z-c.z)>=c.hz+r-1e-5)return false;
  const turn=c.turn;if(!turn)return true;
  const dx=x-c.x,dz=z-c.z;
  return Math.abs(dx*turn.ux+dz*turn.uz)<turn.lx+r-1e-5&&Math.abs(dz*turn.ux-dx*turn.uz)<turn.lz+r-1e-5;
}
/**
 * Whether a body is where the leaf passes or stands: a swing door's arc on that side (the body's own size counts), otherwise the shut leaf's box
 * with the keep-clear margin around it. A leaf never shuts on such a body (and a swing door never opens into it).
 */
export function inGateWay(gate:FactoryGate,side:1|-1,body:GateBody):boolean {
  if(gate.kind==='giratoria')return arc(gate,side).some(box=>reaches(box,body.x,body.z,body.size));
  const c=gate.collider,margin=gate.keepClear+body.size;
  return Math.abs(body.x-c.x)<c.hx+margin&&Math.abs(body.z-c.z)<c.hz+margin;
}
/** The distance (m) from a body to the shut leaf's box. */
function reach(gate:FactoryGate,body:GateBody):number {
  const c=gate.collider;
  return Math.hypot(Math.max(Math.abs(body.x-c.x)-c.hx,0),Math.max(Math.abs(body.z-c.z)-c.hz,0));
}

// ---- what a leaf that opens by itself wants ----
export interface GateWish {open:boolean;side:1|-1}
/**
 * What an automatic leaf ('automatica': the control room's door; 'impacto': the swing doors) wants right now. The other modes are commanded
 * (the intercom, the computer, E) and want what they are. Only people trigger them: a vehicle never opens a leaf.
 *  - 'automatica': open while a person is within `radius` of its centre (and, once open, within the radius plus GATE_HYSTERESIS).
 *  - 'impacto': a person within `radius` pushes it open, away from them (side +1, the authored way, towards -z, for whoever stands on the +z side; -1 for the other),
 *    unless somebody is in the arc it would sweep; once open it stays while a person is within the radius plus SWING_HYSTERESIS, and keeps its side until it has shut.
 */
export function gateWish(gate:FactoryGate,state:GateState,now:number,bodies:readonly GateBody[]):GateWish {
  const side=gateSide(state),people=bodies.filter(body=>!body.vehicle);
  if(gate.mode==='automatica'){
    const within=gate.radius+(state.open?GATE_HYSTERESIS:0);
    return {open:people.some(body=>Math.hypot(body.x-gate.centre.x,body.z-gate.centre.z)<within),side};
  }
  if(gate.mode!=='impacto')return {open:state.open,side};
  if(state.open||gateOpenness(gate,state,now)>REOPEN_FROM)return {open:people.some(body=>reach(gate,body)<gate.radius+SWING_HYSTERESIS),side};
  let pusher:GateBody|undefined,best=Infinity;
  for(const body of people){const d=reach(gate,body);if(d<gate.radius&&d<best){best=d;pusher=body;}}
  if(!pusher)return {open:false,side};
  const wanted:1|-1=pusher.z>=gate.origin[2]?1:-1;
  return {open:!bodies.some(body=>inGateWay(gate,wanted,body)),side:wanted};
}
/** Whether somebody stands in the way of a leaf that is open or shutting: it must not shut on them (a shutting leaf that has opened a bit reopens). */
export function gateHeldOpen(gate:FactoryGate,state:GateState,now:number,bodies:readonly GateBody[]):boolean {
  if(!state.open&&gateOpenness(gate,state,now)<=REOPEN_FROM)return false;
  const side=gateSide(state);
  return bodies.some(body=>inGateWay(gate,side,body));
}
