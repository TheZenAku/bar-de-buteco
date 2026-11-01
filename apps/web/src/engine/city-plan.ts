import {CITY_SECTORS,sectorAt,sectorBounds,sectorDistance,sectorName,type SectorCell} from '@bar/shared';

/**
 * What the city streams, decided without a renderer: which sectors show their full detail or their LOD, what loads next and
 * what goes away. city-streaming.ts does the loading and the drawing; the tests drive this class with a fake backend.
 */
export type CityDetail='low'|'medium'|'high'|'ultra';
export interface CityTuning {
  /** Rings of sectors around the centre sector in full detail (1 is 3 × 3). */
  fullRings:number;
  /** Also in full detail, however few: sectors within this many metres of the player, never past the 5 × 5 around them. */
  fullReach:number;
  /** Up to this ring the LOD file shows its LOD1 buildings; past it, only the LOD2 silhouettes. */
  midRings:number;
  /** Files loading at once. */
  concurrent:number;
  /** Multiplies each prop's cull_m, the distance at which small props stop being drawn. */
  cull:number;
  /** The city's few real lights (Luz_* with luz_noturna); the lamps' emission stays on either way. */
  lights:boolean;
}
export const CITY_TUNING:Record<CityDetail,CityTuning>={
  low:{fullRings:1,fullReach:0,midRings:2,concurrent:2,cull:.6,lights:false},
  medium:{fullRings:1,fullReach:0,midRings:3,concurrent:3,cull:.8,lights:true},
  high:{fullRings:1,fullReach:120,midRings:4,concurrent:4,cull:1,lights:true},
  ultra:{fullRings:2,fullReach:0,midRings:5,concurrent:6,cull:1.25,lights:true},
};
export type SlotKind='full'|'lod';
export type LodMode='mid'|'far';
export interface CityBackend<H> {
  /** Loads one sector's file, hidden. Called once per file at a time. */
  load(sector:string,kind:SlotKind):Promise<H>;
  /** Frees everything of a loaded file. It is hidden already. */
  dispose(sector:string,kind:SlotKind,handle:H):void;
  /** Shows or hides a loaded file; `mode` tells which of the LOD file's levels. */
  show(sector:string,kind:SlotKind,handle:H,visible:boolean,mode:LodMode):void;
  warn(message:string):void;
}
type SlotState='idle'|'loading'|'ready'|'failed';
interface Slot<H> {kind:SlotKind;state:SlotState;handle?:H;attempts:number;retryAt:number;unwantedSince:number;shown:boolean;mode:LodMode}
interface Sector<H> {cell:SectorCell;name:string;full:Slot<H>;lod:Slot<H>}
export interface CityPlanMetrics {
  sector:string;fullShown:number;lodShown:number;fullLoaded:number;lodLoaded:number;pending:number;failures:number;
  loadsStarted:number;disposed:number;lastUpdateMs:number;
}
const slot=<H,>(kind:SlotKind):Slot<H>=>({kind,state:'idle',attempts:0,retryAt:0,unwantedSince:Infinity,shown:false,mode:'far'});
/** How far past a sector's edge the player must go before the sectors around them change (metres). */
export const CENTRE_MARGIN=8;
/** How long a file nobody needs stays loaded: walking back and forth over a line does not reload anything. */
export const RETAIN_MS=8000;
/** Seconds ahead along the player's movement whose sectors are fetched before they are needed. */
const LOOK_AHEAD=3;
/** Moving slower than this (m/s), nothing is fetched ahead. */
const AHEAD_SPEED=2;
/** Waits between the attempts for a file that fails; after the last one it stays out until retryFailed. */
export const RETRY_MS=[2000,8000,30000] as const;

