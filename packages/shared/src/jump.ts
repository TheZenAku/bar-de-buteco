/** Metres and seconds. A standing jump rises 0.97 m and returns in about 0.89 s. */
export const JUMP = { impulse: 4.35, gravity: 9.81, terminalSpeed: 30, contact: .035, landingSeconds: .18 } as const;

/** Part of the existing character integrator, replicated for input reconciliation. */
export interface JumpMotion {
  verticalVelocity: number;
  grounded: boolean;
  jumpHeld: boolean;
  landingTime: number;
}
export function jumpMotion(state: Partial<JumpMotion> = {}): JumpMotion {
  return { verticalVelocity: state.verticalVelocity ?? 0, grounded: state.grounded ?? true,
    jumpHeld: state.jumpHeld ?? false, landingTime: state.landingTime ?? 0 };
}

/** The server and prediction use the same action restrictions; floor contact is checked separately. */
export function canJump(actor: {
  animationState?: string; animation?: string; interactionState?: string; currentTableId?: string;
  connected?: boolean; hp?: number; fist?: { fight?: boolean }; gun?: { reloadUntil?: number };
}, now = 0): boolean {
  return actor.connected !== false && actor.hp !== 0 && !actor.interactionState && !actor.currentTableId &&
    !actor.fist?.fight && !(actor.gun?.reloadUntil && actor.gun.reloadUntil > now) &&
    ['idle', 'walk', 'run', 'land'].includes(actor.animationState ?? actor.animation ?? 'idle');
}

export function jumpAnimation(motion: JumpMotion): 'jump' | 'fall' | 'land' | undefined {
  return !motion.grounded ? motion.verticalVelocity > 0 ? 'jump' : 'fall' : motion.landingTime > 0 ? 'land' : undefined;
}
