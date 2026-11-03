import type {HighfoodLockerView} from '@bar/shared';
import type {PhoneSounds} from '../phone/core';
import {uiIcon} from '../ui-icons';

const DIGITS=4,KEYS=['1','2','3','4','5','6','7','8','9','x','0','ok'] as const;
/** How long the open door stays on the screen before it closes by itself (ms). */
const DOOR_MS=1300;

/**
 * The pickup point's screen: what E shows there. The code is in the order, in the app, and only the room checks it; the phone
 * stays usable over the screen, so whoever forgot the digits can look them up. Digits, Backspace, Enter and Esc work like the keys on it.
 */
export function createLockerPad(root:HTMLElement,actions:{submit:(orderId:string,code:string)=>void;leave:()=>void;showCode:()=>void;phoneOpen:()=>boolean;sounds:PhoneSounds}){
  const node=document.createElement('section');
  node.id='food-locker';node.className='locker';node.hidden=true;node.setAttribute('role','dialog');node.setAttribute('aria-label','Ponto de retirada');
  node.innerHTML=`<div class="locker-bezel"><div class="locker-screen">
    <header class="locker-head"><img src="${import.meta.env.BASE_URL}highfood/logo-icon.webp" alt="" draggable="false"><span><b>HIGHLAND BAR</b><i>DELIVERY</i></span></header>
    <h2 class="locker-title">RETIRE SEU PEDIDO</h2>
    <p class="locker-sub" aria-live="polite"></p>
    <div class="locker-code" role="group" aria-label="Código de retirada">${'<span></span>'.repeat(DIGITS)}</div>
    <div class="locker-keys">${KEYS.map(key=>`<button type="button" data-locker-key="${key}"${key==='x'?' aria-label="Apagar"':key==='ok'?' aria-label="Confirmar"':''}>${key}</button>`).join('')}</div>
    <button type="button" class="locker-open" data-locker-key="ok">ABRIR PORTA</button>
    <div class="locker-done" hidden>${uiIcon('check')}<b>PORTA ABERTA</b><small>Pegue o seu pedido</small></div>
  </div></div>
  <div class="locker-foot"><button type="button" data-locker="code">Ver o código no app<kbd>K</kbd></button><button type="button" data-locker="leave">Sair<kbd>Esc</kbd></button></div>`;
  root.append(node);
  const screen=node.querySelector<HTMLElement>('.locker-screen')!,sub=node.querySelector<HTMLElement>('.locker-sub')!,done=node.querySelector<HTMLElement>('.locker-done')!;
  const cells=[...node.querySelectorAll<HTMLElement>('.locker-code span')];
  const PROMPT='digite o código do pedido';
  let current:HighfoodLockerView|undefined,code='',waiting=false,closing:ReturnType<typeof setTimeout>|undefined,wrong:ReturnType<typeof setTimeout>|undefined;
  function draw():void {
    cells.forEach((cell,i)=>{cell.textContent=code[i]??'';cell.classList.toggle('next',i===code.length);});
  }
  function clearWrong():void {
    clearTimeout(wrong);
    if(!screen.classList.contains('wrong'))return;
    screen.classList.remove('wrong');sub.classList.remove('wrong');sub.textContent=PROMPT;
  }
  function press(key:string):void {
    if(!current||waiting||!done.hidden)return;
    actions.sounds.click();
    if(key==='x'){clearWrong();code=code.slice(0,-1);draw();return;}
    if(key==='ok'){
      if(code.length<DIGITS){sub.classList.add('wrong');sub.textContent=`Faltam ${DIGITS-code.length} ${DIGITS-code.length===1?'dígito':'dígitos'}`;return;}
      waiting=true;actions.submit(current.orderId,code);return;
    }
    clearWrong();sub.classList.remove('wrong');sub.textContent=PROMPT;
    if(code.length<DIGITS){code+=key;draw();}
  }
  const onKey=(event:KeyboardEvent)=>{
    if(!current)return;
    const target=event.target as HTMLElement|null;
    if(target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    // K and the Esc that closes the phone go on as usual: the code is there.
    if(event.code==='KeyK'||(event.key==='Escape'&&actions.phoneOpen()))return;
    const key=/^\d$/.test(event.key)?event.key:event.key==='Backspace'||event.key==='Delete'?'x':event.key==='Enter'?'ok':'';
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();actions.leave();close();return;}
    if(key){event.preventDefault();event.stopPropagation();if(!event.repeat)press(key);return;}
    // The E that opened it, held or pressed again, must not reach the game behind.
    if(event.code==='KeyE'){event.preventDefault();event.stopPropagation();}
  };
  function close():void {
    current=undefined;clearTimeout(closing);clearTimeout(wrong);node.classList.remove('open');
    removeEventListener('keydown',onKey,true);
    setTimeout(()=>{if(!current)node.hidden=true;},200);
  }
  node.addEventListener('click',event=>{
    const target=event.target as HTMLElement,key=target.closest<HTMLElement>('[data-locker-key]')?.dataset.lockerKey;
    if(key){press(key);target.closest('button')?.blur();return;}
    const action=target.closest<HTMLElement>('[data-locker]')?.dataset.locker;
    if(action==='code')actions.showCode();
    else if(action==='leave'&&current){actions.leave();close();}
  });
  return {
    get isOpen(){return !!current;},
    show(locker:HighfoodLockerView|null):void {
      if(!locker){if(current)close();return;}
      clearTimeout(closing);
      if(!current)addEventListener('keydown',onKey,true);
      current=locker;code='';waiting=false;done.hidden=true;screen.classList.remove('wrong');sub.classList.remove('wrong');sub.textContent=PROMPT;
      node.hidden=false;draw();
      requestAnimationFrame(()=>node.classList.add('open'));
    },
    /** What the room said about the code. */
    answer(right:boolean):void {
      if(!current)return;
      waiting=false;
      if(right){actions.sounds.ding();done.hidden=false;closing=setTimeout(close,DOOR_MS);return;}
      actions.sounds.denied();
      code='';draw();
      screen.classList.remove('wrong');void screen.offsetWidth;screen.classList.add('wrong');
      sub.classList.add('wrong');sub.textContent='Código incorreto. Confira no app.';
      wrong=setTimeout(()=>screen.classList.remove('wrong'),420);
    },
    reset():void {if(current)close();},
  };
}
