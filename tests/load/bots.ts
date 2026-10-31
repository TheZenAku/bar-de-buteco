/**
 * Bots for performance tests: N players (30 by default) join the running bar through the world's WebSocket, exactly as
 * browsers do, and live there. They walk along the room's A* with the web client's prediction, sit and order from
 * Tonico, drink at the counter, use the toilets, dance, greet people (real players first) and chat, play blackjack,
 * work a shift for Magrão, stroll with the cane and play on the stage. Thirst, hunger and the bladder steer part of it.
 *
 *   npm run bots            30 bots         npm run bots -- 12      12 bots         (tools/bots.bat)
 *
 * Or from the game: Administração → Mundo ao vivo → Bots de teste, where the world runs this script as its child process
 * (apps/server/src/world/bots.ts) and changes the number of bots while it runs.
 *
 * Needs the API and the world running (tools/iniciar.bat or npm run dev). The accounts (bot-NN@bots.bar.local) come
 * from a development-only API route; a bot's avatar leaves the bar with it (Ctrl+C). Every 15 s it prints what the
 * bots are doing, the round trip, the world's tick and this process's own load, which shares the machine.
 */
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {config as loadEnvironment} from 'dotenv';
import {Client,type Room} from '@colyseus/sdk';
import {internalSecret} from '@bar/shared/tickets';
import {barClipMs,DRINK_ITEMS,INTERACTABLES,JOBS,JOB_START_RADIUS,MAP_MARKERS,NEEDS,OLD_CANE_SPEED,RUN_SPEED,STAGE,STAGE_ENTRY,TICK_MS,TV_SPOTS,WALK_SPEED,
  canInteract,canRun,distance,floorHeight,hasStagePass,isConscious,isWalkable,movePlayer,onStage,setDoorStates,swayInput,
  type Interactable,type ItemId,type JobTaskView,type PlayerInput} from '@bar/shared';
import {walkSegment} from '../../apps/server/src/world/navigation.js';
import {goalKey,target,type Goal,type PlanRequest,type PlanResult,type Point} from './bots-planner.js';

loadEnvironment({path:fileURLToPath(new URL('../../.env',import.meta.url)),quiet:true});
const count=Math.max(1,Math.min(128,Number(process.argv[2]??process.env.BOTS)||30));
const apiUrl=(process.env.API_INTERNAL_URL??'http://127.0.0.1:3001').replace(/\/+$/,'');
const worldUrl=(process.env.BOTS_WORLD_URL??`http://127.0.0.1:${process.env.GAME_PORT||2567}`).replace(/\/+$/,'');

const PHRASES=['E aí, galera!','Desce mais uma, Magrão!','Que calor, hein?','Bora um blackjack?','Essa música é boa demais','Alguém viu o Tonico?',
  'Hoje o bar tá cheio!','Saúde!','Quem vai subir no palco?','Tô só de passagem','Cadê a coxinha?','Bora dançar!','Esse torresmo tá top','Opa, beleza?',
  'Partiu palco!','Mais um chopp aqui!','Bom demais esse boteco','Que golaço ontem, hein?','Vou ali no banheiro e já volto','Fala, meu consagrado!'];

const rand=(min:number,max:number)=>min+Math.random()*(max-min);
const chance=(p:number)=>Math.random()<p;
const pick=<T,>(list:readonly T[]):T|undefined=>list[Math.floor(Math.random()*list.length)];
const percentile=(values:number[],p:number)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]!:undefined;
const objectById=(id:string)=>INTERACTABLES.find(i=>i.id===id)!;

// Where the bots go. Every point is checked against the shared floor and walls once, here.
// The urinals (bar animations) count as toilets: the room times their visit by the `urinar` clip.
const SEATS=INTERACTABLES.filter(i=>i.type==='seat'),TOILETS=INTERACTABLES.filter(i=>i.type==='toilet'||i.type==='urinal'),MUSICIAN_SPOTS=INTERACTABLES.filter(i=>i.type==='musician');
const floorPoint=(x:number,z:number,level:number):Point|undefined=>{
  const y=floorHeight(x,z,level),p=y===undefined?undefined:{x,y,z};
  return p&&Math.abs(p.y-level)<.05&&isWalkable(x,z,p.y)&&!onStage(p)?p:undefined;
};
const counterMark=MAP_MARKERS.Ponto_Balcao;
/** Spots along the customers' side of the counter (a straight walk from where orders are taken), so the bots spread out. */
const COUNTER_SPOTS:Point[]=[];
for(let dx=-3;dx<=3;dx+=.25)for(let dz=-3;dz<=3;dz+=.25){
  const p=floorPoint(counterMark.x+dx,counterMark.z+dz,counterMark.y);
  if(p&&canInteract(objectById('counter'),p)&&walkSegment(counterMark,p))COUNTER_SPOTS.push(p);
}
/**
 * Strolling: around the map's markers near the bar (hall, pool table, lounge, terrace, backyard…) and in front of the TVs,
 * each point a straight walk from its marker, so it is never on the other side of a wall.
 */
