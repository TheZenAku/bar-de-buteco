import {z} from 'zod';
import {findSpawn,floorHeight,isWalkable,roadHeight,solidsBetween,WORLD} from './world.js';
import type {Collider,Position} from './index.js';

/**
 * The delivery bikes and where each one stands when nobody has ridden it for a while (the kerb in front of the bar,
 * between the street lamp and the silver car). To move one, change x, y (the floor's height) and z; `yaw` is its heading in
 * radians, zero facing +Z, as in the admin's "Sua posição".
 */
export const MOTOS=[{id:'moto-1',x:13.6,y:0,z:3.85,yaw:-Math.PI/2}] as const;

/**
 * The bike's measurements (moto_delivery.glb) and its handling: about 150 kg with the rider and 55 km/h flat out, like a
 * scooter. Forces in newtons; ENGINE − ROLLING = DRAG × TOP_SPEED² is what sets the top speed.
 */
export const MOTO={
  WHEELBASE:1.342,WHEEL_RADIUS:.225,
  /** The hull (moto_delivery_colisao.glb's box, without the mirrors) and how far its middle is behind the origin. */
  HALF_WIDTH:.32,HALF_LENGTH:.99,CENTRE_Z:-.05,HEIGHT:1.42,
  MASS:150,ENGINE:660,REVERSE:300,BRAKE:1350,HANDBRAKE:1050,ROLLING:60,DRAG:2.56,TOP_SPEED:15.3,REVERSE_SPEED:2.5,
  /** The handlebar's lock, and the sideways grip that narrows it as speed rises (metres per second squared). */
  MAX_STEER:28*Math.PI/180,GRIP:14,
  /** How fast the handlebar turns (full lock per second), and how fast it comes back. */
  STEER_RATE:3.2,STEER_RETURN:5,
  /** Metres between collision checks: a wall is never skipped, even flat out. */
  SUBSTEP:.1,
  /** How far the rider's centre may be from the hull to get on. */
  REACH:.9,
  /** Above this speed (m/s) the bike must slow down before the rider can get off. */
  DISMOUNT_SPEED:3,
  /** Left alone away from its spot for this long (ms), it is brought back: nobody has to hunt for it around the map. */
  RETURN_MS:5*60_000,
} as const;

export interface MotoBody {x:number;y:number;z:number;yaw:number;pitch:number;speed:number;steer:number}
/** A bike in the room's state; riderId is '' while parked. */
export interface MotoState extends MotoBody {id:string;riderId:string}
export interface MotoIntent {throttle:number;steer:number;brake:boolean}
/** W/S (forward, brake and reverse), A/D (+1 is right) and the handbrake. */
export interface MotoInput extends MotoIntent {seq:number}
export const motoInputSchema=z.object({seq:z.number().int().min(0).max(2147483647),throttle:z.number().finite().min(-1).max(1),steer:z.number().finite().min(-1).max(1),brake:z.boolean()}).strict();
export const motoMountSchema=z.object({motoId:z.string().max(32)}).strict();
export const NO_MOTO_INTENT:MotoIntent={throttle:0,steer:0,brake:false};

/** The rider's Player.interactionState. */
export const motoInteraction=(motoId:string)=>`moto:${motoId}`;
export const isRidingMoto=(interaction:string|undefined)=>!!interaction?.startsWith('moto:');
export const parkedMoto=(spot:typeof MOTOS[number]):MotoState=>({...spot,pitch:0,speed:0,steer:0,riderId:''});

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** The most the front wheel may turn at this speed (radians): full lock while slow, less as the tyres would let go. */
export function motoSteerAngle(speed:number):number {
  return Math.min(MOTO.MAX_STEER,Math.atan(MOTO.WHEELBASE*MOTO.GRIP/Math.max(speed*speed,.01)));
}

