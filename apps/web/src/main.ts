import './style.css';
import {nearestInteraction,DEFAULT_SKIN,SKINS,type WorldState,type PublicUser,type ChatMessage,type BlackjackTable,type Card} from '@bar/shared';
import {BarScene} from './engine/BarScene';
import {BarNetwork} from './networking';
import {api,escape as e} from './api';
import {BarAudio} from './audio';

const app=document.querySelector<HTMLDivElement>('#app')!;
const icon=(name:string)=>({people:'♙',sound:'♫',help:'?',close:'×',arrow:'↗',cards:'♠',moon:'☾'}[name]||name);
app.innerHTML=`
  <canvas id="world" aria-label="Cenário tridimensional do B.A.R."></canvas>
  <div id="labels" aria-hidden="true"></div>
  <div class="vignette"></div>
  <main id="lobby" class="lobby">
    <header class="lobby-header"><a class="wordmark" href="/" aria-label="B.A.R. início">B.A.R<span>®</span></a><span class="edition">BAR DE BUTECO<br>ABERTO PARA O IMPREVISTO</span><span class="small-tag">MULTIPLAYER SOCIAL · 3D</span></header>
    <div class="lobby-body">
      <section class="welcome"><div class="eyebrow"><i class="live-dot"></i> A NOITE COMEÇA AQUI</div><h1>Tem lugar<br>pra mais <em>um.</em></h1><p>Um balcão, boas histórias e uma dose de caos.<br>Entre, puxe uma cadeira e veja o que acontece.</p><div class="lobby-features"><span>01 <b>Encontre a galera</b></span><span>02 <b>Tente a sorte</b></span><span>03 <b>Espere o inesperado</b></span></div></section>
      <section class="entry-card" aria-label="Acesso à conta"><div class="card-kicker"><span>SEU CANTO NO BALCÃO</span><span>↙</span></div><div id="auth-content"></div><div class="card-foot"><span class="tiny-dot"></span> Sem instalação. Só chegar.</div></section>
    </div>
    <footer class="lobby-footer"><span>CONVERSA LIVRE. HISTÓRIAS NEM TANTO.</span><div><span class="key">W A S D</span> para explorar <span class="separator">/</span> <span class="key">E</span> para interagir</div><span>B.A.R. · MVP 0.1</span></footer>
  </main>
<main id="game" class="game hidden" aria-label="Interface do bar">
    <header class="game-header"><div class="bar-brand"><b>B.A.R.</b><span><i class="live-dot"></i> BAR PRINCIPAL</span></div><div class="room-meta"><span id="occupancy">— / 32</span><small>no bar</small><span class="connection-dot"></span><span id="ping">— ms</span></div><nav class="game-tools" aria-label="Ferramentas"><button data-action="people" title="Pessoas" aria-label="Pessoas no bar">${icon('people')}</button><button data-action="audio" id="audio-button" title="Ativar música" aria-label="Ativar música">♫<i class="muted-mark"></i></button><button data-action="help" title="Como jogar" aria-label="Como jogar">?</button><button data-action="admin" id="admin-button" class="hidden" title="Administração" aria-label="Administração">⚙</button><span class="tool-divider"></span><button data-action="account" class="avatar" id="avatar" title="Sua conta" aria-label="Sua conta">B</button></nav></header>
    <div id="event-banner" class="event-banner hidden" role="status"></div>
    <div id="connection" class="connection hidden" role="status"></div>
    <aside class="chat-panel"><div class="chat-heading"><span><i class="live-dot"></i> CONVERSA DE BALCÃO</span><small>por perto · 12 m</small><button data-action="chat-toggle" id="chat-toggle" aria-label="Recolher chat">−</button></div><div id="chat-body"><div id="messages" class="messages" role="log" aria-label="Mensagens por proximidade"></div><form id="chat-form"><input id="chat-input" name="message" autocomplete="off" maxlength="240" placeholder="Dê um oi… [Enter]" aria-label="Mensagem por proximidade"><button type="submit" aria-label="Enviar mensagem">↗</button></form></div></aside>
    <div id="context" class="context hidden"><kbd>E</kbd><div><small>POR AQUI</small><b id="context-label"></b></div></div>
    <div class="world-hint"><span>W A S D <small>mover</small></span><span>SHIFT <small>correr</small></span><span>ARRASTE <small>câmera</small></span><button data-action="dance">G <small>dançar</small></button><button data-action="skins">C <small>visual</small></button></div>
    <section id="blackjack" class="blackjack hidden" aria-label="Mesa de blackjack"></section>
    <div id="waiting" class="waiting hidden"><span class="spinner"></span><h2>Já estamos abrindo a porta.</h2><p id="waiting-message"></p><button data-action="leave" class="button secondary">Voltar à entrada</button></div>
  </main>
  <div id="modal" class="modal-backdrop hidden"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title"></h2><button data-action="close-modal" aria-label="Fechar janela">×</button></div><div id="modal-content"></div></section></div>
  <div id="toasts" class="toasts" role="status" aria-live="polite"></div>
  ${import.meta.env.DEV?'<button class="dev-mail" data-action="mail">✉ Caixa de e-mail local</button>':''}
`;

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
let user:PublicUser|undefined;
let world:WorldState|undefined;
let serverClockOffset=0;
const serverNow=()=>Date.now()+serverClockOffset;
let inGame=false,connected=false,authMode:'login'|'register'|'forgot'|'reset'='login';
let emailVerificationRequired=true;
let resetToken='',activeModal='',tableKey='',lastEvent='',peopleKey='',blocked=new Set<string>();
let scene:BarScene|undefined;
let lastFocus:HTMLElement|undefined;
const audio=new BarAudio();
const chatHistory:ChatMessage[]=[];
// The chosen skin is remembered per browser and sent when entering the bar.
const SKIN_KEY='bar.skin';
function savedSkin():string {try{const skin=localStorage.getItem(SKIN_KEY);if(SKINS.some(option=>option.id===skin))return skin!;}catch{/* Storage may be unavailable. */}return DEFAULT_SKIN;}

