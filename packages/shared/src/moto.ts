import {carSteerAngle,stepCarDynamics} from './car-dynamics.js';
import {z} from 'zod';
import {findSpawn,floorHeight,isWalkable,PLAYER_RADIUS,roadHeight,solidsBetween,WORLD} from './world.js';
import type {Collider,Position} from './index.js';
import type {MotoPhase} from './moto-crash.js';
import {FULL_HANDLING,MOTO_ENGINE,NEW_MOTO_PARTS,type MotoHandling} from './moto-parts.js';
import {CAR,CAR_MODEL,MOTO_FOGO_MODEL,VEHICLE_MODELS,isPassenger,vehicleOccupants} from './vehicle-models.js';

/** v4 is authored in metres (30 cm tyres and an 80 cm seat). No scooter scale correction. */
const SCALE=1;
/**
 * The bike's measurements (moto_delivery.glb at SCALE) and its handling: about 150 kg with the rider and 55 km/h flat out, like a
 * scooter. Forces in newtons; ENGINE − ROLLING = DRAG × TOP_SPEED² is what sets the top speed.
 */
export const MOTO={
  SCALE,WHEELBASE:1.361*SCALE,WHEEL_RADIUS:.30*SCALE,
  /** v4's complete render bounds, including mirrors/plate, rounded outwards (no bag). */
  HALF_WIDTH:.421*SCALE,HALF_LENGTH:1.002*SCALE,CENTRE_Z:-.0155*SCALE,HEIGHT:1.2*SCALE,
  MASS:150,ENGINE:660,REVERSE:300,BRAKE:1350,HANDBRAKE:1050,ROLLING:60,DRAG:2.56,TOP_SPEED:15.3,REVERSE_SPEED:2.5,
  /** The handlebar's lock, and the sideways grip that narrows it as speed rises (metres per second squared). */
  MAX_STEER:28*Math.PI/180,GRIP:20,
  /** How fast the handlebar turns (full lock per second), and how fast it comes back. */
  STEER_RATE:4.5,STEER_RETURN:6,
  /** Metres between collision checks: a wall is never skipped, even flat out. */
  SUBSTEP:.1,
  /** How far the rider's centre may be from the hull to get on. */
  REACH:.9,
  /** Above this speed (m/s) the bike must slow down before the rider can get off. */
  DISMOUNT_SPEED:3,
  /** Going into something at this speed or more (m/s, the part that goes against it) throws the rider off. */
  CRASH_SPEED:3.5,
  /** Into something at less than this share of its speed, it glances off and goes on by itself; more, and it is knocked down. */
  GLANCING:.5,
  /** How long lifting a fallen bike takes (ms). */
  LIFT_MS:1700,
  /** The most bikes the administration can have on the map at once. */
  LIMIT:12,
} as const;

type VehiclePhysics={[K in keyof typeof MOTO]:number};
const CAR_PHYSICS:VehiclePhysics={...MOTO,...CAR};
/**
 * The Caveira em Chamas (moto_fogo.glb, scripts/58_moto_fogo.py): the delivery bike's engine and handling on its own measurements,
 * taken from the model: round 29,7 cm wheels (rebuilt on their axles), axles 1,5128 m apart, 2,16 m long. The hull is the body and the grips; the spiked bar
 * ends (±0,63 m, above 1 m) are left out so it does not stick on doorways.
 */
export const MOTO_FOGO:VehiclePhysics={...MOTO,WHEELBASE:1.5128,WHEEL_RADIUS:.297,HALF_WIDTH:.46,HALF_LENGTH:1.08,CENTRE_Z:-.0225,HEIGHT:1.18};
export const vehiclePhysics=(model:string|undefined):VehiclePhysics=>model===CAR_MODEL?CAR_PHYSICS:model===MOTO_FOGO_MODEL?MOTO_FOGO:MOTO;
export interface MotoBody {model?:string;x:number;y:number;z:number;yaw:number;pitch:number;speed:number;steer:number;/** Local +X velocity (m/s), and yaw velocity (rad/s). Absent legacy fields read as zero. */lateralSpeed?:number;yawRate?:number}
/** Which lamps are lit beyond the ones always on (MotoState.lights). */
export const MOTO_LIGHT={BRAKE:1,LEFT:2,RIGHT:4,HIGH:8} as const;
/**
 * A bike in the room's state; riderId is '' while parked. `ticks` counts its steps: its own clock, since the inputs reach the room
 * unevenly and a patch can carry none, one or three steps (moto-motion.ts plays the others' bikes by it). `phase` is empty on its stand or
 * ridden; otherwise nobody can get on (moto-crash.ts), `lifterId` is who is lifting it, and qx…qw how it lies. The engine (moto-parts.ts): `engine`
 * is MOTO_ENGINE, `engineAt` when that last changed (server ms, what tells the browsers to play a sound), `crank` the outcome of the last try at
 * starting, `gas` whether the throttle is open, and `parts` the condition of each part in MOTO_PARTS's order.
 */
