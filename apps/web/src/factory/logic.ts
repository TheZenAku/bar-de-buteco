import {CITY_MARKERS} from '@bar/shared';
import {CLEAN_TASKS,DIRT_PENDING,FACTORY_REACH,cleanTaskOf,pendingCleaning,type CleanTaskId} from '@bar/shared/factory';
import {tankVolumeL} from '@bar/shared/factory';
import type {FactoryView,TankView} from './types';

/** Litres in a tank as the panel and the liquid on screen read it: the water plus the dissolved solids' share. */
export const volumeOf=(tank:TankView,view:Pick<FactoryView,'balance'>):number=>tankVolumeL(tank,{...view.balance,recipe:{...view.balance.recipe}} as never);

export const STATE_LABEL:Record<string,string>={
  VAZIO:'Vazio',ENCHENDO_AGUA:'Enchendo de água',AQUECENDO:'Aquecendo',AGUARDANDO_INSUMOS:'Aguardando insumos',DISSOLVENDO:'Dissolvendo',HOMOGENEIZANDO:'Homogeneizando',
  AGUARDANDO_QUALIDADE:'Aguardando qualidade',PRONTO_PARA_TRANSFERIR:'Aprovado',TRANSFERINDO:'Transferindo',SUJO:'Sujo',PAUSADO:'Pausado',
  PARADO:'Parado',PRE_AQUECENDO:'Pré-aquecendo',PRONTO:'Pronto',PRODUZINDO:'Produzindo',RESFRIANDO:'Resfriando',FALHA:'Falha',LIMPEZA:'Limpeza',
  AGUARDANDO_SACO:'Aguardando saco',SACO_POSICIONADO:'Saco posicionado',ENCHENDO:'Enchendo',AGUARDANDO_COSTURA:'Aguardando costura',AGUARDANDO_EMPILHAR:'Aguardando empilhar',
};
export const label=(state:string)=>STATE_LABEL[state]??state;
/** How a state looks: running (moving by itself), waiting (needs the operator), bad, or still. */
export function tone(state:string):'run'|'wait'|'bad'|'idle' {
  if(['ENCHENDO_AGUA','AQUECENDO','DISSOLVENDO','HOMOGENEIZANDO','TRANSFERINDO','PRE_AQUECENDO','PRODUZINDO','RESFRIANDO','ENCHENDO','LIMPEZA'].includes(state))return 'run';
  if(['AGUARDANDO_INSUMOS','AGUARDANDO_QUALIDADE','PRONTO_PARA_TRANSFERIR','PRONTO','SACO_POSICIONADO','AGUARDANDO_COSTURA','AGUARDANDO_EMPILHAR','AGUARDANDO_SACO','PAUSADO'].includes(state))return 'wait';
  if(['SUJO','FALHA'].includes(state))return 'bad';
  return 'idle';
}
export const tankName=(id:number)=>`TQ-${100+id}`;
export const fixed=(value:number,digits=0)=>value.toFixed(digits).replace('.',',');

