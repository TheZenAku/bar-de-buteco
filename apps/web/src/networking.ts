import {vehicleMoving} from '@bar/shared';
import type {FireworkShot,StorageView} from '@bar/shared';
import {vehicleFuelBusy,type FuelReceipt} from '@bar/shared';
import {Client,type Room} from '@colyseus/sdk';
import {isRidingHorse,moveHorse,normalizeHeading} from '@bar/shared';
import {setDoorStates,movePlayer,flyPlayer,canRun,swayInput,hasStagePass,isRidingMoto,motoHandling,motoObstacle,stepMoto,NO_MOTO_INTENT,TICK_MS,type MotoBody,type MotoInput,type MotoIntent,type TrucoView,type FoosballFrame,type PoolAimView,type PoolShotView,type PoolTableView,type PhoneCallView,type PhonePing,type PlayerState,type WorldState,type PlayerInput,type Position,type PublicUser,type ChatMessage,type InventoryView,type ItemId,type JobTaskView} from '@bar/shared';
import type {DeathPlan,DeathScreen,Badge,GarageView,HighfoodDialog,HighfoodLockerView,HighfoodReceipt,HighfoodState,TradeClosed,TradeInvite,TradeView} from '@bar/shared';
import {api} from './api';
import {ServerClock} from './server-clock';
import type {EnvironmentState,EnvironmentSnapshot} from '@bar/shared';
import {PredictedRide} from './engine/moto-motion';
import type {ServerPerformance} from '@bar/shared';

