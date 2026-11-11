import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_FACTORY_BALANCE,FACTORY_MATERIALS,addIngredient,batchYield,emptyBagging,emptyDryer,emptyTank,tickDryer,tickTank,type BaggingRuntime,type DryerRuntime,type FactoryBalance,type FactoryMaterial,type TankRuntime} from '@bar/shared/factory';

interface MarkerFile {n:number;marcadores:Record<string,{xyz_jogo:[number,number,number];rot:number[]|null;extras:Record<string,unknown>}>}
interface StockFile {vagas:Array<{marcador:string;tipo:FactoryMaterial;capacidade:number;nivel_m:number;jogo_xyz:[number,number,number]}>}
export interface FactorySlot {marker:string;material:FactoryMaterial;quantity:number;capacity:number;levelM:number;batchId:string;reservedBy:string;reservedUntil:number}
export interface FactoryAlarm {id:string;severity:'info'|'warning'|'alarm'|'critical';source:string;text:string;at:number;acknowledged:boolean}
export interface FactorySimulationReport {startedAt:number;completedAt:number;steps:string[];stockBefore:Record<FactoryMaterial,number>;stockAfter:Record<FactoryMaterial,number>;producedBags:number;faults:string[]}
export interface FactorySnapshot {revision:number;started:boolean;emergency:boolean;balance:FactoryBalance;slots:FactorySlot[];tanks:TankRuntime[];dryer:DryerRuntime;bagging:BaggingRuntime;alarms:FactoryAlarm[];markerCount:number;activeOperators:number;pausedWithoutOperator:boolean;lastSimulation:FactorySimulationReport|null}

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