export interface MotoState extends MotoBody {id:string;/** Who holds its key (docs/sistemas/garagem.md). '' for the administration's, which anyone may ride. */ownerId?:string;/** The key holder's name, the plate on its back, and the row it is in the API. */ownerName?:string;plate?:string;vehicleId?:string;/** Only the key holder gets on it. */locked?:boolean;riderId:string;ticks:number;phase:MotoPhase;lifterId:string;lights:number;qx:number;qy:number;qz:number;qw:number;engine:number;engineAt:number;crank:number;gas:boolean;parts:string}
export interface MotoState {color?:string;passengers?:string[];doors?:number;hood?:boolean;trunk?:boolean;wipers?:boolean;headlights?:number;ignition?:boolean;fuel?:number;horn?:boolean;wheelie?:number}
export interface MotoIntent {throttle:number;steer:number;brake:boolean;horn?:boolean;wheelie?:boolean;/** MOTO_LIGHT.LEFT, RIGHT and HIGH: the rider's switches. */lights?:number}
/** W/S (forward, brake and reverse), A/D (+1 is right), the handbrake and the switches. */
export interface MotoInput extends MotoIntent {seq:number}
export const motoInputSchema=z.object({seq:z.number().int().min(0).max(2147483647),throttle:z.number().finite().min(-1).max(1),steer:z.number().finite().min(-1).max(1),brake:z.boolean(),lights:z.number().int().min(0).max(15).optional(),horn:z.boolean().optional(),wheelie:z.boolean().optional()}).strict();
export const motoMountSchema=z.object({motoId:z.string().max(32),seat:z.number().int().min(0).max(3).optional()}).strict();
export const NO_MOTO_INTENT:MotoIntent={throttle:0,steer:0,brake:false};

/** The rider's Player.interactionState. */
export const motoInteraction=(motoId:string)=>`moto:${motoId}`;
export const isRidingMoto=(interaction:string|undefined)=>!!interaction?.startsWith('moto:')||isPassenger(interaction);
export const parkedMoto=(spot:{id:string;x:number;y:number;z:number;yaw:number;pitch?:number}):MotoState=>({pitch:0,...spot,ownerId:'',ownerName:'',plate:'',vehicleId:'',locked:false,speed:0,steer:0,lateralSpeed:0,yawRate:0,riderId:'',ticks:0,phase:'',lifterId:'',lights:0,qx:0,qy:0,qz:0,qw:1,engine:MOTO_ENGINE.OFF,engineAt:0,crank:0,gas:false,parts:NEW_MOTO_PARTS});
export const motoSpawnSchema=z.object({model:z.enum(VEHICLE_MODELS).optional()}).strict();
/** How far a body is from the hull, seen from above. */
export const motoDistance=(moto:Pick<MotoBody,'x'|'z'|'yaw'|'model'>,position:Position)=>hullGap(moto,position);
/** One bike, or every bike when there is no id. */
export const motoDespawnSchema=z.object({id:z.string().max(32).optional()}).strict();

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** Total ground speed; the signed longitudinal component still selects D/R. */
export const vehicleSpeed=(body:Pick<MotoBody,'speed'|'lateralSpeed'>)=>Math.hypot(body.speed,body.lateralSpeed??0);
/** Clearance-sensitive actions also account for a spinning hull's corners. */
export function vehicleMotionSpeed(body:Pick<MotoBody,'speed'|'lateralSpeed'|'yawRate'|'model'>):number {
  const spec=vehiclePhysics(body.model);
  return Math.max(vehicleSpeed(body),Math.abs(body.yawRate??0)*Math.hypot(spec.HALF_LENGTH,spec.HALF_WIDTH));
}
export const vehicleMoving=(body:Pick<MotoBody,'speed'|'lateralSpeed'|'yawRate'>)=>vehicleSpeed(body)>.001||Math.abs(body.yawRate??0)>.001;
export function vehicleVelocity(body:Pick<MotoBody,'speed'|'lateralSpeed'|'yaw'>){
  const s=Math.sin(body.yaw),c=Math.cos(body.yaw),side=body.lateralSpeed??0;
  return {x:s*body.speed+c*side,z:c*body.speed-s*side};
}
export const STOPPED_VEHICLE={speed:0,lateralSpeed:0,yawRate:0} as const;
/** The most the front wheel may turn at this speed (radians): full lock while slow, less as the tyres would let go. */
export function motoSteerAngle(speed:number,model?:string):number {
  if(model===CAR_MODEL)return carSteerAngle(speed);
  const spec=vehiclePhysics(model);
  return Math.min(spec.MAX_STEER,Math.atan(spec.WHEELBASE*spec.GRIP/Math.max(speed*speed,.01)));
}

