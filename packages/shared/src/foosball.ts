import {z} from 'zod';
import map from './map-data.json';

/**
 * Pebolim at the two tables of the upstairs games hall (P_Pebolim in the map, 05_props.py): the table, its rods and its
 * ball, the physics both the room and the browsers run, and the rules, after the ITSF's (International Table Soccer
 * Federation) short rules and the British federation's simplified ones: the serve from the middle figure of the 5-rod
 * after a "ready?", a goal from any figure (in and out still counts), no spinning, the ball held at most 10 s on the
 * 5-rod and 15 s anywhere else (goalie and 2-rod as one, over it the ball goes to the other team), the serve to whoever
 * conceded. A still ball is always within some figure's reach here, so it is never "dead": its rod's clock runs. The
 * room owns the match (apps/server/src/minigames/foosball.ts); docs/sistemas/pebolim.md tells the whole story.
 *
 * Table frame, in metres: x along the table (red defends the goal at -x and attacks +x), y across it, the playfield
 * centred on 0. In the bar, x runs with the world's x and y with its z (FOOSBALL_TABLES).
 */
export type FoosballTeam='red'|'blue';
export type FoosballRodKind='goalie'|'defense'|'midfield'|'attack';
export type FoosballFormat='1x1'|'2x2';
/** Who holds which rods: everything in 1x1; goalie and 2-rod (defense) or 5- and 3-rod (attack) in 2x2. */
export type FoosballRole='solo'|'defense'|'attack';
/** The house's player, Zé do Totó, three nights of him: after a few too many, as usual, or sober. */
export type FoosballLevel='facil'|'medio'|'dificil';
export type FoosballPhase='lobby'|'kickoff'|'playing'|'goal'|'paused'|'set'|'finished';

export const FOOSBALL_TEAMS:readonly FoosballTeam[]=['red','blue'];
export const FOOSBALL_LEVELS:readonly FoosballLevel[]=['facil','medio','dificil'];
export const TEAM_NAMES:Record<FoosballTeam,string>={red:'Vermelho',blue:'Azul'};
export const LEVEL_NAMES:Record<FoosballLevel,string>={facil:'Tomou todas',medio:'Na média',dificil:'Sóbrio'};
export const ROLE_NAMES:Record<FoosballRole,string>={solo:'Os quatro bastões',defense:'Goleiro e zaga',attack:'Meio e ataque'};
export const ROD_NAMES:Record<FoosballRodKind,string>={goalie:'goleiro',defense:'zaga',midfield:'meio',attack:'ataque'};
export const CPU_NAME='Zé do Totó';
export const otherTeam=(team:FoosballTeam):FoosballTeam=>team==='red'?'blue':'red';
/** +1 when the team attacks towards +x (red), -1 otherwise. */
export const attackDir=(team:FoosballTeam)=>team==='red'?1:-1;

