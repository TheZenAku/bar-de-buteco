const inFullscreen=()=>!!document.fullscreenElement||matchMedia('(display-mode: fullscreen)').matches;
const RETRY_MS=1000;

/**
 * In full screen, the page's or the browser's (F11), the mouse belongs to the game: no cursor, and it looks around without a button (BarScene).
 * The scroll button shows the cursor and takes it again; a window that needs the cursor gets it, and the capture returns when it closes.
 * The browser may refuse without a click (F11, or after Esc): it is asked again once a second, and by the next click on the view.
 */
export function createMouseCapture(canvas:HTMLCanvasElement,needsCursor:()=>boolean,notice:(text:string)=>void):{sync():void} {
  /** The player asked for the cursor (scroll button, or Esc where the browser takes it). Lasts until they ask otherwise or full screen ends. */
  let released=false,wasFull=false,told=false,retryAt=0;
  /** The game let go, and has not captured since: a capture dropped before its own event ran reports twice, and neither is the player's Esc. */
  let letGo=false;
  const captured=()=>document.pointerLockElement===canvas;
  const sync=()=>{
    const full=inFullscreen();
    if(full!==wasFull){wasFull=full;released=false;retryAt=0;}
    // A finger has no cursor to hide, and a locked pointer would stop the touch drag that turns the view.
    const wanted=full&&!released&&!needsCursor()&&!document.documentElement.classList.contains('touch-ui');
    if(!wanted&&captured()){if(!letGo){letGo=true;document.exitPointerLock();}}
    else if(wanted&&!captured()&&document.hasFocus()&&performance.now()>=retryAt){
      retryAt=performance.now()+RETRY_MS;
      // Older browsers return nothing and report through pointerlockerror.
      void Promise.resolve(canvas.requestPointerLock() as unknown).catch(()=>{});
    }
  };
  document.addEventListener('pointerlockchange',()=>{
    if(captured()){
      letGo=false;
      if(!told){told=true;notice('O mouse está preso ao jogo. Aperte o botão do scroll para mostrar o cursor.');}
      return;
    }
    // Lost to Esc, not to a window of the game or to another program taking the focus. The wait between tries is for refusals.
    if(!letGo&&inFullscreen()&&document.hasFocus())released=true;
    retryAt=0;
  });
  // mousedown, not pointerdown: that one does not fire for a second button pressed while another is held.
  addEventListener('mousedown',event=>{
    if(event.button!==1||!inFullscreen())return;
    event.preventDefault();
    if(needsCursor())return;
    released=captured();retryAt=0;sync();
  });
  canvas.addEventListener('mousedown',()=>{retryAt=0;sync();});
  return {sync};
}
