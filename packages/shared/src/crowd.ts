/**
 * The crowd: how the world shows more people than a browser can draw as bodies.
 *
 * Each client gets the full state (the room's schema) of its FULL_DETAIL_MAX nearest players only; those are drawn as
 * skinned models. Everybody else within CROWD.radius arrives as a short binary record, a few times a second, and is
 * drawn as a flat sprite of the skin turned to the camera (apps/web/src/engine/crowd.ts). The server picks both sets,
 * so a client never holds more than it can draw, and the cost per client stays flat as the bar fills.
 */
import { SKINS } from './skins.js';

/** Players drawn as models: the nearest ones (the schema view, apps/server BarRoom.refreshViews). */
export const FULL_DETAIL_MAX = 32;
/** A player already in the view stays until this far (the area of interest is AOI_RADIUS to enter): no flicker at the edge. */
export const FULL_DETAIL_KEEP = 1.18;
export const CROWD = {
  /** Metres from the viewer to the furthest sprite. */
  radius: 140,
  /** Sprites per message (the nearest ones beyond the models). */
  max: 260,
  /** Seconds between messages: every second view refresh (BarRoom.refreshViews, 5 a second), and only when the list changed. */
  every: 0.4,
} as const;

/** Bytes of one record: slot u16, x y z i16 (decimetres), facing u8, skin u8, flags u8. */
export const CROWD_RECORD = 11;
export const CROWD_FLAG = { walk: 1, run: 2 } as const;

export interface CrowdRecord { slot: number; x: number; y: number; z: number; facing: number; skin: number; flags: number }

const TAU = Math.PI * 2;
/** The skin's number on the wire: its place in SKINS (an unknown skin is the first one). */
export const crowdSkinIndex = (id: string): number => Math.max(0, SKINS.findIndex(skin => skin.id === id));

export function writeCrowdRecord(view: DataView, offset: number, slot: number, x: number, y: number, z: number, rotation: number, skin: number, flags: number): void {
  view.setUint16(offset, slot); view.setInt16(offset + 2, Math.round(x * 10)); view.setInt16(offset + 4, Math.round(y * 10)); view.setInt16(offset + 6, Math.round(z * 10));
  view.setUint8(offset + 8, Math.round((((rotation % TAU) + TAU) % TAU) / TAU * 256) & 255); view.setUint8(offset + 9, skin); view.setUint8(offset + 10, flags);
}

export function readCrowd(bytes: ArrayBuffer | Uint8Array): CrowdRecord[] {
  const view = bytes instanceof Uint8Array ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new DataView(bytes);
  const out: CrowdRecord[] = [];
  for (let at = 0; at + CROWD_RECORD <= view.byteLength; at += CROWD_RECORD) {
    out.push({ slot: view.getUint16(at), x: view.getInt16(at + 2) / 10, y: view.getInt16(at + 4) / 10, z: view.getInt16(at + 6) / 10, facing: view.getUint8(at + 8) / 256 * TAU, skin: view.getUint8(at + 9), flags: view.getUint8(at + 10) });
  }
  return out;
}