export interface NetworkHooks {
  firework?:(shot:FireworkShot)=>void;
  environment?:(environment:EnvironmentState)=>void;
  fuelReceipt?:(receipt:FuelReceipt)=>void;
  serverPerformance?:(snapshot:ServerPerformance)=>void;
  /** The player just got a badge (docs/sistemas/conquistas.md). */
  achievement?:(badge:Badge)=>void;
  state:(world:WorldState)=>void; position:(position:Position)=>void;
  chat:(message:ChatMessage)=>void; status:(message:string,connected:boolean)=>void;
  error:(message:string)=>void; ping:(ms:number)=>void;
  input:()=>Omit<PlayerInput,'seq'>;
  /** W/S, A/D and the handbrake, while riding a delivery bike. */
  motoInput?:()=>MotoIntent;
  /** The bike the local player rides as it should be drawn this frame, ahead of the room (undefined once off it). */
  moto?:(id:string,body:MotoBody|undefined)=>void;
  /** Skin to wear on arrival, so the avatar never shows the default first. */
  skin:()=>string;
  jukebox?:(id:string)=>void;
  television?:(id:string)=>void;
  /** The stage's steps were touched (`open`: show the pass panel), or the pass changed: bought, or ran out (`message`). */
  stage?:(update:{open?:boolean;until:number;price?:number;message?:string})=>void;
  /** Highfood: the shift changed, E at the base, a customer's dialog (null closes it), the bag handed over and its pay, something to tell the courier. */
  food?:(state:HighfoodState)=>void;
  foodBase?:(message:{owned:boolean;out:boolean;state:HighfoodState})=>void;
  foodOwned?:(owned:boolean)=>void;
  garage?:(view:GarageView)=>void;
  garageTaken?:(taken:{plate:string;x:number;z:number})=>void;
  motoLocked?:(lock:{plate:string;locked:boolean})=>void;
  tradeInvite?:(invite:TradeInvite)=>void;
  tradeUninvite?:(id:string)=>void;
  tradeSent?:(name:string)=>void;
  tradeNotice?:(text:string)=>void;
  tradeState?:(view:TradeView)=>void;
  tradeClosed?:(closed:TradeClosed)=>void;
  foodDialog?:(dialog:HighfoodDialog|null)=>void;
  foodLocker?:(locker:HighfoodLockerView|null)=>void;
  foodCode?:(right:boolean)=>void;
  foodDelivered?:(facts:{customer:string;onTime:boolean;crashes:number;wornBox:boolean;stars:number})=>void;
  foodReceipt?:(receipt:HighfoodReceipt)=>void;
  foodNotice?:(notice:{title:string;text:string})=>void;
  /** The bike bought on the phone reached the base, or the tow truck brought it. */
  motoReady?:(at:{x:number;z:number},towed:boolean)=>void;
  /** Standing on the shop's blip, E: the room let this browser open the house's shop. */
  shop?:()=>void;
  /** At the light desk, E: the room let this browser open the stage show's panel. */
  lights?:()=>void;
  /** A proximity voice frame relayed by the server. */
  voice?:(frame:Uint8Array)=>void;
  removed?:(kind:'kick'|'ban',reason:string)=>void;
  /** The persistent inventory removed an eligible item when the character fainted. */
  itemLost?:(item:string)=>void;
  /** A bike ran this player over: the life it took, and who was riding ('' with nobody on it). */
  motoStruck?:(hit:{hp:number;by:string})=>void;
  /** The Morte's scene near this player (docs/sistemas/morte.md), and the victim's own screen: the dark, the phrase, the buttons. */
  deathScene?:(plan:DeathPlan)=>void;
  deathScreen?:(screen:DeathScreen)=>void;
  /** Rafael's kick landed on this player: the life it took, and who it was. */
  kicked?:(hit:{hp:number;by:string})=>void;
  inventory?:(view:Partial<InventoryView>&Pick<InventoryView,'stacks'|'capacity'|'usedSlots'>)=>void;
  inventoryResult?:(result:{action:'use'|'discard';itemId:ItemId;quantity:number})=>void;
  /** The truck's hold, as the room answers opening it and each move; and the door going down (why: closed, away, idle, left, gone). */
  storageState?:(message:{motoId:string;storage:StorageView})=>void;
  storageClosed?:(message:{motoId:string;why:string})=>void;
  /** Coins after a change made in the room (media, counter, table, job, refund). */
  wallet?:(change:{balance:number;delta?:number;reason?:string})=>void;
  table?:(update:{status:'ordered'|'delivered'|'cancelled';order:TableOrderView;message?:string})=>void;
  job?:(update:{task?:JobTaskView|null;message?:string})=>void;
  adminWorld?:(snapshot:unknown)=>void;
  crowd?:(bytes:ArrayBuffer|Uint8Array)=>void;
  /** The price table (packages/shared/src/prices.ts), on entering and when the administration changes it. */
  prices?:(table:unknown)=>void;
  /** The phone: a call changed (rings, answered, ended), or another player sent something new (Highzap, Highgram, Pix). */
  phoneCall?:(call:PhoneCallView)=>void;
  phonePing?:(ping:PhonePing)=>void;
  /** A frame of the other end's camera on a video call. */
  phoneVideo?:(bytes:Uint8Array)=>void;
  /** E at a pebolim table: a place was taken (or, `watching`, the table is full or playing and is watched instead). */
  trucoView?:(view:TrucoView)=>void;
  foosballOpen?:(message:{tableId:string;watching:boolean;reason?:string})=>void;
  /** A pebolim table's ball and rods, 30 times a second while a match is on (to its players, watchers and whoever is near). */
  foosballFrame?:(frame:FoosballFrame)=>void;
  /** E at a pool table: a seat was taken (or, `watching`, the table is full or playing and is watched instead). */
  poolOpen?:(message:{tableId:string;watching:boolean;reason?:string})=>void;
  /** A pool table as it is now (to its players, watchers and whoever is near), a stroke's recorded paths, the shooter's aim. */
  poolView?:(view:PoolTableView)=>void;
  poolShot?:(shot:PoolShotView)=>void;
  poolAim?:(aim:PoolAimView)=>void;
}
/** `waiter`: who brings it (Tonico or a worker's name); `stage`: still at the counter, or on its way to the table. */
export interface TableOrderView {id:string;seatId:string;items:ItemId[];total:number;placedAt:number;waiter?:string;stage?:'queued'|'carrying'}
export class BarNetwork {
  room?:Room;
  // By default the game is reached through the site's own address (Vite proxies /game), which also works
  // over https://, where the browser blocks a plain ws:// connection to another port.
  private readonly serverUrl=(import.meta.env.VITE_GAME_URL||'/game').startsWith('/')
    ? `${location.protocol==='https:'?'wss':'ws'}://${location.host}${import.meta.env.VITE_GAME_URL||'/game'}`
    : import.meta.env.VITE_GAME_URL;
  private client=new Client(this.serverUrl);
  private readonly clock=new ServerClock();
  environment?:EnvironmentState;
  /** The renderer, phone, weather and game UI all read this same clock. */
  serverNow=():number=>this.clock.now();
  async syncEnvironment():Promise<void> {
    if(this.transportReady)return;
    const sent=performance.now();
    try{
      const response=await fetch(`${this.serverUrl.replace(/^ws/,'http').replace(/\/$/,'')}/environment`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)return;
      const snapshot:EnvironmentSnapshot=await response.json();
      if(this.transportReady)return;
      this.clock.sync(snapshot.at,(performance.now()-sent)/2);
      this.environment=snapshot.environment;this.hooks.environment?.(snapshot.environment);
    }catch{/* Offline entry: retain the last server reference until the next sample. */}
  }
  private pending:PlayerInput[]=[];
  private pendingMoto:MotoInput[]=[];
  /** The bike being ridden, as predicted, and its id. */
  private ride?:PredictedRide;
  private motoId='';
  /** What the room last heard of the switches and the brake pedal. */
  private sentLamps=0;
  private position:Position={x:0,z:7};
  private seq=0;
  private world?:WorldState;
  private tick?:ReturnType<typeof setInterval>;
  private heartbeat?:ReturnType<typeof setInterval>;
  private stopped=true;
  private generation=0;
  private transportReady=false;
  private wasMoving=false;
  private sentRear=false;
  /** The heading last sent: a turn in place is sent once, and a horse still turning to it does not count. */
  private sentRotation?:number;
  user?:PublicUser;
  constructor(private hooks:NetworkHooks){}
  async connect():Promise<void> {
    this.stopped=false;const generation=++this.generation;
    this.hooks.status('Encontrando uma mesa…',false);
    for(let attempt=0;!this.stopped&&generation===this.generation;attempt++){
      const {ticket,user}=await api<{ticket:string;user:PublicUser}>('/game-ticket',{});
      this.user=user;
      try {const room=await this.client.joinOrCreate('bar',{ticket,skin:this.hooks.skin()});if(this.stopped||generation!==this.generation){await room.leave();return;}this.attach(room);return;}
      catch(error){
        const message=error instanceof Error?error.message:String(error);
        if(/full|cheio|capacity|lotado|locked|4213/i.test(message)){
          this.hooks.status(`Bar cheio. Aguardando uma vaga… (${attempt+1})`,false);
          await new Promise(resolve=>setTimeout(resolve,3000));
        } else {this.stopped=true;throw error;}
      }
    }
  }
  private attach(room:Room):void {
    let removal:{kind:'kick'|'ban';reason:string}|undefined;
    this.room=room;this.pending=[];this.pendingMoto=[];this.seq=0;this.transportReady=true;this.wasMoving=false;this.sentRear=false;this.sentRotation=undefined;this.sentLamps=0;
    Object.assign(room.reconnection,{minUptime:0,minDelay:500,maxDelay:2000,delay:500,maxRetries:15,maxEnqueuedMessages:0});
    this.hooks.status('Você está no bar',true);
    room.onStateChange((state:any)=>{
      const world=(typeof state.toJSON==='function'?state.toJSON():state) as WorldState;
      this.clock.sync(world.serverTime);
      if(world.environment)this.environment=world.environment;
      this.world=world;
      // Prediction must collide with doors exactly where the server has them.
      if(world.doors)setDoorStates(Object.values(world.doors).map(door=>[door.id,door.open] as const));
      this.hooks.state(world);
      const self=world.players?.[this.user!.id];
      if(self){
        this.seq=Math.max(this.seq,self.lastProcessedInput);
        this.pending=this.pending.filter(input=>input.seq>self.lastProcessedInput);
        this.position={x:self.x,y:self.y,z:self.z};
        if((!self.interactionState||isRidingHorse(self.interactionState))&&!self.currentTableId) for(const input of this.pending)this.position=this.predict(input,self);
        this.hooks.position(this.position);
        this.reconcileMoto(world,self);
      }
    });
    // The test server acknowledges explicit placement so pending prediction and
    // the local body's heading cannot overwrite a test fixture's new pose.
    room.onMessage('test.player.placed',(at:Position&{rotation?:number})=>{this.pending=[];this.wasMoving=false;this.position=at;this.hooks.position(at);});
    room.onMessage('chat.message',(message:ChatMessage)=>this.hooks.chat(message));
    room.onMessage('jukebox.open',(message:{id:string})=>this.hooks.jukebox?.(message.id));
    room.onMessage('jukebox.result',()=>{});
    room.onMessage('tv.open',(message:{id:string})=>this.hooks.television?.(message.id));
    room.onMessage('tv.result',()=>{});
    room.onMessage('stage.open',(message:{until:number;price:number})=>this.hooks.stage?.({...message,open:true}));
    room.onMessage('shop.open',()=>this.hooks.shop?.());
    room.onMessage('firework.shot',(shot:FireworkShot)=>this.hooks.firework?.(shot));
    room.onMessage('food.state',(state:HighfoodState)=>this.hooks.food?.(state));
    room.onMessage('food.base',(message:{owned:boolean;out:boolean;state:HighfoodState})=>this.hooks.foodBase?.(message));
    room.onMessage('food.owned',(message:{owned:boolean})=>this.hooks.foodOwned?.(message.owned));
    room.onMessage('garage.state',(view:GarageView)=>this.hooks.garage?.(view));
    room.onMessage('garage.taken',(taken:{plate:string;x:number;z:number})=>this.hooks.garageTaken?.(taken));
    room.onMessage('moto.locked',(lock:{plate:string;locked:boolean})=>this.hooks.motoLocked?.(lock));
    room.onMessage('fuel.receipt',(receipt:FuelReceipt)=>this.hooks.fuelReceipt?.(receipt));
    room.onMessage('trade.invite',(invite:TradeInvite)=>this.hooks.tradeInvite?.(invite));
    room.onMessage('trade.uninvite',(message:{id:string})=>this.hooks.tradeUninvite?.(message.id));
    room.onMessage('trade.sent',(message:{name:string})=>this.hooks.tradeSent?.(message.name));
    room.onMessage('trade.notice',(message:{text:string})=>this.hooks.tradeNotice?.(message.text));
    room.onMessage('trade.state',(view:TradeView)=>this.hooks.tradeState?.(view));
    room.onMessage('trade.closed',(closed:TradeClosed)=>this.hooks.tradeClosed?.(closed));
    room.onMessage('food.dialog',(dialog:HighfoodDialog|null)=>this.hooks.foodDialog?.(dialog));
    room.onMessage('food.locker',(locker:HighfoodLockerView|null)=>this.hooks.foodLocker?.(locker));
    room.onMessage('food.code',(answer:{ok:boolean})=>this.hooks.foodCode?.(answer.ok));
    room.onMessage('food.delivered',(facts:{customer:string;onTime:boolean;crashes:number;wornBox:boolean;stars:number})=>this.hooks.foodDelivered?.(facts));
    room.onMessage('food.receipt',(receipt:HighfoodReceipt)=>this.hooks.foodReceipt?.(receipt));
    room.onMessage('food.notice',(notice:{title:string;text:string})=>this.hooks.foodNotice?.(notice));
    room.onMessage('moto.towed',(at:{x:number;z:number})=>this.hooks.motoReady?.(at,true));
    room.onMessage('lights.open',()=>this.hooks.lights?.());
    room.onMessage('stage.state',(message:{until:number;price?:number;message?:string})=>this.hooks.stage?.(message));
    room.onMessage('needs.itemLost',(message:{item:string})=>this.hooks.itemLost?.(message.item));
    room.onMessage('moto.struck',(hit:{hp:number;by:string})=>this.hooks.motoStruck?.(hit));
    room.onMessage('death.scene',(plan:DeathPlan)=>this.hooks.deathScene?.(plan));
    room.onMessage('death.screen',(screen:DeathScreen)=>this.hooks.deathScreen?.(screen));
    room.onMessage('player.kicked',(hit:{hp:number;by:string})=>this.hooks.kicked?.(hit));
    room.onMessage('achievement.unlocked',(message:{badge:Badge})=>this.hooks.achievement?.(message.badge));
    room.onMessage('inventory.state',(view:Partial<InventoryView>&Pick<InventoryView,'stacks'|'capacity'|'usedSlots'>)=>this.hooks.inventory?.(view));
    room.onMessage('storage.state',(message:{motoId:string;storage:StorageView})=>this.hooks.storageState?.(message));
    room.onMessage('storage.closed',(message:{motoId:string;why:string})=>this.hooks.storageClosed?.(message));
    room.onMessage('inventory.result',(result:{action:'use'|'discard';itemId:ItemId;quantity:number})=>this.hooks.inventoryResult?.(result));
    room.onMessage('voice',(frame:Uint8Array)=>this.hooks.voice?.(frame));
    room.onMessage('wallet.state',(change:{balance:number;delta?:number;reason?:string})=>this.hooks.wallet?.(change));
    room.onMessage('table.state',(update:{status:'ordered'|'delivered'|'cancelled';order:TableOrderView;message?:string})=>this.hooks.table?.(update));
    room.onMessage('job.state',(update:{task?:JobTaskView|null;message?:string})=>this.hooks.job?.(update));
    room.onMessage('admin.world',(snapshot:unknown)=>this.hooks.adminWorld?.(snapshot));
    // The people beyond the avatars, a few times a second, as bytes (packages/shared/src/crowd.ts).
    room.onMessage('crowd',(bytes:ArrayBuffer|Uint8Array)=>this.hooks.crowd?.(bytes));
    room.onMessage('prices',(message:{prices:unknown})=>this.hooks.prices?.(message.prices));
    room.onMessage('phone.call',(call:PhoneCallView)=>this.hooks.phoneCall?.(call));
    room.onMessage('phone.ping',(ping:PhonePing)=>this.hooks.phonePing?.(ping));
    room.onMessage('phone.video',(bytes:Uint8Array)=>this.hooks.phoneVideo?.(bytes));
    room.onMessage('truco.view',(view:TrucoView)=>this.hooks.trucoView?.(view));
    room.onMessage('foosball.open',(message:{tableId:string;watching:boolean;reason?:string})=>this.hooks.foosballOpen?.(message));
    room.onMessage('foosball.frame',(frame:FoosballFrame)=>this.hooks.foosballFrame?.(frame));
    room.onMessage('pool.open',(message:{tableId:string;watching:boolean;reason?:string})=>this.hooks.poolOpen?.(message));
    room.onMessage('pool.view',(view:PoolTableView)=>this.hooks.poolView?.(view));
    room.onMessage('pool.shot',(shot:PoolShotView)=>this.hooks.poolShot?.(shot));
    room.onMessage('pool.aim',(aim:PoolAimView)=>this.hooks.poolAim?.(aim));
    room.onMessage('moderation.removed',(message:{kind:'kick'|'ban';reason:string})=>{if(message.kind==='kick'||message.kind==='ban')removal=message;});
    room.onMessage('error',(payload:{message?:string})=>this.hooks.error(payload.message||'Ação indisponível.'));
    room.onMessage('admin.performance',(snapshot:ServerPerformance)=>this.hooks.serverPerformance?.(snapshot));
    room.onMessage('pong',(payload:{at:number;serverTime?:number})=>{
      const elapsed=Math.max(0,performance.now()-payload.at);
      if(payload.serverTime)this.clock.sync(payload.serverTime,elapsed/2);
      this.hooks.ping(elapsed);
    });
    room.onError((_code:number,message?:string)=>this.hooks.error(message||'A conexão encontrou um problema.'));
    room.onDrop(()=>{this.transportReady=false;this.stopTimers();this.pending=[];this.pendingMoto=[];this.hooks.status('Conexão interrompida. Tentando reconectar…',false);});
    room.onReconnect(()=>{if(this.stopped)return;this.transportReady=true;this.pending=[];this.pendingMoto=[];this.startTimers();this.hooks.status('Você está no bar',true);});
    room.onLeave((code:number)=>{if(!this.stopped&&this.room===room){this.transportReady=false;this.stopTimers();this.stopped=true;if(removal&&this.hooks.removed)this.hooks.removed(removal.kind,removal.reason);else this.hooks.status(code===4000?'Sua participação foi encerrada. Volte à entrada para continuar.':'A conexão terminou. Volte à entrada para entrar novamente.',false);}});
    this.startTimers();this.send('inventory.sync');
  }
  private sendInput():void {
    if(!this.transportReady||!this.room||!this.user||!this.world||this.pending.length>12)return;
    const self=this.world.players[this.user.id];
    if(!self)return;
    // On a bike the frames keep the time (rideFrame).
    if(isRidingMoto(self.interactionState)){this.wasMoving=false;return;}
    const locked=!!((self.interactionState&&!isRidingHorse(self.interactionState))||self.currentTableId);
    const requested=this.hooks.input();
    const intention=locked?{...requested,dx:0,dz:0,running:false,rotation:self.rotation}:requested;
    const moving=!!(intention.dx||intention.dz||intention.dy||intention.aim);
    // Head look is independent of body rotation, also while standing or seated.
    const last=this.pending.at(-1)??self;
    const looking=Math.abs((intention.headYaw??0)-(last.headYaw??0))>.001||Math.abs((intention.headPitch??0)-(last.headPitch??0))>.001;
    // Turning in place (to the selfie's phone, a firework's aim) has to reach the room too.
    const turning=this.sentRotation!==undefined&&Math.abs(normalizeHeading(intention.rotation-this.sentRotation))>.001;
    if(!moving&&!this.wasMoving&&!looking&&!turning&&!!intention.rear===this.sentRear)return;
    this.wasMoving=moving;
    this.sentRear=!!intention.rear;
    this.sentRotation=intention.rotation;
    // A drawn vehicle can have many complete turns. Never let that heading poison the unacknowledged walking queue.
    const input={...intention,rotation:normalizeHeading(intention.rotation),seq:++this.seq};
    this.pending.push(input);
    if(!locked){this.position=this.predict(input,self);this.hooks.position(this.position);}
    this.send('player.input',input);
  }
  /**
   * Each frame, riding: the bike's ticks are counted from the frames' real time and not by a timer, which on a busy page fires
   * late and unevenly; what is drawn is then exactly as far along as the time that passed.
   */
  rideFrame(dt:number):void {
    const {ride}=this;
    if(!ride)return;
    if(this.transportReady)ride.advance(dt,body=>this.stepRide(body));
    this.hooks.moto?.(this.motoId,ride.pose());
  }
  /** A step of the bike per tick, here and in the room; at rest with nothing pressed, nothing to send. */
  private stepRide(body:MotoBody):MotoBody {
    if(vehicleFuelBusy(this.world?.fuelServices,this.motoId)){this.pendingMoto=[];return body;}
    if(this.pendingMoto.length>24)return body;
    const intent=this.hooks.motoInput?.()??NO_MOTO_INTENT;
    // A switch thrown at rest still has to reach the others.
    const lamps=(intent.lights??0)|(intent.brake?16:0)|(intent.horn?32:0)|(intent.wheelie?64:0),changed=lamps!==this.sentLamps;
    // Held horns, handbrakes and wheelies need keepalives even at rest; releases must also cross the idle input stream.
    if(!changed&&!intent.horn&&!intent.brake&&!intent.wheelie&&!intent.throttle&&!intent.steer&&!vehicleMoving(body)&&!body.steer)return body;
    this.sentLamps=lamps;
    const input={...intent,seq:++this.seq};
    this.pendingMoto.push(input);this.send('moto.input',input);
    return stepMoto(body,input,TICK_MS/1000,this.otherBikes(),this.handling());
  }
  /** What this bike's engine and parts allow, the same list the room steps it with. */
  private handling(){
    const moto=this.world?.motos?.[this.motoId];
    return moto?motoHandling(moto):undefined;
  }
  /** The other bikes, as something to run into (the same list the room uses, a patch older). */
  private otherBikes(){
    const motos=Object.values(this.world?.motos??{}).filter(moto=>moto.id!==this.motoId);
    return motos.length?motos.map(motoObstacle):[];
  }
  /** The room's bike and the inputs it has not reached yet, like the avatar's position while walking. */
  private reconcileMoto(world:WorldState,self:PlayerState):void {
    const moto=isRidingMoto(self.interactionState)?Object.values(world.motos??{}).find(m=>m.riderId===self.id):undefined;
    if(!moto){
      if(this.ride){this.hooks.moto?.(this.motoId,undefined);this.ride=undefined;this.pendingMoto=[];}
      return;
    }
    this.pendingMoto=vehicleFuelBusy(world.fuelServices,moto.id)?[]:this.pendingMoto.filter(input=>input.seq>self.lastProcessedInput);
    const rideOf=this.motoId;
    let body:MotoBody=moto;
    this.motoId=moto.id;
    const others=this.otherBikes(),handling=motoHandling(moto);
    for(const input of this.pendingMoto)body=stepMoto(body,input,TICK_MS/1000,others,handling);
    if(this.ride&&rideOf===moto.id)this.ride.correct(body);else this.ride=new PredictedRide(body);
  }
  /**
   * The server's step: running only with stamina, a drunk walk drifts (packages/shared/src/needs.ts), the stage only with
   * a pass. The raw input is what is sent.
   */
  private predict(input:PlayerInput,self:PlayerState):Position {
    if(self.animationState==='fly-fall')return this.position;
    if(self.animationState?.startsWith("fly"))return flyPlayer(this.position,input,TICK_MS/1000);
    if(isRidingHorse(self.interactionState))return self.animationState==='horse-rear'?this.position:moveHorse(this.position,'rotation' in this.position?Number(this.position.rotation):self.rotation,input,TICK_MS/1000);
    return movePlayer(this.position,swayInput({...input,running:input.running&&!self.oldWalk&&canRun(self)},input.seq,self.drunk??0,self.id),TICK_MS/1000,self.oldWalk,hasStagePass(self),Object.values(this.world?.motos??{}).map(motoObstacle));
  }
  send(type:string,payload:unknown={}):void {if(this.room&&!this.stopped&&this.transportReady)this.room.send(type,payload);}
  /** Bytes still waiting in the socket (0 if unknown). */
  backlog():number {try{return (this.room as unknown as {connection?:{transport?:{ws?:{bufferedAmount?:number}}}}|undefined)?.connection?.transport?.ws?.bufferedAmount??0;}catch{return 0;}}
  sendBytes(type:string,bytes:Uint8Array):void {if(this.room&&!this.stopped&&this.transportReady)this.room.sendBytes(type,bytes);}
  telemetry():{sequence:number;pending:number}{return {sequence:this.seq,pending:this.pending.length+this.pendingMoto.length};}
  private startTimers():void {this.stopTimers();this.tick=setInterval(()=>this.sendInput(),TICK_MS);const ping=()=>this.send('ping',{at:performance.now()});ping();this.heartbeat=setInterval(ping,3000);}
  private stopTimers():void {clearInterval(this.tick);clearInterval(this.heartbeat);}
  async disconnect():Promise<void>{this.stopped=true;this.transportReady=false;this.generation++;this.stopTimers();const room=this.room;this.room=undefined;this.world=undefined;this.pending=[];this.pendingMoto=[];this.ride=undefined;if(room){room.reconnection.enabled=false;if(room.connection?.isOpen)await room.leave();}}
}
