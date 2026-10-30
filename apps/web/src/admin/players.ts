import {ITEM_CATALOG,LEDGER_SOURCES,MAX_COIN_BALANCE,adminActionLabel,itemById,type AdminAudit,type AdminOverview,type AdminPlayerDetail,type AdminPlayerFilter,type AdminPlayerSort} from '@bar/shared';
import {ApiError} from '../api';
import {itemImage} from '../ui-icons';
import {badge,card,chips,e,empty,lock,n,reasonField,requestId,signed,uiIcon,when,type SectionFactory} from './kit';
import {goButton,followGo} from './overview';

type Tab='summary'|'wallet'|'items'|'moderation'|'history';
const TABS:ReadonlyArray<readonly [Tab,string]>=[['summary','Resumo'],['wallet','Carteira'],['items','Itens e skins'],['moderation','Moderação'],['history','Histórico']];
const FILTERS:ReadonlyArray<readonly [AdminPlayerFilter,string]>=[['all','Todos'],['online','No bar'],['admins','Administradores'],['banned','Banidos'],['unverified','E-mail pendente']];
const PAGE=20;
// The tab stays when another player is picked, and between openings of the window.
let lastTab:Tab='summary';

/** Account changes that ask for a reason before they run (the confirmation form). */
const CONFIRM:Record<string,(p:AdminPlayerDetail['account'])=>{title:string;text:string}>={
  role:p=>p.role==='admin'?{title:'Remover administrador',text:'A conta perderá acesso ao painel, mantendo seu personagem, moedas e compras.'}
    :{title:'Conceder administrador',text:'A conta poderá ajustar moedas, moderar jogadores, mudar preços e iniciar eventos. A gestão de administradores fica com a conta principal.'},
  kick:()=>({title:'Expulsar jogador',text:'Encerra somente a participação atual. A conta continua liberada e o jogador pode entrar novamente.'}),
  ban:()=>({title:'Banir jogador',text:'Encerra as sessões e impede novas entradas até a remoção do banimento.'}),
  unkick:()=>({title:'Desfazer expulsão',text:'Cancela as expulsões pendentes e marca os registros como desfeitos. Quem já foi expulso pode entrar novamente. Esta ação não remove banimentos.'}),
  unban:()=>({title:'Remover banimento',text:'Remove todos os banimentos ativos. O jogador pode entrar novamente com seu login.'}),
  logout:()=>({title:'Encerrar sessões',text:'Desconecta a conta em todos os navegadores. Se estiver no bar, o jogador sai em alguns segundos e precisa entrar de novo com a senha.'}),
  verify:()=>({title:'Confirmar e-mail',text:'Libera a entrada no bar sem o link de confirmação enviado por e-mail.'}),
};
function reversalText(log:AdminAudit):string {
  if(log.action.startsWith('coins-'))return 'Compensa o valor deste ajuste sobre o saldo atual, preservando compras e outras alterações. A reversão será recusada se ultrapassar os limites da carteira.';
  if(log.action==='ban')return 'Remove somente este banimento. Outros banimentos ativos continuam valendo; o botão Desbanir no cadastro remove todos.';
  if(log.action==='kick')return 'Cancela esta expulsão se ainda estiver pendente e marca o registro como desfeito. A expulsão não impede novas entradas; esta reversão não remove banimentos.';
  if(log.action==='event')return 'Encerra este evento se ele ainda estiver ativo. Um evento mais recente não será interrompido.';
  return 'Restaura a permissão anterior, desde que não exista uma alteração mais recente.';
}

