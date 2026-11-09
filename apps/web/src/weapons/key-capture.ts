import {bindable,inputCode,mouseCode} from './key-bindings';

/**
 * Choosing a weapon key (Esc › Ajustes › Armas e mira › Teclas das armas): after a click on an action the next key, or the mouse's back or forward
 * button, is its new input. Esc cancels, Delete or Backspace leaves the action without a key, a key the game needs elsewhere is refused with a
 * word and the capture goes on, the left, middle and right buttons cancel. While it runs it owns every key (the pause menu steps aside
 * when it sees `data-capturing`), and the side buttons never navigate the page back.
 */
export function captureWeaponKey(button:HTMLElement,done:(code:string|undefined)=>void,refuse:(text:string)=>void):void {
  const label=button.querySelector('span'),before=label?.textContent??'';
  button.setAttribute('data-capturing','');
  if(label)label.textContent='Aperte uma tecla…';
  const stop=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
  function end(code:string|undefined):void {
    window.removeEventListener('keydown',onKey,true);window.removeEventListener('mousedown',onMouse,true);window.removeEventListener('blur',lost);
    for(const type of ['mouseup','auxclick'])window.removeEventListener(type,onSide,true);
    button.removeAttribute('data-capturing');
    if(label&&button.isConnected)label.textContent=before;
    done(code);
  }
  // The row was drawn again under the capture (the menu refreshed) or the window lost focus: the capture is over, it must not keep the keys.
  const lost=()=>end(undefined);
  function onKey(event:KeyboardEvent):void {
    if(!button.isConnected)return end(undefined);
    stop(event);
    if(event.repeat)return;
    if(event.code==='Escape')return end(undefined);
    if(event.code==='Delete'||event.code==='Backspace')return end('');
    const code=inputCode(event.code);
    if(!bindable(code)){refuse('Essa tecla é usada em outra coisa. Escolha outra.');return;}
    end(code);
  }
  function onMouse(event:MouseEvent):void {
    if(!button.isConnected)return end(undefined);
    const code=mouseCode(event.button);
    if(!code){if(event.target instanceof Node&&button.contains(event.target))return;stop(event);end(undefined);return;}
    stop(event);end(code);
  }
  // The side buttons' release (the browser goes back on it): taken while the capture runs. Never pointerdown: cancelling it would also cancel the mousedown.
  function onSide(event:Event):void {if((event as MouseEvent).button>=3)stop(event);}
  window.addEventListener('keydown',onKey,true);window.addEventListener('mousedown',onMouse,true);window.addEventListener('blur',lost);
  for(const type of ['mouseup','auxclick'])window.addEventListener(type,onSide,true);
}

/** The mouse's back and forward buttons never navigate away from the game: they are weapon keys (or nothing). */
export function guardSideButtons(inGame:()=>boolean):void {
  const take=(event:Event)=>{if((event as MouseEvent).button>=3&&inGame())event.preventDefault();};
  for(const type of ['mousedown','mouseup','auxclick'])window.addEventListener(type,take,true);
}
