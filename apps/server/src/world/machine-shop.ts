import {randomUUID} from 'node:crypto';
import {RIBEIRO_ASSEMBLY,RIBEIRO_CUTTERS,RIBEIRO_DRILLS,RIBEIRO_MACHINING,RIBEIRO_OP_LIMITS,RIBEIRO_RECIPES,RIBEIRO_STAGE_MS,WEAPONS,cleanCustomer,emptyRibeiroState,isWeaponId,ribeiroOpLabel,ribeiroOpMaterials,type RibeiroOpItem,type RibeiroAdminView,type RibeiroCarryStage,type RibeiroGameKind,type RibeiroMachineJob,type RibeiroMaterial,type RibeiroMemberRole,type RibeiroOrder,type RibeiroSpotId,type RibeiroState,type WeaponId} from '@bar/shared';

export interface RibeiroCarry {orderId:string;weapon:WeaponId;stage:RibeiroCarryStage;sourceStationId?:RibeiroSpotId}
export interface ShopAction {ok:boolean;message:string;carry?:RibeiroCarry|null}
const stationStage=(id:string)=>RIBEIRO_CUTTERS.some(s=>s.id===id)?'cut':RIBEIRO_MACHINING.some(s=>s.id===id)?'machining':RIBEIRO_DRILLS.some(s=>s.id===id)?'drill':RIBEIRO_ASSEMBLY.some(s=>s.id===id)?'assembly':null;

