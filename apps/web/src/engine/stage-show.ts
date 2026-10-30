import * as pc from 'playcanvas';
import {DEFAULT_SHOW,MAP_COLLIDERS,SHOW_PALETTES,STAGE,showMoment,type ShowProgramId,type StageShowState} from '@bar/shared';
import {LASER_SHAPES,textDrawing,type Drawing} from './laser-font';

type Rgb=readonly [number,number,number];
const hex=(value:string):Rgb=>[parseInt(value.slice(1,3),16)/255,parseInt(value.slice(3,5),16)/255,parseInt(value.slice(5,7),16)/255];

/** The house tempo (124 BPM): at it, a program's `t` runs in seconds; faster or slower tempos move everything with them. */
const BEAT=60/124;
// The lasers' colours (sRGB: the beams are drawn as they are, past the scene's tone mapping). The heads take them too.
const PALETTES=new Map<string,Rgb[]>(SHOW_PALETTES.map(p=>[p.id,p.colours.map(hex)]));
const WHITE:Rgb=[1,1,1];
const RAD=180/Math.PI;

// The rig (15_palco.py): the front truss spans the towers on the audience's side (+Z, where the telão faces), just under
// the tarp; a laser on each PA stack and one over the telão. Without the towers, the deck's front edge.
const deck=STAGE.deck,towers=MAP_COLLIDERS.filter(c=>/^COL_Palco_Torre(\.\d+)?$/.test(c.id));
const frontZ=towers.length?Math.max(...towers.map(c=>c.z)):deck.z+deck.hz;
const rigY=(towers.length?Math.max(...towers.map(c=>c.maxY)):deck.maxY+4.7)-.35;
const rigLeft=(towers.length?Math.min(...towers.map(c=>c.x)):deck.x-deck.hx)+.8,rigRight=(towers.length?Math.max(...towers.map(c=>c.x)):deck.x+deck.hx)-.8;
const along=(f:number)=>rigLeft+(rigRight-rigLeft)*f;
const stack=(id:string,x:number)=>{const c=MAP_COLLIDERS.find(c=>c.id===id);return c?new pc.Vec3(c.x,c.maxY+.06,c.z):new pc.Vec3(x,deck.maxY+2.1,frontZ-.2);};
const RIG={
  centre:new pc.Vec3(deck.x,rigY,frontZ),
  row:[0,.25,.5,.75,1].map(f=>new pc.Vec3(along(f),rigY,frontZ)),
  left:stack('COL_Palco_PA_Esq',deck.x-deck.hx+.9),right:stack('COL_Palco_PA_Dir',deck.x+deck.hx-.9),
  back:new pc.Vec3(deck.x,rigY+.06,deck.z-deck.hz+.5),
  heads:[.1,.36,.64,.9].map(f=>new pc.Vec3(along(f),rigY-.12,frontZ+.05)),
};
// The blinders flash white with the strobe: along the truss and on the PA stacks.
const BLINDERS=[...RIG.row,RIG.left,RIG.right];
// Left to right: the PA stacks and the truss (Cometa, Relâmpago).
const LINE_UP=[RIG.left,...RIG.row,RIG.right];
// The drawings go on the telão (Telao_Tela), a few centimetres in front of it: u along its width (+X for the audience,
// who face it), v up. The laser that draws them hangs in the middle of the front truss.
const screen=STAGE.screen,screenYaw=screen.yaw/RAD;
const CANVAS={
  centre:new pc.Vec3(screen.x+Math.sin(screenYaw)*.05,screen.y,screen.z+Math.cos(screenYaw)*.05),
  right:new pc.Vec3(Math.cos(screenYaw),0,-Math.sin(screenYaw)),up:new pc.Vec3(0,1,0),normal:new pc.Vec3(Math.sin(screenYaw),0,Math.cos(screenYaw)),
  width:screen.width,height:screen.height,
};
const PROJECTOR=new pc.Vec3(deck.x,rigY-.1,frontZ-.15);

