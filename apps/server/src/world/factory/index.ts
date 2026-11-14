import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {CART_CAPACITY,CLEAN_TASKS,DEFAULT_FACTORY_BALANCE,FACTORY_CART,stepCart,DIRT_CLEAN,DIRT_PENDING,FACTORY_BAGS,FACTORY_MATERIALS,FACTORY_QUALITY_MIN,OLD_DRYER_FLOW_LPH,addIngredient,batchYield,emptyBagging,emptyDryer,emptyTank,solidsOf,tankVolumeL,tickDryer,tickTank,cleanDirt,cleanTaskOf,drawProductionOffers,emptyProductionBoard,orderWaterL,pendingCleaning,type ActiveProduction,type BaggingRuntime,type CartBag,type CartView,type CleanTaskId,type DryerRuntime,type FactoryBalance,type FactoryDirt,type FactoryMaterial,type FactoryRecipe,type ProductionBoard,type ProductionLogEntry,type ProductionOrder,type TankRuntime} from '@bar/shared/factory';

interface MarkerFile {n:number;marcadores:Record<string,{xyz_jogo:[number,number,number];rot:number[]|null;extras:Record<string,unknown>}>}
interface StockFile {vagas:Array<{marcador:string;tipo:FactoryMaterial;capacidade:number;nivel_m:number;jogo_xyz:[number,number,number]}>}
export interface FactorySlot {marker:string;material:FactoryMaterial;quantity:number;capacity:number;levelM:number;batchId:string;reservedBy:string;reservedUntil:number}
/** `key`: an alarm the process raises by itself (one per cause, cleared when the cause goes away); `active:false` is an alarm whose cause is gone. */
export interface FactoryAlarm {id:string;severity:'info'|'warning'|'alarm'|'critical';source:string;text:string;at:number;acknowledged:boolean;key?:string;active?:boolean}
/** What happened in the plant, newest last: the operators' feed. */
export interface FactoryEvent {id:number;at:number;kind:'info'|'ok'|'warn'|'bad';text:string}
export interface FactorySimulationReport {startedAt:number;completedAt:number;steps:string[];stockBefore:Record<FactoryMaterial,number>;stockAfter:Record<FactoryMaterial,number>;producedBags:number;faults:string[]}
export interface FactorySnapshot {revision:number;started:boolean;emergency:boolean;balance:FactoryBalance;slots:FactorySlot[];tanks:TankRuntime[];dryer:DryerRuntime;bagging:BaggingRuntime;alarms:FactoryAlarm[];events:FactoryEvent[];siloCapacityKg:number;markerCount:number;activeOperators:number;pausedWithoutOperator:boolean;lastSimulation:FactorySimulationReport|null;seeded:boolean;/** The plant's recipe when no production order is on (`balance.recipe` is the order's while one is). */baseRecipe:FactoryRecipe;board:ProductionBoard;dirt:FactoryDirt}

/** The product silo under the dryer: production stops when it is full. */
export const SILO_CAPACITY_KG=500;
/** The dryer's and the tanks' states in which the process moves on its own (and so stops with nobody on shift). */
const TANK_RUNNING=['ENCHENDO_AGUA','AQUECENDO','DISSOLVENDO','HOMOGENEIZANDO','TRANSFERINDO'];
const DRYER_RUNNING=['PRE_AQUECENDO','PRODUZINDO','RESFRIANDO','LIMPEZA'];
const PALLET_OUT='Ponto_EB_PA_Ensaque';

const REQUIRED_FIXED=['Ponto_EB_Portao','Ponto_EB_Doca','Ponto_EB_Entrada_Pessoal','Ponto_EB_Paleteira','Ponto_EB_Empilhadeira','Ponto_EB_Balanca','Ponto_EB_PA_Ensaque','Ponto_EB_Painel','Ponto_EB_Bomba_Alta_Pressao','Ponto_EB_Secador_Base','Ponto_EB_Secador_Topo','Ponto_EB_Ensaque','Ponto_EB_Ensaque_Bico','Ponto_EB_Ensaque_Saida'];
export function validateFactoryAssets(markers:MarkerFile,stock:StockFile):void {
  const names=Object.keys(markers.marcadores??{});
  if(markers.n!==48||names.length!==48)throw new Error(`Fábrica: esperados 48 marcadores, encontrados ${names.length}.`);
  if(stock.vagas?.length!==25)throw new Error(`Fábrica: esperadas 25 vagas, encontradas ${stock.vagas?.length??0}.`);
  const required=[...REQUIRED_FIXED,...Array.from({length:3},(_,i)=>`Ponto_EB_Tanque_${i+1}`),...Array.from({length:3},(_,i)=>`Ponto_EB_Tanque_${i+1}_Operador`),...['N','S','L','O'].map(side=>`Ponto_EB_Secador_Inspecao_${side}`)];
  for(const name of required)if(!markers.marcadores[name])throw new Error(`Fábrica: falta o marcador obrigatório ${name}.`);
  for(const slot of stock.vagas){
    const marker=markers.marcadores[slot.marcador];if(!marker)throw new Error(`Fábrica: a vaga ${slot.marcador} não tem marcador.`);
    if(slot.capacidade!==18)throw new Error(`Fábrica: ${slot.marcador} precisa ter capacidade 18.`);
    if(!['MALTE','MIX','PRODUTO'].includes(slot.tipo))throw new Error(`Fábrica: tipo inválido em ${slot.marcador}.`);
  }
}

function loadAssets():{markers:MarkerFile;stock:StockFile}{
  const folder=fileURLToPath(new URL('../../../data/factory/',import.meta.url));
  const read=<T>(name:string):T=>JSON.parse(fs.readFileSync(path.join(folder,name),'utf8')) as T;
  const markers=read<MarkerFile>('empresa_brasil_marcadores.json'),stock=read<StockFile>('empresa_brasil_estoque.json');
  validateFactoryAssets(markers,stock);return {markers,stock};
}

const tankName=(id:number)=>`TQ-${100+id}`;
const fixed=(value:number,digits=0)=>value.toFixed(digits).replace('.',',');

export class FactoryDirector {
  readonly markers:MarkerFile['marcadores'];
  readonly slots:FactorySlot[];
  balance:FactoryBalance=structuredClone(DEFAULT_FACTORY_BALANCE);
  tanks:TankRuntime[]=[emptyTank(1),emptyTank(2),emptyTank(3)];
  dryer=emptyDryer();bagging:BaggingRuntime={...emptyBagging(),emptyBags:FACTORY_BAGS.start};alarms:FactoryAlarm[]=[];events:FactoryEvent[]=[];
  /** Production orders (OPs): nothing is produced without a running one. */board:ProductionBoard=emptyProductionBoard();
  /** How dirty each place is; `required` after an OP ends, until everything is clean again. */dirt:FactoryDirt={levels:cleanDirt(),required:false};
  /** Set while the automatic test cycle runs: it works without an order. */private bypassOrder=false;
  /** The platform cart: its pose, the sacks on it (they left the shelves: they count as withdrawn, like the ones in a player's arms) and whoever pushes it. `version` moves with every change, the pose's included (`revision` does not: it would resend and resave the whole plant at every step). */
  cart:{x:number;y:number;z:number;yaw:number;bags:CartBag[];pusher:string|null;version:number}={...FACTORY_CART.park,bags:[],pusher:null,version:0};
  emergency=false;revision=0;/** The starting stock was put in once (a reset leaves the plant empty on purpose). */seeded=false;lastSimulation:FactorySimulationReport|null=null;private activeOperators=0;private tickAccumulator=0;private eventSeq=0;private alarmClock=0;
  constructor(assets=loadAssets()){
    validateFactoryAssets(assets.markers,assets.stock);this.markers=assets.markers.marcadores;
    this.slots=assets.stock.vagas.map(slot=>({marker:slot.marcador,material:slot.tipo,quantity:0,capacity:slot.capacidade,levelM:slot.nivel_m,batchId:'',reservedBy:'',reservedUntil:0}));
  }
  /** The balance the process runs by: the plant's own, with the recipe of the production order that is on (its bags per batch and the water they ask for). */
  get eff():FactoryBalance {
    const order=this.board.active;if(!order)return this.balance;
    return {...this.balance,recipe:{...this.balance.recipe,malteBags:order.malteBags,mixBags:order.mixBags,waterL:orderWaterL(order)}};
  }
  setOperators(count:number):void {
    const next=Math.max(0,Math.floor(count));
    if(next===this.activeOperators)return;
    this.note(next?'ok':'warn',next?`${next} operador(es) em serviço.`:'Sem operador em serviço: o processo está parado.');
    this.activeOperators=next;this.revision++;
  }
  /** Adds a line to the operators' feed (the last 60 are kept). */
  note(kind:FactoryEvent['kind'],text:string):void {this.events.push({id:++this.eventSeq,at:Date.now(),kind,text});if(this.events.length>60)this.events.splice(0,this.events.length-60);}

