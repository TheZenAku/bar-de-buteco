import {CUSHIONS,HALF_LENGTH as HL,HALF_WIDTH as HW,POCKETS,POOL_TABLE,type PoolBallSpot,type PoolCushion} from './table.js';

/**
 * The balls' physics, run by the room alone (the browsers draw what it recorded): fixed 1 ms steps, whatever the frame
 * rate. Within a step, every contact happens at its exact time (ball against ball and against a cushion, solved from the
 * motion), so nothing goes through anything and racked balls pass the break on one after the other. Each ball slides and
 * then rolls (felt friction on the contact point, Coriolis-free rigid sphere: the slip slows at 7/2 μg), so a stun shot
 * stops, a draw shot comes back and a follow shot goes on after the object ball; side spin dies slowly, changes the
 * angle off a cushion (running and check side) and throws the object ball a little, as does a cut (friction between
 * the balls). An elevated cue makes the cue ball hop: in the air it passes over balls and, high enough, over a cushion
 * and off the table. The stick's follow-through is tracked to catch a double hit.
 */
export const POOL_PHYSICS={
  gravity:9.81,
  /** Felt: sliding friction, rolling resistance, and how fast side spin dies (rad/s²). */
  slide:.2,roll:.012,spinDecel:10,
  /** Ball on ball: restitution and friction (cut-induced and spin-induced throw). */
  ballRestitution:.94,ballFriction:.06,
  /** Cushions: restitution, lower for harder hits (per m/s), never under the minimum, and their friction. */
  cushionRestitution:.88,cushionLoss:.035,cushionMin:.6,cushionFriction:.2,
  /** A hopping ball off the slate, and the heights (of the ball's bottom) over which it clears a cushion or a pocket. */
  tableRestitution:.5,railHeight:.025,pocketHeight:.03,
  /** The stroke: cue-ball speed from the softest touch to the hardest break, how far off centre the tip may strike (of the
   *  radius), the squirt (side spin pushes the cue ball off the aim, rad per full side) and the highest cue. */
  minSpeed:.25,maxSpeed:7.2,maxOffset:.5,squirt:.022,maxElevation:60,
  /** The stick after the strike: its follow-through (m, at power 0 and 1), its tip speed (of the cue ball's), its radius and
   *  length (a ball under it is touched). */
  follow:[.02,.12] as const,stickSpeed:.44,stickRadius:.0065,stickLength:1.45,
  stepMs:1,sampleMs:1000/30,maxMs:40_000,
} as const;

/** Aim and stroke: the direction (rad, table frame), the power (0–1), the tip's offset on the ball's face (spinX right +,
 *  spinY top +, each -1–1 of the most allowed) and the cue's elevation (degrees). */
export interface PoolStroke {angle:number;power:number;spinX:number;spinY:number;elevation:number}
export const CENTRE_STROKE:Omit<PoolStroke,'angle'|'power'>={spinX:0,spinY:0,elevation:0};

/** Ball states: 0 on the table, 1 in a pocket, 2 off the table. */
interface SimBall {n:number;x:number;y:number;vx:number;vy:number;wx:number;wy:number;wz:number;z:number;vz:number;state:0|1|2;pocket:number;moving:boolean;
  cushioned:boolean;track?:{t:number[];x:number[];y:number[];lt:number;lx:number;ly:number}}
/** One ball's path as recorded: times (ms), x and y (tenths of a millimetre), and how it ended. */
export interface PoolTrack {n:number;t:number[];x:number[];y:number[];end:'stop'|'pocket'|'off';pocket:number}
/** What happened, in order, for the sounds: [t ms, kind, speed in cm/s] — kinds: 0 ball, 1 cushion, 2 pocket, 3 strike, 4 slate. */
export type PoolSoundKind=0|1|2|3|4;
export interface PoolShotOutcome {
  /** The first ball the cue ball touched (-1: none), and every ball it touched in that same instant. */
  firstHit:number;firstHits:number[];
  pocketed:Array<{n:number;pocket:number;t:number}>;
  offTable:number[];
  /** Every ball (the cue ball too) that touched a cushion, in a pocket's jaws included. */
  cushioned:number[];
  /** The cue ball went over another ball in the air. */
  jumpedOver:boolean;
  /** The stick's tip met the cue ball again (bi-toque). */
  doubleHit:boolean;
  /** Balls the stick itself touched (under the stroke's line, too low to pass over). */
  touched:number[];
  duration:number;
  /** Where every ball on the table ended (pocketed and off-table ones left out). */
  balls:PoolBallSpot[];
  tracks?:PoolTrack[];sounds?:number[];
}