/** Where the player stands in relation to the controls: the panel reaches everything near it; each machine its own. */
export type Station='panel'|'tank1'|'tank2'|'tank3'|'dryer'|'bagging';
const STATIONS:Record<Station,ReadonlyArray<readonly [string,number]>>={
  panel:[['Ponto_EB_Painel',FACTORY_REACH.panel]],
  tank1:[['Ponto_EB_Tanque_1_Operador',FACTORY_REACH.tank]],tank2:[['Ponto_EB_Tanque_2_Operador',FACTORY_REACH.tank]],tank3:[['Ponto_EB_Tanque_3_Operador',FACTORY_REACH.tank]],
  dryer:[['Ponto_EB_Secador_Base',FACTORY_REACH.dryer],...['N','S','L','O'].map(side=>[`Ponto_EB_Secador_Inspecao_${side}`,FACTORY_REACH.dryer] as const)],
  bagging:[['Ponto_EB_Ensaque',FACTORY_REACH.bagging],['Ponto_EB_Ensaque_Bico',FACTORY_REACH.bagging],['Ponto_EB_Ensaque_Saida',FACTORY_REACH.bagging],['Ponto_EB_PA_Ensaque',FACTORY_REACH.pallet],['Ponto_EB_Paleteira',FACTORY_REACH.pallet]],
};
const standsAt=(player:{x:number;y?:number;z:number},markers:ReadonlyArray<readonly [string,number]>)=>markers.some(([name,reach])=>{
  const point=CITY_MARKERS[name];return !!point&&Math.hypot(player.x-point.x,player.z-point.z)<=reach&&Math.abs((player.y??0)-point.y)<=1.6;
});
/** Near the loading dock (the room lets the operator load and unload from the panel or from here). */
export function nearDock(player:{x:number;y?:number;z:number}|undefined,extra=1):boolean {
  return !!player&&standsAt(player,[['Ponto_EB_Doca',FACTORY_REACH.dock+extra]]);
}
/** Mirrors BarRoom.factoryStation: the group's own machine or the panel. */
export function canReach(group:Station,player:{x:number;y?:number;z:number}|undefined):boolean {
  if(!player)return false;
  // The bagging controls exist only at the bagging station: the control room's computer does not reach them.
  if(group==='bagging')return standsAt(player,STATIONS.bagging);
  return standsAt(player,STATIONS.panel)||(group!=='panel'&&standsAt(player,STATIONS[group]));
}
export const REACH_HINT:Record<Station,string>={
  panel:'Chegue perto do painel da sala de controle.',tank1:'Use o painel ou suba na plataforma do TQ-101.',tank2:'Use o painel ou suba na plataforma do TQ-102.',tank3:'Use o painel ou suba na plataforma do TQ-103.',
  dryer:'Use o painel ou chegue perto do secador.',bagging:'Os controles do ensaque ficam na estação de ensaque: chegue perto da ensacadeira.',
};

/** A button of the panel: what it sends, whether it can be used now and, if not, why. */
export interface Action {action:string;target?:string;label:string;enabled:boolean;why?:string;tone?:'danger'|'primary';/** The step the process is waiting for. */next?:boolean}

