/** Small presentation-only contracts. All game rules belong to the server. */
export interface SceneActor {
  id: string;
  name?: string;
  displayName?: string;
  x: number;
  z: number;
  rotation?: number;
  animation?: string;
  state?: string;
  color?: string;
  avatarColor?: string;
  role?: string;
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
