import {MAX_COIN_BALANCE,type AdminAccount,type AdminOverview} from '@bar/shared';
import {api,ApiError,escape as e} from './api';

const coins=(value:number)=>value.toLocaleString('pt-BR');
const labels:Record<string,string>={kick:'Expulsão',ban:'Banimento',unban:'Banimento removido',event:'Evento',
  'admin-grant':'Administrador concedido','admin-revoke':'Administrador removido','owner-bootstrap':'Conta principal habilitada',
  'coins-add':'Moedas adicionadas','coins-remove':'Moedas removidas','coins-set':'Saldo definido'};
const date=(value:string)=>new Date(value).toLocaleString('pt-BR');
// randomUUID requires HTTPS/localhost; getRandomValues also works on the game's HTTP LAN address.
function requestId(){
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function adminPanel(container:HTMLElement,hooks:{notify:(message:string)=>void;changedWallet:()=>void;denied:()=>void}){
  let data:AdminOverview|undefined,selectedId='',search='',offset=0,mode='',busy=false,disposed=false,generation=0;
  let pending:{signature:string;id:string}|undefined;
  const disabled=new Map<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement,boolean>();
  const selected=()=>data?.users.find(u=>u.id===selectedId);
  const message=(text:string,error=false)=>{const node=container.querySelector<HTMLElement>('.admin-feedback');if(node){node.textContent=text;node.classList.toggle('error',error);}};
  function setBusy(value:boolean){
    container.setAttribute('aria-busy',String(value));
    if(value){disabled.clear();for(const input of container.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('input,select,textarea,button')){disabled.set(input,input.disabled);input.disabled=true;}}
    else {for(const [input,previous] of disabled)if(input.isConnected)input.disabled=previous;disabled.clear();}
  }
  function walletForm(target:AdminAccount){
    if(!target.canEditWallet)return '<p class="fine-print">A carteira desta conta só pode ser alterada pela conta principal.</p>';
    return `<form data-admin-form="wallet" class="admin-wallet-form"><fieldset><legend>Ajustar moedas</legend>
      <div class="admin-wallet-fields"><label>Operação<select name="operation" aria-label="Operação de moedas"><option value="add">Adicionar</option><option value="remove">Remover</option><option value="set">Definir saldo total</option></select></label>
      <label>Quantidade de moedas<input type="number" name="amount" aria-label="Quantidade de moedas" min="0" max="${MAX_COIN_BALANCE}" step="1" required inputmode="numeric"></label></div>
      <p class="admin-wallet-preview" aria-live="polite">Escolha a operação e informe a quantidade.</p>
      <label>Motivo do ajuste<textarea name="reason" aria-label="Motivo do ajuste" minlength="3" maxlength="500" required placeholder="Ex.: testar a compra de uma skin"></textarea></label>
      <button class="button primary" type="submit">Aplicar ajuste</button></fieldset></form>`;
  }
  function confirmation(target:AdminAccount){
    if(!mode)return '';
    const role=mode==='role',title=role?(target.role==='admin'?'Remover administrador':'Conceder administrador'):mode==='kick'?'Expulsar jogador':mode==='ban'?'Banir jogador':'Remover banimento';
    const explanation=role?(target.role==='admin'?'A conta perderá acesso ao painel, mantendo seu personagem, moedas e compras.':'A conta poderá ajustar moedas, moderar jogadores e iniciar eventos. A gestão de administradores fica com a conta principal.'):
      mode==='kick'?'Encerra a participação atual. O jogador poderá entrar novamente.':mode==='ban'?'Encerra as sessões e impede novas entradas até a remoção do banimento.':'Permite que o jogador entre novamente com sua conta.';
    return `<form data-admin-form="${e(mode)}" class="admin-confirmation"><h4>${title}</h4><p>${explanation}</p><label>Motivo da ação<textarea name="reason" aria-label="Motivo da ação" required minlength="3" maxlength="500"></textarea></label><div class="admin-confirm-buttons"><button class="button primary" type="submit">${title}</button><button class="mini-button" data-admin="cancel" type="button">Cancelar ação</button></div></form>`;
  }
  function render(){
    if(disposed||!data)return;
    if(!selected())selectedId=data.users[0]?.id??'';
    const target=selected();
    container.innerHTML=`<div class="admin-panel"><p class="modal-description">${data.canManageAdmins?'Conta principal · gerencie jogadores, carteiras e administradores.':'Administração · gerencie carteiras, moderação e eventos.'} Os ajustes ficam registrados no histórico.</p>
      <div class="admin-events"><button class="mini-button" data-admin="event" data-type="BLACKOUT">☾ Apagão</button><button class="mini-button" data-admin="event" data-type="DRUNK_NPC">♙ O inconveniente</button><button class="mini-button" data-admin="event" data-type="PARTY">♫ Festa</button></div>
      <form data-admin-form="search" class="admin-search"><label>Buscar jogador<input name="search" aria-label="Buscar jogador" maxlength="100" value="${e(search)}" placeholder="Nome, usuário ou e-mail"></label><button class="button secondary" type="submit">Buscar</button><button class="mini-button" data-admin="refresh" type="button">Atualizar painel</button></form>
      <p class="admin-feedback" role="status"></p><div class="admin-layout"><section class="admin-accounts" aria-label="Contas cadastradas"><h3>Jogadores <span>${data.total}</span></h3><div class="admin-account-list">${data.users.map(person=>`<button type="button" class="admin-account-card ${person.id===selectedId?'selected':''}" data-admin="select" data-id="${e(person.id)}" aria-pressed="${person.id===selectedId}"><b>${e(person.displayName)}</b><small>${e(person.email)}</small><span>${person.owner?'Conta principal':person.role==='admin'?'Administrador':'Jogador'}${person.banned?' · Banido':''}</span><strong>${coins(person.balance)} moedas</strong></button>`).join('')||'<p class="empty-state">Nenhuma conta encontrada.</p>'}</div>
      <div class="admin-pagination"><button class="mini-button" data-admin="previous" ${offset===0?'disabled':''}>Anterior</button><small>${data.total?offset+1:0}–${Math.min(offset+data.users.length,data.total)} de ${data.total}</small><button class="mini-button" data-admin="next" ${offset+data.limit>=data.total?'disabled':''}>Próxima</button></div></section>
      <section class="admin-player-detail" aria-label="Gerenciar jogador">${target?`<h3>${e(target.displayName)}</h3><p class="admin-player-email">${e(target.email)}<br>@${e(target.username)} · ${target.verified?'E-mail confirmado':'E-mail pendente'}${target.banned?' · Conta banida':''}</p>
      <div class="admin-current-balance"><span>Saldo atual</span><b>${coins(target.balance)} <small>moedas</small></b></div>${walletForm(target)}
      <div class="admin-player-actions">${target.canModerate?`<button class="mini-button" data-admin="kick">Expulsar</button><button class="mini-button" data-admin="${target.banned?'unban':'ban'}">${target.banned?'Desbanir':'Banir'}</button>`:''}
      ${target.canChangeRole?`<button class="mini-button" data-admin="role">${target.role==='admin'?'Remover administrador':'Dar administrador'}</button>`:''}</div>
      ${target.owner?'<p class="fine-print">Conta principal protegida contra banimento e remoção de administrador.</p>':''}${confirmation(target)}`:'<p>Selecione uma conta para gerenciar.</p>'}</section></div>
      <details class="admin-history"><summary>Histórico de ações (${data.logs.length})</summary>${data.logs.slice(0,30).map(log=>`<article><b>${e(labels[log.action]??log.action)}</b><small>${e(date(log.createdAt))} · ${e(log.actorName??'Administrador')}${log.targetName?` → ${e(log.targetName)}`:''}</small><p>${e(log.reason)}</p></article>`).join('')||'<p>Nenhuma ação registrada.</p>'}</details>
      <details class="admin-history"><summary>Denúncias (${data.reports.length})</summary>${data.reports.slice(0,30).map(report=>`<article><b>${e(report.reporterName??'Jogador')} → ${e(report.targetName??'Jogador')}</b><small>${e(date(report.createdAt))}</small><p>${e(report.reason)}</p></article>`).join('')||'<p>Nenhuma denúncia.</p>'}</details></div>`;
    if(busy)setBusy(true);
  }
  async function load(){
    const version=++generation;
    // A search can keep the same selected account. Prevent edits until the
    // response replaces its form, so a chosen operation cannot silently reset.
    if(!busy)setBusy(true);
    try{const result=await api<AdminOverview>(`/admin/overview?search=${encodeURIComponent(search)}&offset=${offset}&limit=20`);if(disposed||version!==generation)return;data=result;render();}
    catch(error){if(disposed||version!==generation)return;if(error instanceof ApiError&&error.status===403)hooks.denied();else{if(!data)container.innerHTML='<p class="admin-feedback" role="status"></p><button class="mini-button" data-admin="refresh">Tentar novamente</button>';message(error instanceof Error?error.message:'Não foi possível carregar o painel.',true);}}
    finally{if(!disposed&&version===generation&&!busy)setBusy(false);}
  }
  async function mutate(job:()=>Promise<unknown>,success:string,wallet=false){
    if(busy||disposed)return;busy=true;setBusy(true);message('Aplicando alteração…');
    try{await job();if(disposed)return;if(wallet)hooks.changedWallet();mode='';pending=undefined;await load();if(!disposed){message(success);hooks.notify(success);}}
    catch(error){if(disposed)return;if(error instanceof ApiError&&error.status===403)hooks.denied();message(error instanceof Error?error.message:'Não foi possível concluir a ação.',true);}
    finally{busy=false;if(!disposed)setBusy(false);}
  }
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-admin]');if(!button)return;event.stopPropagation();if(busy)return;
    const action=button.dataset.admin;
    if(action==='select'){selectedId=button.dataset.id!;mode='';pending=undefined;render();}
    else if(action==='refresh')void load();
    else if(action==='previous'||action==='next'){offset=Math.max(0,offset+(action==='next'?20:-20));mode='';void load();}
    else if(action==='cancel'){mode='';render();}
    else if(action==='event')void mutate(()=>api('/admin/action',{action:'event',eventType:button.dataset.type}),'Evento solicitado.');
    else {mode=action??'';render();container.querySelector<HTMLTextAreaElement>('.admin-confirmation textarea')?.focus();}
  };
  const input=(event:Event)=>{
    const form=(event.target as HTMLElement).closest<HTMLFormElement>('[data-admin-form="wallet"]'),target=selected();if(!form||!target)return;
    const values=new FormData(form),amount=Number(values.get('amount')),operation=String(values.get('operation'));
    const balance=operation==='set'?amount:target.balance+(operation==='remove'?-amount:amount);
    form.querySelector('.admin-wallet-preview')!.textContent=Number.isSafeInteger(balance)&&balance>=0&&balance<=MAX_COIN_BALANCE?`Após o ajuste: ${coins(balance)} moedas.`:'O resultado precisa ficar entre 0 e 1.000.000.000 moedas.';
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;if(!form.dataset.adminForm)return;event.preventDefault();event.stopPropagation();if(busy)return;
    const values=Object.fromEntries(new FormData(form)),target=selected(),kind=form.dataset.adminForm;
    if(kind==='search'){search=String(values.search).trim();offset=0;mode='';void load();return;}if(!target)return;
    const reason=String(values.reason).trim();
    if(kind==='wallet'){
      const operation=String(values.operation),amount=Number(values.amount),payload={playerId:target.id,operation,amount,reason,...(operation==='set'?{expectedBalance:target.balance}:{})};
      const signature=JSON.stringify(payload);if(pending?.signature!==signature)pending={signature,id:requestId()};const id=pending.id;
      void mutate(()=>api('/admin/wallet',{...payload,requestId:id}),'Carteira atualizada.',true);
    }else if(kind==='role')void mutate(()=>api('/admin/role',{playerId:target.id,role:target.role==='admin'?'user':'admin',reason}),'Permissão administrativa atualizada.');
    else void mutate(()=>api('/admin/action',{playerId:target.id,action:kind,reason}),'Ação de moderação registrada.');
  };
  container.addEventListener('click',click);container.addEventListener('input',input);container.addEventListener('change',input);container.addEventListener('submit',submit);
  container.innerHTML='<p>Carregando jogadores e carteiras…</p>';void load();
  return {destroy(){disposed=true;generation++;container.removeEventListener('click',click);container.removeEventListener('input',input);container.removeEventListener('change',input);container.removeEventListener('submit',submit);disabled.clear();}};
}