/** How a drawing is traced: the stretch `from`–`to` (fractions of the trace), where the laser's dot is, and its look. */
interface Trace {
  from:number;to:number;
  /** Where the dot is: at the end being drawn, at the start being erased, or nowhere (all drawn). */
  pen:'end'|'start'|'none';
  colour:(u:number)=>Rgb;power:number;
  /** Metres per drawing unit (default: fitted to the screen), offset of its centre (metres) and a turn (radians). */
  scale?:number;x?:number;y?:number;turn?:number;
}
/** What a program draws with, at its time `t`, `beat` (beats since it began, of `beats`) and `bar`. */
interface Show {
  /** Seconds at the house tempo, times the desk's speed: what sweeps and turns follow. */
  t:number;beat:number;bar:number;beats:number;palette:Rgb[];text:string;
  /** A laser from `from` towards `yaw` (0: the audience, positive: towards +X) and `pitch` (radians, up). */
  laser(from:pc.Vec3,yaw:number,pitch:number,colour:Rgb,power?:number):void;
  /** A laser from `from` through `to`. */
  aim(from:pc.Vec3,to:pc.Vec3,colour:Rgb,power?:number):void;
  /** Where a moving head points (it travels there at its own speed) and its colour. A head nobody sets stays dark. */
  head(index:number,yaw:number,pitch:number,colour:Rgb,power?:number):void;
  strobe(amount:number):void;
  /** A drawing traced by the laser on the telão. */
  draw(drawing:Drawing,trace:Trace):void;
}
const TAU=Math.PI*2;
/** 1 on the beat, falling off until the next one. */
const pulse=(beat:number,sharpness=6)=>Math.exp(-(((beat%1)+1)%1)*sharpness);
/** A number in [0, 1) from an integer, with integer arithmetic only: the same in every browser. */
const hash=(n:number)=>{let x=Math.imul(n^0x9e3779b9,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return (x>>>0)/4294967296;};
const pick=(palette:Rgb[],i:number)=>palette[((i%palette.length)+palette.length)%palette.length]!;
const mix=(a:Rgb,b:Rgb,f:number):Rgb=>[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
/** The palette spread across a drawing, left to right (`u` from -1 to 1), like the logo's gradient line. */
const gradient=(palette:Rgb[],u:number):Rgb=>{const f=Math.min(.999,Math.max(0,(u+1)/2))*(palette.length-1),i=Math.floor(f);return mix(palette[i]!,palette[Math.min(i+1,palette.length-1)]!,f-i);};
const ease=(x:number)=>{const c=Math.min(1,Math.max(0,x));return c*c*(3-2*c);};
/** The heads circling over the crowd, out of step with each other. */
const circle=(show:Show,radius:number,speed:number,power=1)=>{for(let i=0;i<4;i++)show.head(i,radius*Math.sin(show.t*speed+i*1.6),-.78+radius*.45*Math.cos(show.t*speed+i*1.6),pick(show.palette,i+1),power);};
/** Yaw and pitch from `from` towards `to`. */
const towards=(from:pc.Vec3,to:pc.Vec3):[number,number]=>{const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;return [Math.atan2(dx,dz),Math.atan2(dy,Math.hypot(dx,dz))];};
const focus=new pc.Vec3(),spot=new pc.Vec3();

/**
 * Write, hold, erase: a drawing traced over `length` beats from `beat` 0. Writing takes up to `write` of it (at most
 * `cap` beats), erasing the last `rub` (at most 4 beats); in between the drawing stays up.
 */
function trace(beat:number,length:number,write=.45,cap=16,rub=.15):{from:number;to:number;pen:Trace['pen'];held:number} {
  const writing=Math.min(cap,length*write),erasing=Math.min(4,length*rub),hold=length-erasing;
  if(beat<writing)return {from:0,to:beat/writing,pen:'end',held:0};
  if(beat<hold)return {from:0,to:1,pen:'none',held:(beat-writing)/Math.max(1e-3,hold-writing)};
  return {from:ease((beat-hold)/erasing),to:1,pen:'start',held:1};
}

const PROGRAMS:Record<ShowProgramId,(show:Show)=>void>={
  // Leque: a fan from the middle of the truss, opening and closing over two bars and sweeping side to side.
  leque:show=>{
    const open=.3+.5*(.5-.5*Math.cos(show.beat*Math.PI/4)),sweep=.35*Math.sin(show.t*.55),pitch=-.3+.2*Math.sin(show.t*.8);
    for(let i=0;i<12;i++)show.laser(RIG.centre,sweep+open*(i/11*2-1),pitch,pick(show.palette,i));
    circle(show,.45,.9);
    if(show.beat%4<1)show.strobe(pulse(show.beat,9)*.45);
  },
  // Tesoura: the PA stacks' lasers cross over the audience like scissors.
  tesoura:show=>{
    for(const side of [-1,1]){
      const from=side<0?RIG.left:RIG.right,swing=side*.55*Math.sin(show.t*1.25);
      for(let i=0;i<6;i++)show.laser(from,-side*.3+swing+(i-2.5)*.075,.05+.09*Math.sin(show.t*.7+i*.4),pick(show.palette,side<0?0:1));
    }
    // The heads jump from side to side on every beat.
    for(let i=0;i<4;i++)show.head(i,((Math.floor(show.beat)+i)%2?.5:-.5),-.72,pick(show.palette,2));
    if(show.beat%2<1)show.strobe(pulse(show.beat,10)*.3);
  },
  // Túnel: a cone of beams spinning out of the telão towards the crowd, breathing on the beat.
  tunel:show=>{
    const cone=.09+.05*pulse(show.beat,4),spin=show.t*1.8,yaw=.22*Math.sin(show.t*.4),pitch=-.11+.05*Math.sin(show.t*.6);
    for(let i=0;i<16;i++){const a=spin+i*TAU/16;show.laser(RIG.back,yaw+Math.cos(a)*cone,pitch+Math.sin(a)*cone,pick(show.palette,i%2));}
    for(let i=0;i<4;i++)show.head(i,yaw*.6+(i-1.5)*.18,-.62,WHITE,.7);
  },
  // Onda: the truss's lasers dip one after another, a wave rolling along the stage.
  onda:show=>{
    for(let e=0;e<5;e++){
      const pitch=-.62+.42*Math.sin(show.t*2.1-e*.85);
      for(let b=0;b<3;b++)show.laser(RIG.row[e]!,(e-2)*.1+(b-1)*.16,pitch,pick(show.palette,e+Math.floor(show.beat)));
    }
    for(let i=0;i<4;i++)show.head(i,(i-1.5)*.25,-.95+.3*Math.sin(show.t*2.1-i*1.1),pick(show.palette,i));
  },
  // Chuva: beams raining onto the crowd, scanning back and forth, blinking on the eighths.
  chuva:show=>{
    const pitch=-1.15+.45*(.5-.5*Math.cos(show.t*1.1));
    for(let e=0;e<5;e++)for(let b=0;b<3;b++){
      const on=(Math.floor(show.beat*2)+e+b)%2===0;
      show.laser(RIG.row[e]!,(b-1)*.22+(e-2)*.05,pitch,pick(show.palette,b),on?1:.12);
    }
    for(let i=0;i<4;i++)show.head(i,(i-1.5)*.3,-1.05,pick(show.palette,i+Math.floor(show.beat)));
    show.strobe(pulse(show.beat,12)*.2);
  },
  // Estrobo: the strobe on every beat every other bar (the flash gate keeps it under ~2 Hz at any tempo), the heads in
  // white picking out the crowd, lasers stuttering.
  estrobo:show=>{
    show.strobe(pulse(show.beat,7)*(show.bar%2?1:show.beat%4<1?.6:0));
    const power=pulse(show.beat,7);
    for(const [from,yaw] of [[RIG.left,.35],[RIG.right,-.35],[RIG.centre,0]] as const)for(let i=0;i<3;i++)show.laser(from,yaw+(i-1)*.2,-.18,pick(show.palette,i),power);
    for(let i=0;i<4;i++){const n=Math.floor(show.beat)*4+i;show.head(i,(hash(n*2)-.5)*1.1,-.6-hash(n*2+1)*.4,WHITE);}
  },
  // Varredura: a sheet of light sweeping up over the heads and back down, one colour per bar.
  varredura:show=>{
    const rise=Math.abs(((show.t/(8*BEAT))%1)*2-1),pitch=-.42+.6*rise;
    for(let i=0;i<28;i++)show.laser(RIG.centre,(i/27*2-1)*.95,pitch,pick(show.palette,show.bar),.55);
    for(let i=0;i<4;i++)show.head(i,.6*Math.sin(show.t*.5+i*.4),-.7,pick(show.palette,show.bar+1));
  },
  // Letreiro: the laser writes the desk's text on the telão, letter by letter, holds it while the truss fires into the
  // crowd on the beat (a shine running over the letters every bar) and rubs it out.
  letreiro:show=>{
    const text=textDrawing(show.text),step=trace(show.beat,show.beats);
    const shine=((show.beat%4)/4)*2.6-1.3,glow=step.pen==='none'?.82+.18*pulse(show.beat,5):1;
    show.draw(text,{from:step.from,to:step.to,pen:step.pen,power:glow,colour:u=>{const c=gradient(show.palette,u),near=Math.max(0,1-Math.abs(u-shine)*4);return step.pen==='none'?mix(c,WHITE,near*.75):c;}});
    if(step.pen==='none'&&show.beat%2<1){
      const power=pulse(show.beat,4)*.8;
      for(let i=0;i<10;i++)show.laser(RIG.centre,(i/9*2-1)*.7,-.32,pick(show.palette,i),power);
    }
    circle(show,.35,.6,.55);
  },
  // Desenhos: four drawings in turn (a star turning, a beating heart, a mug of chopp and a pair of quavers), each written,
  // held and rubbed out in a quarter of the program.
  desenhos:show=>{
    const length=show.beats/4,k=Math.min(3,Math.floor(show.beat/length)),beat=show.beat-k*length,step=trace(beat,length,.4,8,.12);
    const {id,drawing}=LASER_SHAPES[k]!,colour=pick(show.palette,k),scale=CANVAS.height*.62/6;
    const beating=id==='coracao'&&step.pen==='none'?1+.12*pulse(show.beat,5):1;
    show.draw(drawing,{from:step.from,to:step.to,pen:step.pen,power:1,colour:u=>mix(colour,pick(show.palette,k+1),(u+1)/4),
      scale:scale*beating,turn:id==='estrela'?step.held*TAU/5*2:0,y:id==='notas'&&step.pen==='none'?.12*Math.abs(Math.sin(show.beat*Math.PI)):0});
    circle(show,.4,.7,.6);
  },
  // Céu líquido: a ceiling of light just over the crowd's heads, rippling like water.
  ceu:show=>{
    const base=-.27+.035*Math.sin(show.t*.5),colour=pick(show.palette,show.bar),crest=pick(show.palette,show.bar+1);
    for(let i=0;i<34;i++){
      const yaw=(i/33*2-1)*1.05,wave=Math.sin(yaw*5-show.t*2.4);
      show.laser(RIG.centre,yaw,base+.06*wave,wave>.7?crest:colour,.5);
    }
    for(let i=0;i<4;i++)show.head(i,.5*Math.sin(show.t*.35+i*1.2),-1+.15*Math.sin(show.t*.6+i),pick(show.palette,show.bar+i),.6);
  },
  // Hélice: three propellers of four beams on the truss, the middle one turning the other way, opening on the beat.
  helice:show=>{
    const radius=.26+.08*pulse(show.beat,4);
    for(const [n,e] of [0,2,4].entries()){
      const turn=(n===1?-1:1)*show.t*2.2+n*.5;
      for(let b=0;b<4;b++){const a=turn+b*TAU/4;show.laser(RIG.row[e]!,(e-2)*.14+Math.cos(a)*radius,-.34+Math.sin(a)*radius,pick(show.palette,n),.9);}
    }
    for(let i=0;i<4;i++)show.head(i,(i-1.5)*.3+.15*Math.sin(show.t*2.2+i),-.75,pick(show.palette,i),.8);
  },
  // Grade: a fan from each PA stack crossing over the crowd into a lattice of diamonds; its tilt steps every bar and the
  // sides swap colours on the beat.
  grade:show=>{
    const tilt=[-.02,.06,.14,.06][show.bar%4]!,swap=Math.floor(show.beat)%2;
    for(const side of [-1,1]){
      const from=side<0?RIG.left:RIG.right,drift=.06*Math.sin(show.t*.9);
      for(let i=0;i<7;i++)show.laser(from,-side*(.1+i*.11)+drift,tilt+.02*Math.sin(show.t+i),pick(show.palette,(side<0?0:1)+swap),.85);
    }
    for(let i=0;i<4;i++)show.head(i,(i-1.5)*.35,-.9,pick(show.palette,2),.5+.5*pulse(show.beat+i*.25,5));
    if(show.bar%4===3)show.strobe(pulse(show.beat,10)*.35);
  },
  // Foco: every laser meets at one point wandering over the crowd; on the beat the beams burst apart and close in again.
  foco:show=>{
    focus.set(deck.x+2.6*Math.sin(show.t*.7),3.3+.5*Math.sin(show.t*1.3),frontZ+2.4+.8*Math.sin(show.t*.45));
    const burst=pulse(show.beat,3)*.9;
    for(const [i,from] of [RIG.left,...RIG.row,RIG.right,RIG.back].entries()){
      const a=i*2.4;spot.set(focus.x+Math.cos(a)*burst,focus.y+Math.sin(a)*burst*.6,focus.z);
      show.aim(from,spot,pick(show.palette,i));
    }
    for(let i=0;i<4;i++){const [yaw,pitch]=towards(RIG.heads[i]!,focus);show.head(i,yaw,pitch,pick(show.palette,i+1),.8);}
  },
  // Equalizador: each truss laser is a bar of a graphic equaliser, a column of beams jumping on the eighths and falling
  // back, lower beams in the palette's first colour, the top ones in its last.
  equalizador:show=>{
    const eighth=Math.floor(show.beat*2),fall=.45+.55*pulse(show.beat*2,3);
    for(let e=0;e<5;e++){
      const level=Math.max(1,Math.round((1+5*hash(eighth*7+e))*fall));
      for(let j=0;j<level;j++)show.laser(RIG.row[e]!,(e-2)*.2,-.6+j*.13,j<2?pick(show.palette,0):j<4?pick(show.palette,1):pick(show.palette,2),j===level-1?1:.7);
    }
    for(let i=0;i<4;i++)show.head(i,(i-1.5)*.32,-1.1+.35*hash(eighth*5+i),pick(show.palette,i),.7);
  },
  // Cometa: one fixture after another lights from left to right and back, with a fading tail, sweeping over the crowd.
  cometa:show=>{
    const run=(show.beat*1.5)%12,at=run<6?run:12-run,sweep=.3*Math.sin(show.t*.9);
    for(const [k,from] of LINE_UP.entries()){
      const power=Math.max(0,1-Math.abs(at-k)/2.2)**2;
      for(let b=0;b<3;b++)show.laser(from,sweep+(k-3)*.08+(b-1)*.09,-.25+(b-1)*.04,pick(show.palette,k),power);
    }
    for(let i=0;i<4;i++)show.head(i,sweep+(i-1.5)*.3,-.8,pick(show.palette,i),Math.max(.1,1-Math.abs(at-(i*1.5+1.5))/2));
  },
  // Relâmpago: single beams flicking out of random fixtures in random directions on the eighths, and a crack of the whole
  // truss on every bar's first beat.
  relampago:show=>{
    const eighth=Math.floor(show.beat*2);
    for(let n=eighth-2;n<=eighth;n++){
      if(hash(n)>.6)continue;
      const fade=Math.exp(-(show.beat*2-n)*2.5);
      show.laser(LINE_UP[Math.floor(hash(n*3+1)*LINE_UP.length)]!,(hash(n*5+2)-.5)*1.6,-.9+hash(n*7+3)*.9,pick(show.palette,n),fade);
    }
    if(show.beat%4<1){const crack=pulse(show.beat,5);for(let i=0;i<9;i++)show.laser(RIG.centre,(i/8*2-1)*.85,-.25+(hash(show.bar*9+i)-.5)*.3,WHITE,crack);}
    if(show.bar%2===0)show.strobe(pulse(show.beat,8)*(show.beat%4<1?.6:0));
    for(let i=0;i<4;i++){const n=Math.floor(show.beat)*4+i;show.head(i,(hash(n)-.5)*1.2,-.7-hash(n+9)*.4,WHITE,.35);}
  },
};

/** The desk's Drop: a bar rising and narrowing to a point with no strobe, then a bar of everything wide open on the beat. */
function drop(show:Show):void {
  if(show.beat<4){
    const rise=show.beat/4,open=.9*(1-rise)+.05;
    for(let i=0;i<14;i++)show.laser(RIG.centre,open*(i/13*2-1),-.55+.75*rise,pick(show.palette,i),.5+.5*rise);
    for(let i=0;i<4;i++)show.head(i,(i-1.5)*.25*(1-rise),-.9+.6*rise,WHITE,.4+.6*rise);
    return;
  }
  const hit=pulse(show.beat,5);
  for(let i=0;i<24;i++)show.laser(RIG.centre,(i/23*2-1)*1.1,-.18+.06*Math.sin(i*1.7),pick(show.palette,i),.6+.4*hit);
  for(const side of [-1,1])for(let i=0;i<5;i++)show.laser(side<0?RIG.left:RIG.right,-side*(.15+i*.14),.04,pick(show.palette,i+1),hit);
  for(let i=0;i<4;i++)show.head(i,(i-1.5)*.4,-.7,WHITE,.5+.5*hit);
  show.strobe(hit);
}

// The map's volumes a beam can land on (the stage's own, the building, the walls, the neighbours), as min/max boxes.
const REACH=34;
const BOXES=Float32Array.from(MAP_COLLIDERS.filter(c=>c.maxY>0&&Math.abs(c.x-deck.x)-c.hx<REACH&&Math.abs(c.z-deck.z)-c.hz<REACH)
  .flatMap(c=>[c.x-c.hx,c.minY,c.z-c.hz,c.x+c.hx,c.maxY,c.z+c.hz]));
/** Metres from `o` along the unit `d` to the first volume (or the ground) it meets, at most `max`. Volumes around `o` do not count. */
function cast(o:pc.Vec3,d:pc.Vec3,max:number):number {
  let best=d.y<-1e-4?Math.min(max,-o.y/d.y):max;
  const ix=1/d.x,iy=1/d.y,iz=1/d.z;
  for(let i=0;i<BOXES.length;i+=6){
    const x0=(BOXES[i]!-o.x)*ix,x1=(BOXES[i+3]!-o.x)*ix,y0=(BOXES[i+1]!-o.y)*iy,y1=(BOXES[i+4]!-o.y)*iy,z0=(BOXES[i+2]!-o.z)*iz,z1=(BOXES[i+5]!-o.z)*iz;
    const enter=Math.max(Math.min(x0,x1),Math.min(y0,y1),Math.min(z0,z1)),exit=Math.min(Math.max(x0,x1),Math.max(y0,y1),Math.max(z0,z1));
    if(enter>1e-3&&enter<exit&&enter<best)best=enter;
  }
  return best;
}
const direction=(yaw:number,pitch:number,out:pc.Vec3)=>out.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));

