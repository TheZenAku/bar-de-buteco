import {PHONE,PHONE_NUMBER,formatPhoneNumber,ledgerLabel,phoneDigits,type BankEntry,type BankView,type PhoneContact} from '@bar/shared';
import {api,escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import {avatar,header,type Person,type PhoneApp} from '../core';

const amountText=(value:number)=>`${value>0?'+':value<0?'−':''}${Math.abs(value).toLocaleString('pt-BR')}`;
const entryHtml=(entry:BankEntry)=>`<div class="ph-row bank-entry"><i class="bank-dir ${entry.amount>0?'in':'out'}">${uiIcon(entry.amount>0?'arrowDownLeft':'arrow')}</i><span class="fl"><b>${e(ledgerLabel(entry))}</b><small>${new Date(entry.at).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span><b class="bank-amount ${entry.amount>0?'in':''}">${amountText(entry.amount)}</b></div>`;

/** HighBank (Nubank parody): the real wallet and its ledger, and Pix between players (one API transaction each). */
export const highbank:PhoneApp={id:'highbank',name:'HighBank',icon:'landmark',tint:'linear-gradient(160deg,#3a2a6e,#120b26)',open(view,ctx,arg){
  type Screen='home'|'statement'|'pix-to'|'pix-amount'|'pix-confirm'|'pix-done';
  let screen:Screen='home',bank:BankView|undefined,hidden=ctx.store.get<boolean>('bank-hidden',false),to:Person|undefined,amount=0,sending=false,sent:{amount:number;to:string}|undefined;
  const balance=()=>bank?.balance??ctx.host.wallet()??0;
  async function load():Promise<void> {
    try{bank=await api<BankView>('/phone/bank');ctx.host.balance(bank.balance);}catch(error){ctx.host.error(error instanceof Error?error.message:'O HighBank não carregou.');}
    render();
  }
  /** Pix goes to saved contacts; anyone else, by typing their number. */
  const people=():Person[]=>ctx.profile()?.contacts??[];
  function render():void {
    const left=PHONE.pixDailyMax-(bank?.sentToday??0);
    if(screen==='statement'){view.innerHTML=`${header('Extrato','Início')}<div class="ph-body"><div class="ph-list">${bank?.entries.map(entryHtml).join('')||'<p class="ph-empty small">Sem movimentações.</p>'}</div><p class="ph-hint">As ${PHONE.bankPage} movimentações mais recentes da sua carteira.</p></div>`;return;}
    if(screen==='pix-to'){
      view.innerHTML=`${header('Pix','Início')}<div class="ph-body"><form class="ph-card bank-number" data-bank-form="number"><label>Digite o número<input class="ph-input" name="number" inputmode="numeric" placeholder="9XXXX-XXXX" autocomplete="off" required></label><button class="ph-pill-btn" type="submit">Continuar</button></form>
        <h3 class="ph-section">Seus contatos</h3><div class="ph-list">${people().map(person=>`<button type="button" class="ph-row" data-bank="to" data-id="${e(person.id)}">${avatar(person,40)}<span class="fl"><b>${e(person.name)}</b><small>${person.number?formatPhoneNumber(person.number):''}</small></span>${uiIcon('chevronRight')}</button>`).join('')||'<p class="ph-empty small">Nenhum contato salvo. Peça o número (ele está na ficha do jogador: clique na pessoa no bar) ou digite acima.</p>'}</div></div>`;
      return;
    }
    if(screen==='pix-amount'&&to){
      view.innerHTML=`${header('Pix','Voltar')}<div class="ph-body bank-pix">${avatar(to,64)}<p>Enviar para <b>${e(to.name)}</b></p><form data-bank-form="amount"><input class="bank-value" name="amount" type="number" inputmode="numeric" min="1" max="${Math.min(PHONE.pixMax,balance(),left)}" step="1" value="${amount||''}" placeholder="0" aria-label="Valor em moedas" required autofocus><small>moedas · saldo ${balance().toLocaleString('pt-BR')}</small>
        <div class="bank-chips">${[10,50,100,500].map(value=>`<button type="button" class="ph-chip" data-bank="chip" data-value="${value}">${value}</button>`).join('')}</div><button class="ph-pill-btn wide" type="submit">Continuar</button></form><p class="ph-hint">Até ${PHONE.pixMax.toLocaleString('pt-BR')} por Pix e ${PHONE.pixDailyMax.toLocaleString('pt-BR')} por dia (restam ${Math.max(0,left).toLocaleString('pt-BR')} hoje).</p></div>`;
      view.querySelector<HTMLInputElement>('[name="amount"]')?.focus();
      return;
    }
    if(screen==='pix-confirm'&&to){
      view.innerHTML=`${header('Confirmar','Voltar')}<div class="ph-body bank-pix"><p class="bank-big">${amount.toLocaleString('pt-BR')} <small>moedas</small></p><div class="ph-card bank-to">${avatar(to,44)}<span class="fl"><b>${e(to.name)}</b><small>${to.number?formatPhoneNumber(to.number):''}</small></span></div>
        <p class="ph-hint">O Pix cai na hora e não pode ser desfeito.</p><button type="button" class="ph-pill-btn wide" data-bank="send" ${sending?'disabled':''}>${sending?'Enviando…':'Enviar Pix'}</button></div>`;
      return;
    }
    if(screen==='pix-done'&&sent){
      view.innerHTML=`<div class="ph-body bank-done"><i class="bank-ok">${uiIcon('check')}</i><h2>Pix enviado</h2><p>${sent.amount.toLocaleString('pt-BR')} moedas para ${e(sent.to)}</p><button type="button" class="ph-pill-btn wide" data-bank="home">Concluir</button></div>`;
      return;
    }
    const number=ctx.profile()?.number;
    view.innerHTML=`<div class="ph-body"><div class="bank-hello">${avatar({name:ctx.host.user()?.displayName??'?',color:ctx.host.user()?.color},40)}<span>Olá, <b>${e(ctx.host.user()?.displayName??'')}</b></span><button type="button" class="ph-mini" data-bank="hide" aria-label="${hidden?'Mostrar':'Esconder'} saldo">${uiIcon(hidden?'eyeOff':'eye')}</button></div>
      <div class="bank-card"><small>Saldo disponível</small><b>${hidden?'•••••':balance().toLocaleString('pt-BR')}</b><span>moedas</span></div>
      <div class="bank-actions"><button type="button" data-bank="pix">${uiIcon('transfer')}<small>Pix</small></button><button type="button" data-bank="statement">${uiIcon('receipt')}<small>Extrato</small></button><button type="button" data-bank="copy">${uiIcon('copy')}<small>Minha chave</small></button></div>
      ${number?`<p class="ph-hint">Sua chave Pix é o seu número: ${formatPhoneNumber(number)}</p>`:''}
      <h3 class="ph-section">Movimentações</h3><div class="ph-list">${bank?bank.entries.slice(0,5).map(entryHtml).join('')||'<p class="ph-empty small">Nada por aqui ainda. Trabalhe no bar (J) para ganhar moedas.</p>':'<p class="ph-empty small">Carregando…</p>'}</div></div>`;
  }
  async function send():Promise<void> {
    if(!to||sending)return;
    sending=true;render();
    try{
      const result=await api<{balance:number;amount:number;to:PhoneContact}>('/phone/bank/pix',{userId:to.id,amount,requestId:crypto.randomUUID()});
      ctx.host.balance(result.balance);ctx.host.send('phone.ping',{to:to.id,kind:'pix'});
      sent={amount:result.amount,to:result.to.name};screen='pix-done';void load();
    }catch(error){ctx.host.error(error instanceof Error?error.message:'Pix não enviado.');screen='pix-amount';}
    finally{sending=false;render();}
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-bank],[data-ph]');if(!button)return;
    if(button.dataset.ph==='back'){screen=screen==='pix-confirm'?'pix-amount':screen==='pix-amount'&&!arg?'pix-to':'home';render();return;}
    switch(button.dataset.bank){
      case 'hide':hidden=!hidden;ctx.store.set('bank-hidden',hidden);render();break;
      case 'statement':screen='statement';render();break;
      case 'pix':screen='pix-to';render();break;
      case 'home':screen='home';to=undefined;amount=0;render();break;
      case 'to':{to=people().find(person=>person.id===button.dataset.id);if(to){screen='pix-amount';render();}break;}
      case 'chip':{const input=view.querySelector<HTMLInputElement>('[name="amount"]');if(input)input.value=button.dataset.value!;break;}
      case 'send':void send();break;
      case 'copy':{const number=ctx.profile()?.number;if(number)void navigator.clipboard?.writeText(number).then(()=>ctx.banner('highbank','Chave copiada',formatPhoneNumber(number)),()=>ctx.host.error(`Sua chave: ${formatPhoneNumber(number)}`));break;}
    }
  });
  view.addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.target as HTMLFormElement,data=new FormData(form);
    if(form.dataset.bankForm==='number'){
      const digits=phoneDigits(String(data.get('number')??''));
      if(!PHONE_NUMBER.test(digits)){ctx.host.error('Digite um número de 9 dígitos começando com 9.');return;}
      void api<PhoneContact>(`/phone/lookup?number=${digits}`).then(found=>{to=found;screen='pix-amount';render();}).catch(error=>ctx.host.error(error instanceof Error?error.message:'Número não encontrado.'));
    }
    if(form.dataset.bankForm==='amount'){
      const value=Math.floor(Number(data.get('amount')));
      if(!(value>=1)){ctx.host.error('Informe quantas moedas enviar.');return;}
      if(value>balance()){ctx.host.error('Moedas insuficientes.');return;}
      amount=value;screen='pix-confirm';render();
    }
  });
  view.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.name==='number')input.value=formatPhoneNumber(phoneDigits(input.value));});
  if(arg&&typeof arg==='object'&&'id' in arg){to=arg as Person;screen='pix-amount';}
  render();void load();void ctx.refreshProfile();
}};