const P=POOL_PHYSICS,R=POOL_TABLE.ballRadius,D=2*R,G=P.gravity;
const clamp=(v:number,lo:number,hi:number)=>v<lo?lo:v>hi?hi:v;
const deg=Math.PI/180;
/** Contacts this close in time (s) happen together. */
const SAME_TIME=1e-6;
const CUSHION_DATA=CUSHIONS.map((c:PoolCushion)=>{const dx=c.bx-c.ax,dy=c.by-c.ay,len=Math.hypot(dx,dy);return {...c,ux:dx/len,uy:dy/len,len};});

/** The cue ball's speed for a power. */
export const strokeSpeed=(power:number)=>P.minSpeed+clamp(power,0,1)*(P.maxSpeed-P.minSpeed);

/**
 * Balls the stick touches: under its line behind the cue ball (up to its length), too low to pass over them. The cue's
 * height grows with its elevation from where the tip meets the ball (raised by a top offset).
 */
export function stickTouches(balls:readonly PoolBallSpot[],stroke:PoolStroke):number[] {
  const cue=balls.find(b=>b.n===0);if(!cue)return [];
  const fx=Math.cos(stroke.angle),fy=Math.sin(stroke.angle),tilt=Math.tan(clamp(stroke.elevation,0,P.maxElevation)*deg);
  const tip=R+clamp(stroke.spinY,-1,1)*P.maxOffset*R,out:number[]=[];
  for(const b of balls){
    if(b.n===0)continue;
    const rx=b.x-cue.x,ry=b.y-cue.y,behind=-(rx*fx+ry*fy),side=Math.abs(-rx*fy+ry*fx);
    if(behind<R||behind>P.stickLength)continue;
    // The stick grows thicker towards the butt; it passes over a ball once its underside clears the ball's top.
    const radius=P.stickRadius+behind*.006,under=tip+(behind-R)*tilt-radius;
    if(side<R+radius&&under<D)out.push(b.n);
  }
  return out;
}

/** The cue ball struck: speed, squirt, spin from the tip's offset, and a hop when the cue comes down on it. */
function strike(cue:SimBall,stroke:PoolStroke):void {
  const v0=strokeSpeed(stroke.power),elev=clamp(stroke.elevation,0,P.maxElevation)*deg,sx=clamp(stroke.spinX,-1,1),sy=clamp(stroke.spinY,-1,1);
  // Side spin pushes the cue ball a little off the aim, to the other side (squirt).
  const angle=stroke.angle+P.squirt*sx,fx=Math.cos(angle),fy=Math.sin(angle),vh=v0*Math.cos(elev);
  cue.vx=vh*fx;cue.vy=vh*fy;
  // Off-centre by b (above +) and a (right +): ω = 5·v·offset / 2R² about the matching axis.
  const a=sx*P.maxOffset*R,b=sy*P.maxOffset*R,top=5*vh*b/(2*R*R);
  cue.wx=-fy*top;cue.wy=fx*top;cue.wz=-5*vh*a/(2*R*R);
  const hop=elev>0?P.tableRestitution*v0*Math.sin(elev):0;
  cue.vz=hop>.15?hop:0;
  cue.moving=true;
}

/** When a moving circle of radius `r` around p (velocity v) first touches the point c, within `limit`; Infinity if not. */
function circlePoint(px:number,py:number,vx:number,vy:number,cx:number,cy:number,r:number,limit:number):number {
  const dx=px-cx,dy=py-cy,a=vx*vx+vy*vy;
  if(a<1e-14)return Infinity;
  const b=dx*vx+dy*vy;
  // Closing at a few nanometres a second is rounding between balls that roll together, not a contact.
  if(b>=-1e-9)return Infinity;
  const c=dx*dx+dy*dy-r*r;
  if(c<=0)return 0;
  const disc=b*b-a*c;
  if(disc<0)return Infinity;
  const t=(-b-Math.sqrt(disc))/a;
  return t<=limit?Math.max(0,t):Infinity;
}

interface Contact {t:number;i:number;j:number;nx:number;ny:number}

export interface SimulateOptions {record?:boolean;maxMs?:number}

/**
 * Plays a stroke from a still table to its end (every ball still, pocketed or off). `balls` are where they stand (the cue
 * ball is n 0). With `record`, every moving ball's path is kept (30 samples a second and one at each contact) with the
 * sounds, for the browsers to draw.
 */
