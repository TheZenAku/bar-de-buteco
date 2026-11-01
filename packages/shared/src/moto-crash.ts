import {advanceMoto,MOTO,motoFits,motoSpawnSpot,type MotoBody,type MotoHit} from './moto.js';
import {ballOutOf} from './ragdoll.js';
import {findSpawn,floorHeight,groundBelow,isWalkable,solidsBetween,WORLD} from './world.js';
import type {Collider,Position} from './index.js';

/**
 * A bike with nobody on it, as the room simulates it (no browser needs to: everyone draws its samples). On its wheels it goes on by itself
 * (`LooseBike`): the turning wheels and the fork hold it up while it is fast, a lean steers it into the lean, and as it slows it stops
 * holding and falls. On the ground, or from a blow, it is a rigid body (`MotoWreck`) of points against the floors and solids, and what it
 * does then (the rear rising against a wall, the slide on its side, the spin) comes out of the blows, not out of a script.
 */
const S=MOTO.SCALE;
const GRAVITY=9.81;
/** Gravity pulling a lean over, per radian: g over the height of the centre of mass. */
const TIP=GRAVITY/.42;
/** What the wheels and the fork give back against a lean, per m/s above STABLE_FROM; balances TIP around 4.5 m/s. */
const SELF_RIGHTING=7,STABLE_FROM=1.5,LEAN_DAMPING=2.6;
/** The road's bumps on a lean (rad/s per tick), and what the engine and the rear brake take from a bike nobody rides (m/s²). */
const ROAD_BUMPS=.22,COASTING_LOSS=1;
/** Past this lean the tyres have let go. */
const FALLEN_LEAN=.72;
/** A lean steers it this much (full lock per radian). */
const LEAN_STEER=2.4;
/** The centre of mass over the bike's origin, in model metres. */
const CENTRE=[0,.48*S,-.08*S] as const;
const MASS=115;
/** Moments of inertia over its own axes (a box about .5 × 1.1 × 1.6 m, at the bike's scale). */
const INERTIA=[MASS/12*((1.1*S)**2+(1.6*S)**2),MASS/12*((.5*S)**2+(1.6*S)**2),MASS/12*((.5*S)**2+(1.1*S)**2)] as const;
/** Metal on asphalt, and the wheels: they roll one way and grip across. */
const SCRAPE=.42,TYRE_ACROSS=.9,TYRE_ROLL=.025;
const BOUNCE=.22,BOUNCE_FROM=1.2;
const PUSH_OUT=.25;
/** Ticks are too coarse for this: each step moves at most this far. */
const MOST_PER_STEP=.05,LONGEST_STEP=1/120;
const STILL_SPEED=.1,STILL_TURN=.22,STILL_SECONDS=.4,MAX_WRECK_SECONDS=9;
/** Points that touch: x, y, z (model metres), and whether it is a tyre. From moto_delivery.glb: wheels, grips, headlight, footboard, panels, the box. */
const POINTS:ReadonlyArray<readonly [number,number,number,boolean]>=([
  [.05,.015,.671,true],[-.05,.015,.671,true],[.05,.015,-.671,true],[-.05,.015,-.671,true],
  [0,.225,.9,false],[0,.44,.72,false],[.07,.225,.671,false],[-.07,.225,.671,false],[.07,.225,-.671,false],[-.07,.225,-.671,false],
  [.56,1.19,.41,false],[-.56,1.19,.41,false],[0,1.31,.62,false],
  [.22,.2,.15,false],[-.22,.2,.15,false],[0,.13,0,false],
  [.25,.34,-.5,false],[-.25,.34,-.5,false],[.16,.8,-.3,false],[-.16,.8,-.3,false],
  [.27,.74,-1.04,false],[-.27,.74,-1.04,false],[.27,1.24,-1.04,false],[-.27,1.24,-1.04,false],[.27,1.24,-.56,false],[-.27,1.24,-.56,false],[.27,.74,-.56,false],[-.27,.74,-.56,false],
] as const).map(([x,y,z,tyre])=>[x*S-CENTRE[0],y*S-CENTRE[1],z*S-CENTRE[2],tyre] as const);

