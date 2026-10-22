import {adminPanel} from './admin-panel';
import './assets/fonts/nova-ui.css';
import './nova-ui.css';
import {gameUi} from './game-ui';
import {createHudPanels} from './hud-panels';
import {createNotifications} from './notifications';
import {createLiveHud} from './live-hud';
import {nearestInteraction,INTERACTABLES,canInteract,DEFAULT_SKIN,DEFAULT_CHARACTER,SKINS,type CharacterConfig,type Wardrobe,type WorldState,type PublicUser,type ChatMessage,type BlackjackTable,type Card} from '@bar/shared';
import {characterEditor} from './character-editor';
import './character.css';
import './admin.css';
import {BarScene} from './engine/BarScene';
import {BarNetwork} from './networking';
import {api,ApiError,escape as e} from './api';
import {BarAudio} from './audio';
import {JukeboxController} from './jukebox';
import {JUKEBOX_SYSTEMS,distance} from '@bar/shared';
import './jukebox.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=gameUi();

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const hud=createHudPanels($('#game'));
const notices=createNotifications($('#toasts'));
const liveHud=createLiveHud($('#game'));
let previousAction='',previousResult='';
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
let editor:ReturnType<typeof characterEditor>|undefined;
let administration:ReturnType<typeof adminPanel>|undefined;
let refreshingAdministration=false;
let wardrobe:Wardrobe|undefined;
let modalGeneration=0;
let watchingTv=false;
const jukebox=new JukeboxController({send:(type,payload)=>network.send(type,payload),now:serverNow,
  project:id=>{
    if(activeModal)return null;const points=scene?.televisionProjection(id);if(!points)return null;
    if(!watchingTv){
      const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
      if([...document.querySelectorAll<HTMLElement>('#game .hud-panel,#game .game-header,#blackjack:not(.hidden)')].some(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&rect.left<right&&rect.right>left&&rect.top<bottom&&rect.bottom>top;}))return null;
    }
    return points;
  },
  screen:(id,visible)=>scene?.showTelevision(id,visible),notice:toast,ambient:value=>audio.setSuppressed(value)});
const tvBack=document.createElement('button');tvBack.id='leave-tv';tvBack.className='button secondary';tvBack.textContent='Voltar ao jogo · Esc';tvBack.hidden=true;tvBack.onclick=()=>stopWatchingTv();app.append(tvBack);
function stopWatchingTv():void {watchingTv=false;document.body.classList.remove('watching-tv');tvBack.hidden=true;scene?.watchTelevision();scene?.setEnabled(inGame&&connected&&!activeModal);}
function openJukebox(id:string):void {
  if(!inGame||!connected||!world?.jukeboxes?.[id])return;
  stopWatchingTv();showModal('JUKEBOX',jukebox.panelHtml(id),'jukebox');jukebox.attachPanel($('#modal-content'));
}
function savedSkin():string {return user?.equippedSkin??DEFAULT_SKIN;}

