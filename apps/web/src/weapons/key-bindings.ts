/**
 * The firearms' keys on the keyboard and the mouse (docs/sistemas/armas.md#teclas), chosen by the player in Esc › Ajustes › Armas e mira and kept
 * in this browser (settings.ts key `weaponKeys`). An input is a KeyboardEvent.code, or `Mouse4` / `Mouse5` for the mouse's side buttons
 * (event.button 3 and 4, named as games name them); '' is an action left without a key. Firing and aiming stay on the left and right buttons,
 * the digits pick by the wheel's order, and the gamepad and the touch buttons have their own fixed layout.
 */
export const WEAPON_ACTIONS=['wheel','arsenal','holster','reload','mode','next','prev','shoulder','breath'] as const;
export type WeaponAction=typeof WEAPON_ACTIONS[number];
export type WeaponKeys=Record<WeaponAction,string>;

export const DEFAULT_WEAPON_KEYS:Readonly<WeaponKeys>={wheel:'CapsLock',arsenal:'KeyU',holster:'KeyX',reload:'KeyR',mode:'KeyV',next:'Mouse5',prev:'Mouse4',shoulder:'KeyH',breath:'ShiftLeft'};
/** Each action's name and what it does, as the settings page lists them. */
export const WEAPON_ACTION_NAMES:Readonly<Record<WeaponAction,readonly [string,string]>>={
  wheel:['Roda de armas','Segure e solte em cima da arma; um toque deixa aberta'],
  arsenal:['Arsenal','Equipamentos e melhorias'],
  holster:['Guardar ou sacar','Guarda a arma ou saca a última'],
  reload:['Recarregar',''],
  mode:['Modo de tiro','Automático ou semi'],
  next:['Arma seguinte','Na ordem da roda'],
  prev:['Arma anterior','Na ordem da roda'],
  shoulder:['Trocar o ombro','O lado da câmera'],
  breath:['Segurar o fôlego','Na luneta, enquanto segura'],
};

/** The mouse's side buttons as inputs (the left, middle and right ones are the game's: fire, the mouse capture, aim). */
export const mouseCode=(button:number):string=>button===3?'Mouse4':button===4?'Mouse5':'';
/** A key as the bindings know it: the right-hand Shift, Ctrl and Alt are the left-hand ones. */
export const inputCode=(code:string):string=>code==='ShiftRight'?'ShiftLeft':code==='ControlRight'?'ControlLeft':code==='AltRight'?'AltLeft':code;

// Keys the game or the browser needs wherever the player is: walking, jumping, interacting, the chat, the camera, the wheel's digits, the menus.
const RESERVED=/^(Escape|Enter|NumpadEnter|Tab|Space|Backspace|Delete|Key[WASDETQBCFGZKNOY]|Arrow\w+|Digit\d|Meta\w+|OS\w+|ContextMenu|F\d+|PrintScreen|NumLock|ScrollLock|Pause)$/;
/** Whether an input can be a weapon's key. */
export const bindable=(code:string):boolean=>!!code&&(/^Mouse[45]$/.test(code)||(!code.startsWith('Mouse')&&!code.startsWith('Weapon')&&!RESERVED.test(code)&&code.length<=24));

const NAMES:Readonly<Record<string,string>>={CapsLock:'Caps Lock',ShiftLeft:'Shift',ControlLeft:'Ctrl',AltLeft:'Alt',Mouse4:'Mouse 4',Mouse5:'Mouse 5',Backquote:'\'',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',
  Backslash:'\\',Semicolon:';',Quote:'~',Comma:',',Period:'.',Slash:'/',IntlBackslash:'\\',IntlRo:'/',Insert:'Insert',Home:'Home',End:'End',PageUp:'Page Up',PageDown:'Page Down',
  NumpadAdd:'Num +',NumpadSubtract:'Num -',NumpadMultiply:'Num *',NumpadDivide:'Num /',NumpadDecimal:'Num ,'};
/** What a key reads as on a key cap ('' for none). */
export function keyLabel(code:string):string {
  if(!code)return '';
  const known=NAMES[code];if(known)return known;
  if(code.startsWith('Key'))return code.slice(3);
  if(code.startsWith('Numpad'))return `Num ${code.slice(6)}`;
  return code;
}
/** The action an input is bound to. */
export function actionOf(keys:WeaponKeys,code:string):WeaponAction|undefined {
  if(!code)return undefined;
  for(const action of WEAPON_ACTIONS)if(keys[action]===code)return action;
  return undefined;
}
/** `action` on `code` ('' leaves it without a key): whatever had that input takes the key the action had, so nothing is left out by accident. */
export function withWeaponKey(keys:WeaponKeys,action:WeaponAction,code:string):WeaponKeys {
  const next={...keys},other=actionOf(keys,code);
  if(other&&other!==action)next[other]=keys[action];
  next[action]=code;
  return next;
}
/** Whatever a browser saved (nothing, junk, an older set of actions) as valid bindings: unknown inputs go back to the default, a repeated one stays with the first action. */
export function readWeaponKeys(value:unknown):WeaponKeys {
  const saved=(value&&typeof value==='object'?value:{}) as Record<string,unknown>,out={...DEFAULT_WEAPON_KEYS},taken=new Set<string>(),chosen=new Set<WeaponAction>();
  // What the player saved first (each key to its first action), then the defaults of the actions they left alone, only where the key is still free.
  for(const action of WEAPON_ACTIONS){
    const raw=saved[action],code=typeof raw==='string'?inputCode(raw):raw;
    if(code===''||(typeof code==='string'&&bindable(code)&&!taken.has(code))){out[action]=code;chosen.add(action);if(code)taken.add(code);}
  }
  for(const action of WEAPON_ACTIONS){
    if(chosen.has(action))continue;
    const code=DEFAULT_WEAPON_KEYS[action];
    out[action]=code&&!taken.has(code)?code:'';
    if(out[action])taken.add(code);
  }
  return out;
}
