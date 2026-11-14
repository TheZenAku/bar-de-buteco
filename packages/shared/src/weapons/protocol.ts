import {z} from 'zod';
import {PART_IDS,PART_SLOTS,UPGRADE_TRACKS,WEAPON_IDS,type Caliber,type PartId,type PartSlot,type UpgradeTrack,type WeaponId} from './catalog.js';
import type {HitZone} from './stats.js';
import type {Vec3} from './ballistics.js';

/**
 * The wire of the firearms (docs/sistemas/armas.md#rede). Drawing, aiming, reloading and every shot ride inside `player.input` (field `gun`), so the
 * room takes them in the order the browser predicted them, between the same steps; nothing is a message of its own (the socket's 100 messages a
 * second are already half spent). The room answers with the shared state (Player.gun) and with events to whoever is near: each shot (for its
 * flash, tracer and sound) and each hit (numbers, markers, blood).
 */
export const GUN={
  /** Lag compensation: the most the room turns the others back to where the shooter saw them (ms). */
  rewindMaxMs:350,
  /** How far the shot's camera point may be from the shooter's eyes (m): the farthest zoom (6.5 m) plus the shoulder and some slack. */
  originSlack:8,
  /** Shots one input may carry (an SMG fires ~3 in one input's 50 ms). */
  shotsPerInput:6,
  /** The room's bodies are this much bigger (m) than the browser's: what is drawn lags what the room turned back by a little. */
  bodySlack:.05,
  /** A shot whose claimed cadence beats the weapon's by more than this is dropped (ms per shot), and how many may arrive early in a row. */
  fireLeewayMs:12,burstAllowance:2,
  /** The browser turns the body to face a shot from the hip for this long (ms). */
  facingHoldMs:1200,
  /** Elevation limits of the aim (radians). */
  pitchMax:1.4,
} as const;

/** One shot, on the input that follows it: the shooter's count, the camera ray (point and direction, the cone's centre), the cone used, and lag data. */
export interface ShotCommand {
  /** The shooter's count of shots (0-65535, wrapping): seeds the spread and lets the shooter match the room's answers. */
  n:number;
  o:Vec3;d:Vec3;
  /** The cone's half-angle the browser used (radians): never narrower than the weapon's aimed one (minSpread). */
  sp:number;
  /** The room's time of the newest state the browser drew and how long it had had it (ms), as for a punch (seenAt). */
  seen:number;ago:number;
  /** Milliseconds since this browser's previous shot (cadence check). */
  dt:number;
}
const finite=z.number().finite();
const vec3=(limit:number)=>z.tuple([finite.min(-limit).max(limit),finite.min(-limit).max(limit),finite.min(-limit).max(limit)]);
export const shotSchema=z.object({
  n:z.number().int().min(0).max(65535),o:vec3(5000),d:vec3(1.01).refine(v=>Math.abs(Math.hypot(v[0],v[1],v[2])-1)<.01,'direção inválida'),
  sp:finite.min(0).max(.6),seen:finite.min(0),ago:finite.min(0).max(10_000),dt:finite.min(0).max(600_000),
}).strict();

/**
 * The firearm on an input: the weapon in hand ('' holstered), aiming down the sights, the aim's elevation (radians, up positive; the heading is the
 * input's `rotation`), the reload key's count (a new value is a new press), the fire mode's index, and the shots fired since the last input.
 */
export interface GunInput {w:WeaponId|'';ads?:boolean;p?:number;r?:number;m?:number;s?:ShotCommand[]}
export const gunInputSchema=z.object({
  w:z.union([z.literal(''),z.enum(WEAPON_IDS)]),ads:z.boolean().optional(),p:finite.min(-1.6).max(1.6).optional(),
  r:z.number().int().min(0).max(255).optional(),m:z.number().int().min(0).max(3).optional(),s:z.array(shotSchema).max(GUN.shotsPerInput).optional(),
}).strict();

/**
 * A player's firearm as the room shares it (Player.gun): the system on (/armas), the weapon in hand and its parts (encodeKit), aiming, the aim's
 * elevation, the rounds in it, when it was drawn, the reload (start, end, the rounds it started from), the last shot's count, the fire mode.
 */
export interface GunState {on:boolean;w:string;kit:string;ads:boolean;pitch:number;mag:number;drawAt:number;reloadAt:number;reloadUntil:number;reloadFrom:number;shots:number;mode:number}
export const NO_GUN:GunState={on:false,w:'',kit:'',ads:false,pitch:0,mag:0,drawAt:0,reloadAt:0,reloadUntil:0,reloadFrom:0,shots:0,mode:0};

/** How each bullet of a shot ended: spent (0), in a solid (1), in a body (2). */
export type PelletEnd=[x:number,y:number,z:number,kind:0|1|2];
/** A shot, as the room tells everyone within earshot (weapon.shot): who, with what, its count, when, from where (the muzzle), where each bullet ended. */
export interface WeaponShotEvent {by:string;w:WeaponId;n:number;at:number;o:Vec3;e:PelletEnd[];sup:boolean;kit:string}
/**
 * A shot that hit someone (weapon.hit), to the one hit, the shooter and those near: the zone of the first bullet in, the life taken by all of the
 * shot's bullets that landed (`pellets` of them) and what is left, where, which way it was going, and whether it took them out (`ko`).
 */
export interface WeaponHitEvent {by:string;to:string;w:WeaponId;n:number;zone:HitZone;damage:number;hp:number;ko:boolean;x:number;y:number;z:number;yaw:number;at:number;pellets:number}

/** A weapon owned: its parts, upgrade levels, and whether the player put it on the weapon wheel. */
export interface ArsenalWeapon {id:WeaponId;equipped:boolean;parts:Partial<Record<PartSlot,PartId>>;upgrades:Partial<Record<UpgradeTrack,number>>}
/**
 * Everything a player owns for shooting (weapon.arsenal, to the player alone): the weapons, the parts (each fits any weapon that takes it), the
 * rounds per calibre; `test`: the /armas kit (everything, upgrades free), `infinite`: rounds never run out. `draw`: draw this one now.
 */
export interface ArsenalView {test:boolean;infinite:boolean;weapons:ArsenalWeapon[];parts:PartId[];ammo:Partial<Record<Caliber,number>>;
  /** What an upgrade costs is upgradeCost × this (the live price table). */
  priceScale?:number;draw?:WeaponId}

export const weaponConfigureSchema=z.object({weapon:z.enum(WEAPON_IDS),slot:z.enum(PART_SLOTS),part:z.enum(PART_IDS).nullable()}).strict();
export const weaponEquipSchema=z.object({weapon:z.enum(WEAPON_IDS),equipped:z.boolean()}).strict();
export const weaponUpgradeSchema=z.object({weapon:z.enum(WEAPON_IDS),track:z.enum(UPGRADE_TRACKS)}).strict();
export type WeaponConfigure=z.infer<typeof weaponConfigureSchema>;
export type WeaponEquip=z.infer<typeof weaponEquipSchema>;
export type WeaponUpgrade=z.infer<typeof weaponUpgradeSchema>;
