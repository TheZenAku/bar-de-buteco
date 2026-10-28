import {adminPanel} from './admin-panel';
import './assets/fonts/nova-ui.css';
import './nova-ui.css';
import {gameUi} from './game-ui';
import {createHudPanels} from './hud-panels';
import {createNotifications} from './notifications';
import {createLiveHud} from './live-hud';
import {nearestInteraction,INTERACTABLES,canInteract,DEFAULT_SKIN,SKINS,ITEM_CATALOG,itemById,type Wardrobe,type WorldState,type PublicUser,type ChatMessage,type BlackjackTable,type Card,type InventoryView,type ItemId} from '@bar/shared';
import './admin.css';
import {BarScene} from './engine/BarScene';
import {BarNetwork} from './networking';
import {api,ApiError,escape as e} from './api';
import {BarAudio} from './audio';
import {JukeboxController,TelevisionController} from './jukebox';
import {nearestMediaSource} from '@bar/shared';
import './jukebox.css';
import {createSettings,type GameSettings} from './settings';
import {VoiceChat} from './voice';
import {coins,itemImage,uiIcon} from './ui-icons';
import {VOICE} from '@bar/shared';
import './voice.css';
import './needs.css';
import {createNeedsHud} from './needs-hud';
import {AdmissionLifecycle,type AdmissionDeparture} from './admission-lifecycle';
import {JOBS,canInteract as touching,jobById,stationInteractable,type JobTaskView} from '@bar/shared';
import type {TableOrderView} from './networking';
import {graphicsSettingsHtml,jobPanelHtml,jobPanelTick,jobsHtml,mediaPriceNote,nextGraphics,tableMenuHtml,tableMenuTotal,worldAdminHtml} from './economy-ui';
import './economy.css';
import {createObjectiveBlip} from './objective-blip';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=gameUi();

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const hud=createHudPanels($('#game'));
const notices=createNotifications($('#toasts'));
const liveHud=createLiveHud($('#game'));
const needsHud=createNeedsHud($('#game'),notice=>notices.show(notice),()=>serverNow());
let user:PublicUser|undefined;
let world:WorldState|undefined;
let serverClockOffset=0;
const serverNow=()=>Date.now()+serverClockOffset;
let inGame=false,connected=false,authMode:'login'|'register'|'forgot'|'reset'='login';
let emailVerificationRequired=true;
let checkingSession=true;
let resetToken='',activeModal='',tableKey='',peopleKey='',blocked=new Set<string>();
let scene:BarScene|undefined;
let lastFocus:HTMLElement|undefined;
const audio=new BarAudio();
const settings=createSettings();
const voice=new VoiceChat({sendPacket:packet=>network.sendBytes('voice',packet),sendState:state=>network.send('voice.state',state),notice:(text,error)=>toast(text,error),changed:()=>renderVoice()},settings);
const chatHistory:ChatMessage[]=[];
let administration:ReturnType<typeof adminPanel>|undefined;
let refreshingAdministration=false;
let wardrobe:Wardrobe|undefined;
let inventory:InventoryView|undefined;
let modalGeneration=0;
let watchingTv=false;
// Tonico's pending order and the current job task: private, sent by the room (table.state, job.state).
let tableOrder:TableOrderView|undefined;
let jobTask:JobTaskView|null=null;
let worldSnapshot:unknown;
let adminTab:'accounts'|'world'='accounts';
const admission=new AdmissionLifecycle();
let leavingPromise:Promise<void>|undefined;
// The jukebox and the TVs are independent: separate controllers, players, panels and volumes.
// Either one in use quiets the ambient sound.
const mediaInUse={jukebox:false,tv:false};
const ambientFor=(kind:keyof typeof mediaInUse)=>(value:boolean)=>{mediaInUse[kind]=value;audio.setSuppressed(mediaInUse.jukebox||mediaInUse.tv);};
const jukebox=new JukeboxController({send:(type,payload)=>network.send(type,payload),now:serverNow,
  project:()=>null,clear:()=>false,screen:()=>{},ambient:ambientFor('jukebox')});
// The video stays on the TV screens; panels and windows simply cover it, like anything in front of a real TV.
const television=new TelevisionController({send:(type,payload)=>network.send(type,payload),now:serverNow,
  project:id=>scene?.televisionProjection(id)??null,clear:id=>scene?.televisionClear(id)??false,
  screen:(id,visible)=>scene?.showTelevision(id,visible),ambient:ambientFor('tv')});
const media=[jukebox,television];
const tvBack=document.createElement('button');tvBack.id='leave-tv';tvBack.className='button secondary';tvBack.textContent='Voltar ao jogo · Esc';tvBack.hidden=true;tvBack.onclick=()=>stopWatchingTv();app.append(tvBack);
function stopWatchingTv():void {watchingTv=false;document.body.classList.remove('watching-tv');tvBack.hidden=true;scene?.watchTelevision();scene?.setEnabled(inGame&&connected&&!activeModal);}
function openJukebox(id:string):void {
  if(!inGame||!connected||!world?.jukeboxes?.[id])return;
  stopWatchingTv();showModal('JUKEBOX',mediaPriceNote('jukebox',id,inventory?.balance)+jukebox.panelHtml(id),'jukebox');jukebox.attachPanel($('#modal-content'));
}
function openTelevision(id:string):void {
  if(!inGame||!connected||!world?.televisions?.[id])return;
  stopWatchingTv();showModal(television.selectedSystemLabel(id),mediaPriceNote('tv',id,inventory?.balance)+television.panelHtml(id),'television');television.attachPanel($('#modal-content'));
}
function savedSkin():string {return user?.equippedSkin??DEFAULT_SKIN;}

