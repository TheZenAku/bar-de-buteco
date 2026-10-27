/** Graphics options of this browser (Configurações → Gráficos), applied by BarScene.setGraphics. */
export type ShadowQuality='off'|'low'|'medium'|'high'|'ultra';
export type FogDensity='light'|'normal'|'dense';
export type GraphicsPreset='low'|'medium'|'high'|'ultra'|'custom';
export interface GraphicsSettings {
  preset:GraphicsPreset;
  /** Fraction of the screen's resolution rendered (the browser scales it up): 0.5–1. */
  renderScale:number;
  /** Lowers the render scale while the frame rate stays below the target, and raises it back when there is room. */
  dynamicResolution:boolean;
  shadows:ShadowQuality;
  fog:FogDensity;
  /** Frames per second drawn at most; 0 follows the screen. */
  fpsCap:0|30|60|120;
  /** Sharper image on high-density screens (above 1.5× costs a lot on phones). */
  pixelRatioCap:1|1.5|2;
}
export const GRAPHICS_PRESETS:Record<Exclude<GraphicsPreset,'custom'>,Omit<GraphicsSettings,'preset'>>={
  low:{renderScale:.6,dynamicResolution:true,shadows:'off',fog:'dense',fpsCap:30,pixelRatioCap:1},
  medium:{renderScale:.8,dynamicResolution:true,shadows:'low',fog:'normal',fpsCap:60,pixelRatioCap:1},
  // Alto is exactly the previous fixed quality: nothing adapts unless the player turns it on.
  high:{renderScale:1,dynamicResolution:false,shadows:'high',fog:'normal',fpsCap:0,pixelRatioCap:1.5},
  ultra:{renderScale:1,dynamicResolution:false,shadows:'ultra',fog:'light',fpsCap:0,pixelRatioCap:2},
};
export const PRESET_LABELS:Record<GraphicsPreset,string>={low:'Baixo',medium:'Médio',high:'Alto',ultra:'Ultra',custom:'Personalizado'};
/** Phones and tablets start on Médio; computers on Alto. */
export function defaultGraphics():GraphicsSettings {
  const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
  const preset=coarse?'medium':'high';
  return {preset,...GRAPHICS_PRESETS[preset]};
}
const pick=<T,>(value:unknown,options:readonly T[],fallback:T):T=>options.includes(value as T)?value as T:fallback;
export function readGraphics(saved:unknown):GraphicsSettings {
  const fallback=defaultGraphics();
  if(!saved||typeof saved!=='object')return fallback;
  const g=saved as Record<string,unknown>;
  return {
    preset:pick(g.preset,['low','medium','high','ultra','custom'] as const,fallback.preset),
    renderScale:typeof g.renderScale==='number'&&Number.isFinite(g.renderScale)?Math.max(.5,Math.min(1,g.renderScale)):fallback.renderScale,
    dynamicResolution:typeof g.dynamicResolution==='boolean'?g.dynamicResolution:fallback.dynamicResolution,
    shadows:pick(g.shadows,['off','low','medium','high','ultra'] as const,fallback.shadows),
    fog:pick(g.fog,['light','normal','dense'] as const,fallback.fog),
    fpsCap:pick(g.fpsCap,[0,30,60,120] as const,fallback.fpsCap),
    pixelRatioCap:pick(g.pixelRatioCap,[1,1.5,2] as const,fallback.pixelRatioCap),
  };
}
/** Fog start/end multiplier: denser fog also hides more of the distant city, which is cheaper to draw. */
export const FOG_SCALE:Record<FogDensity,number>={light:1.35,normal:1,dense:.7};
