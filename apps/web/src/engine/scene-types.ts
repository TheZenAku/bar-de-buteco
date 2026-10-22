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
  state?: string;
  color?: string;
  avatarColor?: string;
  role?: string;
  /** Player model id (see SKINS); NPCs keep the box avatar. */
  skin?: string;
  character?: string;
  oldWalk?: boolean;
  /** False for an avatar left in the bar by a player who logged out. */
  connected?: boolean;
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
  onEmote?: (emote: string) => void;
}