/** The street under both wheels and the hull's corners: its height, and the slope between the axles. */
function ground(x:number,z:number,yaw:number,reference:number,spec:VehiclePhysics=MOTO):{y:number;pitch:number}|undefined {
  const s=Math.sin(yaw),c=Math.cos(yaw),axle=spec.WHEELBASE/2;
  let front=roadHeight(x+s*axle,z+c*axle,reference),rear=roadHeight(x-s*axle,z-c*axle,reference);
  if(spec===CAR_PHYSICS){
    const wheel=(side:number,along:number)=>roadHeight(x+c*side+s*along,z-s*side+c*along,reference);
    const fl=wheel(CAR.WHEEL_TRACK/2,axle),fr=wheel(-CAR.WHEEL_TRACK/2,axle),rl=wheel(CAR.WHEEL_TRACK/2,-axle),rr=wheel(-CAR.WHEEL_TRACK/2,-axle);
    if(fl===undefined||fr===undefined||rl===undefined||rr===undefined)return;
    front=(fl+fr)/2;rear=(rl+rr)/2;
  }
  if(front===undefined||rear===undefined)return;
  const nose=spec.CENTRE_Z+spec.HALF_LENGTH,tail=spec.CENTRE_Z-spec.HALF_LENGTH;
  for(const [lx,lz] of [[spec.HALF_WIDTH,nose],[-spec.HALF_WIDTH,nose],[spec.HALF_WIDTH,tail],[-spec.HALF_WIDTH,tail]] as const)
    if(roadHeight(x+c*lx+s*lz,z-s*lx+c*lz,reference)===undefined)return;
  return {y:(front+rear)/2,pitch:Math.atan2(front-rear,spec.WHEELBASE)};
}
/** The hull (a box turned by `yaw`) against the solids: separating axes, the world's first and then the hull's. */
const overlaps=(x:number,z:number,yaw:number,y:number,solids:readonly Collider[],spec:VehiclePhysics=MOTO):boolean=>!!overlapping(x,z,yaw,y,solids,spec);
const WORLD_EDGE:Collider={id:'world',x:0,z:0,hx:0,hz:0};
/** What the hull is inside of: the first solid found, or the edge of the world. */
function overlapping(x:number,z:number,yaw:number,y:number,solids:readonly Collider[],spec:VehiclePhysics=MOTO):Collider|undefined {
  const s=Math.sin(yaw),c=Math.cos(yaw),cx=x+s*spec.CENTRE_Z,cz=z+c*spec.CENTRE_Z;
  const ex=Math.abs(c)*spec.HALF_WIDTH+Math.abs(s)*spec.HALF_LENGTH,ez=Math.abs(s)*spec.HALF_WIDTH+Math.abs(c)*spec.HALF_LENGTH;
  if(cx-ex<WORLD.minX||cx+ex>WORLD.maxX||cz-ez<WORLD.minZ||cz+ez>WORLD.maxZ)return WORLD_EDGE;
  for(const solid of solids){
    if(solid.ramp||(solid.maxY??Infinity)<=y+.26||(solid.minY??-Infinity)>=y+spec.HEIGHT)continue;
    const dx=solid.x-cx,dz=solid.z-cz;
    if(Math.abs(dx)>=solid.hx+ex||Math.abs(dz)>=solid.hz+ez)continue;
    const turn=solid.turn;
    if(!turn){
      if(Math.abs(dx*c-dz*s)>=spec.HALF_WIDTH+solid.hx*Math.abs(c)+solid.hz*Math.abs(s))continue;
      if(Math.abs(dx*s+dz*c)>=spec.HALF_LENGTH+solid.hx*Math.abs(s)+solid.hz*Math.abs(c))continue;
      return solid;
    }
    // A turned box (the city's): its two axes and the hull's. u is its X on the ground and v its Z; a is the hull's X and b its Z.
    const {ux,uz,lx,lz}=turn,ua=ux*c-uz*s,ub=ux*s+uz*c,va=-uz*c-ux*s,vb=-uz*s+ux*c;
    if(Math.abs(dx*ux+dz*uz)>=lx+spec.HALF_WIDTH*Math.abs(ua)+spec.HALF_LENGTH*Math.abs(ub))continue;
    if(Math.abs(dz*ux-dx*uz)>=lz+spec.HALF_WIDTH*Math.abs(va)+spec.HALF_LENGTH*Math.abs(vb))continue;
    if(Math.abs(dx*c-dz*s)>=spec.HALF_WIDTH+lx*Math.abs(ua)+lz*Math.abs(va))continue;
    if(Math.abs(dx*s+dz*c)>=spec.HALF_LENGTH+lx*Math.abs(ub)+lz*Math.abs(vb))continue;
    return solid;
  }
}
/** The face of a solid a hull has just gone into: the axis with the least overlap, pointing back at the hull. */
function faceOf(solid:Collider,x:number,z:number,yaw:number,spec:VehiclePhysics=MOTO):{nx:number;nz:number} {
  const s=Math.sin(yaw),c=Math.cos(yaw),dx=x+s*spec.CENTRE_Z-solid.x,dz=z+c*spec.CENTRE_Z-solid.z,turn=solid.turn;
  const ux=turn?turn.ux:1,uz=turn?turn.uz:0,hx=turn?turn.lx:solid.hx,hz=turn?turn.lz:solid.hz;
  const along=dx*ux+dz*uz,across=dz*ux-dx*uz;
  const reachX=spec.HALF_WIDTH*Math.abs(c*ux-s*uz)+spec.HALF_LENGTH*Math.abs(s*ux+c*uz),reachZ=spec.HALF_WIDTH*Math.abs(-s*ux-c*uz)+spec.HALF_LENGTH*Math.abs(c*ux-s*uz);
  if(hx+reachX-Math.abs(along)<hz+reachZ-Math.abs(across)){const sign=along<0?-1:1;return {nx:ux*sign,nz:uz*sign};}
  const sign=across<0?-1:1;
  return {nx:-uz*sign,nz:ux*sign};
}
/** A bike as something another bike runs into. */
export function motoObstacle(other:{id:string;x:number;y:number;z:number;yaw:number;model?:string}):Collider {
  const s=Math.sin(other.yaw),c=Math.cos(other.yaw),spec=vehiclePhysics(other.model);
  return {id:`moto:${other.id}`,x:other.x+s*spec.CENTRE_Z,y:other.y,z:other.z+c*spec.CENTRE_Z,hx:Math.abs(c)*spec.HALF_WIDTH+Math.abs(s)*spec.HALF_LENGTH,hz:Math.abs(s)*spec.HALF_WIDTH+Math.abs(c)*spec.HALF_LENGTH,
    minY:other.y,maxY:other.y+spec.HEIGHT,turn:{ux:c,uz:-s,lx:spec.HALF_WIDTH,lz:spec.HALF_LENGTH}};
}
/** The street can take the hull upright there: its height and slope. */
export function motoFits(x:number,z:number,yaw:number,reference:number,model?:string):{y:number;pitch:number}|undefined {
  const spec=vehiclePhysics(model),reach=spec.HALF_LENGTH+Math.abs(spec.CENTRE_Z)+.1,floor=ground(x,z,yaw,reference,spec);
  if(!floor||!clearStreet(x,z,yaw,floor.y,spec)||overlaps(x,z,yaw,floor.y,solidsBetween(x-reach,z-reach,x+reach,z+reach),spec))return;
  return floor;
}
/** A blow: how fast it was going, and how much of that went straight into what stopped it (m/s), the way back out of it, and what it was. */
export interface MotoHit {speed:number;closing:number;nx:number;nz:number;solid?:string}