function toast(message:string,error=false):void {notices.show({variant:error?'aviso':'acao',title:error?'Não foi possível':'No Boteco',text:message});}
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
  $('#auth-content').setAttribute('aria-busy',String(checkingSession));
  if(checkingSession){$('#auth-content').querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(control=>control.disabled=true);if(!message)authMessage('Verificando sua conta…');}
}
function authMessage(message:string,error=false):void {const node=$('#auth-message');node.className=`form-message ${error?'error':''}`;node.textContent=message;}
function setChatOpen(open:boolean):void {if(open)hud.open('chat');else hud.collapse('chat',true);}
function focusChat():void {setChatOpen(true);$('#chat-input').focus();}
function showModal(title:string,content:string,type:string):void {modalGeneration++;media.forEach(m=>m.detachPanel());if(watchingTv)stopWatchingTv();administration?.destroy();administration=undefined;lastFocus=document.activeElement as HTMLElement;activeModal=type;$('.modal').classList.toggle('admin-modal',type==='admin');$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#modal').classList.remove('hidden');scene?.setEnabled(false);$('.modal-header button').focus();}
function closeModal():void {modalGeneration++;media.forEach(m=>m.detachPanel());administration?.destroy();administration=undefined;activeModal='';$('#modal').classList.add('hidden');scene?.setEnabled(inGame&&connected);lastFocus?.focus();}

const network=new BarNetwork({
  input:()=>scene?.getInput()??{dx:0,dz:0,running:false,rotation:0},
  skin:savedSkin,
  position:position=>scene?.setLocal(position),
  state:state=>{world=state;serverClockOffset=state.serverTime-Date.now();scene?.setWorld(state,user!.id);media.forEach(m=>m.setWorld(state,user!.id,connected));renderWorld();},
  jukebox:openJukebox,
  television:openTelevision,
  voice:frame=>voice.receive(frame),
  itemLost:item=>notices.show({variant:'aviso',title:'Sumiu do bolso',text:`Enquanto você estava apagado, levaram: ${itemById(item)?.name??item}.`}),
  inventory:view=>{inventory={stacks:view.stacks,capacity:view.capacity,usedSlots:view.usedSlots,balance:view.balance??inventory?.balance??wardrobe?.balance??0,history:view.history??inventory?.history??[]};if(wardrobe)wardrobe={...wardrobe,balance:inventory.balance};liveHud.update(world,user,wardrobe,blocked,inventory);if(activeModal==='inventory')renderInventory();},
  inventoryResult:()=>{},
  wallet:change=>{
    if(inventory)inventory={...inventory,balance:change.balance};if(wardrobe)wardrobe={...wardrobe,balance:change.balance};
    liveHud.update(world,user,wardrobe,blocked,inventory);
    if(change.reason==='job'&&change.delta)notices.show({variant:'acao',title:'Trabalho feito',text:`+${change.delta} moedas na carteira.`});
    if(change.reason==='refund'&&change.delta)notices.show({variant:'acao',title:'Estorno',text:`${change.delta} moedas voltaram para a carteira.`});
  },
  table:update=>{
    tableOrder=update.status==='ordered'?update.order:undefined;
    if(update.status==='delivered')notices.show({variant:'acao',title:'Chegou o pedido',text:'O Tonico deixou tudo na mesa. Bom apetite!'});
    if(update.status==='cancelled'&&update.message)notices.show({variant:'aviso',title:'Pedido cancelado',text:update.message});
    if(activeModal==='table')renderTableMenu();
  },
  job:update=>{
    if(update.task!==undefined)jobTask=update.task;
    if(update.message)notices.show({variant:update.task?'acao':'aviso',title:'Trabalho',text:update.message});
    if(activeModal==='jobs')$('#modal-content').innerHTML=jobsHtml(world,jobTask);
    renderJobCard();
  },
  adminWorld:snapshot=>{worldSnapshot=snapshot;if(activeModal==='admin'&&adminTab==='world')$('#admin-world').innerHTML=worldAdminHtml(snapshot);},
  removed:(kind,reason)=>{void leaveBar().then(()=>{
    if(kind==='ban'){user=undefined;renderAuth();authMessage(`Conta banida. ${reason} Peça a um administrador para remover o banimento.`,true);}
    else authMessage(`Você foi expulso desta participação. ${reason} Sua conta não está banida; pode entrar novamente.`,true);
  });},
  chat:message=>{if(!inGame||!user)return;chatHistory.push(message);if(chatHistory.length>100)chatHistory.shift();renderChat();},
  // A media panel waiting for its own command shows the refusal itself.
  error:message=>{if(!media.some(m=>m.reject(message)))toast(message,true);},
  ping:ms=>{$('#ping').textContent=`${ms} ms`;},
  status:(message,isConnected)=>{
    connected=isConnected;scene?.setEnabled(inGame&&connected&&!activeModal);audio.setActive(inGame&&connected);
    if(!isConnected&&watchingTv)stopWatchingTv();media.forEach(m=>m.setWorld(world,user?.id??'',connected));
    $('#hud-status').textContent=isConnected?'Na área!':'Reconectando…';
    $('#waiting-message').textContent=message;
    $('#waiting').classList.toggle('hidden',isConnected||!inGame);
    $('#connection').textContent=message;
    $('#connection').classList.toggle('hidden',isConnected||!inGame);
    if(isConnected){voice.syncState();$('#avatar').textContent=user?.displayName.slice(0,1).toUpperCase()||'B';}
  }
});

async function enterBar():Promise<void> {
  if(inGame)return;
  if(!user?.verified){authMessage('Confirme seu e-mail antes de entrar no bar.');return;}
  if(!scene){toast('Seu navegador não conseguiu iniciar o cenário 3D. Ative a aceleração gráfica e recarregue.',true);return;}
  const attempt=admission.beginEntry();if(!attempt)return;
  // Entering is a click: the browser lets this page play voices from now on.
  voice.unlock();audio.unlock();
  inGame=true;$('#lobby').classList.add('hidden');$('#game').classList.remove('hidden');hud.forUser(user.id);$('#admin-button').classList.toggle('hidden',user?.role!=='admin');
  try{
    $('#waiting').classList.remove('hidden');$('#waiting-message').textContent='Carregando o mapa do bar…';await scene.ready;
    if(!admission.isCurrentEntry(attempt))return;
    const [result,collection,items]=await Promise.all([api<{blocked:string[]}>('/blocks'),api<Wardrobe>('/wardrobe'),api<InventoryView>('/inventory')]);
    if(!admission.isCurrentEntry(attempt))return;
    blocked=new Set(result.blocked);wardrobe=collection;inventory=items;await network.connect();
    if(!admission.isCurrentEntry(attempt))return;
    await voice.enter();
    if(!admission.completeEntry(attempt)&&(admission.phase==='leaving'||admission.phase==='outside'))voice.leave();
  }
  catch(error){const departure=admission.failEntry(attempt);if(!departure)return;await leaveBarWith(departure);toast(errorMessage(error),true);}
}
function leaveBar():Promise<void> {
  if(leavingPromise)return leavingPromise;
  const departure=admission.beginExit();
  return departure?leaveBarWith(departure):Promise.resolve();
}
function leaveBarWith(departure:AdmissionDeparture):Promise<void> {
  if(leavingPromise)return leavingPromise;
  const task=(async()=>{
  stopWatchingTv();media.forEach(m=>m.reset());voice.leave();audio.setActive(false);
  inGame=false;connected=false;tableOrder=undefined;jobTask=null;renderJobCard();objectiveBlip.render(null);worldSnapshot=undefined;notices.clear();liveHud.reset();needsHud.reset();wardrobe=undefined;inventory=undefined;await network.disconnect();world=undefined;chatHistory.length=0;renderChat();scene?.setEnabled(false);scene?.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:0},'');
  $('#labels').replaceChildren();$('#game').classList.add('hidden');$('#lobby').classList.remove('hidden');$('#blackjack').classList.add('hidden');tableKey='';closeModal();renderAuth();
  })();
  const tracked=task.finally(()=>{admission.completeExit(departure);if(leavingPromise===tracked)leavingPromise=undefined;});
  leavingPromise=tracked;return tracked;
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
  liveHud.update(world,user,wardrobe,blocked,inventory);
  needsHud.update(self);
  $('#hud-name').textContent=user.displayName;
  $('#hud-skin').textContent=`${SKINS.find(skin=>skin.id===self?.skin)?.name||'Carregando'} · B.A.R.`;
  const activities:Record<string,string>={idle:'De boa',walk:'No rolê',run:'Na correria',sit:'Sentado',dance:'No passinho',drink:'Uma gelada',kick:'Karatê!',fallen:'No chão',deal:'Na mesa',shuffle:'Nas cartas'};
  const ordering=self?.interactionState==='counter'&&self.animationState!=='drink';
  $('#hud-activity').textContent=needsHud.activity(self)??(self?.currentTableId?'No blackjack':ordering?'Esperando o Magrão':self?.oldWalk&&self.animationState==='walk'?'No passo da bengala':activities[self?.animationState||'idle']);
  $('#dance-button').setAttribute('aria-pressed',String(self?.animationState==='dance'));
  $('#kick-button').classList.toggle('hidden',self?.skin!=='rafael');
  const station=jobStation(),atStation=!!station&&!!self&&!self.interactionState&&!self.currentTableId&&touching(stationInteractable(station),self);
  const interaction=self?nearestInteraction(self):undefined;
  const context=$('#context');
  const seated=!!self?.interactionState?.startsWith('seat-')&&self.animationState==='sit';
  $('#table-cta').classList.toggle('hidden',!seated);$('#table-cta-label').textContent=tableOrder?'Pedido a caminho':'Pedir ao Tonico';
  context.classList.toggle('hidden',!self||self.animationState==='kick'||(!!self.condition&&self.condition!=='normal'&&self.condition!=='recovering')||(!self.interactionState&&!self.currentTableId&&!interaction&&!atStation));
  $('#context-label').textContent=self?.currentTableId?'Levantar da mesa':ordering?'Cancelar pedido':self?.interactionState==='job'?'Parar a tarefa':atStation?`Trabalho · ${station!.label}`:self?.interactionState?.startsWith('toilet-')?'Sair do banheiro':self?.interactionState?'Levantar / encerrar':interaction?.type==='door'?`${world.doors?.[interaction.id]?.open===false?'Abrir':'Fechar'} a porta · ${interaction.label}`:interaction?.label||'';
  const event=world.event;
  const eventName={BLACKOUT:'Quem esqueceu de pagar a luz?',DRUNK_NPC:'O Zé acordou inspirado.',PARTY:'Essa rodada é de dança!'};
  $('#event-banner').classList.toggle('hidden',!event?.type);
  if(event?.type)$('#event-banner').innerHTML=`<span class="event-spark">✳</span><div><small>ACONTECEU NO B.A.R.</small><b>${eventName[event.type]}</b></div><span class="event-time">${Math.max(0,Math.ceil((event.startedAt+event.durationMs-serverNow())/1000))}s</span>`;
  const table=self?.currentTableId?world.tables[self.currentTableId]:undefined;
  $('#blackjack').classList.toggle('hidden',!table);
  if(table){const key=JSON.stringify(table);if(key!==tableKey){tableKey=key;renderBlackjack(table);}}
  else tableKey='';
  if(activeModal==='people')renderPeopleContent();
  renderJobCard();
}
function jobStation(){return jobTask?jobById(jobTask.jobId)?.stations.find(s=>s.id===jobTask!.stationId):undefined;}
let jobPanelKey='';
/** The job panel (draggable, collapsible, hideable like the other HUD panels) and the objective marker in the scene. */
function renderJobCard():void {
  const task=inGame?jobTask:null,self=world?.players[user?.id??''],station=jobStation();
  // The objective marker exists only here: the room sends the task to its worker alone, so nobody else can draw it.
  scene?.setObjective(task&&station&&!task.startedAt?{x:station.x,y:station.y,z:station.z,top:station.top}:null);
  if(!task){jobPanelKey='';hud.setAvailable('job',false);return;}
  // Rebuilt only when the task changes; rewriting it ten times a second made its buttons miss clicks.
  const near=!!station&&!!self&&touching(stationInteractable(station),self),key=`${task.stationId}|${task.startedAt}|${task.tasks}|${task.earned}|${near}`;
  if(key!==jobPanelKey){jobPanelKey=key;$('#job-body').innerHTML=jobPanelHtml(task,near);}
  jobPanelTick($('#job-body'),$('#job-summary'),task,serverNow());
  // Filled before it shows, so the layout fits the whole panel on screen.
  hud.setAvailable('job',true);
}
const objectiveBlip=createObjectiveBlip($<HTMLCanvasElement>('#job-blip'));
function openTableMenu():void {
  const self=world?.players[user?.id??''];
  if(!self?.interactionState?.startsWith('seat-')){toast('Sente-se a uma mesa (E perto de uma cadeira) para pedir ao Tonico.');return;}
  showModal('PEDIR AO TONICO','','table');renderTableMenu();
}
function renderTableMenu():void {$('#modal-content').innerHTML=tableMenuHtml(inventory?.balance??0,tableOrder);}
function openJobs():void {showModal('Trabalhar no bar',jobsHtml(world,jobTask),'jobs');}
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
  const station=jobStation();
  if(station&&touching(stationInteractable(station),self)){network.send('job.work');return;}
  const object=nearestInteraction(self);if(!object)return;
  if(object.type==='counter'){orderDrink();return;}
  if(object.type==='blackjack')network.send('blackjack.join',{tableId:object.id});else network.send('player.interact',{objectId:object.id});
}
/** At the counter: choose what Magrão serves. He charges on ordering; the choice travels with the order and shows in the hand. */
function orderDrink():void {
  const option=(id:'garrafa'|'copo',hint:string)=>{const item=itemById(id)!;return `<button class="button primary" data-action="order" data-item="${id}"><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><span><b>${e(item.name)} · ${coins(item.price)}</b><small>${hint}</small></span></button>`;};
  showModal('PEDIR AO MAGRÃO',`<p class="modal-description">O Magrão cobra, prepara e entrega. Você bebe quando ele terminar. Carteira: ${coins(inventory?.balance??0)}</p><div class="drink-choice">${option('garrafa','Cerveja na garrafa')}${option('copo','Chopp no copo')}</div><p class="fine-print">Sentado numa mesa? Peça comida e bebida ao Tonico com T.</p>`,'order');
}
function kick():void {
  if(!connected||activeModal||!world||!user)return;
  const self=world.players[user.id];
  if(self?.skin!=='rafael')return;
  network.send('player.emote',{emote:'kick'});
}
function people():void {peopleKey='';showModal('Quem está por perto','', 'people');renderPeopleContent();}
function renderPeopleContent():void {
  const players=Object.values(world?.players||{}).filter(player=>player.id!==user?.id);
  const key=JSON.stringify([world?.occupancy,...players.map(p=>[p.id,p.displayName,p.connected,p.voice,blocked.has(p.id),voice.isMuted(p.id)])]);
  if(key===peopleKey)return;peopleKey=key;
  $('#modal-content').innerHTML=`<p class="modal-description">Você vê as pessoas próximas a você. O bar tem ${world?.occupancy||0} frequentador(es) agora.</p><div class="people-list">${players.map(player=>`<div class="person"><span class="profile-initial" style="--avatar:${e(player.color)}">${e(player.displayName[0])}</span><div><b>${e(player.displayName)}</b><small>${player.connected?(player.voice?'No bar · microfone ligado':'No bar'):'Ausente'}</small></div><button class="mini-button" data-action="voice-mute" data-id="${e(player.id)}" aria-pressed="${voice.isMuted(player.id)}">${voice.isMuted(player.id)?'Ouvir voz':'Silenciar voz'}</button><button class="mini-button" data-action="block" data-id="${e(player.id)}">${blocked.has(player.id)?'Desbloquear':'Bloquear'}</button><button class="mini-button" data-action="report" data-id="${e(player.id)}">Denunciar</button></div>`).join('')||'<div class="empty-state">Por enquanto, só você por aqui.<br>Abra outra janela e convide alguém para chegar.</div>'}</div><p class="fine-print">Silenciar voz vale só para você. Bloquear oculta mensagens de chat e corta a voz nos dois sentidos. Denúncias são encaminhadas à administração.</p>`;
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
  showModal('Administração do bar',`<div class="admin-tabs" role="tablist"><button role="tab" data-action="admin-tab" data-tab="accounts" aria-selected="${adminTab==='accounts'}">Contas e moderação</button><button role="tab" data-action="admin-tab" data-tab="world" aria-selected="${adminTab==='world'}">Mundo ao vivo</button></div><div id="admin-accounts" ${adminTab==='accounts'?'':'hidden'}></div><div id="admin-world" ${adminTab==='world'?'':'hidden'}>${worldAdminHtml(worldSnapshot)}</div>`,'admin');
  administration=adminPanel($('#admin-accounts'),{changedWallet:()=>{wardrobe=undefined;void refreshAdministration();},denied:()=>{void refreshAdministration();}});
  if(adminTab==='world')network.send('admin.world');
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
    const [result,inventoryResult]=await Promise.all([api<Wardrobe>('/wardrobe'),api<InventoryView>('/inventory')]);if(user?.id!==owner||!inGame)return;wardrobe=result;inventory=inventoryResult;liveHud.update(world,user,wardrobe,blocked,inventory);
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

const effectText=(item:typeof ITEM_CATALOG[number])=>Object.entries(item.effects).filter(([key,value])=>key!=='name'&&typeof value==='number'&&Number(value)!==0)
  .map(([key,value])=>`${({hunger:'fome',thirst:'sede',hp:'vida',drunk:'álcool',bladder:'bexiga'} as Record<string,string>)[key]??key} ${Number(value)>0?'+':''}${value}`).join(' · ');
function renderInventory():void {
  if(activeModal!=='inventory'||!inventory)return;
  const quantities=new Map(inventory.stacks.map(stack=>[stack.itemId,stack.quantity]));
  const self=world?.players[user?.id??''],canUse=connected&&self?.condition!=='fainted'&&self?.condition!=='stumbling'&&!self?.interactionState&&!self?.currentTableId;
  const owned=inventory.stacks.map(stack=>{const item=itemById(stack.itemId);if(!item)return '';
    return `<article class="item-card owned"><div class="item-icon" aria-hidden="true">${itemImage(item)}</div><div class="item-copy"><small>${e(item.category)}</small><b>${e(item.name)}</b><p>${e(item.description)}</p><span>${e(effectText(item as typeof ITEM_CATALOG[number]))}</span></div><strong>×${stack.quantity}</strong><div class="item-actions"><button class="mini-button" data-action="inventory-use" data-item="${e(item.id)}" ${canUse?'':'disabled'}>Usar</button><button class="mini-button danger" data-action="inventory-discard" data-item="${e(item.id)}">Descartar</button></div></article>`;}).join('');
  const shop=ITEM_CATALOG.map(item=>{const quantity=quantities.get(item.id)??0,full=quantity>=item.stackMax,poor=inventory!.balance<item.price;
    return `<article class="shop-item"><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><span><b>${e(item.name)}</b><small>${e(item.description)}</small></span><span class="shop-price">${coins(item.price)}</span><button class="mini-button" data-action="inventory-buy" data-item="${e(item.id)}" ${full||poor?'disabled':''}>${full?'Pilha cheia':poor?'Sem moedas':'Comprar'}</button></article>`;}).join('');
  const reason:Record<string,string>={starter:'Kit inicial',purchase:'Compra',use:'Usado',discard:'Descartado',faint:'Perdido ao desmaiar'};
  const history=inventory.history.slice(0,10).map(entry=>{const item=itemById(entry.itemId);return `<li><span>${entry.quantity>0?'+':''}${entry.quantity} ${e(item?.name??entry.itemId)}</span><small>${e(reason[entry.reason]??entry.reason)} · ${new Date(entry.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</small></li>`;}).join('');
  $('#modal-content').innerHTML=`<div class="inventory-summary"><div><small>ESPAÇO</small><b>${inventory.usedSlots} / ${inventory.capacity} pilhas</b></div><div><small>CARTEIRA</small><b>${inventory.balance.toLocaleString('pt-BR')} moedas</b></div></div>
    <p class="modal-description">Use alimentos, bebidas e curativos no jogo. Cada item ocupa uma pilha; quantidades iguais se agrupam.</p><h3>Na mochila</h3><div class="inventory-grid">${owned||'<p class="empty-state">Sua mochila está vazia.</p>'}</div>
    <h3>Venda da casa</h3><div class="shop-grid">${shop}</div><details class="inventory-history"><summary>Histórico recente</summary><ol>${history||'<li>Nenhuma movimentação.</li>'}</ol></details>`;
}
async function openInventory():Promise<void>{
  showModal('Mochila','<p>Conferindo seus itens…</p>','inventory');const generation=modalGeneration;
  const result=await api<InventoryView>('/inventory');if(activeModal!=='inventory'||generation!==modalGeneration)return;inventory=result;if(wardrobe)wardrobe={...wardrobe,balance:result.balance};renderInventory();liveHud.update(world,user,wardrobe,blocked,inventory);
}
function useInventoryItem(id:string):void{
  const item=itemById(id);if(!item||!inventory?.stacks.some(stack=>stack.itemId===id&&stack.quantity>0)){toast('Este item não está mais na mochila.',true);return;}
  if(activeModal)closeModal();network.send('inventory.use',{itemId:id});
}
function confirmDiscard(id:string):void{
  const item=itemById(id),stack=inventory?.stacks.find(entry=>entry.itemId===id);if(!item||!stack)return;
  showModal('Descartar item',`<div class="discard-confirm"><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><p>Descartar uma unidade de <b>${e(item.name)}</b>? Esta ação não devolve moedas.</p><button class="button primary" data-action="inventory-discard-confirm" data-item="${e(item.id)}">Descartar 1</button><button class="text-button" data-action="inventory">Voltar à mochila</button></div>`,'inventory-discard');
}

async function skins():Promise<void> {
  showModal('Skins','<p>Carregando sua coleção…</p>','skins');
  const generation=modalGeneration;
  const result=await api<Wardrobe>('/wardrobe');if(activeModal!=='skins'||generation!==modalGeneration)return;wardrobe=result;
  const current=world?.players[user?.id||'']?.skin||savedSkin();
  $('#modal-content').innerHTML=`<div class="wallet"><span>Sua carteira</span><b id="wallet-balance">${result.balance.toLocaleString('pt-BR')} <small>moedas</small></b></div><p class="modal-description">${e(SKINS.find(skin=>skin.id===DEFAULT_SKIN)!.name)} é gratuito. As outras skins ficam na sua coleção após a compra. C abre ou fecha esta janela.</p><h3>Skins da casa</h3><div class="skin-grid">${result.catalog.map(skin=>`<button class="skin-card ${skin.id===current?'selected':''} ${skin.owned?'':'locked'}" data-action="skin" data-skin="${skin.id}" aria-pressed="${skin.id===current}"><img src="${import.meta.env.BASE_URL}skins/${skin.id}.jpg" alt="" width="240" height="320"><b>${e(skin.name)}</b><small>${skin.id===current?'Em uso':skin.owned?'Vestir':`${skin.price.toLocaleString('pt-BR')} moedas · Comprar`}</small></button>`).join('')}</div>${result.dailyReward>0?`<button class="button secondary full" data-action="daily" ${result.dailyClaimed?'disabled':''}>${result.dailyClaimed?'Bônus de hoje recebido':`Receber bônus diário: ${result.dailyReward} moedas`}</button>`:''}`;
}
async function wearSkin(id:string):Promise<void> {
  if(world?.players[user?.id||'']?.animationState==='kick'){toast('Espere o golpe terminar para trocar o visual.');return;}
  const skin=wardrobe?.catalog.find(option=>option.id===id);if(!skin)return;
  if(!skin.owned){
    showModal(`Comprar ${skin.name}`,`<p>Esta skin custa <b>${skin.price.toLocaleString('pt-BR')} moedas</b>. Seu saldo é <span id="purchase-balance">${wardrobe!.balance.toLocaleString('pt-BR')}</span> moedas.</p><p>A compra é permanente.</p><button class="button primary full" data-action="buy-skin" data-skin="${skin.id}" ${wardrobe!.balance<skin.price?'disabled':''}>${wardrobe!.balance<skin.price?'Moedas insuficientes':'Confirmar compra'}</button><button class="text-button full" data-action="skins">Voltar à coleção</button>`,'purchase');return;
  }
  const owner=user?.id,generation=modalGeneration;
  const result=await api<Wardrobe&{user:PublicUser}>('/wardrobe/equip',{skin:id});if(user?.id!==owner)return;user=result.user;wardrobe=result;
  network.send('player.appearance');if(modalGeneration===generation)closeModal();
}
function help():void {showModal('Como é que funciona?',`<p class="modal-description">Não tem missão. A ideia é estar aqui.</p><div class="help-grid"><kbd>W A S D</kbd><span>Caminhar pelo bar</span><kbd>SHIFT</kbd><span>Correr</span><kbd>MOUSE</kbd><span>Arraste para olhar. Role para aproximar.</span><kbd>E</kbd><span>Sentar, pedir bebida, usar a jukebox ou entrar na mesa</span><kbd>I</kbd><span>Abrir a mochila, usar itens e comprar mantimentos</span><kbd>T</kbd><span>Sentado à mesa: pedir comida e bebida ao Tonico</span><kbd>J</kbd><span>Trabalhar no bar e ganhar moedas</span><kbd>G</kbd><span>Dançar ou parar de dançar</span><kbd>V</kbd><span>Acenar para o pessoal</span><kbd>C</kbd><span>Trocar de skin</span><kbd>ENTER</kbd><span>Conversar com quem está a até 12 metros</span><kbd>M</kbd><span>Ligar ou desligar o microfone (voz por proximidade, até 15 metros)</span><kbd>B</kbd><span>Segure para falar, no modo apertar para falar</span><kbd>ESC</kbd><span>Fechar uma janela</span></div><h3>Blackjack, do jeito da casa</h3><p>Chegue perto da mesa, aperte E e inicie uma rodada. Chegue o mais perto possível de 21 sem passar. O ás vale 1 ou 11; figuras valem 10. Compre uma carta ou pare. O dealer para em 17, inclusive com ás. Até quatro pessoas jogam juntas, sem dinheiro ou apostas.</p><h3>Moedas</h3><p>Trabalhe no bar (J) para ganhar moedas. Durante o turno, o painel Turno mostra a tarefa e o marcador verde leva até ela: arraste o painel pelo título, recolha ou esconda; o botão Turno, no topo, mostra de novo. Gaste com bebidas no balcão, pedidos na mesa, músicas na jukebox e vídeos nas TVs e no telão do palco. Pedido cancelado volta para a carteira.</p><h3>Aqui pode acontecer de tudo</h3><p>Apagões, festa e um frequentador inconveniente aparecem durante a noite. Sua partida continua valendo.</p>`,'help');}

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
      case 'watch-tv':{const system=television.selectedSystem,self=world?.players[user?.id??''],nearest=system&&self?nearestMediaSource(system,self):undefined;if(!system||!nearest||nearest.distance>8){toast('Chegue mais perto desta TV.');break;}closeModal();watchingTv=true;document.body.classList.add('watching-tv');tvBack.hidden=false;scene?.watchTelevision(system.screens[nearest.index]);tvBack.focus();break;}
      case 'drink':{
        const self=world?.players[user?.id||''];
        if(!connected||!self||activeModal)break;
        if(nearestInteraction(self)?.type==='counter'&&!self.currentTableId&&!self.interactionState)interact();
        else toast('Chegue ao balcão, no fundo à direita do térreo, e aperte E para pedir uma gelada.');
        break;
      }
      case 'scene-use':{const self=world?.players[user?.id??''],object=INTERACTABLES.find(p=>p.id===button.dataset.object);if(!connected||!self||!object||activeModal)break;if(!canInteract(object,self)){toast('Chegue mais perto para usar '+object.label.toLowerCase()+'.');break;}if(self.currentTableId||self.interactionState){toast('Encerre a interação atual com E antes de usar outro lugar.');break;}if(object.type==='counter'){orderDrink();break;}if(object.type==='blackjack')network.send('blackjack.join',{tableId:object.id});else network.send('player.interact',{objectId:object.id});break;}
      case 'wave':if(connected&&!activeModal)network.send('player.emote',{emote:'wave'});break;
      case 'chat':focusChat();break;
      case 'inventory':await openInventory();break;
      case 'inventory-use':useInventoryItem(button.dataset.item!);break;
      case 'inventory-discard':confirmDiscard(button.dataset.item!);break;
      case 'inventory-discard-confirm':{const itemId=button.dataset.item as ItemId;closeModal();network.send('inventory.discard',{itemId,quantity:1});break;}
      case 'inventory-buy':{const itemId=button.dataset.item as ItemId;button.setAttribute('disabled','');try{const result=await api<InventoryView>('/inventory/buy',{itemId,quantity:1,requestId:crypto.randomUUID()});inventory=result;if(wardrobe)wardrobe={...wardrobe,balance:result.balance};network.send('inventory.sync');renderInventory();liveHud.update(world,user,wardrobe,blocked,inventory);}finally{button.removeAttribute('disabled');}break;}
      case 'skins':await skins();break;
      case 'buy-skin':{const owner=user?.id,generation=modalGeneration;button.setAttribute('disabled','');try{const result=await api<Wardrobe>('/wardrobe/buy',{skin:button.dataset.skin});if(user?.id!==owner)break;wardrobe=result;if(modalGeneration===generation)await skins();}finally{button.removeAttribute('disabled');}break;}
      case 'daily':{const owner=user?.id,generation=modalGeneration;const result=await api<Wardrobe>('/wardrobe/daily',{});if(user?.id!==owner)break;wardrobe=result;if(modalGeneration===generation)await skins();break;}
      case 'kick':kick();break;
      case 'skin':await wearSkin(button.dataset.skin!);break;
      case 'audio':{const on=!(audio.enabled||media.some(m=>m.soundEnabled));if(audio.enabled!==on)audio.toggle();media.forEach(m=>m.setMuted(!on));break;}
      case 'order':{const self=world?.players[user?.id??''],counter=INTERACTABLES.find(i=>i.type==='counter');closeModal();if(!connected||!self||!counter)break;if(!canInteract(counter,self)){toast('Chegue ao balcão para pedir.');break;}network.send('player.interact',{objectId:counter.id,item:button.dataset.item==='copo'?'copo':'garrafa'});break;}
      case 'table-menu':openTableMenu();break;
      case 'table-cancel':network.send('table.cancel');closeModal();break;
      case 'jobs':openJobs();break;
      case 'job-start':network.send('job.start',{jobId:button.dataset.job});closeModal();break;
      case 'job-stop':network.send('job.stop');closeModal();break;
      case 'admin-tab':{adminTab=button.dataset.tab==='world'?'world':'accounts';document.querySelectorAll('[data-action="admin-tab"]').forEach(tab=>tab.setAttribute('aria-selected',String((tab as HTMLElement).dataset.tab===adminTab)));$('#admin-accounts').hidden=adminTab!=='accounts';$('#admin-world').hidden=adminTab!=='world';if(adminTab==='world')network.send('admin.world');break;}
      case 'admin-world-refresh':network.send('admin.world');break;
      case 'admin-job-end':network.send('admin.job',{jobId:button.dataset.job,endShiftOf:button.dataset.id});break;
      case 'admin-table-cancel':network.send('admin.table',{cancelFor:button.dataset.id});break;
      case 'admin-media-off':network.send('admin.media',{kind:button.dataset.kind==='jukebox'?'jukebox':'tv',id:button.dataset.id});break;
      case 'voice-mic':await toggleMicrophone();break;
      case 'voice-listen':{const on=!settings.get().voicesEnabled;voice.unlock();settings.update({voicesEnabled:on});break;}
      case 'voice-mute':{const id=button.dataset.id!;const muted=voice.toggleMute(id);peopleKey='';renderPeopleContent();break;}
      case 'settings':openSettings();break;
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
      case 'event':await api('/admin/action',{action:'event',eventType:button.dataset.type});break;
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
        else if(authMode==='register'){const result=await api<{user:PublicUser;message:string;verificationRequired:boolean}>('/auth/register',data);emailVerificationRequired=result.verificationRequired;user=result.user;authMode='login';renderAuth(result.message);if(user.verified)await enterBar();}
        else if(authMode==='forgot'){await api('/auth/forgot',data);authMessage('Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');}
        else {await api('/auth/reset',{token:resetToken,password:data.password});authMode='login';history.replaceState({},'',location.pathname);renderAuth('Senha atualizada. Entre novamente.');}
      }else if(form.id==='chat-form'){
        const input=$<HTMLInputElement>('#chat-input');const text=input.value.trim();if(text){network.send('chat.send',{text});input.value='';}input.blur();
      }else if(form.id==='report-form'){await api('/reports',{playerId:form.dataset.id,reason:data.reason});closeModal();toast('Denúncia registrada. Obrigado por avisar.');}
      else if(form.id==='table-order'){const items=new FormData(form).getAll('item').map(String);if(items.length){network.send('table.order',{items});closeModal();}}
      else if(form.classList.contains('admin-job-form')){const values=new FormData(form);network.send('admin.job',{jobId:form.dataset.job,slots:Number(values.get('slots')),pay:Number(values.get('pay')),enabled:values.get('enabled')==='on'});}
      else if(form.id==='moderation-form'){await api('/admin/action',{action:form.dataset.type,playerId:form.dataset.id,reason:data.reason});await admin();}
    }catch(error){if(form.id==='auth-form')authMessage(errorMessage(error),true);else toast(errorMessage(error),true);}
    finally{setBusy(form,false);}
  })();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(watchingTv)stopWatchingTv();else closeModal();document.activeElement instanceof HTMLElement&&document.activeElement.blur();}
  // Closing must not reach the scene's own C handler on window, which would reopen the selector.
  if(event.code==='KeyC'&&!event.repeat&&activeModal==='skins'){event.preventDefault();event.stopPropagation();closeModal();}
  if(event.key==='Tab'&&activeModal){const focusable=Array.from($('#modal').querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,a[href]'));const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  if(inGame&&!typing()&&!event.repeat){
    if(event.code==='KeyM'){event.preventDefault();void toggleMicrophone();}
    if(event.code==='KeyI'){event.preventDefault();if(activeModal==='inventory')closeModal();else if(!activeModal)void openInventory().catch(error=>toast(errorMessage(error),true));}
    if(event.code==='KeyB'&&settings.get().voiceMode==='ptt'){event.preventDefault();voice.setPushToTalk(true);}
    if(event.code==='KeyT'&&!activeModal){event.preventDefault();openTableMenu();}
    else if(event.code==='KeyT'&&activeModal==='table')closeModal();
    if(event.code==='KeyJ'&&!activeModal){event.preventDefault();openJobs();}
    else if(event.code==='KeyJ'&&activeModal==='jobs')closeModal();
  }
  if(event.key==='Enter'&&inGame&&!activeModal&&!['INPUT','TEXTAREA','BUTTON'].includes((document.activeElement as HTMLElement)?.tagName)){event.preventDefault();focusChat();}
});
document.addEventListener('keyup',event=>{if(event.code==='KeyB')voice.setPushToTalk(false);});
window.addEventListener('blur',()=>voice.setPushToTalk(false));
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal'))closeModal();});
$('#modal').addEventListener('input',event=>{
  const input=event.target as HTMLInputElement,key=input.dataset.setting;if(!key||input.type!=='range')return;
  if(key.startsWith('graphics.')){settings.update({graphics:nextGraphics(settings.get().graphics,key.slice(9),input.value)});const output=input.parentElement?.querySelector('output');if(output)output.textContent=`${input.value}%`;const preset=document.querySelector<HTMLSelectElement>('[data-setting="graphics.preset"]');if(preset)preset.value='custom';return;}
  const value=Number(input.value)/100;
  if(key==='jukebox')jukebox.setVolume(value);else if(key==='television')television.setVolume(value);else settings.update({[key]:value} as Partial<GameSettings>);
  const output=input.parentElement?.querySelector('output');if(output)output.textContent=`${Math.round(key==='mic'?value*200:value*100)}%`;
});
$('#modal').addEventListener('change',event=>{
  const target=event.target as HTMLElement;
  if(target instanceof HTMLInputElement&&target.name==='item'&&target.form?.id==='table-order'){tableMenuTotal(target.form);return;}
  const input=event.target as HTMLInputElement|HTMLSelectElement,key=input.dataset.setting;if(!key)return;
  if(key.startsWith('graphics.')&&!(input instanceof HTMLInputElement&&input.type==='range')){settings.update({graphics:nextGraphics(settings.get().graphics,key.slice(9),input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:input.value)});if(key==='graphics.preset')openSettings();else{const preset=document.querySelector<HTMLSelectElement>('[data-setting="graphics.preset"]');if(preset)preset.value='custom';}return;}
  if(key==='micEnabled'){void voice.setMicrophone((input as HTMLInputElement).checked);return;}
  if(key==='voicesEnabled'){voice.unlock();settings.update({voicesEnabled:(input as HTMLInputElement).checked});return;}
  if(key==='voiceMode'){settings.update({voiceMode:input.value==='ptt'?'ptt':'open'});openSettings();return;}
  if(key==='inputDevice')settings.update({inputDevice:input.value});
});
renderAuth();renderChat();

