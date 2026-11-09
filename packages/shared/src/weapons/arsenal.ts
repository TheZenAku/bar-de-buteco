import {seenAt} from '../fight.js';
import {WALK_SPEED} from '../world.js';
import {PARTS,PART_IDS,PART_SLOTS,UPGRADE_MAX,UPGRADE_TRACKS,WEAPONS,WEAPON_IDS,WHEEL_ORDER,isPartId,isWeaponId,upgradeCost,type PartId,type PartSlot,type UpgradeTrack,type WeaponId} from './catalog.js';
import {weaponStats,upgradeLevel,type WeaponStats} from './stats.js';
import {GUN,type ArsenalView,type ArsenalWeapon} from './protocol.js';

/** Whether `part` goes in `slot` on this weapon. */
export const partFits=(weapon:WeaponId,slot:PartSlot,part:PartId):boolean=>PARTS[part].slot===slot&&!!WEAPONS[weapon].slots[slot]?.includes(part);
/** The slots this weapon has (in the catalogue's order). */
export const slotsOf=(weapon:WeaponId):PartSlot[]=>PART_SLOTS.filter(slot=>!!WEAPONS[weapon].slots[slot]?.length);

/** A weapon's parts written short for the shared state (Player.gun.kit): "mira:acog,boca:silenciador". */
export function encodeKit(parts:Partial<Record<PartSlot,PartId>>):string {
  return PART_SLOTS.flatMap(slot=>parts[slot]?[`${slot}:${parts[slot]}`]:[]).join(',');
}
export function decodeKit(kit:string|undefined):Partial<Record<PartSlot,PartId>> {
  const out:Partial<Record<PartSlot,PartId>>={};
  for(const item of (kit??'').split(',')){
    const [slot,part]=item.split(':');
    if(PART_SLOTS.includes(slot as PartSlot)&&isPartId(part))out[slot as PartSlot]=part;
  }
  return out;
}

/** The /armas kit: every weapon (with what comes fitted), every part, rounds that never run out, upgrades free. */
export function testArsenal():ArsenalView {
  return {test:true,infinite:true,parts:[...PART_IDS],ammo:{},
    weapons:WHEEL_ORDER.map(id=>({id,parts:{...(WEAPONS[id].defaults??{})},upgrades:{}}))};
}
export const arsenalWeapon=(view:ArsenalView|undefined,id:string):ArsenalWeapon|undefined=>view?.weapons.find(weapon=>weapon.id===id);
/** The stats of a weapon as this arsenal has it fitted and upgraded; undefined when it is not owned. */
export function arsenalStats(view:ArsenalView|undefined,id:string):WeaponStats|undefined {
  const weapon=arsenalWeapon(view,id);
  return weapon?weaponStats(weapon.id,weapon.parts,weapon.upgrades):undefined;
}
/** The owned weapons in the wheel's order. */
export const ownedInOrder=(view:ArsenalView|undefined):WeaponId[]=>WHEEL_ORDER.filter(id=>!!arsenalWeapon(view,id));