export const FOOSBALL={
  /** The felt, as modelled (1.12 × 0.64 m), and the goal mouth in the middle of each end. */
  length:1.12,width:0.64,goalWidth:.2,
  /** ITSF balls are 34–36 mm. */
  ballRadius:.0175,
  /** A figure from above: its width across the table, its depth along it, from the rod's axis to the toe, and the angle past
   *  which its foot clears the ball (the ball rolls underneath). */
  man:{halfWidth:.012,halfDepth:.009,foot:.075,block:.98},
  /** How far from the middle the outermost figure of each rod reaches (the bumpers stop it there). */
  reach:.29,
  /** Lateral speed and acceleration of a rod in a quick hand (m/s, m/s²). */
  rodSpeed:3.2,rodAccel:70,
  /** A kick: wind-up (feet back and up, over a ball just behind the figure) to `wind` radians in windMs, then the strike at
   *  `strike` rad/s up to `follow`, then back to rest. Both grow with the power (0–1), a tap passing and a full charge a
   *  bomb. A ball behind the figure, out of the forward swing's reach, is knocked back instead (the back pass: `backPower`
   *  of the charge), towards the team's own rods that face it. */
  kick:{windMs:70,wind:[.8,1.15] as const,strike:[16,46] as const,follow:1.25,recoverMs:200,backPower:.45},
  /** Figures raised (feet towards the other goal) so that the ball goes under; a team's rods ahead of the one that strikes
   *  rise by themselves for autoLiftMs, so its own shot is not blocked by its own figures. */
  liftAngle:1.45,liftSpeed:20,autoLiftMs:280,
  /** Rolling on felt: a constant deceleration and a drag (per second), the fastest a ball goes, and the bounces. */
  ball:{decel:.22,drag:.22,maxSpeed:6.5,wall:.72,post:.6},
  /** Bounces off a figure: struck, simply in the way, or trapped (a slow ball dies at a still figure, as a player
   *  stops it); `grip` is how much of the figure's sideways motion the ball takes on (pull and push shots). */
  bounce:{strike:.45,block:.32,trap:.08,trapSpeed:.7,grip:.35},
  /** The table's slopes: along the side walls the ball rolls back towards the middle, and out of the corners behind the
   *  goalies towards the field (never along the end wall into the goal). */
  slope:{wall:.035,accel:.45,corner:.35},
  /** Physics steps: ticks per second, sub-steps per tick (no tunnelling through a figure at full speed), and every how
   *  many ticks a frame goes to the browsers (30 a second). */
  tickHz:60,substeps:10,frameEvery:2,
  goalOptions:[3,5,7,10] as const,defaultGoals:5,setOptions:[1,3] as const,
  /** "Pronto?" before a serve, a restart after a foul, the goal, the end of a set and the result on the table. */
  kickoffMs:2400,restartMs:1500,goalMs:2600,setMs:4200,finishedMs:9000,
  /** ITSF time limits: 10 s on the 5-rod, 15 s on any other (goalie and 2-rod count as one). */
  possession:{midfield:10_000,other:15_000},
  /** How long a match waits for a player whose connection dropped; then their team loses (W.O.). */
  pauseMs:20_000,
  /** A match with coins on it: the limits (price table foosball:min-bet / foosball:max-bet) and the chips offered. */
  minBet:10,maxBet:500,stakeChips:[10,25,50,100,250,500] as const,
} as const;
/** A match with a stake pays the winners twice what each put in (the losers' coins); the API refuses anything above. */
export const FOOSBALL_MAX_RETURN=2;

export interface FoosballRod {index:number;x:number;team:FoosballTeam;kind:FoosballRodKind;men:number;spacing:number;travel:number}
// As on the table in the map: red goalie, red 2-rod, blue 3-rod, red 5-rod, blue 5-rod, red 3-rod, blue 2-rod, blue goalie.
const LAYOUT:ReadonlyArray<readonly [FoosballTeam,FoosballRodKind]>=[['red','goalie'],['red','defense'],['blue','attack'],['red','midfield'],
  ['blue','midfield'],['red','attack'],['blue','defense'],['blue','goalie']];
const MEN:Record<FoosballRodKind,number>={goalie:1,defense:2,midfield:5,attack:3};
const SPACING:Record<FoosballRodKind,number>={goalie:0,defense:.24,midfield:.12,attack:.19};
/**
 * Every rod, 14 cm apart; each one's travel lets its outermost figure reach FOOSBALL.reach. The goalie is a single figure, as
 * on the Brazilian table (1 + 2 + 5 + 3, eleven a side), and travels far enough to clear its corners.
 */
export const FOOSBALL_RODS:readonly FoosballRod[]=LAYOUT.map(([team,kind],index)=>{
  const men=MEN[kind],spacing=SPACING[kind];
  return {index,x:-.49+index*.14,team,kind,men,spacing,travel:kind==='goalie'?.24:FOOSBALL.reach-(men-1)/2*spacing};
});
const ROLE_KINDS:Record<FoosballRole,readonly FoosballRodKind[]>={solo:['goalie','defense','midfield','attack'],defense:['goalie','defense'],attack:['midfield','attack']};
/** The rods a team's role holds. */
export const rodsOf=(team:FoosballTeam,role:FoosballRole):FoosballRod[]=>FOOSBALL_RODS.filter(r=>r.team===team&&ROLE_KINDS[role].includes(r.kind));
/** Where the k-th figure of a rod is across the table, with the rod at `offset`. */
export const manY=(rod:FoosballRod,k:number,offset:number)=>(k-(rod.men-1)/2)*rod.spacing+offset;
const clampTo=(v:number,limit:number)=>Math.max(-limit,Math.min(limit,v));

/**
 * The offset that puts one of the rod's figures in front of `y` (the pointer): of the figures able to get there, the one
 * needing the least travel from where the rod is, so that the rod never jumps from one figure to another while the
 * pointer moves a little. Out of reach, the nearest a figure gets.
 */
