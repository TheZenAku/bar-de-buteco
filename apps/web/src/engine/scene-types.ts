import type { CameraMode } from './camera-rig';
import type {FistState,GunState,MusicianState,PunchId} from '@bar/shared';

/** Small presentation-only contracts. All game rules belong to the server. */
export interface SceneActor {
  id: string;
  /** The avatar's number in the crowd records (shared/crowd.ts). */
  slot?: number;
  name?: string;
  displayName?: string;
  x: number;
  y?: number;
  verticalVelocity?: number;
  grounded?: boolean;
  landingTime?: number;
  z: number;
  rotation?: number;
  headYaw?:number;
  headPitch?:number;
  /** A VR player's hands (packages/shared/src/vr-arms.ts), '' or absent otherwise. */
  vrArms?:string;
  animation?: string;
  animationStartedAt?: number;
  interactionState?: string;
  currentTableId?: string;
  cardResult?: string;
  /** Number of public cards in this player's blackjack hand (only used to draw held props). */
  cardCount?:number;
  state?: string;
  color?: string;
  avatarColor?: string;
  role?: string;
  /** Player model id (see SKINS); NPCs keep the box avatar. */
  skin?: string;
  oldWalk?: boolean;
  /** The drink in hand for the Drink clip (NPCs; players drink with `holding`). */
  drinkItem?: string;
  /** What a player has in hand and is having, since/until when (server clock): a drink is raised and sipped over the body. */
  holding?: string;
  fireworkEquipped?:boolean;
  holdingSince?: number;
  holdingUntil?: number;
  smokingSince?:number;
  smokingStopAt?:number;
  armsCrossed?:boolean;
  /** Tonico's tray: the items he carries, comma-separated, and the order they belong to. */
  carrying?: string;
  carryingOrder?: string;
  /** A Highfood shift: the backpack, and the bag in hand. */
  courier?: boolean;
  horseRearAt?:number;
  parcel?: string;
  /** The Ribeiro workpiece in both hands ('raw' | 'cut' | 'machined' | 'finished' | 'assembled'), '' or absent when none. */
  ribeiroPart?: string;
  /** With the phone in front of them: standing still they look at it (the Text clip, with a phone in hand). */
  looking?: boolean;
  /** False for an avatar left in the bar by a player who logged out. */
  connected?: boolean;
  /** Drunkenness 0-100 (packages/shared/src/needs.ts): the body sways by stage. */
  drunk?: number;
  /** Which dance clip G plays, drawn by the room each time the player starts dancing (taken modulo the dance clips). */
  dance?: number;
  /** The skill being played while `animation` is 'kick' (SKILLS). */
  skill?: string;
  /** The stage spot this player plays at, as the room syncs it (packages/shared/src/musicians.ts). */
  musician?: MusicianState;
  /** The fist fight as the room has it (packages/shared/src/fight.ts): the guard, the last punch, the last blow taken. */
  fist?: Partial<FistState>;
  /** The firearm as the room has it (packages/shared/src/weapons/protocol.ts, GunState): the weapon in hand, its parts, aiming, rounds, reload. */
  gun?: Partial<GunState>;
}

/**
 * The local player's fight as drawn ahead of the room (apps/web/src/fight/fight-controller.ts): the guard asked for here, the punch from the click
 * (performance.now), and the blow taken from the room's message.
 */
export interface LocalFightView {
  guard: boolean;
  /** The block is up here (drawn at once, ahead of the room). */
  block?: boolean;
  punch?: { move: PunchId; n: number; startedAt: number; landed?: boolean };
  blow?: { reaction: string; yaw: number; startedAt: number; until: number };
}

export interface SceneWorld {
  players: SceneActor[];
  npcs: SceneActor[];
  event?: { type: string; startedAt?: number; durationMs?: number } | null;
}

export interface SceneInput {
  jump?:boolean;
  rear?:boolean;
  /** Flying only: climb (+1, Space) or sink (-1, Ctrl). */
  dy?:number;
  /** Flying only: the vertical part of the camera's aim (the flight goes where the camera looks). */
  aim?:number;
  headYaw?:number;
  headPitch?:number;
  dx: number;
  dz: number;
  running: boolean;
  /** Radians. Zero faces positive Z. */
  rotation: number;
}

/** The minimap's view (BarScene.mapView): drawn positions, the avatar's heading and the camera's (radians). */
export interface MapView {
  x: number; y: number; z: number;
  /** The camera's heading: the map turns so that the view points up. */
  yaw: number;
  /** Where the avatar faces: atan2(dx, dz), as PlayerState.rotation. */
  facing: number;
  others: Array<{ id: string; x: number; y: number; z: number; npc: boolean }>;
  /** On a bike: the map shows further. */
  riding?: boolean;
}

export interface SceneLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  local: boolean;
  npc: boolean;
}

export interface SceneCallbacks {
  onFirework?:(direction:{x:number;y:number;z:number})=>void;
  onFireworkStow?:()=>void;
  /** One authoritative clock shared with the network and interface. */
  serverNow?:()=>number;
  /** The entry's backdrop (engine/showcase.ts): how covered the screen is by the fade between two angles, 0 to 1. */
  onShowcaseCut?: (cut: number) => void;
  /** The backdrop could not keep a steady frame rate and switched itself off. */
  onShowcaseSlow?: () => void;
  onInteract?: () => void;
  onEmote?: (emote: 'dance' | 'wave' | 'smoke' | 'cigarette' | 'cross-arms') => void;
  onChat?: () => void;
  onSkins?: () => void;
  /** Z: the names over the heads show for a few seconds. */
  onShowNames?: () => void;
  /** B: an administrator takes off or lands (the room refuses anyone else). */
  onFly?: () => void;
  /** A key the game has no use for on foot, pressed in the world: true when it was the active skill's. */
  onSkillKey?: (code: string) => boolean;
  onMediaFrame?: () => void;
  /** VR: a window, the phone, a table or a menu is open, so the headset shows the screen and the sticks leave the world alone. */
  vrWindowOpen?: () => boolean;
  /** VR: the session ended (the headset came off, the system menu closed it, or the player left). */
  onVrEnd?: (reason: string) => void;
  /** VR: something to tell the player (shown on the screen's notices). */
  onVrNotice?: (text: string) => void;
  /** VR: the local player's hands, to send to the room (player.arms) so others see the arms move. */
  onVrArms?: (arms: import('@bar/shared').VrArmsMessage) => void;
  /** Each frame, before the bikes are drawn: seconds since the last one. */
  onFrame?: (dt: number) => void;
  /** The player changed the view or zoom; distance is the last positive third-person distance. */
  onCameraChange?: (mode: CameraMode, distance: number) => void;
  /** A right click (no drag) on a player (the local one too) or a bike, at this point of the window. */
  onWorldMenu?: (x: number, y: number, hit: { player?: string; moto?: string }) => void;
  /** The player's overall volume, for world effects including engines and footsteps (0–1). */
  motoVolume?: () => number;
  onVehicleControl?:(id:string,action:string)=>void;
  /** The fist fight: R (guard up or down), a mouse button or touch button with the guard up (true when it threw, so the click is not the view's), and what this browser draws ahead of the room. */
  onGuard?:()=>void;
  onPunch?:(kind:'light'|'heavy'|'kick')=>boolean;
  /** The block key (Space, or the touch button) went down or up; true when the guard was up to take it. */
  onBlock?:(down:boolean)=>boolean;
  fight?:()=>LocalFightView|undefined;
}
