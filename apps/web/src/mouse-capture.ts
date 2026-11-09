const inFullscreen=()=>!!document.fullscreenElement||matchMedia('(display-mode: fullscreen)').matches;
const RETRY_MS=1000;
/** A lock must have held this long (ms) for its loss to count as the player's Esc. */
const STEADY_MS=400;

/**
 * In full screen, the page's or the browser's (F11), the mouse belongs to the game: no cursor, and it looks around without a button (BarScene).
 * The scroll button shows the cursor and takes it again; a window that needs the cursor gets it, and the capture returns when it closes.
 * The browser may refuse without a click (F11, or after Esc): it is asked again once a second, and by the next click on the view.
 * `wants`: another reason to hold the mouse out of full screen too (the fist fight's guard, where the buttons punch and the mouse turns the view);
 * `escaped`: the player let go of it with Esc while only that reason held it (the guard comes down).
 * `pause`: the same Esc opens the pause menu (pause-menu.ts); true when it did, so the capture comes back when the menu closes
 * instead of waiting for the scroll button (the browser may never deliver that Esc as a key).
 */
export function createMouseCapture(canvas:HTMLCanvasElement,needsCursor:()=>boolean,wants:()=>boolean=()=>false,escaped?:()=>void,pause?:()=>boolean):{sync():void} {
  /** The player asked for the cursor (scroll button, or Esc where the browser takes it). Lasts until they ask otherwise or full screen ends. */
  let released=false,wasFull=false,retryAt=0;
  /** The game let go, and has not captured since: a capture dropped before its own event ran reports twice, and neither is the player's Esc. */
  let letGo=false;
  /** When the lock was last confirmed: a lock lost within STEADY_MS of it was never held, the browser dropped a request (it is not the player's Esc). */
  let heldAt=0;
  const captured=()=>document.pointerLockElement===canvas;
  const sync=()=>{
    const full=inFullscreen();
    if(full!==wasFull){wasFull=full;released=false;retryAt=0;}
    // A finger has no cursor to hide, and a locked pointer would stop the touch drag that turns the view.
    const wanted=(full&&!released||!full&&wants())&&!needsCursor()&&!document.documentElement.classList.contains('touch-ui');
    if(!wanted&&captured()){if(!letGo){letGo=true;document.exitPointerLock();}}
    else if(wanted&&!captured()&&document.hasFocus()&&performance.now()>=retryAt){
      retryAt=performance.now()+RETRY_MS;
      // Older browsers return nothing and report through pointerlockerror.
      void Promise.resolve(canvas.requestPointerLock() as unknown).catch(()=>{});
    }
  };
  document.addEventListener('pointerlockchange',()=>{
    if(captured()){
      letGo=false;heldAt=performance.now();
      return;
    }
    // Lost to Esc, not to a window of the game or to another program taking the focus. The wait between tries is for refusals.
    if(!letGo&&inFullscreen()&&document.hasFocus()){if(!pause?.())released=true;}
    else if(!letGo&&!inFullscreen()&&document.hasFocus()&&wants()&&performance.now()-heldAt>STEADY_MS){escaped?.();pause?.();}
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
