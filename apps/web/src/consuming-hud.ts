import {itemById} from '@bar/shared';
import {escape as e} from './api';
import {itemImage} from './ui-icons';
import type {Consumption} from './consumption';

const VERBS:Record<string,string>={bebida:'Bebendo',comida:'Comendo',saude:'Usando'};

/** "8 s" under a minute, "2:30" above it. */
const remaining=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000));return s<60?`${s} s`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};

/**
 * One progress bar per thing being consumed, above the key prompts. The rows are built when the set changes; each tick
 * only moves a bar or rewrites a time when its value changed (the page is not restyled ten times a second for nothing).
 */
export function createConsumingHud(root:HTMLElement){
  let shown='';
  const rows=new Map<string,{fill:HTMLElement;track:HTMLElement;time:HTMLElement;percent:number;left:string}>();
  function render(list:Consumption[],now:number):void {
    const key=list.map(c=>c.id).join('|');
    if(key!==shown){
      shown=key;rows.clear();root.classList.toggle('hidden',!list.length);
      root.innerHTML=list.map(c=>{const item=itemById(c.item),name=item?.name??c.item;
        return `<div class="consume-row" data-consume="${e(c.id)}"><span class="consume-icon" aria-hidden="true">${item?itemImage(item):''}</span><span class="consume-text"><small>${VERBS[item?.category??'']??'Consumindo'}</small><b>${e(name)}</b></span><span class="consume-time"></span><div class="consume-track" role="progressbar" aria-label="${e(name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>`;}).join('');
      root.querySelectorAll<HTMLElement>('.consume-row').forEach(row=>rows.set(row.dataset.consume!,{fill:row.querySelector('i')!,track:row.querySelector('.consume-track')!,time:row.querySelector('.consume-time')!,percent:-1,left:''}));
    }
    for(const c of list){
      const row=rows.get(c.id);if(!row)continue;
      const percent=Math.round(Math.min(1,Math.max(0,(now-c.startedAt)/c.durationMs))*1000)/10,left=remaining(c.startedAt+c.durationMs-now);
      if(percent!==row.percent){row.percent=percent;row.fill.style.width=`${percent}%`;row.track.setAttribute('aria-valuenow',String(Math.round(percent)));}
      if(left!==row.left){row.left=left;row.time.textContent=left;}
    }
  }
  return {render,clear(){render([],0);}};
}
