import {SIGNAL_SUITS,TRUCO_SIGNALS,partnerOf,teamOf,type TrucoObservation,type TrucoSignal} from './game.js';
import {cardStrength,isManilha,manilhaRank,newTrucoDeck,type TrucoCard,type TrucoFace,type TrucoSuit} from './cards.js';
import {handWinner,type TrickOutcome,type TrucoTeam} from './scoring.js';

export const TRUCO_PERSONALITIES=['conservador','blefador','estrategico','experiente','iniciante','provocador'] as const;
export type TrucoPersonality=(typeof TRUCO_PERSONALITIES)[number];
export const PERSONALITY_NAMES:Record<TrucoPersonality,string>={conservador:'Conservador',blefador:'Blefador',estrategico:'Estratégico',experiente:'Experiente',iniciante:'Iniciante',provocador:'Provocador'};
/**
 * How a personality plays. samples: hands imagined to judge its own (more, closer to the truth); noise: how far off that
 * judgement can be; callAt: the chance of winning at which it calls; bluff: how often it calls without the cards;
 * caution: how much a call against it scares it; raiseAt: the chance at which it raises an answer; slip: how often it plays a
 * careless card; read: how often it reads a rival's face; trust: how much it believes its partner's; shows: how often it
 * tells its partner about a manilha; lies: how often it shows one it does not have; talk: how often it says something;
 * hides: how often a card that cannot take the trick goes face down, so nobody learns it; weighs: it plays out each card
 * of its hand in its head and takes the best, where the others follow rules of thumb; wasteful: it takes a trick with its
 * highest card, the beginner's mistake, where anyone else uses the lowest that does it.
 */
interface Traits {samples:number;noise:number;callAt:number;bluff:number;caution:number;raiseAt:number;slip:number;read:number;trust:number;shows:number;lies:number;talk:number;hides:number;weighs:boolean;wasteful:boolean}
const TRAITS:Record<TrucoPersonality,Traits>={
  conservador:{samples:120,noise:.05,callAt:.88,bluff:.01,caution:.1,raiseAt:.94,slip:.05,read:.2,trust:.8,shows:.6,lies:0,talk:.12,hides:.3,weighs:false,wasteful:false},
  blefador:{samples:120,noise:.07,callAt:.74,bluff:.2,caution:-.05,raiseAt:.82,slip:.06,read:.2,trust:.5,shows:.5,lies:.25,talk:.35,hides:.5,weighs:false,wasteful:false},
  estrategico:{samples:150,noise:0,callAt:.76,bluff:.06,caution:.02,raiseAt:.88,slip:0,read:.6,trust:1,shows:.8,lies:0,talk:.15,hides:.6,weighs:true,wasteful:false},
  experiente:{samples:150,noise:0,callAt:.72,bluff:.09,caution:0,raiseAt:.85,slip:0,read:.9,trust:1,shows:.9,lies:.05,talk:.25,hides:.7,weighs:true,wasteful:false},
  iniciante:{samples:30,noise:.2,callAt:.86,bluff:.02,caution:.08,raiseAt:.97,slip:.22,read:0,trust:.5,shows:.3,lies:0,talk:.2,hides:0,weighs:false,wasteful:true},
  provocador:{samples:120,noise:.06,callAt:.72,bluff:.13,caution:-.02,raiseAt:.84,slip:.05,read:.3,trust:.7,shows:.5,lies:.1,talk:.8,hides:.3,weighs:false,wasteful:false},
};
/** A number from 0 up to 1. */
export type Chance=()=>number;
export type TrucoDecision=
  {type:'play';card:string;hidden?:boolean}|{type:'call'}|{type:'answer';answer:'accept'|'raise'|'run'}|{type:'eleven';answer:'play'|'run'|'show'};

const below=(n:number,chance:Chance)=>Math.floor(chance()*n);

