import {LEDGER_SOURCES,type AdminEconomy} from '@bar/shared';
import {SHIPMENT_LABEL,ago,badge,card,chips,compact,e,empty,n,pct,stat,uiIcon,type AdminCityEconomy,type SectionFactory} from './kit';
import {chartHover,flowChart,lineChart} from './charts';
import {followGo,goButton} from './overview';

const PERIODS:ReadonlyArray<readonly [string,string]>=[['7','7 dias'],['30','30 dias'],['90','90 dias']];
let lastDays='30';

/** In plain words: is the money supply growing, shrinking or steady, and what usually helps. */
function diagnosis(d:AdminEconomy):string {
  const growth=d.inflation.periodChange,{created,destroyed}=d.inflation;
  const ratio=destroyed?created/destroyed:null,flow=ratio===null?'':ratio>=1?` Entraram ${n(ratio,1)}× mais moedas do que saíram.`:` Saíram ${n(1/ratio,1)}× mais moedas do que entraram.`;
  if(growth===null)return 'Ainda não há base para medir a inflação: o período começou sem moedas em circulação.';
  const head=`Em ${d.days} dias as moedas em circulação ${growth>=0?'cresceram':'diminuíram'} ${pct(Math.abs(growth))} (${pct(d.inflation.dailyRate,2)} ao dia).${flow}`;
  if(growth>.1)return `${head} Moedas sobrando perdem valor: os preços pesam menos para quem acumula. Para frear, reduza recompensas (trabalho, bônus) ou suba preços em Preços.`;
  if(growth<-.1)return `${head} Os jogadores gastam mais do que ganham. Para aliviar, aumente o pagamento do trabalho ou baixe preços em Preços.`;
  return `${head} A economia está estável.`;
}

/** A stat tile that opens another tab of the Economia hub. */
const tile=(tab:string,label:string,value:string,sub:string,tone:''|'up'|'down'|'warn'='')=>`<button type="button" class="admin-stat eco-tile" data-admin-go="economy" data-go-tab="${tab}"><small>${label}${uiIcon('chevronRight')}</small><b>${value}</b><span class="${tone}">${sub}</span></button>`;
/** What happened lately in the city's money: the vault's movements and the plant's trips, newest first. */
function recent(c:AdminCityEconomy):string {
  const items=[
    ...c.vault.ledger.rows.slice(0,6).map(r=>({at:Date.parse(r.at),tone:r.amount>=0?'mint' as const:'red' as const,tab:'vault',what:'Cofre',text:`${r.amount>=0?'Recebeu':'Perdeu'} ${n(Math.abs(r.amount))} moedas · ${r.reason}`})),
    ...[...c.firm.trips.active,...c.firm.trips.latest].slice(0,6).map(t=>({at:Date.parse(t.deliveredAt??t.departedAt??t.createdAt),tone:'cyan' as const,tab:'firm',what:'Empresa',text:`${t.kind==='sale'?'Venda':'Coleta'} de ${t.pallets} palete(s) · ${SHIPMENT_LABEL[t.status]??t.status}${t.gross?` · ${n(t.gross)} moedas`:''}`})),
  ].sort((a,b)=>b.at-a.at).slice(0,8);
  return items.length?`<ul class="admin-feed eco-recent">${items.map(i=>`<li><button type="button" class="text-button" data-admin-go="economy" data-go-tab="${i.tab}">${badge(i.what,i.tone)}</button><p>${e(i.text)}</p><span>${ago(i.at)}</span></li>`).join('')}</ul>`:empty('Nada aconteceu no cofre nem na empresa ainda.');
}

