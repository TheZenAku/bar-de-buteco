import {DEFAULT_FACTORY_BALANCE,DEFAULT_FACTORY_FINANCE,breakEvenPalletPrice,catalogProfits,settleSale,type EstimateRules,type FactoryFinance,type FactoryShipmentView} from '@bar/shared/factory';
import {SHIPMENT_LABEL,ago,badge,card,chips,compact,e,empty,n,redraw,reasonField,requestId,stat,uiIcon,type AdminCityEconomy,type FirmFlow,type SectionFactory,type WorldSnapshot} from './kit';
import {chartHover,lineChart} from './charts';
import {followGo,goButton} from './overview';

const PERIODS:ReadonlyArray<readonly [string,string]>=[['7','7 dias'],['30','30 dias'],['90','90 dias']];
let lastDays='30';
type NumberKey='palletPrice'|'taxPercent'|'employeeFee'|'rawMaltePrice'|'rawMixPrice'|'freightBase'|'freightPerKm'|'freightPerPallet'|'purchaseFreight'|'maxPalletsPerTruck'|'deliveryRadius'|'idlePay'|'idleEveryMin';
interface FieldDef {key:NumberKey;name:string;unit:string;hint:string;step?:string;min?:number;max?:number}
interface GroupDef {id:string;title:string;note:string;fields:readonly FieldDef[];/** Reads the tax the purchase carries (a line that is shown, not typed). */taxLine?:boolean}
/**
 * Every value that moves the firm's money, in the order an administrator thinks about it. The groups are drawn two to a row and the two of a row
 * have the same number of fields, so the page reads as a grid: sale and raw material, freight and dock/staff, then the owner.
 */
