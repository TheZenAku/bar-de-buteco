import {adminActionLabel,type AdminSummary} from '@bar/shared';
import {ago,badge,card,compact,e,empty,n,pct,stat,uiIcon,when,type SectionFactory,type SectionId,type WorldSnapshot} from './kit';

const EVENTS=[['BLACKOUT','moon','Apagão'],['DRUNK_NPC','dizzy','O inconveniente'],['PARTY','party','Festa']] as const;
const EVENT_NAMES:Record<string,string>={BLACKOUT:'Apagão',DRUNK_NPC:'O inconveniente',PARTY:'Festa'};
/** A link to another section (data-admin-go), with the filters it opens with. */
export const goButton=(section:SectionId,label:string,params:Record<string,string>={})=>
  `<button type="button" class="text-button admin-go" data-admin-go="${section}" ${Object.entries(params).map(([k,v])=>`data-go-${k}="${e(v)}"`).join(' ')}>${label} ${uiIcon('chevronRight')}</button>`;
/** Follows a data-admin-go link (players, logs, …) with its data-go-* parameters. */
export function followGo(target:HTMLElement,go:(section:SectionId,params:Record<string,string>)=>void):boolean {
  const link=target.closest<HTMLElement>('[data-admin-go]');if(!link)return false;
  const params=Object.fromEntries(Object.entries(link.dataset).filter(([k])=>k.startsWith('go')&&k!=='adminGo').map(([k,v])=>[k.slice(2,3).toLowerCase()+k.slice(3),v??'']));
  go(link.dataset.adminGo as SectionId,params);return true;
}