/** Car tyre integration, with swept translation AND corner rotation checks. */
function advanceCar(body:MotoBody,input:MotoIntent,dt:number,obstacles:readonly Collider[],handling:MotoHandling):{body:MotoBody;hit?:MotoHit} {
  let current:MotoBody&{lateralSpeed:number;yawRate:number}={model:body.model,x:body.x,y:body.y,z:body.z,yaw:body.yaw,pitch:body.pitch,
    speed:body.speed,steer:body.steer,lateralSpeed:body.lateralSpeed??0,yawRate:body.yawRate??0};
  if(dt<=0)return {body:current};
  const spec=CAR_PHYSICS;
  const reach=spec.HALF_LENGTH+vehicleSpeed(body)*dt+spec.ENGINE/spec.MASS*dt*dt+1;
  const near=solidsBetween(body.x-reach,body.z-reach,body.x+reach,body.z+reach),solids=obstacles.length?[...near,...obstacles]:near;
  const free=!overlaps(body.x,body.z,body.yaw,body.y,solids,spec);
  let remaining=dt,blow:MotoHit|undefined;
  while(remaining>1e-9){
    const h=Math.min(remaining,.01,spec.SUBSTEP/Math.max(1,vehicleSpeed(current)+Math.abs(current.yawRate)*spec.HALF_LENGTH+5));
    const next=stepCarDynamics(current,input,h,handling);
    const heading=current.yaw+(next.yawRate??0)*h,middle=(current.yaw+heading)/2;
    const velocity=vehicleVelocity({...next,yaw:middle}),dx=velocity.x*h,dz=velocity.z*h;
    // A sudden change of yaw velocity must also sweep the hull's corners.
    const sweeps=Math.max(1,Math.ceil((Math.hypot(dx,dz)+Math.abs(heading-current.yaw)*spec.HALF_LENGTH)/spec.SUBSTEP));
    for(let i=0;i<sweeps;i++){
      const yaw=current.yaw+(heading-current.yaw)/(sweeps-i),x=current.x+dx/sweeps,z=current.z+dz/sweeps;
      const floor=ground(x,z,yaw,current.y,spec),solid=floor?overlapping(x,z,yaw,floor.y,solids,spec):undefined;
      if(floor&&(!free||!solid)){current={...current,x,z,yaw,y:floor.y,pitch:floor.pitch};continue;}
      const normal=solid&&solid!==WORLD_EDGE?faceOf(solid,x,z,yaw,spec):{nx:-velocity.x/(Math.hypot(velocity.x,velocity.z)||1),nz:-velocity.z/(Math.hypot(velocity.x,velocity.z)||1)};
      const closing=Math.max(0,-velocity.x*normal.nx-velocity.z*normal.nz);
      blow??={speed:vehicleSpeed(next),closing,...normal,...(solid&&solid!==WORLD_EDGE?{solid:solid.id}:{})};
      // Remove the inward velocity, retaining the tangent. Stop the yaw that
      // would push a corner through the wall; no teleport or bounce energy.
      const vx=velocity.x+normal.nx*closing,vz=velocity.z+normal.nz*closing;
      const slideX=current.x+vx*h/sweeps,slideZ=current.z+vz*h/sweeps;
      const slideFloor=ground(slideX,slideZ,current.yaw,current.y,spec);
      const canSlide=slideFloor&&(!free||!overlaps(slideX,slideZ,current.yaw,slideFloor.y,solids,spec));
      const s=Math.sin(current.yaw),c=Math.cos(current.yaw);
      return {body:{...current,...(canSlide?{x:slideX,z:slideZ,y:slideFloor.y,pitch:slideFloor.pitch}:{}),steer:next.steer,
        speed:canSlide?vx*s+vz*c:0,lateralSpeed:canSlide?vx*c-vz*s:0,yawRate:0},hit:blow};
    }
    current={...current,speed:next.speed,lateralSpeed:next.lateralSpeed??0,yawRate:next.yawRate??0,steer:next.steer};
    remaining-=h;
  }
  return {body:current};
}

