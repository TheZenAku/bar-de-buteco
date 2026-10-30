import {ADMIN_LOG_CATEGORIES,type AdminLogCategory,type AdminLogEntry,type AdminLogPage} from '@bar/shared';
import {e,empty,fullDate,signed,uiIcon,when,type SectionFactory} from './kit';

const CATEGORY_LABELS:Record<AdminLogCategory,string>={admin:'Administração',moedas:'Moedas',itens:'Itens',acessos:'Acessos',denuncias:'Denúncias',mundo:'Mundo'};
const PERIODS:ReadonlyArray<readonly [string,string,number]>=[['1h','Última hora',3_600_000],['24h','Últimas 24 horas',86_400_000],['7d','Últimos 7 dias',7*86_400_000],['30d','Últimos 30 dias',30*86_400_000],['all','Tudo',0]];
const PAGE=60;

/**
 * Logs: one timeline of everything recorded (administration, coins, items, accesses, reports and the world's events),
 * filtered by type, player, period and text. Pages load backwards in time; the loaded rows can be saved as CSV.
 */
export const logsSection:SectionFactory=(root,ctx,params)=>{
  const initial=ADMIN_LOG_CATEGORIES.find(c=>c===params.category);
  let categories=new Set<AdminLogCategory>(initial?[initial]:ADMIN_LOG_CATEGORIES),period=params.player?'all':'24h',q='';
  let player=params.player?{id:params.player,name:''}:undefined;
  let entries:AdminLogEntry[]=[],next:string|null=null,loading=false,disposed=false,generation=0,live=false;

  function rowHtml(entry:AdminLogEntry):string {
    return `<tr><td title="${e(fullDate(entry.at))}">${e(when(entry.at))}</td>
      <td><span class="admin-badge log-${entry.category}">${CATEGORY_LABELS[entry.category]}</span></td>
      <td><b>${e(entry.title)}</b>${entry.actorName?`<small>por ${e(entry.actorName)}</small>`:''}</td>
      <td>${entry.playerId?`<button type="button" class="text-button" data-log-player="${e(entry.playerId)}" data-name="${e(entry.playerName??'')}" title="Mostrar só este jogador">${e(entry.playerName??entry.playerId.slice(0,8))}</button><button type="button" class="admin-icon-button" data-admin-go="players" data-go-player="${e(entry.playerId)}" aria-label="Abrir a ficha de ${e(entry.playerName??'jogador')}">${uiIcon('idCard')}</button>`:'—'}</td>
      <td class="admin-log-detail">${e(entry.detail)}</td>
      <td class="num ${entry.amount===null?'':entry.amount>0?'up':'down'}">${entry.amount===null?'':signed(entry.amount)}</td></tr>`;
  }
  function render():void {
    if(disposed)return;
    const all=categories.size===ADMIN_LOG_CATEGORIES.length;
    root.innerHTML=`<form class="admin-log-filters" data-log-form>
        <label>Buscar<input name="q" value="${e(q)}" maxlength="100" placeholder="Nome, e-mail ou texto do registro" aria-label="Buscar nos logs"></label>
        <label>Período<select name="period" aria-label="Período dos logs">${PERIODS.map(([id,label])=>`<option value="${id}" ${id===period?'selected':''}>${label}</option>`).join('')}</select></label>
        <button class="button secondary" type="submit">${uiIcon('filter')}Filtrar</button></form>
      <div class="admin-toolbar">
        <div class="admin-chips" role="group" aria-label="Tipos de registro"><button type="button" data-log-all aria-pressed="${all}">Todos</button>${ADMIN_LOG_CATEGORIES.map(c=>`<button type="button" data-log-category="${c}" aria-pressed="${!all&&categories.has(c)}"><i class="log-dot log-${c}"></i>${CATEGORY_LABELS[c]}</button>`).join('')}</div>
        ${player?`<span class="admin-pill">Jogador: <b>${e(player.name||player.id.slice(0,8))}</b><button type="button" data-log-clear-player aria-label="Mostrar todos os jogadores">${uiIcon('close')}</button></span>`:''}
        <span class="admin-toolbar-end"><label class="admin-live"><input type="checkbox" data-log-live ${live?'checked':''}> Ao vivo</label>
          <button type="button" class="mini-button" data-log-refresh>${uiIcon('refresh')}Atualizar</button><button type="button" class="mini-button" data-log-csv ${entries.length?'':'disabled'}>${uiIcon('download')}CSV</button></span>
      </div>
      <div class="admin-log-wrap">${entries.length?`<table class="admin-table admin-log"><thead><tr><th>Quando</th><th>Tipo</th><th>O que</th><th>Jogador</th><th>Detalhe</th><th class="num">Valor</th></tr></thead><tbody>${entries.map(rowHtml).join('')}</tbody></table>`
        :loading?'<p class="admin-loading">Buscando registros…</p>':empty('Nenhum registro com estes filtros. Tente outro período ou tipo.')}</div>
      ${next?`<button type="button" class="button secondary full" data-log-more ${loading?'disabled':''}>Carregar mais antigos</button>`:entries.length?`<p class="fine-print">${entries.length} registro(s) · fim dos resultados.</p>`:''}`;
  }
  async function load(more=false):Promise<void> {
    const version=++generation;loading=true;if(!more){entries=[];next=null;}render();
    const since=PERIODS.find(p=>p[0]===period)![2];
    const query=new URLSearchParams({categories:[...categories].join(','),limit:String(PAGE)});
    if(q)query.set('q',q);if(player)query.set('player',player.id);if(since)query.set('since',new Date(Date.now()-since).toISOString());if(more&&next)query.set('before',next);
    try{
      const page=await ctx.api<AdminLogPage>(`/admin/logs?${query}`);if(disposed||version!==generation)return;
      entries=more?[...entries,...page.entries]:page.entries;next=page.next;
      if(player&&!player.name)player.name=page.entries.find(x=>x.playerId===player!.id)?.playerName??'';
    }catch(error){if(!disposed&&version===generation)ctx.message(error instanceof Error?error.message:'Não foi possível buscar os logs.',true);}
    finally{if(!disposed&&version===generation){loading=false;render();}}
  }
  function csv():void {
    const cell=(value:unknown)=>`"${String(value??'').replace(/"/g,'""')}"`;
    const lines=[['Quando','Tipo','O que','Jogador','Detalhe','Valor','Por'].map(cell).join(';'),
      ...entries.map(x=>[fullDate(x.at),CATEGORY_LABELS[x.category],x.title,x.playerName??'',x.detail,x.amount??'',x.actorName??''].map(cell).join(';'))];
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`],{type:'text/csv;charset=utf-8'}));
    link.download=`logs-bar-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    const go=target.closest<HTMLElement>('[data-admin-go]');if(go){ctx.go('players',{player:go.dataset.goPlayer!});return;}
    const category=target.closest<HTMLElement>('[data-log-category]');
    if(category){
      const c=category.dataset.logCategory as AdminLogCategory,all=categories.size===ADMIN_LOG_CATEGORIES.length;
      // From "all", a type picks only itself; otherwise it toggles (never leaving none).
      if(all)categories=new Set([c]);else if(categories.has(c)){categories.delete(c);if(!categories.size)categories=new Set(ADMIN_LOG_CATEGORIES);}else categories.add(c);
      void load();return;
    }
    if(target.closest('[data-log-all]')){categories=new Set(ADMIN_LOG_CATEGORIES);void load();return;}
    const who=target.closest<HTMLElement>('[data-log-player]');if(who){player={id:who.dataset.logPlayer!,name:who.dataset.name??''};void load();return;}
    if(target.closest('[data-log-clear-player]')){player=undefined;void load();return;}
    if(target.closest('[data-log-more]')){void load(true);return;}
    if(target.closest('[data-log-refresh]')){void load();return;}
    if(target.closest('[data-log-csv]'))csv();
  };
  const change=(event:Event)=>{
    const target=event.target as HTMLInputElement;
    if(target.matches('[data-log-live]'))live=target.checked;
    else if(target.name==='period'){period=target.value;void load();}
  };
  const submit=(event:SubmitEvent)=>{
    const form=(event.target as HTMLElement).closest<HTMLFormElement>('[data-log-form]');if(!form)return;
    event.preventDefault();event.stopPropagation();
    const values=new FormData(form);q=String(values.get('q')??'').trim();period=String(values.get('period')??period);void load();
  };
  // Ao vivo: the first page again every 10 s, unless older pages were loaded or a field is being used.
  const typing=()=>{const active=document.activeElement;return root.contains(active)&&(active instanceof HTMLSelectElement||active instanceof HTMLInputElement&&active.type!=='checkbox');};
  const timer=setInterval(()=>{if(live&&!loading&&entries.length<=PAGE&&!typing())void load();},10_000);
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('submit',submit);void load();
  return {destroy(){disposed=true;clearInterval(timer);root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('submit',submit);}};
};
