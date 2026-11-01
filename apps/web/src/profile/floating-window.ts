import {uiIcon} from '../ui-icons';

export interface FloatingWindow {
  element:HTMLElement;head:HTMLElement;body:HTMLElement;
  setLabel(text:string):void;
  front():void;
  /** The content arrived: a window nobody placed yet goes to the middle of the screen at its real height. */
  settle():void;
  close():void;
}
const MARGIN=8;
// Over the phone (250), under the game's modal windows (300).
const BASE_LAYER=260;
const stack:HTMLElement[]=[];
// Where each kind of window was left: it opens there again.
const placed=new Map<string,{x:number;y:number}>();

/** A window over the game that does not stop it: dragged by its header, by mouse, touch or arrows, and always kept on the screen. */
export function floatingWindow(options:{className:string;label:string;onClose:()=>void;near?:HTMLElement|undefined}):FloatingWindow {
  const element=document.createElement('section');
  element.className=`fw ${options.className}`;element.setAttribute('role','dialog');element.setAttribute('aria-label',options.label);
  element.innerHTML=`<header class="fw-head" tabindex="0" aria-label="Mover janela"><div class="fw-title"></div><button type="button" class="fw-close" aria-label="Fechar">${uiIcon('close')}</button></header><div class="fw-body"></div>`;
  const header=element.querySelector<HTMLElement>('.fw-head')!,head=element.querySelector<HTMLElement>('.fw-title')!,body=element.querySelector<HTMLElement>('.fw-body')!;
  let x=0,y=0;
  const moveTo=(nextX:number,nextY:number)=>{
    const box=element.getBoundingClientRect();
    x=Math.round(Math.max(MARGIN,Math.min(nextX,innerWidth-box.width-MARGIN)));y=Math.round(Math.max(MARGIN,Math.min(nextY,innerHeight-box.height-MARGIN)));
    element.style.left=`${x}px`;element.style.top=`${y}px`;
  };
  /** Moved by the player: it stays there, and opens there next time. */
  const place=(nextX:number,nextY:number)=>{moveTo(nextX,nextY);placed.set(options.className,{x,y});};
  const refit=()=>moveTo(x,y);
  const centre=()=>{const box=element.getBoundingClientRect();moveTo((innerWidth-box.width)/2,(innerHeight-box.height)/2);};
  const front=()=>{
    stack.splice(stack.indexOf(element)>>>0,1);stack.push(element);
    stack.forEach((each,index)=>{each.style.zIndex=String(BASE_LAYER+index);});
  };
  // With the game's interface, so its modal windows stay on top.
  (document.querySelector('#app')??document.body).append(element);front();
  // Beside the window it belongs to, on the side with room; else where it was last left, or the middle.
  const box=element.getBoundingClientRect(),near=options.near?.getBoundingClientRect(),last=placed.get(options.className);
  if(near)moveTo(near.right+box.width+MARGIN<innerWidth?near.right+MARGIN:near.left-box.width-MARGIN,near.top);
  else if(last)moveTo(last.x,last.y);
  else centre();
  // The content arrives after opening and changes the height.
  const observer=new ResizeObserver(refit);observer.observe(element);
  addEventListener('resize',refit);

  let grab:{dx:number;dy:number}|undefined;
  header.addEventListener('pointerdown',event=>{
    if(event.button!==0||(event.target as HTMLElement).closest('button'))return;
    event.preventDefault();header.focus({preventScroll:true});header.setPointerCapture(event.pointerId);
    grab={dx:event.clientX-x,dy:event.clientY-y};element.classList.add('dragging');
  });
  header.addEventListener('pointermove',event=>{if(grab)place(event.clientX-grab.dx,event.clientY-grab.dy);});
  const drop=()=>{grab=undefined;element.classList.remove('dragging');};
  header.addEventListener('pointerup',drop);header.addEventListener('pointercancel',drop);
  header.addEventListener('keydown',event=>{
    const step=event.shiftKey?40:12,arrows:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]},move=arrows[event.key];
    if(!move)return;
    event.preventDefault();event.stopPropagation();place(x+move[0],y+move[1]);
  });
  element.addEventListener('pointerdown',front,true);

  const close=()=>{
    if(!element.isConnected)return;
    observer.disconnect();removeEventListener('resize',refit);element.remove();stack.splice(stack.indexOf(element),1);options.onClose();
  };
  element.querySelector('.fw-close')!.addEventListener('click',close);
  return {element,head,body,front,close,setLabel:text=>element.setAttribute('aria-label',text),settle:()=>{if(!near&&!placed.has(options.className))centre();}};
}