const VERTEX=`attribute vec3 aPosition;attribute vec2 aUv0;attribute vec4 aColor;uniform mat4 matrix_viewProjection;varying vec2 vUv0;varying vec4 vColor;
void main(){vUv0=aUv0;vColor=aColor;gl_Position=matrix_viewProjection*vec4(aPosition,1.0);}`;
// Each batch's light is weighed by its alpha here and added; the canvas alpha rises to the light's own strength (light()),
// so a beam or a drawing over the telão's video, which plays behind the canvas through an alpha-0 aperture, still shows.
const LIGHT=`vec4 light(vec3 c){c*=vColor.a;return vec4(c,clamp(max(c.r,max(c.g,c.b)),0.0,1.0));}`;
// Across a quad is uv.x. A laser: a white-hot core inside its colour.
const LASER_FRAGMENT=`precision highp float;varying vec2 vUv0;varying vec4 vColor;${LIGHT}
void main(){float x=abs(vUv0.x*2.0-1.0);float core=1.0-smoothstep(0.0,0.3,x);float halo=(1.0-x)*(1.0-x);
gl_FragColor=light(vColor.rgb*(halo*0.85+core*0.6)+vec3(core*core*0.6));}`;
// A line the laser draws on the screen: a hot core in a soft glow, as on a projection surface.
const STROKE_FRAGMENT=`precision highp float;varying vec2 vUv0;varying vec4 vColor;${LIGHT}
void main(){float x=abs(vUv0.x*2.0-1.0);float core=1.0-smoothstep(0.0,0.28,x);float glow=exp(-x*x*5.0);
gl_FragColor=light(vColor.rgb*(glow*0.9+core*0.8)+vec3(core*0.7));}`;
// A moving head's beam: wide and soft to its edges.
const CONE_FRAGMENT=`precision highp float;varying vec2 vUv0;varying vec4 vColor;${LIGHT}
void main(){float x=abs(vUv0.x*2.0-1.0);gl_FragColor=light(vColor.rgb*pow(1.0-x,1.8));}`;
// A lens, a blinder or a laser's dot: a round glow with a white core and a cross of streaks.
const FLARE_FRAGMENT=`precision highp float;varying vec2 vUv0;varying vec4 vColor;${LIGHT}
void main(){vec2 p=vUv0*2.0-1.0;float r=length(p);if(r>1.0)discard;float glow=exp(-r*r*6.0),core=exp(-r*r*45.0);
float streak=(max(0.0,1.0-abs(p.y)*14.0)+max(0.0,1.0-abs(p.x)*14.0))*(1.0-r)*0.6;
gl_FragColor=light(vColor.rgb*(glow+streak)+vec3(core));}`;