/** Jogadores: the account list (search, filters, order) and the selected player's file, with every change it allows. */
export const playersSection:SectionFactory=(root,ctx,params)=>{
  let list:AdminOverview|undefined,detail:AdminPlayerDetail|undefined,disposed=false,generation=0,detailGeneration=0;
  let search=params.search??'',filter=(params.filter as AdminPlayerFilter)??'all',sort:AdminPlayerSort=(params.sort as AdminPlayerSort)??'recent',offset=0,selectedId=params.player??'';
  let tab:Tab=lastTab,mode='',reversingId='',pending:{signature:string;id:string}|undefined;
  // Opened on a given player (from the log or a report): keep them selected even outside the first page.
  let pinned=!!params.player;
  const online=()=>new Set(ctx.world()?.players.filter(p=>p.connected).map(p=>p.id)??[]);

  function accountCard(person:AdminOverview['users'][number],here:Set<string>):string {
    const role=person.owner?'Conta principal':person.role==='admin'?'Administrador':'Jogador';
    return `<button type="button" class="admin-account-card ${person.id===selectedId?'selected':''}" data-admin="select" data-id="${e(person.id)}" aria-pressed="${person.id===selectedId}">
      <b>${here.has(person.id)?'<i class="live-dot" title="No bar agora"></i>':''}${e(person.displayName)}</b><small>${e(person.email)}</small>
      <span>${role}${person.banned?' · Banido':''}${person.kickId?' · Expulsão registrada':''}${person.verified?'':' · E-mail pendente'}</span><strong>${n(person.balance)} moedas</strong></button>`;
  }
  function listHtml():string {
    if(!list)return '<p class="admin-loading">Carregando jogadores…</p>';
    const here=online();
    return `<div class="admin-account-list">${list.users.map(p=>accountCard(p,here)).join('')||empty(filter==='online'&&!here.size?'Ninguém no bar agora.':'Nenhuma conta encontrada.')}</div>
      <div class="admin-pagination"><button class="mini-button" data-admin="previous" ${offset===0?'disabled':''}>Anterior</button><small>${list.total?offset+1:0}–${Math.min(offset+list.users.length,list.total)} de ${list.total}</small><button class="mini-button" data-admin="next" ${offset+PAGE>=list.total?'disabled':''}>Próxima</button></div>`;
  }
  function walletForm(p:AdminPlayerDetail['account']):string {
    if(!p.canEditWallet)return '<p class="fine-print">A carteira desta conta só pode ser alterada pela conta principal.</p>';
    return `<form data-admin-form="wallet" class="admin-wallet-form"><fieldset><legend>Ajustar moedas</legend>
      <div class="admin-fields"><label>Operação<select name="operation" aria-label="Operação de moedas"><option value="add">Adicionar</option><option value="remove">Remover</option><option value="set">Definir saldo total</option></select></label>
      <label>Quantidade de moedas<input type="number" name="amount" aria-label="Quantidade de moedas" min="0" max="${MAX_COIN_BALANCE}" step="1" required inputmode="numeric"></label></div>
      <p class="admin-wallet-preview" aria-live="polite">Escolha a operação e informe a quantidade.</p>
      <label>Motivo do ajuste<textarea name="reason" aria-label="Motivo do ajuste" minlength="3" maxlength="500" required placeholder="Ex.: testar a compra de uma skin"></textarea></label>
      <button class="button primary" type="submit">Aplicar ajuste</button></fieldset></form>`;
  }
  function confirmation(p:AdminPlayerDetail['account']):string {
    const text=CONFIRM[mode]?.(p);if(!text)return '';
    return `<form data-admin-form="${e(mode)}" class="admin-confirmation"><h4>${text.title}</h4><p>${text.text}</p>${reasonField('Motivo da ação')}
      <div class="admin-confirm-buttons"><button class="button primary" type="submit">${text.title}</button><button class="mini-button" data-admin="cancel" type="button">Cancelar ação</button></div></form>`;
  }
  function summaryTab(d:AdminPlayerDetail):string {
    const p=d.account,live=ctx.world()?.players.find(w=>w.id===p.id&&w.connected),rows:Array<[string,string]>=[
      ['Usuário',`@${e(p.username)}`],['E-mail',`${e(p.email)} · ${p.verified?'confirmado':'pendente'}`],['Conta criada',e(when(p.createdAt))],
      ['Último login',e(when(d.sessions.lastLoginAt))],['Sessões abertas',n(d.sessions.active)],['Celular',p.phone?e(p.phone.replace(/(\d{5})(\d{4})/,'$1-$2')):'—'],
      ['Skin em uso',e(d.skins.find(s=>s.id===p.equippedSkin)?.name??p.equippedSkin)],
      ['Blackjack',`${n(d.stats.gamesPlayed)} partidas · ${n(d.stats.wins)} V · ${n(d.stats.losses)} D · ${n(d.stats.draws)} E`],
      ['Denúncias',`${n(d.reports.against.length)} recebida(s) · ${n(d.reports.made)} feita(s)`],
      ['No bar agora',live?`Sim · ${e(live.interaction||live.animation)}${live.job?` · trabalhando`:''} · (${live.x}, ${live.z})`:'Não'],
    ];
    const self=p.id===ctx.user()?.id,canAccount=self||p.canModerate;
    return `<div class="admin-grid">${card('Ficha',`<dl class="admin-rows">${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`,{icon:'idCard'})}
      ${card('Conta',canAccount?`<form data-admin-form="rename" class="admin-inline-form"><label>Nome no jogo<input name="displayName" aria-label="Nome no jogo" value="${e(p.displayName)}" minlength="2" maxlength="32" required></label>${reasonField('Motivo da mudança de nome')}<button class="button secondary" type="submit">Salvar nome</button></form>
        <p class="fine-print">O novo nome aparece no bar a partir da próxima entrada.</p>
        <div class="admin-player-actions">${p.verified?'':'<button class="mini-button" data-admin="verify">Confirmar e-mail</button>'}${self?'':'<button class="mini-button" data-admin="logout">Encerrar sessões</button>'}</div>${mode==='verify'||mode==='logout'?confirmation(p):''}`
        :'<p class="fine-print">Esta conta está protegida: somente a conta principal altera os dados dela.</p>',{icon:'pencil'})}</div>`;
  }
  function walletTab(d:AdminPlayerDetail):string {
    return `<div class="admin-stats compact"><div class="admin-stat"><small>Ganhou em 30 dias</small><b class="up">+${n(d.wallet.earned30d)}</b></div><div class="admin-stat"><small>Gastou em 30 dias</small><b class="down">−${n(d.wallet.spent30d)}</b></div></div>
      <div class="admin-grid">${card('Ajuste manual',walletForm(d.account),{icon:'coins'})}
      ${card('Últimas movimentações',d.wallet.ledger.length?`<table class="admin-table"><thead><tr><th>Quando</th><th>Origem</th><th>Descrição</th><th class="num">Moedas</th></tr></thead><tbody>${d.wallet.ledger.map(row=>`<tr><td>${e(when(row.createdAt))}</td><td>${e(LEDGER_SOURCES[row.source])}</td><td>${e(row.label)}</td><td class="num ${row.amount>0?'up':'down'}">${signed(row.amount)}</td></tr>`).join('')}</tbody></table>`:empty('Nenhuma movimentação.'),
        {icon:'receipt',actions:goButton('logs','Ver no log',{player:d.account.id,category:'moedas'})})}</div>`;
  }
  function itemsTab(d:AdminPlayerDetail):string {
    const p=d.account,have=new Map(d.inventory.map(i=>[i.itemId,i.quantity]));
    const items=ITEM_CATALOG.map(item=>`<li class="${have.get(item.id)?'':'none'}"><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><b>${e(item.name)}</b><span>${n(have.get(item.id)??0)}/${item.stackMax}</span></li>`).join('');
    const paid=d.skins.filter(s=>s.id!=='nathan');
    return `<div class="admin-grid">${card('Mochila',`<ul class="admin-items">${items}</ul>${p.canEditWallet?`<form data-admin-form="item" class="admin-inline-form"><div class="admin-fields"><label>Item<select name="itemId" aria-label="Item">${ITEM_CATALOG.map(item=>`<option value="${item.id}">${e(item.name)} (tem ${have.get(item.id)??0})</option>`).join('')}</select></label>
        <label>Quantidade<input type="number" name="quantity" aria-label="Quantidade de itens" min="1" max="10" value="1" required></label></div>${reasonField('Motivo da mudança na mochila')}
        <div class="admin-confirm-buttons"><button class="button secondary" type="submit" value="add">Entregar</button><button class="mini-button" type="submit" value="remove">Retirar</button></div></form>`:''}`,{icon:'bag'})}
      ${card('Skins',`<ul class="admin-items skins">${d.skins.map(s=>`<li class="${s.owned?'':'none'}"><b>${e(s.name)}</b><span>${s.id==='nathan'?'Gratuita':s.owned?`Desde ${e(when(s.acquiredAt))}`:'Não tem'}</span></li>`).join('')}</ul>
        ${p.canEditWallet&&paid.length?`<form data-admin-form="skin" class="admin-inline-form"><label>Skin<select name="skinId" aria-label="Skin">${paid.map(s=>`<option value="${s.id}">${e(s.name)}${s.owned?' (tem)':''}</option>`).join('')}</select></label>${reasonField('Motivo da mudança de skin')}
        <div class="admin-confirm-buttons"><button class="button secondary" type="submit" value="grant">Dar skin</button><button class="mini-button" type="submit" value="revoke">Retirar skin</button></div></form>`:''}`,{icon:'shirt'})}</div>`;
  }
  function moderationTab(d:AdminPlayerDetail):string {
    const p=d.account,actions=`${p.canModerate?`<button class="mini-button" data-admin="kick">Expulsar</button>${p.kickId?'<button class="mini-button" data-admin="unkick">Desfazer expulsão</button>':''}<button class="mini-button" data-admin="${p.banned?'unban':'ban'}">${p.banned?'Desbanir':'Banir'}</button>`:''}
      ${p.canChangeRole?`<button class="mini-button" data-admin="role">${p.role==='admin'?'Remover administrador':'Dar administrador'}</button>`:''}`;
    return `<div class="admin-grid">${card('Acesso',`<div class="admin-player-actions">${actions.trim()||'<p class="fine-print">Nenhuma ação disponível para esta conta.</p>'}</div>
      ${p.owner?'<p class="fine-print">Conta principal protegida contra banimento e remoção de administrador.</p>':''}
      ${p.kickId?'<p class="fine-print">Há uma expulsão registrada. Expulsão encerra uma participação e não bloqueia a conta. Banimento é uma restrição separada.</p>':''}
      ${['role','kick','ban','unkick','unban'].includes(mode)?confirmation(p):''}`,{icon:'shield'})}
      ${card('Denúncias recebidas',d.reports.against.length?`<ul class="admin-feed">${d.reports.against.map(r=>`<li><b>${e(r.reporterName??'Jogador')}</b><span>${e(when(r.createdAt))} · ${r.resolvedAt?`resolvida por ${e(r.resolvedByName??'administração')}`:'aberta'}</span><p>${e(r.reason)}</p></li>`).join('')}</ul>`:empty('Nenhuma denúncia contra esta conta.'),
        {icon:'flag',actions:goButton('reports','Abrir denúncias')})}</div>`;
  }
  function historyTab(d:AdminPlayerDetail):string {
    const reversal=(log:AdminAudit)=>`<form data-admin-form="revert" class="admin-confirmation admin-reversal"><h4>${e(log.revertLabel)}${log.targetName?` · ${e(log.targetName)}`:''}</h4><p>${reversalText(log)}</p>${reasonField('Motivo da reversão')}
      <div class="admin-confirm-buttons"><button class="button primary" type="submit">Confirmar reversão</button><button class="mini-button" data-admin="cancel-revert" type="button">Cancelar reversão</button></div></form>`;
    return card('Ações da administração nesta conta',`<div class="admin-actions-history">${d.history.map(log=>`<article data-audit-id="${e(log.id)}"><b>${e(adminActionLabel(log.action))}</b><small>${e(when(log.createdAt))} · ${e(log.actorName??'Administrador')}</small><p>${e(log.reason)}</p>
      ${log.revokedAt?`<small class="admin-reverted">Desfeita em ${e(when(log.revokedAt))}</small>`:log.canRevert?`<button class="mini-button admin-revert-button" data-admin="revert" data-id="${e(log.id)}">${e(log.revertLabel)}</button>`:`<small>${e(log.revertReason)}</small>`}
      ${reversingId===log.id&&log.canRevert?reversal(log):''}</article>`).join('')||empty('Nenhuma ação registrada para esta conta.')}</div>`,
      {icon:'clock',actions:goButton('logs','Tudo desta conta no log',{player:d.account.id})});
  }
  function detailHtml():string {
    if(!selectedId)return empty('Selecione uma conta para ver a ficha.');
    if(!detail||detail.account.id!==selectedId)return '<p class="admin-loading">Carregando a ficha…</p>';
    const p=detail.account,here=online().has(p.id);
    const badges=[p.owner?badge('Conta principal','magenta'):p.role==='admin'?badge('Administrador','magenta'):'',here?badge('No bar','cyan'):'',p.banned?badge('Banido','red'):'',p.kickId?badge('Expulsão registrada','gold'):'',p.verified?'':badge('E-mail pendente','gold')].join('');
    const body=tab==='wallet'?walletTab(detail):tab==='items'?itemsTab(detail):tab==='moderation'?moderationTab(detail):tab==='history'?historyTab(detail):summaryTab(detail);
    return `<header class="admin-player-head"><div><h3>${e(p.displayName)}</h3><p class="admin-player-email">${e(p.email)} · @${e(p.username)}</p><div class="admin-badges">${badges}</div></div>
        <div class="admin-current-balance"><span>Saldo atual</span><b>${n(p.balance)} <small>moedas</small></b></div></header>
      <div class="admin-subtabs" role="tablist" aria-label="Ficha do jogador">${TABS.map(([id,label])=>`<button type="button" role="tab" data-admin="tab" data-tab="${id}" aria-selected="${id===tab}">${label}${id==='history'&&detail!.history.length?` <i>${detail!.history.length}</i>`:''}</button>`).join('')}</div>
      <div class="admin-subtab-body" role="tabpanel">${body}</div>`;
  }
  function render():void {
    if(disposed)return;
    root.innerHTML=`<div class="admin-players">
      <section class="admin-accounts" aria-label="Contas cadastradas">
        <form data-admin-form="search" class="admin-search"><label>Buscar jogador<input name="search" aria-label="Buscar jogador" maxlength="100" value="${e(search)}" placeholder="Nome, usuário ou e-mail"></label><button class="button secondary" type="submit">${uiIcon('search')}Buscar</button></form>
        ${chips('filter',FILTERS,filter)}
        <div class="admin-list-tools"><label>Ordem<select data-admin-sort aria-label="Ordenar jogadores"><option value="recent" ${sort==='recent'?'selected':''}>Mais recentes</option><option value="name" ${sort==='name'?'selected':''}>Nome</option><option value="balance" ${sort==='balance'?'selected':''}>Maior saldo</option></select></label>
          <button class="mini-button" data-admin="refresh" type="button">${uiIcon('refresh')}Atualizar painel</button></div>
        <div class="admin-list-slot">${listHtml()}</div>
      </section>
      <section class="admin-player-detail" aria-label="Gerenciar jogador">${detailHtml()}</section></div>`;
  }
  async function loadList():Promise<void> {
    const version=++generation,unlock=lock(root);
    try{
      const here=filter==='online'?[...online()].join(','):'';
      const result=await ctx.api<AdminOverview>(`/admin/overview?search=${encodeURIComponent(search)}&offset=${offset}&limit=${PAGE}&filter=${filter}&sort=${sort}${here?`&online=${here}`:''}`);
      if(disposed||version!==generation)return;
      list=result;
      if(!selectedId||(!result.users.some(u=>u.id===selectedId)&&!pinned))selectedId=result.users[0]?.id??'';
      pinned=false;
      render();
      if(selectedId&&detail?.account.id!==selectedId)await loadDetail();
    }catch(error){if(disposed||version!==generation)return;if(error instanceof ApiError&&error.status===403)ctx.message('Acesso exclusivo da administração.',true);else ctx.message(error instanceof Error?error.message:'Não foi possível carregar os jogadores.',true);}
    finally{unlock();}
  }
  async function loadDetail():Promise<void> {
    if(!selectedId){detail=undefined;render();return;}
    const version=++detailGeneration,id=selectedId;
    try{const result=await ctx.api<AdminPlayerDetail>(`/admin/players/${id}`);if(disposed||version!==detailGeneration)return;detail=result;render();}
    catch(error){if(!disposed&&version===detailGeneration)ctx.message(error instanceof Error?error.message:'Não foi possível carregar a ficha.',true);}
  }
  /** After a change: the file and the list again (balances and states change in both). */
  const reload=()=>Promise.all([loadDetail(),loadList()]).then(()=>undefined);
  const focusReason=()=>root.querySelector<HTMLTextAreaElement>('.admin-confirmation textarea')?.focus();

  const click=(event:MouseEvent)=>{
    const target=event.target as HTMLElement;
    if(followGo(target,ctx.go))return;
    const chip=target.closest<HTMLElement>('[data-admin-chip="filter"]');
    if(chip){filter=chip.dataset.value as AdminPlayerFilter;offset=0;mode='';void loadList();return;}
    const button=target.closest<HTMLElement>('[data-admin]');if(!button)return;
    event.stopPropagation();
    const action=button.dataset.admin!;
    if(action==='select'){selectedId=button.dataset.id!;mode='';reversingId='';pending=undefined;detail=undefined;render();void loadDetail();}
    else if(action==='tab'){tab=lastTab=button.dataset.tab as Tab;mode='';reversingId='';render();}
    else if(action==='refresh')void reload();
    else if(action==='previous'||action==='next'){offset=Math.max(0,offset+(action==='next'?PAGE:-PAGE));mode='';void loadList();}
    else if(action==='cancel'){mode='';render();}
    else if(action==='cancel-revert'){reversingId='';render();}
    else if(action==='revert'){const log=detail?.history.find(l=>l.id===button.dataset.id);if(!log?.canRevert)return;reversingId=log.id;mode='';render();root.querySelector<HTMLTextAreaElement>('.admin-reversal textarea')?.focus();}
    else if(CONFIRM[action]){mode=action;render();focusReason();}
  };
  const change=(event:Event)=>{
    const target=event.target as HTMLElement;
    if(target.matches('[data-admin-sort]')){sort=(target as HTMLSelectElement).value as AdminPlayerSort;offset=0;void loadList();return;}
    const form=target.closest<HTMLFormElement>('[data-admin-form="wallet"]'),p=detail?.account;if(!form||!p)return;
    const values=new FormData(form),amount=Number(values.get('amount')),operation=String(values.get('operation'));
    const balance=operation==='set'?amount:p.balance+(operation==='remove'?-amount:amount);
    form.querySelector('.admin-wallet-preview')!.textContent=Number.isSafeInteger(balance)&&balance>=0&&balance<=MAX_COIN_BALANCE?`Após o ajuste: ${n(balance)} moedas.`:'O resultado precisa ficar entre 0 e 1.000.000.000 moedas.';
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement,kind=form.dataset.adminForm;if(!kind)return;
    event.preventDefault();event.stopPropagation();
    const values=Object.fromEntries(new FormData(form)),reason=String(values.reason??'').trim(),p=detail?.account,submitter=event.submitter as HTMLButtonElement|null;
    if(kind==='search'){search=String(values.search).trim();offset=0;mode='';reversingId='';void loadList();return;}
    if(!p)return;
    const player=(body:object,success:string)=>void ctx.run(async()=>{await ctx.api('/admin/player',{playerId:p.id,reason,...body});mode='';await reload();},success);
    if(kind==='revert'){
      const log=detail!.history.find(l=>l.id===reversingId);if(!log?.canRevert)return;
      void ctx.run(async()=>{await ctx.api('/admin/revert',{actionId:log.id,reason});reversingId='';await reload();},'Ação desfeita e reversão registrada.',{wallet:log.action.startsWith('coins-')});
    }else if(kind==='wallet'){
      const operation=String(values.operation),amount=Number(values.amount),payload={playerId:p.id,operation,amount,reason,...(operation==='set'?{expectedBalance:p.balance}:{})};
      // The same form sent twice (a retry) keeps its id, so the API applies it once.
      const signature=JSON.stringify(payload);if(pending?.signature!==signature)pending={signature,id:requestId()};const id=pending.id;
      void ctx.run(async()=>{await ctx.api('/admin/wallet',{...payload,requestId:id});pending=undefined;await reload();},'Carteira atualizada.',{wallet:true});
    }
    else if(kind==='rename')player({op:'rename',displayName:String(values.displayName).trim()},'Nome alterado.');
    else if(kind==='verify')player({op:'verify'},'E-mail confirmado.');
    else if(kind==='logout')player({op:'logout'},'Sessões encerradas.');
    else if(kind==='item'){const quantity=Math.abs(Number(values.quantity));player({op:'item',itemId:String(values.itemId),quantity:submitter?.value==='remove'?-quantity:quantity},submitter?.value==='remove'?'Itens retirados da mochila.':`${itemById(String(values.itemId))?.name??'Item'} entregue na mochila.`);}
    else if(kind==='skin')player({op:'skin',skinId:String(values.skinId),grant:submitter?.value!=='revoke'},submitter?.value==='revoke'?'Skin retirada da coleção.':'Skin adicionada à coleção.');
    else if(kind==='role')void ctx.run(async()=>{await ctx.api('/admin/role',{playerId:p.id,role:p.role==='admin'?'user':'admin',reason});mode='';await reload();},'Permissão administrativa atualizada.');
    else void ctx.run(async()=>{await ctx.api('/admin/action',{playerId:p.id,action:kind,reason});mode='';await reload();},'Ação de moderação registrada.');
  };
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('input',change);root.addEventListener('submit',submit);
  render();void loadList();
  return {
    world(){
      // Only the "no bar" marks change with the world: the forms keep what is being typed.
      const slot=root.querySelector('.admin-list-slot');if(slot&&list&&!slot.contains(document.activeElement))slot.innerHTML=listHtml();
    },
    destroy(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('input',change);root.removeEventListener('submit',submit);},
  };
};