/** Strengths in play for a simulated hand, seat by seat. */
function imagine(o:TrucoObservation,t:Traits,chance:Chance):number[][] {
  const known=new Set<string>([`${o.vira.rank}${o.vira.suit}`]);
  const see=(c:{rank:string;suit:string})=>{known.add(`${c.rank}${c.suit}`);};
  o.hand.forEach(see);o.partnerCards.forEach(see);o.played.forEach(p=>see(p.card));
  const hands:Array<Array<{rank:string;suit:string}>>=[[],[],[],[]];
  hands[o.seat]=[...o.hand];
  if(o.partnerCards.length)hands[partnerOf(o.seat)]=[...o.partnerCards];
  // What the faces told: the partner's by trust, a rival's only if it was caught.
  for(const {seat,signal} of o.signals){
    if(seat===o.seat||hands[seat]!.length>=o.cardsLeft[seat]!)continue;
    const belief=teamOf(seat)===o.team?t.trust:t.read*.6;
    if(chance()>=belief)continue;
    const card={rank:manilhaRank(o.vira.rank),suit:SIGNAL_SUITS[signal]};
    if(known.has(`${card.rank}${card.suit}`))continue;
    see(card);hands[seat]!.push(card);
  }
  const rest=newTrucoDeck().filter(c=>!known.has(`${c.rank}${c.suit}`));
  for(let i=rest.length-1;i>0;i--){const j=below(i+1,chance);[rest[i],rest[j]]=[rest[j]!,rest[i]!];}
  let top=0;
  for(let seat=0;seat<4;seat++)while(hands[seat]!.length<o.cardsLeft[seat]!)hands[seat]!.push(rest[top++]!);
  return hands.map(h=>h.map(c=>cardStrength(c,o.vira)));
}
/** Everyone plays plainly from here: the lowest card that takes the trick from the other team, else their lowest; a leader plays high. */
function playOut(o:TrucoObservation,hands:number[][],first?:number):TrickOutcome {
  const tricks=[...o.tricks];let table=o.table.map(p=>({seat:p.seat,s:cardStrength(p.card,o.vira)})),seat=o.next;
  for(let guard=0;guard<16;guard++){
    const done=handWinner(tricks);if(done!==undefined)return done;
    const hand=hands[seat]!;
    if(!hand.length)return 'tie';
    let index=0;
    if(first!==undefined){index=hand.indexOf(first);first=undefined;}
    else if(!table.length)index=hand.indexOf(Math.max(...hand));
    else{
      const best=Math.max(...table.map(p=>p.s)),ours=table.some(p=>p.s===best&&teamOf(p.seat)===teamOf(seat))&&!table.some(p=>p.s===best&&teamOf(p.seat)!==teamOf(seat));
      let pick=-1;
      if(!ours)for(let i=0;i<hand.length;i++)if(hand[i]!>best&&(pick<0||hand[i]!<hand[pick]!))pick=i;
      if(pick<0){pick=0;for(let i=1;i<hand.length;i++)if(hand[i]!<hand[pick]!)pick=i;}
      index=pick;
    }
    table.push({seat,s:hand.splice(index,1)[0]!});
    if(table.length<4){seat=(seat+1)%4;continue;}
    const best=Math.max(...table.map(p=>p.s)),top=table.filter(p=>p.s===best),teams=new Set(top.map(p=>teamOf(p.seat)));
    tricks.push(teams.size>1?'tie':teamOf(top[0]!.seat));
    seat=top[0]!.seat;table=[];
  }
  return 'tie';
}
/** How likely this team is to take the hand, by imagining the cards it cannot see and playing them out. */
export function winChance(o:TrucoObservation,personality:TrucoPersonality,chance:Chance):number {
  const t=TRAITS[personality];let sum=0;
  for(let i=0;i<t.samples;i++){
    const outcome=playOut(o,imagine(o,t,chance));
    sum+=outcome==='tie'?.5:outcome===o.team?1:0;
  }
  const noisy=sum/t.samples+(chance()*2-1)*t.noise;
  return Math.min(1,Math.max(0,noisy));
}
/** The card that wins the hand most often, each one played out in the head against the same imagined tables. */
function weighedCard(o:TrucoObservation,t:Traits,chance:Chance):string {
  const rounds=Math.ceil(t.samples/o.hand.length),scores=o.hand.map(()=>0);
  for(let i=0;i<rounds;i++){
    const imagined=imagine(o,t,chance);
    o.hand.forEach((card,index)=>{
      const outcome=playOut(o,imagined.map(h=>[...h]),cardStrength(card,o.vira));
      scores[index]!+=outcome==='tie'?.5:outcome===o.team?1:0;
    });
  }
  let best=0;
  // On a level score, the lowest card: nothing is spent for free.
  for(let i=1;i<o.hand.length;i++){
    const diff=scores[i]!-scores[best]!;
    if(diff>0||(diff===0&&cardStrength(o.hand[i]!,o.vira)<cardStrength(o.hand[best]!,o.vira)))best=i;
  }
  return o.hand[best]!.id;
}
/** Calls that ended in a lost hand make a team's next call less frightening: a real memory of how they behaved. */
const bluffRate=(o:TrucoObservation,team:TrucoTeam)=>{const b=o.behaviour[team];return b.calls?b.lostCalls/b.calls:.25;};

