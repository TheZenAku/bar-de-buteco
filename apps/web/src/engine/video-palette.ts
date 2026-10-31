/** sRGB, 0–1. */
export type Rgb = [number, number, number];
/**
 * The colours of a video, for the jukebox lights. The player is a cross-origin iframe, so no page may read its pixels.
 * YouTube's own stills can be read (i.ytimg.com answers with CORS): the cover, and the frames YouTube takes at 25 %,
 * 50 % and 75 % of the video. Other platforms give one cover, when their image server allows it (the same colours for
 * the whole video). Each still yields its few most vivid colours, dominant first.
 */
export interface VideoPalette { videoId: string; frames: Rgb[][] }
/** Where each still sits in the video (the cover stands for the opening). */
export const PALETTE_KEYS = [0, .25, .5, .75] as const;
const COLOURS = 3;
const SAMPLE_W = 48, SAMPLE_H = 27;
const HUE_BINS = 24;
const cache = new Map<string, Promise<VideoPalette>>();

/** The images to read for one video, one per PALETTE_KEYS; none (the prop's own colour) without a cover. */
export function mediaStills(provider: string, videoId: string, thumb: string | undefined): string[] {
  // A state from before the platforms existed, or a fixture's, is YouTube's.
  if (!provider || provider === 'youtube') return ['mqdefault', 'mq1', 'mq2', 'mq3'].map(name => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${name}.jpg`);
  return thumb ? PALETTE_KEYS.map(() => thumb) : [];
}

function still(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Sem a imagem ${url}`));
    image.src = url;
  });
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, max ? d / max : 0, max];
}

/** A colour at full brightness, its hue kept and its saturation lifted: the tube of a neon sign. */
export function neon([r, g, b]: Rgb): Rgb {
  const [h, s] = hsv(r, g, b), sat = Math.min(1, .3 + s * .85), k = h * 6, f = k - Math.floor(k), sector = Math.floor(k) % 6;
  const p = 1 - sat, q = 1 - sat * f, t = 1 - sat * (1 - f);
  return ([[1, t, p], [q, 1, p], [p, 1, t], [p, q, 1], [t, p, 1], [1, p, q]] as Rgb[])[sector]!;
}

/** The most vivid hues of a still, weighted by how much of the picture they cover; empty for a grey picture. */
function colours(image: HTMLImageElement): Rgb[] {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W; canvas.height = SAMPLE_H;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, SAMPLE_W, SAMPLE_H);
  const data = context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  const weight = new Float64Array(HUE_BINS), sums = Array.from({ length: HUE_BINS }, () => [0, 0, 0]);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255, g = data[i + 1]! / 255, b = data[i + 2]! / 255, [h, s, v] = hsv(r, g, b);
    // Near-black, washed-out and grey pixels carry no colour for a light.
    if (v < .14 || s < .2) continue;
    const w = s * s * v, bin = Math.min(HUE_BINS - 1, Math.floor(h * HUE_BINS));
    weight[bin]! += w; total += w;
    const sum = sums[bin]!; sum[0]! += r * w; sum[1]! += g * w; sum[2]! += b * w;
  }
  if (total <= 0) return [];
  const chosen: number[] = [];
  for (const bin of [...weight.keys()].sort((a, b) => weight[b]! - weight[a]!)) {
    if (chosen.length >= COLOURS || weight[bin]! < total * .04) break;
    // Neighbouring bins are the same colour: keep hues at least 30° apart.
    if (chosen.some(other => Math.min(Math.abs(other - bin), HUE_BINS - Math.abs(other - bin)) < 2)) continue;
    chosen.push(bin);
  }
  return chosen.map(bin => neon(sums[bin]!.map(c => c / weight[bin]!) as Rgb));
}

/** Loads (once per video) the palette of each still; a still without colour borrows the nearest one that has. */
export function videoPalette(videoId: string, stills: string[]): Promise<VideoPalette> {
  let pending = cache.get(videoId);
  if (!pending) {
    pending = Promise.all(stills.map(url => still(url).then(colours, () => [] as Rgb[]))).then(found => {
      const frames = found.map((_, i) => {
        for (let d = 0; d < found.length; d++) for (const j of [i - d, i + d]) if (found[j]?.length) return found[j]!;
        return [];
      });
      return { videoId, frames: frames.map(frame => Array.from({ length: COLOURS }, (_, i) => frame[i % Math.max(1, frame.length)]!).filter(Boolean)) };
    });
    cache.set(videoId, pending);
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return pending;
}
