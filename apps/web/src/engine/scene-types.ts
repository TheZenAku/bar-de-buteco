import type { CameraMode } from './camera-rig';
import type {MusicianState} from '@bar/shared';

/** Small presentation-only contracts. All game rules belong to the server. */
export interface SceneActor {
  id: string;
  name?: string;
  displayName?: string;
  x: number;
  y?: number;
  z: number;
  rotation?: number;
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
  /** The drink held while drinking (HELD_DRINKS: ordered at the counter or taken from the backpack). */
  drinkItem?: string;
  /** Tonico's tray: the items he carries, comma-separated, and the order they belong to. */
  carrying?: string;
  carryingOrder?: string;
  /** False for an avatar left in the bar by a player who logged out. */
  connected?: boolean;
  /** Drunkenness 0-100 (packages/shared/src/needs.ts): the body sways by stage. */
  drunk?: number;
  /** The stage spot this player plays at, as the room syncs it (packages/shared/src/musicians.ts). */
  musician?: MusicianState;
}

export interface SceneWorld {
  players: SceneActor[];
  npcs: SceneActor[];
  event?: { type: string; startedAt?: number; durationMs?: number } | null;
}

export interface SceneInput {
  dx: number;
  dz: number;
  running: boolean;
  /** Radians. Zero faces positive Z. */
  rotation: number;
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
  onInteract?: () => void;
  onEmote?: (emote: 'dance' | 'wave' | 'smoke') => void;
  onChat?: () => void;
  onSkins?: () => void;
  onKick?: () => void;
  onMediaFrame?: () => void;
  /** The player switched the camera view (Q or the mouse wheel). */
  onCameraMode?: (mode: CameraMode) => void;
}