function toast(message:string,error=false):void {notices.show({variant:error?'aviso':'acao',title:error?'Não foi possível':'No Boteco',text:message});}
function errorMessage(error:unknown):string{return error instanceof Error?error.message:'Algo deu errado. Tente novamente.';}
function setBusy(form:HTMLFormElement,busy:boolean):void {form.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=busy);}
function renderAuth(message=''):void {
  const formField=(label:string,name:string,type:string,placeholder:string,extra='')=>`<label>${label}<input name="${name}" type="${type}" placeholder="${placeholder}" required ${extra}></label>`;
  let content='';
  if(user){content=`<h2>Olha quem chegou.</h2><p class="auth-description">${e(user.displayName)}, sua cadeira está esperando.</p><div class="returning-user"><span class="profile-initial" style="--avatar:${e(user.color)}">${e(user.displayName.slice(0,1).toUpperCase())}</span><div><b>${e(user.displayName)}</b><small>${e(user.email)}</small></div></div><button data-action="enter" class="button primary full">${user.character?'Entrar no bar':'Criar meu personagem'} <span>↗</span></button>${!user.verified&&emailVerificationRequired?'<button data-action="resend" class="text-button full">Reenviar confirmação de e-mail</button>':''}<button data-action="logout" class="text-button full">Usar outra conta</button>`;}
  else if(authMode==='login')content=`<h2>Boa noite, vizinho.</h2><p class="auth-description">Entre na sua conta. A casa é sua.</p><div class="auth-tabs"><button class="selected" data-action="auth-login">Entrar</button><button data-action="auth-register">Criar conta</button></div><form id="auth-form" data-mode="login">${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${formField('Senha','password','password','Sua senha','autocomplete="current-password"')}<button type="button" data-action="auth-forgot" class="forgot-link">Esqueci minha senha</button><button class="button primary full" type="submit">Entrar no bar <span>↗</span></button></form>`;
  else if(authMode==='register')content=`<h2>Chega mais.</h2><p class="auth-description">Uma conta, muitas histórias pra contar.</p><div class="auth-tabs"><button data-action="auth-login">Entrar</button><button class="selected" data-action="auth-register">Criar conta</button></div><form id="auth-form" data-mode="register"><div class="field-row">${formField('Seu nome','displayName','text','Como te chamam?','autocomplete="nickname" minlength="2" maxlength="24"')}${formField('Usuário','username','text','seu_apelido','autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24"')}</div>${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${formField('Senha','password','password','Pelo menos 10 caracteres','autocomplete="new-password" minlength="10" maxlength="128"')}<button class="button primary full" type="submit">Criar minha conta <span>↗</span></button><p class="fine-print">${emailVerificationRequired?'Confirme seu e-mail para entrar no bar.':'Sua conta será ativada automaticamente. Depois, é só entrar.'}</p></form>`;
  else if(authMode==='forgot')content=`<h2>Acontece nas melhores.</h2><p class="auth-description">Vamos mandar um link para você criar uma nova senha.</p><form id="auth-form" data-mode="forgot">${formField('E-mail da conta','email','email','voce@exemplo.com','autocomplete="email"')}<button class="button primary full" type="submit">Recuperar acesso <span>↗</span></button></form><button data-action="auth-login" class="text-button full">Voltar para entrar</button>`;
  else content=`<h2>Um novo começo.</h2><p class="auth-description">Escolha uma nova senha para sua conta.</p><form id="auth-form" data-mode="reset">${formField('Nova senha','password','password','Pelo menos 10 caracteres','autocomplete="new-password" minlength="10" maxlength="128"')}<button class="button primary full" type="submit">Salvar nova senha <span>↗</span></button></form>`;
  $('#auth-content').innerHTML=content+`<div id="auth-message" class="form-message ${message?'':'hidden'}" role="status">${e(message)}</div>`;
}
function authMessage(message:string,error=false):void {const node=$('#auth-message');node.className=`form-message ${error?'error':''}`;node.textContent=message;}
function setChatOpen(open:boolean):void {if(open)hud.open('chat');else hud.collapse('chat',true);}
function focusChat():void {setChatOpen(true);$('#chat-input').focus();}
function showModal(title:string,content:string,type:string):void {modalGeneration++;jukebox.detachPanel();if(watchingTv)stopWatchingTv();editor?.destroy();editor=undefined;administration?.destroy();administration=undefined;lastFocus=document.activeElement as HTMLElement;activeModal=type;$('.modal').classList.toggle('character-modal',type==='character');$('.modal').classList.toggle('admin-modal',type==='admin');$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#modal').classList.remove('hidden');scene?.setEnabled(false);$('.modal-header button').focus();}
function closeModal():void {modalGeneration++;jukebox.detachPanel();editor?.destroy();editor=undefined;administration?.destroy();administration=undefined;activeModal='';$('#modal').classList.add('hidden');scene?.setEnabled(inGame&&connected);lastFocus?.focus();}
function createCharacter():void {
  if(!user)return;const first=!user.character;
  showModal(first?'Monte seu personagem':'Personalizar personagem','','character');
  const generation=modalGeneration,owner=user.id;
  editor=characterEditor($('#modal-content'),user.character??DEFAULT_CHARACTER,first,async character=>{
    const result=await api<Wardrobe&{user:PublicUser}>('/character',character);if(user?.id!==owner)return;user=result.user;wardrobe=result;
    network.send('player.appearance');renderAuth();if(modalGeneration!==generation)return;closeModal();
    if(first&&!inGame){if(user.verified)await enterBar();else authMessage('Personagem salvo! Confirme seu e-mail antes de entrar no bar.');}
    else toast('Personagem salvo. Todo mundo no bar vê seu novo visual.');
  });
}

const network=new BarNetwork({
  input:()=>scene?.getInput()??{dx:0,dz:0,running:false,rotation:0},
  skin:savedSkin,
  position:position=>scene?.setLocal(position),
  state:state=>{world=state;serverClockOffset=state.serverTime-Date.now();scene?.setWorld(state,user!.id);jukebox.setWorld(state,user!.id,connected);renderWorld();},
  jukebox:openJukebox,
  chat:message=>{if(!inGame||!user)return;chatHistory.push(message);if(chatHistory.length>100)chatHistory.shift();renderChat();if(!blocked.has(message.playerId)&&(message.system||message.playerId!==user.id))notices.show({variant:message.system?'acao':'mensagem',title:message.displayName,text:message.text,initials:message.system?undefined:message.displayName[0],id:message.id});},
  error:message=>{jukebox.reject(message);toast(message,true);},
  ping:ms=>{$('#ping').textContent=`${ms} ms`;},
  status:(message,isConnected)=>{
    connected=isConnected;scene?.setEnabled(inGame&&connected&&!activeModal);
    if(!isConnected&&watchingTv)stopWatchingTv();jukebox.setWorld(world,user?.id??'',connected);
    $('#hud-status').textContent=isConnected?'Na área!':'Reconectando…';
    $('#waiting-message').textContent=message;
    $('#waiting').classList.toggle('hidden',isConnected||!inGame);
    $('#connection').textContent=message;
    $('#connection').classList.toggle('hidden',isConnected||!inGame);
    if(isConnected){toast('Chegou! Fique à vontade.');$('#avatar').textContent=user?.displayName.slice(0,1).toUpperCase()||'B';}
  }
});

async function enterBar():Promise<void> {
  if(inGame)return;
  if(user&&!user.character){createCharacter();return;}
  if(!user?.verified){authMessage('Confirme seu e-mail antes de entrar no bar.');return;}
  if(!scene){toast('Seu navegador não conseguiu iniciar o cenário 3D. Ative a aceleração gráfica e recarregue.',true);return;}
  inGame=true;$('#lobby').classList.add('hidden');$('#game').classList.remove('hidden');hud.forUser(user.id);$('#admin-button').classList.toggle('hidden',user?.role!=='admin');
  try{$('#waiting').classList.remove('hidden');$('#waiting-message').textContent='Carregando o mapa do bar…';await scene.ready;const [result,collection]=await Promise.all([api<{blocked:string[]}>('/blocks'),api<Wardrobe>('/wardrobe')]);blocked=new Set(result.blocked);wardrobe=collection;await network.connect();}
  catch(error){await leaveBar();toast(errorMessage(error),true);}
}
async function leaveBar():Promise<void> {
  stopWatchingTv();jukebox.reset();
  inGame=false;connected=false;notices.clear();liveHud.reset();wardrobe=undefined;previousAction='';previousResult='';await network.disconnect();world=undefined;chatHistory.length=0;renderChat();scene?.setEnabled(false);scene?.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:0},'');
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
  $('#occupancy-fill').style.width=`${Math.min(100,world.occupancy/world.capacity*100)}%`;
  const self=world.players[user.id];
  liveHud.update(world,user,wardrobe,blocked);
  const actionKey=self?`${self.id}:${self.animationState}`:'';
  if(previousAction&&actionKey!==previousAction&&self){const titles:Record<string,string>={dance:'No passinho!',drink:'Saúde! Sua gelada chegou.',kick:'Golpe de karatê!'};if(titles[self.animationState])notices.show({title:titles[self.animationState],id:`action:${self.id}:${self.animationStartedAt}:${self.animationState}`,duration:3400});}
  previousAction=actionKey;
  $('#hud-name').textContent=user.displayName;
  $('#hud-skin').textContent=`${self?.skin==='custom'?'Meu personagem':SKINS.find(skin=>skin.id===self?.skin)?.name||'Carregando'} · B.A.R.`;
  const activities:Record<string,string>={idle:'De boa',walk:'No rolê',run:'Na correria',sit:'Sentado',dance:'No passinho',drink:'Uma gelada',kick:'Karatê!',fallen:'No chão',deal:'Na mesa',shuffle:'Nas cartas'};
  const ordering=self?.interactionState==='counter'&&self.animationState!=='drink';
  $('#hud-activity').textContent=self?.currentTableId?'No blackjack':ordering?'Esperando o Seu Zé':self?.oldWalk&&self.animationState==='walk'?'No passo da bengala':activities[self?.animationState||'idle'];
  $('#dance-button').setAttribute('aria-pressed',String(self?.animationState==='dance'));
  $('#kick-button').classList.toggle('hidden',self?.skin!=='rafael');
  const interaction=self?nearestInteraction(self):undefined;
  const context=$('#context');
  context.classList.toggle('hidden',!self||self.animationState==='kick'||(!self.interactionState&&!self.currentTableId&&!interaction));
  $('#context-label').textContent=self?.currentTableId?'Levantar da mesa':ordering?'Cancelar pedido':self?.interactionState?'Levantar / encerrar':interaction?.label||'';
  const event=world.event;
  const eventName={BLACKOUT:'Quem esqueceu de pagar a luz?',DRUNK_NPC:'O Zé acordou inspirado.',PARTY:'Essa rodada é de dança!'};
  if(event?.type&&event.id!==lastEvent){lastEvent=event.id;toast(eventName[event.type]);audio.setParty(event.type==='PARTY');}
  $('#event-banner').classList.toggle('hidden',!event?.type);
  if(event?.type)$('#event-banner').innerHTML=`<span class="event-spark">✳</span><div><small>ACONTECEU NO B.A.R.</small><b>${eventName[event.type]}</b></div><span class="event-time">${Math.max(0,Math.ceil((event.startedAt+event.durationMs-serverNow())/1000))}s</span>`;
  else audio.setParty(false);
  const table=self?.currentTableId?world.tables[self.currentTableId]:undefined;
  $('#blackjack').classList.toggle('hidden',!table);
  if(table){if(table.phase==='results'&&table.roundId!==previousResult){previousResult=table.roundId;const result=table.seats.find(s=>s.playerId===user!.id)?.result;if(result)notices.show({variant:result==='win'||result==='blackjack'?'conquista':'acao',title:result==='win'||result==='blackjack'?'Você ganhou!':result==='draw'?'Empate!':'A rodada fechou',text:'Confira as cartas na mesa.',id:`round:${table.roundId}`});}const key=JSON.stringify(table);if(key!==tableKey){tableKey=key;renderBlackjack(table);}}
  else tableKey='';
  if(activeModal==='people')renderPeopleContent();
}
function cardMarkup(card:Card):string {
  const symbols:Record<string,string>={hearts:'♥',diamonds:'♦',clubs:'♣',spades:'♠',H:'♥',D:'♦',C:'♣',S:'♠','♥':'♥','♦':'♦','♣':'♣','♠':'♠',h:'♥',d:'♦',c:'♣',s:'♠'};
  if(card.rank==='?')return '<div class="playing-card face-down" aria-label="Carta oculta">?</div>';
  const suit=symbols[card.suit]||card.suit;
  return `<div class="playing-card ${['♥','♦'].includes(suit)?'red':''}" aria-label="${e(card.rank)} ${e(suit)}"><b>${e(card.rank)}</b><span>${e(suit)}</span></div>`;
}
function renderBlackjack(table:BlackjackTable):void {
  const me=table.seats.find(seat=>seat.playerId===user?.id),myTurn=table.turnPlayerId===user?.id;
  const phases={waiting:'Puxe uma cadeira',playing:myTurn?'Sua vez de jogar':'Uma carta pode mudar tudo',dealer:'A vez da casa',results:'A rodada fechou'};
  const resultNames:Record<string,string>={win:'Você ganhou!',loss:'Deu casa.',draw:'Empate!',blackjack:'Blackjack!',bust:'Estourou',stand:'Parou',playing:'Jogando',turn:'Sua vez',finished:'Rodada encerrada',waiting:'Pronto'};
  $('#blackjack').innerHTML=`<div class="blackjack-heading"><span>♠ 21 DO BAIANO</span><button data-action="table-leave" aria-label="Sair da mesa">×</button></div><h2>${phases[table.phase]}</h2><div class="dealer-row"><div><small>DEALER</small><b>${table.dealerTotal||'—'}</b></div><div class="cards">${table.dealerCards.map(cardMarkup).join('')||'<span class="empty-cards">Aguardando a próxima rodada</span>'}</div></div><div class="table-seats">${table.seats.map(seat=>`<div class="table-seat ${seat.playerId===table.turnPlayerId?'active':''} ${seat.playerId===user?.id?'you':''}"><div class="seat-name"><b>${e(seat.playerId===user?.id?'Você':seat.displayName)}</b><span>${seat.total||'—'}</span></div><div class="cards small">${seat.cards.map(cardMarkup).join('')}</div><small>${e(resultNames[seat.result]||resultNames[seat.status]||seat.status)}</small></div>`).join('')}</div><div class="table-actions">${table.phase==='waiting'||table.phase==='results'?`<button class="button primary" data-action="table-start">${table.phase==='results'?'Nova rodada':'Começar rodada'} ↗</button>`:`<button class="button primary" data-action="hit" ${!myTurn?'disabled':''}>Comprar carta</button><button class="button secondary" data-action="stand" ${!myTurn?'disabled':''}>Parar</button>`}</div><div class="table-footer"><span>${table.phase==='results'?e(resultNames[me?.result||'']||'Rodada concluída'):'Sem apostas. Só pela resenha.'}</span><span id="turn-timer">${table.deadline?Math.max(0,Math.ceil((table.deadline-serverNow())/1000))+'s':''}</span></div>`;
}
function interact():void {
  if(!connected||!world||!user||activeModal)return;
  const self=world.players[user.id];if(!self)return;
  if(self.currentTableId){network.send('blackjack.leave');return;}
  if(self.interactionState){network.send('player.interact',{objectId:'stand'});return;}
  const object=nearestInteraction(self);if(!object)return;
  if(object.type==='blackjack')network.send('blackjack.join',{tableId:object.id});else network.send('player.interact',{objectId:object.id});
}
function kick():void {
  if(!connected||activeModal||!world||!user)return;
  const self=world.players[user.id];
  if(self?.skin!=='rafael'){toast('O golpe de karatê é exclusivo do Rafael.');return;}
  network.send('player.emote',{emote:'kick'});
}
function people():void {peopleKey='';showModal('Quem está por perto','', 'people');renderPeopleContent();}
function renderPeopleContent():void {
  const players=Object.values(world?.players||{}).filter(player=>player.id!==user?.id);
  const key=JSON.stringify([world?.occupancy,...players.map(p=>[p.id,p.displayName,p.connected,blocked.has(p.id)])]);
  if(key===peopleKey)return;peopleKey=key;
  $('#modal-content').innerHTML=`<p class="modal-description">Você vê as pessoas próximas a você. O bar tem ${world?.occupancy||0} frequentador(es) agora.</p><div class="people-list">${players.map(player=>`<div class="person"><span class="profile-initial" style="--avatar:${e(player.color)}">${e(player.displayName[0])}</span><div><b>${e(player.displayName)}</b><small>${player.connected?'No bar':'Ausente'}</small></div><button class="mini-button" data-action="block" data-id="${e(player.id)}">${blocked.has(player.id)?'Desbloquear':'Bloquear'}</button><button class="mini-button" data-action="report" data-id="${e(player.id)}">Denunciar</button></div>`).join('')||'<div class="empty-state">Por enquanto, só você por aqui.<br>Abra outra janela e convide alguém para chegar.</div>'}</div><p class="fine-print">Bloquear oculta mensagens de chat. Denúncias são encaminhadas à administração.</p>`;
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
  if(user?.role!=='admin'){toast('Acesso exclusivo da administração.',true);return;}
  showModal('Administração do bar','','admin');
  administration=adminPanel($('#modal-content'),{notify:message=>toast(message),changedWallet:()=>{wardrobe=undefined;void refreshAdministration();},denied:()=>{void refreshAdministration();}});
}
async function refreshAdministration():Promise<void>{
  if(refreshingAdministration||!inGame||!connected||!user)return;
  const owner=user.id;refreshingAdministration=true;
  try{
    const accountResult=await api<{user:PublicUser}>('/auth/me');if(user?.id!==owner||!inGame)return;
    const changed=user.role!==accountResult.user.role;user={...user,role:accountResult.user.role,isOwner:accountResult.user.isOwner};
    $('#admin-button').classList.toggle('hidden',user.role!=='admin');
    if(user.role!=='admin'&&activeModal==='admin')closeModal();
    if(changed)toast(user.role==='admin'?'Você recebeu acesso à administração.':'Sua permissão administrativa foi removida.');
    const result=await api<Wardrobe>('/wardrobe');if(user?.id!==owner||!inGame)return;wardrobe=result;liveHud.update(world,user,wardrobe,blocked);
    if(activeModal==='skins'||activeModal==='purchase'){
      const balance=document.querySelector('#wallet-balance');if(balance)balance.innerHTML=result.balance.toLocaleString('pt-BR')+' <small>moedas</small>';
      const purchase=document.querySelector('#purchase-balance');if(purchase)purchase.textContent=result.balance.toLocaleString('pt-BR');
      const buy=document.querySelector<HTMLButtonElement>('[data-action="buy-skin"]'),skin=result.catalog.find(s=>s.id===buy?.dataset.skin);
      if(buy&&skin){buy.disabled=result.balance<skin.price;buy.textContent=buy.disabled?'Moedas insuficientes':'Confirmar compra';}
    }
  }catch(error){if(error instanceof ApiError&&error.status===401&&user?.id===owner){user={...user,role:'user',isOwner:false};$('#admin-button').classList.add('hidden');if(activeModal==='admin')closeModal();}}
  finally{refreshingAdministration=false;}
}
setInterval(()=>{void refreshAdministration();},5000);