/** Camera-facing quads rebuilt every frame in one draw call: light added over the scene. */
class QuadBatch {
  private readonly entity:pc.Entity;
  private readonly mesh:pc.Mesh;
  private readonly positions:Float32Array;private readonly uvs:Float32Array;private readonly colours:Float32Array;
  count=0;
  constructor(app:pc.Application,name:string,fragment:string,private readonly max:number){
    this.positions=new Float32Array(max*12);this.colours=new Float32Array(max*16);this.uvs=new Float32Array(max*8);
    const indices=new Uint16Array(max*6);
    for(let q=0;q<max;q++){this.uvs.set([0,0,1,0,0,1,1,1],q*8);indices.set([0,2,1,1,2,3].map(i=>i+q*4),q*6);}
    this.mesh=new pc.Mesh(app.graphicsDevice);
    this.mesh.setPositions(this.positions);this.mesh.setUvs(0,this.uvs);this.mesh.setColors(this.colours);this.mesh.setIndices(indices);this.mesh.update(pc.PRIMITIVE_TRIANGLES,false);
    const material=new pc.ShaderMaterial({uniqueName:`Stage show ${name}`,attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0,aColor:pc.SEMANTIC_COLOR},
      vertexGLSL:VERTEX,fragmentGLSL:fragment});
    // Added light; the canvas alpha only rises (MAX): a lowered alpha would let the page show through (see
    // BarScene.contactShadow), and over the telão's aperture the light must cover the video.
    material.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ONE,pc.BLENDMODE_ONE,pc.BLENDEQUATION_MAX,pc.BLENDMODE_ONE,pc.BLENDMODE_ONE);
    material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();
    const instance=new pc.MeshInstance(this.mesh,material);instance.cull=false;
    this.entity=new pc.Entity(`Stage show ${name}`);
    this.entity.addComponent('render',{meshInstances:[instance],castShadows:false,receiveShadows:false});
    this.entity.enabled=false;app.root.addChild(this.entity);
  }
  /** A quad: `a0`–`a1` across its start (uv.y 0), `b0`–`b1` across its end, with the colour's alpha at each end. */
  quad(a0:pc.Vec3,a1:pc.Vec3,b0:pc.Vec3,b1:pc.Vec3,colour:Rgb,alphaA:number,alphaB:number):void {
    if(this.count>=this.max)return;
    const q=this.count++,p=this.positions,c=this.colours;let o=q*12;
    for(const v of [a0,a1,b0,b1]){p[o++]=v.x;p[o++]=v.y;p[o++]=v.z;}
    for(let k=0,i=q*16;k<4;k++,i+=4){c[i]=colour[0];c[i+1]=colour[1];c[i+2]=colour[2];c[i+3]=k<2?alphaA:alphaB;}
  }
  /** Draws what was added since the last call. */
  end():void {
    this.entity.enabled=this.count>0;
    if(this.count){
      this.mesh.setPositions(this.positions);this.mesh.setUvs(0,this.uvs);this.mesh.setColors(this.colours);this.mesh.update(pc.PRIMITIVE_TRIANGLES,false);
      this.mesh.primitive[0]!.count=this.count*6;
    }
    this.count=0;
  }
}

