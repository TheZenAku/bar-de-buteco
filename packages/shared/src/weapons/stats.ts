import {PARTS,UPGRADES,UPGRADE_MAX,WEAPONS,type Caliber,type FireMode,type PartId,type PartSlot,type Reticle,type StatMods,type UpgradeTrack,type WeaponAction,type WeaponHold,type WeaponId,type ReloadStyle} from './catalog.js';

const RAD=Math.PI/180;

/** Where a bullet lands on a body: the head, the trunk (arms included) or the legs. */
export type HitZone='head'|'torso'|'legs';

/**
 * A weapon as it is with its parts and upgrades: everything the room needs to rule on a shot and the browser to draw and predict it. Angles are
 * radians, times milliseconds, distances metres.
 */
export interface WeaponStats {
  id:WeaponId;hold:WeaponHold;caliber:Caliber;modes:readonly FireMode[];action:WeaponAction;reload:ReloadStyle;
  /** The shortest time between two shots (ms), and the rounds of a burst. */
  interval:number;burst:number;
  mag:number;damage:number;pellets:number;head:number;legs:number;
  range:{start:number;end:number;min:number;max:number};
  spread:{hip:number;ads:number;move:number;bloom:number;bloomMax:number;recovery:number;pellet:number};
  recoil:{v:number;h:number;bias:number;recover:number;kick:number};
  adsMs:number;drawMs:number;
  /** Aiming: the magnification (iron sights or the optic's first step), the steps of a variable scope, the reticle, and whether the view goes through a scope. */
  zoom:number;zooms:readonly number[];reticle:Reticle;scope:boolean;
  /** Walking pace while aiming (share of the walk). */
  move:number;
  /** The reload: whole (tactical/empty) or round by round (start, each, end); a speed loader makes the revolver's whole. */
  reloadStyle:ReloadStyle;reloadMs:{tactical:number;empty:number}|{start:number;each:number;end:number};
  sway:number;reach:number;impulse:number;
  suppressed:boolean;laser:boolean;light:boolean;
  /** How big the muzzle flash is (1 = normal), and how far away the shot is heard (m). */
  flash:number;earshot:number;
}

/** How far an unsuppressed shot is heard (m); a suppressor multiplies it by its `loud`. */
export const EARSHOT=160;

function combine(mods:readonly StatMods[]):Required<StatMods> {
  const out:Required<StatMods>={damage:1,range:1,spreadHip:1,spreadAds:1,spreadMove:1,recoil:1,recoilH:1,adsMs:1,reloadMs:1,drawMs:1,mag:0,move:1,sway:1,flash:1,loud:1,pellet:1,reach:1};
  for(const mod of mods)for(const key of Object.keys(mod) as (keyof StatMods)[]){
    const value=mod[key];
    if(value===undefined)continue;
    if(key==='mag')out.mag+=value;else out[key]*=value;
  }
  return out;
}

/** The levels of an upgrade map, clamped to 0-UPGRADE_MAX whole numbers. */
export function upgradeLevel(upgrades:Partial<Record<UpgradeTrack,number>>|undefined,track:UpgradeTrack):number {
  const level=upgrades?.[track]??0;
  return Number.isFinite(level)?Math.max(0,Math.min(UPGRADE_MAX,Math.floor(level))):0;
}

/**
 * A weapon's stats with these parts fitted and these upgrade levels. Parts that do not fit the weapon are ignored (the room and the API refuse
 * them anyway, see arsenal.ts), so a stale loadout never breaks a shot.
 */
