import type {adminConsole} from './admin/console';
import {isRidingHorse,kickClip,vehicleSeat,weatherAt} from '@bar/shared';
import {CAR_MODEL,isCar,isTruck,isTwoWheeler,hasStorage,storageGap,storageRefusal,vehicleMotionSpeed,vehicleSeats,vehicleName,vehicleOccupants,vehicleParts,vehicleRepair,readVehicleParts,type MotoState,type StorageView} from '@bar/shared';
import {storagePanelHtml} from './storage-panel';
import {PerformanceMonitor} from './performance/monitor';
import {UpdateProfiler} from './performance/recording';
import {createPerformanceHud} from './performance/hud';
import './performance/performance.css';
import {itemCost,loadPrices,price as livePrice,setPrices} from './prices';
import './assets/fonts/neon-ui.css';
import './neon-ui.css';
import {gameUi} from './game-ui';
import {CONTROLS,createLobbyMenu,keyGrid} from './lobby-menu';
import {createLobbyHero} from './lobby-hero';
import {createLobbyPresence} from './lobby-presence';
import {createLobbyStage} from './lobby-stage';
import {createFullscreen} from './fullscreen';
import {DeathAudio} from './death/death-audio';
import {createDeathUi} from './death/death-ui';
import {createMouseCapture} from './mouse-capture';
import {WeaponsController} from './weapons/controller';
import {WeaponWheel} from './weapons/ui/wheel';
import {createArsenal} from './weapons/ui/arsenal';
import {createArmsHint} from './weapons/ui/hint';
import {aimCameraText,aimSettingPatch} from './weapons/ui/settings-rows';
import {DEFAULT_AIM_CAMERA} from './weapons/aim-settings';
import {DEFAULT_WEAPON_KEYS,WEAPON_ACTIONS,withWeaponKey,type WeaponAction} from './weapons/key-bindings';
import {captureWeaponKey,guardSideButtons} from './weapons/key-capture';
import './lobby-hero.css';
import './lobby-entry.css';
import {createHudPanels} from './hud-panels';
import {createVehicleHud} from './vehicle-hud';
import {createFuelHud,fuelContext} from './fuel-hud';
import {createNotifications} from './notifications';
import {createCollection} from './collection/collection';
import {GARAGE,VEHICLE_KEY,keyLabel,loadoutOf,skillById,type ProfileView,type SkillLoadouts,nearestInteraction,INTERACTABLES,canInteract,DEFAULT_SKIN,SKINS,FACTORY_UNIFORM,FACTORY_UNIFORM_NAME,ITEM_CATALOG,itemById,type Wardrobe,type WorldState,type PublicUser,type ChatMessage,type InventoryView,type ItemId} from '@bar/shared';
import './admin.css';
import {BarScene,BLIP_RADIUS} from './engine/BarScene';
import {CAMERA_HEIGHT_LIMIT,CAMERA_LABELS,CAMERA_MODES,CAMERA_SENSITIVITY_LIMITS,CAMERA_ZOOMS,CAMERA_ZOOM_LABELS,isCameraMode,type CameraFeel} from './engine/camera-rig';
import {BarNetwork} from './networking';
import {FightController} from './fight/fight-controller';
import type {FightHit} from '@bar/shared';
import {api,ApiError,escape as e} from './api';
import {BarAudio} from './audio';
import {JukeboxController,TelevisionController,type MediaController} from './jukebox';
import {nearestMediaSource,areaMix,hasStagePass,type MediaSystem,type PoolTableView,type Position,type TrucoView} from '@bar/shared';
import {musicianPhase,musicianRole,onStage,SPARRING,SPARRING_NPC,nearSparring,type Interactable,type PlayerState} from '@bar/shared';
import './jukebox.css';
import {createLightDesk} from './light-desk';
import './light-desk.css';
import {createSettings,type GameSettings} from './settings';
import {VoiceChat} from './voice';
import {coins,itemImage,uiIcon} from './ui-icons';
import {VOICE,PASSWORD_MIN,PASSWORD_MAX,passwordProblem} from '@bar/shared';
import './voice.css';
import './needs.css';
import {createNeedsHud} from './needs-hud';
import './minimap.css';
import './touch/touch.css';
import {createMinimap} from './minimap';
import {AdmissionLifecycle,type AdmissionDeparture} from './admission-lifecycle';
import {MOTO_ENGINE,MOTO_PARTS,MOTO_REPAIR,NO_MOTO_INTENT,canRepairMoto,isRepairingMoto,isRidingMoto,nearestFallenMoto,nearestFreeMoto,readMotoParts,repairOf,type MotoPartId} from '@bar/shared';
import {motoPanelHtml} from './moto-panel';
import {worldMenu,worldMenuOpen} from './world-menu';
import {createTouchControls,TOUCH_KEYS} from './touch/touch-controls';
import {setTouchPreference,touchPreference,touchMode,type TouchPreference} from './touch/touch-mode';
import './vr/vr.css';
import {vrSettings,updateVr,vrSupported,vrUnavailableReason,watchVr,vrLog,vrLogText,clearVrLog} from './vr/vr-mode';
import {garagePanelHtml,keyChirp,plateHtml} from './garage-panel';
import {createTrade} from './trade/trade';
import './trade/trade.css';
import './moto-panel.css';
import './highfood/highfood.css';
import {basePanelHtml,createCourier,createFoodDialog} from './highfood/courier';
import {createLockerPad} from './highfood/locker';
import {createGps,type GpsTarget} from './gps';
import {HIGHFOOD,atPickup,floorHeight,motoDistance,type HighfoodState} from '@bar/shared';
import {JOBS,canInteract as touching,stationInteractable,consumedOverTime,consumeMs,type JobTaskView} from '@bar/shared';
import type {TableOrderView} from './networking';
import {jobPanelHtml,jobPanelTick,jobsHtml,mediaPriceNote,nextGraphics,stageMinutes,stagePanelHtml,tableMenuHtml,tableMenuTotal} from './economy-ui';
import './economy.css';
import {createObjectiveBlip} from './objective-blip';
import {createConsumingHud} from './consuming-hud';
import {createBlackjackTable} from './blackjack/table';
import {createFoosballPanel} from './foosball/panel';
import {createPoolPanel} from './pool/panel';
import {createTrucoTable} from './truco/table';
import {consumptions} from './consumption';
import {createPhone} from './phone/phone';
import {PhoneSounds} from './phone/core';
import {createProfileWindow} from './profile/profile-window';
import './levels/levels.css';
import {createLevelHud} from './levels/level-hud';
import './wallet/wallet.css';
import './fight/fight.css';
import './sparring/sparring.css';
import {createSparringUi} from './sparring/sparring-ui';
import {createWalletHud} from './wallet/wallet-hud';
import {rankIcon} from './levels/rank-icon';
import {badgeMedal,openBadgeCard} from './profile/badge-card';
import {FactoryController} from './factory/controller';
import {createFreightFeed} from './factory/freight-feed';
import {MachineShopController} from './machine-shop/controller';
import {RIBEIRO_COLOR,RIBEIRO_COMPUTER,RIBEIRO_SPOTS} from './machine-shop/config';
import {FACTORY_COLOR,FACTORY_SPOTS} from './factory/spots';
import {BADGE_RARITY_INFO} from '@bar/shared';
import {createPauseMenu} from './pause-menu/pause-menu';
import {MenuSounds} from './pause-menu/menu-sounds';
import {menuHeader,menuTabs,type MenuAct,type MenuContentHost} from './pause-menu/menu-content';
import './pause-menu/pause-menu.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=gameUi();
createLobbyMenu(document.querySelector<HTMLElement>('#lobby')!);
createLobbyHero(document.querySelector<HTMLElement>('#lobby')!);
createLobbyStage(document.querySelector<HTMLElement>('#lobby')!);
createLobbyPresence(document.querySelector<HTMLElement>('#lobby')!);

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const hud=createHudPanels($('#game'));
const fuelHud=createFuelHud($('#game'),()=>network.send('fuel.cancel',{}));
const vehicleHud=createVehicleHud($('#vehicle-hud'),action=>{
  if(!connected||!world||!user||activeModal)return;
  const self=world.players[user.id],vehicle=Object.values(world.motos??{}).find(each=>vehicleSeat(each,user!.id)>=0);
  if(action==='exit'){network.send('player.interact',{objectId:'stand'});return;}
  if(action==='camera'){scene?.vehicleCamera();return;}
  if(!vehicle)return;
  if(action==='info'){void openMotoPanel(vehicle.id).catch(error=>toast(errorMessage(error),true));return;}
  if(vehicle.riderId!==self?.id)return;
  if(action==='left'||action==='right'||action==='hazard'){scene?.vehicleSignal(action);return;}
  if(action==='doors')action='left-door';
  sendVehicleControl(vehicle.id,action);
});
const notices=createNotifications($('#toasts'));
// Levels and the daily bonus (docs/sistemas/niveis.md), in the header beside the wallet.
const levelHud=createLevelHud($('#level-hud'),{
  toast:(text,error)=>toast(text,error),
  openProfile:()=>{if(user)void profile.open(user.id);},
  coinsChanged:()=>network.send('inventory.sync'),
});
// Every coin in or out rolls the wallet and floats off it (wallet/wallet-hud.ts); renderBalance is its only caller.
const walletHud=createWalletHud($('.hud-wallet'));
/** Z shows the names over the heads for a few seconds; hidden, they are not even projected. */
const NAMES_MS=4000,NAMES_FADE_MS=500;
let namesUntil=0,namesTimer=0;
function showNames():void {
  if(!inGame)return;
  namesUntil=performance.now()+NAMES_MS;$('#labels').classList.add('names-on');
  clearTimeout(namesTimer);namesTimer=window.setTimeout(()=>$('#labels').classList.remove('names-on'),NAMES_MS);
}
// Highfood (docs/sistemas/highfood.md): the shift as the room tells it, the GPS's line and the customer's dialog.
const courier=createCourier();
const ROUTE_COLOURS={delivery:'#ff3d5a',waypoint:'#17d4f4',bike:'#ff9f0a'} as const;
const gps=createGps({
  changed:()=>{const target=gps?.target;minimap.setRoute(gps?.route??[],target?ROUTE_COLOURS[target.source]:'',gps?.version??0);},
});
// Trading between players (docs/sistemas/troca.md): the window is the game's modal; what is on the table is always what the room last said.
const trade=createTrade({
  root:$('#game'),send:(type,payload)=>network.send(type,payload),inventory:()=>inventory,balance:()=>inventory?.balance??wardrobe?.balance??0,now:()=>serverNow(),
  notify:(title,text,warning)=>notices.show({variant:warning?'aviso':'acao',title,text}),
  open:()=>showModal('NEGOCIAR','','trade'),close:()=>closeModal(),isOpen:()=>activeModal==='trade',content:()=>$('#modal-content'),
});
const foodDialog=createFoodDialog($('#game'),{confirm:orderId=>network.send('food.deliver',{orderId}),leave:()=>network.send('food.leave',{})});
const lockerPad=createLockerPad($('#game'),{submit:(orderId,code)=>network.send('food.code',{orderId,code}),leave:()=>network.send('food.leave',{}),showCode:()=>phone.open('highfood'),phoneOpen:()=>phone.isOpen,sounds:new PhoneSounds(()=>settings.get().master)});
// Ajustes › Interface › Tela cheia; the row follows the real state (and the F11 one) whenever it changes.
const fullscreen=createFullscreen(text=>notices.show({variant:'acao',title:'Tela cheia',text}),()=>pauseMenu.refresh());
// What takes the mouse back on its own: a window, the phone, a TV, the bike's menu, the pause menu. The chat is typed.
const machineGameOpen=()=>!!document.querySelector('.rb-game-layer');
const needsCursor=()=>!sceneActive()||watchingTv||phone.isOpen||foodDialog.isOpen||lockerPad.isOpen||profile.isOpen||worldMenuOpen()||trade.inviteOpen||pauseMenu.isOpen||machineGameOpen();
// The Esc that frees a captured mouse is also the one that pauses: the browser may keep that key to itself.
const mouseCapture=createMouseCapture($<HTMLCanvasElement>('#world'),needsCursor,()=>fight.guard||weapons.armed(),()=>fight.lower(),()=>{if(pauseMenu.isOpen)return true;if(!canOpenMenu())return false;pauseMenu.open();return true;});
/**
 * The fist fight (docs/sistemas/luta.md): R raises the guard, the buttons punch. The controller decides each punch with the shared rules and draws it
 * ahead of the room; the room's word comes back with each state (reconcile) and each landed punch (fight.hit).
 */
const fight:FightController=new FightController({
  serverNow:():number=>serverNow(),
  view:()=>scene?.fightView()??0,
  position:()=>{const at=network.predicted();return {x:at.x,y:at.y??0,z:at.z};},
  targets:()=>scene?.fightTargets()??[],
  seen:()=>network.seen(),
  changed:guard=>{
    renderFightPrompt();
    // The mouse turns the view and the buttons punch: mouse-capture.ts holds it while the guard is up. One request only (here, from R's keystroke,
    // which the browser trusts): a second one made it drop the first and the guard fell by itself.
    mouseCapture.sync();
  },
});
/**
 * The firearms (docs/sistemas/armas.md): /armas in the chat turns them on. The controller gathers the mouse, the keys, a gamepad and the touch
 * buttons, runs the gun ahead of the room with the camera the scene rendered, applies aim assistance, draws the HUD and rides every input. Esc
 * never holsters; a window or the pause menu lets go of the trigger and the aim.
 */
const weapons:WeaponsController=new WeaponsController($('#game'),{
  me:()=>user?.id,
  serverNow:():number=>serverNow(),
  seen:():{seen:number;ago:number}=>network.seen(),
  send:(type,payload)=>network.send(type,payload),
  settings:()=>{const current=settings.get();return {aim:current.aim,pad:current.pad,shoulder:current.shoulder,aimCamera:current.aimCamera,keys:current.weaponKeys,lite:current.graphics.preset==='low'};},
  saveShoulder:side=>settings.update({shoulder:side}),
  notice:(text,error)=>toast(text,error),
  playable:()=>inGame&&connected&&!needsCursor(),
  menuOpen:()=>needsCursor(),
  captureSync:()=>mouseCapture.sync(),
  guard:()=>fight.guard,
  name:id=>world?.players[id]?.displayName||'alguém',
});
/** The Arsenal window while open (weapons/ui/arsenal.ts): destroyed with the window, as the collection is. */
let arsenalWindow:ReturnType<typeof createArsenal>|undefined;
const fightPrompt=document.createElement('div');
fightPrompt.className='fight-prompt';fightPrompt.hidden=true;fightPrompt.setAttribute('aria-live','polite');
fightPrompt.innerHTML=`<strong>${uiIcon('shield')}Guarda alta</strong><span><kbd>Clique</kbd>Soco</span><span><kbd>Botão dir.</kbd>Forte</span><span><kbd>Espaço</kbd> ou <kbd>Mouse 4/5</kbd>Defender (no instante do golpe: parry)</span><span class="fp-meter" title="Fôlego da guarda"><i></i></span><span><kbd>R</kbd>Baixar</span>`;
$('#game').append(fightPrompt);
function renderFightPrompt():void {fightPrompt.hidden=!fight.guard||!inGame;}
/** Zeca's challenge: his speech, and the fight's lives and count (docs/sistemas/zeca.md). The room decides all; E near him talks. */
const sparringUi=createSparringUi($('#game'),{accept:()=>network.send('sparring.accept',{}),quit:()=>network.send('sparring.quit',{}),now:()=>serverNow()});
/** What E does near Zeca (not during a fight, nor with the dialog already open). */
function sparringPrompt(self:PlayerState|undefined):{label:string;send:string}|undefined {
  if(!self||!world?.npcs[SPARRING_NPC]||sparringUi.fighting||sparringUi.isOpen||self.interactionState||self.currentTableId||!nearSparring(self))return;
  return {label:`Falar com o ${SPARRING.name}`,send:'sparring.talk'};
}
/** The guard meter (the room's number, Fist.guard) under the prompt: cool while it is full, gold when low, red while the guard is broken. */
const guardMeter=fightPrompt.querySelector<HTMLElement>('.fp-meter')!,guardMeterFill=guardMeter.firstElementChild as HTMLElement;
let guardShown=-1,guardBroken=false;
function renderGuardMeter(self:PlayerState):void {
  if(!fight.guard)return;
  const value=self.fist?.guard??100,broken=(self.fist?.breakUntil??0)>serverNow();
  if(value===guardShown&&broken===guardBroken)return;
  guardShown=value;guardBroken=broken;
  guardMeterFill.style.transform=`scaleX(${Math.max(0,Math.min(1,value/100)).toFixed(2)})`;
  guardMeter.classList.toggle('low',value<30);guardMeter.classList.toggle('broken',broken);
}
/** A punch landed near: the scene draws it, the controller holds the one hit. */
function onFightHit(hit:FightHit):void {
  scene?.fightHit(hit);
  if(!user)return;
  fight.hit(hit,user.id);
}
// On a phone or tablet: a stick, buttons and a sheet that press the keys (docs/sistemas/toque.md). Shown while the world takes input.
const touchControls=createTouchControls($('#game'),{
  visible:()=>touchMode()&&!needsCursor()&&!document.body.classList.contains('watching-tv')&&$('#blackjack').classList.contains('hidden'),
  context:()=>scene?.touchContext()??'walk',
  axis:(x,y)=>scene?.setTouchAxis(x,y),
  sprint:on=>scene?.setTouchSprint(on),
  skillButton:()=>document.querySelector<HTMLButtonElement>('#skill-button'),
  guard:()=>fight.guard,
  armed:()=>weapons.drawn,aiming:()=>weapons.aiming,scoped:()=>weapons.scoped,
  look:(dx,dy)=>scene?.touchLook(dx,dy),
});
const needsHud=createNeedsHud($('#game'),notice=>notices.show(notice),()=>serverNow(),()=>settings.get().master);
const minimap=createMinimap($('#game'));
const consumingHud=createConsumingHud($('#consuming'));
// The blackjack table's panel (blackjack/table.ts): it draws the room's table and sends bets and decisions.
const blackjackUi=createBlackjackTable($('#blackjack'),{send:(type,payload)=>network.send(type,payload),now:()=>serverNow(),
  balance:()=>wardrobe?.balance??inventory?.balance,volume:()=>settings.get().master,notify:(text,error)=>toast(text,error)});