type Quat=[number,number,number,number];
const yawPitchRoll=(yaw:number,pitch:number,roll:number):Quat=>{
  // Yaw around Y, then the slope (+pitch raises the nose, so −X), then the lean around Z.
  const sy=Math.sin(yaw/2),cy=Math.cos(yaw/2),sp=Math.sin(-pitch/2),cp=Math.cos(-pitch/2),sr=Math.sin(roll/2),cr=Math.cos(roll/2);
  const ax=cy*sp,ay=sy*cp,az=-sy*sp,aw=cy*cp;
  return [ax*cr+ay*sr,ay*cr-ax*sr,aw*sr+az*cr,aw*cr-az*sr];
};
const rotate=(q:Quat,x:number,y:number,z:number):[number,number,number]=>{
  const [qx,qy,qz,qw]=q,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
  return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
};
const unrotate=(q:Quat,x:number,y:number,z:number)=>rotate([-q[0],-q[1],-q[2],q[3]],x,y,z);

export type MotoPhase=''|'loose'|'tumble'|'down'|'lifting';
/** The lean of a bike still rolling by itself. */
export interface LooseBike {roll:number;rollRate:number}
/** A bike that has been knocked down, around its centre of mass. */
export interface MotoWreck {x:number;y:number;z:number;q:Quat;vx:number;vy:number;vz:number;wx:number;wy:number;wz:number;still:number;time:number}
/** Where the room's state draws it: the origin the model hangs from, and the rotation. */
export interface MotoPose {x:number;y:number;z:number;yaw:number;pitch:number;speed:number;qx:number;qy:number;qz:number;qw:number}

/**
 * A step on its wheels, with no one holding the bars. `hit`: it ran into something. `fell`: it has leaned too far and is on the way down.
 * Far smaller steps for the lean than for the road: it is stiff when fast.
 */
export function stepLoose(body:MotoBody,loose:LooseBike,dt:number,obstacles:readonly Collider[]=[],bump=Math.random):{body:MotoBody;hit?:MotoHit;fell:boolean} {
  const speed=Math.abs(body.speed);
  loose.rollRate+=(bump()-.5)*ROAD_BUMPS;
  for(let i=0;i<4;i++){
    const push=TIP*Math.sin(loose.roll)-SELF_RIGHTING*Math.max(0,speed-STABLE_FROM)*loose.roll-LEAN_DAMPING*loose.rollRate;
    loose.rollRate+=push*dt/4;loose.roll+=loose.rollRate*dt/4;
  }
  const {body:next,hit}=advanceMoto(body,{throttle:0,steer:Math.max(-1,Math.min(1,loose.roll*LEAN_STEER)),brake:false},dt,obstacles);
  const loss=COASTING_LOSS*dt;
  next.speed=Math.abs(next.speed)<=loss?0:next.speed-Math.sign(next.speed)*loss;
  return {body:next,hit,fell:Math.abs(loose.roll)>=FALLEN_LEAN};
}
export function loosePose(body:MotoBody,loose:LooseBike):MotoPose {
  const [qx,qy,qz,qw]=yawPitchRoll(body.yaw,body.pitch,loose.roll);
  return {x:body.x,y:body.y,z:body.z,yaw:body.yaw,pitch:body.pitch,speed:body.speed,qx,qy,qz,qw};
}

/** From a bike as it is on its wheels: its centre of mass, moving and turning. `speed` along its heading; extra: a blow (m/s, rad/s). */
export function startWreck(body:MotoBody,roll:number,rollRate:number,speed:number,extra:{vx?:number;vz?:number;vy?:number}={}):MotoWreck {
  const q=yawPitchRoll(body.yaw,body.pitch,roll),[cx,cy,cz]=rotate(q,CENTRE[0],CENTRE[1],CENTRE[2]);
  const fx=Math.sin(body.yaw)*speed,fz=Math.cos(body.yaw)*speed;
  // The lean's turn, around its own front-to-back axis through the wheels.
  const [wx,wy,wz]=rotate(q,0,0,rollRate);
  const wreck:MotoWreck={x:body.x+cx,y:body.y+cy,z:body.z+cz,q,vx:fx+(extra.vx??0),vy:extra.vy??0,vz:fz+(extra.vz??0),wx,wy,wz,still:0,time:0};
  // The centre swings with it.
  wreck.vx+=wy*cz-wz*cy;wreck.vy+=wz*cx-wx*cz;wreck.vz+=wx*cy-wy*cx;
  return wreck;
}

