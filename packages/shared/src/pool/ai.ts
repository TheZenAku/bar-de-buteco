import {clearPath} from './aim.js';
import {simulateShot,type PoolStroke} from './physics.js';
import {judgeShot,legalTargets,otherSeat,shotFacts,type PoolRack,type PoolSeat} from './rules.js';
import {HEAD_STRING,POCKETS,POOL_TABLE,inQuadro,onCloth,type PoolBallSpot} from './table.js';

/** The house's player at the pool tables, three nights of him. */
export type PoolLevel='facil'|'medio'|'dificil';
export const POOL_LEVELS:readonly PoolLevel[]=['facil','medio','dificil'];
export const POOL_LEVEL_NAMES:Record<PoolLevel,string>={facil:'Iniciante',medio:'Na média',dificil:'Matador'};
export const POOL_CPU_NAME='Juca da Sinuca';

/**
 * How he plays: the aim's error (degrees, one standard deviation) and the power's (fraction), how many of the easiest
 * shots he weighs, whether he uses follow and draw for the next shot, and how long he looks at the table before playing.
 */
const SKILL:Record<PoolLevel,{aim:number;power:number;shots:number;spin:boolean;thinkMs:readonly [number,number]}>={
  facil:{aim:1.5,power:.14,shots:5,spin:false,thinkMs:[1600,2800]},
  medio:{aim:.55,power:.07,shots:9,spin:true,thinkMs:[1300,2300]},
  dificil:{aim:.17,power:.03,shots:14,spin:true,thinkMs:[1000,1900]},
};
export const poolThinkMs=(level:PoolLevel,random:()=>number)=>{const [a,b]=SKILL[level].thinkMs;return a+(b-a)*random();};

const R=POOL_TABLE.ballRadius,D=2*R;
const gauss=(random:()=>number)=>{let u=0;while(u===0)u=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*random());};

export interface PoolPlan {stroke:PoolStroke;cue?:{x:number;y:number}}
interface Candidate {target:number;pocket:number;angle:number;power:number;ease:number}

/** The pots open from where the cue ball stands: a target and a pocket with both paths clear and a cut he would try. */
function pots(balls:readonly PoolBallSpot[],targets:readonly number[],maxCut=78):Candidate[] {
  const cue=balls.find(b=>b.n===0);if(!cue)return [];
  const out:Candidate[]=[],limit=Math.cos(maxCut*Math.PI/180);
  for(const n of targets){
    const ball=balls.find(b=>b.n===n);if(!ball)continue;
    for(const pocket of POCKETS){
      const ox=pocket.aimX-ball.x,oy=pocket.aimY-ball.y,ol=Math.hypot(ox,oy);
      if(ol<1e-6)continue;
      // A side pocket takes a ball only coming at it from the front.
      if(pocket.side&&Math.abs(oy/ol)<.45)continue;
      const gx=ball.x-ox/ol*D,gy=ball.y-oy/ol*D;
      if(!onCloth(gx,gy))continue;
      const cx=gx-cue.x,cy=gy-cue.y,cl=Math.hypot(cx,cy);
      if(cl<1e-6)continue;
      const cut=(cx*ox+cy*oy)/(cl*ol);
      if(cut<limit)continue;
      if(!clearPath(balls,cue.x,cue.y,gx,gy,[0,n])||!clearPath(balls,ball.x,ball.y,pocket.aimX,pocket.aimY,[n,0]))continue;
      // Speed enough to reach the pocket from the cut (a thin cut gives the ball little of the cue ball's speed).
      const power=Math.min(1,.12+(cl*.18+ol*.32)/Math.max(.25,cut));
      out.push({target:n,pocket:pocket.index,angle:Math.atan2(cy,cx),power,ease:cut*cut/(.3+cl*.5+ol)});
    }
  }
  return out.sort((a,b)=>b.ease-a.ease);
}

/**
 * Weighs his shot: the easiest pots, each tried with the physics at a few powers (with follow and draw when he knows
 * them), judged by the same rules as everyone's, then the position they leave (pots open for him next) or, when nothing
 * drops, how little they leave the opponent. Work comes in slices (step), so the room never stalls while he thinks.
 */
