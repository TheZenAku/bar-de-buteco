/**
 * The aiming and controller preferences (settings.ts keys `aim`, `pad`, `shoulder`; the Esc menu's rows come with the interface). Each has a reader
 * that turns whatever a browser saved (nothing, an older shape, junk) into a valid value: settings.ts restores only the keys it lists.
 */

/** A gamepad's aim help: RDR2's lock, a soft help, or none. */
export type PadAssist='travar'|'assistida'|'livre';
export const PAD_ASSISTS:readonly PadAssist[]=['travar','assistida','livre'];
export const PAD_ASSIST_LABELS:Readonly<Record<PadAssist,string>>={travar:'Travar no alvo',assistida:'Assistida',livre:'Livre'};

export interface AimSettings {
  /** The gamepad's help (default: the lock). */
  assistPad:PadAssist;
  /** A finger's help: a gentle snap when aiming, tracking and friction (default on). */
  assistTouch:boolean;
  /** Touch only: fire by itself when the crosshair rests on a body while aiming (default off). */
  autoFire:boolean;
  /** The look's speed while aiming and through a scope, on top of the zoom's own slowing (1 = matched to the zoom). */
  adsSensitivity:number;scopeSensitivity:number;
}
export interface PadSettings {
  /** The right stick's turn speed (×), its response curve (power), inverted up and down, rumble. */
  lookSpeed:number;curve:number;invertY:boolean;vibration:boolean;
}
export type ShoulderSide='right'|'left';
/**
 * Where the camera sits with a weapon (camera-rig.ts, docs/sistemas/armas.md#camera), tunable live in Esc › Ajustes › Armas e mira to find the
 * defaults. Metres, shares and multipliers: with the weapon only out (not aiming) the boom, how much higher the pivot sits and the shoulder offset, so
 * the crosshair clears the body; aiming the boom with a long gun and with a pistol, the shoulder offset, how much higher the pivot sits, the share of the boom's rise and fall with the elevation taken away aiming, how many times tighter the follow
 * and faster the turn aiming, and the share of each weapon's own sight zoom (not the scopes') that applies.
 */
export interface AimCamera {
  armedBoom:number;armedRise:number;armedShoulder:number;
  boomRifle:number;boomPistol:number;shoulder:number;rise:number;level:number;follow:number;turn:number;zoom:number;
}
// Chosen by the owner live on 2026-11-09 (Copiar valores). Changing them: bump AIM_CAMERA_VERSION so browsers that saved the old ones take the new.
export const DEFAULT_AIM_CAMERA:Readonly<AimCamera>={armedBoom:6,armedRise:.6,armedShoulder:1.2,boomRifle:1.55,boomPistol:1.45,shoulder:.45,rise:.3,level:0,follow:6,turn:1.5,zoom:.3};
export const AIM_CAMERA_VERSION=2;
export const AIM_CAMERA_LIMITS:Readonly<Record<keyof AimCamera,readonly [number,number]>>={
  armedBoom:[.8,10],armedRise:[-.5,1.5],boomRifle:[.6,3.5],boomPistol:[.6,3.5],shoulder:[0,1.2],armedShoulder:[0,2.5],rise:[-.5,1],level:[0,1],follow:[0,12],turn:[0,5],zoom:[0,3]};
export const AIM_CAMERA_KEYS=Object.keys(DEFAULT_AIM_CAMERA) as readonly (keyof AimCamera)[];

export const DEFAULT_AIM:Readonly<AimSettings>={assistPad:'travar',assistTouch:true,autoFire:false,adsSensitivity:1,scopeSensitivity:1};
export const DEFAULT_PAD:Readonly<PadSettings>={lookSpeed:1,curve:1.8,invertY:false,vibration:true};
export const SENSITIVITY_LIMITS=[.25,3] as const;
export const LOOK_SPEED_LIMITS=[.3,3] as const;
export const CURVE_LIMITS=[1,3] as const;

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const number=(value:unknown,fallback:number,[min,max]:readonly [number,number])=>typeof value==='number'&&Number.isFinite(value)?clamp(value,min,max):fallback;
const flag=(value:unknown,fallback:boolean)=>typeof value==='boolean'?value:fallback;
const object=(value:unknown)=>(value&&typeof value==='object'?value:{}) as Record<string,unknown>;

export function readAim(value:unknown):AimSettings {
  const saved=object(value);
  return {assistPad:PAD_ASSISTS.includes(saved.assistPad as PadAssist)?saved.assistPad as PadAssist:DEFAULT_AIM.assistPad,
    assistTouch:flag(saved.assistTouch,DEFAULT_AIM.assistTouch),autoFire:flag(saved.autoFire,DEFAULT_AIM.autoFire),
    adsSensitivity:number(saved.adsSensitivity,DEFAULT_AIM.adsSensitivity,SENSITIVITY_LIMITS),scopeSensitivity:number(saved.scopeSensitivity,DEFAULT_AIM.scopeSensitivity,SENSITIVITY_LIMITS)};
}
export function readPad(value:unknown):PadSettings {
  const saved=object(value);
  return {lookSpeed:number(saved.lookSpeed,DEFAULT_PAD.lookSpeed,LOOK_SPEED_LIMITS),curve:number(saved.curve,DEFAULT_PAD.curve,CURVE_LIMITS),
    invertY:flag(saved.invertY,DEFAULT_PAD.invertY),vibration:flag(saved.vibration,DEFAULT_PAD.vibration)};
}
export function readAimCamera(value:unknown):AimCamera {
  const saved=object(value),out={...DEFAULT_AIM_CAMERA};
  for(const key of AIM_CAMERA_KEYS)out[key]=number(saved[key],DEFAULT_AIM_CAMERA[key],AIM_CAMERA_LIMITS[key]);
  return out;
}
export const readShoulder=(value:unknown):ShoulderSide=>value==='left'?'left':'right';
