import {groundBelow,solidsBetween,WORLD} from './world.js';
import type {Collider} from './index.js';

/**
 * A body thrown by a crash. The game has no physics engine, so this is one small enough for the room and every browser to run the same
 * steps: points joined by rods (position-based dynamics), against the same floors and solids the players walk on. From the same start the
 * same steps give the same body, so the room only says when and from where, and each browser draws what the room is computing.
 */
export const RAGDOLL_STEP=1/120;
/** Past this it counts as still, whatever it is doing: nobody stays on the floor because of a jitter. */
export const RAGDOLL_MAX_SECONDS=7;
const GRAVITY=9.81,ITERATIONS=8,DAMPING=.9995;
/** Skin and cloth on the ground, and against a wall (which only rubs while it is being hit: nothing holds a body up on it). */
const FRICTION=.75,WALL_FRICTION=.35;
/** How much of a hit comes back (a body does not stick to what it hits), and how hard it must be (metres per step). */
const BOUNCE=.14,WALL_BOUNCE=.32,BOUNCE_FROM=1.5*RAGDOLL_STEP;
/** How far above the lowest it has been the body's energy may drift (as metres of height for all of it): rounding, not a gain. */
const ENERGY_DRIFT=.02;
/** Below this speed (m/s), for this long, it has stopped. */
const CALM_SPEED=.45,CALM_SECONDS=.5;
const SOLIDS_EVERY=4,SOLIDS_MARGIN=1.1;

export const JOINT={pelvis:0,chest:1,neck:2,head:3,shoulderL:4,elbowL:5,handL:6,shoulderR:7,elbowR:8,handR:9,hipL:10,kneeL:11,footL:12,hipR:13,kneeR:14,footR:15} as const;
const COUNT=16;
const J=JOINT;
/** How hard each point is to move (1 / mass, relative): the trunk carries the others. */
const WEIGHT=[.2,.2,.6,.7,.5,1,1.3,.5,1,1.3,.4,.7,1.2,.4,.7,1.2];
/** How thick the body is at each point. */
const RADIUS=[.13,.14,.08,.11,.08,.07,.07,.08,.07,.07,.09,.08,.07,.09,.08,.07];