function toast(message:string,error=false):void {
  const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;$('#toasts').append(node);setTimeout(()=>node.remove(),5500);
}
function errorMessage(error:unknown):string{return error instanceof Error?error.message:'Algo deu errado. Tente novamente.';}
function setBusy(form:HTMLFormElement,busy:boolean):void {form.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=busy);}
function renderAuth(message=''):void {
  const formField=(label:string,name:string,type:string,placeholder:string,extra='')=>`<label>${label}<input name="${name}" type="${type}" placeholder="${placeholder}" required ${extra}></label>`;
  let content='';
  if(user){content=`<h2>Olha quem chegou.</h2><p class="auth-description">${e(user.displayName)}, sua cadeira está esperando.</p><div class="returning-user"><span class="profile-initial" style="--avatar:${e(user.color)}">${e(user.displayName.slice(0,1).toUpperCase())}</span><div><b>${e(user.displayName)}</b><small>${e(user.email)}</small></div></div><button data-action="enter" class="button primary full">Entrar no bar <span>↗</span></button>${!user.verified&&emailVerificationRequired?'<button data-action="resend" class="text-button full">Reenviar confirmação de e-mail</button>':''}<button data-action="logout" class="text-button full">Usar outra conta</button>`;}
  else if(authMode==='login')content=`<h2>Boa noite, vizinho.</h2><p class="auth-description">Entre na sua conta. A casa é sua.</p><div class="auth-tabs"><button class="selected" data-action="auth-login">Entrar</button><button data-action="auth-register">Criar conta</button></div><form id="auth-form" data-mode="login">${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${formField('Senha','password','password','Sua senha','autocomplete="current-password"')}<button type="button" data-action="auth-forgot" class="forgot-link">Esqueci minha senha</button><button class="button primary full" type="submit">Entrar no bar <span>↗</span></button></form>`;
  else if(authMode==='register')content=`<h2>Chega mais.</h2><p class="auth-description">Uma conta, muitas histórias pra contar.</p><div class="auth-tabs"><button data-action="auth-login">Entrar</button><button class="selected" data-action="auth-register">Criar conta</button></div><form id="auth-form" data-mode="register"><div class="field-row">${formField('Seu nome','displayName','text','Como te chamam?','autocomplete="nickname" minlength="2" maxlength="24"')}${formField('Usuário','username','text','seu_apelido','autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24"')}</div>${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${formField('Senha','password','password','Pelo menos 10 caracteres','autocomplete="new-password" minlength="10" maxlength="128"')}<button class="button primary full" type="submit">Criar minha conta <span>↗</span></button><p class="fine-print">${emailVerificationRequired?'Confirme seu e-mail para entrar no bar.':'Sua conta será ativada automaticamente. Depois, é só entrar.'}</p></form>`;
  else if(authMode==='forgot')content=`<h2>Acontece nas melhores.</h2><p class="auth-description">Vamos mandar um link para você criar uma nova senha.</p><form id="auth-form" data-mode="forgot">${formField('E-mail da conta','email','email','voce@exemplo.com','autocomplete="email"')}<button class="button primary full" type="submit">Recuperar acesso <span>↗</span></button></form><button data-action="auth-login" class="text-button full">Voltar para entrar</button>`;
  else content=`<h2>Um novo começo.</h2><p class="auth-description">Escolha uma nova senha para sua conta.</p><form id="auth-form" data-mode="reset">${formField('Nova senha','password','password','Pelo menos 10 caracteres','autocomplete="new-password" minlength="10" maxlength="128"')}<button class="button primary full" type="submit">Salvar nova senha <span>↗</span></button></form>`;
  $('#auth-content').innerHTML=content+`<div id="auth-message" class="form-message ${message?'':'hidden'}" role="status">${e(message)}</div>`;
}
function authMessage(message:string,error=false):void {const node=$('#auth-message');node.className=`form-message ${error?'error':''}`;node.textContent=message;}
function showModal(title:string,content:string,type:string):void {lastFocus=document.activeElement as HTMLElement;activeModal=type;$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#modal').classList.remove('hidden');scene?.setEnabled(false);$('.modal-header button').focus();}
function closeModal():void {activeModal='';$('#modal').classList.add('hidden');scene?.setEnabled(inGame&&connected);lastFocus?.focus();}

const network=new BarNetwork({
  input:()=>scene?.getInput()??{dx:0,dz:0,running:false,rotation:0},
  skin:savedSkin,
  position:position=>scene?.setLocal(position),
  state:state=>{world=state;serverClockOffset=state.serverTime-Date.now();scene?.setWorld(state,user!.id);renderWorld();},
  chat:message=>{chatHistory.push(message);if(chatHistory.length>100)chatHistory.shift();renderChat();},
  error:message=>toast(message,true),
  ping:ms=>{$('#ping').textContent=`${ms} ms`;},
  status:(message,isConnected)=>{
    connected=isConnected;scene?.setEnabled(inGame&&connected&&!activeModal);
    $('#waiting-message').textContent=message;
    $('#waiting').classList.toggle('hidden',isConnected||!inGame);
    $('#connection').textContent=message;
    $('#connection').classList.toggle('hidden',isConnected||!inGame);
    if(isConnected){toast('Chegou! Fique à vontade.');$('#avatar').textContent=user?.displayName.slice(0,1).toUpperCase()||'B';}
  }
});

async function enterBar():Promise<void> {
  if(inGame)return;
  if(!scene){toast('Seu navegador não conseguiu iniciar o cenário 3D. Ative a aceleração gráfica e recarregue.',true);return;}
  inGame=true;$('#lobby').classList.add('hidden');$('#game').classList.remove('hidden');$('#admin-button').classList.toggle('hidden',user?.role!=='admin');
  try{const result=await api<{blocked:string[]}>('/blocks');blocked=new Set(result.blocked);await network.connect();}
  catch(error){await leaveBar();toast(errorMessage(error),true);}
}
async function leaveBar():Promise<void> {
  inGame=false;connected=false;await network.disconnect();world=undefined;chatHistory.length=0;renderChat();scene?.setEnabled(false);scene?.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:0},'');
  $('#labels').replaceChildren();$('#game').classList.add('hidden');$('#lobby').classList.remove('hidden');$('#blackjack').classList.add('hidden');tableKey='';lastEvent='';audio.setParty(false);closeModal();renderAuth();
}
function renderChat():void {
  const messages=$('#messages');const atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<50;
  messages.innerHTML='<div class="chat-welcome">A conversa só chega a quem está por perto.<br>Uma boa noite começa com um oi.</div>'+chatHistory.filter(m=>!blocked.has(m.playerId)).map(m=>`<div class="chat-line ${m.system?'system':''}"><b>${e(m.displayName)}</b><span>${e(m.text)}</span></div>`).join('');
  if(atBottom)messages.scrollTop=messages.scrollHeight;
}
function renderWorld():void {
  if(!world||!user)return;
  $('#occupancy').textContent=`${world.occupancy} / ${world.capacity}`;
  const self=world.players[user.id];
  const interaction=self?nearestInteraction(self):undefined;
  const context=$('#context');
  context.classList.toggle('hidden',!self||(!self.interactionState&&!self.currentTableId&&!interaction));
  $('#context-label').textContent=self?.currentTableId?'Levantar da mesa':self?.interactionState?'Levantar / encerrar':interaction?.label||'';
  const event=world.event;
  const eventName={BLACKOUT:'Quem esqueceu de pagar a luz?',DRUNK_NPC:'O Zé acordou inspirado.',PARTY:'Essa rodada é de dança!'};
  if(event?.type&&event.id!==lastEvent){lastEvent=event.id;toast(eventName[event.type]);audio.setParty(event.type==='PARTY');}
  $('#event-banner').classList.toggle('hidden',!event?.type);
  if(event?.type)$('#event-banner').innerHTML=`<span class="event-spark">✳</span><div><small>ACONTECEU NO B.A.R.</small><b>${eventName[event.type]}</b></div><span class="event-time">${Math.max(0,Math.ceil((event.startedAt+event.durationMs-serverNow())/1000))}s</span>`;
  else audio.setParty(false);
  const table=self?.currentTableId?world.tables[self.currentTableId]:undefined;
  $('#blackjack').classList.toggle('hidden',!table);
  if(table){const key=JSON.stringify(table);if(key!==tableKey){tableKey=key;renderBlackjack(table);}}
  else tableKey='';
  if(activeModal==='people')renderPeopleContent();
}
function cardMarkup(card:Card):string {
  const symbols:Record<string,string>={hearts:'♥',diamonds:'♦',clubs:'♣',spades:'♠',H:'♥',D:'♦',C:'♣',S:'♠','♥':'♥','♦':'♦','♣':'♣','♠':'♠',h:'♥',d:'♦',c:'♣',s:'♠'};
  if(card.rank==='?')return '<div class="playing-card face-down" aria-label="Carta oculta">B.</div>';
  const suit=symbols[card.suit]||card.suit;
  return `<div class="playing-card ${['♥','♦'].includes(suit)?'red':''}" aria-label="${e(card.rank)} ${e(suit)}"><b>${e(card.rank)}</b><span>${e(suit)}</span></div>`;
}
function renderBlackjack(table:BlackjackTable):void {
  const me=table.seats.find(seat=>seat.playerId===user?.id),myTurn=table.turnPlayerId===user?.id;
  const phases={waiting:'Puxe uma cadeira',playing:myTurn?'Sua vez de jogar':'Uma carta pode mudar tudo',dealer:'A vez da casa',results:'A rodada fechou'};
  const resultNames:Record<string,string>={win:'Você ganhou!',loss:'Deu casa.',draw:'Empate!',blackjack:'Blackjack!',bust:'Estourou',stand:'Parou',playing:'Jogando',turn:'Sua vez',finished:'Rodada encerrada',waiting:'Pronto'};
  $('#blackjack').innerHTML=`<div class="blackjack-heading"><span>♠ MESA 01</span><button data-action="table-leave" aria-label="Sair da mesa">×</button></div><h2>${phases[table.phase]}</h2><div class="dealer-row"><div><small>DEALER</small><b>${table.dealerTotal||'—'}</b></div><div class="cards">${table.dealerCards.map(cardMarkup).join('')||'<span class="empty-cards">Aguardando a próxima rodada</span>'}</div></div><div class="table-seats">${table.seats.map(seat=>`<div class="table-seat ${seat.playerId===table.turnPlayerId?'active':''} ${seat.playerId===user?.id?'you':''}"><div class="seat-name"><b>${e(seat.playerId===user?.id?'Você':seat.displayName)}</b><span>${seat.total||'—'}</span></div><div class="cards small">${seat.cards.map(cardMarkup).join('')}</div><small>${e(resultNames[seat.result]||resultNames[seat.status]||seat.status)}</small></div>`).join('')}</div><div class="table-actions">${table.phase==='waiting'||table.phase==='results'?`<button class="button primary" data-action="table-start">${table.phase==='results'?'Nova rodada':'Começar rodada'} ↗</button>`:`<button class="button primary" data-action="hit" ${!myTurn?'disabled':''}>Comprar carta</button><button class="button secondary" data-action="stand" ${!myTurn?'disabled':''}>Parar</button>`}</div><div class="table-footer"><span>${table.phase==='results'?e(resultNames[me?.result||'']||'Rodada concluída'):'Sem apostas. Só pela resenha.'}</span><span id="turn-timer">${table.deadline?Math.max(0,Math.ceil((table.deadline-serverNow())/1000))+'s':''}</span></div>`;
}
function interact():void {
  if(!connected||!world||!user||activeModal)return;
  const self=world.players[user.id];if(!self)return;
  if(self.currentTableId){network.send('blackjack.leave');return;}
  if(self.interactionState){network.send('player.interact',{objectId:'stand'});return;}
  const object=nearestInteraction(self);if(!object)return;
  if(object.type==='blackjack')network.send('blackjack.join',{tableId:object.id});else network.send('player.interact',{objectId:object.id});
}
function people():void {showModal('Quem está por perto','', 'people');renderPeopleContent();}
function renderPeopleContent():void {
  const players=Object.values(world?.players||{}).filter(player=>player.id!==user?.id);
  const key=JSON.stringify([world?.occupancy,...players.map(p=>[p.id,p.displayName,p.connected,blocked.has(p.id)])]);
  if(key===peopleKey)return;peopleKey=key;
  $('#modal-content').innerHTML=`<p class="modal-description">Você vê as pessoas próximas a você. O bar tem ${world?.occupancy||0} frequentador(es) agora.</p><div class="people-list">${players.map(player=>`<div class="person"><span class="profile-initial" style="--avatar:${e(player.color)}">${e(player.displayName[0])}</span><div><b>${e(player.displayName)}</b><small>${player.connected?'No bar':'Reconectando…'}</small></div><button class="mini-button" data-action="block" data-id="${e(player.id)}">${blocked.has(player.id)?'Desbloquear':'Bloquear'}</button><button class="mini-button" data-action="report" data-id="${e(player.id)}">Denunciar</button></div>`).join('')||'<div class="empty-state">Por enquanto, só você por aqui.<br>Abra outra janela e convide alguém para chegar.</div>'}</div><p class="fine-print">Bloquear oculta mensagens de chat. Denúncias são encaminhadas à administração.</p>`;
}
async function account():Promise<void> {
  showModal('Seu lugar no B.A.R.',`<div class="account-card"><span class="profile-initial" style="--avatar:${e(user?.color)}">${e(user?.displayName[0])}</span><h3>${e(user?.displayName)}</h3><p>${e(user?.email)}</p></div><div id="statistics" class="statistics">Carregando suas rodadas…</div><button class="button secondary full" data-action="leave">Voltar à entrada</button><button class="text-button full" data-action="logout">Sair da conta</button>`,'account');
  try{const stats=await api<{gamesPlayed:number;wins:number;losses:number;draws:number}>('/stats');if(activeModal==='account')$('#statistics').innerHTML=`<div><b>${stats.gamesPlayed}</b><span>rodadas</span></div><div><b>${stats.wins}</b><span>vitórias</span></div><div><b>${stats.draws}</b><span>empates</span></div><div><b>${stats.losses}</b><span>derrotas</span></div>`;}catch(error){toast(errorMessage(error),true);}
}
async function mailbox():Promise<void> {
  if(!import.meta.env.DEV)return;
  showModal('Caixa de e-mail local','<p>Carregando mensagens…</p>','mail');
  try{
    const {messages}=await api<{messages:Array<{id:string;to:string;subject:string;text:string;createdAt:string}>}>('/dev/mail');
    if(activeModal!=='mail')return;
    $('#modal-content').innerHTML=`<p class="modal-description">Ambiente de desenvolvimento. Os e-mails deste computador aparecem aqui.</p>${messages.slice().reverse().map(message=>{
      const link=message.text.match(/https?:\/\/[^\s<>]+/)?.[0];
      let token='',action='';if(link){try{const parsed=new URL(link);if(parsed.searchParams.has('verify')){token=parsed.searchParams.get('verify')!;action='verify-mail';}else if(parsed.searchParams.has('reset')){token=parsed.searchParams.get('reset')!;action='reset-mail';}}catch{}}
      return `<article class="mail-message"><small>${e(message.to)}</small><h3>${e(message.subject)}</h3><p>${e(message.text)}</p>${action?`<button class="button primary" data-action="${action}" data-token="${e(token)}">${action==='verify-mail'?'Confirmar e-mail':'Criar nova senha'} ↗</button>`:''}</article>`;
    }).join('')||'<p>Nenhuma mensagem ainda.</p>'}`;
  }catch(error){$('#modal-content').textContent=errorMessage(error);}
}
async function admin():Promise<void> {
  showModal('Administração do bar','<p>Carregando…</p>','admin');
  try{
    const data=await api<{users:Array<{id:string;displayName:string;email:string;role:string;banned:boolean}>;reports:Array<Record<string,unknown>>;logs:Array<Record<string,unknown>>}>('/admin/overview');
    if(activeModal!=='admin')return;
    $('#modal-content').innerHTML=`<h3>Dar uma agitada</h3><div class="admin-events"><button class="mini-button" data-action="event" data-type="BLACKOUT">☾ Apagão</button><button class="mini-button" data-action="event" data-type="DRUNK_NPC">♙ O inconveniente</button><button class="mini-button" data-action="event" data-type="PARTY">♫ Festa</button></div><h3>Frequentadores</h3><div class="admin-users">${data.users.map(person=>`<div class="admin-person"><div><b>${e(person.displayName)}</b><small>${e(person.email)} ${person.role==='admin'?'· admin':''}</small></div>${person.id!==user?.id?`<button class="mini-button" data-action="moderate" data-type="kick" data-id="${e(person.id)}">Expulsar</button><button class="mini-button" data-action="moderate" data-type="${person.banned?'unban':'ban'}" data-id="${e(person.id)}">${person.banned?'Desbanir':'Banir'}</button>`:''}</div>`).join('')}</div><h3>Denúncias (${data.reports.length})</h3><div class="audit-list">${data.reports.slice(0,20).map(report=>`<p>${e(JSON.stringify(report))}</p>`).join('')||'<p>Nenhuma denúncia.</p>'}</div><h3>Registro de ações</h3><div class="audit-list">${data.logs.slice(0,20).map(log=>`<p>${e(JSON.stringify(log))}</p>`).join('')||'<p>Nenhuma ação registrada.</p>'}</div><button class="text-button" data-action="admin">Atualizar painel</button>`;
  }catch(error){$('#modal-content').textContent=errorMessage(error);}
}
function skins():void {
  scene?.preloadSkins();
  const current=world?.players[user?.id||'']?.skin||savedSkin();
  showModal('Escolha seu visual',`<p class="modal-description">A troca é na hora, e todo mundo no bar vê. Aperte C para abrir ou fechar.</p><div class="skin-grid">${SKINS.map(skin=>`<button class="skin-card ${skin.id===current?'selected':''}" data-action="skin" data-skin="${skin.id}" aria-pressed="${skin.id===current}"><img src="${import.meta.env.BASE_URL}skins/${skin.id}.jpg" alt="" width="240" height="320"><b>${e(skin.name)}</b><small>${skin.id===current?'Em uso':'Vestir'}</small></button>`).join('')}</div>`,'skins');
}
function wearSkin(id:string):void {
  const skin=SKINS.find(option=>option.id===id);if(!skin)return;
  network.send('player.skin',{skin:skin.id});
  try{localStorage.setItem(SKIN_KEY,skin.id);}catch{/* Still worn for this visit. */}
  closeModal();toast(`Visual trocado: ${skin.name}.`);
}
function help():void {showModal('Como é que funciona?',`<p class="modal-description">Não tem missão. A ideia é estar aqui.</p><div class="help-grid"><kbd>W A S D</kbd><span>Caminhar pelo bar</span><kbd>SHIFT</kbd><span>Correr</span><kbd>MOUSE</kbd><span>Arraste para olhar. Role para aproximar.</span><kbd>E</kbd><span>Sentar, pedir bebida, usar a jukebox ou entrar na mesa</span><kbd>G</kbd><span>Dançar ou parar de dançar</span><kbd>C</kbd><span>Trocar o visual do seu personagem</span><kbd>ENTER</kbd><span>Conversar com quem está a até 12 metros</span><kbd>ESC</kbd><span>Fechar uma janela</span></div><h3>Blackjack, do jeito da casa</h3><p>Chegue perto da mesa, aperte E e inicie uma rodada. Chegue o mais perto possível de 21 sem passar. O ás vale 1 ou 11; figuras valem 10. Compre uma carta ou pare. O dealer para em 17, inclusive com ás. Até quatro pessoas jogam juntas, sem dinheiro ou apostas.</p><h3>Aqui pode acontecer de tudo</h3><p>Apagões, festa e um frequentador inconveniente aparecem durante a noite. Sua partida continua valendo.</p>`,'help');}

