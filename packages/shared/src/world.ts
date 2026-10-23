import map from './map-data.json';
import type { Collider, Footprint, Interactable, PlayerInput, Position, Seat } from './index.js';
import {JUKEBOX_INTERACTION_SLACK,JUKEBOX_PLACEMENT,TV_SYSTEMS,TELEVISIONS} from './jukebox.js';
import {DOORS,DOOR_LEAVES,leafBox} from './doors.js';

export const WALK_SPEED = 3.5;
export const RUN_SPEED = 6;
export const OLD_CANE_SPEED = .475;
export const PLAYER_RADIUS = 0.34;
export const PLAYER_HEIGHT = 1.86;
export const WORLD = map.bounds;
export const MAP_MARKERS = map.markers;
export const MAP_COLLIDERS = map.colliders;
export const MAP_SURFACES = map.surfaces;
export const CAFE_TABLES = map.tables;
// Game props the map leaves room for: blackjack in the upstairs games hall, between the last pool table
// and the lounge; the jukebox in the empty fourth slot of the ground-floor hall's back row, clear of the stairs.
export const BLACKJACK_TABLE = {x:17.4,y:3.45,z:-7.4,rx:0.95,rz:0.55};
export const JUKEBOX = JUKEBOX_PLACEMENT;
export const BLACKJACK_SEATS: readonly Seat[] = [-54,-18,18,54].map(degrees=>{
  const a=degrees*Math.PI/180,dx=(BLACKJACK_TABLE.rx+0.43)*Math.sin(a),dz=(BLACKJACK_TABLE.rz+0.42)*Math.cos(a);
  return {x:BLACKJACK_TABLE.x+dx,y:BLACKJACK_TABLE.y,z:BLACKJACK_TABLE.z+dz,rotation:Math.atan2(-dx,-dz)};
});
const BLACKJACK_COLLIDER:Collider={id:'blackjack',x:BLACKJACK_TABLE.x,z:BLACKJACK_TABLE.z,hx:.75,hz:.42,minY:BLACKJACK_TABLE.y,maxY:BLACKJACK_TABLE.y+.8};
const JUKEBOX_COLLIDER:Collider={id:'jukebox',x:JUKEBOX.x,z:JUKEBOX.z,hx:JUKEBOX.hx,hz:JUKEBOX.hz,minY:JUKEBOX.y,maxY:JUKEBOX.y+1.55};
/** Static solids: walls, furniture, the game's props. Door leaves move; see solidColliders. */
export const COLLIDERS: readonly Collider[] = [...map.colliders,BLACKJACK_COLLIDER,JUKEBOX_COLLIDER];
// Door state for movement, interactions and the camera. The server owns it; clients mirror the synced state.
// Doors start open, as authored in the map.
const openDoors=new Map(DOORS.map(door=>[door.id,true]));
let solids:readonly Collider[]=[];
function rebuildSolids():void {
  solids=[...COLLIDERS,...DOOR_LEAVES.map(leaf=>leafBox(leaf,openDoors.get(leaf.group)?leaf.openYaw:leaf.closedYaw))];
}
rebuildSolids();
/** Every solid volume right now, including each door leaf where its door state puts it. */
export function solidColliders():readonly Collider[] {return solids;}
export function isDoorOpen(id:string):boolean {return openDoors.get(id)??true;}
/** Applies door states (id → open); unknown ids are ignored. Returns whether anything changed. */
export function setDoorStates(states:Iterable<readonly [string,boolean]>):boolean {
  let changed=false;
  for(const [id,open] of states)if(openDoors.has(id)&&openDoors.get(id)!==open){openDoors.set(id,open);changed=true;}
  if(changed)rebuildSolids();
  return changed;
}
const footprint=({id,x,z,hx,hz}:Collider):Footprint=>({id,x,z,hx,hz});
/** The ground-floor L-shaped counter (the lounge upstairs has its own, unattended). */
export const COUNTER_FOOTPRINT:readonly Footprint[]=map.colliders
  .filter(c=>c.id.startsWith('COL_Mob_Balcao')&&Math.abs((c.minY??0)-map.markers.Ponto_Balcao.y)<.1).map(footprint);