export function aimOffset(rod:FoosballRod,y:number,current:number):number {
  let best=current,bestMiss=Infinity,bestMove=Infinity;
  for(let k=0;k<rod.men;k++){
    const offset=clampTo(y-manY(rod,k,0),rod.travel),miss=Math.abs(manY(rod,k,offset)-y),move=Math.abs(offset-current);
    if(miss<bestMiss-1e-4||(Math.abs(miss-bestMiss)<=1e-4&&move<bestMove)){best=offset;bestMiss=miss;bestMove=move;}
  }
  return best;
}

// ── Physics ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FoosballBall {x:number;y:number;vx:number;vy:number}
export interface FoosballRodState {
  offset:number;vy:number;target:number;angle:number;omega:number;
  /** A kick in progress: when it began (sim ms), how hard, and whether it knocks the ball back (towards the own goal). */
  kick?:{at:number;power:number;back?:boolean};
  /** Held up by the player (Shift, right button), and raised by itself until then (FOOSBALL.autoLiftMs). */
  lift:boolean;autoLiftUntil:number;
}
export type FoosballEvent=
  |{kind:'wall'|'post';speed:number}
  |{kind:'man'|'kick';speed:number;rod:number;team:FoosballTeam}
  |{kind:'goal';team:FoosballTeam;speed:number};
export interface FoosballSim {
  /** Simulation clock (ms). */
  time:number;
  ball:FoosballBall;rods:FoosballRodState[];
  /** The ball held still (before a serve, after a goal): the rods still move. */
  frozen:boolean;
  /** What happened since the room last read them (sounds, rules). */
  events:FoosballEvent[];
}

export function createSim(time=0):FoosballSim {
  return {time,ball:{x:0,y:0,vx:0,vy:0},frozen:true,events:[],
    rods:FOOSBALL_RODS.map(()=>({offset:0,vy:0,target:0,angle:0,omega:0,lift:false,autoLiftUntil:0}))};
}

const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>t<=0?0:t>=1?1:t*t*(3-2*t);
/** The figures do not touch the ball: raised, or swinging back before a strike. */
export function rodClear(rod:FoosballRodState,time:number):boolean {
  if(rod.autoLiftUntil>time)return true;
  if(rod.kick&&time-rod.kick.at<FOOSBALL.kick.windMs)return true;
  return Math.abs(rod.angle)>=FOOSBALL.man.block;
}

/** Moves a rod sideways towards its target and turns its figures: a kick's swing, raised or at rest. */
export function stepRod(rod:FoosballRodState,def:FoosballRod,dt:number,time:number):void {
  const target=clampTo(rod.target,def.travel),want=Math.max(-FOOSBALL.rodSpeed,Math.min(FOOSBALL.rodSpeed,(target-rod.offset)/Math.max(dt,1e-4)));
  const change=FOOSBALL.rodAccel*dt;
  rod.vy=Math.max(rod.vy-change,Math.min(rod.vy+change,want));
  // Never past the target: a rod stopping on a figure does not wobble around it.
  const next=rod.offset+rod.vy*dt;
  rod.offset=(target-rod.offset)*(target-next)<=0?target:next;
  if(rod.offset===target&&Math.abs(want)<1e-3)rod.vy=0;
  rod.offset=clampTo(rod.offset,def.travel);
  const before=rod.angle;
  if(rod.kick){
    // A back pass is the same swing mirrored: feet forward and up, then down and back.
    const {windMs,wind,strike,follow,recoverMs}=FOOSBALL.kick,t=time-rod.kick.at,p=rod.kick.power,s=rod.kick.back?-1:1;
    const back=-s*lerp(wind[0],wind[1],p),speed=s*lerp(strike[0],strike[1],p),end=s*follow,strikeMs=(end-back)/speed*1000;
    if(t<windMs)rod.angle=lerp(rod.angle,back,Math.min(1,dt*1000/Math.max(1,windMs-t)));
    else if(t<windMs+strikeMs)rod.angle=back+speed*(t-windMs)/1000;
    else if(t<windMs+strikeMs+recoverMs)rod.angle=end*(1-smooth((t-windMs-strikeMs)/recoverMs));
    else {rod.angle=0;rod.kick=undefined;}
  }else{
    const raised=rod.lift||rod.autoLiftUntil>time,goal=raised?FOOSBALL.liftAngle:0,step=FOOSBALL.liftSpeed*dt;
    rod.angle=Math.abs(goal-rod.angle)<=step?goal:rod.angle+Math.sign(goal-rod.angle)*step;
  }
  rod.omega=dt>0?(rod.angle-before)/dt:0;
}