// The truco panel (truco/table.ts): it draws the view of the table the room sends to this player alone.
const trucoUi=createTrucoTable($('#truco'),{send:(type,payload)=>network.send(type,payload),now:()=>serverNow(),
  balance:()=>wardrobe?.balance??inventory?.balance,volume:()=>settings.get().master,notify:(text,error)=>toast(text,error)});
let trucoView:TrucoView|undefined;
const atTruco=()=>!$('#truco').classList.contains('hidden');
// The pebolim panel (foosball/panel.ts): the table of the place taken, or of the one watched from beside it (foosballWatching).
const foosballUi=createFoosballPanel($('#foosball'),{send:(type,payload)=>network.send(type,payload),now:()=>serverNow(),
  balance:()=>wardrobe?.balance??inventory?.balance,volume:()=>settings.get().master,notify:(text,error)=>toast(text,error),
  closed:()=>{foosballWatching='';renderWorld();}});
let foosballWatching='';
/** At a pebolim table (playing or watching): the panel takes the keys and the mouse, so the scene steps aside. */
const atFoosball=()=>!$('#foosball').classList.contains('hidden');
// The pool panel (pool/panel.ts): the table of the seat taken, or of the one watched from beside it (poolWatching). Each
// table's view comes by message (pool.view) to whoever is near; the 3D balls follow them too.
const poolUi=createPoolPanel($('#pool'),{send:(type,payload)=>network.send(type,payload),now:()=>serverNow(),volume:()=>settings.get().master,balance:()=>wardrobe?.balance??inventory?.balance,
  notify:(text,error)=>toast(text,error),closed:()=>{poolWatching='';renderWorld();}});
