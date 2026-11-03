import {MANILHA_NAMES,cardStrength,hasCasalMaior,manilhaRank,newTrucoDeck,provenWin,shuffled,type TrucoCard,type TrucoFace,type TrucoRandom,type TrucoRank,type TrucoSuit} from './cards.js';
import {callLabel,mayRaise,nextCall,type TrucoCallValue} from './betting.js';
import {handWinner,tieRuling,type StandingCall,type TrickOutcome,type TrucoTeam} from './scoring.js';

export const TRUCO={
  target:12,seats:4,cardsEach:3,
  /** How long each moment stays on the table (the browsers animate to these). */
  shuffleMs:1000,dealMs:2100,trickEndMs:1700,handEndMs:3200,
  /** Your card, and an answer to a call or to a Mão de 11. Out of time, the first card goes; the team's NPC answers, or the team runs. */
  turnMs:25_000,answerMs:20_000,
  /** An NPC's thinking. */
  npcMinMs:1100,npcMaxMs:2900,
  /** A face shown to the table lasts this long, and the next one has to wait a moment. */
  signalFlashMs:900,signalCooldownMs:1200,
  /** The result stays up this long, then the table asks for new stakes. */
  matchEndMs:15_000,
} as const;

export type TrucoPhase='shuffling'|'dealing'|'eleven'|'playing'|'bet'|'trick-end'|'hand-end'|'match-end';
/** The four faces of the rulebook's signs: each names the manilha it tells about. */
export const TRUCO_SIGNALS=['zap','copeta','espadilha','pica-fumo'] as const;
export type TrucoSignal=(typeof TRUCO_SIGNALS)[number];
export const SIGNAL_SUITS:Record<TrucoSignal,TrucoSuit>={zap:'paus',copeta:'copas',espadilha:'espadas','pica-fumo':'ouros'};
export const teamOf=(seat:number):TrucoTeam=>(seat%2) as TrucoTeam;
export const partnerOf=(seat:number)=>(seat+2)%4;

export interface TrucoPlay {seat:number;card:TrucoCard;winner?:boolean}
export interface TrucoTrick {winner:TrickOutcome|null;seat?:number}
export interface TrucoResult {winner:TrucoTeam|null;points:number;reason:string}
interface PendingBet {by:number;team:TrucoTeam;from:number;to:TrucoCallValue;exposed:boolean}
/** What everyone at the table has seen of a team this match: calls made, calls that ended in a lost hand, and runs. */
export interface TrucoBehaviour {calls:number;lostCalls:number;runs:number}
export type TrucoEvent=
  {type:'call';seat:number;label:string}|{type:'accept';seat:number}|{type:'run';seat:number;team:TrucoTeam}|
  {type:'trick';winner:TrickOutcome;seat:number}|{type:'hand';result:TrucoResult}|{type:'match';winner:TrucoTeam};

/** All a player knows when deciding: nothing here depends on a card they could not see. The NPCs decide from this alone. */
export interface TrucoObservation {
  seat:number;team:TrucoTeam;phase:TrucoPhase;hand:TrucoCard[];partnerCards:TrucoCard[];vira:TrucoFace;value:number;
  score:[number,number];target:number;tricks:TrickOutcome[];table:TrucoPlay[];played:TrucoPlay[];cardsLeft:number[];
  /** Who plays next once any call is settled. */
  next:number;iron:boolean;dark:boolean;
  bet:{by:number;team:TrucoTeam;from:number;to:TrucoCallValue}|null;canCall:boolean;canHide:boolean;raiseTo:TrucoCallValue|null;
  elevenTeam:TrucoTeam|null;canShow:boolean;
  signals:Array<{seat:number;signal:TrucoSignal}>;behaviour:[TrucoBehaviour,TrucoBehaviour];
}

export interface TrucoGameOptions {
  random:TrucoRandom;nameOf(seat:number):string;
  /** The Escuro variation of the Mão de Ferro: nobody sees their own cards. */
  dark?:boolean;dealer?:number;score?:[number,number];
}

/**
 * The rules of one match and nothing else: no clock, no sockets, no drawing. The table moves it along (advance) when a
 * moment has lasted long enough. Rulebook: blog.copag.com.br/regras/truco; docs/sistemas/truco.md says how each line
 * became code and what the rulebook left open.
 */
