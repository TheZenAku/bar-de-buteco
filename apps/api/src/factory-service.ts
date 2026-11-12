import {eq} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import type {Database} from './database/index.js';
import {factoryLedger,factoryOrders,factoryRuntime,factorySettings,factorySlots} from './database/schema.js';

export class FactoryError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export interface PersistedFactorySlot {marker:string;material:string;quantity:number;capacity:number;levelM:number;batchId?:string;revision?:number}

export class FactoryService {
  constructor(private db:Database){}
  async view(){const [runtime]=await this.db.select().from(factoryRuntime).where(eq(factoryRuntime.id,'empresa-brasil'));return {state:runtime?.state??null,revision:runtime?.revision??0,slots:await this.db.select().from(factorySlots),settings:await this.db.select().from(factorySettings)};}
  async save(actorId:string,requestId:string,state:unknown,slots:PersistedFactorySlot[]){return this.db.transaction(async tx=>{
    const claimed=await tx.insert(factoryLedger).values({requestId,actorId,action:'save',resource:'empresa-brasil',delta:{},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});
    if(!claimed.length){const [runtime]=await tx.select().from(factoryRuntime).where(eq(factoryRuntime.id,'empresa-brasil'));return {state:runtime?.state??null,revision:runtime?.revision??0,slots:await tx.select().from(factorySlots),settings:await tx.select().from(factorySettings),applied:false};}
    const current=(await tx.select().from(factoryRuntime).where(eq(factoryRuntime.id,'empresa-brasil')).for('update'))[0],revision=(current?.revision??0)+1;
    await tx.insert(factoryRuntime).values({id:'empresa-brasil',state:state as Record<string,unknown>,revision}).onConflictDoUpdate({target:factoryRuntime.id,set:{state:state as Record<string,unknown>,revision,updatedAt:new Date()}});
    for(const slot of slots){if(!['MALTE','MIX','PRODUTO'].includes(slot.material)||slot.quantity<0||slot.quantity>slot.capacity)throw new FactoryError(400,`Vaga inválida: ${slot.marker}.`);await tx.insert(factorySlots).values({marker:slot.marker,material:slot.material,quantity:slot.quantity,capacity:slot.capacity,levelM:slot.levelM,batchId:slot.batchId||null,revision:slot.revision??revision}).onConflictDoUpdate({target:factorySlots.marker,set:{material:slot.material,quantity:slot.quantity,capacity:slot.capacity,levelM:slot.levelM,batchId:slot.batchId||null,revision:slot.revision??revision,updatedAt:new Date()}});}
    await tx.update(factoryLedger).set({result:{revision}}).where(eq(factoryLedger.requestId,requestId));return {revision,applied:true};
  });}
  async orders(){return this.db.select().from(factoryOrders);}
  async createOrder(input:{kind:'purchase'|'ribeiro-purchase'|'sale';material:'MALTE'|'MIX'|'PRODUTO'|'ACO'|'ALUMINIO'|'POLIMERO'|'MOLAS';pallets:number;price:number;dueAt?:Date;requestId:string}){
    const [existing]=await this.db.select().from(factoryOrders).where(eq(factoryOrders.requestId,input.requestId));if(existing)return existing;
    const [order]=await this.db.insert(factoryOrders).values({id:randomUUID(),...input}).returning();return order!;
  }
  async acceptOrder(id:string,userId:string,requestId:string){return this.db.transaction(async tx=>{const claimed=await tx.insert(factoryLedger).values({requestId,actorId:userId,action:'order-accept',resource:id,delta:{},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});const [order]=await tx.select().from(factoryOrders).where(eq(factoryOrders.id,id)).for('update');if(!order)throw new FactoryError(404,'Ordem não encontrada.');if(!claimed.length)return order;if(order.status==='accepted'&&order.acceptedBy===userId)return order;if(order.status!=='open')throw new FactoryError(409,'A ordem não está aberta.');const [next]=await tx.update(factoryOrders).set({status:'accepted',acceptedBy:userId,updatedAt:new Date()}).where(eq(factoryOrders.id,id)).returning();return next!;});}
  async orderStatus(id:string,status:'completed'|'cancelled'|'expired',requestId:string) {return this.db.transaction(async tx=>{const claimed=await tx.insert(factoryLedger).values({requestId,actorId:'admin',action:`order-${status}`,resource:id,delta:{},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});const [order]=await tx.select().from(factoryOrders).where(eq(factoryOrders.id,id)).for('update');if(!order)throw new FactoryError(404,'Ordem não encontrada.');if(!claimed.length||order.status===status)return order;if(!['open','accepted'].includes(order.status))throw new FactoryError(409,'A ordem já foi encerrada.');const [next]=await tx.update(factoryOrders).set({status,updatedAt:new Date()}).where(eq(factoryOrders.id,id)).returning();return next!;});}
  async ghost(id:string,requestId:string){return this.db.transaction(async tx=>{
    const claimed=await tx.insert(factoryLedger).values({requestId,actorId:'admin',action:'ghost',resource:id,delta:{},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});if(!claimed.length)return {applied:false};
    const [order]=await tx.select().from(factoryOrders).where(eq(factoryOrders.id,id)).for('update');if(!order||!['open','accepted'].includes(order.status))throw new FactoryError(409,'Ordem indisponível.');
    const slots=await tx.select().from(factorySlots).where(eq(factorySlots.material,order.material)).for('update'),bags=order.pallets*18,total=slots.reduce((sum,slot)=>sum+slot.quantity,0),capacity=slots.reduce((sum,slot)=>sum+slot.capacity,0);
    if(order.kind==='purchase'&&total+bags>capacity)throw new FactoryError(409,'Não há vagas suficientes para a entrega.');if(order.kind==='sale'&&total<bags)throw new FactoryError(409,'Não há produto suficiente para a retirada.');
    let remaining=bags;for(const slot of order.kind==='purchase'?slots:[...slots].reverse()){if(!remaining)break;const amount=order.kind==='purchase'?Math.min(remaining,slot.capacity-slot.quantity):Math.min(remaining,slot.quantity),quantity=slot.quantity+(order.kind==='purchase'?amount:-amount);if(amount){await tx.update(factorySlots).set({quantity,revision:slot.revision+1,updatedAt:new Date()}).where(eq(factorySlots.marker,slot.marker));remaining-=amount;}}
    await tx.update(factoryOrders).set({status:'completed',updatedAt:new Date()}).where(eq(factoryOrders.id,id));await tx.update(factoryLedger).set({result:{bags}}).where(eq(factoryLedger.requestId,requestId));return {applied:true,bags};
  });}
}