export const INTERACTABLES: readonly Interactable[] = [
  {id:'blackjack-1',type:'blackjack',label:'Jogar blackjack',...BLACKJACK_TABLE,footprint:[footprint(BLACKJACK_COLLIDER)]},
  {id:'counter',type:'counter',label:'Pedir uma bebida',...map.markers.Ponto_Balcao,footprint:[...COUNTER_FOOTPRINT]},
  // The point is where a player stands touching the jukebox front.
  {id:'jukebox',type:'jukebox',label:'Tocar a jukebox',x:JUKEBOX.x,y:JUKEBOX.y,z:JUKEBOX.z+JUKEBOX.hz+PLAYER_RADIUS+.05,footprint:[footprint(JUKEBOX_COLLIDER)]},
  ...map.seats.map(seat=>({...seat,type:'seat' as const,label:'Sentar'})),
  ...DOORS.map(door=>({id:door.id,type:'door' as const,label:door.label,x:door.x,y:door.y,z:door.z,footprint:door.footprint})),
  // The toilets of both floors' restrooms (COL_Mob_Vaso in the map export), used by touching them.
  ...map.colliders.filter(c=>/^COL_Mob_Vaso(\.\d+)?$/.test(c.id)).map((c,i)=>({id:`toilet-${i+1}`,type:'toilet' as const,label:'Usar o banheiro',x:c.x,y:c.minY,z:c.z,footprint:[footprint(c)]})),
];
// Each TV is used from the floor in front of its screen (see tvSpot); defined after the floor functions.
export const TV_SPOTS:Record<string,Required<Position>>={};

function triangleHeight(points:number[][],x:number,z:number):number|undefined {
  const [a,b,c]=points;
  const denominator=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(denominator)<1e-9)return;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/denominator;
  const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/denominator;
  if(u<-.00001||v<-.00001||u+v>1.00001)return;
  return u*a[1]+v*b[1]+(1-u-v)*c[1];
}

/** Highest support reachable by a normal step; no teleport between floors or off ledges. */
export function floorHeight(x:number,z:number,reference=.3):number|undefined {
  let highest:number|undefined;
  for(const surface of MAP_SURFACES){
    const y=triangleHeight(surface.points,x,z);
    if(y!==undefined&&y<=reference+.26&&y>=reference-.36&&(highest===undefined||y>highest))highest=y;
  }
  return highest;
}

// People turn sideways through a doorway: inside an open door's frame the body is this narrow.
const DOORWAY_RADIUS=.25;
/** Within an open door's frame (the zone a leaf closes), on its floor. */
function inOpenDoorway(x:number,z:number,y:number):boolean {
  return DOORS.some(door=>{
    if(!isDoorOpen(door.id)||Math.abs(door.y-y)>.5)return false;
    const yaw=door.leaves[0]!.closedYaw*Math.PI/180,dx=x-door.x,dz=z-door.z;
    return Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))<.6&&Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))<.4*door.leaves.length;
  });
}
function obstructed(x:number,z:number,y:number,ignored?:Set<string>):boolean {
  const body=inOpenDoorway(x,z,y)?DOORWAY_RADIUS:PLAYER_RADIUS;
  if(x<WORLD.minX+PLAYER_RADIUS||x>WORLD.maxX-PLAYER_RADIUS||z<WORLD.minZ+PLAYER_RADIUS||z>WORLD.maxZ-PLAYER_RADIUS)return true;
  for(const c of solids){
    if(c.ramp||ignored?.has(c.id))continue;
    if((c.maxY??Infinity)<=y+.26||(c.minY??-Infinity)>=y+PLAYER_HEIGHT-.04)continue;
    // Below knee height only the feet collide, so the body may lean over a step edge (the stage's 30 cm treads).
    const radius=(c.maxY??Infinity)<=y+.5?.15:body;
    if(Math.abs(x-c.x)<c.hx+radius-.00001&&Math.abs(z-c.z)<c.hz+radius-.00001)return true;
  }
  // Sloped collision boxes are sampled on their real upper face, not their enclosing AABB.
  for(const s of MAP_SURFACES){
    if(!s.id.includes('Escada_Rampa'))continue;
    const rampY=triangleHeight(s.points,x,z);
    if(rampY!==undefined&&rampY>y+.05&&rampY<y+PLAYER_HEIGHT-.04)return true;
  }
  return false;
}

export function isWalkable(x:number,z:number,y?:number):boolean {
  const supported=floorHeight(x,z,y??.3);
  return supported!==undefined&&(y===undefined||Math.abs(supported-y)<.08)&&!obstructed(x,z,supported);
}

/**
 * The map's doorways are 0.8 m wide for a 0.68 m body: pushing through an open door against its jamb
 * slides the body towards the middle of the doorway instead of leaving it stuck on the frame.
 */
