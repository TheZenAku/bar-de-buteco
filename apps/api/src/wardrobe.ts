import {randomUUID} from 'node:crypto';
import {and,eq,inArray,sql} from 'drizzle-orm';
import {barDayKey,DEFAULT_SKIN,SKILLS,SKINS,priceEntry,skillById,skinById,type AdminCatalogEntry,type CatalogAvailability,type PublicUser,type Rarity,type Wardrobe} from '@bar/shared';
import type {Database} from './database/index.js';
import {currencyLedger,moderationActions,profiles,skillInventory,skinCatalog,skinInventory,wallets} from './database/schema.js';
import {PricingService} from './pricing-service.js';

export class WardrobeError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
// The default skin is free and belongs to every account without an inventory row.
const owns=(inventory:Array<{skinId:string}>,skin:string)=>skin===DEFAULT_SKIN||inventory.some(item=>item.skinId===skin);
interface CatalogOverride {rarity:Rarity;description:string;availability:CatalogAvailability}
/** Skin prices, the welcome coins and the daily bonus come from the price table (PricingService, Preços in the panel). */
export class WardrobeService {
  constructor(private db:Database,readonly pricing=new PricingService(db)){}
  private skinPrice=(prices:Readonly<Record<string,number>>,skin:string)=>skin===DEFAULT_SKIN?0:prices[`skin:${skin}`]??0;
  /** What the administration changed on the cards and skills, by key. */
  private async overrides():Promise<Map<string,CatalogOverride>>{
    const rows=await this.db.select().from(skinCatalog);
    return new Map(rows.map(row=>[row.key,{rarity:row.rarity as Rarity,description:row.description,availability:row.availability as CatalogAvailability}]));
  }
  async initialize(userId:string){
    const initialCoins=await this.pricing.get('reward:initial');
    await this.db.transaction(async tx=>{
      const inserted=await tx.insert(wallets).values({userId,balance:initialCoins}).onConflictDoNothing().returning();
      if(inserted.length)await tx.insert(currencyLedger).values({id:`welcome:${userId}`,userId,amount:initialCoins,reason:'welcome'});
    });
  }
  async view(user:PublicUser):Promise<Wardrobe>{
    await this.initialize(user.id);
    const prices=await this.pricing.table();
    const [[profile],[wallet],inventory,skills,overrides,[daily]]=await Promise.all([
      this.db.select().from(profiles).where(eq(profiles.userId,user.id)),this.db.select().from(wallets).where(eq(wallets.userId,user.id)),
      this.db.select().from(skinInventory).where(eq(skinInventory.userId,user.id)),
      this.db.select().from(skillInventory).where(eq(skillInventory.userId,user.id)),
      this.overrides(),
      this.db.select().from(currencyLedger).where(eq(currencyLedger.id,this.dailyKey(user.id))),
    ]);
    const catalog=SKINS.flatMap(skin=>{
      const set=overrides.get(`skin:${skin.id}`),owned=owns(inventory,skin.id),availability=set?.availability??(skin.adminOnly?'hidden':'sale');
      // A hidden card stays with whoever has it, and does not exist for anyone else.
      if(availability==='hidden'&&!owned)return [];
      return [{id:skin.id,name:skin.name,base:skin.base,variant:skin.variant,rarity:set?.rarity??skin.rarity,accent:skin.accent,description:set?.description??skin.description,
        price:this.skinPrice(prices,skin.id),owned,available:availability==='sale'}];
    });
    const shown=SKILLS.flatMap(skill=>{
      const set=overrides.get(`skill:${skill.id}`),owned=skills.some(row=>row.skillId===skill.id),availability=set?.availability??'sale';
      if(availability==='hidden'&&!owned)return [];
      return [{id:skill.id,skin:skill.skin,name:skill.name,description:set?.description??skill.description,icon:skill.icon,rarity:set?.rarity??skill.rarity,price:prices[`skill:${skill.id}`]??0,owned,available:availability==='sale'}];
    });
    return {equippedSkin:profile.equippedSkin,balance:wallet.balance,catalog,skills:shown,dailyReward:prices['reward:daily']??0,dailyClaimed:!!daily};
  }
  private dailyKey(userId:string){return `daily:${userId}:${barDayKey()}`;}
  async claimDaily(user:PublicUser){
    if(!user.verified)throw new WardrobeError(403,'Confirme seu e-mail para receber moedas.');
    const dailyReward=await this.pricing.get('reward:daily');
    if(!dailyReward)throw new WardrobeError(409,'O bônus diário está desativado.');
    await this.initialize(user.id);
    await this.db.transaction(async tx=>{
      await tx.select().from(wallets).where(eq(wallets.userId,user.id)).for('update');
      const inserted=await tx.insert(currencyLedger).values({id:this.dailyKey(user.id),userId:user.id,amount:dailyReward,reason:'daily'}).onConflictDoNothing().returning();
      if(inserted.length)await tx.update(wallets).set({balance:sql`${wallets.balance}+${dailyReward}`}).where(eq(wallets.userId,user.id));
    });
    return this.view(user);
  }
  async buy(user:PublicUser,skinId:string){
    const skin=skinById(skinId);if(!skin)throw new WardrobeError(400,'Skin inválida.');
    if(!user.verified)throw new WardrobeError(403,'Confirme seu e-mail antes de comprar.');
    if(skinId===DEFAULT_SKIN)return this.view(user);
    await this.initialize(user.id);
    await this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,user.id)).for('update');
      const [owned]=await tx.select().from(skinInventory).where(and(eq(skinInventory.userId,user.id),eq(skinInventory.skinId,skinId)));
      if(owned)return;
      const [set]=await tx.select({availability:skinCatalog.availability}).from(skinCatalog).where(eq(skinCatalog.key,`skin:${skinId}`));
      // The Morte (adminOnly) is never sold, whatever the catalog row says; the administration grants it.
      if(skin.adminOnly||(set&&set.availability!=='sale'))throw new WardrobeError(409,'Esta carta não está à venda.');
      const price=this.skinPrice(await this.pricing.table(),skinId);
      if(wallet.balance<price)throw new WardrobeError(409,'Moedas insuficientes para esta skin.');
      await tx.update(wallets).set({balance:wallet.balance-price}).where(eq(wallets.userId,user.id));
      await tx.insert(skinInventory).values({userId:user.id,skinId});
      // One row per purchase: the administration can take a card away, and it can be bought again.
      await tx.insert(currencyLedger).values({id:`purchase:${user.id}:${skinId}:${randomUUID()}`,userId:user.id,amount:-price,reason:`skin:${skinId}`});
    });
    return this.view(user);
  }
  /** A skill is the character's: it takes owning one of its cards, and then it works in all of them. */
  async buySkill(user:PublicUser,skillId:string){
    const skill=skillById(skillId);if(!skill)throw new WardrobeError(400,'Habilidade inválida.');
    if(!user.verified)throw new WardrobeError(403,'Confirme seu e-mail antes de comprar.');
    await this.initialize(user.id);
    await this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,user.id)).for('update');
      const [owned]=await tx.select().from(skillInventory).where(and(eq(skillInventory.userId,user.id),eq(skillInventory.skillId,skillId)));
      if(owned)return;
      const family=SKINS.filter(skin=>skin.base===skill.skin).map(skin=>skin.id as string);
      const cards=await tx.select({id:skinInventory.skinId}).from(skinInventory).where(and(eq(skinInventory.userId,user.id),inArray(skinInventory.skinId,family)));
      if(!cards.length&&!family.includes(DEFAULT_SKIN))throw new WardrobeError(403,`Tenha uma carta de ${skinById(skill.skin)?.name??skill.skin} antes de comprar esta habilidade.`);
      const [set]=await tx.select({availability:skinCatalog.availability}).from(skinCatalog).where(eq(skinCatalog.key,`skill:${skillId}`));
      if(set&&set.availability!=='sale')throw new WardrobeError(409,'Esta habilidade não está à venda.');
      const price=(await this.pricing.table())[`skill:${skillId}`]??0;
      if(wallet.balance<price)throw new WardrobeError(409,'Moedas insuficientes para esta habilidade.');
      await tx.update(wallets).set({balance:wallet.balance-price}).where(eq(wallets.userId,user.id));
      await tx.insert(skillInventory).values({userId:user.id,skillId});
      await tx.insert(currencyLedger).values({id:`purchase:${user.id}:skill:${skillId}:${randomUUID()}`,userId:user.id,amount:-price,reason:`skill:${skillId}`});
    });
    return this.view(user);
  }
  async equip(user:PublicUser,skin:string){
    if(!skinById(skin))throw new WardrobeError(400,'Skin inválida.');
    if(skin!==DEFAULT_SKIN){
      const [owned]=await this.db.select().from(skinInventory).where(and(eq(skinInventory.userId,user.id),eq(skinInventory.skinId,skin)));
      if(!owned)throw new WardrobeError(403,'Compre esta skin na loja antes de vestir.');
    }
    await this.db.update(profiles).set({equippedSkin:skin}).where(eq(profiles.userId,user.id));
    return this.view(user);
  }
  async access(user:PublicUser){
    const [inventory,skills]=await Promise.all([this.db.select().from(skinInventory).where(eq(skinInventory.userId,user.id)),this.db.select().from(skillInventory).where(eq(skillInventory.userId,user.id))]);
    return {equippedSkin:user.equippedSkin??DEFAULT_SKIN,ownedSkins:SKINS.map(s=>s.id as string).filter(skin=>owns(inventory,skin)),ownedSkills:skills.map(skill=>skill.skillId)};
  }

  /** The administration's Coleção: every card and skill with its settings, and how it has been doing. */
  async adminCatalog():Promise<AdminCatalogEntry[]>{
    const [overrides,prices,skinOwners,skillOwners,wearing,revenue,marks]=await Promise.all([
      this.overrides(),this.pricing.table(),
      this.db.select({id:skinInventory.skinId,n:sql<number>`count(*)`.mapWith(Number)}).from(skinInventory).groupBy(skinInventory.skinId),
      this.db.select({id:skillInventory.skillId,n:sql<number>`count(*)`.mapWith(Number)}).from(skillInventory).groupBy(skillInventory.skillId),
      this.db.select({id:profiles.equippedSkin,n:sql<number>`count(*)`.mapWith(Number)}).from(profiles).groupBy(profiles.equippedSkin),
      this.db.select({reason:currencyLedger.reason,total:sql<number>`coalesce(sum(-${currencyLedger.amount}),0)`.mapWith(Number)}).from(currencyLedger).where(sql`${currencyLedger.reason} like 'skin:%' or ${currencyLedger.reason} like 'skill:%'`).groupBy(currencyLedger.reason),
      this.db.select({key:skinCatalog.key,updatedAt:skinCatalog.updatedAt,updatedBy:profiles.displayName}).from(skinCatalog).leftJoin(profiles,eq(skinCatalog.updatedBy,profiles.userId)),
    ]);
    const count=(rows:Array<{id:string;n:number}>,id:string)=>rows.find(row=>row.id===id)?.n??0;
    const common=(key:string):Pick<AdminCatalogEntry,'key'|'price'|'defaultPrice'|'priceMin'|'priceMax'|'revenue'|'updatedAt'|'updatedBy'>=>{
      const entry=priceEntry(key),mark=marks.find(row=>row.key===key);
      return {key,price:prices[key]??0,defaultPrice:this.pricing.defaults[key]??0,priceMin:entry?.min??0,priceMax:entry?.max??0,revenue:revenue.find(row=>row.reason===key)?.total??0,updatedAt:mark?.updatedAt.toISOString()??null,updatedBy:mark?.updatedBy??null};
    };
    return [
      ...SKINS.map(skin=>{const key=`skin:${skin.id}`,set=overrides.get(key);return {...common(key),id:skin.id,kind:'skin' as const,name:skin.name,base:skin.base,variant:skin.variant,accent:skin.accent,icon:'',
        rarity:set?.rarity??skin.rarity,description:set?.description??skin.description,availability:set?.availability??(skin.adminOnly?'hidden':'sale'),owners:count(skinOwners,skin.id),wearing:count(wearing,skin.id)};}),
      ...SKILLS.map(skill=>{const key=`skill:${skill.id}`,set=overrides.get(key);return {...common(key),id:skill.id,kind:'skill' as const,name:skill.name,base:skill.skin,variant:'',accent:skinById(skill.skin)?.accent??'#ea2fdc',icon:skill.icon,
        rarity:set?.rarity??skill.rarity,description:set?.description??skill.description,availability:set?.availability??'sale',owners:count(skillOwners,skill.id),wearing:0};}),
    ];
  }
  /** One card or skill: its rarity, text and sale here; its price in the price table, which also tells the world. */
  async saveCatalogEntry(actor:string,change:{key:string;rarity:Rarity;description:string;availability:CatalogAvailability;price:number;reason:string}):Promise<AdminCatalogEntry[]>{
    const [kind,id]=change.key.split(':') as [string,string];
    const known=kind==='skin'?skinById(id):skillById(id);
    if(!known)throw new WardrobeError(404,'Carta não encontrada.');
    if(id===DEFAULT_SKIN&&change.availability!=='sale')throw new WardrobeError(400,`${known.name} é a carta gratuita: toda conta precisa dela.`);
    if(id===DEFAULT_SKIN&&change.price!==0)throw new WardrobeError(400,`${known.name} é gratuito.`);
    const before=(await this.overrides()).get(change.key),value={rarity:change.rarity,description:change.description,availability:change.availability};
    await this.db.transaction(async tx=>{
      await tx.insert(skinCatalog).values({key:change.key,...value,updatedBy:actor}).onConflictDoUpdate({target:skinCatalog.key,set:{...value,updatedBy:actor,updatedAt:new Date()}});
      await tx.insert(moderationActions).values({id:randomUUID(),actorId:actor,action:'catalog-edit',reason:`${change.reason} · ${known.name}: ${before?.rarity??known.rarity} → ${change.rarity}, ${before?.availability??'sale'} → ${change.availability}`});
    });
    if(priceEntry(change.key)&&(await this.pricing.table())[change.key]!==change.price)await this.pricing.change(actor,[{key:change.key,value:change.price}],`${change.reason} · ${known.name}`);
    return this.adminCatalog();
  }
}
