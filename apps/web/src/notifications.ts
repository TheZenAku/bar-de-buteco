import {uiIcon} from './ui-icons';
export type NoticeVariant='mensagem'|'acao'|'aviso'|'conquista'|'admin';
export interface Notice {title:string;text?:string;variant?:NoticeVariant;initials?:string;duration?:number;id?:string;tone?:string;
  /** Trusted markup in the icon's place (a badge's medal). */
  art?:string;
  /** A button under the text; it also closes the notice. */
  action?:{label:string;run:()=>void}}
export interface NotificationScheduler {
  now:()=>number;
  setTimeout:(callback:()=>void,delay:number)=>ReturnType<typeof setTimeout>;
  clearTimeout:(timer:ReturnType<typeof setTimeout>)=>void;
  queueMicrotask:(callback:()=>void)=>void;
}
const meta={mensagem:{label:'Recado no balcão',tone:'var(--vw-cyan)',icon:'chat'},acao:{label:'No bar',tone:'var(--vw-pink)',icon:'sparkles'},aviso:{label:'Fique de olho',tone:'var(--destructive)',icon:'alert'},conquista:{label:'Conquista',tone:'var(--vw-lilac)',icon:'party'},admin:{label:'Administração',tone:'var(--vw-peach)',icon:'shield'}};
const browserScheduler:NotificationScheduler={
  now:()=>performance.now(),
  setTimeout:(callback,delay)=>setTimeout(callback,delay),
  clearTimeout:timer=>clearTimeout(timer),
  queueMicrotask:callback=>queueMicrotask(callback),
};
/** Live game notices (the comanda: tone stub, eyebrow, title, close and timer), bounded stack, dismiss and hover/focus pause. */
export function createNotifications(host:HTMLElement,scheduler:NotificationScheduler=browserScheduler){
  const active=new Map<string,()=>void>();let sequence=0;
  function show(notice:Notice):void{
    const id=notice.id??`notice-${sequence++}`;if(active.has(id))return;
    while(active.size>=4)active.values().next().value?.();
    const variant=notice.variant??'acao',appearance=meta[variant],duration=notice.duration??4200;
    const node=document.createElement('article');node.className='toast comanda';node.dataset.variant=variant;
    node.style.setProperty('--comanda',notice.tone??appearance.tone);node.style.setProperty('--comanda-run',`${duration}ms`);
    node.setAttribute('role',variant==='aviso'||variant==='admin'?'alert':'status');
    node.innerHTML=`<span class="comanda__stub" aria-hidden="true"></span><span class="comanda__badge">${uiIcon(appearance.icon)}</span><div class="comanda__body"><p class="comanda__eyebrow"></p><p class="comanda__title"></p><p class="comanda__text"></p>${notice.action?'<button class="comanda__action" type="button"></button>':''}</div><button class="comanda__close" type="button" aria-label="Fechar aviso">${uiIcon('close')}</button><span class="comanda__timer" aria-hidden="true"></span>`;
    node.querySelector('.comanda__eyebrow')!.textContent=appearance.label;
    node.querySelector('.comanda__title')!.textContent=notice.title;
    node.querySelector('.comanda__text')!.textContent=notice.text??'';
    if(notice.art){const badge=node.querySelector('.comanda__badge')!;badge.innerHTML=notice.art;badge.classList.add('comanda__art');}
    if(notice.initials){const badge=node.querySelector('.comanda__badge')!;badge.textContent=notice.initials.slice(0,2);badge.classList.add('comanda__initials');}
    let remaining=duration,started=scheduler.now(),timer:ReturnType<typeof setTimeout>,paused=false,removed=false;
    const dismiss=()=>{if(removed)return;removed=true;scheduler.clearTimeout(timer);active.delete(id);node.remove();};
    const pause=()=>{if(paused)return;paused=true;remaining-=scheduler.now()-started;scheduler.clearTimeout(timer);node.classList.add('paused');};
    const resume=()=>{if(removed||!paused||node.matches(':hover')||node.contains(document.activeElement))return;paused=false;started=scheduler.now();node.classList.remove('paused');timer=scheduler.setTimeout(dismiss,Math.max(0,remaining));};
    node.addEventListener('pointerenter',pause);node.addEventListener('pointerleave',resume);
    node.addEventListener('focusin',pause);node.addEventListener('focusout',()=>scheduler.queueMicrotask(resume));
    node.querySelector('.comanda__close')!.addEventListener('click',dismiss);
    if(notice.action){const button=node.querySelector<HTMLElement>('.comanda__action')!;button.textContent=notice.action.label;button.addEventListener('click',()=>{dismiss();notice.action!.run();});}
    active.set(id,dismiss);host.append(node);timer=scheduler.setTimeout(dismiss,duration);
  }
  return {show,clear(){for(const dismiss of [...active.values()])dismiss();}};
}