/** The street under both wheels and the hull's corners: its height, and the slope between the axles. */
function ground(x:number,z:number,yaw:number,reference:number):{y:number;pitch:number}|undefined {
  const s=Math.sin(yaw),c=Math.cos(yaw),axle=MOTO.WHEELBASE/2;
  const front=roadHeight(x+s*axle,z+c*axle,reference),rear=roadHeight(x-s*axle,z-c*axle,reference);
  if(front===undefined||rear===undefined)return;
  const nose=MOTO.CENTRE_Z+MOTO.HALF_LENGTH,tail=MOTO.CENTRE_Z-MOTO.HALF_LENGTH;
  for(const [lx,lz] of [[MOTO.HALF_WIDTH,nose],[-MOTO.HALF_WIDTH,nose],[MOTO.HALF_WIDTH,tail],[-MOTO.HALF_WIDTH,tail]] as const)
    if(roadHeight(x+c*lx+s*lz,z-s*lx+c*lz,reference)===undefined)return;
  return {y:(front+rear)/2,pitch:Math.atan2(front-rear,MOTO.WHEELBASE)};
}
/** The hull (a box turned by `yaw`) against the solids: separating axes, the world's first and then the hull's. */
function overlaps(x:number,z:number,yaw:number,y:number,solids:readonly Collider[]):boolean {
  const s=Math.sin(yaw),c=Math.cos(yaw),cx=x+s*MOTO.CENTRE_Z,cz=z+c*MOTO.CENTRE_Z;
  const ex=Math.abs(c)*MOTO.HALF_WIDTH+Math.abs(s)*MOTO.HALF_LENGTH,ez=Math.abs(s)*MOTO.HALF_WIDTH+Math.abs(c)*MOTO.HALF_LENGTH;
  if(cx-ex<WORLD.minX||cx+ex>WORLD.maxX||cz-ez<WORLD.minZ||cz+ez>WORLD.maxZ)return true;
  for(const solid of solids){
    if(solid.ramp||(solid.maxY??Infinity)<=y+.26||(solid.minY??-Infinity)>=y+MOTO.HEIGHT)continue;
    const dx=solid.x-cx,dz=solid.z-cz;
    if(Math.abs(dx)>=solid.hx+ex||Math.abs(dz)>=solid.hz+ez)continue;
    if(Math.abs(dx*c-dz*s)>=MOTO.HALF_WIDTH+solid.hx*Math.abs(c)+solid.hz*Math.abs(s))continue;
    if(Math.abs(dx*s+dz*c)>=MOTO.HALF_LENGTH+solid.hx*Math.abs(s)+solid.hz*Math.abs(c))continue;
    return true;
  }
  return false;
}

/**
 * One step of the bike, the same on the server and in the rider's prediction (no second physics engine: the same floors and
 * solids as the players). A bicycle model: the rear axle follows the heading and the front wheel turns it. It stays upright;
 * the lean in a curve is only drawn (moto-delivery.ts). It rides on the streets and pavements, never into the bar's floors.
 */
