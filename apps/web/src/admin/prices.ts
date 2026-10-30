import {PRICE_GROUPS,type AdminPrices,type AdminPriceRow,type PriceGroup} from '@bar/shared';
import {card,chips,e,empty,n,pct,reasonField,uiIcon,when,type SectionFactory} from './kit';

type GroupFilter='all'|PriceGroup;

/**
 * Preços: every price and payment of the game in one table, edited in place. Changes wait in a draft (highlighted)
 * until saved together with a reason; the API records them and the world applies them in a few seconds.
 */
export const pricesSection:SectionFactory=(root,ctx)=>{
  let data:AdminPrices|undefined,group:GroupFilter='all',disposed=false;
  const drafts=new Map<string,number>();
  const row=(key:string)=>data?.rows.find(r=>r.key===key);
  const valid=(r:AdminPriceRow,value:number)=>Number.isSafeInteger(value)&&value>=r.min&&value<=r.max;
  /** Drafts that really change something (a value typed back to the current one is no change). */
  const pending=()=>[...drafts].filter(([key,value])=>{const r=row(key);return r&&value!==r.value;});
  const variation=(r:AdminPriceRow,value:number)=>r.defaultValue?pct((value-r.defaultValue)/r.defaultValue,0):value?'novo':'—';

  function rowHtml(r:AdminPriceRow):string {
    const value=drafts.get(r.key)??r.value,changed=value!==r.value,bad=!valid(r,value);
    return `<tr data-price-row="${e(r.key)}" class="${changed?'changed':''} ${bad?'invalid':''}">
      <td><b>${e(r.label)}</b><small>${e(r.hint)}</small></td>
      <td class="num">${n(r.defaultValue)}</td>
      <td class="num">${n(r.value)}${r.override?`<small title="${e(`Alterado ${when(r.updatedAt)} por ${r.updatedBy??'administração'}`)}">alterado</small>`:''}</td>
      <td><input type="number" inputmode="numeric" data-price-key="${e(r.key)}" aria-label="Novo valor de ${e(r.label)}" min="${r.min}" max="${r.max}" step="1" value="${value}"></td>
      <td class="num" data-variation>${variation(r,value)}</td>
      <td>${value!==r.defaultValue?`<button type="button" class="mini-button" data-price-reset="${e(r.key)}" title="Voltar ao padrão (${n(r.defaultValue)})">${uiIcon('reset')}Padrão</button>`:''}</td></tr>`;
  }
  function footer():string {
    const list=pending(),invalid=list.some(([key,value])=>!valid(row(key)!,value));
    return `<div class="admin-save-bar ${list.length?'active':''}"><p>${list.length?`<b>${list.length}</b> preço(s) alterado(s) aguardando salvar${invalid?' · corrija os valores fora do limite':''}.`:'Edite os valores na coluna Novo valor. Nada muda no jogo até salvar.'}</p>
      ${list.length?`<form data-price-save>${reasonField('Motivo da alteração de preços','Ex.: conter a inflação de outubro')}<div class="admin-confirm-buttons"><button class="button primary" type="submit" ${invalid?'disabled':''}>Salvar preços</button><button class="mini-button" type="button" data-price-discard>Descartar</button></div></form>`:''}</div>`;
  }
  function render():void {
    if(disposed)return;
    if(!data){root.innerHTML='<p class="admin-loading">Carregando preços…</p>';return;}
    const groups=PRICE_GROUPS.filter(g=>group==='all'||g.id===group);
    root.innerHTML=`<div class="admin-toolbar">${chips('group',[['all','Todos'],...PRICE_GROUPS.map(g=>[g.id,g.label] as const)],group)}
        <form class="admin-percent" data-price-percent><label>Reajuste<input type="number" name="percent" aria-label="Reajuste em porcentagem" step="1" min="-90" max="500" placeholder="%" required></label><button class="mini-button" type="submit">${uiIcon('percent')}Aplicar a ${group==='all'?'todos':e(PRICE_GROUPS.find(g=>g.id===group)!.label.toLowerCase())}</button></form></div>
      ${groups.map(g=>{const rows=data!.rows.filter(r=>r.group===g.id);return rows.length?card(g.label,`<p class="admin-note">${e(g.description)}</p><table class="admin-table admin-prices"><thead><tr><th>Item</th><th class="num">Padrão</th><th class="num">Atual</th><th>Novo valor</th><th class="num">vs. padrão</th><th></th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table>`,{icon:'tag'}):'';}).join('')}
      <div class="admin-save-slot">${footer()}</div>
      ${card('Últimas alterações',data.changes.length?`<ul class="admin-feed">${data.changes.map(c=>`<li><b>${e(c.actorName??'Administração')}</b><span>${e(when(c.createdAt))}</span><p>${e(c.reason)}</p></li>`).join('')}</ul>`:empty('Os preços ainda são os padrões do jogo.'),{icon:'clock'})}`;
  }
  /** One row and the save bar, without redrawing the inputs being typed in. */
  function refresh(key:string):void {
    const r=row(key),tr=root.querySelector<HTMLElement>(`[data-price-row="${CSS.escape(key)}"]`);if(!r||!tr)return;
    const value=drafts.get(key)??r.value;
    tr.classList.toggle('changed',value!==r.value);tr.classList.toggle('invalid',!valid(r,value));
    tr.querySelector('[data-variation]')!.textContent=variation(r,value);
    const slot=root.querySelector('.admin-save-slot');
    if(slot&&!slot.contains(document.activeElement)){const reason=slot.querySelector('textarea')?.value;slot.innerHTML=footer();const area=slot.querySelector('textarea');if(area&&reason)area.value=reason;}
  }
  async function load():Promise<void> {
    try{data=await ctx.api<AdminPrices>('/admin/prices');if(!disposed)render();}
    catch(error){if(!disposed){root.innerHTML=empty('Não foi possível carregar os preços.');ctx.message(error instanceof Error?error.message:'Erro ao carregar preços.',true);}}
  }
  const input=(event:Event)=>{
    const field=(event.target as HTMLElement).closest<HTMLInputElement>('[data-price-key]');if(!field)return;
    const key=field.dataset.priceKey!,r=row(key);if(!r)return;
    const value=field.value===''?NaN:Number(field.value);
    if(value===r.value)drafts.delete(key);else drafts.set(key,value);
    refresh(key);
  };
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    const chip=target.closest<HTMLElement>('[data-admin-chip="group"]');if(chip){group=chip.dataset.value as GroupFilter;render();return;}
    const reset=target.closest<HTMLElement>('[data-price-reset]');
    if(reset){const r=row(reset.dataset.priceReset!)!;if(r.defaultValue===r.value)drafts.delete(r.key);else drafts.set(r.key,r.defaultValue);render();return;}
    if(target.closest('[data-price-discard]')){drafts.clear();render();}
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;
    if(form.matches('[data-price-percent]')){
      event.preventDefault();event.stopPropagation();
      const percent=Number(new FormData(form).get('percent'));if(!Number.isFinite(percent))return;
      for(const r of data?.rows??[])if(group==='all'||r.group===group){const value=Math.max(r.min,Math.min(r.max,Math.round(r.value*(1+percent/100))));if(value===r.value)drafts.delete(r.key);else drafts.set(r.key,value);}
      render();ctx.message(`Reajuste de ${n(percent)}% preparado. Confira e salve com um motivo.`);return;
    }
    if(!form.matches('[data-price-save]'))return;
    event.preventDefault();event.stopPropagation();
    const reason=String(new FormData(form).get('reason')??'').trim(),changes=pending().map(([key,value])=>({key,value}));
    if(!changes.length)return;
    void ctx.run(async()=>{await ctx.api('/admin/prices',{changes,reason});drafts.clear();await load();},'Preços atualizados. O bar aplica em alguns segundos.');
  };
  root.addEventListener('input',input);root.addEventListener('click',click);root.addEventListener('submit',submit);
  render();void load();
  return {destroy(){disposed=true;root.removeEventListener('input',input);root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};
};