/** Why a part cannot go (or come off) there: '' when it can. `part` null takes the slot's part off. */
export function fitError(view:ArsenalView|undefined,weapon:WeaponId,slot:PartSlot,part:PartId|null):string {
  if(!arsenalWeapon(view,weapon))return 'Você não tem essa arma.';
  if(!WEAPONS[weapon].slots[slot]?.length)return 'Essa arma não tem esse encaixe.';
  if(part===null)return '';
  if(!view!.parts.includes(part))return 'Você não tem esse equipamento.';
  if(!partFits(weapon,slot,part))return 'Esse equipamento não serve nessa arma.';
  return '';
}
/** The arsenal with that part fitted (or taken off); the input is not changed. */
export function withPart(view:ArsenalView,weapon:WeaponId,slot:PartSlot,part:PartId|null):ArsenalView {
  return {...view,weapons:view.weapons.map(item=>{
    if(item.id!==weapon)return item;
    const parts={...item.parts};
    if(part)parts[slot]=part;else delete parts[slot];
    return {...item,parts};
  })};
}
/** Why an upgrade cannot be bought: '' when it can (the coins are the API's to check). */
export function upgradeError(view:ArsenalView|undefined,weapon:WeaponId,track:UpgradeTrack):string {
  const item=arsenalWeapon(view,weapon);
  if(!item)return 'Você não tem essa arma.';
  if(upgradeLevel(item.upgrades,track)>=UPGRADE_MAX)return 'Essa melhoria já está no máximo.';
  return '';
}
/** The next level of a track and its price (0 in the test kit). */
export function nextUpgrade(view:ArsenalView,weapon:WeaponId,track:UpgradeTrack):{level:number;cost:number}|undefined {
  const item=arsenalWeapon(view,weapon);
  if(!item)return undefined;
  const level=upgradeLevel(item.upgrades,track)+1;
  if(level>UPGRADE_MAX)return undefined;
  return {level,cost:view.test?0:upgradeCost(weapon,level,view.priceScale??1)};
}
export function withUpgrade(view:ArsenalView,weapon:WeaponId,track:UpgradeTrack):ArsenalView {
  return {...view,weapons:view.weapons.map(item=>item.id!==weapon?item:{...item,upgrades:{...item.upgrades,[track]:Math.min(UPGRADE_MAX,upgradeLevel(item.upgrades,track)+1)}})};
}
/** An arsenal from untrusted JSON (the API, a stale cache): unknown weapons, parts and tracks dropped, levels clamped, parts that do not fit removed. */
export function cleanArsenal(raw:unknown):ArsenalView {
  const source=(raw&&typeof raw==='object'?raw:{}) as Partial<ArsenalView>;
  const parts=Array.isArray(source.parts)?[...new Set(source.parts.filter(isPartId))]:[];
  const weapons=(Array.isArray(source.weapons)?source.weapons:[]).flatMap(item=>{
    if(!item||!isWeaponId(item.id))return [];
    const fitted:Partial<Record<PartSlot,PartId>>={};
    for(const slot of PART_SLOTS){const part=item.parts?.[slot];if(isPartId(part)&&partFits(item.id,slot,part))fitted[slot]=part;}
    const upgrades:Partial<Record<UpgradeTrack,number>>={};
    for(const track of UPGRADE_TRACKS){const level=upgradeLevel(item.upgrades,track);if(level)upgrades[track]=level;}
    return [{id:item.id,parts:fitted,upgrades}];
  });
  const unique=WEAPON_IDS.flatMap(id=>weapons.find(item=>item.id===id)??[]);
  const ammo:ArsenalView['ammo']={};
  for(const [caliber,count] of Object.entries(source.ammo??{}))if(Number.isFinite(count))ammo[caliber as keyof ArsenalView['ammo']]=Math.max(0,Math.floor(count as number));
  return {test:!!source.test,infinite:!!source.infinite,weapons:unique,parts,ammo,...(Number.isFinite(source.priceScale)?{priceScale:source.priceScale}:{}),
    ...(isWeaponId(source.draw)?{draw:source.draw}:{})};
}

/** The walking pace (m/s) with a weapon aimed: slower, and never a run. Undefined when not aiming (the usual walk and run). */
export function armedPace(stats:WeaponStats|undefined,aiming:boolean):number|undefined {
  return stats&&aiming?WALK_SPEED*stats.move:undefined;
}
/** How far back the room turns the others for a shot taken at `takenAt` (ms): to where the shooter saw them, at most GUN.rewindMaxMs. */
export function gunRewindOf(takenAt:number,shot:{seen:number;ago:number},patchMs=100):number {
  const seen=seenAt(shot.seen,shot.ago,patchMs);
  if(!Number.isFinite(seen)||shot.seen>takenAt)return 0;
  return Math.max(0,Math.min(GUN.rewindMaxMs,takenAt-seen));
}
/** Whether shot `n` comes after `last` (counts wrap at 65536): at most 64 ahead, so a replayed or stale shot is refused. */
export const shotFollows=(last:number,n:number):boolean=>{const ahead=(n-last+65536)%65536;return ahead>=1&&ahead<=64;};