/**
 * One step of the bike, the same on the server and in the rider's prediction (no second physics engine: the same floors and
 * solids as the players). A bicycle model: the rear axle follows the heading and the front wheel turns it. It stays upright;
 * the lean in a curve is only drawn (moto-delivery.ts). It rides on the streets and pavements, never into the bar's floors.
 * `obstacles`: other bikes (motoObstacle). `handling`: what the state of its parts and engine does to it (motoHandling).
 */
export function stepMoto(body:MotoBody,input:MotoIntent,dt=.05,obstacles:readonly Collider[]=[],handling:MotoHandling=FULL_HANDLING):MotoBody {return advanceMoto(body,input,dt,obstacles,handling).body;}
/** The same step, also telling what it ran into (the room throws the rider off by that: moto-crash.ts). */
export function advanceMoto(body:MotoBody,input:MotoIntent,dt=.05,obstacles:readonly Collider[]=[],handling:MotoHandling=FULL_HANDLING):{body:MotoBody;hit?:MotoHit} {
  if(body.model===CAR_MODEL)return advanceCar(body,input,dt,obstacles,handling);
  const spec=vehiclePhysics(body.model);
  const throttle=clamp(input.throttle,-1,1),wanted=clamp(input.steer,-1,1);
  const rate=(wanted===0||wanted*body.steer<0?spec.STEER_RETURN:spec.STEER_RATE)*dt;
  const steer=body.steer+clamp(wanted-body.steer,-rate,rate);
  let drive=0,stop=spec.ROLLING*handling.rolling+spec.DRAG*body.speed*body.speed;
  if(input.brake)stop+=spec.HANDBRAKE*handling.brake;
  else if(throttle>0){if(body.speed<-.1)stop+=spec.BRAKE*handling.brake*throttle;else drive=spec.ENGINE*handling.power*throttle;}
  else if(throttle<0){if(body.speed>.1)stop-=spec.BRAKE*handling.brake*throttle;else if(body.speed>-spec.REVERSE_SPEED)drive=spec.REVERSE*handling.power*throttle;}
  let speed=body.speed+drive/spec.MASS*dt;
  const loss=stop/spec.MASS*dt;
  speed=Math.abs(speed)<=loss?0:speed-Math.sign(speed)*loss;
  if(!speed)return {body:{...(body.model?{model:body.model}:{}),x:body.x,y:body.y,z:body.z,yaw:body.yaw,pitch:body.pitch,speed,steer,lateralSpeed:0,yawRate:0}};
  const turn=speed*Math.tan(clamp(steer+handling.pull,-1,1)*handling.turn*motoSteerAngle(speed,body.model))/spec.WHEELBASE;
  const steps=Math.max(1,Math.ceil(Math.abs(speed*dt)/spec.SUBSTEP)),reach=spec.HALF_LENGTH+Math.abs(spec.CENTRE_Z)+Math.abs(speed*dt)+.1;
  const near=solidsBetween(body.x-reach,body.z-reach,body.x+reach,body.z+reach),solids=obstacles.length?[...near,...obstacles]:near;
  let {x,y,z,yaw,pitch}=body,kept=1,hit=false,blow:MotoHit|undefined;
  // Already inside a solid (a door closed on it): free to ride out.
  const free=!overlaps(x,z,yaw,y,solids,spec);
  const place=(px:number,pz:number,pyaw:number)=>{
    const floor=ground(px,pz,pyaw,y,spec);
    if(!floor||(free&&overlaps(px,pz,pyaw,floor.y,solids,spec)))return false;
    x=px;z=pz;yaw=pyaw;y=floor.y;pitch=floor.pitch;return true;
  };
  for(let step=0;step<steps&&!hit;step++){
    const distance=speed*dt/steps,next=yaw-turn*dt/steps,middle=(yaw+next)/2,axle=spec.WHEELBASE/2;
    const rearX=x-Math.sin(yaw)*axle+Math.sin(middle)*distance,rearZ=z-Math.cos(yaw)*axle+Math.cos(middle)*distance;
    const wantX=rearX+Math.sin(next)*axle,wantZ=rearZ+Math.cos(next)*axle;
    if(place(wantX,wantZ,next))continue;
    // The first thing it ran into, and how much of the speed went straight against it.
    if(!blow&&free){
      const floor=ground(wantX,wantZ,next,y,spec),solid=floor?overlapping(wantX,wantZ,next,floor.y,solids,spec):undefined;
      if(solid&&solid!==WORLD_EDGE){
        const {nx,nz}=faceOf(solid,wantX,wantZ,next,spec);
        blow={speed,closing:Math.max(0,-(Math.sin(yaw)*nx+Math.cos(yaw)*nz)*speed),nx,nz,solid:solid.id};
      }
    }
    // Blocked: along the wall on whichever axis is free, keeping only that part of the speed; head on, it stops.
    const s=Math.sin(yaw),c=Math.cos(yaw),alongX=Math.abs(s)>=Math.abs(c);
    if(place(x+(alongX?s*distance:0),z+(alongX?0:c*distance),yaw))kept=Math.min(kept,alongX?Math.abs(s):Math.abs(c));
    else if(Math.abs(alongX?c:s)>.1&&place(x+(alongX?0:s*distance),z+(alongX?c*distance:0),yaw))kept=Math.min(kept,alongX?Math.abs(c):Math.abs(s));
    else hit=true;
  }
  // No solid to ask (the edge of the street, a step too high): as much as was lost, facing back along the way it was going.
  if((hit||kept<1)&&!blow&&free){
    const way=Math.sign(speed);
    blow={speed,closing:Math.abs(speed)*(hit?1:Math.sqrt(1-kept*kept)),nx:-Math.sin(yaw)*way,nz:-Math.cos(yaw)*way};
  }
  // A hard knock throws it back a little.
  speed=hit?(Math.abs(speed)>3?-speed*.18:0):speed*kept;
  return {body:{...(body.model?{model:body.model}:{}),x,y,z,yaw,pitch,speed,steer,lateralSpeed:0,yawRate:hit?0:-turn*kept},hit:blow};
}

