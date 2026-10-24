import type {CharacterConfig} from '@bar/shared';
import type {AvatarSelection,CatalogBundle,PieceEntry,Slot} from '../avatar-v2-lab/catalog';

// The animation sources in BAR_Avatar_V2 have not had their licenses verified. The real game
// enables V2 only in the local Vite environment; production keeps the licensed/current path.
export const AVATAR_V2_GAME_ENABLED=import.meta.env.DEV&&import.meta.env.VITE_DISABLE_AVATAR_V2!=='1';

const hairMap:Record<string,string|undefined>={
  none:undefined,buzzed:'hair_buzzed','buzzed-female':'hair_buzzed','simple-parted':'hair_parted',long:'hair_long',buns:'hair_bun',
  hair_bun:'hair_bun',hair_buzzed:'hair_buzzed',hair_long:'hair_long',hair_medium:'hair_medium',hair_parted:'hair_parted',hair_ponytail:'hair_ponytail',hair_short:'hair_short',hair_wavy:'hair_wavy',
};
const topMap:Record<string,string|undefined>={none:'top_tee',sweater:'top_hoodie',tee:'top_tee',top_hoodie:'top_hoodie',top_jacket:'top_jacket',top_shirt:'top_shirt',top_tank:'top_tank',top_tee:'top_tee',top_tee_print:'top_tee_print'};
const bottomMap:Record<string,string|undefined>={none:'bottom_jeans',pants:'bottom_jeans',trousers:'bottom_pants',bottom_jeans:'bottom_jeans',bottom_pants:'bottom_pants',bottom_shorts:'bottom_shorts',bottom_skirt:'bottom_skirt'};
const footwearMap:Record<string,string|undefined>={none:'footwear_sneakers',derby:'footwear_shoes',sneakers:'footwear_sneakers',footwear_boots:'footwear_boots',footwear_flipflops:'footwear_flipflops',footwear_shoes:'footwear_shoes',footwear_sneakers:'footwear_sneakers'};
const accessoryMap:Record<string,string|undefined>={none:undefined,glasses:'accessory_glasses',accessory_bracelet:'accessory_bracelet',accessory_cap:'accessory_cap',accessory_glasses:'accessory_glasses',accessory_hat:'accessory_hat',accessory_sunglasses:'accessory_sunglasses'};

function available(bundle:CatalogBundle,body:'male'|'female',id:string|undefined):id is string{return Boolean(id&&bundle.avatar.pieces.find(piece=>piece.id===id)?.bodies[body]);}
function list(bundle:CatalogBundle,body:'male'|'female',slot:Slot,id:string|undefined){return available(bundle,body,id)&&bundle.avatar.pieces.find(piece=>piece.id===id)?.slot===slot?[id]:[];}
function piece(bundle:CatalogBundle,id:string|undefined):PieceEntry|undefined{return id?bundle.avatar.pieces.find(candidate=>candidate.id===id):undefined;}

export function characterToAvatarV2(config:CharacterConfig,bundle:CatalogBundle):AvatarSelection{
  const body=config.body;
  let top=topMap[config.top],bottom=bottomMap[config.bottom],footwear=footwearMap[config.footwear],hair=hairMap[config.hair],accessory=accessoryMap[config.accessory];
  // Manifest rules win over legacy saved combinations. Prefer preserving clothing over hair/accessory.
  if(top==='top_hoodie'&&['hair_long','hair_wavy',...(body==='male'?['hair_medium']:[])].includes(hair??''))hair='hair_short';
  if(bottom==='bottom_jeans'&&footwear==='footwear_boots')footwear='footwear_sneakers';
  if(body==='female'&&top==='top_hoodie'&&accessory==='accessory_bracelet')accessory=undefined;
  if(bottom==='bottom_skirt'&&body!=='female')bottom='bottom_jeans';
  if(bottom==='bottom_skirt'&&!piece(bundle,top))top='top_tank';
  return {
    body,brow:config.eyebrows==='female'?'thin':config.eyebrows==='none'?'none':'regular',facePreset:'default',
    pieces:{top:list(bundle,body,'top',top),bottom:list(bundle,body,'bottom',bottom),footwear:list(bundle,body,'footwear',footwear),hair:list(bundle,body,'hair',hair),facialHair:config.beard?list(bundle,body,'facialHair','facial_beard_short'):[],accessory:list(bundle,body,'accessory',accessory)},
    colors:{skinTone:config.skinTone,outfitColor:config.outfitColor,eyeColor:config.eyeColor,hairColor:config.hairColor,topColor:config.topColor,bottomColor:config.bottomColor,footwearColor:config.footwearColor,accessoryColor:config.accessoryColor},
  };
}