const WANDER:Point[]=[...Object.values(MAP_MARKERS).filter(m=>Math.hypot(m.x-counterMark.x,m.z-counterMark.z)<30),...Object.values(TV_SPOTS)]
  .flatMap(m=>{
    const origin=floorPoint(m.x,m.z,m.y);if(!origin)return [];
    return [origin,...Array.from({length:5},()=>floorPoint(m.x+rand(-2.5,2.5),m.z+rand(-2.5,2.5),m.y)).filter((p):p is Point=>!!p&&!!walkSegment(origin,p))];
  });
/** A point the A* could not reach once is left alone (objects get a second chance: someone may have been in the way). */
const reachable=(p:Point)=>!failures.has(goalKey({kind:'point',...p,radius:0}));
/**
 * The stage's steps are climbed in a straight line, slowly (as tests/e2e/stage.spec.ts does with the cane): the A*
 * lattice does not line up with the narrow gap between the handrail and the PA at their top. The line is found here,
 * moving a body with a pass exactly as the room does, across the width of the lowest step.
 */
const CLIMB=(()=>{
  const lowest=STAGE.steps.reduce((a,b)=>a.maxY<=b.maxY?a:b),deck=STAGE.deck,pace=.14;
  const alongX=Math.abs(STAGE_ENTRY.x-lowest.x)>Math.abs(STAGE_ENTRY.z-lowest.z),out=Math.sign(alongX?STAGE_ENTRY.x-lowest.x:STAGE_ENTRY.z-lowest.z);
  const from=(alongX?lowest.x:lowest.z)+out*((alongX?lowest.hx:lowest.hz)+.35),to=(alongX?deck.x:deck.z)+out*((alongX?deck.hx:deck.hz)-.8);
  const middle=alongX?lowest.z:lowest.x,width=alongX?lowest.hz:lowest.hx,lines:number[]=[];
  const at=(along:number,across:number,y:number):Point=>alongX?{x:along,y,z:across}:{x:across,y,z:along};
  for(let offset=-width;offset<=width;offset+=.01){
    const start=floorPoint(at(from,middle+offset,0).x,at(from,middle+offset,0).z,STAGE_ENTRY.y);
    if(!start)continue;
    let p:Point=start;
    for(let i=0;i<1000&&(alongX?p.x:p.z)*-out<to*-out;i++){
      const next=movePlayer(p,{dx:alongX?-out*pace:0,dz:alongX?0:-out*pace,running:false},TICK_MS/1000,false,true);
      if(next.x===p.x&&next.z===p.z)break;
      p=next;
    }
    if((alongX?p.x:p.z)*-out>=to*-out-.01&&Math.abs(p.y-deck.maxY)<.02&&Math.abs((alongX?p.z:p.x)-(middle+offset))<.005)lines.push(middle+offset);
  }
  const line=lines[Math.floor(lines.length/2)];
  return line===undefined?undefined:{bottom:at(from,line,STAGE_ENTRY.y),top:at(to,line,deck.maxY),pace};
})();

// The A* runs on a worker thread (tests/load/bots-planner.ts). A goal that two searches could not reach is left alone.
const planner=new Worker(new URL('./bots-planner.ts',import.meta.url));
const plans=new Map<number,(path:Point[]|undefined)=>void>(),failures=new Map<string,number>();
let planId=0,doors:Array<[string,boolean]>=[];
planner.on('message',({id,path,ms}:PlanResult)=>{stats.plans.push(ms);if(!path)stats.unreached++;plans.get(id)?.(path);plans.delete(id);});
planner.on('error',error=>{console.error('O planejador de rotas parou:',error);process.exit(1);});
const plan=(from:Point,goal:Goal)=>new Promise<Point[]|undefined>(resolve=>{const id=++planId;plans.set(id,resolve);planner.postMessage({id,from,goal,doors} satisfies PlanRequest);});

interface Self {id:string;displayName:string;skin:string;oldWalk:boolean;x:number;y:number;z:number;rotation:number;animationState:string;interactionState:string;
  currentTableId:string;lastProcessedInput:number;connected:boolean;hunger:number;thirst:number;bladder:number;drunk:number;stamina:number;exhausted:boolean;
  condition:string;stageUntil:number;holding:string}
interface Entries<T> {get(key:string):T|undefined;values():IterableIterator<T>}
interface World {players:Entries<Self>;doors:Entries<{id:string;open:boolean}>;musicians:Entries<{playerId:string}>;jobs:Entries<{slots:number;workers:number;enabled:boolean}>;
  tables:Entries<{phase:string;turnPlayerId:string;turnHand:number;move:number;minBet:number;seats:Iterable<{playerId:string;bet:number;insured:string;hands:ArrayLike<{total:number}>}>}>;event:{type:string};occupancy:number;capacity:number}
