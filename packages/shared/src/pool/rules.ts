import type {PoolShotOutcome} from './physics.js';
import {GROUP_BALLS,groupOf,otherGroup,type PoolGroup} from './table.js';

/**
 * Bola 8 by the Noel Snooker rules (noelsnooker.com.br/regras/regra-bola-8): what a shot did, judged. The page settles
 * most of it; where it is silent the calls are documented in docs/sistemas/sinuca.md ("Onde a regra é omissa"):
 * - the break is made from anywhere in the quadro (behind the head string), and a ball pocketed on it counts as one that
 *   reached a cushion;
 * - on an open table the group is that of the first ball to drop (in time) in a legal shot, the break included;
 * - after a foul the next player plays the cue ball where it lies (the page gives no ball in hand); a cue ball pocketed or
 *   off the table goes back to its mark, the upper one, like the 8 to the lower one;
 * - an object ball off the table goes back to the lower mark (the 8's rule), and the 8 off the table is a foul, not a loss;
 * - the 8 with a foul by a player on the 8: the opponent gets the page's benefit (their lowest ball out, one continuous turn
 *   to clear the rest) for any foul, not only the cue ball and an opponent's ball; with nothing of theirs left, a loss;
 * - the 8 on the same shot as the player's last ball is early (the group was not clear when the shot began): a loss.
 */
export type PoolFoul='scratch'|'no-hit'|'wrong-first'|'opponent-ball'|'off-table'|'touch'|'double'|'moving'|'jump'|'break-cushions';
export const FOUL_NAMES:Record<PoolFoul,string>={
  scratch:'Suicídio: a branca caiu',
  'no-hit':'A branca não tocou em nenhuma bola',
  'wrong-first':'A branca tocou primeiro numa bola que não era da vez',
  'opponent-ball':'Encaçapou bola do adversário',
  'off-table':'Bola para fora da mesa',
  touch:'O taco tocou em outra bola',
  double:'Bi-toque: dois toques na branca',
  moving:'Tacada com bola em movimento',
  jump:'A branca saltou por cima de outra bola',
  'break-cushions':'Saída sem duas bolas na tabela',
};

export type PoolSeat=0|1;
export const otherSeat=(seat:PoolSeat):PoolSeat=>seat===0?1:0;

/** One rack (a game), as the rules see it. */
export interface PoolRack {
  /** The next shot is the break. */
  breaking:boolean;
  turn:PoolSeat;
  /** Each seat's group ('' while the table is open). */
  groups:[PoolGroup|'',PoolGroup|''];
  /** A seat clearing its balls in one continuous turn after its opponent pocketed the 8 with a foul (-1: none). */
  benefit:-1|PoolSeat;
  winner:-1|PoolSeat;
  reason:string;
}
export const newRack=(breaker:PoolSeat):PoolRack=>({breaking:true,turn:breaker,groups:['',''],benefit:-1,winner:-1,reason:''});

/** What a shot did, from the physics (PoolShotOutcome) and the room (a stroke sent while balls still rolled). */
export interface PoolShotFacts {firstHit:number;firstHits?:readonly number[];pocketed:readonly number[];offTable:readonly number[];cushioned:readonly number[];jumpedOver:boolean;doubleHit:boolean;touched:readonly number[];moving:boolean}

/** The facts of a stroke the physics played (the balls in the order they dropped). */
export const shotFacts=(o:PoolShotOutcome,moving=false):PoolShotFacts=>({firstHit:o.firstHit,firstHits:o.firstHits,pocketed:o.pocketed.map(p=>p.n),offTable:o.offTable,
  cushioned:o.cushioned,jumpedOver:o.jumpedOver,doubleHit:o.doubleHit,touched:o.touched,moving});

export interface PoolVerdict {
  fouls:PoolFoul[];
  /** The shooter keeps the table. */
  again:boolean;
  /** The groups after the shot, and the shooter's when this shot gave it. */
  groups:[PoolGroup|'',PoolGroup|''];assigned:PoolGroup|'';
  /** The cue ball back on the upper mark; balls back on the lower one (the 8 and object balls off the table). */
  respotCue:boolean;respot:number[];
  /** The benefit: the opponent's lowest ball taken out, and who then clears in one turn. */
  removed:number;benefit:-1|PoolSeat;
  /** The 8 dropped on the break: who chooses between a new break and the 8 on its mark, and whether there was a foul. */
  choice?:{seat:PoolSeat;foul:boolean};
  winner:-1|PoolSeat;reason:string;
}

/** The balls of a group still on the table. */
export const groupLeft=(group:PoolGroup|'',onTable:readonly number[])=>group?GROUP_BALLS[group].filter(n=>onTable.includes(n)):[];
/** The balls a seat may hit first: any but the 8 on an open table, its group, or the 8 once the group is clear. */
export function legalTargets(rack:PoolRack,seat:PoolSeat,onTable:readonly number[]):number[] {
  const mine=rack.groups[seat];
  if(!mine)return onTable.filter(n=>n!==0&&n!==8);
  const left=groupLeft(mine,onTable);
  if(rack.benefit===seat)return left;
  return left.length?left:onTable.includes(8)?[8]:[];
}