const applyImpulse=(w:MotoWreck,rx:number,ry:number,rz:number,jx:number,jy:number,jz:number)=>{
  w.vx+=jx/MASS;w.vy+=jy/MASS;w.vz+=jz/MASS;
  const [lx,ly,lz]=unrotate(w.q,ry*jz-rz*jy,rz*jx-rx*jz,rx*jy-ry*jx);
  const [ax,ay,az]=rotate(w.q,lx/INERTIA[0],ly/INERTIA[1],lz/INERTIA[2]);
  w.wx+=ax;w.wy+=ay;w.wz+=az;
};
/** How much a unit impulse along `n` at arm `r` changes the velocity there. */
const reachOf=(w:MotoWreck,rx:number,ry:number,rz:number,nx:number,ny:number,nz:number)=>{
  const tx=ry*nz-rz*ny,ty=rz*nx-rx*nz,tz=rx*ny-ry*nx,[lx,ly,lz]=unrotate(w.q,tx,ty,tz);
  const [ax,ay,az]=rotate(w.q,lx/INERTIA[0],ly/INERTIA[1],lz/INERTIA[2]);
  return 1/MASS+nx*(ay*rz-az*ry)+ny*(az*rx-ax*rz)+nz*(ax*ry-ay*rx);
};
/** One point against the world: the deepest push out of the floor or a solid, as x, y, z and how far. */
function touching(x:number,y:number,z:number,solids:readonly Collider[]):[number,number,number,number]|undefined {
  const radius=.03;
  let best:[number,number,number,number]|undefined;
  const floor=groundBelow(x,z,y)??0;
  if(y-radius<floor)best=[0,1,0,floor+radius-y];
  if(x<WORLD.minX+radius)best=[1,0,0,WORLD.minX+radius-x];else if(x>WORLD.maxX-radius)best=[-1,0,0,x-WORLD.maxX+radius];
  if(z<WORLD.minZ+radius)best=[0,0,1,WORLD.minZ+radius-z];else if(z>WORLD.maxZ-radius)best=[0,0,-1,z-WORLD.maxZ+radius];
  for(const solid of solids){
    const out=ballOutOf(solid,x,y,z,radius);
    if(out&&(!best||out[3]>best[3]))best=[out[0],out[1],out[2],out[3]];
  }
  return best;
}
/** Time passes for a bike on the ground, in steps short enough not to skip a thin post. True once it lies still. */
export function stepWreck(wreck:MotoWreck,dt:number):boolean {
  const reach=1.4+Math.hypot(wreck.vx,wreck.vz)*dt,solids=solidsBetween(wreck.x-reach,wreck.z-reach,wreck.x+reach,wreck.z+reach);
  let left=dt;
  while(left>1e-6){
    const fast=Math.hypot(wreck.vx,wreck.vy,wreck.vz)+Math.hypot(wreck.wx,wreck.wy,wreck.wz)*.8;
    const h=Math.min(left,LONGEST_STEP,MOST_PER_STEP/Math.max(fast,.01));
    left-=h;
    substep(wreck,h,solids);
  }
  wreck.time+=dt;
  const moving=Math.hypot(wreck.vx,wreck.vy,wreck.vz),turning=Math.hypot(wreck.wx,wreck.wy,wreck.wz);
  const [,upY]=rotate(wreck.q,0,1,0);
  // On its wheels nothing holds it up: with nothing pushing, it starts to go.
  if(moving<.6&&turning<.6&&upY>.82){const lean=wreck.wx||wreck.wz?Math.sign(wreck.wx+wreck.wz):1;const [wx,,wz]=rotate(wreck.q,0,0,.5*lean);wreck.wx+=wx*dt;wreck.wz+=wz*dt;}
  wreck.still=moving<STILL_SPEED&&turning<STILL_TURN&&upY<=.82?wreck.still+dt:0;
  return wreck.still>=STILL_SECONDS||wreck.time>=MAX_WRECK_SECONDS;
}
function substep(w:MotoWreck,h:number,solids:readonly Collider[]):void {
  w.vy-=GRAVITY*h;
  const [forwardX,forwardY,forwardZ]=rotate(w.q,0,0,1),[,upY]=rotate(w.q,0,1,0),onWheels=upY>.55;
  for(const [lx,ly,lz,tyre] of POINTS){
    const [rx,ry,rz]=rotate(w.q,lx,ly,lz),x=w.x+rx,y=w.y+ry,z=w.z+rz,hit=touching(x,y,z,solids);
    if(!hit)continue;
    const [nx,ny,nz,depth]=hit;
    let vx=w.vx+w.wy*rz-w.wz*ry,vy=w.vy+w.wz*rx-w.wx*rz,vz=w.vz+w.wx*ry-w.wy*rx;
    const into=vx*nx+vy*ny+vz*nz;
    w.x+=nx*depth*PUSH_OUT;w.y+=ny*depth*PUSH_OUT;w.z+=nz*depth*PUSH_OUT;
    if(into>=0)continue;
    const blow=-(1+(into<-BOUNCE_FROM?BOUNCE:0))*into/reachOf(w,rx,ry,rz,nx,ny,nz);
    applyImpulse(w,rx,ry,rz,nx*blow,ny*blow,nz*blow);
    vx=w.vx+w.wy*rz-w.wz*ry;vy=w.vy+w.wz*rx-w.wx*rz;vz=w.vz+w.wx*ry-w.wy*rx;
    const left=vx*nx+vy*ny+vz*nz,tx=vx-left*nx,ty=vy-left*ny,tz=vz-left*nz;
    if(tyre&&onWheels&&ny>.5){
      // Rolling along the wheel, gripping across it.
      const along=tx*forwardX+ty*forwardY+tz*forwardZ,ax=forwardX*along,ay=forwardY*along,az=forwardZ*along;
      rub(w,rx,ry,rz,ax,ay,az,TYRE_ROLL*blow);
      rub(w,rx,ry,rz,tx-ax,ty-ay,tz-az,TYRE_ACROSS*blow);
    }else rub(w,rx,ry,rz,tx,ty,tz,SCRAPE*blow);
  }
  // Air and small losses keep it from ringing.
  const air=Math.exp(-.12*h),spin=Math.exp(-.5*h);
  w.vx*=air;w.vy*=air;w.vz*=air;w.wx*=spin;w.wy*=spin;w.wz*=spin;
  w.x+=w.vx*h;w.y+=w.vy*h;w.z+=w.vz*h;
  const [qx,qy,qz,qw]=w.q,gx=w.wx*h/2,gy=w.wy*h/2,gz=w.wz*h/2;
  const nx=qx+gx*qw+gy*qz-gz*qy,ny=qy-gx*qz+gy*qw+gz*qx,nz=qz+gx*qy-gy*qx+gz*qw,nw=qw-gx*qx-gy*qy-gz*qz,size=Math.hypot(nx,ny,nz,nw);
  w.q=[nx/size,ny/size,nz/size,nw/size];
}
/** Friction at a point: up to `most` newton-seconds against the sliding (tx, ty, tz). */
function rub(w:MotoWreck,rx:number,ry:number,rz:number,tx:number,ty:number,tz:number,most:number):void {
  const slide=Math.hypot(tx,ty,tz);
  if(slide<1e-5)return;
  const nx=tx/slide,ny=ty/slide,nz=tz/slide,stop=Math.min(most,slide/reachOf(w,rx,ry,rz,nx,ny,nz));
  applyImpulse(w,rx,ry,rz,-nx*stop,-ny*stop,-nz*stop);
}
export function wreckPose(w:MotoWreck):MotoPose {
  const [cx,cy,cz]=rotate(w.q,CENTRE[0],CENTRE[1],CENTRE[2]),[fx,fy,fz]=rotate(w.q,0,0,1);
  // Where it points on the ground; end up it has no heading, and the top of it stands for one.
  const flat=Math.hypot(fx,fz),[ux,,uz]=rotate(w.q,0,1,0),yaw=flat>.15?Math.atan2(fx,fz):Math.atan2(-ux,-uz);
  return {x:w.x-cx,y:w.y-cy,z:w.z-cz,yaw,pitch:Math.asin(Math.max(-1,Math.min(1,fy))),speed:w.vx*fx+w.vy*fy+w.vz*fz,qx:w.q[0],qy:w.q[1],qz:w.q[2],qw:w.q[3]};
}

