import {BAGS_PER_PALLET,COMPANY_PASSWORD,PRODUCTION_CATALOG,type CompanyMemberView,type CompanyResult,type CompanyView,type ProductionEstimate,type ProductionOrder} from '@bar/shared/factory';
import {escape as e} from '../api';
import {uiIcon} from '../ui-icons';

export type CompanySection='resumo'|'dinheiro'|'materia'|'equipe'|'producao';
export interface CompanyHooks {
  send:(type:string,payload:unknown)=>void;
  toast:(text:string,error?:boolean)=>void;
  /** The tab's content changed and the profile window should draw it again. */
  redraw:()=>void;
}
const SECTIONS:ReadonlyArray<readonly [CompanySection,string,string]>=[['resumo','Resumo','dashboard'],['dinheiro','Dinheiro','wallet'],['materia','Matéria-prima','package'],['equipe','Equipe','users'],['producao','Produção','clipboard']];
const rid=()=>crypto.randomUUID();
const num=(value:number)=>Math.round(value).toLocaleString('pt-BR');
const coins=(value:number)=>`<b class="co-money">${num(value)}</b>${uiIcon('coins')}`;
const signed=(value:number)=>`<b class="co-money ${value>=0?'up':'down'}">${value>=0?'+':'−'}${num(Math.abs(value))}</b>${uiIcon('coins')}`;
const when=(iso:string)=>new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const ROLE_LABEL:Record<CompanyMemberView['role'],string>={owner:'Dono',manager:'Gerente',employee:'Funcionário'};
const MATERIAL_LABEL={MALTE:'Malte',MIX:'Mix'} as const;
/** Digits only ("10.000" and "10000" are the same amount). */
const amountOf=(text:string)=>Number(text.replace(/\D/g,''))||0;

/**
 * The profile's "Gerenciar empresa" tab (docs/sistemas/empresa.md): the firm's wallet, raw-material purchases, people and production orders for owners
 * and managers. It only shows what the room sent (`company.state`) and asks for changes (`company.*`); who may do what is the server's call.
 */
