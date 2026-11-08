import type { CameraMode } from './camera-rig';
import type {MusicianState} from '@bar/shared';

/** Small presentation-only contracts. All game rules belong to the server. */
export interface SceneActor {
  id: string;
  /** The avatar's number in the crowd records (shared/crowd.ts). */
  slot?: number;
  name?: string;
  displayName?: string;
  x: number;
  y?: number;
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
}

export interface SceneWorld {
  players: SceneActor[];
  npcs: SceneActor[];
  event?: { type: string; startedAt?: number; durationMs?: number } | null;
}

export interface SceneInput {
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
}