/**
 * Nothing but street under the whole hull, seen from above it: the pavement's surface runs on under the bar's floor, where a
 * bike already riding never gets (the walls stop it) but one being placed could.
 */
function clearStreet(x:number,z:number,yaw:number,y:number,spec:VehiclePhysics=MOTO):boolean {
  const s=Math.sin(yaw),c=Math.cos(yaw),nose=spec.CENTRE_Z+spec.HALF_LENGTH,tail=spec.CENTRE_Z-spec.HALF_LENGTH;
  for(const [lx,lz] of [[0,0],[0,nose],[0,tail],[spec.HALF_WIDTH,nose],[-spec.HALF_WIDTH,nose],[spec.HALF_WIDTH,tail],[-spec.HALF_WIDTH,tail]] as const)
    if(roadHeight(x+c*lx+s*lz,z-s*lx+c*lz,y+.2)===undefined)return false;
  return true;
}
/** Rings around whoever spawns a bike: the first clears the hull and the body, the last is as far as a street may be. */
const SPAWN_RING_STEP=1,SPAWN_LAST_RING=30,SPAWN_ANGLES=24;
/**
 * The free stretch of street nearest to a point, starting straight ahead of `yaw` and pointing that way if it fits. From inside the
 * bar or the terrace this is the street outside. Undefined when no street is near.
 */
