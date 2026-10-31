import {BLACKJACK,cardValue,chipStack,insuranceCost,isNatural,totalLabel,type BlackjackAction,type BlackjackCard,type BlackjackHand,type BlackjackSeat,type BlackjackTable} from '@bar/shared';
import {escape as e} from '../api';
import {coins,uiIcon} from '../ui-icons';
import {createTableSounds} from './sounds';
import './blackjack.css';

export interface BlackjackHooks {
  send(type:string,payload?:unknown):void;
  /** The server clock (ms). */
  now():number;
  balance():number|undefined;
  /** The game's general volume, 0–1. */
  volume():number;
  notify(text:string,error?:boolean):void;
}

const RANK_NAMES:Record<string,string>={A:'Ás',J:'Valete',Q:'Dama',K:'Rei'};
const SUIT_NAMES:Record<string,string>={'♠':'espadas','♥':'copas','♦':'ouros','♣':'paus'};
const HAND_BADGES:Record<string,[string,string]>={blackjack:['Blackjack','gold'],win:['Ganhou','win'],push:['Empate','push'],loss:['Perdeu','loss'],
  bust:['Estourou','loss'],surrender:['Desistiu','push'],surrendered:['Desistiu','push'],doubled:['Dobrou','info']};
const ACTIONS:ReadonlyArray<{id:BlackjackAction;label:string;icon:string}>=[
  {id:'hit',label:'Pedir',icon:'plus'},{id:'stand',label:'Parar',icon:'hand'},{id:'double',label:'Dobrar',icon:'coins'},
  {id:'split',label:'Dividir',icon:'split'},{id:'surrender',label:'Desistir',icon:'flag'}];
const KEYS:Record<string,number>={Digit1:0,Digit2:1,Digit3:2,Digit4:3,Digit5:4,Numpad1:0,Numpad2:1,Numpad3:2,Numpad4:3,Numpad5:4};
const SOUND_KEY='bar:blackjack:sound';
const RULES=[
  'Seis baralhos, embaralhados de novo a cada rodada.',
  'Blackjack (Ás + 10 nas duas primeiras cartas) paga 3 para 2.',
  'O dealer para em qualquer 17 e confere o blackjack com Ás ou 10 à mostra.',
  'Seguro (metade da aposta) paga 2 para 1 quando o dealer mostra um Ás.',
  'Dobrar: com as duas primeiras cartas, inclusive depois de dividir. Recebe uma carta só.',
  `Dividir: duas cartas do mesmo valor, até ${BLACKJACK.maxHands} mãos. Ases divididos recebem uma carta cada; 21 depois de dividir não é blackjack.`,
  'Desistir: antes de qualquer outra jogada, devolve metade da aposta.',
  'Sem resposta no tempo, a mão para. Sair da mesa com a rodada em jogo também para as suas mãos.',
];

const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const signed=(n:number)=>n>0?`+${n.toLocaleString('pt-BR')}`:n<0?`−${(-n).toLocaleString('pt-BR')}`:'±0';
const cardName=(card:{rank:string;suit:string})=>card.rank==='?'?'Carta virada':`${RANK_NAMES[card.rank]??card.rank} de ${SUIT_NAMES[card.suit]??card.suit}`;
const isRed=(suit:string)=>suit==='♥'||suit==='♦';
const chipMarkup=(value:number,extra='')=>`<span class="bj-chip" data-v="${value}"${extra}><b>${value>=1000?`${value/1000}k`:value}</b></span>`;
/** A stack of chips for an amount, the smallest on top (at most eight drawn). */
const stackMarkup=(amount:number)=>chipStack(amount).slice(0,8).reverse().map((v,i)=>chipMarkup(v,` style="--i:${i}"`)).join('');
function faceMarkup(card:{rank:string;suit:string}):string {
  const pip=`<span class="bj-pip">${card.suit}</span>`,corner=`<b>${e(card.rank)}</b><i>${card.suit}</i>`;
  return `<span class="bj-corner">${corner}</span>${['J','Q','K'].includes(card.rank)?`<span class="bj-royal">${e(card.rank)}<i>${card.suit}</i></span>`:pip}<span class="bj-corner bj-corner-end">${corner}</span>`;
}
/** Total of the cards that are face up ('?' counts nothing): "7/17" while soft, "BJ" for a natural. */
function totalOf(cards:readonly BlackjackCard[],split=false):string {return totalLabel(cards.filter(c=>c.rank!=='?'),split);}

