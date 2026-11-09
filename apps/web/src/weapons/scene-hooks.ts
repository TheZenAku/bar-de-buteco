import type {ShotTarget,Vec3} from '@bar/shared';
import type {CameraRig} from '../engine/camera-rig';
import type {LocalGunFrame} from './contract';

/**
 * The seam between BarScene and the local firearm's logic (weapons/controller.ts). The scene calls these from its input listeners and its frame
 * (main.ts attaches the controller as `scene.weapons`); every call is a no-op answer (false, 1, undefined) while /armas is off, so the scene
 * behaves as before.
 */
export interface WeaponSceneHooks {
  /** A key went down or up (real or made up: the touch overlay's Weapon* codes). True: it was the weapons' (the scene does nothing else with it). */
  key(code:string,down:boolean,repeat:boolean):boolean;
  /** A mouse button went down or up on the view (mousedown/mouseup: a second button pressed while one is held arrives too). True: taken. */
  button(button:number,down:boolean):boolean;
  /** A weapon is in hand: clicks and taps do not open the world menu nor fire the firework. */
  armed():boolean;
  /** Pointer movement while the view would turn: true when the weapons take it (the weapon wheel is open). */
  pointer(dx:number,dy:number):boolean;
  /** The mouse wheel: true when a scope took it (its zoom steps). */
  scroll(deltaY:number):boolean;
  /** Each frame on foot, before the camera follows (realDt): the pad's look, aim assistance, the rig's aim and scope, the body's facing. */
  before(dt:number):void;
  /** Each frame, after the camera is placed and the avatars animated: the gun's logic with the rendered camera; what weaponVisuals.local draws. */
  frame(dt:number):LocalGunFrame|undefined;
  /** The camera's magnification now (1: none), applied after the FOV's other terms. */
  zoom():number;
  /** The body turns to the aim this frame. */
  facingAim():boolean;
  /** The page lost focus or the scene was disabled: let go of everything held. */
  blur():void;
}

/** What the scene offers the weapons (BarScene.gunPort()). */
export interface GunScenePort {
  readonly rig:CameraRig;
  /** The rendered camera: where it is, where it looks (unit), its vertical field of view now (degrees), the canvas's CSS size. */
  camera():{origin:Vec3;forward:Vec3;fov:number;width:number;height:number};
  /** The local avatar as drawn (undefined while it is not in the world). */
  local():{id:string;feet:Vec3;skin?:string;speed:number}|undefined;
  /** The hands are free for a weapon: on foot, not seated, riding, flying or knocked down, and not in a special view (selfie, TV, stage, VR). */
  free():boolean;
  /** The others a bullet could hit, as drawn: standing players and training dummies (no NPCs, no one seated, riding or thrown). */
  targets():ShotTarget[];
  /** Turns the local body to this heading now (between inputs). */
  face(heading:number):void;
  /** The run key (Shift, the touch latch) is held. */
  sprintHeld():boolean;
  /** A world point on the canvas (CSS pixels), if it is in front of the camera. */
  project(point:Vec3):{x:number;y:number}|undefined;
  /** The drawn position of someone near (their feet). */
  position(id:string):Vec3|undefined;
  /** The touch stick's axis and run, which the gamepad's left stick drives too. */
  setTouchAxis(x:number,y:number):void;
  setTouchSprint(on:boolean):void;
  /** A finger dragged on the fire button turns the view like one dragged on the scene. */
  touchLook(dx:number,dy:number):void;
}