export class CityPlanner<H> {
  private readonly sectors:Sector<H>[]=CITY_SECTORS.map(cell=>({cell,name:sectorName(cell),full:slot<H>('full'),lod:slot<H>('lod')}));
  private centre?:SectorCell;
  private tuning:CityTuning=CITY_TUNING.high;
  private active=0;
  private last?:{x:number;z:number;at:number};
  private vx=0;
  private vz=0;
  private destroyed=false;
  private loadsStarted=0;
  private disposed=0;
  private lastUpdateMs=0;
  constructor(private readonly backend:CityBackend<H>){}
  setTuning(tuning:CityTuning):void {this.tuning=tuning;}
  /** `visibleRadius`: metres beyond which fog hides everything, so no LOD is kept out there. */
  update(now:number,x:number,z:number,visibleRadius:number):void {
    if(this.destroyed)return;
    const started=performance.now(),{fullRings,fullReach,midRings}=this.tuning;
    this.track(now,x,z);
    const centre=this.moveCentre(x,z),speed=Math.hypot(this.vx,this.vz);
    const ahead=speed>=AHEAD_SPEED?sectorAt(x+this.vx*LOOK_AHEAD,z+this.vz*LOOK_AHEAD):undefined;
    const wanted:Array<{sector:Sector<H>;target:Slot<H>;priority:number}>=[];
    for(const sector of this.sectors){
      const {full,lod}=sector,ring=rings(sector.cell,centre),distance=sectorDistance(sector.cell,x,z);
      const near=ring<=fullRings||(fullReach>0&&ring<=2&&distance<=fullReach+(full.state==='idle'?0:15));
      const fetchAhead=!near&&!!ahead&&rings(sector.cell,ahead)<=1;
      const needLod=near||distance<=visibleRadius+(lod.state==='idle'?0:80);
      this.mark(full,near||fetchAhead,now);this.mark(lod,needLod,now);
      // The LOD arrives first (it is tens of KB, the sector hundreds): it covers the sector until the full file is in.
      if(near||fetchAhead)wanted.push({sector,target:full,priority:distance+(fetchAhead?60:5)});
      if(needLod)wanted.push({sector,target:lod,priority:distance});
      // Exactly one of the two at any moment; the one in the way goes first.
      const useFull=full.state==='ready'&&(near||lod.state!=='ready');
      const useLod=!useFull&&lod.state==='ready';
      const mode:LodMode=ring<=midRings?'mid':'far';
      this.apply(sector,useFull?lod:full,false,mode);
      this.apply(sector,useFull?full:lod,useFull||useLod,mode);
      if(full.state==='ready'&&!useFull&&now-full.unwantedSince>=RETAIN_MS)this.free(sector,full);
      if(lod.state==='ready'&&!useLod&&now-lod.unwantedSince>=RETAIN_MS)this.free(sector,lod);
    }
    wanted.sort((a,b)=>a.priority-b.priority);
    for(const {sector,target} of wanted){
      if(this.active>=this.tuning.concurrent)break;
      if(target.state==='idle'||(target.state==='failed'&&target.attempts<=RETRY_MS.length&&now>=target.retryAt))this.start(sector,target);
    }
    this.lastUpdateMs=performance.now()-started;
  }
  /** Failed files get a new round of attempts (the connection came back). */
  retryFailed():void {for(const sector of this.sectors)for(const target of [sector.full,sector.lod])if(target.state==='failed'){target.state='idle';target.attempts=0;}}
  /** Every file still loaded; nothing later comes back from a load in flight. */
  destroy():void {
    this.destroyed=true;
    for(const sector of this.sectors)for(const target of [sector.full,sector.lod])if(target.state==='ready'){this.apply(sector,target,false,'far');this.free(sector,target);}
  }
  metrics():CityPlanMetrics {
    const count=(pick:(sector:Sector<H>)=>boolean)=>this.sectors.filter(pick).length;
    return {sector:this.centre?sectorName(this.centre):'',
      fullShown:count(s=>s.full.shown),lodShown:count(s=>s.lod.shown),fullLoaded:count(s=>s.full.state==='ready'),lodLoaded:count(s=>s.lod.state==='ready'),
      pending:this.active,failures:count(s=>s.full.state==='failed')+count(s=>s.lod.state==='failed'),loadsStarted:this.loadsStarted,disposed:this.disposed,lastUpdateMs:this.lastUpdateMs};
  }
  /** Every loaded file that is showing now. */
  *shown():Generator<{name:string;cell:SectorCell;kind:SlotKind;handle:H;mode:LodMode}> {
    for(const sector of this.sectors)for(const target of [sector.full,sector.lod])
      if(target.shown&&target.handle!==undefined)yield {name:sector.name,cell:sector.cell,kind:target.kind,handle:target.handle,mode:target.mode};
  }
  /** The player's speed, from where they were, ignoring jumps (a respawn). */
  private track(now:number,x:number,z:number):void {
    const last=this.last,elapsed=last?(now-last.at)/1000:0;
    if(last&&elapsed>=.05){
      const vx=(x-last.x)/elapsed,vz=(z-last.z)/elapsed,ease=Math.min(1,elapsed*2);
      if(Math.hypot(vx,vz)<40){this.vx+=(vx-this.vx)*ease;this.vz+=(vz-this.vz)*ease;}else{this.vx=0;this.vz=0;}
    }
    if(!last||elapsed>=.05)this.last={x,z,at:now};
  }
  /** The centre sector changes only well past its edge, so standing on a line does not swap anything. */
  private moveCentre(x:number,z:number):SectorCell {
    if(this.centre){
      const b=sectorBounds(this.centre);
      if(x>=b.minX-CENTRE_MARGIN&&x<=b.maxX+CENTRE_MARGIN&&z>=b.minZ-CENTRE_MARGIN&&z<=b.maxZ+CENTRE_MARGIN)return this.centre;
    }
    return this.centre=sectorAt(x,z);
  }
  private mark(target:Slot<H>,needed:boolean,now:number):void {
    if(needed)target.unwantedSince=Infinity;
    else if(target.unwantedSince===Infinity)target.unwantedSince=now;
  }
  private apply(sector:Sector<H>,target:Slot<H>,visible:boolean,mode:LodMode):void {
    if(target.handle===undefined||(target.shown===visible&&(!visible||target.mode===mode)))return;
    target.shown=visible;target.mode=mode;
    this.backend.show(sector.name,target.kind,target.handle,visible,mode);
  }
  private free(sector:Sector<H>,target:Slot<H>):void {
    const handle=target.handle!;
    target.handle=undefined;target.state='idle';target.attempts=0;target.unwantedSince=Infinity;target.shown=false;
    this.disposed++;
    this.backend.dispose(sector.name,target.kind,handle);
  }
  private start(sector:Sector<H>,target:Slot<H>):void {
    target.state='loading';this.active++;this.loadsStarted++;
    this.backend.load(sector.name,target.kind).then(handle=>{
      this.active--;
      if(this.destroyed){this.backend.dispose(sector.name,target.kind,handle);return;}
      // Not needed any more? It waits out RETAIN_MS like any other file, and may turn out useful on the way back.
      target.state='ready';target.handle=handle;target.attempts=0;
    },(error:unknown)=>{
      this.active--;
      if(this.destroyed)return;
      target.attempts++;target.state='failed';
      const wait=RETRY_MS[target.attempts-1];
      target.retryAt=wait===undefined?Infinity:performance.now()+wait;
      this.backend.warn(`Setor ${sector.name} (${target.kind}): ${String(error)}; ${wait===undefined?'sem novas tentativas':`nova tentativa em ${wait/1000} s`}.`);
    });
  }
}
const rings=(a:SectorCell,b:SectorCell)=>Math.max(Math.abs(a.col-b.col),Math.abs(a.row-b.row));