type Vec=readonly [number,number,number];
/** Standing, in the body's own axes: feet on the floor at y 0, +X its left, +Z its front. It gives the lengths of every rod. */
const STANDING:readonly Vec[]=[
  [0,.97,0],[0,1.2,0],[0,1.44,0],[0,1.6,.01],
  [.19,1.4,0],[.22,1.12,0],[.24,.86,.02],[-.19,1.4,0],[-.22,1.12,0],[-.24,.86,.02],
  [.095,.9,0],[.1,.5,.01],[.11,.09,-.02],[-.095,.9,0],[-.1,.5,.01],[-.11,.09,-.02],
];
const add=(from:Vec,direction:Vec,length:number):Vec=>{
  const size=Math.hypot(...direction);
  return [from[0]+direction[0]/size*length,from[1]+direction[1]/size*length,from[2]+direction[2]/size*length];
};
/** Riding, in the bike's axes (its origin on the ground between the axles): the same rods, on the seat and reaching for the grips. */
const SEATED:readonly Vec[]=(()=>{
  const pelvis:Vec=[0,.74,-.19],chest=add(pelvis,[0,1,.25],.23),neck=add(chest,[0,1,.35],.24),head=add(neck,[0,1,.25],.16);
  const side=(sign:number)=>{
    const shoulder:Vec=[neck[0]+sign*.19,neck[1]-.04,neck[2]],elbow=add(shoulder,[sign*.25,-.6,.55],.28),hand=add(elbow,[sign*.25,-.05,.9],.26);
    const hip:Vec=[sign*.095,pelvis[1]-.07,pelvis[2]],knee=add(hip,[sign*.12,-.25,1],.4),foot=add(knee,[0,-1,-.25],.41);
    return {shoulder,elbow,hand,hip,knee,foot};
  };
  const l=side(1),r=side(-1);
  return [pelvis,chest,neck,head,l.shoulder,l.elbow,l.hand,r.shoulder,r.elbow,r.hand,l.hip,l.knee,l.foot,r.hip,r.knee,r.foot];
})();
const gap=(a:number,b:number)=>{const p=STANDING[a]!,q=STANDING[b]!;return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);};
/** The rods: a, b, shortest, longest, how firmly (1 is rigid). */
const RODS:ReadonlyArray<readonly [number,number,number,number,number]>=[
  ...([[J.pelvis,J.chest],[J.chest,J.neck],[J.neck,J.head],[J.neck,J.shoulderL],[J.neck,J.shoulderR],[J.shoulderL,J.shoulderR],[J.chest,J.shoulderL],[J.chest,J.shoulderR],
    [J.pelvis,J.hipL],[J.pelvis,J.hipR],[J.hipL,J.hipR],[J.shoulderL,J.elbowL],[J.elbowL,J.handL],[J.shoulderR,J.elbowR],[J.elbowR,J.handR],
    [J.hipL,J.kneeL],[J.kneeL,J.footL],[J.hipR,J.kneeR],[J.kneeR,J.footR]] as const).map(([a,b])=>[a,b,gap(a,b),gap(a,b),1] as const),
  // What keeps the trunk a trunk, bending only so far.
  [J.chest,J.hipL,gap(J.chest,J.hipL)*.85,gap(J.chest,J.hipL)*1.1,.6],[J.chest,J.hipR,gap(J.chest,J.hipR)*.85,gap(J.chest,J.hipR)*1.1,.6],
  [J.pelvis,J.shoulderL,.3,.56,.5],[J.pelvis,J.shoulderR,.3,.56,.5],
  [J.pelvis,J.neck,.33,.5,.8],[J.chest,J.head,.28,.42,.8],[J.head,J.shoulderL,.16,.32,.5],[J.head,J.shoulderR,.16,.32,.5],
  // How far a joint folds: an elbow, a knee, the thigh against the chest, one leg against the other.
  [J.shoulderL,J.handL,.13,.56,1],[J.shoulderR,J.handR,.13,.56,1],[J.hipL,J.footL,.2,.82,1],[J.hipR,J.footR,.2,.82,1],
  [J.kneeL,J.chest,.26,.9,.8],[J.kneeR,J.chest,.26,.9,.8],[J.kneeL,J.kneeR,.09,.85,.5],[J.footL,J.footR,.08,1.3,.3],
];

export interface RagdollStart {
  /** Where the body's origin is (a bike's, or the feet) and which way it faces (radians, 0 is +Z). */
  x:number;y:number;z:number;yaw:number;
  /** How it is moving on the ground (m/s). */
  vx:number;vz:number;
  /** How hard it was stopped: what is left in the body turns into going up and over (m/s). */
  closing:number;
  /** On a bike's seat, or on foot hit by one. */
  seated:boolean;
  seed:number;
  /** Kicked (kick.ts): how fast it goes up (m/s), and who did it. */
  lift?:number;by?:string;
}
/** What happens next, the same on every machine. */
const random=(seed:number)=>()=>{
  seed=(seed+0x6D2B79F5)|0;
  let t=Math.imul(seed^(seed>>>15),1|seed);
  t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return ((t^(t>>>14))>>>0)/4294967296;
};

/** A kick lands on the chest: the trunk leaves first, and this share of its speed is what the head and the feet lack, so the body folds around the blow. */
const KICK_FOLD=.4,KICK_LANDS=.25,KICK_FOLD_REACH=.6;
/** The points whose landing is heard: what carries the weight, and the head. */
const HEARD=new Set<number>([J.pelvis,J.chest,J.head,J.shoulderL,J.shoulderR,J.hipL,J.hipR]);

