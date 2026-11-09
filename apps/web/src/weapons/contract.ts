import type {PartId,PartSlot,PelletTrace,ReloadStyle,Vec3,WeaponHitEvent,WeaponId,WeaponShotEvent,WeaponStats} from '@bar/shared';

/**
 * The seam between the local gun's logic (weapons/local-gun.ts: input, timing, prediction, camera, HUD) and what the avatars show
 * (engine/weapons/visuals.ts: the weapon in the hands, the pose, flashes, tracers, impacts, sounds). docs/sistemas/armas.md#cliente.
 * Times are performance.now() milliseconds; angles radians; positions world metres.
 */

/** How long putting a weapon away takes (ms): a share of its draw, never long. The logic hides the weapon when it ends and the pose draws the same arc over the same time. */
export const holsterTime=(drawMs:number):number=>Math.min(320,drawMs*.6);

/** Something that happened to the local gun this frame that the avatar side plays a sound or a motion for. */
export type LocalGunEvent='draw'|'holster'|'mode'|'reloadStart'|'reloadEnd'|'scopeIn'|'scopeOut'|'zoom'|'breathIn'|'breathOut';

/** One shot of the local player, the moment it was fired here: its bullets as predicted (where they end, what they hit). */
export interface LocalShotFx {n:number;at:number;pellets:readonly PelletTrace[];suppressed:boolean;
  /** The last round: the slide stays back, the bolt does not cycle. */
  empty:boolean}

/** The local player's firearm this frame, as the logic decided it, ahead of the room. */
export interface LocalGunFrame {
  /** /armas is on for this player. */
  on:boolean;
  /** In hand ('' holstered); while switching, the one coming out. */
  weapon:WeaponId|'';
  parts:Partial<Record<PartSlot,PartId>>;
  stats:WeaponStats|undefined;
  /** When the current draw started (the weapon comes out over stats.drawMs), and when a holster started; 0 when none. */
  drawAt:number;holsterAt:number;
  /** 0-1 eased: aiming down the sights, and through a scope (past .5 the local weapon and head are hidden). */
  ads:number;scoped:number;
  /** The aim: heading (as PlayerState.rotation), elevation (up positive), and the world point the crosshair's ray found (the barrel converges on it). */
  heading:number;elevation:number;aimPoint:Vec3|undefined;
  /** The body turns to face the aim: aiming, or just after a shot from the hip. */
  facingAim:boolean;
  /** The weapon is held low: running, or the muzzle up against a wall. */
  lowered:boolean;
  /** A reload going on: when, how long, which kind, the rounds it goes from and to. */
  reload:{at:number;duration:number;style:ReloadStyle;from:number;to:number}|undefined;
  /** The hand-worked action after a shot (pump, lever, bolt) or the second barrel's hammer. */
  cycle:{at:number;duration:number;action:'pump'|'lever'|'bolt'|'double'}|undefined;
  /** Shots fired since the previous frame, oldest first. */
  shots:readonly LocalShotFx[];
  /** The trigger was pulled on an empty weapon this frame. */
  dry:boolean;
  events:readonly LocalGunEvent[];
  mag:number;
}

/** What the avatar side offers the logic and the network. */
export interface WeaponVisualsApi {
  /** Every frame, after the avatars are animated: the local player's gun (undefined: none). */
  local(frame:LocalGunFrame|undefined):void;
  /** A shot the room tells of (someone else's: the local player's own were drawn when fired). */
  remoteShot(event:WeaponShotEvent):void;
  /** A shot that hit someone, as the room settled it (blood, the body's flinch; `me` is the local player). */
  hit(event:WeaponHitEvent,me:string):void;
  /** Where the muzzle of an avatar's weapon is drawn now, if one is in hand. */
  muzzle(id:string):Vec3|undefined;
  /** A sound of the interface, not of the world: the hit marker's tick, a headshot, a knockout. */
  cue(name:'hit'|'headshot'|'kill'):void;
}