export class PoolPlanner {
  private queue:Array<{stroke:PoolStroke;cue?:{x:number;y:number};base:number;of?:{tries:number[]}}>=[];
  private results:Array<{plan:PoolPlan;tries:number[]}>=[];
  private refined=false;
  private best?:{plan:PoolPlan;score:number};
  done=false;
  constructor(private readonly rack:PoolRack,private readonly seat:PoolSeat,private readonly balls:readonly PoolBallSpot[],readonly level:PoolLevel,
    private readonly random:()=>number=Math.random,private readonly placing=false){
    const skill=SKILL[level],onTable=balls.map(b=>b.n).filter(n=>n!==0),targets=legalTargets(rack,seat,onTable);
    if(rack.breaking){
      // The break: from the middle of the quadro, hard at the 1, a touch of draw to keep the cue ball home.
      const y=(this.random()-.5)*.16,cue={x:HEAD_STRING-.02,y},apex=balls.find(b=>b.n===1)??balls.find(b=>b.n!==0);
      const angle=apex?Math.atan2(apex.y-y,apex.x-cue.x):0;
      this.best={plan:{stroke:{angle,power:.9+this.random()*.1,spinX:0,spinY:-.25,elevation:0},cue:placing?cue:undefined},score:0};
      this.done=true;return;
    }
    const cue=placing?this.placeCue(targets):undefined,from=cue?balls.map(b=>b.n===0?{n:0,...cue}:b):balls;
    const spins=skill.spin?[0,.45,-.5]:[0];
    for(const c of pots(from,targets).slice(0,skill.shots))
      for(const power of [c.power,Math.min(1,c.power*1.35)])for(const spinY of spins)
        this.queue.push({stroke:{angle:c.angle,power,spinX:0,spinY,elevation:0},cue,base:c.ease});
    // Nothing to pot (or as a fallback): full on each legal ball, soft and firm, for a safe touch.
    const me=from.find(b=>b.n===0)!;
    for(const n of targets.slice().sort((a,b)=>dist(from,me,a)-dist(from,me,b)).slice(0,4)){
      const ball=from.find(b=>b.n===n)!;
      for(const power of [.28,.5])this.queue.push({stroke:{angle:Math.atan2(ball.y-me.y,ball.x-me.x),power,spinX:0,spinY:0,elevation:0},cue,base:-1});
    }
  }
  /**
   * Runs sims until `budgetMs` passes; true once he has decided. A player who knows the table also asks what a slightly
   * missed stroke would do: the best few are played again a hair to each side, and the average decides (a pot that
   * risks dropping the 8 or the cue ball loses to a safer one).
   */
  step(budgetMs:number):boolean {
    if(this.done)return true;
    const start=Date.now();
    while(this.queue.length&&Date.now()-start<budgetMs){
      const next=this.queue.shift()!,score=this.score(next.stroke,next.cue)+next.base*10;
      if(next.of){next.of.tries.push(score);continue;}
      this.results.push({plan:{stroke:next.stroke,cue:next.cue},tries:[score]});
    }
    if(this.queue.length)return false;
    const skill=SKILL[this.level];
    if(!this.refined&&skill.spin){
      this.refined=true;
      const miss=skill.aim*1.5*Math.PI/180;
      for(const r of [...this.results].sort((a,b)=>b.tries[0]!-a.tries[0]!).slice(0,4))
        for(const side of [-1,1])this.queue.push({stroke:{...r.plan.stroke,angle:r.plan.stroke.angle+side*miss},cue:r.plan.cue,base:0,of:r});
      if(this.queue.length)return false;
    }
    const mean=(r:{tries:number[]})=>r.tries.reduce((a,b)=>a+b,0)/r.tries.length;
    const best=[...this.results].sort((a,b)=>mean(b)-mean(a))[0];
    if(best)this.best={plan:best.plan,score:mean(best)};
    this.done=true;
    return true;
  }
  /** How good a stroke's outcome is for him. */
  private score(stroke:PoolStroke,cue?:{x:number;y:number}):number {
    const from=cue?this.balls.map(b=>b.n===0?{n:0,...cue}:b):this.balls;
    const shot=simulateShot(from,stroke,{maxMs:15_000}),onTable=from.map(b=>b.n).filter(n=>n!==0);
    const verdict=judgeShot(this.rack,onTable,shotFacts(shot)),after=shot.balls.map(b=>b.n).filter(n=>n!==0);
    if(verdict.winner===this.seat)return 10_000;
    if(verdict.winner===otherSeat(this.seat))return -10_000;
    if(verdict.fouls.length)return -400;
    // Position: what he could pot from where the cue ball stops; or, missing, how little he leaves the other player.
    if(verdict.again)return 300+Math.min(6,pots(shot.balls,legalTargets({...this.rack,groups:verdict.groups,benefit:verdict.benefit},this.seat,after),70).length)*25;
    return -pots(shot.balls,legalTargets({...this.rack,groups:verdict.groups},otherSeat(this.seat),after),70).length*12;
  }
  /** His decision, with his hand's error on it. */
  plan():PoolPlan {
    const skill=SKILL[this.level],chosen=this.best?.plan??{stroke:{angle:this.random()*Math.PI*2,power:.4,spinX:0,spinY:0,elevation:0}};
    const angle=chosen.stroke.angle+gauss(this.random)*skill.aim*Math.PI/180,power=Math.max(.05,Math.min(1,chosen.stroke.power*(1+gauss(this.random)*skill.power)));
    return {...chosen,stroke:{...chosen.stroke,angle,power}};
  }
  /** Where he puts the cue ball in the quadro: the spot with the easiest pot, or the middle of the head string. */
  private placeCue(targets:readonly number[]):{x:number;y:number} {
    let best={x:HEAD_STRING-.05,y:0},bestEase=-1;
    for(let x=HEAD_STRING-.02;x>-.9;x-=.12)for(let y=-.38;y<=.38;y+=.095){
      if(!inQuadro(x,y)||this.balls.some(b=>b.n!==0&&Math.hypot(b.x-x,b.y-y)<D+.004))continue;
      const ease=pots(this.balls.map(b=>b.n===0?{n:0,x,y}:b),targets)[0]?.ease??0;
      if(ease>bestEase){bestEase=ease;best={x,y};}
    }
    return best;
  }
}
const dist=(balls:readonly PoolBallSpot[],from:{x:number;y:number},n:number)=>{const b=balls.find(x=>x.n===n);return b?Math.hypot(b.x-from.x,b.y-from.y):Infinity;};