export class FactoryDirector {
  readonly markers:MarkerFile['marcadores'];
  readonly slots:FactorySlot[];
  balance:FactoryBalance=structuredClone(DEFAULT_FACTORY_BALANCE);
  tanks:TankRuntime[]=[emptyTank(1),emptyTank(2),emptyTank(3)];
  dryer=emptyDryer();bagging=emptyBagging();alarms:FactoryAlarm[]=[];
  emergency=false;revision=0;lastSimulation:FactorySimulationReport|null=null;private activeOperators=0;private tickAccumulator=0;
  constructor(assets=loadAssets()){
    validateFactoryAssets(assets.markers,assets.stock);this.markers=assets.markers.marcadores;
    this.slots=assets.stock.vagas.map(slot=>({marker:slot.marcador,material:slot.tipo,quantity:0,capacity:slot.capacidade,levelM:slot.nivel_m,batchId:'',reservedBy:'',reservedUntil:0}));
  }
  setOperators(count:number):void {this.activeOperators=Math.max(0,Math.floor(count));}
  tick(dtS:number):void {
    this.tickAccumulator+=Math.max(0,dtS);if(this.tickAccumulator<.25)return;
    const dt=this.tickAccumulator,scaled=dt*this.balance.timeScale;this.tickAccumulator=0;
    if(!this.activeOperators||this.emergency)return;
    this.tanks=this.tanks.map(tank=>{let next=tank;if(tank.state==='ENCHENDO_AGUA'){next={...tank,waterL:Math.min(this.balance.recipe.waterL,tank.waterL+this.balance.waterFlowLps*scaled)};if(next.waterL>=this.balance.recipe.waterL)next={...next,state:'AQUECENDO',stepS:0};}return tickTank(next,dt,this.balance);});
    this.dryer=tickDryer(this.dryer,dt,this.balance);
    const source=this.dryer.sourceTank;if(this.dryer.state==='PRODUZINDO'&&source){const tank=this.tanks[source-1]!,litres=Math.min(tank.waterL,this.balance.dryerFlowLph/3600*scaled),solidKg=(tank.malteBags+tank.mixBags)*25,powder=litres*(solidKg/this.balance.recipe.waterL)*batchYield(tank.quality,this.balance);this.dryer={...this.dryer,flowLph:this.balance.dryerFlowLph,powderKg:this.dryer.powderKg+powder};this.tanks[source-1]={...tank,waterL:Math.max(0,tank.waterL-litres),state:'TRANSFERINDO'};if(this.tanks[source-1]!.waterL<=.01){this.tanks[source-1]=emptyTank(source);this.dryer={...this.dryer,state:'RESFRIANDO',sourceTank:null,flowLph:0,stepS:0};}}
    if(this.bagging.state==='ENCHENDO'){const weight=Math.min(this.balance.bagKg,this.bagging.weightKg+this.balance.bagKg/this.balance.bagFillS*scaled),used=weight-this.bagging.weightKg;this.bagging={...this.bagging,weightKg:weight};this.dryer={...this.dryer,powderKg:Math.max(0,this.dryer.powderKg-used)};if(weight>=this.balance.bagKg)this.bagging={...this.bagging,state:'AGUARDANDO_COSTURA'};}
    this.revision++;
  }
  setStock(marker:string,quantity:number,material?:FactoryMaterial):FactorySlot {
    const slot=this.slots.find(entry=>entry.marker===marker);if(!slot)throw new Error('Vaga da fábrica desconhecida.');
    if(material&&material!==slot.material)throw new Error(`${marker} aceita somente ${slot.material}.`);
    if(!Number.isInteger(quantity)||quantity<0||quantity>slot.capacity)throw new Error(`A quantidade deve ficar entre 0 e ${slot.capacity}.`);
    slot.quantity=quantity;slot.batchId=quantity&&slot.material==='PRODUTO'?slot.batchId:'';this.revision++;return {...slot};
  }
  takeBag(marker:string):'MALTE'|'MIX' {const slot=this.slots.find(item=>item.marker===marker);if(!slot||!['MALTE','MIX'].includes(slot.material)||slot.quantity<1)throw new Error('Não há saco de matéria-prima nesta vaga.');slot.quantity--;this.revision++;return slot.material as 'MALTE'|'MIX';}
  returnBag(marker:string,material:'MALTE'|'MIX'):void {const slot=this.slots.find(item=>item.marker===marker);if(!slot||slot.material!==material||slot.quantity>=slot.capacity)throw new Error('A vaga de origem não pode receber o saco.');slot.quantity++;this.revision++;}
  pourBag(tankId:1|2|3,material:'MALTE'|'MIX'):void {const index=tankId-1;this.tanks[index]=addIngredient(this.tanks[index]!,material,this.balance);const tank=this.tanks[index]!;if(tank.malteBags>=this.balance.recipe.malteBags&&tank.mixBags>=this.balance.recipe.mixBags)this.tanks[index]={...tank,state:'DISSOLVENDO',stepS:0,lidOpen:false};this.revision++;}
  command(action:string,target?:string):void {
    const tankMatch=/^tank([1-3])\.(.+)$/.exec(action);if(tankMatch){const index=Number(tankMatch[1])-1,tank=this.tanks[index]!,verb=tankMatch[2];if(verb==='water'&&tank.state==='VAZIO')this.tanks[index]={...tank,state:'ENCHENDO_AGUA'};else if(verb==='heat'&&['AQUECENDO','AGUARDANDO_INSUMOS'].includes(tank.state))this.tanks[index]={...tank,state:'AQUECENDO'};else if(verb==='agitator')this.tanks[index]={...tank,agitatorRpm:tank.agitatorRpm?0:this.balance.agitatorRpm};else if(verb==='lid')this.tanks[index]={...tank,lidOpen:!tank.lidOpen};else if(verb==='sample'&&tank.state==='AGUARDANDO_QUALIDADE')this.tanks[index]={...tank,quality:Math.max(0,Math.min(100,tank.quality))};else if(verb==='approve'&&tank.state==='AGUARDANDO_QUALIDADE')this.tanks[index]={...tank,state:'PRONTO_PARA_TRANSFERIR'};else if(verb==='reject'&&['AGUARDANDO_QUALIDADE','PRONTO_PARA_TRANSFERIR'].includes(tank.state))this.tanks[index]={...tank,state:'SUJO',waterL:0,malteBags:0,mixBags:0,agitatorRpm:0,lidOpen:false,penalties:[...tank.penalties,'lote_reprovado']};else if(verb==='discard'&&!['VAZIO','TRANSFERINDO'].includes(tank.state))this.tanks[index]={...emptyTank((index+1) as 1|2|3),state:'SUJO'};else if(verb==='wash'&&['SUJO','VAZIO'].includes(tank.state))this.tanks[index]=emptyTank((index+1) as 1|2|3);else throw new Error('Comando incompatível com o estado do tanque.');this.revision++;return;}
    if(action==='dryer.preheat'){if(this.dryer.state!=='PARADO')throw new Error('O secador não está parado.');this.dryer={...this.dryer,state:'PRE_AQUECENDO',stepS:0};}
    else if(action==='dryer.feed'){const id=Number(target) as 1|2|3,tank=this.tanks[id-1];if(this.dryer.state!=='PRONTO'||!tank||tank.state!=='PRONTO_PARA_TRANSFERIR')throw new Error('Secador ou tanque fora da condição de transferência.');this.dryer={...this.dryer,state:'PRODUZINDO',sourceTank:id,stepS:0};}
    else if(action==='dryer.stop'||action==='dryer.cool')this.dryer={...this.dryer,state:'RESFRIANDO',sourceTank:null,flowLph:0,stepS:0};
    else if(action==='dryer.retry'){if(this.dryer.state!=='FALHA')throw new Error('O secador não está em falha.');this.dryer={...this.dryer,state:'PARADO',fault:'',sourceTank:null,flowLph:0,stepS:0};}
    else if(action==='dryer.clean'){if(!['PARADO','FALHA'].includes(this.dryer.state))throw new Error('Pare o secador antes da limpeza.');this.dryer={...this.dryer,state:'LIMPEZA',fault:'',stepS:0};}
    else if(action==='bag.empty'){if(this.bagging.emptyBags<1)throw new Error('Sem sacos vazios.');if(this.bagging.state!=='PARADO'&&this.bagging.state!=='AGUARDANDO_SACO')throw new Error('Ensacadeira ocupada.');this.bagging={...this.bagging,state:'SACO_POSICIONADO',emptyBags:this.bagging.emptyBags-1,weightKg:0};}
    else if(action==='bag.start'){if(this.bagging.state!=='SACO_POSICIONADO'||this.dryer.powderKg<this.balance.bagKg)throw new Error('Posicione o saco e confirme produto no silo.');this.bagging={...this.bagging,state:'ENCHENDO'};}
    else if(action==='bag.pause'){if(this.bagging.state!=='ENCHENDO')throw new Error('A ensacadeira não está enchendo.');this.bagging={...this.bagging,state:'PAUSADO'};}
    else if(action==='bag.resume'){if(this.bagging.state!=='PAUSADO')throw new Error('A ensacadeira não está pausada.');this.bagging={...this.bagging,state:'ENCHENDO'};}
    else if(action==='bag.sew'){if(this.bagging.state!=='AGUARDANDO_COSTURA')throw new Error('O saco ainda não está pronto para costura.');this.bagging={...this.bagging,state:'AGUARDANDO_EMPILHAR'};}
    else if(action==='bag.stack'){if(this.bagging.state!=='AGUARDANDO_EMPILHAR')throw new Error('Não há saco pronto na saída.');const count=this.bagging.palletBags+1;this.bagging={...this.bagging,state:'AGUARDANDO_SACO',weightKg:0,palletBags:count%18,producedBags:this.bagging.producedBags+1};if(count===18){const slot=this.slots.find(item=>item.marker==='Ponto_EB_PA_Ensaque');if(!slot||slot.quantity)throw new Error('Retire o palete completo da vaga de ensaque.');slot.quantity=18;}}
    else if(action==='alarm.ack'){const alarm=this.alarms.find(item=>item.id===target);if(!alarm)throw new Error('Alarme desconhecido.');alarm.acknowledged=true;}
    else if(action==='emergency'){this.emergency=true;this.alarms.push({id:`emergency-${Date.now()}`,severity:'critical',source:'painel',text:'Parada de emergência acionada',at:Date.now(),acknowledged:false});}else if(action==='emergency.reset')this.emergency=false;else throw new Error('Comando de fábrica desconhecido.');this.revision++;
  }
  reset():void {
    for(const slot of this.slots)Object.assign(slot,{quantity:0,batchId:'',reservedBy:'',reservedUntil:0});
    this.tanks=[emptyTank(1),emptyTank(2),emptyTank(3)];this.dryer=emptyDryer();this.bagging=emptyBagging();this.alarms=[];this.emergency=false;this.lastSimulation=null;this.balance=structuredClone(DEFAULT_FACTORY_BALANCE);this.revision++;
  }
  runAutomaticCycle():FactorySimulationReport {
    const totals=()=>Object.fromEntries(FACTORY_MATERIALS.map(material=>[material,this.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0)])) as Record<FactoryMaterial,number>;
    const report:FactorySimulationReport={startedAt:Date.now(),completedAt:0,steps:[],stockBefore:totals(),stockAfter:{MALTE:0,MIX:0,PRODUTO:0},producedBags:0,faults:[]},previousOperators=this.activeOperators,previousScale=this.balance.timeScale;
    const consume=(material:'MALTE'|'MIX',count:number)=>{for(let i=0;i<count;i++){const slot=this.slots.find(item=>item.material===material&&item.quantity>0);if(!slot)throw new Error(`Estoque insuficiente de ${material} para o ciclo automático.`);this.pourBag(1,this.takeBag(slot.marker));}};
    try{this.setOperators(Math.max(1,previousOperators));this.balance.timeScale=60;this.command('tank1.water');this.tick(1);this.tick(3);this.command('tank1.agitator');this.command('tank1.lid');consume('MALTE',this.balance.recipe.malteBags);consume('MIX',this.balance.recipe.mixBags);report.steps.push('água','aquecimento','dosagem');this.tick(3);this.tick(1);this.command('tank1.approve');report.steps.push('dissolução','homogeneização','qualidade');this.command('dryer.preheat');this.tick(4);this.command('dryer.feed','1');this.tick(70);report.steps.push('pré-aquecimento','secagem');const bags=Math.floor(this.dryer.powderKg/this.balance.bagKg);this.bagging.emptyBags+=bags;for(let i=0;i<bags&&i<18;i++){this.command('bag.empty');this.command('bag.start');this.tick(1);this.command('bag.sew');this.command('bag.stack');}report.producedBags=Math.min(bags,18);report.steps.push('ensaque','paletização');}
    catch(error){report.faults.push(error instanceof Error?error.message:String(error));throw error;}finally{this.balance.timeScale=previousScale;this.setOperators(previousOperators);report.completedAt=Date.now();report.stockAfter=totals();this.lastSimulation=report;this.revision++;}
    return report;
  }
  /** Restores persisted data in a safe paused state; active machinery never resumes before an operator clocks in. */
  restore(value:unknown,persistedSlots:readonly Partial<FactorySlot>[]=[]):void {
    const state=value&&typeof value==='object'?value as Partial<FactorySnapshot>:{};
    if(Array.isArray(state.tanks)&&state.tanks.length===3)this.tanks=state.tanks.map((tank,index)=>({...emptyTank((index+1) as 1|2|3),...tank,state:tank.state==='VAZIO'||tank.state==='SUJO'?tank.state:'PAUSADO'}));
    if(state.dryer&&typeof state.dryer==='object')this.dryer={...emptyDryer(),...state.dryer,state:['PARADO','LIMPEZA'].includes(state.dryer.state)?state.dryer.state:'PAUSADO'};
    if(state.bagging&&typeof state.bagging==='object')this.bagging={...emptyBagging(),...state.bagging,state:state.bagging.state==='PARADO'?state.bagging.state:'PAUSADO'};
    if(state.balance&&typeof state.balance==='object')this.balance={...structuredClone(DEFAULT_FACTORY_BALANCE),...state.balance,recipe:{...DEFAULT_FACTORY_BALANCE.recipe,...state.balance.recipe}};
    this.emergency=!!state.emergency;this.alarms=Array.isArray(state.alarms)?state.alarms.slice(-200):[];
    for(const saved of persistedSlots){const slot=this.slots.find(item=>item.marker===saved.marker);if(slot&&saved.material===slot.material&&Number.isInteger(saved.quantity)&&saved.quantity!>=0&&saved.quantity!<=slot.capacity)Object.assign(slot,{quantity:saved.quantity,batchId:saved.batchId??'',reservedBy:'',reservedUntil:0});}
    this.revision=Math.max(this.revision,Number(state.revision)||0)+1;
  }
  snapshot():FactorySnapshot {return {revision:this.revision,started:this.tanks.some(t=>t.state!=='VAZIO')||this.dryer.state!=='PARADO',emergency:this.emergency,balance:structuredClone(this.balance),slots:this.slots.map(slot=>({...slot})),tanks:this.tanks.map(tank=>({...tank,penalties:[...tank.penalties]})),dryer:{...this.dryer},bagging:{...this.bagging},alarms:this.alarms.map(alarm=>({...alarm})),markerCount:Object.keys(this.markers).length,activeOperators:this.activeOperators,pausedWithoutOperator:!this.activeOperators,lastSimulation:this.lastSimulation?structuredClone(this.lastSimulation):null};}
}