function typing():boolean {const element=document.activeElement as HTMLElement|null;return !!element&&(['INPUT','TEXTAREA','SELECT'].includes(element.tagName)||element.isContentEditable);}
async function toggleMicrophone():Promise<void> {
  if(!inGame)return;
  const on=!settings.get().micEnabled;
  if(on&&voice.unavailableReason){toast(voice.unavailableReason,true);return;}
  await voice.setMicrophone(on);
}
// General × ambience scales the quiet background bus; the jukebox and the TVs retain their own volumes.
function applySound(current:GameSettings):void {audio.volume=current.master*current.music;media.forEach(m=>m.setMaster(current.master));}
settings.subscribe((current,previous)=>{applySound(current);renderVoice();if(current.graphics!==previous.graphics)scene?.setGraphics(current.graphics);});
applySound(settings.get());
/** Microphone level on a −60…0 dB scale, 0–1. */
const levelScale=(rms:number)=>Math.max(0,Math.min(1,(20*Math.log10(Math.max(rms,1e-6))+60)/60));
function renderVoice():void {
  const current=settings.get(),mic=$('#voice-mic'),listen=$('#voice-listen');
  mic.classList.toggle('on',voice.micActive);mic.classList.toggle('transmitting',voice.transmitting);
  mic.setAttribute('aria-pressed',String(voice.micActive));
  const micLabel=voice.micActive?(current.voiceMode==='ptt'?'Microfone pronto · segure B para falar · M desliga':'Desligar microfone (M)'):'Ligar microfone (M)';
  mic.title=micLabel;mic.setAttribute('aria-label',micLabel);
  mic.querySelector('.voice-icon')!.innerHTML=uiIcon(voice.micActive?'mic':'micOff');
  listen.classList.toggle('off',!current.voicesEnabled);listen.setAttribute('aria-pressed',String(current.voicesEnabled));
  const listenLabel=current.voicesEnabled?'Silenciar vozes':'Ouvir vozes';listen.title=listenLabel;listen.setAttribute('aria-label',listenLabel);
  listen.querySelector('.voice-icon')!.innerHTML=uiIcon(current.voicesEnabled?'headphones':'headphonesOff');
  if(activeModal==='settings'){
    const status=document.querySelector('#voice-status');if(status)status.textContent=voice.status||(voice.micActive?'Microfone ligado.':'Microfone desligado.');
    const toggle=document.querySelector<HTMLInputElement>('[data-setting="micEnabled"]');if(toggle)toggle.checked=voice.micActive;
  }
  if(activeModal==='people')renderPeopleContent();
}
function renderVoiceLevel():void {
  const level=voice.micActive?levelScale(voice.level):0;
  $('#voice-mic').style.setProperty('--level',level.toFixed(3));
  if(activeModal!=='settings')return;
  const fill=document.querySelector<HTMLElement>('#mic-meter-fill');if(fill){fill.style.width=`${level*100}%`;fill.classList.toggle('open',voice.transmitting);}
}
function openSettings():void {
  const current=settings.get(),reason=voice.unavailableReason;
  const range=(key:string,label:string,value:number,scale=100,disabled=false)=>`<label class="setting-row"><span>${label}</span><input type="range" min="0" max="100" step="1" data-setting="${key}" value="${Math.round(value*100)}" ${disabled?'disabled':''}><output>${Math.round(value*scale)}%</output></label>`;
  const toggle=(key:string,label:string,hint:string,checked:boolean,disabled=false)=>`<label class="setting-toggle"><span><b>${label}</b><small>${hint}</small></span><input type="checkbox" role="switch" data-setting="${key}" ${checked?'checked':''} ${disabled?'disabled':''}><i aria-hidden="true"></i></label>`;
  // −60 dB (whisper) … −20 dB (loud) maps onto the meter's −60…0 dB scale.
  const threshold=current.sensitivity*40/60*100;
  showModal('Configurações',`<div class="settings-panel" data-capture-input>
    ${graphicsSettingsHtml(current.graphics,scene?.getGraphics())}
    <section><h3>${uiIcon('music')} Volume do jogo</h3>
      ${range('master','Geral',current.master)}${range('music','Som ambiente',current.music)}${range('jukebox','Jukebox',jukebox.ownVolume)}${range('television','TVs',television.ownVolume)}${range('voice','Vozes',current.voice)}
      <p class="fine-print">A cidade toca baixinho ao fundo, com transições suaves. O ambiente diminui enquanto a jukebox ou uma TV está em uso.</p>
    </section>
    <section><h3>${uiIcon('mic')} Chat de voz por proximidade</h3>
      <p class="fine-print">Quem estiver a até ${VOICE.maxDistance} metros ouve você, mais alto quanto mais perto e do lado certo. A voz passa pelo servidor do bar e não é gravada.</p>
      ${reason?`<p class="form-message error" role="alert">${e(reason)}</p>`:''}
      ${toggle('micEnabled','Microfone','Atalho: M',voice.micActive,!!reason)}
      ${toggle('voicesEnabled','Ouvir outras pessoas','Também no botão de fones do topo',current.voicesEnabled)}
      <fieldset class="setting-choice"><legend>Quando transmitir</legend>
        <label><input type="radio" name="voice-mode" data-setting="voiceMode" value="open" ${current.voiceMode==='open'?'checked':''}><span>Ao detectar voz</span></label>
        <label><input type="radio" name="voice-mode" data-setting="voiceMode" value="ptt" ${current.voiceMode==='ptt'?'checked':''}><span>Segurando B</span></label>
      </fieldset>
      ${range('sensitivity','Sensibilidade',current.sensitivity,100,current.voiceMode==='ptt')}
      ${range('mic','Volume do microfone',current.mic,200)}
      <div class="mic-meter" role="presentation"><i id="mic-meter-fill"></i>${current.voiceMode==='open'?`<b style="left:${threshold.toFixed(1)}%" title="Acima desta marca, sua voz é transmitida"></b>`:''}</div>
      <p id="voice-status" class="fine-print" role="status">${e(voice.status||(voice.micActive?'Microfone ligado.':'Microfone desligado.'))}</p>
      <label class="setting-row device-row"><span>Dispositivo</span><select data-setting="inputDevice" id="voice-device"><option value="">Padrão do sistema</option></select></label>
    </section>
  </div>`,'settings');
  void voice.devices().then(devices=>{
    const select=document.querySelector<HTMLSelectElement>('#voice-device');if(!select||activeModal!=='settings')return;
    for(const [i,device] of devices.entries())if(device.deviceId&&device.deviceId!=='default'){const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label||`Microfone ${i+1}`;select.append(option);}
    select.value=[...select.options].some(o=>o.value===settings.get().inputDevice)?settings.get().inputDevice:'';
  });
}

