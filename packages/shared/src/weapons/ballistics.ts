import {bulletWorld} from '../world.js';
import {gunBody} from './bodies.js';
import type {HitZone,WeaponStats} from './stats.js';
import type {WeaponHold} from './catalog.js';

/**
 * Hitscan (docs/sistemas/armas.md#o-tiro): a shot is a ray from the camera through the crosshair (where the player aims), then the bullet's own way
 * from the muzzle to the point that ray found. Both the room (which decides) and the browser (which draws ahead of it) run traceShot with the
 * same inputs: the room with the targets turned back to where the shooter saw them (lag compensation), the browser with what it draws.
 */
export type Vec3=[number,number,number];
/** A body where it stands: feet and facing (radians; forward is (sin, cos), as PlayerState.rotation). */
export interface GunPose {x:number;y:number;z:number;rotation:number}

const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a:Vec3,b:Vec3,s=1):Vec3=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const vlength=(a:Vec3)=>Math.hypot(a[0],a[1],a[2]);
export function normalize(a:Vec3):Vec3 {const l=vlength(a)||1;return [a[0]/l,a[1]/l,a[2]/l];}
export const distance3=(a:Vec3,b:Vec3)=>vlength(sub(a,b));

/** A seed for a shot's random numbers, the same in every browser and the room: the shooter's id and the shot's count. */
export function shotSeed(shooter:string,n:number):number {
  let hash=0x811c9dc5;
  for(let i=0;i<shooter.length;i++){hash^=shooter.charCodeAt(i);hash=Math.imul(hash,0x01000193);}
  hash^=n&0xffff;hash=Math.imul(hash,0x01000193);hash^=(n>>>8)&0xff;hash=Math.imul(hash,0x01000193);
  return hash>>>0;
}
/** A small, fast, seeded generator (mulberry32): numbers in [0, 1). */
export function seededRandom(seed:number):()=>number {
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

/** Two directions at right angles to `dir` (and to each other). */
function basis(dir:Vec3):[Vec3,Vec3] {
  const up:Vec3=Math.abs(dir[1])>.95?[1,0,0]:[0,1,0];
  const u=normalize(cross(dir,up));
  return [u,cross(u,dir)];
}
/** `dir` turned `angle` radians off itself, towards the side `around` (radians around it). */
export function offAxis(dir:Vec3,angle:number,around:number):Vec3 {
  const [u,v]=basis(dir),s=Math.sin(angle);
  return normalize([dir[0]*Math.cos(angle)+(u[0]*Math.cos(around)+v[0]*Math.sin(around))*s,dir[1]*Math.cos(angle)+(u[1]*Math.cos(around)+v[1]*Math.sin(around))*s,
    dir[2]*Math.cos(angle)+(u[2]*Math.cos(around)+v[2]*Math.sin(around))*s]);
}

/**
 * Where each bullet of a shot goes: the shot lands anywhere in the cone (`spread`, half-angle), evenly over the crosshair's circle; a shotgun's
 * pellets then fan out around that point in a ring pattern with some jitter (`pelletSpread`), so a pattern reads the same shot after shot.
 */
export function pelletDirections(seed:number,dir:Vec3,spread:number,pellets=1,pelletSpread=0):Vec3[] {
  const random=seededRandom(seed),aim=normalize(dir);
  const centre=offAxis(aim,spread*Math.sqrt(random()),random()*Math.PI*2);
  if(pellets<=1)return [centre];
  const out:Vec3[]=[offAxis(centre,pelletSpread*.18*random(),random()*Math.PI*2)];
  const ring=pellets-1,turn=random()*Math.PI*2;
  for(let i=0;i<ring;i++){
    const around=turn+i*Math.PI*2/ring+(random()-.5)*.5,angle=pelletSpread*(.55+.45*random());
    out.push(offAxis(centre,angle,around));
  }
  return out;
}

/** A body's hit volumes: a ball for the head, capsules for the trunk and for the legs together. `grow` swells them (the room's slack). */
export interface BodyZones {head:{c:Vec3;r:number};torso:{a:Vec3;b:Vec3;r:number};legs:{a:Vec3;b:Vec3;r:number}}
export function bodyZones(skin:string|undefined,pose:GunPose,grow=0):BodyZones {
  const body=gunBody(skin),fx=Math.sin(pose.rotation),fz=Math.cos(pose.rotation);
  return {
    head:{c:[pose.x+fx*.03,pose.y+body.head+.1,pose.z+fz*.03],r:.12+grow},
    torso:{a:[pose.x,pose.y+body.hip+.02,pose.z],b:[pose.x+fx*.02,pose.y+body.neck-.04,pose.z+fz*.02],r:.2+grow},
    legs:{a:[pose.x,pose.y+.12,pose.z],b:[pose.x,pose.y+body.hip-.04,pose.z],r:.16+grow},
  };
}
/** Whether a point is inside a body's volumes (the head's ball, the trunk's or the legs' capsule). */
export function insideBody(point:Vec3,zones:BodyZones):boolean {
  const near=(a:Vec3,b:Vec3,r:number)=>{
    const ab=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(point,a),ab)/(dot(ab,ab)||1)));
    return vlength(sub(point,add(a,ab,t)))<r;
  };
  return vlength(sub(point,zones.head.c))<zones.head.r||near(zones.torso.a,zones.torso.b,zones.torso.r)||near(zones.legs.a,zones.legs.b,zones.legs.r);
}
/** Where a ray (unit `d`) first enters a ball, if it does ahead of `o`. */
export function raySphere(o:Vec3,d:Vec3,c:Vec3,r:number):number|undefined {
  const oc=sub(o,c),b=dot(oc,d),cc=dot(oc,oc)-r*r,h=b*b-cc;
  if(h<0)return undefined;
  const t=-b-Math.sqrt(h);
  return t>=0?t:undefined;
}
/** Where a ray (unit `d`) first enters a capsule from `a` to `b`, if it does ahead of `o` (Quilez's capsule intersection). */
export function rayCapsule(o:Vec3,d:Vec3,a:Vec3,b:Vec3,r:number):number|undefined {
  const ba=sub(b,a),oa=sub(o,a),baba=dot(ba,ba),bard=dot(ba,d),baoa=dot(ba,oa),rdoa=dot(d,oa),oaoa=dot(oa,oa);
  const k2=baba-bard*bard,k1=baba*rdoa-baoa*bard,k0=baba*oaoa-baoa*baoa-r*r*baba;
  if(Math.abs(k2)>1e-9){
    const h=k1*k1-k2*k0;
    if(h<0)return undefined;
    const t=(-k1-Math.sqrt(h))/k2,y=baoa+t*bard;
    if(y>0&&y<baba)return t>=0?t:undefined;
  }
  // The round ends: whichever the ray meets first.
  const ends=[raySphere(o,d,a,r),raySphere(o,d,b,r)].filter((t):t is number=>t!==undefined);
  return ends.length?Math.min(...ends):undefined;
}
/** The first zone of a body a ray (unit `d`) enters within `maxT`. */
export function rayBody(o:Vec3,d:Vec3,maxT:number,zones:BodyZones):{t:number;zone:HitZone}|undefined {
  let best:{t:number;zone:HitZone}|undefined;
  const take=(t:number|undefined,zone:HitZone)=>{if(t!==undefined&&t<=maxT&&(!best||t<best.t))best={t,zone};};
  take(raySphere(o,d,zones.head.c,zones.head.r),'head');
  take(rayCapsule(o,d,zones.torso.a,zones.torso.b,zones.torso.r),'torso');
  take(rayCapsule(o,d,zones.legs.a,zones.legs.b,zones.legs.r),'legs');
  return best;
}