const GROUPS:readonly GroupDef[]=[
  {id:'sale',title:'Venda de paletes',note:'Acontece quando o caminhão sai da doca carregado de produto.',fields:[
    {key:'palletPrice',name:'Preço do palete de produto',unit:'moedas',hint:'O que a firma recebe por palete (18 sacos), antes do imposto e da taxa do funcionário.',max:1_000_000},
    {key:'taxPercent',name:'Imposto da cidade',unit:'%',hint:'Fatia de cada venda que vai para o cofre da cidade; também é cobrada por cima da matéria-prima.',step:'0.1',max:100},
    {key:'employeeFee',name:'Taxa do funcionário',unit:'moedas',hint:'Paga por carga a quem carregou o caminhão (no máximo o que sobra do imposto).',max:1_000_000},
  ]},
  {id:'raw',title:'Matéria-prima',note:'O dono compra com o saldo da empresa; o preço vai para o fornecedor e o imposto para o cofre.',taxLine:true,fields:[
    {key:'rawMaltePrice',name:'Palete de MALTE',unit:'moedas',hint:'Preço de um palete cheio (18 sacos) de malte, sem imposto.',max:1_000_000},
    {key:'rawMixPrice',name:'Palete de MIX',unit:'moedas',hint:'Preço de um palete cheio (18 sacos) de mix, sem imposto.',max:1_000_000},
  ]},
  {id:'freight',title:'Frete do motorista',note:'Pago ao motorista (dono do caminhão) quando a carga chega ao destino.',fields:[
    {key:'freightBase',name:'Base da entrega',unit:'moedas',hint:'Valor fixo de cada viagem de entrega de produto.',max:1_000_000},
    {key:'freightPerKm',name:'Por quilômetro',unit:'moedas/km',hint:'Somado conforme a distância até o endereço.',max:1_000_000},
    {key:'freightPerPallet',name:'Por palete',unit:'moedas',hint:'Somado por palete que o caminhão leva.',max:1_000_000},
    {key:'purchaseFreight',name:'Base da coleta',unit:'moedas',hint:'Valor fixo da viagem que busca matéria-prima no fornecedor.',max:1_000_000},
  ]},
  {id:'dock',title:'Doca e equipe',note:'Limites do caminhão e o salário de quem fica de plantão na fábrica.',fields:[
    {key:'maxPalletsPerTruck',name:'Paletes por caminhão',unit:'paletes',hint:'Máximo de 10 (é o que cabe no baú).',min:1,max:10},
    {key:'deliveryRadius',name:'Raio de chegada',unit:'m',hint:'Distância do ponto de entrega em que o caminhão parado conta como chegou.',step:'0.5',min:6,max:60},
    {key:'idlePay',name:'Salário de presença',unit:'moedas',hint:'Pago a quem está de serviço, com EPI, na fábrica e sem produção rodando. 0 desliga.',max:100_000},
    {key:'idleEveryMin',name:'Intervalo do salário',unit:'minutos',hint:'De quanto em quanto tempo o salário de presença é pago.',min:1,max:240},
  ]},
];
const KEYS=GROUPS.flatMap(group=>group.fields.map(field=>field.key));
const sameFinance=(a:FactoryFinance|undefined,b:FactoryFinance|undefined)=>!!a&&!!b&&a.ownerUserId===b.ownerUserId&&KEYS.every(key=>a[key]===b[key]);
const rulesOf=(fin:Pick<FactoryFinance,'rawMaltePrice'|'rawMixPrice'|'palletPrice'|'taxPercent'|'employeeFee'|'maxPalletsPerTruck'>):EstimateRules=>({
  rawMaltePrice:fin.rawMaltePrice,rawMixPrice:fin.rawMixPrice,palletPrice:fin.palletPrice,taxPercent:fin.taxPercent,employeeFee:fin.employeeFee,maxPalletsPerTruck:fin.maxPalletsPerTruck,
  bagKg:DEFAULT_FACTORY_BALANCE.bagKg,yieldMin:DEFAULT_FACTORY_BALANCE.recipe.yieldMin,yieldMax:DEFAULT_FACTORY_BALANCE.recipe.yieldMax,
});
const signedN=(value:number)=>`${value>0?'+':value<0?'−':''}${n(Math.abs(value))}`;
/** The rows of the sale simulation: what 1, 2, 5 and a full truck of pallets would be worth and how it divides. */
const simRows=(fin:Pick<FactoryFinance,'palletPrice'|'taxPercent'|'employeeFee'|'maxPalletsPerTruck'>)=>[...new Set([1,2,5,fin.maxPalletsPerTruck])].filter(count=>count<=fin.maxPalletsPerTruck).sort((a,b)=>a-b).map(count=>{
  const split=settleSale(count*fin.palletPrice,fin);return `<tr><td>${count}</td><td class="num">${n(split.gross)}</td><td class="num">${n(split.tax)}</td><td class="num">${n(split.staff)}</td><td class="num">${n(split.owner)}</td></tr>`;
}).join('');
/** One row per product of the catalog: a typical order (the middle of its batches), what it costs, what it sells for and what is left. */
const profitRows=(rules:EstimateRules)=>catalogProfits(rules).map(({product,batches,estimate})=>{
  const profit=estimate.profit.expected;
  return `<tr><td>${e(product.name)}<small>${product.malteBags} de malte + ${product.mixBags} de mix por lote</small></td><td class="num">${batches}</td><td class="num">${n(estimate.raw.total)}</td><td class="num">${n(estimate.revenue.net)}</td><td class="num ${profit<0?'down':'up'}">${signedN(profit)}</td></tr>`;
}).join('');
/** Says in words whether the values make the orders pay, and from which pallet price they would. */
function verdict(rules:EstimateRules):{tone:'ok'|'warn';html:string;breakEven:number|null} {
  const rows=catalogProfits(rules),losing=rows.filter(row=>row.estimate.profit.expected<0).length,breakEven=breakEvenPalletPrice(rules);
  if(!losing)return {tone:'ok',breakEven,html:`<b>Todas as ${rows.length} receitas dão lucro</b> com estes valores. O menor lucro de uma ordem típica é ${n(Math.min(...rows.map(row=>row.estimate.profit.expected)))} moedas.`};
  const fix=breakEven===null?'Nem com o preço máximo do palete elas fecham: baixe o preço da matéria-prima.':`O menor preço do palete em que nenhuma dá prejuízo é <b>${n(breakEven)} moedas</b> (com o imposto e a matéria-prima acima).`;
  return {tone:'warn',breakEven,html:`<b>${losing} de ${rows.length} receitas dão prejuízo</b> com estes valores: a empresa gasta mais em matéria-prima do que ganha vendendo o produto. ${fix}`};
}
const books:ReadonlyArray<readonly [string,keyof FirmFlow]>=[['Vendas','sales'],['Paletes vendidos','pallets'],['Receita bruta','gross'],['Imposto ao cofre','tax'],['Pago a funcionários','staff'],['Para a carteira da empresa','owner'],['Fretes pagos','freight']];

