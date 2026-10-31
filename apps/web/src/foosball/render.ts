import {FOOSBALL,FOOSBALL_RODS,attackDir,manY,type FoosballBall,type FoosballTeam} from '@bar/shared';

/** What one picture of the table shows. Positions are in the table's frame (metres), as the room sends them. */
export interface TablePicture {
  ball?:FoosballBall;
  rods:ReadonlyArray<{offset:number;angle:number}>;
  /** The rods the local player holds (their handles glow), and where their pointer is across the table. */
  mine:ReadonlySet<number>;pointer?:number;
  /** The team at the bottom of the picture (its goal on the left), the one who looks. */
  side:FoosballTeam;
  /** Server time of this picture (effects are timed on it). */
  now:number;
}
export interface TableTransform {portrait:boolean;flip:number;scale:number;cx:number;cy:number}

const HALF_L=FOOSBALL.length/2,HALF_W=FOOSBALL.width/2,HALF_GOAL=FOOSBALL.goalWidth/2,R=FOOSBALL.ballRadius;
/** The cabinet around the felt, and how far the handles stick out of it. */
const FRAME_X=.1,FRAME_Y=.07,HANDLE=.1;
const EXTENT_X=HALF_L+FRAME_X+.02,EXTENT_Y=HALF_W+FRAME_Y+HANDLE;
const TEAM:Record<FoosballTeam,{body:string;dark:string;light:string;glow:string}>={
  red:{body:'#df4337',dark:'#8f1f1a',light:'#ff8f7f',glow:'rgba(255,82,64,'},
  blue:{body:'#2c7be0',dark:'#163f86',light:'#86bcff',glow:'rgba(56,140,255,'},
};
const NEON_MAGENTA='#ea2fdc',NEON_CYAN='#17d4f4',GOLD='#fac416';

interface Particle {x:number;y:number;vx:number;vy:number;life:number;age:number;color:string;size:number;spin:number}

/**
 * Draws the pebolim table from above on a canvas: a dark wooden cabinet with a gold trim and the bar's magenta glow, a
 * striped green felt with its pitch markings and the house's logo, goals in the teams' colours, chrome rods with rubber
 * handles (those the player holds glow), figures that lean forward and back as they swing and lie flat when raised, and a
 * ball with a neon trail when it flies. The picture turns to keep the looking team's goal on the left (or at the bottom,
 * on a tall screen) and its handles near them. A goal flashes, shakes and throws confetti.
 */
