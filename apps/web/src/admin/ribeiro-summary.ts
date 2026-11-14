import {RIBEIRO_MATERIALS,RIBEIRO_RECIPES,RIBEIRO_STAGE_LABEL,RIBEIRO_STAGE_PAY,type RibeiroAdminView,type RibeiroMaterial} from '@bar/shared';
import {badge,card,compact,e,empty,n,redraw,stat,uiIcon,when} from './kit';
import {hBars,lineChart,pairedBars} from './charts';
import {STAGES,STAGE_OF,chartPainter,isActive,materialName,weaponName,type RibeiroTabFactory} from './ribeiro-kit';

const shortDay=(day:string)=>`${day.slice(8,10)}/${day.slice(5,7)}`;
const STUCK_MS=20*60_000;

interface Alert {tone:'red'|'gold'|'cyan';text:string;go?:{tab:string;label:string}}
/** What deserves the administration's attention right now, from the view alone. */
function alerts(view:RibeiroAdminView,now:number):Alert[] {
  const list:Alert[]=[];
  if(!view.members.length)list.push({tone:'gold',text:'Ainda não há equipe cadastrada: qualquer jogador pode operar as máquinas e abrir OPs. Cadastre a diretoria para restringir o acesso.',go:{tab:'team',label:'Abrir equipe'}});
  else if(!view.members.some(member=>member.role==='owner'))list.push({tone:'red',text:'A equipe não tem nenhum dono: só a administração consegue mudar cargos agora.',go:{tab:'team',label:'Definir dono'}});
  for(const material of RIBEIRO_MATERIALS){
    const stock=view.materials[material],needed=Math.min(...RIBEIRO_RECIPES.map(recipe=>recipe.materials[material]));
    if(stock===0)list.push({tone:'red',text:`${materialName(material)} zerado: nenhuma arma pode ser iniciada.`,go:{tab:'stock',label:'Pedir material'}});
    else if(stock<needed)list.push({tone:'gold',text:`${materialName(material)} (${n(stock)}) não cobre nem a receita mais simples (${n(needed)}).`,go:{tab:'stock',label:'Pedir material'}});
  }
  const stuck=view.orders.filter(order=>isActive(order)&&order.status!=='queued'&&now-order.updatedAt>STUCK_MS&&!view.jobs.some(job=>job.orderId===order.id));
  if(stuck.length)list.push({tone:'gold',text:`${n(stuck.length)} ordem(ns) parada(s) há mais de ${STUCK_MS/60_000} min sem máquina trabalhando (a peça espera retirada ou o operador saiu).`,go:{tab:'production',label:'Ver ordens'}});
  const waiting=view.statusCount.queued??0;
  if(waiting&&!view.carriers.length&&!view.jobs.length)list.push({tone:'cyan',text:`${n(waiting)} ordem(ns) na fila e ninguém operando agora.`,go:{tab:'production',label:'Ver ordens'}});
  const openPurchases=view.purchaseOrders.filter(order=>order.status==='open'||order.status==='accepted').length;
  if(openPurchases)list.push({tone:'cyan',text:`${n(openPurchases)} pedido(s) de matéria-prima no HighCargo aguardando entrega.`,go:{tab:'stock',label:'Ver pedidos'}});
  return list;
}