interface Head {at:pc.Vec3;entity:pc.Entity;light:pc.LightComponent;yaw:number;pitch:number;target:[number,number];colour:Rgb;power:number}
export interface StageShowStatus {
  /** The show runs: something plays on the stage (or the desk has it on), or a cue fires. */
  live:boolean;
  /** 0 dark, 1 the whole show (it fades in and out). */
  level:number;
  /** The program and palette running now, and the beat within the program. */
  program:string;palette:string;beat:number;
  /** The desk's power (auto, on, off), tempo, master level and letreiro, and the cue running ('' for none). */
  power:string;bpm:number;master:number;text:string;cue:string;
  /** Lasers drawn in the last frame, and how many of them land on a surface (with a dot). */
  lasers:number;hits:number;
  /** Segments of a drawing traced on the telão in the last frame, and how far the telão is dimmed for them (0–1). */
  drawn:number;dim:number;
  /** Moving heads lit, and the strobe (0–1). */
  heads:number;flash:number;
}

const LASER_REACH=30,HEAD_REACH=16;
// The heads' beams open this much (radians, half-angle); their spot lights a little wider, so the pool shows.
const HEAD_SPREAD=.075,HEAD_INTENSITY=6,FLASH_INTENSITY=3.5;
// Full-scene flashes start at least this far apart (seconds): about 2 Hz, whatever the program or tempo. Faster flashes
// over the whole view can trigger seizures in people with photosensitive epilepsy.
const FLASH_GAP=.45;
// A drawn line's width on the telão (metres) and the fewest pixels it keeps from afar.
const STROKE_WIDTH=.11,STROKE_PIXELS=3;
// While something is drawn, the telão dims to this (its standby art, or its video) so the drawing reads.
const SCREEN_DIM=.78;