function throughDoorway(fromX:number,fromZ:number,x:number,z:number,y:number,wx:number,wz:number):Position|undefined {
  const wanted=Math.hypot(wx,wz);if(wanted<1e-6)return;
  for(const door of DOORS){
    if(!isDoorOpen(door.id)||Math.abs(door.y-y)>.5)continue;
    const yaw=door.leaves[0]!.closedYaw*Math.PI/180,ux=Math.cos(yaw),uz=-Math.sin(yaw),nx=Math.sin(yaw),nz=Math.cos(yaw);
    const along=(fromX-door.x)*ux+(fromZ-door.z)*uz,across=(fromX-door.x)*nx+(fromZ-door.z)*nz;
    // Heading through the doorway, close to it and roughly in front of it, and held back by the frame.
    if(Math.abs(wx*nx+wz*nz)<.5*wanted||Math.abs(across)>.9||Math.abs(along)>.45)continue;
    const progress=((x-fromX)*nx+(z-fromZ)*nz)/((wx*nx+wz*nz)||1);
    if(progress>.5||Math.abs(along)<.005)continue;
    const shift=-Math.sign(along)*Math.min(Math.abs(along),wanted),px=x+ux*shift,pz=z+uz*shift;
    if(!obstructed(px,pz,y))return {x:px,z:pz};
  }
}
export function movePlayer(position:Position,input:Pick<PlayerInput,'dx'|'dz'|'running'>,dt=.05,oldWalk=false):Required<Position> {
  const magnitude=Math.hypot(input.dx,input.dz);
  const scale=(oldWalk?OLD_CANE_SPEED:input.running?RUN_SPEED:WALK_SPEED)*Math.min(Math.max(dt,0),.1)/Math.max(1,magnitude);
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(input.dx*scale),Math.abs(input.dz*scale))/.1));
  let x=position.x,z=position.z,y=position.y??floorHeight(x,z)??0;
  for(let step=0;step<steps;step++){
    const wx=input.dx*scale/steps,wz=input.dz*scale/steps,fromX=x,fromZ=z;
    const nx=x+wx,nz=z+wz;
    let nextY=floorHeight(nx,z,y);
    if(nextY!==undefined&&!obstructed(nx,z,nextY)){x=nx;y=nextY;}
    nextY=floorHeight(x,nz,y);
    if(nextY!==undefined&&!obstructed(x,nz,nextY)){z=nz;y=nextY;}
    const guided=throughDoorway(fromX,fromZ,x,z,y,wx,wz);
    if(guided){x=guided.x;z=guided.z;}
  }
  return {x,y,z};
}

export function distance(a:Position,b:Position):number {return Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);}

// Objects are used by touching them: the body may be this far from the collision box (players stop at it).
const TOUCH_GAP=.15;
// A chair is reached by standing at it, up to this far from the seat point.
const CHAIR_REACH=.4;
/** The closest point of the object to the player and the gap between the player's body and it. */
export function interactionReach(object:Interactable,position:Position):{x:number;z:number;gap:number} {
  if(!object.footprint)return {x:object.x,z:object.z,gap:Math.hypot(position.x-object.x,position.z-object.z)-PLAYER_RADIUS-CHAIR_REACH+TOUCH_GAP};
  let best={x:object.x,z:object.z,gap:Infinity};
  for(const b of object.footprint){
    const x=Math.min(Math.max(position.x,b.x-b.hx),b.x+b.hx),z=Math.min(Math.max(position.z,b.z-b.hz),b.z+b.hz);
    const gap=Math.hypot(position.x-x,position.z-z)-PLAYER_RADIUS;
    if(gap<best.gap)best={x,z,gap};
  }
  return best;
}

function segmentCrossesBox(ax:number,az:number,bx:number,bz:number,c:Collider):boolean {
  // Slightly shrunk, so a wall that merely touches the object's edge does not count.
  const from=[ax-c.x,az-c.z],delta=[bx-ax,bz-az],half=[c.hx-.02,c.hz-.02];
  let enter=0,exit=1;
  for(let axis=0;axis<2;axis++){
    if(Math.abs(delta[axis]!)<1e-9){if(Math.abs(from[axis]!)>half[axis]!)return false;continue;}
    const a=(-half[axis]!-from[axis]!)/delta[axis]!,b=(half[axis]!-from[axis]!)/delta[axis]!;
    enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    if(enter>exit)return false;
  }
  return true;
}