interface Route {path:Point[];index:number;running:boolean;pace:number;done:(arrived:boolean)=>void;mark:Point;markAt:number}
/** The bot's room is gone or it is lying on the floor: the activity ends here. */
class Interrupted extends Error {}

const client=new Client(worldUrl);
const claimed=new Set<string>();
const stats={rtts:[] as number[],plans:[] as number[],unreached:0,errors:new Map<string,number>(),inputs:0};
let stopping=false;

class Bot {
  name:string;id='';doing='chegando';
  room?:Room;
  private seq=0;private pending:PlayerInput[]=[];private position?:Point;private wasMoving=false;private route?:Route;
  private timers:ReturnType<typeof setInterval>[]=[];private life?:Promise<void>;
  private errors=0;private order?:string;private task?:JobTaskView;private restUntil=0;
  /** Taken out of the bar (fewer bots wanted): it does not come back. */
  private gone=false;
  constructor(readonly index:number){this.name=`bot ${index}`;}

  private get over():boolean {return stopping||this.gone;}
  get world():World|undefined {return this.room?.state as World|undefined;}
  get me():Self|undefined {return this.world?.players?.get(this.id);}
  get walking():boolean {return !!this.route;}

  async connect():Promise<void>{
    await this.life;
    for(let attempt=0;!this.over;attempt++){
      try{
        const access=await ticket(this.index);
        this.id=access.userId;this.name=access.displayName;
        const room=await client.joinOrCreate('bar',{ticket:access.ticket});
        if(this.over){await room.leave(true);return;}
        this.attach(room);return;
      }catch(error){
        if(attempt%10===0)console.warn(`${this.name}: ${error instanceof Error?error.message:String(error)}`);
        await delay(Math.min(30_000,2000*2**Math.min(attempt,4)));
      }
    }
  }
  async leave():Promise<void>{
    this.gone=true;
    const room=this.room;this.stopTimers();
    if(room)await Promise.race([room.leave(true),delay(3000)]).catch(()=>{});
  }

  private attach(room:Room):void {
    this.room=room;this.seq=0;this.pending=[];this.position=undefined;this.wasMoving=false;this.errors=0;
    room.onStateChange(()=>this.reconcile());
    room.onMessage('*',(type,payload)=>this.message(String(type),payload));
    room.onDrop(()=>{this.pending=[];this.finish(false);});
    room.onLeave(code=>{
      this.stopTimers();this.room=undefined;this.finish(false);
      if(this.over)return;
      // 4000: removed by the room (another copy of this bot joined, an administrator, an ended session): it stays out.
      if(code===4000){console.warn(`${this.name} saiu do bar (encerrado pelo servidor).`);return;}
      setTimeout(()=>void this.connect(),rand(2000,5000));
    });
    this.timers=[setInterval(()=>this.step(),TICK_MS),setInterval(()=>this.send('ping',{at:Date.now()}),3000)];
    this.life=this.live();
  }
  private stopTimers():void {for(const timer of this.timers)clearInterval(timer);this.timers=[];}
  private send(type:string,payload:unknown={}):void {if(this.room?.connection?.isOpen)this.room.send(type,payload);}

  private message(type:string,payload:any):void {
    if(type==='pong')stats.rtts.push(Date.now()-payload.at);
    else if(type==='error'){this.errors++;const text=String(payload?.message??'?');stats.errors.set(text,(stats.errors.get(text)??0)+1);}
    else if(type==='job.state'&&payload&&'task' in payload)this.task=payload.task??undefined;
    else if(type==='table.state')this.order=payload?.status;
  }

