import {itemById,mediaPriceKey} from '@bar/shared';
import {badge,card,duration,e,empty,n,stat,uiIcon,type SectionFactory,type WorldOrder,type WorldSnapshot} from './kit';
import {followGo,goButton} from './overview';

const EVENT_NAMES:Record<string,string>={BLACKOUT:'Apagão',DRUNK_NPC:'O inconveniente',PARTY:'Festa'};
const ms=(v:number|undefined)=>v===undefined?'—':`${n(v,1)} ms`;

function botsHtml(b:NonNullable<WorldSnapshot['bots']>):string {
  if(!b.available)return '<p class="admin-note">Disponíveis só no ambiente de desenvolvimento.</p>';
  const add=(k:number)=>Math.min(b.max,b.target+k),st=b.status;
  const state=!b.running?'Nenhum bot no bar.':b.inBar<b.target?`Entrando: ${b.inBar}/${b.target} no bar…`:b.inBar>b.target?`Saindo: ${b.inBar} no bar, ficam ${b.target}…`:`${b.inBar} bots no bar.`;
  return `<p class="admin-note"><b>${state}</b> Cabem até ${b.max} · tick do mundo p95 ${ms(b.tickP95)}</p>
    ${st?.doing.length?`<p class="admin-note">${st.doing.map(([what,k])=>`${e(what)} ${k}`).join(' · ')}${st.walking?` (${st.walking} andando)`:''}</p>`:''}
    ${st?.rttP95!==undefined?`<p class="fine-print">Últimos 15 s: RTT p95 ${ms(st.rttP95)} · ${st.inputs??0} inputs/s · processo dos bots: event loop p95 ${ms(st.loopP95)}${st.refusals?.length?` · recusas: ${st.refusals.map(([text,k])=>`${k}× ${e(text)}`).join(' | ')}`:''}</p>`:''}
    <form class="admin-inline-form row" data-world-form="bots"><label>Quantidade<input name="count" type="number" min="0" max="${b.max}" value="${b.target||Math.min(30,b.max)}"></label><button class="mini-button" type="submit">Aplicar</button>
      <button class="mini-button" type="button" data-world="bots" data-count="${add(5)}" ${add(5)===b.target?'disabled':''}>+5</button>
      <button class="mini-button" type="button" data-world="bots" data-count="${add(10)}" ${add(10)===b.target?'disabled':''}>+10</button>
      ${b.running?'<button class="mini-button" type="button" data-world="bots" data-count="0">Remover todos</button>':''}</form>
    <p class="fine-print">Jogadores de teste que entram como navegadores e vivem no bar: sentam e pedem, bebem, dançam, conversam, jogam, trabalham e tocam no palco. Rodam num processo à parte e saem quando removidos ou quando o mundo reinicia. Para mais vagas, aumente ROOM_CAPACITY no .env.</p>`;
}

