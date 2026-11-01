import data from './city-data.json';
import type {Collider} from './index.js';

/**
 * The city around the bar (assets-bar/map/BarBoteco/export/cidade), as tools/assets/import-city.mjs reads it: an 8 × 8 grid of
 * 100 m sectors, x and z from −400 to +400. The export counts its rows along Blender's y, which is the game's −z: S04_04, the
 * bar's, runs x 0 to 100 and z −100 to 0.
 */
export const CITY_GRID=data.grid;
/** Fog and the camera's far plane, as authored in the scene's extras. */
export const CITY_FOG=data.fog;
export const CITY_FAR_CLIP=data.farClip;
/** The fog at this much night (0 to 1): as authored by day, a little closer in the dark. */
export const cityFog=(night:number):{start:number;end:number}=>({start:CITY_FOG.start-night*10,end:CITY_FOG.end-night*110});
/** Where bar_boteco.glb draws the original neighbourhood, always loaded. The sectors leave this area to it. */
export const CITY_ORIGINAL_AREA=data.originalArea;
export const CITY_MARKERS:Record<string,{x:number;y:number;z:number;label?:string}>=data.markers;

export interface SectorCell {col:number;row:number}
const clampCell=(value:number)=>Math.max(0,Math.min(CITY_GRID.count-1,value));
/** The sector holding a point. A point on the line between two belongs to the one east or north of it; the rim stays in the last. */
export const sectorAt=(x:number,z:number):SectorCell=>({
  col:clampCell(Math.floor((x-CITY_GRID.originX)/CITY_GRID.size)),
  row:clampCell(Math.floor((-z-CITY_GRID.originY)/CITY_GRID.size)),
});
export const sectorName=({col,row}:SectorCell):string=>`S${String(col).padStart(2,'0')}_${String(row).padStart(2,'0')}`;
/** The sector's square in the game's axes. */
export function sectorBounds({col,row}:SectorCell):{minX:number;maxX:number;minZ:number;maxZ:number} {
  const minX=CITY_GRID.originX+col*CITY_GRID.size,y=CITY_GRID.originY+row*CITY_GRID.size;
  return {minX,maxX:minX+CITY_GRID.size,minZ:-(y+CITY_GRID.size),maxZ:-y};
}
/** Metres from a point to the nearest point of a sector (0 inside it). */
export function sectorDistance(cell:SectorCell,x:number,z:number):number {
  const b=sectorBounds(cell);
  return Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ));
}
export const CITY_SECTORS:readonly SectorCell[]=Array.from({length:CITY_GRID.count**2},(_,i)=>({col:Math.floor(i/CITY_GRID.count),row:i%CITY_GRID.count}));

const ZONE_NAMES:Record<string,string>={CENTRO:'Centro',OLARIA:'Parque Olaria',CONCEICAO:'Jardim Conceição',INDUSTRIAL:'Distrito Industrial'};
/** The neighbourhood a point belongs to. */
export function cityZone(x:number,z:number):string {
  const zone=(data.sectors as Record<string,{zone:string}>)[sectorName(sectorAt(x,z))]?.zone??'';
  return ZONE_NAMES[zone]??zone;
}

/** A box turned about the vertical: x, z, hx and hz enclose it, as for any collider; `turn` is its real shape. */
export interface TurnedBox {ux:number;uz:number;lx:number;lz:number}
const kinds=data.kinds as ReadonlyArray<{name:string;floor:number;solid:number;road:number}>;
const solids:Collider[]=[];
const floors:Array<{id:string;road:boolean;points:number[][]}>=[];
for(const row of data.boxes as ReadonlyArray<readonly number[]>){
  const [kind,suffix,x,z,lx,lz,minY,maxY,ux=1,uz=0]=row as [number,number,number,number,number,number,number,number,number?,number?],info=kinds[kind]!;
  const id=suffix<0?info.name:`${info.name}.${String(suffix).padStart(3,'0')}`;
  const vx=-uz,vz=ux;
  if(info.floor){
    const corner=(a:number,b:number)=>[x+ux*lx*a+vx*lz*b,maxY,z+uz*lx*a+vz*lz*b];
    const [p,q,r,s]=[corner(-1,-1),corner(1,-1),corner(1,1),corner(-1,1)];
    floors.push({id,road:!!info.road,points:[p,q,r]},{id,road:!!info.road,points:[p,r,s]});
  }
  if(info.solid){
    const turned=row.length>8;
    solids.push({id,x,z,hx:Math.abs(ux)*lx+Math.abs(uz)*lz,hz:Math.abs(uz)*lx+Math.abs(ux)*lz,minY,maxY,...(turned?{turn:{ux,uz,lx,lz}}:{})});
  }
}
/** Buildings, walls, trunks, posts, cars and the map's limits. Flat ground has no volume here. */
export const CITY_SOLIDS:readonly Collider[]=solids;
/** The top faces of the ground, kerbs, lots and platforms, as triangles like the map's floors. */
export const CITY_FLOORS:readonly {id:string;road:boolean;points:number[][]}[]=floors;