export function tankActions(tank:TankView,view:FactoryView):Action[] {
  const p=`tank${tank.id}.`,s=tank.state,producing=view.dryer.state==='PRODUZINDO'&&view.dryer.sourceTank===tank.id;
  return [
    {action:`${p}water`,label:'Encher de água',enabled:s==='VAZIO',why:s==='SUJO'?'Lave o tanque antes.':'O tanque já tem um lote.',next:s==='VAZIO'},
    // Explicit on/off (never a toggle that depends on what the screen showed): the click always gives the state its label says.
    {action:`${p}agitator.${tank.agitatorRpm?'off':'on'}`,label:tank.agitatorRpm?'Desligar agitador':'Ligar agitador',enabled:!['VAZIO','SUJO'].includes(s),why:'Encha o tanque primeiro.'},
    {action:`${p}lid.${tank.lidOpen?'close':'open'}`,label:tank.lidOpen?'Fechar tampa':'Abrir tampa',enabled:!['VAZIO','SUJO'].includes(s),why:'Encha o tanque primeiro.'},
    {action:`${p}sample`,label:'Colher amostra',enabled:s==='AGUARDANDO_QUALIDADE',why:'Só ao fim da homogeneização.'},
    {action:`${p}approve`,label:'Aprovar lote',enabled:s==='AGUARDANDO_QUALIDADE',why:'Só ao fim da homogeneização.',tone:'primary',next:s==='AGUARDANDO_QUALIDADE'},
    {action:`${p}reject`,label:'Reprovar',enabled:['AGUARDANDO_QUALIDADE','PRONTO_PARA_TRANSFERIR'].includes(s),why:'Só um lote pronto pode ser reprovado.',tone:'danger'},
    {action:`${p}discard`,label:'Descartar',enabled:s!=='VAZIO'&&!producing,why:s==='VAZIO'?'O tanque já está vazio.':'O tanque está alimentando o secador.',tone:'danger'},
    // The wash is timed work done from the tank's platform (E there): the panel only says so.
    {action:`${p}wash`,label:'Lavar (E na plataforma)',enabled:false,why:s==='SUJO'?'Suba na plataforma deste tanque e aperte E para lavá-lo.':'Só um tanque sujo precisa ser lavado.'},
  ];
}
export function dryerActions(view:FactoryView):Action[] {
  const d=view.dryer,ready=view.tanks.filter(tank=>tank.state==='PRONTO_PARA_TRANSFERIR');
  return [
    {action:'dryer.preheat',label:'Pré-aquecer',enabled:d.state==='PARADO',why:'O secador só pré-aquece parado.',tone:'primary',next:d.state==='PARADO'&&ready.length>0},
    // With the dryer running a click switches the feed to another approved tank, without stopping it.
    ...view.tanks.map(tank=>{
      const live=d.state==='PRONTO'||d.state==='PRODUZINDO',source=d.state==='PRODUZINDO'&&d.sourceTank===tank.id,approved=tank.state==='PRONTO_PARA_TRANSFERIR';
      return {action:'dryer.feed',target:String(tank.id),label:d.state==='PRODUZINDO'&&!source?`Trocar para ${tankName(tank.id)}`:`Alimentar com ${tankName(tank.id)}`,enabled:live&&approved&&!source,
        why:!live?'O secador precisa estar pré-aquecido (Pronto) ou produzindo.':source?`${tankName(tank.id)} já está alimentando o secador.`:`${tankName(tank.id)} ainda não foi aprovado.`,next:d.state==='PRONTO'&&approved};
    }),
    {action:'dryer.stop',label:'Parar e esfriar',enabled:['PRE_AQUECENDO','PRONTO','PRODUZINDO'].includes(d.state),why:'O secador já está parado.',tone:'danger'},
    {action:'dryer.retry',label:'Rearmar falha',enabled:d.state==='FALHA',why:'Só quando há falha.',next:d.state==='FALHA'},
    {action:'dryer.clean',label:'Lavar o secador',enabled:['PARADO','FALHA'].includes(d.state),why:'Pare e esfrie o secador antes.',next:['PARADO','FALHA'].includes(d.state)&&(view.dirt?.levels.dryer??0)>=DIRT_PENDING},
  ];
}
export function baggingActions(view:FactoryView):Action[] {
  const b=view.bagging,silo=view.dryer.powderKg,out=view.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque');
  const idle=b.state==='PARADO'||b.state==='AGUARDANDO_SACO';
  return [
    {action:'bag.empty',label:'Posicionar saco',enabled:idle&&b.emptyBags>0,why:b.emptyBags<1?'Sem sacos vazios: reponha o fardo.':'A ensacadeira está ocupada.',next:idle&&b.emptyBags>0&&silo>.5},
    // A bag may take whatever the silo has (a light bag, paid by its weight): stopping a batch never leaves powder stranded.
    {action:'bag.start',label:silo>0&&silo<view.balance.bagKg?`Ensacar o que há (${fixed(silo,1)} kg)`:'Iniciar enchimento',enabled:b.state==='SACO_POSICIONADO'&&(silo>=.05||view.dryer.state==='PRODUZINDO'),why:b.state!=='SACO_POSICIONADO'?'Posicione um saco vazio antes.':'Não há produto no silo.',tone:'primary',next:b.state==='SACO_POSICIONADO'&&silo>=.05},
    {action:'bag.pause',label:'Pausar',enabled:b.state==='ENCHENDO',why:'Não está enchendo.'},
    {action:'bag.finish',label:`Fechar saco (${fixed(b.weightKg,1)} kg)`,enabled:(b.state==='ENCHENDO'||b.state==='PAUSADO')&&b.weightKg>=.05,why:'Só com um saco enchendo e algum produto dentro.'},
    {action:'bag.resume',label:'Retomar',enabled:b.state==='PAUSADO',why:'Não está pausado.'},
    {action:'bag.sew',label:'Costurar',enabled:b.state==='AGUARDANDO_COSTURA',why:'O saco ainda não está cheio.',next:b.state==='AGUARDANDO_COSTURA'},
    {action:'bag.stack',label:'Empilhar',enabled:b.state==='AGUARDANDO_EMPILHAR',why:'Não há saco costurado.',next:b.state==='AGUARDANDO_EMPILHAR'},
    {action:'pallet.close',label:'Fechar palete incompleto',enabled:b.palletBags>0&&(b.state==='PARADO'||b.state==='AGUARDANDO_SACO')&&!(out&&out.quantity>0),why:b.palletBags<1?'Não há sacos empilhados no palete.':out&&out.quantity>0?'Armazene o palete da saída antes.':'Termine o saco que está na ensacadeira.'},
    {action:'pallet.store',label:'Armazenar palete',enabled:!!out&&out.quantity>0,why:'Não há palete pronto na saída.',next:!!out&&out.quantity>0},
    {action:'bag.restock',label:'Repor sacos vazios',enabled:b.emptyBags<=16,why:'Ainda há bastante saco no fardo.',next:b.emptyBags<1},
  ];
}

