import {z} from 'zod';
import type {Client} from '@colyseus/core';
import {COMPANY_PASSWORD,FACTORY_ORDER,FACTORY_NPC_DELIVERY_MIN,estimateProduction,pendingCleaning,purchaseQuote,type CompanyRole,type CompanyView,type FactoryFinance,type ProductionOrder} from '@bar/shared/factory';
import {InternalApiError,internal} from './internal.js';
import type {FactoryDirector} from './world/factory/index.js';

/** What the desk needs from the room (the room owns sessions, wallets and the plant's other state). */
export interface CompanyHost {
  handle<T>(name:string,schema:{safeParse(data:unknown):{success:true;data:T}|{success:false}},limit:number,handler:(client:Client,payload:T)=>void|Promise<void>):void;
  who(client:Client):{userId:string;name:string}|undefined;
  factory:FactoryDirector;
  finance():FactoryFinance;
  orders():Array<Record<string,unknown>>;
  refreshOrders():Promise<void>;
  /** The plant's state and the freight app were changed: push them to whoever watches. */
  changed():void;
  /** Sends a message to a connected player (nothing when they are offline). */
  send(userId:string,type:string,payload:unknown):void;
  /** A player lost their job: their shift ends and the PPE comes off at once. */
  dismissed(userId:string):Promise<void>;
  /** Coins moved to or from a player's wallet: the screen's balance follows. */
  walletMoved(userId:string,balance:number):void;
  log(event:string,details:Record<string,unknown>):void;
}

const money=z.number().int().min(1).max(1_000_000_000);
const password=z.string().max(80).optional();
const requestId=z.uuid();
const userId=z.uuid();

/**
 * The firm's desk (docs/sistemas/empresa.md): what the owners and managers do from the profile's "Gerenciar empresa" tab. The API keeps the money,
 * the roles and the people; the world keeps the plant, so the production orders (OPs) and the raw material's room on the racks are decided here.
 * Every action re-reads the player's role from the API: nothing the client says about who it is counts.
 */
export class CompanyDesk {
  /** Players who have the tab open: they get the firm's state again after every change. */
  private readonly watchers=new Set<string>();
  constructor(private host:CompanyHost){this.register();}

  forget(userId:string):void {this.watchers.delete(userId);}

  private async roleOf(userId:string):Promise<CompanyRole|null> {
    return (await internal<{role:CompanyRole|null}>('company',{action:'role',userId})).role;
  }
  private async need(userId:string,roles:readonly CompanyRole[],what:string):Promise<CompanyRole> {
    const role=await this.roleOf(userId);
    if(!role||!roles.includes(role))throw new Error(roles.length===1&&roles[0]==='owner'?`Só os donos da empresa podem ${what}.`:`Só os donos e gerentes da empresa podem ${what}.`);
    return role;
  }