/** Mundo ao vivo: the room's state (admin.world) with its job, order, device and bot controls. */
export const worldSection:SectionFactory=(root,ctx)=>{
  let snapshot:WorldSnapshot|null=ctx.world(),disposed=false;
  function render():void {
    if(disposed)return;
    const s=snapshot;if(!s?.players){root.innerHTML='<p class="admin-loading">Carregando o estado do mundo…</p>';return;}
    const name=(id:string)=>s.players.find(p=>p.id===id)?.name??id.slice(0,8);
    const orders=[s.waiter.current,...s.waiter.queue].filter((o):o is WorldOrder=>!!o);
    const connected=s.players.filter(p=>p.connected);
    root.innerHTML=`<div class="admin-stats">
        ${stat('No bar',`${s.occupancy}/${s.capacity}`,`${connected.length} conectado(s)`)}
        ${stat('Evento',e(EVENT_NAMES[s.event]??(s.event||'Nenhum')))}
        ${stat('Pedidos na mesa',n(orders.length),`Tonico: ${e(s.waiter.phase)}`)}
        ${stat('Créditos pendentes',n(s.walletRetries),'Pagamentos esperando a API',s.walletRetries?'warn':'')}
        ${stat('Resultados na fila',n(s.resultOutbox),'Partidas esperando a API',s.resultOutbox?'warn':'')}
        ${stat('Processo do mundo',s.process?duration(s.process.uptimeS):'—',s.process?`tick p95 ${ms(s.process.tickP95)}`:'')}
      </div>
      <div class="admin-grid">
        ${card('Empregos',s.jobs.map(job=>`<article class="admin-job"><header><b>${e(job.name)}</b><span>${job.workers.length}/${job.slots} vagas · ${job.tasks??0} tarefas · ${n(job.paid??0)} moedas pagas hoje · ${n(job.pay)} por tarefa</span></header>
          <form class="admin-inline-form row" data-world-form="job" data-job="${e(job.id)}"><label>Vagas<input name="slots" type="number" min="0" max="16" value="${job.slots}"></label><label class="inline-check"><input name="enabled" type="checkbox" ${job.enabled?'checked':''}> Aberto</label><button class="mini-button" type="submit">Aplicar</button>${goButton('prices','Pagamento em Preços')}</form>
          <ul class="admin-list">${job.workers.map(w=>`<li><b>${e(name(w.playerId))}</b> · ${e(w.station)} · ${w.tasks} tarefas · ${n(w.earned)} moedas · termina em ${w.endsInS}s <button class="mini-button" data-world="job-end" data-job="${e(job.id)}" data-id="${e(w.playerId)}">Encerrar turno</button>${w.orders?.length?`<br><small>Pedidos: ${w.orders.map(o=>`${e(o.customer)} (mesa ${o.table}, ${o.picked?'na bandeja':'no balcão'})`).join(', ')}</small>`:''}</li>`).join('')||'<li>Ninguém trabalhando.</li>'}</ul></article>`).join(''),{icon:'briefcase'})}
        ${card('Pedidos e balcão',`<p class="admin-note">Tonico: <b>${e(s.waiter.phase)}</b>${s.dirtyTables?.length?` · mesas para recolher: ${s.dirtyTables.map(t=>`mesa ${t}`).join(', ')}`:''}</p>
          <ul class="admin-list">${orders.map(o=>`<li><b>${e(name(o.playerId))}</b> · ${o.items.map(id=>e(itemById(id)?.name??id)).join(', ')} · ${n(o.total)} moedas <button class="mini-button" data-world="table-cancel" data-id="${e(o.playerId)}">Cancelar e devolver</button></li>`).join('')||'<li>Nenhum pedido.</li>'}</ul>
          <p class="admin-note">Balcão do Magrão: ${s.counterQueue.map(id=>e(name(id))).join(', ')||'ninguém esperando.'}</p>`,{icon:'beer'})}
      </div>
      <div class="admin-grid">
        ${card('Jukebox, TVs e telão',`<ul class="admin-list">${s.media.map(m=>`<li>${badge(m.status==='off'?'Desligado':m.status==='playing'?'Tocando':e(m.status),m.status==='playing'?'cyan':'muted')}<b>${e(m.id)}</b>${m.videoId?` · ${e(m.title||m.videoId)}${m.live?' (ao vivo)':''} · ${m.by?`no controle: ${e(name(m.by))}`:'sem controle'}`:''}${m.queue.length?` · ${n(m.queue.length)} na fila`:''} · ${n(s.prices[mediaPriceKey(m.kind==='jukebox'?'jukebox':'tv',m.id)]??0)} moedas ${m.status!=='off'?`<button class="mini-button" data-world="media-off" data-kind="${e(m.kind)}" data-id="${e(m.id)}" title="Desliga e esvazia a fila; quem estava na fila recebe as moedas de volta">Desligar</button>`:''}</li>`).join('')}</ul>`,{icon:'tv'})}
        ${card(`Palco · ingresso ${n(s.prices['stage:pass']??0)} moedas`,`<p class="admin-note">${s.players.filter(p=>p.stageMinutes!==undefined).map(p=>`${e(p.name)} (${p.stageMinutes} min)`).join(', ')||'Ninguém com ingresso.'}</p>`,{icon:'micVocal'})}
      </div>
      ${card(`Jogadores no bar (${connected.length})`,s.players.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Nome</th><th>Posição</th><th>Animação</th><th>Interação</th><th>Emprego</th><th class="num">Moedas</th><th></th></tr></thead><tbody>
        ${s.players.map(p=>`<tr class="${p.connected?'':'offline'}"><td>${e(p.name)}${p.connected?'':' · ausente'}</td><td>${p.x}, ${p.y}, ${p.z}</td><td>${e(p.animation)}</td><td>${e(p.interaction||'—')}</td><td>${e(p.job||'—')}</td><td class="num">${p.balance===undefined?'—':n(p.balance)}</td>
          <td><button type="button" class="mini-button" data-admin-go="players" data-go-player="${e(p.id)}">Ficha</button></td></tr>`).join('')}</tbody></table></div>`:empty('Ninguém no bar.'),{icon:'users'})}
      <div class="admin-grid">
        ${s.bots?card('Bots de teste',botsHtml(s.bots),{icon:'cpu'}):''}
        ${card('NPCs',`<ul class="admin-list">${s.npcs.map(npc=>`<li><b>${e(npc.name)}</b> · ${e(npc.behavior)} · ${e(npc.animation)} · (${npc.x}, ${npc.z})</li>`).join('')}</ul>`,{icon:'ghost'})}
      </div>
      <p class="fine-print">Atualizado às ${new Date(s.at).toLocaleTimeString('pt-BR')} (a cada 5 s). Vagas e aparelhos valem para esta sala até o mundo reiniciar; preços e pagamentos são definidos em Preços. Tudo fica registrado no log.</p>`;
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    if(followGo(target,ctx.go))return;
    const button=target.closest<HTMLElement>('[data-world]');if(!button)return;
    const d=button.dataset;
    if(d.world==='job-end')ctx.send('admin.job',{jobId:d.job,endShiftOf:d.id});
    else if(d.world==='table-cancel')ctx.send('admin.table',{cancelFor:d.id});
    else if(d.world==='media-off')ctx.send('admin.media',{kind:d.kind==='jukebox'?'jukebox':'tv',id:d.id});
    else if(d.world==='bots')ctx.send('admin.bots',{count:Number(d.count)});
    ctx.message('Comando enviado ao mundo.');
  };
  const submit=(event:SubmitEvent)=>{
    const form=(event.target as HTMLElement).closest<HTMLFormElement>('[data-world-form]');if(!form)return;
    event.preventDefault();event.stopPropagation();
    const values=new FormData(form);
    if(form.dataset.worldForm==='bots')ctx.send('admin.bots',{count:Number(values.get('count'))});
    else ctx.send('admin.job',{jobId:form.dataset.job,slots:Number(values.get('slots')),enabled:values.get('enabled')==='on'});
    (document.activeElement as HTMLElement|null)?.blur();ctx.message('Comando enviado ao mundo.');
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);
  render();ctx.requestWorld();
  return {
    // A field being edited is not redrawn under the cursor; the next snapshot after it brings everything.
    world(next){snapshot=next;const active=document.activeElement;if(root.contains(active)&&(active instanceof HTMLInputElement||active instanceof HTMLSelectElement))return;render();},
    destroy(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('submit',submit);},
  };
};