async function skins():Promise<void> {
  showModal('Personagem e skins','<p>Carregando sua coleção…</p>','skins');
  const generation=modalGeneration;
  const result=await api<Wardrobe>('/wardrobe');if(activeModal!=='skins'||generation!==modalGeneration)return;wardrobe=result;
  const current=world?.players[user?.id||'']?.skin||savedSkin();
  $('#modal-content').innerHTML=`<div class="wallet"><span>Sua carteira</span><b id="wallet-balance">${result.balance.toLocaleString('pt-BR')} <small>moedas</small></b></div><p class="modal-description">Seu personagem é gratuito. Skins completas ficam na sua coleção após a compra. C abre ou fecha esta janela.</p><div class="custom-character-card"><div><b>Meu personagem</b><small>Corpo, cabelo, pele e olhos do seu jeito</small></div><button class="mini-button" data-action="skin" data-skin="custom" ${current==='custom'?'disabled':''}>${current==='custom'?'Em uso':'Vestir'}</button><button class="mini-button" data-action="character">Personalizar</button></div><h3>Skins da casa</h3><div class="skin-grid">${result.catalog.map(skin=>`<button class="skin-card ${skin.id===current?'selected':''} ${skin.owned?'':'locked'}" data-action="skin" data-skin="${skin.id}" aria-pressed="${skin.id===current}"><img src="${import.meta.env.BASE_URL}skins/${skin.id}.jpg" alt="" width="240" height="320"><b>${e(skin.name)}</b><small>${skin.id===current?'Em uso':skin.owned?'Vestir':`${skin.price.toLocaleString('pt-BR')} moedas · Comprar`}</small></button>`).join('')}</div>${result.dailyReward>0?`<button class="button secondary full" data-action="daily" ${result.dailyClaimed?'disabled':''}>${result.dailyClaimed?'Bônus de hoje recebido':`Receber bônus diário: ${result.dailyReward} moedas`}</button>`:''}`;
}
async function wearSkin(id:string):Promise<void> {
  if(world?.players[user?.id||'']?.animationState==='kick'){toast('Espere o golpe terminar para trocar o visual.');return;}
  const skin=wardrobe?.catalog.find(option=>option.id===id);if(id!=='custom'&&!skin)return;
  if(skin&&!skin.owned){
    showModal(`Comprar ${skin.name}`,`<p>Esta skin custa <b>${skin.price.toLocaleString('pt-BR')} moedas</b>. Seu saldo é <span id="purchase-balance">${wardrobe!.balance.toLocaleString('pt-BR')}</span> moedas.</p><p>A compra é permanente. Seu personagem personalizado fica guardado.</p><button class="button primary full" data-action="buy-skin" data-skin="${skin.id}" ${wardrobe!.balance<skin.price?'disabled':''}>${wardrobe!.balance<skin.price?'Moedas insuficientes':'Confirmar compra'}</button><button class="text-button full" data-action="skins">Voltar à coleção</button>`,'purchase');return;
  }
  const owner=user?.id,generation=modalGeneration;
  const result=await api<Wardrobe&{user:PublicUser}>('/wardrobe/equip',{skin:id});if(user?.id!==owner)return;user=result.user;wardrobe=result;
  network.send('player.appearance');if(modalGeneration===generation)closeModal();toast(`Visual trocado: ${skin?.name??'Meu personagem'}.`);
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
      case 'interact':interact();break;
      case 'watch-tv':{const system=JUKEBOX_SYSTEMS[0],self=world?.players[user?.id??''];if(!self||distance(self,system.source)>8){toast('Chegue mais perto da TV do salão.');break;}closeModal();watchingTv=true;document.body.classList.add('watching-tv');tvBack.hidden=false;scene?.watchTelevision(system.tvId);tvBack.focus();break;}
      case 'drink':{
        const self=world?.players[user?.id||''];
        if(!connected||!self||activeModal)break;
        if(nearestInteraction(self)?.type==='counter'&&!self.currentTableId&&!self.interactionState)interact();
        else toast('Chegue ao balcão, no fundo à direita do térreo, e aperte E para pedir uma gelada.');
        break;
      }
      case 'scene-use':{const self=world?.players[user?.id??''],object=INTERACTABLES.find(p=>p.id===button.dataset.object);if(!connected||!self||!object||activeModal)break;if(!canInteract(object,self)){toast('Chegue mais perto para usar '+object.label.toLowerCase()+'.');break;}if(self.currentTableId||self.interactionState){toast('Encerre a interação atual com E antes de usar outro lugar.');break;}if(object.type==='blackjack')network.send('blackjack.join',{tableId:object.id});else network.send('player.interact',{objectId:object.id});break;}
      case 'wave':if(connected&&!activeModal)network.send('player.emote',{emote:'wave'});break;
      case 'chat':focusChat();break;
      case 'skins':await skins();break;
      case 'character':createCharacter();break;
      case 'buy-skin':{const owner=user?.id,generation=modalGeneration;button.setAttribute('disabled','');try{const result=await api<Wardrobe>('/wardrobe/buy',{skin:button.dataset.skin});if(user?.id!==owner)break;wardrobe=result;notices.show({variant:'conquista',title:'Nova skin na coleção!',text:'Skin comprada e adicionada à sua coleção.'});if(modalGeneration===generation)await skins();}finally{button.removeAttribute('disabled');}break;}
      case 'daily':{const owner=user?.id,generation=modalGeneration;const result=await api<Wardrobe>('/wardrobe/daily',{});if(user?.id!==owner)break;wardrobe=result;if(modalGeneration===generation)await skins();break;}
      case 'kick':kick();break;
      case 'skin':await wearSkin(button.dataset.skin!);break;
      case 'audio':{const on=!(audio.enabled||jukebox.soundEnabled);if(audio.enabled!==on)audio.toggle();jukebox.setMuted(!on);toast(on?'Som da casa ligado.':'Som da casa desligado.');break;}
      case 'dance':network.send('player.emote',{emote:world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'});break;
      case 'close-modal':closeModal();break;
      case 'chat-toggle':setChatOpen(hud.isCollapsed('chat'));break;
      case 'table-leave':network.send('blackjack.leave');break;
      case 'table-start':network.send('blackjack.start',{tableId:world?.players[user!.id]?.currentTableId});break;
      case 'hit':case 'stand':network.send('blackjack.action',{action});break;
      case 'block':{const id=button.dataset.id!;if(blocked.has(id)){await api(`/blocks/${encodeURIComponent(id)}`,undefined,'DELETE');blocked.delete(id);}else{await api('/blocks',{playerId:id});blocked.add(id);}renderPeopleContent();renderChat();break;}
      case 'report':showModal('Denunciar jogador',`<p class="modal-description">Conte o que aconteceu. Sua denúncia será revisada pela administração.</p><form id="report-form" data-id="${e(button.dataset.id)}"><label>Motivo<textarea name="reason" required minlength="5" maxlength="500" placeholder="Descreva a situação"></textarea></label><button class="button primary" type="submit">Enviar denúncia</button></form>`,'report');break;
      case 'mail':await mailbox();break;
      case 'verify-mail':await api('/auth/verify',{token:button.dataset.token});user=(await api<{user:PublicUser}>('/auth/me')).user;closeModal();authMode='login';renderAuth('E-mail confirmado! Entre para conhecer o bar.');break;
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
        if(authMode==='login'){const result=await api<{user:PublicUser}>('/auth/login',data);user=result.user;renderAuth();if(!user.character)createCharacter();else if(user.verified)await enterBar();else authMessage(emailVerificationRequired?'Confirme seu e-mail antes de entrar. Você pode pedir um novo link abaixo.':'Sua conta ainda precisa ser ativada. Entre novamente após a ativação.');}
        else if(authMode==='register'){const result=await api<{user:PublicUser;message:string;verificationRequired:boolean}>('/auth/register',data);emailVerificationRequired=result.verificationRequired;user=result.user;authMode='login';renderAuth(result.message);createCharacter();}
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
  if(event.key==='Escape'){if(watchingTv)stopWatchingTv();else closeModal();document.activeElement instanceof HTMLElement&&document.activeElement.blur();}
  // Closing must not reach the scene's own C handler on window, which would reopen the selector.
  if(event.code==='KeyC'&&!event.repeat&&activeModal==='skins'){event.preventDefault();event.stopPropagation();closeModal();}
  if(event.key==='Tab'&&activeModal){const focusable=Array.from($('#modal').querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,a[href]'));const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  if(event.key==='Enter'&&inGame&&!activeModal&&!['INPUT','TEXTAREA','BUTTON'].includes((document.activeElement as HTMLElement)?.tagName)){event.preventDefault();focusChat();}
});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal'))closeModal();});
renderAuth();renderChat();

async function start():Promise<void>{
  try{const config=await api<{emailVerificationRequired:boolean}>('/auth/config');emailVerificationRequired=config.emailVerificationRequired;renderAuth();}catch{/* The server still enforces its verification policy. */}
  try{scene=new BarScene($<HTMLCanvasElement>('#world'));scene.onInteract=interact;scene.onEmote=()=>network.send('player.emote',{emote:world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'});scene.onChat=()=>{if(inGame&&!activeModal)focusChat();};scene.onSkins=()=>{if(inGame&&!activeModal)void skins().catch(error=>toast(errorMessage(error),true));};scene.onKick=kick;scene.setEnabled(false);}
  catch(error){console.error(error);toast('Não foi possível iniciar o 3D. Verifique a aceleração gráfica do navegador.',true);}
  const params=new URLSearchParams(location.search);
  if(params.has('verify')){try{await api('/auth/verify',{token:params.get('verify')});renderAuth('E-mail confirmado! Agora é só entrar.');}catch(error){authMessage(errorMessage(error),true);}history.replaceState({},'',location.pathname);}
  if(params.has('reset')){resetToken=params.get('reset')!;authMode='reset';renderAuth();return;}
  try{const result=await api<{user:PublicUser}>('/auth/me');user=result.user;renderAuth();if(!user.character)createCharacter();}catch{/* No active session: show login. */}
}
let displayedSound:boolean|undefined;
void start().then(()=>{if(scene)scene.onMediaFrame=()=>{jukebox.frame();const on=audio.enabled||jukebox.soundEnabled;if(on!==displayedSound){displayedSound=on;$('#audio-button').classList.toggle('sound-on',on);$('#audio-button').setAttribute('aria-pressed',String(on));$('#audio-button').setAttribute('aria-label',on?'Silenciar música':'Ativar música');}};});
// Development telemetry exposes copies only, never a way to command the server.
if(import.meta.env.DEV)Object.defineProperty(window,'barDebug',{value:{snapshot:()=>({world:structuredClone(world),localId:user?.id}),performance:()=>scene?.getPerformance(),animations:()=>scene?.getAnimations(),map:()=>scene?.getMapStatus(),network:()=>network.telemetry(),jukebox:()=>jukebox.telemetry()}});
setInterval(()=>{
  if(!inGame||!scene||!world)return;
  const labels=scene.projectLabels?.()||[];
  $('#labels').innerHTML=labels.map(label=>`<span class="world-label" style="left:${label.x}px;top:${label.y}px">${e(label.name)}</span>`).join('');
  const table=world.tables[world.players[user?.id||'']?.currentTableId];
  const timer=document.querySelector('#turn-timer');if(timer&&table?.deadline)timer.textContent=`${Math.max(0,Math.ceil((table.deadline-serverNow())/1000))}s`;
},100);
