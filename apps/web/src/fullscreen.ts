type KeyboardLock={keyboard?:{lock?(keys:string[]):Promise<void>}};
/**
 * Tela cheia (the menu's Ajustes › Interface): the page's own full screen (Fullscreen API), on the whole document so every
 * window and notice stays in it. The browser's (F11) shows the same, but a page can only see it, not leave it: the menu says so.
 * In the page's, Esc keeps opening the menu and closing windows where the browser lets it (Keyboard Lock): holding Esc leaves.
 */
export function createFullscreen(notice:(text:string)=>void,changed:()=>void){
  const browserFull=()=>!document.fullscreenElement&&(matchMedia('(display-mode: fullscreen)').matches||(innerWidth>=screen.width&&innerHeight>=screen.height));
  async function toggle():Promise<void>{
    if(document.fullscreenElement){await document.exitFullscreen().catch(()=>{});return;}
    if(browserFull()){notice('Esta é a tela cheia do navegador: aperte F11 para sair.');changed();return;}
    try{await document.documentElement.requestFullscreen({navigationUI:'hide'});}
    catch{notice('O navegador não abriu a tela cheia daqui. Tente a tecla F11.');changed();return;}
    // A phone plays on its side.
    if(document.documentElement.classList.contains('touch-ui'))try{await (screen.orientation as ScreenOrientation&{lock?(orientation:string):Promise<void>}).lock?.('landscape');}catch{/* Not every browser lets a page turn the screen. */}
    try{await (navigator as Navigator&KeyboardLock).keyboard?.lock?.(['Escape']);}catch{/* Esc then leaves full screen at once. */}
  }
  document.addEventListener('fullscreenchange',changed);
  return {
    state:()=>({on:!!document.fullscreenElement||browserFull(),browser:browserFull()}),
    toggle,
  };
}