function chooseCard(o:TrucoObservation,t:Traits,personality:TrucoPersonality,chance:Chance):string {
  if(o.dark||o.hand.some(c=>c.rank==='?'))return o.hand[below(o.hand.length,chance)]!.id;
  const cards=[...o.hand].sort((a,b)=>cardStrength(a,o.vira)-cardStrength(b,o.vira)),low=cards[0]!,high=cards.at(-1)!;
  if(chance()<t.slip)return cards[below(cards.length,chance)]!.id;
  if(t.weighs&&cards.length>1)return weighedCard(o,t,chance);
  if(o.table.length){
    const best=Math.max(...o.table.map(p=>cardStrength(p.card,o.vira)));
    const oursTop=o.table.some(p=>cardStrength(p.card,o.vira)===best&&teamOf(p.seat)===o.team),theirsTop=o.table.some(p=>cardStrength(p.card,o.vira)===best&&teamOf(p.seat)!==o.team);
    if(oursTop&&!theirsTop)return low.id;
    const beats=t.wasteful?(cardStrength(high,o.vira)>best?high:undefined):cards.find(c=>cardStrength(c,o.vira)>best);
    if(beats)return beats.id;
    // Cannot take it: a tie still keeps the hand alive, when a card ties.
    const ties=cards.find(c=>cardStrength(c,o.vira)===best);
    if(ties&&(o.tricks.length>0||isStrong(high,o)))return ties.id;
    return low.id;
  }
  const trick=o.tricks.length,mid=cards[Math.floor(cards.length/2)]!;
  if(trick===0)return personality==='iniciante'?high.id:personality==='conservador'?mid.id:(cards.length>2&&isStrong(high,o)?mid.id:high.id);
  const first=o.tricks[0];
  if(first==='tie'||first!==o.team)return high.id;
  // Ahead: the strong card ends it now; otherwise a low card makes them spend theirs.
  return isStrong(high,o)||personality==='estrategico'&&chance()<.5?high.id:low.id;
}
const isStrong=(card:TrucoCard,o:TrucoObservation)=>isManilha(card,o.vira)||card.rank==='3';