  /** True while something moves on its own, so an idle plant does not bump its revision (nor get saved and sent) four times a second. */
  private running():boolean {
    return this.tanks.some(tank=>tank.state==='ENCHENDO_AGUA'||tank.state==='AQUECENDO'||tank.state==='DISSOLVENDO'||tank.state==='HOMOGENEIZANDO')||DRYER_RUNNING.includes(this.dryer.state)||this.bagging.state==='ENCHENDO';
  }
  tick(dtS:number):void {
    this.tickAccumulator+=Math.max(0,dtS);if(this.tickAccumulator<.25)return;
    const dt=this.tickAccumulator,scaled=dt*this.balance.timeScale;this.tickAccumulator=0;
    if(!this.activeOperators||this.emergency)return;
    let changed=this.resumeRestored();
    if(this.running()){
      const before={tanks:this.tanks.map(tank=>tank.state),dryer:this.dryer.state,bagging:this.bagging.state};
      const bal=this.eff;
      this.tanks=this.tanks.map(tank=>{let next=tank;if(tank.state==='ENCHENDO_AGUA'){next={...tank,waterL:Math.min(bal.recipe.waterL,tank.waterL+bal.waterFlowLps*scaled)};if(next.waterL>=bal.recipe.waterL)next={...next,state:'AQUECENDO',stepS:0};}return tickTank(next,dt,bal);});
      this.dryer=tickDryer(this.dryer,dt,bal);
      this.produce(scaled);this.fillBag(scaled);this.soilTick(dt);
      this.announce(before);changed=true;
    }
    if(this.maybeFinishProduction())changed=true;
    this.alarmClock+=dt;
    if(changed||this.alarmClock>=1){this.alarmClock=0;if(this.evaluateAlarms())changed=true;}
    if(changed)this.revision++;
  }
  /**
   * Dryer feeding from a ready tank: litres leave the tank (water and dissolved solids together, in proportion) and the solids
   * come out as powder in the silo. Nothing is lost: when the silo is full the dryer takes less, and the same tank can be
   * fed again later with what is left. An empty tank hands the dryer to the next approved one by itself.
   */
  private produce(scaled:number):void {
    const source=this.dryer.sourceTank;if(this.dryer.state!=='PRODUZINDO'||!source)return;
    const tank=this.tanks[source-1]!,balance=this.eff;
    const total=tankVolumeL(tank,balance),solids=solidsOf(tank,balance),yieldNow=batchYield(tank.quality,balance);
    const room=SILO_CAPACITY_KG-this.dryer.powderKg;
    if(room<=.001){this.dryer={...this.dryer,flowLph:0};return;}
    let litres=Math.min(total,balance.dryerFlowLph/3600*scaled);
    // The silo's room limits how much solid may be dried this tick.
    if(solids>0&&yieldNow>0&&total>0&&litres/total*solids*yieldNow>room)litres=room/(solids*yieldNow)*total;
    const fraction=total>0?litres/total:1,dried=solids*fraction;
    this.dryer={...this.dryer,flowLph:balance.dryerFlowLph,powderKg:Math.min(SILO_CAPACITY_KG,this.dryer.powderKg+dried*yieldNow)};
    this.soil('dryer',dried*yieldNow/450);
    const left=Math.max(0,total-litres);
    this.tanks[source-1]={...tank,waterL:tank.waterL*(1-fraction),solidsKg:Math.max(0,solids-dried),state:'TRANSFERINDO'};
    if(left<=.05)this.tankEmptied(source);
  }
  /** The tank the dryer was drying is empty: the next approved tank goes on at once, otherwise the dryer waits hot (PRONTO) for one. */
  private tankEmptied(source:1|2|3):void {
    // The tank is left dirty: it is washed from its platform before the next batch.
    this.tanks[source-1]={...emptyTank(source),state:'SUJO'};this.dirt.levels[`tank${source}` as CleanTaskId]=Math.max(this.dirt.levels[`tank${source}` as CleanTaskId],.8);
    if(this.board.active)this.board.active={...this.board.active,batchesDone:this.board.active.batchesDone+1};
    const next=this.tanks.find(tank=>tank.state==='PRONTO_PARA_TRANSFERIR');
    if(next){
      this.dryer={...this.dryer,sourceTank:next.id,stepS:0};
      this.note('ok',`${tankName(source)} esvaziou no secador: ${tankName(next.id)} entrou em seguida, a produção continua.`);
    }else{
      this.dryer={...this.dryer,state:'PRONTO',sourceTank:null,flowLph:0,stepS:0};
      this.note('ok',`${tankName(source)} esvaziou no secador. Secador quente esperando o próximo tanque aprovado (ou pare/resfrie).`);
    }
  }
  private fillBag(scaled:number):void {
    if(this.bagging.state!=='ENCHENDO')return;
    const bagKg=this.balance.bagKg,want=Math.min(bagKg-this.bagging.weightKg,bagKg/this.balance.bagFillS*scaled),used=Math.min(want,this.dryer.powderKg);
    const weight=this.bagging.weightKg+used;
    this.bagging={...this.bagging,weightKg:weight};this.dryer={...this.dryer,powderKg:Math.max(0,this.dryer.powderKg-used)};
    if(weight>=bagKg-1e-6){this.bagging={...this.bagging,weightKg:bagKg,state:'AGUARDANDO_COSTURA'};this.note('info',`Saco cheio (${fixed(bagKg,1)} kg): costure.`);return;}
    // The silo is dry and the dryer is not sending more: the bag closes with what it got (a light bag) instead of waiting forever.
    if(used<want-1e-9&&this.dryer.state!=='PRODUZINDO'){
      if(weight<.05){this.bagging={...this.bagging,state:'SACO_POSICIONADO',weightKg:0};this.note('warn','Silo vazio: o saco ficou sem produto.');return;}
      this.bagging={...this.bagging,state:'AGUARDANDO_COSTURA'};this.note('warn',`Silo vazio: saco leve de ${fixed(weight,1)} kg. Costure e empilhe: o pagamento acompanha o peso.`);
    }
  }
  /** One feed line for each step the machines took by themselves this tick. */
  private announce(before:{tanks:string[];dryer:string;bagging:string}):void {
    this.tanks.forEach((tank,index)=>{
      const was=before.tanks[index],name=tankName(tank.id);if(was===tank.state)return;
      if(was==='ENCHENDO_AGUA'&&tank.state==='AQUECENDO')this.note('info',`${name} cheio de água: aquecendo.`);
      else if(was==='AQUECENDO'&&tank.state==='AGUARDANDO_INSUMOS')this.note('ok',`${name} a ${fixed(tank.temperatureC,1)} °C: ligue o agitador, abra a tampa e despeje os insumos.`);
      else if(was==='DISSOLVENDO'&&tank.state==='HOMOGENEIZANDO')this.note('info',`${name} dissolvido: homogeneizando.`);
      else if(was==='HOMOGENEIZANDO'&&tank.state==='AGUARDANDO_QUALIDADE')this.note(tank.quality<FACTORY_QUALITY_MIN?'warn':'ok',`${name} homogeneizado, qualidade ${tank.quality}%: colha a amostra e aprove ou reprove.`);
    });
    if(before.dryer==='PRE_AQUECENDO'&&this.dryer.state==='PRONTO')this.note('ok','Secador pré-aquecido e pronto para receber um tanque.');
    else if(before.dryer==='RESFRIANDO'&&this.dryer.state==='PARADO')this.note('info','Secador frio e parado.');
    else if(before.dryer==='LIMPEZA'&&this.dryer.state==='PARADO'){this.dirt.levels.dryer=0;this.note('ok','Câmara do secador lavada.');this.checkClean();}
  }