/**
 * Empresa Brasil, the money side: what sold today and over the period, the values that decide it (palete price, raw material, imposto, freight,
 * presence pay, owner), what each recipe earns with them, what a load would pay and the trips. Running the plant itself (tanks, stock, dock) stays in the
 * Fábrica section; the wallet, owners and passwords are in the "Donos e caixa" tab.
 */
export const firmTab:SectionFactory=(root,ctx)=>{
  let days=lastDays,data:AdminCityEconomy|undefined,disposed=false,generation=0,pending:string|undefined,world:WorldSnapshot|null=ctx.world();
  const unhover=chartHover(root);
  const players=()=>world?.players??[];

  function field({key,name,unit,hint,step='1',min=0,max}:FieldDef,fin:FactoryFinance):string {
    return `<label class="eco-field" data-eco-field><span class="eco-label"><b>${name}</b><small>${hint}</small></span><span class="eco-input"><input name="${key}" type="number" inputmode="decimal" min="${min}" ${max===undefined?'':`max="${max}"`} step="${step}" value="${fin[key]}" data-fin-input data-default="${DEFAULT_FACTORY_FINANCE[key]}" aria-label="${name}"><em>${unit}</em></span></label>`;
  }
  function group(def:GroupDef,fin:FactoryFinance):string {
    const tax=def.taxLine?`<div class="eco-field is-static"><span class="eco-label"><b>Imposto sobre a compra</b><small>O mesmo imposto da venda (em Venda de paletes), cobrado por cima do preço do palete.</small></span><span class="eco-input"><output data-fin-tax>${n(fin.taxPercent,1)}</output><em>%</em></span></div>`:'';
    return `<section class="eco-group" aria-label="${def.title}"><header class="eco-group-head"><b>${def.title}</b><small>${def.note}</small></header>${def.fields.map(item=>field(item,fin)).join('')}${tax}</section>`;
  }
  function tripRow(t:FactoryShipmentView):string {
    const live=['loaded','in_transit','to_supplier','returning'].includes(t.status);
    return `<tr><td>${t.kind==='sale'?badge('venda','mint'):badge('coleta','cyan')}<small>${e(t.plate||'—')}${t.driverName?` · ${e(t.driverName)}`:''}</small></td><td>${t.pallets}× ${t.material==='PRODUTO'?'Produto':e(t.material)}</td><td>${badge(e(SHIPMENT_LABEL[t.status]??t.status),live?'magenta':t.status==='delivered'?'mint':'muted')}</td><td class="num">${t.gross?n(t.gross):'—'}</td><td class="num">${t.freight?n(t.freight):'—'}</td><td>${ago(Date.parse(t.createdAt))}</td></tr>`;
  }
  function render():void {
    if(disposed)return;
    if(!data){root.querySelector('.eco-firm')?.remove();if(!root.querySelector('.admin-loading'))root.insertAdjacentHTML('afterbegin','<p class="admin-loading">Abrindo os livros da firma…</p>');return;}
    const f=data.firm,fin={...DEFAULT_FACTORY_FINANCE,...f.finance},t=f.today,trips=[...f.trips.active,...f.trips.latest],rules=rulesOf(fin),say=verdict(rules);
    root.querySelector('.admin-loading')?.remove();root.querySelector('.eco-firm')?.remove();
    root.insertAdjacentHTML('afterbegin',`<div class="eco-firm">
      <div class="admin-toolbar">${chips('days',PERIODS,days)}<small>Atualizado ${new Date(data.generatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · primeiro dono: <b>${e(f.ownerName??'a conta dona do jogo (padrão)')}</b> · o que sobra das vendas vai para a carteira da empresa (aba Donos e caixa)</small></div>
      <div class="admin-stats">
        ${stat('Vendas hoje',n(t.sales),`${n(t.pallets)} palete(s)`)}
        ${stat('Receita bruta hoje',`+${compact(t.gross)}`,'Moedas criadas pelas vendas','up')}
        ${stat('Imposto ao cofre hoje',compact(t.tax),`${n(fin.taxPercent,1)}% de cada venda`)}
        ${stat('Para a carteira hoje',compact(t.owner),`Funcionários ${n(t.staff)} · fretes ${n(t.freight)}`)}
      </div>
      <div class="admin-grid">
        ${card('Resultado',`<table class="admin-table eco-books"><thead><tr><th></th><th class="num">Hoje</th><th class="num">${data.days} dias</th><th class="num">Desde o início</th></tr></thead><tbody>
          ${books.map(([name,key])=>`<tr><td>${name}</td><td class="num">${n(t[key])}</td><td class="num">${n(f.period[key])}</td><td class="num">${n(f.total[key])}</td></tr>`).join('')}</tbody></table>
          <p class="fine-print">Vendas contam no dia em que o caminhão saiu da doca; fretes, no dia da chegada. “Desde o início” só conta vendas pagas.</p>`,{icon:'receipt'})}
        ${card('Receita bruta por dia',`<div class="admin-chart-slot" data-chart="gross"></div>`,{icon:'trendingUp'})}
      </div>
      ${card('Valores da Empresa Brasil',`<form class="eco-form" data-keep="firm" data-finance>
          <p class="eco-intro">Tudo o que muda o dinheiro da fábrica está aqui. Mude os campos, veja <b>“Lucro por receita”</b> se atualizar enquanto você digita, escreva o motivo e aplique. Os valores valem a partir da próxima venda, compra ou pagamento; o que já foi pago não muda.</p>
          <div class="eco-groups">${GROUPS.map(def=>group(def,fin)).join('')}
            <section class="eco-group wide" aria-label="Primeiro dono"><header class="eco-group-head"><b>Primeiro dono</b><small>Só vale enquanto a empresa não tem nenhum dono (depois disso quem manda são os cargos da aba Donos e caixa). Vazio: a conta dona do jogo.</small></header>
              <label class="eco-field" data-eco-field><span class="eco-label"><b>Jogador</b><small>Escolha pelo nome (quem está conectado aparece na lista) ou digite o id.</small></span><span class="eco-input"><input name="ownerUserId" list="eco-players" value="${e(f.ownerName??'')}" data-default="" placeholder="nome ou id do jogador" data-fin-input autocomplete="off" aria-label="Primeiro dono da empresa"><em></em></span></label></section></div>
          <datalist id="eco-players">${players().map(player=>`<option value="${e(player.name)}"></option>`).join('')}</datalist>
          <section class="eco-profit" aria-label="Lucro por receita"><header class="eco-group-head"><b>Lucro por receita</b><small>O que uma ordem de produção típica (a quantidade média de lotes de cada produto) rende com os valores digitados acima: matéria-prima com imposto contra a venda já sem imposto e sem a taxa do funcionário.</small></header>
            <div class="eco-verdict ${say.tone}" data-fin-verdict>${say.html}</div>
            <div class="admin-scroll"><table class="admin-table eco-profit-table"><thead><tr><th>Produto</th><th class="num">Lotes</th><th class="num">Matéria-prima (com imposto)</th><th class="num">Venda líquida</th><th class="num">Lucro</th></tr></thead><tbody data-fin-profit>${profitRows(rules)}</tbody></table></div>
            <div class="admin-confirm-buttons"><button type="button" class="mini-button" data-fin-breakeven ${say.breakEven===null?'disabled':''}>${uiIcon('calculator')}Usar o menor preço sem prejuízo</button></div></section>
          ${reasonField('Motivo da alteração','Ex.: palete sobe para 50.000 porque a matéria-prima encareceu')}
          <div class="admin-confirm-buttons"><button class="button primary" type="submit" disabled data-fin-submit>Aplicar valores</button><button type="button" class="mini-button" data-fin-reset>${uiIcon('reset')}Preencher com o padrão</button></div>
          <p class="fine-print">Os campos alterados ficam destacados. “Preencher com o padrão” só preenche: nada vale até você aplicar.</p></form>`,{icon:'sliders',className:'eco-values'})}
      ${card('Quanto cada carga rende',`<div class="admin-scroll"><table class="admin-table eco-sim"><thead><tr><th>Paletes</th><th class="num">Venda</th><th class="num">Imposto</th><th class="num">Funcionário</th><th class="num">Empresa</th></tr></thead><tbody data-fin-sim>${simRows(fin)}</tbody></table></div>
        <p class="fine-print">Imposto = venda × %; funcionário = taxa fixa (no máximo o que sobra do imposto); o resto vai para a carteira da empresa (os donos decidem o que fazer com ele). Muda enquanto você digita.</p>`,{icon:'calculator'})}
      ${card(`Cargas · ${f.trips.active.length} em andamento`,trips.length?`<div class="admin-scroll"><table class="admin-table eco-trips"><thead><tr><th>Tipo</th><th>Carga</th><th>Situação</th><th class="num">Venda</th><th class="num">Frete</th><th>Criada</th></tr></thead><tbody>${trips.map(tripRow).join('')}</tbody></table></div>`:empty('Nenhuma carga ainda.'),
        {icon:'truck',actions:goButton('factory','Operar na Fábrica',{tab:'dock'})})}
    </div>`);
    for(const slot of root.querySelectorAll<HTMLElement>('.admin-chart-slot'))slot.innerHTML=lineChart(f.series.map(x=>({day:x.day,value:x.gross})),Math.max(280,Math.floor(slot.clientWidth||520)),'Receita bruta das vendas por dia',300);
    sync();
  }
  /** What the form holds now, clamped to what the world accepts, as the finance the tables below are drawn from. */
  function typed(form:HTMLFormElement):FactoryFinance {
    const values=new FormData(form),read=(key:NumberKey)=>{const raw=Number(values.get(key));return Number.isFinite(raw)?Math.max(0,raw):DEFAULT_FACTORY_FINANCE[key];};
    return {...DEFAULT_FACTORY_FINANCE,...Object.fromEntries(KEYS.map(key=>[key,read(key)])),taxPercent:Math.min(100,read('taxPercent')),maxPalletsPerTruck:Math.max(1,Math.min(10,read('maxPalletsPerTruck')||1))};
  }
  /** Highlights the fields that differ from the saved values, enables Aplicar when something changed and redraws what the typed values would do. */
  function sync():void {
    const form=root.querySelector<HTMLFormElement>('[data-finance]');if(!form)return;
    let changed=0;
    for(const input of form.querySelectorAll<HTMLInputElement>('[data-fin-input]')){const differs=input.value!==input.defaultValue;input.closest('[data-eco-field]')?.classList.toggle('changed',differs);if(differs)changed++;}
    const submit=form.querySelector<HTMLButtonElement>('[data-fin-submit]');if(submit)submit.disabled=!changed;
    const fin=typed(form),rules=rulesOf(fin),say=verdict(rules);
    const set=(selector:string,html:string)=>{const target=root.querySelector<HTMLElement>(selector);if(target)target.innerHTML=html;};
    set('[data-fin-sim]',simRows(fin));set('[data-fin-profit]',profitRows(rules));set('[data-fin-tax]',n(fin.taxPercent,1));
    const box=root.querySelector<HTMLElement>('[data-fin-verdict]');if(box){box.className=`eco-verdict ${say.tone}`;box.innerHTML=say.html;}
    const button=root.querySelector<HTMLButtonElement>('[data-fin-breakeven]');if(button){button.disabled=say.breakEven===null;button.dataset.price=String(say.breakEven??'');}
  }
  async function load():Promise<void> {
    const version=++generation;root.querySelector('.eco-firm')?.classList.add('refreshing');if(!data)render();
    try{
      const result=await ctx.api<AdminCityEconomy>(`/admin/economy/city?days=${days}&page=0&flow=all`);if(disposed||version!==generation)return;
      const before=data?.firm.finance;data=result;redraw(root,render);
      if(pending&&!sameFinance(before,result.firm.finance)){ctx.message(pending);pending=undefined;}
    }catch(error){if(!disposed&&version===generation){root.querySelector('.admin-loading')?.remove();root.querySelector('.eco-firm')?.classList.remove('refreshing');ctx.message(error instanceof Error?error.message:'Não foi possível abrir os livros da firma.',true);}}
  }
  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    if(followGo(target,ctx.go))return;
    const chip=target.closest<HTMLElement>('[data-admin-chip="days"]');if(chip&&chip.dataset.value!==days){days=lastDays=chip.dataset.value!;void load();return;}
    if(target.closest('[data-fin-reset]')){
      for(const input of root.querySelectorAll<HTMLInputElement>('[data-fin-input]'))input.value=input.dataset.default??'';
      sync();ctx.message('Campos preenchidos com o padrão. Confira, escreva o motivo e aplique.');return;
    }
    const best=target.closest<HTMLButtonElement>('[data-fin-breakeven]');
    if(best){
      const price=Number(best.dataset.price),input=root.querySelector<HTMLInputElement>('[name="palletPrice"]');
      if(input&&Number.isFinite(price)&&price>0){input.value=String(price);sync();ctx.message(`Preço do palete preenchido com ${n(price)} moedas. Confira, escreva o motivo e aplique.`);}
    }
  };
  const input=(event:Event)=>{if((event.target as HTMLElement).matches('[data-fin-input]'))sync();};
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;if(!form.matches('[data-finance]')||!data)return;
    event.preventDefault();event.stopPropagation();
    if(!form.reportValidity())return;
    const input=new FormData(form),reason=String(input.get('reason')??'').trim();if(reason.length<3)return;
    if(!ctx.world()){ctx.message('O mundo não respondeu ainda: espere alguns segundos e tente de novo.',true);return;}
    // Everything the form shows goes at once; the owner may be typed as a name (looked up among the people the world knows) or as an id.
    const patch:Record<string,unknown>={};
    for(const key of KEYS)patch[key]=Number(input.get(key));
    const text=String(input.get('ownerUserId')??'').trim(),known=players().find(player=>player.name.toLowerCase()===text.toLowerCase()||player.id===text),current=data.firm.finance.ownerUserId??'';
    // Unchanged text keeps the owner as it is (the box shows a name, not the stored id).
    patch.ownerUserId=!text?'':text===(data.firm.ownerName??'')?current:known?.id??text;
    ctx.send('admin.factory.finance',{requestId:requestId(),reason,patch});
    pending='Valores da Empresa Brasil atualizados. Valem a partir de agora.';ctx.message('Pedido enviado ao mundo…');
    window.setTimeout(()=>{if(pending&&!disposed)void load().then(()=>{if(pending&&!disposed){ctx.message('Nada mudou: o mundo pode ter recusado os valores (confira o dono e os limites).',true);pending=undefined;}});},4000);
  };
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('submit',submit);void load();
  return {
    world(snapshot:WorldSnapshot){
      world=snapshot;const finance=snapshot.factory?.finance;
      if(data&&finance&&!sameFinance(finance,data.firm.finance)&&Date.now()-lastWorldReload>1500){lastWorldReload=Date.now();void load();}
    },
    destroy(){disposed=true;unhover();root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('submit',submit);},
  };
};
let lastWorldReload=0;