/** The sim itself: `points` holds x, y, z of each JOINT. */
export class Ragdoll {
  readonly points=new Float64Array(COUNT*3);
  private readonly before=new Float64Array(COUNT*3);
  private readonly pushed=new Float64Array(COUNT);
  /** Where each point would have gone with nothing in the way: how hard it hit comes from that. */
  private readonly free=new Float64Array(COUNT*3);
  private readonly normal=new Float64Array(COUNT*3);
  private spare=0;
  private solids:readonly Collider[]=[];
  private stepsDone=0;
  private calm=0;
  private loudest=0;
  private lowestEnergy=Infinity;
  private loudestAt=0;
  /** Seconds simulated. */
  time=0;
  asleep=false;

  constructor(start:RagdollStart) {
    const s=Math.sin(start.yaw),c=Math.cos(start.yaw),pose=start.seated?SEATED:STANDING,rand=random(start.seed);
    const pelvis=pose[J.pelvis]!,speed=Math.hypot(start.vx,start.vz),headOn=Math.min(1,start.closing/15);
    // Forward as it travels, and its side: the body turns over the side axis, feet held back and head going on.
    const fx=speed>.01?start.vx/speed:s,fz=speed>.01?start.vz/speed:c,tumble=(start.seated?5.5:3.5)*(.25+headOn),lift=start.lift||(start.seated?1.1+.26*start.closing:1.2+.1*speed);
    const sideways=(rand()-.5)*1.3+(start.seated?0:(rand()-.5)*.8),roll=(rand()-.5)*2.4,turn=(rand()-.5)*1.6;
    for(let i=0;i<COUNT;i++){
      const [lx,ly,lz]=pose[i]!,x=start.x+c*lx+s*lz,y=start.y+ly,z=start.z-s*lx+c*lz;
      const rx=c*(lx-pelvis[0])+s*(lz-pelvis[2]),ry=ly-pelvis[1],rz=-s*(lx-pelvis[0])+c*(lz-pelvis[2]);
      const along=rx*fx+rz*fz;
      const carried=start.lift?1-KICK_FOLD*Math.min(1,Math.abs(ry-KICK_LANDS)/KICK_FOLD_REACH):1;
      // Spinning over the side axis: higher goes further forward, further ahead goes down.
      const forward=ry*tumble,up=-along*tumble;
      const sx=-fz,sz=fx,across=rx*sx+rz*sz;
      const vx=start.vx*carried+fx*forward+sx*(sideways+ry*roll)+sx*along*turn;
      const vz=start.vz*carried+fz*forward+sz*(sideways+ry*roll)+sz*along*turn;
      const vy=lift*carried+up-across*roll;
      this.points.set([x,y,z],i*3);
      this.before.set([x-vx*RAGDOLL_STEP,y-vy*RAGDOLL_STEP,z-vz*RAGDOLL_STEP],i*3);
    }
  }
  /** Time passes: whole steps, the same ones everywhere. */
  advance(seconds:number):void {
    this.spare+=seconds;
    while(this.spare>=RAGDOLL_STEP){this.spare-=RAGDOLL_STEP;if(!this.asleep)this.step();}
  }
  /** One point. */
  joint(index:number):[number,number,number] {const p=this.points;return [p[index*3]!,p[index*3+1]!,p[index*3+2]!];}
  /** The hardest a heavy part hit something since the last time this was asked: how fast it was going (m/s) and which JOINT. It changes nothing in the sim. */
  takeBlow():{speed:number;joint:number}|undefined {
    const speed=this.loudest;
    this.loudest=0;
    return speed>0?{speed,joint:this.loudestAt}:undefined;
  }
  /** Where it lies: on the ground under the pelvis, with the way from the feet to the head along the ground (radians, 0 is +Z). */
  rest():{x:number;y:number;z:number;heading:number;faceUp:boolean} {
    const [x,y,z]=this.joint(J.pelvis),[hx,,hz]=this.joint(J.head),[lx,,lz]=this.joint(J.footL),[rx,,rz]=this.joint(J.footR);
    const front=this.front();
    return {x,z,y:groundBelow(x,z,y)??y,heading:Math.atan2(hx-(lx+rx)/2,hz-(lz+rz)/2),faceUp:front[1]>0};
  }
  /** Which way the chest faces. */
  private front():[number,number,number] {
    const p=this.points,ax=p[J.shoulderL*3]!-p[J.shoulderR*3]!,ay=p[J.shoulderL*3+1]!-p[J.shoulderR*3+1]!,az=p[J.shoulderL*3+2]!-p[J.shoulderR*3+2]!;
    const bx=p[J.neck*3]!-p[J.pelvis*3]!,by=p[J.neck*3+1]!-p[J.pelvis*3+1]!,bz=p[J.neck*3+2]!-p[J.pelvis*3+2]!;
    // Left × up is the front (+X × +Y = +Z).
    const fx=ay*bz-az*by,fy=az*bx-ax*bz,fz=ax*by-ay*bx,size=Math.hypot(fx,fy,fz)||1;
    return [fx/size,fy/size,fz/size];
  }
  private refreshSolids():void {
    const p=this.points;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let i=0;i<COUNT;i++){const x=p[i*3]!,z=p[i*3+2]!;if(x<minX)minX=x;if(x>maxX)maxX=x;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;}
    this.solids=solidsBetween(minX-SOLIDS_MARGIN,minZ-SOLIDS_MARGIN,maxX+SOLIDS_MARGIN,maxZ+SOLIDS_MARGIN);
  }
  private step():void {
    const {points:p,before:b,pushed,normal}=this;
    if(this.stepsDone++%SOLIDS_EVERY===0)this.refreshSolids();
    let fastest=0;
    for(let i=0;i<COUNT*3;i+=3){
      const vx=(p[i]!-b[i]!)*DAMPING,vy=(p[i+1]!-b[i+1]!)*DAMPING-GRAVITY*RAGDOLL_STEP*RAGDOLL_STEP,vz=(p[i+2]!-b[i+2]!)*DAMPING;
      b[i]=p[i]!;b[i+1]=p[i+1]!;b[i+2]=p[i+2]!;
      p[i]=p[i]!+vx;p[i+1]=p[i+1]!+vy;p[i+2]=p[i+2]!+vz;
      const moved=Math.hypot(vx,vy,vz);if(moved>fastest)fastest=moved;
    }
    pushed.fill(0);
    this.free.set(p);
    const front=this.front();
    for(let round=0;round<ITERATIONS;round++){
      for(const [a,c,shortest,longest,firm] of RODS)this.rod(a,c,shortest,longest,firm);
      this.hinge(J.hipL,J.kneeL,J.footL,front,1);this.hinge(J.hipR,J.kneeR,J.footR,front,1);
      this.hinge(J.shoulderL,J.elbowL,J.handL,front,-1);this.hinge(J.shoulderR,J.elbowR,J.handR,front,-1);
      for(let i=0;i<COUNT;i++)this.collide(i);
    }
    // Friction, once per step: Coulomb's, what the blow against the surface and the weight on it allow of the sideways motion.
    const {free}=this;
    for(let i=0;i<COUNT;i++){
      if(!pushed[i])continue;
      const at=i*3,nx=normal[at]!,ny=normal[at+1]!,nz=normal[at+2]!;
      const blow=Math.max(0,-((free[at]!-b[at]!)*nx+(free[at+1]!-b[at+1]!)*ny+(free[at+2]!-b[at+2]!)*nz));
      if(HEARD.has(i)&&blow/RAGDOLL_STEP>this.loudest){this.loudest=blow/RAGDOLL_STEP;this.loudestAt=i;}
      const dx=p[at]!-b[at]!,dy=p[at+1]!-b[at+1]!,dz=p[at+2]!-b[at+2]!,dn=dx*nx+dy*ny+dz*nz;
      const tx=dx-dn*nx,ty=dy-dn*ny,tz=dz-dn*nz,slide=Math.hypot(tx,ty,tz);
      if(slide<1e-9)continue;
      if(blow>BOUNCE_FROM){const back=blow*(ny>.5?BOUNCE:WALL_BOUNCE);b[at]=b[at]!-nx*back;b[at+1]=b[at+1]!-ny*back;b[at+2]=b[at+2]!-nz*back;}
      const stop=Math.min(1,ny>.5?FRICTION*(blow+GRAVITY*RAGDOLL_STEP*RAGDOLL_STEP)/slide:WALL_FRICTION*blow/slide);
      p[at]=p[at]!-tx*stop;p[at+1]=p[at+1]!-ty*stop;p[at+2]=p[at+2]!-tz*stop;
    }
    this.spendEnergy();
    this.time+=RAGDOLL_STEP;
    this.calm=fastest/RAGDOLL_STEP<CALM_SPEED?this.calm+RAGDOLL_STEP:0;
    if(this.calm>=CALM_SECONDS||this.time>=RAGDOLL_MAX_SECONDS)this.asleep=true;
  }
  /**
   * A body thrown only ever loses energy. This kind of sim takes every correction for speed, so a part pushed out of a solid would shoot the body up, and a foot
   * caught on the far side of a thin wall, pulled by the rods and pushed back by the wall, would run it along the wall faster and faster. What it gained goes.
   */
  private spendEnergy():void {
    const {points:p,before:b}=this;
    let moving=0,height=0,mass=0;
    for(let i=0;i<COUNT;i++){
      const at=i*3,weight=1/WEIGHT[i]!,dx=p[at]!-b[at]!,dy=p[at+1]!-b[at+1]!,dz=p[at+2]!-b[at+2]!;
      moving+=weight*(dx*dx+dy*dy+dz*dz)/2;height+=weight*p[at+1]!;mass+=weight;
    }
    // In metres and steps: gravity per step squared turns height into the same units as speed per step, squared.
    const gravity=GRAVITY*RAGDOLL_STEP*RAGDOLL_STEP,energy=moving+height*gravity,allowed=this.lowestEnergy+mass*gravity*ENERGY_DRIFT;
    if(energy>allowed){
      const scale=Math.sqrt(Math.max(0,moving-(energy-allowed))/(moving||1));
      for(let at=0;at<COUNT*3;at++)b[at]=p[at]!-(p[at]!-b[at]!)*scale;
    }
    if(energy<this.lowestEnergy)this.lowestEnergy=energy;
  }
  private rod(a:number,c:number,shortest:number,longest:number,firm:number):void {
    const p=this.points,ia=a*3,ic=c*3,dx=p[ic]!-p[ia]!,dy=p[ic+1]!-p[ia+1]!,dz=p[ic+2]!-p[ia+2]!,length=Math.hypot(dx,dy,dz);
    if(length<1e-6||(length>=shortest&&length<=longest))return;
    const wrong=(length-(length<shortest?shortest:longest))/length*firm,wa=WEIGHT[a]!,wc=WEIGHT[c]!,share=wrong/(wa+wc);
    p[ia]=p[ia]!+dx*share*wa;p[ia+1]=p[ia+1]!+dy*share*wa;p[ia+2]=p[ia+2]!+dz*share*wa;
    p[ic]=p[ic]!-dx*share*wc;p[ic+1]=p[ic+1]!-dy*share*wc;p[ic+2]=p[ic+2]!-dz*share*wc;
  }
  /** A knee only bends forward and an elbow only backward: pushes the middle joint to its own side of the limb's line. */
  private hinge(top:number,middle:number,end:number,front:readonly number[],sign:number):void {
    const p=this.points,t=top*3,m=middle*3,e=end*3;
    const off=((p[m]!-(p[t]!+p[e]!)/2)*front[0]!+(p[m+1]!-(p[t+1]!+p[e+1]!)/2)*front[1]!+(p[m+2]!-(p[t+2]!+p[e+2]!)/2)*front[2]!)*sign;
    if(off>=0)return;
    const push=-off*.4*sign;
    p[m]=p[m]!+front[0]!*push;p[m+1]=p[m+1]!+front[1]!*push;p[m+2]=p[m+2]!+front[2]!*push;
  }
  private collide(index:number):void {
    const p=this.points,at=index*3,radius=RADIUS[index]!;
    let x=p[at]!,y=p[at+1]!,z=p[at+2]!,total=this.pushed[index]!;
    const floor=groundBelow(x,z,y)??0;
    let nx=0,ny=0,nz=0;
    if(y-radius<floor){total+=floor+radius-y;y=floor+radius;ny=1;}
    if(x<WORLD.minX+radius){total+=WORLD.minX+radius-x;x=WORLD.minX+radius;nx=1;ny=0;}
    else if(x>WORLD.maxX-radius){total+=x-WORLD.maxX+radius;x=WORLD.maxX-radius;nx=-1;ny=0;}
    if(z<WORLD.minZ+radius){total+=WORLD.minZ+radius-z;z=WORLD.minZ+radius;nz=1;ny=0;}
    else if(z>WORLD.maxZ-radius){total+=z-WORLD.maxZ+radius;z=WORLD.maxZ-radius;nz=-1;ny=0;}
    for(const solid of this.solids){
      const out=ballOutOf(solid,x,y,z,radius);
      if(!out)continue;
      x+=out[0]*out[3];y+=out[1]*out[3];z+=out[2]*out[3];total+=out[3];nx=out[0];ny=out[1];nz=out[2];
    }
    p[at]=x;p[at+1]=y;p[at+2]=z;
    if(total>this.pushed[index]!){this.pushed[index]=total;this.normal[at]=nx;this.normal[at+1]=ny;this.normal[at+2]=nz;}
  }
}

