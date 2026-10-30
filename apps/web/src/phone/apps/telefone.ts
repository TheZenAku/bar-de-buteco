import {PHONE_NUMBER,formatPhoneNumber,phoneDigits,type PhoneContact,type PhoneProfile} from '@bar/shared';
import {api,escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import {avatar,duration,header,timeAgo,type Person,type PhoneApp,type PhoneContext,type RecentCall} from '../core';

type Tab='recents'|'contacts'|'keypad';
const KEYS:Array<[string,string]>=[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']];
const RECENT:Record<RecentCall['kind'],{icon:string;label:string}>={in:{icon:'phoneIncoming',label:'Recebida'},out:{icon:'phoneOutgoing',label:'Feita'},missed:{icon:'phoneMissed',label:'Perdida'}};

/** The person's detail card: call, message, Pix, Highgram, and saving or removing the contact. */
function detailHtml(person:Person,ctx:PhoneContext):string {
  const saved=ctx.contact(person.id),number=saved?.number??person.number;
  const action=(name:string,icon:string,label:string)=>`<button type="button" class="ph-action-tile" data-tel="${name}">${uiIcon(icon)}<small>${label}</small></button>`;
  return `<div class="tel-detail">${avatar(person,96)}<h2>${e(person.name)}</h2><p>${number?e(formatPhoneNumber(number)):'Número fora da agenda'}</p>
    <div class="ph-action-row">${action('call','phone','ligar')}${action('video','video','vídeo')}${action('zap','messageCircle','mensagem')}${action('pix','transfer','pix')}${action('gram','gram','highgram')}</div>
    <div class="ph-group">${saved?`<button type="button" class="ph-row danger" data-tel="remove">${uiIcon('trash')}<span class="fl">Apagar contato</span></button>`:`<button type="button" class="ph-row accent" data-tel="save">${uiIcon('userPlus')}<span class="fl">Salvar na agenda</span></button>`}</div></div>`;
}

function phoneApp(id:string,name:string,icon:string,tint:string,first:Tab,dock=false):PhoneApp {
  return {id,name,icon,tint,dock,open(view,ctx,arg){
    let tab:Tab=first,digits='',query='',detail:Person|undefined,adding=false;
    if(arg&&typeof arg==='object'&&'id' in arg){detail=arg as Person;tab='contacts';}
    const tabs=id==='telefone';
    const recentsHtml=()=>{
      const recents=ctx.store.get<RecentCall[]>('recents',[]);
      return `<div class="ph-large"><h1>Recentes</h1>${recents.length?'<button type="button" class="ph-link" data-tel="clear">Limpar</button>':''}</div>`+(recents.length?`<div class="ph-list">${recents.map((call,i)=>`<button type="button" class="ph-row ${call.kind==='missed'?'missed':''}" data-tel="redial" data-index="${i}">${uiIcon(RECENT[call.kind].icon)}${avatar(call,38)}<span class="fl"><b>${e(call.name)}</b><small>${RECENT[call.kind].label}${call.video?' · vídeo':''}${call.seconds?` · ${duration(call.seconds)}`:''}</small></span><time>${timeAgo(call.at)}</time></button>`).join('')}</div>`
        :`<p class="ph-empty">${uiIcon('phone')}Nenhuma ligação ainda.<br>Ligue para alguém em Contatos.</p>`);
    };
    const contactRow=(person:Person,sub:string)=>`<div class="ph-row"><button type="button" class="ph-row-main" data-tel="detail" data-id="${e(person.id)}">${avatar(person,40)}<span class="fl"><b>${e(person.name)}</b><small>${e(sub)}</small></span></button><button type="button" class="ph-mini" data-tel="quick-call" data-id="${e(person.id)}" aria-label="Ligar para ${e(person.name)}">${uiIcon('phone')}</button><button type="button" class="ph-mini" data-tel="quick-zap" data-id="${e(person.id)}" aria-label="Mensagem para ${e(person.name)}">${uiIcon('messageCircle')}</button></div>`;
    // Only the people you saved: a number comes from the player's card (click them in the bar) or from them.
    const listHtml=()=>{
      const profile=ctx.profile(),match=(person:{name:string;number?:string})=>!query||person.name.toLowerCase().includes(query.toLowerCase())||(person.number??'').includes(phoneDigits(query)||'§');
      const saved=(profile?.contacts??[]).filter(match);
      return `<h3 class="ph-section">Agenda</h3>${saved.length?`<div class="ph-list">${saved.map(contact=>contactRow(contact,formatPhoneNumber(contact.number))).join('')}</div>`:`<p class="ph-empty small">${query?'Ninguém com esse nome ou número.':'Sua agenda está vazia. Clique em alguém no bar para ver a ficha com o número, ou toque em + para digitar um.'}</p>`}`;
    };
    const contactsHtml=()=>{
      const profile=ctx.profile();
      return `<div class="ph-large"><h1>Contatos</h1><button type="button" class="ph-link" data-tel="add" aria-label="Adicionar contato">${uiIcon('plus')}</button></div>
        <input class="ph-search" type="search" placeholder="Buscar nome ou número" value="${e(query)}" data-tel-input="search" aria-label="Buscar contatos">
        ${profile?`<div class="ph-card ph-me">${avatar({name:ctx.host.user()?.displayName??'Eu',color:ctx.host.user()?.color},48)}<span class="fl"><b>${e(ctx.host.user()?.displayName??'')}</b><small>Meu número · ${formatPhoneNumber(profile.number)}</small></span></div>`:''}
        ${adding?`<form class="ph-card ph-add" data-tel-form="add"><label>Número<input class="ph-input" name="number" inputmode="numeric" maxlength="10" placeholder="9XXXX-XXXX" autocomplete="off" required></label><button class="ph-pill-btn" type="submit">Salvar</button></form>`:''}
        <div class="tel-list">${listHtml()}</div>`;
    };
    const keypadHtml=()=>`<div class="tel-keypad"><output class="tel-digits">${e(formatPhoneNumber(digits))||'&nbsp;'}</output><div class="tel-keys">${KEYS.map(([key,letters])=>`<button type="button" class="tel-key" data-key="${key}"><b>${key}</b><small>${letters||'&nbsp;'}</small></button>`).join('')}</div>
      <div class="tel-key-actions"><span></span><button type="button" class="ph-round accept" data-tel="dial" aria-label="Ligar">${uiIcon('phone')}</button>${digits?`<button type="button" class="tel-erase" data-tel="erase" aria-label="Apagar">${uiIcon('backspace')}</button>`:'<span></span>'}</div></div>`;
    function render():void {
      if(detail){view.innerHTML=`${header('',tabs?'Contatos':'Voltar')}<div class="ph-body">${detailHtml(detail,ctx)}</div>`;return;}
      const body=tab==='recents'?recentsHtml():tab==='contacts'?contactsHtml():keypadHtml();
      view.innerHTML=`<div class="ph-body">${body}</div>${tabs?`<nav class="ph-tabs">${([['recents','clock','Recentes'],['contacts','contact','Contatos'],['keypad','keypad','Teclado']] as const).map(([value,icon,label])=>`<button type="button" class="${tab===value?'on':''}" data-tab="${value}">${uiIcon(icon)}<small>${label}</small></button>`).join('')}</nav>`:''}`;
      if(tab==='recents'){ctx.store.set('missed',0);ctx.setBadge('telefone',0);}
    }
    const person=(personId:string):Person|undefined=>ctx.contact(personId);
    async function dial():Promise<void> {
      if(!PHONE_NUMBER.test(digits)){ctx.host.error('Digite um número de 9 dígitos começando com 9.');return;}
      try{const found=await api<PhoneContact>(`/phone/lookup?number=${digits}`);ctx.call(found);}
      catch(error){ctx.host.error(error instanceof Error?error.message:'Número não encontrado.');}
    }
    async function save(target:{userId?:string;number?:string}):Promise<PhoneProfile|undefined> {
      try{const profile=await api<PhoneProfile>('/phone/contacts',target);await ctx.refreshProfile();return profile;}
      catch(error){ctx.host.error(error instanceof Error?error.message:'Não foi possível salvar.');}
    }
    view.addEventListener('click',event=>{
      const target=event.target as HTMLElement,button=target.closest<HTMLElement>('[data-tel],[data-tab],[data-key],[data-ph]');if(!button)return;
      if(button.dataset.ph==='back'){detail=undefined;render();return;}
      if(button.dataset.tab){tab=button.dataset.tab as Tab;detail=undefined;render();return;}
      if(button.dataset.key){if(digits.length<9)digits+=button.dataset.key.replace(/\D/,'');render();return;}
      const action=button.dataset.tel,chosen=button.dataset.id?person(button.dataset.id):undefined;
      switch(action){
        case 'clear':ctx.store.set('recents',[]);render();break;
        case 'redial':{const call=ctx.store.get<RecentCall[]>('recents',[])[Number(button.dataset.index)];if(call)ctx.call({id:call.peerId,name:call.name,color:call.color},call.video);break;}
        case 'detail':if(chosen){detail=chosen;render();}break;
        case 'quick-call':if(chosen)ctx.call(chosen);break;
        case 'quick-zap':if(chosen)ctx.open('highzap',chosen);break;
        case 'add':adding=!adding;render();view.querySelector<HTMLInputElement>('[name="number"]')?.focus();break;
        case 'erase':digits=digits.slice(0,-1);render();break;
        case 'dial':void dial();break;
        case 'call':if(detail)ctx.call(detail);break;
        case 'video':if(detail)ctx.call(detail,true);break;
        case 'zap':if(detail)ctx.open('highzap',detail);break;
        case 'pix':if(detail)ctx.open('highbank',detail);break;
        case 'gram':if(detail)ctx.open('highgram',{profile:detail.id});break;
        case 'save':if(detail){const current=detail;void save({userId:current.id}).then(profile=>{if(profile&&detail===current){detail=profile.contacts.find(contact=>contact.id===current.id)??current;render();}});}break;
        case 'remove':if(detail){const current=detail;void api<PhoneProfile>(`/phone/contacts/${encodeURIComponent(current.id)}`,undefined,'DELETE').then(()=>ctx.refreshProfile()).then(()=>{if(detail===current)render();}).catch(error=>ctx.host.error(error instanceof Error?error.message:'Não foi possível apagar.'));}break;
      }
    });
    view.addEventListener('input',event=>{
      const input=event.target as HTMLInputElement;
      if(input.dataset.telInput==='search'){query=input.value;const list=view.querySelector('.tel-list');if(list)list.innerHTML=listHtml();}
      if(input.name==='number')input.value=formatPhoneNumber(phoneDigits(input.value));
    });
    view.addEventListener('submit',event=>{
      event.preventDefault();
      const form=event.target as HTMLFormElement;
      if(form.dataset.telForm==='add')void save({number:phoneDigits(String(new FormData(form).get('number')??''))}).then(profile=>{if(profile){adding=false;render();}});
    });
    // Typing on a physical keyboard dials too.
    const keys=(event:KeyboardEvent)=>{
      if(tab!=='keypad'||detail||(event.target as HTMLElement).closest('input,textarea'))return;
      if(/^\d$/.test(event.key)&&digits.length<9){digits+=event.key;render();event.stopPropagation();}
      else if(event.key==='Backspace'){digits=digits.slice(0,-1);render();event.stopPropagation();}
      else if(event.key==='Enter'){void dial();event.stopPropagation();event.preventDefault();}
    };
    view.ownerDocument.addEventListener('keydown',keys,true);
    void ctx.refreshProfile().then(()=>{if(tab==='contacts'&&!detail)render();});
    render();
    return ()=>view.ownerDocument.removeEventListener('keydown',keys,true);
  }};
}
export const telefone=phoneApp('telefone','Telefone','phone','linear-gradient(160deg,#6cf08f,#14b04b)','recents',true);
export const contatos=phoneApp('contatos','Contatos','contact','linear-gradient(160deg,#d6cfc8,#8e857c)','contacts');
