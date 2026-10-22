import {z} from 'zod';
import clothingCatalog from './clothing-catalog.json' with {type:'json'};

export const BODY_TYPES=[{id:'male',name:'Corpo masculino'},{id:'female',name:'Corpo feminino'}] as const;
export const HAIRSTYLES=[{id:'none',name:'Sem cabelo'},{id:'buzzed',name:'Raspado'},{id:'buzzed-female',name:'Raspado curto'},
  {id:'simple-parted',name:'Repartido'},{id:'long',name:'Longo'},{id:'buns',name:'Coques'}] as const;
// Standard contains five named hair meshes; Buzzed and BuzzedFemale are separate fits of a short cut.
export const SKIN_TONES=['#f5d6be','#e8b894','#cf936d','#b87850','#975b3d','#70412e','#4b2c24'] as const;
export const HAIR_COLORS=['#201a19','#493126','#75452d','#b88742','#d9bb77','#a34c2c','#d7d5d0','#604276'] as const;
export const EYE_COLORS=['#704529','#567a45','#4e7a9a','#827a65','#aaaaa2'] as const;
export const OUTFIT_COLORS=['#24363d','#111820','#51645b','#873e37','#385d86','#b18c4d','#d7d5d0'] as const;
export type ClothingSlot='top'|'bottom'|'footwear'|'accessory';
export const MALE_CLOTHING=clothingCatalog as Array<{id:string;name:string;slot:ClothingSlot;source:string}>;
export const CLOTHING_COLOR_FIELDS={top:'topColor',bottom:'bottomColor',footwear:'footwearColor',accessory:'accessoryColor'} as const;
const options=(slot:ClothingSlot,empty:string)=>[{id:'none',name:empty},...MALE_CLOTHING.filter(item=>item.slot===slot)];
export const MALE_TOPS=options('top','Sem blusa');
export const MALE_BOTTOMS=options('bottom','Roupa base');
export const MALE_FOOTWEAR=options('footwear','Descalço');
export const MALE_ACCESSORIES=options('accessory','Sem acessório');
const clothingOption=(slot:ClothingSlot)=>z.enum(['none',...MALE_CLOTHING.filter(item=>item.slot===slot).map(item=>item.id)] as [string,...string[]]).default('none');
export const characterSchema=z.object({
  version:z.literal(1),body:z.enum(['male','female']),
  hair:z.enum(['none','buzzed','buzzed-female','simple-parted','long','buns']),
  skinTone:z.enum(SKIN_TONES),hairColor:z.enum(HAIR_COLORS),eyeColor:z.enum(EYE_COLORS),
  eyebrows:z.enum(['none','regular','female']),beard:z.boolean(),
  outfitColor:z.enum(OUTFIT_COLORS).default('#24363d'),
  top:clothingOption('top'),bottom:clothingOption('bottom'),footwear:clothingOption('footwear'),accessory:clothingOption('accessory'),
  topColor:z.enum(OUTFIT_COLORS).default('#385d86'),bottomColor:z.enum(OUTFIT_COLORS).default('#24363d'),footwearColor:z.enum(OUTFIT_COLORS).default('#d7d5d0'),
  accessoryColor:z.enum(OUTFIT_COLORS).default('#111820'),
}).strict();
export type CharacterConfig=z.infer<typeof characterSchema>;
export const DEFAULT_CHARACTER:CharacterConfig={version:1,body:'male',hair:'simple-parted',skinTone:'#cf936d',hairColor:'#493126',eyeColor:'#704529',eyebrows:'regular',beard:false,outfitColor:'#24363d',top:'none',bottom:'none',footwear:'none',accessory:'none',topColor:'#385d86',bottomColor:'#24363d',footwearColor:'#d7d5d0',accessoryColor:'#111820'};
export const CUSTOM_SKIN='custom' as const;
export function readCharacter(value:unknown):CharacterConfig {const parsed=characterSchema.safeParse(value);return parsed.success?parsed.data:{...DEFAULT_CHARACTER};}
export interface Wardrobe {
  character:CharacterConfig|null;equippedSkin:string;balance:number;
  catalog:Array<{id:string;name:string;price:number;owned:boolean}>;
  dailyReward:number;dailyClaimed:boolean;
}
