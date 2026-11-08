import {z} from 'zod';
import {RARITIES,type Rarity} from './rarity.js';

/**
 * The collection (docs/sistemas/skins.md). Every skin is a card a player can wear: a character's original, or one of its variants, each its
 * own model (apps/web/public/models/<id>.glb) sold on its own. What stands here are the defaults; the administration overrides the rarity,
 * the text and whether a card is sold (skin_catalog), and the price (the price table).
 */
export const SKIN_IDS=['nathan','leandro','rafael','rafael-rose','read','gilmar-gordo','gabriel','flavio-hipotetico','tiao','primo','morte'] as const;
export type SkinId=typeof SKIN_IDS[number];
export interface Skin {
  id:SkinId;
  /** With the character's name: what the rest of the game calls this skin. */
  name:string;
  /** The character it belongs to: the skin that is its original (itself, in an original). Skills are the character's. */
  base:SkinId;
  /** Which version of the character this is, on the card. */
  variant:string;
  rarity:Rarity;price:number;
  /** The light behind the character on its card; the frame has the colour of the rarity. */
  accent:string;
  description:string;
  /** Never sold: it comes only from the administration (hidden in the catalog by default, and the purchase refuses it). */
  adminOnly?:boolean;
}
// Player models, each with its own skeleton and animation bank.
export const SKINS:readonly Skin[]=[
  {id:'nathan',name:'Nathan',base:'nathan',variant:'Original',rarity:'common',price:0,accent:'#5c7cff',description:'A cara de quem acabou de chegar. Toda conta entra no bar com esta carta.'},
  {id:'leandro',name:'Leandro',base:'leandro',variant:'Original',rarity:'uncommon',price:750,accent:'#37b4a4',description:'Óculos escuros até de noite e bermuda em qualquer ocasião. Chega de mansinho e já conhece a mesa inteira.'},
  {id:'rafael',name:'Rafael',base:'rafael',variant:'Original',rarity:'epic',price:1000,accent:'#ff8a3c',description:'Quimono, faixa na cintura e pé pesado. Tem golpes próprios, para quem comprar as habilidades.'},
  {id:'rafael-rose',name:'Rafael Rosé',base:'rafael',variant:'Rosé',rarity:'legendary',price:2500,accent:'#ff4fa8',description:'O mesmo pé pesado, de quimono escuro e faixa vermelha. Ninguém pediu, todo mundo quer. Usa as habilidades de Rafael.'},
  {id:'read',name:'Read',base:'read',variant:'Original',rarity:'uncommon',price:850,accent:'#6f8bff',description:'De avental, luvas e óculos redondos. Se te olhou duas vezes, já sabe o que você vai pedir.'},
  {id:'gilmar-gordo',name:'Gilmar',base:'gilmar-gordo',variant:'Original',rarity:'rare',price:900,accent:'#f0a13c',description:'Camisa florida, chapéu de palha e chinelo. Quando ele chega, a mesa aumenta e a conta também.'},
  {id:'gabriel',name:'Gabriel',base:'gabriel',variant:'Original',rarity:'rare',price:900,accent:'#3cc7f0',description:'Veio direto da pelada, de chuteira e tudo. Sempre de saída e nunca vai embora.'},
  {id:'flavio-hipotetico',name:'Flavio Hipotético',base:'flavio-hipotetico',variant:'Original',rarity:'rare',price:900,accent:'#b46cff',description:'Terno, faixa no peito e discurso pronto. Em tese, está no bar. Na prática, também.'},
  {id:'tiao',name:'Tião',base:'tiao',variant:'Original',rarity:'rare',price:900,accent:'#c68c4f',description:'Chapéu, casaco de couro e bota empoeirada. Veio de longe e só vai embora depois da última rodada.'},
  {id:'primo',name:'Primo',base:'primo',variant:'Original',rarity:'rare',price:1000,accent:'#4fd18b',description:'Chegou sem avisar, como todo primo. Pede só uma cerveja e fica até o fim da noite.'},
  {id:'morte',name:'Morte',base:'morte',variant:'Original',rarity:'legendary',price:0,accent:'#8a0f1f',description:'Capuz, foice e nenhuma pressa. Só aparece para quem ela escolhe.',adminOnly:true},
];
/** Free for every account: new players wear it, and anything not owned falls back to it. The others are sold. */
export const DEFAULT_SKIN:SkinId='nathan';
export const skinSchema=z.enum(SKIN_IDS);
export const skinMessageSchema=z.object({skin:skinSchema}).strict();
export const skinById=(id:string|undefined):Skin|undefined=>SKINS.find(skin=>skin.id===id);
/** The character a skin belongs to (an NPC's body or an unknown id is its own). */
export const skinBase=(id:string):string=>skinById(id)?.base??id;
/** A character's cards, the original first. */
export const variantsOf=(id:string):readonly Skin[]=>{const base=skinBase(id);return SKINS.filter(skin=>skin.base===base).sort((a,b)=>Number(b.id===base)-Number(a.id===base));};

/** Who can get a card or a skill: anyone; only those who already have it (it shows, closed, to the others); or nobody new, and it is hidden from those who do not have it. */
export const CATALOG_AVAILABILITY=['sale','closed','hidden'] as const;
export type CatalogAvailability=typeof CATALOG_AVAILABILITY[number];
export const CATALOG_AVAILABILITY_NAMES:Record<CatalogAvailability,string>={sale:'À venda',closed:'Fora de venda',hidden:'Oculta'};
/** A card of the collection, as GET /api/wardrobe returns it. */
export interface WardrobeCard {id:SkinId;name:string;base:SkinId;variant:string;rarity:Rarity;accent:string;description:string;price:number;owned:boolean;available:boolean}
/** A skill, in the same view: `available` when it can be bought. Owned ones work whatever the administration does with the sale. */
export interface WardrobeSkill {id:string;skin:string;name:string;description:string;icon:string;rarity:Rarity;price:number;owned:boolean;available:boolean}
/** The account's collection and wallet. */
export interface Wardrobe {
  equippedSkin:string;balance:number;
  catalog:WardrobeCard[];skills:WardrobeSkill[];
}
export const skillPurchaseSchema=z.object({skill:z.string().min(1).max(32)}).strict();

/** A row of the administration's Coleção: the card or skill's current settings, and how it has been doing. */
export interface AdminCatalogEntry {
  /** `skin:<id>` or `skill:<id>`, as in the price table. */
  key:string;id:string;kind:'skin'|'skill';name:string;base:string;variant:string;accent:string;icon:string;
  rarity:Rarity;description:string;availability:CatalogAvailability;
  price:number;defaultPrice:number;priceMin:number;priceMax:number;
  /** How many accounts have it, wear it now, and what it has brought in. */
  owners:number;wearing:number;revenue:number;
  updatedAt:string|null;updatedBy:string|null;
}
export const catalogEntrySchema=z.object({
  key:z.string().regex(/^(?:skin|skill):[a-z0-9-]{1,32}$/,'Carta inválida.'),
  rarity:z.enum(RARITIES,{error:'Raridade inválida.'}),
  description:z.string().trim().min(3,'Escreva um texto para a carta.').max(160,'Use até 160 caracteres.').regex(/^[^\p{C}]*$/u,'O texto tem caracteres inválidos.'),
  availability:z.enum(CATALOG_AVAILABILITY,{error:'Situação inválida.'}),
  price:z.number().int().min(0).max(1_000_000),
  reason:z.string().trim().min(3).max(500),
}).strict();
