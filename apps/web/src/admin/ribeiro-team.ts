import {RIBEIRO_STAGE_LABEL,RIBEIRO_STAGE_PAY,type RibeiroAdminView,type RibeiroMemberRole} from '@bar/shared';
import {badge,card,compact,e,empty,n,redraw,stat,uiIcon,when} from './kit';
import {hBars,lineChart} from './charts';
import {ROLE_NAME,ROLE_TONE,UUID,chartPainter,pager,type RibeiroTabFactory} from './ribeiro-kit';

const PAGE=10;
const ROLES:readonly RibeiroMemberRole[]=['owner','manager','employee'];

/** Ribeiro › Equipe e folha: who works at the shop and with which role, who earned what, and the payroll entry by entry. */
export const teamTab:RibeiroTabFactory=(root,hub)=>{
  let view:RibeiroAdminView|undefined,page=0,destroyed=false,players:ReadonlyArray<{id:string;name:string;connected:boolean}>=hub.ctx.world()?.players??[];
  const painter=chartPainter(root,()=>view?{
    earned:width=>hBars([...view!.members].sort((a,b)=>b.earned-a.earned).slice(0,12).map(member=>({label:member.name,value:member.earned,text:`${n(member.earned)}`,tip:`${member.name} · ${n(member.earned)} moedas ganhas na Ribeiro`,tone:'up' as const})),width,'Quanto cada pessoa já ganhou na Ribeiro',190),
    stages:width=>hBars((Object.keys(RIBEIRO_STAGE_PAY) as Array<keyof typeof RIBEIRO_STAGE_PAY>).map(stage=>({label:RIBEIRO_STAGE_LABEL[stage],value:view!.paidByStage[stage]??0,text:`${n(view!.paidByStage[stage]??0)}`,tone:'alt' as const})),width,'Folha por etapa, nos últimos pagamentos',190),
    paid:width=>lineChart(view!.daily.map(d=>({day:d.day,value:d.paid})),width,'Folha paga por dia, nos últimos 14 dias',210,'moedas'),
  }:{});
  function memberRow(member:RibeiroAdminView['members'][number]):string {
    const id=e(member.userId),others=ROLES.filter(role=>role!==member.role);
    return `<li class="rb-member ${member.role}">
      <div class="rb-who"><b>${e(member.name)}</b><small>${id}</small></div>
      <div class="rb-tags">${badge(ROLE_NAME[member.role],ROLE_TONE[member.role])}${member.online?badge('no jogo','mint'):badge('fora','muted')}<small>desde ${e(when(member.hiredAt))}</small></div>
      <div class="rb-earned"><small>Ganhou</small><b>${n(member.earned)} <i>moedas</i></b></div>
      <div class="rb-btns">${others.map(role=>`<button type="button" class="mini-button" data-rb-role="${role}" data-user="${id}" data-name="${e(member.name)}">Virar ${ROLE_NAME[role].toLowerCase()}</button>`).join('')}<button type="button" class="mini-button danger" data-rb-role="none" data-user="${id}" data-name="${e(member.name)}">${uiIcon('trash')}Tirar da equipe</button></div>
    </li>`;
  }
  function render():void {
    if(destroyed||!view)return;
    const v=view,counts=ROLES.map(role=>v.members.filter(member=>member.role===role).length),pages=Math.max(1,Math.ceil(v.payroll.length/PAGE));page=Math.min(page,pages-1);
    const free=players.filter(player=>!v.members.some(member=>member.userId===player.id));
    const rows=v.payroll.slice(page*PAGE,page*PAGE+PAGE);
    root.innerHTML=`<div class="rb-page">
      <div class="admin-stats rb-stats" style="--cols:5">
        ${stat('Donos',n(counts[0]!),'')}${stat('Gerentes',n(counts[1]!),'')}${stat('Funcionários',n(counts[2]!),'')}
        ${stat('No jogo agora',n(v.members.filter(member=>member.online).length),`de ${n(v.members.length)} na equipe`)}
        ${stat('Folha paga',compact(v.paidTotal),`nos últimos ${n(v.payroll.length)} pagamentos`)}
      </div>
      ${card(`Equipe · ${n(v.members.length)}`,v.members.length?`<ul class="rb-members">${[...v.members].sort((a,b)=>ROLES.indexOf(a.role)-ROLES.indexOf(b.role)||a.name.localeCompare(b.name,'pt-BR')).map(memberRow).join('')}</ul>
        <p class="fine-print">Donos contratam, demitem e escolhem gerentes; gerentes contratam e demitem funcionários, abrem OPs e pedem matéria-prima. Quando há equipe cadastrada, só ela opera as máquinas e retira armas. A administração pode tudo aqui, inclusive tirar o último dono (se ainda houver outras pessoas, promova outro dono antes).</p>`:empty('Ninguém está cadastrado: qualquer jogador opera as máquinas. Adicione a primeira pessoa abaixo como dono.'),{icon:'users',className:'rb-team'})}
      ${card('Adicionar à equipe ou mudar um cargo',`<form class="rb-add" data-keep="rb-add" data-rb-add>
          <label>Jogador<input name="player" list="rb-players" required autocomplete="off" placeholder="nome ou id" aria-label="Jogador"></label>
          <label>Cargo<select name="role" aria-label="Cargo"><option value="employee">Funcionário</option><option value="manager">Gerente</option><option value="owner">Dono</option></select></label>
          <button class="button primary" type="submit">${uiIcon('userPlus')}Aplicar</button>
          <datalist id="rb-players">${free.map(player=>`<option value="${e(player.name)}">${player.connected?'no jogo':'fora'}</option>`).join('')}</datalist></form>
        <p class="fine-print">Escolha pelo nome (todos que já entraram no jogo desde que o mundo abriu aparecem na lista) ou digite o id completo da ficha em Jogadores. A pessoa entra na hora, mesmo fora do jogo.</p>`,{icon:'userPlus'})}
      <div class="rb-pair">
        ${card('Quanto cada pessoa ganhou',v.members.some(member=>member.earned>0)?`<div class="admin-chart-slot" data-chart="earned"></div>`:empty('Ninguém recebeu pagamento da Ribeiro ainda.'),{icon:'coins'})}
        ${card('Folha por etapa',v.paidTotal?`<div class="admin-chart-slot" data-chart="stages"></div><p class="fine-print">Dentro dos últimos ${n(v.payroll.length)} pagamentos guardados (no máximo 100).</p>`:empty('Nenhum pagamento de etapa ainda.'),{icon:'wrench'})}
      </div>
      ${card('Folha paga por dia',`<div class="admin-chart-slot" data-chart="paid"></div>`,{icon:'activity'})}
      ${card(`Pagamentos · ${n(v.payroll.length)}`,rows.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Quando</th><th>Quem</th><th>Etapa</th><th class="num">Valor</th></tr></thead><tbody>${rows.map(entry=>`<tr><td title="${e(new Date(entry.at).toLocaleString('pt-BR'))}">${e(when(entry.at))}</td><td>${e(entry.name)}</td><td>${e(entry.label)}</td><td class="num up">+${n(entry.amount)}</td></tr>`).join('')}</tbody></table></div>
        ${pager('rb-pay',page,pages,`últimos ${n(v.payroll.length)} pagamentos`,{left:uiIcon('chevronLeft'),right:uiIcon('chevronRight')})}`:empty('Nenhum pagamento ainda: cada etapa concluída paga o operador.'),{icon:'receipt'})}
    </div>`;
    painter.paint();
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement,step=target.closest<HTMLElement>('[data-rb-pay]');
    if(step){page=Math.max(0,page+Number(step.dataset.rbPay));redraw(root,render);return;}
    const button=target.closest<HTMLElement>('[data-rb-role]');if(!button)return;
    const role=button.dataset.rbRole!,name=button.dataset.name??'',userId=button.dataset.user!;
    if(role==='none'){if(confirm(`Tirar ${name} da equipe da Ribeiro? Ele perde o acesso às máquinas e ao estoque.`))hub.command({op:'role',userId,role:null});return;}
    if(role==='employee'&&view?.members.find(member=>member.userId===userId)?.role==='owner'&&!confirm(`Rebaixar ${name} de dono a funcionário?`))return;
    hub.command({op:'role',userId,role});
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;if(!form.matches('[data-rb-add]'))return;
    event.preventDefault();
    const data=new FormData(form),typed=String(data.get('player')??'').trim().toLowerCase(),role=String(data.get('role'));
    const known=players.find(player=>player.name.toLowerCase()===typed||player.id.toLowerCase()===typed),id=known?.id??(UUID.test(typed)?typed:'');
    if(!id){hub.ctx.message('Jogador não encontrado: escolha um nome da lista ou digite o id completo dele (Jogadores › ficha).',true);return;}
    hub.command({op:'role',userId:id,role,...(known?{name:known.name.slice(0,40)}:{})});
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);
  return {
    update(next,world){view=next;players=world.players;redraw(root,render);},
    destroy(){destroyed=true;painter.destroy();root.removeEventListener('click',click);root.removeEventListener('submit',submit);},
  };
};