/**
 * The stage show, apart from the stage's own lights (stage-lights.ts colours those by the telão's video): lasers,
 * moving heads, blinders, a strobe and drawings traced on the telão, run from the light desk (StageShowState). Sixteen
 * programs take turns (or one stays) on a tempo counted from the server clock, so every browser shows the same program,
 * palette and beat at the same moment. The beams are camera-facing quads in additive batches (lasers, the heads' beams,
 * flares, and the drawn lines lying on the screen), cut where they meet the map's collision volumes with a dot where
 * they land; the heads and the strobe also light the scene with real lights.
 */
export class StageShow {
  private readonly lasers:QuadBatch;
  private readonly strokes:QuadBatch;
  private readonly cones:QuadBatch;
  private readonly flares:QuadBatch;
  private readonly heads:Head[];
  private readonly flash:pc.Entity;
  private level=0;
  private live=false;
  private status:Omit<StageShowStatus,'live'|'level'>={program:'',palette:'',beat:0,power:'auto',bpm:124,master:100,text:'',cue:'',lasers:0,hits:0,drawn:0,dim:0,heads:0,flash:0};
  /** How far the telão is dimmed under the drawings (BarScene applies it to the screen). */
  screenDim=0;
  // This frame: the camera, how bright the show is, the desk's levels, the strobe asked for, and the lenses that fired.
  private readonly eye=new pc.Vec3();private readonly right=new pc.Vec3();private readonly up=new pc.Vec3();
  private pixel=.001;private visible=0;private strobe=0;private master=1;private laserLevel=1;private headLevel=1;
  private readonly fired:Array<{at:pc.Vec3;colour:Rgb;alpha:number}>=[];
  private readonly dir=new pc.Vec3();private readonly along=new pc.Vec3();private readonly end=new pc.Vec3();private readonly tint=new pc.Color();private readonly view=new pc.Vec3();private readonly side=new pc.Vec3();
  private readonly corners=[new pc.Vec3(),new pc.Vec3(),new pc.Vec3(),new pc.Vec3()];
  private readonly ink=[new pc.Vec3(),new pc.Vec3(),new pc.Vec3()];
  private readonly show:Show;
  // The flash gate (FLASH_GAP): the local clock, when the last flash began, and whether one is on or held back.
  private clock=0;private flashStarted=-1e9;private flashOn=false;private flashHeld=false;
  /** The program drawn last, and when (local clock) another one came in. */
  private program='';private programAt=-1e9;

  constructor(app:pc.Application){
    this.lasers=new QuadBatch(app,'lasers',LASER_FRAGMENT,96);
    this.strokes=new QuadBatch(app,'strokes',STROKE_FRAGMENT,640);
    this.cones=new QuadBatch(app,'beams',CONE_FRAGMENT,8);
    this.flares=new QuadBatch(app,'flares',FLARE_FRAGMENT,160);
    this.heads=RIG.heads.map((at,i)=>{
      const entity=new pc.Entity(`Stage show head ${i+1}`);
      entity.addComponent('light',{type:'spot',enabled:false,color:new pc.Color(1,1,1),intensity:0,range:HEAD_REACH,innerConeAngle:HEAD_SPREAD*RAD*1.3,outerConeAngle:HEAD_SPREAD*RAD*2.4,castShadows:false});
      entity.setPosition(at);app.root.addChild(entity);
      return {at,entity,light:entity.light!,yaw:0,pitch:-.8,target:[0,-.8],colour:WHITE,power:0};
    });
    // The strobe: a wide white light on the truss facing the crowd (away from the telão, which would mirror it), on only
    // while it flashes.
    this.flash=new pc.Entity('Stage show strobe');
    this.flash.addComponent('light',{type:'spot',enabled:false,color:new pc.Color(.92,.96,1),intensity:0,range:18,innerConeAngle:40,outerConeAngle:72,castShadows:false});
    this.flash.setPosition(deck.x,rigY-.2,frontZ+.3);app.root.addChild(this.flash);
    this.flash.lookAt(deck.x,deck.minY,frontZ+6);this.flash.rotateLocal(90,0,0);
    this.show={t:0,beat:0,bar:0,beats:32,palette:[],text:'HIGHLAND',
      laser:(from,yaw,pitch,colour,power=1)=>this.laser(from,yaw,pitch,colour,power),
      aim:(from,to,colour,power=1)=>{const [yaw,pitch]=towards(from,to);this.laser(from,yaw,pitch,colour,power);},
      head:(index,yaw,pitch,colour,power=1)=>{const head=this.heads[index];if(head){head.target[0]=yaw;head.target[1]=pitch;head.colour=colour;head.power=power;}},
      strobe:amount=>{this.strobe=Math.max(this.strobe,amount);},
      draw:(drawing,how)=>this.drawing(drawing,how)};
  }

