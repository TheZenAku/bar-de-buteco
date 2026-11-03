import {FOUL_NAMES,GROUP_BALLS,GROUP_NAMES,HEAD_SPOT,POOL_CPU_NAME,POOL_LEVELS,POOL_LEVEL_NAMES,POOL_PHYSICS,POOL_TABLES,aimGuide,decodeBalls,decodeTracks,freeAt,groupLeft,
  inQuadro,legalTargets,stickTouches,trackAt,
  type PoolAimView,type PoolBallSpot,type PoolLevel,type PoolRack,type PoolSeatView,type PoolShotView,type PoolTableView,type PoolTrack} from '@bar/shared';
import {escape as e} from '../api';
import {coins,uiIcon} from '../ui-icons';
import {createPoolRenderer,rackTurn,roll,type PoolBallPicture,type PoolCuePicture} from './render';
import {createPoolSounds} from './sounds';
import './pool.css';

export interface PoolHooks {
  send(type:string,payload?:unknown):void;
  /** The server clock (ms). */
  now():number;
  /** The game's general volume, 0–1. */
  volume():number;
  /** The wallet, as the room last confirmed it (the stake's button depends on it). */
  balance():number|undefined;
  notify(text:string,error?:boolean):void;
  /** The panel closes itself (stopped watching a table). */
  closed():void;
}

/** A player's stroke as they set it up. Every control below writes here; a gamepad or touch layout can too. */
export interface PoolControls {angle:number;power:number;spinX:number;spinY:number;elevation:number}

const SOUND_KEY='bar:pool:sound';
const MATCH:readonly string[]=['aim','rolling','choice','paused'];
const RULES=[
  'Bola 8 pelas regras da Noel Snooker: 7 lisas (1 a 7), 7 listradas (9 a 15) e a 8 preta. Vence quem encaçapar todas as do seu grupo e depois a 8.',
  'Saída: o triângulo com a 1 na frente, a 8 no meio e uma lisa e uma listrada nas pontas da base. A branca vai em qualquer ponto do quadro, atrás da linha de cabeceira. Pelo menos duas bolas precisam tocar as tabelas (a branca conta, e bola encaçapada também). As saídas seguintes são alternadas.',
  'Mesa aberta: até alguém encaçapar uma bola legalmente, vale bater em qualquer bola menos a 8. A primeira que cair define o grupo. Lisa e listrada na mesma tacada não é falta.',
  'Depois dos grupos, a branca tem de tocar primeiro uma bola do seu grupo (ou a 8, quando o grupo acabou). Encaçapou bola sua, sem falta, continua jogando. Errou ou cometeu falta, a vez passa.',
  'Faltas: cair de branca (suicídio), não tocar em bola, tocar primeiro a bola errada, encaçapar bola do adversário, bola para fora da mesa, o taco encostar em outra bola, bi-toque, tacar com bola em movimento, a branca saltar por cima de bola e a saída sem duas bolas na tabela.',
  'Depois de uma falta, o adversário joga a branca de onde ela parou. Branca encaçapada ou fora da mesa volta para a marca superior; a 8 e bolas fora da mesa, para a marca inferior.',
  'A 8 na saída, sem outra falta: quem saiu escolhe entre recolocá-la na marca inferior e continuar, ou uma nova saída. Com falta, a escolha é do adversário.',
  'A 8 antes da hora é derrota. A 8 com a branca, com só a 8 em jogo, é derrota.',
  'A 8 com falta (a branca, ou uma bola do adversário) enquanto o adversário ainda tem bolas: ele tira a sua bola de menor número e tem uma tacada contínua para limpar o resto. Conseguiu, vence; errou, perde.',
  'Sair da mesa no meio da partida é desistir: a partida vai para o outro jogador. Sem resposta em 60 s, a vez passa.',
];
const CONTROLS_HELP=[
  ['Mouse sobre a mesa','mira'],['Segurar o botão esquerdo','a força enche enquanto segura; soltar dá a tacada'],['Botão direito ou Esc','cancela a tacada que está carregando'],
  ['Roda do mouse (ou A/D)','ajuste fino da mira (Shift acelera)'],['Bola do efeito (ou I J K L)','onde o taco bate na branca (duplo clique ou R centraliza)'],['Controle Taco (ou Z/X)','inclina o taco (salto)'],
  ['Clique no quadro','põe a branca, na saída (M move de novo)'],['E','sai da mesa'],
] as const;
const KEYS_LEFT=new Set(['KeyA','ArrowLeft']),KEYS_RIGHT=new Set(['KeyD','ArrowRight']);
/** Holding the left button fills the power bar in this long (then it stays full); a release under the minimum strikes nothing. */
const CHARGE_MS=1400,MIN_POWER=.03;
const SPIN_KEYS:Record<string,[number,number]>={KeyI:[0,1],KeyK:[0,-1],KeyJ:[-1,0],KeyL:[1,0]};

const clamp=(v:number,lo:number,hi:number)=>v<lo?lo:v>hi?hi:v;
const touchDevice=()=>matchMedia('(pointer: coarse)').matches;
const ballChip=(n:number,on=true)=>`<i class="pl-ball${n>8?' stripe':''}${n===8?' eight':''}${on?'':' down'}" style="--c:${['','#f2c21b','#1f5fd0','#d8262e','#5b2a9c','#f07a17','#13854d','#8c1f24','#141016'][n>8?n-8:n]}" aria-label="Bola ${n}${on?'':', encaçapada'}"><b>${n}</b></i>`;

/**
 * The pool panel (E at a table in the games hall): the table from above (render.ts), the two players with their group,
 * the balls they have left and the 8 when it is theirs, the lobby (seats, Juca da Sinuca, "pronto") and the match. On
 * their turn the player aims with the pointer (or keys), sets the power, the side and top/bottom of the tip on the cue
 * ball and the cue's elevation, and strikes; on the break they put the cue ball in the quadro first. The room plays every
 * stroke through the physics and sends its paths: everyone at the table watches the same balls roll.
 */