export function createCompanyTab(hooks:CompanyHooks){
  /** undefined: not answered yet; null: this player has no role in the firm. */
  let state:CompanyView|null|undefined;
  let section:CompanySection='resumo';
  let message:{ok:boolean;text:string}|null=null;
  let pending=false,pendingTimer:ReturnType<typeof setTimeout>|undefined;
  let search:{text:string;players:Array<{userId:string;name:string}>}={text:'',players:[]};
  let searchTimer:ReturnType<typeof setTimeout>|undefined;

  const ask=(type:string,payload:Record<string,unknown>)=>{
    pending=true;message=null;clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{pending=false;hooks.redraw();},6000);
    hooks.send(type,payload);hooks.redraw();
  };
  const busy=()=>pending?' disabled':'';

  // ---- sections ----
  function summary(v:CompanyView):string {
    const active=v.production.active,pallets=(bags:number)=>(bags/BAGS_PER_PALLET).toLocaleString('pt-BR',{maximumFractionDigits:1});
    const status=active?`<b>${e(active.name)}</b> · ${active.status==='running'?`em andamento, lote ${Math.min(active.batchesStarted,active.batches)}/${active.batches}`:'aprovada, esperando um funcionário iniciar'}`:v.production.offers.length?'Há opções de ordem esperando escolha.':'Nenhuma ordem de produção: sem ordem, a fábrica não produz.';
    return `<div class="co-balance"><span>${uiIcon('landmark')} Saldo da empresa</span><strong>${coins(v.balance)}</strong><small>Toda venda de produto entra aqui. Os donos decidem o que fazer com o dinheiro.</small></div>
      <div class="co-grid">
        <div class="co-stat"><small>Vendas</small><b>${num(v.totals.sales)}</b></div>
        <div class="co-stat"><small>Receita da empresa</small><b>${num(v.totals.income)}</b></div>
        <div class="co-stat"><small>Gasto em matéria-prima</small><b>${num(v.totals.spent)}</b></div>
        <div class="co-stat"><small>Em serviço agora</small><b>${num(v.plant.operators)}</b></div>
      </div>
      <h4>Estoque da fábrica</h4>
      <div class="co-stock">${(['MALTE','MIX','PRODUTO'] as const).map(material=>`<div class="co-stat"><small>${material==='PRODUTO'?'Produto pronto':MATERIAL_LABEL[material]}</small><b>${num(v.stock[material])} sacos</b><small>${pallets(v.stock[material])} palete(s)</small></div>`).join('')}</div>
      <h4>Produção</h4><p class="pf-lead">${status}</p>
      ${v.plant.dirtRequired?`<p class="pf-hint error">${uiIcon('drop')} A última ordem terminou: faltam ${v.plant.pendingCleaning.length} lugar(es) para limpar antes da próxima.</p>`:''}
      <p class="pf-hint">Funcionário em serviço com EPI dentro da fábrica, sem produção rodando, recebe ${num(v.idlePay.amount)} moedas a cada ${v.idlePay.everyS/60} minutos.</p>
      <h4>Últimos movimentos</h4>${ledger(v,6)}`;
  }
  function ledger(v:CompanyView,limit:number):string {
    if(!v.ledger.length)return '<p class="pf-empty">Ainda sem movimentos.</p>';
    return `<ul class="co-ledger">${v.ledger.slice(0,limit).map(row=>`<li><span><b>${e(row.reason)}</b><small>${when(row.at)}${row.actorName?` · ${e(row.actorName)}`:''}</small></span><i>${signed(row.amount)}</i></li>`).join('')}</ul>`;
  }
  const secretField=(v:CompanyView,name:string)=>v.hasPassword?`<label class="co-field"><span>${uiIcon('lock')} Sua senha da empresa</span><input type="password" name="${name}" autocomplete="off" maxlength="${COMPANY_PASSWORD.max}" placeholder="Senha"></label>`:'';
  function money(v:CompanyView):string {
    if(v.role!=='owner')return '<p class="pf-empty">Só os donos mexem no dinheiro da empresa.</p>';
    return `<div class="co-balance"><span>${uiIcon('landmark')} Saldo da empresa</span><strong>${coins(v.balance)}</strong></div>
      <section class="co-card"><h4>${uiIcon('transfer')} Transferir para mim</h4>
        <label class="co-field"><span>Valor</span><input name="co-amount" inputmode="numeric" autocomplete="off" placeholder="0"></label>
        ${secretField(v,'co-pass')}
        <div class="co-row"><button type="button" class="button primary" data-co="transfer"${busy()}>Transferir</button><button type="button" class="button secondary" data-co="transfer-all"${busy()}${v.balance?'':' disabled'}>Tudo</button><button type="button" class="button secondary" data-co="deposit"${busy()}>Depositar (da minha carteira)</button></div>
        <p class="pf-hint">A transferência vai para a sua carteira; depositar faz o caminho contrário, para a empresa comprar matéria-prima.</p></section>
      <section class="co-card"><h4>${uiIcon('key')} Senha da empresa</h4>
        <p class="pf-hint">${v.hasPassword?'Você tem uma senha: ela é pedida em toda transferência e compra de matéria-prima.':'Defina uma senha para proteger as suas transferências e compras. Cada dono tem a sua; a administração pode removê-la.'}</p>
        ${v.hasPassword?`<label class="co-field"><span>Senha atual</span><input type="password" name="co-cur" autocomplete="off" maxlength="${COMPANY_PASSWORD.max}"></label>`:''}
        <label class="co-field"><span>${v.hasPassword?'Nova senha':'Senha'} (${COMPANY_PASSWORD.min} a ${COMPANY_PASSWORD.max} caracteres)</span><input type="password" name="co-new" autocomplete="new-password" maxlength="${COMPANY_PASSWORD.max}"></label>
        <div class="co-row"><button type="button" class="button primary" data-co="password-set"${busy()}>${v.hasPassword?'Trocar senha':'Definir senha'}</button>${v.hasPassword?`<button type="button" class="button secondary" data-co="password-clear"${busy()}>Remover senha</button>`:''}</div></section>
      <h4>Extrato</h4>${ledger(v,30)}`;
  }
  function materials(v:CompanyView):string {
    const tax=v.prices.taxPercent,owner=v.role==='owner';
    const card=(material:'MALTE'|'MIX')=>{
      const base=v.prices[material],taxValue=Math.round(base*tax/100),room=material==='MALTE'?v.stock.roomMALTE:v.stock.roomMIX;
      return `<section class="co-card"><h4>${MATERIAL_LABEL[material]}</h4>
        <p class="pf-lead">Palete cheio (${BAGS_PER_PALLET} sacos): ${coins(base)} + imposto ${tax}% (${num(taxValue)}) = <b>${num(base+taxValue)}</b>${uiIcon('coins')}</p>
        <p class="pf-hint">No estoque: ${num(v.stock[material])} sacos · cabem mais ${num(room)} sacos nas prateleiras.</p>
        ${owner?`<div class="co-row">${[1,2,4].map(count=>`<button type="button" class="button secondary" data-co="buy" data-material="${material}" data-pallets="${count}"${busy()}${v.balance<(base+taxValue)*count||room<count*BAGS_PER_PALLET?' disabled':''}>${count} palete${count>1?'s':''}<small>${num((base+taxValue)*count)}</small></button>`).join('')}</div>`:''}</section>`;
    };
    const live=v.orders.filter(order=>order.status==='open'||order.status==='accepted');
    return `<div class="co-balance"><span>${uiIcon('landmark')} Saldo da empresa</span><strong>${coins(v.balance)}</strong></div>
      ${owner?'':'<p class="pf-hint">Só os donos compram matéria-prima.</p>'}
      ${owner?secretField(v,'co-pass-buy'):''}
      <div class="co-cols">${card('MALTE')}${card('MIX')}</div>
      <p class="pf-hint">O imposto vai para o cofre da cidade; o resto vai para o fornecedor. A carga chega por um motorista de caminhão (celular, app HighCargo) ou, se ninguém pegar, o motorista do fornecedor entrega em até 30 minutos.</p>
      <h4>Pedidos</h4>${v.orders.length?`<ul class="co-ledger">${v.orders.map(order=>`<li><span><b>${order.pallets} palete(s) de ${MATERIAL_LABEL[order.material]}</b><small>${when(order.createdAt)} · ${({open:'esperando motorista',accepted:'a caminho',completed:'entregue',cancelled:'cancelado',expired:'expirado'} as Record<string,string>)[order.status]??e(order.status)}</small></span><i>${coins(order.base+order.tax)}${owner&&order.cancellable?`<button type="button" class="pf-icon" data-co="cancel-order" data-id="${e(order.id)}" aria-label="Cancelar pedido e receber o estorno" title="Cancelar e estornar"${busy()}>${uiIcon('close')}</button>`:''}</i></li>`).join('')}</ul>`:'<p class="pf-empty">Nenhum pedido ainda.</p>'}${live.length?'':''}`;
  }
  function team(v:CompanyView):string {
    const owner=v.role==='owner';
    const row=(member:CompanyMemberView)=>{
      const canFire=member.role==='employee'||(member.role==='manager'&&owner);
      return `<li><span><b>${e(member.name)}</b><small><em class="co-role ${member.role}">${ROLE_LABEL[member.role]}</em>${member.onShift?' · em serviço':''}${member.hasPassword!==undefined?` · ${member.hasPassword?'com senha':'sem senha'}`:''}</small></span><i>
        ${owner&&member.role!=='owner'?`<button type="button" class="mini-button" data-co="manager" data-user="${e(member.userId)}" data-on="${member.role==='manager'?'0':'1'}"${busy()}>${member.role==='manager'?'Tirar gerência':'Nomear gerente'}</button>`:''}
        ${canFire?`<button type="button" class="mini-button danger" data-co="dismiss" data-user="${e(member.userId)}" data-name="${e(member.name)}"${busy()}>${uiIcon('trash')}Demitir</button>`:''}</i></li>`;
    };
    return `<h4>Candidatos <small>${v.applicants.length}</small></h4>
      ${v.applicants.length?`<ul class="co-ledger">${v.applicants.map(person=>`<li><span><b>${e(person.name)}</b><small>candidatou-se em ${when(person.appliedAt)}</small></span><i><button type="button" class="mini-button" data-co="admit" data-user="${e(person.userId)}"${busy()}>${uiIcon('userCheck')}Admitir</button><button type="button" class="mini-button" data-co="reject" data-user="${e(person.userId)}"${busy()}>Recusar</button></i></li>`).join('')}</ul>`:'<p class="pf-hint">Ninguém esperando. Quem quer trabalhar se candidata em Perfil → Meu emprego.</p>'}
      <section class="co-card"><h4>${uiIcon('userPlus')} Admitir por nome</h4>
        <label class="co-field"><span>Nome do jogador</span><input name="co-search" autocomplete="off" maxlength="40" value="${e(search.text)}" placeholder="Digite ao menos 2 letras"></label>
        ${search.players.length?`<ul class="co-ledger">${search.players.map(person=>`<li><span><b>${e(person.name)}</b></span><i><button type="button" class="mini-button" data-co="admit" data-user="${e(person.userId)}"${busy()}>${uiIcon('userCheck')}Admitir</button></i></li>`).join('')}</ul>`:search.text.trim().length>=2?'<p class="pf-hint">Ninguém encontrado (quem já trabalha aqui não aparece).</p>':''}</section>
      <h4>Equipe <small>${v.members.length}</small></h4><ul class="co-ledger">${v.members.map(row).join('')}</ul>
      <p class="pf-hint">Gerentes admitem, demitem e escolhem a ordem de produção, mas não mexem no dinheiro. Só a administração tira um dono.</p>`;
  }
  function estimate(order:ProductionOrder,est:ProductionEstimate,v:CompanyView):string {
    const needMalte=est.raw.malteBags,needMix=est.raw.mixBags;
    return `<dl class="co-est">
      <div><dt>Produto previsto</dt><dd>≈ ${num(est.bags.expected)} sacos <small>(${est.pallets.toLocaleString('pt-BR',{maximumFractionDigits:1})} paletes; de ${num(est.bags.min)} a ${num(est.bags.max)})</small></dd></div>
      <div><dt>Matéria-prima</dt><dd>${needMalte} MALTE + ${needMix} MIX <small>= ${num(est.raw.total)} moedas com imposto</small></dd></div>
      <div><dt>No estoque agora</dt><dd class="${v.stock.MALTE>=needMalte&&v.stock.MIX>=needMix?'ok':'warn'}">${num(v.stock.MALTE)} MALTE · ${num(v.stock.MIX)} MIX</dd></div>
      <div><dt>Receita líquida</dt><dd>${coins(est.revenue.net)} <small>(bruto ${num(est.revenue.gross)}, imposto ${num(est.revenue.saleTax)}, funcionário ${num(est.revenue.staffFees)})</small></dd></div>
      <div class="co-profit"><dt>Lucro estimado</dt><dd>${signed(est.profit.expected)} <small>(de ${num(est.profit.min)} a ${num(est.profit.max)})</small></dd></div></dl>`;
  }
  function production(v:CompanyView):string {
    const board=v.production,active=board.active;
    const recipe=(order:ProductionOrder)=>`${order.batches} lote${order.batches>1?'s':''} · ${order.malteBags} MALTE + ${order.mixBags} MIX por lote`;
    let html='';
    if(active){
      const est=board.estimates[active.id];
      html+=`<section class="co-card active"><h4>${uiIcon('clipboard')} Ordem em andamento: ${e(active.name)}</h4>
        <p class="pf-lead">${recipe(active)}. ${active.status==='running'?`Lote ${Math.min(active.batchesStarted,active.batches)}/${active.batches} iniciado, ${active.batchesDone} concluído(s), ${active.bags} saco(s) ensacado(s).`:`Aprovada por ${e(active.approvedByName)}: ela aparece no painel dos funcionários, que a iniciam na fábrica.`}</p>
        ${est?estimate(active,est,v):''}
        <div class="co-row">${active.status==='approved'?`<button type="button" class="button secondary" data-co="op-cancel"${busy()}>Cancelar ordem</button>`:`<button type="button" class="button secondary" data-co="op-close"${busy()}>Encerrar ordem</button>`}</div>
        ${active.status==='running'?'<p class="pf-hint">Encerrar só é possível com os tanques e o secador vazios; a fábrica então precisa ser limpa.</p>':''}</section>`;
    }else if(board.offers.length){
      html+=`<p class="pf-lead">Escolha a ordem que a fábrica vai produzir. O lucro é uma estimativa com os preços de hoje.</p>
        <div class="co-ops">${board.offers.map(order=>`<section class="co-card"><h4>${e(order.name)}</h4><p class="pf-hint">${recipe(order)}</p>${board.estimates[order.id]?estimate(order,board.estimates[order.id]!,v):''}
          <button type="button" class="button primary full" data-co="op-approve" data-id="${e(order.id)}"${busy()}>${uiIcon('check')}Aprovar esta ordem</button></section>`).join('')}</div>
        ${v.role==='owner'?`<button type="button" class="button secondary" data-co="op-draw"${busy()}>${uiIcon('refresh')}Sortear outras opções</button>`:''}`;
    }else{
      html+=`<p class="pf-lead">Sem ordem de produção a fábrica fica parada. ${v.role==='owner'?'Crie as opções: o sistema sorteia três do catálogo e você (ou um gerente) escolhe uma.':'O dono precisa criar as opções para você escolher uma.'}</p>
        ${v.role==='owner'?`<button type="button" class="button primary full" data-co="op-draw"${busy()}>${uiIcon('plus')}Criar ordem de produção</button>`:''}
        <p class="pf-hint">${PRODUCTION_CATALOG.length} produtos no catálogo. Depois de escolhida, os funcionários iniciam a ordem no painel da fábrica; ao final, tudo precisa ser limpo antes da próxima.</p>`;
    }
    if(v.plant.dirtRequired)html+=`<p class="pf-hint error">${uiIcon('drop')} Limpeza pendente (${v.plant.pendingCleaning.length} lugar(es)): a próxima ordem só começa com a fábrica limpa.</p>`;
    if(board.history.length)html+=`<h4>Últimas ordens</h4><ul class="co-ledger">${[...board.history].reverse().slice(0,5).map(item=>`<li><span><b>${e(item.name)}</b><small>${when(new Date(item.at).toISOString())} · ${({completed:'concluída',cancelled:'cancelada',closed:'encerrada'})[item.result]} · ${item.batchesDone}/${item.batches} lotes</small></span><i>${num(item.bags)} sacos</i></li>`).join('')}</ul>`;
    return html;
  }

  // ---- the tab ----
  function html():string {
    if(state===undefined)return '<p class="pf-empty"><span class="loader" aria-hidden="true"></span></p>';
    if(!state)return '<p class="pf-empty">Você não é dono nem gerente da empresa.</p>';
    const v=state;
    const nav=`<nav class="co-nav" role="tablist" aria-label="Seções da empresa">${SECTIONS.map(([id,label,icon])=>`<button type="button" role="tab" data-co="section" data-section="${id}" aria-selected="${section===id}">${uiIcon(icon)}<span>${label}</span></button>`).join('')}</nav>`;
    const strip=message?`<p class="co-strip ${message.ok?'ok':'bad'}" role="status">${e(message.text)}</p>`:'';
    const body=section==='dinheiro'?money(v):section==='materia'?materials(v):section==='equipe'?team(v):section==='producao'?production(v):summary(v);
    return `<div class="co-head"><h3>${e(v.name)}</h3><small>${v.role==='owner'?'Você é dono':'Você é gerente'}</small></div>${nav}${strip}<div class="co-body">${body}</div>`;
  }

  return {
    get role():CompanyView['role']|null {return state?.role??null;},
    get known():boolean {return state!==undefined;},
    html,
    reset():void {state=undefined;message=null;pending=false;search={text:'',players:[]};clearTimeout(pendingTimer);},
    watch(on:boolean):void {hooks.send('company.watch',{on});},
    setState(next:unknown):void {
      const view=next as Partial<CompanyView>|null;
      state=view&&view.role?view as CompanyView:null;hooks.redraw();
    },
    setResult(result:CompanyResult):void {
      pending=false;clearTimeout(pendingTimer);message={ok:result.ok,text:result.message};if(!result.ok)hooks.toast(result.message,true);hooks.redraw();
    },
    setSearch(players:Array<{userId:string;name:string}>):void {search={...search,players};hooks.redraw();},
    /** Handles a click on any `data-co` button inside the tab. */
    click(button:HTMLElement,root:HTMLElement):void {
      const field=(name:string)=>root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value??'';
      const secret=(name:string)=>field(name)||undefined;
      switch(button.dataset.co){
        case 'section':section=button.dataset.section as CompanySection;message=null;hooks.redraw();return;
        case 'transfer':{const amount=amountOf(field('co-amount'));if(!amount){hooks.toast('Digite quantas moedas transferir.',true);return;}ask('company.transfer',{amount,password:secret('co-pass'),requestId:rid()});return;}
        case 'transfer-all':if(state&&state.balance>0)ask('company.transfer',{amount:state.balance,password:secret('co-pass'),requestId:rid()});return;
        case 'deposit':{const amount=amountOf(field('co-amount'));if(!amount){hooks.toast('Digite quantas moedas depositar.',true);return;}ask('company.deposit',{amount,requestId:rid()});return;}
        case 'password-set':ask('company.password',{password:field('co-new'),current:secret('co-cur')});return;
        case 'password-clear':if(confirm('Remover a senha da empresa? Transferências e compras deixam de pedir senha.'))ask('company.password',{password:null,current:secret('co-cur')});return;
        case 'buy':ask('company.purchase',{material:button.dataset.material,pallets:Number(button.dataset.pallets),password:secret('co-pass-buy'),requestId:rid()});return;
        case 'cancel-order':if(confirm('Cancelar o pedido? O valor volta para a empresa.'))ask('company.cancel',{id:button.dataset.id});return;
        case 'admit':ask('company.admit',{userId:button.dataset.user,requestId:rid()});search={text:'',players:[]};return;
        case 'reject':ask('company.reject',{userId:button.dataset.user,requestId:rid()});return;
        case 'dismiss':if(confirm(`Demitir ${button.dataset.name}?`))ask('company.dismiss',{userId:button.dataset.user,requestId:rid()});return;
        case 'manager':ask('company.manager',{userId:button.dataset.user,manager:button.dataset.on==='1'});return;
        case 'op-draw':ask('company.op.draw',{});return;
        case 'op-approve':ask('company.op.approve',{id:button.dataset.id});return;
        case 'op-cancel':if(confirm('Cancelar a ordem aprovada?'))ask('company.op.cancel',{});return;
        case 'op-close':if(confirm('Encerrar a ordem agora? A fábrica fica suja e precisa ser limpa.'))ask('company.op.close',{});return;
      }
    },
    /** Typing in the name search: asks the room for matches after a short pause. */
    input(target:HTMLInputElement):void {
      if(target.name!=='co-search')return;
      search={...search,text:target.value};clearTimeout(searchTimer);
      if(target.value.trim().length<2){search={text:target.value,players:[]};return;}
      searchTimer=setTimeout(()=>hooks.send('company.search',{text:search.text}),300);
    },
  };
}