  /**
   * `stage`: something plays on the stage; `desk`: the light desk's settings (the house's when none came yet);
   * `daylight`: how much the sun washes the beams out (0 night, 1 noon).
   */
  update(dt:number,frame:{stage:boolean;desk?:StageShowState;serverNow:number;camera:pc.Entity;height:number;daylight:number}):void {
    const desk=frame.desk??DEFAULT_SHOW,moment=showMoment(desk,frame.serverNow),cue=moment.cue;
    this.clock+=Math.max(0,dt);
    // A cue lights the show by itself; a blackout is part of a running show.
    const live=desk.power==='on'||desk.power==='auto'&&frame.stage||!!cue&&cue.id!=='blackout';
    this.live=live;
    this.level+=((live?1:0)-this.level)*(1-Math.exp(-Math.min(dt,.1)*(live?2.5:1.4)));
    if(!live&&this.level<.004)this.level=0;
    const show=this.show,speed=desk.speed/100,palette=PALETTES.get(moment.palette)??PALETTES.get('highland')!;
    show.beat=moment.beat;show.beats=moment.beats;show.bar=moment.bar;show.t=moment.beat*BEAT*speed;show.palette=palette;show.text=desk.text||'HIGHLAND';
    this.status={program:cue?.id==='drop'?'drop':moment.program,palette:moment.palette,beat:+moment.beat.toFixed(2),power:desk.power,bpm:desk.bpm,master:desk.master,
      text:show.text,cue:cue?.id??'',lasers:0,hits:0,drawn:0,dim:0,heads:0,flash:0};
    // The blackout: nothing for its bar, and back with a flash.
    const blackout=cue?.id==='blackout',afterBlackout=desk.cue==='blackout'?frame.serverNow-desk.cueAt-4*moment.beatMs:-1;
    if(!this.level||blackout){this.flashGate(0);this.dark();this.dimScreen(dt,0);return;}
    this.visible=this.level*(1-.55*frame.daylight)*desk.master/100;
    this.master=desk.master/100;this.laserLevel=desk.lasers/100;this.headLevel=desk.heads/100;
    const camera=frame.camera;
    this.eye.copy(camera.getPosition());this.right.copy(camera.right);this.up.copy(camera.up);
    this.pixel=2*Math.tan((camera.camera?.fov??57)*Math.PI/360)/Math.max(1,frame.height);
    this.strobe=0;this.fired.length=0;
    for(const head of this.heads)head.power=0;
    // The Drop runs on its own beat, from when it fired.
    if(cue?.id==='drop'){show.beat=cue.beat;show.bar=Math.floor(cue.beat/4);show.beats=cue.beats;show.t=cue.beat*BEAT*speed;this.status.beat=+cue.beat.toFixed(2);drop(show);}
    else PROGRAMS[moment.program](show);
    if(cue?.id==='flash')this.strobe=Math.max(this.strobe,Math.exp(-cue.ms/140));
    // A new program comes in with a flash on its first beat (a program picked on the desk too), and so does the end of a
    // blackout.
    if(this.program!==this.status.program){this.program=this.status.program;this.programAt=this.clock;}
    const seconds=moment.beat*moment.beatMs/1000,since=this.clock-this.programAt;
    const entry=Math.max(seconds<.6?Math.exp(-seconds/.12):0,since<.6?Math.exp(-since/.12):0,afterBlackout>=0&&afterBlackout<600?Math.exp(-afterBlackout/120):0);
    const flash=this.flashGate(Math.max(this.strobe,entry)*desk.strobe/100);
    this.drawHeads(dt);
    for(const lens of this.fired)this.flare(lens.at,.24,6,lens.colour,lens.alpha);
    // Blinders: the truss and the PA stacks flare white with the strobe, and the strobe's light hits the backyard.
    if(flash>.02)for(const at of BLINDERS)this.flare(at,.5,9,WHITE,flash*this.visible*.6);
    const strobe=this.flash.light!;strobe.intensity=FLASH_INTENSITY*flash*this.level*this.master;strobe.enabled=strobe.intensity>.05;
    this.status.flash=+flash.toFixed(3);
    this.dimScreen(dt,this.status.drawn?SCREEN_DIM*this.level:0);
    this.lasers.end();this.strokes.end();this.cones.end();this.flares.end();
  }

  /** The telão eases towards `target` dimness: about half a second either way. */
  private dimScreen(dt:number,target:number):void {
    this.screenDim+=(target-this.screenDim)*(1-Math.exp(-Math.min(dt,.1)*4));
    if(Math.abs(target-this.screenDim)<.002)this.screenDim=target;
    this.status.dim=+this.screenDim.toFixed(3);
  }

  /** Lets a flash start only FLASH_GAP after the last one began; one held back stays off until it has faded. */
  private flashGate(amount:number):number {
    if(amount<.25){this.flashOn=false;this.flashHeld=false;return amount;}
    if(this.flashOn)return amount;
    if(this.flashHeld)return 0;
    if(this.clock-this.flashStarted>=FLASH_GAP){this.flashOn=true;this.flashStarted=this.clock;return amount;}
    this.flashHeld=true;return 0;
  }

  private dark():void {
    for(const head of this.heads)head.light.enabled=false;
    this.flash.light!.enabled=false;
    this.lasers.end();this.strokes.end();this.cones.end();this.flares.end();
  }

  private laser(from:pc.Vec3,yaw:number,pitch:number,colour:Rgb,power:number):void {
    const alpha=this.visible*this.laserLevel*power;if(alpha<.01)return;
    const d=direction(yaw,pitch,this.dir),reach=cast(from,d,LASER_REACH),landed=reach<LASER_REACH;
    const end=this.end.copy(d).mulScalar(reach).add(from);
    // A laser spreads a little with distance; it fades into the night when it lands nowhere.
    this.beam(this.lasers,from,end,.026,.026+reach*.0025,3,colour,alpha,landed?alpha*.65:0);
    if(landed){this.flare(end.sub(d.mulScalar(.03)),.1,4,colour,alpha);this.status.hits++;}
    this.lens(from,colour,alpha);
    this.status.lasers++;
  }
  private lens(at:pc.Vec3,colour:Rgb,alpha:number):void {if(!this.fired.some(lens=>lens.at===at))this.fired.push({at,colour,alpha});}

  /** Where unit point (`u`, `v`) of a drawing lands on the telão. */
  private onCanvas(u:number,v:number,how:Trace,scale:number,out:pc.Vec3):pc.Vec3 {
    const turn=how.turn??0,c=Math.cos(turn),s=Math.sin(turn),x=(how.x??0)+(u*c-v*s)*scale,y=(how.y??0)+(u*s+v*c)*scale;
    return out.copy(CANVAS.centre).add(this.side.copy(CANVAS.right).mulScalar(x)).add(this.view.copy(CANVAS.up).mulScalar(y));
  }