/** Visão geral: the numbers that matter at a glance, the events and what needs attention. */
export const overviewSection:SectionFactory=(root,ctx)=>{
  let data:AdminSummary|undefined,disposed=false;
  root.innerHTML='<p class="admin-loading">Carregando o resumo…</p>';
  function worldStats(w:WorldSnapshot|null):string {
    const connected=w?.players.filter(p=>p.connected).length??0,working=w?.jobs.reduce((s,j)=>s+j.workers.length,0)??0;
    return stat('No bar agora',w?`${w.occupancy}/${w.capacity}`:'—',w?`${connected} conectado(s) · ${working} trabalhando`:'Aguardando o mundo…');
  }
  function health(w:WorldSnapshot|null):string {
    const age=w?Date.now()-w.at:Infinity,apiAge=w?.process?Date.now()-w.process.apiOkAt:Infinity;
    const row=(ok:boolean|null,label:string,detail:string)=>`<li>${badge(ok===null?'—':ok?'OK':'Atenção',ok===null?'muted':ok?'mint':'gold')}<b>${label}</b><span>${detail}</span></li>`;
    return `<ul class="admin-health">
      ${row(!!data,'API e banco de dados',data?'Respondendo':'Sem resposta')}
      ${row(w?age<15000:null,'Mundo',w?`Atualizado ${ago(w.at)}`:'Sem dados do mundo ainda')}
      ${row(w?.process?apiAge<15000:null,'Mundo → API',w?.process?`Última conversa ${ago(w.process.apiOkAt)}`:'—')}
      ${row(w?w.pricesLoaded!==false:null,'Preços no mundo',w?(w.pricesLoaded===false?'Recarregando a tabela':'Sincronizados'):'—')}
      ${row(w?w.walletRetries===0&&w.resultOutbox===0:null,'Filas do mundo',w?`${w.walletRetries} crédito(s) e ${w.resultOutbox} resultado(s) pendentes`:'—')}
    </ul>`;
  }
  function eventBox(w:WorldSnapshot|null):string {
    return `<p class="admin-note">${w?.event?`Agora: <b>${e(EVENT_NAMES[w.event]??w.event)}</b>. Um novo evento substitui o atual.`:'Nenhum evento acontecendo. Escolha um para começar agora.'}</p>
      <div class="admin-events">${EVENTS.map(([type,icon,label])=>`<button class="mini-button" data-admin-event="${type}" ${w?.event===type?'aria-pressed="true"':''}>${uiIcon(icon)} ${label}</button>`).join('')}</div>`;
  }
  function render():void {
    if(disposed||!data)return;
    const d=data,w=ctx.world(),change=d.economy.supplyChange7d;
    root.innerHTML=`<div class="admin-stats">
        <div id="overview-world">${worldStats(w)}</div>
        ${stat('Contas',n(d.accounts.total),`+${n(d.accounts.new24h)} hoje · +${n(d.accounts.new7d)} em 7 dias`)}
        ${stat('Denúncias abertas',n(d.reportsOpen),d.reportsOpen?'Esperando análise':'Nada pendente',d.reportsOpen?'warn':'')}
        ${stat('Moedas em circulação',compact(d.economy.supply),change===null?'Sem base de comparação':`${pct(change)} em 7 dias`,change===null?'':change>0.05?'warn':'')}
        ${stat('Criadas em 24 h',`+${compact(d.economy.created24h)}`,`−${compact(d.economy.destroyed24h)} retiradas no mesmo período`)}
        ${stat('Entradas em 24 h',n(d.activity.logins24h),`${n(d.activity.actions24h)} ação(ões) da administração`)}
      </div>
      <div class="admin-grid">
        ${card('Eventos no bar',`<div id="overview-events">${eventBox(w)}</div>`,{icon:'party'})}
        ${card('Saúde do sistema',`<div id="overview-health">${health(w)}</div>`,{icon:'server',actions:goButton('server','Detalhes')})}
      </div>
      <div class="admin-grid">
        ${card('Últimas ações da administração',d.recent.length?`<ul class="admin-feed">${d.recent.map(a=>`<li><b>${e(adminActionLabel(a.action))}</b><span>${e(a.actorName??'Administração')}${a.targetName?` → ${e(a.targetName)}`:''} · ${e(when(a.createdAt))}</span><p>${e(a.reason)}</p></li>`).join('')}</ul>`:empty('Nenhuma ação registrada ainda.'),
          {icon:'shield',actions:goButton('logs','Ver no log',{category:'admin'})})}
        ${card('Contas que pedem atenção',`<ul class="admin-health">
          <li>${badge(n(d.accounts.banned),d.accounts.banned?'red':'muted')}<b>Banidas</b>${goButton('players','Ver',{filter:'banned'})}</li>
          <li>${badge(n(d.accounts.unverified),d.accounts.unverified?'gold':'muted')}<b>E-mail pendente</b>${goButton('players','Ver',{filter:'unverified'})}</li>
          <li>${badge(n(d.accounts.admins),'magenta')}<b>Administradores</b>${goButton('players','Ver',{filter:'admins'})}</li>
          <li>${badge(n(d.reportsOpen),d.reportsOpen?'gold':'muted')}<b>Denúncias abertas</b>${goButton('reports','Analisar')}</li></ul>`,{icon:'alert'})}
      </div>`;
  }
  async function load():Promise<void> {
    try{data=await ctx.api<AdminSummary>('/admin/summary');if(disposed)return;ctx.reports(data.reportsOpen);render();}
    catch(error){if(!disposed)root.innerHTML=empty(error instanceof Error?error.message:'Não foi possível carregar o resumo.');}
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    if(followGo(target,ctx.go))return;
    const button=target.closest<HTMLElement>('[data-admin-event]');if(!button)return;
    const type=button.dataset.adminEvent!;
    void ctx.run(async()=>{await ctx.api('/admin/action',{action:'event',eventType:type});ctx.requestWorld();},`${EVENT_NAMES[type]} solicitado. Começa em alguns segundos.`);
  };
  root.addEventListener('click',click);void load();
  return {
    world(w){
      const set=(id:string,html:string)=>{const node=root.querySelector(`#${id}`);if(node)node.innerHTML=html;};
      set('overview-world',worldStats(w));set('overview-health',health(w));
      // Do not redraw the buttons under a pointer that is about to press them.
      const events=root.querySelector('#overview-events');if(events&&!events.contains(document.activeElement))events.innerHTML=eventBox(w);
    },
    destroy(){disposed=true;root.removeEventListener('click',click);},
  };
};