/** Authoritative no-prop workflow for Ribeiro. The room persists snapshot() through /internal/machine-shop. */
export class MachineShop {
  state:RibeiroState=emptyRibeiroState();
  restore(raw:unknown):void {
    const value=raw&&typeof raw==='object'?raw as Partial<RibeiroState>:{};const fresh=emptyRibeiroState();
    this.state={...fresh,...value,materials:{...fresh.materials,...value.materials},stock:{...value.stock},orders:Array.isArray(value.orders)?value.orders.filter(order=>order&&isWeaponId(order.weapon)):[],jobs:Array.isArray(value.jobs)?value.jobs:[],members:Array.isArray(value.members)?value.members:[],payroll:Array.isArray(value.payroll)?value.payroll.slice(-100):[]};
    // A process interrupted by a restart becomes ready at the same station; no workpiece is lost.
    for(const job of this.state.jobs){const order=this.order(job.orderId);if(!order)continue;order.status=job.stage==='cut'?'cut-ready':job.stage==='machining'?'machined-ready':job.stage==='drill'?'drilled-ready':'assembled-ready';order.stationId=job.stationId;}
    // Carries live on a connection, so a room restart must put every in-transit part back in the world.
    for(const order of this.state.orders){
      if(order.status==='to-cut'){order.status='queued';order.stationId='';}
      else if(order.status==='to-machining'){order.status=order.stationId.startsWith('cut-')?'cut-ready':'queued';}
      else if(order.status==='to-drill'){order.status=order.stationId.startsWith('machine-')?'machined-ready':'queued';}
      else if(order.status==='to-assembly'){order.status=order.stationId.startsWith('drill-')?'drilled-ready':'queued';}
      else if(order.status==='to-shelf')order.status='assembled-ready';
      if(order.status==='queued')order.stationId='';
    }
    // Orders opened before OPs were numbered: each old lot (same weapon, person and moment) becomes one numbered OP without a customer.
    {const lots=new Map<string,{opId:string;opNumber:number}>();this.state.opCounter=Math.max(this.state.opCounter??0,...this.state.orders.map(order=>order.opNumber??0));
      for(const order of [...this.state.orders].sort((a,b)=>a.createdAt-b.createdAt)){if(order.opId)continue;const key=`${order.weapon}|${order.operatorId}|${order.createdAt}`;let lot=lots.get(key);if(!lot){lot={opId:randomUUID(),opNumber:++this.state.opCounter};lots.set(key,lot);}order.opId=lot.opId;order.opNumber=lot.opNumber;order.customer??='';}}
    this.state.jobs=[];this.bump();
  }
  snapshot():RibeiroState {return structuredClone(this.state);}
  private bump():void {this.state.revision++;}
  private order(id:string):RibeiroOrder|undefined {return this.state.orders.find(order=>order.id===id);}
  roleOf(userId:string):RibeiroMemberRole|null {return this.state.members.find(member=>member.userId===userId)?.role??null;}
  canWork(userId:string,isAdmin=false):boolean {return isAdmin||!this.state.members.length||!!this.roleOf(userId);}
  canManage(userId:string,isAdmin=false):boolean {const role=this.roleOf(userId);return isAdmin||role==='owner'||role==='manager';}
  bootstrap(userId:string,name:string,isAdmin:boolean):ShopAction {if(this.state.members.length)return {ok:false,message:'A equipe da Ribeiro já possui uma gestão.'};if(!isAdmin)return {ok:false,message:'A primeira diretoria deve ser criada por um administrador.'};this.state.members.push({userId,name,role:'owner',hiredAt:Date.now(),earned:0});this.bump();return {ok:true,message:`${name} agora é dono da Ribeiro.`};}
  hire(actorId:string,userId:string,name:string,isAdmin=false):ShopAction {if(!this.canManage(actorId,isAdmin))return {ok:false,message:'Apenas donos e gerentes podem contratar.'};if(this.roleOf(userId))return {ok:false,message:'Esse jogador já faz parte da equipe.'};this.state.members.push({userId,name,role:'employee',hiredAt:Date.now(),earned:0});this.bump();return {ok:true,message:`${name} foi contratado(a).`};}
  dismiss(actorId:string,userId:string,isAdmin=false):ShopAction {const actor=this.roleOf(actorId),target=this.state.members.find(member=>member.userId===userId);if(!target)return {ok:false,message:'Funcionário não encontrado.'};if(!this.canManage(actorId,isAdmin))return {ok:false,message:'Apenas donos e gerentes podem demitir.'};if(target.role==='owner'&&!isAdmin)return {ok:false,message:'Um dono só pode ser removido pela administração.'};if(target.role==='manager'&&actor!=='owner'&&!isAdmin)return {ok:false,message:'Só um dono pode demitir um gerente.'};this.state.members=this.state.members.filter(member=>member.userId!==userId);this.bump();return {ok:true,message:`${target.name} foi desligado(a) da Ribeiro.`};}
  setManager(actorId:string,userId:string,manager:boolean,isAdmin=false):ShopAction {const actor=this.roleOf(actorId),target=this.state.members.find(member=>member.userId===userId);if(!target)return {ok:false,message:'Funcionário não encontrado.'};if(actor!=='owner'&&!isAdmin)return {ok:false,message:'Só um dono pode alterar a gerência.'};if(target.role==='owner')return {ok:false,message:'O cargo de dono não pode ser alterado aqui.'};target.role=manager?'manager':'employee';this.bump();return {ok:true,message:manager?`${target.name} agora é gerente.`:`${target.name} voltou ao cargo de funcionário.`};}
  recordPay(userId:string,amount:number,label:string,orderId:string):void {if(amount<=0)return;const member=this.state.members.find(item=>item.userId===userId);if(member)member.earned+=amount;this.state.payroll.push({id:randomUUID(),userId,name:member?.name??userId.slice(0,8),amount,label,orderId,at:Date.now()});this.state.payroll=this.state.payroll.slice(-100);this.bump();}
  addMaterial(material:RibeiroMaterial,quantity:number):void {this.state.materials[material]+=Math.max(0,Math.floor(quantity));this.bump();}
  takeStock(weapon:WeaponId,amount=1):boolean {const requested=Math.max(1,Math.floor(amount)),quantity=this.state.stock[weapon]??0;if(quantity<requested)return false;this.state.stock[weapon]=quantity-requested;this.bump();return true;}
  returnStock(weapon:WeaponId,amount=1):void {this.state.stock[weapon]=(this.state.stock[weapon]??0)+Math.max(1,Math.floor(amount));this.bump();}
  /** One weapon, one line: what a single-line OP used to be. */
  start(weapon:WeaponId,operatorId:string,operatorName:string,quantity=1,customer='Balcão'):ShopAction {return this.open([{weapon,quantity}],customer,operatorId,operatorName);}
  /**
   * Opens an OP for a customer: one or more weapons with their quantities (10 pistols and 20 revolvers). The raw material of every line
   * is taken together or not at all; each unit then moves through the line as its own order, all sharing the OP number and the customer.
   */
  open(rawItems:readonly RibeiroOpItem[],rawCustomer:string,operatorId:string,operatorName:string):ShopAction {
    const customer=cleanCustomer(rawCustomer);
    if(customer.length<RIBEIRO_OP_LIMITS.customerMin)return {ok:false,message:'Informe o nome do cliente da OP.'};
    const merged=new Map<WeaponId,number>();for(const item of rawItems){if(!isWeaponId(item?.weapon)||!RIBEIRO_RECIPES.some(recipe=>recipe.weapon===item.weapon))return {ok:false,message:'Essa arma não possui receita de fabricação.'};if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>RIBEIRO_OP_LIMITS.perLine)return {ok:false,message:`A quantidade de cada arma deve ficar entre 1 e ${RIBEIRO_OP_LIMITS.perLine}.`};merged.set(item.weapon,(merged.get(item.weapon)??0)+item.quantity);}
    const items=[...merged].map(([weapon,quantity])=>({weapon,quantity}));
    if(!items.length)return {ok:false,message:'Escolha ao menos uma arma para a OP.'};
    if(items.length>RIBEIRO_OP_LIMITS.lines||items.some(item=>item.quantity>RIBEIRO_OP_LIMITS.perLine))return {ok:false,message:`Cada arma pode ter no máximo ${RIBEIRO_OP_LIMITS.perLine} unidades por OP.`};
    const total=items.reduce((sum,item)=>sum+item.quantity,0);if(total>RIBEIRO_OP_LIMITS.total)return {ok:false,message:`Uma OP leva no máximo ${RIBEIRO_OP_LIMITS.total} armas no total.`};
    const need=ribeiroOpMaterials(items),lacking=(Object.keys(need) as RibeiroMaterial[]).find(material=>this.state.materials[material]<need[material]);
    if(lacking)return {ok:false,message:`Falta ${lacking}: a OP precisa de ${need[lacking]} unidades e há ${this.state.materials[lacking]} em estoque.`};
    for(const material of Object.keys(need) as RibeiroMaterial[])this.state.materials[material]-=need[material];
    const now=Date.now(),opId=randomUUID(),opNumber=(this.state.opCounter=(this.state.opCounter??0)+1);
    for(const item of items)for(let index=0;index<item.quantity;index++)this.state.orders.push({id:randomUUID(),weapon:item.weapon,status:'queued',operatorId,operatorName,stationId:'',createdAt:now,updatedAt:now,opId,opNumber,customer});
    this.bump();
    const text=items.map(item=>`${item.quantity}× ${WEAPONS[item.weapon].name}`).join(' e ');
    return {ok:true,message:`${ribeiroOpLabel({id:opId,opId,opNumber})} aberta para ${customer}: ${text}. Retire a matéria-prima na preparação industrial.`};
  }
  /** Cancels what has not been taken from preparation yet in a whole OP; units already in the line keep going. The material of the cancelled ones returns. */
  cancelOp(opId:string):ShopAction {
    const queued=this.state.orders.filter(order=>order.opId===opId&&order.status==='queued');if(!queued.length)return {ok:false,message:this.state.orders.some(order=>order.opId===opId)?'Nenhuma unidade desta OP está na fila: as já retiradas seguem na produção.':'OP não encontrada.'};
    const now=Date.now();for(const order of queued){const recipe=RIBEIRO_RECIPES.find(item=>item.weapon===order.weapon)!;for(const [material,quantity] of Object.entries(recipe.materials))this.state.materials[material as RibeiroMaterial]+=quantity;order.status='cancelled';order.updatedAt=now;}
    this.bump();const rest=this.state.orders.filter(order=>order.opId===opId&&order.status!=='cancelled').length;
    return {ok:true,message:`${queued.length} unidade(s) cancelada(s); os insumos voltaram ao estoque.${rest?` ${rest} já estão em produção e seguem.`:''}`};
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
  /** `orderId` is the OP the employee chose at the preparation point (the oldest queued one when they did not choose). */
  interact(userId:string,userName:string,stationId:RibeiroSpotId,carry:RibeiroCarry|null,orderId?:string):ShopAction {
    if(stationId==='preparation'){
      if(carry)return {ok:false,message:'Você já está transportando uma peça.'};const order=orderId?this.state.orders.find(item=>item.id===orderId&&item.status==='queued'):this.state.orders.find(item=>item.status==='queued');if(!order)return {ok:false,message:orderId?'Essa OP já foi retirada por outro funcionário ou cancelada. Escolha outra.':'Não há OP aguardando preparação.'};
      order.status='to-cut';order.operatorId=userId;order.operatorName=userName;order.updatedAt=Date.now();this.bump();return {ok:true,message:`Matéria-prima de ${WEAPONS[order.weapon].name} retirada. Leve-a a uma máquina de corte.`,carry:{orderId:order.id,weapon:order.weapon,stage:'raw'}};
    }
    if(stationId==='shelf'){
      if(carry?.stage!=='assembled')return {ok:false,message:carry?'Esta peça ainda não está montada. Leve-a até a montagem.':'Traga uma arma montada para guardar na prateleira.'};
      const order=this.order(carry.orderId);if(!order)return {ok:false,message:'A OP desta arma não existe mais.'};
      order.status='completed';order.stationId='';order.updatedAt=Date.now();this.state.stock[order.weapon]=(this.state.stock[order.weapon]??0)+1;this.state.completed++;this.bump();
      return {ok:true,message:`${WEAPONS[order.weapon].name} guardada na prateleira e registrada no estoque.`,carry:null};
    }
    const stage=stationStage(stationId);if(!stage)return {ok:false,message:'Este ponto não processa peças.'};
    const readyStatus=stage==='cut'?'cut-ready':stage==='machining'?'machined-ready':stage==='drill'?'drilled-ready':'assembled-ready';
    if(readyStatus&&!carry){const ready=this.state.orders.find(order=>order.status===readyStatus&&order.stationId===stationId);if(!ready)return {ok:false,message:'Não há peça pronta nesta máquina.'};
      ready.status=stage==='cut'?'to-machining':stage==='machining'?'to-drill':stage==='drill'?'to-assembly':'to-shelf';/* Keep the source station for durable recovery. */ready.updatedAt=Date.now();this.bump();
      const next:RibeiroCarryStage=stage==='cut'?'cut':stage==='machining'?'machined':stage==='drill'?'finished':'assembled';return {ok:true,message:stage==='drill'?'Peça furada, inspecionada e acabada. Leve-a à montagem.':stage==='assembly'?'Arma montada retirada. Leve-a até a prateleira do estoque.':`Peça retirada. Leve-a à próxima etapa.`,carry:{orderId:ready.id,weapon:ready.weapon,stage:next,sourceStationId:stationId}};}
    if(!carry)return {ok:false,message:'Traga a peça correspondente para esta máquina.'};
    const expected=stage==='cut'?'raw':stage==='machining'?'cut':stage==='drill'?'machined':'finished';if(carry.stage!==expected)return {ok:false,message:'Esta peça ainda não passou pelas etapas anteriores.'};
    const order=this.order(carry.orderId);if(!order)return {ok:false,message:'A OP desta peça não existe mais.'};if(this.state.jobs.some(job=>job.stationId===stationId))return {ok:false,message:'Esta máquina está ocupada.'};
    const now=Date.now(),duration=RIBEIRO_STAGE_MS[stage];this.state.jobs.push({stationId,orderId:order.id,stage,operatorId:userId,startedAt:now,endsAt:now+duration});order.status=stage==='cut'?'cutting':stage==='machining'?'machining':stage==='drill'?'drilling':'assembling';order.stationId=stationId;order.operatorId=userId;order.operatorName=userName;order.updatedAt=now;this.bump();
    return {ok:true,message:`${stage==='assembly'?'Montagem':'Processamento'} iniciado. Aguarde ${duration/1000} segundos.`,carry:null};
  }
  tick(now=Date.now()):Array<{operatorId:string;orderId:string;stage:RibeiroMachineJob['stage'];message:string}> {
    const done=this.state.jobs.filter(job=>job.endsAt<=now),notices:Array<{operatorId:string;orderId:string;stage:RibeiroMachineJob['stage'];message:string}>=[];if(!done.length)return notices;
    for(const job of done){const order=this.order(job.orderId);if(!order)continue;order.updatedAt=now;
      if(job.stage==='assembly'){order.status='assembled-ready';notices.push({operatorId:job.operatorId,orderId:order.id,stage:job.stage,message:`${WEAPONS[order.weapon].name} montada. Retire-a da bancada e leve-a à prateleira do estoque.`});}
      else{order.status=job.stage==='cut'?'cut-ready':job.stage==='machining'?'machined-ready':'drilled-ready';notices.push({operatorId:job.operatorId,orderId:order.id,stage:job.stage,message:`Etapa concluída em ${job.stationId}. Retire a peça na máquina.`});}}
    this.state.jobs=this.state.jobs.filter(job=>job.endsAt>now);this.bump();return notices;
  }
  /* ── The administration (Administração › Ribeiro): it acts from anywhere, with no terminal and no role. ── */
  /** Sets a person's role, hiring them when they are not on the team yet, or takes them off it (`null`). The team never keeps managers and workers without an owner. */
  adminSetRole(userId:string,name:string,role:RibeiroMemberRole|null):ShopAction {
    const target=this.state.members.find(member=>member.userId===userId),owners=this.state.members.filter(member=>member.role==='owner');
    const leavingOwner=target?.role==='owner'&&role!=='owner'&&owners.length===1&&this.state.members.length>1;
    if(leavingOwner)return {ok:false,message:'A Ribeiro precisa de ao menos um dono enquanto houver equipe: promova outro dono antes.'};
    if(role===null){
      if(!target)return {ok:false,message:'Essa pessoa não faz parte da equipe.'};
      this.state.members=this.state.members.filter(member=>member.userId!==userId);this.bump();return {ok:true,message:`${target.name} saiu da equipe da Ribeiro.`};
    }
    const label={owner:'dono',manager:'gerente',employee:'funcionário'}[role];
    if(!target){this.state.members.push({userId,name,role,hiredAt:Date.now(),earned:0});this.bump();return {ok:true,message:`${name} entrou na equipe como ${label}.`};}
    if(target.role===role)return {ok:false,message:`${target.name} já é ${label}.`};
    target.role=role;this.bump();return {ok:true,message:`${target.name} agora é ${label}.`};
  }
  /** Adds (or takes) raw material or finished weapons; never below zero. */
  adminAdjustMaterial(material:RibeiroMaterial,delta:number):ShopAction {
    const next=this.state.materials[material]+Math.trunc(delta);if(next<0)return {ok:false,message:`O estoque de ${material} só tem ${this.state.materials[material]}.`};
    this.state.materials[material]=next;this.bump();return {ok:true,message:`Estoque de ${material}: ${next}.`};
  }
  adminAdjustStock(weapon:WeaponId,delta:number):ShopAction {
    const current=this.state.stock[weapon]??0,next=current+Math.trunc(delta);if(next<0)return {ok:false,message:`O estoque só tem ${current} unidade(s) de ${WEAPONS[weapon].name}.`};
    this.state.stock[weapon]=next;this.bump();return {ok:true,message:`${WEAPONS[weapon].name}: ${next} em estoque.`};
  }
  /** Drops an order that is stuck anywhere in the line: its machine is freed and the raw material is not given back (it was used). The room clears whoever carries the part. */
  abort(id:string):ShopAction {
    const order=this.order(id);if(!order)return {ok:false,message:'Ordem não encontrada.'};
    if(order.status==='completed'||order.status==='cancelled')return {ok:false,message:'Essa ordem já terminou.'};
    this.state.jobs=this.state.jobs.filter(job=>job.orderId!==id);order.status='cancelled';order.stationId='';order.updatedAt=Date.now();this.bump();
    return {ok:true,message:'OP descartada: a máquina foi liberada e a peça saiu da linha.'};
  }
  /** Every number the Ribeiro console draws, from the live state. `online` says who is in the room right now. */
  adminView(extra:{online:(userId:string)=>boolean;purchaseOrders:RibeiroAdminView['purchaseOrders'];carriers:RibeiroAdminView['carriers']},now=Date.now()):RibeiroAdminView {
    const {orders,payroll}=this.state,dayOf=(at:number)=>new Date(at-3*3_600_000).toISOString().slice(0,10);
    const days=Array.from({length:14},(_,i)=>dayOf(now-(13-i)*86_400_000)),daily=new Map(days.map(day=>[day,{day,opened:0,completed:0,paid:0}]));
    const statusCount:RibeiroAdminView['statusCount']={},producedByWeapon:RibeiroAdminView['producedByWeapon']={};
    for(const order of orders){
      statusCount[order.status]=(statusCount[order.status]??0)+1;
      const openedDay=daily.get(dayOf(order.createdAt));if(openedDay)openedDay.opened++;
      if(order.status==='completed'){producedByWeapon[order.weapon]=(producedByWeapon[order.weapon]??0)+1;const entry=daily.get(dayOf(order.updatedAt));if(entry)entry.completed++;}
    }
    const paidByStage:RibeiroAdminView['paidByStage']={};let paidTotal=0;
    for(const entry of payroll){
      paidTotal+=entry.amount;const day=daily.get(dayOf(entry.at));if(day)day.paid+=entry.amount;
      const stage=/^Etapa (\w+)/.exec(entry.label)?.[1] as keyof RibeiroAdminView['paidByStage']|undefined;if(stage&&stage in RIBEIRO_STAGE_MS)paidByStage[stage]=(paidByStage[stage]??0)+entry.amount;
    }
    const recentDone=orders.filter(order=>order.status==='completed').sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,50);
    return {
      revision:this.state.revision,materials:{...this.state.materials},stock:{...this.state.stock},completed:this.state.completed,jobs:structuredClone(this.state.jobs),
      members:this.state.members.map(member=>({...member,online:extra.online(member.userId)})),
      orders:[...orders].sort((a,b)=>b.createdAt-a.createdAt).slice(0,150),totalOrders:orders.length,statusCount,daily:[...daily.values()],producedByWeapon,
      averageMinutes:recentDone.length?recentDone.reduce((sum,order)=>sum+(order.updatedAt-order.createdAt),0)/recentDone.length/60_000:null,
      payroll:[...payroll].reverse(),paidByStage,paidTotal,purchaseOrders:extra.purchaseOrders,carriers:extra.carriers,
    };
  }
  release(carry:RibeiroCarry|null):void {if(!carry)return;const order=this.order(carry.orderId);if(!order||['completed','cancelled'].includes(order.status))return;
    /* Put the part back where it was picked up. Old snapshots without a source safely restart at preparation. */
    if(carry.stage==='raw'||!carry.sourceStationId){order.status='queued';order.stationId='';}
    else {order.status=carry.stage==='cut'?'cut-ready':carry.stage==='machined'?'machined-ready':carry.stage==='assembled'?'assembled-ready':'drilled-ready';order.stationId=carry.sourceStationId;}
    order.updatedAt=Date.now();this.bump();}
}
