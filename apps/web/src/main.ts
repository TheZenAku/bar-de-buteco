import {adminConsole} from './admin/console';
import {itemCost,loadPrices,price as livePrice,setPrices} from './prices';
import './assets/fonts/neon-ui.css';
import './neon-ui.css';
import {gameUi} from './game-ui';
import {CONTROLS,createLobbyMenu,detailCard,keyGrid} from './lobby-menu';
import {createLobbyHero} from './lobby-hero';
import {createFullscreen} from './fullscreen';
import './lobby-hero.css';
import {createHudPanels} from './hud-panels';
import {createNotifications} from './notifications';
import {nearestInteraction,INTERACTABLES,canInteract,DEFAULT_SKIN,SKINS,ITEM_CATALOG,itemById,type PlayerCard,type Wardrobe,type WorldState,type PublicUser,type ChatMessage,type InventoryView,type ItemId} from '@bar/shared';
import './admin.css';
import {BarScene,BLIP_RADIUS} from './engine/BarScene';
import {CAMERA_LABELS,CAMERA_MODES,isCameraMode} from './engine/camera-rig';
import {BarNetwork} from './networking';
import {api,ApiError,escape as e} from './api';
import {BarAudio} from './audio';
import {JukeboxController,TelevisionController,type MediaController} from './jukebox';
import {nearestMediaSource,areaMix,hasStagePass,type MediaSystem,type Position} from '@bar/shared';
import {musicianPhase,musicianRole,onStage,type Interactable,type PlayerState} from '@bar/shared';
import './jukebox.css';
import {createLightDesk} from './light-desk';
import './light-desk.css';
import {createSettings,type GameSettings} from './settings';
import {VoiceChat} from './voice';
import {coins,itemImage,uiIcon} from './ui-icons';
import {VOICE} from '@bar/shared';
import './voice.css';
import './needs.css';
import {createNeedsHud} from './needs-hud';
import './minimap.css';
import {createMinimap} from './minimap';
import {AdmissionLifecycle,type AdmissionDeparture} from './admission-lifecycle';
import {NO_MOTO_INTENT,isRidingMoto,nearestFreeMoto} from '@bar/shared';
import {JOBS,canInteract as touching,stationInteractable,consumedOverTime,consumeMs,type JobTaskView} from '@bar/shared';
import type {TableOrderView} from './networking';
import {graphicsSettingsHtml,jobPanelHtml,jobPanelTick,jobsHtml,mediaPriceNote,nextGraphics,stageMinutes,stagePanelHtml,tableMenuHtml,tableMenuTotal} from './economy-ui';
import './economy.css';
import {createObjectiveBlip} from './objective-blip';
import {createConsumingHud} from './consuming-hud';
import {createBlackjackTable} from './blackjack/table';
import {createFoosballPanel} from './foosball/panel';
import {consumptions} from './consumption';
import {createPhone} from './phone/phone';
import {playerCardHtml} from './player-card';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=gameUi();
createLobbyMenu(document.querySelector<HTMLElement>('#lobby')!);
createLobbyHero(document.querySelector<HTMLElement>('#lobby')!);

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const hud=createHudPanels($('#game'));
const notices=createNotifications($('#toasts'));
createFullscreen($<HTMLButtonElement>('[data-fullscreen]'),text=>notices.show({variant:'acao',title:'Tela cheia',text}));
const needsHud=createNeedsHud($('#game'),notice=>notices.show(notice),()=>serverNow());
const minimap=createMinimap($('#game'));
const consumingHud=createConsumingHud($('#consuming'));
// The blackjack table's panel (blackjack/table.ts): it draws the room's table and sends bets and decisions.
const blackjackUi=createBlackjackTable($('#blackjack'),{send:(type,payload)=>network.send(type,payload),now:()=>serverNow(),
  balance:()=>wardrobe?.balance??inventory?.balance,volume:()=>settings.get().master,notify:(text,error)=>toast(text,error)});
// The pebolim panel (foosball/panel.ts): the table of the place taken, or of the one watched from beside it (foosballWatching).
const foosballUi=createFoosballPanel($('#foosball'),{send:(type,payload)=>network.send(type,payload),now:()=>serverNow(),
  balance:()=>wardrobe?.balance??inventory?.balance,volume:()=>settings.get().master,notify:(text,error)=>toast(text,error),
  closed:()=>{foosballWatching='';renderWorld();}});
let foosballWatching='';
/** At a pebolim table (playing or watching): the panel takes the keys and the mouse, so the scene steps aside. */
const atFoosball=()=>!$('#foosball').classList.contains('hidden');
const sceneActive=()=>inGame&&connected&&!activeModal&&!atFoosball();
// The backpack item last asked for: the room syncs a drink's prop, not which item a quick use is.
let usedItem='';
// What was in hand the last time the backpack was drawn (its Usar buttons wait for an empty hand).
let handShown='';
let user:PublicUser|undefined;
let world:WorldState|undefined;
let serverClockOffset=0;
const serverNow=()=>Date.now()+serverClockOffset;
let inGame=false,connected=false,authMode:'login'|'register'|'forgot'|'reset'='login';
let emailVerificationRequired=true;
let checkingSession=true;
let resetToken='',activeModal='',peopleKey='',blocked=new Set<string>();
// The people window: its tab, the player's round statistics (fetched when the account tab opens) and the connection.
let peopleTab:'people'|'account'='people',accountStats:{gamesPlayed:number;wins:number;losses:number;draws:number}|undefined;
let netStatus='Conectando…',netPing='— ms';
let scene:BarScene|undefined;
let lastFocus:HTMLElement|undefined;
const audio=new BarAudio();
const settings=createSettings();
const voice=new VoiceChat({sendPacket:packet=>network.sendBytes('voice',packet),sendState:state=>network.send('voice.state',state),notice:(text,error)=>toast(text,error),changed:()=>renderVoice()},settings);
const chatHistory:ChatMessage[]=[];
let administration:ReturnType<typeof adminConsole>|undefined;
let refreshingAdministration=false;
let wardrobe:Wardrobe|undefined;
let inventory:InventoryView|undefined;
let modalGeneration=0;
let watchingTv=false;
// Tonico's pending order and the current job task: private, sent by the room (table.state, job.state).
let tableOrder:TableOrderView|undefined;
let jobTask:JobTaskView|null=null;
const admission=new AdmissionLifecycle();
let leavingPromise:Promise<void>|undefined;
// The jukebox and the TVs are independent: separate controllers, players, panels and volumes.
// Either one in use quiets the ambient sound.
const mediaInUse={jukebox:false,tv:false};
const ambientFor=(kind:keyof typeof mediaInUse)=>(value:boolean)=>{mediaInUse[kind]=value;audio.setSuppressed(mediaInUse.jukebox||mediaInUse.tv);};
// The stage's screen and the bar's jukebox and TVs never play over each other: the louder area wins (areaMix).
const mix=(system:MediaSystem,listener:Position):number=>areaMix(listener,system,media.flatMap((m:MediaController)=>m.playingSystems()));
const jukebox=new JukeboxController({send:(type,payload)=>network.send(type,payload),now:serverNow,
  project:()=>null,clear:()=>false,screen:()=>{},ambient:ambientFor('jukebox'),mix});
// The video stays on the TV screens; panels and windows simply cover it, like anything in front of a real TV.
const television=new TelevisionController({send:(type,payload)=>network.send(type,payload),now:serverNow,
  project:id=>scene?.televisionProjection(id)??null,clear:id=>scene?.televisionClear(id)??false,
  screen:(id,visible)=>scene?.showTelevision(id,visible),ambient:ambientFor('tv'),mix});
const media:MediaController[]=[jukebox,television];
const tvBack=document.createElement('button');tvBack.id='leave-tv';tvBack.className='button secondary';tvBack.textContent='Voltar ao jogo · Esc';tvBack.hidden=true;tvBack.onclick=()=>stopWatchingTv();app.append(tvBack);
function stopWatchingTv():void {watchingTv=false;document.body.classList.remove('watching-tv');tvBack.hidden=true;scene?.watchTelevision();scene?.setEnabled(sceneActive());}
function openJukebox(id:string):void {
  if(!inGame||!connected||!world?.jukeboxes?.[id])return;
  stopWatchingTv();showModal('JUKEBOX',mediaPriceNote('jukebox',id,inventory?.balance)+jukebox.panelHtml(id),'jukebox');jukebox.attachPanel($('#modal-content'));
}
function openTelevision(id:string):void {
  if(!inGame||!connected||!world?.televisions?.[id])return;
  stopWatchingTv();showModal(television.selectedSystemLabel(id),mediaPriceNote('tv',id,inventory?.balance)+television.panelHtml(id),'television');television.attachPanel($('#modal-content'));
}
/** At the stage's steps: the pass (bought here) or how long the current one lasts. */
function openStage(price:number):void {
  const self=world?.players[user?.id??''];if(!inGame||!connected||!self)return;
  stopWatchingTv();showModal('PALCO',stagePanelHtml(price,self.stageUntil??0,serverNow(),inventory?.balance),'stage');
}
function savedSkin():string {return user?.equippedSkin??DEFAULT_SKIN;}

