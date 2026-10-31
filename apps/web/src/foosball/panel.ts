import {CPU_NAME,FOOSBALL,FOOSBALL_LEVELS,FOOSBALL_RODS,FOOSBALL_TABLES,LEVEL_NAMES,ROD_NAMES,ROLE_NAMES,TEAM_NAMES,aimOffset,createSim,decodeFrame,kicksBack,rodsOf,startKick,stepRod,
  type FoosballBall,type FoosballFrame,type FoosballLevel,type FoosballSlotView,type FoosballTableView,type FoosballTeam} from '@bar/shared';
import {escape as e} from '../api';
import {coins,uiIcon} from '../ui-icons';
import {createTableRenderer,type TablePicture} from './render';
import {createFoosballSounds} from './sounds';
import './foosball.css';

export interface FoosballHooks {
  send(type:string,payload?:unknown):void;
  /** The server clock (ms). */
  now():number;
  balance():number|undefined;
  /** The game's general volume, 0–1. */
  volume():number;
  notify(text:string,error?:boolean):void;
  /** The panel closes itself (stopped watching a table). */
  closed():void;
}

const SOUND_KEY='bar:foosball:sound';
/** Frames are drawn this far behind the server, so there is almost always one on each side to blend. */
const INTERPOLATION_MS=70;
const MATCH:readonly string[]=['kickoff','playing','goal','paused','set'];
const RULES=(t:FoosballTableView)=>[
  `Partida até ${t.goals} gols${t.sets>1?', em melhor de 3 sets':''}. Vale gol de qualquer boneco, até do goleiro, e a bola que entra e sai do gol também vale.`,
  'Saída: a bola começa parada no boneco do meio da linha de 5 de quem levou o gol (na primeira, a moeda decide). Depois do "Pronto?", ela rola até o boneco do lado (os dois toques da regra) e já está valendo.',
  'Não tem giro: o chute é sempre um movimento só, como manda a regra oficial.',
  'Tempo de posse (ITSF): 10 s na linha de 5 e 15 s nas outras, goleiro e zaga contando como uma só. Estourou no ataque, a bola vai para a zaga do outro time; nas demais, para o meio dele.',
  'Bola atrás do seu boneco: o chute vira um recuo, para o seu bastão de trás jogar. O goleiro nunca recua.',
  'Valendo moedas: cada jogador põe o mesmo valor e o time que vence leva o dobro do que cada um pôs. Quem sai no meio perde por W.O.',
  'Caiu a conexão, a partida espera 20 s. No amistoso, o Zé do Totó assume o lugar; valendo moedas, é W.O.',
];
const CONTROLS_HELP='Mouse ou dedo: os bonecos seguem o ponteiro · Clique ou Espaço: chuta (segure para a bomba) · Botão direito ou Shift: levanta os bonecos · W/S ou setas também movem · E: sair';
const KEYS_UP=new Set(['KeyW','ArrowUp','KeyA','ArrowLeft']),KEYS_DOWN=new Set(['KeyS','ArrowDown','KeyD','ArrowRight']);

const signed=(n:number)=>n>0?`+${n.toLocaleString('pt-BR')}`:n<0?`−${(-n).toLocaleString('pt-BR')}`:'±0';
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const touchDevice=()=>matchMedia('(pointer: coarse)').matches;

/**
 * The pebolim panel (E at a table in the games hall): the table drawn from above (render.ts), the score with its beads,
 * the lobby (places, the host's rules, Zé do Totó, "pronto"), and the match: the player's pointer moves their rods, a click
 * (or Space) kicks, a longer press charges a bomb, the right button (or Shift) raises the figures. The room decides
 * everything; the player's own rods are moved here at once (the same physics) so they answer without the network's delay,
 * everything else is drawn 70 ms behind the room, blended between its frames.
 */