async function start():Promise<void>{
  try{const config=await api<{emailVerificationRequired:boolean}>('/auth/config');emailVerificationRequired=config.emailVerificationRequired;renderAuth();}catch{/* The server still enforces its verification policy. */}
  try{scene=new BarScene($<HTMLCanvasElement>('#world'),{
    onInteract:interact,
    onEmote:emote=>network.send('player.emote',{emote:emote==='wave'?'wave':world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'}),
    onChat:()=>{if(inGame&&!activeModal)focusChat();},
    onSkins:()=>{if(inGame&&!activeModal)void skins().catch(error=>toast(errorMessage(error),true));},
    onKick:kick,
    onMediaFrame:()=>{media.forEach(m=>m.frame());scene?.setJukeboxDuration(jukebox.duration('jukebox'));objectiveBlip.render(inGame?scene?.projectObjective()??null:null);voice.update(inGame?scene?.getListener():undefined,id=>world?.players[id]);renderVoiceLevel();const on=audio.enabled||media.some(m=>m.soundEnabled);if(on!==displayedSound){displayedSound=on;$('#audio-button').classList.toggle('sound-on',on);$('#audio-button').setAttribute('aria-pressed',String(on));$('#audio-button').setAttribute('aria-label',on?'Silenciar som da casa':'Ativar som da casa');}},
  });scene.setEnabled(false);scene.setGraphics(settings.get().graphics);}
  catch(error){console.error(error);toast('Não foi possível iniciar o 3D. Verifique a aceleração gráfica do navegador.',true);}
  const params=new URLSearchParams(location.search);
  if(params.has('verify')){try{await api('/auth/verify',{token:params.get('verify')});renderAuth('E-mail confirmado! Agora é só entrar.');}catch(error){authMessage(errorMessage(error),true);}history.replaceState({},'',location.pathname);}
  if(params.has('reset')){resetToken=params.get('reset')!;authMode='reset';checkingSession=false;renderAuth();return;}
  try{const result=await api<{user:PublicUser}>('/auth/me');user=result.user;}catch{/* No active session: show login. */}
  checkingSession=false;renderAuth();
}
let displayedSound:boolean|undefined;
void start();
// Development telemetry exposes copies only, never a way to command the server.
if(import.meta.env.DEV)Object.defineProperty(window,'barDebug',{value:{snapshot:()=>({world:structuredClone(world),localId:user?.id}),performance:()=>scene?.getPerformance(),animations:()=>scene?.getAnimations(),served:()=>scene?.getServed(),map:()=>scene?.getMapStatus(),network:()=>network.telemetry(),jukebox:()=>jukebox.telemetry(),television:()=>television.telemetry(),ambient:()=>audio.telemetry(),environment:()=>scene?.getEnvironmentStatus(),graphics:()=>scene?.getGraphics(),job:()=>structuredClone(jobTask),tableOrder:()=>structuredClone(tableOrder),listener:()=>scene?.getListener(),voice:()=>({mic:voice.micActive,transmitting:voice.transmitting,level:voice.level,status:voice.status,settings:{...settings.get()},...voice.telemetry() as object})}});
setInterval(()=>{
  if(!inGame||!scene||!world)return;
  const labels=scene.projectLabels?.()||[];
  $('#labels').innerHTML=labels.map(label=>{
    const speaking=label.local?voice.transmitting:voice.isSpeaking(label.id),mic=!label.npc&&world?.players[label.id]?.voice;
    return `<span class="world-label${speaking?' speaking':''}" style="left:${label.x}px;top:${label.y}px">${mic?`<i class="label-mic" aria-hidden="true">${uiIcon('mic')}</i>`:''}${e(label.name)}</span>`;
  }).join('');
  if(jobTask)renderJobCard();
  const table=world.tables[world.players[user?.id||'']?.currentTableId];
  const timer=document.querySelector('#turn-timer');if(timer&&table?.deadline)timer.textContent=`${Math.max(0,Math.ceil((table.deadline-serverNow())/1000))}s`;
},100);
