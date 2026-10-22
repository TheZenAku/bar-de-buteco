import {randomUUID} from 'node:crypto';
import {eq,sql} from 'drizzle-orm';
import type {Database} from './database/index.js';
import {users,moderationActions} from './database/schema.js';

export const OWNER_EMAIL='rafaelrodrigues-2017@hotmail.com';
export const isOwnerEmail=(email:string)=>email.trim().toLowerCase()===OWNER_EMAIL;

// Do not create an account, change a password or bypass the configured e-mail verification policy.
export async function ensureOwnerAdministrator(db:Database){
  return db.transaction(async tx=>{
    const [owner]=await tx.select().from(users).where(sql`lower(${users.email})=${OWNER_EMAIL}`).for('update');
    if(!owner)return {present:false,enabled:false,promoted:false};
    if(!owner.verified)return {present:true,enabled:false,promoted:false};
    if(owner.role==='admin')return {present:true,enabled:true,promoted:false};
    await tx.update(users).set({role:'admin'}).where(eq(users.id,owner.id));
    await tx.insert(moderationActions).values({id:randomUUID(),actorId:owner.id,userId:owner.id,action:'owner-bootstrap',reason:'Conta principal designada pelo operador do jogo.'});
    return {present:true,enabled:true,promoted:true};
  });
}