export function createFoosballPanel(root:HTMLElement,hooks:FoosballHooks){
  const sounds=createFoosballSounds(hooks.volume);
  try{sounds.enabled=localStorage.getItem(SOUND_KEY)!=='off';}catch{/* in-memory only */}
  root.innerHTML=`<div class="fb" data-phase="lobby">
    <header class="fb-head">
      <span class="fb-title">${uiIcon('ball')}<b>Pebolim</b><small data-fb="table"></small></span>
      <div class="fb-board" aria-live="polite">
        <div class="fb-team red"><span class="fb-names" data-fb="names-red"></span><b class="fb-goals" data-fb="score-red">0</b><i class="fb-beads" data-fb="beads-red"></i></div>
        <div class="fb-mid"><small data-fb="match"></small><span class="fb-clock" data-fb="clock"></span></div>
        <div class="fb-team blue"><b class="fb-goals" data-fb="score-blue">0</b><span class="fb-names" data-fb="names-blue"></span><i class="fb-beads" data-fb="beads-blue"></i></div>
      </div>
      <span class="fb-tools"><span class="fb-stake" data-fb="stake" hidden></span>
        <button type="button" data-fb-tool="rules" aria-expanded="false" title="Regras e comandos" aria-label="Regras e comandos">${uiIcon('help')}</button>
        <button type="button" data-fb-tool="sound" title="Sons da mesa" aria-label="Sons da mesa" aria-pressed="${sounds.enabled}">${uiIcon(sounds.enabled?'volume':'volumeOff')}</button>
        <button type="button" data-fb-tool="leave" class="fb-leave" title="Sair da mesa" aria-label="Sair da mesa">${uiIcon('close')}<span>Sair</span></button></span>
    </header>
    <div class="fb-stage">
      <canvas class="fb-canvas" aria-label="Mesa de pebolim vista de cima" role="img"></canvas>
      <div class="fb-overlay" data-fb="overlay" aria-live="assertive"></div>
      <div class="fb-banner" data-fb="banner" hidden></div>
      <div class="fb-rules" data-fb="rules" hidden></div>
    </div>
    <div class="fb-controls" data-fb="controls"></div>
    <footer class="fb-foot"><span>Saldo <b data-fb="balance">—</b></span><span data-fb="role"></span><span class="fb-keys" data-fb="keys"></span></footer>
  </div>`;
  const q=<T extends HTMLElement=HTMLElement>(name:string)=>root.querySelector<T>(`[data-fb="${name}"]`)!;
  const canvas=root.querySelector<HTMLCanvasElement>('.fb-canvas')!;
  const renderer=createTableRenderer(canvas);

  let table:FoosballTableView|undefined,selfId='',watching=false,shownKey='',controlsKey='',drawn=false;
  let frames:Array<ReturnType<typeof decodeFrame>>=[];
  /** The player's own rods, moved here at once: where the pointer is, held up or not, a kick charging since when. */
  const local=createSim();let localTime=0,pointer=0,pointerSent=Number.NaN,liftSent=false,sentAt=0;
  let lift={mouse:false,key:false,touch:false},charge:{at:number;by:string}|undefined,keyAxis=0;
  let lastPhase='',lastGoals=-1,lastMessage='',lastCount='',rematch=false,leaveArmed=0,raf=0,lastTick=performance.now();
  let lastDisplayed:FoosballBall|undefined;

  const me=():FoosballSlotView|undefined=>table?.slots.find(s=>s.playerId===selfId&&!!selfId);
  const myRods=():number[]=>{const slot=me();return slot?rodsOf(slot.team,slot.role).map(r=>r.index):[];};
  const playing=()=>!!table&&!!me()&&MATCH.includes(table.phase)&&!watching;
  const side=():FoosballTeam=>me()?.team??'red';
  const lifting=()=>lift.mouse||lift.key||lift.touch;

  // ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The ball and the rods at a moment: blended between the frames around it, a little ahead of the last one at most. */
  function sample(at:number):{ball?:FoosballBall;rods:Array<{offset:number;angle:number}>} {
    if(!frames.length)return {ball:table&&!MATCH.includes(table.phase)?{x:0,y:0,vx:0,vy:0}:undefined,rods:FOOSBALL_RODS.map(()=>({offset:0,angle:0}))};
    let i=frames.length-1;
    while(i>0&&frames[i]!.t>at)i--;
    const a=frames[i]!,b=frames[i+1];
    if(!b){
      // Past the last frame: the ball rolls on a little (never through a wall).
      const ahead=a.frozen?0:Math.min(.1,Math.max(0,(at-a.t)/1000)),half=FOOSBALL.width/2-FOOSBALL.ballRadius;
      return {ball:{...a.ball,x:a.ball.x+a.ball.vx*ahead,y:Math.max(-half,Math.min(half,a.ball.y+a.ball.vy*ahead))},rods:a.rods};
    }
    const t=Math.max(0,Math.min(1,(at-a.t)/Math.max(1,b.t-a.t)));
    return {ball:{x:lerp(a.ball.x,b.ball.x,t),y:lerp(a.ball.y,b.ball.y,t),vx:lerp(a.ball.vx,b.ball.vx,t),vy:lerp(a.ball.vy,b.ball.vy,t)},
      rods:a.rods.map((r,k)=>({offset:lerp(r.offset,b.rods[k]!.offset,t),angle:lerp(r.angle,b.rods[k]!.angle,t)}))};
  }
  function loop():void {
    raf=requestAnimationFrame(loop);
    if(!table||root.classList.contains('hidden'))return;
    const tick=performance.now(),dt=Math.min(.05,(tick-lastTick)/1000);lastTick=tick;
    const now=hooks.now(),seen=sample(now-INTERPOLATION_MS),mine=new Set(myRods());
    // Keys move the pointer along the rods as the player sees them.
    if(keyAxis&&playing())pointer=Math.max(-FOOSBALL.width/2,Math.min(FOOSBALL.width/2,pointer+keyAxis*1.15*dt*renderer.screenSign));
    // The player's rods: the same steps the room takes, here at once.
    localTime+=dt*1000;
    for(const index of mine){
      const def=FOOSBALL_RODS[index]!,rod=local.rods[index]!;
      if(playing()){rod.target=aimOffset(def,pointer,rod.target);rod.lift=lifting();}
      stepRod(rod,def,dt,localTime);
    }
    const rods=seen.rods.map((r,i)=>mine.has(i)&&playing()?{offset:local.rods[i]!.offset,angle:local.rods[i]!.angle}:r);
    lastDisplayed=seen.ball;
    const picture:TablePicture={ball:seen.ball,rods,mine:playing()?mine:new Set(),pointer:playing()?pointer:undefined,side:side(),now};
    renderer.draw(picture);
    if(playing())sendInput(now);
    if(charge)root.style.setProperty('--fb-power',String(power()));
  }
  function sendInput(now:number):void {
    const up=lifting();
    if((Math.abs(pointer-pointerSent)<.0015&&up===liftSent)||now-sentAt<33)return;
    pointerSent=pointer;liftSent=up;sentAt=now;
    hooks.send('foosball.input',{y:Math.round(pointer*10000)/10000,lift:up});
  }
  const power=()=>charge?Math.max(0,Math.min(1,(performance.now()-charge.at-80)/420)):0;
  function startCharge(by:string):void {if(!playing()||charge)return;sounds.unlock();charge={at:performance.now(),by};root.classList.add('fb-charging');}
  /** Release: every rod the player holds swings, here at once and in the room. */
  function kick(by:string):void {
    if(!charge||charge.by!==by)return;
    const p=power();charge=undefined;root.classList.remove('fb-charging');root.style.setProperty('--fb-power','0');
    if(!playing())return;
    for(const index of myRods()){
      const def=FOOSBALL_RODS[index]!,rod=local.rods[index]!;
      startKick(rod,p,localTime,!!lastDisplayed&&kicksBack(def,rod,lastDisplayed));
    }
    hooks.send('foosball.kick',{power:Math.round(p*100)/100});
  }

  // ── Score, overlay and the match's moments ───────────────────────────────────────────────────────────────────────
  function names(team:FoosballTeam):string {
    const slots=table!.slots.filter(s=>s.team===team&&(s.playerId||s.cpu));
    return slots.length?slots.map(s=>s.playerId===selfId?'Você':s.displayName).join(' & '):TEAM_NAMES[team];
  }
  function renderBoard():void {
    const t=table!;
    q('table').textContent=`Mesa ${FOOSBALL_TABLES.find(p=>p.id===t.id)?.number??''}${watching?' · assistindo':''}`;
    for(const team of ['red','blue'] as const){
      q(`names-${team}`).textContent=names(team);
      q(`score-${team}`).textContent=String(t[team]);
      const beads=Math.min(10,t.goals),won=t.sets>1?(team==='red'?t.setsRed:t.setsBlue):0;
      q(`beads-${team}`).innerHTML=Array.from({length:beads},(_,i)=>`<b class="${i<t[team]?'on':''}"></b>`).join('')+(t.sets>1?`<span class="fb-sets">${Array.from({length:2},(_,i)=>`<em class="${i<won?'on':''}"></em>`).join('')}</span>`:'');
    }
    q('match').textContent=t.phase==='lobby'?'Antes do jogo':t.sets>1?`Set ${t.set} · até ${t.goals}`:`Até ${t.goals} gols`;
    const stake=q('stake');stake.hidden=!t.stake;if(t.stake)stake.innerHTML=`Valendo ${coins(t.stake)}`;
  }
  function tickClock():void {
    const t=table;if(!t)return;
    const now=hooks.now(),clock=q('clock');let text='',tone='';
    if(t.phase==='playing'&&t.possTeam&&t.possSince){
      const limit=t.possRod==='midfield'?FOOSBALL.possession.midfield:FOOSBALL.possession.other,held=now-t.possSince;
      if(held>3000){const left=Math.max(0,Math.ceil((limit-held)/1000));text=`Posse ${t.possRod==='defense'?'da defesa':`do ${ROD_NAMES[t.possRod as keyof typeof ROD_NAMES]}`} ${TEAM_NAMES[t.possTeam as FoosballTeam].toLowerCase()} · ${left} s`;tone=left<=3?'urgent':'';}
    }else if(t.phase==='paused')text=`Pausa · ${Math.max(0,Math.ceil((t.deadline-now)/1000))} s`;
    if(clock.textContent!==text)clock.textContent=text;
    clock.className=`fb-clock ${tone}`;
    renderOverlay();
  }
  function renderOverlay():void {
    const t=table!,now=hooks.now(),left=Math.max(0,t.deadline-now),overlay=q('overlay'),slot=me();
    let html='',count='';
    if(t.phase==='kickoff'){
      const serve=t.message?'':`Saída do ${TEAM_NAMES[t.serve]}`;
      // A serve asks "Pronto?" and counts 3, 2, 1; a restart after a foul or a pause is shorter.
      count=t.message?(left>750?'2':'1'):left>1600?'Pronto?':left>1050?'3':left>520?'2':'1';
      html=`<div class="fb-count"><b>${count}</b>${serve?`<small>${serve}</small>`:''}</div>`;
    }else if(t.phase==='goal'){
      const own=t.goalRod==='contra',rod=own?'gol contra':t.goalRod?ROD_NAMES[t.goalRod as keyof typeof ROD_NAMES]:'';
      html=`<div class="fb-goal ${t.goalTeam}"><b>Gol${own?' contra':''}!</b><small>${e(t.goalBy)}${rod&&!own?` · ${rod}`:''}${t.goalSpeed?` · ${t.goalSpeed.toLocaleString('pt-BR')} m/s`:''}</small></div>`;
    }else if(t.phase==='set')html=`<div class="fb-result"><small>Fim do set ${t.set}</small><b>${e(t.message)}</b><span>Sets ${t.setsRed} × ${t.setsBlue}</span></div>`;
    else if(t.phase==='paused')html=`<div class="fb-result"><small>Partida parada</small><b>${e(t.message)}</b><span>Esperando ${Math.ceil(left/1000)} s</span></div>`;
    else if(t.phase==='finished'){
      const mine=slot&&slot.team===t.winner?'win':slot?'loss':'',net=t.stake&&slot?(mine==='win'?t.stake:-t.stake):0;
      html=`<div class="fb-result ${t.winner}"><small>Fim de jogo · ${t.red} × ${t.blue}${t.sets>1?` · sets ${t.setsRed} × ${t.setsBlue}`:''}</small><b>${mine==='win'?'Você venceu!':mine==='loss'?'Não foi dessa vez':e(t.message)}</b>
        <span>${mine?e(t.message):''}${net?` <em class="${net>0?'win':'loss'}">${signed(net)} moedas</em>`:''}</span><i>Nova partida em ${Math.ceil(left/1000)} s</i></div>`;
    }
    if(count!==lastCount){if(count&&count!=='Pronto?')sounds.count();lastCount=count;}
    if(overlay.dataset.html!==html){overlay.dataset.html=html;overlay.innerHTML=html;}
  }
  /** Sounds and effects for what changed: a goal, a whistle, a foul, the end. */
  function moments():void {
    const t=table!,goals=t.red+t.blue,slot=me();
    if(drawn&&t.phase==='goal'&&lastPhase!=='goal'&&goals!==lastGoals&&t.goalTeam){
      renderer.goal(t.goalTeam as FoosballTeam,hooks.now());
      sounds.goal(!!slot&&slot.team===t.goalTeam);
    }
    if(drawn&&t.phase==='playing'&&lastPhase==='kickoff')sounds.whistle();
    if(drawn&&t.phase==='finished'&&lastPhase!=='finished')sounds.final(!slot?'':slot.team===t.winner?'win':'loss');
    if(drawn&&t.message&&t.message!==lastMessage&&(t.phase==='kickoff'||t.phase==='paused')){sounds.foul();showBanner(t.message);}
    if(t.phase==='lobby'&&lastPhase&&lastPhase!=='lobby'){frames=[];if(rematch&&slot&&!slot.ready){rematch=false;hooks.send('foosball.ready',{ready:true});}}
    lastPhase=t.phase;lastGoals=goals;lastMessage=t.message;
  }
  let bannerTimer=0;
  function showBanner(text:string):void {
    const banner=q('banner');banner.textContent=text;banner.hidden=false;
    clearTimeout(bannerTimer);bannerTimer=window.setTimeout(()=>{banner.hidden=true;},3600);
  }

  // ── Lobby and controls ───────────────────────────────────────────────────────────────────────────────────────────
  function slotCard(s:FoosballSlotView,host:boolean,seated:boolean):string {
    const mine=s.playerId===selfId&&!!selfId,lobby=table!.phase==='lobby';
    const who=s.cpu?`${CPU_NAME}<small>${LEVEL_NAMES[s.cpu as FoosballLevel]}</small>`:s.playerId?`${mine?'Você':e(s.displayName)}${s.connected?'':'<small>sem conexão</small>'}`:'Lugar livre';
    const badge=s.cpu?'<em class="fb-badge cpu">Casa</em>':s.playerId?`<em class="fb-badge ${s.ready?'ready':''}">${s.ready?'Pronto':'Esperando'}</em>`:'';
    let actions='';
    if(lobby&&!s.playerId&&!s.cpu)actions=`<button type="button" class="fb-mini" data-fb-slot="${s.slot}">${uiIcon('seat')}${seated?'Mudar para cá':'Jogar aqui'}</button>${host?`<button type="button" class="fb-mini" data-fb-cpu="${s.slot}" ${table!.stake?'disabled title="O Zé não joga valendo moedas"':''}>${uiIcon('userPlus')}Chamar o Zé</button>`:''}`;
    if(lobby&&s.cpu&&host)actions=`<button type="button" class="fb-mini" data-fb-uncpu="${s.slot}">${uiIcon('close')}Tirar o Zé</button>`;
    if(lobby&&s.cpu&&!seated&&!host)actions=`<button type="button" class="fb-mini" data-fb-slot="${s.slot}">${uiIcon('seat')}Jogar no lugar dele</button>`;
    return `<div class="fb-slot ${s.team}${mine?' mine':''}${s.playerId||s.cpu?'':' empty'}"><span class="fb-role">${ROLE_NAMES[s.role]}</span><b>${who}</b>${badge}<span class="fb-slot-actions">${actions}</span></div>`;
  }
  function segmented(name:string,label:string,options:Array<[string,string]>,value:string,enabled:boolean):string {
    return `<div class="fb-setting"><small>${label}</small><div class="fb-seg" role="group" aria-label="${label}">${options.map(([v,text])=>`<button type="button" data-fb-set="${name}" data-value="${v}" aria-pressed="${v===value}" ${enabled?'':'disabled'}>${text}</button>`).join('')}</div></div>`;
  }
  function renderControls():void {
    const t=table!,slot=me(),host=!!slot&&t.hostId===selfId,balance=hooks.balance()??0;
    const key=JSON.stringify([t.revision,t.phase,t.slots,t.format,t.goals,t.sets,t.stake,t.level,t.message,t.hostId,selfId,watching,balance,leaveArmed>0,rematch,touchDevice(),t.minBet,t.maxBet]);
    if(key===controlsKey)return;controlsKey=key;
    const box=q('controls');let html='';
    root.querySelector('.fb')!.setAttribute('data-view',t.phase==='lobby'?'lobby':'match');
    if(t.phase==='lobby'){
      const sides=(['red','blue'] as const).map(team=>`<section class="fb-side ${team}"><h3>${TEAM_NAMES[team]}<small>${team==='red'?'defende a esquerda':'defende a direita'}</small></h3>${t.slots.filter(s=>s.team===team).map(s=>slotCard(s,host,!!slot)).join('')}</section>`).join('');
      const stakes:Array<[string,string]>=[['0','Amistoso'],...FOOSBALL.stakeChips.filter(v=>v>=t.minBet&&v<=t.maxBet).map(v=>[String(v),String(v)] as [string,string])];
      if(t.stake&&!stakes.some(([v])=>Number(v)===t.stake))stakes.push([String(t.stake),String(t.stake)]);
      const settings=`<div class="fb-settings">${segmented('format','Formato',[['1x1','1 × 1'],['2x2','2 × 2']],t.format,host)}
        ${segmented('goals','Gols',FOOSBALL.goalOptions.map(g=>[String(g),String(g)]),String(t.goals),host)}
        ${segmented('sets','Sets',[['1','Um'],['3','Melhor de 3']],String(t.sets),host)}
        ${segmented('level','Zé do Totó',FOOSBALL_LEVELS.map(l=>[l,LEVEL_NAMES[l]]),t.level,host)}
        ${segmented('stake','Valendo',stakes,String(t.stake),host)}</div>`;
      const filled=t.slots.every(s=>s.playerId||s.cpu),allReady=t.slots.every(s=>s.cpu||(s.playerId&&s.ready));
      const note=!slot?(t.slots.some(s=>!s.playerId&&!s.cpu)?'Escolha um lugar para jogar.':'Mesa completa. Dá para assistir daqui.')
        :!filled?(host?'Falta gente: chame o Zé do Totó para as vagas ou espere alguém chegar.':'Esperando mais gente na mesa.')
        :t.stake?`Cada um põe ${t.stake} moedas; o time que vencer leva ${t.stake*2} por jogador.`:allReady?'Começando…':'Todo mundo pronto, a bola rola.';
      const cannotPay=!!slot&&t.stake>balance;
      const ready=slot?`<button type="button" class="fb-primary${slot.ready?' done':''}" data-fb-ready="${!slot.ready}" ${!slot.ready&&cannotPay?'disabled':''}>${uiIcon(slot.ready?'check':'play')}<span>${slot.ready?'Pronto':'Estou pronto'}</span>${slot.ready?'<small>Cancelar</small>':''}</button>`:'';
      html=`<div class="fb-lobby"><div class="fb-sides">${sides}</div>${settings}${t.message?`<p class="fb-note warn">${uiIcon('alert')}<span>${e(t.message)}</span></p>`:''}<div class="fb-actions"><p class="fb-note">${uiIcon(cannotPay?'alert':'info')}<span>${cannotPay?`Esta partida vale ${t.stake} moedas e você tem ${balance}.`:e(note)}${host?'':slot?' <small class="fb-host">Quem abriu a mesa escolhe as regras.</small>':''}</span></p>${ready}</div></div>`;
    }else if(slot&&!watching){
      const touch=touchDevice();
      html=t.phase==='finished'
        ?`<div class="fb-play"><p class="fb-note">${uiIcon('trophy')}<span>A mesa volta para o lobby em instantes, com os mesmos lugares.</span></p><button type="button" class="fb-mini${rematch?' on':''}" data-fb-rematch aria-pressed="${rematch}">${uiIcon('refresh')}${rematch?'Revanche marcada':'Quero revanche'}</button></div>`
        :`<div class="fb-play${touch?' touch':''}"><button type="button" class="fb-hold fb-lift" data-fb-hold="lift" aria-label="Levantar os bonecos (segure)">${uiIcon('chevronUp')}<span>Levantar</span></button>
          <p class="fb-hint">${touch?'Arraste o dedo na mesa para mover os bonecos. Toque em Chutar; segure para a bomba.':'Mexa o mouse: os bonecos seguem. Clique chuta, segurar carrega a bomba. Botão direito ou Shift levanta.'}</p>
          <button type="button" class="fb-hold fb-kick" data-fb-hold="kick" aria-label="Chutar (segure para mais força)">${uiIcon('ball')}<span>Chutar</span><i class="fb-power"></i></button></div>`;
    }else html=`<div class="fb-play"><p class="fb-note">${uiIcon('eye')}<span>Você está assistindo. Quando a partida acabar, dá para pegar um lugar na próxima.</span></p><button type="button" class="fb-mini" data-fb-tool="leave">${uiIcon('close')}Parar de assistir</button></div>`;
    if(leaveArmed)html=`<div class="fb-play"><p class="fb-note warn">${uiIcon('alert')}<span>${t.stake?`Sair agora é W.O.: você perde as ${t.stake} moedas da partida.`:'Saindo agora, o Zé do Totó assume o seu lugar.'}</span></p><button type="button" class="fb-primary danger" data-fb-tool="leave-confirm">${uiIcon('logOut')}<span>Sair mesmo assim</span></button><button type="button" class="fb-mini" data-fb-tool="leave-cancel">Ficar</button></div>`;
    box.innerHTML=html;
    q('keys').textContent=playing()&&!touchDevice()?'Mouse · clique · Shift · W/S':'';
    q('role').textContent=slot?`${TEAM_NAMES[slot.team]} · ${ROLE_NAMES[slot.role].toLowerCase()}`:watching?'Assistindo':'';
  }
  function renderRules():void {
    q('rules').innerHTML=`<h3>Regras da mesa</h3><ul>${RULES(table!).map(r=>`<li>${e(r)}</li>`).join('')}</ul><h3>Comandos</h3><p>${e(CONTROLS_HELP)}</p>
      <p class="fb-source">Baseadas nas regras da ITSF (Federação Internacional de Futebol de Mesa) e da federação britânica, com a mesa brasileira de 11 bonecos por time: goleiro, 2 na zaga, 5 no meio e 3 no ataque.</p>`;
  }
  function render():void {
    const t=table!;
    root.querySelector('.fb')!.setAttribute('data-phase',t.phase);
    renderBoard();renderControls();moments();tickClock();
    q('balance').innerHTML=coins(hooks.balance()??0);
    if(t.phase!=='lobby'&&!MATCH.includes(t.phase)&&t.phase!=='finished')leaveArmed=0;
    if(!q('rules').hidden)renderRules();
    drawn=true;
  }

  // ── Input ────────────────────────────────────────────────────────────────────────────────────────────────────────
  function requestLeave():void {
    if(watching){hooks.send('foosball.watch',{tableId:''});hooks.closed();return;}
    const inPlay=!!me()&&!!table&&MATCH.includes(table.phase);
    if(inPlay&&!leaveArmed){leaveArmed=Date.now();controlsKey='';renderControls();return;}
    leaveArmed=0;hooks.send('foosball.leave');
  }
  canvas.addEventListener('pointermove',event=>{
    if(!playing())return;
    if(event.pointerType==='touch'&&!event.buttons)return;
    pointer=Math.max(-FOOSBALL.width/2,Math.min(FOOSBALL.width/2,renderer.pointerAt(event.clientX,event.clientY)));
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!playing())return;
    sounds.unlock();
    pointer=Math.max(-FOOSBALL.width/2,Math.min(FOOSBALL.width/2,renderer.pointerAt(event.clientX,event.clientY)));
    if(event.pointerType==='touch'){canvas.setPointerCapture(event.pointerId);return;}
    event.preventDefault();
    if(event.button===2){lift.mouse=true;return;}
    if(event.button===0){canvas.setPointerCapture(event.pointerId);startCharge('mouse');}
  });
  const release=(event:PointerEvent)=>{
    if(event.pointerType==='touch')return;
    if(event.button===2)lift.mouse=false;
    if(event.button===0)kick('mouse');
  };
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',()=>{lift.mouse=false;charge=undefined;root.classList.remove('fb-charging');});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  // The touch buttons: held, they charge the kick or keep the figures up.
  root.addEventListener('pointerdown',event=>{
    const hold=(event.target as HTMLElement).closest<HTMLElement>('[data-fb-hold]');
    if(!hold)return;
    event.preventDefault();hold.setPointerCapture(event.pointerId);hold.classList.add('held');
    if(hold.dataset.fbHold==='lift')lift.touch=true;else startCharge('button');
  });
  const holdEnd=(event:PointerEvent)=>{
    const hold=(event.target as HTMLElement).closest<HTMLElement>('[data-fb-hold]');
    if(!hold)return;
    hold.classList.remove('held');
    if(hold.dataset.fbHold==='lift')lift.touch=false;else if(event.type==='pointerup')kick('button');else{charge=undefined;root.classList.remove('fb-charging');}
  };
  root.addEventListener('pointerup',holdEnd);root.addEventListener('pointercancel',holdEnd);
  root.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if(!button||button.disabled||!table||button.dataset.fbHold!==undefined)return;
    sounds.unlock();
    const tool=button.dataset.fbTool,set=button.dataset.fbSet;
    if(button.dataset.fbSlot!==undefined){
      const slot=Number(button.dataset.fbSlot);
      if(me())hooks.send('foosball.slot',{slot});else hooks.send('foosball.join',{tableId:table.id,slot});
      return;
    }
    if(button.dataset.fbCpu!==undefined){hooks.send('foosball.cpu',{slot:Number(button.dataset.fbCpu),on:true});return;}
    if(button.dataset.fbUncpu!==undefined){hooks.send('foosball.cpu',{slot:Number(button.dataset.fbUncpu),on:false});return;}
    if(set){
      const value=button.dataset.value!,patch=set==='goals'||set==='sets'||set==='stake'?{[set]:Number(value)}:{[set]:value};
      if(set==='stake')sounds.chip();
      hooks.send('foosball.config',patch);return;
    }
    if(button.dataset.fbReady){hooks.send('foosball.ready',{ready:button.dataset.fbReady==='true'});return;}
    if(button.dataset.fbRematch!==undefined){rematch=!rematch;controlsKey='';renderControls();return;}
    if(tool==='rules'){const rules=q('rules');rules.hidden=!rules.hidden;button.setAttribute('aria-expanded',String(!rules.hidden));if(!rules.hidden)renderRules();return;}
    if(tool==='sound'){
      sounds.enabled=!sounds.enabled;try{localStorage.setItem(SOUND_KEY,sounds.enabled?'on':'off');}catch{}
      button.setAttribute('aria-pressed',String(sounds.enabled));button.innerHTML=uiIcon(sounds.enabled?'volume':'volumeOff');return;
    }
    if(tool==='leave'){requestLeave();return;}
    if(tool==='leave-confirm'){leaveArmed=0;hooks.send('foosball.leave');return;}
    if(tool==='leave-cancel'){leaveArmed=0;controlsKey='';renderControls();}
  });
  const typing=()=>{const el=document.activeElement as HTMLElement|null;return !!el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable);};
  // Keys while at the table: they never reach the bar behind it.
  const keydown=(event:KeyboardEvent)=>{
    if(!table||root.classList.contains('hidden')||typing()||event.ctrlKey||event.metaKey||event.altKey)return;
    const code=event.code;let used=true;
    if(code==='KeyE'&&!event.repeat)requestLeave();
    else if(code==='Escape'&&!q('rules').hidden){q('rules').hidden=true;}
    else if(!playing())used=false;
    else if(KEYS_UP.has(code))keyAxis=-1;
    else if(KEYS_DOWN.has(code))keyAxis=1;
    else if(code==='Space'){if(!event.repeat)startCharge('key');}
    else if(code==='ShiftLeft'||code==='ShiftRight')lift.key=true;
    else used=false;
    if(used){event.preventDefault();event.stopPropagation();}
  };
  const keyup=(event:KeyboardEvent)=>{
    if(!table)return;
    if((KEYS_UP.has(event.code)&&keyAxis<0)||(KEYS_DOWN.has(event.code)&&keyAxis>0))keyAxis=0;
    if(event.code==='Space')kick('key');
    if(event.code==='ShiftLeft'||event.code==='ShiftRight')lift.key=false;
  };
  document.addEventListener('keydown',keydown,true);document.addEventListener('keyup',keyup,true);
  const blur=()=>{lift={mouse:false,key:false,touch:false};keyAxis=0;charge=undefined;root.classList.remove('fb-charging');};
  window.addEventListener('blur',blur);
  const ticker=setInterval(()=>{if(table&&!root.classList.contains('hidden')){tickClock();if(leaveArmed&&Date.now()-leaveArmed>6000){leaveArmed=0;controlsKey='';renderControls();}}},200);
  raf=requestAnimationFrame(loop);

  return {
    /** The room's table (as synced), who looks at it, and whether they only watch. */
    update(next:FoosballTableView,self:string,onlyWatching:boolean):void {
      const key=JSON.stringify(next)+self+onlyWatching+(hooks.balance()??0);
      if(key===shownKey)return;
      shownKey=key;
      if(table&&table.id!==next.id)frames=[];
      table=next;selfId=self;watching=onlyWatching;render();
    },
    /** A frame of the ball and the rods from the room: kept to blend, and heard. */
    frame(frame:FoosballFrame):void {
      if(!table||frame.id!==table.id)return;
      const decoded=decodeFrame(frame);
      if(frames.length&&decoded.t<=frames[frames.length-1]!.t)return;
      frames.push(decoded);
      while(frames.length>12)frames.shift();
      for(const sound of decoded.sounds){sounds.hit(sound.kind,sound.speed);if(sound.kind==='kick')renderer.thump(sound.speed);}
    },
    /** E at the table: leaving a match in play asks first. */
    requestLeave,
    /** The wallet changed (the stake and the ready button depend on it). */
    refresh():void {if(table){shownKey='';controlsKey='';q('balance').innerHTML=coins(hooks.balance()??0);renderControls();}},
    /** Off the table: next time it opens, nothing carries over. */
    reset():void {table=undefined;shownKey='';controlsKey='';drawn=false;frames=[];lastPhase='';lastGoals=-1;lastMessage='';rematch=false;leaveArmed=0;blur();
      pointerSent=Number.NaN;for(const rod of local.rods)Object.assign(rod,{offset:0,target:0,vy:0,angle:0,omega:0,kick:undefined,lift:false,autoLiftUntil:0});},
    destroy():void {cancelAnimationFrame(raf);clearInterval(ticker);document.removeEventListener('keydown',keydown,true);document.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',blur);root.innerHTML='';},
  };
}
export type FoosballPanel=ReturnType<typeof createFoosballPanel>;
