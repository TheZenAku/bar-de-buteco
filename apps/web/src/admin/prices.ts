import {PRICE_GROUPS,type AdminPrices,type AdminPriceRow,type PriceGroup} from '@bar/shared';
import {card,chips,e,empty,n,pct,reasonField,uiIcon,when,type SectionFactory} from './kit';

const SEARCH_LIMIT=40;

/**
 * The price tables of the Economia hub: every price and payment of the game, edited in place, one group at a time (the group
 * chips) or found by name (the search), never as one endless list. Changes wait in a draft (highlighted) until saved together
 * with a reason; the API records them and the world applies them in a few seconds. `only` limits it to some groups: the XP
 * values are their own tab.
 */
const priceTableSection=(only?:readonly PriceGroup[]):SectionFactory=>(root,ctx,params)=>{
  const shown=PRICE_GROUPS.filter(g=>only?only.includes(g.id):g.id!=='xp');
  let data:AdminPrices|undefined,group:PriceGroup=shown.find(g=>g.id===params.group)?.id??shown[0]!.id,query='',disposed=false;
  const drafts=new Map<string,number>();
  const row=(key:string)=>data?.rows.find(r=>r.key===key);
  const valid=(r:AdminPriceRow,value:number)=>Number.isSafeInteger(value)&&value>=r.min&&value<=r.max;
  /** Drafts that really change something (a value typed back to the current one is no change). */
  const pending=()=>[...drafts].filter(([key,value])=>{const r=row(key);return r&&value!==r.value;});
  const variation=(r:AdminPriceRow,value:number)=>r.defaultValue?pct((value-r.defaultValue)/r.defaultValue,0):value?'novo':'—';
  const changedIn=(id:PriceGroup)=>pending().filter(([key])=>row(key)?.group===id).length;

  function rowHtml(r:AdminPriceRow,showGroup=false):string {
    const value=drafts.get(r.key)??r.value,changed=value!==r.value,bad=!valid(r,value);
    return `<tr data-price-row="${e(r.key)}" class="${changed?'changed':''} ${bad?'invalid':''}">
      <td><b>${e(r.label)}</b><small>${showGroup?`${e(shown.find(g=>g.id===r.group)?.label??'')} · `:''}${e(r.hint)}</small></td>
      <td class="num">${n(r.defaultValue)}</td>
      <td class="num">${n(r.value)}${r.override?`<small title="${e(`Alterado ${when(r.updatedAt)} por ${r.updatedBy??'administração'}`)}">alterado</small>`:''}</td>
      <td><input type="number" inputmode="numeric" data-price-key="${e(r.key)}" aria-label="Novo valor de ${e(r.label)}" min="${r.min}" max="${r.max}" step="1" value="${value}"></td>
      <td class="num" data-variation>${variation(r,value)}</td>
      <td>${value!==r.defaultValue?`<button type="button" class="mini-button" data-price-reset="${e(r.key)}" title="Voltar ao padrão (${n(r.defaultValue)})">${uiIcon('reset')}Padrão</button>`:''}</td></tr>`;
  }
  const table=(rows:AdminPriceRow[],showGroup=false)=>`<div class="eco-scroll"><table class="admin-table admin-prices"><thead><tr><th>Item</th><th class="num">Padrão</th><th class="num">Atual</th><th>Novo valor</th><th class="num">vs. padrão</th><th></th></tr></thead><tbody>${rows.map(r=>rowHtml(r,showGroup)).join('')}</tbody></table></div>`;
  function footer():string {
    const list=pending(),invalid=list.some(([key,value])=>!valid(row(key)!,value));
    return `<div class="admin-save-bar ${list.length?'active':''}"><p>${list.length?`<b>${list.length}</b> valor(es) alterado(s) aguardando salvar${invalid?' · corrija os valores fora do limite':''}.`:'Edite a coluna Novo valor. Nada muda no jogo até salvar.'}</p>
      ${list.length?`<form data-price-save>${reasonField('Motivo da alteração','Ex.: conter a inflação de outubro')}<div class="admin-confirm-buttons"><button class="button primary" type="submit" ${invalid?'disabled':''}>Salvar alterações</button><button class="mini-button" type="button" data-price-discard>Descartar</button></div></form>`:''}</div>`;
  }
  const chipsHtml=()=>shown.length>1?chips('group',shown.map(g=>[g.id,`${g.label}${changedIn(g.id)?` <span class="eco-dot" title="Alterações aguardando salvar">${changedIn(g.id)}</span>`:''}`] as const),group):'';
  function bodyHtml():string {
    const text=query.trim().toLowerCase();
    if(text){
      const found=data!.rows.filter(r=>shown.some(g=>g.id===r.group)&&`${r.label} ${r.hint} ${r.key}`.toLowerCase().includes(text));
      return card(`Busca: ${found.length} resultado(s)`,found.length?`${table(found.slice(0,SEARCH_LIMIT),true)}${found.length>SEARCH_LIMIT?`<p class="fine-print">Mostrando os ${SEARCH_LIMIT} primeiros. Refine a busca para ver os outros.</p>`:''}`:empty('Nada com esse nome.'),{icon:'search'});
    }
    const meta=shown.find(g=>g.id===group)!,rows=data!.rows.filter(r=>r.group===group);
    return card(`${meta.label} · ${rows.length}`,`<p class="admin-note">${e(meta.description)}</p>${rows.length?table(rows):empty('Nenhum valor neste grupo.')}`,{icon:'tag'});
  }
  function render():void {
    if(disposed)return;
    if(!data){root.innerHTML='<p class="admin-loading">Carregando os valores…</p>';return;}
    const scoped=shown.length>1;
    root.innerHTML=`<div class="admin-toolbar eco-price-tools"><span data-price-chips>${chipsHtml()}</span>
        ${scoped?`<label class="eco-search">${uiIcon('search')}<input type="search" data-price-search placeholder="Buscar item, skin, trabalho…" aria-label="Buscar um valor" value="${e(query)}" autocomplete="off"></label>`:''}
        <form class="admin-percent" data-price-percent><label>Reajuste<input type="number" name="percent" aria-label="Reajuste em porcentagem" step="1" min="-90" max="500" placeholder="%" required></label>
          ${scoped?`<label>Em<select name="scope" aria-label="Onde aplicar o reajuste"><option value="group">Este grupo</option><option value="all">Todos os grupos</option></select></label>`:''}
          <button class="mini-button" type="submit">${uiIcon('percent')}Preparar</button></form></div>
      <div data-price-body>${bodyHtml()}</div>
      <div class="admin-save-slot">${footer()}</div>
      <details class="admin-details"><summary>Últimas alterações (${data.changes.length})</summary>${data.changes.length?`<ul class="admin-feed">${data.changes.map(c=>`<li><b>${e(c.actorName??'Administração')}</b><span>${e(when(c.createdAt))}</span><p>${e(c.reason)}</p></li>`).join('')}</ul>`:empty('Os valores ainda são os padrões do jogo.')}</details>`;
  }
  /** One row, the group chips and the save bar, without redrawing the inputs being typed in. */
  function refresh(key:string):void {
    const r=row(key),tr=root.querySelector<HTMLElement>(`[data-price-row="${CSS.escape(key)}"]`);if(!r)return;
    const value=drafts.get(key)??r.value;
    if(tr){tr.classList.toggle('changed',value!==r.value);tr.classList.toggle('invalid',!valid(r,value));tr.querySelector('[data-variation]')!.textContent=variation(r,value);}
    const tabs=root.querySelector('[data-price-chips]');if(tabs)tabs.innerHTML=chipsHtml();
    const slot=root.querySelector('.admin-save-slot');
    if(slot&&!slot.contains(document.activeElement)){const reason=slot.querySelector('textarea')?.value;slot.innerHTML=footer();const area=slot.querySelector('textarea');if(area&&reason)area.value=reason;}
  }
  async function load():Promise<void> {
    try{data=await ctx.api<AdminPrices>('/admin/prices');if(!disposed)render();}
    catch(error){if(!disposed){root.innerHTML=empty('Não foi possível carregar os valores.');ctx.message(error instanceof Error?error.message:'Erro ao carregar os valores.',true);}}
  }
  const input=(event:Event)=>{
    const target=event.target as HTMLElement;
    if(target.matches('[data-price-search]')){query=(target as HTMLInputElement).value;const body=root.querySelector('[data-price-body]');if(body&&data)body.innerHTML=bodyHtml();return;}
    const field=target.closest<HTMLInputElement>('[data-price-key]');if(!field)return;
    const key=field.dataset.priceKey!,r=row(key);if(!r)return;
    const value=field.value===''?NaN:Number(field.value);
    if(value===r.value)drafts.delete(key);else drafts.set(key,value);
    refresh(key);
  };
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    const chip=target.closest<HTMLElement>('[data-admin-chip="group"]');if(chip){group=chip.dataset.value as PriceGroup;query='';render();return;}
    const reset=target.closest<HTMLElement>('[data-price-reset]');
    if(reset){const r=row(reset.dataset.priceReset!)!;if(r.defaultValue===r.value)drafts.delete(r.key);else drafts.set(r.key,r.defaultValue);render();return;}
    if(target.closest('[data-price-discard]')){drafts.clear();render();}
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;
    if(form.matches('[data-price-percent]')){
      event.preventDefault();event.stopPropagation();
      const data_=new FormData(form),percent=Number(data_.get('percent')),everywhere=data_.get('scope')==='all';if(!Number.isFinite(percent))return;
      for(const r of data?.rows??[])if(shown.some(g=>g.id===r.group)&&(everywhere||r.group===group)){const value=Math.max(r.min,Math.min(r.max,Math.round(r.value*(1+percent/100))));if(value===r.value)drafts.delete(r.key);else drafts.set(r.key,value);}
      render();ctx.message(`Reajuste de ${n(percent)}% preparado${everywhere?' em todos os grupos':''}. Confira e salve com um motivo.`);return;
    }
    if(!form.matches('[data-price-save]'))return;
    event.preventDefault();event.stopPropagation();
    const reason=String(new FormData(form).get('reason')??'').trim(),changes=pending().map(([key,value])=>({key,value}));
    if(!changes.length)return;
    void ctx.run(async()=>{await ctx.api('/admin/prices',{changes,reason});drafts.clear();await load();},only?'Valores salvos. O XP de quem está no bar é recalculado em alguns segundos.':'Preços atualizados. O bar aplica em alguns segundos.');
  };
  root.addEventListener('input',input);root.addEventListener('click',click);root.addEventListener('submit',submit);
  render();void load();
  return {destroy(){disposed=true;root.removeEventListener('input',input);root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};
};
export const pricesSection=priceTableSection();
export const levelsSection=priceTableSection(['xp']);