/** Starts a kick on a rod (a kick in progress goes on); `back` knocks the ball back instead, softly. */
export function startKick(rod:FoosballRodState,power:number,time:number,back=false):void {
  if(rod.kick)return;
  const p=Math.max(0,Math.min(1,power));
  rod.kick={at:time,power:back?p*FOOSBALL.kick.backPower:p,...(back?{back}:{})};rod.autoLiftUntil=0;
}
/**
 * Which way a rod's kick goes: back (a back pass) when the ball is behind one of its figures, beyond what the forward
 * swing reaches (from above, it comes down behind a ball up to 5 cm back) but within the backward one; forward otherwise.
 */
export function kicksBack(def:FoosballRod,rod:FoosballRodState,ball:FoosballBall):boolean {
  // Never the goalie: behind it there is only its own goal.
  const ahead=(ball.x-def.x)*attackDir(def.team);
  if(def.kind==='goalie'||ahead>-.05||ahead<-.1)return false;
  for(let k=0;k<def.men;k++)if(Math.abs(manY(def,k,rod.offset)-ball.y)<FOOSBALL.man.halfWidth+R)return true;
  return false;
}

const HALF_L=FOOSBALL.length/2,HALF_W=FOOSBALL.width/2,HALF_GOAL=FOOSBALL.goalWidth/2,R=FOOSBALL.ballRadius;

/** One tick of the table (`dt` seconds): rods, then the ball in sub-steps against walls, posts and figures. */
export function stepSim(sim:FoosballSim,dt:number):void {
  const steps=FOOSBALL.substeps,h=dt/steps;
  for(let s=0;s<steps;s++){
    sim.time+=h*1000;
    sim.rods.forEach((rod,i)=>stepRod(rod,FOOSBALL_RODS[i]!,h,sim.time));
    if(!sim.frozen&&stepBall(sim,h))return;
  }
}

/** True once a goal is in: the ball stays where it went in. */
function stepBall(sim:FoosballSim,h:number):boolean {
  const b=sim.ball,{slope,ball:k}=FOOSBALL;
  // The slopes along the side walls and in the corners behind the goalies.
  if(Math.abs(b.y)>HALF_W-slope.wall)b.vy-=Math.sign(b.y)*slope.accel*h;
  if(Math.abs(b.x)>HALF_L-.06&&Math.abs(b.y)>HALF_GOAL)b.vx-=Math.sign(b.x)*slope.corner*h;
  let speed=Math.hypot(b.vx,b.vy);
  if(speed>0){
    const next=Math.max(0,speed-k.decel*h)*(1-k.drag*h),scale=speed>k.maxSpeed?k.maxSpeed/speed:next/speed;
    b.vx*=scale;b.vy*=scale;speed=Math.hypot(b.vx,b.vy);
    if(speed<.004){b.vx=0;b.vy=0;}
  }
  b.x+=b.vx*h;b.y+=b.vy*h;
  // In the goal: past the line, the ball is in (whatever it does next, it counts).
  if(Math.abs(b.x)>HALF_L+R){
    sim.events.push({kind:'goal',team:b.x>0?'red':'blue',speed:Math.hypot(b.vx,b.vy)});
    b.vx=0;b.vy=0;sim.frozen=true;return true;
  }
  const inMouth=Math.abs(b.y)<HALF_GOAL;
  if(Math.abs(b.x)>HALF_L-R&&!inMouth){
    b.x=Math.sign(b.x)*(HALF_L-R);
    if(b.vx*Math.sign(b.x)>0){sim.events.push({kind:'wall',speed:Math.abs(b.vx)});b.vx=-b.vx*k.wall;}
  }
  // The goal's own sides, once the ball is between the posts and past the line.
  if(Math.abs(b.x)>HALF_L&&Math.abs(b.y)>HALF_GOAL-R){b.y=Math.sign(b.y)*(HALF_GOAL-R);if(b.vy*Math.sign(b.y)>0)b.vy=-b.vy*k.wall;}
  if(Math.abs(b.y)>HALF_W-R){
    b.y=Math.sign(b.y)*(HALF_W-R);
    if(b.vy*Math.sign(b.y)>0){sim.events.push({kind:'wall',speed:Math.abs(b.vy)});b.vy=-b.vy*k.wall;}
  }
  // The posts: the corners of each goal mouth.
  for(const px of [-HALF_L,HALF_L])for(const py of [-HALF_GOAL,HALF_GOAL]){
    const dx=b.x-px,dy=b.y-py,d=Math.hypot(dx,dy);
    if(d>=R||d<1e-9)continue;
    const nx=dx/d,ny=dy/d,vn=b.vx*nx+b.vy*ny;
    b.x=px+nx*R;b.y=py+ny*R;
    if(vn<0){b.vx-=(1+k.post)*vn*nx;b.vy-=(1+k.post)*vn*ny;sim.events.push({kind:'post',speed:-vn});}
  }
  collideFigures(sim);
  return false;
}