export function simulateShot(spots:readonly PoolBallSpot[],stroke:PoolStroke,options:SimulateOptions={}):PoolShotOutcome {
  const record=!!options.record,maxMs=options.maxMs??P.maxMs,h=P.stepMs/1000;
  const balls:SimBall[]=spots.map(s=>({n:s.n,x:s.x,y:s.y,vx:0,vy:0,wx:0,wy:0,wz:0,z:0,vz:0,state:0,pocket:-1,moving:false,cushioned:false,
    ...(record?{track:{t:[],x:[],y:[],lt:-1,lx:s.x,ly:s.y}}:{})}));
  const cue=balls.find(b=>b.n===0);
  const out:PoolShotOutcome={firstHit:-1,firstHits:[],pocketed:[],offTable:[],cushioned:[],jumpedOver:false,doubleHit:false,touched:stickTouches(spots,stroke),duration:0,balls:[]};
  const sounds:number[]=[];
  const sound=(t:number,kind:PoolSoundKind,speed:number)=>{if(record&&sounds.length<900&&speed>.02)sounds.push(Math.round(t),kind,Math.round(speed*100));};
  const sample=(b:SimBall,t:number,force=false)=>{
    const tr=b.track;if(!tr)return;
    if(!force&&Math.abs(b.x-tr.lx)<2e-5&&Math.abs(b.y-tr.ly)<2e-5)return;
    // A ball that sat still until now starts its path where it was.
    if(!tr.t.length&&t>0){tr.t.push(0);tr.x.push(Math.round(tr.lx*1e4));tr.y.push(Math.round(tr.ly*1e4));}
    const ms=Math.round(t);
    if(tr.t.length&&tr.t[tr.t.length-1]===ms){tr.x[tr.x.length-1]=Math.round(b.x*1e4);tr.y[tr.y.length-1]=Math.round(b.y*1e4);}
    else{tr.t.push(ms);tr.x.push(Math.round(b.x*1e4));tr.y.push(Math.round(b.y*1e4));}
    tr.lt=t;tr.lx=b.x;tr.ly=b.y;
  };
  if(!cue)return {...out,balls:spots.map(s=>({...s}))};
  strike(cue,stroke);
  sound(0,3,Math.hypot(cue.vx,cue.vy));
  if(record)sample(cue,0,true);
  const cueStart={x:cue.x,y:cue.y},fx=Math.cos(stroke.angle),fy=Math.sin(stroke.angle);
  const v0=strokeSpeed(stroke.power),tipSpeed=v0*P.stickSpeed,follow=P.follow[0]+(P.follow[1]-P.follow[0])*clamp(stroke.power,0,1),followMs=follow/Math.max(.01,tipSpeed)*1000;

  let time=0,nextSample=P.sampleMs;
  const touch=(b:SimBall)=>{if(!b.cushioned){b.cushioned=true;out.cushioned.push(b.n);}};

  /** The earliest contacts among moving balls within `limit` seconds: every one within a microsecond of the first. */
  function earliest(limit:number):Contact[] {
    const found:Contact[]=[];
    let best:Contact|undefined;
    const keep=(c:Contact)=>{found.push(c);if(c.t<(best?.t??Infinity))best=c;};
    for(let i=0;i<balls.length;i++){
      const a=balls[i]!;
      if(a.state!==0||!a.moving)continue;
      const speed=Math.hypot(a.vx,a.vy);
      for(let j=0;j<balls.length;j++){
        if(j===i)continue;
        const b=balls[j]!;
        if(b.state!==0||(b.moving&&j<i))continue;
        // A ball in the air passes over one on the cloth (and the other way round).
        if(Math.abs(a.z-b.z)>=R)continue;
        const dx=b.x-a.x,dy=b.y-a.y,reach=D+(speed+Math.hypot(b.vx,b.vy))*limit+1e-6;
        if(dx*dx+dy*dy>reach*reach)continue;
        const t=circlePoint(a.x,a.y,a.vx-b.vx,a.vy-b.vy,b.x,b.y,D,limit);
        if(t<=(best?.t??Infinity)+SAME_TIME){
          const px=a.x+a.vx*t,py=a.y+a.vy*t,qx=b.x+b.vx*t,qy=b.y+b.vy*t,d=Math.hypot(qx-px,qy-py)||1;
          keep({t,i,j,nx:(qx-px)/d,ny:(qy-py)/d});
        }
      }
      // High in the air, it flies over the cushions.
      if(a.z>P.railHeight)continue;
      // Cushions only near the rails (most of the table is far from all of them).
      if(Math.abs(a.x)<HL-R-speed*limit-.002&&Math.abs(a.y)<HW-R-speed*limit-.002)continue;
      for(const c of CUSHION_DATA){
        // Along the piece: the nose line, from the side the ball is on.
        let nx=-c.uy,ny=c.ux,d0=(a.x-c.ax)*nx+(a.y-c.ay)*ny;
        if(d0<0){nx=-nx;ny=-ny;d0=-d0;}
        const vn=a.vx*nx+a.vy*ny;
        if(vn<-1e-8){
          const t=d0<=R?0:(d0-R)/-vn;
          if(t<=limit&&t<=(best?.t??Infinity)+SAME_TIME){
            const s=(a.x+a.vx*t-c.ax)*c.ux+(a.y+a.vy*t-c.ay)*c.uy;
            if(s>=0&&s<=c.len&&!(d0<R-.004))keep({t,i,j:-1,nx:-nx,ny:-ny});
          }
        }
        // Its ends: the points of the jaws.
        for(const [ex,ey] of [[c.ax,c.ay],[c.bx,c.by]] as const){
          const t=circlePoint(a.x,a.y,a.vx,a.vy,ex,ey,R,limit);
          if(t<=(best?.t??Infinity)+SAME_TIME){const px=a.x+a.vx*t,py=a.y+a.vy*t,d=Math.hypot(ex-px,ey-py)||1;keep({t,i,j:-1,nx:(ex-px)/d,ny:(ey-py)/d});}
        }
      }
    }
    return best?found.filter(c=>c.t<=best!.t+SAME_TIME).map(c=>({...c,t:best!.t})):[];
  }
  /** A safety net after a step crowded past its contact budget: balls pushed apart, their closing speed taken away. */
  function separate():void {
    for(const a of balls)for(const b of balls){
      if(a.n>=b.n||a.state!==0||b.state!==0||Math.abs(a.z-b.z)>=R)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d>=D||d<1e-12)continue;
      const nx=dx/d,ny=dy/d,push=(D-d)/2+1e-7,vn=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
      a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
      if(vn>0){a.vx-=vn/2*nx;a.vy-=vn/2*ny;b.vx+=vn/2*nx;b.vy+=vn/2*ny;}
    }
  }
  function advance(dt:number):void {for(const b of balls)if(b.state===0&&b.moving){b.x+=b.vx*dt;b.y+=b.vy*dt;}}
  /**
   * The contacts of one instant, together: a cue ball meeting two balls at once splits evenly between them, as it does on
   * a table, instead of meeting one and then the other. The normal impulses are solved jointly (projected Gauss–Seidel
   * towards each contact's restitution); then each contact's friction (throw between balls, spin off a cushion).
   */
  function resolve(contacts:readonly Contact[],t:number):void {
    type Row={a:SimBall;b?:SimBall;nx:number;ny:number;approach:number;target:number;acc:number};
    const rows:Row[]=[],paired=new Set<string>();
    // n from a to b (ball on ball) or from the cushion into the table.
    const row=(a:SimBall,b:SimBall|undefined,nx:number,ny:number,key:string)=>{
      if(paired.has(key))return;
      paired.add(key);
      const approach=b?(a.vx-b.vx)*nx+(a.vy-b.vy)*ny:-(a.vx*nx+a.vy*ny);
      // A creeping contact (balls pressed together, a ball pinned on a cushion) does not bounce: no chattering.
      const e=approach<.01?0:b?P.ballRestitution:clamp(P.cushionRestitution-P.cushionLoss*approach,P.cushionMin,P.cushionRestitution);
      // At least a hair of separation, so the same contact is not found again in the same instant.
      rows.push({a,b,nx,ny,approach,target:approach>0?Math.max(1e-5,approach*e):0,acc:0});
    };
    const cluster:SimBall[]=[];
    for(const c of contacts){
      const a=balls[c.i]!,b=c.j>=0?balls[c.j]!:undefined;
      if(b)row(a,b,c.nx,c.ny,a.n<b.n?`${a.n}:${b.n}`:`${b.n}:${a.n}`);else row(a,undefined,-c.nx,-c.ny,`${a.n}:c${c.nx.toFixed(6)},${c.ny.toFixed(6)}`);
      for(const x of [a,b])if(x&&!cluster.includes(x))cluster.push(x);
    }
    // Everything already touching the balls involved joins in: a pressed cluster (against a cushion, in the rack) is
    // solved at once, instead of passing impulses back and forth one contact at a time.
    for(let k=0;k<cluster.length&&cluster.length<balls.length;k++){
      const a=cluster[k]!;
      for(const b of balls){
        if(b===a||b.state!==0||Math.abs(a.z-b.z)>=R)continue;
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
        if(d>D+1e-6||d<1e-12)continue;
        if(a.n<b.n)row(a,b,dx/d,dy/d,`${a.n}:${b.n}`);else row(b,a,-dx/d,-dy/d,`${b.n}:${a.n}`);
        if(!cluster.includes(b))cluster.push(b);
      }
      if(a.z>P.railHeight||(Math.abs(a.x)<HL-R-.001&&Math.abs(a.y)<HW-R-.001))continue;
      for(const c of CUSHION_DATA){
        const s=clamp((a.x-c.ax)*c.ux+(a.y-c.ay)*c.uy,0,c.len),px=c.ax+c.ux*s,py=c.ay+c.uy*s,dx=a.x-px,dy=a.y-py,d=Math.hypot(dx,dy);
        if(d<=R+1e-6&&d>1e-12)row(a,undefined,dx/d,dy/d,`${a.n}:c${(dx/d).toFixed(6)},${(dy/d).toFixed(6)}`);
      }
    }
    for(let k=0;k<(rows.length>1?40:1);k++)for(const r of rows){
      const sep=r.b?(r.b.vx-r.a.vx)*r.nx+(r.b.vy-r.a.vy)*r.ny:r.a.vx*r.nx+r.a.vy*r.ny;
      const next=Math.max(0,r.acc+(r.target-sep)/(r.b?2:1)),d=next-r.acc;r.acc=next;
      if(r.b){r.a.vx-=d*r.nx;r.a.vy-=d*r.ny;r.b.vx+=d*r.nx;r.b.vy+=d*r.ny;}else{r.a.vx+=d*r.nx;r.a.vy+=d*r.ny;}
    }
    const cueHits:number[]=[];
    for(const r of rows){
      const {a,b,nx,ny,acc:jn}=r,tx=-ny,ty=nx;
      if(jn<=0)continue;
      if(b){
        // Ball on ball: friction between them throws the object ball and trades side spin.
        const ut=(a.vx-b.vx)*tx+(a.vy-b.vy)*ty+R*(a.wz+b.wz),cap=P.ballFriction*jn,jt=clamp(ut/7,-cap,cap);
        a.vx-=jt*tx;a.vy-=jt*ty;b.vx+=jt*tx;b.vy+=jt*ty;a.wz-=2.5*jt/R;b.wz-=2.5*jt/R;
        a.moving=b.moving=true;
        if(a.n===0)cueHits.push(b.n);else if(b.n===0)cueHits.push(a.n);
        sound(t,0,r.approach);
      }else{
        // Cushion: friction at the nose turns side spin into the angle out (running and check side).
        const ut=a.vx*tx+a.vy*ty-R*a.wz,cap=P.cushionFriction*jn,jt=clamp(2*ut/7,-cap,cap);
        a.vx-=jt*tx;a.vy-=jt*ty;a.wz+=2.5*jt/R;
        // The nose above the centre takes some of the roll.
        a.wx*=.8;a.wy*=.8;
        touch(a);sound(t,1,r.approach);
      }
    }
    if(cueHits.length&&out.firstHit<0){out.firstHit=cueHits[0]!;out.firstHits=cueHits;}
  }
  /** The cloth: sliding until the contact point stops, then rolling; side spin dies on its own. A ball in the air flies. */
  function friction(b:SimBall,dt:number,t:number):void {
    if(b.z>0||b.vz>0){
      b.z+=b.vz*dt;b.vz-=G*dt;
      if(b.z<=0){b.z=0;const down=-b.vz;b.vz=down*P.tableRestitution;if(b.vz<.12)b.vz=0;sound(t,4,down);}
      return;
    }
    const ux=b.vx-R*b.wy,uy=b.vy+R*b.wx,us=Math.hypot(ux,uy);
    if(us>1e-4){
      const decel=P.slide*G,fraction=Math.min(1,us/(3.5*decel*dt)),ax=-decel*ux/us*fraction,ay=-decel*uy/us*fraction;
      b.vx+=ax*dt;b.vy+=ay*dt;b.wx+=2.5/R*ay*dt;b.wy-=2.5/R*ax*dt;
      if(fraction<1){b.wx=-b.vy/R;b.wy=b.vx/R;}
    }else{
      const s=Math.hypot(b.vx,b.vy),ds=P.roll*G*dt;
      if(s<=ds){b.vx=0;b.vy=0;}else{b.vx*=(s-ds)/s;b.vy*=(s-ds)/s;}
      b.wx=-b.vy/R;b.wy=b.vx/R;
    }
    const spin=P.spinDecel*dt;
    b.wz=Math.abs(b.wz)<=spin?0:b.wz-Math.sign(b.wz)*spin;
    if(Math.abs(b.vx)+Math.abs(b.vy)<1e-4&&Math.hypot(b.vx-R*b.wy,b.vy+R*b.wx)<1e-4){b.vx=b.vy=b.wx=b.wy=b.wz=0;b.moving=false;}
  }
  function holeOrOff(b:SimBall,t:number):void {
    for(const p of POCKETS){
      if(b.z<P.pocketHeight&&Math.hypot(b.x-p.x,b.y-p.y)<p.drop){
        b.state=1;b.pocket=p.index;b.moving=false;
        sample(b,t,true);out.pocketed.push({n:b.n,pocket:p.index,t:Math.round(t)});sound(t,2,Math.hypot(b.vx,b.vy));
        b.vx=b.vy=b.vz=b.wx=b.wy=b.wz=0;return;
      }
    }
    if(Math.abs(b.x)>HL+R*.5||Math.abs(b.y)>HW+R*.5){
      if(b.z>P.railHeight){b.state=2;b.moving=false;sample(b,t,true);out.offTable.push(b.n);b.vx=b.vy=b.vz=0;return;}
      // On the cloth past the cushions' line: through a pocket's mouth, into the nearest pocket.
      let near=POCKETS[0]!;for(const p of POCKETS)if(Math.hypot(b.x-p.x,b.y-p.y)<Math.hypot(b.x-near.x,b.y-near.y))near=p;
      b.state=1;b.pocket=near.index;b.moving=false;sample(b,t,true);out.pocketed.push({n:b.n,pocket:near.index,t:Math.round(t)});
      sound(t,2,Math.hypot(b.vx,b.vy));b.vx=b.vy=b.vz=0;
    }
  }

  while(time<maxMs){
    let left=h,guard=0;
    while(left>1e-12&&guard++<200){
      const hits=earliest(left);
      if(!hits.length){advance(left);left=0;break;}
      advance(hits[0]!.t);left-=hits[0]!.t;
      const at=time+(h-left)*1000;
      for(const hit of hits){sample(balls[hit.i]!,at,true);if(hit.j>=0)sample(balls[hit.j]!,at,true);}
      resolve(hits,at);
    }
    if(left>0){advance(left);separate();}
    time+=P.stepMs;
    for(const b of balls)if(b.state===0&&b.moving){friction(b,h,time);holeOrOff(b,time);}
    // In the air over another ball: the jump the rules call a foul.
    if(cue&&cue.state===0&&cue.z>0)for(const b of balls)if(b!==cue&&b.state===0&&Math.abs(cue.z-b.z)>=R&&Math.hypot(cue.x-b.x,cue.y-b.y)<D)out.jumpedOver=true;
    // The stick's follow-through catching the cue ball again (a cue ball that stopped dead on a close ball).
    if(cue&&!out.doubleHit&&time>2&&time<=followMs&&cue.state===0){
      const along=(cue.x-cueStart.x)*fx+(cue.y-cueStart.y)*fy,side=Math.abs(-(cue.x-cueStart.x)*fy+(cue.y-cueStart.y)*fx);
      if(along-R<=-R+tipSpeed*time/1000&&side<R*.8)out.doubleHit=true;
    }
    if(time>=nextSample){nextSample+=P.sampleMs;for(const b of balls)if(b.state===0)sample(b,time);}
    if(!balls.some(b=>b.state===0&&b.moving))break;
  }
  for(const b of balls)if(b.state===0){b.moving=false;sample(b,time);}
  out.duration=Math.round(time);
  out.balls=balls.filter(b=>b.state===0).map(b=>({n:b.n,x:b.x,y:b.y}));
  if(record){
    out.tracks=balls.filter(b=>b.track&&b.track.t.length).map(b=>({n:b.n,t:b.track!.t,x:b.track!.x,y:b.track!.y,end:b.state===1?'pocket':b.state===2?'off':'stop',pocket:b.pocket}));
    out.sounds=sounds;
  }
  return out;
}