/** The NPC's move, from what it can see. Null: nothing for it to do. */
export function trucoDecide(o:TrucoObservation,personality:TrucoPersonality,chance:Chance):TrucoDecision|null {
  const t=TRAITS[personality],other:TrucoTeam=o.team===0?1:0;
  if(o.phase==='eleven'){
    if(o.elevenTeam!==o.team)return null;
    if(o.canShow)return {type:'eleven',answer:'show'};
    const p=winChance(o,personality,chance)-t.caution;
    // Playing: three either way. Running: one for them. Three that hand them the match change the sum.
    const mustHold=o.score[other]+3>=o.target&&o.score[other]+1<o.target;
    return {type:'eleven',answer:p>=(mustHold?.5:.34)?'play':'run'};
  }
  if(o.phase==='bet'&&o.bet){
    if(o.bet.team===o.team)return null;
    const p=winChance(o,personality,chance)-t.caution-.12*(1-bluffRate(o,o.bet.team));
    // Running would end the match anyway: nothing to lose.
    if(o.score[other]+o.bet.from>=o.target)return {type:'answer',answer:o.raiseTo?'raise':'accept'};
    if(o.raiseTo&&(p>=t.raiseAt||(p>.3&&chance()<t.bluff*.5)))return {type:'answer',answer:'raise'};
    // Accept when it is worth more than the points lost by running.
    return {type:'answer',answer:p>=(o.bet.to-o.bet.from)/(2*o.bet.to)?'accept':'run'};
  }
  if(o.phase!=='playing')return null;
  if(o.canCall&&!o.dark){
    const p=winChance(o,personality,chance);
    if(p>=t.callAt&&!(personality==='experiente'&&p>.96&&o.tricks.length===0&&chance()<.4))return {type:'call'};
    if(o.value===1&&p>.22&&chance()<t.bluff)return {type:'call'};
  }
  const card=chooseCard(o,t,personality,chance);
  return {type:'play',card,...(worthHiding(o,card)&&chance()<t.hides?{hidden:true}:{})};
}
/** A card that will not take this trick, from the second on: nobody needs to learn what it was. */
function worthHiding(o:TrucoObservation,id:string):boolean {
  if(!o.canHide||o.dark||!o.table.length)return false;
  const card=o.hand.find(c=>c.id===id)!,best=Math.max(...o.table.map(p=>cardStrength(p.card,o.vira)));
  return cardStrength(card,o.vira)<best;
}
/** Which face it shows its partner at the start of a hand, if any: a manilha it has, or sometimes one it has not. */
export function trucoSignalChoice(o:TrucoObservation,personality:TrucoPersonality,chance:Chance):TrucoSignal|null {
  if(o.dark)return null;
  const t=TRAITS[personality],mine=o.hand.filter(c=>isManilha(c,o.vira)).map(c=>(c as TrucoFace).suit) as TrucoSuit[];
  const signalOf=(suit:TrucoSuit)=>TRUCO_SIGNALS.find(s=>SIGNAL_SUITS[s]===suit)!;
  if(mine.length&&chance()<t.shows)return signalOf(mine.sort((a,b)=>rankSuit(b)-rankSuit(a))[0]!);
  return chance()<t.lies?TRUCO_SIGNALS[below(TRUCO_SIGNALS.length,chance)]!:null;
}
const rankSuit=(suit:TrucoSuit)=>['ouros','espadas','copas','paus'].indexOf(suit);

export type TrucoMoment='call'|'accept'|'they-run'|'won-trick'|'won-hand'|'lost-hand'|'won-match';
const LINES:Record<TrucoPersonality,Partial<Record<TrucoMoment,readonly string[]>>>={
  conservador:{call:['Truco, com licença.'],accept:['Tá certo, cai.'],'won-hand':['Devagar se vai longe.'],'lost-hand':['Paciência.']},
  blefador:{call:['Truco! Tá com medo?','Vou de Truco, olha pra mim.'],accept:['Cai, quero ver.'],'they-run':['Nem precisei mostrar!'],'won-hand':['Tinha nada, viu?','Acreditou, né?'],'lost-hand':['Quase colou.']},
  estrategico:{call:['Truco.'],accept:['Aceito.'],'won-hand':['Como calculado.'],'lost-hand':['Anotado.']},
  experiente:{call:['Truco, meu bem.','Vamos ver: Truco.'],accept:['Pode cair, querido.'],'they-run':['Juízo seu.'],'won-hand':['Cinquenta anos de mesa.'],'lost-hand':['Boa jogada.']},
  iniciante:{call:['Truco? É assim que fala?','Truco!'],accept:['Tá, cai... eu acho.'],'won-hand':['Ganhei?! Ganhei!'],'lost-hand':['Ih, errei de novo.'],'won-trick':['Opa, essa foi minha!']},
  provocador:{call:['Truco, seu pato!','Truuuco! Corre!','Vai encarar? Truco!'],accept:['Cai, que hoje tem!'],'they-run':['Correu, frango!','Fugiu! Eu sabia!'],'won-trick':['Essa é minha!','Toma!'],'won-hand':['Fica pra próxima, freguês!','Vai treinar!'],'lost-hand':['Sorte de principiante.','Foi sorte, viu?'],'won-match':['Fregueses!']},
};
/** What it says at this moment, if it says anything. */
export function trucoLine(personality:TrucoPersonality,moment:TrucoMoment,chance:Chance):string|null {
  const lines=LINES[personality][moment];
  if(!lines?.length)return null;
  const talk=moment==='call'?1:TRAITS[personality].talk;
  return chance()<talk?lines[below(lines.length,chance)]!:null;
}