/** Upright again: on the same spot when it fits, nearby when not (it may have slid off the street, into something, on its side). */
export function motoUprightSpot(pose:Pick<MotoPose,'x'|'y'|'z'|'yaw'>):{x:number;y:number;z:number;yaw:number;pitch:number} {
  for(const distance of [0,.5,1,1.5,2.5])for(let i=0;i<(distance?12:1);i++){
    const angle=i/12*Math.PI*2,x=pose.x+Math.sin(angle)*distance,z=pose.z+Math.cos(angle)*distance;
    for(const yaw of [pose.yaw,pose.yaw+Math.PI/2,pose.yaw-Math.PI/2,pose.yaw+Math.PI]){
      const fit=motoFits(x,z,yaw,pose.y)??motoFits(x,z,yaw,0);
      if(fit)return {x,y:fit.y,z,yaw,pitch:fit.pitch};
    }
  }
  return motoSpawnSpot(pose,pose.yaw,[])??{x:pose.x,y:pose.y,z:pose.z,yaw:pose.yaw,pitch:0};
}
/**
 * Where someone stands to lift it: on the side it fell towards, by the seat, facing it. `lean`: the local X of the bike's top on that side.
 * Whatever is walkable first.
 */
export function motoLiftSpot(upright:{x:number;y:number;z:number;yaw:number},side:number):Required<Position> {
  const s=Math.sin(upright.yaw),c=Math.cos(upright.yaw),near=MOTO.HALF_WIDTH+.62;
  for(const [lx,lz] of [[side*near,0],[side*near,.4],[side*near,-.4],[-side*near,0],[-side*near,.4],[-side*near,-.4]] as const){
    const x=upright.x+c*lx+s*lz,z=upright.z-s*lx+c*lz,y=floorHeight(x,z,upright.y);
    if(y!==undefined&&isWalkable(x,z,y))return {x,y,z};
  }
  const spot=findSpawn([],{x:upright.x,y:upright.y,z:upright.z});
  return {x:spot.x,y:spot.y??upright.y,z:spot.z};
}
/** Which side a pose leans to: +1 is the bike's left (+X), −1 its right. */
export function motoLeanSide(pose:Pick<MotoPose,'yaw'|'qx'|'qy'|'qz'|'qw'>):number {
  const [ux,,uz]=rotate([pose.qx,pose.qy,pose.qz,pose.qw],0,1,0);
  return ux*Math.cos(pose.yaw)-uz*Math.sin(pose.yaw)>=0?1:-1;
}
/** A rotation part of the way to another, smoothly (the lift). */
export function blendQuat(a:Quat,b:Quat,t:number):Quat {
  const dot=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3],sign=dot<0?-1:1;
  const x=a[0]+(b[0]*sign-a[0])*t,y=a[1]+(b[1]*sign-a[1])*t,z=a[2]+(b[2]*sign-a[2])*t,w=a[3]+(b[3]*sign-a[3])*t,size=Math.hypot(x,y,z,w)||1;
  return [x/size,y/size,z/size,w/size];
}
export const uprightQuat=(yaw:number,pitch:number):Quat=>yawPitchRoll(yaw,pitch,0);