/** The ball against every figure that can touch it: a box under the rod, its foot moved by the swing. */
function collideFigures(sim:FoosballSim):void {
  const b=sim.ball,{man,bounce}=FOOSBALL;
  for(let i=0;i<FOOSBALL_RODS.length;i++){
    const def=FOOSBALL_RODS[i]!,rod=sim.rods[i]!;
    // Only rods near enough to reach the ball with a foot.
    if(Math.abs(b.x-def.x)>man.foot+man.halfDepth+R||rodClear(rod,sim.time))continue;
    const dir=attackDir(def.team),mx=def.x+dir*man.foot*Math.sin(rod.angle),fvx=dir*man.foot*Math.cos(rod.angle)*rod.omega,fvy=rod.vy;
    for(let k=0;k<def.men;k++){
      const my=manY(def,k,rod.offset);
      const cx=Math.max(mx-man.halfDepth,Math.min(mx+man.halfDepth,b.x)),cy=Math.max(my-man.halfWidth,Math.min(my+man.halfWidth,b.y));
      let nx=b.x-cx,ny=b.y-cy,d=Math.hypot(nx,ny);
      if(d>=R)continue;
      if(d<1e-9){
        // The centre went inside the figure: out along the shallowest side.
        const px=man.halfDepth-Math.abs(b.x-mx),py=man.halfWidth-Math.abs(b.y-my);
        if(px<py){nx=Math.sign(b.x-mx)||-dir;ny=0;}else{nx=0;ny=Math.sign(b.y-my)||1;}
        b.x=px<py?mx+nx*(man.halfDepth+R):b.x;b.y=px<py?b.y:my+ny*(man.halfWidth+R);
      }else{nx/=d;ny/=d;b.x=cx+nx*R;b.y=cy+ny*R;}
      const rvx=b.vx-fvx,rvy=b.vy-fvy,vn=rvx*nx+rvy*ny;
      if(vn>=0)continue;
      // A strike swings the feet forward (or back, in a back pass); the way back after it only pushes, like a figure in the way.
      const striking=(rod.kick?.back?-rod.omega:rod.omega)>6,e=striking?bounce.strike:-vn<bounce.trapSpeed?bounce.trap:bounce.block;
      // The normal part bounces; the sideways part takes some of the figure's motion (grip), as rubber on a ball does.
      const tx=rvx-vn*nx,ty=rvy-vn*ny;
      b.vx=fvx+tx*(1-bounce.grip)-e*vn*nx;b.vy=fvy+ty*(1-bounce.grip)-e*vn*ny;
      const speed=Math.hypot(b.vx,b.vy);
      sim.events.push({kind:striking?'kick':'man',speed,rod:i,team:def.team});
      // A struck ball goes past the striker's own figures ahead of it (they rise for a moment).
      if(striking&&!rod.kick?.back)for(let j=0;j<FOOSBALL_RODS.length;j++){
        const other=FOOSBALL_RODS[j]!;
        if(other.team===def.team&&j!==i&&(other.x-def.x)*dir>0){sim.rods[j]!.autoLiftUntil=sim.time+FOOSBALL.autoLiftMs;sim.rods[j]!.kick=undefined;}
      }
    }
  }
}

