import {uiIcon} from './ui-icons';

type KeyboardLock={keyboard?:{lock?(keys:string[]):Promise<void>}};
/**
 * The Painéis menu's Tela cheia: the page's own full screen (Fullscreen API), on the whole document so every window and
 * notice stays in it. The browser's (F11) shows the same, but a page can only see it, not leave it: the button says so.
 * In the page's, Esc keeps closing the game's windows where the browser lets it (Keyboard Lock): holding Esc leaves.
 */
export function createFullscreen(button:HTMLButtonElement,notice:(text:string)=>void):void{
  const browserFull=()=>!document.fullscreenElement&&(matchMedia('(display-mode: fullscreen)').matches||(innerWidth>=screen.width&&innerHeight>=screen.height));
  const render=()=>{
    const on=!!document.fullscreenElement||browserFull();
    button.setAttribute('aria-pressed',String(on));
    button.innerHTML=`${uiIcon(on?'minimize':'maximize')}<span>${on?'Sair da tela cheia':'Tela cheia'}</span>`;
    button.title=on?'Sair da tela cheia':'Tela cheia (ou F11)';
  };
  button.addEventListener('click',()=>void (async()=>{
    if(document.fullscreenElement){await document.exitFullscreen().catch(()=>{});return;}
    if(browserFull()){notice('Esta é a tela cheia do navegador: aperte F11 para sair.');return;}
    try{await document.documentElement.requestFullscreen({navigationUI:'hide'});}
    catch{notice('O navegador não abriu a tela cheia daqui. Tente a tecla F11.');return;}
    try{await (navigator as Navigator&KeyboardLock).keyboard?.lock?.(['Escape']);}catch{/* Esc then leaves full screen at once. */}
  })());
  document.addEventListener('fullscreenchange',render);
  addEventListener('resize',render);
  render();
}
