import map from './map-data.json';
import type {Collider,Footprint,Position} from './index.js';

/**
 * Hinged door leaves of the BarBoteco map (tools/assets/import-map.mjs). Each leaf turns about its own hinge,
 * the node origin, between the closed heading and the authored open heading (degrees about +Y; the
 * leaf extends along its local +X). A double door is one door with two leaves.
 */
export interface DoorLeaf {id:string;group:string;x:number;y:number;z:number;closedYaw:number;openYaw:number;min:number[];max:number[]}
export interface Door extends Required<Position> {id:string;label:string;leaves:readonly DoorLeaf[];footprint:Footprint[]}
export const DOOR_SWING_SECONDS = .8;
export const DOOR_LEAVES:readonly DoorLeaf[] = map.doors;

const LABELS:Record<string,string> = {
  Porta_WC_Masc:'Banheiro masculino',Porta_WC_Fem:'Banheiro feminino',Porta_Deposito_Bar:'Depósito do bar',Porta_Cozinha:'Cozinha',
  Porta_Deposito_Anexo:'Depósito do anexo',Porta_Cozinha_Deposito:'Depósito da cozinha',Porta_Camara_Fria:'Câmara fria',Porta_Servico_Cozinha:'Serviço da cozinha',
  Porta_Quintal_Deposito:'Depósito do quintal',Porta_Quintal_Anexo:'Anexo do quintal',Porta_Quintal_Corredor:'Corredor do quintal',
  Porta_WC_Masc_Sup:'Banheiro masculino',Porta_WC_Fem_Sup:'Banheiro feminino',Porta_Escritorio:'Escritório',Porta_Deposito_Sup:'Depósito',
};
/** Shortest signed turn from the closed to the open heading, in degrees. */
export function doorSwing(leaf:DoorLeaf):number {return ((leaf.openYaw-leaf.closedYaw)%360+540)%360-180;}
/** The leaf's axis-aligned box at a heading. */
export function leafBox(leaf:DoorLeaf,yaw:number):Collider {
  const a=yaw*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const x of [leaf.min[0]!,leaf.max[0]!])for(const z of [leaf.min[2]!,leaf.max[2]!]){
    const wx=leaf.x+x*cos+z*sin,wz=leaf.z-x*sin+z*cos;
    minX=Math.min(minX,wx);maxX=Math.max(maxX,wx);minZ=Math.min(minZ,wz);maxZ=Math.max(maxZ,wz);
  }
  return {id:leaf.id,x:(minX+maxX)/2,z:(minZ+maxZ)/2,hx:(maxX-minX)/2,hz:(maxZ-minZ)/2,minY:leaf.y+leaf.min[1]!,maxY:leaf.y+leaf.max[1]!};
}
export const DOORS:readonly Door[] = [...new Set(DOOR_LEAVES.map(leaf=>leaf.group))].map(group=>{
  const leaves=DOOR_LEAVES.filter(leaf=>leaf.group===group),closed=leaves.map(leaf=>leafBox(leaf,leaf.closedYaw));
  return {id:group,label:LABELS[group]??'Porta',leaves,
    // The doorway, where the closed leaves stand: the player touches it from either side.
    x:closed.reduce((s,b)=>s+b.x,0)/closed.length,y:leaves[0]!.y,z:closed.reduce((s,b)=>s+b.z,0)/closed.length,
    footprint:closed.map(({id,x,z,hx,hz})=>({id,x,z,hx,hz}))};
});

/**
 * Whether a body (radius `radius`) at `position` is in the area a leaf sweeps between closed and open.
 * Doors never swing through anybody.
 */
export function inDoorSweep(door:Door,position:Position,radius:number):boolean {
  return door.leaves.some(leaf=>{
    if(Math.abs((position.y??leaf.y)-leaf.y)>1)return false;
    const dx=position.x-leaf.x,dz=position.z-leaf.z,r=Math.hypot(dx,dz),length=leaf.max[0]!;
    if(r>length+radius)return false;
    if(r<radius)return true;
    // Heading of the point as seen from the hinge, relative to the closed leaf (same convention as yaw).
    const offset=((Math.atan2(-dz,dx)*180/Math.PI-leaf.closedYaw)%360+540)%360-180,swing=doorSwing(leaf);
    const pad=Math.asin(Math.min(1,radius/r))*180/Math.PI;
    return offset>=Math.min(0,swing)-pad&&offset<=Math.max(0,swing)+pad;
  });
}