const out:[number,number,number,number]=[0,0,0,0];
/** A ball inside a solid: the shortest way out (normal x, y, z and how far), or undefined. The result is reused by the next call. */
export function ballOutOf(solid:Collider,x:number,y:number,z:number,radius:number):readonly [number,number,number,number]|undefined {
  if(solid.ramp)return;
  const dx=x-solid.x,dz=z-solid.z;
  if(Math.abs(dx)>=solid.hx+radius||Math.abs(dz)>=solid.hz+radius)return;
  const top=solid.maxY===undefined?Infinity:solid.maxY+radius-y,bottom=solid.minY===undefined?Infinity:y+radius-solid.minY;
  if(top<=0||bottom<=0)return;
  const turn=solid.turn,lx=turn?dx*turn.ux+dz*turn.uz:dx,lz=turn?dz*turn.ux-dx*turn.uz:dz,hx=turn?turn.lx:solid.hx,hz=turn?turn.lz:solid.hz;
  const inX=hx+radius-Math.abs(lx),inZ=hz+radius-Math.abs(lz);
  if(inX<=0||inZ<=0)return;
  const least=Math.min(inX,inZ,top,bottom);
  if(least===top){out[0]=0;out[1]=1;out[2]=0;out[3]=top;return out;}
  if(least===bottom){out[0]=0;out[1]=-1;out[2]=0;out[3]=bottom;return out;}
  const sign=(least===inX?lx:lz)<0?-1:1;
  if(least===inX){out[0]=turn?turn.ux*sign:sign;out[1]=0;out[2]=turn?turn.uz*sign:0;out[3]=inX;}
  else{out[0]=turn?-turn.uz*sign:0;out[1]=0;out[2]=turn?turn.ux*sign:sign;out[3]=inZ;}
  return out;
}