export function motoSpawnSpot(near:Position,yaw:number,others:readonly Pick<MotoBody,'x'|'z'|'model'>[],avoid:ReadonlyArray<{x:number;z:number;radius:number}>=[],model?:string):{x:number;y:number;z:number;yaw:number;pitch:number}|undefined {
  const spec=vehiclePhysics(model),reach=spec.HALF_LENGTH+Math.abs(spec.CENTRE_Z)+.1;
  for(let ring=spec.HALF_LENGTH+.8;ring<=SPAWN_LAST_RING;ring+=SPAWN_RING_STEP){
    for(let i=0;i<SPAWN_ANGLES;i++){
      // 0, +1, −1, +2, −2…: the nearest to straight ahead first.
      const angle=yaw+Math.ceil(i/2)*(i%2?1:-1)*Math.PI*2/SPAWN_ANGLES,x=near.x+Math.sin(angle)*ring,z=near.z+Math.cos(angle)*ring;
      if(others.some(other=>Math.hypot(other.x-x,other.z-z)<spec.HALF_LENGTH+vehiclePhysics(other.model).HALF_LENGTH+.4)||avoid.some(zone=>Math.hypot(zone.x-x,zone.z-z)<zone.radius))continue;
      const solids=solidsBetween(x-reach,z-reach,x+reach,z+reach);
      for(const heading of [yaw,yaw+Math.PI/2,yaw-Math.PI/2,yaw+Math.PI])for(const reference of [near.y??0,0]){
        const floor=ground(x,z,heading,reference,spec);
        if(floor&&clearStreet(x,z,heading,floor.y,spec)&&!overlaps(x,z,heading,floor.y,solids,spec))return {x,y:floor.y,z,yaw:heading,pitch:floor.pitch};
      }
    }
  }
}