/** Puts the ball still in front of a rod's figure nearest to the middle (a serve or a restart). */
export function placeBall(sim:FoosballSim,rodIndex:number):void {
  const def=FOOSBALL_RODS[rodIndex]!,rod=sim.rods[rodIndex]!;
  const k=Math.floor(def.men/2),dir=attackDir(def.team);
  sim.ball={x:def.x+dir*(FOOSBALL.man.halfDepth+R+.004),y:manY(def,k,rod.offset),vx:0,vy:0};
  sim.frozen=true;
}
/** The rod of a team of that kind. */
export const rodIndex=(team:FoosballTeam,kind:FoosballRodKind)=>FOOSBALL_RODS.findIndex(r=>r.team===team&&r.kind===kind);
/** Which rod's strip the ball is in (each rod rules the 14 cm around it). */
export const stripOf=(x:number)=>Math.max(0,Math.min(FOOSBALL_RODS.length-1,Math.floor((x+HALF_L)/(FOOSBALL.length/FOOSBALL_RODS.length))));

// ── Frames: what the room sends 30 times a second ─────────────────────────────────────────────────────────────────────

/** Ball (x, y in tenths of a millimetre; speeds in mm/s), each rod's offset (tenths of a mm) and angle (mrad). */
export interface FoosballFrame {id:string;t:number;b:[number,number,number,number];r:number[];f:0|1;
  /** Sounds since the last frame: [kind (0 wall, 1 post, 2 figure, 3 kick), speed mm/s]. */
  s?:number[]}
const SOUND_KINDS={wall:0,post:1,man:2,kick:3} as const;
export function encodeFrame(id:string,sim:FoosballSim,serverTime:number,events:readonly FoosballEvent[]=[]):FoosballFrame {
  const b=sim.ball,sounds=events.filter(e=>e.kind!=='goal').slice(-6).flatMap(e=>[SOUND_KINDS[e.kind as keyof typeof SOUND_KINDS],Math.round(e.speed*1000)]);
  return {id,t:serverTime,b:[Math.round(b.x*1e4),Math.round(b.y*1e4),Math.round(b.vx*1000),Math.round(b.vy*1000)],
    r:sim.rods.flatMap(r=>[Math.round(r.offset*1e4),Math.round(r.angle*1000)]),f:sim.frozen?1:0,...(sounds.length?{s:sounds}:{})};
}
export function decodeFrame(frame:FoosballFrame):{t:number;ball:FoosballBall;rods:Array<{offset:number;angle:number}>;frozen:boolean;sounds:Array<{kind:'wall'|'post'|'man'|'kick';speed:number}>} {
  const kinds=['wall','post','man','kick'] as const,sounds:Array<{kind:typeof kinds[number];speed:number}>=[];
  for(let i=0;i+1<(frame.s?.length??0);i+=2)sounds.push({kind:kinds[frame.s![i]!]??'wall',speed:frame.s![i+1]!/1000});
  return {t:frame.t,ball:{x:frame.b[0]/1e4,y:frame.b[1]/1e4,vx:frame.b[2]/1000,vy:frame.b[3]/1000},
    rods:FOOSBALL_RODS.map((_,i)=>({offset:(frame.r[i*2]??0)/1e4,angle:(frame.r[i*2+1]??0)/1000})),frozen:frame.f===1,sounds};
}

// ── The tables in the bar ─────────────────────────────────────────────────────────────────────────────────────────────

export interface FoosballTablePlace {id:string;number:number;x:number;y:number;z:number;collider:string;hx:number;hz:number}
/** The tables of the map (COL_Mob_Pebolim*), numbered from the stairs' side (lowest x first). */
export const FOOSBALL_TABLES:readonly FoosballTablePlace[]=map.colliders.filter(c=>/^COL_Mob_Pebolim(\.\d+)?$/.test(c.id))
  .sort((a,b)=>a.x-b.x).map((c,i)=>({id:`pebolim-${i+1}`,number:i+1,x:c.x,y:c.minY,z:c.z,collider:c.id,hx:c.hx,hz:c.hz}));
export const FOOSBALL_TABLE_IDS=FOOSBALL_TABLES.map(t=>t.id) as [string,...string[]];
/** The felt is this high above the floor (P_Pebolim). */
export const FOOSBALL_FELT=.8;
/** A table-frame point in the bar (the ball on the 3D table). */
export const tablePoint=(table:FoosballTablePlace,x:number,y:number)=>({x:table.x+x,y:table.y+FOOSBALL_FELT+FOOSBALL.ballRadius,z:table.z+y});