app.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');if(!button)return;
  const action=button.dataset.action!;
  void (async()=>{
    if(action.startsWith('auth-')){authMode=action.slice(5) as typeof authMode;renderAuth();return;}
    switch(action){
      case 'enter':await enterBar();break;
      case 'resend':await api('/auth/resend',{email:user?.email});authMessage('Enviamos um novo link de confirmação para seu e-mail.');break;
      case 'leave':await leaveBar();break;
      case 'logout':await leaveBar();await api('/auth/logout',{});user=undefined;renderAuth();break;
      case 'people':people();break;
      case 'account':await account();break;
      case 'help':help();break;
      case 'skins':skins();break;
      case 'skin':wearSkin(button.dataset.skin!);break;
      case 'audio':{const on=audio.toggle();$('#audio-button').classList.toggle('sound-on',on);$('#audio-button').setAttribute('aria-label',on?'Silenciar música':'Ativar música');toast(on?'Som da casa ligado.':'Som da casa desligado.');break;}
      case 'dance':network.send('player.emote',{emote:world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'});break;
      case 'close-modal':closeModal();break;
      case 'chat-toggle':$('#chat-body').classList.toggle('hidden');$('#chat-toggle').textContent=$('#chat-body').classList.contains('hidden')?'+':'−';break;
      case 'table-leave':network.send('blackjack.leave');break;
      case 'table-start':network.send('blackjack.start',{tableId:world?.players[user!.id]?.currentTableId});break;
      case 'hit':case 'stand':network.send('blackjack.action',{action});break;
      case 'block':{const id=button.dataset.id!;if(blocked.has(id)){await api(`/blocks/${encodeURIComponent(id)}`,undefined,'DELETE');blocked.delete(id);}else{await api('/blocks',{playerId:id});blocked.add(id);}renderPeopleContent();renderChat();break;}
      case 'report':showModal('Denunciar jogador',`<p class="modal-description">Conte o que aconteceu. Sua denúncia será revisada pela administração.</p><form id="report-form" data-id="${e(button.dataset.id)}"><label>Motivo<textarea name="reason" required minlength="5" maxlength="500" placeholder="Descreva a situação"></textarea></label><button class="button primary" type="submit">Enviar denúncia</button></form>`,'report');break;
      case 'mail':await mailbox();break;
      case 'verify-mail':await api('/auth/verify',{token:button.dataset.token});closeModal();authMode='login';renderAuth('E-mail confirmado! Entre para conhecer o bar.');break;
      case 'reset-mail':resetToken=button.dataset.token!;await leaveBar();user=undefined;authMode='reset';renderAuth();break;
      case 'admin':await admin();break;
      case 'event':await api('/admin/action',{action:'event',eventType:button.dataset.type});toast('Evento solicitado. O bar vai reagir em instantes.');break;
      case 'moderate':showModal('Registrar ação de moderação',`<form id="moderation-form" data-id="${e(button.dataset.id)}" data-type="${e(button.dataset.type)}"><label>Motivo da ação<textarea name="reason" required minlength="3" maxlength="500" placeholder="Motivo registrado no histórico"></textarea></label><button class="button primary" type="submit">Confirmar ${button.dataset.type==='kick'?'expulsão':button.dataset.type==='ban'?'banimento':'remoção do banimento'}</button></form>`,'moderate');break;
    }
  })().catch(error=>toast(errorMessage(error),true));
});
app.addEventListener('submit',event=>{
  const form=event.target as HTMLFormElement;event.preventDefault();
  const data=Object.fromEntries(new FormData(form).entries()) as Record<string,string>;
  void(async()=>{
    setBusy(form,true);
    try{
      if(form.id==='auth-form'){
        if(authMode==='login'){const result=await api<{user:PublicUser}>('/auth/login',data);user=result.user;renderAuth();if(user.verified)await enterBar();else authMessage(emailVerificationRequired?'Confirme seu e-mail antes de entrar. Você pode pedir um novo link abaixo.':'Sua conta ainda precisa ser ativada. Entre novamente após a ativação.');}
        else if(authMode==='register'){const result=await api<{message:string;verificationRequired:boolean}>('/auth/register',data);emailVerificationRequired=result.verificationRequired;authMode='login';renderAuth(result.message);$<HTMLInputElement>('#auth-form input[name="email"]').value=data.email;$<HTMLInputElement>('#auth-form input[name="password"]').focus();}
        else if(authMode==='forgot'){await api('/auth/forgot',data);authMessage('Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');}
        else {await api('/auth/reset',{token:resetToken,password:data.password});authMode='login';history.replaceState({},'',location.pathname);renderAuth('Senha atualizada. Entre novamente.');}
      }else if(form.id==='chat-form'){
        const input=$<HTMLInputElement>('#chat-input');const text=input.value.trim();if(text){network.send('chat.send',{text});input.value='';}input.blur();
      }else if(form.id==='report-form'){await api('/reports',{playerId:form.dataset.id,reason:data.reason});closeModal();toast('Denúncia registrada. Obrigado por avisar.');}
      else if(form.id==='moderation-form'){await api('/admin/action',{action:form.dataset.type,playerId:form.dataset.id,reason:data.reason});await admin();toast('Ação de moderação registrada.');}
    }catch(error){if(form.id==='auth-form')authMessage(errorMessage(error),true);else toast(errorMessage(error),true);}
    finally{setBusy(form,false);}
  })();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeModal();document.activeElement instanceof HTMLElement&&document.activeElement.blur();}
  // Closing must not reach the scene's own C handler on window, which would reopen the selector.
  if(event.code==='KeyC'&&!event.repeat&&activeModal==='skins'){event.preventDefault();event.stopPropagation();closeModal();}
  if(event.key==='Tab'&&activeModal){const focusable=Array.from($('#modal').querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,a[href]'));const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  if(event.key==='Enter'&&inGame&&!activeModal&&!['INPUT','TEXTAREA','BUTTON'].includes((document.activeElement as HTMLElement)?.tagName)){event.preventDefault();$('#chat-body').classList.remove('hidden');$('#chat-input').focus();}
});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal'))closeModal();});
renderAuth();renderChat();

async function start():Promise<void>{
  try{const config=await api<{emailVerificationRequired:boolean}>('/auth/config');emailVerificationRequired=config.emailVerificationRequired;renderAuth();}catch{/* The server still enforces its verification policy. */}
  try{scene=new BarScene($<HTMLCanvasElement>('#world'));scene.onInteract=interact;scene.onEmote=()=>network.send('player.emote',{emote:world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'});scene.onChat=()=>{if(inGame&&!activeModal)$('#chat-input').focus();};scene.onSkins=()=>{if(inGame&&!activeModal)skins();};scene.setEnabled(false);}
  catch(error){console.error(error);toast('Não foi possível iniciar o 3D. Verifique a aceleração gráfica do navegador.',true);}
  const params=new URLSearchParams(location.search);
  if(params.has('verify')){try{await api('/auth/verify',{token:params.get('verify')});renderAuth('E-mail confirmado! Agora é só entrar.');}catch(error){authMessage(errorMessage(error),true);}history.replaceState({},'',location.pathname);}
  if(params.has('reset')){resetToken=params.get('reset')!;authMode='reset';renderAuth();return;}
  try{const result=await api<{user:PublicUser}>('/auth/me');user=result.user;renderAuth();}catch{/* No active session: show login. */}
}
void start();
// Development telemetry exposes copies only, never a way to command the server.
if(import.meta.env.DEV)Object.defineProperty(window,'barDebug',{value:{snapshot:()=>({world:structuredClone(world),localId:user?.id}),performance:()=>scene?.getPerformance()}});
setInterval(()=>{
  if(!inGame||!scene||!world)return;
  const labels=scene.projectLabels?.()||[];
  $('#labels').innerHTML=labels.map(label=>`<span class="world-label" style="left:${label.x}px;top:${label.y}px">${e(label.name)}</span>`).join('');
  const table=world.tables[world.players[user?.id||'']?.currentTableId];
  const timer=document.querySelector('#turn-timer');if(timer&&table?.deadline)timer.textContent=`${Math.max(0,Math.ceil((table.deadline-serverNow())/1000))}s`;
},100);
