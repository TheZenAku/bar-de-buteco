import {MANILHA_NAMES,NEUTRAL_FACE,SIGNAL_FACES,TRUCO,TRUCO_SIGNALS,manilhaRank,rankText,type TrucoCard,type TrucoRank,type TrucoSeatView,type TrucoSignal,type TrucoTeam,type TrucoView} from '@bar/shared';
import {escape as e} from '../api';
import {customerAvatarSvg} from '../highfood/npc-avatar';
import {coins,uiIcon} from '../ui-icons';
import {SUITS,makeCard,manilhaOf,paintCard,suitSvg} from './card';
import {createTrucoSounds} from './sounds';
import './truco.css';

export interface TrucoHooks {
  send(type:string,payload?:unknown):void;
  /** The server clock (ms). */
  now():number;
  balance():number|undefined;
  /** The game's general volume, 0–1. */
  volume():number;
  notify(text:string,error?:boolean):void;
}

const SOUND_KEY='bar:truco:sound';
const POSITIONS=['bottom','right','top','left'] as const;
const RULES:ReadonlyArray<readonly [string,string]>=[
  ['Baralho','40 cartas, sem 8, 9, 10 e curingas. Três cartas por jogador e uma vira.'],
  ['Manilhas','A carta seguinte à vira. Do naipe mais forte ao mais fraco: Paus (Zap), Copas (Copeta), Espadas (Espadilha) e Ouros (Pica-fumo).'],
  ['Demais cartas','Da mais forte à mais fraca: 3, 2, Ás, Rei, Valete, Dama, 7, 6, 5 e 4.'],
  ['Pontos','Mão normal 1 tento, Truco 3, Seis 6, Nove 9 e Doze 12. A partida vai a 12 tentos.'],
  ['A mão','Até três vazas. Cada um joga uma carta por vaza, a mais forte vence, e a dupla que vencer duas vazas ganha a mão.'],
  ['Pedidos','A qualquer hora da mão, a dupla que não fez o último pedido pode pedir o próximo. Quem responde manda cair, aumenta ou foge. Fugir paga o que a mão valia: 1, 3, 6 ou 9. Um parceiro responde pelos dois: vale a primeira iniciativa.'],
  ['Limite','Quem já fecha a partida com o valor da mão não pode aumentar, salvo com o placar empatado. Quem tem nove não pede Seis.'],
  ['Empates','Empate na 1ª vaza: quem vencer a próxima leva. Empate na 2ª ou na 3ª: leva quem venceu a 1ª. Três empates sem pedido: ninguém pontua. Com pedido: três tentos. Quem pediu com carta exposta perde; quem pediu no escuro, sem carta na vaza, ganha.'],
  ['Mão de 11','Os parceiros consultam as cartas um do outro. Jogar vale três tentos; fugir dá um tento aos adversários. Não se pede Truco. Três empates dão três tentos aos adversários. Com vitória garantida (Casal Maior), basta mostrar as cartas.'],
  ['Mão de Ferro','No 11 a 11, sem pedidos. Empate: ninguém pontua e o baralho passa. Na variação Escuro, ninguém olha as próprias cartas.'],
  ['Encoberta','Da 2ª vaza em diante, a carta pode ir virada para a mesa. Ela não vale nada e ninguém fica sabendo qual era.'],
  ['Apostas','Contra NPCs, o nível define a aposta por pessoa: Iniciante 100, Médio 150, Experiente 200, e todos os NPCs são daquele nível. Com gente nas duas duplas, cada um põe no mínimo 400. Quem ganha recebe o dobro do que pôs. Quem sai no meio perde a aposta.'],
  ['Sinais','Clique no rosto ao lado do seu avatar e escolha: 😉 Zap, 🤨 Copeta, 😕 Espadilha, 😛 Pica-fumo. O rosto aparece por um instante, para a mesa toda. Quem estiver olhando, vê.'],
];
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const two=(n:number)=>String(n).padStart(2,'0');
const teamName=(team:TrucoTeam,mine:TrucoTeam)=>team===mine?'Nós':'Eles';
const trickOf=(team:TrucoTeam,mine:TrucoTeam)=>team===mine?'Vaza nossa':'Vaza deles';

/**
 * The truco table's panel: the whole screen, a violet felt with the four players around it (you below, your partner across,
 * the opponents on the sides), the score, the vira and the trick in the middle, your three cards and the moves of the
 * moment. It draws the view of the table it is given and sends requests; the rules are elsewhere. Cards are kept by id, so
 * a card moves from wherever it was to wherever it is now, and nothing else moves.
 */