/** The slots of a table: in 1x1 the first of each team is the whole team; in 2x2 each team has a defence and an attack. */
export interface FoosballSlotDef {slot:number;team:FoosballTeam;role:FoosballRole}
export function slotDefs(format:FoosballFormat):FoosballSlotDef[] {
  return format==='1x1'?[{slot:0,team:'red',role:'solo'},{slot:1,team:'blue',role:'solo'}]
    :[{slot:0,team:'red',role:'defense'},{slot:1,team:'red',role:'attack'},{slot:2,team:'blue',role:'defense'},{slot:3,team:'blue',role:'attack'}];
}
/**
 * Where a slot's player stands, holding its handles. The tables stand against the window wall: red plays from that side
 * (+z, only reachable this way) and blue from the room's; in 2x2 the defence stands by its own goal.
 */
export function foosballSpot(table:FoosballTablePlace,team:FoosballTeam,role:FoosballRole):{x:number;y:number;z:number;rotation:number} {
  const along=role==='solo'?0:role==='defense'?-.27:.22;
  return {x:table.x+along*attackDir(team),y:table.y,z:table.z+(team==='red'?.78:-.8),rotation:team==='red'?Math.PI:0};
}
/** Where a player stands after leaving the table: on the room's side, by where they played. */
export const foosballExit=(table:FoosballTablePlace,x:number)=>({x:Math.max(table.x-.5,Math.min(table.x+.5,x)),y:table.y,z:table.z-table.hz-.4});

// ── The table as the room syncs it ────────────────────────────────────────────────────────────────────────────────────

/** cpu: the level of Zé do Totó holding the slot ('' for a player or an empty slot). */
export interface FoosballSlotView {slot:number;team:FoosballTeam;role:FoosballRole;playerId:string;displayName:string;cpu:string;ready:boolean;connected:boolean}
export interface FoosballTableView {
  id:string;phase:FoosballPhase;format:FoosballFormat;goals:number;sets:number;stake:number;level:FoosballLevel;hostId:string;
  slots:FoosballSlotView[];red:number;blue:number;setsRed:number;setsBlue:number;set:number;serve:FoosballTeam;
  /** When the phase ends (server ms; 0 while it does not end by itself). */
  deadline:number;matchId:string;
  /** A sentence about what just happened (a foul, a restart, a pause), '' when nothing. */
  message:string;
  /** The last goal: which team, who scored, from which rod and how fast (m/s). */
  goalTeam:string;goalBy:string;goalRod:string;goalSpeed:number;
  /** Whose possession and since when (server ms), for the ITSF clock; '' while nobody's. */
  possTeam:string;possRod:string;possSince:number;
  winner:string;minBet:number;maxBet:number;
  /** Bumps on every change of the lobby (the browsers redraw it). */
  revision:number;
}

/** The match's limits from the price table: the maximum is never under the minimum. */
export function foosballBetLimits(prices:Readonly<Record<string,number>>):{min:number;max:number} {
  const min=Math.max(1,prices['foosball:min-bet']??FOOSBALL.minBet);
  return {min,max:Math.max(min,prices['foosball:max-bet']??FOOSBALL.maxBet)};
}

// What the browser sends. The player comes from the session, never from the message.
const tableId=z.enum(FOOSBALL_TABLE_IDS);
export const foosballJoinSchema=z.object({tableId,slot:z.number().int().min(0).max(3).optional()}).strict();
export const foosballWatchSchema=z.object({tableId:z.union([tableId,z.literal('')])}).strict();
export const foosballSlotSchema=z.object({slot:z.number().int().min(0).max(3)}).strict();
export const foosballConfigSchema=z.object({format:z.enum(['1x1','2x2']).optional(),goals:z.union([z.literal(3),z.literal(5),z.literal(7),z.literal(10)]).optional(),
  sets:z.union([z.literal(1),z.literal(3)]).optional(),stake:z.number().int().min(0).max(1_000_000).optional(),level:z.enum(['facil','medio','dificil']).optional()}).strict();
export const foosballCpuSchema=z.object({slot:z.number().int().min(0).max(3),on:z.boolean()}).strict();
export const foosballReadySchema=z.object({ready:z.boolean()}).strict();
/** The pointer across the table (metres, table frame) and the figures held up; sent up to 30 times a second. */
export const foosballInputSchema=z.object({y:z.number().finite().min(-.4).max(.4),lift:z.boolean()}).strict();
/** A kick of the player's rods, 0 (a touch) to 1 (a full charge). */
export const foosballKickSchema=z.object({power:z.number().finite().min(0).max(1)}).strict();
