import {RIBEIRO_RECIPES,RIBEIRO_STAGE_LABEL,RIBEIRO_STATUS_LABEL,ribeiroOpLabel,type RibeiroAdminView,type RibeiroOrder} from '@bar/shared';
import {badge,card,chips,e,empty,n,redraw,stat,uiIcon,when} from './kit';
import {READY_STATUS,STATIONS,STAGES,isActive,pager,stationLabel,statusTone,weaponName,type RibeiroTabFactory} from './ribeiro-kit';

const PAGE=10;
const FILTERS:ReadonlyArray<readonly [string,string]>=[['active','Em andamento'],['done','Concluídas'],['cancelled','Canceladas'],['all','Todas']];
const CARRY_STAGE={raw:'matéria-prima',cut:'peça cortada',machined:'peça usinada',finished:'peça acabada',assembled:'arma montada'} as const;
let lastFilter='active';

const seconds=(ms:number)=>`${Math.max(0,Math.ceil(ms/1000))} s`;
/** Ribeiro › Produção: the shop floor as it is now (each machine, who works and how long is left), the parts being carried and every order with the tools to unstick one. */
export const productionTab:RibeiroTabFactory=(root,hub)=>{
  let view:RibeiroAdminView|undefined,filter=lastFilter,page=0,destroyed=false;
  const ticker=window.setInterval(()=>{
    if(destroyed)return;const now=Date.now();
    for(const bar of root.querySelectorAll<HTMLElement>('[data-rb-job]')){
      const start=Number(bar.dataset.start),end=Number(bar.dataset.end),ratio=Math.min(1,Math.max(0,(now-start)/Math.max(1,end-start)));
      (bar.querySelector('i') as HTMLElement).style.width=`${ratio*100}%`;const left=bar.parentElement?.querySelector('[data-rb-left]');if(left)left.textContent=end>now?`faltam ${seconds(end-now)}`:'terminando…';
    }
  },500);

  function station(s:typeof STATIONS[number],v:RibeiroAdminView):string {
    const job=v.jobs.find(item=>item.stationId===s.id),waiting=v.orders.find(order=>order.stationId===s.id&&READY_STATUS.includes(order.status));
    const order=job?v.orders.find(item=>item.id===job.orderId):waiting;
    if(job)return `<article class="rb-station busy"><header><b title="${e(s.label)}">${e(s.short)}</b>${badge('trabalhando','magenta')}</header>
      <p>${e(order?weaponName(order.weapon):'—')}<small>operador: ${e(order?.operatorName||'—')}</small></p>
      <div class="admin-meter" role="meter" aria-label="Andamento de ${e(s.label)}" data-rb-job data-start="${job.startedAt}" data-end="${job.endsAt}"><i style="width:0"></i></div><small data-rb-left>…</small></article>`;
    if(waiting)return `<article class="rb-station ready"><header><b title="${e(s.label)}">${e(s.short)}</b>${badge('peça pronta','cyan')}</header><p>${e(weaponName(waiting.weapon))}<small>esperando retirada por ${e(waiting.operatorName||'alguém')}</small></p></article>`;
    return `<article class="rb-station idle"><header><b title="${e(s.label)}">${e(s.short)}</b>${badge('livre','muted')}</header><p class="rb-muted">Sem peça nesta máquina.</p></article>`;
  }
  function orderRow(order:RibeiroOrder):string {
    const action=order.status==='queued'?`<button type="button" class="mini-button" data-rb-cancel="${order.id}" data-name="${e(weaponName(order.weapon))}">Cancelar</button>`
      :isActive(order)?`<button type="button" class="mini-button danger" data-rb-abort="${order.id}" data-name="${e(weaponName(order.weapon))}">${uiIcon('trash')}Descartar</button>`:'';
    return `<tr><td><b>${e(weaponName(order.weapon))}</b><small>${e(ribeiroOpLabel(order))}${order.customer?` · ${e(order.customer)}`:''}</small></td><td>${badge(RIBEIRO_STATUS_LABEL[order.status],statusTone(order.status))}</td>
      <td>${e(stationLabel(order.stationId)||'—')}</td><td>${e(order.operatorName||'—')}</td><td class="rb-nowrap" title="${e(new Date(order.createdAt).toLocaleString('pt-BR'))}">${e(when(order.createdAt))}</td><td class="rb-nowrap" title="${e(new Date(order.updatedAt).toLocaleString('pt-BR'))}">${e(when(order.updatedAt))}</td><td class="rb-act">${action}</td></tr>`;
  }
  function render():void {
    if(destroyed||!view)return;
    const v=view,list=v.orders.filter(order=>filter==='all'||(filter==='active'?isActive(order):filter==='done'?order.status==='completed':order.status==='cancelled'));
    const pages=Math.max(1,Math.ceil(list.length/PAGE));page=Math.min(page,pages-1);
    const ordersSample=list.slice(page*PAGE,page*PAGE+PAGE),working=v.jobs.length,waiting=v.orders.filter(order=>READY_STATUS.includes(order.status)).length;
    const columns=STAGES.filter(stage=>stage.id!=='queue').map(stage=>`<section class="rb-column"><h5>${e(RIBEIRO_STAGE_LABEL[stage.id as keyof typeof RIBEIRO_STAGE_LABEL])}<small>${STATIONS.filter(s=>s.stage===stage.id).length} máquina(s)</small></h5><div class="rb-stations">${STATIONS.filter(s=>s.stage===stage.id).map(s=>station(s,v)).join('')}</div></section>`).join('');
    const queued=v.statusCount.queued??0;
    root.innerHTML=`<div class="rb-page">
      <div class="admin-stats rb-stats" style="--cols:4">
        ${stat('Máquinas trabalhando',`${n(working)} de ${n(STATIONS.length)}`,'agora')}
        ${stat('Peças esperando retirada',n(waiting),'prontas numa máquina','')}
        ${stat('Na fila de preparação',n(queued),queued?'esperando alguém retirar a matéria-prima':'fila vazia')}
        ${stat('Peças em transporte',n(v.carriers.length),v.carriers.length?'nas mãos de operadores':'ninguém carregando')}
      </div>
      ${card('Chão de fábrica agora',`<div class="rb-line">${columns}</div><p class="fine-print">A linha segue da esquerda para a direita: corte → usinagem → furação e acabamento → montagem. A barra mostra quanto falta para a máquina terminar.</p>`,{icon:'warehouse',className:'rb-floor'})}
      ${card(`Peças em transporte · ${v.carriers.length}`,v.carriers.length?`<ul class="rb-carriers">${v.carriers.map(c=>`<li><b>${e(c.name)}</b><span>${e(weaponName(c.weapon))} · ${CARRY_STAGE[c.stage]}</span><small>OP ${c.orderId.slice(0,6).toUpperCase()}</small></li>`).join('')}</ul>`:empty('Ninguém está carregando uma peça neste momento.'),{icon:'bag'})}
      ${card(`Ordens de produção · ${n(v.totalOrders)}`,`<div class="admin-toolbar">${chips('rbfilter',FILTERS,filter)}<small>${n(list.length)} nesta lista${v.totalOrders>v.orders.length?` · só as ${v.orders.length} mais recentes de ${n(v.totalOrders)}`:''}</small></div>
        ${ordersSample.length?`<div class="admin-scroll"><table class="admin-table rb-orders"><thead><tr><th>Arma</th><th>Estado</th><th>Máquina</th><th>Operador</th><th>Aberta</th><th>Atualizada</th><th></th></tr></thead><tbody>${ordersSample.map(orderRow).join('')}</tbody></table></div>
        ${pager('rb-page',page,pages,`${n(list.length)} ordem(ns)`,{left:uiIcon('chevronLeft'),right:uiIcon('chevronRight')})}`:empty('Nenhuma ordem nesta lista.')}
        <p class="fine-print"><b>Cancelar</b> só vale para ordem ainda na fila: a matéria-prima volta ao estoque. <b>Descartar</b> tira do meio da linha uma ordem travada (máquina presa, operador que saiu): libera a máquina e a peça some, e o material já gasto não volta. O motivo vai na barra de cima.</p>`,{icon:'clipboard'})}
      <details class="rb-numbers"><summary>Receitas: matéria-prima por ordem</summary><div class="admin-scroll"><table class="admin-table"><thead><tr><th>Arma</th><th class="num">Aço</th><th class="num">Alumínio</th><th class="num">Polímero</th><th class="num">Molas</th></tr></thead><tbody>${RIBEIRO_RECIPES.map(recipe=>`<tr><td>${e(weaponName(recipe.weapon))}</td><td class="num">${recipe.materials.ACO}</td><td class="num">${recipe.materials.ALUMINIO}</td><td class="num">${recipe.materials.POLIMERO}</td><td class="num">${recipe.materials.MOLAS}</td></tr>`).join('')}</tbody></table></div></details>
    </div>`;
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement,chip=target.closest<HTMLElement>('[data-admin-chip="rbfilter"]');
    if(chip){filter=lastFilter=chip.dataset.value!;page=0;redraw(root,render);return;}
    const step=target.closest<HTMLElement>('[data-rb-page]');if(step){page=Math.max(0,page+Number(step.dataset.rbPage));redraw(root,render);return;}
    const cancel=target.closest<HTMLElement>('[data-rb-cancel]');
    if(cancel){if(confirm(`Cancelar a ordem de ${cancel.dataset.name}? A matéria-prima volta ao estoque.`))hub.command({op:'order.cancel',id:cancel.dataset.rbCancel});return;}
    const abort=target.closest<HTMLElement>('[data-rb-abort]');
    if(abort&&confirm(`Descartar a ordem de ${abort.dataset.name}? A máquina é liberada, a peça some e a matéria-prima já gasta NÃO volta.`))hub.command({op:'order.abort',id:abort.dataset.rbAbort});
  };
  root.addEventListener('click',click);
  return {
    update(next){view=next;redraw(root,render);},
    destroy(){destroyed=true;window.clearInterval(ticker);root.removeEventListener('click',click);},
  };
};