export class TrucoGame {
  score:[number,number];phase:TrucoPhase='shuffling';handNumber=0;dealer:number;turn:number|null=null;
  hands:TrucoFace[][]=[[],[],[],[]];vira:TrucoFace|null=null;
  table:TrucoPlay[]=[];played:TrucoPlay[]=[];tricks:TrickOutcome[]=[];
  value=1;standing:StandingCall|null=null;bet:PendingBet|null=null;
  /** The team deciding a Mão de 11, also after it decided: it marks the hand. */
  elevenTeam:TrucoTeam|null=null;iron=false;dark:boolean;
  result:TrucoResult|null=null;winner:TrucoTeam|null=null;log:string[]=[];
  signals:Array<{seat:number;signal:TrucoSignal;key:number}>=[];signalKey=0;
  behaviour:[TrucoBehaviour,TrucoBehaviour]=[{calls:0,lostCalls:0,runs:0},{calls:0,lostCalls:0,runs:0}];
  events:TrucoEvent[]=[];
  private next=0;private lastTrickSeat:number|undefined;private decided:TrickOutcome|undefined;private random:TrucoRandom;private nameOf:(seat:number)=>string;

  constructor(options:TrucoGameOptions){
    this.random=options.random;this.nameOf=options.nameOf;this.dark=!!options.dark;
    this.score=options.score?[...options.score]:[0,0];
    // The first dealer is the seat before options.dealer's turn comes around: startHand moves the deal forward.
    this.dealer=((options.dealer??this.random(TRUCO.seats))+3)%4;
    this.startHand();
  }
  private note(line:string):void {this.log.push(line);if(this.log.length>12)this.log.shift();}
  /** The first to play: the one to the dealer's right. Play and the deal go counter-clockwise, seat by seat. */
  get mao():number {return (this.dealer+1)%4;}

  private startHand():void {
    this.handNumber++;this.dealer=(this.dealer+1)%4;
    this.hands=[[],[],[],[]];this.vira=null;this.table=[];this.played=[];this.tricks=[];this.signals=[];
    this.standing=null;this.bet=null;this.result=null;this.turn=null;this.decided=undefined;this.lastTrickSeat=undefined;
    const at11:TrucoTeam[]=([0,1] as const).filter(team=>this.score[team]===TRUCO.target-1);
    this.iron=at11.length===2;this.elevenTeam=at11.length===1?at11[0]!:null;
    this.value=this.elevenTeam===null?1:3;
    this.phase='shuffling';
    this.note(`Mão ${this.handNumber}: ${this.nameOf(this.dealer)} dá as cartas`);
  }
  private deal():void {
    const deck=shuffled(newTrucoDeck(),this.random);let top=0;
    for(let round=0;round<TRUCO.cardsEach;round++)for(let i=0;i<TRUCO.seats;i++){
      const seat=(this.mao+i)%4;
      this.hands[seat]!.push({...deck[top++]!,id:`h${this.handNumber}s${seat}c${round}`});
    }
    this.vira={...deck[top]!,id:`h${this.handNumber}v`};
    this.note(`Vira: ${cardText(this.vira)}. Manilha é ${rankText(manilhaRank(this.vira.rank))}`);
    if(this.iron)this.note(this.dark?'11 a 11: Mão de Ferro no escuro':'11 a 11: Mão de Ferro');
    else if(this.elevenTeam!==null)this.note(`Mão de 11: ${this.teamText(this.elevenTeam)} decide`);
  }
  private teamText(team:TrucoTeam):string {return `${this.nameOf(team)} e ${this.nameOf(team+2)}`;}

  /** The moment on the table has lasted: on to the next. */
  advance():void {
    switch(this.phase){
      case 'shuffling':this.deal();this.phase='dealing';return;
      case 'dealing':
        this.next=this.mao;
        if(this.elevenTeam!==null){this.phase='eleven';return;}
        this.phase='playing';this.turn=this.next;return;
      case 'trick-end':
        this.table=[];
        if(this.decided!==undefined){this.finishByTricks(this.decided);return;}
        this.next=this.lastTrickSeat!;this.phase='playing';this.turn=this.next;return;
      case 'hand-end':
        if(this.score[0]>=TRUCO.target||this.score[1]>=TRUCO.target){
          this.winner=this.score[0]>=TRUCO.target?0:1;this.phase='match-end';this.events.push({type:'match',winner:this.winner});return;
        }
        this.startHand();return;
      default:return;
    }
  }
  /** The timed moments, for the table's clock. */
  get timed():boolean {return this.phase==='shuffling'||this.phase==='dealing'||this.phase==='trick-end'||this.phase==='hand-end';}