  // Movement as the web client does it (apps/web/src/networking.ts): inputs at 20 Hz while moving, predicted with the
  // shared rules and replayed over each state the room sends.
  private predict(input:PlayerInput,me:Self,from:Point):Point {
    return movePlayer(from,swayInput({...input,running:input.running&&!me.oldWalk&&canRun(me)},input.seq,me.drunk??0,me.id),TICK_MS/1000,me.oldWalk,hasStagePass(me));
  }
  private reconcile():void {
    const me=this.me;if(!me)return;
    this.pending=this.pending.filter(input=>input.seq>me.lastProcessedInput);
    let position:Point={x:me.x,y:me.y,z:me.z};
    if(!me.interactionState&&!me.currentTableId)for(const input of this.pending)position=this.predict(input,me,position);
    this.position=position;
  }
  private step():void {
    const me=this.me,route=this.route;
    if(!me||!this.position||!this.room?.connection?.isOpen||this.pending.length>12)return;
    let dx=0,dz=0,running=false;
    if(route&&(me.interactionState||me.currentTableId||!isConscious(me)))this.finish(false);
    else if(route){
      // Waypoints are passed within 5 cm; the last one is reached exactly (the stage's climb starts on its line).
      const near=(i:number)=>Math.hypot(route.path[i]!.x-this.position!.x,route.path[i]!.z-this.position!.z)<(i===route.path.length-1?.01:.05);
      while(route.index<route.path.length&&near(route.index))route.index++;
      const goal=route.path[route.index];
      if(!goal)this.finish(true);
      else{
        running=route.running&&!me.oldWalk&&canRun(me);
        const speed=(me.oldWalk?OLD_CANE_SPEED:running?RUN_SPEED:WALK_SPEED)*TICK_MS/1000;
        const ux=goal.x-this.position.x,uz=goal.z-this.position.z,d=Math.hypot(ux,uz),pace=Math.min(route.pace,d/speed);
        dx=ux/d*pace;dz=uz/d*pace;
        // Held back for two seconds (a wall corner, a door someone closed): the walk plans again from here.
        if(Math.hypot(this.position.x-route.mark.x,this.position.z-route.mark.z)>.05)Object.assign(route,{mark:{...this.position},markAt:Date.now()});
        else if(Date.now()-route.markAt>2000)this.finish(false);
      }
    }
    const moving=!!(dx||dz);
    if(!moving&&!this.wasMoving)return;
    this.wasMoving=moving;
    this.input({seq:++this.seq,dx,dz,running,rotation:moving?Math.atan2(dx,dz):me.rotation},me);
  }
  private input(input:PlayerInput,me:Self):void {
    this.pending.push(input);this.position=this.predict(input,me,this.position!);this.send('player.input',input);stats.inputs++;
  }
  /** Turns to look at a point (an input that does not move). */
  private face(x:number,z:number):void {
    const me=this.me;if(!me||!this.position||me.interactionState)return;
    this.input({seq:++this.seq,dx:0,dz:0,running:false,rotation:Math.atan2(x-this.position.x,z-this.position.z)},me);
  }
  private follow(path:Point[],{running=false,pace=1}={}):Promise<boolean>{
    this.finish(false);
    return new Promise(done=>{this.route={path,index:0,running,pace,done,mark:{...this.position!},markAt:Date.now()};});
  }
  private finish(arrived:boolean):void {const route=this.route;this.route=undefined;route?.done(arrived);}
  /** Walks to a goal along the A*, planning again (up to three times) when held back on the way. */
  private async walk(goal:Goal,options:{running?:boolean;pace?:number}={}):Promise<boolean>{
    const key=goalKey(goal),{arrived}=target(goal);
    if((failures.get(key)??0)>=(goal.kind==='point'?1:2))return false;
    for(let attempt=0;attempt<3;attempt++){
      this.awake();
      if(arrived(this.position!))return this.settle();
      const path=await plan(this.position!,goal);
      this.awake();
      if(!path){failures.set(key,(failures.get(key)??0)+1);return false;}
      await this.follow(path,options);
    }
    this.awake();
    return arrived(this.position!)&&this.settle();
  }
  /** Until the room has every input sent, so it sees the body where the bot does. */
  private settle():Promise<boolean>{return this.until(()=>!this.pending.length,3000);}

  private alive():Self {const me=this.me;if(this.over||!me)throw new Interrupted();return me;}
  private awake():Self {const me=this.alive();if(!isConscious(me))throw new Interrupted();return me;}
  private async until(done:(me:Self)=>boolean,timeout:number,check=()=>this.awake()):Promise<boolean>{
    for(const deadline=Date.now()+timeout;;await delay(100)){
      if(done(check()))return true;
      if(Date.now()>=deadline)return false;
    }
  }
  private async sleep(ms:number,check=()=>this.awake()):Promise<void>{await this.until(()=>false,ms,check);}
  /** Sends a command and waits for its effect; false when the room refused it (an `error` message) or it did not happen in time. */
  private async act(type:string,payload:unknown,done:(me:Self)=>boolean,timeout=4000):Promise<boolean>{
    await this.settle();
    const errors=this.errors;this.send(type,payload);
    return await this.until(me=>done(me)||this.errors>errors,timeout)&&done(this.awake());
  }
  private async standUp():Promise<void>{
    try{
      const me=this.awake();
      if(me.currentTableId)this.send('blackjack.leave');
      else if(me.interactionState)this.send('player.interact',{objectId:'stand'});
      else return;
      await this.until(me=>!me.interactionState&&!me.currentTableId,20_000);
    }catch{/* fallen or gone: the room already ended what it was doing */}
  }
  private say():void {this.send('chat.send',{text:pick(PHRASES)});}