/** What a bullet hitting a solid of the map sounds and looks like. */
export type Surface='concreto'|'metal'|'madeira'|'vidro'|'terra'|'asfalto'|'carne';
const METAL=/Poste|Portao|Luminaria|Alambrado|Geladeira|Freezer|Lixeira|Orelhao|Ponto_Onibus|Bomba|Trafo|Totem|Mastro|Trave|Torre|_PA|Amp|Retorno|Carro|Carreta|Cofre|Fogao|Pia|Corrimao|GuardaCorpo|Exaustao|Jukebox|Cerca|Brinquedo|Academia|Moto|Caminhao|Bateria|Grade/i;
const WOOD=/Arvore|Mesa|Cadeira|Balcao|Prateleira|Barris|Pergolado|Sinuca|Pebolim|Sofa|Aparador|Estante|Banco|Porta|Batente|Quiosque|Arquibancada|Degrau|Palco|Carrinho|Banqueta|Coreto|Pilha|blackjack|truco/i;
const GLASS=/Janela|Vidro|Cristaleira/i;
const DIRT=/Canteiro|Vaso|Grama|Terra|Jardim|Horta/i;
const ASPHALT=/COL_Rua|Quadra|Leito|Cid_Chao/i;
export function surfaceOf(id:string):Surface {
  if(GLASS.test(id))return 'vidro';
  if(METAL.test(id))return 'metal';
  if(WOOD.test(id))return 'madeira';
  if(DIRT.test(id))return 'terra';
  if(ASPHALT.test(id))return 'asfalto';
  return 'concreto';
}