  /**
   * A card on the table. `hidden`: the card goes face down, from the second trick on, and is worth nothing. Its face leaves
   * the game here: nobody, not even the table, is ever told what it was.
   */
  play(seat:number,cardId:string,hidden=false):void {
    if(this.phase!=='playing'||this.turn!==seat)throw new Error('Não é a sua vez.');
    if(hidden&&!this.tricks.length)throw new Error('Na primeira vaza não se joga carta encoberta.');
    const hand=this.hands[seat]!,index=hand.findIndex(c=>c.id===cardId);
    if(index<0)throw new Error('Essa carta não está na sua mão.');
    const [card]=hand.splice(index,1) as [TrucoFace];
    const play:TrucoPlay={seat,card:hidden?{id:card.id,rank:'?',suit:''}:card};
    this.table.push(play);this.played.push(play);
    this.note(hidden?`${this.nameOf(seat)} jogou uma carta encoberta`:`${this.nameOf(seat)} jogou ${cardText(card,this.vira!)}`);
    if(this.table.length<TRUCO.seats){this.next=(seat+1)%4;this.turn=this.next;return;}
    this.closeTrick();
  }
  private closeTrick():void {
    const vira=this.vira!,best=Math.max(...this.table.map(p=>cardStrength(p.card,vira))),top=this.table.filter(p=>cardStrength(p.card,vira)===best);
    const teams=new Set(top.map(p=>teamOf(p.seat))),first=top[0]!;
    // A tie between partners is that team's trick. A tie between teams leads again from whoever showed that strength first.
    const outcome:TrickOutcome=teams.size>1?'tie':teamOf(first.seat);
    if(outcome!=='tie')first.winner=true;
    this.tricks.push(outcome);this.lastTrickSeat=first.seat;this.turn=null;this.phase='trick-end';
    this.decided=handWinner(this.tricks);
    this.events.push({type:'trick',winner:outcome,seat:first.seat});
    this.note(outcome==='tie'?`${this.tricks.length}ª vaza: empate`:`${this.tricks.length}ª vaza: ${this.nameOf(first.seat)}`);
  }
  private finishByTricks(outcome:TrickOutcome):void {
    if(outcome==='tie'){
      const ruling=tieRuling({iron:this.iron,elevenTeam:this.elevenTeam,call:this.standing});
      this.finish(ruling.team,ruling.points,ruling.reason);return;
    }
    const wonTricks=this.tricks.filter(t=>t===outcome).length;
    this.finish(outcome,this.value,`${wonTricks===1?'Uma vaza e o desempate':`${wonTricks} vazas`}${this.value>1?`, valendo ${this.value}`:''}`);
  }
  private finish(team:TrucoTeam|null,points:number,reason:string):void {
    if(this.standing&&team!==null&&team!==this.standing.team&&points>0)this.behaviour[this.standing.team].lostCalls++;
    if(team!==null)this.score[team]=Math.min(TRUCO.target,this.score[team]+points);
    this.result={winner:team,points,reason};this.bet=null;this.turn=null;this.phase='hand-end';
    this.events.push({type:'hand',result:this.result});
    this.note(team===null?reason:`${this.teamText(team)}: +${points}`);
  }