  private async live():Promise<void>{
    // The room's first state with this bot in it arrives just after the join.
    for(let i=0;i<100&&this.room&&!this.me;i++)await delay(100);
    try{await this.sleep(rand(500,5000),()=>this.alive());}catch{return;}
    while(this.room&&!this.over){
      try{await this.recover();await this.choose()();}
      catch(error){if(!(error instanceof Interrupted))console.error(`${this.name}:`,error);}
      this.finish(false);this.doing='pensando';
      try{await this.sleep(rand(1500,5000),()=>this.alive());}catch{/* the loop checks the room */}
    }
  }
  /** Waits out a faint or a stumble, then ends whatever was left (a chair, the stage). */
  private async recover():Promise<void>{
    while(!isConscious(this.alive())){this.doing='caído';await this.sleep(1000,()=>this.alive());}
    await this.standUp();
    if(this.position&&onStage(this.position))await this.descend();
  }
  private choose():()=>Promise<void>{
    const me=this.awake(),party=this.world?.event.type==='PARTY';
    if(me.bladder>=NEEDS.bladder.alertAt)return()=>this.toilet();
    if(me.thirst<=45&&me.drunk<50&&chance(.5))return()=>this.counter();
    if(me.hunger<=45||me.thirst<=45)return()=>this.sit(true);
    const options:Array<[number,()=>Promise<void>]>=[
      [18,()=>this.sit(chance(.45))],[me.drunk<50?12:0,()=>this.counter()],[16,()=>this.wander()],[party?40:10,()=>this.dance()],
      [9,()=>this.social()],[5,()=>this.toilet()],[7,()=>this.blackjack()],[CLIMB?6:0,()=>this.stage()],[5,()=>this.work()],[3,()=>this.cane()],[4,()=>this.smoke()],
    ];
    let roll=Math.random()*options.reduce((sum,[weight])=>sum+weight,0);
    return options.find(([weight])=>(roll-=weight)<0)?.[1]??(()=>this.wander());
  }

  /** A free object of a kind (nobody using it, no other bot heading there), mostly among the closest ones. */
  private free(objects:readonly Interactable[]):Interactable|undefined {
    const taken=new Set<string>(),here=this.position!;
    for(const player of this.world!.players.values())if(player.interactionState)taken.add(player.interactionState);
    const free=objects.filter(o=>!taken.has(o.id)&&!claimed.has(o.id)&&(failures.get(`object:${o.id}`)??0)<2)
      .sort((a,b)=>distance(a,here)-distance(b,here));
    return pick(chance(.7)?free.slice(0,8):free);
  }
  private nearby():Point|undefined {const here=this.position!;return pick(WANDER.filter(reachable).sort((a,b)=>distance(a,here)-distance(b,here)).slice(0,10));}
  private menu():ItemId[]{
    const me=this.me!,items:ItemId[]=[];
    if(me.hunger<70||chance(.4))items.push(pick(['coxinha','pastel','torresmo'] as const)!);
    items.push(pick(me.drunk>=40?['agua','refrigerante','cafe'] as const:['garrafa','copo','refrigerante','agua','cafe'] as const)!);
    return items;
  }