/** What to do next, and where: the panel's guide and the ring/badge that points at the place. */
export interface Step {title:string;detail:string;spot?:string;tab?:string;/** A place of its own (a cleaning task), when no station marks it. */at?:{x:number;y:number;z:number}}
/** The cleaning task the guide asks for first: tanks, dryer, line, then the floors. */
export function nextCleaning(view:FactoryView):CleanTaskId|undefined {
  if(!view.dirt)return;
  const pending=pendingCleaning(view.dirt);
  return CLEAN_TASKS.map(task=>task.id).find(id=>pending.includes(id));
}
export function nextStep(view:FactoryView|undefined,employed:boolean,carrying:null|'MALTE'|'MIX'):Step|undefined {
  if(!employed)return {title:'Candidate-se ao cargo',detail:'Abra a aba Emprego e peça a vaga de Operador de Spray Dry.',tab:'employment'};
  if(!view)return;
  const me=view.me;
  if(!me.onShift)return {title:'Entre em expediente',detail:'Na entrada de pessoal, abra o painel e aperte "Entrar em expediente".',spot:'entrada',tab:'employment'};
  if(!me.ppe)return {title:'Coloque o EPI',detail:'Capacete, luvas e óculos ficam no armário da entrada de pessoal.',spot:'entrada',tab:'employment'};
  if(view.emergency)return {title:'Rearme a emergência',detail:'A linha está parada. No painel, confira os alarmes e rearme.',spot:'painel',tab:'alarms'};
  const tanks=view.tanks,need=view.balance.recipe;
  const quality=tanks.find(tank=>tank.state==='AGUARDANDO_QUALIDADE');
  if(quality)return {title:`Aprove ou reprove o ${tankName(quality.id)}`,detail:`Qualidade ${quality.quality}%. Colha a amostra, depois aprove (ou reprove se estiver ruim).`,spot:`tanque${quality.id}`,tab:'tanks'};
  const loading=tanks.find(tank=>tank.state==='AGUARDANDO_INSUMOS');
  if(loading){
    const name=tankName(loading.id);
    const missing=loading.malteBags<need.malteBags?'MALTE':'MIX';
    if(carrying)return {title:`Despeje o ${carrying} no ${name}`,detail:`Suba na plataforma do ${name} e aperte E: a tampa abre e o agitador liga sozinhos. Receita: MALTE ${loading.malteBags}/${need.malteBags}, MIX ${loading.mixBags}/${need.mixBags}.`,spot:`tanque${loading.id}`};
    return {title:`Pegue um saco de ${missing}`,detail:`Receita: MALTE ${loading.malteBags}/${need.malteBags}, MIX ${loading.mixBags}/${need.mixBags}. Pegue na prateleira (aperte E) e leve ao ${name}; lá, E despeja (tampa e agitador não precisam ser abertos antes).`,spot:missing==='MALTE'?'rack2':'rack3'};
  }
  const dirty=tanks.find(tank=>tank.state==='SUJO');
  const order=view.production?.active;
  const ready=tanks.find(tank=>tank.state==='PRONTO_PARA_TRANSFERIR');
  if(ready&&view.dryer.state==='PARADO')return {title:'Pré-aqueça o secador',detail:`O ${tankName(ready.id)} está aprovado. O secador leva alguns minutos para esquentar.`,spot:'secador',tab:'dryer'};
  if(ready&&view.dryer.state==='PRONTO')return {title:`Alimente o secador com o ${tankName(ready.id)}`,detail:'O secador está quente e pronto.',spot:'secador',tab:'dryer'};
  if(ready&&view.dryer.state==='PRODUZINDO'&&view.dryer.sourceTank!==ready.id)return {title:`${tankName(ready.id)} aprovado, esperando a vez`,detail:`O secador está com o ${tankName(view.dryer.sourceTank??0)}. Quando ele esvaziar o ${tankName(ready.id)} entra sozinho; ou troque agora, sem parar o secador (aba Secador).`,spot:'secador',tab:'dryer'};
  if(view.dryer.state==='FALHA')return {title:'Rearme a falha do secador',detail:'Veja a causa na aba Alarmes e rearme no secador.',spot:'secador',tab:'dryer'};
  // A driver's truck at the dock: unload what it brought, or load product for it.
  const returning=view.shipments.find(trip=>trip.status==='returning'&&view.dock.trucks.some(truck=>truck.vehicleId===trip.vehicleId));
  if(returning)return {title:`Descarregue o caminhão ${returning.plate}`,detail:`Ele trouxe ${returning.pallets} palete(s) de ${returning.material}. Aba Doca e cargas, "Descarregar nas prateleiras".`,spot:'doca',tab:'dock'};
  const product=view.slots.filter(slot=>slot.material==='PRODUTO').reduce((sum,slot)=>sum+slot.quantity,0);
  const waiting=view.dock.trucks.find(truck=>!view.shipments.some(trip=>trip.vehicleId===truck.vehicleId&&['loaded','in_transit','to_supplier','returning'].includes(trip.status)));
  if(waiting&&product>=18)return {title:`Carregue o caminhão ${waiting.plate}`,detail:`Há um caminhão na doca${waiting.plate?` (${waiting.plate})`:''}. Aba Doca e cargas: ele sai, a venda é paga e você recebe a taxa da carga.`,spot:'doca',tab:'dock'};
  const out=view.slots.find(slot=>slot.marker==='Ponto_EB_PA_Ensaque');
  if(out&&out.quantity>0)return {title:'Armazene o palete pronto',detail:'O palete completo está na saída do ensaque: armazene-o no estoque.',spot:'palete',tab:'bagging'};
  const bagging=view.bagging;
  if(bagging.state==='AGUARDANDO_COSTURA')return {title:'Costure o saco',detail:'O saco está cheio.',spot:'ensaque',tab:'bagging'};
  if(bagging.state==='AGUARDANDO_EMPILHAR')return {title:'Empilhe o saco',detail:`Palete ${bagging.palletBags}/18.`,spot:'ensaque',tab:'bagging'};
  if(bagging.state==='SACO_POSICIONADO'&&view.dryer.powderKg>=.05)return {title:'Inicie o enchimento',detail:view.dryer.powderKg<view.balance.bagKg?`Só há ${fixed(view.dryer.powderKg,1)} kg no silo: sai um saco leve, pago pelo peso.`:'Saco posicionado e produto no silo.',spot:'ensaque',tab:'bagging'};
  if(view.dryer.powderKg>.5&&view.dryer.powderKg<view.balance.bagKg&&view.dryer.state!=='PRODUZINDO'&&['PARADO','AGUARDANDO_SACO'].includes(bagging.state))return bagging.emptyBags>0
    ?{title:'Ensaque o que sobrou no silo',detail:`Restam ${fixed(view.dryer.powderKg,1)} kg: posicione um saco e inicie. O saco sai leve e o pagamento acompanha o peso.`,spot:'ensaque',tab:'bagging'}
    :{title:'Reponha os sacos vazios',detail:'O fardo acabou.',spot:'ensaque',tab:'bagging'};
  if(view.dryer.powderKg>=view.balance.bagKg&&['PARADO','AGUARDANDO_SACO'].includes(bagging.state))return bagging.emptyBags>0
    ?{title:'Ensaque o produto',detail:`Há ${fixed(view.dryer.powderKg)} kg no silo. Posicione um saco vazio e inicie.`,spot:'ensaque',tab:'bagging'}
    :{title:'Reponha os sacos vazios',detail:'O fardo acabou.',spot:'ensaque',tab:'bagging'};
  // After an order ends the whole plant is dirty: everything must be cleaned before the next one.
  const cleaning=nextCleaning(view);
  if(view.dirt?.required&&cleaning){
    const task=cleanTaskOf(cleaning)!,left=pendingCleaning(view.dirt).length;
    if(task.kind==='dryer')return view.dryer.state==='PARADO'||view.dryer.state==='FALHA'
      ?{title:'Lave o secador',detail:`Faltam ${left} lugar(es) para limpar. Aba Secador, "Lavar o secador" (leva menos de um minuto).`,spot:'secador',tab:'dryer'}
      :{title:'Pare e esfrie o secador',detail:`Faltam ${left} lugar(es) para limpar. O secador precisa estar parado para ser lavado: aba Secador, "Parar e esfriar".`,spot:'secador',tab:'dryer'};
    return {title:`Limpe: ${task.label}`,detail:`Faltam ${left} lugar(es) para limpar antes da próxima ordem. Vá até lá e aperte E (${task.durationS} s, fique no lugar).`,at:task.at};
  }
  if(dirty&&!tanks.some(tank=>tank.state==='VAZIO')&&order?.status==='running')return {title:`Lave o ${tankName(dirty.id)}`,detail:'Um tanque sujo precisa de lavagem antes de um novo lote: suba na plataforma e aperte E (10 s).',spot:`tanque${dirty.id}`};
  const empty=tanks.find(tank=>tank.state==='VAZIO');
  const stock=(material:string)=>view.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0);
  if(!order&&!tanks.some(tank=>!['VAZIO','SUJO'].includes(tank.state)))return {title:'Sem ordem de produção',detail:'A fábrica só produz com uma ordem de produção (OP). O gerente da empresa a aprova em Perfil → Gerenciar empresa. Enquanto isso você recebe o salário de presença se estiver em serviço com o EPI.',spot:'painel',tab:'overview'};
  if(order?.status==='approved')return {title:'Inicie a ordem de produção',detail:`OP aprovada: ${order.name}, ${order.batches} lote(s). No computador da sala de controle, "Iniciar produção".`,spot:'painel',tab:'overview'};
  if(order?.status==='running'&&empty&&order.batchesStarted<order.batches&&!tanks.some(tank=>['ENCHENDO_AGUA','AQUECENDO','DISSOLVENDO','HOMOGENEIZANDO','TRANSFERINDO'].includes(tank.state))&&view.dryer.state==='PARADO'){
    if(stock('MALTE')>=need.malteBags&&stock('MIX')>=need.mixBags)return {title:`Comece o lote ${order.batchesStarted+1}/${order.batches} no ${tankName(empty.id)}`,detail:'Encha o tanque de água: ele aquece sozinho e avisa quando puder receber os insumos.',spot:`tanque${empty.id}`,tab:'tanks'};
    return {title:'Falta matéria-prima',detail:'O estoque não cobre uma receita. Só o dono da empresa compra matéria-prima (Perfil → Gerenciar empresa); os motoristas entregam a carga e o fornecedor entrega sozinho em até 30 minutos.',spot:'painel',tab:'stock'};
  }
  if(tanks.some(tank=>['ENCHENDO_AGUA','AQUECENDO','DISSOLVENDO','HOMOGENEIZANDO'].includes(tank.state))||['PRE_AQUECENDO','PRODUZINDO','RESFRIANDO'].includes(view.dryer.state)||bagging.state==='ENCHENDO')
    return {title:'O processo está andando',detail:'Acompanhe pelos medidores. Você será avisado quando precisar agir.'};
  return {title:'Tudo em ordem',detail:'Sem tarefas agora. Quando houver paletes prontos e um caminhão na doca, carregue-o.',tab:'dock'};
}
