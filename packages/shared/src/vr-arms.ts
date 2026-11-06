import { z } from 'zod';

/**
 * The arms of a player in a VR headset (docs/sistemas/vr.md), as everyone else draws them. Each hand is nine numbers in the
 * body's own frame (x to its right, y up from the feet, z ahead of it, metres): where the wrist is, which way the fingers point
 * and which way the palm faces. The room keeps them as one short string (`Player.vrArms`, '' when not in VR) and forwards
 * nothing else: the bending of the arm is worked out by each client.
 */
export interface VrHand { wrist: [number, number, number]; fingers: [number, number, number]; palm: [number, number, number] }
export interface VrArms { l: VrHand | null; r: VrHand | null }

/** How far from the feet a wrist may be: a long arm reaching up and out, never across the room. */
export const VR_ARM_REACH = 1.2;
const hand = z.array(z.number().finite().min(-2.5).max(2.5)).length(9);
/** What a client sends (`player.arms`), up to about 15 times a second: nine numbers per hand, or null for a hand not tracked. */
export const vrArmsSchema = z.object({ l: hand.nullable(), r: hand.nullable() }).strict();
export type VrArmsMessage = z.infer<typeof vrArmsSchema>;

const flat = (h: VrHand): number[] => [...h.wrist, ...h.fingers, ...h.palm];
export const vrArmsMessage = (arms: VrArms): VrArmsMessage => ({ l: arms.l ? flat(arms.l) : null, r: arms.r ? flat(arms.r) : null });

/** The room's string: two hands separated by '|', each nine numbers to the centimetre (or empty). Wrists out of reach are refused. */
export function encodeVrArms(message: VrArmsMessage): string {
  const side = (values: number[] | null) => {
    if (!values) return '';
    if (Math.hypot(values[0]!, values[1]! - 1.2, values[2]!) > VR_ARM_REACH + .6) return '';
    return values.map(v => (Math.round(v * 100) / 100).toString()).join(',');
  };
  const l = side(message.l), r = side(message.r);
  return l || r ? `${l}|${r}` : '';
}
const read = (text: string | undefined): VrHand | null => {
  if (!text) return null;
  const v = text.split(',').map(Number);
  if (v.length !== 9 || v.some(n => !Number.isFinite(n))) return null;
  return { wrist: [v[0]!, v[1]!, v[2]!], fingers: [v[3]!, v[4]!, v[5]!], palm: [v[6]!, v[7]!, v[8]!] };
};
export function decodeVrArms(text: string | undefined): VrArms | null {
  if (!text) return null;
  const [l, r] = text.split('|');
  const arms = { l: read(l), r: read(r) };
  return arms.l || arms.r ? arms : null;
}