  /** Sits at a free chair for a while, chatting; most of the time orders from Tonico (food when hungry, water when drunk). */
  private async sit(order:boolean):Promise<void>{
    this.doing='mesa';
    const seat=this.free(SEATS);if(!seat)return;
    claimed.add(seat.id);
    try{
      if(!await this.walk({kind:'object',id:seat.id},{running:chance(.2)}))return;
      if(!await this.act('player.interact',{objectId:seat.id},me=>me.interactionState===seat.id))return;
      this.order=undefined;
      if(order)await this.act('table.order',{items:this.menu()},()=>this.order==='ordered',6000);
      for(const end=Date.now()+rand(20_000,60_000);Date.now()<end;){await this.sleep(rand(6000,15_000));if(chance(.3))this.say();}
      // Nobody leaves the table before the order arrives: wait for it, and cancel only if it never left the counter.
      if(this.order==='ordered')await this.until(()=>this.order!=='ordered',120_000);
      if(this.order==='ordered'){this.send('table.cancel');await this.until(()=>this.order!=='ordered',90_000);}
    }finally{claimed.delete(seat.id);this.order=undefined;await this.standUp();}
  }
  /** A long neck or a chopp from Magrão, who serves one customer at a time. */
  private async counter():Promise<void>{
    this.doing='balcão';
    const spot=pick(COUNTER_SPOTS.filter(s=>!claimed.has(goalKey({kind:'point',...s,radius:0})))),key=spot&&goalKey({kind:'point',...spot,radius:0});
    if(key)claimed.add(key);
    try{
      if(!await this.walk(spot?{kind:'point',...spot,radius:.12}:{kind:'object',id:'counter'},{running:chance(.2)}))return;
      if(!await this.act('player.interact',{objectId:'counter',item:pick(DRINK_ITEMS)},me=>me.interactionState==='counter'))return;
      // Served, the drink is in hand and the bot walks on with it.
      await this.until(me=>!!me.holding,90_000);
    }finally{if(key)claimed.delete(key);await this.standUp();}
  }
  private async toilet():Promise<void>{
    this.doing='banheiro';
    const toilet=this.free(TOILETS);if(!toilet)return;
    claimed.add(toilet.id);
    try{
      if(!await this.walk({kind:'object',id:toilet.id},{running:chance(.4)}))return;
      if(!await this.act('player.interact',{objectId:toilet.id},me=>me.interactionState===toilet.id))return;
      await this.until(me=>!me.interactionState,Math.max(NEEDS.bladder.toiletSeconds*1000,barClipMs('urinar'))+5000);
    }finally{claimed.delete(toilet.id);await this.standUp();}
  }
  /** A cigarette where the bot stands (F): lit, smoked a while, put out. */
  private async smoke():Promise<void>{
    this.doing='fumando';
    if(!await this.act('player.emote',{emote:'smoke'},me=>me.interactionState==='smoke'))return;
    await this.sleep(barClipMs('fumar_acender')+4000+Math.random()*12_000);
    if(this.awake().interactionState==='smoke')this.send('player.emote',{emote:'smoke'});
    await this.until(me=>!me.interactionState,barClipMs('fumar_apagar')+5000);
  }
  private async dance():Promise<void>{
    this.doing='dançando';
    const spot=chance(.5)?this.nearby():undefined;
    if(spot)await this.walk({kind:'point',...spot,radius:.5},{running:chance(.3)});
    if(!await this.act('player.emote',{emote:'dance'},me=>me.animationState==='dance'))return;
    await this.sleep(rand(12_000,this.world?.event.type==='PARTY'?60_000:35_000));
    this.send('player.emote',{emote:'idle'});
  }
  private async wander():Promise<void>{
    this.doing='passeando';
    const spot=pick(WANDER.filter(reachable));if(!spot)return;
    if(!await this.walk({kind:'point',...spot,radius:.5},{running:chance(.35)}))return;
    // In the backyard, in front of the stage, everybody looks at the stage screen.
    if(distance(spot,TV_SPOTS.telao!)<4)this.face(STAGE.screen.x,STAGE.screen.z);
    await this.sleep(rand(4000,15_000));
  }
  /** Walks up to someone nearby (a real player more often than a bot), waves and says something; Rafael may show his kick. */
  private async social():Promise<void>{
    this.doing='conversando';
    const me=this.awake(),here=this.position!;
    // Not someone up on the stage: the A* does not climb its steps (see CLIMB).
    const others=[...this.world!.players.values()].filter(p=>p.id!==me.id&&p.connected&&!onStage(p)&&Math.abs(p.y-here.y)<.5&&distance(p,here)<15);
    const people=others.filter(p=>!p.displayName.startsWith('Bot '));
    const other=pick(people.length&&chance(.7)?people:others);if(!other)return;
    if(!await this.walk({kind:'point',x:other.x,y:other.y,z:other.z,radius:1.6}))return;
    const now=this.world!.players.get(other.id);if(now)this.face(now.x,now.z);
    await this.sleep(300);
    await this.act('player.emote',{emote:'wave'},me=>me.animationState==='wave',2000);
    this.say();
    if(me.skin==='rafael'&&chance(.3)){await this.sleep(2500);this.send('player.emote',{emote:'kick'});}
    await this.sleep(rand(3000,8000));
  }
  /** A few rounds at the blackjack table: the minimum bet, no insurance, hits below 17 (sometimes below 15). */
  private async blackjack():Promise<void>{
    this.doing='blackjack';
    if(!await this.walk({kind:'object',id:'blackjack-1'},{running:chance(.2)}))return;
    if(!await this.act('blackjack.join',{tableId:'blackjack-1'},me=>me.currentTableId==='blackjack-1'))return;
    try{
      let rounds=1+Math.floor(Math.random()*3);
      for(const deadline=Date.now()+240_000;rounds>0&&Date.now()<deadline;){
        const me=this.awake(),table=this.world!.tables.get('blackjack-1');
        if(!table||!me.currentTableId)return;
        const seat=[...table.seats].find(s=>s.playerId===me.id);
        if((table.phase==='waiting'||table.phase==='betting')&&!seat?.bet){this.send('blackjack.bet',{amount:table.minBet||10});await this.sleep(rand(1500,3000));}
        else if(table.phase==='insurance'&&seat?.insured==='pending'){await this.sleep(rand(600,1500));this.send('blackjack.insurance',{take:false});}
        else if(table.phase==='playing'&&table.turnPlayerId===me.id){
          const total=seat?.hands[table.turnHand]?.total??21;
          await this.sleep(rand(800,2500));
          const now=this.world!.tables.get('blackjack-1')!;
          this.send('blackjack.action',{action:total<(chance(.2)?15:17)?'hit':'stand',hand:now.turnHand,move:now.move});
          await this.sleep(800);
        }
        else if(table.phase==='results'){rounds--;await this.until(()=>this.world?.tables.get('blackjack-1')?.phase!=='results',15_000);}
        else await this.sleep(500);
      }
    }finally{await this.standUp();}
  }
  /** Buys the stage pass at the steps, climbs, plays an instrument for a while and comes down again. */
  private async stage():Promise<void>{
    this.doing='palco';
    const spot=pick(MUSICIAN_SPOTS.filter(o=>!this.world!.musicians.get(o.spot!)?.playerId&&!claimed.has(o.id)));
    if(!spot||!CLIMB)return;
    claimed.add(spot.id);
    try{
      if(!await this.walk({kind:'point',...CLIMB.bottom,radius:.3},{running:chance(.3)})||!await this.follow([this.position!,CLIMB.bottom],{pace:.3}))return;
      if(!hasStagePass(this.awake())&&!await this.act('stage.buy',{},me=>hasStagePass(me),8000))return;
      if(!await this.follow([CLIMB.bottom,CLIMB.top],{pace:CLIMB.pace})||!onStage(this.position!))return;
      if(!await this.walk({kind:'object',id:spot.id}))return;
      if(!await this.act('player.interact',{objectId:spot.id},me=>me.interactionState===`stage-${spot.spot}`))return;
      await this.sleep(rand(30_000,90_000));
      this.send('player.interact',{objectId:'stand'});
      await this.until(me=>!me.interactionState,20_000);
    }finally{claimed.delete(spot.id);await this.standUp();await this.descend();}
  }
  /** Off the stage the way up: the climbing line, slowly (a pass that ran out still lets a body come down). */
  private async descend():Promise<void>{
    try{
      if(!CLIMB||!this.position||!onStage(this.position))return;
      this.doing='descendo do palco';
      if(await this.walk({kind:'point',...CLIMB.top,radius:.3})&&await this.follow([this.position,CLIMB.top],{pace:.3}))
        await this.follow([CLIMB.top,CLIMB.bottom],{pace:CLIMB.pace});
    }catch{/* fallen or gone */}
  }
  /** A short shift as Magrão's helper: a few tasks (fridges, glasses, tables), then off. */
  private async work():Promise<void>{
    this.doing='trabalhando';
    const job=JOBS[0]!,slots=this.world!.jobs.get(job.id);
    if(!slots?.enabled||slots.workers>=slots.slots||Date.now()<this.restUntil)return;
    if(!await this.walk({kind:'point',...job.start,radius:JOB_START_RADIUS-1.5},{running:chance(.2)}))return;
    this.task=undefined;
    if(!await this.act('job.start',{jobId:job.id},()=>!!this.task,5000))return;
    // The room makes a worker rest between shifts.
    this.restUntil=Date.now()+job.cooldownMs;
    try{
      for(let tasks=2+Math.floor(Math.random()*4);tasks>0&&this.task;tasks--){
        const task:JobTaskView=this.task,station=job.stations.find(s=>s.id===task.stationId);
        if(!station||!await this.walk({kind:'station',id:station.id},{running:chance(.3)}))return;
        if(!await this.act('job.work',{},me=>me.interactionState==='job'))return;
        await this.until(()=>this.task?.tasks!==task.tasks,station.durationMs+8000);
      }
    }finally{if(this.task)this.send('job.stop');this.task=undefined;await this.standUp();}
  }
  /** A short stroll with the cane (/velho): 0.475 m/s. */
  private async cane():Promise<void>{
    this.doing='bengala';
    const here=this.position!,angle=rand(0,Math.PI*2),length=rand(2,4);
    const spot=floorPoint(here.x+Math.sin(angle)*length,here.z+Math.cos(angle)*length,here.y);
    if(!spot||!walkSegment(here,spot))return;
    if(!await this.act('chat.send',{text:'/velho'},me=>me.oldWalk,3000))return;
    try{await this.follow([here,spot]);await this.sleep(rand(2000,5000));}
    finally{if(this.me?.oldWalk)this.send('chat.send',{text:'/velho'});}
  }
}