/** What a straight bullet meets in the map between two points: how far along (0-1), the face's normal, and what it is. */
export interface WorldHit {fraction:number;normal:Vec3;surface:Surface;id:string}
export type WorldRay=(from:Vec3,to:Vec3)=>WorldHit|undefined;
/** The map's solids and floors (shared world.ts). */
export const mapRay:WorldRay=(from,to)=>{
  const hit=bulletWorld({x:from[0],y:from[1],z:from[2]},{x:to[0],y:to[1],z:to[2]});
  return hit?{fraction:hit.fraction,normal:hit.normal,surface:hit.ground?surfaceOf(hit.id)==='concreto'?'asfalto':surfaceOf(hit.id):surfaceOf(hit.id),id:hit.id}:undefined;
};

/** The aim of a body (radians): pitch up from its facing. */
export function aimDirection(rotation:number,elevation:number):Vec3 {
  return [Math.sin(rotation)*Math.cos(elevation),Math.sin(elevation),Math.cos(rotation)*Math.cos(elevation)];
}
/** The elevation of a direction (radians, up positive). */
export const elevationOf=(dir:Vec3)=>Math.asin(Math.max(-1,Math.min(1,dir[1]/(vlength(dir)||1))));
/** The heading of a direction, as PlayerState.rotation. */
export const headingOf=(dir:Vec3)=>Math.atan2(dir[0],dir[2]);

/** Where the eyes of a standing body are: where the room starts looking past what is behind the shooter. */
export function eyeOf(skin:string|undefined,pose:GunPose):Vec3 {
  return [pose.x,pose.y+gunBody(skin).head+.1,pose.z];
}
/**
 * Where the muzzle is when a body aims at `elevation` (radians): from the right shoulder (the middle of the chest for a two-handed pistol), `reach`
 * metres along the aim. An estimate good to a few centimetres, the same in room and browser: what the bullet's own way starts from.
 */
export function muzzleOf(skin:string|undefined,pose:GunPose,elevation:number,hold:WeaponHold,reach:number):Vec3 {
  const body=gunBody(skin),r=pose.rotation,aim=aimDirection(r,elevation);
  // +X of the body is its left: right is (-cos, 0, sin).
  const side=hold==='pistol'?.04:hold==='revolver'?.17:.15,drop=hold==='rifle'?.06:.1;
  const shoulder:Vec3=[pose.x-Math.cos(r)*side,pose.y+body.shoulder-drop,pose.z+Math.sin(r)*side];
  return add(shoulder,aim,reach);
}

/** Someone a shot may hit, where they are (as the room turned them back, or as the browser draws them). */
export interface ShotTarget {id:string;skin?:string;pose:GunPose}
/** One bullet's fate: where it stopped, at what, how far from the muzzle it went. */
export interface PelletTrace {
  dir:Vec3;end:Vec3;kind:'none'|'world'|'body';distance:number;
  target?:string;zone?:HitZone;normal?:Vec3;surface?:Surface;
  /** The bullet's way was cut short between the muzzle and the aimed point (a wall right in front of the gun). */
  blocked?:boolean;
}

