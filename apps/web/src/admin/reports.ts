import type {AdminReport} from '@bar/shared';
import {badge,chips,e,empty,reasonField,when,type SectionFactory} from './kit';
import {followGo,goButton} from './overview';

type Status='open'|'resolved'|'all';
const STATUSES:ReadonlyArray<readonly [Status,string]>=[['open','Abertas'],['resolved','Resolvidas'],['all','Todas']];

/** Denúncias: the queue of reports, each with who, against whom, why and what was decided. */
export const reportsSection:SectionFactory=(root,ctx)=>{
  let status:Status='open',reports:AdminReport[]|undefined,resolving='',disposed=false,generation=0;
  function render():void {
    if(disposed)return;
    const list=reports===undefined?'<p class="admin-loading">Carregando denúncias…</p>':reports.length?reports.map(r=>`<article class="admin-report ${r.resolvedAt?'resolved':''}">
      <header><b>${e(r.reporterName??'Jogador')} → ${e(r.targetName??'Jogador')}</b>${r.resolvedAt?badge('Resolvida','mint'):badge('Aberta','gold')}<small>${e(when(r.createdAt))}</small></header>
      <p>${e(r.reason)}</p>
      ${r.resolvedAt?`<p class="admin-resolution"><b>${e(r.resolvedByName??'Administração')}</b> · ${e(when(r.resolvedAt))}: ${e(r.resolution??'')}</p>`:''}
      <div class="admin-report-actions">${r.targetId?goButton('players',`Ficha de ${e(r.targetName??'jogador')}`,{player:r.targetId}):''}${r.reporterId?goButton('players','Ficha de quem denunciou',{player:r.reporterId}):''}
        ${r.resolvedAt?`<button class="mini-button" data-report="reopen" data-id="${e(r.id)}">Reabrir</button>`:`<button class="mini-button" data-report="resolve" data-id="${e(r.id)}">Resolver</button>`}</div>
      ${resolving===r.id?`<form class="admin-confirmation" data-report-form="${e(r.id)}"><h4>Resolver denúncia</h4><p>Registre o que foi decidido (por exemplo: advertência, banimento, sem irregularidade). Para punir, use a aba Moderação na ficha do jogador.</p>
        ${reasonField('Decisão')}<div class="admin-confirm-buttons"><button class="button primary" type="submit">Marcar como resolvida</button><button class="mini-button" type="button" data-report="cancel">Cancelar</button></div></form>`:''}
      </article>`).join(''):empty(status==='open'?'Nenhuma denúncia aberta. Tudo em dia.':'Nenhuma denúncia aqui.');
    root.innerHTML=`<div class="admin-toolbar">${chips('status',STATUSES,status)}</div><div class="admin-reports">${list}</div>`;
  }
  async function load():Promise<void> {
    const version=++generation;reports=undefined;render();
    try{
      const [result,open]=await Promise.all([ctx.api<{reports:AdminReport[]}>(`/admin/reports?status=${status}`),status==='open'?undefined:ctx.api<{reports:AdminReport[]}>('/admin/reports?status=open')]);
      if(disposed||version!==generation)return;reports=result.reports;ctx.reports((open??result).reports.length);render();
    }catch(error){if(!disposed&&version===generation){reports=[];render();ctx.message(error instanceof Error?error.message:'Não foi possível carregar as denúncias.',true);}}
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    if(followGo(target,ctx.go))return;
    const chip=target.closest<HTMLElement>('[data-admin-chip="status"]');if(chip){status=chip.dataset.value as Status;resolving='';void load();return;}
    const button=target.closest<HTMLElement>('[data-report]');if(!button)return;
    const action=button.dataset.report;
    if(action==='resolve'){resolving=button.dataset.id!;render();root.querySelector<HTMLTextAreaElement>('[data-report-form] textarea')?.focus();}
    else if(action==='cancel'){resolving='';render();}
    else if(action==='reopen')void ctx.run(async()=>{await ctx.api('/admin/reports/resolve',{reportId:button.dataset.id,resolution:null});await load();},'Denúncia reaberta.');
  };
  const submit=(event:SubmitEvent)=>{
    const form=(event.target as HTMLElement).closest<HTMLFormElement>('[data-report-form]');if(!form)return;
    event.preventDefault();event.stopPropagation();
    const resolution=String(new FormData(form).get('reason')??'').trim();
    void ctx.run(async()=>{await ctx.api('/admin/reports/resolve',{reportId:form.dataset.reportForm,resolution});resolving='';await load();},'Denúncia marcada como resolvida.');
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);void load();
  return {destroy(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};
};