export function stepMoto(body:MotoBody,input:MotoIntent,dt=.05):MotoBody {
  const throttle=clamp(input.throttle,-1,1),wanted=clamp(input.steer,-1,1);
  const rate=(wanted===0||wanted*body.steer<0?MOTO.STEER_RETURN:MOTO.STEER_RATE)*dt;
  const steer=body.steer+clamp(wanted-body.steer,-rate,rate);
  let drive=0,stop=MOTO.ROLLING+MOTO.DRAG*body.speed*body.speed;
  if(input.brake)stop+=MOTO.HANDBRAKE;
  else if(throttle>0){if(body.speed<-.1)stop+=MOTO.BRAKE*throttle;else drive=MOTO.ENGINE*throttle;}
  else if(throttle<0){if(body.speed>.1)stop-=MOTO.BRAKE*throttle;else if(body.speed>-MOTO.REVERSE_SPEED)drive=MOTO.REVERSE*throttle;}
  let speed=body.speed+drive/MOTO.MASS*dt;
  const loss=stop/MOTO.MASS*dt;
  speed=Math.abs(speed)<=loss?0:speed-Math.sign(speed)*loss;
  if(!speed)return {...body,speed,steer};
  const turn=speed*Math.tan(steer*motoSteerAngle(speed))/MOTO.WHEELBASE;
  const steps=Math.max(1,Math.ceil(Math.abs(speed*dt)/MOTO.SUBSTEP)),reach=MOTO.HALF_LENGTH+Math.abs(MOTO.CENTRE_Z)+Math.abs(speed*dt)+.1;
  const solids=solidsBetween(body.x-reach,body.z-reach,body.x+reach,body.z+reach);
  let {x,y,z,yaw,pitch}=body,kept=1,hit=false;
  // Already inside a solid (a door closed on it): free to ride out.
  const free=!overlaps(x,z,yaw,y,solids);
  const place=(px:number,pz:number,pyaw:number)=>{
    const floor=ground(px,pz,pyaw,y);
    if(!floor||(free&&overlaps(px,pz,pyaw,floor.y,solids)))return false;
    x=px;z=pz;yaw=pyaw;y=floor.y;pitch=floor.pitch;return true;
  };
  for(let step=0;step<steps&&!hit;step++){
    const distance=speed*dt/steps,next=yaw-turn*dt/steps,middle=(yaw+next)/2,axle=MOTO.WHEELBASE/2;
    const rearX=x-Math.sin(yaw)*axle+Math.sin(middle)*distance,rearZ=z-Math.cos(yaw)*axle+Math.cos(middle)*distance;
    if(place(rearX+Math.sin(next)*axle,rearZ+Math.cos(next)*axle,next))continue;
    // Blocked: along the wall on whichever axis is free, keeping only that part of the speed; head on, it stops.
    const s=Math.sin(yaw),c=Math.cos(yaw),alongX=Math.abs(s)>=Math.abs(c);
    if(place(x+(alongX?s*distance:0),z+(alongX?0:c*distance),yaw))kept=Math.min(kept,alongX?Math.abs(s):Math.abs(c));
    else if(Math.abs(alongX?c:s)>.1&&place(x+(alongX?0:s*distance),z+(alongX?c*distance:0),yaw))kept=Math.min(kept,alongX?Math.abs(c):Math.abs(s));
    else hit=true;
  }
  // A hard knock throws it back a little.
  speed=hit?(Math.abs(speed)>3?-speed*.18:0):speed*kept;
  return {x,y,z,yaw,pitch,speed,steer};
}

/** Metres from a point to the hull, seen from above (0 inside it). */
function hullGap(moto:Pick<MotoBody,'x'|'z'|'yaw'>,position:Position):number {
  const s=Math.sin(moto.yaw),c=Math.cos(moto.yaw),dx=position.x-moto.x,dz=position.z-moto.z;
  const side=Math.abs(dx*c-dz*s)-MOTO.HALF_WIDTH,along=Math.abs(dx*s+dz*c-MOTO.CENTRE_Z)-MOTO.HALF_LENGTH;
  return Math.hypot(Math.max(0,side),Math.max(0,along));
}
/** Close enough to get on (the server allows `slack` more for latency), on its floor, nobody riding it. */
export function canMountMoto(moto:MotoState,position:Position,slack=0):boolean {
  return !moto.riderId&&Math.abs((position.y??moto.y)-moto.y)<.5&&hullGap(moto,position)<=MOTO.REACH+slack;
}
export function nearestFreeMoto(position:Position,motos:readonly MotoState[]):MotoState|undefined {
  return motos.filter(moto=>canMountMoto(moto,position)).sort((a,b)=>hullGap(a,position)-hullGap(b,position))[0];
}
/** Where the rider stands getting off: on the left (+X of the bike), or else whichever side has room. */
export function motoDismountSpot(moto:MotoBody):Required<Position> {
  const s=Math.sin(moto.yaw),c=Math.cos(moto.yaw);
  for(const [lx,lz] of [[1,0],[-1,0],[1,.8],[1,-.8],[-1,.8],[-1,-.8],[0,-1.5],[0,1.4]] as const){
    const x=moto.x+c*lx+s*lz,z=moto.z-s*lx+c*lz,y=floorHeight(x,z,moto.y);
    if(y!==undefined&&isWalkable(x,z,y))return {x,y,z};
  }
  const spot=findSpawn([],{x:moto.x,y:moto.y,z:moto.z});
  return {x:spot.x,y:spot.y??moto.y,z:spot.z};
}
