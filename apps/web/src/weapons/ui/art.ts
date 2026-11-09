import {PARTS,UPGRADE_MAX,UPGRADE_TRACKS,WEAPONS,upgradeLevel,type PartId,type PartSlot,type UpgradeTrack,type WeaponId} from '@bar/shared';
import {escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import {PART_MODELS,WEAPON_MODELS} from '../weapon-meta';

/**
 * The firearms' pictures (tools/assets/render-weapon-icons.mjs): layers of 512x256 on a transparent background, all of one weapon in the same frame
 * (ui/armas/camadas/<weapon>/): a base per look of the weapon itself (bare `base`, each magazine part, the swapped-in model) and one picture per
 * mounted part that has a model; each part also has its own square picture (pecas/, 256x256). The magazines have no model, so they are drawn as
 * a glyph in Lucide's stroke.
 */
const base=import.meta.env.BASE_URL;
const layer=(weapon:WeaponId,name:string)=>`${base}ui/armas/camadas/${weapon}/${name}.webp`;
const OVERLAY_SLOTS:PartSlot[]=['trilho','boca','mira'];
/** The pictures to stack, bottom first, for a weapon with these parts fitted (what it looks like in the world: the magazine, the model a part swaps in, the optics and muzzle devices). */
export function weaponLayers(id:WeaponId,parts:Partial<Record<PartSlot,PartId>>={}):string[] {
  const meta=WEAPON_MODELS[id],swapped=meta.variants?.find(v=>Object.values(parts).includes(v.part));
  if(swapped)return [layer(id,swapped.part)];
  const mag=parts.carregador&&WEAPONS[id].slots.carregador?.includes(parts.carregador)?parts.carregador:'base';
  return [layer(id,mag),...OVERLAY_SLOTS.flatMap(slot=>{const part=parts[slot];return part&&PART_MODELS[part]&&meta.mounts[slot]?[layer(id,part)]:[];})];
}
type Upgrades=Partial<Record<UpgradeTrack,number>>|undefined;
/** The upgrades' total levels and which of four tiers that is (0 none, 4 everything at the top): the picture's mark. */
export function upgradeTier(upgrades:Upgrades):{total:number;tier:0|1|2|3|4} {
  const total=UPGRADE_TRACKS.reduce((sum,track)=>sum+upgradeLevel(upgrades,track),0),most=UPGRADE_TRACKS.length*UPGRADE_MAX;
  return {total,tier:total<=0?0:total>=most?4:total>=most*.5?3:total>=most*.25?2:1};
}
/**
 * A weapon's picture as it is fitted: the layers stacked in one box (size it with the container's CSS: `.wp-pic` is 2:1), and with upgrades a
 * "+N" mark in the tier's colour (the pictures show parts; the upgrades have no model, so the mark is how the picture follows them). Decorative:
 * the name is always near it.
 */
export function weaponPicture(id:WeaponId,parts?:Partial<Record<PartSlot,PartId>>,upgrades?:Upgrades):string {
  const {total,tier}=upgradeTier(upgrades);
  return `<span class="wp-pic" data-tier="${tier}">${weaponLayers(id,parts).map(src=>`<img class="wp-layer" src="${src}" alt="" draggable="false">`).join('')}${tier?`<i class="wp-tier" title="Melhorias: ${total}">+${total}</i>`:''}</span>`;
}
const NO_PICTURE=new Set<PartId>(['carregador-estendido','carregador-rapido']);
export const partArt=(id:PartId)=>`${base}ui/armas/pecas/${id}.webp`;
/** A part's picture, or its glyph when it has none (decorative: the name is always near it, so `title` only). */
export function partVisual(id:PartId,className='wp-part'):string {
  const name=e(PARTS[id].name);
  return NO_PICTURE.has(id)?`<span class="${className} wp-part-glyph" title="${name}">${uiIcon('magazine')}</span>`
    :`<img class="${className}" src="${partArt(id)}" alt="" title="${name}" draggable="false">`;
}
/** The glyph for an empty slot of each kind. */
export const SLOT_ICONS={mira:'crosshair',boca:'volumeOff',trilho:'grip',carregador:'magazine'} as const;