export function createPoolPanel(root:HTMLElement,hooks:PoolHooks){
  const sounds=createPoolSounds(hooks.volume);
  try{sounds.enabled=localStorage.getItem(SOUND_KEY)!=='off';}catch{/* in-memory only */}
  root.innerHTML=`<div class="pl" data-phase="lobby">
    <header class="pl-head">
      <span class="pl-title">${uiIcon('ball')}<b>Sinuca</b><small data-pl="table"></small></span>
      <span class="pl-valendo" data-pl="valendo" hidden></span>
      <span class="pl-head-tools"><button type="button" data-pl-tool="rules" aria-expanded="false" title="Regras e comandos" aria-label="Regras e comandos">${uiIcon('help')}</button>
        <button type="button" data-pl-tool="sound" title="Sons da mesa" aria-label="Sons da mesa" aria-pressed="${sounds.enabled}">${uiIcon(sounds.enabled?'volume':'volumeOff')}</button>
        <button type="button" data-pl-tool="leave" class="pl-leave" title="Sair da mesa" aria-label="Sair da mesa">${uiIcon('close')}<span>Sair</span></button></span>
    </header>
    <div class="pl-board">
      <section class="pl-player" data-seat="0"></section>
      <div class="pl-mid" role="status" aria-live="polite"><b data-pl="status"></b><span class="pl-clock" data-pl="clock"></span><div class="pl-timer" aria-hidden="true"><i data-pl="timer"></i></div></div>
      <section class="pl-player" data-seat="1"></section>
    </div>
    <ol class="pl-feed" data-pl="feed" aria-live="polite"></ol>
    <div class="pl-stage">
      <canvas class="pl-canvas" aria-label="Mesa de sinuca vista de cima" role="img"></canvas>
      <div class="pl-overlay" data-pl="overlay"></div>
      <div class="pl-lobby" data-pl="lobby" hidden></div>
      <div class="pl-rules" data-pl="rules" hidden></div>
    </div>
    <div class="pl-controls" data-pl="controls"></div>
    <footer class="pl-foot"><span>Saldo <b data-pl="balance">—</b></span><span>Em jogo <b data-pl="staked">—</b></span><span data-pl="role"></span><span class="pl-keys" data-pl="keys"></span></footer>
  </div>`;
  const q=<T extends HTMLElement=HTMLElement>(name:string)=>root.querySelector<T>(`[data-pl="${name}"]`)!;
  const canvas=root.querySelector<HTMLCanvasElement>('.pl-canvas')!;
  const renderer=createPoolRenderer(canvas);

  let view:PoolTableView|undefined,selfId='',watching=false,controlsKey='',overlayKey='',boardKey='',lobbyKey='',feedKey='',drawn=false;
  /** The balls as drawn: where, and how each has turned (so numbers and stripes roll with them). */
  const shown=new Map<number,{x:number;y:number;turn:ReturnType<typeof rackTurn>}>();
  let rackShown=-1;
  /** A stroke playing back: its paths, when it started here, the sounds already heard. */
  let playback:{shot:PoolShotView;tracks:PoolTrack[];base:PoolBallSpot[];started:number;sound:number;potted:Set<number>}|undefined;
  const glow:Array<{pocket:number;at:number;colour:string}>=[];
  /** The player's own stroke, and how it is being set: the pointer's aim and the fine turn on top of it (the wheel), the
   *  power charging while the left button is held, the cue ball being put in the quadro. */
  const controls:PoolControls={angle:0,power:0,spinX:0,spinY:0,elevation:0};
  let aimBase=0,aimFine=0,fineAt:{x:number;y:number}|undefined,charge:{at:number}|undefined;
  let placingMode=false,placeAt:{x:number;y:number}={x:HEAD_SPOT.x,y:HEAD_SPOT.y},placeOk=true,strikeAt=0,sentShot=-1,aimSentAt=0,aimKey='',aimFor=-1;
  let keys=new Set<string>(),leaveArmed=0,rematch=false,lastFeed=0,lastTurnMine=false,lastPhase='',raf=0,lastTick=performance.now();
  /** The shooter's aim as the room relays it (someone else's turn). */
  let theirs:PoolAimView|undefined;

  const mySeat=():PoolSeatView|undefined=>view?.seats.find(s=>s.playerId===selfId&&!!selfId);
  const myTurn=()=>!!view&&!watching&&view.phase==='aim'&&mySeat()?.seat===view.turn;
  const rackOf=(v:PoolTableView):PoolRack=>({breaking:v.breaking,turn:v.turn,groups:v.groups,benefit:v.benefit,winner:v.winner,reason:v.reason});
  const nameOf=(s:PoolSeatView|undefined)=>!s?'':s.playerId===selfId&&!!selfId?'Você':s.displayName||'Lugar livre';

  // ── Balls, playback and the picture ────────────────────────────────────────────────────────────────────────────
  /** The view's balls become the ones drawn (a new rack turns every number up again). */
  function adoptBalls(v:PoolTableView):void {
    if(v.rack!==rackShown){shown.clear();rackShown=v.rack;}
    const balls=decodeBalls(v.balls),here=new Set(balls.map(b=>b.n));
    for(const b of balls){const was=shown.get(b.n);shown.set(b.n,{x:b.x,y:b.y,turn:was&&Math.hypot(was.x-b.x,was.y-b.y)<.2?roll(was.turn,b.x-was.x,b.y-was.y):rackTurn(b.n)});}
    for(const n of [...shown.keys()])if(!here.has(n))shown.delete(n);
  }
  function startPlayback(shot:PoolShotView):void {
    if(!view||shot.tableId!==view.id)return;
    // A stroke that started a while ago (someone who just came to the table) is joined midway.
    const late=Math.max(0,Math.min(shot.duration,hooks.now()-shot.startAt-200));
    playback={shot,tracks:decodeTracks(shot.tracks),base:decodeBalls(view.balls),started:performance.now()-late,sound:0,potted:new Set()};
    while(playback.sound<shot.sounds.length&&shot.sounds[playback.sound]!<late)playback.sound+=3;
    strikeAt=performance.now();theirs=undefined;
  }
  function pictureBalls(now:number):PoolBallPicture[] {
    const out:PoolBallPicture[]=[];
    if(playback){
      const elapsed=performance.now()-playback.started;
      // The sounds whose moment came.
      const s=playback.shot.sounds;
      while(playback.sound+2<s.length&&s[playback.sound]!<=elapsed){sounds.hit(s[playback.sound+1]!,s[playback.sound+2]!/100);playback.sound+=3;}
      const moving=new Map(playback.tracks.map(t=>[t.n,t]));
      for(const base of playback.base){
        const track=moving.get(base.n),prev=shown.get(base.n)??{x:base.x,y:base.y,turn:rackTurn(base.n)};
        if(!track){out.push({...base,turn:prev.turn});continue;}
        const at=trackAt(track,elapsed),last=track.t[track.t.length-1]??0;
        if(at.gone){
          // Into the pocket (or off the table): it slides to the hole and drops, then it is gone.
          const since=elapsed-last;
          if(track.end==='pocket'&&!playback.potted.has(base.n)){playback.potted.add(base.n);glow.push({pocket:track.pocket,at:now,colour:renderer.colourOf(base.n)});}
          if(track.end==='pocket'&&since<320)out.push({n:base.n,x:at.x,y:at.y,turn:prev.turn,sink:{pocket:track.pocket,t:since/320}});
          shown.delete(base.n);
          continue;
        }
        const turn=roll(prev.turn,at.x-prev.x,at.y-prev.y);
        shown.set(base.n,{x:at.x,y:at.y,turn});out.push({n:base.n,x:at.x,y:at.y,turn});
      }
      // Over once its paths have run and the room has given the verdict.
      if(elapsed>playback.shot.duration+60&&view&&(view.phase!=='rolling'||view.shot>playback.shot.shot+1)){playback=undefined;if(view)adoptBalls(view);}
      return out;
    }
    for(const [n,b] of shown)out.push({n,x:b.x,y:b.y,turn:b.turn});
    return out;
  }
  function spots():PoolBallSpot[] {
    const balls=[...shown].map(([n,b])=>({n,x:b.x,y:b.y}));
    if(myTurn()&&view?.placing){const cue=balls.find(b=>b.n===0);if(cue)Object.assign(cue,placeAt);}
    return balls;
  }
  function loop():void {
    raf=requestAnimationFrame(loop);
    if(!view||root.classList.contains('hidden'))return;
    const tick=performance.now(),dt=Math.min(.05,(tick-lastTick)/1000);lastTick=tick;
    const now=hooks.now(),mine=myTurn();
    if(mine)steer(dt);
    if(!mine&&charge)cancelCharge();
    // The aim follows the pointer (plus the fine turn) until the button is held; then the power fills.
    if(mine&&!charge)controls.angle=aimBase+aimFine;
    if(charge)controls.power=Math.min(1,(performance.now()-charge.at)/CHARGE_MS);
    root.classList.toggle('pl-charging',!!charge);
    let balls=pictureBalls(tick);
    if(mine&&view.placing&&!playback)balls=balls.map(b=>b.n===0?{...b,...placeAt}:b);
    let cue:PoolCuePicture|undefined,guide;
    const strike=Math.min(1,(tick-strikeAt)/110);
    if(mine&&!playback&&!placingMode){
      const at=spots(),blocked=stickTouches(at,{...controls}).length>0,aim=aimGuide(at,controls.angle,1);
      cue={angle:controls.angle,pull:controls.power,strike:sentShot===view.shot?strike:0,blocked,mine:true,elevation:controls.elevation};
      if(aim){const targets=legalTargets(rackOf(view),view.turn,at.map(b=>b.n).filter(n=>n));guide={...aim,legal:aim.ball<0||targets.includes(aim.ball)};}
      root.classList.toggle('pl-blocked',blocked);
      sendAim(now);
    }else if(!mine&&view.phase==='aim'&&theirs&&!playback){
      if(theirs.cue)balls=balls.map(b=>b.n===0?{...b,...theirs!.cue!}:b);
      cue={angle:theirs.angle,pull:theirs.power,strike:0,blocked:false,mine:false,elevation:theirs.elevation};
    }
    while(glow.length&&tick-glow[0]!.at>900)glow.shift();
    renderer.draw({balls,cue,guide,placing:mine&&view.placing&&placingMode&&!playback?{ok:placeOk}:undefined,glow,now:tick});
    if(mine)updateMeters();
  }
  /** Keys held: the aim turns, the power and the spin move. */
  function steer(dt:number):void {
    const fast=keys.has('ShiftLeft')||keys.has('ShiftRight')?4:1;
    let turn=0;for(const k of keys){if(KEYS_LEFT.has(k))turn-=1;if(KEYS_RIGHT.has(k))turn+=1;}
    if(turn&&!charge){aimFine+=turn*dt*.22*fast;fineAt=undefined;}
    for(const k of keys){const s=SPIN_KEYS[k];if(s)setSpin(controls.spinX+s[0]*dt*1.4,controls.spinY+s[1]*dt*1.4);}
    if(keys.has('KeyZ'))controls.elevation=clamp(controls.elevation-dt*30,0,POOL_PHYSICS.maxElevation);
    if(keys.has('KeyX'))controls.elevation=clamp(controls.elevation+dt*30,0,POOL_PHYSICS.maxElevation);
  }
  function setSpin(x:number,y:number):void {const l=Math.hypot(x,y);controls.spinX=l>1?x/l:x;controls.spinY=l>1?y/l:y;}
  function sendAim(now:number):void {
    const key=[controls.angle.toFixed(3),controls.power.toFixed(2),controls.spinX.toFixed(2),controls.spinY.toFixed(2),controls.elevation.toFixed(0),view?.placing?`${placeAt.x.toFixed(3)},${placeAt.y.toFixed(3)}`:''].join('|');
    if(key===aimKey||now-aimSentAt<100)return;
    aimKey=key;aimSentAt=now;
    hooks.send('pool.aim',{angle:round(controls.angle,4),power:round(controls.power,3),spinX:round(controls.spinX,3),spinY:round(controls.spinY,3),elevation:round(controls.elevation,1),...(view?.placing?{cue:{x:round(placeAt.x,4),y:round(placeAt.y,4)}}:{})});
  }
  /** The left button is down: the aim stays where it is and the power starts filling from nothing. */
  function startCharge():void {
    if(!myTurn()||!view||playback||placingMode||charge||sentShot===view.shot)return;
    sounds.unlock();charge={at:performance.now()};controls.power=0;
  }
  /** The button is up: the stroke goes with the power it reached (a release too early strikes nothing). */
  function releaseCharge():void {
    if(!charge)return;
    controls.power=Math.min(1,(performance.now()-charge.at)/CHARGE_MS);charge=undefined;
    if(controls.power<MIN_POWER){controls.power=0;return;}
    shoot();
  }
  function cancelCharge():void {charge=undefined;controls.power=0;}
  function shoot():void {
    if(!myTurn()||!view||playback||sentShot===view.shot)return;
    if(view.placing&&!placeOk){hooks.notify('A branca não cabe aí: escolha outro ponto do quadro.',true);return;}
    sounds.unlock();placingMode=false;sentShot=view.shot;strikeAt=performance.now();
    hooks.send('pool.shot',{shot:view.shot,angle:round(controls.angle,5),power:round(controls.power,3),spinX:round(controls.spinX,3),spinY:round(controls.spinY,3),elevation:round(controls.elevation,1),
      ...(view.placing?{cue:{x:round(placeAt.x,4),y:round(placeAt.y,4)}}:{})});
    controlsKey='';renderControls();
  }

  // ── The scoreboard, the overlay and the feed ───────────────────────────────────────────────────────────────────
  function renderBoard():void {
    const v=view!,onTable=decodeBalls(v.balls).map(b=>b.n),key=JSON.stringify([v.seats,v.groups,v.turn,v.phase,v.benefit,onTable,selfId,v.winner]);
    q('table').textContent=`Bola 8 · mesa ${POOL_TABLES.find(t=>t.id===v.id)?.number??''}${watching?' · assistindo':''}`;
    if(key===boardKey)return;boardKey=key;
    for(const seat of v.seats){
      const el=root.querySelector<HTMLElement>(`.pl-player[data-seat="${seat.seat}"]`)!,group=v.groups[seat.seat],left=group?groupLeft(group,onTable):[];
      const onEight=!!group&&!left.length&&v.benefit<0&&onTable.includes(8),turn=MATCH.includes(v.phase)&&v.turn===seat.seat;
      el.classList.toggle('turn',turn);el.classList.toggle('mine',seat.playerId===selfId&&!!selfId);el.classList.toggle('empty',!seat.playerId&&!seat.cpu);el.classList.toggle('on-eight',onEight);
      const chips=group?GROUP_BALLS[group].map(n=>ballChip(n,left.includes(n))).join(''):'';
      el.innerHTML=`<div class="pl-who"><b>${e(nameOf(seat))}</b>${seat.cpu?`<em class="pl-badge cpu">${e(POOL_LEVEL_NAMES[seat.cpu])}</em>`:''}${seat.playerId&&!seat.connected?'<em class="pl-badge away">sem conexão</em>':''}
        ${seat.racks?`<span class="pl-racks" title="Partidas vencidas nesta mesa">${uiIcon('trophy')}${seat.racks}</span>`:''}</div>
        <div class="pl-group">${group?`<small>${GROUP_NAMES[group]}</small><span class="pl-balls">${chips}</span>`:`<small>${v.phase==='lobby'?'':'Mesa aberta'}</small>`}
        ${onEight?`<span class="pl-eight">${ballChip(8)}<small>Na bola 8</small></span>`:''}${v.benefit===seat.seat?'<span class="pl-benefit">Benefício: tacada contínua</span>':''}</div>`;
    }
  }
  function status():string {
    const v=view!,shooter=v.seats[v.turn];
    if(v.phase==='lobby')return 'Antes do jogo';
    if(v.phase==='rolling')return 'Bolas rolando…';
    if(v.phase==='paused')return v.message||'Partida parada';
    if(v.phase==='finished')return `${nameOf(v.seats[v.winner])} venceu`;
    if(v.phase==='choice')return v.choice?.kind==='toss'?'Cara ou coroa':'A bola 8 caiu na saída';
    const open=!v.groups[0];
    return `${myTurn()?'Sua vez':`Vez de ${nameOf(shooter)}`}${v.breaking?' · saída':open?' · mesa aberta':''}`;
  }
  function tickClock():void {
    const v=view;if(!v)return;
    const now=hooks.now(),running=(v.phase==='aim'||v.phase==='choice'||v.phase==='paused')&&v.deadline>0;
    const left=running?Math.max(0,v.deadline-now):0,total=v.phase==='choice'?20_000:v.phase==='paused'?25_000:60_000;
    // Only what changed is written: rewriting the same words four times a second is wasted work on the page.
    const said=status(),clock=running&&left<=20_000?`${Math.ceil(left/1000)} s`:'';
    if(q('status').textContent!==said)q('status').textContent=said;
    if(q('clock').textContent!==clock)q('clock').textContent=clock;
    const bar=q('timer');bar.style.width=`${running?clamp(left/total,0,1)*100:0}%`;bar.classList.toggle('urgent',running&&left<10_000);
  }
  function renderFeed():void {
    const v=view!,fresh=v.feed.filter(f=>f.id>lastFeed);
    if(drawn)for(const f of fresh){
      if(f.kind==='foul')sounds.foul();
      if(f.kind==='pot'&&f.text.startsWith(mySeat()?.displayName??'\u0000'))sounds.pot();
    }
    const shown=v.feed.slice(-3),key=shown.map(f=>f.id).join(',');
    if(key===feedKey)return;feedKey=key;
    const before=lastFeed;
    if(fresh.length)lastFeed=Math.max(...v.feed.map(f=>f.id));
    q('feed').innerHTML=shown.map(f=>`<li class="${f.kind}${drawn&&f.id>before?' new':''}">${uiIcon(f.kind==='foul'?'alert':f.kind==='pot'?'ball':f.kind==='win'?'trophy':f.kind==='turn'?'chevronRight':'info')}<span>${e(f.text)}</span></li>`).join('');
  }
  function renderOverlay():void {
    const v=view!,me=mySeat(),key=JSON.stringify([v.phase,v.choice,v.winner,v.reason,selfId,rematch,watching,me?.ready,v.seats.map(s=>[s.playerId,s.racks,s.prize])]);
    if(key===overlayKey)return;overlayKey=key;
    let html='';
    if(v.phase==='choice'&&v.choice){
      const chooser=v.seats[v.choice.seat],mine=!watching&&chooser?.playerId===selfId;
      if(v.choice.kind==='toss')html=`<div class="pl-dialog"><small>Cara ou coroa</small><b>${mine?'Você ganhou! Quem sai?':`${e(nameOf(chooser))} ganhou e escolhe quem sai`}</b>
        ${mine?`<div class="pl-dialog-actions"><button type="button" class="pl-primary" data-pl-choice="break">${uiIcon('play')}<span>Eu saio</span><kbd>1</kbd></button><button type="button" class="pl-act" data-pl-choice="pass">${uiIcon('transfer')}<span>Passar a saída</span><kbd>2</kbd></button></div>`:''}</div>`;
      else html=`<div class="pl-dialog"><small>A bola 8 caiu na saída${v.choice.foul?', com falta':''}</small><b>${mine?'Você escolhe:':`${e(nameOf(chooser))} escolhe`}</b>
        ${mine?`<div class="pl-dialog-actions"><button type="button" class="pl-primary" data-pl-choice="spot">${ballChip(8)}<span>A 8 na marca e jogo</span><kbd>1</kbd></button><button type="button" class="pl-act" data-pl-choice="rerack">${uiIcon('refresh')}<span>Nova saída</span><kbd>2</kbd></button></div>`:'<p>Recolocar a 8 na marca inferior ou fazer uma nova saída.</p>'}</div>`;
    }else if(v.phase==='finished'&&v.winner>=0){
      const winner=v.seats[v.winner]!,mine=!!me&&!watching,won=mine&&winner.playerId===selfId;
      const score=v.seats.map(s=>`${e(nameOf(s))} <b>${s.racks}</b>`).join(' <i>×</i> ');
      html=`<div class="pl-result ${won?'win':mine?'loss':''}"><span class="pl-result-ball">${ballChip(8)}</span><small>Fim da partida</small><b>${won?'Vitória!':mine?'Não foi dessa vez':`${e(nameOf(winner))} venceu`}</b>
        <span>${e(v.reason)}</span>${mine&&me?.prize?`<em class="pl-prize ${me.prize>0?'win':'loss'}">${me.prize>0?'+':'−'}${Math.abs(me.prize).toLocaleString('pt-BR')} moedas</em>`:''}<p class="pl-score">${score}</p>
        ${mine?`<div class="pl-dialog-actions"><button type="button" class="pl-primary${rematch?' done':''}" data-pl-rematch>${uiIcon(rematch?'check':'refresh')}<span>${rematch?'Revanche marcada':'Revanche'}</span></button><button type="button" class="pl-act" data-pl-tool="leave">${uiIcon('logOut')}<span>Sair da mesa</span></button></div>`:''}</div>`;
      if(drawn&&lastPhase!=='finished')sounds.final(!mine?'':won?'win':'loss');
    }else if(v.phase==='paused')html=`<div class="pl-dialog"><small>Partida parada</small><b>${e(v.message)}</b></div>`;
    const overlay=q('overlay');overlay.innerHTML=html;overlay.classList.toggle('on',!!html);
  }

  // ── Lobby and controls ───────────────────────────────────────────────────────────────────────────────────────
  function renderControls():void {
    const v=view!,me=mySeat(),host=!!me&&v.hostId===selfId,mine=myTurn();
    const key=JSON.stringify([v.phase,v.seats,v.level,v.hostId,v.groups,v.turn,selfId,watching,mine,v.placing,placingMode,leaveArmed>0,sentShot===v.shot,touchDevice()]);
    if(key===controlsKey)return;controlsKey=key;
    const box=q('controls');let html='';
    root.querySelector('.pl')!.setAttribute('data-view',v.phase==='lobby'?'lobby':'match');
    if(v.phase==='lobby'){
      // The lobby itself is the card over the table (renderLobby).
      html=`<div class="pl-wait"><p class="pl-note">${uiIcon('coins')}<span>${me?'Escolha a aposta na mesa e confirme.':v.seats.some(s=>!s.playerId)?'Escolha um lugar na mesa para jogar.':'Mesa completa. Dá para assistir daqui.'}</span></p></div>`;
    }else if(mine){
      const touch=touchDevice(),waiting=sentShot===v.shot;
      html=`<div class="pl-aim">
        <div class="pl-power" data-pl="power" role="meter" aria-label="Força da tacada: segure o botão esquerdo do mouse" aria-valuemin="0" aria-valuemax="100"><small>Força</small><span class="pl-power-bar"><i></i></span><b data-pl="power-value"></b></div>
        <div class="pl-spin-box"><div class="pl-spin" data-pl="spin" role="slider" tabindex="0" aria-label="Efeito na branca: onde o taco bate"><i class="pl-spin-dot"></i></div><small data-pl="spin-value">Centro</small></div>
        <label class="pl-elev"><small>Taco</small><input type="range" min="0" max="${POOL_PHYSICS.maxElevation}" step="1" data-pl="elevation" aria-label="Inclinação do taco"><b data-pl="elev-value"></b></label>
        <div class="pl-aim-actions">
          ${v.placing?`<button type="button" class="pl-mini${placingMode?' on':''}" data-pl-place aria-pressed="${placingMode}">${uiIcon('grip')}${placingMode?'Pondo a branca':'Mover a branca'}</button>`:''}
          ${touch?`<button type="button" class="pl-primary pl-shoot" data-pl-hold ${waiting||placingMode?'disabled':''}>${uiIcon('crosshair')}<span>${waiting?'Tacando…':'Segure para tacar'}</span></button>`:''}
        </div>
        <p class="pl-hint" data-pl="hint">${placingMode?(touch?'Arraste a branca dentro do quadro e toque em “Pronto”.':'Mova a branca dentro do quadro e clique para deixá-la ali.'):touch?'Arraste na mesa para mirar. Segure “Segure para tacar” para encher a força e solte para tacar.':waiting?'Tacando…':'Mova o mouse para mirar. Segure o botão esquerdo para encher a força e solte para tacar. Botão direito cancela. Roda: ajuste fino.'}</p>
      </div>`;
    }else if(me&&!watching){
      html=`<div class="pl-wait"><p class="pl-note">${uiIcon(v.phase==='rolling'?'ball':'eye')}<span>${v.phase==='rolling'?'Bolas rolando…':v.phase==='finished'?'A mesa volta para o lobby em instantes.':v.phase==='choice'?(v.choice&&v.seats[v.choice.seat]?.playerId===selfId?'A escolha é sua: está na mesa.':'Esperando a escolha.'):`Vez de ${e(nameOf(v.seats[v.turn]))}. A mira dele aparece na mesa.`}</span></p></div>`;
    }else html=`<div class="pl-wait"><p class="pl-note">${uiIcon('eye')}<span>Você está assistindo. Quando a partida acabar, dá para pegar um lugar na próxima.</span></p><button type="button" class="pl-mini" data-pl-tool="leave">${uiIcon('close')}Parar de assistir</button></div>`;
    if(leaveArmed){const other=v.seats.find(s=>s.playerId!==selfId),staked=mySeat()?.staked??0;html=`<div class="pl-wait"><p class="pl-note warn">${uiIcon('alert')}<span>Sair agora é desistir: a partida vai para ${e(nameOf(other))}${staked?` e você perde a aposta de ${staked.toLocaleString('pt-BR')} moedas`:''}.</span></p><button type="button" class="pl-primary danger" data-pl-tool="leave-confirm">${uiIcon('logOut')}<span>Sair mesmo assim</span></button><button type="button" class="pl-mini" data-pl-tool="leave-cancel">Ficar</button></div>`;}
    box.innerHTML=html;
    q('keys').textContent=mine&&!touchDevice()?'Mouse: mira · segure e solte o botão esquerdo: taca · direito: cancela · roda: ajuste fino':'';
    q('role').textContent=me?(v.groups[me.seat]?GROUP_NAMES[v.groups[me.seat] as 'solids'|'stripes']:v.phase==='lobby'?'':'Mesa aberta'):watching?'Assistindo':'';
    const elev=root.querySelector<HTMLInputElement>('[data-pl="elevation"]');if(elev)elev.value=String(Math.round(controls.elevation));
    updateMeters();
  }
  /** The power bar, the spin ball and the cue's elevation follow the controls without redrawing the buttons. */
  let metersKey='';
  function updateMeters():void {
    const power=root.querySelector<HTMLElement>('[data-pl="power"]');if(!power)return;
    // Only when something changed: writing to the page every frame stalls it with the accessibility services on.
    // A freshly drawn bar has no value yet.
    const key=`${controls.power.toFixed(3)}|${controls.spinX.toFixed(3)}|${controls.spinY.toFixed(3)}|${controls.elevation.toFixed(1)}`;
    if(key===metersKey&&power.style.getPropertyValue('--p'))return;
    metersKey=key;
    power.style.setProperty('--p',String(controls.power));power.setAttribute('aria-valuenow',String(Math.round(controls.power*100)));
    q('power-value').textContent=`${Math.round(controls.power*100)}%`;
    const spin=q('spin');spin.style.setProperty('--sx',String(controls.spinX));spin.style.setProperty('--sy',String(controls.spinY));
    const sx=Math.round(controls.spinX*100),sy=Math.round(controls.spinY*100);
    q('spin-value').textContent=!sx&&!sy?'Centro':[sy>15?'Alto':sy<-15?'Baixo':'',sx>15?'direita':sx<-15?'esquerda':''].filter(Boolean).join(' · ')||'Quase no centro';
    q('elev-value').textContent=`${Math.round(controls.elevation)}°`;
    const elev=root.querySelector<HTMLInputElement>('[data-pl="elevation"]');if(elev&&document.activeElement!==elev)elev.value=String(Math.round(controls.elevation));
  }
  /** Before the match (the truco table's lobby): the two seats, Juca's level with its stake per person, or the stake between
   *  two people, what the winner gets, and the yes that puts the coins on the table. */
  function renderLobby():void {
    const v=view!,box=q('lobby'),me=mySeat(),host=!!me&&v.hostId===selfId,balance=hooks.balance()??0;
    const keyed=v.phase==='lobby'&&!watching?JSON.stringify([v.seats,v.level,v.stake,v.betweenPeople,v.levelStakes,v.minBet,v.maxBet,v.taking,v.hostId,v.message,selfId,balance]):'';
    if(keyed===lobbyKey)return;lobbyKey=keyed;
    box.hidden=!keyed;
    if(!keyed){box.innerHTML='';return;}
    const stake=v.stake,short=!!me&&stake>balance,empty=v.seats.some(s=>!s.playerId);
    const tile=(s:PoolSeatView)=>{
      const own=s.playerId===selfId&&!!selfId,free=!s.playerId&&!s.cpu,juca=!!s.cpu,sit=!own&&(free||(juca&&!me));
      const sub=juca?`${POOL_LEVEL_NAMES[s.cpu as PoolLevel]} · a casa`:s.playerId?(s.ready?'Aposta confirmada':'Ainda não confirmou'):'Clique para sentar. Vazio, vira o Juca';
      return `<button type="button" class="pl-lobby-seat${own?' self':''}${s.ready&&s.playerId?' ready':''}" ${sit?`data-pl-seat="${s.seat}"`:'disabled'}>
        <b>${own?'Você':juca?POOL_CPU_NAME:s.playerId?e(s.displayName):'Lugar livre'}</b><small>${e(sub)}</small></button>`;
    };
    const levels=v.betweenPeople?'':`<div class="pl-levels" role="group" aria-label="Nível do Juca da Sinuca">${POOL_LEVELS.map(l=>`<button type="button" class="pl-level" data-pl-level="${l}" aria-pressed="${l===v.level}" ${host?'':'disabled'}><b>${POOL_LEVEL_NAMES[l]}</b><small>${v.levelStakes[l].toLocaleString('pt-BR')} moedas por pessoa</small></button>`).join('')}</div>`;
    const between=v.betweenPeople?`<div class="pl-stake" role="group" aria-label="Aposta entre jogadores"><span>Aposta por pessoa<small>mínimo ${v.minBet.toLocaleString('pt-BR')}</small></span><button type="button" data-pl-stake="${stake-v.step}" aria-label="Menos" ${!host||stake-v.step<v.minBet?'disabled':''}>${uiIcon('minus')}</button><b>${stake.toLocaleString('pt-BR')}</b><button type="button" data-pl-stake="${stake+v.step}" aria-label="Mais" ${!host||stake+v.step>v.maxBet?'disabled':''}>${uiIcon('plus')}</button></div>`:'';
    const juca=v.seats.find(s=>s.cpu),toggle=host&&(juca||empty)?`<button type="button" class="pl-act quiet" data-pl-cpu="${juca?'off':'on'}">${uiIcon(juca?'close':'userPlus')}<span>${juca?'Tirar o Juca':'Chamar o Juca agora'}</span></button>`:'';
    const yes=!!me?.ready;
    const action=!me?'':v.taking?`<p class="pl-note">${uiIcon('coins')} Recolhendo as apostas…</p>`:yes?`<button type="button" class="pl-act quiet" data-pl-ready="false">${uiIcon('close')}<span>Retirar a aposta · aguardando o adversário</span></button>`
      :`<button type="button" class="pl-act primary" data-pl-ready="true" ${short?'disabled':''}>${uiIcon(short?'alert':'coins')}<span>${short?`Faltam moedas: você tem ${balance.toLocaleString('pt-BR')}`:`Apostar ${stake.toLocaleString('pt-BR')} e ${v.betweenPeople?'confirmar':'começar'}`}</span></button>`;
    box.innerHTML=`<small>Highland Bar</small><h2>Mesa de sinuca</h2>
      <div class="pl-lobby-seats">${v.seats.map(tile).join('<i class="pl-lobby-vs">×</i>')}</div>${levels}${between}
      <p class="pl-lobby-sum">Cada pessoa aposta <b>${stake.toLocaleString('pt-BR')}</b>. Quem vencer recebe <b>${(stake*2).toLocaleString('pt-BR')}</b>. Quem sair no meio perde a aposta.</p>
      ${v.message?`<p class="pl-note warn">${uiIcon('alert')} ${e(v.message)}</p>`:''}${me&&!host?`<p class="pl-lobby-host">Quem abriu a mesa escolhe ${v.betweenPeople?'a aposta':'o nível do Juca'}.</p>`:''}${toggle}${action}`;
  }
  function renderRules():void {
    q('rules').innerHTML=`<h3>Regras da mesa</h3><ul>${RULES.map(r=>`<li>${e(r)}</li>`).join('')}</ul><h3>Comandos</h3><dl>${CONTROLS_HELP.map(([k,d])=>`<dt>${e(k)}</dt><dd>${e(d)}</dd>`).join('')}</dl>
      <p class="pl-source">Regras da Bola 8 da Noel Snooker. Faltas: ${Object.values(FOUL_NAMES).map(f=>e(f.toLowerCase())).join('; ')}.</p>`;
  }
  function render():void {
    const v=view!;
    root.querySelector('.pl')!.setAttribute('data-phase',v.phase);
    if(!playback)adoptBalls(v);
    // A new turn of the player's: the stroke starts from the cue ball's place, the aim at the nearest legal ball.
    const mine=myTurn();
    if(mine&&aimFor!==v.shot){
      aimFor=v.shot;sentShot=-1;charge=undefined;aimFine=0;fineAt=undefined;controls.power=0;controls.spinX=0;controls.spinY=0;controls.elevation=0;
      const cue=decodeBalls(v.balls).find(b=>b.n===0);
      if(cue){placeAt={x:cue.x,y:cue.y};placeOk=true;}
      placingMode=v.placing;
      const at=decodeBalls(v.balls),targets=legalTargets(rackOf(v),v.turn,at.map(b=>b.n).filter(n=>n)),from=at.find(b=>b.n===0);
      const near=from&&at.filter(b=>targets.includes(b.n)).sort((a,b)=>Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y))[0];
      if(from&&near)aimBase=controls.angle=Math.atan2(near.y-from.y,near.x-from.x);
    }
    if(drawn&&mine&&!lastTurnMine)sounds.turn();
    lastTurnMine=mine;
    renderBoard();renderFeed();renderOverlay();renderLobby();renderControls();tickClock();renderMoney();
    if(v.phase==='lobby'&&lastPhase&&lastPhase!=='lobby'&&rematch&&mySeat()&&!mySeat()!.ready){rematch=false;hooks.send('pool.ready',{ready:true});}
    if(!q('rules').hidden)renderRules();
    lastPhase=v.phase;drawn=true;
  }

  /** The wallet and the coins in play, below; what the match is worth, on top. */
  function renderMoney():void {
    const v=view!,me=mySeat(),staked=me?.staked??0;
    q('balance').innerHTML=coins(hooks.balance()??0);q('staked').innerHTML=staked?coins(staked):'—';
    const valendo=q('valendo'),on=v.phase!=='lobby'&&v.stake>0&&v.seats.some(s=>s.staked);
    valendo.hidden=!on;if(on)valendo.innerHTML=`Valendo ${coins(v.stake)}`;
  }

  // ── Input ────────────────────────────────────────────────────────────────────────────────────────────────────
  function requestLeave():void {
    if(watching){hooks.send('pool.watch',{tableId:''});hooks.closed();return;}
    const inPlay=!!mySeat()&&!!view&&MATCH.includes(view.phase)&&view.seats.every(s=>s.playerId||s.cpu);
    if(inPlay&&!leaveArmed){leaveArmed=Date.now();controlsKey='';renderControls();return;}
    leaveArmed=0;hooks.send('pool.leave');
  }
  /** The cue ball in the quadro, where the pointer is (it fits there or it does not). */
  function moveCue(x:number,y:number):void {
    const at={x:clamp(x,-.95+.026,-.475),y:clamp(y,-.45+.026,.45-.026)};
    placeAt=at;placeOk=inQuadro(at.x,at.y)&&freeAt([...shown].map(([n,b])=>({n,x:b.x,y:b.y})),at.x,at.y,0);
  }
  let dragging:'aim'|'power'|'spin'|'place'|undefined,downAt:{x:number;y:number;t:number}|undefined;
  canvas.addEventListener('pointermove',event=>{
    if(!myTurn()||playback)return;
    const at=renderer.tableAt(event.clientX,event.clientY);
    if(placingMode){if(event.pointerType!=='touch'||event.buttons)moveCue(at.x,at.y);return;}
    if(event.pointerType==='touch'&&!event.buttons)return;
    // Held down, the aim stays put: only the power moves.
    if(charge)return;
    // A real move of the mouse aims anew (the wheel's fine turn is dropped); a twitch keeps it.
    if(fineAt&&Math.hypot(event.clientX-fineAt.x,event.clientY-fineAt.y)>24){aimFine=0;fineAt=undefined;}
    const cue=spots().find(b=>b.n===0);if(cue&&Math.hypot(at.x-cue.x,at.y-cue.y)>.01)aimBase=Math.atan2(at.y-cue.y,at.x-cue.x);
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!myTurn()||playback)return;
    sounds.unlock();event.preventDefault();downAt={x:event.clientX,y:event.clientY,t:performance.now()};
    if(event.pointerType==='touch'){canvas.setPointerCapture(event.pointerId);dragging=placingMode?'place':'aim';const at=renderer.tableAt(event.clientX,event.clientY);if(placingMode)moveCue(at.x,at.y);return;}
    // The right button while charging calls the stroke off.
    if(event.button===2){if(charge)cancelCharge();return;}
    // The left button, aiming: hold to fill the power (the release strikes, even off the table: the pointer is captured).
    if(event.button===0&&!placingMode){canvas.setPointerCapture(event.pointerId);startCharge();}
  });
  canvas.addEventListener('pointerup',event=>{
    if(!myTurn()||playback||!downAt)return;
    const tap=Math.hypot(event.clientX-downAt.x,event.clientY-downAt.y)<6;downAt=undefined;dragging=undefined;
    if(event.pointerType==='touch'||event.button!==0)return;
    if(charge){releaseCharge();return;}
    // On the break, a click puts the cue ball down where it fits.
    if(placingMode&&tap){if(placeOk){placingMode=false;controlsKey='';renderControls();}else hooks.notify('A branca não cabe aí: encostaria em outra bola.',true);}
  });
  canvas.addEventListener('pointercancel',()=>cancelCharge());
  // With the left button already down, the right one sends no pointerdown of its own (chorded buttons): its mousedown does.
  canvas.addEventListener('mousedown',event=>{if(event.button===2&&charge){event.preventDefault();cancelCharge();}});
  canvas.addEventListener('wheel',event=>{if(!myTurn()||charge)return;event.preventDefault();aimFine+=Math.sign(event.deltaY)*(event.shiftKey?.01:.0018);fineAt={x:event.clientX,y:event.clientY};},{passive:false});
  canvas.addEventListener('contextmenu',event=>{event.preventDefault();if(charge)cancelCharge();});
  /** The spin ball: press and drag where the tip strikes. */
  function slide(event:PointerEvent,el:HTMLElement):void {
    const rect=el.getBoundingClientRect();
    setSpin(((event.clientX-rect.left)/rect.width-.5)*2,-((event.clientY-rect.top)/rect.height-.5)*2);
    updateMeters();
  }
  root.addEventListener('pointerdown',event=>{
    const target=event.target as HTMLElement;
    // On a touch screen, the hold button charges like the left button.
    const hold=target.closest<HTMLButtonElement>('[data-pl-hold]');
    if(hold&&!hold.disabled){event.preventDefault();hold.setPointerCapture(event.pointerId);startCharge();return;}
    const el=target.closest<HTMLElement>('[data-pl="spin"]');
    if(!el||!myTurn())return;
    event.preventDefault();el.setPointerCapture(event.pointerId);dragging='spin';slide(event,el);
  });
  root.addEventListener('pointermove',event=>{
    if(dragging!=='spin')return;
    const el=root.querySelector<HTMLElement>('[data-pl="spin"]');if(el)slide(event,el);
  });
  root.addEventListener('pointerup',event=>{
    if((event.target as HTMLElement).closest('[data-pl-hold]')&&charge){releaseCharge();return;}
    if(dragging==='spin')dragging=undefined;
  });
  root.addEventListener('dblclick',event=>{if((event.target as HTMLElement).closest('[data-pl="spin"]')){setSpin(0,0);updateMeters();}});
  root.addEventListener('input',event=>{const el=event.target as HTMLInputElement;if(el.dataset.pl==='elevation'){controls.elevation=Number(el.value);updateMeters();}});
  root.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if(!button||button.disabled||!view)return;
    sounds.unlock();
    const tool=button.dataset.plTool;
    if(button.dataset.plSeat!==undefined){const seat=Number(button.dataset.plSeat);if(mySeat())hooks.send('pool.seat',{seat});else hooks.send('pool.join',{tableId:view.id,seat});return;}
    if(button.dataset.plCpu){hooks.send('pool.cpu',{on:button.dataset.plCpu==='on'});return;}
    if(button.dataset.plLevel){hooks.send('pool.config',{level:button.dataset.plLevel as PoolLevel});return;}
    if(button.dataset.plStake){hooks.send('pool.config',{stake:Number(button.dataset.plStake)});return;}
    if(button.dataset.plReady){hooks.send('pool.ready',{ready:button.dataset.plReady==='true'});return;}
    if(button.dataset.plChoice){hooks.send('pool.choice',{choice:button.dataset.plChoice});return;}
    if(button.dataset.plRematch!==undefined){rematch=!rematch;overlayKey='';renderOverlay();return;}
    if(button.dataset.plPlace!==undefined){if(placingMode&&!placeOk){hooks.notify('A branca não cabe aí.',true);return;}placingMode=!placingMode;controlsKey='';renderControls();return;}
    if(tool==='rules'){const rules=q('rules');rules.hidden=!rules.hidden;button.setAttribute('aria-expanded',String(!rules.hidden));if(!rules.hidden)renderRules();return;}
    if(tool==='sound'){
      sounds.enabled=!sounds.enabled;try{localStorage.setItem(SOUND_KEY,sounds.enabled?'on':'off');}catch{}
      button.setAttribute('aria-pressed',String(sounds.enabled));button.innerHTML=uiIcon(sounds.enabled?'volume':'volumeOff');return;
    }
    if(tool==='leave'){requestLeave();return;}
    if(tool==='leave-confirm'){leaveArmed=0;hooks.send('pool.leave');return;}
    if(tool==='leave-cancel'){leaveArmed=0;controlsKey='';renderControls();}
  });
  const typing=()=>{const el=document.activeElement as HTMLElement|null;return !!el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)&&(el as HTMLInputElement).type!=='range'||el.isContentEditable);};
  // Keys while at the table: they never reach the bar behind it.
  const keydown=(event:KeyboardEvent)=>{
    if(!view||root.classList.contains('hidden')||typing()||event.ctrlKey||event.metaKey||event.altKey)return;
    const code=event.code;let used=true;
    const choosing=view.phase==='choice'&&view.choice&&view.seats[view.choice.seat]?.playerId===selfId&&!watching;
    if(code==='KeyE'&&!event.repeat)requestLeave();
    else if(code==='Escape'&&charge)cancelCharge();
    else if(code==='Escape'&&!q('rules').hidden)q('rules').hidden=true;
    else if(choosing&&(code==='Digit1'||code==='Digit2'||code==='Numpad1'||code==='Numpad2')){
      const first=code.endsWith('1');hooks.send('pool.choice',{choice:view.choice!.kind==='toss'?(first?'break':'pass'):(first?'spot':'rerack')});
    }
    else if(!myTurn())used=false;
    else if(code==='KeyR'){setSpin(0,0);updateMeters();}
    else if(code==='KeyM'&&view.placing){if(placingMode&&!placeOk)hooks.notify('A branca não cabe aí.',true);else{placingMode=!placingMode;controlsKey='';renderControls();}}
    else if([...KEYS_LEFT,...KEYS_RIGHT,'KeyZ','KeyX','ShiftLeft','ShiftRight',...Object.keys(SPIN_KEYS)].includes(code))keys.add(code);
    else used=false;
    if(used){event.preventDefault();event.stopPropagation();}
  };
  const keyup=(event:KeyboardEvent)=>{keys.delete(event.code);};
  document.addEventListener('keydown',keydown,true);document.addEventListener('keyup',keyup,true);
  const blur=()=>{keys=new Set();dragging=undefined;cancelCharge();};
  window.addEventListener('blur',blur);
  const ticker=setInterval(()=>{if(view&&!root.classList.contains('hidden')){tickClock();if(leaveArmed&&Date.now()-leaveArmed>6000){leaveArmed=0;controlsKey='';renderControls();}}},250);
  raf=requestAnimationFrame(loop);

  return {
    /** The room's view of the table, who looks at it, and whether they only watch. */
    update(next:PoolTableView,self:string,onlyWatching:boolean):void {
      // The world redraws many times a second: the same view again changes nothing (and redrawing it made the top blink).
      if(next===view&&self===selfId&&onlyWatching===watching)return;
      if(view&&view.id!==next.id){playback=undefined;shown.clear();rackShown=-1;lastFeed=0;}
      view=next;selfId=self;watching=onlyWatching;render();
    },
    /** A stroke's recorded paths: everyone at the table watches it roll. */
    shot(shot:PoolShotView):void {startPlayback(shot);controlsKey='';if(view)renderControls();},
    /** The shooter's aim, as the room relays it. */
    aim(aim:PoolAimView):void {if(view&&aim.tableId===view.id&&!myTurn())theirs=aim;},
    /** E at the table: leaving a match in play asks first. */
    requestLeave,
    /** The wallet changed (the stake's button and the footer depend on it). */
    refresh():void {if(view){lobbyKey='';renderLobby();renderMoney();}},
    /** The stroke as set up, for other controllers (touch layouts, a gamepad) to drive. */
    controls,
    /** Off the table: next time it opens, nothing carries over. */
    reset():void {view=undefined;playback=undefined;theirs=undefined;shown.clear();rackShown=-1;controlsKey='';overlayKey='';boardKey='';lobbyKey='';feedKey='';q('lobby').hidden=true;drawn=false;lastFeed=0;lastPhase='';rematch=false;leaveArmed=0;aimFor=-1;sentShot=-1;blur();},
    destroy():void {cancelAnimationFrame(raf);clearInterval(ticker);document.removeEventListener('keydown',keydown,true);document.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',blur);root.innerHTML='';},
  };
}
export type PoolPanel=ReturnType<typeof createPoolPanel>;
const round=(v:number,digits:number)=>Math.round(v*10**digits)/10**digits;
