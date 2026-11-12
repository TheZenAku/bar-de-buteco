import {randomUUID} from 'node:crypto';
import {RIBEIRO_ASSEMBLY,RIBEIRO_CUTTERS,RIBEIRO_DRILLS,RIBEIRO_MACHINING,RIBEIRO_RECIPES,RIBEIRO_STAGE_MS,WEAPONS,emptyRibeiroState,isWeaponId,type RibeiroCarryStage,type RibeiroGameKind,type RibeiroMaterial,type RibeiroOrder,type RibeiroSpotId,type RibeiroState,type WeaponId} from '@bar/shared';

export interface RibeiroCarry {orderId:string;weapon:WeaponId;stage:RibeiroCarryStage}
export interface ShopAction {ok:boolean;message:string;carry?:RibeiroCarry|null}
const stationStage=(id:string)=>RIBEIRO_CUTTERS.some(s=>s.id===id)?'cut':RIBEIRO_MACHINING.some(s=>s.id===id)?'machining':RIBEIRO_DRILLS.some(s=>s.id===id)?'drill':RIBEIRO_ASSEMBLY.some(s=>s.id===id)?'assembly':null;

/** Authoritative no-prop workflow for Ribeiro. The room persists snapshot() through /internal/machine-shop. */
export class MachineShop {
  state:RibeiroState=emptyRibeiroState();
  restore(raw:unknown):void {
    const value=raw&&typeof raw==='object'?raw as Partial<RibeiroState>:{};const fresh=emptyRibeiroState();
    this.state={...fresh,...value,materials:{...fresh.materials,...value.materials},stock:{...value.stock},orders:Array.isArray(value.orders)?value.orders.filter(order=>order&&isWeaponId(order.weapon)):[],jobs:Array.isArray(value.jobs)?value.jobs:[]};
    // A process interrupted by a restart becomes ready at the same station; no workpiece is lost.
    for(const job of this.state.jobs){const order=this.order(job.orderId);if(!order)continue;if(job.stage==='assembly'){order.status='completed';order.stationId='';this.state.stock[order.weapon]=(this.state.stock[order.weapon]??0)+1;this.state.completed++;}else{order.status=job.stage==='cut'?'cut-ready':job.stage==='machining'?'machined-ready':'drilled-ready';order.stationId=job.stationId;}}
    this.state.jobs=[];this.bump();
  }
  snapshot():RibeiroState {return structuredClone(this.state);}
  private bump():void {this.state.revision++;}
  private order(id:string):RibeiroOrder|undefined {return this.state.orders.find(order=>order.id===id);}
  addMaterial(material:RibeiroMaterial,quantity:number):void {this.state.materials[material]+=Math.max(0,Math.floor(quantity));this.bump();}
  takeStock(weapon:WeaponId):boolean {const quantity=this.state.stock[weapon]??0;if(quantity<1)return false;this.state.stock[weapon]=quantity-1;this.bump();return true;}
  returnStock(weapon:WeaponId):void {this.state.stock[weapon]=(this.state.stock[weapon]??0)+1;this.bump();}
  start(weapon:WeaponId,operatorId:string,operatorName:string):ShopAction {
    const recipe=RIBEIRO_RECIPES.find(item=>item.weapon===weapon);if(!recipe)return {ok:false,message:'Essa arma não possui receita de fabricação.'};
    const lacking=Object.entries(recipe.materials).find(([material,quantity])=>this.state.materials[material as RibeiroMaterial]<quantity);
    if(lacking)return {ok:false,message:`Falta ${lacking[0]} para abrir esta ordem.`};
    for(const [material,quantity] of Object.entries(recipe.materials))this.state.materials[material as RibeiroMaterial]-=quantity;
    const now=Date.now();this.state.orders.push({id:randomUUID(),weapon,status:'queued',operatorId,operatorName,stationId:'',createdAt:now,updatedAt:now});this.bump();
    return {ok:true,message:`OP de ${WEAPONS[weapon].name} aberta. Retire a matéria-prima na preparação industrial.`};
  }
  cancel(id:string):ShopAction {
    const order=this.order(id);if(!order)return {ok:false,message:'Ordem não encontrada.'};if(order.status!=='queued')return {ok:false,message:'Só uma OP ainda não retirada pode ser cancelada.'};
    const recipe=RIBEIRO_RECIPES.find(item=>item.weapon===order.weapon)!;for(const [material,quantity] of Object.entries(recipe.materials))this.state.materials[material as RibeiroMaterial]+=quantity;
    order.status='cancelled';order.updatedAt=Date.now();this.bump();return {ok:true,message:'OP cancelada; os insumos voltaram ao estoque.'};
  }
  challengeFor(stationId:RibeiroSpotId,carry:RibeiroCarry|null):RibeiroGameKind|null {
    const stage=stationStage(stationId);if(stage==='cut'&&carry?.stage==='raw')return 'cut';if(stage==='machining'&&carry?.stage==='cut')return 'machining';if(stage==='drill'&&carry?.stage==='machined')return 'drill';
    if(stage==='drill'&&!carry&&this.state.orders.some(order=>order.status==='drilled-ready'&&order.stationId===stationId))return 'finish';return null;
  }
  interact(userId:string,userName:string,stationId:RibeiroSpotId,carry:RibeiroCarry|null):ShopAction {
    if(stationId==='preparation'){
      if(carry)return {ok:false,message:'Você já está transportando uma peça.'};const order=this.state.orders.find(item=>item.status==='queued');if(!order)return {ok:false,message:'Não há OP aguardando preparação.'};
      order.status='to-cut';order.operatorId=userId;order.operatorName=userName;order.updatedAt=Date.now();this.bump();return {ok:true,message:`Matéria-prima de ${WEAPONS[order.weapon].name} retirada. Leve-a a uma máquina de corte.`,carry:{orderId:order.id,weapon:order.weapon,stage:'raw'}};
    }
    const stage=stationStage(stationId);if(!stage)return {ok:false,message:'Este ponto não processa peças.'};
    const readyStatus=stage==='cut'?'cut-ready':stage==='machining'?'machined-ready':stage==='drill'?'drilled-ready':null;
    if(readyStatus&&!carry){const ready=this.state.orders.find(order=>order.status===readyStatus&&order.stationId===stationId);if(!ready)return {ok:false,message:'Não há peça pronta nesta máquina.'};
      ready.status=stage==='cut'?'to-machining':stage==='machining'?'to-drill':'to-assembly';ready.stationId='';ready.updatedAt=Date.now();this.bump();
      const next:RibeiroCarryStage=stage==='cut'?'cut':stage==='machining'?'machined':'finished';return {ok:true,message:stage==='drill'?'Peça furada, inspecionada e acabada. Leve-a à montagem.':`Peça retirada. Leve-a à próxima etapa.`,carry:{orderId:ready.id,weapon:ready.weapon,stage:next}};}
    if(!carry)return {ok:false,message:'Traga a peça correspondente para esta máquina.'};
    const expected=stage==='cut'?'raw':stage==='machining'?'cut':stage==='drill'?'machined':'finished';if(carry.stage!==expected)return {ok:false,message:'Esta peça ainda não passou pelas etapas anteriores.'};
    const order=this.order(carry.orderId);if(!order)return {ok:false,message:'A OP desta peça não existe mais.'};if(this.state.jobs.some(job=>job.stationId===stationId))return {ok:false,message:'Esta máquina está ocupada.'};
    const now=Date.now(),duration=RIBEIRO_STAGE_MS[stage];this.state.jobs.push({stationId,orderId:order.id,stage,operatorId:userId,startedAt:now,endsAt:now+duration});order.status=stage==='cut'?'cutting':stage==='machining'?'machining':stage==='drill'?'drilling':'assembling';order.stationId=stationId;order.operatorId=userId;order.operatorName=userName;order.updatedAt=now;this.bump();
    return {ok:true,message:`${stage==='assembly'?'Montagem':'Processamento'} iniciado. Aguarde ${duration/1000} segundos.`,carry:null};
  }
  tick(now=Date.now()):Array<{operatorId:string;message:string}> {
    const done=this.state.jobs.filter(job=>job.endsAt<=now),notices:Array<{operatorId:string;message:string}>=[];if(!done.length)return notices;
    for(const job of done){const order=this.order(job.orderId);if(!order)continue;order.updatedAt=now;
      if(job.stage==='assembly'){order.status='completed';order.stationId='';this.state.stock[order.weapon]=(this.state.stock[order.weapon]??0)+1;this.state.completed++;notices.push({operatorId:job.operatorId,message:`${WEAPONS[order.weapon].name} montada e registrada no estoque da Ribeiro.`});}
      else{order.status=job.stage==='cut'?'cut-ready':job.stage==='machining'?'machined-ready':'drilled-ready';notices.push({operatorId:job.operatorId,message:`Etapa concluída em ${job.stationId}. Retire a peça na máquina.`});}}
    this.state.jobs=this.state.jobs.filter(job=>job.endsAt>now);this.bump();return notices;
  }
  release(carry:RibeiroCarry|null):void {if(!carry)return;const order=this.order(carry.orderId);if(!order)return;/* With no prop to leave on the floor, a disconnected carrier returns the reserved workpiece to preparation. */order.status='queued';order.stationId='';order.updatedAt=Date.now();this.bump();}
}
