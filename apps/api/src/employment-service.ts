import {randomUUID} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import type {Database} from './database/index.js';
import {employmentEvents,employmentShifts,employments} from './database/schema.js';

export const FACTORY_JOB_ID='spray-dry-operator';
export class EmploymentError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export interface EmploymentConfig {contractSlots:number;shiftSlots:number;cooldownMs:number;singleEmployment:boolean}
export const DEFAULT_EMPLOYMENT_CONFIG:EmploymentConfig={contractSlots:12,shiftSlots:6,cooldownMs:24*60*60_000,singleEmployment:true};

export class EmploymentService {
  constructor(private db:Database,private config:EmploymentConfig=DEFAULT_EMPLOYMENT_CONFIG){}
  async view(userId:string){const [employment]=await this.db.select().from(employments).where(eq(employments.userId,userId));const [shift]=await this.db.select().from(employmentShifts).where(and(eq(employmentShifts.userId,userId),sql`${employmentShifts.endedAt} is null`));return {employment:employment??null,shift:shift??null,config:this.config};}
  async hire(userId:string,requestId:string,jobId=FACTORY_JOB_ID){
    return this.db.transaction(async tx=>{
      const [replay]=await tx.select().from(employmentEvents).where(eq(employmentEvents.requestId,requestId));if(replay){const [employment]=await tx.select().from(employments).where(eq(employments.userId,userId));return {employment,applied:false};}
      const [previous]=await tx.select().from(employments).where(eq(employments.userId,userId)).for('update');
      if(previous?.status==='hired')return {employment:previous,applied:false};
      if(previous?.cooldownUntil&&previous.cooldownUntil.getTime()>Date.now())throw new EmploymentError(409,`Aguarde até ${previous.cooldownUntil.toLocaleString('pt-BR')} para se candidatar novamente.`);
      const [{count=0}={}]=await tx.select({count:sql<number>`count(*)`.mapWith(Number)}).from(employments).where(and(eq(employments.jobId,jobId),eq(employments.status,'hired')));
      if(count>=this.config.contractSlots)throw new EmploymentError(409,'Não há vagas de contrato abertas.');
      const now=new Date();let employment;
      if(previous)[employment]=await tx.update(employments).set({jobId,status:'hired',hiredAt:now,resignedAt:null,cooldownUntil:null,updatedAt:now}).where(eq(employments.userId,userId)).returning();
      else [employment]=await tx.insert(employments).values({userId,jobId}).returning();
      await tx.insert(employmentEvents).values({id:randomUUID(),userId,jobId,kind:'hired',requestId,details:{}}).onConflictDoNothing();return {employment,applied:true};
    });
  }
  async resign(userId:string,requestId:string){return this.db.transaction(async tx=>{
    const [replay]=await tx.select().from(employmentEvents).where(eq(employmentEvents.requestId,requestId));if(replay){const [employment]=await tx.select().from(employments).where(eq(employments.userId,userId));return {employment};}
    const [row]=await tx.select().from(employments).where(eq(employments.userId,userId)).for('update');if(!row||row.status!=='hired')throw new EmploymentError(409,'Você não possui emprego ativo.');
    const now=new Date(),cooldownUntil=new Date(now.getTime()+this.config.cooldownMs);
    const [employment]=await tx.update(employments).set({status:'resigned',resignedAt:now,cooldownUntil,updatedAt:now}).where(eq(employments.userId,userId)).returning();
    await tx.update(employmentShifts).set({endedAt:now}).where(and(eq(employmentShifts.userId,userId),sql`${employmentShifts.endedAt} is null`));
    await tx.insert(employmentEvents).values({id:randomUUID(),userId,jobId:row.jobId,kind:'resigned',requestId,details:{cooldownUntil}}).onConflictDoNothing();return {employment};
  });}
  async startShift(userId:string,requestId:string,station='entrada'){return this.db.transaction(async tx=>{
    const [replay]=await tx.select().from(employmentShifts).where(eq(employmentShifts.requestId,requestId));if(replay)return replay;
    const [employment]=await tx.select().from(employments).where(and(eq(employments.userId,userId),eq(employments.status,'hired')));if(!employment)throw new EmploymentError(403,'Seja contratado antes de entrar em expediente.');
    const [existing]=await tx.select().from(employmentShifts).where(and(eq(employmentShifts.userId,userId),sql`${employmentShifts.endedAt} is null`));if(existing)return existing;
    const [{count=0}={}]=await tx.select({count:sql<number>`count(*)`.mapWith(Number)}).from(employmentShifts).where(and(eq(employmentShifts.jobId,employment.jobId),sql`${employmentShifts.endedAt} is null`));if(count>=this.config.shiftSlots)throw new EmploymentError(409,'Todas as vagas de expediente estão ocupadas.');
    const [shift]=await tx.insert(employmentShifts).values({id:randomUUID(),userId,jobId:employment.jobId,requestId,station}).returning();return shift!;
  });}
  async stopShift(userId:string){const [shift]=await this.db.update(employmentShifts).set({endedAt:new Date()}).where(and(eq(employmentShifts.userId,userId),sql`${employmentShifts.endedAt} is null`)).returning();if(!shift)throw new EmploymentError(409,'Você não está em expediente.');return shift;}
  async list(){return {employments:await this.db.select().from(employments),shifts:await this.db.select().from(employmentShifts).where(sql`${employmentShifts.endedAt} is null`),config:this.config};}
  async dismiss(userId:string,requestId:string,cooldownMs=this.config.cooldownMs){return this.db.transaction(async tx=>{
    const [replay]=await tx.select().from(employmentEvents).where(eq(employmentEvents.requestId,requestId));if(replay){const [employment]=await tx.select().from(employments).where(eq(employments.userId,userId));return employment;}
    const [row]=await tx.select().from(employments).where(eq(employments.userId,userId)).for('update');if(!row)throw new EmploymentError(404,'Vínculo não encontrado.');const now=new Date(),cooldownUntil=cooldownMs>0?new Date(now.getTime()+cooldownMs):null;
    const [employment]=await tx.update(employments).set({status:'dismissed',resignedAt:now,cooldownUntil,updatedAt:now}).where(eq(employments.userId,userId)).returning();await tx.update(employmentShifts).set({endedAt:now}).where(and(eq(employmentShifts.userId,userId),sql`${employmentShifts.endedAt} is null`));await tx.insert(employmentEvents).values({id:randomUUID(),userId,jobId:row.jobId,kind:'dismissed',requestId,details:{cooldownUntil}});return employment;
  });}
  async clearCooldown(userId:string,requestId:string){return this.db.transaction(async tx=>{const [replay]=await tx.select().from(employmentEvents).where(eq(employmentEvents.requestId,requestId));if(replay)return {applied:false};const [row]=await tx.update(employments).set({cooldownUntil:null,updatedAt:new Date()}).where(eq(employments.userId,userId)).returning();if(!row)throw new EmploymentError(404,'Vínculo não encontrado.');await tx.insert(employmentEvents).values({id:randomUUID(),userId,jobId:row.jobId,kind:'cooldown_cleared',requestId,details:{}});return {employment:row,applied:true};});}
  async setSchedule(userId:string,schedule:Record<string,unknown>,requestId:string){return this.db.transaction(async tx=>{const [replay]=await tx.select().from(employmentEvents).where(eq(employmentEvents.requestId,requestId));if(replay)return {applied:false};const [row]=await tx.update(employments).set({schedule,updatedAt:new Date()}).where(eq(employments.userId,userId)).returning();if(!row)throw new EmploymentError(404,'Vínculo não encontrado.');await tx.insert(employmentEvents).values({id:randomUUID(),userId,jobId:row.jobId,kind:'schedule_updated',requestId,details:{schedule}});return {employment:row,applied:true};});}
}