  /** A card may go face down from the second trick on, on your turn. */
  canHide(seat:number):boolean {return this.phase==='playing'&&this.turn===seat&&this.tricks.length>0;}
  /** A team that did not make the last call may call the next step, at any moment of the hand. */
  callOption(seat:number):{value:TrucoCallValue;label:string}|null {
    if(this.phase!=='playing'||this.iron||this.elevenTeam!==null)return null;
    const team=teamOf(seat);
    if(this.standing?.team===team)return null;
    const step=nextCall(this.value);
    return step&&mayRaise(this.score,team,step.value,TRUCO.target)?{value:step.value,label:step.label}:null;
  }
  call(seat:number):void {
    if(this.iron)throw new Error('Na Mão de Ferro não se pede Truco.');
    if(this.elevenTeam!==null)throw new Error('Não é permitido pedir Truco na Mão de 11.');
    if(this.phase!=='playing')throw new Error('Agora não dá para pedir.');
    const option=this.callOption(seat);
    if(!option)throw new Error('Sua dupla não pode pedir agora.');
    this.raise(seat,option.value,this.value);
  }
  private raise(seat:number,to:TrucoCallValue,from:number):void {
    const team=teamOf(seat);
    // A card face down exposes nothing.
    this.bet={by:seat,team,from,to,exposed:this.table.some(p=>p.card.rank!=='?')};this.behaviour[team].calls++;
    this.phase='bet';this.turn=null;
    this.events.push({type:'call',seat,label:callLabel(to)});
    this.note(`${this.nameOf(seat)} pediu ${callLabel(to)}`);
  }
  /** The other team's next step, if it may take it. */
  raiseOption(seat:number):TrucoCallValue|null {
    if(!this.bet||teamOf(seat)===this.bet.team)return null;
    const step=nextCall(this.bet.to);
    return step&&mayRaise(this.score,teamOf(seat),step.value,TRUCO.target)?step.value:null;
  }
  /** "A decisão prevalecerá sobre um só parceiro, valendo a primeira iniciativa": whoever answers first answers for both. */
  answer(seat:number,answer:'accept'|'raise'|'run',to:number):void {
    const bet=this.bet;
    if(this.phase!=='bet'||!bet)throw new Error('Não há pedido para responder.');
    if(bet.to!==to)throw new Error('Esse pedido já mudou.');
    if(teamOf(seat)===bet.team)throw new Error('Quem responde é a outra dupla.');
    if(answer==='accept'){
      this.value=bet.to;this.standing={team:bet.team,exposed:bet.exposed};this.bet=null;this.phase='playing';this.turn=this.next;
      this.events.push({type:'accept',seat});
      this.note(`${this.nameOf(seat)} mandou cair: a mão vale ${this.value}`);
      return;
    }
    if(answer==='raise'){
      const raiseTo=this.raiseOption(seat);
      if(!raiseTo)throw new Error('Não dá para aumentar: veja o limite de tentos.');
      this.raise(seat,raiseTo,bet.to);
      return;
    }
    this.behaviour[teamOf(seat)].runs++;
    this.events.push({type:'run',seat,team:teamOf(seat)});
    this.note(`${this.nameOf(seat)} fugiu`);
    this.finish(bet.team,bet.from,`Fuga do ${callLabel(bet.to)}`);
  }
  /** Mão de 11, the team at 11 decides, first initiative. Showing needs cards that cannot lose. */
  decideEleven(seat:number,answer:'play'|'run'|'show'):void {
    if(this.phase!=='eleven'||this.elevenTeam===null)throw new Error('Não há Mão de 11 para decidir.');
    if(teamOf(seat)!==this.elevenTeam)throw new Error('Quem decide é a dupla que está na Mão de 11.');
    const team=this.elevenTeam,other:TrucoTeam=team===0?1:0;
    if(answer==='play'){this.phase='playing';this.turn=this.next;this.note(`${this.nameOf(seat)} decidiu jogar`);return;}
    if(answer==='run'){
      this.behaviour[team].runs++;
      this.events.push({type:'run',seat,team});this.note(`${this.nameOf(seat)} fugiu da Mão de 11`);
      this.finish(other,1,'Fuga na Mão de 11');
      return;
    }
    const cards=this.teamCards(team);
    if(!provenWin(cards,this.vira!))throw new Error('Essas cartas não garantem a vitória.');
    this.note(`${this.nameOf(seat)} mostrou as cartas`);
    this.finish(team,3,hasCasalMaior(cards,this.vira!)?'Casal Maior na mesa':'Cartas de vitória garantida');
  }
  private teamCards(team:TrucoTeam):TrucoFace[] {return [...this.hands[team]!,...this.hands[team+2]!];}
  canShow(team:TrucoTeam):boolean {return !!this.vira&&provenWin(this.teamCards(team),this.vira);}

  /** A face shown to the table: everyone sees it, as at a real table. Whether it tells the truth is the player's business. */
  signal(seat:number,signal:TrucoSignal):void {
    if(this.phase==='match-end'||this.phase==='shuffling')throw new Error('Agora não é hora de sinal.');
    this.signals.push({seat,signal,key:++this.signalKey});
  }

  /** A card as this seat sees it: face down for all in the Escuro until it is played. */
  private mask(cards:readonly TrucoFace[]):TrucoCard[] {
    return this.iron&&this.dark?cards.map(c=>({id:c.id,rank:'?',suit:''})):cards.map(c=>({...c}));
  }
  observe(seat:number):TrucoObservation {
    const team=teamOf(seat),eleven=this.phase==='eleven'&&this.elevenTeam===team;
    return {seat,team,phase:this.phase,hand:this.mask(this.hands[seat]!),partnerCards:eleven?this.mask(this.hands[partnerOf(seat)]!):[],vira:{...this.vira!},value:this.value,
      score:[...this.score],target:TRUCO.target,tricks:[...this.tricks],table:this.table.map(p=>({seat:p.seat,card:{...p.card}})),played:this.played.map(p=>({seat:p.seat,card:{...p.card}})),
      cardsLeft:this.hands.map(h=>h.length),next:this.next,iron:this.iron,dark:this.iron&&this.dark,
      bet:this.bet?{by:this.bet.by,team:this.bet.team,from:this.bet.from,to:this.bet.to}:null,canCall:!!this.callOption(seat),canHide:this.canHide(seat),raiseTo:this.raiseOption(seat),
      elevenTeam:this.elevenTeam,canShow:eleven&&this.canShow(team),signals:this.signals.map(s=>({seat:s.seat,signal:s.signal})),behaviour:[{...this.behaviour[0]},{...this.behaviour[1]}]};
  }
}
const RANK_TEXT:Partial<Record<TrucoRank,string>>={A:'Ás',J:'Valete',Q:'Dama',K:'Rei'};
export const rankText=(rank:TrucoRank)=>RANK_TEXT[rank]??rank;
function cardText(card:TrucoFace,vira?:TrucoFace):string {
  if(vira&&card.rank===manilhaRank(vira.rank))return MANILHA_NAMES[card.suit];
  return `${rankText(card.rank)} de ${card.suit}`;
}
