import {CUSHIONS,FOOT_SPOT,HALF_LENGTH as HL,HALF_WIDTH as HW,HEAD_SPOT,HEAD_STRING,POCKETS,POOL_TABLE,type PoolAimGuide,type PoolBallSpot} from '@bar/shared';

const R=POOL_TABLE.ballRadius;
/** The rails around the cloth: the cushions' rubber, then the wood (metres beyond the noses). */
const CUSHION=.032,RAIL=.12,EXT_X=HL+RAIL+.02,EXT_Y=HW+RAIL+.02;
/** The visible pockets (the holes in the rails, as on P_Sinuca). */
const HOLES=POCKETS.map(p=>({index:p.index,x:p.side?0:Math.sign(p.x)*(HL+.028),y:Math.sign(p.y)*(HW+(p.side?.042:.028)),r:p.side?.047:.054}));
/** Bar ball colours: 1 yellow, 2 blue, 3 red, 4 purple, 5 orange, 6 green, 7 maroon, 8 black; 9–15 the same as stripes. */
const COLOURS=['#f4f1e8','#f2c21b','#1f5fd0','#d8262e','#5b2a9c','#f07a17','#13854d','#8c1f24','#141016'];
const colourOf=(n:number)=>COLOURS[n===0?0:n===8?8:n>8?n-8:n]!;
const rgb=(hex:string)=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)] as const;

