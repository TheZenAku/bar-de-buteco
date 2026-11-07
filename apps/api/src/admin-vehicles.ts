import {createHash,randomUUID} from 'node:crypto';
import {and,asc,desc,eq,ilike,inArray,or,sql} from 'drizzle-orm';
import {GARAGE,defaultVehicleColor,makePlate,vehicleDefinition,vehicleName,vehicleParts,writeVehicleParts,type AdminVehicleChange,type AdminVehicleCommand,type AdminVehicleRegistration,type AdminVehicles,type PublicUser} from '@bar/shared';
import type {Database} from './database/index.js';
import {adminVehicleRequests,controls,moderationActions,playerVehicles,profiles,users,wallets} from './database/schema.js';
import {AdminError,type AdminService} from './admin-service.js';

export class AdminVehiclesService {
  constructor(private db:Database,private admin:AdminService){}

  /** A new persistent vehicle, in the player's garage, with one key and an idempotent request receipt. */
  async register(actorId:string,command:AdminVehicleRegistration):Promise<{vehicleId:string;replayed:boolean}>{
    const receipt=`admin-vehicles:${command.requestId}`;
    const fingerprint=createHash('sha256').update(JSON.stringify({operation:'register',...command,requestId:undefined})).digest('hex');
    return this.db.transaction(async tx=>{
      const actor=await this.admin.actor(tx,actorId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receipt},0))`);
      const [previous]=await tx.select().from(adminVehicleRequests).where(eq(adminVehicleRequests.id,receipt));
      if(previous){
        if(previous.actorId!==actorId||previous.fingerprint!==fingerprint)throw new AdminError(409,'Este pedido já foi usado para outra alteração.');
        return {vehicleId:command.requestId,replayed:true};
      }
      const definition=vehicleDefinition(command.model);if(!definition)throw new AdminError(400,'Modelo de veículo desconhecido.');
      const [target]=await tx.select().from(users).where(eq(users.id,command.playerId)).for('share');
      if(!target?.verified)throw new AdminError(404,'Selecione um jogador com e-mail confirmado.');
      if(!this.admin.permissions(actor,{...target,banned:false}).canEditWallet)throw new AdminError(403,'Esta conta está protegida contra alterações por outro administrador.');
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`vehicle-owner:${target.id}`},0))`);
      await tx.select().from(wallets).where(eq(wallets.userId,target.id)).for('update');
      const [owned]=await tx.select({count:sql<number>`count(*)`.mapWith(Number)}).from(playerVehicles).where(eq(playerVehicles.userId,target.id));
      if(owned.count>=GARAGE.VEHICLE_LIMIT)throw new AdminError(409,`O jogador já tem o máximo de ${GARAGE.VEHICLE_LIMIT} veículos.`);
      const parts=writeVehicleParts(command.model,Object.fromEntries(vehicleParts(command.model).map(part=>[part.id,100])));
      let plate='';
      for(let attempt=0;attempt<32;attempt++){
        const proposed=command.plate??makePlate();
        const inserted=await tx.insert(playerVehicles).values({id:command.requestId,userId:target.id,model:command.model,parts,plate:proposed,color:command.color??defaultVehicleColor(command.model)})
          .onConflictDoNothing().returning({id:playerVehicles.id});
        if(inserted.length){plate=proposed;break;}
        if(command.plate)throw new AdminError(409,'Esta placa já está registrada em outro veículo.');
      }
      if(!plate)throw new AdminError(409,'Não foi possível emplacar o veículo. Tente novamente com outro pedido.');
      await tx.insert(controls).values({id:randomUUID(),payload:{action:'sync',playerId:target.id,issuedAt:Date.now()}});
      await tx.insert(moderationActions).values({id:receipt,actorId,userId:target.id,action:'vehicle-register',reason:`${command.reason} · ${definition.name} · ${plate}`});
      await tx.insert(adminVehicleRequests).values({id:receipt,actorId,fingerprint,changed:1,skipped:0});
      return {vehicleId:command.requestId,replayed:false};
    });
  }

  async list(actor:PublicUser,query:{search:string;ownerId?:string;model?:string;offset:number;limit:number}):Promise<AdminVehicles>{
    const term=`%${query.search.replace(/[\\%_]/g,'\\$&')}%`;
    const filter=and(query.search?or(ilike(playerVehicles.plate,term),ilike(profiles.displayName,term),ilike(users.username,term)):undefined,
      query.ownerId?eq(playerVehicles.userId,query.ownerId):undefined,query.model?eq(playerVehicles.model,query.model):undefined);
    const [rows,[count]]=await Promise.all([
      this.db.select({vehicle:playerVehicles,owner:users,name:profiles.displayName}).from(playerVehicles).innerJoin(users,eq(users.id,playerVehicles.userId)).innerJoin(profiles,eq(profiles.userId,users.id))
        .where(filter).orderBy(desc(playerVehicles.boughtAt),asc(playerVehicles.id)).limit(query.limit).offset(query.offset),
      this.db.select({total:sql<number>`count(*)`.mapWith(Number)}).from(playerVehicles).innerJoin(users,eq(users.id,playerVehicles.userId)).innerJoin(profiles,eq(profiles.userId,users.id)).where(filter),
    ]);
    return {vehicles:rows.map(({vehicle,owner,name})=>({...vehicle,boughtAt:vehicle.boughtAt.getTime(),name:vehicleName(vehicle.model),ownerId:owner.id,ownerName:name,ownerUsername:owner.username,
      canEdit:this.admin.permissions(actor,{...owner,banned:false}).canEditWallet})),total:count.total,offset:query.offset,limit:query.limit};
  }

  async change(actorId:string,command:AdminVehicleCommand):Promise<{changed:number;skipped:number;replayed:boolean}>{
    const ids=[...new Set(command.ids??[])].sort(),receipt=`admin-vehicles:${command.requestId}`;
    const fingerprint=createHash('sha256').update(JSON.stringify({...command,ids,requestId:undefined})).digest('hex');
    return this.db.transaction(async tx=>{
      const actor=await this.admin.actor(tx,actorId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receipt},0))`);
      const [previous]=await tx.select().from(adminVehicleRequests).where(eq(adminVehicleRequests.id,receipt));
      if(previous){
        if(previous.actorId!==actorId||previous.fingerprint!==fingerprint)throw new AdminError(409,'Este pedido já foi usado para outra alteração.');
        return {changed:previous.changed,skipped:previous.skipped,replayed:true};
      }
      let target:typeof users.$inferSelect|undefined;
      if(command.operation==='transfer'){
        [target]=await tx.select().from(users).where(eq(users.id,command.targetId!)).for('share');
        if(!target?.verified)throw new AdminError(404,'Selecione um jogador com e-mail confirmado.');
        if(!this.admin.permissions(actor,{...target,banned:false}).canEditWallet)throw new AdminError(403,'Esta conta está protegida contra alterações por outro administrador.');
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`vehicle-owner:${target.id}`},0))`);
        // Purchases and player trades lock the receiving wallet before changing vehicle ownership.
        await tx.select().from(wallets).where(eq(wallets.userId,target.id)).for('update');
      }
      const rows=await tx.select({vehicle:playerVehicles,owner:users}).from(playerVehicles).innerJoin(users,eq(users.id,playerVehicles.userId))
        .where(command.all?undefined:inArray(playerVehicles.id,ids)).orderBy(asc(playerVehicles.id)).for('update',{of:playerVehicles});
      if(!command.all&&rows.length!==ids.length)throw new AdminError(404,'Um dos veículos não existe mais. Atualize a lista.');
      // Keep the owners' roles stable too: promoting an account must not race a change to its vehicles.
      const currentOwners=rows.length?await tx.select().from(users).where(inArray(users.id,[...new Set(rows.map(row=>row.owner.id))])).for('share'):[];
      const allowed=rows.filter(row=>{const owner=currentOwners.find(user=>user.id===row.owner.id);return owner&&this.admin.permissions(actor,{...owner,banned:false}).canEditWallet;});
      if(!command.all&&allowed.length!==rows.length)throw new AdminError(403,'Um dos proprietários está protegido contra alterações por outro administrador.');
      if(command.operation==='paint'&&allowed.some(row=>!vehicleDefinition(row.vehicle.model)?.paintable))throw new AdminError(400,'Um dos modelos selecionados não oferece pintura personalizada.');
      if(command.operation==='plate'){
        if(allowed.length!==1)throw new AdminError(400,'Selecione somente um veículo para personalizar a placa.');
        const [existing]=await tx.select({id:playerVehicles.id}).from(playerVehicles).where(eq(playerVehicles.plate,command.plate!));
        if(existing&&existing.id!==allowed[0]!.vehicle.id)throw new AdminError(409,'Esta placa já está registrada em outro veículo.');
      }
      if(target){
        if(allowed.some(row=>row.owner.id===target!.id))throw new AdminError(409,'O destinatário já é dono de um dos veículos selecionados.');
        const [owned]=await tx.select({count:sql<number>`count(*)`.mapWith(Number)}).from(playerVehicles).where(eq(playerVehicles.userId,target.id));
        if(owned.count+allowed.length>GARAGE.VEHICLE_LIMIT)throw new AdminError(409,`O destinatário pode ter no máximo ${GARAGE.VEHICLE_LIMIT} veículos.`);
      }
      const changes:AdminVehicleChange[]=[],affected=new Set<string>();
      for(const {vehicle,owner} of allowed){
        const parts=command.operation==='repair'?writeVehicleParts(vehicle.model,Object.fromEntries(vehicleParts(vehicle.model).map(part=>[part.id,100]))):vehicle.parts;
        const fuel=command.operation==='refuel'?100:vehicle.fuel,revision=vehicle.revision+1;
        const ownerId=target?.id??owner.id,color=command.operation==='paint'?command.color!:vehicle.color;
        const plate=command.operation==='plate'?command.plate!:vehicle.plate;
        if(command.operation==='delete')await tx.delete(playerVehicles).where(eq(playerVehicles.id,vehicle.id));
        else await tx.update(playerVehicles).set({parts,fuel,revision,userId:ownerId,color,plate,updatedAt:new Date()}).where(eq(playerVehicles.id,vehicle.id));
        changes.push({id:vehicle.id,ownerId,revision,parts,fuel,mileage:vehicle.mileage,color,plate});affected.add(owner.id);affected.add(ownerId);
      }
      for(let i=0;i<changes.length;i+=100)await tx.insert(controls).values({id:randomUUID(),payload:{action:'vehicles',operation:command.operation,vehicles:changes.slice(i,i+100),playerIds:[...affected],issuedAt:Date.now()}});
      const result={changed:allowed.length,skipped:rows.length-allowed.length,replayed:false};
      const description=`${command.reason} · ${allowed.length} veículo(s) · ${allowed.map(row=>row.vehicle.plate).join(', ')}${target?` → @${target.username}`:''}${command.operation==='plate'?` → ${command.plate}`:''}`;
      await tx.insert(moderationActions).values({id:receipt,actorId,userId:allowed.length===1?allowed[0]!.owner.id:null,action:`vehicle-${command.operation}`,reason:description});
      await tx.insert(adminVehicleRequests).values({id:receipt,actorId,fingerprint,changed:result.changed,skipped:result.skipped});
      return result;
    }).catch(error=>{
      // Two administrators can choose the same free plate at once; the unique index decides the winner.
      const cause=error?.cause??error;
      if(cause?.code==='23505')throw new AdminError(409,'Esta placa já está registrada em outro veículo.');
      throw error;
    });
  }
}
