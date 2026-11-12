import {COMPANY_PASSWORD} from '@bar/shared/factory';
import {badge,card,compact,e,empty,n,redraw,reasonField,requestId,signed,stat,uiIcon,when,type AdminCompany,type SectionFactory,type WorldSnapshot} from './kit';

const PAGE=12;
const ROLE_NAME={owner:'Dono',manager:'Gerente'} as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money=(value:number)=>`${n(value)} <small>moedas</small>`;

/**
 * Economia › Donos e caixa: the firm behind the plant (docs/sistemas/empresa.md). Its wallet (every sale's share lands here), who owns and manages it, each owner's
 * password (the administration can set or clear it) and the firm's ledger. Everything is read from the world's admin snapshot (`factory.company`, which the room
 * refreshes from the API) and every change goes to the room as `admin.company`, with a reason, which re-reads the API and answers with a new snapshot.
 */
export const companyTab:SectionFactory=(root,ctx)=>{
  let world:WorldSnapshot|null=ctx.world(),page=0,disposed=false,signature='',pending:{sig:string;text:string}|undefined,timer=0;
  const company=():AdminCompany|null|undefined=>world?.factory?.company;
  const players=()=>world?.players??[];

  const reasonOf=():string|null=>{
    const input=root.querySelector<HTMLTextAreaElement>('[name="reason"]'),value=input?.value.trim()??'';
    if(value.length<3){ctx.message('Escreva o motivo da alteração (pelo menos 3 caracteres): ele vai para o log.',true);input?.focus();return null;}
    return value;
  };
  function ledgerRows(c:AdminCompany):string {
    const pages=Math.max(1,Math.ceil(c.ledger.length/PAGE));page=Math.min(page,pages-1);
    const rows=c.ledger.slice(page*PAGE,page*PAGE+PAGE);
    if(!rows.length)return empty('Nenhum movimento ainda.');
    return `<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Quando</th><th>O que aconteceu</th><th class="num">Valor</th><th class="num">Saldo depois</th></tr></thead><tbody>
      ${rows.map(row=>`<tr><td title="${e(new Date(row.at).toLocaleString('pt-BR'))}">${e(when(row.at))}</td><td>${e(row.reason)}<small>por ${e(row.actorName||'Sistema')}</small></td><td class="num ${row.amount<0?'down':'up'}">${signed(row.amount)}</td><td class="num">${n(row.balanceAfter)}</td></tr>`).join('')}</tbody></table></div>
      <div class="eco-pager"><button type="button" class="mini-button" data-co-page="-1" ${page<=0?'disabled':''}>${uiIcon('chevronLeft')}Mais novos</button><span>Página ${page+1} de ${pages} · últimos ${c.ledger.length} movimentos</span><button type="button" class="mini-button" data-co-page="1" ${page+1>=pages?'disabled':''}>Mais antigos${uiIcon('chevronRight')}</button></div>`;
  }
  function memberRow(member:AdminCompany['members'][number]):string {
    const owner=member.role==='owner',id=e(member.userId);
    return `<li class="co-member"><div class="co-who"><b>${e(member.name)}</b><small>${id}</small></div>
      <div class="co-tags">${badge(ROLE_NAME[member.role],owner?'gold':'cyan')}${owner?badge(member.hasPassword?'com senha':'sem senha',member.hasPassword?'mint':'muted'):''}<small>desde ${e(when(member.since))}</small></div>
      <div class="co-actions">
        <div class="co-btns">
          <button type="button" class="mini-button" data-co-role="${owner?'manager':'owner'}" data-user="${id}" data-name="${e(member.name)}">${owner?'Virar gerente':'Virar dono'}</button>
          <button type="button" class="mini-button danger" data-co-role="none" data-user="${id}" data-name="${e(member.name)}">${uiIcon('trash')}Remover cargo</button>
          ${owner&&member.hasPassword?`<button type="button" class="mini-button" data-co-clear="${id}" data-name="${e(member.name)}">${uiIcon('unlock')}Remover senha</button>`:''}
        </div>
        ${owner?`<div class="co-btns"><span class="co-pass" data-keep="co-pw"><input type="password" name="pw-${id}" autocomplete="new-password" maxlength="${COMPANY_PASSWORD.max}" placeholder="Nova senha" aria-label="Nova senha de ${e(member.name)}"><button type="button" class="mini-button" data-co-pass="${id}" data-name="${e(member.name)}">${uiIcon('key')}Definir senha</button></span></div>`:''}
      </div></li>`;
  }
  function render():void {
    if(disposed)return;
    const c=company();
    if(c===undefined||c===null){root.innerHTML=`<p class="admin-loading">${c===null?'A empresa ainda não respondeu: o mundo pede ao servidor a cada alguns segundos…':'Abrindo a empresa…'}</p>`;return;}
    const owners=c.members.filter(member=>member.role==='owner').length;
    root.innerHTML=`<div class="eco-company">
      <div class="eco-hero"><div class="eco-hero-main">${uiIcon('briefcase')}<div><small>Carteira da ${e(c.name)}</small><b>${money(c.balance)}</b></div></div>
        <div class="admin-stats">
          ${stat('Vendas pagas',n(c.totals.sales),`Bruto ${compact(c.totals.gross)}`)}
          ${stat('Entrou da venda',`+${compact(c.totals.income)}`,'Parte da firma depois do imposto','up')}
          ${stat('Gasto em matéria-prima',c.totals.spent?`−${compact(c.totals.spent)}`:'0','Compras (com imposto), já sem estornos','down')}
          ${stat('Donos',n(owners),`${n(c.members.length-owners)} gerente(s)`)}
        </div></div>
      ${card('Motivo das alterações',`<form class="eco-form" data-keep="co-reason" data-co-reasonform>${reasonField('Motivo (vale para tudo abaixo)','Ex.: passou a gerenciar a empresa a pedido do dono')}</form><p class="fine-print">Cargos, senhas e saldo mexem em dinheiro de verdade: cada alteração fica no log com este motivo e o seu nome.</p>`,{icon:'scroll'})}
      ${card(`Donos e gerentes · ${c.members.length}`,c.members.length?`<ul class="co-members">${c.members.map(memberRow).join('')}</ul>
        <p class="fine-print">A senha é de cada dono: protege as transferências e compras dele. Gerentes admitem, demitem e escolhem a ordem de produção, mas não mexem no dinheiro. A empresa nunca fica sem dono.</p>`:empty('Ninguém é dono nem gerente ainda: adicione o primeiro abaixo (a conta dona do jogo vira dona sozinha quando existe).'),{icon:'users'})}
      <div class="admin-grid">
        ${card('Adicionar dono ou gerente',`<form class="eco-form" data-keep="co-add" data-co-add>
          <div class="eco-row"><label>Jogador<input name="player" list="co-players" required autocomplete="off" placeholder="nome ou id" aria-label="Jogador"></label>
            <label>Cargo<select name="role" aria-label="Cargo"><option value="owner">Dono</option><option value="manager">Gerente</option></select></label></div>
          <datalist id="co-players">${players().map(player=>`<option value="${e(player.name)}"></option>`).join('')}</datalist>
          <div class="admin-confirm-buttons"><button class="button primary" type="submit">${uiIcon('userPlus')}Adicionar</button></div>
          <p class="fine-print">A pessoa entra na folha da fábrica na hora. Escolha pelo nome (quem está conectado aparece na lista) ou digite o id.</p></form>`,{icon:'userPlus'})}
        ${card('Ajustar o saldo da empresa',`<form class="eco-form" data-keep="co-adjust" data-co-adjust>
          <div class="eco-row"><label>O que fazer<select name="op" aria-label="O que fazer com o saldo"><option value="in">Colocar moedas</option><option value="out">Tirar moedas</option></select></label>
            <label>Quantidade<input name="amount" type="number" min="1" max="1000000000" step="1" required placeholder="5000" aria-label="Quantidade de moedas"></label></div>
          <div class="admin-confirm-buttons"><button class="button primary" type="submit">Ajustar saldo</button></div>
          <p class="fine-print">Mexe só no saldo da empresa (nunca abaixo de zero) e fica no extrato como “Ajuste da administração”.</p></form>`,{icon:'sliders'})}
      </div>
      ${card(`Extrato da empresa · ${c.ledger.length}`,ledgerRows(c),{icon:'receipt'})}
    </div>`;
  }
  const draw=()=>{const c=company();signature=JSON.stringify(c??null);redraw(root,render);};

  /** Sends a change; the next snapshot that differs confirms it, and silence for a few seconds is told. */
  function send(payload:Record<string,unknown>,done:string):void {
    if(!ctx.world()){ctx.message('O mundo não respondeu ainda: espere alguns segundos e tente de novo.',true);return;}
    const why=reasonOf();if(!why)return;
    ctx.send('admin.company',{requestId:requestId(),reason:why,...payload});
    pending={sig:signature,text:done};ctx.message('Pedido enviado ao mundo…');
    window.clearTimeout(timer);
    timer=window.setTimeout(()=>{if(pending&&!disposed){ctx.requestWorld();window.setTimeout(()=>{if(pending&&!disposed){ctx.message('Nada mudou: o servidor pode ter recusado (a empresa precisa de ao menos um dono; confira o jogador e os valores).',true);pending=undefined;}},1500);}},3000);
  }
  const click=(event:MouseEvent)=>{
    const t=(event.target as HTMLElement).closest<HTMLElement>('button');if(!t)return;
    const step=t.dataset.coPage;if(step){page=Math.max(0,page+Number(step));draw();return;}
    const name=t.dataset.name??'',user=t.dataset.user;
    if(t.dataset.coRole&&user){
      const role=t.dataset.coRole;
      if(role==='none'){if(!confirm(`Tirar o cargo de ${name}? Ele continua na folha como funcionário.`))return;send({op:'role',userId:user,role:null},`${name} deixou de ser dono/gerente.`);return;}
      if(role==='manager'&&!confirm(`Rebaixar ${name} de dono a gerente? Ele perde o acesso ao dinheiro da empresa.`))return;
      send({op:'role',userId:user,role},`${name} agora é ${role==='owner'?'dono':'gerente'}.`);return;
    }
    if(t.dataset.coClear){if(!confirm(`Remover a senha de ${name}? Ele passa a transferir e comprar sem senha.`))return;send({op:'password.clear',userId:t.dataset.coClear},`Senha de ${name} removida.`);return;}
    if(t.dataset.coPass){
      const id=t.dataset.coPass,input=root.querySelector<HTMLInputElement>(`[name="pw-${CSS.escape(id)}"]`),password=input?.value??'';
      if(password.length<COMPANY_PASSWORD.min||password.length>COMPANY_PASSWORD.max){ctx.message(`A senha precisa ter de ${COMPANY_PASSWORD.min} a ${COMPANY_PASSWORD.max} caracteres.`,true);input?.focus();return;}
      send({op:'password.set',userId:id,password},`Senha de ${name} definida.`);if(input)input.value='';
    }
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;
    if(form.matches('[data-co-reasonform]')){event.preventDefault();return;}
    if(form.matches('[data-co-add]')){
      event.preventDefault();
      const data=new FormData(form),typed=String(data.get('player')??'').trim(),role=String(data.get('role')),known=players().find(player=>player.name.toLowerCase()===typed.toLowerCase()||player.id===typed);
      const id=known?.id??(UUID.test(typed)?typed:'');
      if(!id){ctx.message('Jogador não encontrado entre os conectados: digite o id completo dele (Jogadores › ficha).',true);return;}
      send({op:'role',userId:id,role},`${known?.name??typed} agora é ${role==='owner'?'dono':'gerente'}.`);return;
    }
    if(form.matches('[data-co-adjust]')){
      event.preventDefault();
      const data=new FormData(form),amount=Math.floor(Number(data.get('amount'))),taking=data.get('op')==='out',c=company();
      if(!Number.isSafeInteger(amount)||amount<1)return;
      if(taking&&amount>(c?.balance??0)){ctx.message(`A empresa só tem ${n(c?.balance??0)} moedas.`,true);return;}
      send({op:'adjust',amount:taking?-amount:amount},`Saldo ajustado: ${taking?'−':'+'}${n(amount)} moedas.`);
    }
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);
  draw();ctx.requestWorld();
  return {
    world(snapshot:WorldSnapshot){
      world=snapshot;const next=JSON.stringify(company()??null);
      if(next===signature&&root.firstElementChild)return;
      if(pending&&next!==pending.sig){ctx.message(pending.text);pending=undefined;}
      const active=document.activeElement;
      // Somebody typing a password or a reason is not interrupted: the redraw waits for the field to lose the focus.
      if(active&&root.contains(active)&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)&&root.querySelector('.eco-company')){active.addEventListener('blur',()=>window.setTimeout(()=>{if(!disposed)draw();},0),{once:true});return;}
      draw();
    },
    destroy(){disposed=true;window.clearTimeout(timer);root.removeEventListener('click',click);root.removeEventListener('submit',submit);},
  };
};
