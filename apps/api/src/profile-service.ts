import {createHash,randomUUID} from 'node:crypto';
import {and,asc,desc,eq,inArray,isNotNull,sql} from 'drizzle-orm';
import {isSkillKey,PROFILE,skillsOf,skinBase,type AdminBadge,type AdminBadgeHolder,type Badge,type BadgeRarity,type ProfileView,type SkillLoadout,type SkillLoadouts} from '@bar/shared';
import type {Database} from './database/index.js';
import {badgeImages,badges,moderationActions,profiles,skillInventory,userBadges,users} from './database/schema.js';
import type {PhoneService} from './phone-service.js';

export class ProfileError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
const badgeColumns={id:badges.id,name:badges.name,description:badges.description,icon:badges.icon,color:badges.color,rarity:badges.rarity,image:badges.image};
const PNG_SIGNATURE=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
/** The size of a whole PNG, read from its chunks: IHDR first, image data, and an IEND inside the file. Undefined for anything else. */
function pngSize(bytes:Buffer):{width:number;height:number}|undefined {
  if(bytes.length<33||!bytes.subarray(0,8).equals(PNG_SIGNATURE)||bytes.readUInt32BE(8)!==13||bytes.toString('latin1',12,16)!=='IHDR')return undefined;
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height)return undefined;
  let hasData=false;
  for(let at=8;at+12<=bytes.length;){
    const type=bytes.toString('latin1',at+4,at+8);
    at+=12+bytes.readUInt32BE(at);
    if(at>bytes.length)return undefined;
    if(type==='IDAT')hasData=true;
    if(type==='IEND')return hasData?{width,height}:undefined;
  }
  return undefined;
}

/** The profile window (docs/sistemas/perfil.md): what anyone sees of a player, what they edit in their own, and the badges in the administration. */
export class ProfileService {
  constructor(private db:Database,private phone:PhoneService){}

  async view(viewer:string,userId:string):Promise<ProfileView>{
    const card=await this.phone.card(viewer,userId),mine=viewer===userId;
    const [[profile],owned,skills]=await Promise.all([
      this.db.select({skin:profiles.equippedSkin,status:profiles.statusMessage,loadouts:profiles.skillLoadouts}).from(profiles).where(eq(profiles.userId,userId)),
      this.db.select({...badgeColumns,shownAt:userBadges.shownAt}).from(userBadges).innerJoin(badges,eq(userBadges.badgeId,badges.id)).where(eq(userBadges.userId,userId)).orderBy(desc(userBadges.grantedAt),asc(badges.name)),
      mine?this.db.select({id:skillInventory.skillId}).from(skillInventory).where(eq(skillInventory.userId,userId)):Promise.resolve([]),
    ]);
    if(!profile)throw new ProfileError(404,'Jogador não encontrado.');
    const plain=({shownAt:_,...badge}:Badge&{shownAt:number|null}):Badge=>badge;
    return {
      id:userId,name:card.name,color:card.color,skin:profile.skin,status:profile.status,mine,
      handle:card.gram.author.handle,...(card.gram.author.photo?{photo:card.gram.author.photo}:{}),number:card.number,saved:card.saved,
      badges:owned.filter(badge=>badge.shownAt!==null).sort((a,b)=>a.shownAt!-b.shownAt!).map(plain),
      ...(mine?{owned:owned.map(plain),loadouts:profile.loadouts as SkillLoadouts,ownedSkills:skills.map(skill=>skill.id)}:{}),
    };
  }
  async setStatus(userId:string,status:string):Promise<ProfileView>{
    await this.db.update(profiles).set({statusMessage:status}).where(eq(profiles.userId,userId));
    return this.view(userId,userId);
  }
  /** `ids`, in order, go on show; only badges the player has. */
  async showBadges(userId:string,ids:string[]):Promise<ProfileView>{
    await this.db.transaction(async tx=>{
      const owned=new Set((await tx.select({id:userBadges.badgeId}).from(userBadges).where(eq(userBadges.userId,userId))).map(row=>row.id));
      if(ids.some(id=>!owned.has(id)))throw new ProfileError(403,'Você não tem este emblema.');
      await tx.update(userBadges).set({shownAt:null}).where(and(eq(userBadges.userId,userId),isNotNull(userBadges.shownAt)));
      for(const [index,id] of ids.entries())await tx.update(userBadges).set({shownAt:index}).where(and(eq(userBadges.userId,userId),eq(userBadges.badgeId,id)));
    });
    return this.view(userId,userId);
  }
  /** The active skill and its key for the character the player is wearing, whichever variant of it. */
  async setLoadout(userId:string,loadout:SkillLoadout):Promise<ProfileView>{
    await this.db.transaction(async tx=>{
      const [profile]=await tx.select({skin:profiles.equippedSkin,loadouts:profiles.skillLoadouts}).from(profiles).where(eq(profiles.userId,userId)).for('update');
      if(!profile)throw new ProfileError(404,'Jogador não encontrado.');
      if(!skillsOf(profile.skin).some(skill=>skill.id===loadout.skill))throw new ProfileError(400,'Esta skin não tem essa skill.');
      if(!(await tx.select({id:skillInventory.skillId}).from(skillInventory).where(and(eq(skillInventory.userId,userId),eq(skillInventory.skillId,loadout.skill)))).length)throw new ProfileError(403,'Compre esta habilidade na coleção antes de usar.');
      if(!isSkillKey(loadout.key))throw new ProfileError(400,'Esta tecla já é usada pelo jogo.');
      await tx.update(profiles).set({skillLoadouts:{...(profile.loadouts as SkillLoadouts),[skinBase(profile.skin)]:loadout}}).where(eq(profiles.userId,userId));
    });
    return this.view(userId,userId);
  }