/** A ball's turn in space, as a quaternion [w, x, y, z] in the table's frame (z up from the cloth). */
type Quat=[number,number,number,number];
const qmul=(a:Quat,b:Quat):Quat=>[a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
const qaxis=(x:number,y:number,z:number,angle:number):Quat=>{const s=Math.sin(angle/2);return [Math.cos(angle/2),x*s,y*s,z*s];};
/** Rotates v by q's inverse (a view direction into the ball's own frame). */
function unrotate(q:Quat,x:number,y:number,z:number,out:number[]):void {
  const [w,a,b,c]=q,tx=2*(b*z-c*y),ty=2*(c*x-a*z),tz=2*(a*y-b*x);
  // With t = 2 q.xyz × v, the conjugate's rotation is v − w·t + q.xyz × t.
  out[0]=x-w*tx+(b*tz-c*ty);out[1]=y-w*ty+(c*tx-a*tz);out[2]=z-w*tz+(a*ty-b*tx);
}
/** Each ball's turn at the rack: its number facing up, a little twist so they do not all look the same. */
export const rackTurn=(n:number):Quat=>qmul(qaxis(0,0,1,(n*2.399)%(Math.PI*2)),qaxis(0,1,0,-Math.PI/2));
/** Rolls a ball by its move on the cloth (axis ẑ × d, angle |d| / R). */
export function roll(q:Quat,dx:number,dy:number):Quat {
  const d=Math.hypot(dx,dy);
  if(d<1e-7)return q;
  const next=qmul(qaxis(-dy/d,dx/d,0,d/R),q),l=Math.hypot(...next);
  return [next[0]/l,next[1]/l,next[2]/l,next[3]/l];
}

export interface PoolBallPicture extends PoolBallSpot {turn:Quat;
  /** Dropping into a pocket: 0–1 of the way down, towards the hole. */
  sink?:{pocket:number;t:number}}
export interface PoolCuePicture {
  /** The stick behind the cue ball: the aim, how far it is pulled back (0–1), the strike's forward move (0–1), whether
   *  it lies on another ball (red), and whether it is the player's own (bright) or someone else's (dim). */
  angle:number;pull:number;strike:number;blocked:boolean;mine:boolean;elevation:number;
}
export interface PoolPicture {
  balls:readonly PoolBallPicture[];
  cue?:PoolCuePicture;
  guide?:PoolAimGuide&{legal:boolean};
  /** The quadro lit for the break's cue ball; the cue ball's spot shown taken (red) when it does not fit there. */
  placing?:{ok:boolean};
  /** A pocket that just took a ball: it glows a moment. */
  glow?:Array<{pocket:number;at:number;colour:string}>;
  now:number;
}
export interface TableTransform {portrait:boolean;scale:number;cx:number;cy:number}

/**
 * Draws the pool table from above: dark wood rails with the house's magenta glow and gold diamonds, the cushions, a violet
 * cloth like the blackjack felt with the head string, the marks and the logo, black pockets with gold rims. Each ball is
 * painted pixel by pixel as a lit sphere turned by how it rolled (stripes, the number's white disc, the 8 and the cue
 * ball's red dots turn with it); the stick lies behind the cue ball, pulled back with the power; the guide shows the
 * ghost ball and where both balls go. On a tall screen the table stands upright.
 */
export function createPoolRenderer(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d',{alpha:true})!;
  let width=0,height=0,ratio=1,staticKey='',base:HTMLCanvasElement|undefined,transform:TableTransform={portrait:false,scale:1,cx:0,cy:0};
  const logo=new Image();logo.decoding='async';logo.src='/ui/logo-highland.webp';logo.onload=()=>{staticKey='';};
  const sprites=new Map<number,{canvas:HTMLCanvasElement;key:string}>();
  const local=[0,0,0];

  function layout():void {
    const rect=canvas.getBoundingClientRect();
    ratio=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    width=w;height=h;
    const portrait=h>w*1.08,along=portrait?h:w,across=portrait?w:h;
    transform={portrait,scale:Math.min(along/(EXT_X*2),across/(EXT_Y*2)),cx:w/2,cy:h/2};
  }
  /** Table frame → canvas pixels (on a tall screen the head is at the top). */
  function setTable(c:CanvasRenderingContext2D):void {
    const k=transform.scale;
    if(transform.portrait)c.setTransform(0,k,-k,0,transform.cx,transform.cy);else c.setTransform(k,0,0,k,transform.cx,transform.cy);
  }
  const toScreen=(x:number,y:number):[number,number]=>transform.portrait?[transform.cx-y*transform.scale,transform.cy+x*transform.scale]:[transform.cx+x*transform.scale,transform.cy+y*transform.scale];

  // ── The table, drawn once per size ─────────────────────────────────────────────────────────────────────────────
  function drawStatic():void {
    const key=`${width}x${height}:${transform.portrait}:${logo.complete&&logo.naturalWidth>0}`;
    if(key===staticKey&&base)return;
    staticKey=key;base??=document.createElement('canvas');
    base.width=width;base.height=height;
    const c=base.getContext('2d')!,px=1/transform.scale;
    c.clearRect(0,0,width,height);
    setTable(c);
    // Rails: dark wood under the house's magenta glow, a gold line along the inside.
    c.save();c.shadowColor='rgba(234,47,220,.38)';c.shadowBlur=40*ratio;
    roundRect(c,-HL-RAIL,-HW-RAIL,(HL+RAIL)*2,(HW+RAIL)*2,.05);
    const wood=c.createLinearGradient(0,-HW-RAIL,0,HW+RAIL);wood.addColorStop(0,'#3a1f12');wood.addColorStop(.5,'#25130b');wood.addColorStop(1,'#3a1f12');
    c.fillStyle=wood;c.fill();c.restore();
    c.strokeStyle='rgba(250,196,22,.55)';c.lineWidth=1.4*px*ratio;
    roundRect(c,-HL-RAIL+.012,-HW-RAIL+.012,(HL+RAIL-.012)*2,(HW+RAIL-.012)*2,.04);c.stroke();
    // The cloth: violet like the blackjack felt, lit from the middle.
    const cloth=c.createRadialGradient(0,0,.05,0,0,HL*1.1);
    cloth.addColorStop(0,'#4d2c76');cloth.addColorStop(.55,'#341a52');cloth.addColorStop(1,'#1d0f30');
    c.fillStyle=cloth;c.fillRect(-HL-CUSHION,-HW-CUSHION,(HL+CUSHION)*2,(HW+CUSHION)*2);
    // The logo, faint, in the middle.
    if(logo.complete&&logo.naturalWidth){const w=.5,h=w*logo.naturalHeight/logo.naturalWidth;c.save();c.globalAlpha=.09;
      if(transform.portrait){c.rotate(-Math.PI/2);}c.drawImage(logo,-w/2,-h/2,w,h);c.restore();setTable(c);}
    // Head string, the quadro and the marks.
    c.setLineDash([.012,.012]);c.strokeStyle='rgba(255,255,255,.16)';c.lineWidth=1.2*px*ratio;
    c.beginPath();c.moveTo(HEAD_STRING,-HW);c.lineTo(HEAD_STRING,HW);c.stroke();c.setLineDash([]);
    for(const spot of [HEAD_SPOT,FOOT_SPOT,{x:0,y:0}]){c.beginPath();c.arc(spot.x,spot.y,.006,0,Math.PI*2);c.fillStyle='rgba(255,255,255,.34)';c.fill();}
    // Cushions: the rubber noses, a shade darker than the cloth, with their jaws into the pockets.
    c.fillStyle='#24113a';
    for(const poly of cushionShapes()){c.beginPath();poly.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
    c.strokeStyle='rgba(234,47,220,.22)';c.lineWidth=1*px*ratio;
    for(const s of CUSHIONS){c.beginPath();c.moveTo(s.ax,s.ay);c.lineTo(s.bx,s.by);c.stroke();}
    // Pockets: black holes, a gold rim, a little depth.
    for(const hole of HOLES){
      const g=c.createRadialGradient(hole.x,hole.y,0,hole.x,hole.y,hole.r);g.addColorStop(0,'#000');g.addColorStop(.75,'#07030b');g.addColorStop(1,'#1b0d24');
      c.beginPath();c.arc(hole.x,hole.y,hole.r,0,Math.PI*2);c.fillStyle=g;c.fill();
      c.strokeStyle='rgba(250,196,22,.6)';c.lineWidth=1.6*px*ratio;c.stroke();
    }
    // Diamonds on the rails.
    c.fillStyle='rgba(244,237,224,.85)';
    for(let i=1;i<8;i++){if(i===4)continue;const x=-HL+i*HL/4;for(const y of [-HW-RAIL*.62,HW+RAIL*.62])diamond(c,x,y,.011);}
    for(const i of [1,2,3]){const y=-HW+i*HW/2;for(const x of [-HL-RAIL*.62,HL+RAIL*.62])diamond(c,x,y,.011);}
    c.setTransform(1,0,0,1,0,0);
  }

  // ── A ball, painted per pixel ──────────────────────────────────────────────────────────────────────────────────
  function sprite(ball:PoolBallPicture,rpx:number):HTMLCanvasElement {
    const q=ball.turn,key=`${rpx.toFixed(1)}:${transform.portrait}:${q.map(v=>v.toFixed(3)).join(',')}`;
    let entry=sprites.get(ball.n);
    if(entry?.key===key)return entry.canvas;
    const size=Math.ceil(rpx*2)+2;
    if(!entry){entry={canvas:document.createElement('canvas'),key:''};sprites.set(ball.n,entry);}
    entry.key=key;
    const cv=entry.canvas;if(cv.width!==size){cv.width=size;cv.height=size;}
    const c=cv.getContext('2d')!,img=c.createImageData(size,size),data=img.data,mid=size/2;
    const [br,bg,bb]=rgb(colourOf(ball.n)),stripe=ball.n>8,eight=ball.n===8,cue=ball.n===0;
    // Light from the top left of the screen, a white highlight.
    const L=[-.42,-.55,.72],ll=Math.hypot(...L);L[0]/=ll;L[1]/=ll;L[2]/=ll;
    const H=[L[0],L[1],L[2]+1],hl=Math.hypot(...H);H[0]/=hl;H[1]/=hl;H[2]/=hl;
    for(let py=0;py<size;py++)for(let px=0;px<size;px++){
      const u=(px+.5-mid)/rpx,v=(py+.5-mid)/rpx,d2=u*u+v*v;
      if(d2>1.04)continue;
      const d=Math.min(1,Math.sqrt(d2)),nz=Math.sqrt(Math.max(0,1-d*d));
      // The pixel's normal in the table's frame (a tall screen turns the table a quarter).
      const tx=transform.portrait?v:u,ty=transform.portrait?-u:v;
      unrotate(q,tx,ty,nz,local);
      let r=255,g=255,b=255;
      if(cue){if(Math.max(Math.abs(local[0]!),Math.abs(local[1]!),Math.abs(local[2]!))>.975){r=196;g=30;b=46;}else{r=244;g=241;b=232;}}
      else{
        const disc=Math.abs(local[0]!)>.84;
        if(disc){r=246;g=243;b=236;}
        else if(stripe?Math.abs(local[2]!)<.5:true){r=br;g=bg;b=bb;}
        else{r=244;g=241;b=232;}
        if(eight&&disc){r=246;g=243;b=236;}
      }
      const diffuse=.38+.62*Math.max(0,u*L[0]!+v*L[1]!+nz*L[2]!),spec=Math.pow(Math.max(0,u*H[0]!+v*H[1]!+nz*H[2]!),48)*.95;
      const edge=Math.max(0,Math.min(1,(1-Math.sqrt(d2))*rpx+.5)),i=(py*size+px)*4;
      data[i]=Math.min(255,r*diffuse+255*spec);data[i+1]=Math.min(255,g*diffuse+255*spec);data[i+2]=Math.min(255,b*diffuse+255*spec);data[i+3]=edge*255;
    }
    c.putImageData(img,0,0);
    // The number on whichever disc faces up.
    if(!cue)for(const side of [1,-1]){
      const [w,a,bq,cq]=q,vx=side*(1-2*(bq*bq+cq*cq)),vy=side*2*(a*bq+w*cq),vz=side*2*(a*cq-w*bq);
      if(vz<.25)continue;
      const sx=transform.portrait?-vy:vx,sy=transform.portrait?vx:vy;
      c.save();c.translate(mid+sx*rpx*.98,mid+sy*rpx*.98);c.globalAlpha=Math.min(1,(vz-.25)*2.2);
      c.font=`700 ${Math.max(5,rpx*.62*Math.sqrt(vz))}px system-ui, sans-serif`;c.textAlign='center';c.textBaseline='middle';
      c.fillStyle='#16111c';c.fillText(String(ball.n),0,rpx*.04);c.restore();
    }
    return cv;
  }

  function drawBalls(balls:readonly PoolBallPicture[],now:number,glow:PoolPicture['glow']):void {
    const rpx=R*transform.scale;
    // Pockets that just took a ball glow a moment in its colour.
    for(const g of glow??[]){
      const age=(now-g.at)/700;if(age<0||age>1)continue;
      const hole=HOLES[g.pocket]!,[sx,sy]=toScreen(hole.x,hole.y);
      ctx.save();ctx.globalAlpha=(1-age)*.8;ctx.shadowColor=g.colour;ctx.shadowBlur=26*ratio;
      ctx.beginPath();ctx.arc(sx,sy,hole.r*transform.scale*(1+age*.4),0,Math.PI*2);ctx.strokeStyle=g.colour;ctx.lineWidth=3*ratio;ctx.stroke();ctx.restore();
    }
    // Shadows first, then the balls.
    for(const ball of balls){
      const [sx,sy]=place(ball),fade=ball.sink?1-ball.sink.t:1;
      ctx.save();ctx.globalAlpha=.42*fade;ctx.fillStyle='#05020a';
      ctx.beginPath();ctx.ellipse(sx+rpx*.28,sy+rpx*.36,rpx*1.02,rpx*.86,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(const ball of balls){
      const [sx,sy]=place(ball),shrink=ball.sink?1-ball.sink.t*.55:1,img=sprite(ball,rpx),size=img.width*shrink;
      ctx.save();if(ball.sink)ctx.globalAlpha=Math.max(0,1-ball.sink.t*1.2);
      ctx.drawImage(img,sx-size/2,sy-size/2,size,size);ctx.restore();
    }
  }
  /** Where a ball is drawn: on the cloth, or sliding into its pocket's hole. */
  function place(ball:PoolBallPicture):[number,number] {
    if(!ball.sink)return toScreen(ball.x,ball.y);
    const hole=HOLES[ball.sink.pocket]!,t=Math.min(1,ball.sink.t*1.6);
    return toScreen(ball.x+(hole.x-ball.x)*t,ball.y+(hole.y-ball.y)*t);
  }

  function drawGuide(guide:NonNullable<PoolPicture['guide']>):void {
    const k=transform.scale,line=(pts:Array<[number,number]>,colour:string,widthPx:number,dash:number[]=[])=>{
      ctx.beginPath();pts.forEach(([x,y],i)=>{const [sx,sy]=toScreen(x,y);i?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy);});
      ctx.setLineDash(dash.map(d=>d*ratio));ctx.strokeStyle=colour;ctx.lineWidth=widthPx*ratio;ctx.stroke();ctx.setLineDash([]);
    };
    const tone=guide.legal?'rgba(255,255,255,.72)':'rgba(255,93,93,.85)';
    line(guide.path.map(p=>[p.x,p.y]),tone,1.5,[6,5]);
    if(guide.ghost){
      const [gx,gy]=toScreen(guide.ghost.x,guide.ghost.y);
      ctx.beginPath();ctx.arc(gx,gy,R*k,0,Math.PI*2);ctx.strokeStyle=tone;ctx.lineWidth=1.4*ratio;ctx.stroke();
      if(!guide.legal){ctx.beginPath();ctx.moveTo(gx-R*k*.5,gy-R*k*.5);ctx.lineTo(gx+R*k*.5,gy+R*k*.5);ctx.moveTo(gx+R*k*.5,gy-R*k*.5);ctx.lineTo(gx-R*k*.5,gy+R*k*.5);ctx.stroke();}
      if(guide.object&&guide.legal){
        const ox=guide.ghost.x+guide.object.x*2*R,oy=guide.ghost.y+guide.object.y*2*R;
        line([[ox,oy],[ox+guide.object.x*.28,oy+guide.object.y*.28]],'rgba(23,212,244,.9)',2);
      }
      if(guide.cueAfter&&guide.legal)line([[guide.ghost.x,guide.ghost.y],[guide.ghost.x+guide.cueAfter.x*.16,guide.ghost.y+guide.cueAfter.y*.16]],'rgba(255,255,255,.42)',1.2,[3,4]);
    }
  }

  function drawCue(cue:PoolCuePicture,from:PoolBallSpot):void {
    const k=transform.scale,dx=Math.cos(cue.angle),dy=Math.sin(cue.angle);
    // The tip sits a hair behind the ball, pulled back with the power, snapping forward on the strike.
    const gap=.006+cue.pull*.2*(1-cue.strike),tip=R+gap,length=1.35;
    const [tx,ty]=toScreen(from.x-dx*tip,from.y-dy*tip),[ex,ey]=toScreen(from.x-dx*(tip+length),from.y-dy*(tip+length));
    const ang=Math.atan2(ey-ty,ex-tx),len=Math.hypot(ex-tx,ey-ty),w0=.0065*k,w1=.015*k;
    ctx.save();ctx.translate(tx,ty);ctx.rotate(ang);ctx.globalAlpha=cue.mine?1:.6;
    // Shadow on the cloth, offset by the cue's height.
    ctx.save();ctx.globalAlpha*=.35;ctx.fillStyle='#000';ctx.translate(R*k*.4,R*k*(.6+cue.elevation/40));
    ctx.beginPath();ctx.moveTo(0,-w0);ctx.lineTo(len,-w1);ctx.lineTo(len,w1);ctx.lineTo(0,w0);ctx.fill();ctx.restore();
    const g=ctx.createLinearGradient(0,0,len,0);
    g.addColorStop(0,'#3b73c9');g.addColorStop(.012,'#3b73c9');g.addColorStop(.013,'#f6f1e6');g.addColorStop(.03,'#f6f1e6');g.addColorStop(.031,'#e9cf98');
    g.addColorStop(.6,'#d9b673');g.addColorStop(.61,'#c99a17');g.addColorStop(.62,'#2a130a');g.addColorStop(.96,'#1b0b06');g.addColorStop(.97,'#c99a17');g.addColorStop(1,'#140804');
    ctx.beginPath();ctx.moveTo(0,-w0);ctx.lineTo(len,-w1);ctx.lineTo(len,w1);ctx.lineTo(0,w0);ctx.closePath();
    ctx.fillStyle=g;ctx.fill();
    if(cue.blocked){ctx.shadowColor='#ff4d4d';ctx.shadowBlur=12*ratio;ctx.strokeStyle='rgba(255,77,77,.95)';ctx.lineWidth=1.6*ratio;ctx.stroke();}
    else if(cue.mine){ctx.strokeStyle='rgba(234,47,220,.45)';ctx.lineWidth=1*ratio;ctx.stroke();}
    ctx.restore();
  }

  return {
    get transform(){return transform;},
    /** The table point under a screen point (client px), for aiming and putting the cue ball. */
    tableAt(clientX:number,clientY:number):{x:number;y:number} {
      const rect=canvas.getBoundingClientRect(),px=(clientX-rect.left)*ratio-transform.cx,py=(clientY-rect.top)*ratio-transform.cy,k=transform.scale;
      return transform.portrait?{x:py/k,y:-px/k}:{x:px/k,y:py/k};
    },
    draw(picture:PoolPicture):void {
      layout();drawStatic();
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
      if(base)ctx.drawImage(base,0,0);
      if(picture.placing){
        // The quadro lit; the rest of the cloth as it is.
        ctx.save();setTable(ctx);ctx.fillStyle=picture.placing.ok?'rgba(23,212,244,.08)':'rgba(255,93,93,.1)';
        ctx.fillRect(-HL,-HW,HEAD_STRING+HL,HW*2);ctx.strokeStyle=picture.placing.ok?'rgba(23,212,244,.5)':'rgba(255,93,93,.6)';ctx.lineWidth=1.5*ratio/transform.scale;
        ctx.strokeRect(-HL,-HW,HEAD_STRING+HL,HW*2);ctx.restore();
      }
      const cueBall=picture.balls.find(b=>b.n===0&&!b.sink);
      if(picture.guide&&cueBall)drawGuide(picture.guide);
      drawBalls(picture.balls,picture.now,picture.glow);
      if(picture.cue&&cueBall)drawCue(picture.cue,cueBall);
    },
    /** The colour a ball is drawn in (the pockets' glow, the scoreboard). */
    colourOf,
  };
}
export type PoolRenderer=ReturnType<typeof createPoolRenderer>;

function roundRect(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number):void {
  c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
}
function diamond(c:CanvasRenderingContext2D,x:number,y:number,s:number):void {c.beginPath();c.moveTo(x,y-s);c.lineTo(x+s*.6,y);c.lineTo(x,y+s);c.lineTo(x-s*.6,y);c.closePath();c.fill();}
/** The cushions' outlines: each straight nose with its two jaws, out to the rail. */
function cushionShapes():Array<Array<[number,number]>> {
  const out:Array<Array<[number,number]>>=[],c=POOL_TABLE.cornerCut,s=POOL_TABLE.sideHalf,j=POOL_TABLE.jaw,sj=POOL_TABLE.sideJaw;
  const a38=38*Math.PI/180,a14=14*Math.PI/180,edge=CUSHION+.004;
  const corner:[number,number]=[HL-c+j*Math.cos(a38),HW+j*Math.sin(a38)],side:[number,number]=[s-sj*Math.sin(a14),HW+sj*Math.cos(a14)];
  for(const sx of [-1,1])for(const sy of [-1,1]){
    // A long cushion, from the side pocket to the corner.
    out.push([[sx*s,sy*HW],[sx*(HL-c),sy*HW],[sx*corner[0],sy*corner[1]],[sx*corner[0],sy*(HW+edge)],[sx*side[0],sy*(HW+edge)],[sx*side[0],sy*side[1]]]);
  }
  const end:[number,number]=[HL+j*Math.sin(a38),HW-c+j*Math.cos(a38)];
  for(const sx of [-1,1])out.push([[sx*HL,-(HW-c)],[sx*HL,HW-c],[sx*end[0],end[1]],[sx*(HL+edge),end[1]],[sx*(HL+edge),-end[1]],[sx*end[0],-end[1]]]);
  return out;
}