let poolWatching='';
const poolViews=new Map<string,PoolTableView>();
const atPool=()=>!$('#pool').classList.contains('hidden');
const sceneActive=()=>inGame&&connected&&!activeModal&&!atFoosball()&&!atTruco()&&!atPool();
// The backpack item last asked for: the room syncs a drink's prop, not which item a quick use is.
let usedItem='';
// What was in hand the last time the backpack was drawn (its Usar buttons wait for an empty hand).
let handShown='';
let user:PublicUser|undefined;
let world:WorldState|undefined;
const serverNow=()=>network.serverNow();
let inGame=false,connected=false,authMode:'login'|'register'|'forgot'|'reset'='login';
// The mouse's back and forward buttons are weapon keys: in the game they never take the page back.
guardSideButtons(()=>inGame);
let emailVerificationRequired=true;
let checkingSession=true;
let resetToken='',activeModal='',peopleKey='',blocked=new Set<string>();
// The people window: its tab, the player's round statistics (fetched when the account tab opens) and the connection.
let peopleTab:'people'|'account'='people',accountStats:{gamesPlayed:number;wins:number;losses:number;draws:number}|undefined;
let netStatus='Conectando…',netPing='— ms';
let scene:BarScene|undefined;
let lastFocus:HTMLElement|undefined;
const audio=new BarAudio();
audio.setSource(()=>scene?.ambienceProbe());
const settings=createSettings();
// The Morte (docs/sistemas/morte.md): her sounds and, for the victim alone, the dark and the sequence game.
const deathAudio=new DeathAudio(()=>settings.get().master);
// The pause menu (pause-menu/, docs/sistemas/interface.md#menu): Esc, over the running bar. Its sections read the game's state
// through this host and act through the same functions as the keys; its settings carry the data-setting names applied below.
const menuSounds=new MenuSounds(()=>settings.get().master*settings.get().ui);
// The firearms' interface (weapons/ui): the wheel over the running scene, the first-use hint, and the Arsenal on U, the D-pad's right or the wheel's button.
const armsHint=createArmsHint($('#game'),weapons);
new WeaponWheel($('#game'),weapons,{sounds:menuSounds,arsenal:()=>openArsenal(),used:()=>armsHint.used()});
weapons.on('arsenal',()=>openArsenal());
/** A window opened from the menu: dismissed by the player (Esc, its X, a click beside it), it brings the menu back where it was. */
let menuLeftAt=-Infinity,modalFromMenu=false;
const menuPortraits=new Map<string,string>();
const menuHost:MenuContentHost={
  settings,
  user:()=>user,world:()=>world,inventory:()=>inventory,
  balance:()=>inventory?.balance??wardrobe?.balance,
  xp:()=>levelHud.xp(),
  zone:()=>document.querySelector('#minimap-zone')?.textContent?.trim()??'',
  touch:()=>touchMode(),
  soundOn:()=>audio.enabled||media.some(m=>m.soundEnabled),
  toggleSound:()=>{const on=!(audio.enabled||media.some(m=>m.soundEnabled));if(audio.enabled!==on)audio.toggle();media.forEach(m=>m.setMuted(!on));},
  jukeboxVolume:()=>jukebox.ownVolume,televisionVolume:()=>television.ownVolume,
  mic:()=>({on:voice.micActive,unavailable:voice.unavailableReason,status:voice.status||(voice.micActive?'Microfone ligado.':'Microfone desligado.')}),
  toggleMic:()=>void toggleMicrophone(),
  inputDevices:async()=>(await voice.devices()).flatMap((device,i)=>device.deviceId&&device.deviceId!=='default'?[{id:device.deviceId,label:device.label||`Microfone ${i+1}`}]:[]),
  fullscreen:()=>fullscreen.state(),toggleFullscreen:()=>void fullscreen.toggle(),
  panels:{hidden:id=>hud.isHidden(id),available:id=>hud.isAvailable(id),setHidden:(id,hidden)=>hud.setHidden(id,hidden),locked:()=>hud.locked,toggleLock:()=>hud.toggleLock(),reset:()=>hud.reset()},
  graphicsNow:()=>scene?.getGraphics(),
  vrActive:()=>!!scene?.vrActive,
  vrStatus:async()=>await vrSupported()?'Óculos detectados: é só entrar.':vrUnavailableReason(),
  net:()=>({status:netStatus,ping:netPing}),
  chatUnread:()=>document.querySelector('[data-action="chat"]')?.hasAttribute('data-unread')??false,
  guard:()=>fight.guard,
  skill:()=>{const active=activeSkill();return active?{name:active.skill.name,icon:active.skill.icon,key:keyLabel(active.key)}:undefined;},
  seated:()=>!!world?.players[user?.id??'']?.interactionState?.startsWith('seat-'),
  admin:()=>user?.role==='admin',
  armsOn:()=>weapons.gun.on,
  act:name=>menuAct(name),
  portrait:async skin=>{const cached=menuPortraits.get(skin);if(cached)return cached;const src=await scene?.portrait(skin).catch(()=>undefined);if(src)menuPortraits.set(skin,src);return src;},
  portraitNow:skin=>menuPortraits.get(skin),
};
/** Esc may pause only with nothing of the game's in front of the world: a window, the phone, a TV, a dialog or the chat's box take it first. */
const canOpenMenu=()=>inGame&&connected&&!activeModal&&!watchingTv&&!phone.isOpen&&!profile.isOpen&&!foodDialog.isOpen&&!lockerPad.isOpen&&!worldMenuOpen()&&!machineGameOpen()&&!typing()&&!document.body.classList.contains('dead')&&!document.querySelector('.bc-backdrop');
const pauseMenu=createPauseMenu(app,menuTabs(menuHost),{
  sounds:menuSounds,header:()=>menuHeader(menuHost),where:()=>menuHost.zone(),canOpen:canOpenMenu,
  // Death, a call that brings the phone up, or a window the room opens (a trade): the menu steps aside.
  mustClose:()=>!inGame||!connected||!!activeModal||phone.isOpen||profile.isOpen||document.body.classList.contains('dead'),
  opened:()=>{menuSounds.unlock();weapons.release();mouseCapture.sync();touchControls.sync();},
  // Closed by a key: the capture comes back inside that same gesture, which the browser trusts.
  closed:reason=>{if(reason==='window')menuLeftAt=performance.now();mouseCapture.sync();},
});
function menuAct(name:MenuAct):void {
  const self=world?.players[user?.id??''];
  switch(name){
    case 'dance':if(connected&&!performing())network.send('player.emote',{emote:self?.animationState==='dance'?'idle':'dance'});break;
    case 'wave':if(connected&&!performing())network.send('player.emote',{emote:'wave'});break;
    case 'smoke':smoke();break;
    case 'cross-arms':if(connected)network.send('player.emote',{emote:'cross-arms'});break;
    case 'guard':{const why=fight.toggle(self);if(why)toast(why,true);break;}
    case 'skill':useSkill();break;
    case 'table':openTableMenu();break;
    case 'jobs':openJobs();break;
    case 'chat':focusChat();break;
    case 'phone':phone.open();break;
    case 'map':phone.open('mapas');break;
    case 'profile':if(user)void profile.open(user.id);break;
    case 'skins':void skins().catch(error=>toast(errorMessage(error),true));break;
    case 'inventory':void openInventory().catch(error=>toast(errorMessage(error),true));break;
    case 'people':people();break;
    case 'admin':void admin();break;
    case 'leave':void leaveBar();break;
    case 'arsenal':openArsenal();break;
    case 'logout':void (async()=>{await leaveBar();await api('/auth/logout',{});user=undefined;renderAuth();})().catch(error=>toast(errorMessage(error),true));break;
  }
}
/** Once per browser, on the first visit after the toolbar left the screen: where everything went. */
function menuHint():void {
  try{if(localStorage.getItem('bar:menu:hint'))return;localStorage.setItem('bar:menu:hint','1');}catch{return;}
  notices.show({variant:'acao',title:'Menu',text:touchMode()?'O botão de menu, no canto de cima, tem ações, pessoas, ajustes e o guia.':'Aperte Esc para abrir o menu: ações, pessoas, ajustes e o guia.'});
}
const deathUi=createDeathUi($('#game'),{send:(type,payload)=>network.send(type,payload),now:()=>serverNow(),audio:deathAudio,lite:()=>settings.get().graphics.preset==='low',active:on=>document.body.classList.toggle('dead',on)});
const voice=new VoiceChat({sendPacket:packet=>network.sendBytes('voice',packet),sendState:state=>network.send('voice.state',state),notice:(text,error)=>toast(text,error),changed:()=>renderVoice()},settings);
const chatHistory:ChatMessage[]=[];
let administration:ReturnType<typeof adminConsole>|undefined;
let refreshingAdministration=false;
let wardrobe:Wardrobe|undefined;
let collection:ReturnType<typeof createCollection>|undefined;
let inventory:InventoryView|undefined;
let modalGeneration=0;
let watchingTv=false;
// Tonico's pending order and the current job task: private, sent by the room (table.state, job.state).
let tableOrder:TableOrderView|undefined;
let jobTask:JobTaskView|null=null;
let factoryUi:FactoryController|undefined;
/** What the room tells a truck driver about the plant's requests: HighCargo (the phone) reads it. */
const freightFeed=createFreightFeed();
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
  // Password fields share one eye button; the confirmation only exists where a NEW password is chosen.
  const passwordField=(label:string,name:string,placeholder:string,autocomplete:string,rules=false)=>`<label>${label}<span class="pw-wrap"><input name="${name}" type="password" data-pw placeholder="${placeholder}" required autocomplete="${autocomplete}"${rules?` minlength="${PASSWORD_MIN}" maxlength="${PASSWORD_MAX}"`:''}><button type="button" class="pw-toggle" data-action="toggle-password" aria-label="Mostrar senha" aria-pressed="false">${uiIcon('eye')}</button></span></label>`;
  const newPassword=(label:string)=>`${passwordField(label,'password',`Mínimo ${PASSWORD_MIN} caracteres, com letra e número`,'new-password',true)}${passwordField('Confirmar senha','confirmPassword','Repita a senha','new-password',true)}`;
  const titles={login:'Bem-vindo',register:'Nova por aqui?',forgot:'Recuperar senha',reset:'Nova senha'},headIcon=user?'user':authMode==='register'?'userPlus':authMode==='login'?'logIn':'key';
  let intro='',content='';
  if(user){intro=`Olha quem chegou. ${e(user.displayName)}, sua cadeira está esperando.`;content=`<div class="returning-user"><span class="profile-initial" style="--avatar:${e(user.color)}">${e(user.displayName.slice(0,1).toUpperCase())}</span><div><b>${e(user.displayName)}</b><small>${e(user.email)}</small></div></div><button data-action="enter" class="button primary full">Entrar no bar ${go}</button>${!user.verified&&emailVerificationRequired?'<button data-action="resend" class="text-button full">Reenviar confirmação de e-mail</button>':''}`;}
  else if(authMode==='login'){intro='Boa noite, vizinho. Entre na sua conta: a casa é sua.';content=`<form id="auth-form" data-mode="login">${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${passwordField('Senha','password','Sua senha','current-password')}<button type="button" data-action="auth-forgot" class="forgot-link">Esqueci minha senha</button><button class="button primary full" type="submit">Entrar no bar ${go}</button></form>`;}
  else if(authMode==='register'){intro='Chega mais. Uma conta, muitas histórias pra contar.';content=`<form id="auth-form" data-mode="register"><div class="field-row">${formField('Seu nome','displayName','text','Como te chamam?','autocomplete="nickname" minlength="2" maxlength="24"')}${formField('Usuário','username','text','seu_apelido','autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24"')}</div>${formField('E-mail','email','email','voce@exemplo.com','autocomplete="email" maxlength="254"')}${newPassword('Senha')}<button class="button primary full" type="submit">Criar minha conta ${go}</button><p class="fine-print">${emailVerificationRequired?'Confirme seu e-mail para entrar no bar.':'Sua conta será ativada automaticamente. Depois, é só entrar.'}</p></form>`;}
  else if(authMode==='forgot'){intro='Acontece nas melhores. Vamos mandar um link para você criar uma nova senha.';content=`<form id="auth-form" data-mode="forgot">${formField('E-mail da conta','email','email','voce@exemplo.com','autocomplete="email"')}<button class="button primary full" type="submit">Recuperar acesso ${go}</button></form>`;}
  else {intro='Um novo começo. Escolha uma nova senha para sua conta.';content=`<form id="auth-form" data-mode="reset">${newPassword('Nova senha')}<button class="button primary full" type="submit">Salvar nova senha ${go}</button></form>`;}
  // The access card: logged out, a two-way switch (Entrar / Criar conta) over the form; back in, the way to the chair.
  const switcher=user?'':`<div class="auth-switch" role="group" aria-label="Acesso"><button type="button" data-action="auth-login" aria-pressed="${authMode==='login'}">Entrar</button><button type="button" data-action="auth-register" aria-pressed="${authMode==='register'}">Criar conta</button></div>`;
  const aside=user?`<button type="button" data-action="logout" class="text-button full">${uiIcon('logOut')} Usar outra conta</button>`:authMode==='forgot'||authMode==='reset'?`<button type="button" data-action="auth-login" class="text-button full">Voltar ao login</button>`:'';
  $('#auth-content').innerHTML=`<header class="detail-head"><h2>${user?'Continuar':titles[authMode]}</h2>${uiIcon(headIcon)}</header>${switcher}<div class="detail-body"><p class="detail-info">${intro}</p>${content}<div id="auth-message" class="form-message ${message?'':'hidden'}" role="status">${e(message)}</div>${aside}</div><footer class="detail-foot"><span>${uiIcon('signal')} Sem instalação. Só chegar.</span></footer>`;
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
function showModal(title:string,content:string,type:string):void {modalFromMenu=performance.now()-menuLeftAt<1500||(modalFromMenu&&!!activeModal);menuLeftAt=-Infinity;if(activeModal==='storage'&&type!=='storage')leaveStorage();if(activeModal==='trade'&&type!=='trade')trade.leave();$('.modal').classList.toggle('trade-modal',type==='trade');closeDesk();modalGeneration++;media.forEach(m=>m.detachPanel());if(watchingTv)stopWatchingTv();administration?.destroy();administration=undefined;lastFocus=document.activeElement as HTMLElement;activeModal=type;$('.modal').classList.toggle('admin-modal',type==='admin');$('.modal').classList.toggle('moto-modal',type==='moto');$('.modal').classList.toggle('arsenal-modal',type==='arsenal');$('.modal').classList.toggle('collection-modal',type==='skins');$('#modal').classList.toggle('collection-backdrop',type==='skins');collection?.destroy();collection=undefined;arsenalWindow?.destroy();arsenalWindow=undefined;$('.modal').classList.toggle('desk-modal',type==='lights');$('#modal').classList.toggle('desk-backdrop',type==='lights');$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#modal').classList.remove('hidden');scene?.setEnabled(false);$('.modal-header button').focus();}
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
/** The player closed the window (Esc, its X, a click beside it). One opened from the menu brings the menu back where it was. */
/** U (again closes it), the D-pad's right, the wheel's button or the menu's Ações: the weapons, their parts and upgrades (docs/sistemas/armas.md#arsenal). */
function openArsenal():void {
  if(activeModal==='arsenal'){closeModal();return;}
  if(!inGame||!connected||activeModal||!weapons.gun.on)return;
  showModal('ARSENAL','<div id="arsenal-root" class="ar-root"></div>','arsenal');
  arsenalWindow=createArsenal($('#arsenal-root'),weapons,{sounds:menuSounds,balance:()=>inventory?.balance??wardrobe?.balance,close:()=>closeModal()});
}
function dismissModal():void {const back=modalFromMenu&&!!activeModal;closeModal();if(back&&!activeModal&&inGame)pauseMenu.open({quiet:true});}
function closeModal():void {if(activeModal==='storage')leaveStorage();if(activeModal==='trade'){if(!trade.mayClose())return;trade.leave();}modalFromMenu=false;closeDesk();modalGeneration++;media.forEach(m=>m.detachPanel());administration?.destroy();administration=undefined;collection?.destroy();collection=undefined;arsenalWindow?.destroy();arsenalWindow=undefined;activeModal='';$('#modal').classList.add('hidden');scene?.setEnabled(inGame&&connected);lastFocus?.focus();}

const profile=createProfileWindow({
  portrait:skin=>scene?.portrait(skin)??Promise.resolve(undefined),
  highgram:id=>phone.open('highgram',{profile:id}),
  contactSaved:()=>phone.refresh(),
  message:person=>phone.open('highzap',person),
  call:person=>phone.dial(person),
  loadouts:next=>{skillLoadouts=next;renderSkillButton();},
  collection:skin=>{if(inGame&&!activeModal)void skins(skin);},
  toast,
  send:(type,payload)=>network.send(type,payload),
});
const network=new BarNetwork({
  environment:environment=>scene?.setEnvironment(environment),
  input:()=>scene?.getInput()??{dx:0,dz:0,running:false,rotation:0},
  motoInput:()=>scene?.getMotoInput()??NO_MOTO_INTENT,
  moto:(id,body)=>scene?.predictMoto(id,body),
  skin:savedSkin,
  position:position=>scene?.setLocal(position),
  crowd:bytes=>scene?.setCrowd(bytes),
  state:state=>{world=state;scene?.setWorld(state,user!.id);media.forEach(m=>m.setWorld(state,user!.id,connected));desk?.update(state.stageShow);renderWorld();},
  jukebox:openJukebox,
  television:openTelevision,
  shop:()=>{void openShop().catch(error=>toast(errorMessage(error),true));},
  food:onFoodState,
  foodBase:({owned,out,state})=>{courier.setOwned(owned);showModal('HIGHFOOD',basePanelHtml(owned,out,state,livePrice('vehicle:moto'),livePrice('cap:highfood-daily')),'highfood');},
  foodOwned:owned=>courier.setOwned(owned),
  garage:view=>{if(activeModal==='garage')$('#modal-content').innerHTML=garagePanelHtml(view);else showModal('GARAGEM',garagePanelHtml(view),'garage');garageShown=view.garageId;},
  garageTaken:({plate,x,z})=>{if(activeModal==='garage')closeModal();gps.setWaypoint({x,y:0,z,source:'bike',label:`Veículo ${plate}`});},
  motoLocked:({locked})=>{keyChirp(settings.get().master,locked);if(activeModal==='moto'){panelDrawn='';renderMotoPanel();}},
  tradeInvite:invite=>trade.invited(invite),
  tradeUninvite:id=>trade.uninvited(id),
  tradeNotice:text=>notices.show({variant:'aviso',title:'Negociação',text}),
  tradeState:view=>trade.state(view),
  tradeClosed:closed=>trade.closed(closed),
  foodDialog:dialog=>foodDialog.show(dialog),
  sparringDialog:dialog=>sparringUi.show(dialog),
  // The room puts the fighter in the ring: the guard goes up here as if R had been pressed (it will not fight with it down).
  sparringStart:()=>{sparringUi.started();const self=world?.players[user?.id??''];if(!fight.guard){const why=fight.toggle(self);if(why)toast(why,true);}},
  sparringState:state=>sparringUi.update(state),
  sparringResult:result=>{sparringUi.result(result);toast(result.message,!result.won);},
  foodLocker:locker=>lockerPad.show(locker),
  foodCode:right=>lockerPad.answer(right),
  foodDelivered:()=>foodDialog.show(null),
  foodReceipt:receipt=>{
    courier.receipt(receipt);
    if(receipt.balance!==undefined){if(inventory)inventory={...inventory,balance:receipt.balance};if(wardrobe)wardrobe={...wardrobe,balance:receipt.balance};renderBalance();}
  },
  foodNotice:notice=>notices.show({variant:'aviso',...notice}),
  motoReady:at=>{
    courier.setOwned(true);
    gps.setWaypoint({x:at.x,y:0,z:at.z,source:'bike',label:'Sua moto'});
  },
  lights:openLightDesk,
  stage:update=>{
    if(update.open){openStage(update.price??livePrice('stage:pass'));return;}
    if(update.until>0){if(activeModal==='stage')closeModal();}
    else if(update.message)notices.show({variant:'aviso',title:'Palco',text:update.message});
  },
  voice:frame=>voice.receive(frame),
  xp:({xp,gained})=>levelHud.set(xp,gained),
  achievement:badge=>{
    notices.show({variant:'conquista',id:`badge-${badge.id}`,title:badge.name,text:badge.description,tone:BADGE_RARITY_INFO[badge.rarity].color,art:badgeMedal(badge),duration:9000,action:{label:'Ver a carta',run:()=>openBadgeCard(badge)}});
    if(profile.ownId)void profile.open(profile.ownId);
  },
  broadcast:({text,by})=>notices.show({variant:'admin',title:by,text,duration:12000}),
  itemLost:item=>notices.show({variant:'aviso',title:'Sumiu do bolso',text:`Enquanto você estava apagado, levaram: ${itemById(item)?.name??item}.`}),
  deathScene:plan=>{scene?.playDeath(plan);if(plan.victim===user?.id)deathUi.sceneStarted(plan);},
  deathScreen:screen=>{if(screen.phase==='end'&&scene?.getDeath().victim===user?.id)scene?.stopDeath();deathUi.screen(screen);},
  fight:(seq,stream,self)=>fight.decorate(seq,stream,self),
  fightState:(self,acked)=>{fight.reconcile(self,acked);renderGuardMeter(self);},
  fightHit:onFightHit,
  gun:(seq,self)=>weapons.decorate(seq,self),
  gunState:(self,acked)=>weapons.reconcile(self,acked),
  gunPace:input=>weapons.pace(input),
  weaponArsenal:view=>weapons.arsenal(view),
  weaponShot:event=>weapons.shot(event),
  weaponHit:event=>weapons.hit(event),
  inventory:view=>{inventory={stacks:view.stacks,capacity:view.capacity,usedSlots:view.usedSlots,balance:view.balance??inventory?.balance??wardrobe?.balance??0,history:view.history??inventory?.history??[],keys:view.keys??inventory?.keys??[]};trade.refresh();if(wardrobe)wardrobe={...wardrobe,balance:inventory.balance};renderBalance();if(activeModal==='inventory')renderInventory();if(activeModal==='moto')renderMotoPanel();if(activeModal==='storage')renderStorage();},
  inventoryResult:result=>{const item=itemById(result.itemId);if(item?.category==='arma')toast(`${item.name} equipada e adicionada à roda de armas.`);},
  storageState:onStorageState,
  storageClosed:onStorageClosed,
  firework:shot=>scene?.fireworkShot(shot),
  wallet:change=>{
    if(inventory)inventory={...inventory,balance:change.balance};if(wardrobe)wardrobe={...wardrobe,balance:change.balance};
    renderBalance();blackjackUi.refresh();trucoUi.refresh();foosballUi.refresh();poolUi.refresh();trade.refresh();
  },
  table:update=>{
    tableOrder=update.status==='ordered'?update.order:undefined;
    if(update.status==='ordered'&&update.message)notices.show({variant:'aviso',title:'Pedido',text:update.message});
    if(update.status==='cancelled'&&update.message)notices.show({variant:'aviso',title:'Pedido cancelado',text:update.message});
    if(activeModal==='table')renderTableMenu();
  },
  job:update=>{
    if(update.task!==undefined)jobTask=update.task;
    if(update.message&&!update.task)notices.show({variant:'aviso',title:'Trabalho',text:update.message});
    if(activeModal==='jobs')$('#modal-content').innerHTML=jobsHtml(world,jobTask);
    renderJobCard();
  },
  factory:state=>factoryUi?.stateMessage(state as never),
  factoryCart:state=>factoryUi?.cartMessage(state as never),
  employment:state=>factoryUi?.employmentMessage(state as never),
  company:(kind,payload)=>profile.companyMessage(kind,payload),
  employmentRefresh:()=>{network.send('employment.view');profile.employmentChanged();},
  factoryResult:result=>{factoryUi?.resultMessage(result as never);const answer=result as {action:string};if(answer.action.startsWith('freight.')||answer.action==='shipment.cancel')freightFeed.result(result as never);},
  freight:state=>freightFeed.push(state as never),
  machine:(kind,payload)=>kind==='state'?machineShop.stateMessage(payload):kind==='game'?machineShop.gameMessage(payload):machineShop.resultMessage(payload),
  factoryPaid:paid=>factoryUi?.paidMessage(paid as never),
  factoryRoute:route=>{factoryUi?.routeMessage(route as never);if(!courier.state().order)gps.setDelivery(factoryTarget());},
  adminWorld:snapshot=>administration?.world(snapshot),
  serverPerformance:snapshot=>performanceMonitor.receiveServer(snapshot),
  // The room's price table: on entering and whenever the administration changes a price (Preços).
  prices:table=>setPrices(table),
  phoneCall:call=>phone.call(call),
  phonePing:ping=>phone.ping(ping),
  phoneVideo:bytes=>phone.videoFrame(bytes),
  trucoView:view=>{trucoView=view;renderWorld();},
  foosballOpen:({tableId,watching,reason})=>{foosballWatching=watching?tableId:'';if(watching&&reason)notices.show({variant:'aviso',title:'Pebolim',text:`${reason}`});renderWorld();},
  foosballFrame:frame=>{foosballUi.frame(frame);scene?.foosballFrame(frame);},
  poolOpen:({tableId,watching,reason})=>{poolWatching=watching?tableId:'';if(watching&&reason)notices.show({variant:'aviso',title:'Sinuca',text:`${reason}`});renderWorld();},
  poolView:view=>{poolViews.set(view.id,view);scene?.poolView(view);renderWorld();},
  poolShot:shot=>{poolUi.shot(shot);scene?.poolShot(shot,serverNow());},
  poolAim:aim=>poolUi.aim(aim),
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
  ping:ms=>{netPing=`${ms} ms`;performanceMonitor.receivePing(ms);renderNet();},
  status:(message,isConnected)=>{
    connected=isConnected;scene?.setEnabled(sceneActive());audio.setActive(inGame&&connected);performanceMonitor.refresh();
    if(!isConnected&&watchingTv)stopWatchingTv();media.forEach(m=>m.setWorld(world,user?.id??'',connected));
    if(!isConnected){phone.disconnected();vehicleHud.reset();$('#game').classList.remove('vehicle-mounted');hud.setAvailable('actions',true);}
    netStatus=isConnected?'Na área!':'Reconectando…';renderNet();
    $('#waiting-message').textContent=message;
    $('#waiting').classList.toggle('hidden',isConnected||!inGame);
    $('#connection').textContent=message;
    $('#connection').classList.toggle('hidden',isConnected||!inGame);
    if(isConnected)voice.syncState();
  }
});
factoryUi=new FactoryController({send:(type,payload)=>network.send(type,payload),notify:(title,text,warning,id)=>notices.show({variant:warning?'aviso':'acao',title,text,id}),app:()=>scene?.app,localRoot:()=>scene?.localActorRoot(),lowQuality:()=>scene?.getGraphics().preset==='low',volume:()=>settings.get().master,userId:()=>user?.id,environment:()=>scene?.lightingEnvironment()});
const machineShop=new MachineShopController({userName:()=>user?.displayName??'',send:(type,payload)=>network.send(type,payload),notify:(title,text,warning)=>notices.show({variant:warning?'aviso':'acao',title,text,id:`ribeiro-${title}`}),app:()=>scene?.app,graphics:()=>scene?.getGraphics()});
minimap.setPois([...FACTORY_SPOTS.filter(spot=>spot.map).map(spot=>({icon:spot.icon,colour:FACTORY_COLOR,x:spot.x,y:spot.y,z:spot.z})),...RIBEIRO_SPOTS.map(spot=>({icon:spot.id==='receiving'?'truck':spot.id==='stock'?'package':spot.id==='computer'?'wrench':'settings',colour:RIBEIRO_COLOR,x:spot.x,y:spot.y,z:spot.z}))]);

const mediaProfiler=new UpdateProfiler();
const performanceMonitor=new PerformanceMonitor({
  allowed:()=>inGame&&connected&&user?.role==='admin',capturing:()=>sceneActive(),pending:()=>network.telemetry().pending,
  position:positionText,requestServer:()=>network.send('admin.performance'),observe:callback=>{
    mediaProfiler.enabled=!!callback;
    scene?.setPerformanceObserver(callback?frame=>{if(frame)frame.detailPhases={...mediaProfiler.timings};callback(frame);}:undefined);
  },
  inventory:()=>scene?.getDiagnosticInventory()??null,
  context:()=>({scene:scene?.getDiagnosticContext()??null,graphics:settings.get().graphics,network:network.telemetry()}),
});
createPerformanceHud($('#game'),performanceMonitor);

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
  captureBitmap:(width,height)=>scene?scene.captureBitmap(width,height):Promise.resolve(null),
  backlog:()=>network.backlog(),
  setSelfie:on=>scene?.setSelfie(on),
  setZoom:factor=>scene?.setZoom(factor),
  canvas:$<HTMLCanvasElement>('#world'),
  microphone:{active:()=>voice.micActive,set:on=>voice.setMicrophone(on),unavailable:()=>voice.unavailableReason},
  setCallPeer:id=>voice.setCallPeer(id),
  volume:()=>settings.get().master,
  gps,
  food:courier,
  freight:freightFeed,
});
/** VR (docs/sistemas/vr.md): a window, the phone, a table or a menu is open, so the headset shows the screen with the interface. */
const vrWindowOpen=()=>inGame&&(!!activeModal||atFoosball()||atTruco()||atPool()||phone.isOpen||foodDialog.isOpen||lockerPad.isOpen||profile.isOpen||worldMenuOpen()||machineGameOpen()||trade.inviteOpen||pauseMenu.isOpen||document.body.classList.contains('watching-tv'));
/** The VR button on top: only inside the bar, and only for whoever turned the VR on in Configurações. */
function refreshVrButton():void {
  const button=document.querySelector<HTMLButtonElement>('#vr-button');if(!button)return;
  const on=!!scene?.vrActive;
  button.classList.toggle('hidden',!(inGame&&(vrSettings().enabled||on)));
  button.setAttribute('aria-pressed',String(on));
  const label=on?'Sair do VR':'Entrar no VR (Meta Quest 2)';button.title=label;button.setAttribute('aria-label',label);
}
async function toggleVr():Promise<void> {
  if(!scene)return;
  if(scene.vrActive){scene.exitVr();return;}
  if(!inGame){toast('Entre no bar para jogar com o VR.',true);return;}
  if(!await vrSupported()){toast(vrUnavailableReason(),true);return;}
  try{
    // The headset takes the whole view: windows of the 2D page close, the screen in VR opens them again as needed.
    if(activeModal)closeModal();
    await scene.enterVr(vrSettings());
    refreshVrButton();
    toast('VR ligado. Y abre a tela com a interface; aperte o direcional direito para recentralizar.');
  }catch(error){vrLog(`toggleVr falhou: ${errorMessage(error)}`);toast(errorMessage(error),true);refreshVrButton();}
}
watchVr(()=>refreshVrButton());
async function enterBar():Promise<void> {
  if(inGame)return;
  if(!user?.verified){authMessage('Confirme seu e-mail antes de entrar no bar.');return;}
  if(!scene){toast('Seu navegador não conseguiu iniciar o cenário 3D. Ative a aceleração gráfica e recarregue.',true);return;}
  const attempt=admission.beginEntry();if(!attempt)return;
  // Entering is a click: the browser lets this page play voices from now on.
  voice.unlock();audio.unlock();
  inGame=true;$('#lobby').classList.add('hidden');$('#game').classList.remove('hidden');hud.forUser(user.id);refreshVrButton();
  performanceMonitor.forUser(user.id);
  try{
    $('#waiting').classList.remove('hidden');$('#waiting-message').textContent='Carregando o mapa do bar…';await scene.ready;
    // The Morte's five GLBs come once the bar is up and the browser is idle, never in the middle of a scene.
    if('requestIdleCallback' in window)window.requestIdleCallback(()=>scene?.preloadDeath(),{timeout:8000});else setTimeout(()=>scene?.preloadDeath(),3000);
    if(!admission.isCurrentEntry(attempt))return;
    const [result,owned,items,own]=await Promise.all([api<{blocked:string[]}>('/blocks'),api<Wardrobe>('/wardrobe'),api<InventoryView>('/inventory'),api<ProfileView>(`/profile/${encodeURIComponent(user.id)}`).catch(()=>undefined)]);
    if(!admission.isCurrentEntry(attempt))return;
    blocked=new Set(result.blocked);wardrobe=owned;knownSkills=owned.skills.filter(skill=>skill.owned).map(skill=>skill.id);inventory=items;skillLoadouts=own?.loadouts??{};if(own)levelHud.set(own.xp);await network.connect();
    if(!admission.isCurrentEntry(attempt))return;
    await voice.enter();phone.enter();levelHud.enter();menuHint();
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
  profile.close();performanceMonitor.forUser('');
  const task=(async()=>{
  phone.leave();stopWatchingTv();media.forEach(m=>m.reset());voice.leave();audio.setActive(false);
  vehicleHud.reset();$('#game').classList.remove('vehicle-mounted');hud.setAvailable('actions',true);
  gps.reset();foodDialog.reset();lockerPad.reset();trade.reset();courier.update({status:'off',since:0,done:0,earned:0});
  factoryUi?.reset();machineShop.reset();freightFeed.reset();scene?.setFactoryGuide(null);deathUi.reset();scene?.stopDeath();scene?.exitVr();inGame=false;connected=false;refreshVrButton();tableOrder=undefined;jobTask=null;renderJobCard();objectiveBlip.render(null);foodBlip.render(null);garageBlip.render(null);stageBlip.render(null);telaoBlip.render(null);shopBlip.render(null);deskBlip.render(null);ribeiroBlip.render(null);notices.clear();needsHud.reset();levelHud.reset();namesUntil=0;$('#labels').classList.remove('names-on');minimap.reset();$('[data-action="chat"]').removeAttribute('data-unread');wardrobe=undefined;inventory=undefined;accountStats=undefined;netPing='— ms';usedItem='';consumingHud.clear();renderBalance();await network.disconnect();world=undefined;chatHistory.length=0;renderChat();scene?.setEnabled(false);scene?.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:0},'');
  $('#labels').replaceChildren();$('#game').classList.add('hidden');$('#lobby').classList.remove('hidden');$('#blackjack').classList.add('hidden');blackjackUi.reset();$('#truco').classList.add('hidden');trucoUi.reset();trucoView=undefined;$('#foosball').classList.add('hidden');foosballUi.reset();foosballWatching='';$('#pool').classList.add('hidden');poolUi.reset();poolWatching='';poolViews.clear();closeModal();renderAuth();
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
/** The wallet in the money panel; the HUD ignores repeats, since the room's patches call this ten times a second. */
function renderBalance():void {walletHud.set(wardrobe?.balance);}
function renderWorld():void {
  if(!world||!user)return;
  const self=world.players[user.id];
  $('#vehicle-hud').dataset.raining=String(weatherAt(world.serverTime,world.environment).rain>.15);
  const mounted=vehicleHud.update(connected?self:undefined,world.motos??{},world.serverTime,world.fuelServices);
  const fuel=fuelContext(connected?self:undefined,world);
  fuelHud.update(fuel.service,fuel.vehicle,fuel.vehicle?.riderId===self?.id);
  $('#game').classList.toggle('vehicle-mounted',mounted);hud.setAvailable('actions',!mounted);
  renderBalance();
  needsHud.update(self);
  const ordering=self?.interactionState==='counter'&&self.animationState!=='drink';
  $('#dance-button').setAttribute('aria-pressed',String(self?.animationState==='dance'));
  $('#smoke-button').setAttribute('aria-pressed',String(!!self?.smokingSince&&!self.smokingStopAt));
  $('#smoke-button').setAttribute('aria-label',self?.smokingSince?'Apagar cigarro':'Acender cigarro');
  $('#smoke-button .tip').textContent=self?.smokingStopAt?'Apagando cigarro…':self?.smokingSince?'Apagar cigarro':'Fumar';
  renderSkillButton();
  const station=jobStation(),atStation=!!station&&!!self&&!self.interactionState&&!self.currentTableId&&touching(stationInteractable(station),self);
  if(self)gps.update(self.x,self.z);
  // Standing with the phone out, the character looks at it, for everyone.
  if(connected&&!!self?.looking!==phone.isOpen&&lookingSent!==phone.isOpen){lookingSent=phone.isOpen;network.send('phone.look',{on:phone.isOpen});}
  renderMapMarks(self);
  const factoryLabel=self&&inGame&&connected&&!self.interactionState&&!self.currentTableId?factoryUi?.prompt(self,!!truckRearNear(self)):undefined;
  const ribeiroLabel=self&&inGame&&connected&&!self.interactionState&&!self.currentTableId?machineShop.prompt(self):undefined;
  const food=foodPrompt(self)??sparringPrompt(self)??(ribeiroLabel?{label:ribeiroLabel,send:''}:factoryLabel?{label:factoryLabel,send:''}:undefined);
  const interaction=self?nearestObject(self):undefined;
  // At the back of your own truck E opens its hold: the rear counts before getting on (the doors are on the sides; "Entrar" is in its menu).
  const truckBox=self&&!interaction&&!atStation?truckRearNear(self):undefined;
  const moto=self&&!interaction&&!atStation&&!truckBox?freeMotoNear(self):undefined;
  const fallenMoto=self&&!interaction&&!atStation&&!moto&&!truckBox?fallenMotoNear(self):undefined;
  // Near a free spot on the stage: its clips download now, so taking it starts without a wait.
  if(interaction?.type==='musician')scene?.preloadMusician(interaction.spot!);
  const context=$('#context');
  const seated=!!self?.interactionState?.startsWith('seat-')&&self.animationState==='sit';
  $('#table-cta').classList.toggle('hidden',!seated);$('#table-cta-label').textContent=tableOrder?(tableOrder.stage==='carrying'?'Pedido a caminho':'Pedido no balcão'):workersOnShift().length?'Fazer pedido':'Pedir ao Tonico';
  context.classList.toggle('hidden',!self||self.animationState==='kick'||self.interactionState==='thrown'||(!!self.condition&&self.condition!=='normal'&&self.condition!=='recovering')||(!food&&!self.interactionState&&!self.currentTableId&&!interaction&&!atStation&&!moto&&!fallenMoto&&!truckBox));
  $('#context-label').textContent=food?food.label:self?.interactionState==='food-unload'?(courier.state().order?.stage==='collect'?'Retirando o pedido…':courier.state().order?.transport==='horse'?'Pegando o pedido na mochila…':'Tirando o pedido do baú…'):self?.interactionState==='food-locker'?'Digitando o código':self?.interactionState==='food-talk'?'Falando com o cliente':isRidingMoto(self?.interactionState)?(self&&garageUnder(self)?'Garagem: guardar a moto':'para descer'):self?.interactionState?.startsWith('moto-lift:')?'Levantando a moto…':isRepairingMoto(self?.interactionState)?'Consertando a moto…':self?.currentTableId?'Levantar da mesa':ordering?'Cancelar pedido':seated&&tableOrder?'Esperando o pedido':self?.interactionState==='job'?'Parar a tarefa':atStation?`Trabalho · ${station!.label}`:self?.interactionState?.startsWith('toilet-')?'Sair do banheiro':self?.interactionState?.startsWith('mictorio-')?'Sair do mictório':self?.animationState==='stand-up'?'Levantando…':self?.interactionState==='smoke'?(self.animationState==='smoke-stop'?'Apagando o cigarro…':'Apagar o cigarro'):self?.interactionState==='cigarette'?'Fumando um cigarro…':self?.interactionState==='vomit'?'Passando mal…':self?.interactionState?.startsWith('stage-')?musicianLabel(self.interactionState):self?.interactionState?'Levantar / encerrar':interaction?.type==='door'?`${world.doors?.[interaction.id]?.open===false?'Abrir':'Fechar'} a porta · ${interaction.label}`:interaction?.type==='stage'?stageLabel(self!):interaction?.label||(moto?(moto.riderId?'para subir na garupa':'para subir'):fallenMoto?'para levantar a moto':truckBox?'para abrir o baú do caminhão':'');
  const event=world.event;
  if(isRidingHorse(self?.interactionState))$('#context-label').textContent='Desmontar do cavalo';
  if(fuel.service)$('#context-label').textContent='Frentista realizando abastecimento';
  else if(fuel.pump)$('#context-label').textContent=fuel.occupied?'Bomba ocupada':(fuel.vehicle?.fuel??100)>=99.999?'Tanque cheio':'Solicitar abastecimento';
  const eventName={BLACKOUT:'Quem esqueceu de pagar a luz?',DRUNK_NPC:'O Zé acordou inspirado.',PARTY:'Essa rodada é de dança!'};
  $('#event-banner').classList.toggle('hidden',!event?.type);
  if(event?.type)$('#event-banner').innerHTML=`<span class="event-spark">${uiIcon('party')}</span><div><small>Aconteceu no bar</small><b>${eventName[event.type]}</b></div><span class="event-time">${Math.max(0,Math.ceil((event.startedAt+event.durationMs-serverNow())/1000))}s</span>`;
  const table=self?.currentTableId?world.tables[self.currentTableId]:undefined;
  $('#blackjack').classList.toggle('hidden',!table);
  if(table)blackjackUi.update(table,user!.id);
  else blackjackUi.reset();
  // Truco: the panel covers the screen while seated, and the view that came by message says what it shows.
  const atTrucoTable=!!self?.interactionState?.startsWith('truco:')&&!!trucoView,trucoWasOpen=atTruco();
  $('#truco').classList.toggle('hidden',!atTrucoTable);
  if(atTrucoTable)trucoUi.update(trucoView!);
  else if(trucoWasOpen){trucoUi.reset();trucoView=undefined;}
  if(trucoWasOpen!==atTrucoTable)scene?.setEnabled(sceneActive());
  // Pebolim: the table of the place taken; else the one watched (until the player walks away from it).
  const seatedAt=self?.interactionState?.startsWith('foosball:')?self.interactionState.slice('foosball:'.length):'';
  if(seatedAt)foosballWatching='';
  const foosballId=seatedAt||foosballWatching,foosball=foosballId?world.foosball?.[foosballId]:undefined,wasOpen=atFoosball();
  $('#foosball').classList.toggle('hidden',!foosball);
  if(foosball)foosballUi.update(foosball,user!.id,!seatedAt);else if(wasOpen)foosballUi.reset();
  if(wasOpen!==!!foosball)scene?.setEnabled(sceneActive());
  // Sinuca: the table of the seat taken; else the one watched (until the player walks away from it).
  const poolSeat=self?.interactionState?.startsWith('pool:')?self.interactionState.slice('pool:'.length):'';
  if(poolSeat)poolWatching='';
  const poolId=poolSeat||poolWatching,poolView=poolId?poolViews.get(poolId):undefined,poolWasOpen=atPool();
  $('#pool').classList.toggle('hidden',!poolView);
  if(poolView)poolUi.update(poolView,user!.id,!poolSeat);else if(poolWasOpen)poolUi.reset();
  if(poolWasOpen!==!!poolView)scene?.setEnabled(sceneActive());
  if(activeModal==='people')renderPeopleContent();
  if(activeModal==='moto')renderMotoPanel();
  watchOwnEngine(self);
  const hand=inHand()??'';if(hand!==handShown){handShown=hand;renderInventory();}
  if(activeModal==='admin')renderAdminPosition();
  renderJobCard();
  // Also on every patch, not only on the 100 ms tick: a quick use lasts two seconds.
  consumingHud.render(consumptions(world,self,usedItem,serverNow()),serverNow());
}
let marksDrawn='',lookingSent:boolean|undefined;
/** The minimap's marks: where the GPS goes, and your bike when you are off it. */
function renderMapMarks(self:PlayerState|undefined):void {
  const target=gps.target,bike=self?Object.values(world?.motos??{}).find(moto=>moto.ownerId===self.id&&moto.riderId!==self.id):undefined;
  const marks=[...(target&&target.source!=='bike'?[{x:target.x,z:target.z,colour:ROUTE_COLOURS[target.source],icon:target.source==='delivery'?'bag':'mapPin'}]:[]),...(bike?[{x:bike.x,z:bike.z,colour:ROUTE_COLOURS.bike,icon:'bike'}]:[])];
  const key=marks.map(mark=>`${mark.x.toFixed(1)}:${mark.z.toFixed(1)}`).join();
  if(key!==marksDrawn){marksDrawn=key;minimap.setMarks(marks);}
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
  const objective=task?(station&&!task.startedAt?{x:station.x,y:station.y,z:station.z}:null):objectiveNow();
  scene?.setObjective(objective,!!task);minimap.setObjective(objective);
  if(!task){jobPanelKey='';hud.setAvailable('job',false);return;}
  // Rebuilt only when the task changes; rewriting it ten times a second made its buttons miss clicks.
  const near=!!station&&!!self&&touching(stationInteractable(station),self),key=`${task.stationId}|${task.startedAt}|${task.tasks}|${task.earned}|${near}`;
  if(key!==jobPanelKey){jobPanelKey=key;$('#job-body').innerHTML=jobPanelHtml(task,near);}
  jobPanelTick($('#job-body'),$('#job-summary'),task,serverNow());
  // Filled before it shows, so the layout fits the whole panel on screen.
  hud.setAvailable('job',true);
}
const objectiveBlip=createObjectiveBlip($<HTMLCanvasElement>('#job-blip'));
// Highfood's base, in the brand's colour: its ring near the bar, named to the player standing on it.
const foodBlip=createObjectiveBlip($<HTMLCanvasElement>('#food-blip'),{accent:['--blip-food','#ff3d5a'],edge:false,within:HIGHFOOD.BASE_REACH});
// The garages, in the cyan of everything about vehicles: the nearest one is named to the player standing on its ring.
const garageBlip=createObjectiveBlip($<HTMLCanvasElement>('#garage-blip'),{accent:['--blip-garage','#17d4f4'],edge:false,within:GARAGE.REACH});
/** The garage under whoever is riding slowly enough to stop: E opens it instead of getting off. */
function garageUnder(self:PlayerState){
  const moto=Object.values(world?.motos??{}).find(each=>each.riderId===self.id);
  if(moto&&Math.abs(moto.speed)>1)return undefined;
  return INTERACTABLES.find(object=>object.type==='garage'&&canInteract(object,self));
}
let garageShown:string='';
// Where the stage is entered and its pass bought: the foot of its steps, in the stage's magenta (--blip-stage). Its
// badge names it only to the player standing on its ring; the ring alone marks it from afar.
const stageBlip=createObjectiveBlip($<HTMLCanvasElement>('#stage-blip'),{accent:['--blip-stage','#ff47c2'],edge:false,within:BLIP_RADIUS});
// Where a video is put on the telão: the middle of the stage's front edge, in teal (--blip-telao), named the same way.
// Both rings show only in the backyard.
const telaoBlip=createObjectiveBlip($<HTMLCanvasElement>('#telao-blip'),{accent:['--blip-telao','#3adfd7'],edge:false,within:BLIP_RADIUS});
// The house's shop: its gold ring in the backyard (--blip-shop), named to the player standing on it.
// EMPRESA BRASIL: the station the player stands near by name (amber), and the next step wherever it is (the job's green, with an arrow on the edge).
const factoryBlip=createObjectiveBlip($<HTMLCanvasElement>('#factory-blip'),{accent:['--blip-factory','#ffb020'],edge:false,within:12});
const factoryGuideBlip=createObjectiveBlip($<HTMLCanvasElement>('#factory-guide-blip'));
const ribeiroBlip=createObjectiveBlip($<HTMLCanvasElement>('#ribeiro-blip'),{accent:['--blip-ribeiro',RIBEIRO_COLOR],edge:false,within:RIBEIRO_COMPUTER.reach});
let factoryFrameAt=performance.now();
const shopBlip=createObjectiveBlip($<HTMLCanvasElement>('#shop-blip'),{accent:['--blip-shop','#fac416'],edge:false,within:BLIP_RADIUS});
// The light desk up on the stage, in the logo's violet (--blip-desk): its ring shows in the backyard, on the deck too.
const deskBlip=createObjectiveBlip($<HTMLCanvasElement>('#desk-blip'),{accent:['--blip-desk','#a77bff'],edge:false,within:BLIP_RADIUS});
const telaoLabel=()=>world?.televisions?.telao?.status==='playing'?`Telão · pôr vídeo na fila · ${livePrice('media:telao')} moedas`:`Vídeo no telão · ${livePrice('media:telao')} moedas`;
/** The parked delivery bike within reach, on foot and free (a bought one only for its owner): E gets on it. Anything else within reach comes first. */
// The truck's hold (apps/web/src/storage-panel.ts): E standing behind your own truck, or "Abrir baú" in its menu. The room opens the door and answers with the hold.
let storageView:StorageView|undefined,storageMoto='',storageSelected='',storageBusy=false;
/** Your own truck whose back you stand at, still, and which the room would open (the same rules, shared). */
function truckRearNear(self:PlayerState):MotoState|undefined {
  if(self.interactionState||self.currentTableId||activeModal)return undefined;
  return Object.values(world?.motos??{}).find(moto=>moto.ownerId===self.id&&hasStorage(moto.model)&&!!moto.vehicleId&&Math.abs((self.y??moto.y)-moto.y)<.7&&!storageRefusal(moto,self.id,storageGap(moto,self),vehicleMotionSpeed(moto),.3));
}
function openStorage(motoId:string):void {if(!inGame||!connected||activeModal&&activeModal!=='storage')return;storageBusy=true;network.send('storage.open',{motoId});}
/** The panel goes (closed by the player, or by another window): the door goes down. */
function leaveStorage():void {if(storageMoto)network.send('storage.close',{motoId:storageMoto});storageMoto='';storageView=undefined;storageSelected='';storageBusy=false;}
function renderStorage():void {
  if(activeModal!=='storage'||!storageView)return;
  const kept=document.querySelector<HTMLElement>('#modal-content')?.scrollTop??0;
  $('#modal-content').innerHTML=storagePanelHtml({storage:storageView,backpack:inventory?.stacks??[],backpackCapacity:inventory?.capacity??12,selected:storageSelected,busy:storageBusy});
  document.querySelector<HTMLElement>('#modal-content')?.scrollTo({top:kept});
}
function onStorageState(message:{motoId:string;storage:StorageView}):void {
  storageBusy=false;storageView=message.storage;
  if(activeModal!=='storage'){storageMoto=message.motoId;showModal(message.storage.name,'','storage');}
  storageMoto=message.motoId;
  // The stack picked may be gone after a move: keep the selection only while it still exists on its side.
  const [side,itemId]=storageSelected.split(':');
  if(side==='hold'&&!message.storage.stacks.some(stack=>stack.itemId===itemId))storageSelected='';
  renderStorage();
}
const STORAGE_CLOSED:Record<string,string>={away:'Você se afastou do caminhão: o baú fechou.',idle:'O baú fechou por inatividade.',left:'O baú fechou.',gone:'O caminhão não está mais aqui: o baú fechou.'};
function onStorageClosed(message:{motoId:string;why:string}):void {
  if(message.motoId!==storageMoto&&activeModal==='storage')return;
  storageMoto='';storageView=undefined;storageBusy=false;
  if(activeModal==='storage')closeModal();
  if(STORAGE_CLOSED[message.why])toast(STORAGE_CLOSED[message.why]!);
}
function freeMotoNear(self:PlayerState){
  return self.interactionState||self.currentTableId?undefined:nearestFreeMoto(self,Object.values(world?.motos??{}),self.id);
}
/** The shift's news: the GPS follows the order. */
/** A truck driver's trip for EMPRESA BRASIL as the GPS's target (the courier's own order comes first). */
function factoryTarget():GpsTarget|null {
  const route=factoryUi?.route();
  return route?{x:route.x,y:route.y,z:route.z,source:'delivery',label:`${route.title} · ${route.label}`}:null;
}
function onFoodState(state:HighfoodState):void {
  courier.update(state);
  const order=state.order;
  // First the kerb at the pickup point; then to the kerb in front of them while riding; on foot, to the customer.
  if(order?.stage==='pickup')gps.setDelivery({x:order.pickup.parkX,y:0,z:order.pickup.parkZ,source:'delivery',label:`Ponto de retirada · ${order.pickup.address}`});
  else gps.setDelivery(order?{x:order.stage==='going'?order.parkX:order.x,y:order.y,z:order.stage==='going'?order.parkZ:order.z,source:'delivery',label:`${order.customer.name} · ${order.address}`}:factoryTarget());
  if(world)renderWorld();
}
/** What E does for the courier here, if anything; beats everything else in reach. */
function foodPrompt(self:PlayerState|undefined):{label:string;send:string}|undefined {
  const order=courier.state().order;
  if(!self||!order||self.currentTableId)return;
  if(order.stage==='pickup'&&!self.interactionState&&atPickup(order.pickup,self))return {label:'Retirar o pedido',send:'food.locker'};
  if(order.stage==='carrying'&&!self.interactionState&&Math.hypot(order.x-self.x,order.z-self.z)<=HIGHFOOD.HAND_REACH)return {label:`Entregar o pedido a ${order.customer.name}`,send:'food.talk'};
  if(order.stage==='going'&&!self.interactionState&&Math.hypot(order.x-self.x,order.z-self.z)<=HIGHFOOD.UNLOAD_REACH){
    if(order.transport==='horse')return {label:'Pegar o pedido na mochila',send:'food.unload'};
    const bike=Object.values(world?.motos??{}).find(moto=>moto.ownerId===self.id);
    if(bike&&!bike.phase&&!bike.riderId&&motoDistance(bike,self)<=2)return {label:'Pegar o pedido no baú',send:'food.unload'};
  }
}
/** Where the ring in the scene goes: the worker's station first (renderJobCard), then the customer, then what the player marked. */
function objectiveNow():Required<Position>|null {
  const order=courier.state().order;
  if(order?.stage==='pickup')return {x:order.pickup.standX,y:order.pickup.y,z:order.pickup.standZ};
  if(order)return order.stage==='going'?{x:order.parkX,y:0,z:order.parkZ}:{x:order.x,y:order.y,z:order.z};
  const mark:GpsTarget|undefined=gps.waypoint;
  return mark?{x:mark.x,y:floorHeight(mark.x,mark.z,.15)??mark.y??0,z:mark.z}:null;
}
const objectiveTitle=()=>{const order=courier.state().order;return !jobTask&&order?(order.stage==='pickup'?'Retirada':order.stage==='going'?'Entrega':order.customer.name):!jobTask&&gps.waypoint?gps.waypoint.label:'';};
/** A bike on the ground within reach: E lifts it. */
function fallenMotoNear(self:PlayerState){
  return self.interactionState||self.currentTableId?undefined:nearestFallenMoto(self,Object.values(world?.motos??{}));
}
/** What E uses: a stage musician's spot only from up on the stage, and only while nobody plays there; the light desk from up there; Highfood's base not with an order under way (the bar's own pickup point has the bike stopping on its ring). */
function nearestObject(self:PlayerState):Interactable|undefined {
  return nearestInteraction(self,object=>object.type==='highfood'?!courier.state().order:object.type==='lights'?onStage(self):object.type!=='musician'||(onStage(self)&&!world?.musicians?.[object.spot!]?.playerId));
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
// The vehicle's panel: which bike and part it shows, and what it last drew (the room's patches come ten times a second).
let panelMoto='',panelPart:string=MOTO_PARTS[0].id,panelDrawn='',repairSeen='',repairStart=0;
async function openMotoPanel(id:string):Promise<void>{
  if(!inGame||!connected||!world?.motos?.[id])return;
  panelMoto=id;panelPart=MOTO_PARTS[0].id;panelDrawn='';
  showModal('Informações do veículo','<p>Olhando a moto…</p>','moto');
  renderMotoPanel();
  const generation=modalGeneration;
  // The backpack may not have been opened yet: the pieces are counted from it.
  if(!inventory){const result=await api<InventoryView>('/inventory');if(activeModal==='moto'&&generation===modalGeneration){inventory=result;renderMotoPanel();}}
}
function renderMotoPanel():void {
  if(activeModal!=='moto')return;
  const moto=world?.motos?.[panelMoto],self=world?.players[user?.id??''];
  if(!moto||!self){$('#modal-content').innerHTML='<p class="modal-description">Essa moto não está mais no mapa.</p>';panelDrawn='';return;}
  const parts=readVehicleParts(moto.model,moto.parts),repairRule=vehicleRepair(moto.model),pieces=inventory?.stacks.find(stack=>stack.itemId===repairRule.item)?.quantity??0;
  const repair=repairOf(self.interactionState);
  if(self.interactionState!==repairSeen){repairSeen=self.interactionState??'';repairStart=performance.now();}
  // The same cases the room refuses, said before trying.
  const blocked=parts[panelPart]!>=100?'Esta parte está perfeita.':vehicleOccupants(moto).some(Boolean)?'Alguém está usando o veículo.':moto.phase&&moto.phase!=='down'?'Espere o veículo parar.':Math.abs(moto.speed)>0?'Espere o veículo parar.'
    :!canRepairMoto(moto,self,0)?'Chegue mais perto do veículo para consertar.':self.interactionState||self.currentTableId?'Encerre o que está fazendo primeiro.':pieces<repairRule.pieces?`Você precisa de uma peça de ${isCar(moto)?'carro':'moto'}. A loja da casa vende.`:'';
  const key=[moto.parts,moto.engine,moto.locked,moto.color,moto.doors,moto.hood,moto.trunk,moto.wipers,moto.headlights,moto.riderId,moto.passengers?.join(','),pieces,blocked,panelPart,repairSeen].join('|');
  if(key===panelDrawn)return;
  panelDrawn=key;
  const active=document.activeElement;if(active instanceof HTMLInputElement&&active.matches('[data-car-color]'))return;
  $('#modal-content').innerHTML=motoPanelHtml({moto,selected:panelPart,pieces,blocked,viewerId:self.id,keyHolder:!!moto.ownerId&&moto.ownerId===self.id,working:repair?{...repair,elapsed:performance.now()-repairStart}:undefined});
}
// What the rider's own engine just did: the sound says it, and this says what to do about it.
let ownEngine:{id:string;engine:number}|undefined;
function sendVehicleControl(vehicleId:string,action:string):void {
  if(action==='engine'&&world?.motos?.[vehicleId]?.engine!==MOTO_ENGINE.OFF)ownEngine=undefined;
  network.send('vehicle.control',{vehicleId,action});
}
function watchOwnEngine(self:PlayerState|undefined):void {
  const moto=self&&isRidingMoto(self.interactionState)?Object.values(world?.motos??{}).find(each=>each.riderId===self.id):undefined;
  if(!moto){ownEngine=undefined;return;}
  const before=ownEngine?.id===moto.id?ownEngine.engine:undefined;
  ownEngine={id:moto.id,engine:moto.engine};
  if(moto.engine!==MOTO_ENGINE.OFF||before===undefined||before===MOTO_ENGINE.OFF)return;
  notices.show({variant:'aviso',title:(moto.fuel??100)<=0?'Combustível acabou':before===MOTO_ENGINE.ON?'O motor morreu':'Não pegou',text:(moto.fuel??100)<=0?'Abasteça no posto.':'Use o motor no painel ou aperte W para tentar de novo. Confira as condições do veículo.'});
}
/** The key's button (L, the bike's menu or its panel). */
function lockOwnBike():void {
  const ridden=Object.values(world?.motos??{}).find(moto=>moto.riderId===user?.id);
  if(ridden){network.send('vehicle.control',{vehicleId:ridden.id,action:'lock'});return;}
  const bike=Object.values(world?.motos??{}).find(moto=>moto.ownerId===user?.id);
  if(!bike){toast('Sua moto não está na rua.',true);return;}
  network.send('moto.lock',{locked:!bike.locked});
}
function interact():void {
  if(!connected||!world||!user||activeModal)return;
  const self=world.players[user.id];if(!self)return;
  if(!self.interactionState&&!self.currentTableId&&machineShop.interact(self))return;
  // Seated, riding or at a table, E is that activity's own (getting off, leaving); the plant's stations are for someone on foot.
  if(!self.interactionState&&!self.currentTableId&&factoryUi?.interact(self,!!truckRearNear(self)))return;
  const fuel=fuelContext(self,world);
  if(fuel.service)return;
  if(fuel.pump&&fuel.vehicle){sendVehicleControl(fuel.vehicle.id,'refuel');return;}
  const food=foodPrompt(self)??sparringPrompt(self);
  if(food){network.send(food.send,{});return;}
  if(self.currentTableId){blackjackUi.requestLeave();return;}
  if(self.interactionState.startsWith('truco:')){trucoUi.requestLeave();return;}
  if(self.interactionState.startsWith('foosball:')||foosballWatching){foosballUi.requestLeave();return;}
  if(self.interactionState.startsWith('pool:')||poolWatching){poolUi.requestLeave();return;}
  if(isRidingMoto(self.interactionState)){const garage=garageUnder(self);if(garage){network.send('player.interact',{objectId:garage.id});return;}}
  if(self.interactionState){network.send('player.interact',{objectId:'stand'});return;}
  const station=jobStation();
  if(station&&touching(stationInteractable(station),self)){network.send('job.work');return;}
  const object=nearestObject(self);
  if(!object){const box=truckRearNear(self);if(box){openStorage(box.id);return;}const moto=freeMotoNear(self)??fallenMotoNear(self);if(moto)network.send('moto.mount',{motoId:moto.id});return;}
  if(object.type==='counter'){orderDrink();return;}
  if(object.type==='blackjack')network.send('blackjack.join',{tableId:object.id});
  else if(object.type==='truco'){trucoView=undefined;network.send('truco.join',{tableId:'truco-1'});}
  else if(object.type==='foosball')network.send('foosball.join',{tableId:object.id});
  else if(object.type==='pool')network.send('pool.join',{tableId:object.id});
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
/** F toggles a cigarette independently of walking, holding a drink and seated interactions. */
function smoke():void {
  if(!connected||activeModal||!world||!user)return;
  const self=world.players[user.id];
  if(!self?.smokingSince&&(performing()||(self?.interactionState&&!self.interactionState.startsWith('seat-')))){toast('Encerre a a\u00e7\u00e3o atual antes de acender um cigarro.');return;}
  network.send('player.emote',{emote:'smoke'});
}
function cigarette():void {smoke();}
/** The active skill of the skin being worn and its key (chosen in the profile window, tab Skill). */
let skillLoadouts:SkillLoadouts={};
/** The skills this account bought: the hotbar only offers those (the room checks it again). */
let knownSkills:string[]=[];
function activeSkill(){
  const loadout=loadoutOf(skillLoadouts,world?.players[user?.id??'']?.skin,knownSkills),skill=skillById(loadout?.skill);
  return loadout&&skill?{skill,key:loadout.key}:undefined;
}
function useSkill():void {
  const active=activeSkill();
  if(!active||!connected||activeModal||performing())return;
  // With the guard up Rafael's kick key throws the fight's kicks (combos with the punches, FIGHT_MOVES); the free throwing kick is for no guard.
  if(fight.guard){if(kickClip(active.skill.id))fight.press('kick');return;}
  network.send('player.skill',{skill:active.skill.id});
}
let shownSkill:string|undefined;
/** The hotbar's button for the active skill; written only when it changes, since the room's patches call this ten times a second. */
function renderSkillButton():void {
  const active=activeSkill(),key=active?`${active.skill.id}:${active.key}`:'';
  if(key===shownSkill)return;shownSkill=key;
  const button=$('#skill-button');button.classList.toggle('hidden',!active);
  button.innerHTML=active?`${uiIcon(active.skill.icon)}<span class="tip">${e(active.skill.name)}</span><kbd>${e(keyLabel(active.key))}</kbd>`:'';
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
    const worn=world?.players[user?.id??'']?.skin,skin=(worn===FACTORY_UNIFORM?FACTORY_UNIFORM_NAME:SKINS.find(skin=>skin.id===worn)?.name)||'Carregando';
    const key=JSON.stringify(['account',user?.displayName,user?.email,user?.color,skin,accountStats]);
    if(key===peopleKey)return;peopleKey=key;
    const stats=accountStats?`<div><b>${accountStats.gamesPlayed}</b><span>rodadas</span></div><div><b>${accountStats.wins}</b><span>vitórias</span></div><div><b>${accountStats.draws}</b><span>empates</span></div><div><b>${accountStats.losses}</b><span>derrotas</span></div>`:'Carregando suas rodadas…';
    panel.innerHTML=`<div class="account-card"><span class="profile-initial" id="avatar" style="--avatar:${e(user?.color)}">${e(user?.displayName.slice(0,1).toUpperCase())}</span><h3 id="hud-name">${e(user?.displayName)}</h3><p id="hud-skin">${e(skin)} · B.A.R.</p><p>${e(user?.email)}</p></div><div id="statistics" class="statistics">${stats}</div><button class="button primary full" data-action="profile" data-id="${e(user?.id)}">${uiIcon('idCard')} Seu perfil</button><button class="button secondary full" data-action="leave">Voltar à entrada</button><button class="text-button full" data-action="logout">Sair da conta</button>`;
    return;
  }
  const players=Object.values(world?.players||{}).filter(player=>player.id!==user?.id);
  const key=JSON.stringify(['people',world?.occupancy,world?.capacity,...players.map(p=>[p.id,p.displayName,p.level,p.connected,p.voice,blocked.has(p.id),voice.isMuted(p.id)])]);
  if(key===peopleKey)return;peopleKey=key;
  const occupancy=world?.occupancy??0,capacity=world?.capacity??0;
  panel.innerHTML=`<div class="occupancy"><div class="status-row"><span>${uiIcon('users')} No bar agora</span><b id="occupancy">${occupancy} / ${capacity}</b></div><div class="hud-track"><i id="occupancy-fill" style="width:${capacity?Math.min(100,occupancy/capacity*100):0}%"></i></div><div class="status-row net-row"><span>${uiIcon('signal')} Sua conexão</span><b><span id="hud-status">${e(netStatus)}</span> · <span id="ping">${e(netPing)}</span></b></div></div><p class="modal-description">Você vê as pessoas próximas a você.</p><div class="people-list">${players.map(player=>`<div class="person"><span class="profile-initial" style="--avatar:${e(player.color)}">${e(player.displayName[0])}</span><div><b>${player.level?`${rankIcon(player.level,18)} `:''}${e(player.displayName)}</b><small>${player.connected?(player.voice?'No bar · microfone ligado':'No bar'):'Ausente'}</small></div><button class="mini-button" data-action="profile" data-id="${e(player.id)}">Perfil</button><button class="mini-button" data-action="voice-mute" data-id="${e(player.id)}" aria-pressed="${voice.isMuted(player.id)}">${voice.isMuted(player.id)?'Ouvir voz':'Silenciar voz'}</button><button class="mini-button" data-action="block" data-id="${e(player.id)}">${blocked.has(player.id)?'Desbloquear':'Bloquear'}</button><button class="mini-button" data-action="report" data-id="${e(player.id)}">Denunciar</button></div>`).join('')||'<div class="empty-state">Por enquanto, só você por aqui.<br>Abra outra janela e convide alguém para chegar.</div>'}</div><p class="fine-print">Silenciar voz vale só para você. Bloquear oculta mensagens de chat e corta a voz nos dois sentidos. Denúncias são encaminhadas à administração.</p>`;
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
  // Loaded on first use (the console is a chunk of its own); the window opens only once it is here, so closing it cannot land between the two.
  const {adminConsole}=await import('./admin/console');
  showModal('Administração do bar','<div id="admin-console"></div>','admin');
  administration=adminConsole($('#admin-console'),{performance:performanceMonitor,user:()=>user,send:(type,payload)=>network.send(type,payload),position:positionText,
    changedWallet:()=>{wardrobe=undefined;void refreshAdministration();},denied:()=>{void refreshAdministration();}});
}
async function refreshAdministration():Promise<void>{
  if(refreshingAdministration||!inGame||!connected||!user)return;
  const owner=user.id;refreshingAdministration=true;
  try{
    const accountResult=await api<{user:PublicUser}>('/auth/me');if(user?.id!==owner||!inGame)return;
    const changed=user.role!==accountResult.user.role;user={...user,role:accountResult.user.role,isOwner:accountResult.user.isOwner};

    performanceMonitor.refresh();
    if(user.role!=='admin'&&activeModal==='admin')closeModal();
    if(changed){voice.setPushToTalk(false);renderVoice();pauseMenu.refresh();toast(user.role==='admin'?'Você recebeu acesso à administração.':'Sua permissão administrativa foi removida.');}
    const [result,inventoryResult]=await Promise.all([api<Wardrobe>('/wardrobe'),api<InventoryView>('/inventory')]);if(user?.id!==owner||!inGame)return;wardrobe=result;inventory=inventoryResult;renderBalance();
    knownSkills=result.skills.filter(skill=>skill.owned).map(skill=>skill.id);
    collection?.update(result);
  }catch(error){if(error instanceof ApiError&&error.status===401&&user?.id===owner){user={...user,role:'user',isOwner:false};performanceMonitor.refresh();if(activeModal==='admin')closeModal();}}
  finally{refreshingAdministration=false;}
}
setInterval(()=>{void refreshAdministration();},5000);

/** An item's effects on the needs, as "fome +35" (CONSUMABLES come from the same catalogue). */
const effectList=(item:{effects:object})=>Object.entries(item.effects).filter(([key,value])=>key!=='name'&&typeof value==='number'&&Number(value)!==0)
  .map(([key,value])=>`${({hunger:'fome',thirst:'sede',hp:'vida',drunk:'álcool',bladder:'bexiga'} as Record<string,string>)[key]??key} ${Number(value)>0?'+':''}${value}`);
const CATEGORY_NAMES:Record<string,string>={bebida:'Bebida',comida:'Comida',saude:'Saúde',peca:'Peça',fogo:'Fogos de artifício',industrial:'Carga industrial',arma:'Armamento embalado'};
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
  const stacks=inventory.stacks.filter(stack=>itemById(stack.itemId)),keys=inventory.keys??[];
  const chosenKey=keys.find(key=>`key:${key.vehicleId}`===selectedItem);
  if(!chosenKey&&!stacks.some(stack=>stack.itemId===selectedItem))selectedItem=stacks[0]?.itemId??(keys[0]?`key:${keys[0].vehicleId}`:'');
  const keySlots=keys.map(key=>`<button type="button" class="inventory-slot vehicle-key" data-action="inventory-select" data-item="key:${e(key.vehicleId)}" aria-pressed="${selectedItem===`key:${key.vehicleId}`}" aria-label="${e(VEHICLE_KEY.name)}, placa ${e(key.plate)}" title="${e(VEHICLE_KEY.name)} · placa ${e(key.plate)}\n${e(VEHICLE_KEY.description)}"><img class="item-img" src="${import.meta.env.BASE_URL}${VEHICLE_KEY.icon}" alt="" draggable="false"><small>${e(key.plate)}</small></button>`).join('');
  const slots=keySlots+Array.from({length:inventory.capacity},(_,index)=>{const stack=stacks[index],item=stack&&itemById(stack.itemId);
    return item?`<button type="button" class="inventory-slot" data-action="inventory-select" data-item="${e(item.id)}" aria-pressed="${item.id===selectedItem}" aria-label="${e(item.name)}, ${stack!.quantity}" title="${e(item.name)}">${itemImage(item)}<b>${stack!.quantity}</b></button>`
      :'<span class="inventory-slot empty" aria-hidden="true"></span>';}).join('');
  const stack=stacks.find(entry=>entry.itemId===selectedItem),item=stack&&itemById(stack.itemId);
  let detail='<div class="item-detail empty"><p class="empty-state">Sua mochila está vazia.</p></div>';
  const shownKey=keys.find(key=>`key:${key.vehicleId}`===selectedItem);
  if(shownKey)detail=`<section class="item-detail key-detail" aria-label="${e(VEHICLE_KEY.name)}"><header><span class="item-icon" aria-hidden="true"><img class="item-img" src="${import.meta.env.BASE_URL}${VEHICLE_KEY.icon}" alt="" draggable="false"></span><div><small>Veículo</small><h3>${e(VEHICLE_KEY.name)}</h3></div>${plateHtml(shownKey.plate)}</header><p>${e(shownKey.name)}.</p><p class="key-never">${uiIcon('lock')}<span>${e(VEHICLE_KEY.description)}</span></p></section>`;
  if(item&&stack){
    // Why Usar waits, when it does (the room refuses the same cases).
    const blocked=self?.condition==='fainted'||self?.condition==='stumbling'?'Espere recuperar o equilíbrio.'
      :self?.fireworkEquipped&&item.id!=='rojao'?'Guarde o rojão com R antes de usar outro item.'
      :self?.interactionState||self?.currentTableId?'Levante-se ou termine o que está fazendo para usar itens.'
      :held&&(consumedOverTime(item.id)||item.id==='rojao')?`Ainda na mão: ${itemById(held)?.name??held}. Termine antes de pegar outro.`:'';
    const lasts=consumedOverTime(item.id)?`dura ${clockText(consumeMs(item.id))}`:'na hora',cargo=item.category==='peca'||item.category==='industrial';
    detail=`<section class="item-detail" aria-label="${e(item.name)}"><header><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><div><small>${e(CATEGORY_NAMES[item.category]??item.category)}</small><h3>${e(item.name)}</h3></div><strong>×${stack.quantity}</strong></header>
      <p>${e(item.description)}</p><div class="item-effects">${effectList(item).map(effect=>`<span>${e(effect)}</span>`).join('')}${cargo?'':`<span class="item-time">${uiIcon(item.id==='rojao'?'sparkles':'clock')}${item.id==='rojao'?'1 unidade por disparo':lasts}</span>`}</div>
      ${blocked&&!cargo?`<p class="item-blocked">${e(blocked)}</p>`:''}<div class="item-actions">${cargo?'':`<button class="button primary" data-action="inventory-use" data-item="${e(item.id)}" ${connected&&!blocked?'':'disabled'}>${item.category==='arma'?'Equipar':item.id==='rojao'?(self?.fireworkEquipped?'Guardar':'Equipar na mão'):'Usar'}</button>`}<button class="button secondary" data-action="inventory-discard" data-item="${e(item.id)}">Descartar</button></div></section>`;
  }
  const reason:Record<string,string>={starter:'Kit inicial',purchase:'Compra',use:'Usado',discard:'Descartado',faint:'Perdido ao desmaiar',trade:'Negociação'};
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
  return `<div class="shop-grid">${ITEM_CATALOG.filter(item=>item.price>0).map(item=>{const quantity=quantities.get(item.id)??0,full=quantity>=item.stackMax,cost=itemCost(item.id),poor=view.balance<cost;
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

/** C, or the coins button: the collection (collection/collection.ts). `focusOn`: the card or character it opens on. */
async function skins(focusOn?:string):Promise<void> {
  showModal('Coleção','<div id="collection-root"><p class="cl-loading"><span class="loader" aria-hidden="true"></span></p></div>','skins');
  const generation=modalGeneration;
  try{
    const result=await api<Wardrobe>('/wardrobe');if(activeModal!=='skins'||generation!==modalGeneration)return;
    const owner=user?.id;
    /** Keeps what the rest of the game reads from the wardrobe up to date, and tells the room what changed. */
    const keep=(next:Wardrobe)=>{wardrobe=next;knownSkills=next.skills.filter(skill=>skill.owned).map(skill=>skill.id);if(inventory)inventory={...inventory,balance:next.balance};renderBalance();renderSkillButton();return next;};
    keep(result);
    collection=createCollection($('#collection-root'),result,{
      wearing:()=>world?.players[user?.id||'']?.skin||savedSkin(),
      busy:()=>world?.players[user?.id||'']?.animationState==='kick'?'Espere o golpe terminar para trocar o visual.':'',
      volume:()=>settings.get().master,toast,
      buy:async skin=>{const next=await api<Wardrobe>('/wardrobe/buy',{skin});if(user?.id===owner)keep(next);return next;},
      buySkill:async skill=>{const next=await api<Wardrobe>('/wardrobe/skill',{skill});if(user?.id!==owner)return next;keep(next);network.send('player.appearance');if(profile.ownId)void profile.open(profile.ownId);return next;},
      equip:async skin=>{
        const next=await api<Wardrobe&{user:PublicUser}>('/wardrobe/equip',{skin});
        if(user?.id===owner){user=next.user;keep(next);network.send('player.appearance');if(profile.ownId)void profile.open(profile.ownId);}
        return next;
      },
    },focusOn);
  }catch(error){if(activeModal==='skins'&&generation===modalGeneration){closeModal();toast(errorMessage(error),true);}}
}
/** Como jogar: the menu's guide. */
function help():void {pauseMenu.open({tab:'guia'});}

app.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');if(!button)return;
  const action=button.dataset.action!;
  void (async()=>{
    if(action==='toggle-password'){
      const form=button.closest('form')!,fields=[...form.querySelectorAll<HTMLInputElement>('input[data-pw]')],show=fields[0]?.type==='password';
      fields.forEach(field=>field.type=show?'text':'password');
      form.querySelectorAll<HTMLElement>('.pw-toggle').forEach(toggle=>{toggle.innerHTML=uiIcon(show?'eyeOff':'eye');toggle.setAttribute('aria-pressed',String(show));toggle.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');});
      return;
    }
    if(action.startsWith('auth-')){authMode=action.slice(5) as typeof authMode;renderAuth();return;}
    switch(action){
      case 'enter':await enterBar();break;
      case 'resend':await api('/auth/resend',{email:user?.email});authMessage('Enviamos um novo link de confirmação para seu e-mail.');break;
      case 'leave':await leaveBar();break;
      case 'logout':await leaveBar();await api('/auth/logout',{});user=undefined;renderAuth();break;
      case 'people':people();break;
      case 'profile':closeModal();await profile.open(button.dataset.id!);break;
      case 'people-tab':selectPeopleTab(button.dataset.tab==='account'?'account':'people');break;
      case 'account':people('account');break;
      case 'help':help();break;
      case 'menu':pauseMenu.open();break;
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
      case 'firework-fire':scene?.fireworkFire();break;
      case 'firework-stow':network.send('firework.stow',{});break;
      case 'storage-select':storageSelected=`${button.dataset.side}:${button.dataset.item}`;renderStorage();break;
      case 'storage-move':{
        if(storageBusy||!storageMoto)break;
        storageBusy=true;renderStorage();
        network.send('storage.move',{motoId:storageMoto,itemId:button.dataset.item,quantity:Number(button.dataset.amount),direction:button.dataset.direction,requestId:crypto.randomUUID()});
        break;
      }
      case 'inventory-select':selectedItem=button.dataset.item??'';renderInventory();document.querySelector<HTMLElement>(`.inventory-slot[data-item="${CSS.escape(selectedItem)}"]`)?.focus();break;
      case 'garage-take':network.send('garage.take',{garageId:garageShown,vehicleId:button.dataset.vehicle});break;
      case 'garage-store':network.send('garage.store',{garageId:garageShown,recall:button.dataset.recall==='true'});break;
      case 'moto-lock':lockOwnBike();break;
      case 'inventory-discard':confirmDiscard(button.dataset.item!);break;
      case 'inventory-discard-confirm':{const itemId=button.dataset.item as ItemId;closeModal();network.send('inventory.discard',{itemId,quantity:1});break;}
      case 'food-start':network.send('food.start',{});closeModal();phone.open('highfood');break;
      case 'food-stop':network.send('food.stop',{});closeModal();break;
      case 'food-app':closeModal();phone.open('highfood');break;
      case 'food-motors':closeModal();phone.open('highmotors');break;
      case 'inventory-buy':{const itemId=button.dataset.item as ItemId;button.setAttribute('disabled','');try{const result=await api<InventoryView>('/inventory/buy',{itemId,quantity:1,requestId:crypto.randomUUID()});inventory=result;if(wardrobe)wardrobe={...wardrobe,balance:result.balance};network.send('inventory.sync');renderInventory();renderShop();renderBalance();}finally{button.removeAttribute('disabled');}break;}
      case 'skins':await skins();break;
      case 'skill':useSkill();break;
      case 'audio':{const on=!(audio.enabled||media.some(m=>m.soundEnabled));if(audio.enabled!==on)audio.toggle();media.forEach(m=>m.setMuted(!on));break;}
      case 'stage-buy':network.send('stage.buy');break;
      case 'order':{const self=world?.players[user?.id??''],counter=INTERACTABLES.find(i=>i.type==='counter');closeModal();if(!connected||!self||!counter)break;if(!canInteract(counter,self)){toast('Chegue ao balcão para pedir.');break;}network.send('player.interact',{objectId:counter.id,item:button.dataset.item==='copo'?'copo':'garrafa'});break;}
      case 'table-menu':openTableMenu();break;
      case 'table-cancel':network.send('table.cancel');closeModal();break;
      case 'moto-part':panelPart=button.dataset.part as MotoPartId;renderMotoPanel();break;
      case 'moto-repair':network.send('moto.repair',{motoId:panelMoto,part:button.dataset.part});break;
      case 'vehicle-control':sendVehicleControl(panelMoto,button.dataset.control!);break;
      case 'car-paint':{
        const car=world?.motos?.[panelMoto],color=document.querySelector<HTMLInputElement>('[data-car-color]')?.value;
        if(car?.vehicleId&&color){await api('/vehicles/paint',{vehicleId:car.vehicleId,color});network.send('inventory.sync');panelDrawn='';}break;
      }
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
      case 'vr':await toggleVr();break;
      case 'vr-log-copy':{const text=vrLogText();try{await navigator.clipboard.writeText(text);toast('Log do VR copiado: cole aqui na conversa.');}catch{toast('O navegador não deixou copiar: use Baixar.',true);}break;}
      case 'vr-log-save':{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([vrLogText()],{type:'text/plain'}));link.download='vr-log.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);break;}
      case 'aim-camera-copy':{const text=aimCameraText(settings.get().aimCamera);try{await navigator.clipboard.writeText(text);toast('Valores da câmera de mira copiados: cole aqui na conversa.');}catch{toast(text);}break;}
      case 'weapon-key':{
        const action=button.dataset.key as WeaponAction;
        if(!WEAPON_ACTIONS.includes(action)||button.hasAttribute('data-capturing'))break;
        captureWeaponKey(button,code=>{
          if(code===undefined)return;
          settings.update({weaponKeys:withWeaponKey(settings.get().weaponKeys,action,code)});
          pauseMenu.refresh();
        },text=>toast(text,true));
        break;
      }
      case 'weapon-keys-reset':settings.update({weaponKeys:{...DEFAULT_WEAPON_KEYS}});pauseMenu.refresh();toast('Teclas das armas de volta ao padrão.');break;
      case 'aim-camera-reset':settings.update({aimCamera:{...DEFAULT_AIM_CAMERA}});pauseMenu.refresh();toast('Câmera de mira de volta ao padrão.');break;
      case 'vr-log-clear':clearVrLog();toast('Log do VR apagado.');break;
      case 'dance':if(performing())break;network.send('player.emote',{emote:world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'});break;
      case 'close-modal':dismissModal();break;
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
        if(authMode==='register'||authMode==='reset'){
          const problem=passwordProblem(data.password??'')||(data.password!==data.confirmPassword?'As senhas não são iguais.':'');
          if(problem){authMessage(problem,true);return;}
        }
        delete data.confirmPassword;
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
  if(event.key==='Escape'){if(watchingTv)stopWatchingTv();else if(!activeModal&&profile.closeTop()){}else if(phone.isOpen&&!activeModal)phone.close();else dismissModal();document.activeElement instanceof HTMLElement&&document.activeElement.blur();}
  // Closing must not reach the scene's own C handler on window, which would reopen the selector.
  if(event.code==='KeyC'&&!event.repeat&&activeModal==='skins'){event.preventDefault();event.stopPropagation();closeModal();}
  if(event.key==='Tab'&&activeModal){const focusable=Array.from($('#modal').querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,a[href]'));const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  if(inGame&&!typing()&&!event.repeat){
    if(event.code==='KeyM'){event.preventDefault();void toggleMicrophone();}
    if(event.code==='KeyI'){event.preventDefault();if(activeModal==='inventory')closeModal();else if(!activeModal)void openInventory().catch(error=>toast(errorMessage(error),true));}
    if(event.code==='KeyB'&&settings.get().voiceMode==='ptt'&&(user?.role!=='admin'||event.altKey)){event.preventDefault();voice.setPushToTalk(true);}
    // P (pedido) orders at the table: T, like Enter, opens the chat (BarScene).
    if(event.code==='KeyP'&&!activeModal){event.preventDefault();openTableMenu();}
    else if(event.code==='KeyP'&&activeModal==='table')closeModal();
    if(event.code==='KeyK'&&!activeModal){event.preventDefault();phone.toggle();}
    if(event.code==='KeyL'&&!activeModal&&!event.repeat){event.preventDefault();lockOwnBike();}
    if(event.code==='KeyJ'&&!activeModal){event.preventDefault();openJobs();}
    else if(event.code==='KeyJ'&&activeModal==='jobs')closeModal();
  }
  if(event.key==='Enter'&&inGame&&!activeModal&&!['INPUT','TEXTAREA','BUTTON'].includes((document.activeElement as HTMLElement)?.tagName)){event.preventDefault();focusChat();}
});
document.addEventListener('keyup',event=>{if(event.code==='KeyB')voice.setPushToTalk(false);});
// Passing the mouse over a key says what it says on a click: that it is never lost.
document.addEventListener('pointerover',event=>{
  const slot=(event.target as Element).closest?.<HTMLElement>('.inventory-slot.vehicle-key[data-action="inventory-select"]');
  if(slot&&activeModal==='inventory'&&selectedItem!==slot.dataset.item){selectedItem=slot.dataset.item??'';renderInventory();}
});
window.addEventListener('blur',()=>voice.setPushToTalk(false));
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal'))dismissModal();});
/** A setting moved (the menu's Ajustes pages, or a window that still has one): applied at once, as it moves. */
function settingInput(event:Event):void {
  const input=event.target as HTMLInputElement,key=input.dataset.setting;if(!key||input.type!=='range')return;
  if(key==='vr.resolution'){updateVr({resolution:Number(input.value)/100});const output=input.parentElement?.querySelector('output');if(output)output.textContent=`${input.value}%`;return;}
  if(key.startsWith('graphics.')){settings.update({graphics:nextGraphics(settings.get().graphics,key.slice(9),input.value)});const output=input.parentElement?.querySelector('output');if(output)output.textContent=`${input.value}%`;const preset=document.querySelector<HTMLSelectElement>('[data-setting="graphics.preset"]');if(preset)preset.value='custom';return;}
  if(key.startsWith('cameraFeel.')){const name=key.slice(11) as keyof CameraFeel,value=Number(input.value)/100;settings.update({cameraFeel:{...settings.get().cameraFeel,[name]:value}});const output=input.parentElement?.querySelector('output');if(output)output.textContent=cameraFeelLabel(name,value);return;}
  {const aim=aimSettingPatch(settings.get(),key,input);if(aim){settings.update(aim.patch);const output=input.parentElement?.querySelector('output');if(output&&aim.label)output.textContent=aim.label;return;}}
  const value=Number(input.value)/100;
  if(key==='jukebox')jukebox.setVolume(value);else if(key==='television')television.setVolume(value);else settings.update({[key]:value} as Partial<GameSettings>);
  const output=input.parentElement?.querySelector('output');if(output)output.textContent=`${Math.round(key==='mic'?value*200:value*100)}%`;
}
function settingChange(event:Event):void {
  const target=event.target as HTMLElement;
  if(target instanceof HTMLInputElement&&target.name==='item'&&target.form?.id==='table-order'){tableMenuTotal(target.form);return;}
  const input=event.target as HTMLInputElement|HTMLSelectElement,key=input.dataset.setting;if(!key)return;
  if(key==='vr.enabled'){updateVr({enabled:(input as HTMLInputElement).checked});return;}
  if(key==='vr.light'){updateVr({lightGraphics:(input as HTMLInputElement).checked});return;}
  if(key==='vr.comfort'){updateVr({comfort:(input as HTMLInputElement).checked});return;}
  if(key==='vr.turn'){updateVr({turn:input.value==='smooth'?'smooth':'snap'});return;}
  if(key==='vr.snapDegrees'){updateVr({snapDegrees:Number(input.value) as 15|30|45});return;}
  if(key.startsWith('graphics.')&&!(input instanceof HTMLInputElement&&input.type==='range')){settings.update({graphics:nextGraphics(settings.get().graphics,key.slice(9),input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:input.value)});if(key==='graphics.preset')pauseMenu.refresh();else{const preset=document.querySelector<HTMLSelectElement>('[data-setting="graphics.preset"]');if(preset)preset.value='custom';}return;}
  if(key==='touchUi'){setTouchPreference(input.value==='on'||input.value==='off'?input.value:'auto');return;}
  if(key==='micEnabled'){void voice.setMicrophone((input as HTMLInputElement).checked);return;}
  if(key==='voicesEnabled'){voice.unlock();settings.update({voicesEnabled:(input as HTMLInputElement).checked});return;}
  if(key==='voiceMode'){settings.update({voiceMode:input.value==='ptt'?'ptt':'open'});pauseMenu.refresh();return;}
  // The firearms' page (aim.*, pad.*, shoulder): the nested object is replaced; the help's note changes with its mode.
  if(!(input instanceof HTMLInputElement&&input.type==='range')){const aim=aimSettingPatch(settings.get(),key,input);if(aim){settings.update(aim.patch);if(key==='aim.assistPad')pauseMenu.refresh();return;}}
  if(key==='inputDevice')settings.update({inputDevice:input.value});
  if(key==='camera'&&isCameraMode(input.value)){settings.update({camera:input.value});syncCameraSettings();}
  if(key==='cameraDistance'){settings.update({camera:'third',cameraDistance:Number(input.value)});syncCameraSettings();}
  if(key.startsWith('vr.')||key==='touchUi')pauseMenu.refresh();
}
for(const target of [$('#modal'),$('#pause-menu')]){target.addEventListener('input',settingInput);target.addEventListener('change',settingChange);}
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
settings.subscribe((current,previous)=>{applySound(current);if(current.shoulder!==previous.shoulder)weapons.setShoulder(current.shoulder);renderVoice();if(current.graphics!==previous.graphics)scene?.setGraphics(current.graphics);if(current.camera!==previous.camera||current.cameraDistance!==previous.cameraDistance)scene?.setCamera(current.camera,current.cameraDistance);if(current.cameraFeel!==previous.cameraFeel)scene?.setCameraFeel(current.cameraFeel);});
applySound(settings.get());
/** Microphone level on a −60…0 dB scale, 0–1. */
const levelScale=(rms:number)=>Math.max(0,Math.min(1,(20*Math.log10(Math.max(rms,1e-6))+60)/60));
function renderVoice():void {
  const current=settings.get(),mic=$('#voice-mic');
  mic.classList.toggle('on',voice.micActive);mic.classList.toggle('transmitting',voice.transmitting);
  mic.setAttribute('aria-pressed',String(voice.micActive));
  const micLabel=voice.micActive?(current.voiceMode==='ptt'?`Microfone pronto · segure ${user?.role==='admin'?'Alt+B':'B'} para falar · M desliga`:'Desligar microfone (M)'):'Ligar microfone (M)';
  mic.title=micLabel;mic.setAttribute('aria-label',micLabel);
  if(pauseMenu.isOpen){
    const status=document.querySelector('#voice-status');if(status)status.textContent=voice.status||(voice.micActive?'Microfone ligado.':'Microfone desligado.');
    const toggle=document.querySelector<HTMLInputElement>('[data-setting="micEnabled"]');if(toggle)toggle.checked=voice.micActive;
  }
  if(activeModal==='people')renderPeopleContent();
}
function renderVoiceLevel():void {
  const level=voice.micActive?levelScale(voice.level):0;
  $('#voice-mic').style.setProperty('--level',level.toFixed(3));
  if(!pauseMenu.isOpen)return;
  const fill=document.querySelector<HTMLElement>('#mic-meter-fill');if(fill){fill.style.width=`${level*100}%`;fill.classList.toggle('open',voice.transmitting);}
}
function syncCameraSettings():void {
  const current=settings.get(),select=document.querySelector<HTMLSelectElement>('[data-setting="camera"]'),distance=document.querySelector<HTMLSelectElement>('[data-setting="cameraDistance"]');
  if(select)select.value=current.camera;
  if(distance)distance.value=String(current.cameraDistance);
}
const cameraFeelLabel=(name:keyof CameraFeel,value:number)=>name==='height'?`${value>0?'+':''}${Math.round(value*100)} cm`:`${Math.round(value*100)}%`;
/** Configurações: the menu's Ajustes. */
function openSettings():void {pauseMenu.open({tab:'ajustes'});}

async function start():Promise<void>{
  void network.syncEnvironment();
  setInterval(()=>{void network.syncEnvironment();},30_000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void network.syncEnvironment();});
  void loadPrices();
  try{const config=await api<{emailVerificationRequired:boolean}>('/auth/config');emailVerificationRequired=config.emailVerificationRequired;renderAuth();}catch{/* The server still enforces its verification policy. */}
  try{scene=new BarScene($<HTMLCanvasElement>('#world'),{
    serverNow,
    onShowcaseCut:cut=>$('#lobby').style.setProperty('--cut',String(cut)),
    onShowcaseSlow:()=>$('#lobby').classList.remove('has-3d'),
    onInteract:interact,
    onFirework:direction=>network.send('firework.fire',{direction}),
    onFireworkStow:()=>network.send('firework.stow',{}),
    onFrame:dt=>network.rideFrame(dt),
    onEmote:emote=>emote==='smoke'?smoke():emote==='cigarette'?cigarette():emote==='cross-arms'?network.send('player.emote',{emote}):performing()?undefined:network.send('player.emote',{emote:emote==='wave'?'wave':world?.players[user?.id||'']?.animationState==='dance'?'idle':'dance'}),
    vrWindowOpen,
    onVrEnd:reason=>{refreshVrButton();toast(reason);},
    onVrNotice:text=>toast(text),
    onVrArms:arms=>network.send('player.arms',arms),
    onChat:()=>{if(inGame&&!activeModal)focusChat();},
    onSkins:()=>{if(inGame&&!activeModal)void skins();},
    onShowNames:showNames,
    // Administrators always fly with B; their push-to-talk shortcut is Alt+B.
    onFly:()=>{if(inGame&&!activeModal&&user?.role==='admin')network.send('admin.fly',{on:!world?.players[user.id]?.animationState.startsWith('fly')});},
    onSkillKey:code=>{const active=activeSkill();if(active?.key!==code)return false;useSkill();return true;},
    // The fist fight: R raises or lowers the guard; with it up the mouse buttons (and the touch buttons) punch.
    onGuard:()=>{if(!inGame||activeModal)return;const why=fight.toggle(world?.players[user?.id??'']);if(why)toast(why,true);},
    onPunch:kind=>inGame&&!activeModal&&fight.press(kind),
    // The block key is the guard's while it is up (Space); letting go always counts.
    onBlock:down=>{if(down&&(!inGame||activeModal||!fight.guard))return false;fight.setBlock(down);return down;},
    fight:()=>fight.guard||fight.local||fight.blow?{guard:fight.guard,block:fight.blockUp,punch:fight.local,blow:fight.blow}:undefined,
    onWorldMenu:(x,y,{player,moto})=>{
      if(!inGame||activeModal)return;
      const bike=moto?world?.motos?.[moto]:undefined,other=player&&player!==user?.id&&world?.players[player]?.connected!==false;
      worldMenu({x,y},[
        ...(player?[{id:'profile',icon:'idCard',label:'Perfil',choose:()=>void profile.open(player)}]:[]),
        ...(other?[{id:'trade',icon:'handshake',label:'Negociar',choose:()=>network.send('trade.request',{playerId:player})}]:[]),
        ...(moto?[{id:'moto',icon:'wrench',label:'Informações do veículo',choose:()=>void openMotoPanel(moto).catch(error=>toast(errorMessage(error),true))}]:[]),
        // The bikes' back: asked for from the menu too (E on a bike with a rider does the same). The room refuses it on a Highfood delivery, and says why.
        ...(bike&&isTwoWheeler(bike)&&bike.riderId&&!bike.passengers?.[0]&&bike.riderId!==user?.id?[{id:'moto-pillion',icon:'users',label:'Subir na garupa',choose:()=>network.send('moto.mount',{motoId:bike.id,seat:1})}]:[]),
        ...(bike&&isCar(bike)?vehicleSeats(bike.model).filter((_seat,index)=>!vehicleOccupants(bike)[index]).map(seat=>({id:`car-seat-${vehicleSeats(bike.model).indexOf(seat)}`,icon:'users',label:`Entrar: ${seat.name.toLowerCase()}`,choose:()=>network.send('moto.mount',{motoId:bike.id,seat:vehicleSeats(bike.model).indexOf(seat)})})):[]),
        ...(bike&&isTruck(bike)&&bike.ownerId&&bike.ownerId===user?.id?[{id:'storage',icon:'package',label:'Abrir baú',choose:()=>openStorage(bike.id)}]:[]),
        ...(bike?.ownerId&&bike.ownerId===user?.id?[{id:'lock',icon:bike.locked?'unlock':'lock',label:bike.locked?'Destrancar':'Trancar',choose:()=>lockOwnBike()}]:[]),
      ],bike?.plate?`${plateHtml(bike.plate)}<span>${bike.ownerId?`de ${e(bike.ownerName||'outro jogador')}${bike.locked?' · trancada':''}`:'Moto do bar'}</span>`:'');
    },
    motoVolume:()=>settings.get().master,
    onVehicleControl:(vehicleId,action)=>sendVehicleControl(vehicleId,action),
    onCameraChange:(mode,distance)=>{settings.update({camera:mode,cameraDistance:distance});syncCameraSettings();},
    onMediaFrame:()=>{
      // A window, the phone or a minigame in front of the world lowers the guard (the mouse goes to it).
      if(fight.guard&&needsCursor())fight.lower();
      mediaProfiler.begin();mouseCapture.sync();touchControls.sync();mediaProfiler.mark('mouse');
      media.forEach(m=>m.frame());scene?.setJukeboxDuration(jukebox.duration('jukebox'));scene?.setStageDuration(television.duration('telao'));mediaProfiler.mark('video');
      minimap.render(inGame?()=>scene?.mapView():null);mediaProfiler.mark('minimap');
      objectiveBlip.render(inGame?scene?.projectObjective()??null:null,objectiveTitle());foodBlip.render(inGame&&!courier.state().order?scene?.projectFoodBase()??null:null,courier.state().status==='off'?'Highfood · ficar online':'Highfood');garageBlip.render(inGame?scene?.projectGarage()??null:null,'Garagem');
      const self=world?.players[user?.id??''];stageBlip.render(inGame&&self?scene?.projectStageBlip()??null:null,self?stageLabel(self):'');telaoBlip.render(inGame&&self?scene?.projectStageBlip('telao')??null:null,telaoLabel());shopBlip.render(inGame&&self?scene?.projectStageBlip('shop')??null:null,'Loja da casa');deskBlip.render(inGame&&self?scene?.projectStageBlip('desk')??null:null,'Mesa de luz');{const factoryNow=performance.now(),factorySelf=inGame?self:undefined,guide=factorySelf?factoryUi?.guide()??null:null;factoryUi?.frame(factorySelf,(factoryNow-factoryFrameAt)/1000);factoryFrameAt=factoryNow;scene?.setFactoryRinging(!!factoryUi?.intercomRinging());scene?.setFactoryGuide(guide);factoryGuideBlip.render(guide?scene?.projectFactoryGuide()??null:null,guide?.title??'');const spot=factoryUi?.blipSpot(factorySelf);factoryBlip.render(spot?scene?.projectFactorySpot(spot.id)??null:null,spot?.label??'');}{const machineSelf=inGame?self:undefined;machineShop.frame(machineSelf);const guide=machineShop.blipSpot(machineSelf);scene?.setRibeiroGuide(machineSelf?guide.spot.id:null);ribeiroBlip.render(machineSelf?scene?.projectRibeiroSpot(guide.spot.id)??null:null,guide.title);}mediaProfiler.mark('blips');
      voice.update(inGame?scene?.getListener():undefined,id=>world?.players[id]);renderVoiceLevel();mediaProfiler.mark('voice');

    },
  });scene.setEnvironment(network.environment);scene.setEnabled(false);scene.setDeathAudio(deathAudio);scene.setGraphics(settings.get().graphics);scene.setCamera(settings.get().camera,settings.get().cameraDistance);scene.setCameraFeel(settings.get().cameraFeel);weapons.attach(scene.gunPort(),scene.weaponVisuals);scene.weapons=weapons;}
  catch(error){console.error(error);toast('Não foi possível iniciar o 3D. Verifique a aceleração gráfica do navegador.',true);}
  if(scene&&backdropAllowed())void scene.ready.then(()=>{if(inGame)return;scene?.setShowcase(true);$('#lobby').classList.add('has-3d');}).catch(()=>{});
  const params=new URLSearchParams(location.search);
  if(params.has('verify')){try{await api('/auth/verify',{token:params.get('verify')});renderAuth('E-mail confirmado! Agora é só entrar.');}catch(error){authMessage(errorMessage(error),true);}history.replaceState({},'',location.pathname);}
  if(params.has('reset')){resetToken=params.get('reset')!;authMode='reset';checkingSession=false;renderAuth();return;}
  try{const result=await api<{user:PublicUser}>('/auth/me');user=result.user;}catch{/* No active session: show login. */}
  checkingSession=false;renderAuth();
}
/** The bar behind the entry: not for phones, reduced motion, data saving or automated tests (which want a light page); ?showcase=1 forces it. */
function backdropAllowed():boolean{
  if(new URLSearchParams(location.search).has('showcase'))return true;
  const saving=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection?.saveData;
  return !navigator.webdriver&&!saving&&!touchMode()&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
}
void start();
if(import.meta.env.DEV)void import('./bar-animations-debug').then(({barAnimationsDebug})=>barAnimationsDebug(()=>scene));
// Development telemetry exposes copies only, never a way to command the server.
if(import.meta.env.DEV)Object.defineProperty(window,'barDebug',{value:{fireworks:()=>scene?.getFireworks(),weapons:()=>weapons.view(),vr:()=>scene?.getVr(),food:()=>courier.state(),gps:()=>({route:gps.route,target:gps.target,remaining:gps.remaining}),syncWallet:()=>network.send('inventory.sync'),send:(type:string,payload:unknown)=>network.send(type,payload),barAnimation:(action:Parameters<BarScene['debugBarAnimation']>[0])=>scene?.debugBarAnimation(action),barProp:(id:string,name:string)=>scene?.barProp(id,name),showcase:(pose?:Parameters<BarScene['debugShowcase']>[0])=>scene?.debugShowcase(pose),barChair:(seat:string)=>scene?.barChair(seat),snapshot:()=>({world:structuredClone(world),localId:user?.id}),price:(key:string)=>livePrice(key),performance:()=>scene?.getPerformance(),animations:()=>scene?.getAnimations(),smoking:()=>scene?.getSmoking(),horses:()=>scene?.getHorses(),motos:()=>scene?.getMotos(),motoBag:(action:"attach"|"remove"|"open"|"close",id?:string)=>scene?.debugMotoBag(action,id),ragdolls:()=>scene?.getRagdolls(),blows:()=>scene?.getBlows(),fight:()=>({...scene?.getFight(),guard:fight.guard,local:fight.local?{...fight.local}:undefined,blow:fight.blow?{...fight.blow}:undefined}),fightPress:(kind:'light'|'heavy')=>fight.press(kind),served:()=>scene?.getServed(),map:()=>scene?.getMapStatus(),network:()=>network.telemetry(),jukebox:()=>jukebox.telemetry(),television:()=>television.telemetry(),ambient:()=>audio.telemetry(),ambientTrigger:(kind:string)=>audio.trigger(kind),environment:()=>scene?.getEnvironmentStatus(),city:()=>scene?.getMapStatus().city,graphics:()=>scene?.getGraphics(),job:()=>structuredClone(jobTask),tableOrder:()=>structuredClone(tableOrder),listener:()=>scene?.getListener(),camera:()=>scene?.getCamera(),voice:()=>({mic:voice.micActive,transmitting:voice.transmitting,level:voice.level,status:voice.status,settings:{...settings.get()},...voice.telemetry() as object})}});
/**
 * The names over the avatars: one element per person, kept from tick to tick, its contents rewritten only when they change
 * and its place moved. Rebuilding the whole list ten times a second made new nodes (style, layout and the accessibility
 * tree) for every name each time.
 */
const worldLabels=new Map<string,{node:HTMLSpanElement;html:string;speaking:boolean;x:string;y:string}>();
setInterval(()=>{
  const fireworkVisible=inGame&&connected&&sceneActive()&&!!world?.players[user?.id??'']?.fireworkEquipped;
  $('#firework-hud').classList.toggle('hidden',!fireworkVisible);
  if(fireworkVisible)$('#firework-count').textContent=String(inventory?.stacks.find(stack=>stack.itemId==='rojao')?.quantity??0);
  if(!inGame||!scene||!world)return;
  const labels=performance.now()<namesUntil+NAMES_FADE_MS?scene.projectLabels?.()||[]:[],container=$('#labels'),seen=new Set<string>();
  // Leaving the bar empties the container (replaceChildren): its nodes are made again.
  for(const [id,label] of worldLabels)if(label.node.parentNode!==container)worldLabels.delete(id);
  for(const label of labels){
    const speaking=label.local?voice.transmitting:voice.isSpeaking(label.id),mic=!label.npc&&world?.players[label.id]?.voice,onCall=!label.npc&&world?.players[label.id]?.phone==='call';
    const level=label.npc?0:world?.players[label.id]?.level??0;
    const html=`${onCall?`<i class="label-phone" title="No celular" aria-hidden="true">${uiIcon('phone')}</i>`:''}${mic?`<i class="label-mic" aria-hidden="true">${uiIcon('mic')}</i>`:''}<span class="label-name">${e(label.name)}</span>`;
    let shown=worldLabels.get(label.id);
    if(!shown){const node=document.createElement('span');node.className='world-label';container.append(node);shown={node,html:'',speaking:false,x:'',y:''};worldLabels.set(label.id,shown);}
    seen.add(label.id);
    if(shown.html!==`${level}|${html}`){shown.html=`${level}|${html}`;shown.node.innerHTML=(level?rankIcon(level,18):'')+html;}
    if(shown.speaking!==speaking){shown.speaking=speaking;shown.node.classList.toggle('speaking',speaking);}
    const x=`${label.x}px`,y=`${label.y}px`;
    if(shown.x!==x){shown.x=x;shown.node.style.left=x;}
    if(shown.y!==y){shown.y=y;shown.node.style.top=y;}
  }
  for(const [id,label] of worldLabels)if(!seen.has(id)){label.node.remove();worldLabels.delete(id);}
  if(jobTask)renderJobCard();
  const vehicleSpeed=scene.vehicleSpeed();if(vehicleSpeed!==undefined)vehicleHud.speed(vehicleSpeed);
  if(!hud.isHidden('chat'))$('[data-action="chat"]').removeAttribute('data-unread');
  consumingHud.render(consumptions(world,world.players[user?.id||''],usedItem,serverNow()),serverNow());
  const table=world.tables[world.players[user?.id||'']?.currentTableId];
  const timer=document.querySelector('#turn-timer');if(timer&&table?.deadline)timer.textContent=`${Math.max(0,Math.ceil((table.deadline-serverNow())/1000))}s`;
},100);