  /** Raises the alarm for `key` once (updating its text if it changed). */
  private raise(key:string,severity:FactoryAlarm['severity'],source:string,text:string):boolean {
    const current=this.alarms.find(alarm=>alarm.key===key&&alarm.active!==false);
    if(current){if(current.text===text&&current.severity===severity)return false;current.text=text;current.severity=severity;return true;}
    this.alarms.push({id:`${key}-${Date.now().toString(36)}`,key,severity,source,text,at:Date.now(),acknowledged:false,active:true});
    if(this.alarms.length>60)this.alarms.splice(0,this.alarms.length-60);
    this.note(severity==='info'?'info':'warn',`${source}: ${text}`);return true;
  }
  /** The cause is gone: the alarm leaves the board (and the feed says so). */
  private settle(key:string):boolean {
    const at=this.alarms.findIndex(alarm=>alarm.key===key&&alarm.active!==false);if(at<0)return false;
    const [gone]=this.alarms.splice(at,1);this.note('ok',`${gone!.source}: normalizado.`);return true;
  }
  private watch(key:string,on:boolean,severity:FactoryAlarm['severity'],source:string,text:string):boolean {return on?this.raise(key,severity,source,text):this.settle(key);}
  /** Raises and clears the alarms the process explains by itself. Returns whether the board changed. */
  private evaluateAlarms():boolean {
    let changed=false;const total=(material:FactoryMaterial)=>this.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0);
    for(const tank of this.tanks){
      const name=tankName(tank.id);
      changed=this.watch(`agitador-${tank.id}`,['DISSOLVENDO','HOMOGENEIZANDO'].includes(tank.state)&&tank.agitatorRpm<=0,'warning',name,'agitador desligado: o lote não avança. Ligue o agitador.')||changed;
      changed=this.watch(`qualidade-${tank.id}`,tank.state==='AGUARDANDO_QUALIDADE'&&tank.quality<FACTORY_QUALITY_MIN,'alarm',name,`qualidade ${tank.quality}% abaixo de ${FACTORY_QUALITY_MIN}%: reprove o lote ou aceite a perda.`)||changed;
      changed=this.watch(`sujo-${tank.id}`,tank.state==='SUJO','info',name,'sujo: lave o tanque antes de um novo lote.')||changed;
    }
    changed=this.watch('secador-falha',this.dryer.state==='FALHA','alarm','Secador',`falha (${this.dryer.fault.replaceAll('_',' ')||'sem causa'}): rearme ou faça a limpeza.`)||changed;
    changed=this.watch('silo-cheio',this.dryer.powderKg>=SILO_CAPACITY_KG*.9,'warning','Silo',`quase cheio (${fixed(this.dryer.powderKg)} kg): ensaque o produto, senão o secador para.`)||changed;
    const idleBag=this.bagging.state==='PARADO'||this.bagging.state==='AGUARDANDO_SACO'||this.bagging.state==='SACO_POSICIONADO';
    changed=this.watch('silo-resto',this.dryer.powderKg>.5&&this.dryer.powderKg<this.balance.bagKg&&this.dryer.state!=='PRODUZINDO'&&idleBag,'info','Silo',`restam ${fixed(this.dryer.powderKg,1)} kg de pó: ensaque um saco leve (a paga é proporcional) para não perder o produto.`)||changed;
    const pending=pendingCleaning(this.dirt);
    changed=this.watch('limpeza',this.dirt.required&&pending.length>0,'info','Limpeza',`a produção terminou: faltam ${pending.length} lugar(es) para limpar antes da próxima ordem.`)||changed;
    changed=this.watch('saco-vazio',this.bagging.emptyBags<=FACTORY_BAGS.lowAt,'info','Ensaque',`restam ${this.bagging.emptyBags} sacos vazios: reponha o fardo.`)||changed;
    changed=this.watch('palete-pronto',(this.slots.find(slot=>slot.marker===PALLET_OUT)?.quantity??0)>0,'warning','Ensaque','palete completo na saída: armazene-o no estoque para liberar o próximo.')||changed;
    for(const material of ['MALTE','MIX'] as const){
      const need=material==='MALTE'?this.eff.recipe.malteBags:this.eff.recipe.mixBags;
      changed=this.watch(`estoque-${material}`,total(material)<need,'warning','Estoque',`${material} abaixo de uma receita (${total(material)}/${need} sacos): aceite uma ordem de compra.`)||changed;
    }
    return changed;
  }

  // ---- production orders (OPs) ----
  /** The owner draws three candidate orders (the firm's managers pick one of them). Refused while an order is on. */
  drawOffers(by:string,random:()=>number=Math.random,makeId:()=>string=randomUUID):ProductionOrder[] {
    if(this.board.active)throw new Error('Já há uma ordem de produção aprovada: termine ou cancele essa antes de criar outras.');
    this.board.offers=drawProductionOffers(random,makeId,Date.now());this.board.offersBy=by;this.board.offersAt=Date.now();
    this.note('info',`${by} criou novas opções de ordem de produção.`);this.revision++;return this.board.offers;
  }
  /** The firm approves one of the offered orders: it shows in the employees' menu, waiting for someone to start it. */
  approveOffer(id:string,by:string):ActiveProduction {
    if(this.board.active)throw new Error('Já há uma ordem de produção em andamento.');
    const offer=this.board.offers.find(each=>each.id===id);if(!offer)throw new Error('Essa opção não existe mais: peça ao dono para criar outras.');
    this.board.active={...offer,status:'approved',approvedBy:'',approvedByName:by,approvedAt:Date.now(),startedBy:'',startedAt:0,batchesStarted:0,batchesDone:0,bags:0};
    this.board.offers=[];this.note('ok',`OP aprovada por ${by}: ${offer.name}, ${offer.batches} lote(s) de ${offer.malteBags} MALTE + ${offer.mixBags} MIX. Falta iniciar no painel.`);this.revision++;return this.board.active;
  }
  /** An approved order nobody started is called off. */
  cancelApproved(by:string):void {
    const order=this.board.active;if(!order||order.status!=='approved')throw new Error('Só uma ordem aprovada e ainda não iniciada pode ser cancelada.');
    this.logProduction(order,'cancelled',by);this.board.active=null;this.note('warn',`OP ${order.name} cancelada por ${by}.`);this.revision++;
  }
  /** An employee at the control room's computer starts the approved order: from now on tanks can be started. */
  startProduction(by:string,byId=''):ActiveProduction {
    const order=this.board.active;
    if(!order)throw new Error('Não há ordem de produção aprovada: o gerente precisa aprovar uma.');
    if(order.status==='running')throw new Error('Esta ordem já está em andamento.');
    const pending=pendingCleaning(this.dirt);
    if(this.dirt.required&&pending.length)throw new Error(`Limpe a fábrica antes: faltam ${pending.length} lugar(es) (${pending.slice(0,3).map(id=>cleanTaskOf(id)?.label??id).join(', ')}${pending.length>3?'…':''}).`);
    this.dirt.required=false;this.board.active={...order,status:'running',startedBy:byId,startedAt:Date.now()};
    this.note('ok',`${by} iniciou a OP ${order.name}: ${order.batches} lote(s).`);this.revision++;return this.board.active;
  }
  /** Ends the running order early (the owner or a manager): possible only when nothing is being made in the tanks or the dryer. */
  closeProduction(by:string):void {
    const order=this.board.active;if(!order||order.status!=='running')throw new Error('Não há ordem em andamento para encerrar.');
    if(this.tanks.some(tank=>!['VAZIO','SUJO'].includes(tank.state))||this.dryer.state==='PRODUZINDO')throw new Error('Ainda há lote nos tanques ou no secador: espere terminar para encerrar a ordem.');
    this.finishProduction('closed',by);
  }
  private logProduction(order:ProductionOrder&Partial<ActiveProduction>,result:ProductionLogEntry['result'],by:string):void {
    this.board.history=[...this.board.history,{id:order.id,name:order.name,batches:order.batches,batchesDone:order.batchesDone??0,bags:order.bags??0,result,at:Date.now(),by}].slice(-20);
  }
  /** The last batch is dried and bagged: the order is done (it needs nothing more from the operators). */
  private maybeFinishProduction():boolean {
    const order=this.board.active;if(!order||order.status!=='running'||order.batchesStarted<order.batches)return false;
    if(this.tanks.some(tank=>!['VAZIO','SUJO'].includes(tank.state))||this.dryer.state==='PRODUZINDO'||this.dryer.powderKg>.05)return false;
    // An empty bag left on the nozzle (nothing in the silo to fill it) does not hold the order open: it goes back to the stack.
    if(!['PARADO','AGUARDANDO_SACO','SACO_POSICIONADO'].includes(this.bagging.state)||this.bagging.weightKg>.05)return false;
    this.unseatBag();
    this.finishProduction('completed','a fábrica');return true;
  }
  /** An empty bag sitting on the nozzle goes back to the stack of empty bags (the machine is free again). */
  private unseatBag():boolean {
    if(this.bagging.state!=='SACO_POSICIONADO')return false;
    this.bagging={...this.bagging,state:'AGUARDANDO_SACO',emptyBags:this.bagging.emptyBags+1,weightKg:0};return true;
  }
  /** The order ends: the plant is left dirty (every place needs cleaning before the next order starts) and the recipe goes back to the plant's own. */
  private finishProduction(result:'completed'|'closed',by:string):void {
    const order=this.board.active!;this.logProduction(order,result,by);this.board.active=null;
    // Everything the production touched is filthy now; the floors at least half.
    for(const task of CLEAN_TASKS)this.dirt.levels[task.id]=Math.max(this.dirt.levels[task.id],task.kind==='floor'?.7:1);
    this.dirt.required=true;
    this.note(result==='completed'?'ok':'warn',`OP ${order.name} ${result==='completed'?'concluída':'encerrada'}: ${order.bags} saco(s) ensacado(s). A fábrica está suja: lave os tanques, o secador, a linha e os pisos.`);this.revision++;
  }

  /** The administration ends the order that is on without the plant's checks (nothing is left dirty: the plant stays as it is). */
  forceClose(by:string):void {
    const order=this.board.active;if(!order)throw new Error('Não há ordem de produção.');
    this.logProduction(order,'closed',by);this.board.active=null;this.note('warn',`OP ${order.name} encerrada pela administração (${by}).`);this.revision++;
  }
  /** The administration cleans the whole plant at once (tanks included). */
  forceClean(by:string):void {
    this.dirt={levels:cleanDirt(),required:false};
    this.tanks=this.tanks.map(tank=>tank.state==='SUJO'?emptyTank(tank.id):tank);
    this.note('ok',`Fábrica limpa pela administração (${by}).`);this.revision++;
  }

  // ---- dirt and cleaning ----
  /** Adds dirt to a place (0..1); the plant's revision moves so the shader follows. */
  soil(id:CleanTaskId,amount:number):void {
    if(amount<=0)return;this.dirt.levels[id]=Math.min(1,(this.dirt.levels[id]??0)+amount);
  }
  /** What the tanks gather as they work: a little more dirt every second a batch is in them. */
  private soilTick(dt:number):void {
    for(const tank of this.tanks)if(!['VAZIO','SUJO'].includes(tank.state))this.soil(`tank${tank.id}` as CleanTaskId,Math.min(dt,5)/900*(tank.state==='TRANSFERINDO'?1.4:1));
    for(const id of ['tank1','tank2','tank3'] as const)if(this.dirt.levels[id]>.6&&this.tanks[Number(id[4])-1]!.state!=='SUJO')this.dirt.levels[id]=Math.min(this.dirt.levels[id],.6);
  }
  private checkClean():void {
    if(this.dirt.required&&pendingCleaning(this.dirt).length===0){this.dirt.required=false;this.note('ok','Fábrica limpa: pronta para a próxima ordem de produção.');}
  }
  /** Why a cleaning task cannot start now ('' when it can). The distance to its station is the room's to check. */
  cleanProblem(id:CleanTaskId):string {
    const task=cleanTaskOf(id);if(!task)return 'Tarefa de limpeza desconhecida.';
    if(task.kind==='dryer')return 'O secador se lava pelo comando "Lavar o secador" (ele precisa estar parado).';
    if((this.dirt.levels[id]??0)<DIRT_CLEAN&&!(task.kind==='tank'&&this.tanks[Number(id[4])-1]?.state==='SUJO'))return `${task.label} já está limpo.`;
    if(task.kind==='tank'){const tank=this.tanks[Number(id[4])-1]!;if(!['SUJO','VAZIO'].includes(tank.state))return `${tankName(tank.id)} tem lote: só se lava vazio.`;}
    if(task.kind==='line'&&!['PARADO','AGUARDANDO_SACO','SACO_POSICIONADO'].includes(this.bagging.state))return 'A ensacadeira está ocupada: termine o saco antes de passar água.';
    return '';
  }
  /** The timed task finished: the place is clean. */
  completeClean(id:CleanTaskId,by:string):void {
    const problem=this.cleanProblem(id);if(problem)throw new Error(problem);
    const task=cleanTaskOf(id)!;
    if(task.kind==='line')this.unseatBag();
    if(task.kind==='tank'){const tankId=Number(id[4]) as 1|2|3;this.tanks[tankId-1]=emptyTank(tankId);}
    this.dirt.levels[id]=0;this.note('ok',`${task.label} limpo por ${by}.`);this.checkClean();this.revision++;
  }

  setStock(marker:string,quantity:number,material?:FactoryMaterial):FactorySlot {
    const slot=this.slots.find(entry=>entry.marker===marker);if(!slot)throw new Error('Vaga da fábrica desconhecida.');
    if(material&&material!==slot.material)throw new Error(`${marker} aceita somente ${slot.material}.`);
    if(!Number.isInteger(quantity)||quantity<0||quantity>slot.capacity)throw new Error(`A quantidade deve ficar entre 0 e ${slot.capacity}.`);
    slot.quantity=quantity;slot.batchId=quantity&&slot.material==='PRODUTO'?slot.batchId:'';this.revision++;return {...slot};
  }
  takeBag(marker:string):'MALTE'|'MIX' {const slot=this.slots.find(item=>item.marker===marker);if(!slot||!['MALTE','MIX'].includes(slot.material)||slot.quantity<1)throw new Error('Não há saco de matéria-prima nesta vaga.');slot.quantity--;this.revision++;return slot.material as 'MALTE'|'MIX';}
  /**
   * The racks stack three levels over the same spot on the floor: reaching "that rack" takes from the lowest level that
   * still has a bag, so the operator never has to pick a level (and an empty bottom one does not block the rest).
   */
  takeFromColumn(marker:string):{material:'MALTE'|'MIX';origin:string} {
    const at=this.markers[marker]?.xyz_jogo,slot=this.slots.find(item=>item.marker===marker);
    if(!at||!slot||!['MALTE','MIX'].includes(slot.material))throw new Error('Aqui não há matéria-prima.');
    const column=this.slots.filter(item=>item.material===slot.material&&item.quantity>0&&Math.hypot((this.markers[item.marker]?.xyz_jogo[0]??1e9)-at[0],(this.markers[item.marker]?.xyz_jogo[2]??1e9)-at[2])<.35)
      .sort((a,b)=>this.markers[a.marker]!.xyz_jogo[1]-this.markers[b.marker]!.xyz_jogo[1]);
    const from=column[0];if(!from)throw new Error(`Esta prateleira de ${slot.material} está vazia.`);
    this.soil('floor-estoque',.03);
    return {material:this.takeBag(from.marker),origin:from.marker};
  }
  returnBag(marker:string,material:'MALTE'|'MIX'):void {
    const home=this.slots.find(item=>item.marker===marker&&item.material===material&&item.quantity<item.capacity)??this.slots.find(item=>item.material===material&&item.quantity<item.capacity);
    if(!home)throw new Error('Nenhuma vaga pode receber o saco.');
    home.quantity++;this.revision++;
  }
  // ---- the platform cart ----
  /** What the cart looks like to the clients. */
  cartView():CartView {const {x,y,z,yaw,bags,pusher}=this.cart;return {x,y,z,yaw,bags:bags.map(bag=>bag.material),pusher};}
  /** A sack from a rack column goes onto the cart (refused, with the shelf untouched, when the cart is full). */
  takeToCart(marker:string):CartBag {
    if(this.cart.bags.length>=CART_CAPACITY)throw new Error(`O carrinho está cheio (${CART_CAPACITY}/${CART_CAPACITY}).`);
    const bag=this.takeFromColumn(marker);this.cart.bags.push(bag);this.cart.version++;return bag;
  }
  /** A sack from somebody's arms goes onto the cart. */
  putOnCart(bag:CartBag):void {
    if(this.cart.bags.length>=CART_CAPACITY)throw new Error(`O carrinho está cheio (${CART_CAPACITY}/${CART_CAPACITY}).`);
    this.cart.bags.push({...bag});this.cart.version++;this.revision++;
  }
  /** The top sack of the cart (with the shelf it came from) goes to somebody's arms. */
  unloadFromCart():CartBag {
    const bag=this.cart.bags.pop();if(!bag)throw new Error('O carrinho está vazio.');
    this.cart.version++;this.revision++;return bag;
  }
  /** Who pushes the cart now (null: nobody; it stays where it is). */
  setCartPusher(userId:string|null):void {if(this.cart.pusher===userId)return;this.cart.pusher=userId;this.cart.version++;}
  /** One step of the cart behind its pusher (see stepCart); true when it moved. */
  moveCart(driver:{x:number;y:number;z:number;rotation:number},dt:number):boolean {
    const moved=stepCart(this.cart,driver,dt)==='moved';if(moved)this.cart.version++;return moved;
  }
  /** The cart goes back to where it parks, empty (its sacks are not given back: this is for a plant that was reset to nothing). */
  parkCart():void {Object.assign(this.cart,FACTORY_CART.park,{bags:[],pusher:null});this.cart.version++;}
  /** The stock as it is saved: the cart's sacks count as still on their shelves, because the cart does not survive a restart (it comes back parked and empty). */
  persistentSlots():FactorySlot[] {
    const slots=this.slots.map(slot=>({...slot}));
    for(const bag of this.cart.bags){
      const home=slots.find(slot=>slot.marker===bag.origin&&slot.material===bag.material&&slot.quantity<slot.capacity)??slots.find(slot=>slot.material===bag.material&&slot.quantity<slot.capacity);
      if(home)home.quantity++;
    }
    return slots;
  }
  /**
   * A bag poured by an operator standing on the platform: the lid is opened and the agitator started first when they are not (the
   * operator is right there with the bag in the hands). Returns what was done on the way, to tell the operator. Refused (nothing changed)
   * when the tank is not in a step that takes ingredients.
   */
  pourBag(tankId:1|2|3,material:'MALTE'|'MIX'):string[] {
    const index=tankId-1,name=tankName(tankId),before=this.tanks[index]!,did:string[]=[];
    // Wrong step or no water: addIngredient says why (nothing is touched before it agrees).
    const bal=this.eff;
    if(!['AGUARDANDO_INSUMOS','DISSOLVENDO'].includes(before.state)||before.waterL<=0)addIngredient({...before,lidOpen:true,agitatorRpm:bal.agitatorRpm},material,bal);
    let ready=before;
    if(!ready.lidOpen){ready={...ready,lidOpen:true};did.push('abriu a tampa');}
    if(ready.agitatorRpm<=0){ready={...ready,agitatorRpm:bal.agitatorRpm};did.push('ligou o agitador');}
    this.tanks[index]=addIngredient(ready,material,bal);const tank=this.tanks[index]!;
    if(did.length)this.note('info',`${name}: o operador ${did.join(' e ')} antes de despejar.`);
    const need=material==='MALTE'?bal.recipe.malteBags:bal.recipe.mixBags,have=material==='MALTE'?tank.malteBags:tank.mixBags;
    this.note('info',`${name}: ${material} ${have}/${need}.`);
    this.soil('floor-tanques',.07);
    if(tank.malteBags>=bal.recipe.malteBags&&tank.mixBags>=bal.recipe.mixBags){this.tanks[index]={...tank,state:'DISSOLVENDO',stepS:0,lidOpen:false};this.note('ok',`${name} recebeu a receita completa: dissolvendo (tampa fechada).`);}
    this.revision++;return did;
  }

  /** A tank whose water was being sent to the dryer goes back to waiting, so stopping the dryer never strands it. */
  private releaseSource():void {
    const id=this.dryer.sourceTank;if(!id)return;const tank=this.tanks[id-1]!;
    if(tank.state==='TRANSFERINDO')this.tanks[id-1]=tank.waterL>.01?{...tank,state:'PRONTO_PARA_TRANSFERIR'}:emptyTank(id);
  }
  /** Runs one panel/station command; the answer is what the operator is told. A refused command throws a sentence that says why. */
  command(action:string,target?:string,by?:string):string {
    const who=by?` (${by})`:'';
    const tankMatch=/^tank([1-3])\.(.+)$/.exec(action);
    let message='';
    if(tankMatch)message=this.tankCommand(Number(tankMatch[1])-1,tankMatch[2]!,who);
    else switch(action){
      case 'dryer.preheat':
        if(this.dryer.state!=='PARADO')throw new Error(`O secador está em ${this.dryer.state.toLowerCase().replaceAll('_',' ')}: só pré-aquece parado.`);
        this.dryer={...this.dryer,state:'PRE_AQUECENDO',stepS:0};message='Secador pré-aquecendo: leva alguns minutos.';this.note('info',`Pré-aquecimento do secador iniciado${who}.`);break;
      case 'dryer.feed':{
        const id=Number(target) as 1|2|3,tank=this.tanks[id-1];
        if(!tank)throw new Error('Escolha o tanque que vai alimentar o secador.');
        if(this.dryer.state!=='PRONTO'&&this.dryer.state!=='PRODUZINDO')throw new Error('O secador precisa estar pré-aquecido (PRONTO) ou produzindo para receber um tanque.');
        if(this.dryer.state==='PRODUZINDO'&&this.dryer.sourceTank===id)throw new Error(`${tankName(id)} já está alimentando o secador.`);
        if(tank.state!=='PRONTO_PARA_TRANSFERIR')throw new Error(`${tankName(id)} ainda não está aprovado para transferir.`);
        // Switching tanks while the dryer works: the tank it was drying keeps what is left (approved, ready to be fed again) and the dryer does not stop.
        const switching=this.dryer.state==='PRODUZINDO'&&!!this.dryer.sourceTank,from=this.dryer.sourceTank;
        if(switching)this.releaseSource();
        this.dryer={...this.dryer,state:'PRODUZINDO',sourceTank:id,stepS:0};
        message=switching?`Secador trocou do ${tankName(from!)} para o ${tankName(id)} sem parar.`:`${tankName(id)} alimentando o secador.`;
        this.note('info',switching?`Secador passou do ${tankName(from!)} para o ${tankName(id)}${who}: produção contínua.`:`${tankName(id)} liberado para o secador${who}.`);break;}
      case 'dryer.stop':case 'dryer.cool':
        if(['PARADO','FALHA','LIMPEZA'].includes(this.dryer.state))throw new Error('O secador já está parado.');
        this.releaseSource();this.dryer={...this.dryer,state:'RESFRIANDO',sourceTank:null,flowLph:0,stepS:0};message='Secador resfriando.';this.note('warn',`Secador interrompido${who}.`);break;
      case 'dryer.retry':
        if(this.dryer.state!=='FALHA')throw new Error('O secador não está em falha.');
        this.dryer={...this.dryer,state:'PARADO',fault:'',sourceTank:null,flowLph:0,stepS:0};message='Falha rearmada: secador parado e pronto para pré-aquecer.';this.note('ok',`Falha do secador rearmada${who}.`);break;
      case 'dryer.clean':
        if(!['PARADO','FALHA'].includes(this.dryer.state))throw new Error('Pare o secador antes da limpeza.');
        this.dryer={...this.dryer,state:'LIMPEZA',fault:'',stepS:0};message='Lavagem da câmara do secador iniciada: leva menos de um minuto.';this.note('info',`Lavagem do secador iniciada${who}.`);break;
      case 'bag.empty':
        if(this.bagging.emptyBags<1)throw new Error('Sem sacos vazios: reponha o fardo.');
        if(this.bagging.state!=='PARADO'&&this.bagging.state!=='AGUARDANDO_SACO')throw new Error('A ensacadeira está ocupada com outro saco.');
        this.bagging={...this.bagging,state:'SACO_POSICIONADO',emptyBags:this.bagging.emptyBags-1,weightKg:0};message='Saco posicionado no bico.';break;
      case 'bag.remove':
        if(this.bagging.state!=='SACO_POSICIONADO')throw new Error('Não há saco vazio posicionado no bico para retirar.');
        this.unseatBag();message='Saco vazio retirado do bico: voltou para o fardo.';break;
      case 'bag.restock':
        if(this.bagging.emptyBags>FACTORY_BAGS.lowAt*4)throw new Error('Ainda há bastante saco vazio no fardo.');
        this.bagging={...this.bagging,emptyBags:this.bagging.emptyBags+FACTORY_BAGS.restock};message=`Fardo reposto: +${FACTORY_BAGS.restock} sacos vazios.`;this.note('info',`Fardo de sacos vazios reposto${who}.`);break;
      case 'bag.start':
        if(this.bagging.state!=='SACO_POSICIONADO')throw new Error('Posicione um saco vazio antes de iniciar.');
        if(this.dryer.powderKg<.05&&this.dryer.state!=='PRODUZINDO')throw new Error('Não há produto no silo.');
        this.bagging={...this.bagging,state:'ENCHENDO',lot:this.bagging.lot||`L${new Date().toISOString().slice(2,10).replaceAll('-','')}-${(this.bagging.producedBags+1).toString(36).toUpperCase()}`};
        message=this.dryer.powderKg<this.balance.bagKg?(this.dryer.state==='PRODUZINDO'?`Enchendo: o silo tem ${fixed(this.dryer.powderKg,1)} kg e o secador manda mais.`:`Enchendo com o que há no silo (${fixed(this.dryer.powderKg,1)} kg): sairá um saco leve.`):'Enchendo o saco.';break;
      case 'bag.finish':
        if(this.bagging.state!=='ENCHENDO'&&this.bagging.state!=='PAUSADO')throw new Error('Não há saco enchendo para fechar.');
        if(this.bagging.weightKg<.05)throw new Error('O saco ainda está vazio.');
        this.bagging={...this.bagging,state:'AGUARDANDO_COSTURA'};message=`Saco fechado com ${fixed(this.bagging.weightKg,1)} kg.`;this.note('info',`Saco fechado com ${fixed(this.bagging.weightKg,1)} kg${who}.`);break;
      case 'bag.pause':
        if(this.bagging.state!=='ENCHENDO')throw new Error('A ensacadeira não está enchendo.');
        this.bagging={...this.bagging,state:'PAUSADO'};message='Ensaque pausado.';break;
      case 'bag.resume':
        if(this.bagging.state!=='PAUSADO')throw new Error('A ensacadeira não está pausada.');
        this.bagging={...this.bagging,state:'ENCHENDO'};message='Ensaque retomado.';break;
      case 'bag.sew':
        if(this.bagging.state!=='AGUARDANDO_COSTURA')throw new Error('O saco ainda não está cheio para costurar.');
        this.bagging={...this.bagging,state:'AGUARDANDO_EMPILHAR'};message='Saco costurado.';break;
      case 'bag.stack':{
        if(this.bagging.state!=='AGUARDANDO_EMPILHAR')throw new Error('Não há saco costurado na saída.');
        const count=this.bagging.palletBags+1,out=this.slots.find(item=>item.marker===PALLET_OUT);
        // Checked before anything changes: a full pallet spot must not eat the bag.
        if(count===18&&(!out||out.quantity))throw new Error('O palete anterior ainda está na saída: armazene-o no estoque primeiro.');
        const kg=this.bagging.weightKg,light=kg<this.balance.bagKg-this.balance.bagToleranceKg;
        this.soil('line',.06);this.soil('floor-ensaque',.05);
        if(this.board.active)this.board.active={...this.board.active,bags:this.board.active.bags+1};
        this.bagging={...this.bagging,state:'AGUARDANDO_SACO',weightKg:0,lastBagKg:kg,lightBags:(this.bagging.lightBags??0)+(light?1:0),palletBags:count%18,producedBags:this.bagging.producedBags+1};
        message=light?`Saco leve (${fixed(kg,1)} kg) empilhado: palete ${count%18||18}/18.`:`Saco empilhado: palete ${count%18||18}/18.`;
        if(count===18&&out){out.quantity=18;out.batchId=this.bagging.lot;this.note('ok',`Palete completo (lote ${this.bagging.lot||'—'}): armazene-o no estoque.`);this.bagging={...this.bagging,lot:''};message='Palete completo! Armazene-o no estoque.';}
        break;}
      case 'pallet.close':{
        const out=this.slots.find(item=>item.marker===PALLET_OUT);
        if(!out)throw new Error('Não há palete na saída.');
        if(out.quantity)throw new Error('O palete anterior ainda está na saída: armazene-o no estoque primeiro.');
        if(this.bagging.palletBags<1)throw new Error('Não há sacos empilhados no palete da saída.');
        if(!['PARADO','AGUARDANDO_SACO','SACO_POSICIONADO'].includes(this.bagging.state))throw new Error('Termine o saco que está na ensacadeira antes de fechar o palete.');
        this.unseatBag();
        const bags=this.bagging.palletBags;out.quantity=bags;out.batchId=this.bagging.lot;this.bagging={...this.bagging,palletBags:0,lot:''};
        message=`Palete fechado com ${bags} sacos (incompleto). Armazene-o no estoque.`;this.note('ok',`Palete incompleto de ${bags} sacos fechado${who}.`);break;}
      case 'pallet.store':{
        const out=this.slots.find(item=>item.marker===PALLET_OUT);
        if(!out||!out.quantity)throw new Error('Não há palete pronto na saída do ensaque.');
        const free=this.slots.find(item=>item.material==='PRODUTO'&&item.marker!==PALLET_OUT&&item.quantity===0);
        if(!free)throw new Error('O estoque de produto acabado está cheio: despache uma ordem de venda.');
        free.quantity=out.quantity;free.batchId=out.batchId;out.quantity=0;out.batchId='';
        message=`Palete armazenado na vaga ${free.marker.replace('Ponto_EB_','')}.`;this.note('ok',`Palete de ${free.quantity} sacos armazenado${who}.`);break;}
      case 'alarm.ack':{
        const alarm=this.alarms.find(item=>item.id===target);if(!alarm)throw new Error('Alarme desconhecido.');
        alarm.acknowledged=true;message='Alarme reconhecido.';break;}
      case 'alarm.ack.all':
        for(const alarm of this.alarms)alarm.acknowledged=true;message='Alarmes reconhecidos.';break;
      case 'emergency':
        if(this.emergency)throw new Error('A parada de emergência já está acionada.');
        this.emergency=true;this.note('bad',`PARADA DE EMERGÊNCIA${who}.`);message='Parada de emergência acionada: toda a linha parou.';break;
      case 'emergency.reset':
        if(!this.emergency)throw new Error('Não há emergência para rearmar.');
        this.emergency=false;this.alarms=this.alarms.filter(item=>item.key!=='emergency');this.note('ok',`Emergência rearmada${who}.`);message='Emergência rearmada: a linha volta a andar.';break;
      default:throw new Error('Comando de fábrica desconhecido.');
    }
    this.evaluateAlarms();
    // Last, so the board's newest line is the one that matters.
    if(action==='emergency')this.alarms.push({id:`emergency-${Date.now()}`,key:'emergency',severity:'critical',source:'painel',text:'Parada de emergência acionada',at:Date.now(),acknowledged:false,active:true});
    this.revision++;return message;
  }
  private tankCommand(index:number,verb:string,who:string):string {
    const tank=this.tanks[index]!,id=(index+1) as 1|2|3,name=tankName(id),set=(next:Partial<TankRuntime>)=>{this.tanks[index]={...this.tanks[index]!,...next};};
    switch(verb){
      case 'water':{
        if(tank.state!=='VAZIO')throw new Error(tank.state==='SUJO'?`${name} está sujo: lave-o na plataforma antes.`:`${name} já tem um lote em andamento.`);
        const order=this.board.active;
        if(!this.bypassOrder){
          if(!order)throw new Error('Sem ordem de produção: o gerente precisa aprovar uma OP (Perfil → Gerenciar empresa) e um funcionário iniciá-la no painel.');
          if(order.status!=='running')throw new Error('A ordem de produção foi aprovada mas ainda não foi iniciada: inicie-a no painel da sala de controle.');
          if(order.batchesStarted>=order.batches)throw new Error(`A ordem já iniciou os ${order.batches} lote(s) que pedia.`);
          this.board.active={...order,batchesStarted:order.batchesStarted+1};
        }
        set({state:'ENCHENDO_AGUA'});this.note('info',order&&!this.bypassOrder?`${name} enchendo de água${who}: lote ${order.batchesStarted+1}/${order.batches} da OP ${order.name}.`:`${name} enchendo de água${who}.`);return `${name} enchendo de água.`;}
      case 'heat':
        if(!['AQUECENDO','AGUARDANDO_INSUMOS'].includes(tank.state))throw new Error(`${name} precisa ter água antes de aquecer.`);
        set({state:'AQUECENDO'});return `${name} aquecendo.`;
      // The panel sends explicit on/off (a click is never a toggle that depends on what the screen showed); the old toggles stay for chat/admin.
      case 'agitator':case 'agitator.on':case 'agitator.off':{
        const on=verb==='agitator.on'?true:verb==='agitator.off'?false:!tank.agitatorRpm;
        if(['VAZIO','SUJO'].includes(tank.state))throw new Error(`${name} está ${tank.state==='SUJO'?'sujo':'vazio'}: não há o que agitar.`);
        set({agitatorRpm:on?this.balance.agitatorRpm:0});this.note('info',`Agitador do ${name} ${on?'ligado':'desligado'}${who}.`);return `Agitador do ${name} ${on?'ligado':'desligado'}.`;}
      case 'lid':case 'lid.open':case 'lid.close':{
        const open=verb==='lid.open'?true:verb==='lid.close'?false:!tank.lidOpen;
        if(['VAZIO','SUJO'].includes(tank.state))throw new Error(`${name} está ${tank.state==='SUJO'?'sujo':'vazio'}.`);
        set({lidOpen:open});this.note('info',`Tampa do ${name} ${open?'aberta':'fechada'}${who}.`);return `Tampa do ${name} ${open?'aberta':'fechada'}.`;}
      case 'sample':
        if(tank.state!=='AGUARDANDO_QUALIDADE')throw new Error('A amostra só é colhida quando o lote termina de homogeneizar.');
        this.note('info',`Amostra do ${name}: qualidade ${tank.quality}%, ${fixed(tank.temperatureC,1)} °C.`);return `Amostra do ${name}: qualidade ${tank.quality}%.`;
      case 'approve':
        if(tank.state!=='AGUARDANDO_QUALIDADE')throw new Error('Só se aprova o lote depois da homogeneização.');
        set({state:'PRONTO_PARA_TRANSFERIR'});this.note('ok',`${name} aprovado (${tank.quality}%)${who}: pronto para o secador.`);return `${name} aprovado: alimente o secador.`;
      case 'reject':
        if(!['AGUARDANDO_QUALIDADE','PRONTO_PARA_TRANSFERIR'].includes(tank.state))throw new Error('Só se reprova um lote que já foi homogeneizado.');
        set({state:'SUJO',waterL:0,malteBags:0,mixBags:0,agitatorRpm:0,lidOpen:false,penalties:[...tank.penalties,'lote_reprovado']});this.note('bad',`${name} reprovado${who}: lote descartado.`);return `${name} reprovado: lave o tanque.`;
      case 'discard':
        if(tank.state==='VAZIO')throw new Error(`${name} já está vazio.`);
        if(tank.state==='TRANSFERINDO'&&this.dryer.state==='PRODUZINDO'&&this.dryer.sourceTank===id)throw new Error(`${name} está alimentando o secador: pare o secador antes.`);
        this.tanks[index]={...emptyTank(id),state:'SUJO'};this.note('warn',`${name} descartado${who}.`);return `${name} descartado: lave o tanque.`;
      // Washing is the platform's timed cleaning (completeClean); this verb only exists for the chat/admin and the automatic cycle.
      case 'wash':
        if(!['SUJO','VAZIO'].includes(tank.state))throw new Error(`${name} tem lote em andamento: descarte ou conclua antes.`);
        this.tanks[index]=emptyTank(id);this.dirt.levels[`tank${id}` as CleanTaskId]=0;this.checkClean();return `${name} lavado.`;
      default:throw new Error('Comando de tanque desconhecido.');
    }
  }
  /**
   * Product leaves the racks for a truck: `pallets` whole pallets, whatever their fill (an incomplete pallet is a pallet too, sold by the bags on it),
   * the emptiest first so partial pallets go before full ones. Returns the bags taken per slot (to put back if the truck cannot be loaded; their sum is
   * the cargo's bags). Throws when there are not that many pallets.
   */
  takeProduct(pallets:number):Record<string,number> {
    if(!Number.isInteger(pallets)||pallets<1)throw new Error('Escolha quantos paletes carregar.');
    const stored=this.slots.filter(item=>item.material==='PRODUTO'&&item.quantity>0).sort((a,b)=>a.quantity-b.quantity);
    if(stored.length<pallets)throw new Error(`Só há ${stored.length} palete(s) de produto no estoque.`);
    const taken:Record<string,number>={};
    for(const slot of stored.slice(0,pallets)){taken[slot.marker]=slot.quantity;slot.quantity=0;slot.batchId='';}
    this.note('info',`${pallets} palete(s) de produto (${Object.values(taken).reduce((sum,bags)=>sum+bags,0)} sacos) saíram do estoque para um caminhão.`);this.revision++;return taken;
  }
  /** Gives back what takeProduct took (a failed load, or a load cancelled before the truck left). */
  returnProduct(taken:Record<string,number>|number):void {
    if(typeof taken==='number'){
      let left=taken;for(const slot of this.slots.filter(item=>item.material==='PRODUTO'))if(left>0){const room=Math.min(slot.capacity-slot.quantity,left);slot.quantity+=room;left-=room;}
      this.note('warn','Carga cancelada: o produto voltou ao estoque.');this.revision++;return;
    }
    for(const [marker,bags] of Object.entries(taken)){const slot=this.slots.find(item=>item.marker===marker);if(slot)slot.quantity=Math.min(slot.capacity,slot.quantity+bags);}
    this.revision++;
  }
  /** Bags of raw material (or product) the racks can still take. */
  roomFor(material:FactoryMaterial):number {return this.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.capacity-slot.quantity,0);}
  /** Raw material unloaded from a truck goes onto the racks of its kind. */
  addBags(material:FactoryMaterial,bags:number):void {
    if(this.roomFor(material)<bags)throw new Error(`As prateleiras de ${material} não têm vaga para ${bags} sacos.`);
    let left=bags;for(const slot of this.slots.filter(item=>item.material===material&&item.quantity<item.capacity)){const room=Math.min(slot.capacity-slot.quantity,left);slot.quantity+=room;left-=room;if(!left)break;}
    this.note('ok',`${bags} sacos de ${material} chegaram de caminhão.`);this.revision++;
  }
  /** A plant nobody has touched: no stock, no batch, nothing bagged. */
  pristine():boolean {return this.slots.every(slot=>!slot.quantity)&&this.bagging.producedBags===0&&this.tanks.every(tank=>tank.state==='VAZIO')&&this.dryer.state==='PARADO';}
  /** Enough raw material for the first few batches, so a new plant can run before the first truck arrives. */
  seedStarterStock():void {
    for(const [marker,quantity] of [['Ponto_EB_Rack_V1N1P1',18],['Ponto_EB_Rack_V1N1P2',18],['Ponto_EB_Rack_V3N1P1',18]] as const){const slot=this.slots.find(item=>item.marker===marker);if(slot)slot.quantity=quantity;}
    this.seeded=true;this.note('ok','Estoque inicial recebido: 36 sacos de MALTE e 18 de MIX.');this.revision++;
  }
  reset():void {
    this.seeded=true;this.parkCart();
    for(const slot of this.slots)Object.assign(slot,{quantity:0,batchId:'',reservedBy:'',reservedUntil:0});
    this.tanks=[emptyTank(1),emptyTank(2),emptyTank(3)];this.dryer=emptyDryer();this.bagging={...emptyBagging(),emptyBags:FACTORY_BAGS.start};this.alarms=[];this.emergency=false;this.lastSimulation=null;this.balance=structuredClone(DEFAULT_FACTORY_BALANCE);this.board=emptyProductionBoard();this.dirt={levels:cleanDirt(),required:false};this.note('warn','Fábrica resetada.');this.revision++;
  }
  runAutomaticCycle():FactorySimulationReport {
    const totals=()=>Object.fromEntries(FACTORY_MATERIALS.map(material=>[material,this.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0)])) as Record<FactoryMaterial,number>;
    const report:FactorySimulationReport={startedAt:Date.now(),completedAt:0,steps:[],stockBefore:totals(),stockAfter:{MALTE:0,MIX:0,PRODUTO:0,ACO:0,ALUMINIO:0,POLIMERO:0,MOLAS:0},producedBags:0,faults:[]},previousOperators=this.activeOperators,previousScale=this.balance.timeScale;
    const consume=(material:'MALTE'|'MIX',count:number)=>{for(let i=0;i<count;i++){const slot=this.slots.find(item=>item.material===material&&item.quantity>0);if(!slot)throw new Error(`Estoque insuficiente de ${material} para o ciclo automático.`);this.pourBag(1,this.takeBag(slot.marker));}};
    this.bypassOrder=true;
    try{this.setOperators(Math.max(1,previousOperators));this.balance.timeScale=60;this.command('tank1.water');this.tick(1);this.tick(3);this.command('tank1.agitator');this.command('tank1.lid');consume('MALTE',this.balance.recipe.malteBags);consume('MIX',this.balance.recipe.mixBags);report.steps.push('água','aquecimento','dosagem');this.tick(3);this.tick(1);this.command('tank1.approve');report.steps.push('dissolução','homogeneização','qualidade');this.command('dryer.preheat');this.tick(4);this.command('dryer.feed','1');this.tick(70);report.steps.push('pré-aquecimento','secagem');const bags=Math.floor(this.dryer.powderKg/this.balance.bagKg);this.bagging.emptyBags+=bags;for(let i=0;i<bags&&i<18;i++){this.command('bag.empty');this.command('bag.start');this.tick(1);this.command('bag.sew');this.command('bag.stack');}report.producedBags=Math.min(bags,18);report.steps.push('ensaque','paletização');}
    catch(error){report.faults.push(error instanceof Error?error.message:String(error));throw error;}finally{this.bypassOrder=false;this.balance.timeScale=previousScale;this.setOperators(previousOperators);report.completedAt=Date.now();report.stockAfter=totals();this.lastSimulation=report;this.revision++;}
    return report;
  }
  /**
   * Restores persisted data. What was moving on its own comes back paused (`restored` remembers the step) and goes on
   * by itself when an operator is on shift again; stored steps that wait for an operator (ready, approved) stay as they were.
   */
  restore(value:unknown,persistedSlots:readonly Partial<FactorySlot>[]=[]):void {
    const state=value&&typeof value==='object'?value as Partial<FactorySnapshot>:{};
    const pause=<T extends {state:string;restored?:string}>(entry:T,running:readonly string[]):T=>running.includes(entry.state)?{...entry,state:'PAUSADO',restored:entry.state}:entry;
    if(Array.isArray(state.tanks)&&state.tanks.length===3)this.tanks=state.tanks.map((tank,index)=>pause({...emptyTank((index+1) as 1|2|3),...tank},TANK_RUNNING) as TankRuntime);
    if(state.dryer&&typeof state.dryer==='object')this.dryer=pause({...emptyDryer(),...state.dryer},DRYER_RUNNING) as DryerRuntime;
    if(state.bagging&&typeof state.bagging==='object')this.bagging=pause({...emptyBagging(),...state.bagging},['ENCHENDO']) as BaggingRuntime;
    if(state.balance&&typeof state.balance==='object'){this.balance={...structuredClone(DEFAULT_FACTORY_BALANCE),...state.balance,recipe:{...DEFAULT_FACTORY_BALANCE.recipe,...state.balance.recipe}};if(this.balance.dryerFlowLph===OLD_DRYER_FLOW_LPH)this.balance.dryerFlowLph=DEFAULT_FACTORY_BALANCE.dryerFlowLph;}
    if(state.baseRecipe&&typeof state.baseRecipe==='object')this.balance.recipe={...DEFAULT_FACTORY_BALANCE.recipe,...state.baseRecipe};
    if(state.board&&typeof state.board==='object')this.board={...emptyProductionBoard(),...state.board,offers:Array.isArray(state.board.offers)?state.board.offers:[],history:Array.isArray(state.board.history)?state.board.history.slice(-20):[]};
    if(state.dirt&&typeof state.dirt==='object')this.dirt={levels:{...cleanDirt(),...(state.dirt.levels??{})},required:!!state.dirt.required};
    this.seeded=!!state.seeded;this.emergency=!!state.emergency;this.alarms=Array.isArray(state.alarms)?state.alarms.slice(-60):[];this.events=Array.isArray(state.events)?state.events.slice(-60):[];this.eventSeq=this.events.reduce((top,event)=>Math.max(top,event.id),0);
    for(const saved of persistedSlots){const slot=this.slots.find(item=>item.marker===saved.marker);if(slot&&saved.material===slot.material&&Number.isInteger(saved.quantity)&&saved.quantity!>=0&&saved.quantity!<=slot.capacity)Object.assign(slot,{quantity:saved.quantity,batchId:saved.batchId??'',reservedBy:'',reservedUntil:0});}
    this.revision=Math.max(this.revision,Number(state.revision)||0)+1;
  }
  /** With an operator back on shift, what the restart paused moves again. Returns whether anything did. */
  private resumeRestored():boolean {
    let resumed=false;
    this.tanks=this.tanks.map(tank=>{if(tank.state!=='PAUSADO'||!tank.restored)return tank;resumed=true;const {restored,...rest}=tank;return {...rest,state:restored as TankRuntime['state']};});
    if(this.dryer.state==='PAUSADO'&&this.dryer.restored){resumed=true;const {restored,...rest}=this.dryer;this.dryer={...rest,state:restored as DryerRuntime['state']};}
    if(this.bagging.state==='PAUSADO'&&this.bagging.restored){resumed=true;const {restored,...rest}=this.bagging;this.bagging={...rest,state:restored as BaggingRuntime['state']};}
    if(resumed)this.note('ok','Operador em serviço: o que estava parado desde o reinício voltou a andar.');
    return resumed;
  }
  snapshot():FactorySnapshot {return {revision:this.revision,started:this.tanks.some(t=>t.state!=='VAZIO')||this.dryer.state!=='PARADO',emergency:this.emergency,balance:structuredClone(this.eff),baseRecipe:{...this.balance.recipe},board:structuredClone(this.board),dirt:structuredClone(this.dirt),slots:this.slots.map(slot=>({...slot})),tanks:this.tanks.map(tank=>({...tank,penalties:[...tank.penalties]})),dryer:{...this.dryer},bagging:{...this.bagging},alarms:this.alarms.map(alarm=>({...alarm})),events:this.events.slice(-30).map(event=>({...event})),siloCapacityKg:SILO_CAPACITY_KG,markerCount:Object.keys(this.markers).length,activeOperators:this.activeOperators,pausedWithoutOperator:!this.activeOperators,lastSimulation:this.lastSimulation?structuredClone(this.lastSimulation):null,seeded:this.seeded};}
}