/** Resumo: what is happening today in the vault and the company, then the coins in circulation over time, what creates and destroys them, how they are spread and the price level. */
export const summaryTab:SectionFactory=(root,ctx)=>{
  let days=lastDays,data:AdminEconomy|undefined,city:AdminCityEconomy|undefined,disposed=false,generation=0;
  const unhover=chartHover(root);
  function render():void {
    if(disposed)return;
    if(!data){root.querySelector('.admin-economy')?.classList.add('refreshing');if(!root.querySelector('.admin-economy'))root.insertAdjacentHTML('afterbegin','<p class="admin-loading">Calculando a economia…</p>');return;}
    const d=data,s=d.supply,maxSource=Math.max(1,...d.sources.map(x=>Math.max(x.created,x.destroyed)));
    root.querySelector('.admin-loading')?.remove();root.querySelector('.admin-economy')?.remove();
    const today=d.series[d.series.length-1],c=city;
    root.insertAdjacentHTML('afterbegin',`<div class="admin-economy">
      ${c?`<h4 class="eco-heading">Hoje</h4>
      <div class="admin-stats eco-today">
        ${tile('vault','Cofre da cidade',n(c.vault.balance),`entrou ${n(c.vault.today.in)} · saiu ${n(c.vault.today.out)} hoje`)}
        ${tile('firm','Empresa Brasil hoje',`${n(c.firm.today.sales)} venda(s)`,`Receita ${n(c.firm.today.gross)} · imposto ${n(c.firm.today.tax)}`,c.firm.today.sales?'up':'')}
        ${stat('Moedas criadas hoje',`+${compact(today?.created??0)}`,'Trabalho, bônus, estornos, administração','up')}
        ${stat('Moedas retiradas hoje',`−${compact(today?.destroyed??0)}`,'Compras no bar, skins, palco, aparelhos','down')}
      </div>
      ${card('Últimos acontecimentos',recent(c),{icon:'clock'})}
      <h4 class="eco-heading">Moedas dos jogadores</h4>`:''}
      <div class="admin-toolbar">${chips('days',PERIODS,days)}<small>Calculado ${new Date(d.generatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div>
      <div class="admin-stats">
        ${stat('Moedas em circulação',compact(s.total),`${n(s.wallets)} carteiras · ${n(s.holders)} com saldo`)}
        ${stat(`Inflação em ${d.days} dias`,pct(d.inflation.periodChange),d.inflation.dailyRate===null?'Sem base de comparação':`${pct(d.inflation.dailyRate,2)} ao dia`,(d.inflation.periodChange??0)>.1?'warn':'')}
        ${stat('Moedas criadas',`+${compact(d.inflation.created)}`,'Trabalho, bônus, estornos, administração','up')}
        ${stat('Moedas retiradas',`−${compact(d.inflation.destroyed)}`,'Compras no bar, skins, palco, aparelhos','down')}
        ${stat('Índice de preços',n(d.inflation.priceIndex,1),`100 = preços padrão · ${d.inflation.priceChanges} mudança(s) no período`)}
        ${stat('Giro das moedas',d.velocity===null?'—':`${n(d.velocity,2)}×`,`${n(d.activePlayers)} jogador(es) movimentaram moedas`)}
      </div>
      <p class="admin-diagnosis">${e(diagnosis(d))}</p>
      <div class="admin-grid">
        ${card('Moedas em circulação',`<div class="admin-chart-slot" data-chart="supply"></div>`,{icon:'coins'})}
        ${card('Criadas × retiradas por dia',`<div class="admin-legend"><span><i class="up"></i>Criadas</span><span><i class="down"></i>Retiradas</span></div><div class="admin-chart-slot" data-chart="flow"></div>`,{icon:'activity'})}
      </div>
      <div class="admin-grid">
        ${card('De onde vêm e para onde vão',d.sources.length?`<table class="admin-table admin-sources"><thead><tr><th>Origem</th><th>Criadas</th><th>Retiradas</th><th class="num">Mov.</th></tr></thead><tbody>
          ${d.sources.map(x=>`<tr><td>${e(LEDGER_SOURCES[x.source])}</td><td><span class="admin-bar up" style="--w:${x.created/maxSource*100}%"></span>${x.created?`+${n(x.created)}`:'—'}</td><td><span class="admin-bar down" style="--w:${x.destroyed/maxSource*100}%"></span>${x.destroyed?`−${n(x.destroyed)}`:'—'}</td><td class="num">${n(x.count)}</td></tr>`).join('')}</tbody></table>
          <p class="fine-print">Pix move moedas entre jogadores e não muda o total; por isso fica fora de criadas e retiradas.</p>`:empty('Nenhuma movimentação no período.'),{icon:'transfer'})}
        ${card('Distribuição',`<dl class="admin-rows">
          <div><dt>Saldo mediano</dt><dd>${n(s.median)} moedas</dd></div><div><dt>Saldo médio</dt><dd>${n(s.average,1)} moedas</dd></div>
          <div><dt>Com os 10% mais ricos</dt><dd>${pct(s.top10Share,0).replace('+','')} das moedas</dd></div>
          <div><dt>Desigualdade (Gini)</dt><dd>${n(s.gini,2)} · ${s.gini<.35?'baixa':s.gini<.6?'moderada':'alta'}</dd></div>
          <div><dt>Poder de compra</dt><dd>A carteira mediana paga ${n(d.purchasingPower.quantity)}× ${e(d.purchasingPower.item)}</dd></div></dl>
          <p class="fine-print">Gini vai de 0 (todos com o mesmo saldo) a 1 (uma carteira com tudo).</p>`,{icon:'users'})}
      </div>
      ${card('Maiores saldos',d.topHolders.length?`<ol class="admin-ranking">${d.topHolders.map(h=>`<li><button type="button" class="text-button" data-admin-go="players" data-go-player="${e(h.id)}">${e(h.name)}</button><span>${n(h.balance)} moedas · ${pct(s.total?h.balance/s.total:0,1).replace('+','')}</span></li>`).join('')}</ol>`:empty('Nenhuma carteira com saldo.'),{icon:'wallet',actions:goButton('players','Todos por saldo',{sort:'balance'})})}
      <details class="admin-details"><summary>Ver os números por dia</summary><table class="admin-table"><thead><tr><th>Dia</th><th class="num">Em circulação</th><th class="num">Criadas</th><th class="num">Retiradas</th><th class="num">Saldo do dia</th></tr></thead><tbody>
        ${[...d.series].reverse().map(x=>`<tr><td>${x.day.split('-').reverse().join('/')}</td><td class="num">${n(x.supply)}</td><td class="num up">+${n(x.created)}</td><td class="num down">−${n(x.destroyed)}</td><td class="num">${x.created-x.destroyed>=0?'+':'−'}${n(Math.abs(x.created-x.destroyed))}</td></tr>`).join('')}</tbody></table></details>
    </div>`);
    for(const slot of root.querySelectorAll<HTMLElement>('.admin-chart-slot')){
      const width=Math.max(280,Math.floor(slot.clientWidth||560));
      slot.innerHTML=slot.dataset.chart==='supply'?lineChart(d.series.map(x=>({day:x.day,value:x.supply})),width,'Moedas em circulação por dia'):flowChart(d.series,width);
    }
  }
  async function load():Promise<void> {
    const version=++generation;root.querySelector('.admin-economy')?.classList.add('refreshing');if(!data)render();
    try{
      // The city's vault and the company are a bonus: if they fail the players' economy still shows.
      const [result,cityResult]=await Promise.all([ctx.api<AdminEconomy>(`/admin/economy?days=${days}`),ctx.api<AdminCityEconomy>('/admin/economy/city?days=7&page=0&flow=all').catch(()=>undefined)]);
      if(disposed||version!==generation)return;data=result;city=cityResult;render();}
    catch(error){if(!disposed&&version===generation){root.querySelector('.admin-loading')?.remove();ctx.message(error instanceof Error?error.message:'Não foi possível calcular a economia.',true);}}
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    if(followGo(target,ctx.go))return;
    const chip=target.closest<HTMLElement>('[data-admin-chip="days"]');if(chip&&chip.dataset.value!==days){days=lastDays=chip.dataset.value!;void load();}
  };
  root.addEventListener('click',click);void load();
  return {destroy(){disposed=true;unhover();root.removeEventListener('click',click);}};
};