/**
 * Judges a shot of `rack.turn` from the object balls on the table before it (`before`, the cue ball left out or not).
 * The rack itself is not changed: the room applies the verdict (and the choices it asks for).
 */
export function judgeShot(rack:PoolRack,before:readonly number[],facts:PoolShotFacts):PoolVerdict {
  const me=rack.turn,them=otherSeat(me),mine=rack.groups[me],theirs=rack.groups[them];
  const potted=facts.pocketed.filter(n=>n!==0),objectsOff=facts.offTable.filter(n=>n!==0);
  const eightDown=potted.includes(8),eightOff=objectsOff.includes(8);
  const fouls:PoolFoul[]=[];
  const add=(foul:PoolFoul)=>{if(!fouls.includes(foul))fouls.push(foul);};
  if(facts.moving)add('moving');
  if(facts.touched.length)add('touch');
  if(facts.doubleHit)add('double');
  if(facts.pocketed.includes(0))add('scratch');
  if(facts.offTable.length)add('off-table');
  if(facts.jumpedOver)add('jump');
  const verdict:PoolVerdict={fouls,again:false,groups:[...rack.groups],assigned:'',respotCue:facts.pocketed.includes(0)||facts.offTable.includes(0),
    respot:objectsOff.filter(n=>n!==8),removed:-1,benefit:-1,winner:-1,reason:''};
  if(eightOff)verdict.respot.unshift(8);
  const after=before.filter(n=>!potted.includes(n)&&!objectsOff.includes(n)).concat(verdict.respot);

  // ── The break ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if(rack.breaking){
    // At least two balls on a cushion, the cue ball may be one; a ball that dropped got there too.
    if(new Set([...facts.cushioned,...facts.pocketed]).size<2)add('break-cushions');
    if(eightDown){
      // The 8 on the break: whoever plays next chooses a new break or the 8 back on its mark (Noel Snooker).
      const foul=fouls.length>0;
      verdict.choice={seat:foul?them:me,foul};
      if(!foul){assign(verdict,me,potted);verdict.again=true;}
      return verdict;
    }
    if(!fouls.length&&assign(verdict,me,potted))verdict.again=true;
    return verdict;
  }

  // ── A benefit's run: the 8 is down, the seat clears its balls in one go or the one who pocketed it wins ───────────────
  if(rack.benefit===me){
    const targets=groupLeft(mine,before);
    if(facts.firstHit<0)add('no-hit');else if(!firstOf(facts).some(n=>targets.includes(n)))add('wrong-first');
    const left=groupLeft(mine,after);
    if(!fouls.length&&!left.length){verdict.winner=me;verdict.reason='Limpou a mesa no benefício';return verdict;}
    if(fouls.length||!potted.some(n=>groupOf(n)===mine)){verdict.winner=them;verdict.reason='O benefício não limpou a mesa';return verdict;}
    verdict.again=true;verdict.benefit=me;
    return verdict;
  }

  // ── Any other shot ─────────────────────────────────────────────────────────────────────────────────────────────────
  const targets=legalTargets(rack,me,before),onEight=!!mine&&!groupLeft(mine,before).length;
  if(facts.firstHit<0)add('no-hit');else if(!firstOf(facts).some(n=>targets.includes(n)))add('wrong-first');
  if(theirs&&potted.some(n=>groupOf(n)===theirs))add('opponent-ball');
  if(eightDown){
    if(!onEight){verdict.winner=them;verdict.reason='Encaçapou a bola 8 antes da hora';return verdict;}
    if(!fouls.length){verdict.winner=me;verdict.reason='Encaçapou a bola 8';return verdict;}
    // On the 8 with a foul: with only the 8 in play, a loss; else the opponent's benefit (Noel Snooker).
    const theirsLeft=groupLeft(theirs,after);
    if(!theirsLeft.length){verdict.winner=them;verdict.reason=fouls.includes('scratch')?'Caiu de branca junto com a bola 8':'Bola 8 com falta';return verdict;}
    verdict.removed=Math.min(...theirsLeft);
    if(theirsLeft.length===1){verdict.winner=them;verdict.reason='Bola 8 com falta: o benefício já limpou a mesa';return verdict;}
    verdict.benefit=them;
    return verdict;
  }
  if(fouls.length)return verdict;
  if(!mine){if(assign(verdict,me,potted))verdict.again=true;return verdict;}
  verdict.again=potted.some(n=>groupOf(n)===mine);
  return verdict;
}

/** The balls the cue ball met first: all of them when it met several in the same instant (any legal one will do). */
const firstOf=(facts:PoolShotFacts)=>facts.firstHits?.length?facts.firstHits:facts.firstHit>=0?[facts.firstHit]:[];

/** An open table's group: the first ball that dropped (not the 8) gives the shooter its group. True when one was given. */
function assign(verdict:PoolVerdict,me:PoolSeat,potted:readonly number[]):boolean {
  if(verdict.groups[me])return potted.some(n=>groupOf(n)===verdict.groups[me]);
  const first=potted.find(n=>groupOf(n));
  if(first===undefined)return false;
  const group=groupOf(first) as PoolGroup;
  verdict.groups[me]=group;verdict.groups[otherSeat(me)]=otherGroup(group);verdict.assigned=group;
  return true;
}