/** Metres from a point to the hull, seen from above (0 inside it). */
function hullGap(moto:Pick<MotoBody,'x'|'z'|'yaw'|'model'>,position:Position):number {
  const spec=vehiclePhysics(moto.model);
  const s=Math.sin(moto.yaw),c=Math.cos(moto.yaw),dx=position.x-moto.x,dz=position.z-moto.z;
  const side=Math.abs(dx*c-dz*s)-spec.HALF_WIDTH,along=Math.abs(dx*s+dz*c-spec.CENTRE_Z)-spec.HALF_LENGTH;
  return Math.hypot(Math.max(0,side),Math.max(0,along));
}
/** Close enough to get on (the server allows `slack` more for latency), on its floor, on its wheels, nobody riding it. */
export function canMountMoto(moto:MotoState,position:Position,slack=0,who?:string):boolean {
  return (moto.model===CAR_MODEL?vehicleOccupants(moto).filter(Boolean).length<CAR.SEATS&&vehicleMotionSpeed(moto)<.5:!moto.riderId)&&(!moto.locked||who===undefined||moto.ownerId===who)&&!moto.phase&&Math.abs((position.y??moto.y)-moto.y)<.5&&hullGap(moto,position)<=vehiclePhysics(moto.model).REACH+slack;
}
/** Close enough to work on it, standing or lying, and nobody on it, nobody lifting it, and it is not moving. */
export function canRepairMoto(moto:MotoState,position:Position,slack=0):boolean {
  return !vehicleOccupants(moto).some(Boolean)&&!moto.lifterId&&(moto.phase===''||moto.phase==='down')&&!vehicleMoving(moto)&&Math.abs((position.y??moto.y)-moto.y)<.7&&hullGap(moto,position)<=vehiclePhysics(moto.model).REACH+.6+slack;
}
/** Close enough to lift it (a bit more than to get on: it is lying down, and only just landed there). */
export function canLiftMoto(moto:MotoState,position:Position,slack=0):boolean {
  return moto.phase==='down'&&Math.abs((position.y??moto.y)-moto.y)<.7&&hullGap(moto,position)<=MOTO.REACH+.3+slack;
}
export function nearestFallenMoto(position:Position,motos:readonly MotoState[]):MotoState|undefined {
  return motos.filter(moto=>canLiftMoto(moto,position)).sort((a,b)=>hullGap(a,position)-hullGap(b,position))[0];
}
/** A body on foot in the bike's way: the hull and the body's own width, on its floor. */
export function motoStrikes(moto:Pick<MotoBody,'x'|'y'|'z'|'yaw'|'model'>,position:Position):boolean {
  return Math.abs((position.y??moto.y)-moto.y)<.6&&hullGap(moto,position)<=.22;
}
export function nearestFreeMoto(position:Position,motos:readonly MotoState[],who?:string):MotoState|undefined {
  return motos.filter(moto=>canMountMoto(moto,position,0,who)).sort((a,b)=>hullGap(a,position)-hullGap(b,position))[0];
}
/** Prefer the seat's side; every candidate and fallback must clear the model's hull and nearby vehicles. */
export function motoDismountSpot(moto:MotoBody,seat=0,obstacles:readonly Collider[]=[]):Required<Position> {
  const s=Math.sin(moto.yaw),c=Math.cos(moto.yaw),spec=vehiclePhysics(moto.model);
  const hulls=[motoObstacle({...moto,id:'dismount'}),...obstacles];
  const offsets:Array<readonly [number,number]>=[];
  if(moto.model===CAR_MODEL){
    const side=seat===1||seat===3?-1:1,width=spec.HALF_WIDTH+PLAYER_RADIUS+.15;
    for(const sign of [side,-side])for(const back of [seat>=2?-.8:.15,-1.3,1.3])offsets.push([sign*width,back]);
    offsets.push([0,spec.CENTRE_Z-spec.HALF_LENGTH-PLAYER_RADIUS-.15],[0,spec.CENTRE_Z+spec.HALF_LENGTH+PLAYER_RADIUS+.15]);
  }else{
    offsets.push([1,0],[-1,0],[1,.8],[1,-.8],[-1,.8],[-1,-.8],[0,-1.5],[0,1.4]);
  }
  for(const [lx,lz] of offsets){
    const x=moto.x+c*lx+s*lz,z=moto.z-s*lx+c*lz,y=floorHeight(x,z,moto.y);
    if(y!==undefined&&isWalkable(x,z,y,hulls))return {x,y,z};
  }
  const spot=findSpawn([],{x:moto.x,y:moto.y,z:moto.z},hulls);
  return {x:spot.x,y:spot.y??moto.y,z:spot.z};
}