  async catalog():Promise<AdminBadge[]>{
    return this.db.select({...badgeColumns,holders:sql<number>`count(${userBadges.userId})`.mapWith(Number)}).from(badges).leftJoin(userBadges,eq(userBadges.badgeId,badges.id))
      .groupBy(badges.id).orderBy(asc(badges.name));
  }
  async holders(badgeId:string):Promise<AdminBadgeHolder[]>{
    const rows=await this.db.select({id:userBadges.userId,name:profiles.displayName,grantedAt:userBadges.grantedAt}).from(userBadges).innerJoin(profiles,eq(profiles.userId,userBadges.userId))
      .where(eq(userBadges.badgeId,badgeId)).orderBy(desc(userBadges.grantedAt)).limit(200);
    return rows.map(row=>({...row,grantedAt:row.grantedAt.toISOString()}));
  }
  private audit(tx:Pick<Database,'insert'>,actor:string,action:string,reason:string,detail:string,userId?:string){
    return tx.insert(moderationActions).values({id:randomUUID(),actorId:actor,...(userId?{userId}:{}),action,reason:`${reason} · ${detail}`});
  }
  /** Creates a badge, or edits the one with `id`. Without `image` or `rarity`, an edit keeps the one it has, and a new badge starts common. */
  async saveBadge(actor:string,badge:Omit<Badge,'id'|'image'|'rarity'>&{image?:string|null|undefined;rarity?:BadgeRarity|undefined},reason:string,id?:string):Promise<AdminBadge[]>{
    await this.db.transaction(async tx=>{
      if(badge.image&&!(await tx.select({id:badgeImages.id}).from(badgeImages).where(eq(badgeImages.id,badge.image))).length)throw new ProfileError(404,'Imagem não encontrada. Envie o arquivo de novo.');
      if(id){
        const [changed]=await tx.update(badges).set(badge).where(eq(badges.id,id)).returning({id:badges.id});
        if(!changed)throw new ProfileError(404,'Emblema não encontrado.');
        await this.audit(tx,actor,'badge-edit',reason,badge.name);
      }else{
        const base=badge.name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32)||'emblema';
        const taken=new Set((await tx.select({id:badges.id}).from(badges)).map(row=>row.id));
        let next=base;for(let n=2;taken.has(next);n++)next=`${base}-${n}`;
        await tx.insert(badges).values({id:next,...badge});
        await this.audit(tx,actor,'badge-create',reason,badge.name);
      }
    });
    return this.catalog();
  }
  /** Takes it from everyone who has it too. */
  async deleteBadge(actor:string,id:string,reason:string):Promise<AdminBadge[]>{
    await this.db.transaction(async tx=>{
      const [removed]=await tx.delete(badges).where(eq(badges.id,id)).returning({name:badges.name});
      if(!removed)throw new ProfileError(404,'Emblema não encontrado.');
      await this.audit(tx,actor,'badge-delete',reason,removed.name);
    });
    return this.catalog();
  }
  /** The images sent, newest first. They stay on the server until someone deletes them, used by a badge or not. */
  async images():Promise<string[]>{
    return (await this.db.select({id:badgeImages.id}).from(badgeImages).orderBy(desc(badgeImages.createdAt),asc(badgeImages.id))).map(row=>row.id);
  }
  async image(id:string):Promise<Buffer>{
    const [row]=await this.db.select({bytes:badgeImages.bytes}).from(badgeImages).where(eq(badgeImages.id,id));
    if(!row)throw new ProfileError(404,'Imagem não encontrada.');
    return row.bytes;
  }
  /** Keeps a PNG and answers its id; the same file sent again is the same image. */
  async saveImage(actor:string,bytes:Buffer):Promise<string>{
    const size=pngSize(bytes);
    if(!size)throw new ProfileError(400,'Este arquivo não é um PNG válido.');
    if(Math.max(size.width,size.height)>PROFILE.badgeImageSide)throw new ProfileError(400,`Use uma imagem de até ${PROFILE.badgeImageSide} × ${PROFILE.badgeImageSide} pixels.`);
    const id=createHash('sha256').update(bytes).digest('hex');
    await this.db.transaction(async tx=>{
      const inserted=await tx.insert(badgeImages).values({id,bytes,size:bytes.length}).onConflictDoNothing().returning({id:badgeImages.id});
      if(inserted.length)await this.audit(tx,actor,'badge-image-upload','Arquivo enviado pelo painel',`${size.width} × ${size.height} px, ${bytes.length} bytes`);
    });
    return id;
  }
  /** Only an image no badge uses. */
  async deleteImage(actor:string,id:string,reason:string):Promise<string[]>{
    await this.db.transaction(async tx=>{
      const using=await tx.select({name:badges.name}).from(badges).where(eq(badges.image,id));
      if(using.length)throw new ProfileError(409,`O emblema ${using[0]!.name} usa esta imagem.`);
      const [removed]=await tx.delete(badgeImages).where(eq(badgeImages.id,id)).returning({size:badgeImages.size});
      if(!removed)throw new ProfileError(404,'Imagem não encontrada.');
      await this.audit(tx,actor,'badge-image-delete',reason,`${removed.size} bytes`);
    });
    return this.images();
  }
  async grant(actor:string,playerId:string,badgeId:string,grant:boolean,reason:string):Promise<{message:string}>{
    return this.db.transaction(async tx=>{
      const [[badge],[person]]=await Promise.all([
        tx.select({name:badges.name}).from(badges).where(eq(badges.id,badgeId)),
        tx.select({name:profiles.displayName}).from(users).innerJoin(profiles,eq(profiles.userId,users.id)).where(eq(users.id,playerId)),
      ]);
      if(!badge)throw new ProfileError(404,'Emblema não encontrado.');
      if(!person)throw new ProfileError(404,'Jogador não encontrado.');
      if(grant){
        const inserted=await tx.insert(userBadges).values({userId:playerId,badgeId}).onConflictDoNothing().returning({id:userBadges.badgeId});
        if(!inserted.length)throw new ProfileError(409,`${person.name} já tem o emblema ${badge.name}.`);
        await this.audit(tx,actor,'badge-grant',reason,badge.name,playerId);
        return {message:`Emblema ${badge.name} concedido a ${person.name}.`};
      }
      const removed=await tx.delete(userBadges).where(and(eq(userBadges.userId,playerId),eq(userBadges.badgeId,badgeId))).returning({id:userBadges.badgeId});
      if(!removed.length)throw new ProfileError(409,`${person.name} não tem o emblema ${badge.name}.`);
      await this.audit(tx,actor,'badge-revoke',reason,badge.name,playerId);
      return {message:`Emblema ${badge.name} retirado de ${person.name}.`};
    });
  }
}