/**
 * A shot's bullets: each one's ray from the camera (`origin`, the pellet's direction) finds the aimed point among the map and the bodies, past what
 * stands between the camera and the shooter (`eye`); then the way from the `muzzle` to that point is checked, and a wall or a body on it takes the
 * bullet instead. `grow` swells the bodies (the room's tolerance for what the browser drew).
 */
export function traceShot(origin:Vec3,dirs:readonly Vec3[],muzzle:Vec3,eye:Vec3,maxRange:number,targets:readonly ShotTarget[],world:WorldRay=mapRay,grow=0):PelletTrace[] {
  const zones=targets.map(target=>({id:target.id,zones:bodyZones(target.skin,target.pose,grow),pose:target.pose}));
  return dirs.map(raw=>{
    const dir=normalize(raw);
    // Past the shooter: nothing between the camera and the shooter's eye plane can be hit (the camera hangs behind the shoulder), and nobody the ray
    // starts inside of (someone standing close at the shooter's back: they are behind the aim, whatever the camera sees in front of the crosshair).
    const skip=Math.max(0,dot(sub(eye,origin),dir)),start=add(origin,dir,skip);
    const far=add(origin,dir,skip+maxRange);
    const wall=world(start,far);
    let reach=maxRange*(wall?wall.fraction:1);
    let body:{t:number;zone:HitZone;id:string}|undefined;
    for(const item of zones){
      if(Math.abs(item.pose.x-start[0])>maxRange+2||Math.abs(item.pose.z-start[2])>maxRange+2||insideBody(start,item.zones))continue;
      // A body whose centre lies behind the shooter's eye plane is not in front of the aim (its capsule may still graze the plane).
      if(dot(sub([item.pose.x,eye[1],item.pose.z],eye),dir)<-.05)continue;
      const hit=rayBody(start,dir,reach,item.zones);
      if(hit&&(!body||hit.t<body.t))body={...hit,id:item.id};
    }
    if(body)reach=body.t;
    const aimed=add(start,dir,reach);
    // The bullet's own way: from the muzzle to the aimed point.
    const toward=sub(aimed,muzzle),length=vlength(toward);
    if(length<.02)return {dir,end:aimed,kind:body?'body':wall?'world':'none',distance:0,...(body?{target:body.id,zone:body.zone}:{}),...(!body&&wall?{normal:wall.normal,surface:wall.surface}:{})};
    const way=normalize(toward);
    const stop=world(muzzle,add(muzzle,way,Math.max(0,length-.06)));
    let cut:{t:number;zone?:HitZone;id?:string;wall?:WorldHit}|undefined=stop?{t:(length-.06)*stop.fraction,wall:stop}:undefined;
    for(const item of zones){
      if(body&&item.id===body.id)continue;
      const hit=rayBody(muzzle,way,cut?cut.t:length-.06,item.zones);
      if(hit&&(!cut||hit.t<cut.t))cut={t:hit.t,zone:hit.zone,id:item.id};
    }
    if(cut){
      const end=add(muzzle,way,cut.t);
      return cut.id?{dir:way,end,kind:'body' as const,distance:cut.t,target:cut.id,zone:cut.zone,blocked:true}
        :{dir:way,end,kind:'world' as const,distance:cut.t,normal:cut.wall!.normal,surface:cut.wall!.surface,blocked:true};
    }
    if(body)return {dir:way,end:aimed,kind:'body' as const,distance:length,target:body.id,zone:body.zone};
    if(wall)return {dir:way,end:aimed,kind:'world' as const,distance:length,normal:wall.normal,surface:wall.surface};
    return {dir:way,end:aimed,kind:'none' as const,distance:length};
  });
}

/** Whether a shot's claimed camera point is believable: near the shooter's head (the boom is at most CAMERA_ZOOMS' 6.5 m plus the shoulder). */
export function originPlausible(origin:Vec3,eye:Vec3,slack:number):boolean {
  return distance3(origin,eye)<=slack;
}
/** The body push of a killing shot: along the bullet, harder up close for shotguns. */
export function killImpulse(stats:WeaponStats,distance:number):number {
  return stats.impulse*(stats.pellets>1?Math.max(.4,1-distance/Math.max(1,stats.range.end)):1);
}
