import {badge,card,chips,compact,ago,e,empty,n,redraw,reasonField,requestId,stat,uiIcon,when,type AdminCityEconomy,type SectionFactory,type WorldSnapshot} from './kit';
import {chartHover,flowChart,lineChart} from './charts';
import {followGo,goButton} from './overview';

const PERIODS:ReadonlyArray<readonly [string,string]>=[['7','7 dias'],['30','30 dias'],['90','90 dias']];
const FLOWS:ReadonlyArray<readonly [string,string]>=[['all','Todos'],['in','Entradas'],['out','Saídas']];
const SOURCE_TONE={tax:'gold',admin:'magenta',other:'muted'} as const,SOURCE_NAME={tax:'Imposto',admin:'Ajuste',other:'Outro'} as const;
let lastWorldReload=0;
let lastDays='30';
const money=(value:number)=>`${n(value)} <small>moedas</small>`;
const signed=(value:number)=>`${value>0?'+':value<0?'−':''}${n(Math.abs(value))}`;

/**
 * Cofre da cidade: how much is in it, what came in and went out today and over the period, from where, the day-by-day balance,
 * every movement (a page at a time) and the adjustment form. The imposto rate that feeds it is in the Empresa Brasil tab.
 */
export const vaultTab:SectionFactory=(root,ctx)=>{
  let days=lastDays,flow:'all'|'in'|'out'='all',page=0,data:AdminCityEconomy|undefined,disposed=false,generation=0,pending:{from:number;at:number}|undefined;
  const unhover=chartHover(root);
  function render():void {
    if(disposed)return;
    if(!data){root.querySelector('.eco-vault')?.remove();if(!root.querySelector('.admin-loading'))root.insertAdjacentHTML('afterbegin','<p class="admin-loading">Abrindo o cofre…</p>');return;}
    const v=data.vault,l=v.ledger,pages=Math.max(1,Math.ceil(l.total/l.pageSize)),maxSource=Math.max(1,...v.sources.map(s=>Math.max(s.in,s.out)));
    root.querySelector('.admin-loading')?.remove();root.querySelector('.eco-vault')?.remove();
    root.insertAdjacentHTML('afterbegin',`<div class="eco-vault">
      <div class="admin-toolbar">${chips('days',PERIODS,days)}<small>Atualizado ${new Date(data.generatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}${v.updatedAt?` · último movimento ${ago(v.updatedAt)}`:''}</small></div>
      <div class="eco-hero"><div class="eco-hero-main">${uiIcon('landmark')}<div><small>Saldo do cofre da cidade</small><b>${money(v.balance)}</b></div></div>
        <div class="admin-stats">
          ${stat('Entrou hoje',`+${compact(v.today.in)}`,`${n(v.today.count)} movimento(s) no dia`,'up')}
          ${stat('Saiu hoje',v.today.out?`−${compact(v.today.out)}`:'0',v.today.out?'Ajustes da administração':'Nada saiu','down')}
          ${stat(`Entrou em ${data.days} dias`,`+${compact(v.period.in)}`,'Impostos e ajustes','up')}
          ${stat(`Saiu em ${data.days} dias`,v.period.out?`−${compact(v.period.out)}`:'0',`Resultado ${signed(v.period.in-v.period.out)}`,'down')}
        </div></div>
      <div class="admin-grid">
        ${card('Saldo no fim de cada dia',`<div class="admin-chart-slot" data-chart="balance"></div>`,{icon:'coins'})}
        ${card('Entradas × saídas por dia',`<div class="admin-legend"><span><i class="up"></i>Entrou</span><span><i class="down"></i>Saiu</span></div><div class="admin-chart-slot" data-chart="flow"></div>`,{icon:'activity'})}
      </div>
      <div class="admin-grid">
        ${card('De onde vem e para onde vai',v.sources.length?`<table class="admin-table admin-sources"><thead><tr><th>Origem</th><th>Entrou</th><th>Saiu</th><th class="num">Mov.</th></tr></thead><tbody>${v.sources.map(s=>`<tr><td>${e(s.label)}</td><td><span class="admin-bar up" style="--w:${s.in/maxSource*100}%"></span>${s.in?`+${n(s.in)}`:'—'}</td><td><span class="admin-bar down" style="--w:${s.out/maxSource*100}%"></span>${s.out?`−${n(s.out)}`:'—'}</td><td class="num">${n(s.count)}</td></tr>`).join('')}</tbody></table>
          <p class="fine-print">O cofre só recebe o imposto das vendas da Empresa Brasil. A porcentagem está em ${goButton('economy','Empresa Brasil › Valores',{tab:'firm'})}</p>`:empty('Nenhum movimento no período.'),{icon:'transfer'})}
        ${card('Ajustar o cofre',`<form class="eco-form" data-keep="vault" data-vault-adjust>
          <div class="eco-row"><label>O que fazer<select name="op" aria-label="O que fazer com o cofre"><option value="in">Colocar moedas</option><option value="out">Tirar moedas</option></select></label>
            <label>Quantidade<input name="amount" type="number" min="1" max="1000000000" step="1" required placeholder="500" aria-label="Quantidade de moedas"></label></div>
          ${reasonField('Motivo do ajuste','Ex.: pagamento da obra da praça').replace('maxlength="500"','maxlength="190"')}
          <div class="admin-confirm-buttons"><button class="button primary" type="submit">Ajustar cofre</button></div>
          <p class="fine-print">As moedas do cofre não são de nenhum jogador: este ajuste só muda o saldo da cidade e fica registrado com o seu nome.</p></form>`,{icon:'sliders'})}
      </div>
      ${card(`Movimentos do cofre · ${n(l.total)}`,`<div class="admin-toolbar">${chips('flow',FLOWS,flow)}</div>${l.rows.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Quando</th><th>Origem</th><th>O que aconteceu</th><th class="num">Valor</th><th class="num">Saldo depois</th></tr></thead><tbody>
          ${l.rows.map(r=>`<tr><td title="${e(new Date(r.at).toLocaleString('pt-BR'))}">${e(when(r.at))}</td><td>${badge(SOURCE_NAME[r.source],SOURCE_TONE[r.source])}</td><td>${e(r.reason)}${r.actor?`<small>por ${e(r.actor)}</small>`:''}</td><td class="num ${r.amount<0?'down':'up'}">${signed(r.amount)}</td><td class="num">${n(r.balanceAfter)}</td></tr>`).join('')}</tbody></table></div>
          <div class="eco-pager"><button type="button" class="mini-button" data-vault-page="-1" ${l.page<=0?'disabled':''}>${uiIcon('chevronLeft')}Mais novos</button><span>Página ${l.page+1} de ${pages}</span><button type="button" class="mini-button" data-vault-page="1" ${l.page+1>=pages?'disabled':''}>Mais antigos${uiIcon('chevronRight')}</button></div>`:empty('Nenhum movimento ainda.')}`,{icon:'receipt'})}
    </div>`);
    for(const slot of root.querySelectorAll<HTMLElement>('.admin-chart-slot')){
      const width=Math.max(280,Math.floor(slot.clientWidth||520));
      slot.innerHTML=slot.dataset.chart==='balance'?lineChart(v.series.map(x=>({day:x.day,value:x.balance})),width,'Saldo do cofre no fim de cada dia'):flowChart(v.series.map(x=>({day:x.day,created:x.in,destroyed:x.out})),width);
    }
  }
  async function load():Promise<void> {
    const version=++generation;root.querySelector('.eco-vault')?.classList.add('refreshing');if(!data)render();
    try{
      const result=await ctx.api<AdminCityEconomy>(`/admin/economy/city?days=${days}&page=${page}&flow=${flow}`);if(disposed||version!==generation)return;
      data=result;redraw(root,render);
      if(pending&&result.vault.balance!==pending.from){ctx.message(`Cofre ajustado: novo saldo ${n(result.vault.balance)} moedas.`);pending=undefined;}
    }catch(error){if(!disposed&&version===generation){root.querySelector('.admin-loading')?.remove();root.querySelector('.eco-vault')?.classList.remove('refreshing');ctx.message(error instanceof Error?error.message:'Não foi possível abrir o cofre.',true);}}
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    if(followGo(target,ctx.go))return;
    const chip=target.closest<HTMLElement>('[data-admin-chip]');
    if(chip?.dataset.adminChip==='days'&&chip.dataset.value!==days){days=lastDays=chip.dataset.value!;void load();return;}
    if(chip?.dataset.adminChip==='flow'&&chip.dataset.value!==flow){flow=chip.dataset.value as typeof flow;page=0;void load();return;}
    const step=target.closest<HTMLElement>('[data-vault-page]');if(step){page=Math.max(0,page+Number(step.dataset.vaultPage));void load();}
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;if(!form.matches('[data-vault-adjust]'))return;
    event.preventDefault();event.stopPropagation();
    const input=new FormData(form),amount=Math.floor(Number(input.get('amount'))),reason=String(input.get('reason')??'').trim(),taking=input.get('op')==='out';
    if(!Number.isSafeInteger(amount)||amount<1||reason.length<3)return;
    if(taking&&amount>(data?.vault.balance??0)){ctx.message(`O cofre só tem ${n(data?.vault.balance??0)} moedas.`,true);return;}
    if(!ctx.world()){ctx.message('O mundo não respondeu ainda: espere alguns segundos e tente de novo.',true);return;}
    ctx.send('admin.factory.treasury',{requestId:requestId(),reason,amount:taking?-amount:amount});
    pending={from:data?.vault.balance??0,at:Date.now()};ctx.message(`Pedido enviado: ${taking?'tirar':'colocar'} ${n(amount)} moedas…`);
    form.reset();
    // The world confirms with a snapshot (world() below reloads); if nothing arrives the administrator is told.
    window.setTimeout(()=>{if(pending&&!disposed){void load().then(()=>{if(pending&&!disposed){ctx.message('O cofre não mudou: o mundo pode ter recusado o ajuste. Confira o saldo.',true);pending=undefined;}});}},4000);
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);void load();
  return {
    // Tax from a sale reaches the vault while this is open: the world's snapshot carries the new balance.
    world(snapshot:WorldSnapshot){const balance=snapshot.factory?.treasury?.balance;if(data&&balance!==undefined&&balance!==data.vault.balance&&Date.now()-lastWorldReload>1500){lastWorldReload=Date.now();void load();}},
    destroy(){disposed=true;unhover();root.removeEventListener('click',click);root.removeEventListener('submit',submit);},
  };
};
