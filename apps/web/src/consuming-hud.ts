import {itemById} from '@bar/shared';
import {escape as e} from './api';
import {itemImage} from './ui-icons';
import type {Consumption} from './consumption';

const VERBS:Record<string,string>={bebida:'Bebendo',comida:'Comendo',saude:'Usando'};
/** Tiles in the row; anything beyond shows as one "+N" tile. */
const MAX_SLOTS=6;
/** The last seconds of an item: its ring turns gold. */
const ENDING_MS=10_000;

/** "8 s" under a minute, "2:30" above it. */
const remaining=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000));return s<60?`${s} s`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};

interface Slot {root:HTMLElement;time:HTMLElement;label:string;left:number;text:string;ending:boolean}

/**
 * What the player is having, as one row of item tiles above the key prompts (the food slots of survival games): each
 * tile's ring drains as the item goes and the time left sits under it; the verb and name are its tooltip and
 * accessible name. A drink in hand plus a whole table order take one short row instead of a bar each. The tiles are
 * built when the set changes; each tick only moves a ring or rewrites a time when its value changed.
 */
export function createConsumingHud(root:HTMLElement){
  let shown='';
  const slots=new Map<string,Slot>();
  function render(list:Consumption[],now:number):void {
    const visible=list.length>MAX_SLOTS?list.slice(0,MAX_SLOTS-1):list,extra=list.length-visible.length;
    const key=`${visible.map(c=>c.id).join('|')}+${extra}`;
    if(key!==shown){
      shown=key;slots.clear();root.classList.toggle('hidden',!list.length);
      root.innerHTML=visible.map(c=>{const item=itemById(c.item),label=`${VERBS[item?.category??'']??'Consumindo'} ${item?.name??c.item}`;
        return `<div class="consume-slot" data-consume="${e(c.id)}" role="progressbar" aria-label="${e(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span class="consume-ring" aria-hidden="true"><span class="consume-icon">${item?itemImage(item):''}</span></span><small class="consume-time"></small></div>`;}).join('')
        +(extra?`<div class="consume-slot consume-more" title="Mais ${extra} ${extra===1?'item':'itens'}"><span class="consume-ring"><b>+${extra}</b></span><small class="consume-time">&nbsp;</small></div>`:'');
      root.querySelectorAll<HTMLElement>('[data-consume]').forEach(el=>slots.set(el.dataset.consume!,{root:el,time:el.querySelector('.consume-time')!,label:el.getAttribute('aria-label')!,left:-1,text:'',ending:false}));
    }
    for(const c of visible){
      const slot=slots.get(c.id);if(!slot)continue;
      const ms=c.startedAt+c.durationMs-now;
      // Half a percent is under a pixel of the ring: finer steps would restyle the page for nothing.
      const left=Math.round(Math.min(1,Math.max(0,ms/c.durationMs))*200)/2,text=remaining(ms),ending=ms<=ENDING_MS;
      if(left!==slot.left){slot.left=left;slot.root.style.setProperty('--left',String(left/100));slot.root.setAttribute('aria-valuenow',String(Math.round(left)));}
      if(text!==slot.text){slot.text=text;slot.time.textContent=text;slot.root.title=`${slot.label} · falta ${text}`;}
      if(ending!==slot.ending){slot.ending=ending;slot.root.classList.toggle('ending',ending);}
    }
  }
  return {render,clear(){render([],0);}};
}
