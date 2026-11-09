import {SPARRING,type SparringDialog,type SparringResult,type SparringState} from '@bar/shared';
import {uiIcon} from '../ui-icons';

const e=(text:string):string=>text.replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]!));

/**
 * Zeca's challenge on screen (docs/sistemas/zeca.md): his speech with the two answers, and while the fight lasts the two life bars, the count and,
 * at the end, what it paid. Plain DOM over the canvas; the room decides everything, this only shows it.
 */
export function createSparringUi(root:HTMLElement,actions:{accept:()=>void;quit:()=>void;now:()=>number}) {
  const dialog=document.createElement('section');
  dialog.className='food-dialog sparring-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label',`Conversa com ${SPARRING.name}`);
  const hud=document.createElement('div');
  hud.className='sparring-hud';hud.hidden=true;hud.setAttribute('aria-live','polite');
  root.append(dialog,hud);
  let current:SparringDialog|undefined,typing:ReturnType<typeof setInterval>|undefined;
  let state:SparringState|undefined,bannerUntil=0,bannerTimer:ReturnType<typeof setTimeout>|undefined,tick:ReturnType<typeof setInterval>|undefined;

  const key=(event:KeyboardEvent)=>{
    if(!current)return;
    const name=event.key.toLowerCase();
    if((name==='e'||event.key==='Enter')&&current.can){event.preventDefault();event.stopPropagation();actions.accept();close();}
    else if(event.key==='Escape'||name==='e'||event.key==='Enter'){event.preventDefault();event.stopPropagation();close();}
  };
  function close():void {
    current=undefined;clearInterval(typing);dialog.classList.remove('open');
    removeEventListener('keydown',key,true);
    setTimeout(()=>{if(!current)dialog.hidden=true;},220);
  }
  dialog.addEventListener('click',event=>{
    const action=(event.target as HTMLElement).closest<HTMLElement>('[data-sparring]')?.dataset.sparring;
    if(!current||!action)return;
    if(action==='accept')actions.accept();
    close();
  });
  hud.addEventListener('click',event=>{if((event.target as HTMLElement).closest('[data-sparring-quit]'))actions.quit();});

  const bar=(label:string,hp:number,max:number,kind:string)=>`<div class="sp-side ${kind}"><span class="sp-name">${e(label)}</span><span class="sp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${hp}"><i style="transform:scaleX(${Math.max(0,Math.min(1,hp/max)).toFixed(3)})"></i></span></div>`;
  function render():void {
    const fighting=!!state&&state.phase!=='off';
    const banner=bannerUntil>performance.now();
    hud.hidden=!fighting&&!banner;
    if(hud.hidden)return;
    let center='';
    if(state?.phase==='countdown'){
      const left=Math.max(0,Math.ceil((state.until-actions.now())/1000));
      center=`<b class="sp-count">${left>0?left:'VALENDO!'}</b>`;
    }else if(state?.phase==='fight'){
      const left=Math.max(0,Math.ceil((state.until-actions.now())/1000));
      center=`<b class="sp-clock">${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}</b>`;
    }
    hud.innerHTML=state&&state.phase!=='off'
      ?`<div class="sp-bars">${bar('Você',state.you.hp,state.you.max,'you')}<div class="sp-mid">${center}</div>${bar(state.foe.name,state.foe.hp,state.foe.max,'foe')}</div>`
        +(state.phase==='countdown'||state.phase==='fight'?`<button type="button" class="button sp-quit" data-sparring-quit>Desistir</button>`:'')
      :'';
    if(banner&&lastResult)hud.insertAdjacentHTML('beforeend',`<div class="sp-banner ${lastResult.won?'won':'lost'}"><b>${lastResult.won?(lastResult.prize?`+${lastResult.prize} moedas`:'Vitória'):'Derrota'}</b><span>${e(lastResult.message)}</span></div>`);
  }
  let lastResult:SparringResult|undefined;

  return {
    get isOpen(){return !!current;},
    /** Whether a fight is on (the count or the round): the browser keeps the guard up and E does not talk. */
    get fighting(){return !!state&&(state.phase==='countdown'||state.phase==='fight');},
    show(next:SparringDialog):void {
      clearInterval(typing);
      const firstOpen=!current;current=next;
      dialog.hidden=false;
      dialog.innerHTML=`<div class="npc-picture food-dialog-face sparring-face">${uiIcon('shield')}</div><div class="food-dialog-body"><header><b>${e(SPARRING.name)}</b><small>Lutador · terraço</small></header><p class="food-dialog-line"></p>
        <div class="food-dialog-actions">${next.can?`<button type="button" class="button primary" data-sparring="accept">${uiIcon('shield')}Bora!<kbd>E</kbd></button><button type="button" class="button" data-sparring="leave">Agora não<kbd>Esc</kbd></button>`
        :`<button type="button" class="button" data-sparring="leave">Certo<kbd>Esc</kbd></button>`}</div></div>`;
      const line=dialog.querySelector<HTMLElement>('.food-dialog-line')!,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduced)line.textContent=next.line;
      else {let shown=0;typing=setInterval(()=>{shown=Math.min(next.line.length,shown+2);line.textContent=next.line.slice(0,shown);if(shown>=next.line.length)clearInterval(typing);},24);}
      requestAnimationFrame(()=>dialog.classList.add('open'));
      if(firstOpen)addEventListener('keydown',key,true);
    },
    /** The fight begins: the talk closes. */
    started():void {if(current)close();lastResult=undefined;bannerUntil=0;},
    update(next:SparringState):void {
      state=next;
      clearInterval(tick);
      if(next.phase==='countdown'||next.phase==='fight')tick=setInterval(render,250);
      render();
    },
    result(result:SparringResult):void {
      lastResult=result;bannerUntil=performance.now()+(result.won?6500:4500);
      clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>{state=undefined;render();},bannerUntil-performance.now()+50);
      render();
    },
    reset():void {if(current)close();clearInterval(tick);clearTimeout(bannerTimer);state=undefined;bannerUntil=0;lastResult=undefined;hud.hidden=true;},
  };
}