function toast(message:string,error=false):void {notices.show({variant:error?'aviso':'acao',title:error?'Não foi possível':'No Boteco',text:message});}
function errorMessage(error:unknown):string{return error instanceof Error?error.message:'Algo deu errado. Tente novamente.';}
function setBusy(form:HTMLFormElement,busy:boolean):void {form.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=busy);}
/** The entry's Conta tab: the access options as the reference's list, the chosen one as its detail card. */
function renderAuth(message=''):void {
  const formField=(label:string,name:string,type:string,placeholder:string,extra='')=>`<label>${label}<input name="${name}" type="${type}" placeholder="${placeholder}" required ${extra}></label>`;
  const go=uiIcon('chevronRight');
  // [action, label, icon] in a fixed order; the detail card is the current option's.
  const options:Array<[string,string,string]>=user?[['','Continuar','user'],['logout','Usar outra conta','logOut']]
    :[['auth-login','Entrar','logIn'],['auth-register','Criar conta','userPlus'],authMode==='reset'?['auth-reset','Nova senha','key']:['auth-forgot','Recuperar senha','key']];
  const current=user?'':`auth-${authMode}`,[,title,iconName]=options.find(option=>option[0]===current)!;
  let intro='',content='';
  if(user){intro=`Olha quem chegou. ${e(user.displayName)}, sua cadeira está esperando.`;content=`<div class="returning-user"><span class="profile-initial" style="--avatar:${e(user.color)}">${e(user.displayName.slice(0,1).toUpperCase())}</span><div><b>${e(user.displayName)}</b><small>${e(user.email)}</small></div></div><button data-action="enter" class="button primary full">Entrar no bar ${go}</button>${!user.verified&&emailVerificationRequired?'<button data-action="resend" class="text-button full">Reenviar confirmação de e-mail</button>':''}`;}
  else if(authMode==='login'){intro='Boa noite, vizinho. Entre na sua conta: a casa é sua.';content=`<form id="auth-form" data-mode="login">${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${formField('Senha','password','password','Sua senha','autocomplete="current-password"')}<button type="button" data-action="auth-forgot" class="forgot-link">Esqueci minha senha</button><button class="button primary full" type="submit">Entrar no bar ${go}</button></form>`;}
  else if(authMode==='register'){intro='Chega mais. Uma conta, muitas histórias pra contar.';content=`<form id="auth-form" data-mode="register"><div class="field-row">${formField('Seu nome','displayName','text','Como te chamam?','autocomplete="nickname" minlength="2" maxlength="24"')}${formField('Usuário','username','text','seu_apelido','autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24"')}</div>${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${formField('Senha','password','password','Pelo menos 10 caracteres','autocomplete="new-password" minlength="10" maxlength="128"')}<button class="button primary full" type="submit">Criar minha conta ${go}</button><p class="fine-print">${emailVerificationRequired?'Confirme seu e-mail para entrar no bar.':'Sua conta será ativada automaticamente. Depois, é só entrar.'}</p></form>`;}
  else if(authMode==='forgot'){intro='Acontece nas melhores. Vamos mandar um link para você criar uma nova senha.';content=`<form id="auth-form" data-mode="forgot">${formField('E-mail da conta','email','email','voce@exemplo.com','autocomplete="email"')}<button class="button primary full" type="submit">Recuperar acesso ${go}</button></form>`;}
  else {intro='Um novo começo. Escolha uma nova senha para sua conta.';content=`<form id="auth-form" data-mode="reset">${formField('Nova senha','password','password','Pelo menos 10 caracteres','autocomplete="new-password" minlength="10" maxlength="128"')}<button class="button primary full" type="submit">Salvar nova senha ${go}</button></form>`;}
  $('#auth-list').innerHTML=options.map(([action,label,name])=>`<button type="button" ${action?`data-action="${action}"`:''} aria-current="${action===current}">${uiIcon(name)}<span>${label}</span>${go}</button>`).join('');
  $('#auth-content').innerHTML=detailCard(title,iconName,`<p class="detail-info">${intro}</p>${content}<div id="auth-message" class="form-message ${message?'':'hidden'}" role="status">${e(message)}</div>`,`${uiIcon('signal')} Sem instalação. Só chegar.`,`${options.findIndex(option=>option[0]===current)+1} / ${options.length}`);
  $('#auth-content').setAttribute('aria-busy',String(checkingSession));
  if(checkingSession){$('#lobby-account').querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(control=>control.disabled=true);if(!message)authMessage('Verificando sua conta…');}
}
function authMessage(message:string,error=false):void {const node=$('#auth-message');node.className=`form-message ${error?'error':''}`;node.textContent=message;}
/** T, Enter and Resenhar: shows the chat if hidden and opens its box (a hidden field cannot take the focus, so first). */
function focusChat():void {
  hud.open('chat');const panel=$('[data-panel="chat"]'),input=$('#chat-input');
  panel.classList.add('chat-open');input.focus();
  if(document.activeElement===input)$('[data-action="chat"]').removeAttribute('data-unread');else panel.classList.remove('chat-open');
}
function showModal(title:string,content:string,type:string):void {closeDesk();modalGeneration++;media.forEach(m=>m.detachPanel());if(watchingTv)stopWatchingTv();administration?.destroy();administration=undefined;lastFocus=document.activeElement as HTMLElement;activeModal=type;$('.modal').classList.toggle('admin-modal',type==='admin');$('.modal').classList.toggle('desk-modal',type==='lights');$('#modal').classList.toggle('desk-backdrop',type==='lights');$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#modal').classList.remove('hidden');scene?.setEnabled(false);$('.modal-header button').focus();}
/** The light desk's panel, while open, and the share of the screen it covers on the right (BarScene.watchStage). */
let desk:ReturnType<typeof createLightDesk>|undefined,deskCover=0;
const measureDesk=()=>{const left=$('.modal').getBoundingClientRect().left;deskCover=innerWidth>760?Math.max(0,1-left/innerWidth):0;};
/** Something plays on the stage: a video on the telão, or a musician past picking up the instrument. */
const stagePlaying=()=>world?.televisions?.telao?.status==='playing'||Object.values(world?.musicians??{}).some(m=>!!m.playerId&&['comecando','loop'].includes(musicianPhase(m,serverNow())?.phase??''));
function closeDesk():void {if(!desk)return;desk.destroy();desk=undefined;removeEventListener('resize',measureDesk);document.body.classList.remove('at-light-desk');scene?.watchStage();}
/** E at the light desk (the room sent lights.open): the show's panel, with the camera out in the backyard on the stage. */
function openLightDesk():void {
  stopWatchingTv();showModal('Mesa de luz','<div id="light-desk"></div>','lights');
  desk=createLightDesk($('#light-desk'),{set:patch=>network.send('show.set',patch),cue:cue=>network.send('show.cue',{cue}),now:serverNow,playing:stagePlaying,
    notify:text=>notices.show({variant:'acao',title:'Mesa de luz',text})});
  desk.update(world?.stageShow);
  // The HUD steps aside (like watching a TV): the show and the panel only.
  document.body.classList.add('at-light-desk');
  measureDesk();addEventListener('resize',measureDesk);scene?.watchStage(()=>deskCover);
}
function closeModal():void {closeDesk();modalGeneration++;media.forEach(m=>m.detachPanel());administration?.destroy();administration=undefined;activeModal='';$('#modal').classList.add('hidden');scene?.setEnabled(inGame&&connected);lastFocus?.focus();}

const network=new BarNetwork({
  input:()=>scene?.getInput()??{dx:0,dz:0,running:false,rotation:0},
  motoInput:()=>scene?.getMotoInput()??NO_MOTO_INTENT,
  moto:(id,body)=>scene?.predictMoto(id,body),
  skin:savedSkin,
  position:position=>scene?.setLocal(position),
  state:state=>{world=state;serverClockOffset=state.serverTime-Date.now();scene?.setWorld(state,user!.id);media.forEach(m=>m.setWorld(state,user!.id,connected));desk?.update(state.stageShow);renderWorld();},
  jukebox:openJukebox,
  television:openTelevision,
  shop:()=>{void openShop().catch(error=>toast(errorMessage(error),true));},
  lights:openLightDesk,
  stage:update=>{
    if(update.open){openStage(update.price??livePrice('stage:pass'));return;}
    if(update.until>0){if(activeModal==='stage')closeModal();notices.show({variant:'acao',title:'Palco liberado',text:`Seu ingresso vale ${stageMinutes(update.until,serverNow())} minutos. Suba pela escada!`});}
    else if(update.message)notices.show({variant:'aviso',title:'Palco',text:update.message});
  },
  voice:frame=>voice.receive(frame),
  itemLost:item=>notices.show({variant:'aviso',title:'Sumiu do bolso',text:`Enquanto você estava apagado, levaram: ${itemById(item)?.name??item}.`}),
  inventory:view=>{inventory={stacks:view.stacks,capacity:view.capacity,usedSlots:view.usedSlots,balance:view.balance??inventory?.balance??wardrobe?.balance??0,history:view.history??inventory?.history??[]};if(wardrobe)wardrobe={...wardrobe,balance:inventory.balance};renderBalance();if(activeModal==='inventory')renderInventory();},
  inventoryResult:()=>{},
  wallet:change=>{
    if(inventory)inventory={...inventory,balance:change.balance};if(wardrobe)wardrobe={...wardrobe,balance:change.balance};
    renderBalance();blackjackUi.refresh();foosballUi.refresh();
    if(change.reason==='job'&&change.delta)notices.show({variant:'acao',title:'Trabalho feito',text:`+${change.delta} moedas na carteira.`});
    if(change.reason==='refund'&&change.delta)notices.show({variant:'acao',title:'Estorno',text:`${change.delta} moedas voltaram para a carteira.`});
  },
  table:update=>{
    tableOrder=update.status==='ordered'?update.order:undefined;
    if(update.status==='delivered')notices.show({variant:'acao',title:'Chegou o pedido',text:update.message??'Ficou tudo na mesa. Bom apetite!'});
    if(update.status==='ordered'&&update.message)notices.show({variant:'aviso',title:'Pedido',text:update.message});
    if(update.status==='cancelled'&&update.message)notices.show({variant:'aviso',title:'Pedido cancelado',text:update.message});
    if(activeModal==='table')renderTableMenu();
  },
  job:update=>{
    if(update.task!==undefined)jobTask=update.task;
    if(update.message)notices.show({variant:update.task?'acao':'aviso',title:'Trabalho',text:update.message});
    if(activeModal==='jobs')$('#modal-content').innerHTML=jobsHtml(world,jobTask);
    renderJobCard();
  },
  adminWorld:snapshot=>administration?.world(snapshot),
  // The room's price table: on entering and whenever the administration changes a price (Preços).
  prices:table=>setPrices(table),
  phoneCall:call=>phone.call(call),
  phonePing:ping=>phone.ping(ping),
  phoneVideo:bytes=>phone.videoFrame(bytes),
  foosballOpen:({tableId,watching,reason})=>{foosballWatching=watching?tableId:'';if(watching&&reason)notices.show({variant:'aviso',title:'Pebolim',text:`${reason}`});renderWorld();},
  foosballFrame:frame=>{foosballUi.frame(frame);scene?.foosballFrame(frame);},
  removed:(kind,reason)=>{void leaveBar().then(()=>{
    if(kind==='ban'){user=undefined;renderAuth();authMessage(`Conta banida. ${reason} Peça a um administrador para remover o banimento.`,true);}
    else authMessage(`Você foi expulso desta participação. ${reason} Sua conta não está banida; pode entrar novamente.`,true);
  });},
  chat:message=>{
    if(!inGame||!user)return;chatHistory.push(message);if(chatHistory.length>100)chatHistory.shift();renderChat(true);
    if(hud.isHidden('chat')&&message.playerId!==user.id&&!blocked.has(message.playerId))$('[data-action="chat"]').toggleAttribute('data-unread',true);
  },
  // A media panel waiting for its own command shows the refusal itself.
  error:message=>{if(!media.some(m=>m.reject(message)))toast(message,true);},
  ping:ms=>{netPing=`${ms} ms`;renderNet();},
  status:(message,isConnected)=>{
    connected=isConnected;scene?.setEnabled(sceneActive());audio.setActive(inGame&&connected);
    if(!isConnected&&watchingTv)stopWatchingTv();media.forEach(m=>m.setWorld(world,user?.id??'',connected));
    if(!isConnected)phone.disconnected();
    netStatus=isConnected?'Na área!':'Reconectando…';renderNet();
    $('#waiting-message').textContent=message;
    $('#waiting').classList.toggle('hidden',isConnected||!inGame);
    $('#connection').textContent=message;
    $('#connection').classList.toggle('hidden',isConnected||!inGame);
    if(isConnected)voice.syncState();
  }
});

/** The phone (K): calls through the room, Highzap, Highgram and HighBank through the API (apps/web/src/phone). */
const phone=createPhone($('#game'),{
  user:()=>user,world:()=>world,serverNow,
  send:(type,payload)=>network.send(type,payload),
  sendBytes:(type,bytes)=>network.sendBytes(type,bytes),
  notice:(title,text,initials)=>notices.show({variant:'mensagem',title,text,initials}),
  error:text=>toast(text,true),
  wallet:()=>wardrobe?.balance??inventory?.balance,
  // A Pix changed the wallet in the API: the HUD shows it now, and the room reads it again (inventory.sync).
  balance:value=>{if(inventory)inventory={...inventory,balance:value};if(wardrobe)wardrobe={...wardrobe,balance:value};renderBalance();network.send('inventory.sync');},
  capture:(width,height,quality)=>scene?scene.capture(width,height,quality):Promise.resolve(null),
  setSelfie:on=>scene?.setSelfie(on),
  setZoom:factor=>scene?.setZoom(factor),
  canvas:$<HTMLCanvasElement>('#world'),
  microphone:{active:()=>voice.micActive,set:on=>voice.setMicrophone(on),unavailable:()=>voice.unavailableReason},
  setCallPeer:id=>voice.setCallPeer(id),
  volume:()=>settings.get().master,
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
    await voice.enter();phone.enter();
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
  phone.leave();stopWatchingTv();media.forEach(m=>m.reset());voice.leave();audio.setActive(false);
  inGame=false;connected=false;tableOrder=undefined;jobTask=null;renderJobCard();objectiveBlip.render(null);stageBlip.render(null);telaoBlip.render(null);shopBlip.render(null);deskBlip.render(null);notices.clear();needsHud.reset();minimap.reset();$('[data-action="chat"]').removeAttribute('data-unread');wardrobe=undefined;inventory=undefined;accountStats=undefined;netPing='— ms';usedItem='';consumingHud.clear();renderBalance();await network.disconnect();world=undefined;chatHistory.length=0;renderChat();scene?.setEnabled(false);scene?.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:0},'');
  $('#labels').replaceChildren();$('#game').classList.add('hidden');$('#lobby').classList.remove('hidden');$('#blackjack').classList.add('hidden');blackjackUi.reset();$('#foosball').classList.add('hidden');foosballUi.reset();foosballWatching='';closeModal();renderAuth();
  })();
  const tracked=task.finally(()=>{admission.completeExit(departure);if(leavingPromise===tracked)leavingPromise=undefined;});
  leavingPromise=tracked;return tracked;
}
/** `arrived`: the last line is a message that just came in (it slides in). */
function renderChat(arrived=false):void {
  const messages=$('#messages');const atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<50;
  const lines=chatHistory.filter(m=>!blocked.has(m.playerId));
  messages.innerHTML='<div class="chat-welcome">A conversa só chega a quem está por perto.<br>Uma boa noite começa com um oi.</div>'+lines.map((m,i)=>`<div class="chat-line${m.system?' system':''}${arrived&&i===lines.length-1&&m===chatHistory.at(-1)?' fresh':''}"><b>${e(m.displayName)}</b><span>${e(m.text)}</span></div>`).join('');
  if(atBottom||!$('[data-panel="chat"]').classList.contains('chat-open'))messages.scrollTop=messages.scrollHeight;
}
/**
 * Papo no Balcão: idle, only its lines over the scene; focusChat opens the box (panel, field) and it closes once the focus
 * leaves the chat (Esc, sending, a click on the scene), back at the newest line.
 */
{
  const panel=$('[data-panel="chat"]'),messages=$('#messages');
  panel.addEventListener('focusout',event=>{if(!panel.contains(event.relatedTarget as Node|null)){panel.classList.remove('chat-open');messages.scrollTop=messages.scrollHeight;}});
}
/** The wallet in the money panel; written only when it changes, since the room's patches call this ten times a second. */
function renderBalance():void {const node=$('#hud-balance'),text=wardrobe?wardrobe.balance.toLocaleString('pt-BR'):'…';if(node.textContent!==text)node.textContent=text;}
function renderWorld():void {
  if(!world||!user)return;
  const self=world.players[user.id];
  renderBalance();
  needsHud.update(self);
  const ordering=self?.interactionState==='counter'&&self.animationState!=='drink';
  $('#dance-button').setAttribute('aria-pressed',String(self?.animationState==='dance'));
  $('#smoke-button').setAttribute('aria-pressed',String(self?.interactionState==='smoke'));
  $('#cigarette-button').setAttribute('aria-pressed',String(self?.interactionState==='cigarette'));
  $('#kick-button').classList.toggle('hidden',self?.skin!=='rafael');
  const station=jobStation(),atStation=!!station&&!!self&&!self.interactionState&&!self.currentTableId&&touching(stationInteractable(station),self);
  const interaction=self?nearestObject(self):undefined;
  const moto=self&&!interaction&&!atStation?freeMotoNear(self):undefined;
  // Near a free spot on the stage: its clips download now, so taking it starts without a wait.
  if(interaction?.type==='musician')scene?.preloadMusician(interaction.spot!);
  const context=$('#context');
  const seated=!!self?.interactionState?.startsWith('seat-')&&self.animationState==='sit';
  $('#table-cta').classList.toggle('hidden',!seated);$('#table-cta-label').textContent=tableOrder?(tableOrder.stage==='carrying'?'Pedido a caminho':'Pedido no balcão'):workersOnShift().length?'Fazer pedido':'Pedir ao Tonico';
  context.classList.toggle('hidden',!self||self.animationState==='kick'||(!!self.condition&&self.condition!=='normal'&&self.condition!=='recovering')||(!self.interactionState&&!self.currentTableId&&!interaction&&!atStation&&!moto));
  $('#context-label').textContent=isRidingMoto(self?.interactionState)?'para descer':self?.currentTableId?'Levantar da mesa':ordering?'Cancelar pedido':seated&&tableOrder?'Esperando o pedido':self?.interactionState==='job'?'Parar a tarefa':atStation?`Trabalho · ${station!.label}`:self?.interactionState?.startsWith('toilet-')?'Sair do banheiro':self?.interactionState?.startsWith('mictorio-')?'Sair do mictório':self?.animationState==='stand-up'?'Levantando…':self?.interactionState==='smoke'?(self.animationState==='smoke-stop'?'Apagando o cigarro…':'Apagar o cigarro'):self?.interactionState==='cigarette'?'Fumando um cigarro…':self?.interactionState==='vomit'?'Passando mal…':self?.interactionState?.startsWith('stage-')?musicianLabel(self.interactionState):self?.interactionState?'Levantar / encerrar':interaction?.type==='door'?`${world.doors?.[interaction.id]?.open===false?'Abrir':'Fechar'} a porta · ${interaction.label}`:interaction?.type==='stage'?stageLabel(self!):interaction?.label||(moto?'para subir':'');
  const event=world.event;
  const eventName={BLACKOUT:'Quem esqueceu de pagar a luz?',DRUNK_NPC:'O Zé acordou inspirado.',PARTY:'Essa rodada é de dança!'};
  $('#event-banner').classList.toggle('hidden',!event?.type);
  if(event?.type)$('#event-banner').innerHTML=`<span class="event-spark">${uiIcon('party')}</span><div><small>Aconteceu no bar</small><b>${eventName[event.type]}</b></div><span class="event-time">${Math.max(0,Math.ceil((event.startedAt+event.durationMs-serverNow())/1000))}s</span>`;
  const table=self?.currentTableId?world.tables[self.currentTableId]:undefined;
  $('#blackjack').classList.toggle('hidden',!table);
  if(table)blackjackUi.update(table,user!.id);
  else blackjackUi.reset();
  // Pebolim: the table of the place taken; else the one watched (until the player walks away from it).
  const seatedAt=self?.interactionState?.startsWith('foosball:')?self.interactionState.slice('foosball:'.length):'';
  if(seatedAt)foosballWatching='';
  const foosballId=seatedAt||foosballWatching,foosball=foosballId?world.foosball?.[foosballId]:undefined,wasOpen=atFoosball();
  $('#foosball').classList.toggle('hidden',!foosball);
  if(foosball)foosballUi.update(foosball,user!.id,!seatedAt);else if(wasOpen)foosballUi.reset();
  if(wasOpen!==!!foosball)scene?.setEnabled(sceneActive());
  if(activeModal==='people')renderPeopleContent();
  const hand=inHand()??'';if(hand!==handShown){handShown=hand;renderInventory();}
  if(activeModal==='admin')renderAdminPosition();
  renderJobCard();
  // Also on every patch, not only on the 100 ms tick: a quick use lasts two seconds.
  consumingHud.render(consumptions(world,self,usedItem,serverNow()),serverNow());
}
function jobStation(){return jobTask?.station;}
/** Players working the bar right now, who take table orders like Tonico (never the local player). */
function workersOnShift():Array<{id:string;name:string}> {
  return Object.values(world?.players??{}).filter(p=>p.job&&p.connected!==false&&p.id!==user?.id).map(p=>({id:p.id,name:p.displayName}));
}
let jobPanelKey='';
/** The job panel (draggable, collapsible, hideable like the other HUD panels) and the objective marker in the scene. */
function renderJobCard():void {
  const task=inGame?jobTask:null,self=world?.players[user?.id??''],station=jobStation();
  // The objective marker exists only here: the room sends the task to its worker alone, so nobody else can draw it.
  const objective=task&&station&&!task.startedAt?{x:station.x,y:station.y,z:station.z}:null;
  scene?.setObjective(objective);minimap.setObjective(objective);
  if(!task){jobPanelKey='';hud.setAvailable('job',false);return;}
  // Rebuilt only when the task changes; rewriting it ten times a second made its buttons miss clicks.
  const near=!!station&&!!self&&touching(stationInteractable(station),self),key=`${task.stationId}|${task.startedAt}|${task.tasks}|${task.earned}|${near}`;
  if(key!==jobPanelKey){jobPanelKey=key;$('#job-body').innerHTML=jobPanelHtml(task,near);}
  jobPanelTick($('#job-body'),$('#job-summary'),task,serverNow());
  // Filled before it shows, so the layout fits the whole panel on screen.
  hud.setAvailable('job',true);
}
const objectiveBlip=createObjectiveBlip($<HTMLCanvasElement>('#job-blip'));
// Where the stage is entered and its pass bought: the foot of its steps, in the stage's magenta (--blip-stage). Its
// badge names it only to the player standing on its ring; the ring alone marks it from afar.
const stageBlip=createObjectiveBlip($<HTMLCanvasElement>('#stage-blip'),{accent:['--blip-stage','#ff47c2'],edge:false,within:BLIP_RADIUS});
// Where a video is put on the telão: the middle of the stage's front edge, in teal (--blip-telao), named the same way.
// Both rings show only in the backyard.
const telaoBlip=createObjectiveBlip($<HTMLCanvasElement>('#telao-blip'),{accent:['--blip-telao','#3adfd7'],edge:false,within:BLIP_RADIUS});
// The house's shop: its gold ring in the backyard (--blip-shop), named to the player standing on it.
const shopBlip=createObjectiveBlip($<HTMLCanvasElement>('#shop-blip'),{accent:['--blip-shop','#fac416'],edge:false,within:BLIP_RADIUS});
// The light desk up on the stage, in the logo's violet (--blip-desk): its ring shows in the backyard, on the deck too.
const deskBlip=createObjectiveBlip($<HTMLCanvasElement>('#desk-blip'),{accent:['--blip-desk','#a77bff'],edge:false,within:BLIP_RADIUS});
const telaoLabel=()=>world?.televisions?.telao?.status==='playing'?`Telão · pôr vídeo na fila · ${livePrice('media:telao')} moedas`:`Vídeo no telão · ${livePrice('media:telao')} moedas`;
/** The parked delivery bike within reach, on foot and free: E gets on it. Anything else within reach comes first. */
function freeMotoNear(self:PlayerState){
  return self.interactionState||self.currentTableId?undefined:nearestFreeMoto(self,Object.values(world?.motos??{}));
}
/** What E uses: a stage musician's spot only from up on the stage, and only while nobody plays there; the light desk from up there. */
function nearestObject(self:PlayerState):Interactable|undefined {
  return nearestInteraction(self,object=>object.type==='lights'?onStage(self):object.type!=='musician'||(onStage(self)&&!world?.musicians?.[object.spot!]?.playerId));
}
/** Playing on the stage: E puts the instrument back (the stop clip plays before the player is free again). */
function musicianLabel(interaction:string):string {
  const spot=interaction.slice('stage-'.length),state=world?.musicians?.[spot],phase=state?musicianPhase(state,serverNow())?.phase:undefined;
  if(phase==='saindo'||phase==='fim'||state?.stopping)return spot==='vocal'?'Largando o microfone…':'Guardando o instrumento…';
  return musicianRole(spot).stop;
}
const performing=()=>!!world?.players[user?.id??'']?.interactionState?.startsWith('stage-');
function stageLabel(self:{stageUntil?:number}):string {return hasStagePass(self)?`Palco liberado · ${stageMinutes(self.stageUntil!,serverNow())} min`:`Subir no palco · ${livePrice('stage:pass')} moedas`;}
function openTableMenu():void {
  const self=world?.players[user?.id??''];
  if(!self?.interactionState?.startsWith('seat-')){toast('Sente-se a uma mesa (E perto de uma cadeira) para fazer um pedido.');return;}
  showModal(workersOnShift().length?'FAZER PEDIDO':'PEDIR AO TONICO','','table');renderTableMenu();
}
function renderTableMenu():void {$('#modal-content').innerHTML=tableMenuHtml(inventory?.balance??0,tableOrder,workersOnShift());}
function openJobs():void {showModal('Trabalhar no bar',jobsHtml(world,jobTask),'jobs');}
function interact():void {
  if(!connected||!world||!user||activeModal)return;
  const self=world.players[user.id];if(!self)return;
  if(self.currentTableId){blackjackUi.requestLeave();return;}
  if(self.interactionState.startsWith('foosball:')||foosballWatching){foosballUi.requestLeave();return;}
  if(self.interactionState){network.send('player.interact',{objectId:'stand'});return;}
  const station=jobStation();
  if(station&&touching(stationInteractable(station),self)){network.send('job.work');return;}
  const object=nearestObject(self);
  if(!object){const moto=freeMotoNear(self);if(moto)network.send('moto.mount',{motoId:moto.id});return;}
  if(object.type==='counter'){orderDrink();return;}
  if(object.type==='blackjack')network.send('blackjack.join',{tableId:object.id});
  else if(object.type==='foosball')network.send('foosball.join',{tableId:object.id});
  else network.send('player.interact',{objectId:object.id});
}
/** At the counter: choose what Magrão serves. He charges on ordering; the choice travels with the order and shows in the hand. */
/** What the local player has in hand and is still having, or undefined with empty hands. */
function inHand():string|undefined {const self=world?.players[user?.id??''];return self?.holding&&(self.holdingUntil??0)>serverNow()?self.holding:undefined;}
function orderDrink():void {
  const held=inHand();if(held){toast(`Ainda na mão: ${itemById(held)?.name??held}. Termine antes de pedir outra bebida.`);return;}
  const option=(id:'garrafa'|'copo',hint:string)=>{const item=itemById(id)!;return `<button class="button primary" data-action="order" data-item="${id}"><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><span><b>${e(item.name)} · ${coins(itemCost(id))}</b><small>${hint}</small></span></button>`;};
  showModal('PEDIR AO MAGRÃO',`<p class="modal-description">O Magrão cobra, prepara e entrega. Você bebe quando ele terminar. Carteira: ${coins(inventory?.balance??0)}</p><div class="drink-choice">${option('garrafa','Cerveja na garrafa')}${option('copo','Chopp no copo')}</div><p class="fine-print">Sentado numa mesa? Peça comida e bebida ao Tonico com T.</p>`,'order');
}
/** F: lights a cigarette where the player stands, or puts it out (the room plays both). */
function smoke():void {
  if(!connected||activeModal||!world||!user||performing())return;
  const self=world.players[user.id];
  if(self?.interactionState&&self.interactionState!=='smoke'){toast('Encerre a ação atual antes de acender um cigarro.');return;}
  network.send('player.emote',{emote:'smoke'});
}
/** Shift+F: a whole cigarette where the player stands, from the pack to the butt stepped on (about 18 s, held still). */
function cigarette():void {
  if(!connected||activeModal||!world||!user||performing())return;
  const self=world.players[user.id];
  if(self?.interactionState){toast(self.interactionState==='cigarette'?'Você já está fumando um cigarro.':'Encerre a ação atual antes de acender um cigarro.');return;}
  network.send('player.emote',{emote:'cigarette'});
}
function kick():void {
  if(!connected||activeModal||!world||!user||performing())return;
  const self=world.players[user.id];
  if(self?.skin!=='rafael')return;
  network.send('player.emote',{emote:'kick'});
}
let shownCard:PlayerCard|undefined;
/** A player's card (click them in the bar): the number to save and their Highgram (apps/web/src/player-card.ts). */
async function playerCard(id:string):Promise<void> {
  // A card already open (after saving or following) is refreshed in place.
  if(activeModal!=='player-card'||shownCard?.id!==id){shownCard=undefined;showModal(id===user?.id?'Sua ficha':'Ficha do jogador','<p class="modal-description">Carregando a ficha…</p>','player-card');}
  const opened=modalGeneration;
  try{
    const card=await api<PlayerCard>(`/phone/card/${encodeURIComponent(id)}`);
    if(activeModal!=='player-card'||modalGeneration!==opened)return;
    shownCard=card;$('#modal-content').innerHTML=playerCardHtml(card);
  }catch(error){if(activeModal==='player-card'&&modalGeneration===opened)$('#modal-content').innerHTML=`<p class="modal-description">${e(errorMessage(error))}</p>`;}
}
/** Pessoas no bar: who is around, with the occupancy and the connection, and the player's own place (Seu lugar no bar). */
function people(tab:'people'|'account'='people'):void {
  peopleKey='';peopleTab=tab;
  const tabs=([['people','Quem está por perto'],['account','Seu lugar no bar']] as const).map(([id,label])=>`<button role="tab" id="people-tab-${id}" data-action="people-tab" data-tab="${id}" aria-selected="${id===tab}" aria-controls="people-panel"${id===tab?'':' tabindex="-1"'}>${label}</button>`).join('');
  showModal('Pessoas no bar',`<nav class="menu-tabs people-tabs" role="tablist" aria-label="Pessoas no bar">${tabs}</nav><div class="menu-line" aria-hidden="true"></div><div id="people-panel" class="people-panel" role="tabpanel" aria-labelledby="people-tab-${tab}"></div>`,'people');
  renderPeopleContent();
  if(tab==='account')void loadAccountStats();
}
function selectPeopleTab(tab:'people'|'account'):void {
  if(activeModal!=='people')return;
  peopleTab=tab;peopleKey='';
  document.querySelectorAll<HTMLElement>('[data-action="people-tab"]').forEach(button=>{const on=button.dataset.tab===tab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
  $('#people-panel').setAttribute('aria-labelledby',`people-tab-${tab}`);
  renderPeopleContent();
  if(tab==='account')void loadAccountStats();
}
async function loadAccountStats():Promise<void> {
  try{accountStats=await api<{gamesPlayed:number;wins:number;losses:number;draws:number}>('/stats');renderPeopleContent();}catch(error){toast(errorMessage(error),true);}
}
/** The connection in the people window, written in place: the ping changes every few seconds, the list does not. */
function renderNet():void {
  for(const [selector,text] of [['#hud-status',netStatus],['#ping',netPing]] as const){const node=document.querySelector(selector);if(node&&node.textContent!==text)node.textContent=text;}
}
function renderPeopleContent():void {
  const panel=document.querySelector<HTMLElement>('#people-panel');if(activeModal!=='people'||!panel)return;
  if(peopleTab==='account'){
    const skin=SKINS.find(skin=>skin.id===world?.players[user?.id??'']?.skin)?.name||'Carregando';
    const key=JSON.stringify(['account',user?.displayName,user?.email,user?.color,skin,accountStats]);
    if(key===peopleKey)return;peopleKey=key;
    const stats=accountStats?`<div><b>${accountStats.gamesPlayed}</b><span>rodadas</span></div><div><b>${accountStats.wins}</b><span>vitórias</span></div><div><b>${accountStats.draws}</b><span>empates</span></div><div><b>${accountStats.losses}</b><span>derrotas</span></div>`:'Carregando suas rodadas…';
    panel.innerHTML=`<div class="account-card"><span class="profile-initial" id="avatar" style="--avatar:${e(user?.color)}">${e(user?.displayName.slice(0,1).toUpperCase())}</span><h3 id="hud-name">${e(user?.displayName)}</h3><p id="hud-skin">${e(skin)} · B.A.R.</p><p>${e(user?.email)}</p></div><div id="statistics" class="statistics">${stats}</div><button class="button primary full" data-action="player-card" data-id="${e(user?.id)}">${uiIcon('idCard')} Sua ficha e seu número</button><button class="button secondary full" data-action="leave">Voltar à entrada</button><button class="text-button full" data-action="logout">Sair da conta</button>`;
    return;
  }
  const players=Object.values(world?.players||{}).filter(player=>player.id!==user?.id);
  const key=JSON.stringify(['people',world?.occupancy,world?.capacity,...players.map(p=>[p.id,p.displayName,p.connected,p.voice,blocked.has(p.id),voice.isMuted(p.id)])]);
  if(key===peopleKey)return;peopleKey=key;
  const occupancy=world?.occupancy??0,capacity=world?.capacity??0;
  panel.innerHTML=`<div class="occupancy"><div class="status-row"><span>${uiIcon('users')} No bar agora</span><b id="occupancy">${occupancy} / ${capacity}</b></div><div class="hud-track"><i id="occupancy-fill" style="width:${capacity?Math.min(100,occupancy/capacity*100):0}%"></i></div><div class="status-row net-row"><span>${uiIcon('signal')} Sua conexão</span><b><span id="hud-status">${e(netStatus)}</span> · <span id="ping">${e(netPing)}</span></b></div></div><p class="modal-description">Você vê as pessoas próximas a você.</p><div class="people-list">${players.map(player=>`<div class="person"><span class="profile-initial" style="--avatar:${e(player.color)}">${e(player.displayName[0])}</span><div><b>${e(player.displayName)}</b><small>${player.connected?(player.voice?'No bar · microfone ligado':'No bar'):'Ausente'}</small></div><button class="mini-button" data-action="player-card" data-id="${e(player.id)}">Ficha</button><button class="mini-button" data-action="voice-mute" data-id="${e(player.id)}" aria-pressed="${voice.isMuted(player.id)}">${voice.isMuted(player.id)?'Ouvir voz':'Silenciar voz'}</button><button class="mini-button" data-action="block" data-id="${e(player.id)}">${blocked.has(player.id)?'Desbloquear':'Bloquear'}</button><button class="mini-button" data-action="report" data-id="${e(player.id)}">Denunciar</button></div>`).join('')||'<div class="empty-state">Por enquanto, só você por aqui.<br>Abra outra janela e convide alguém para chegar.</div>'}</div><p class="fine-print">Silenciar voz vale só para você. Bloquear oculta mensagens de chat e corta a voz nos dois sentidos. Denúncias são encaminhadas à administração.</p>`;
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
      return `<article class="mail-message"><small>${e(message.to)}</small><h3>${e(message.subject)}</h3><p>${e(message.text)}</p>${action?`<button class="button primary" data-action="${action}" data-token="${e(token)}">${action==='verify-mail'?'Confirmar e-mail':'Criar nova senha'} ${uiIcon('chevronRight')}</button>`:''}</article>`;
    }).join('')||'<p>Nenhuma mensagem ainda.</p>'}`;
  }catch(error){$('#modal-content').textContent=errorMessage(error);}
}
/** Where the local player stands, as the admin window shows it to place things in the map (blips, markers): metres and the facing. */
function positionText():string {
  const p=world?.players[user?.id??''];if(!p)return '—';
  const degrees=Math.round(((p.rotation*180/Math.PI)%360+360)%360);
  return `x: ${p.x.toFixed(2)} · y: ${(p.y??0).toFixed(2)} · z: ${p.z.toFixed(2)} · rotação: ${degrees}° (${p.rotation.toFixed(3)} rad)`;
}
function renderAdminPosition():void {const input=document.querySelector<HTMLInputElement>('#admin-position');if(!input)return;const text=positionText();if(input.value!==text)input.value=text;}
async function admin():Promise<void> {
  if(user?.role!=='admin'){toast('Acesso exclusivo da administração.',true);return;}
  // The administration's console (apps/web/src/admin): categories on the left, the chosen one on the right.
  showModal('Administração do bar','<div id="admin-console"></div>','admin');
  administration=adminConsole($('#admin-console'),{user:()=>user,send:(type,payload)=>network.send(type,payload),position:positionText,
    changedWallet:()=>{wardrobe=undefined;void refreshAdministration();},denied:()=>{void refreshAdministration();}});
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
    const [result,inventoryResult]=await Promise.all([api<Wardrobe>('/wardrobe'),api<InventoryView>('/inventory')]);if(user?.id!==owner||!inGame)return;wardrobe=result;inventory=inventoryResult;renderBalance();
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

/** An item's effects on the needs, as "fome +35" (CONSUMABLES come from the same catalogue). */
const effectList=(item:{effects:object})=>Object.entries(item.effects).filter(([key,value])=>key!=='name'&&typeof value==='number'&&Number(value)!==0)
  .map(([key,value])=>`${({hunger:'fome',thirst:'sede',hp:'vida',drunk:'álcool',bladder:'bexiga'} as Record<string,string>)[key]??key} ${Number(value)>0?'+':''}${value}`);
const CATEGORY_NAMES:Record<string,string>={bebida:'Bebida',comida:'Comida',saude:'Saúde'};
/** "1:30" for a duration in milliseconds. */
const clockText=(ms:number)=>`${Math.floor(ms/60_000)}:${String(Math.round(ms%60_000/1000)).padStart(2,'0')}`;
// The backpack's chosen slot (its card shows beside the slots).
let selectedItem='';
/**
 * The backpack (I): its slots like a game's inventory (the empty ones too, up to its capacity), the chosen item's card
 * (what it does, how long it lasts, Usar and Descartar) and the recent history. The house's shop is not here (shopHtml).
 */
function renderInventory():void {
  if(activeModal!=='inventory'||!inventory)return;
  const self=world?.players[user?.id??''],held=inHand();
  const stacks=inventory.stacks.filter(stack=>itemById(stack.itemId));
  if(!stacks.some(stack=>stack.itemId===selectedItem))selectedItem=stacks[0]?.itemId??'';
  const slots=Array.from({length:inventory.capacity},(_,index)=>{const stack=stacks[index],item=stack&&itemById(stack.itemId);
    return item?`<button type="button" class="inventory-slot" data-action="inventory-select" data-item="${e(item.id)}" aria-pressed="${item.id===selectedItem}" aria-label="${e(item.name)}, ${stack!.quantity}" title="${e(item.name)}">${itemImage(item)}<b>${stack!.quantity}</b></button>`
      :'<span class="inventory-slot empty" aria-hidden="true"></span>';}).join('');
  const stack=stacks.find(entry=>entry.itemId===selectedItem),item=stack&&itemById(stack.itemId);
  let detail='<div class="item-detail empty"><p class="empty-state">Sua mochila está vazia.</p></div>';
  if(item&&stack){
    // Why Usar waits, when it does (the room refuses the same cases).
    const blocked=self?.condition==='fainted'||self?.condition==='stumbling'?'Espere recuperar o equilíbrio.'
      :self?.interactionState||self?.currentTableId?'Levante-se ou termine o que está fazendo para usar itens.'
      :held&&consumedOverTime(item.id)?`Ainda na mão: ${itemById(held)?.name??held}. Termine antes de pegar outro.`:'';
    const lasts=consumedOverTime(item.id)?`dura ${clockText(consumeMs(item.id))}`:'na hora';
    detail=`<section class="item-detail" aria-label="${e(item.name)}"><header><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><div><small>${e(CATEGORY_NAMES[item.category]??item.category)}</small><h3>${e(item.name)}</h3></div><strong>×${stack.quantity}</strong></header>
      <p>${e(item.description)}</p><div class="item-effects">${effectList(item).map(effect=>`<span>${e(effect)}</span>`).join('')}<span class="item-time">${uiIcon('clock')}${lasts}</span></div>
      ${blocked?`<p class="item-blocked">${e(blocked)}</p>`:''}<div class="item-actions"><button class="button primary" data-action="inventory-use" data-item="${e(item.id)}" ${connected&&!blocked?'':'disabled'}>Usar</button><button class="button secondary" data-action="inventory-discard" data-item="${e(item.id)}">Descartar</button></div></section>`;
  }
  const reason:Record<string,string>={starter:'Kit inicial',purchase:'Compra',use:'Usado',discard:'Descartado',faint:'Perdido ao desmaiar'};
  const history=inventory.history.slice(0,10).map(entry=>{const item=itemById(entry.itemId);return `<li><span>${entry.quantity>0?'+':''}${entry.quantity} ${e(item?.name??entry.itemId)}</span><small>${e(reason[entry.reason]??entry.reason)} · ${new Date(entry.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</small></li>`;}).join('');
  $('#modal-content').innerHTML=`<div class="inventory-summary"><div class="status-row"><span>${uiIcon('bag')} Espaço</span><b>${inventory.usedSlots} / ${inventory.capacity} pilhas</b></div><div class="hud-track"><i style="width:${Math.min(100,inventory.usedSlots/Math.max(1,inventory.capacity)*100)}%"></i></div></div>
    <div class="inventory-layout"><div class="inventory-slots" role="group" aria-label="Itens na mochila">${slots}</div>${detail}</div>
    <p class="fine-print">Bebidas e comidas vão para a mão e duram o mesmo tempo que na mesa, uma por vez. Itens iguais se agrupam numa pilha.</p>
    <details class="inventory-history"><summary>Histórico recente</summary><ol>${history||'<li>Nenhuma movimentação.</li>'}</ol></details>`;
}
/**
 * What the house sells (Venda da casa): buys an item into the backpack (data-action inventory-buy, POST
 * /api/inventory/buy). Out of the backpack since 2026-10-30; shown at the shop's blip in the backyard (openShop).
 */
function shopHtml(view:InventoryView):string {
  const quantities=new Map(view.stacks.map(stack=>[stack.itemId,stack.quantity]));
  return `<div class="shop-grid">${ITEM_CATALOG.map(item=>{const quantity=quantities.get(item.id)??0,full=quantity>=item.stackMax,cost=itemCost(item.id),poor=view.balance<cost;
    return `<article class="shop-item"><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><span><b>${e(item.name)}</b><small>${e(item.description)}</small></span><span class="shop-price">${coins(cost)}</span><button class="mini-button" data-action="inventory-buy" data-item="${e(item.id)}" ${full||poor?'disabled':''}>${full?'Pilha cheia':poor?'Sem moedas':'Comprar'}</button></article>`;}).join('')}</div>`;
}
/** Standing on the shop's blip, E (the room checked the reach): the house's shop, with the wallet and the backpack's space. */
async function openShop():Promise<void>{
  if(!inGame||!connected)return;
  stopWatchingTv();showModal('Loja da casa','<p>Conferindo sua carteira…</p>','shop');const generation=modalGeneration;
  const result=await api<InventoryView>('/inventory');if(activeModal!=='shop'||generation!==modalGeneration)return;
  inventory=result;if(wardrobe)wardrobe={...wardrobe,balance:result.balance};renderShop();renderBalance();
}
function renderShop():void {
  if(activeModal!=='shop'||!inventory)return;
  $('#modal-content').innerHTML=`<p class="modal-description">Carteira: ${coins(inventory.balance)} · Mochila: ${inventory.usedSlots} / ${inventory.capacity} pilhas. O que você compra vai para a mochila (I).</p>${shopHtml(inventory)}`;
}
async function openInventory():Promise<void>{
  showModal('Mochila','<p>Conferindo seus itens…</p>','inventory');const generation=modalGeneration;
  const result=await api<InventoryView>('/inventory');if(activeModal!=='inventory'||generation!==modalGeneration)return;inventory=result;if(wardrobe)wardrobe={...wardrobe,balance:result.balance};renderInventory();renderBalance();
}
function useInventoryItem(id:string):void{
  const item=itemById(id);if(!item||!inventory?.stacks.some(stack=>stack.itemId===id&&stack.quantity>0)){toast('Este item não está mais na mochila.',true);return;}
  if(activeModal)closeModal();usedItem=id;network.send('inventory.use',{itemId:id});
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
function help():void {showModal('Como é que funciona?',`<p class="modal-description">Não tem missão. A ideia é estar aqui.</p>${CONTROLS.map(group=>`<h3>${group.label}</h3>${keyGrid(group.keys)}`).join('')}<h3>Blackjack, do jeito da casa</h3><p>Suba ao salão de jogos, chegue perto da mesa e aperte E. Monte a aposta com as fichas e confirme em Apostar: a primeira aposta abre a rodada para a mesa toda. Chegue o mais perto possível de 21 sem passar. O ás vale 1 ou 11; figuras valem 10. Na sua vez: Pedir (1), Parar (2), Dobrar (3), Dividir (4) ou Desistir (5). Blackjack paga 3 para 2; com um ás do dealer à mostra, dá para fazer seguro. O dealer para em 17. As apostas são em moedas da carteira, de ${livePrice('blackjack:min-bet')} a ${livePrice('blackjack:max-bet')} por mão; sair no meio da rodada para as suas mãos onde estão. O ícone de ajuda da mesa mostra todas as regras.</p><h3>Pebolim</h3><p>As duas mesas ficam no salão de jogos, no andar de cima. Encoste numa e aperte E para pegar um lugar; mesa cheia ou com partida rolando, você assiste. Quem abre a mesa escolhe 1 × 1 ou 2 × 2, quantos gols, um set ou melhor de 3, e pode chamar o Zé do Totó para as vagas (três níveis: tomou todas, na média ou sóbrio) ou marcar a partida valendo moedas (${livePrice('foosball:min-bet')} a ${livePrice('foosball:max-bet')} por jogador; quem vence leva o dobro). Quando todo mundo marca Pronto, a bola rola. Mexa o mouse (ou o dedo) e os bonecos seguem o ponteiro; clique ou Espaço chuta, segurar carrega a bomba; botão direito ou Shift levanta os bonecos para a bola passar. Vale o tempo de posse oficial: 10 s no meio e 15 s nas outras linhas. Sair no meio de uma partida valendo é W.O.; no amistoso, o Zé assume o lugar.</p><h3>Moedas</h3><p>Trabalhe no bar (J) para ganhar moedas. Durante o turno, o painel Turno mostra a tarefa e o marcador verde leva até ela: arraste o painel pelo título, recolha ou esconda; o botão Turno, no topo, mostra de novo. Quem está sentado pode pedir para você: pegue o pedido no balcão e leve até a mesa. As mesas só aparecem para limpar quando têm o que recolher. Gaste com bebidas no balcão, pedidos na mesa, músicas na jukebox e vídeos nas TVs e no telão do palco. Pedido cancelado volta para a carteira.</p><p>A gelada do Magrão e o que você come ou bebe da mochila ficam na mão: dá para andar enquanto isso, e cada coisa dura o mesmo tempo que na mesa. Uma por vez na mão; na mesa, o pedido inteiro ao mesmo tempo. Cada coisa vira um ícone acima dos avisos, com um anel que esvazia e o tempo que falta.</p><h3>Pedido na mesa</h3><p>Sentado, aperte P e escolha até quatro itens. Você fica na mesa até o pedido chegar; dá para cancelar enquanto ele ainda está no balcão. Na mesa, cada coisa dura alguns minutos e faz efeito aos poucos. O que você terminar (ou deixar ao levantar) fica na mesa até alguém recolher: quem estiver trabalhando ou, sem ninguém no turno, o Tonico.</p><h3>Loja da casa</h3><p>No quintal, pise no anel dourado e aperte E para comprar bebidas, comidas e curativos. O que você compra vai para a mochila.</p><h3>Palco do quintal</h3><p>Só sobe no palco quem tem ingresso: 200 moedas, vale 30 minutos. Siga o marcador magenta até o pé da escada do palco e aperte E. O telão é à parte: encoste na frente do palco e aperte E (50 moedas por vídeo). As luzes do palco mudam de cor com o vídeo.</p><p>Lá em cima, chegue perto do violão, do cavaquinho, da bateria ou do microfone e aperte E para tocar. E de novo guarda o instrumento. Cada lugar tem um músico por vez.</p><h3>Celular</h3><p>K tira o celular do bolso (Esc guarda) e dá para andar com ele na mão. No Telefone, ligue para quem está no bar ou para um número da agenda: a ligação usa o seu microfone e a voz chega de qualquer canto do bar. No Highzap você conversa por mensagem, no Highgram publica as fotos da Câmera (tem selfie), e no HighBank manda Pix de moedas para outro jogador. Fotos, notas e ajustes ficam neste navegador.</p><h3>Aqui pode acontecer de tudo</h3><p>Apagões, festa e um frequentador inconveniente aparecem durante a noite. Sua partida continua valendo.</p>`,'help');}

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
      case 'player-card':await playerCard(button.dataset.id!);break;
      case 'card-save':{const id=button.dataset.id!;button.setAttribute('disabled','');await api('/phone/contacts',{userId:id});phone.refresh();toast('Contato salvo na agenda do celular.');await playerCard(id);break;}
      case 'card-follow':{
        const id=button.dataset.id!;button.setAttribute('disabled','');
        const result=await api<{followed:boolean;notify?:string}>(`/phone/gram/users/${encodeURIComponent(id)}/follow`,{followed:button.dataset.on==='true'});
        if(result.notify)network.send('phone.ping',{to:result.notify,kind:'gram-follow'});
        await playerCard(id);break;
      }
      case 'card-gram':closeModal();phone.open('highgram',{profile:button.dataset.id});break;
      case 'card-zap':case 'card-call':{
        const card=shownCard;if(!card)break;closeModal();
        const person={id:card.id,name:card.name,color:card.color,number:card.number,...(card.gram.author.photo?{photo:card.gram.author.photo}:{})};
        if(action==='card-zap')phone.open('highzap',person);else phone.dial(person);
        break;
      }
      case 'card-copy':{const number=button.dataset.number!;try{await navigator.clipboard.writeText(number);toast('Número copiado.');}catch{toast(`Seu número: ${number}`);}break;}
      case 'card-edit':closeModal();phone.open('highgram',{resume:'edit'});break;
      case 'people-tab':selectPeopleTab(button.dataset.tab==='account'?'account':'people');break;
      case 'account':people('account');break;
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
      case 'wave':if(connected&&!activeModal&&!performing())network.send('player.emote',{emote:'wave'});break;
      case 'smoke':smoke();break;
      case 'cigarette':cigarette();break;
      case 'chat':focusChat();break;
      case 'phone':phone.toggle();break;
      case 'inventory':await openInventory();break;
      case 'inventory-use':useInventoryItem(button.dataset.item!);break;
      case 'inventory-select':selectedItem=button.dataset.item??'';renderInventory();document.querySelector<HTMLElement>(`.inventory-slot[data-item="${CSS.escape(selectedItem)}"]`)?.focus();break;
      case 'inventory-discard':confirmDiscard(button.dataset.item!);break;
      case 'inventory-discard-confirm':{const itemId=button.dataset.item as ItemId;closeModal();network.send('inventory.discard',{itemId,quantity:1});break;}
      case 'inventory-buy':{const itemId=button.dataset.item as ItemId;button.setAttribute('disabled','');try{const result=await api<InventoryView>('/inventory/buy',{itemId,quantity:1,requestId:crypto.randomUUID()});inventory=result;if(wardrobe)wardrobe={...wardrobe,balance:result.balance};network.send('inventory.sync');renderInventory();renderShop();renderBalance();}finally{button.removeAttribute('disabled');}break;}
      case 'skins':await skins();break;
      case 'buy-skin':{const owner=user?.id,generation=modalGeneration;button.setAttribute('disabled','');try{const result=await api<Wardrobe>('/wardrobe/buy',{skin:button.dataset.skin});if(user?.id!==owner)break;wardrobe=result;if(modalGeneration===generation)await skins();}finally{button.removeAttribute('disabled');}break;}
      case 'daily':{const owner=user?.id,generation=modalGeneration;const result=await api<Wardrobe>('/wardrobe/daily',{});if(user?.id!==owner)break;wardrobe=result;if(modalGeneration===generation)await skins();break;}
      case 'kick':kick();break;
      case 'skin':await wearSkin(button.dataset.skin!);break;
      case 'audio':{const on=!(audio.enabled||media.some(m=>m.soundEnabled));if(audio.enabled!==on)audio.toggle();media.forEach(m=>m.setMuted(!on));break;}
      case 'stage-buy':network.send('stage.buy');break;
      case 'order':{const self=world?.players[user?.id??''],counter=INTERACTABLES.find(i=>i.type==='counter');closeModal();if(!connected||!self||!counter)break;if(!canInteract(counter,self)){toast('Chegue ao balcão para pedir.');break;}network.send('player.interact',{objectId:counter.id,item:button.dataset.item==='copo'?'copo':'garrafa'});break;}
      case 'table-menu':openTableMenu();break;
      case 'table-cancel':network.send('table.cancel');closeModal();break;
      case 'jobs':openJobs();break;
      case 'job-start':network.send('job.start',{jobId:button.dataset.job});closeModal();break;
      case 'job-stop':network.send('job.stop');closeModal();break;
      case 'admin-copy-position':{
        // The clipboard needs a secure page (https or localhost); elsewhere the text is selected for Ctrl+C.
        const input=$<HTMLInputElement>('#admin-position');input.select();
        try{await navigator.clipboard.writeText(input.value);toast('Posição copiada.');}catch{toast('Posição selecionada: use Ctrl+C para copiar.');}
        break;
      }
      case 'voice-mic':await toggleMicrophone();break;
      case 'voice-listen':{const on=!settings.get().voicesEnabled;voice.unlock();settings.update({voicesEnabled:on});break;}
      case 'voice-mute':{const id=button.dataset.id!;const muted=voice.toggleMute(id);peopleKey='';renderPeopleContent();break;}
      case 'settings':openSettings();break;
      case 'dance':if(performing())break;network.send('player.emote',{emote:world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'});break;
      case 'close-modal':closeModal();break;
      case 'block':{const id=button.dataset.id!;if(blocked.has(id)){await api(`/blocks/${encodeURIComponent(id)}`,undefined,'DELETE');blocked.delete(id);}else{await api('/blocks',{playerId:id});blocked.add(id);}renderPeopleContent();renderChat();break;}
      case 'report':showModal('Denunciar jogador',`<p class="modal-description">Conte o que aconteceu. Sua denúncia será revisada pela administração.</p><form id="report-form" data-id="${e(button.dataset.id)}"><label>Motivo<textarea name="reason" required minlength="5" maxlength="500" placeholder="Descreva a situação"></textarea></label><button class="button primary" type="submit">Enviar denúncia</button></form>`,'report');break;
      case 'mail':await mailbox();break;
      case 'verify-mail':await api('/auth/verify',{token:button.dataset.token});user=(await api<{user:PublicUser}>('/auth/me')).user;closeModal();authMode='login';renderAuth('E-mail confirmado! Entre para conhecer o bar.');break;
      case 'reset-mail':resetToken=button.dataset.token!;await leaveBar();closeModal();user=undefined;authMode='reset';renderAuth();break;
      case 'admin':await admin();break;
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
        const input=$<HTMLInputElement>('#chat-input');const text=input.value.trim();if(text){network.send('chat.send',{text});input.value='';}(document.activeElement as HTMLElement|null)?.blur();
      }else if(form.id==='report-form'){await api('/reports',{playerId:form.dataset.id,reason:data.reason});closeModal();toast('Denúncia registrada. Obrigado por avisar.');}
      else if(form.id==='table-order'){
        // Which button sent it: Tonico, or one of the players working the bar.
        const items=new FormData(form).getAll('item').map(String),to=((event as SubmitEvent).submitter as HTMLButtonElement|null)?.value;
        if(items.length){network.send('table.order',to?{items,to}:{items});closeModal();}
      }
      else if(form.id==='moderation-form'){await api('/admin/action',{action:form.dataset.type,playerId:form.dataset.id,reason:data.reason});await admin();}
    }catch(error){if(form.id==='auth-form')authMessage(errorMessage(error),true);else toast(errorMessage(error),true);}
    finally{setBusy(form,false);}
  })();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(watchingTv)stopWatchingTv();else if(phone.isOpen&&!activeModal)phone.close();else closeModal();document.activeElement instanceof HTMLElement&&document.activeElement.blur();}
  // Closing must not reach the scene's own C handler on window, which would reopen the selector.
  if(event.code==='KeyC'&&!event.repeat&&activeModal==='skins'){event.preventDefault();event.stopPropagation();closeModal();}
  if(event.key==='Tab'&&activeModal){const focusable=Array.from($('#modal').querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,a[href]'));const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  if(inGame&&!typing()&&!event.repeat){
    if(event.code==='KeyM'){event.preventDefault();void toggleMicrophone();}
    if(event.code==='KeyI'){event.preventDefault();if(activeModal==='inventory')closeModal();else if(!activeModal)void openInventory().catch(error=>toast(errorMessage(error),true));}
    if(event.code==='KeyB'&&settings.get().voiceMode==='ptt'){event.preventDefault();voice.setPushToTalk(true);}
    // P (pedido) orders at the table: T, like Enter, opens the chat (BarScene).
    if(event.code==='KeyP'&&!activeModal){event.preventDefault();openTableMenu();}
    else if(event.code==='KeyP'&&activeModal==='table')closeModal();
    if(event.code==='KeyK'&&!activeModal){event.preventDefault();phone.toggle();}
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
  if(key==='camera'&&isCameraMode(input.value)){settings.update({camera:input.value});syncCameraSettings();}
  if(key==='cameraDistance'&&input instanceof HTMLInputElement){
    const distance=input.valueAsNumber;
    if(Number.isFinite(distance)&&distance>=0)settings.update(distance===0?{camera:'first'}:{camera:'third',cameraDistance:distance});
    syncCameraSettings();
  }
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
settings.subscribe((current,previous)=>{applySound(current);renderVoice();if(current.graphics!==previous.graphics)scene?.setGraphics(current.graphics);if(current.camera!==previous.camera||current.cameraDistance!==previous.cameraDistance)scene?.setCamera(current.camera,current.cameraDistance);});
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
function syncCameraSettings():void {
  const current=settings.get(),select=document.querySelector<HTMLSelectElement>('[data-setting="camera"]'),distance=document.querySelector<HTMLInputElement>('[data-setting="cameraDistance"]');
  if(select)select.value=current.camera;
  if(distance)distance.value=String(current.camera==='first'?0:current.cameraDistance);
}
function openSettings():void {
  const current=settings.get(),reason=voice.unavailableReason;
  const range=(key:string,label:string,value:number,scale=100,disabled=false)=>`<label class="setting-row"><span>${label}</span><input type="range" min="0" max="100" step="1" data-setting="${key}" value="${Math.round(value*100)}" ${disabled?'disabled':''}><output>${Math.round(value*scale)}%</output></label>`;
  const toggle=(key:string,label:string,hint:string,checked:boolean,disabled=false)=>`<label class="setting-toggle"><span><b>${label}</b><small>${hint}</small></span><input type="checkbox" role="switch" data-setting="${key}" ${checked?'checked':''} ${disabled?'disabled':''}><i aria-hidden="true"></i></label>`;
  // −60 dB (whisper) … −20 dB (loud) maps onto the meter's −60…0 dB scale.
  const threshold=current.sensitivity*40/60*100;
  showModal('Configurações',`<div class="settings-panel" data-capture-input>
    ${graphicsSettingsHtml(current.graphics,scene?.getGraphics())}
    <section><h3>${uiIcon('eye')} Câmera</h3>
      <label class="setting-row device-row"><span>Visão</span><select data-setting="camera">${CAMERA_MODES.map(mode=>`<option value="${mode}" ${current.camera===mode?'selected':''}>${CAMERA_LABELS[mode]}</option>`).join('')}</select></label>
      <label class="setting-row device-row"><span>Distância (m)</span><input type="number" min="0" step="0.05" data-setting="cameraDistance" value="${current.camera==='first'?0:current.cameraDistance}"></label>
      <p class="fine-print">A rodinha ajusta a distância continuamente. Use 0 para primeira pessoa; Q alterna entre ela e a distância escolhida. Arraste para girar em qualquer ângulo. A câmera atravessa o cenário livremente, e os obstáculos entre ela e você abrem uma janela em volta do personagem.</p>
    </section>
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
  void loadPrices();
  try{const config=await api<{emailVerificationRequired:boolean}>('/auth/config');emailVerificationRequired=config.emailVerificationRequired;renderAuth();}catch{/* The server still enforces its verification policy. */}
  try{scene=new BarScene($<HTMLCanvasElement>('#world'),{
    onInteract:interact,
    onEmote:emote=>performing()?undefined:emote==='smoke'?smoke():emote==='cigarette'?cigarette():network.send('player.emote',{emote:emote==='wave'?'wave':world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'}),
    onChat:()=>{if(inGame&&!activeModal)focusChat();},
    onSkins:()=>{if(inGame&&!activeModal)void skins().catch(error=>toast(errorMessage(error),true));},
    onKick:kick,
    onPlayerClick:id=>{if(inGame&&!activeModal)void playerCard(id);},
    onCameraChange:(mode,distance)=>{settings.update({camera:mode,cameraDistance:distance});syncCameraSettings();},
    onMediaFrame:()=>{media.forEach(m=>m.frame());minimap.render(inGame?()=>scene?.mapView():null);scene?.setJukeboxDuration(jukebox.duration('jukebox'));scene?.setStageDuration(television.duration('telao'));objectiveBlip.render(inGame?scene?.projectObjective()??null:null);const self=world?.players[user?.id??''];stageBlip.render(inGame&&self?scene?.projectStageBlip()??null:null,self?stageLabel(self):'');telaoBlip.render(inGame&&self?scene?.projectStageBlip('telao')??null:null,telaoLabel());shopBlip.render(inGame&&self?scene?.projectStageBlip('shop')??null:null,'Loja da casa');deskBlip.render(inGame&&self?scene?.projectStageBlip('desk')??null:null,'Mesa de luz');voice.update(inGame?scene?.getListener():undefined,id=>world?.players[id]);renderVoiceLevel();const on=audio.enabled||media.some(m=>m.soundEnabled);if(on!==displayedSound){displayedSound=on;$('#audio-button').classList.toggle('sound-on',on);$('#audio-button').setAttribute('aria-pressed',String(on));$('#audio-button').setAttribute('aria-label',on?'Silenciar som da casa':'Ativar som da casa');}},
  });scene.setEnabled(false);scene.setGraphics(settings.get().graphics);scene.setCamera(settings.get().camera,settings.get().cameraDistance);}
  catch(error){console.error(error);toast('Não foi possível iniciar o 3D. Verifique a aceleração gráfica do navegador.',true);}
  const params=new URLSearchParams(location.search);
  if(params.has('verify')){try{await api('/auth/verify',{token:params.get('verify')});renderAuth('E-mail confirmado! Agora é só entrar.');}catch(error){authMessage(errorMessage(error),true);}history.replaceState({},'',location.pathname);}
  if(params.has('reset')){resetToken=params.get('reset')!;authMode='reset';checkingSession=false;renderAuth();return;}
  try{const result=await api<{user:PublicUser}>('/auth/me');user=result.user;}catch{/* No active session: show login. */}
  checkingSession=false;renderAuth();
}
let displayedSound:boolean|undefined;
void start();
if(import.meta.env.DEV)void import('./bar-animations-debug').then(({barAnimationsDebug})=>barAnimationsDebug(()=>scene));
// Development telemetry exposes copies only, never a way to command the server.
if(import.meta.env.DEV)Object.defineProperty(window,'barDebug',{value:{barAnimation:(action:Parameters<BarScene['debugBarAnimation']>[0])=>scene?.debugBarAnimation(action),barProp:(id:string,name:string)=>scene?.barProp(id,name),barChair:(seat:string)=>scene?.barChair(seat),snapshot:()=>({world:structuredClone(world),localId:user?.id}),price:(key:string)=>livePrice(key),performance:()=>scene?.getPerformance(),animations:()=>scene?.getAnimations(),motos:()=>scene?.getMotos(),served:()=>scene?.getServed(),map:()=>scene?.getMapStatus(),network:()=>network.telemetry(),jukebox:()=>jukebox.telemetry(),television:()=>television.telemetry(),ambient:()=>audio.telemetry(),environment:()=>scene?.getEnvironmentStatus(),graphics:()=>scene?.getGraphics(),job:()=>structuredClone(jobTask),tableOrder:()=>structuredClone(tableOrder),listener:()=>scene?.getListener(),camera:()=>scene?.getCamera(),voice:()=>({mic:voice.micActive,transmitting:voice.transmitting,level:voice.level,status:voice.status,settings:{...settings.get()},...voice.telemetry() as object})}});
setInterval(()=>{
  if(!inGame||!scene||!world)return;
  const labels=scene.projectLabels?.()||[];
  $('#labels').innerHTML=labels.map(label=>{
    const speaking=label.local?voice.transmitting:voice.isSpeaking(label.id),mic=!label.npc&&world?.players[label.id]?.voice,onCall=!label.npc&&world?.players[label.id]?.phone==='call';
    return `<span class="world-label${speaking?' speaking':''}" style="left:${label.x}px;top:${label.y}px">${onCall?`<i class="label-phone" title="No celular" aria-hidden="true">${uiIcon('phone')}</i>`:''}${mic?`<i class="label-mic" aria-hidden="true">${uiIcon('mic')}</i>`:''}${e(label.name)}</span>`;
  }).join('');
  if(jobTask)renderJobCard();
  if(!hud.isHidden('chat'))$('[data-action="chat"]').removeAttribute('data-unread');
  consumingHud.render(consumptions(world,world.players[user?.id||''],usedItem,serverNow()),serverNow());
  const table=world.tables[world.players[user?.id||'']?.currentTableId];
  const timer=document.querySelector('#turn-timer');if(timer&&table?.deadline)timer.textContent=`${Math.max(0,Math.ceil((table.deadline-serverNow())/1000))}s`;
},100);