/** Touching the object, on its floor, with no wall (anything above counter height) in between. */
export function canInteract(object:Interactable,position:Position,slack=0):boolean {
  const y=position.y??.3;
  if(Math.abs((object.y??y)-y)>.6)return false;
  const reach=interactionReach(object,position);
  if(reach.gap>TOUCH_GAP+slack+(object.type==='jukebox'?JUKEBOX_INTERACTION_SLACK:0))return false;
  const eye=y+1.3;
  return !solids.some(c=>!c.ramp&&!object.footprint?.some(f=>f.id===c.id)&&(c.minY??-Infinity)<eye&&(c.maxY??Infinity)>eye
    &&segmentCrossesBox(position.x,position.z,reach.x,reach.z,c));
}
/** The first walkable point on the floor in front of a TV, searching a little to the sides. */
function tvSpot(tv:typeof TELEVISIONS[number]):Required<Position> {
  const a=tv.yaw*Math.PI/180,nx=Math.sin(a),nz=Math.cos(a),floor=tv.y>4?3.45:.3;
  for(let d=.35;d<=2.5;d+=.05)for(const side of [0,.3,-.3,.6,-.6]){
    const x=tv.x+nx*d+nz*side,z=tv.z+nz*d-nx*side,y=floorHeight(x,z,floor);
    if(y!==undefined&&Math.abs(y-floor)<.05&&isWalkable(x,z,y))return {x,y,z};
  }
  throw new Error(`Nenhum ponto livre diante de ${tv.id}`);
}
for(const tv of TELEVISIONS)TV_SPOTS[tv.id]=tvSpot(tv);
(INTERACTABLES as Interactable[]).push(...TV_SYSTEMS.map(system=>({id:system.id,type:'television' as const,label:`Usar a ${system.label}`,...TV_SPOTS[system.tvId]!})));

export function nearestInteraction(position:Position):Interactable|undefined {
  // At a doorway the door comes first, even with a chair of the next table within reach.
  const rank=(i:Interactable)=>interactionReach(i,position).gap-(i.type==='door'?.1:0);
  return INTERACTABLES.filter(i=>canInteract(i,position)).sort((a,b)=>rank(a)-rank(b))[0];
}

/** The authored spawn marker is on the pavement; choose the closest clear position to it. */
export function findSpawn(occupied:readonly Position[]=[],anchor:Required<Position>=map.markers.Spawn_Jogador):Position {
  const offsets:Array<{x:number;z:number}>=[];
  for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++)offsets.push({x:x*.8,z:z*.8});
  offsets.sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));
  for(const o of offsets){
    const x=anchor.x+o.x,z=anchor.z+o.z,y=floorHeight(x,z,anchor.y);
    const p={x,y:y??anchor.y,z};
    if(y!==undefined&&isWalkable(x,z,y)&&occupied.every(other=>distance(other,p)>.74))return p;
  }
  throw new Error('Não há uma posição livre para entrar no mapa.');
}

export function standingPosition(position:Position,rotation=0):Position {
  if(isWalkable(position.x,position.z,position.y))return {...position};
  const ignored=new Set(solids.filter(c=>(c.maxY??Infinity)>(position.y??.3)+.035&&(c.minY??-Infinity)<(position.y??.3)+PLAYER_HEIGHT&&Math.abs(position.x-c.x)<c.hx+PLAYER_RADIUS&&Math.abs(position.z-c.z)<c.hz+PLAYER_RADIUS).map(c=>c.id));
  const directions=[rotation,rotation+Math.PI/2,rotation-Math.PI/2,rotation+Math.PI];
  for(const direction of directions)for(const offset of [.2,.35,.5,.7,.85]){
    const x=position.x-Math.sin(direction)*offset,z=position.z-Math.cos(direction)*offset;
    const y=floorHeight(x,z,position.y??.3);
    if(y!==undefined&&isWalkable(x,z,y)){
      let clear=true;
      for(let t=.1;t<=1;t+=.1)if(obstructed(position.x+(x-position.x)*t,position.z+(z-position.z)*t,y,ignored)){clear=false;break;}
      if(clear)return {x,y,z};
    }
  }
  return {...position};
}

/** Ray/box camera boom clipping, including the veranda ceiling absent from player colliders. */
export function cameraFraction(start:Required<Position>,end:Required<Position>):number {
  let ratio=1;
  for(const c of [...solids,...(map.cameraCeilings as Collider[])]){
    // Posts, trunks and pillars are too thin to hide the player; letting the boom pass them avoids the
    // camera snapping onto the avatar (the spawn marker stands in front of a street lamp).
    if(c.ramp||(c.hx<.2&&c.hz<.2))continue;
    let enter=0,exit=1;
    const min=[c.x-c.hx-.14,(c.minY??0)-.14,c.z-c.hz-.14];
    const max=[c.x+c.hx+.14,(c.maxY??3)+.14,c.z+c.hz+.14];
    const from=[start.x,start.y,start.z],to=[end.x,end.y,end.z];
    // A seated avatar's target can start just inside a tabletop; ignore only that volume.
    if(from.every((v,i)=>v>=min[i]&&v<=max[i]))continue;
    for(let axis=0;axis<3;axis++){
      const d=to[axis]-from[axis];
      if(Math.abs(d)<1e-8){if(from[axis]<min[axis]||from[axis]>max[axis]){enter=2;break;}}
      else {const a=(min[axis]-from[axis])/d,b=(max[axis]-from[axis])/d;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
    }
    if(enter<=exit&&enter>=0&&enter<ratio)ratio=Math.max(.03,enter-.02);
  }
  return ratio;
}