export function createTableRenderer(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d',{alpha:true})!;
  let width=0,height=0,ratio=1,staticKey='',base:HTMLCanvasElement|undefined,transform:TableTransform={portrait:false,flip:1,scale:1,cx:0,cy:0};
  const logo=new Image();logo.decoding='async';logo.src='/ui/logo-highland.webp';logo.onload=()=>{staticKey='';};
  const trail:Array<{x:number;y:number;at:number;speed:number}>=[];
  const particles:Particle[]=[];
  let flash:{team:FoosballTeam;at:number}|undefined,shake={until:0,power:0},lastFrame=performance.now();
  const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

  function layout(side:FoosballTeam):void {
    const rect=canvas.getBoundingClientRect();
    ratio=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    width=w;height=h;
    const portrait=h>w*1.08,along=portrait?h:w,across=portrait?w:h;
    const scale=Math.min(along/(EXTENT_X*2.06),across/(EXTENT_Y*2.04));
    transform={portrait,flip:attackDir(side),scale,cx:w/2,cy:h/2};
  }
  /** Table frame → canvas pixels (red attacks +x: right on a wide screen, up on a tall one; the looking side below). */
  function setTable(c:CanvasRenderingContext2D,t=transform,dx=0,dy=0):void {
    const k=t.scale*t.flip;
    if(t.portrait)c.setTransform(0,-k,k,0,t.cx+dx,t.cy+dy);else c.setTransform(k,0,0,k,t.cx+dx,t.cy+dy);
  }
  /** A canvas offset (pixels) as a table-frame vector, for shadows that fall the same way whatever the turn. */
  function screenVector(px:number,py:number):[number,number] {
    const k=transform.scale*transform.flip;
    return transform.portrait?[-py/k,px/k]:[px/k,py/k];
  }

  // ── The table itself, drawn once per size and side ─────────────────────────────────────────────────────────────────
  function drawStatic(side:FoosballTeam):void {
    const key=`${width}x${height}:${transform.portrait}:${side}:${logo.complete&&logo.naturalWidth>0}`;
    if(key===staticKey&&base)return;
    staticKey=key;base??=document.createElement('canvas');
    base.width=width;base.height=height;
    const c=base.getContext('2d')!;
    c.clearRect(0,0,width,height);
    setTable(c);
    const px=1/transform.scale;
    // Cabinet: a soft magenta glow underneath, dark wood, a gold trim.
    c.save();
    c.shadowColor='rgba(234,47,220,.42)';c.shadowBlur=42*ratio;
    roundRect(c,-HALF_L-FRAME_X,-HALF_W-FRAME_Y,(HALF_L+FRAME_X)*2,(HALF_W+FRAME_Y)*2,.03);
    c.fillStyle='#24140d';c.fill();
    c.restore();
    const wood=c.createLinearGradient(0,-HALF_W-FRAME_Y,0,HALF_W+FRAME_Y);
    wood.addColorStop(0,'#5c3522');wood.addColorStop(.5,'#3d2316');wood.addColorStop(1,'#56311f');
    roundRect(c,-HALF_L-FRAME_X,-HALF_W-FRAME_Y,(HALF_L+FRAME_X)*2,(HALF_W+FRAME_Y)*2,.03);c.fillStyle=wood;c.fill();
    // Wood grain along the long sides.
    c.save();c.clip();c.globalAlpha=.16;c.strokeStyle='#120905';c.lineWidth=1.2*px;
    for(let i=0;i<46;i++){const y=-HALF_W-FRAME_Y+i*((HALF_W+FRAME_Y)*2/46);c.beginPath();c.moveTo(-HALF_L-FRAME_X,y);
      for(let x=-HALF_L-FRAME_X;x<=HALF_L+FRAME_X;x+=.04)c.lineTo(x,y+Math.sin(x*23+i*1.7)*.0025+Math.sin(x*7+i)*.002);c.stroke();}
    c.restore();
    c.strokeStyle='rgba(250,196,22,.55)';c.lineWidth=1.6*px;
    roundRect(c,-HALF_L-FRAME_X+.008,-HALF_W-FRAME_Y+.008,(HALF_L+FRAME_X-.008)*2,(HALF_W+FRAME_Y-.008)*2,.024);c.stroke();
    // The goals: dark boxes with a net, rimmed in each team's colour (red defends -x).
    for(const team of ['red','blue'] as const){
      const sx=team==='red'?-1:1,x0=sx*HALF_L,x1=sx*(HALF_L+.055);
      c.fillStyle='#07060c';c.fillRect(Math.min(x0,x1),-HALF_GOAL-.006,.055,FOOSBALL.goalWidth+.012);
      c.save();c.beginPath();c.rect(Math.min(x0,x1),-HALF_GOAL,.055,FOOSBALL.goalWidth);c.clip();
      c.strokeStyle='rgba(255,255,255,.13)';c.lineWidth=px;
      for(let d=-.2;d<.2;d+=.012){c.beginPath();c.moveTo(x0+d,-HALF_GOAL);c.lineTo(x0+d+.12,HALF_GOAL);c.stroke();c.beginPath();c.moveTo(x0+d,HALF_GOAL);c.lineTo(x0+d+.12,-HALF_GOAL);c.stroke();}
      c.restore();
      c.strokeStyle=TEAM[team].body;c.lineWidth=3*px;c.shadowColor=`${TEAM[team].glow}.8)`;c.shadowBlur=10*ratio;
      c.beginPath();c.moveTo(x0,-HALF_GOAL-.006);c.lineTo(x1,-HALF_GOAL-.006);c.lineTo(x1,HALF_GOAL+.006);c.lineTo(x0,HALF_GOAL+.006);c.stroke();c.shadowBlur=0;
    }
    // The felt: green, striped by the rods' strips, with a fine weave.
    c.save();c.beginPath();c.rect(-HALF_L,-HALF_W,FOOSBALL.length,FOOSBALL.width);c.clip();
    const strip=FOOSBALL.length/FOOSBALL_RODS.length;
    for(let i=0;i<FOOSBALL_RODS.length;i++){c.fillStyle=i%2?'#1d6a3a':'#22763f';c.fillRect(-HALF_L+i*strip,-HALF_W,strip+.001,FOOSBALL.width);}
    const light=c.createRadialGradient(0,0,.05,0,0,HALF_L*1.1);light.addColorStop(0,'rgba(255,255,255,.07)');light.addColorStop(1,'rgba(0,0,0,.28)');
    c.fillStyle=light;c.fillRect(-HALF_L,-HALF_W,FOOSBALL.length,FOOSBALL.width);
    c.fillStyle='rgba(255,255,255,.045)';
    for(let i=0;i<2600;i++){const x=-HALF_L+((i*7919)%1000)/1000*FOOSBALL.length,y=-HALF_W+((i*104729)%997)/997*FOOSBALL.width;c.fillRect(x,y,px*1.2,px*1.2);}
    // Pitch markings.
    c.strokeStyle='rgba(255,255,255,.62)';c.lineWidth=2*px;
    const m=.012;
    c.strokeRect(-HALF_L+m,-HALF_W+m,FOOSBALL.length-m*2,FOOSBALL.width-m*2);
    c.beginPath();c.moveTo(0,-HALF_W+m);c.lineTo(0,HALF_W-m);c.stroke();
    c.beginPath();c.arc(0,0,.085,0,Math.PI*2);c.stroke();
    c.fillStyle='rgba(255,255,255,.7)';c.beginPath();c.arc(0,0,.006,0,Math.PI*2);c.fill();
    for(const sx of [-1,1]){
      const end=sx*(HALF_L-m);
      c.strokeRect(Math.min(end,end-sx*.16),-.2,.16,.4);
      c.strokeRect(Math.min(end,end-sx*.06),-.12,.06,.24);
      c.beginPath();c.arc(end-sx*.12,0,.005,0,Math.PI*2);c.fill();
      // The arc in front of the penalty area: the part of the circle around the spot outside the area.
      c.save();c.beginPath();const edge=end-sx*.16;c.rect(Math.min(edge,edge-sx*.1),-.2,.1,.4);c.clip();
      c.beginPath();c.arc(end-sx*.12,0,.085,0,Math.PI*2);c.stroke();c.restore();
      // Corner arcs, a quarter each, facing the field.
      for(const sy of [-1,1]){
        const from=Math.atan2(0,-sx),to=Math.atan2(-sy,0),turn=Math.atan2(Math.sin(to-from),Math.cos(to-from));
        c.beginPath();c.arc(end,sy*(HALF_W-m),.018,from,to,turn<0);c.stroke();
      }
    }
    c.restore();
    // The inner walls' shadow on the felt.
    const wall=(x:number,y:number,w:number,h:number,gx0:number,gy0:number,gx1:number,gy1:number)=>{const g=c.createLinearGradient(gx0,gy0,gx1,gy1);g.addColorStop(0,'rgba(0,0,0,.45)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x,y,w,h);};
    wall(-HALF_L,-HALF_W,FOOSBALL.length,.03,0,-HALF_W,0,-HALF_W+.03);
    wall(-HALF_L,HALF_W-.03,FOOSBALL.length,.03,0,HALF_W,0,HALF_W-.03);
    // The house's logo in the centre circle, upright whatever the turn.
    if(logo.complete&&logo.naturalWidth){
      c.setTransform(1,0,0,1,0,0);const size=.15*transform.scale;
      c.globalAlpha=.2;c.drawImage(logo,transform.cx-size/2,transform.cy-size/2,size,size);c.globalAlpha=1;
    }
  }

  // ── Moving parts ───────────────────────────────────────────────────────────────────────────────────────────────────
  function drawRod(c:CanvasRenderingContext2D,index:number,offset:number,mine:boolean):void {
    const def=FOOSBALL_RODS[index]!,x=def.x,px=1/transform.scale,handleSide=def.team==='red'?1:-1;
    // The far end slides into a telescopic safety tube on the far side, as on bar tables.
    const y0=-(HALF_W+FRAME_Y+.02)*handleSide,y1=(HALF_W+FRAME_Y+.015)*handleSide+offset;
    // Chrome bar, lit across its round side.
    const chrome=c.createLinearGradient(x-.006,0,x+.006,0);
    chrome.addColorStop(0,'#5d616c');chrome.addColorStop(.35,'#f2f3f7');chrome.addColorStop(.6,'#b9bcc6');chrome.addColorStop(1,'#4b4f59');
    c.fillStyle=chrome;c.fillRect(x-.0055,Math.min(y0,y1),.011,Math.abs(y1-y0));
    const tube=c.createLinearGradient(x-.009,0,x+.009,0);tube.addColorStop(0,'#26262e');tube.addColorStop(.45,'#6a6c78');tube.addColorStop(1,'#1d1d24');
    c.fillStyle=tube;roundRect(c,x-.009,handleSide>0?-(HALF_W+FRAME_Y+.04):HALF_W+FRAME_Y-.006,.018,.046,.006);c.fill();
    // The handle, on its team's side, sliding with the rod.
    const hy=(HALF_W+FRAME_Y+.012)*handleSide+offset,len=HANDLE-.012;
    if(mine){c.save();c.shadowColor=NEON_MAGENTA;c.shadowBlur=14*ratio;}
    const grip=c.createLinearGradient(x-.011,0,x+.011,0);grip.addColorStop(0,'#0c0c10');grip.addColorStop(.45,mine?'#5a1a55':'#3a3a44');grip.addColorStop(1,'#0c0c10');
    c.fillStyle=grip;roundRect(c,x-.011,handleSide>0?hy:hy-len,.022,len,.008);c.fill();
    if(mine)c.restore();
    c.fillStyle=TEAM[def.team].body;c.fillRect(x-.011,handleSide>0?hy:hy-.008,.022,.008);
    c.strokeStyle=mine?NEON_MAGENTA:'rgba(255,255,255,.12)';c.lineWidth=(mine?1.6:1)*px;
    for(let i=1;i<5;i++){const yy=handleSide>0?hy+.008+i*.016:hy-.008-i*.016;c.beginPath();c.moveTo(x-.009,yy);c.lineTo(x+.009,yy);c.stroke();}
  }
  /** A figure from above: head, shoulders and legs leaning with the rod's turn; flat when raised. */
  function drawFigure(c:CanvasRenderingContext2D,x0:number,y:number,angle:number,team:FoosballTeam):void {
    const dir=attackDir(team),s=Math.sin(angle),colors=TEAM[team];
    const head=x0-dir*.03*s,hips=x0+dir*.03*s,foot=x0+dir*FOOSBALL.man.foot*s,raised=Math.abs(s)>.75;
    const [sx,sy]=screenVector(2.2*ratio,3.4*ratio),lift=.4+Math.abs(s)*.6;
    // Shadow on the felt.
    c.fillStyle=`rgba(0,0,0,${.22+.1*(1-Math.abs(s))})`;
    c.beginPath();c.ellipse((head+foot)/2+sx*lift,y+sy*lift,Math.abs(foot-head)/2+.014,.017,0,0,Math.PI*2);c.fill();
    // Legs and boot.
    if(Math.abs(foot-x0)>.004){c.strokeStyle=colors.dark;c.lineWidth=.012;c.lineCap='round';c.beginPath();c.moveTo(hips,y);c.lineTo(foot,y);c.stroke();}
    c.fillStyle='#111015';c.beginPath();c.ellipse(foot,y,.009+Math.abs(s)*.003,.008,0,0,Math.PI*2);c.fill();
    // Shoulders: a rounded body, team-coloured, lit from above.
    const left=Math.min(head,hips)-.009,right=Math.max(head,hips)+.009;
    const body=c.createLinearGradient(0,y-.016,0,y+.016);body.addColorStop(0,colors.light);body.addColorStop(.45,colors.body);body.addColorStop(1,colors.dark);
    c.fillStyle=body;roundRect(c,left,y-.0155,right-left,.031,.009);c.fill();
    c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=.0015;c.stroke();
    // A white stripe on the shirt, the bar's colours on the collar.
    c.fillStyle='rgba(255,255,255,.55)';c.fillRect(Math.min(head,hips)-.001,y-.0155,.0025,.031);
    // Head (hair on top) unless lying flat, where the head points away from the feet.
    c.fillStyle='#e9b98f';c.beginPath();c.arc(head,y,.0085,0,Math.PI*2);c.fill();
    c.fillStyle=raised?'#2a1a12':'#3a2417';c.beginPath();c.arc(head-dir*.002*(raised?Math.sign(s):0),y,.0062,0,Math.PI*2);c.fill();
  }
  function drawBall(c:CanvasRenderingContext2D,ball:FoosballBall,now:number):void {
    const speed=Math.hypot(ball.vx,ball.vy);
    // The neon trail of a fast ball.
    if(trail.length>1&&!reducedMotion()){
      for(let i=1;i<trail.length;i++){
        const a=trail[i-1]!,b=trail[i]!,age=(now-b.at)/220,fast=Math.min(1,(b.speed-1)/3);
        if(age>1||fast<=0)continue;
        c.strokeStyle=i/trail.length>.5?NEON_CYAN:NEON_MAGENTA;c.globalAlpha=(1-age)*fast*.75;c.lineWidth=R*1.6*(1-age*.6);c.lineCap='round';
        c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
      }
      c.globalAlpha=1;
    }
    const [sx,sy]=screenVector(2.5*ratio,3.5*ratio);
    c.fillStyle='rgba(0,0,0,.4)';c.beginPath();c.ellipse(ball.x+sx,ball.y+sy,R*1.05,R*.95,0,0,Math.PI*2);c.fill();
    // Lit from the top left of the screen, whichever way the table is turned.
    const [lx,ly]=screenVector(-4,-5),l=Math.hypot(lx,ly)||1;
    const shade=c.createRadialGradient(ball.x+lx/l*R*.38,ball.y+ly/l*R*.38,R*.1,ball.x,ball.y,R);
    shade.addColorStop(0,'#ffffff');shade.addColorStop(.6,'#f1efe8');shade.addColorStop(1,'#a9a69c');
    c.fillStyle=shade;c.beginPath();c.arc(ball.x,ball.y,R,0,Math.PI*2);c.fill();
    if(speed>3.5){c.strokeStyle='rgba(23,212,244,.7)';c.lineWidth=.003;c.beginPath();c.arc(ball.x,ball.y,R+.004,0,Math.PI*2);c.stroke();}
  }
  function drawPointer(c:CanvasRenderingContext2D,y:number):void {
    const px=1/transform.scale;
    c.save();c.strokeStyle='rgba(234,47,220,.38)';c.lineWidth=1.5*px;c.setLineDash([8*px,7*px]);
    c.beginPath();c.moveTo(-HALF_L,y);c.lineTo(HALF_L,y);c.stroke();c.restore();
    c.fillStyle=NEON_MAGENTA;
    for(const sx of [-1,1]){c.beginPath();c.moveTo(sx*(HALF_L+.012),y-.012);c.lineTo(sx*(HALF_L+.004),y);c.lineTo(sx*(HALF_L+.012),y+.012);c.closePath();c.fill();}
  }
  function drawEffects(c:CanvasRenderingContext2D,now:number,dt:number):void {
    if(flash){
      const age=(now-flash.at)/1400;
      if(age>=1)flash=undefined;
      else{
        const x=(flash.team==='red'?1:-1)*HALF_L,glow=c.createRadialGradient(x,0,.01,x,0,.42);
        glow.addColorStop(0,`${TEAM[flash.team].glow}${.55*(1-age)})`);glow.addColorStop(1,`${TEAM[flash.team].glow}0)`);
        c.fillStyle=glow;c.fillRect(-HALF_L-FRAME_X,-HALF_W-FRAME_Y,(HALF_L+FRAME_X)*2,(HALF_W+FRAME_Y)*2);
      }
    }
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]!;p.age+=dt;
      if(p.age>p.life){particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-1.6*dt;p.vy*=1-1.6*dt;
      c.save();c.translate(p.x,p.y);c.rotate(p.spin*p.age);c.globalAlpha=1-p.age/p.life;c.fillStyle=p.color;c.fillRect(-p.size/2,-p.size/4,p.size,p.size/2);c.restore();
    }
  }

  return {
    get transform(){return transform;},
    /** The table-frame y across the rods under a point of the canvas (client pixels), for the pointer. */
    pointerAt(clientX:number,clientY:number):number {
      const rect=canvas.getBoundingClientRect(),x=(clientX-rect.left)*ratio-transform.cx,y=(clientY-rect.top)*ratio-transform.cy,k=transform.scale*transform.flip;
      return transform.portrait?x/k:y/k;
    },
    /** Which way "more" goes on screen for the pointer (keys move it along the rods as they look). */
    get screenSign():number {return transform.flip;},
    /** A goal: the goal it went into glows, the table shakes and confetti flies out of it. */
    goal(team:FoosballTeam,now:number):void {
      flash={team,at:now};
      if(reducedMotion())return;
      shake={until:performance.now()+520,power:9};
      const x=(team==='red'?1:-1)*HALF_L,colors=[TEAM[team].body,TEAM[team].light,GOLD,'#ffffff',NEON_MAGENTA];
      for(let i=0;i<70;i++){const a=(team==='red'?Math.PI:0)+(Math.random()-.5)*2.4,v=.25+Math.random()*.9;
        particles.push({x,y:(Math.random()-.5)*.16,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.9+Math.random()*1.1,age:0,color:colors[i%colors.length]!,size:.007+Math.random()*.008,spin:(Math.random()-.5)*14});}
    },
    /** A hard strike shakes the table a little. */
    thump(speed:number):void {if(speed>4.2&&!reducedMotion())shake={until:performance.now()+160,power:Math.min(5,speed-3)};},
    draw(picture:TablePicture):void {
      const frameNow=performance.now(),dt=Math.min(.05,(frameNow-lastFrame)/1000);lastFrame=frameNow;
      layout(picture.side);drawStatic(picture.side);
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
      const shaking=frameNow<shake.until?shake.power*ratio*((shake.until-frameNow)/520):0;
      const dx=shaking?(Math.random()-.5)*shaking:0,dy=shaking?(Math.random()-.5)*shaking:0;
      if(base)ctx.drawImage(base,dx,dy);
      setTable(ctx,transform,dx,dy);
      if(picture.pointer!==undefined)drawPointer(ctx,picture.pointer);
      if(picture.ball){
        trail.push({x:picture.ball.x,y:picture.ball.y,at:picture.now,speed:Math.hypot(picture.ball.vx,picture.ball.vy)});
        while(trail.length>14||(trail.length&&picture.now-trail[0]!.at>260))trail.shift();
      }else trail.length=0;
      // The ball rolls under the figures and the rods: drawn first.
      if(picture.ball)drawBall(ctx,picture.ball,picture.now);
      FOOSBALL_RODS.forEach((def,i)=>{
        const rod=picture.rods[i]??{offset:0,angle:0},mine=picture.mine.has(i);
        drawRod(ctx,i,rod.offset,mine);
        for(let k=0;k<def.men;k++)drawFigure(ctx,def.x,manY(def,k,rod.offset),rod.angle,def.team);
      });
      drawEffects(ctx,picture.now,dt);
    },
  };
}

function roundRect(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number):void {
  c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
}
export type TableRenderer=ReturnType<typeof createTableRenderer>;