  /**
   * Traces the part `from`–`to` of a drawing on the telão: each segment a glowing line lying on the screen (the laser
   * blanks between strokes), the dot where the laser is, and its beam from the projector on the truss.
   */
  private drawing(drawing:Drawing,how:Trace):void {
    const alpha=this.visible*this.laserLevel*how.power;if(alpha<.01||how.to<=how.from)return;
    const scale=how.scale??Math.min(CANVAS.width*.9/drawing.width,CANVAS.height*(drawing.height>7?.62:.3)/drawing.height);
    const from=how.from*drawing.length,to=how.to*drawing.length,s=drawing.segments,half=drawing.width/2||1;
    const [a,b,pen]=this.ink as [pc.Vec3,pc.Vec3,pc.Vec3];let penColour:Rgb|undefined;
    for(let i=0;i<s.length;i+=6){
      const start=s[i+4]!,length=s[i+5]!,lo=Math.max(from,start),hi=Math.min(to,start+length);
      if(hi<=lo)continue;
      const f0=(lo-start)/length,f1=(hi-start)/length,x0=s[i]!,y0=s[i+1]!,dx=s[i+2]!-x0,dy=s[i+3]!-y0;
      this.onCanvas(x0+dx*f0,y0+dy*f0,how,scale,a);this.onCanvas(x0+dx*f1,y0+dy*f1,how,scale,b);
      const colour=how.colour((x0+dx*(f0+f1)/2)/half);
      this.line(a,b,colour,alpha);this.status.drawn++;
      if(how.pen==='end'&&hi>=to-1e-6){pen.copy(b);penColour=colour;}
      if(how.pen==='start'&&lo<=from+1e-6&&!penColour){pen.copy(a);penColour=colour;}
    }
    if(!penColour)return;
    // The laser's dot, and its beam from the projector: what writes.
    this.flare(pen,.16,5,WHITE,alpha);this.flare(pen,.3,7,penColour,alpha*.8);
    this.beam(this.lasers,PROJECTOR,pen,.03,.03,3,penColour,alpha,alpha);
    this.lens(PROJECTOR,penColour,alpha);
  }

  /** A drawn line from `a` to `b` lying on the telão, never under STROKE_PIXELS across. */
  private line(a:pc.Vec3,b:pc.Vec3,colour:Rgb,alpha:number):void {
    const [a0,a1,b0,b1]=this.corners as [pc.Vec3,pc.Vec3,pc.Vec3,pc.Vec3];
    const along=this.along.sub2(b,a),length=along.length();if(length<1e-5)return;
    along.mulScalar(1/length);
    // Across the line within the screen's plane; slightly longer than the segment so corners close up.
    const across=this.side.cross(CANVAS.normal,along).normalize(),half=Math.max(STROKE_WIDTH,this.view.sub2(a,this.eye).length()*this.pixel*STROKE_PIXELS)/2;
    const shown=alpha*Math.min(1,Math.max(.35,STROKE_WIDTH/(2*half)));
    a0.copy(a).sub(this.view.copy(along).mulScalar(half*.5)).add(this.end.copy(across).mulScalar(half));
    a1.copy(a).sub(this.view.copy(along).mulScalar(half*.5)).sub(this.end.copy(across).mulScalar(half));
    b0.copy(b).add(this.view.copy(along).mulScalar(half*.5)).add(this.end.copy(across).mulScalar(half));
    b1.copy(b).add(this.view.copy(along).mulScalar(half*.5)).sub(this.end.copy(across).mulScalar(half));
    this.strokes.quad(a0,a1,b0,b1,colour,shown,shown);
  }

  /** The heads travel towards where the program points them (they are motors, not mirrors) and light the scene. */
  private drawHeads(dt:number):void {
    const ease=1-Math.exp(-Math.min(dt,.1)*5);
    for(const head of this.heads){
      head.yaw+=(head.target[0]-head.yaw)*ease;head.pitch+=(head.target[1]-head.pitch)*ease;
      const power=head.power*this.headLevel*this.visible;
      if(power<.01){head.light.enabled=false;continue;}
      const d=direction(head.yaw,head.pitch,this.dir),reach=cast(head.at,d,HEAD_REACH),end=this.end.copy(d).mulScalar(reach).add(head.at);
      const spread=Math.tan(HEAD_SPREAD)*2;
      this.beam(this.cones,head.at,end,.24,.24+reach*spread,0,head.colour,.34*power,(reach<HEAD_REACH?.1:0)*power);
      this.flare(head.at,.34,8,head.colour,power);
      head.entity.lookAt(end);head.entity.rotateLocal(90,0,0);
      head.light.color=this.tint.set(head.colour[0],head.colour[1],head.colour[2]);
      head.light.intensity=HEAD_INTENSITY*head.power*this.headLevel*this.level*this.master;head.light.enabled=true;
      this.status.heads++;
    }
  }

  /** A beam from `a` to `b` turned to face the camera: `wa`/`wb` metres wide at each end, never under `px` pixels. */
  private beam(batch:QuadBatch,a:pc.Vec3,b:pc.Vec3,wa:number,wb:number,px:number,colour:Rgb,alphaA:number,alphaB:number):void {
    const [a0,a1,b0,b1]=this.corners as [pc.Vec3,pc.Vec3,pc.Vec3,pc.Vec3],along=this.along.sub2(b,a).normalize();
    batch.quad(a0,a1,b0,b1,colour,this.edge(a,along,wa,px,alphaA,a0,a1),this.edge(b,along,wb,px,alphaB,b0,b1));
  }

  /** One end of a beam: its two corners, and its alpha (a beam widened to stay visible keeps about its brightness). */
  private edge(p:pc.Vec3,along:pc.Vec3,width:number,px:number,alpha:number,out0:pc.Vec3,out1:pc.Vec3):number {
    this.view.sub2(p,this.eye);
    const half=Math.max(width,this.view.length()*this.pixel*px)/2,side=this.side.cross(along,this.view);
    const length=side.length();if(length<1e-6)side.copy(this.up);else side.mulScalar(1/length);
    out0.copy(side).mulScalar(half).add(p);out1.copy(side).mulScalar(-half).add(p);
    return alpha*Math.min(1,Math.max(.3,width/(2*half)));
  }

  /** A round glow facing the camera, never under `px` pixels across. */
  private flare(p:pc.Vec3,size:number,px:number,colour:Rgb,alpha:number):void {
    const half=Math.max(size,this.view.sub2(p,this.eye).length()*this.pixel*px)/2,[a0,a1,b0,b1]=this.corners as [pc.Vec3,pc.Vec3,pc.Vec3,pc.Vec3];
    const r=this.side.copy(this.right).mulScalar(half),u=this.view.copy(this.up).mulScalar(half);
    a0.copy(p).sub(r).sub(u);a1.copy(p).add(r).sub(u);b0.copy(p).sub(r).add(u);b1.copy(p).add(r).add(u);
    this.flares.quad(a0,a1,b0,b1,colour,alpha,alpha);
  }

  telemetry():StageShowStatus {return {live:this.live,level:+this.level.toFixed(3),...this.status};}
}