export function weaponStats(id:WeaponId,parts:Partial<Record<PartSlot,PartId>>={},upgrades:Partial<Record<UpgradeTrack,number>>={}):WeaponStats {
  const def=WEAPONS[id];
  const fitted=Object.entries(parts).flatMap(([slot,part])=>part&&def.slots[slot as PartSlot]?.includes(part as PartId)?[PARTS[part as PartId]]:[]);
  const mod=combine(fitted.map(part=>part.mods));
  const level=(track:UpgradeTrack)=>upgradeLevel(upgrades,track)*UPGRADES[track].per;
  const damageUp=1+level('dano'),rangeUp=1+level('alcance'),recoilDown=1-level('controle'),spreadDown=1-level('precisao'),handling=1-level('manuseio');
  const optic=fitted.find(part=>part.optic)?.optic;
  const speedLoader=fitted.find(part=>part.speedLoader)?.speedLoader;
  const reloadScale=mod.reloadMs*handling;
  let reloadStyle:ReloadStyle=def.reload;
  let reloadMs:WeaponStats['reloadMs'];
  // Only the revolver has a speed loader; on the round-by-round long guns the part only speeds each round (its reloadMs).
  if(speedLoader&&def.reload==='shell'&&id==='revolver'){reloadStyle='mag';reloadMs={tactical:Math.round(speedLoader*handling),empty:Math.round(speedLoader*handling)};}
  else if('each' in def.reloadMs)reloadMs={start:Math.round(def.reloadMs.start*reloadScale),each:Math.round(def.reloadMs.each*reloadScale),end:Math.round(def.reloadMs.end*reloadScale)};
  else reloadMs={tactical:Math.round(def.reloadMs.tactical*reloadScale),empty:Math.round(def.reloadMs.empty*reloadScale)};
  const zooms=optic?(optic.zooms?.length?optic.zooms:[optic.zoom]):[def.ads.zoom];
  return {
    id,hold:fitted.find(part=>part.hold)?.hold??def.hold,caliber:def.caliber,modes:def.modes,action:def.action,reload:def.reload,
    interval:60000/def.rpm,burst:def.burst??3,
    mag:def.magExtended&&fitted.some(part=>part.id==='carregador-estendido')?def.magExtended:Math.max(1,Math.round(def.mag*(1+mod.mag))),
    damage:def.damage*mod.damage*damageUp,pellets:def.pellets,head:def.head,legs:def.legs,
    range:{start:def.range.start*mod.range*rangeUp,end:def.range.end*mod.range*rangeUp,min:def.range.min,max:def.range.max},
    spread:{hip:def.spread.hip*RAD*mod.spreadHip*spreadDown,ads:def.spread.ads*RAD*mod.spreadAds*spreadDown,move:def.spread.move*RAD*mod.spreadMove*spreadDown,
      bloom:def.spread.bloom*RAD*spreadDown,bloomMax:def.spread.bloomMax*RAD*spreadDown,recovery:def.spread.recovery*RAD,pellet:(def.spread.pellet??0)*RAD*mod.pellet},
    recoil:{v:def.recoil.v*RAD*mod.recoil*recoilDown,h:def.recoil.h*RAD*mod.recoilH*mod.recoil*recoilDown,bias:def.recoil.bias,recover:def.recoil.recover,kick:def.recoil.kick*mod.recoil},
    adsMs:Math.round(def.ads.ms*mod.adsMs*handling),drawMs:Math.round(def.drawMs*mod.drawMs*handling),
    zoom:zooms[0]!,zooms,reticle:optic?.reticle??'iron',scope:!!optic?.scope,
    move:Math.min(1,def.ads.move*mod.move),
    reloadStyle,reloadMs,
    sway:def.sway*RAD*mod.sway,reach:def.reach*mod.reach,impulse:def.impulse,
    suppressed:fitted.some(part=>part.suppressor),laser:fitted.some(part=>part.laser),light:fitted.some(part=>part.light),
    flash:mod.flash,earshot:EARSHOT*mod.loud,
  };
}

/**
 * How wide the cone is right now (radians): from the hip to aiming as `ads` goes 0-1, plus moving (`speed` m/s against the walk's 3.5), plus the
 * bloom built up by shooting. The room accepts no shot narrower than the weapon's aimed, standing cone (minSpread).
 */
export function spreadNow(stats:WeaponStats,state:{ads:number;speed:number;bloom:number}):number {
  const ads=Math.max(0,Math.min(1,state.ads)),moving=Math.max(0,Math.min(1.6,state.speed/3.5));
  return stats.spread.hip+(stats.spread.ads-stats.spread.hip)*ads+stats.spread.move*moving*(1-.45*ads)+Math.max(0,Math.min(stats.spread.bloomMax,state.bloom));
}
/** The narrowest cone a shot of this weapon may claim (radians): aimed and still, with a tenth of slack for rounding. */
export const minSpread=(stats:WeaponStats):number=>stats.spread.ads*.9;

/** The share of the damage a bullet keeps at `distance` metres. */
export function falloff(stats:WeaponStats,distance:number):number {
  const {start,end,min,max}=stats.range;
  if(distance>max)return 0;
  if(distance<=start)return 1;
  if(distance>=end)return min;
  const t=(distance-start)/(end-start);
  return 1-(1-min)*t*t*(3-2*t);
}
/** The life one bullet (or pellet) takes: zone and distance, at least 1 when it lands at all. */
export function damageOf(stats:WeaponStats,zone:HitZone,distance:number):number {
  const share=falloff(stats,distance);
  if(share<=0)return 0;
  const zoneFactor=zone==='head'?stats.head:zone==='legs'?stats.legs:1;
  return Math.max(1,stats.damage*zoneFactor*share);
}

/** How long a reload takes from `inMag` rounds (whole reloads), or how long one round takes and the overhead (round by round). */
export function reloadDuration(stats:WeaponStats,inMag:number,reserve=Infinity):number {
  const missing=Math.max(0,Math.min(stats.mag-inMag,reserve));
  if(!missing)return 0;
  const timing=stats.reloadMs;
  if('each' in timing)return timing.start+timing.each*missing+timing.end;
  return inMag>0?timing.tactical:timing.empty;
}
/**
 * Rounds in the magazine `elapsed` ms into a round-by-round reload that started with `inMag` (the same in room and browser): after `start` (opening),
 * one more at the end of every `each`. Whole reloads fill at the end only.
 */
export function roundsLoaded(stats:WeaponStats,inMag:number,elapsed:number,reserve=Infinity):number {
  const missing=Math.max(0,Math.min(stats.mag-inMag,reserve)),timing=stats.reloadMs;
  if(!('each' in timing))return elapsed>=reloadDuration(stats,inMag,reserve)?inMag+missing:inMag;
  return inMag+Math.max(0,Math.min(missing,Math.floor((elapsed-timing.start)/timing.each)));
}
/** Whether a shot during a reload is allowed (it interrupts a round-by-round reload with what is already in). */
export const reloadInterruptible=(stats:WeaponStats):boolean=>stats.reloadStyle==='shell';