  /** The firm as the plant and the API see it together, for one owner or manager. Null: this player has no role. */
  async build(user:string):Promise<CompanyView|null> {
    let core:Awaited<ReturnType<typeof this.fetchCore>>;
    try{core=await this.fetchCore(user);}catch(error){if(error instanceof InternalApiError&&error.status===403)return null;throw error;}
    const factory=this.host.factory,finance=this.host.finance(),balance=factory.balance,board=factory.board;
    const bags=(material:'MALTE'|'MIX'|'PRODUTO')=>factory.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0);
    const rules={rawMaltePrice:finance.rawMaltePrice,rawMixPrice:finance.rawMixPrice,palletPrice:finance.palletPrice,taxPercent:finance.taxPercent,employeeFee:finance.employeeFee,maxPalletsPerTruck:finance.maxPalletsPerTruck,bagKg:balance.bagKg,yieldMin:balance.recipe.yieldMin,yieldMax:balance.recipe.yieldMax};
    const estimates:CompanyView['production']['estimates']={};
    for(const order of [...board.offers,...(board.active?[board.active]:[])] as ProductionOrder[])estimates[order.id]=estimateProduction(order,rules);
    const live=this.host.orders();
    return {
      ...core,
      stock:{MALTE:bags('MALTE'),MIX:bags('MIX'),PRODUTO:bags('PRODUTO'),roomMALTE:factory.roomFor('MALTE'),roomMIX:factory.roomFor('MIX')},
      prices:{MALTE:purchaseQuote('MALTE',1,0,finance.rawMaltePrice).base,MIX:purchaseQuote('MIX',1,0,finance.rawMixPrice).base,taxPercent:finance.taxPercent,palletPrice:finance.palletPrice},
      production:{...structuredClone(board),estimates,canDraw:core.role==='owner'&&!board.active,canApprove:!board.active&&board.offers.length>0},
      plant:{operators:factory.snapshot().activeOperators,dirtRequired:factory.dirt.required,pendingCleaning:pendingCleaning(factory.dirt),running:board.active?.status==='running'},
      idlePay:{amount:finance.idlePay,everyS:finance.idleEveryMin*60},
      orders:core.orders.map(order=>live.some(each=>each.id===order.id&&each.status==='accepted')?{...order,status:'accepted',cancellable:false}:order),
    };
  }
  private fetchCore(user:string){return internal<Omit<CompanyView,'stock'|'prices'|'production'|'plant'|'idlePay'>>('company',{action:'view',userId:user});}

  private async push(user:string):Promise<void> {
    try{this.host.send(user,'company.state',await this.build(user)??{role:null});}
    catch(error){this.host.log('company_state_error',{playerId:user,error:error instanceof Error?error.message:String(error)});}
  }
  private async pushAll():Promise<void> {await Promise.all([...this.watchers].map(user=>this.push(user)));}

  /** Registers an action: it answers with `company.result` (what happened, or why not) and every watcher gets the new state. */
  private action<T extends object>(name:string,schema:z.ZodType<T>,limit:number,run:(who:{userId:string;name:string},payload:T)=>Promise<string>):void {
    this.host.handle<T>(`company.${name}`,schema,limit,async(client,payload)=>{
      const who=this.host.who(client);if(!who)return;
      try{
        const message=await run(who,payload);
        client.send('company.result',{action:name,ok:true,message,requestId:(payload as {requestId?:string}).requestId});this.host.log(`company_${name}`.replaceAll('.','_'),{playerId:who.userId});
      }catch(error){
        client.send('company.result',{action:name,ok:false,message:error instanceof Error?error.message:'Não foi possível concluir.',requestId:(payload as {requestId?:string}).requestId});
      }
      await this.pushAll();
    });
  }

  private register():void {
    const host=this.host;
    host.handle('company.watch',z.object({on:z.boolean()}).strict(),4,async(client,{on})=>{
      const who=host.who(client);if(!who)return;
      if(!on){this.watchers.delete(who.userId);return;}
      this.watchers.add(who.userId);await this.push(who.userId);
    });
    host.handle('company.search',z.object({text:z.string().max(40)}).strict(),3,async(client,{text})=>{
      const who=host.who(client);if(!who)return;
      try{client.send('company.search',await internal('company',{action:'search',userId:who.userId,text}));}catch{client.send('company.search',{players:[]});}
    });

    // ---- money (owners) ----
    this.action('transfer',z.object({amount:money,password,requestId}).strict(),2,async(who,{amount,password:secret,requestId:id})=>{
      const result=await internal<{applied:boolean;wallet:number}>('company',{action:'transfer',userId:who.userId,amount,password:secret,requestId:id});
      if(result.applied)host.walletMoved(who.userId,result.wallet);
      return result.applied?`${amount.toLocaleString('pt-BR')} moedas foram para a sua carteira.`:'Essa transferência já tinha sido feita.';
    });
    this.action('deposit',z.object({amount:money,requestId}).strict(),2,async(who,{amount,requestId:id})=>{
      const result=await internal<{applied:boolean;wallet:number}>('company',{action:'deposit',userId:who.userId,amount,requestId:id});
      if(result.applied)host.walletMoved(who.userId,result.wallet);
      return result.applied?`${amount.toLocaleString('pt-BR')} moedas entraram na carteira da empresa.`:'Esse depósito já tinha sido feito.';
    });
    this.action('password',z.object({password:z.string().max(80).nullable(),current:z.string().max(80).optional()}).strict(),2,async(who,{password:next,current})=>{
      if(next!==null&&(next.length<COMPANY_PASSWORD.min||next.length>COMPANY_PASSWORD.max))throw new Error(`A senha precisa ter de ${COMPANY_PASSWORD.min} a ${COMPANY_PASSWORD.max} caracteres.`);
      const result=await internal<{hasPassword:boolean}>('company',{action:'password',userId:who.userId,password:next,current});
      return result.hasPassword?'Senha da empresa definida: ela passa a ser pedida nas transferências e compras.':'Senha da empresa removida.';
    });

    // ---- raw material (owners) ----
    this.action('purchase',z.object({material:z.enum(['MALTE','MIX']),pallets:z.number().int().min(1).max(FACTORY_ORDER.maxPallets),password,requestId}).strict(),3,async(who,{material,pallets,password:secret,requestId:id})=>{
      await this.need(who.userId,['owner'],'comprar matéria-prima');
      const open=host.orders().filter(order=>order.kind==='purchase'&&order.material===material&&(order.status==='open'||order.status==='accepted')).reduce((sum,order)=>sum+Number(order.pallets),0);
      if(open+pallets>FACTORY_ORDER.maxOpenPallets)throw new Error(`Já há ${open} palete(s) de ${material} pedidos e a caminho: no máximo ${FACTORY_ORDER.maxOpenPallets}.`);
      if(host.factory.roomFor(material)<(open+pallets)*18)throw new Error(`As prateleiras de ${material} não têm vaga para tudo isso (${host.factory.roomFor(material)} sacos livres, ${open} palete(s) já pedidos).`);
      const result=await internal<{applied:boolean;total:number}>('company',{action:'purchase',userId:who.userId,material,pallets,password:secret,dueAt:new Date(Date.now()+FACTORY_NPC_DELIVERY_MIN*60_000).toISOString(),requestId:id});
      if(result.applied)host.factory.note('info',`${who.name} comprou ${pallets} palete(s) de ${material} para a empresa. Os motoristas já veem a carga; sem ninguém, o fornecedor entrega em até ${FACTORY_NPC_DELIVERY_MIN} min.`);
      await host.refreshOrders();host.changed();
      return `Compra feita: ${pallets} palete(s) de ${material} por ${result.total.toLocaleString('pt-BR')} moedas (imposto incluso). Motoristas de caminhão veem a carga no celular; sem ninguém, o fornecedor entrega em até ${FACTORY_NPC_DELIVERY_MIN} min.`;
    });
    this.action('cancel',z.object({id:z.uuid()}).strict(),3,async(who,{id})=>{
      const result=await internal<{refunded:number}>('company',{action:'cancel',userId:who.userId,orderId:id});
      host.factory.note('info',`${who.name} cancelou um pedido de matéria-prima.`);await host.refreshOrders();host.changed();
      return `Pedido cancelado: ${result.refunded.toLocaleString('pt-BR')} moedas voltaram para a empresa.`;
    });

    // ---- people (owners and managers) ----
    this.action('admit',z.object({userId,requestId}).strict(),3,async(who,{userId:target,requestId:id})=>{
      await internal('company',{action:'admit',actorId:who.userId,userId:target,requestId:id});
      host.send(target,'factory.result',{action:'notice',ok:true,message:'Você foi admitido na EMPRESA BRASIL! Entre em expediente na entrada de pessoal.'});host.send(target,'employment.refresh',{});
      return 'Funcionário admitido.';
    });
    this.action('reject',z.object({userId,requestId}).strict(),3,async(who,{userId:target,requestId:id})=>{
      await internal('company',{action:'reject',actorId:who.userId,userId:target,requestId:id});
      host.send(target,'factory.result',{action:'notice',ok:false,message:'Sua candidatura à EMPRESA BRASIL não foi aceita.'});host.send(target,'employment.refresh',{});
      return 'Candidatura recusada.';
    });
    this.action('dismiss',z.object({userId,requestId}).strict(),3,async(who,{userId:target,requestId:id})=>{
      await internal('company',{action:'dismiss',actorId:who.userId,userId:target,requestId:id});
      await host.dismissed(target);
      host.send(target,'factory.result',{action:'notice',ok:false,message:'Você foi demitido da EMPRESA BRASIL.'});host.send(target,'employment.refresh',{});
      return 'Funcionário demitido.';
    });
    this.action('manager',z.object({userId,manager:z.boolean()}).strict(),3,async(who,{userId:target,manager})=>{
      await internal('company',{action:'manager',actorId:who.userId,userId:target,manager});
      host.send(target,'factory.result',{action:'notice',ok:manager,message:manager?'Você foi nomeado gerente da EMPRESA BRASIL: abra Perfil → Gerenciar empresa.':'Você deixou de ser gerente da EMPRESA BRASIL.'});
      return manager?'Gerente nomeado.':'Cargo de gerente retirado.';
    });

    // ---- production orders ----
    this.action('op.draw',z.object({}).strict(),2,async who=>{
      await this.need(who.userId,['owner'],'criar ordens de produção');
      const offers=host.factory.drawOffers(who.name);host.changed();
      return `${offers.length} opções de ordem de produção criadas: o gerente (ou você) escolhe uma.`;
    });
    this.action('op.approve',z.object({id:z.string().min(1).max(80)}).strict(),3,async(who,{id})=>{
      await this.need(who.userId,['owner','manager'],'aprovar ordens de produção');
      const order=host.factory.approveOffer(id,who.name);order.approvedBy=who.userId;host.changed();
      return `Ordem aprovada: ${order.name}. Ela já aparece para os funcionários, que a iniciam no painel da fábrica.`;
    });
    this.action('op.cancel',z.object({}).strict(),2,async who=>{
      await this.need(who.userId,['owner','manager'],'cancelar ordens de produção');
      host.factory.cancelApproved(who.name);host.changed();return 'Ordem de produção cancelada.';
    });
    this.action('op.close',z.object({}).strict(),2,async who=>{
      await this.need(who.userId,['owner','manager'],'encerrar ordens de produção');
      host.factory.closeProduction(who.name);host.changed();return 'Ordem encerrada: a fábrica agora precisa ser limpa.';
    });
  }
}
