/**
 * Playing with VR glasses (Meta Quest 2 and any other WebXR headset): the player's choice, and whether the browser can do it.
 *
 * The choice lives in this browser, like the touch controls (touch/touch-mode.ts). `enabled` only shows the "Entrar no VR"
 * button: a WebXR session can start only from a click, so the button, not the setting, starts it. While a session runs the
 * `vr-active` class is on <html> and every VR rule in vr.css hangs from it (docs/sistemas/vr.md).
 */
export type VrTurn='snap'|'smooth';
export interface VrSettings {
  /** Offers the VR button (in the toolbar, and in Configurações). */
  enabled:boolean;
  /** Right stick: turns in steps, or continuously. Steps are the comfortable one for most people. */
  turn:VrTurn;
  /** Degrees of one step. */
  snapDegrees:15|30|45;
  /** A dark ring closes in while the view moves or turns, which calms the stomach. */
  comfort:boolean;
  /** Share of the headset's own resolution that is drawn: the Quest 2 is a phone chip pushing two 1832×1920 eyes. */
  resolution:number;
  /** The Baixo graphics preset while in VR (no shadows, near city only): two eyes at 72+ Hz cost far more than one screen. */
  lightGraphics:boolean;
}
export const DEFAULT_VR:Readonly<VrSettings>={enabled:false,turn:'snap',snapDegrees:30,comfort:true,resolution:.65,lightGraphics:true};
const KEY='bar:vr:v1';
const CLASS='vr-active';
const listeners=new Set<(settings:VrSettings,active:boolean)=>void>();
let active=false;
let supported:boolean|undefined;

const pick=<T,>(value:unknown,options:readonly T[],fallback:T):T=>options.includes(value as T)?value as T:fallback;
export function readVr(saved:unknown):VrSettings {
  const v=(saved&&typeof saved==='object'?saved:{}) as Record<string,unknown>;
  return {
    enabled:v.enabled===true,
    turn:pick(v.turn,['snap','smooth'] as const,DEFAULT_VR.turn),
    snapDegrees:pick(v.snapDegrees,[15,30,45] as const,DEFAULT_VR.snapDegrees),
    comfort:typeof v.comfort==='boolean'?v.comfort:DEFAULT_VR.comfort,
    lightGraphics:typeof v.lightGraphics==='boolean'?v.lightGraphics:DEFAULT_VR.lightGraphics,
    resolution:typeof v.resolution==='number'&&Number.isFinite(v.resolution)?Math.min(1,Math.max(.5,v.resolution)):DEFAULT_VR.resolution,
  };
}
export function vrSettings():VrSettings {
  try{return readVr(JSON.parse(localStorage.getItem(KEY)??'null'));}catch{return {...DEFAULT_VR};}
}
export function updateVr(patch:Partial<VrSettings>):VrSettings {
  const next=readVr({...vrSettings(),...patch});
  try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* Applies for this visit. */}
  for(const listener of listeners)listener(next,active);
  return next;
}
/** Whether a VR session is running right now. */
export const vrActive=():boolean=>active;
export function setVrActive(on:boolean):void {
  if(on===active)return;
  active=on;
  document.documentElement.classList.toggle(CLASS,on);
  for(const listener of listeners)listener(vrSettings(),on);
}
/** `listener` hears every change of the choice and of the session, and once now. */
export function watchVr(listener:(settings:VrSettings,active:boolean)=>void):void {
  listeners.add(listener);
  listener(vrSettings(),active);
}
/**
 * Whether this browser can open an immersive VR session (the Quest Browser can; a desktop browser needs a headset plugged in
 * or an emulator). Asked once; the answer is cached. WebXR also needs a secure page (https or localhost).
 */
export async function vrSupported():Promise<boolean> {
  if(supported!==undefined)return supported;
  const xr=(navigator as Navigator&{xr?:{isSessionSupported(mode:string):Promise<boolean>}}).xr;
  if(!xr||!window.isSecureContext)return supported=false;
  try{supported=await xr.isSessionSupported('immersive-vr');}catch{supported=false;}
  return supported;
}
/**
 * The VR log: what happened on the way into the headset (stages, how long each took, errors, a snapshot every 2 s), kept in this browser
 * so it can be read on the desktop after trying in the headset (Configurações → Realidade virtual → Copiar log).
 */
const LOG_KEY='bar:vr-log:v1',LOG_MAX=300;
let lines:string[]|undefined;
const started=performance.now();
function loadLog():string[] {
  if(lines)return lines;
  try{const saved=JSON.parse(localStorage.getItem(LOG_KEY)??'[]');lines=Array.isArray(saved)?saved.filter((x:unknown):x is string=>typeof x==='string'):[];}catch{lines=[];}
  return lines;
}
export function vrLog(text:string):void {
  const list=loadLog();
  list.push(`${new Date().toISOString().slice(11,23)} +${((performance.now()-started)/1000).toFixed(1)}s ${text}`);
  if(list.length>LOG_MAX)list.splice(0,list.length-LOG_MAX);
  try{localStorage.setItem(LOG_KEY,JSON.stringify(list));}catch{/* Kept in memory only. */}
}
export function vrLogText():string {
  const nav=navigator as Navigator&{xr?:unknown};
  const head=`Highland Bar VR log
${navigator.userAgent}
página segura=${window.isSecureContext} xr=${!!nav.xr} host=${location.host} dpr=${window.devicePixelRatio} janela=${innerWidth}x${innerHeight}
config=${JSON.stringify(vrSettings())}
`;
  return head+loadLog().join('\n');
}
export function clearVrLog():void {lines=[];try{localStorage.removeItem(LOG_KEY);}catch{/* Nothing kept. */}}
/** The cause to tell the player when the VR button cannot work. */
export function vrUnavailableReason():string {
  if(!window.isSecureContext)return 'O VR só funciona em página segura (https). Abra o endereço https do jogo no navegador do óculos.';
  if(!(navigator as Navigator&{xr?:unknown}).xr)return 'Este navegador não tem WebXR. No Meta Quest 2, abra o jogo no Navegador do próprio óculos.';
  return 'Nenhum óculos VR foi encontrado por este navegador. No Meta Quest 2, abra o jogo no Navegador do próprio óculos (ou ligue o Quest Link/Air Link).';
}