/** Ribeiro › Resumo: the numbers that say how the shop is going, the line's load and what needs attention. */
export const summaryTab:RibeiroTabFactory=(root,hub)=>{
  let view:RibeiroAdminView|undefined,destroyed=false;
  const painter=chartPainter(root,()=>view?{
    daily:width=>pairedBars(view!.daily.map(d=>({day:d.day,a:d.opened,b:d.completed})),width,['abertas','concluídas'],'Ordens abertas e concluídas por dia, nos últimos 14 dias'),
    paid:width=>lineChart(view!.daily.map(d=>({day:d.day,value:d.paid})),width,'Folha paga por dia, nos últimos 14 dias',210,'moedas'),
    line:width=>hBars(STAGES.map(stage=>{const count=Object.entries(view!.statusCount).filter(([status])=>STAGE_OF[status as keyof typeof STAGE_OF]===stage.id).reduce((sum,[,value])=>sum+value,0);return {label:stage.label,value:count,tone:count?'up':'muted'};}),width,'Ordens ativas por etapa da linha',190),
    made:width=>hBars(Object.entries(view!.producedByWeapon).sort((a,b)=>b[1]!-a[1]!).map(([weapon,count])=>({label:weaponName(weapon),value:count!,tone:'alt' as const})),width,'Armas produzidas por modelo, desde a abertura',190),
  }:{});
  function render():void {
    if(destroyed||!view)return;
    const now=Date.now(),active=view.totalOrders-(view.statusCount.completed??0)-(view.statusCount.cancelled??0),stockUnits=Object.values(view.stock).reduce((sum,value)=>sum+(value??0),0);
    const online=view.members.filter(member=>member.online).length,list=alerts(view,now);
    const dailyRows=view.daily.map(d=>`<tr><td>${shortDay(d.day)}</td><td class="num">${n(d.opened)}</td><td class="num">${n(d.completed)}</td><td class="num">${n(d.paid)}</td></tr>`).join('');
    const materialRows=RIBEIRO_MATERIALS.map((material:RibeiroMaterial)=>`<tr><td>${e(materialName(material))}</td><td class="num">${n(view!.materials[material])}</td></tr>`).join('');
    root.innerHTML=`<div class="rb-page">
      <div class="admin-stats rb-stats" style="--cols:3">
        ${stat('Ordens em andamento',n(active),`${n(view.statusCount.queued??0)} na fila`)}
        ${stat('Armas produzidas',n(view.completed),'desde a abertura')}
        ${stat('Tempo de uma ordem',view.averageMinutes===null?'—':`${n(view.averageMinutes,1)} min`,'da abertura ao estoque (últimas 50)')}
        ${stat('Armas prontas em estoque',n(stockUnits),`${n(Object.values(view.stock).filter(Boolean).length)} modelo(s)`)}
        ${stat('Equipe',n(view.members.length),`${n(online)} no jogo agora`)}
        ${stat('Folha paga',`${compact(view.paidTotal)}`,`nos últimos ${n(view.payroll.length)} pagamentos`)}
      </div>
      ${card(`Atenção · ${list.length}`,list.length?`<ul class="rb-alerts">${list.map(item=>`<li class="${item.tone}">${badge(item.tone==='red'?'urgente':item.tone==='gold'?'atenção':'aviso',item.tone)}<span>${e(item.text)}</span>${item.go?`<button type="button" class="mini-button" data-rb-go="${item.go.tab}">${e(item.go.label)}${uiIcon('chevronRight')}</button>`:''}</li>`).join('')}</ul>`:`<p class="rb-ok">${uiIcon('check')}Tudo em ordem: equipe cadastrada, matéria-prima disponível e nenhuma ordem parada.</p>`,{icon:'flag',className:'rb-alert-card'})}
      <div class="rb-pair">
        ${card('Ordens por dia',`<div class="admin-legend"><span><i class="alt"></i>Abertas</span><span><i class="up"></i>Concluídas</span></div><div class="admin-chart-slot" data-chart="daily"></div>
          <details class="rb-numbers"><summary>Ver os números</summary><div class="admin-scroll"><table class="admin-table"><thead><tr><th>Dia</th><th class="num">Abertas</th><th class="num">Concluídas</th><th class="num">Folha (moedas)</th></tr></thead><tbody>${dailyRows}</tbody></table></div></details>`,{icon:'activity'})}
        ${card('Onde as ordens estão agora',`<div class="admin-chart-slot" data-chart="line"></div><p class="fine-print">Conta as ordens ainda não concluídas pela etapa em que estão, de ponta a ponta da linha: a barra mais comprida é onde o trabalho está acumulando.</p>`,{icon:'warehouse'})}
      </div>
      <div class="rb-pair">
        ${card('Folha paga por dia',`<div class="admin-chart-slot" data-chart="paid"></div><p class="fine-print">Vem dos últimos pagamentos que o sistema guarda (no máximo 100), então dias antigos podem aparecer menores do que foram.</p>`,{icon:'coins'})}
        ${card('Armas produzidas por modelo',Object.keys(view.producedByWeapon).length?`<div class="admin-chart-slot" data-chart="made"></div>`:empty('Nenhuma arma foi concluída ainda.'),{icon:'gun'})}
      </div>
      <div class="rb-pair">
        ${card('Matéria-prima agora',`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Material</th><th class="num">Em estoque</th></tr></thead><tbody>${materialRows}</tbody></table></div><button type="button" class="mini-button rb-link" data-rb-go="stock">${uiIcon('package')}Abrir estoque e insumos</button>`,{icon:'package'})}
        ${card('Última movimentação',view.payroll.length?`<ul class="admin-feed rb-feed">${view.payroll.slice(0,5).map(entry=>`<li><b>${e(entry.name)}</b><span>${e(entry.label)} · ${e(when(entry.at))}</span><p>+${n(entry.amount)} moedas pagas</p></li>`).join('')}</ul>`:empty('Nenhum pagamento de etapa ainda.'),{icon:'receipt'})}
      </div>
      <p class="fine-print">Cada etapa concluída paga o operador: ${(Object.keys(RIBEIRO_STAGE_PAY) as Array<keyof typeof RIBEIRO_STAGE_PAY>).map(stage=>`${RIBEIRO_STAGE_LABEL[stage].toLowerCase()} ${n(RIBEIRO_STAGE_PAY[stage])}`).join(' · ')} moedas, sob o mesmo limite diário de trabalho da EMPRESA BRASIL.</p>
    </div>`;
    painter.paint();
  }
  const click=(event:MouseEvent)=>{const go=(event.target as HTMLElement).closest<HTMLElement>('[data-rb-go]');if(go)hub.open(go.dataset.rbGo!);};
  root.addEventListener('click',click);
  return {
    update(next){view=next;redraw(root,render);},
    destroy(){destroyed=true;painter.destroy();root.removeEventListener('click',click);},
  };
};
