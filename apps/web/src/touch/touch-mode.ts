/**
 * Touch play. The game was written for a keyboard and a mouse; on a phone or tablet the same actions come from on-screen
 * controls (touch-controls.ts) that press the same keys, so nothing about the desktop paths changes.
 *
 * `auto` follows the device: a primary pointer that is a finger (`pointer: coarse`) turns the controls on. A laptop with a
 * touch screen keeps its mouse (its primary pointer is fine), and the player can still force either way in Configurações.
 * The mode is the `touch-ui` class on <html>; every touch rule in touch.css hangs from it.
 */
export type TouchPreference='auto'|'on'|'off';
const KEY='bar:touch-ui:v1';
const CLASS='touch-ui';
const listeners=new Set<(on:boolean)=>void>();
const coarse=()=>typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;

export function touchPreference():TouchPreference{
  try{const saved=localStorage.getItem(KEY);if(saved==='on'||saved==='off')return saved;}catch{/* Private mode: follow the device. */}
  return 'auto';
}
/** Whether the touch controls are in use right now. */
export const touchMode=():boolean=>document.documentElement.classList.contains(CLASS);
function apply():void{
  const preference=touchPreference(),on=preference==='on'||(preference==='auto'&&coarse());
  if(on===touchMode())return;
  document.documentElement.classList.toggle(CLASS,on);
  for(const listener of listeners)listener(on);
}
export function setTouchPreference(preference:TouchPreference):void{
  try{if(preference==='auto')localStorage.removeItem(KEY);else localStorage.setItem(KEY,preference);}catch{/* Applies for this visit. */}
  apply();
}
/** Starts following the device (and the player's choice); `listener` hears every change, and once now. */
export function watchTouchMode(listener:(on:boolean)=>void):void{
  listeners.add(listener);
  apply();
  listener(touchMode());
}
if(typeof matchMedia==='function'){
  // A tablet docked to a mouse (or back) changes its primary pointer.
  const query=matchMedia('(pointer: coarse)');
  query.addEventListener?.('change',apply);
  apply();
}
