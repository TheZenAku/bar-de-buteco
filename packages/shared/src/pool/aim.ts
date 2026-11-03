import {CUSHIONS,POCKETS,POOL_TABLE,type PoolBallSpot} from './table.js';

const R=POOL_TABLE.ballRadius,D=2*R;
const SEGMENTS=CUSHIONS.map(c=>{const dx=c.bx-c.ax,dy=c.by-c.ay,len=Math.hypot(dx,dy);return {...c,ux:dx/len,uy:dy/len,len};});

/** How far along a ray (from p, unit direction d) a circle of radius `r` around it first touches the point c. */
function rayCircle(px:number,py:number,dx:number,dy:number,cx:number,cy:number,r:number):number {
  const ox=px-cx,oy=py-cy,b=ox*dx+oy*dy,c=ox*ox+oy*oy-r*r;
  if(c<0)return b<0?0:Infinity;
  const disc=b*b-c;
  if(disc<0)return Infinity;
  const s=-b-Math.sqrt(disc);
  return s>=0?s:Infinity;
}

export interface RayHit {s:number;ball?:number;nx:number;ny:number}
/** What a ball sent from p along d meets first: another ball (its number) or a cushion, with the contact's normal. */
export function castBall(balls:readonly PoolBallSpot[],px:number,py:number,dx:number,dy:number,except:number):RayHit|undefined {
  let best:RayHit|undefined;
  for(const b of balls){
    if(b.n===except)continue;
    const s=rayCircle(px,py,dx,dy,b.x,b.y,D);
    if(s<(best?.s??Infinity)){const gx=px+dx*s,gy=py+dy*s;best={s,ball:b.n,nx:(b.x-gx)/D,ny:(b.y-gy)/D};}
  }
  for(const c of SEGMENTS){
    let nx=-c.uy,ny=c.ux,d0=(px-c.ax)*nx+(py-c.ay)*ny;
    if(d0<0){nx=-nx;ny=-ny;d0=-d0;}
    const vn=dx*nx+dy*ny;
    if(vn<0&&d0>=R){
      const s=(d0-R)/-vn,along=(px+dx*s-c.ax)*c.ux+(py+dy*s-c.ay)*c.uy;
      if(along>=0&&along<=c.len&&s<(best?.s??Infinity))best={s,nx:-nx,ny:-ny};
    }
    for(const [ex,ey] of [[c.ax,c.ay],[c.bx,c.by]] as const){
      const s=rayCircle(px,py,dx,dy,ex,ey,R);
      if(s<(best?.s??Infinity)){const gx=px+dx*s,gy=py+dy*s,d=Math.hypot(ex-gx,ey-gy)||1;best={s,nx:(ex-gx)/d,ny:(ey-gy)/d};}
    }
  }
  return best;
}
/** Whether a ball centre crossing from p along d for `s` metres passes over a pocket (it would drop there). */
export function pocketOnRay(px:number,py:number,dx:number,dy:number,s:number):number {
  for(const p of POCKETS){
    const t=Math.max(0,Math.min(s,(p.x-px)*dx+(p.y-py)*dy)),cx=px+dx*t,cy=py+dy*t;
    if(Math.hypot(cx-p.x,cy-p.y)<p.drop)return p.index;
  }
  return -1;
}

/**
 * The aiming guide: the cue ball's path from where it stands to the first ball it meets (the ghost ball there), or off
 * the cushions (up to `bounces` of them, as a straight reflection); at the ball, where the object ball goes (the line of
 * centres) and where the cue ball heads off to (the tangent line, a stun shot's: follow and draw bend it later). A path
 * that runs into a pocket stops there (`pocket`).
 */
export interface PoolAimGuide {path:Array<{x:number;y:number}>;ball:number;ghost?:{x:number;y:number};object?:{x:number;y:number};cueAfter?:{x:number;y:number};pocket:number}
export function aimGuide(balls:readonly PoolBallSpot[],angle:number,bounces=1):PoolAimGuide|undefined {
  const cue=balls.find(b=>b.n===0);if(!cue)return;
  let px=cue.x,py=cue.y,dx=Math.cos(angle),dy=Math.sin(angle);
  const path=[{x:px,y:py}];
  for(let k=0;k<=bounces;k++){
    const hit=castBall(balls,px,py,dx,dy,0);
    // Nothing met: straight between the jaws, into a pocket.
    const pocket=pocketOnRay(px,py,dx,dy,hit?.s??3);
    if(pocket>=0){const p=POCKETS[pocket]!,t=(p.x-px)*dx+(p.y-py)*dy;path.push({x:px+dx*t,y:py+dy*t});return {path,ball:-1,pocket};}
    if(!hit)return {path,ball:-1,pocket:-1};
    const gx=px+dx*hit.s,gy=py+dy*hit.s;
    path.push({x:gx,y:gy});
    if(hit.ball!==undefined){
      // The object ball leaves along the line of centres; the cue ball along the tangent (90° off it), if it keeps going.
      const along=dx*hit.nx+dy*hit.ny,tx=dx-along*hit.nx,ty=dy-along*hit.ny,tl=Math.hypot(tx,ty);
      return {path,ball:hit.ball,ghost:{x:gx,y:gy},object:{x:hit.nx,y:hit.ny},...(tl>.02?{cueAfter:{x:tx/tl,y:ty/tl}}:{}),pocket:-1};
    }
    const dot=dx*hit.nx+dy*hit.ny;
    dx-=2*dot*hit.nx;dy-=2*dot*hit.ny;px=gx;py=gy;
  }
  return {path,ball:-1,pocket:-1};
}

/** Whether a ball's straight path from a to b is clear of every other ball (none closer than two radii to it). */
export function clearPath(balls:readonly PoolBallSpot[],ax:number,ay:number,bx:number,by:number,ignore:readonly number[]):boolean {
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
  if(len<1e-9)return true;
  const ux=dx/len,uy=dy/len;
  for(const b of balls){
    if(ignore.includes(b.n))continue;
    const t=(b.x-ax)*ux+(b.y-ay)*uy;
    if(t<-R||t>len+R)continue;
    const cx=ax+ux*Math.max(0,Math.min(len,t)),cy=ay+uy*Math.max(0,Math.min(len,t));
    if(Math.hypot(b.x-cx,b.y-cy)<D-1e-4)return false;
  }
  return true;
}