/**
 * The blackjack table's panel (seated at the upstairs table): the felt with the dealer, the shoe and the four chairs,
 * the bet tray, the decisions and the results. Everything comes from the room's state (BarState.tables): this only
 * draws it and sends requests. Cards are kept by their place in the deal (seq), so a new card flies in from the shoe,
 * the hole card turns over, a split slides a card to its new hand, and nothing else moves.
 */
export function createBlackjackTable(root:HTMLElement,hooks:BlackjackHooks){
  const sounds=createTableSounds(hooks.volume);
  try{sounds.enabled=localStorage.getItem(SOUND_KEY)!=='off';}catch{/* in-memory only */}
  root.innerHTML=`<div class="bj">
    <header class="bj-head"><span class="bj-title">${uiIcon('cards')}<b>21 do Baiano</b></span><span class="bj-limits" data-bj="limits"></span>
      <span class="bj-head-tools"><button type="button" data-bj-tool="rules" aria-expanded="false" title="Regras da mesa" aria-label="Regras da mesa">${uiIcon('help')}</button>
      <button type="button" data-bj-tool="sound" title="Sons da mesa" aria-label="Sons da mesa" aria-pressed="${sounds.enabled}">${uiIcon(sounds.enabled?'volume':'volumeOff')}</button>
      <button type="button" data-bj-tool="leave" class="bj-leave" title="Sair da mesa" aria-label="Sair da mesa">${uiIcon('close')}<span>Sair</span></button></span></header>
    <div class="bj-felt">
      <div class="bj-shoe" aria-hidden="true"><i></i></div>
      <div class="bj-dealer" aria-label="Dealer"><div class="bj-hand bj-dealer-hand"><div class="bj-cards" data-bj="dealer-cards"></div><span class="bj-total" data-bj="dealer-total" hidden></span></div>
        <small class="bj-dealer-label">Dealer</small></div>
      <p class="bj-print" aria-hidden="true"><span>Blackjack paga 3 para 2</span><span>Dealer para em 17 · Seguro paga 2 para 1</span></p>
      <div class="bj-status" role="status" aria-live="polite"><b data-bj="status"></b><span class="bj-clock" data-bj="clock"></span></div>
      <div class="bj-timer" aria-hidden="true"><i data-bj="timer"></i></div>
      <div class="bj-seats">${[0,1,2,3].map(chair=>`<section class="bj-seat empty" data-chair="${chair}" aria-label="Lugar ${chair+1}">
        <div class="bj-hands" data-bj="hands"></div>
        <div class="bj-spot" data-bj="spot"><span class="bj-stack" data-bj="stack"></span><b class="bj-amount" data-bj="amount"></b></div>
        <footer class="bj-name"><b data-bj="name">Lugar livre</b><small data-bj="seat-status"></small></footer></section>`).join('')}</div>
      <div class="bj-rules" data-bj="rules" hidden><h3>Regras da casa</h3><ul>${RULES.map(r=>`<li>${e(r)}</li>`).join('')}</ul></div>
    </div>
    <div class="bj-controls" data-bj="controls"></div>
    <footer class="bj-foot"><span>Saldo <b data-bj="balance">—</b></span><span>Em jogo <b data-bj="staked">—</b></span><span class="bj-keys" data-bj="keys"></span></footer>
  </div>`;
  const q=<T extends HTMLElement=HTMLElement>(name:string,scope:ParentNode=root)=>scope.querySelector<T>(`[data-bj="${name}"]`)!;
  const shoe=root.querySelector<HTMLElement>('.bj-shoe')!;
  const seatEls=[...root.querySelectorAll<HTMLElement>('.bj-seat')];
  const cardEls=new Map<string,HTMLElement>();

  let table:BlackjackTable|undefined,selfId='',shownKey='',controlsKey='',drawn=false;
  /** The bet being built on the tray (sent with Apostar); drafted once per round, from the last bet. */
  let draft=0,draftFor=-1,repeatNext=false,leaveArmed=0;
  /** A request on its way: its controls stay locked until the table moves on (or a moment passes). */
  let sent:{kind:string;mark:string;at:number}|undefined;
  let timer={deadline:0,total:1},lastPhase='',lastTurn='',lastRound=-1;

  const me=()=>table?.seats.find(s=>s.playerId===selfId);
  const myHand=()=>{const seat=me();return table&&seat&&table.turnPlayerId===selfId&&table.phase==='playing'?seat.hands[table.turnHand]:undefined;};
  const busy=(kind:string,mark:string)=>!!sent&&sent.kind===kind&&sent.mark===mark&&hooks.now()-sent.at<2500;
  const send=(kind:string,mark:string,type:string,payload:unknown)=>{sounds.unlock();sent={kind,mark,at:hooks.now()};hooks.send(type,payload);};

  // ── Cards ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  function makeCard(card:BlackjackCard):HTMLElement {
    const el=document.createElement('div');
    el.className=`bj-card${card.rank==='?'?' down':''}${isRed(card.suit)?' red':''}`;
    el.setAttribute('role','img');el.setAttribute('aria-label',cardName(card));el.dataset.rank=card.rank;el.dataset.card=card.rank+card.suit;
    el.innerHTML=`<div class="bj-card-inner"><div class="bj-face">${card.rank==='?'?'':faceMarkup(card)}</div><div class="bj-back"></div></div>`;
    return el;
  }
  /** The hole card turned: its face is written, then it flips. */
  function turnOver(el:HTMLElement,card:BlackjackCard):void {
    el.querySelector('.bj-face')!.innerHTML=faceMarkup(card);el.dataset.rank=card.rank;el.dataset.card=card.rank+card.suit;
    el.classList.toggle('red',isRed(card.suit));el.setAttribute('aria-label',cardName(card));
    requestAnimationFrame(()=>el.classList.remove('down'));sounds.flip();
  }
  /**
   * Puts each container's cards in order, reusing the element of a card already on the felt. Returns the new ones, in
   * deal order, and those that changed hands (a split), with where they were.
   */
  function syncCards(groups:Array<[HTMLElement,readonly BlackjackCard[]]>,round:number){
    const before=new Map<HTMLElement,DOMRect>();
    if(drawn)for(const el of cardEls.values())before.set(el,el.getBoundingClientRect());
    const wanted=new Set<string>(),fresh:Array<{el:HTMLElement;seq:number}>=[],moved:HTMLElement[]=[];
    for(const [container,cards] of groups){
      cards.forEach((card,i)=>{
        const key=`${round}:${card.seq}`;wanted.add(key);
        let el=cardEls.get(key);
        if(!el){el=makeCard(card);cardEls.set(key,el);fresh.push({el,seq:card.seq});}
        else{
          if(el.dataset.rank==='?'&&card.rank!=='?')turnOver(el,card);
          else if(el.dataset.card!==card.rank+card.suit){const next=makeCard(card);el.replaceWith(next);cardEls.set(key,next);el=next;}
          if(el.parentElement&&el.parentElement!==container)moved.push(el);
        }
        if(container.children[i]!==el)container.insertBefore(el,container.children[i]??null);
      });
    }
    for(const [key,el] of cardEls)if(!wanted.has(key)){cardEls.delete(key);discard(el);}
    return {fresh:fresh.sort((a,b)=>a.seq-b.seq),moved,before};
  }
  /** New cards fly in from the shoe one after the other, at the pace the room deals them. */
  function dealIn(fresh:Array<{el:HTMLElement;seq:number}>):void {
    if(!drawn||!fresh.length)return;
    const from=shoe.getBoundingClientRect(),step=fresh.length>2?BLACKJACK.dealStepMs:160,still=reducedMotion();
    fresh.forEach(({el},i)=>{
      sounds.card(i*step);
      if(still)return;
      const to=el.getBoundingClientRect(),dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2);
      el.animate([{transform:`translate(${dx}px,${dy}px) rotate(-28deg) scale(.7)`,opacity:.2},{transform:'translate(0,0) rotate(0) scale(1)',opacity:1}],
        {duration:420,delay:i*step,easing:'cubic-bezier(.2,.8,.25,1)',fill:'backwards'});
    });
  }
  /** A split: the card slides from the old hand to the new one. */
  function slide(moved:HTMLElement[],before:Map<HTMLElement,DOMRect>):void {
    if(reducedMotion())return;
    for(const el of moved){
      const was=before.get(el);if(!was)continue;
      const now=el.getBoundingClientRect();
      el.animate([{transform:`translate(${was.left-now.left}px,${was.top-now.top}px)`},{transform:'translate(0,0)'}],{duration:320,easing:'ease-out'});
    }
  }
  /** Cards of a finished round slide back towards the shoe and go. */
  function discard(el:HTMLElement):void {
    if(reducedMotion()||!el.isConnected){el.remove();return;}
    const from=el.getBoundingClientRect(),to=shoe.getBoundingClientRect(),ghost=el.cloneNode(true) as HTMLElement;
    ghost.classList.add('bj-ghost');Object.assign(ghost.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});
    ghost.style.setProperty('--card-w',`${from.width}px`);
    document.body.append(ghost);el.remove();
    ghost.animate([{transform:'none',opacity:1},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) rotate(18deg) scale(.6)`,opacity:0}],
      {duration:380,easing:'ease-in'}).onfinish=()=>ghost.remove();
  }

  // ── Felt ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** A seat's hands; those that are gone go to `stale`, removed once their cards have flown back to the shoe. */
  function handsMarkup(container:HTMLElement,seat:BlackjackSeat,activeHand:number,stale:Element[]):HTMLElement[] {
    stale.push(...[...container.children].slice(seat.hands.length));
    while(container.children.length<seat.hands.length){
      const hand=document.createElement('div');hand.className='bj-hand';
      hand.innerHTML='<div class="bj-cards"></div><span class="bj-total" hidden></span><span class="bj-badge" hidden></span><span class="bj-hand-bet" hidden></span>';
      container.append(hand);
    }
    container.dataset.count=String(seat.hands.length);
    return seat.hands.map((hand,i)=>{
      const el=container.children[i] as HTMLElement,total=el.querySelector<HTMLElement>('.bj-total')!,badge=el.querySelector<HTMLElement>('.bj-badge')!,bet=el.querySelector<HTMLElement>('.bj-hand-bet')!;
      el.classList.toggle('active',i===activeHand);
      const label=totalOf(hand.cards,hand.split);total.hidden=!label;total.textContent=label;
      total.className=`bj-total${hand.total>21?' bust':label==='BJ'?' natural':''}`;
      const [text,tone]=HAND_BADGES[hand.outcome]??HAND_BADGES[hand.status]??['',''];
      badge.hidden=!text;badge.textContent=text;badge.className=`bj-badge ${tone}`;
      const own=seat.hands.length>1||hand.doubled;bet.hidden=!own;if(own)bet.innerHTML=coins(hand.bet);
      return el.querySelector<HTMLElement>('.bj-cards')!;
    });
  }
  function renderSeats(){
    const groups:Array<[HTMLElement,readonly BlackjackCard[]]>=[[q('dealer-cards'),table!.dealerCards]],stale:Element[]=[];
    seatEls.forEach((el,chair)=>{
      const seat=table!.seats.find(s=>s.chair===chair),mine=seat?.playerId===selfId;
      el.classList.toggle('empty',!seat);el.classList.toggle('mine',mine);el.classList.toggle('turn',!!seat&&table!.phase==='playing'&&table!.turnPlayerId===seat.playerId);
      el.classList.toggle('left',seat?.status==='left');
      q('name',el).textContent=seat?(mine?'Você':seat.displayName):'Lugar livre';
      q('seat-status',el).textContent=seat?seatStatus(seat):'';
      const amount=seat?(seat.staked||seat.bet):0,stack=q('stack',el);
      const ghost=mine&&!amount&&(table!.phase==='waiting'||table!.phase==='betting')?draft:0,shown=amount||ghost;
      if(stack.dataset.amount!==`${shown}:${!!ghost}`){stack.dataset.amount=`${shown}:${!!ghost}`;stack.innerHTML=stackMarkup(shown);stack.classList.toggle('draft',!!ghost);if(amount&&drawn)sounds.chip();}
      q('amount',el).innerHTML=amount?coins(amount):'';
      const hands=handsMarkup(q('hands',el),seat??{hands:[]} as unknown as BlackjackSeat,seat&&table!.turnPlayerId===seat.playerId&&table!.phase==='playing'?table!.turnHand:-1,stale);
      seat?.hands.forEach((hand,i)=>groups.push([hands[i]!,hand.cards]));
    });
    const {fresh,moved,before}=syncCards(groups,table!.round);
    for(const el of stale)el.remove();
    dealIn(fresh);slide(moved,before);
    const total=q('dealer-total'),label=totalOf(table!.dealerCards);
    total.hidden=!label;total.textContent=label;total.className=`bj-total${table!.dealerTotal>21?' bust':label==='BJ'?' natural':''}`;
  }
  function seatStatus(seat:BlackjackSeat):string {
    if(seat.status==='left')return 'Saiu · mãos paradas';
    if(table!.phase==='results'&&seat.staked)return `${signed(seat.net)} moedas`;
    if(seat.insured==='taken')return `Seguro de ${seat.insurance}`;
    return {watching:'Assistindo',betting:'Apostou',playing:'Jogando',turn:'Decidindo…',done:'Aguardando a casa'}[seat.status]??'';
  }

  // ── Status line and timer ─────────────────────────────────────────────────────────────────────────────────────────
  function statusText():string {
    const t=table!,seat=me(),turn=t.seats.find(s=>s.playerId===t.turnPlayerId);
    switch(t.phase){
      case 'waiting':return seat?'Faça sua aposta para abrir a rodada':'Mesa livre';
      case 'betting':return 'Apostas abertas';
      case 'closing':return 'Apostas fechadas';
      case 'dealing':return 'Distribuindo as cartas';
      case 'insurance':return 'O dealer mostra um Ás · seguro?';
      case 'playing':
        if(turn?.playerId===selfId)return seat&&seat.hands.length>1?`Sua vez · mão ${t.turnHand+1} de ${seat.hands.length}`:'Sua vez';
        return turn?`Vez de ${turn.displayName}`:'Rodada em jogo';
      case 'dealer':return 'Vez da casa';
      case 'results':{
        if(!seat?.staked)return t.dealerTotal>21?'A casa estourou':'Rodada encerrada';
        return seat.net>0?`Você ganhou ${signed(seat.net)}`:seat.net<0?`Deu casa · ${signed(seat.net)}`:'Empate: a aposta volta';
      }
    }
  }
  function tickTimer():void {
    if(!table)return;
    const now=hooks.now(),left=Math.max(0,timer.deadline-now),bar=q('timer'),clock=q('clock');
    const counted=['betting','insurance','playing','results'].includes(table.phase)&&timer.deadline>0;
    bar.style.setProperty('--t',counted?String(Math.min(1,left/timer.total)):'0');
    bar.classList.toggle('urgent',counted&&table.phase==='playing'&&table.turnPlayerId===selfId&&left<5000);
    const text=counted?`${Math.ceil(left/1000)} s`:'';
    if(clock.textContent!==text)clock.textContent=text;
  }

  // ── Controls ──────────────────────────────────────────────────────────────────────────────────────────────────────
  function allowed(action:BlackjackAction,hand:BlackjackHand,seat:BlackjackSeat,balance:number):boolean {
    const two=hand.cards.length===2,splitAces=hand.split&&hand.cards[0]?.rank==='A';
    switch(action){
      case 'double':return two&&!splitAces&&balance>=hand.bet;
      case 'split':return two&&!splitAces&&cardValue(hand.cards[0]!.rank)===cardValue(hand.cards[1]!.rank)&&seat.hands.length<BLACKJACK.maxHands&&balance>=hand.bet;
      case 'surrender':return two&&!hand.split&&seat.hands.length===1;
      default:return true;
    }
  }
  function renderControls():void {
    const t=table!,seat=me(),balance=hooks.balance()??0,{minBet:min,maxBet:max}=t,hand=myHand();
    const keyed=JSON.stringify([t.phase,t.move,t.round,seat?.status,seat?.bet,seat?.lastBet,seat?.insured,seat?.staked,draft,repeatNext,balance,sent?.mark,leaveArmed>0,hand?.cards.length]);
    if(keyed===controlsKey)return;controlsKey=keyed;
    const box=q('controls');let html='',keys='';
    if(!seat)html=`<p class="bj-note">${uiIcon('seat')} Sentado, você aposta na próxima rodada.</p>`;
    else if(t.phase==='waiting'||t.phase==='betting'){
      const placed=seat.bet>0,same=placed&&draft===seat.bet,room=Math.min(max,balance)-draft;
      html=`<div class="bj-tray" role="group" aria-label="Fichas">${BLACKJACK.chips.map(v=>`<button type="button" class="bj-chip-btn" data-bj-chip="${v}" ${v>room?'disabled':''} aria-label="Ficha de ${v}">${chipMarkup(v)}</button>`).join('')}</div>
        <div class="bj-bet"><small>Sua aposta</small><b>${draft?coins(draft):'—'}</b><span>${min}–${max}</span></div>
        <div class="bj-bet-tools"><button type="button" class="bj-mini" data-bj-bet="clear" ${!draft?'disabled':''}>${uiIcon('trash')}Limpar</button>
          <button type="button" class="bj-mini" data-bj-bet="double" ${!draft||draft*2>Math.min(max,balance)?'disabled':''}>×2</button>
          <button type="button" class="bj-mini" data-bj-bet="repeat" ${!seat.lastBet||seat.lastBet>balance||seat.lastBet===seat.bet?'disabled':''}>${uiIcon('refresh')}Repetir${seat.lastBet?` ${seat.lastBet}`:''}</button></div>
        ${same?`<button type="button" class="bj-primary done" data-bj-bet="withdraw" aria-label="Aposta feita. Retirar">${uiIcon('check')}<span>Aposta feita</span><small>Retirar</small></button>`
          :`<button type="button" class="bj-primary" data-bj-bet="place" ${draft<min||draft>Math.min(max,balance)||busy('bet',String(draft))?'disabled':''}>${uiIcon('chevronRight')}<span>${placed?'Trocar aposta':'Apostar'}</span></button>`}`;
    }
    else if(t.phase==='insurance'&&seat.insured==='pending'){
      const cost=insuranceCost(seat.hands[0]?.bet??0),natural=!!seat.hands[0]&&isNatural(seat.hands[0].cards);
      html=`<p class="bj-note">${natural?`Você tem blackjack: com o seguro (${cost}), recebe 1 para 1 de qualquer jeito.`:`Seguro custa ${cost} e paga 2 para 1 se o dealer tiver blackjack.`}</p>
        <button type="button" class="bj-act" data-bj-insure="yes" ${cost>balance||busy('insure','')?'disabled':''}>${uiIcon('shield')}<span>${natural?'Pagar 1 para 1':'Fazer seguro'}</span><kbd>1</kbd></button>
        <button type="button" class="bj-act" data-bj-insure="no" ${busy('insure','')?'disabled':''}>${uiIcon('close')}<span>Sem seguro</span><kbd>2</kbd></button>`;
      keys='1 · 2 decidem o seguro';
    }
    else if(hand){
      html=ACTIONS.map((a,i)=>`<button type="button" class="bj-act" data-bj-act="${a.id}" ${!allowed(a.id,hand,seat,balance)||busy('act',String(t.move))?'disabled':''}>${uiIcon(a.icon)}<span>${a.label}</span><kbd>${i+1}</kbd></button>`).join('');
      keys='1–5 jogam a mão';
    }
    else if(t.phase==='results'&&seat){
      const again=seat.lastBet&&seat.lastBet<=balance;
      html=`<p class="bj-note">${seat.staked?`${seat.net>0?'Bela mão!':seat.net<0?'Fica para a próxima.':'Nem ganhou, nem perdeu.'} `:''}Nova rodada em instantes.</p>
        ${again?`<button type="button" class="bj-mini${repeatNext?' on':''}" data-bj-bet="queue" aria-pressed="${repeatNext}">${uiIcon('refresh')}${repeatNext?`Apostando ${seat.lastBet} na próxima`:`Repetir ${seat.lastBet} na próxima`}</button>`:''}`;
    }
    else html=`<p class="bj-note">${seat.status==='watching'?'Rodada em andamento: você entra na próxima.':seat.status==='left'?'Você saiu desta rodada.':'Aguarde a sua vez.'}</p>`;
    if(leaveArmed)html=`<p class="bj-note warn">${uiIcon('alert')} Suas mãos param onde estão e a rodada termina sem você.</p><button type="button" class="bj-primary danger" data-bj-tool="leave-confirm">${uiIcon('logOut')}<span>Sair mesmo assim</span></button><button type="button" class="bj-mini" data-bj-tool="leave-cancel">Ficar</button>`;
    box.innerHTML=html;q('keys').textContent=keys;
  }

  // ── Whole table ───────────────────────────────────────────────────────────────────────────────────────────────────
  function render():void {
    const t=table!,seat=me(),phaseChanged=t.phase!==lastPhase;
    root.querySelector('.bj')!.setAttribute('data-phase',t.phase);
    q('limits').textContent=`Aposta ${t.minBet}–${t.maxBet}`;
    if(t.deadline!==timer.deadline)timer={deadline:t.deadline,total:Math.max(1,t.deadline-hooks.now())};
    if(t.phase!=='results')for(const el of seatEls)q('spot',el).classList.remove('won','lost','pushed');
    // A new round: the draft starts from the last bet; a queued repeat is placed as soon as the table opens again.
    if(seat&&(t.phase==='waiting'||t.phase==='betting')&&draftFor!==t.round){draftFor=t.round;draft=seat.bet||Math.min(seat.lastBet,t.maxBet);}
    renderSeats();
    q('status').textContent=statusText();
    renderFoot();
    if(seat&&repeatNext&&t.phase==='waiting'){repeatNext=false;if(seat.lastBet&&seat.lastBet<=(hooks.balance()??0)){draft=seat.lastBet;send('bet',String(draft),'blackjack.bet',{amount:draft});}}
    if(drawn&&phaseChanged&&t.phase==='results')celebrate();
    if(drawn&&t.turnPlayerId===selfId&&t.phase==='playing'&&lastTurn!==`${t.round}:${selfId}`)sounds.turn();
    lastTurn=t.phase==='playing'?`${t.round}:${t.turnPlayerId}`:'';lastPhase=t.phase;lastRound=t.round;
    if(t.phase!=='playing'&&t.phase!=='insurance'&&!seat?.staked)leaveArmed=0;
    renderControls();tickTimer();drawn=true;
  }
  function renderFoot():void {const seat=me();q('balance').innerHTML=coins(hooks.balance()??0);q('staked').innerHTML=seat?.staked?coins(seat.staked):'—';}
  /** Results: each seat's net floats over its bet, and the local player hears how it went. */
  function celebrate():void {
    for(const seat of table!.seats){
      if(!seat.staked)continue;
      const spot=q('spot',seatEls[seat.chair]!),float=document.createElement('span');
      float.className=`bj-float ${seat.net>0?'win':seat.net<0?'loss':'push'}`;float.textContent=signed(seat.net);
      spot.append(float);setTimeout(()=>float.remove(),2200);
      spot.classList.remove('won','lost');void spot.offsetWidth;spot.classList.add(seat.net>0?'won':seat.net<0?'lost':'pushed');
    }
    const mine=me();
    if(mine?.staked){
      if(mine.hands.some(h=>h.outcome==='blackjack')&&mine.net>0)sounds.natural();
      else if(mine.net>0)sounds.win();else if(mine.net<0)sounds.lose();else sounds.push();
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  function act(action:BlackjackAction):void {
    const t=table,seat=me(),hand=myHand();
    if(!t||!seat||!hand||busy('act',String(t.move))||!allowed(action,hand,seat,hooks.balance()??0))return;
    send('act',String(t.move),'blackjack.action',{action,hand:t.turnHand,move:t.move});
    if(action==='double'||action==='split')sounds.chip();
    renderControls();
  }
  function insure(take:boolean):void {
    if(!table||me()?.insured!=='pending'||busy('insure',''))return;
    send('insure','','blackjack.insurance',{take});if(take)sounds.chip();renderControls();
  }
  function requestLeave():void {
    const seat=me(),inPlay=!!seat?.staked&&!['results','waiting','betting'].includes(table?.phase??'');
    if(inPlay&&!leaveArmed){leaveArmed=Date.now();renderControls();return;}
    leaveArmed=0;hooks.send('blackjack.leave');
  }
  root.addEventListener('click',event=>{
    const target=event.target as HTMLElement,button=target.closest<HTMLButtonElement>('button');
    if(!button||button.disabled||!table)return;
    sounds.unlock();
    const chip=button.dataset.bjChip,bet=button.dataset.bjBet,tool=button.dataset.bjTool,seat=me(),balance=hooks.balance()??0;
    if(chip){draft=Math.min(table.maxBet,balance,draft+Number(chip));sounds.chip();renderSeats();renderControls();return;}
    if(button.dataset.bjAct){act(button.dataset.bjAct as BlackjackAction);return;}
    if(button.dataset.bjInsure){insure(button.dataset.bjInsure==='yes');return;}
    if(bet==='clear'){draft=0;renderSeats();renderControls();return;}
    if(bet==='double'){draft=Math.min(table.maxBet,balance,draft*2);sounds.chip();renderSeats();renderControls();return;}
    if(bet==='repeat'&&seat?.lastBet){draft=seat.lastBet;send('bet',String(draft),'blackjack.bet',{amount:draft});return;}
    if(bet==='place'){send('bet',String(draft),'blackjack.bet',{amount:draft});renderControls();return;}
    if(bet==='withdraw'){send('bet','0','blackjack.bet',{amount:0});return;}
    if(bet==='queue'){repeatNext=!repeatNext;renderControls();return;}
    if(tool==='rules'){const rules=q('rules');rules.hidden=!rules.hidden;button.setAttribute('aria-expanded',String(!rules.hidden));return;}
    if(tool==='sound'){
      sounds.enabled=!sounds.enabled;try{localStorage.setItem(SOUND_KEY,sounds.enabled?'on':'off');}catch{}
      button.setAttribute('aria-pressed',String(sounds.enabled));button.innerHTML=uiIcon(sounds.enabled?'volume':'volumeOff');return;
    }
    if(tool==='leave'){requestLeave();return;}
    if(tool==='leave-confirm'){leaveArmed=0;hooks.send('blackjack.leave');return;}
    if(tool==='leave-cancel'){leaveArmed=0;renderControls();}
  });
  // 1–5 play the hand (1 and 2 answer the insurance), unless typing.
  const keys=(event:KeyboardEvent)=>{
    if(!table||root.classList.contains('hidden')||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
    const el=document.activeElement as HTMLElement|null;
    if(el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable))return;
    const index=KEYS[event.code];if(index===undefined)return;
    if(table.phase==='insurance'&&me()?.insured==='pending'&&index<2){event.preventDefault();insure(index===0);return;}
    if(myHand()){event.preventDefault();act(ACTIONS[index]!.id);}
  };
  document.addEventListener('keydown',keys);
  const ticker=setInterval(()=>{if(table&&!root.classList.contains('hidden')){tickTimer();if(leaveArmed&&Date.now()-leaveArmed>6000){leaveArmed=0;renderControls();}else if(sent&&hooks.now()-sent.at>=2500){sent=undefined;renderControls();}}},250);

  return {
    /** The room's table state (as synced) and who is looking at it. */
    update(next:BlackjackTable,self:string):void {
      const key=JSON.stringify(next)+self;
      if(key===shownKey)return;
      shownKey=key;
      // The answer to a request arrived (the table moved): its controls unlock.
      if(sent&&table&&(next.move!==table.move||next.phase!==table.phase||JSON.stringify(next.seats.find(s=>s.playerId===self))!==JSON.stringify(me())))sent=undefined;
      table=next;selfId=self;render();
    },
    /** E at the table: leaving with coins in play asks first. */
    requestLeave,
    /** The wallet changed (the bet tray depends on it). */
    refresh():void {if(table){renderFoot();renderControls();}},
    /** Off the table: the next time it opens, nothing animates from the old state. */
    reset():void {table=undefined;shownKey='';controlsKey='';drawn=false;draft=0;draftFor=-1;repeatNext=false;leaveArmed=0;sent=undefined;lastPhase='';lastTurn='';lastRound=-1;
      for(const el of cardEls.values())el.remove();cardEls.clear();},
    destroy():void {document.removeEventListener('keydown',keys);clearInterval(ticker);root.innerHTML='';},
  };
}