async function ticket(index:number):Promise<{userId:string;displayName:string;ticket:string}>{
  const response=await fetch(`${apiUrl}/api/internal/dev/bot`,{method:'POST',headers:{'content-type':'application/json','x-internal-secret':internalSecret()},
    body:JSON.stringify({index}),signal:AbortSignal.timeout(15_000)}).catch(()=>{throw new Error(`API inacessível em ${apiUrl}: ligue o jogo (tools/iniciar.bat).`);});
  if(response.status===404)throw new Error('A API não tem a rota dos bots: reinicie a API (tools/reiniciar.bat). Ela não existe em produção.');
  if(!response.ok)throw new Error(`A API recusou o bot ${index} (${response.status}): ${await response.text()}`);
  return response.json() as Promise<{userId:string;displayName:string;ticket:string}>;
}
/** The world's simulation step (p95 over its last ~60 s), from its metrics. */
async function worldTick():Promise<string>{
  try{
    const text=await (await fetch(`${worldUrl}/metrics`,{headers:{'x-internal-secret':internalSecret()},signal:AbortSignal.timeout(3000)})).text();
    return /bar_world_tick_ms\{quantile="0\.95"\} (\S+)/.exec(text)?.[1]?.replace(/^(\d+\.\d{2})\d*$/,'$1')??'?';
  }catch{return '?';}
}