export function createTrucoTable(root:HTMLElement,hooks:TrucoHooks){
  const sounds=createTrucoSounds(hooks.volume);
  try{sounds.enabled=localStorage.getItem(SOUND_KEY)!=='off';}catch{/* in-memory only */}
  root.innerHTML=`<div class="tc">
    <header class="tc-head"><span class="tc-title">${uiIcon('cards')}<b>Truco</b></span><span class="tc-mode" data-tc="mode"></span>
      <span class="tc-tools"><button type="button" data-tc-tool="rules" aria-expanded="false" title="Regras" aria-label="Regras">${uiIcon('help')}</button>
      <button type="button" data-tc-tool="sound" title="Sons da mesa" aria-label="Sons da mesa" aria-pressed="${sounds.enabled}">${uiIcon(sounds.enabled?'volume':'volumeOff')}</button>
      <button type="button" data-tc-tool="leave" class="tc-leave" title="Sair da mesa" aria-label="Sair da mesa">${uiIcon('logOut')}<span>Sair</span></button></span></header>
    <div class="tc-felt" data-tc="felt">
      <div class="tc-oval" aria-hidden="true"></div>
      <section class="tc-score" aria-label="Placar" data-tc="score"></section>
      <section class="tc-log" aria-label="O que aconteceu" data-tc="log"></section>
      ${POSITIONS.slice(1).map(pos=>`<section class="tc-seat ${pos}" data-pos="${pos}">${seatShell()}</section>`).join('')}
      <div class="tc-center">
        <p class="tc-status" data-tc="status-line" role="status" aria-live="polite"><em class="tc-iron" data-tc="iron" hidden></em><b data-tc="status"></b><span class="tc-timer" aria-hidden="true"><i data-tc="timer"></i></span></p>
        <section class="tc-tricks" aria-label="Vazas"><h4>Vazas</h4><ol data-tc="tricks"></ol></section>
        <div class="tc-cross" data-tc="cross"><p class="tc-banner" data-tc="banner" hidden></p>
          ${POSITIONS.map(pos=>`<div class="tc-slot ${pos}" data-slot="${pos}"></div>`).join('')}
          <span class="tc-compass" data-tc="compass" aria-hidden="true"><i></i></span></div>
        <section class="tc-vira" aria-label="Vira"><h4>Vira</h4><div class="tc-stack" data-tc="deck"><i></i><div class="tc-vira-card" data-tc="vira"></div></div><p class="tc-manilha-rank" data-tc="manilha"></p><ul class="tc-legend" data-tc="legend"></ul></section>
      </div>
      <div class="tc-bottom">
        <section class="tc-seat bottom" data-pos="bottom">${seatShell(true)}<div class="tc-signals" data-tc="signals" hidden></div></section>
        <section class="tc-hand" data-tc="hand" aria-label="Suas cartas"></section>
        <section class="tc-actions" data-tc="actions" aria-label="Ações"></section>
      </div>
      <div class="tc-call" data-tc="call" hidden aria-hidden="true"></div>
      <div class="tc-dialog" data-tc="dialog" hidden role="dialog" aria-modal="false"></div>
      <div class="tc-rules" data-tc="rules" hidden><h3>Regras da mesa</h3><dl>${RULES.map(([t,d])=>`<dt>${e(t)}</dt><dd>${e(d)}</dd>`).join('')}</dl></div>
      <div class="tc-end" data-tc="end" hidden></div>
      <div class="tc-lobby" data-tc="lobby" hidden></div>
    </div>
    <footer class="tc-foot"><span>Saldo <b data-tc="balance">—</b></span><span>Em jogo <b data-tc="stake">—</b></span><span class="tc-keys" data-tc="keys"></span></footer>
  </div>`;
  function seatShell(mine=false):string {
    const face=mine?`<button type="button" class="tc-mood mine" data-tc="face" data-tc-do="signals" aria-expanded="false" aria-label="Fazer um sinal" title="Fazer um sinal">${NEUTRAL_FACE}</button>`:`<span class="tc-mood" data-tc="face" aria-hidden="true">${NEUTRAL_FACE}</span>`;
    return `<div class="tc-player"><span class="tc-avatar" data-tc="avatar"></span>${face}
      <span class="tc-id"><b data-tc="name"></b><span class="tc-team" data-tc="team"></span><small data-tc="kind"></small></span>
      <span class="tc-turn" aria-hidden="true"><i data-tc="seat-timer"></i></span><span class="tc-dealer" data-tc="dealer" hidden title="Quem deu as cartas">Pé</span></div>
      <div class="tc-backs" data-tc="backs"></div><span class="tc-say" data-tc="say" hidden></span>`;
  }
  const q=<T extends HTMLElement=HTMLElement>(name:string,scope:ParentNode=root)=>scope.querySelector<T>(`[data-tc="${name}"]`)!;
  const seatEl=(pos:string)=>root.querySelector<HTMLElement>(`.tc-seat[data-pos="${pos}"]`)!;
  const slotEl=(pos:string)=>root.querySelector<HTMLElement>(`[data-slot="${pos}"]`)!;

  let lastShuffled=-1;
  let view:TrucoView|undefined,drawn=false,selected='',handKey=-1,lastTurn:number|null=null,lastScore:[number,number]=[0,0],lastBet='',actionsKey='',dialogKey='',endKey='',lobbyKey='',signalsOpen=false,partnerShown=false,leaveArmed=0;
  /** The last face each seat showed, and the timers that bring the neutral one back. */
  const faces=new Map<number,{key:number;timer:ReturnType<typeof setTimeout>|undefined}>();
  /** A request on its way: its controls stay locked until the table moves on (or a moment passes). */
  let sent:{mark:string;at:number}|undefined;
  const cards=new Map<string,HTMLElement>();
  const posOf=(seat:number)=>POSITIONS[(seat-view!.selfSeat+4)%4]!;
  const seatOf=(seat:number)=>view!.seats.find(s=>s.seat===seat);
  const myTeam=():TrucoTeam=>seatOf(view!.selfSeat)!.team;
  const myTurn=()=>!!view&&view.phase==='playing'&&view.turn===view.selfSeat&&!view.bet;
  const locked=(mark:string)=>!!sent&&sent.mark===mark&&hooks.now()-sent.at<2500;
  const send=(mark:string,type:string,payload?:unknown)=>{sounds.unlock();sent={mark,at:hooks.now()};hooks.send(type,payload);};

  // ── Cards ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Puts every card where the view says, reusing elements; returns who is new and where the others came from. */
  function syncCards(groups:Array<[HTMLElement,TrucoCard[],number]>){
    const before=new Map<HTMLElement,DOMRect>(),wanted=new Set<string>(),fresh:Array<{el:HTMLElement;seq:number}>=[];
    if(drawn)for(const el of cards.values())before.set(el,el.getBoundingClientRect());
    for(const [container,list,place] of groups){
      list.forEach((card,i)=>{
        wanted.add(card.id);
        let el=cards.get(card.id);
        const manilha=manilhaOf(card,view!.vira);
        if(!el){el=makeCard(card,manilha);el.dataset.id=card.id;cards.set(card.id,el);fresh.push({el,seq:i*4+place});}
        else{
          const wasDown=el.classList.contains('down');
          paintCard(el,card,manilha);
          if(wasDown&&card.rank!=='?')sounds.flip();
        }
        if(container.children[i]!==el)container.insertBefore(el,container.children[i]??null);
      });
      for(const extra of [...container.children])if(extra instanceof HTMLElement&&extra.dataset.id&&!list.some(c=>c.id===extra.dataset.id))extra.remove();
    }
    for(const [id,el] of cards)if(!wanted.has(id)){cards.delete(id);el.remove();}
    return {fresh:fresh.sort((a,b)=>a.seq-b.seq),before};
  }
  function fly(el:HTMLElement,from:DOMRect,opts:{delay?:number;ms?:number;turn?:number;easing?:string}={}):void {
    if(reducedMotion())return;
    const to=el.getBoundingClientRect(),dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2),scale=from.width/Math.max(1,to.width);
    if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
    const [rest='0px',restY='0px']=(getComputedStyle(el).translate==='none'?'':getComputedStyle(el).translate).split(' ').filter(Boolean);
    el.animate([{translate:`${parseFloat(rest)+dx}px ${parseFloat(restY)+dy}px`,transform:`rotate(${opts.turn??0}deg) scale(${scale})`,zIndex:20,offset:0},{transform:'none',zIndex:20,offset:1}],
      {duration:opts.ms??420,delay:opts.delay??0,easing:opts.easing??'cubic-bezier(.2,.8,.25,1)',fill:'backwards'});
  }
  /** Cards of a finished trick slide to the winner's side, cards of a finished hand back to the deck. */
  function sweep(els:HTMLElement[],to:HTMLElement):void {
    if(reducedMotion()||!drawn)return;
    const target=to.getBoundingClientRect();
    for(const el of els){
      const from=el.getBoundingClientRect(),ghost=el.cloneNode(true) as HTMLElement;
      ghost.classList.add('tc-ghost');Object.assign(ghost.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});
      ghost.style.setProperty('--card-w',`${from.width}px`);
      document.body.append(ghost);
      ghost.animate([{transform:'none',opacity:1},{transform:`translate(${target.left+target.width/2-from.left-from.width/2}px,${target.top+target.height/2-from.top-from.height/2}px) scale(.55) rotate(14deg)`,opacity:0}],
        {duration:420,easing:'ease-in'}).onfinish=()=>ghost.remove();
    }
  }
  function renderCards():void {
    const v=view!,pos=(seat:number)=>posOf(seat);
    const slots=new Map(POSITIONS.map(p=>[p,[] as TrucoCard[]]));
    for(const play of v.table)slots.get(pos(play.seat))!.push(play.card);
    const groups:Array<[HTMLElement,TrucoCard[],number]>=POSITIONS.map(p=>[slotEl(p),slots.get(p)!,0]);
    const hand=v.mine;
    if(v.phase==='lobby')for(const pos of POSITIONS)q('backs',seatEl(pos)).replaceChildren();
    else for(const seat of v.seats){
      if(seat.seat===v.selfSeat)continue;
      const shown=seatEl(pos(seat.seat));
      groups.push([q('backs',shown),Array.from({length:seat.cards},(_,i)=>({id:`back-${v.handNumber}-${seat.seat}-${i}`,rank:'?',suit:''})),(seat.seat-v.dealer+3)%4]);
    }
    groups.push([q('hand'),hand,(v.selfSeat-v.dealer+3)%4]);
    // The trick's old cards leave for whoever won them before the new state takes them away.
    const onTable=new Set(v.table.map(p=>p.card.id)),leaving=[...root.querySelectorAll<HTMLElement>('.tc-slot .tc-card')].filter(el=>!onTable.has(el.dataset.id??''));
    if(leaving.length){const seat=v.tricks.filter(t=>t.winner!==null).at(-1)?.seat;sweep(leaving,seat===undefined?q('deck'):seatEl(pos(seat)));}
    const {fresh,before}=syncCards(groups);
    // Reused cards: mine going to the table keep their flight; everything else settles without fuss.
    for(const [el,was] of before)if(el.isConnected)fly(el,was,{ms:el.closest('.tc-slot')?360:260,turn:el.closest('.tc-slot')?-8:0});
    const deck=q('deck').getBoundingClientRect(),dealing=v.phase==='dealing';
    fresh.forEach(({el},index)=>{
      const slot=el.closest<HTMLElement>('.tc-slot'),play=slot&&v.table.find(p=>p.card.id===el.dataset.id);
      if(play&&drawn){
        // Someone else's card: it leaves their hand and lands here.
        fly(el,seatEl(pos(play.seat)).getBoundingClientRect(),{ms:380,turn:pos(play.seat)==='left'?-24:24});sounds.card();
        return;
      }
      if(!drawn&&!dealing)return;
      fly(el,deck,{delay:dealing?index*70:0,ms:380,turn:-26});
      if(dealing)sounds.card(index*70);
    });
    root.querySelectorAll<HTMLElement>('.tc-slot .tc-card').forEach(el=>{
      const play=v.table.find(p=>p.card.id===el.dataset.id);
      el.classList.toggle('winner',!!play?.winner);
      el.classList.toggle('lost',v.phase==='trick-end'&&!play?.winner&&v.table.some(p=>p.winner));
    });
    // Your hand: fanned; the selected card stands up.
    const count=hand.length;
    q('hand').dataset.count=String(count);
    [...q('hand').children].forEach((node,i)=>{
      const el=node as HTMLElement;
      el.style.setProperty('--fan',String(i-(count-1)/2));
      el.classList.toggle('selected',el.dataset.id===selected);
      el.classList.toggle('playable',myTurn());
      if(myTurn()){el.setAttribute('tabindex','0');el.setAttribute('role','button');}else{el.removeAttribute('tabindex');el.setAttribute('role','img');}
    });
  }

  // ── Players, score, centre ────────────────────────────────────────────────────────────────────────────────────────
  const initial=(seat:TrucoSeatView)=>`<span class="tc-initial" style="--avatar:${e(seat.color??'#a77bff')}">${e(seat.name.slice(0,1).toUpperCase())}</span>`;
  /** An NPC's portrait; a person's Highgram photo, or their initial on their colour when they have none. */
  function paintAvatar(el:HTMLElement,seat:TrucoSeatView):void {
    if(seat.kind==='empty'){el.innerHTML='';return;}
    if(seat.kind==='npc'&&seat.look){el.innerHTML=customerAvatarSvg(seat.look as Parameters<typeof customerAvatarSvg>[0],`truco${seat.seat}`);return;}
    el.innerHTML=initial(seat);
    if(!seat.id)return;
    const photo=new Image();photo.alt='';photo.draggable=false;
    photo.onload=()=>{if(el.dataset.key===`${seat.seat}:${seat.name}`)el.replaceChildren(photo);};
    photo.src=`/api/phone/gram/avatars/${encodeURIComponent(seat.id)}`;
  }
  /** A face changed: it shows for a moment, for everyone, and the neutral one comes back. */
  function flashFace(seat:TrucoSeatView,el:HTMLElement):void {
    const known=faces.get(seat.seat),key=seat.signal?.key??0;
    if(known?.key===key)return;
    clearTimeout(known?.timer);
    const face=q('face',el);
    if(!seat.signal||!drawn||known===undefined){faces.set(seat.seat,{key,timer:undefined});return;}
    face.textContent=SIGNAL_FACES[seat.signal.signal].face;face.classList.remove('flash');void face.offsetWidth;face.classList.add('flash');
    sounds.signal();
    faces.set(seat.seat,{key,timer:setTimeout(()=>{face.textContent=NEUTRAL_FACE;face.classList.remove('flash');},TRUCO.signalFlashMs)});
  }
  function renderSeats():void {
    const v=view!,mine=myTeam(),now=hooks.now();
    for(const seat of v.seats){
      const el=seatEl(posOf(seat.seat)),avatar=q('avatar',el),say=q('say',el),self=seat.seat===v.selfSeat;
      if(avatar.dataset.key!==`${seat.seat}:${seat.name}`){avatar.dataset.key=`${seat.seat}:${seat.name}`;paintAvatar(avatar,seat);}
      el.classList.toggle('empty',seat.kind==='empty');
      flashFace(seat,el);
      q('name',el).textContent=self?'Você':seat.name||'Lugar livre';
      const team=q('team',el);team.textContent=seat.team===mine?(self?'Sua dupla':'Parceiro'):'Adversário';
      el.dataset.team=seat.team===mine?'us':'them';
      q('kind',el).textContent=seat.kind==='npc'?(seat.personality?`NPC · ${seat.personality}`:'NPC'):'';
      el.classList.toggle('turn',v.turn===seat.seat&&(v.phase==='playing'));
      el.classList.toggle('thinking',v.turn===seat.seat&&v.phase==='playing'&&!self);
      el.classList.toggle('calling',!!v.bet&&v.bet.by===seat.seat);
      q('dealer',el).hidden=v.dealer!==seat.seat;
      if(seat.say&&say.dataset.key!==String(seat.say.key)){
        say.dataset.key=String(seat.say.key);say.textContent=seat.say.text;say.hidden=false;say.className=`tc-say ${seat.say.tone??''}`;
        void say.offsetWidth;say.classList.add('in');
      }
      else if(!seat.say)say.hidden=true;
      const left=v.deadline&&v.turn===seat.seat?Math.max(0,v.deadline-now)/Math.max(1,v.turnMs):0;
      q('seat-timer',el).style.setProperty('--t',String(left));
    }
  }
  function tentos(value:number,target:number):string {return Array.from({length:target},(_,i)=>`<i class="${i<value?'on':''}"></i>`).join('');}
  function renderScore():void {
    const v=view!,mine=myTeam(),us=v.score[mine],them=v.score[mine===0?1:0],box=q('score');
    const usRow=`<div class="tc-row us"><span>Nós</span><b data-tc="score-us">${two(us)}</b><div class="tc-tentos" aria-label="${us} de ${v.target} tentos">${tentos(us,v.target)}</div></div>`;
    const themRow=`<div class="tc-row them"><span>Eles</span><b data-tc="score-them">${two(them)}</b><div class="tc-tentos" aria-label="${them} de ${v.target} tentos">${tentos(them,v.target)}</div></div>`;
    box.innerHTML=`${usRow}${themRow}<footer><span>Até <b>${v.target}</b> tentos</span><span class="tc-value${v.handValue>1?' raised':''}">${v.callLabel?`<em>${e(v.callLabel)}</em>`:''}A mão vale <b data-tc="value">${v.handValue}</b></span></footer>`;
    if(drawn){
      if(us!==lastScore[0])q('score-us',box).classList.add('bump');
      if(them!==lastScore[1])q('score-them',box).classList.add('bump');
    }
    lastScore=[us,them];
  }
  function renderCentre():void {
    const v=view!,mine=myTeam();
    q('tricks').innerHTML=[0,1,2].map(i=>{
      const trick=v.tricks[i],current=v.phase!=='hand-end'&&v.phase!=='match-end'&&i===v.tricks.findIndex(t=>t.winner===null),outcome=trick?.winner??null;
      const label=outcome==='tie'?'Empate':outcome===null?(current?'Em jogo':'—'):teamName(outcome,mine);
      const tone=outcome==='tie'?'tie':outcome===null?(current?'live':''):outcome===mine?'us':'them';
      return `<li class="${tone}"><span>${i+1}ª</span><b>${label}</b></li>`;
    }).join('');
    const vira=q('vira'),deck=q('deck');
    deck.classList.toggle('shuffling',v.phase==='shuffling');
    if(v.vira){
      let el=vira.querySelector<HTMLElement>('.tc-card');
      if(!el){el=makeCard(v.vira);vira.append(el);if(drawn&&!reducedMotion())el.animate([{transform:'rotateY(180deg) scale(.8)',opacity:.3},{transform:'none',opacity:1}],{duration:520,delay:v.phase==='dealing'?900:0,fill:'backwards',easing:'cubic-bezier(.3,.7,.3,1)'});}
      else paintCard(el,v.vira);
      q('manilha').innerHTML=`Manilha <b>${e(rankText(manilhaRank(v.vira.rank)))}</b>`;
      q('legend').innerHTML=SUITS.map(s=>`<li class="${s==='copas'||s==='ouros'?'red':''}">${suitSvg(s)}<span>${MANILHA_NAMES[s]}</span></li>`).join('');
    }
    else{vira.innerHTML='';q('manilha').innerHTML='';q('legend').innerHTML='';}
    const compass=q('compass');
    compass.hidden=v.turn===null||v.phase!=='playing';
    if(v.turn!==null)compass.style.setProperty('--pos',String((v.turn-v.selfSeat+4)%4));
    q('status').textContent=statusText();
    const last=v.phase==='trick-end'?v.tricks.filter(x=>x.winner!==null).at(-1):undefined;
    q('status-line').dataset.tone=last?(last.winner==='tie'?'tie':last.winner===mine?'us':'them'):'';
    const iron=q('iron');iron.hidden=!v.iron;iron.textContent=v.iron?`Mão de Ferro${v.iron.dark?' · no escuro':''}`:'';
  }
  function statusText():string {
    const v=view!,turn=v.turn===null?undefined:seatOf(v.turn),mine=myTeam();
    switch(v.phase){
      case 'lobby':return '';
      case 'shuffling':return `Mão ${v.handNumber} · embaralhando`;
      case 'dealing':return 'Distribuindo as cartas';
      case 'trick-end':{const t=v.tricks.filter(x=>x.winner!==null).at(-1);return t?.winner==='tie'?'Empate na vaza':t?trickOf(t.winner as TrucoTeam,mine):'';}
      case 'bet':return v.bet?.mine?'Aguardando a resposta':`${seatOf(v.bet?.by??0)?.name} pediu ${v.bet?.label}`;
      case 'eleven':return 'Mão de 11';
      case 'hand-end':return v.result?.winner==null?'Ninguém pontua':`Mão para ${teamName(v.result.winner,mine).toLowerCase()} · +${v.result.points}`;
      case 'match-end':return 'Fim de partida';
      default:return turn?(turn.seat===v.selfSeat?'Sua vez':`Vez de ${turn.name}`):'';
    }
  }
  function renderLog():void {q('log').innerHTML=`<h4>Mesa</h4><ol>${view!.log.slice(-4).map(l=>`<li title="${e(l)}">${e(l)}</li>`).join('')}</ol>`;}

  // ── Moves ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  function renderActions():void {
    const v=view!,card=v.mine.find(c=>c.id===selected);
    const keyed=JSON.stringify([v.phase,v.turn,selected,v.canCall,v.canHide,!!v.bet,!!v.eleven,v.stake,signalsOpen,leaveArmed>0,sent?.mark]);
    if(keyed===actionsKey)return;actionsKey=keyed;
    const box=q('actions');let html='',keys='';
    if(leaveArmed)html=`<p class="tc-note warn">${uiIcon('alert')} Se você sair, ${v.stake?`perde a aposta de ${v.stake} moedas e `:''}um NPC assume o seu lugar.</p><button type="button" class="tc-act danger" data-tc-do="leave-confirm">${uiIcon('logOut')}<span>Sair mesmo assim</span></button><button type="button" class="tc-act quiet" data-tc-do="leave-cancel"><span>Ficar</span></button>`;
    else if(myTurn()){
      html=`<div class="tc-act-row${v.canHide?' two':''}"><button type="button" class="tc-act primary" data-tc-do="play" ${card?'':'disabled'}>${uiIcon('send')}<span>${card?(v.canHide?'Jogar':'Jogar carta'):v.canHide?'Escolha':'Escolha uma carta'}</span><kbd>4</kbd></button>${v.canHide?`<button type="button" class="tc-act hide" data-tc-do="hide" ${card?'':'disabled'} title="A carta vai virada e não vale nada">${uiIcon('eyeOff')}<span>Encoberta</span><kbd>6</kbd></button>`:''}</div>`;
      html+=callButton(v);
      keys=`1–3 escolhem a carta · 4 joga${v.canHide?' · 6 encoberta':''}${v.canCall?` · 5 pede ${v.canCall.label}`:''}`;
    }
    else if(v.phase==='bet'||v.phase==='eleven')html='';
    else if(v.phase==='playing'){const t=v.turn===null?undefined:seatOf(v.turn);html=`<p class="tc-note">${uiIcon('clock')} ${t?`Aguardando ${e(t.name)}…`:''}</p>${callButton(v)}`;keys=v.canCall?`5 pede ${v.canCall.label}`:'';}
    else if(v.phase==='lobby')html='';
    else html=`<p class="tc-note">${uiIcon('cards')} ${v.phase==='hand-end'?'Próxima mão em instantes.':v.phase==='shuffling'||v.phase==='dealing'?'Cartas na mesa em instantes.':'A vaza está sendo recolhida.'}</p>`;
    box.innerHTML=html;q('keys').textContent=keys;
  }
  /** The call is open at any moment of the hand, also out of turn. */
  function callButton(v:TrucoView):string {
    return v.canCall?`<button type="button" class="tc-act call" data-tc-do="call" ${locked('call')?'disabled':''}>${uiIcon('flame')}<span>Pedir ${e(v.canCall.label)}</span><kbd>5</kbd></button>`:'';
  }
  function signalsMarkup():string {
    return `<div class="tc-signal-grid" role="group" aria-label="Escolha o rosto do sinal">${TRUCO_SIGNALS.map(id=>{const s=SIGNAL_FACES[id];return `<button type="button" data-tc-signal="${id}" title="${e(s.gesture)}" aria-label="${e(s.manilha)}: ${e(s.gesture)}"><i>${s.face}</i><b>${e(s.manilha)}</b></button>`;}).join('')}</div>`;
  }
  function renderSignals():void {
    const box=q('signals');box.hidden=!signalsOpen;if(signalsOpen&&!box.children.length)box.innerHTML=signalsMarkup();
    root.querySelector('[data-tc="face"].mine')?.setAttribute('aria-expanded',String(signalsOpen));
  }
  function renderDialog():void {
    const v=view!,box=q('dialog'),bet=v.bet,eleven=v.eleven;
    const keyed=JSON.stringify([bet,eleven,partnerShown,sent?.mark]);
    if(keyed===dialogKey)return;dialogKey=keyed;
    if(bet){
      const who=seatOf(bet.by),them=who&&who.team!==myTeam();
      const value=`<div class="tc-ladder">${[1,3,6,9,12].map(n=>`<span class="${n===bet.to?'to':n===bet.from?'from':n<bet.from?'past':''}">${n}</span>`).join('')}</div>`;
      box.className=`tc-dialog bet ${them?'against':'ours'}`;
      box.setAttribute('aria-label',`${who?.name} pediu ${bet.label}`);
      box.innerHTML=`<small>${e(who?.seat===v.selfSeat?'Você':who?.name)} pediu</small><h2>${e(bet.label)}!</h2>
        <p>A mão valia <b>${bet.from}</b> e passa a valer <b class="gold">${bet.to}</b> tentos</p>${value}
        ${bet.answering?`<div class="tc-dialog-acts">
          <button type="button" class="tc-act primary" data-tc-do="accept" ${locked('answer')?'disabled':''}>${uiIcon('check')}<span>Aceitar</span><kbd>1</kbd></button>
          ${bet.raiseTo?`<button type="button" class="tc-act call" data-tc-do="raise" ${locked('answer')?'disabled':''}>${uiIcon('flame')}<span>Pedir ${e(bet.raiseLabel??'')}</span><kbd>2</kbd></button>`:''}
          <button type="button" class="tc-act run" data-tc-do="run" ${locked('answer')?'disabled':''}>${uiIcon('flag')}<span>Fugir</span><small>eles levam ${bet.runAway}</small><kbd>${bet.raiseTo?3:2}</kbd></button></div>`
          :`<p class="tc-wait">${uiIcon('clock')} ${e(bet.waitingFor?`${bet.waitingFor} está decidindo…`:'Aguardando a resposta…')}</p>`}`;
      box.hidden=false;
      return;
    }
    if(eleven){
      const partner=eleven.partnerCards;
      box.className='tc-dialog eleven';box.setAttribute('aria-label','Mão de 11');
      box.innerHTML=`<small>Mão de 11</small><h2>${eleven.mine?'Vale três tentos':'Eles na Mão de 11'}</h2>
        ${eleven.mine?`<p>${eleven.canShow?`<b class="gold">${eleven.casalMaior?'Casal Maior':'Cartas imbatíveis'}:</b> vitória garantida, basta mostrar as cartas.`:'Sem pedido de Truco nesta mão. Fugir dá <b>1</b> tento aos adversários.'}</p>
        ${partner?(partnerShown?`<div class="tc-partner-cards" data-tc="partner-cards"></div>`:`<button type="button" class="tc-act quiet" data-tc-do="peek">${uiIcon('eye')}<span>Ver cartas do parceiro</span></button>`):''}
        <div class="tc-dialog-acts"><button type="button" class="tc-act primary" data-tc-do="${eleven.canShow?'show-eleven':'play-eleven'}" ${locked('eleven')?'disabled':''}>${uiIcon(eleven.canShow?'trophy':'check')}<span>${eleven.canShow?'Mostrar':'Jogar'}</span><kbd>1</kbd></button>
          ${eleven.canShow?'':`<button type="button" class="tc-act run" data-tc-do="run-eleven" ${locked('eleven')?'disabled':''}>${uiIcon('flag')}<span>Fugir</span><kbd>2</kbd></button>`}</div>`
        :`<p class="tc-wait">${uiIcon('clock')} ${e(eleven.waitingFor?`${eleven.waitingFor} está decidindo…`:'Os adversários estão decidindo…')}</p>`}`;
      if(partner&&partnerShown){
        const holder=q('partner-cards',box);
        for(const card of partner)holder.append(makeCard(card,manilhaOf(card,v.vira)));
      }
      box.hidden=false;
      return;
    }
    box.hidden=true;box.innerHTML='';
  }
  /** A call lands on the felt: the word slams in and the table takes the hit. */
  function renderCall():void {
    const v=view!,key=v.bet?`${v.handNumber}:${v.bet.to}`:'';
    if(key&&key!==lastBet&&drawn){
      const el=q('call');el.textContent=`${v.bet!.label}!`;el.hidden=false;
      el.classList.remove('in');void el.offsetWidth;el.classList.add('in');
      q('felt').classList.remove('hit');void q('felt').offsetWidth;q('felt').classList.add('hit');
      sounds.call();
      setTimeout(()=>{el.hidden=true;},1100);
    }
    lastBet=key;
  }
  function renderBanner():void {
    const v=view!,banner=q('banner');
    if(v.phase==='hand-end'&&v.result){
      const mine=myTeam(),none=v.result.winner===null;banner.hidden=false;banner.className=`tc-banner big ${none?'tie':v.result.winner===mine?'us':'them'}`;
      banner.innerHTML=`<span>${none?'Ninguém pontua':v.result.winner===mine?'Mão nossa':'Mão deles'}</span>${none?'':`<b>+${v.result.points}</b>`}<small>${e(v.result.reason)}</small>`;return;
    }
    banner.hidden=true;
  }
  function renderEnd():void {
    const v=view!,box=q('end'),key=v.phase==='match-end'?JSON.stringify([v.score,v.prize]):'';
    if(key===endKey)return;endKey=key;
    if(!key){box.hidden=true;box.innerHTML='';return;}
    const won=v.score[myTeam()]>=v.target;
    box.className=`tc-end ${won?'won':'lost'}`;
    box.innerHTML=`${won?`<div class="tc-confetti" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--x:${(i*37)%100}%;--d:${(i*.17)%1.6}s;--r:${(i*53)%360}deg"></i>`).join('')}</div>`:''}
      <small>Fim de partida</small><h2>${won?'Vitória':'Derrota'}</h2><p class="tc-final"><span class="us">Nós <b>${v.score[myTeam()]}</b></span><i>×</i><span class="them"><b>${v.score[myTeam()===0?1:0]}</b> Eles</span></p>
      ${v.prize!==undefined?`<p class="tc-prize ${v.prize>0?'won':'lost'}">${v.prize>0?`+${v.prize.toLocaleString('pt-BR')}`:`−${(-v.prize).toLocaleString('pt-BR')}`} moedas</p>`:''}<p>${e(v.result?.reason??'')}</p><div class="tc-dialog-acts"><button type="button" class="tc-act primary" data-tc-do="again">${uiIcon('refresh')}<span>Nova partida</span></button><button type="button" class="tc-act quiet" data-tc-do="leave-confirm">${uiIcon('logOut')}<span>Sair</span></button></div>`;
    box.hidden=false;
    if(drawn){if(won)sounds.natural();else sounds.lose();}
  }
  /** Before the match: who sits where (the seat across is your partner), the Escuro variation, and the start. */
  function renderLobby():void {
    const v=view!,box=q('lobby'),lobby=v.lobby,balance=hooks.balance()??0,keyed=lobby?JSON.stringify([v.seats.map(s=>[s.name,s.kind,s.ready]),v.selfSeat,lobby,balance,sent?.mark]):'';
    if(keyed===lobbyKey)return;lobbyKey=keyed;
    box.hidden=!keyed;
    if(!lobby){box.innerHTML='';return;}
    const me=v.seats[v.selfSeat],others=v.seats.filter(s=>s.kind==='human'&&s.seat!==v.selfSeat),empty=v.seats.some(s=>s.kind==='empty');
    const stake=lobby.stake,short=stake>balance;
    const tile=(seat:TrucoSeatView)=>{
      const self=seat.seat===v.selfSeat,free=seat.kind==='empty';
      return `<button type="button" class="tc-lobby-seat${self?' self':''}${seat.ready?' ready':''}" data-tc-seat="${seat.seat}" ${free?'':'disabled'}><b>${self?'Você':free?'Lugar livre':e(seat.name)}</b><small>${seat.ready?'Aposta confirmada':free?'Clique para sentar. Vazio, vira NPC':'Ainda não confirmou'}</small></button>`;
    };
    const teams=[0,1].map(team=>`<section><h4>Dupla ${team+1}</h4>${v.seats.filter(s=>s.team===team).map(tile).join('')}</section>`).join('');
    const levels=empty?`<div class="tc-levels" role="group" aria-label="Nível dos NPCs">${lobby.levels.map(l=>`<button type="button" class="tc-level" data-tc-level="${l.id}" aria-pressed="${l.id===lobby.level}"><b>${e(l.label)}</b><small>${lobby.betweenPeople?e(l.npcs):`${l.stake} moedas por pessoa`}</small></button>`).join('')}</div>`:'';
    const between=lobby.betweenPeople?`<div class="tc-stake" role="group" aria-label="Aposta entre jogadores"><span>Aposta por pessoa<small>mínimo ${lobby.min}</small></span><button type="button" data-tc-stake="${stake-lobby.step}" aria-label="Menos" ${stake-lobby.step<lobby.min?'disabled':''}>${uiIcon('minus')}</button><b>${stake.toLocaleString('pt-BR')}</b><button type="button" data-tc-stake="${stake+lobby.step}" aria-label="Mais" ${stake+lobby.step>lobby.max?'disabled':''}>${uiIcon('plus')}</button></div>`:'';
    const yes=!!me?.ready;
    box.innerHTML=`<small>Highland Bar</small><h2>Mesa de truco</h2>
      <div class="tc-lobby-teams">${teams}</div>${levels}${between}
      <p class="tc-lobby-sum">Cada pessoa aposta <b>${stake.toLocaleString('pt-BR')}</b>. Quem vencer recebe <b>${(stake*2).toLocaleString('pt-BR')}</b>. Quem sair no meio perde a aposta.</p>
      <label class="tc-lobby-option"><input type="checkbox" data-tc-option="dark" ${lobby.dark?'checked':''}><span><b>Mão de Ferro no escuro</b><small>No 11 a 11, ninguém olha as próprias cartas.</small></span></label>
      ${lobby.taking?`<p class="tc-note">${uiIcon('coins')} Recolhendo as apostas…</p>`:yes?`<button type="button" class="tc-act quiet" data-tc-do="unready">${uiIcon('close')}<span>Retirar a aposta · aguardando os outros</span></button>`:`<button type="button" class="tc-act primary" data-tc-do="ready" ${short||locked('ready')?'disabled':''}>${uiIcon(short?'alert':'coins')}<span>${short?`Faltam moedas: você tem ${balance.toLocaleString('pt-BR')}`:`Apostar ${stake.toLocaleString('pt-BR')} e ${others.length?'confirmar':'começar'}`}</span></button>`}`;
  }
  function tickTimer():void {
    if(!view)return;
    const v=view,counted=(v.phase==='playing'||v.phase==='bet'||v.phase==='eleven')&&v.deadline>0,left=counted?Math.max(0,v.deadline-hooks.now()):0;
    const bar=q('timer');bar.style.setProperty('--t',counted?String(Math.min(1,left/Math.max(1,v.turnMs))):'0');
    bar.classList.toggle('urgent',counted&&left<5000&&(myTurn()||!!v.bet?.answering));
    if(v.turn!==null){const seat=seatOf(v.turn);if(seat)q('seat-timer',seatEl(posOf(seat.seat))).style.setProperty('--t',String(counted?Math.min(1,left/Math.max(1,v.turnMs)):0));}
  }

  // ── Whole table ───────────────────────────────────────────────────────────────────────────────────────────────────
  function render():void {
    const v=view!;
    root.querySelector('.tc')!.setAttribute('data-phase',v.phase);
    q('mode').textContent=v.mode;
    if(handKey!==v.handNumber){handKey=v.handNumber;selected='';partnerShown=false;}
    if(selected&&!v.mine.some(c=>c.id===selected))selected='';
    if(!myTurn())selected='';
    renderSeats();renderScore();renderCentre();renderLog();renderCards();renderActions();renderSignals();renderDialog();renderCall();renderBanner();renderEnd();renderLobby();renderFoot();tickTimer();
    if(drawn&&v.phase==='shuffling'&&lastShuffled!==v.handNumber)sounds.shuffle();
    lastShuffled=v.phase==='shuffling'?v.handNumber:lastShuffled;
    if(drawn&&v.turn===v.selfSeat&&lastTurn!==v.turn&&v.phase==='playing')sounds.turn();
    lastTurn=v.turn;drawn=true;
  }
  function renderFoot():void {
    q('balance').innerHTML=coins(hooks.balance()??0);
    q('stake').innerHTML=view?.stake?coins(view.stake):'—';
  }

  // ── Input ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  function choose(id:string):void {
    if(!myTurn()||!view!.mine.some(c=>c.id===id))return;
    sounds.unlock();
    if(selected===id){playSelected();return;}
    selected=id;sounds.card();renderCards();renderActions();
  }
  function playSelected(hidden=false):void {
    if(!selected||!myTurn()||locked(`play:${selected}`)||(hidden&&!view?.canHide))return;
    send(`play:${selected}`,'truco.play',{card:selected,...(hidden?{hidden:true}:{})});
    sounds.card();
  }
  function requestLeave():void {
    if(!view||view.phase==='match-end'||view.phase==='lobby'){hooks.send('truco.leave');return;}
    if(!leaveArmed){leaveArmed=Date.now();renderActions();return;}
    leaveArmed=0;hooks.send('truco.leave');
  }
  function run(action:string):void {
    switch(action){
      case 'play':playSelected();break;
      case 'hide':playSelected(true);break;
      case 'call':send('call','truco.call',{});break;
      case 'accept':send('answer','truco.answer',{answer:'accept',to:view!.bet?.to});break;
      case 'raise':send('answer','truco.answer',{answer:'raise',to:view!.bet?.to});break;
      case 'run':send('answer','truco.answer',{answer:'run',to:view!.bet?.to});break;
      case 'play-eleven':send('eleven','truco.eleven',{answer:'play'});break;
      case 'run-eleven':send('eleven','truco.eleven',{answer:'run'});break;
      case 'show-eleven':send('eleven','truco.eleven',{answer:'show'});break;
      case 'ready':send('ready','truco.ready',{ready:true});break;
      case 'unready':send('ready','truco.ready',{ready:false});break;
      case 'peek':partnerShown=true;sounds.flip();dialogKey='';renderDialog();break;
      case 'signals':signalsOpen=!signalsOpen;renderSignals();break;
      case 'again':hooks.send('truco.again',{});break;
      case 'leave-confirm':leaveArmed=0;hooks.send('truco.leave');break;
      case 'leave-cancel':leaveArmed=0;actionsKey='';renderActions();break;
    }
  }
  root.addEventListener('change',event=>{
    const input=event.target as HTMLInputElement;
    if(input.dataset.tcOption==='dark')hooks.send('truco.config',{dark:input.checked});
  });
  root.addEventListener('click',event=>{
    const target=event.target as HTMLElement;
    const handCard=target.closest<HTMLElement>('.tc-hand .tc-card');
    if(handCard){choose(handCard.dataset.id??'');return;}
    const button=target.closest<HTMLButtonElement>('button');
    if(!button||button.disabled||!view)return;
    sounds.unlock();
    const tool=button.dataset.tcTool,action=button.dataset.tcDo,signal=button.dataset.tcSignal;
    if(action){run(action);return;}
    if(signal){signalsOpen=false;renderSignals();hooks.send('truco.signal',{signal:signal as TrucoSignal});return;}
    if(button.dataset.tcSeat){hooks.send('truco.seat',{seat:Number(button.dataset.tcSeat)});return;}
    if(button.dataset.tcLevel){hooks.send('truco.config',{level:button.dataset.tcLevel});return;}
    if(button.dataset.tcStake){hooks.send('truco.config',{stake:Number(button.dataset.tcStake)});return;}
    if(tool==='rules'){const rules=q('rules');rules.hidden=!rules.hidden;button.setAttribute('aria-expanded',String(!rules.hidden));return;}
    if(tool==='sound'){
      sounds.enabled=!sounds.enabled;try{localStorage.setItem(SOUND_KEY,sounds.enabled?'on':'off');}catch{}
      button.setAttribute('aria-pressed',String(sounds.enabled));button.innerHTML=uiIcon(sounds.enabled?'volume':'volumeOff');return;
    }
    if(tool==='leave')requestLeave();
  });
  // 1–3 choose a card (the same one again plays it), 4 plays, 5 calls; in a decision, 1–3 answer; E asks to leave. Unless typing.
  const keys=(event:KeyboardEvent)=>{
    if(!view||root.classList.contains('hidden')||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
    const el=document.activeElement as HTMLElement|null;
    if(el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable))return;
    if(event.code==='Enter'&&el?.matches('.tc-hand .tc-card')){event.preventDefault();choose(el.dataset.id??'');return;}
    if(event.code==='KeyE'){event.preventDefault();requestLeave();return;}
    const digit=/^(?:Digit|Numpad)([1-6])$/.exec(event.code)?.[1];
    if(!digit)return;
    const n=Number(digit),dialog=[...q('dialog').querySelectorAll<HTMLButtonElement>('.tc-dialog-acts button:not(:disabled)')];
    if(!q('dialog').hidden&&dialog.length){const button=dialog[n-1];if(button){event.preventDefault();button.click();}return;}
    if(n===5&&view.canCall){event.preventDefault();root.querySelector<HTMLButtonElement>('[data-tc-do="call"]')?.click();return;}
    if(!myTurn())return;
    event.preventDefault();
    if(n<=3){const card=view.mine[n-1];if(card)choose(card.id);}
    else if(n===4)playSelected();
    else if(n===6)playSelected(true);
  };
  document.addEventListener('keydown',keys);
  const ticker=setInterval(()=>{if(view&&!root.classList.contains('hidden')){tickTimer();if(leaveArmed&&Date.now()-leaveArmed>6000){leaveArmed=0;actionsKey='';renderActions();}else if(sent&&hooks.now()-sent.at>=2500){sent=undefined;actionsKey='';dialogKey='';renderActions();renderDialog();}}},250);

  return {
    /** The room's view of the table for this player. */
    update(next:TrucoView):void {sent=undefined;view=next;render();},
    /** E at the table: leaving a match in play asks first. */
    requestLeave,
    /** The wallet changed. */
    refresh():void {if(view){renderFoot();renderLobby();}},
    /** Off the table: the next time it opens, nothing animates from the old state. */
    reset():void {
      view=undefined;drawn=false;selected='';handKey=-1;lastTurn=null;lastBet='';actionsKey='';dialogKey='';endKey='';lobbyKey='';signalsOpen=false;partnerShown=false;leaveArmed=0;sent=undefined;lastShuffled=-1;
      for(const name of ['end','lobby','dialog','banner','call'])q(name).hidden=true;
      for(const face of faces.values())clearTimeout(face.timer);faces.clear();root.querySelectorAll('[data-tc="face"]').forEach(el=>{el.textContent=NEUTRAL_FACE;el.classList.remove('flash');});
      for(const el of cards.values())el.remove();cards.clear();q('vira').innerHTML='';
    },
    destroy():void {document.removeEventListener('keydown',keys);clearInterval(ticker);root.innerHTML='';},
  };
}