const bots:Bot[]=[];
let wanted=0,joining=false;
/** Bots join one at a time, gently (one still retrying, on a full bar or a slow API, holds the next back 20 s at most); the last ones leave first. */
async function resize(count:number):Promise<void>{
  wanted=Math.max(0,Math.min(128,Math.round(count)||0));
  await Promise.allSettled(bots.splice(wanted).map(bot=>bot.leave()));
  if(joining)return;
  joining=true;
  try{
    while(bots.length<wanted&&!stopping){
      const bot=new Bot(bots.length+1);bots.push(bot);
      await Promise.race([bot.connect(),delay(20_000)]);
      const world=bot.world;
      if(world&&world.occupancy>=world.capacity&&bots.length<wanted)
        console.warn(`O bar está cheio (${world.capacity} pessoas): nem todos os ${wanted} bots cabem. Aumente ROOM_CAPACITY no .env e reinicie o mundo.`);
      await delay(150);
    }
  }finally{joining=false;}
}

const loop=monitorEventLoopDelay({resolution:10});loop.enable();
// The doors as the room has them, for the prediction here and for the planner.
setInterval(()=>{
  const world=bots.find(bot=>bot.world?.doors)?.world;if(!world)return;
  doors=[...world.doors.values()].map(door=>[door.id,door.open]);setDoorStates(doors);
},500);
/** The last 15 s: this process's load and what the room answered. */
let recent:{rttP50?:number;rttP95?:number;inputs:number;routes:number;planP95?:number;unreached:number;loopP95:number;refusals:Array<[string,number]>}|undefined;
/** What the bots are doing now, and the last 15 s (also sent to the world when it started them). */
function status(){
  const inBar=bots.filter(bot=>bot.me?.connected),doing=new Map<string,number>();
  for(const bot of inBar)doing.set(bot.doing,(doing.get(bot.doing)??0)+1);
  return {target:wanted,inBar:inBar.length,walking:inBar.filter(bot=>bot.walking).length,doing:[...doing].sort((a,b)=>b[1]-a[1]),...recent};
}
setInterval(async()=>{
  recent={rttP50:percentile(stats.rtts,.5),rttP95:percentile(stats.rtts,.95),inputs:Math.round(stats.inputs/15),routes:stats.plans.length,planP95:percentile(stats.plans,.95),
    unreached:stats.unreached,loopP95:Math.round(loop.percentile(95)/1e6),refusals:[...stats.errors].sort((a,b)=>b[1]-a[1]).slice(0,3)};
  stats.rtts=[];stats.plans=[];stats.unreached=0;stats.errors.clear();stats.inputs=0;loop.reset();
  const now=status(),tick=await worldTick(),ms=(value:number|undefined)=>value===undefined?'?':value.toFixed(0);
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${now.inBar}/${now.target} bots no bar (${now.walking} andando) · ${now.doing.map(([what,n])=>`${what} ${n}`).join(', ')}`);
  console.log(`   RTT p50 ${ms(recent.rttP50)} ms, p95 ${ms(recent.rttP95)} ms · mundo: tick p95 ${tick} ms, ocupação ${bots.find(bot=>bot.world)?.world?.occupancy??'?'} · `
    +`este processo: ${recent.inputs} inputs/s, A* ${recent.routes} rotas (p95 ${ms(recent.planP95)} ms, ${recent.unreached} sem caminho), event loop p95 ${recent.loopP95} ms`
    +(recent.refusals.length?`\n   recusas da sala: ${recent.refusals.map(([text,n])=>`${n}× ${text}`).join(' | ')}`:''));
},15_000);

async function stop():Promise<void>{
  if(stopping)return;
  stopping=true;console.log('Encerrando: os bots saem do bar…');
  await Promise.allSettled(bots.map(bot=>bot.leave()));
  await planner.terminate();process.exit(0);
}
// A second Ctrl+C does not wait for the bots to leave.
const interrupt=()=>{if(stopping)process.exit(1);void stop();};
process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
// BOTS_SECONDS: a timed run, for comparisons; they leave on their own at the end.
if(Number(process.env.BOTS_SECONDS)>0)setTimeout(()=>void stop(),Number(process.env.BOTS_SECONDS)*1000);
// Started by the world for the in-game administration (apps/server/src/world/bots.ts): resized and stopped by messages,
// reporting every 3 s, and gone with the world (a restart closes the channel).
if(process.send){
  process.on('message',message=>{
    const command=message as {type?:string;count?:number};
    if(command?.type==='count')void resize(Number(command.count));else if(command?.type==='stop')void stop();
  });
  process.on('disconnect',()=>void stop());
  setInterval(()=>{if(process.connected)process.send!({type:'status',status:status()});},3000);
}

console.log(`${count} bots entrando em ${worldUrl} (API ${apiUrl})${CLIMB?'':' · palco: nenhuma linha de subida encontrada, os bots não sobem'}. Ctrl+C tira todos do bar.`);
await resize(count);
console.log(`${bots.filter(bot=>bot.room).length} bots no bar.`);
