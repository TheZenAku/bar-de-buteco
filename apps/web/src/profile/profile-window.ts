import {BADGE_RARITY_INFO,formatPhoneNumber,levelOf,rankOf,isSkillKey,isTakenKey,keyLabel,loadoutOf,PROFILE,SKINS,skillsOf,type AchievementView,type Badge,type BadgeRarity,type ProfileView,type SkillLoadouts} from '@bar/shared';
import {api,escape as e} from '../api';
import {price} from '../prices';
import {uiIcon} from '../ui-icons';
import {rankIcon} from '../levels/rank-icon';
import {badgeMedal,openBadgeCard,rarityAttributes} from './badge-card';
import {floatingWindow,type FloatingWindow} from './floating-window';
import {createCompanyTab} from './company-tab';
import type {CompanyResult} from '@bar/shared/factory';
import './profile.css';

export interface ProfileHooks {
  /** The skin standing still, as an image; undefined when the 3D scene could not draw it. */
  portrait:(skin:string)=>Promise<string|undefined>;
  highgram:(id:string)=>void;
  contactSaved:()=>void;
  message:(person:ProfilePerson)=>void;
  call:(person:ProfilePerson)=>void;
  /** The player chose another skill or key. */
  loadouts:(next:SkillLoadouts)=>void;
  /** Opens the collection on this skin's card, where its skills are sold. */
  collection:(skin:string)=>void;
  toast:(text:string,error?:boolean)=>void;
  /** Sends a message to the room (the company tab talks to it). */
  send:(type:string,payload:unknown)=>void;
}
export interface ProfilePerson {id:string;name:string;color:string;number:string;photo?:number}
type Tab='profile'|'achievements'|'skill'|'employment'|'company';
interface EmploymentView {employment:null|{jobId:string;status:'hired'|'resigned'|'dismissed'|'applied';hiredAt:string;cooldownUntil?:string|null;schedule?:unknown};shift:null|{startedAt:string;earned:number;station:string};config:{contractSlots:number;shiftSlots:number;cooldownMs:number}}

/**
 * The profile window: a right click on a player (or on yourself), then Perfil. Name, Highgram, the skin standing still, the
 * badges on show and the status message; in your own, what you can edit and the skills of the skin you are wearing.
 */
export function createProfileWindow(hooks:ProfileHooks){
  let window_:FloatingWindow|undefined,picker:FloatingWindow|undefined;
  let view:ProfileView|undefined,tab:Tab='profile',editing=false,capturing=false,generation=0,keyError='',busy=false;
  /** The Conquistas tab: read each time it opens, and again when a badge arrives while it is open. */
  let achievements:AchievementView[]|undefined;
  let employment:EmploymentView|undefined;
  /** "Gerenciar empresa": only for owners and managers; the room tells who is one when the own profile opens. */
  const company=createCompanyTab({send:hooks.send,toast:hooks.toast,redraw:()=>{if(tab==='company'||company.role!==shownRole)render();}});
  /** The company role the tab bar was last drawn for (the "Gerenciar empresa" tab appears when the room says so). */
  let shownRole:string|null=null;
  /** Pictures already drawn, by skin; they do not change during a session. */
  const portraits=new Map<string,string>();
  const tip=document.createElement('div');tip.className='pf-tip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);

  const showTip=(target:HTMLElement)=>{
    const rarity=BADGE_RARITY_INFO[target.dataset.tipRarity as BadgeRarity];
    tip.innerHTML=`<b>${e(target.dataset.tipTitle)}</b>${rarity?`<small style="color:${e(rarity.color)}">${e(rarity.name)}</small>`:''}<span>${e(target.dataset.tipText)}</span>`;tip.hidden=false;
    const box=target.getBoundingClientRect(),size=tip.getBoundingClientRect();
    const above=box.top-size.height-8,top=above<8?box.bottom+8:above;
    tip.style.left=`${Math.max(8,Math.min(box.left+box.width/2-size.width/2,innerWidth-size.width-8))}px`;tip.style.top=`${top}px`;
  };
  const hideTip=()=>{tip.hidden=true;};
  const wireTips=(root:HTMLElement)=>{
    const over=(event:Event)=>{
      const target=(event.target as HTMLElement).closest<HTMLElement>('[data-tip-title]');
      // The focus coming back from a card closed by mouse is not asking for the tip.
      if(event.type==='focusin'&&target&&!target.matches(':focus-visible'))return;
      if(target)showTip(target);else hideTip();
    };
    root.addEventListener('pointerover',over);root.addEventListener('focusin',over);
    root.addEventListener('pointerleave',hideTip);root.addEventListener('focusout',hideTip);
  };

  const medalButton=(badge:Badge)=>`<button type="button" class="pf-slot filled" data-pf="medal" data-id="${e(badge.id)}" ${rarityAttributes(badge)} data-tip-title="${e(badge.name)}" data-tip-rarity="${e(badge.rarity)}" data-tip-text="${e(badge.description)}" aria-label="${e(badge.name)}, ${e(BADGE_RARITY_INFO[badge.rarity].name)}: ${e(badge.description)}. Ver a carta">${badgeMedal(badge)}</button>`;
  function profileHtml(v:ProfileView):string {
    const slots=Array.from({length:PROFILE.shownBadges},(_,i)=>v.badges[i]?medalButton(v.badges[i]!):'<span class="pf-slot" aria-hidden="true"></span>').join('');
    const status=editing
      ?`<form class="pf-status-form" data-pf-form="status"><input name="status" maxlength="${PROFILE.statusMax}" value="${e(v.status)}" placeholder="Sua mensagem…" aria-label="Mensagem de status" autocomplete="off"><div><small data-pf-count>${v.status.length}/${PROFILE.statusMax}</small><button type="button" class="pf-icon" data-pf="status-cancel" aria-label="Cancelar">${uiIcon('close')}</button><button type="submit" class="pf-icon on" aria-label="Salvar mensagem">${uiIcon('check')}</button></div></form>`
      :v.status||v.mine?`<div class="pf-status${v.status?'':' empty'}">${v.mine?`<button type="button" class="pf-icon" data-pf="status-edit" aria-label="Editar mensagem de status" title="Editar mensagem">${uiIcon('pencil')}</button>`:''}<p>${v.status?e(v.status):'Escreva uma mensagem de status.'}</p></div>`:'';
    const person=v.mine
      ?`<div class="pf-line"><span>${uiIcon('smartphone')} Seu número</span><b>${e(formatPhoneNumber(v.number))}</b><button type="button" class="pf-icon" data-pf="copy" aria-label="Copiar número" title="Copiar número">${uiIcon('copy')}</button></div>`
      :v.saved
        ?`<div class="pf-actions"><button type="button" class="mini-button" data-pf="message">${uiIcon('messageCircle')}Mensagem</button><button type="button" class="mini-button" data-pf="call">${uiIcon('phone')}Ligar</button></div>`
        :`<div class="pf-actions"><button type="button" class="mini-button" data-pf="save">${uiIcon('userPlus')}Salvar contato</button></div>`;
    return `<div class="pf-main">
      <div class="pf-left">
        <figure class="pf-stage" aria-label="Modelo de ${e(v.name)}: ${e(SKINS.find(skin=>skin.id===v.skin)?.name??'')}"><i class="pf-floor" aria-hidden="true"></i><span class="pf-model"><span class="loader" aria-hidden="true"></span></span><figcaption>${e(SKINS.find(skin=>skin.id===v.skin)?.name??'')}</figcaption></figure>
        ${status}
      </div>
      <section class="pf-badges" aria-label="Emblemas">
        <header><h3>Emblemas</h3><small>${v.badges.length}/${PROFILE.shownBadges}</small></header>
        <div class="pf-grid">${slots}</div>
        ${v.mine?`<button type="button" class="mini-button" data-pf="badges">${uiIcon('pencil')}Editar emblemas</button>`:''}
      </section>
    </div>${person}`;
  }
  /** One series: how far along, and its four medals. Those not earned yet stay dark, and their tip says what they ask for. */
  function seriesHtml(series:AchievementView):string {
    const next=series.tiers.find(tier=>series.value<tier.goal),unit=(amount:number)=>series.unit[amount===1?0:1];
    const medals=series.tiers.map(({badge,owned})=>{
      const tip=`${rarityAttributes(badge)} data-tip-title="${e(badge.name)}" data-tip-rarity="${e(badge.rarity)}" data-tip-text="${e(badge.description)}"`;
      return owned
        ?`<button type="button" class="pf-ach-medal" data-pf="achievement" data-id="${e(badge.id)}" ${tip} aria-label="${e(badge.name)}: ${e(badge.description)}. Ver a carta">${badgeMedal(badge)}</button>`
        :`<span class="pf-ach-medal" tabindex="0" ${tip} aria-label="${e(badge.name)}, ainda não conquistado: ${e(badge.description)}">${badgeMedal(badge)}</span>`;
    }).join('');
    const count=series.value.toLocaleString('pt-BR');
    return `<article class="pf-ach${next?'':' done'}" data-series="${e(series.id)}"><div class="pf-ach-info"><b>${e(series.name)}</b><small>${next?`${count} de ${next.goal.toLocaleString('pt-BR')} ${e(unit(next.goal))}`:`${count} ${e(unit(series.value))}: série completa`}</small><span class="pf-ach-track"><i style="width:${next?Math.min(100,series.value/next.goal*100).toFixed(1):100}%"></i></span></div><div class="pf-ach-medals">${medals}</div></article>`;
  }
  function achievementsHtml():string {
    if(!achievements)return '<p class="pf-empty"><span class="loader" aria-hidden="true"></span></p>';
    const tiers=achievements.flatMap(series=>series.tiers),earned=tiers.filter(tier=>tier.owned).length;
    // What was already started comes first; the rest keeps the order of the catalog.
    const order=[...achievements].sort((a,b)=>Number(b.value>0)-Number(a.value>0));
    return `<p class="pf-lead"><b>${earned}</b> de ${tiers.length} emblemas. Eles chegam sozinhos, conforme você joga pela cidade.</p><div class="pf-achievements">${order.map(seriesHtml).join('')}</div>`;
  }
  async function loadAchievements():Promise<void> {
    const opened=generation;
    try{
      const answer=await api<{achievements:AchievementView[]}>('/profile/achievements');
      if(opened===generation&&tab==='achievements'){achievements=answer.achievements;render();}
    }catch(error){hooks.toast(error instanceof Error?error.message:'Não foi possível ler as conquistas.',true);}
  }
  function skillHtml(v:ProfileView):string {
    const skills=skillsOf(v.skin),skin=SKINS.find(each=>each.id===v.skin)?.name??v.skin,owned=v.ownedSkills??[];
    if(!skills.length)return `<p class="pf-empty">${e(skin)} ainda não tem skills. Algumas skins têm habilidades próprias, que você compra na coleção e escolhe aqui.</p>`;
    const loadout=loadoutOf(v.loadouts,v.skin,owned);
    const row=(skill:typeof skills[number])=>{
      if(!owned.includes(skill.id))return `<button type="button" class="pf-skill locked" data-pf="skill-shop"><span class="pf-skill-icon">${uiIcon('lock')}</span><span><b>${e(skill.name)}</b><small>${e(skill.description)}</small></span><i>${uiIcon('coins')}${price(`skill:${skill.id}`).toLocaleString('pt-BR')}</i></button>`;
      const on=skill.id===loadout!.skill;
      return `<button type="button" class="pf-skill${on?' on':''}" role="radio" aria-checked="${on}" data-pf="skill" data-skill="${e(skill.id)}"><span class="pf-skill-icon">${uiIcon(skill.icon)}</span><span><b>${e(skill.name)}</b><small>${e(skill.description)}</small></span>${on?'<i>Ativa</i>':''}</button>`;
    };
    if(!loadout)return `<p class="pf-lead">As skills de <b>${e(skin)}</b> são compradas na coleção e valem em todas as variantes dele.</p>
      <div class="pf-skills">${skills.map(row).join('')}</div>
      <button type="button" class="button primary full" data-pf="skill-shop">${uiIcon('cards')}Abrir a coleção</button>`;
    return `<p class="pf-lead">Skills de <b>${e(skin)}</b>. Escolha a que fica ativa e a tecla que a usa.</p>
      <div class="pf-skills" role="radiogroup" aria-label="Skill ativa">${skills.map(row).join('')}</div>
      <div class="pf-keyrow"><span>${uiIcon('keyboard')} Tecla</span><button type="button" class="pf-key${capturing?' listening':''}" data-pf="key" aria-label="Mudar a tecla da skill">${capturing?'Aperte uma tecla…':`<kbd>${e(keyLabel(loadout.key))}</kbd>Mudar`}</button></div>
      <p class="pf-hint${keyError?' error':''}" role="status">${e(keyError||'Letras e números que o jogo ainda não usa. Vale só para esta skin.')}</p>`;
  }
  function employmentHtml():string {
    if(!employment)return '<p class="pf-empty"><span class="loader" aria-hidden="true"></span></p>';
    const job=employment.employment,cooldown=job?.cooldownUntil?new Date(job.cooldownUntil):undefined,waiting=!!cooldown&&cooldown.getTime()>Date.now();
    if(job?.status==='applied')return `<div class="pf-lead"><h3>Operador de Spray Dry</h3><p><b>Candidatura enviada.</b> Os donos e gerentes da EMPRESA BRASIL vão avaliar; quando você for admitido, entre em expediente na entrada de pessoal.</p><button class="button secondary" data-pf="employment-withdraw">Cancelar candidatura</button></div>`;
    if(!job||job.status!=='hired')return `<div class="pf-lead"><h3>Operador de Spray Dry</h3><p>Trabalhe na EMPRESA BRASIL. Candidate-se: um dono ou gerente da empresa precisa admitir você; depois, entre em expediente no ponto da entrada de pessoal.</p>${waiting?`<p>Nova candidatura disponível em <b>${cooldown!.toLocaleString('pt-BR')}</b>.</p>`:`<button class="button primary" data-pf="employment-hire">Candidatar-se</button>`}</div>`;
    return `<div class="pf-lead"><h3>Operador de Spray Dry</h3><p><b>${employment.shift?'Em serviço':'Contratado'}</b>${employment.shift?` · desde ${new Date(employment.shift.startedAt).toLocaleTimeString('pt-BR')} · estação ${e(employment.shift.station)}`:''}</p><p>Admitido em ${new Date(job.hiredAt).toLocaleDateString('pt-BR')}.</p><button class="button secondary" data-pf="employment-resign">Pedir demissão</button><p class="pf-hint">A demissão encerra o expediente e inicia o cooldown configurado.</p></div>`;
  }
  async function loadEmployment():Promise<void>{const opened=generation;try{const next=await api<EmploymentView>('/employment');if(opened===generation&&tab==='employment'){employment=next;render();}}catch(error){hooks.toast(error instanceof Error?error.message:'Não foi possível ler o emprego.',true);}}
  async function employmentAction(action:'hire'|'resign'|'withdraw'):Promise<void>{if(busy)return;busy=true;try{employment=await api<EmploymentView|{employment:EmploymentView['employment'] }>(`/employment/${action}`,{requestId:crypto.randomUUID()}).then(()=>api<EmploymentView>('/employment'));render();hooks.toast(action==='hire'?'Candidatura enviada. Um dono ou gerente vai avaliar.':action==='withdraw'?'Candidatura cancelada.':'Demissão registrada.');}catch(error){hooks.toast(error instanceof Error?error.message:'Não foi possível alterar o emprego.',true);}finally{busy=false;}}
  /** Level, rank and the XP bar, for anyone's profile (docs/sistemas/niveis.md). */
  function levelHtml(xp:number):string {
    const p=levelOf(xp),rank=rankOf(p.level),pct=p.need?p.into/p.need*100:100;
    return `<div class="pf-level" style="--rank:${rank.colors[0]}">${rankIcon(p.level,36)}<b>Nível <span>${p.level}</span> · ${e(rank.name)}</b><span class="lv-bar" role="progressbar" aria-label="XP do nível" aria-valuemin="0" aria-valuemax="${p.need||p.xp}" aria-valuenow="${p.need?p.into:p.xp}"><i class="lv-fill" style="width:${pct.toFixed(1)}%"></i><em class="lv-xp">${p.need?`${p.into.toLocaleString('pt-BR')} / ${p.need.toLocaleString('pt-BR')} XP`:`${p.xp.toLocaleString('pt-BR')} XP · máximo`}</em></span></div>`;
  }
  function render():void {
    if(!window_||!view)return;
    const v=view,photo=v.photo?`<img src="/api/phone/gram/avatars/${encodeURIComponent(v.id)}?v=${e(v.photo)}" alt="">`:e(v.name.slice(0,1).toUpperCase());
    window_.head.innerHTML=`<span class="pf-avatar" style="--avatar:${e(v.color)}">${photo}</span><div class="pf-id"><h2>${e(v.name)}</h2>${levelHtml(v.xp)}<button type="button" class="pf-gram" data-pf="gram" title="Abrir no Highgram">${uiIcon('gram')}<span>@${e(v.handle)}</span>${uiIcon('chevronRight')}</button></div>`;
    window_.setLabel(v.mine?'Seu perfil':`Perfil de ${v.name}`);
    // The company tab redraws on every push from the room: what is being typed (and the focus) must survive it.
    const typed=new Map<string,string>();let focusName='',caret:number|null=null;
    if(tab==='company')window_.body.querySelectorAll<HTMLInputElement>('input[name^="co-"]').forEach(input=>{typed.set(input.name,input.value);if(document.activeElement===input){focusName=input.name;caret=input.selectionStart;}});
    shownRole=company.role;
    const tabsScroll=window_.body.querySelector<HTMLElement>('.pf-tabs')?.scrollLeft??0;
    window_.element.classList.toggle('pf-wide',tab==='company'&&!!company.role);
    window_.body.innerHTML=`${v.mine?`<nav class="pf-tabs" role="tablist"><button type="button" role="tab" data-pf="tab" data-tab="profile" aria-selected="${tab==='profile'}">Perfil</button><button type="button" role="tab" data-pf="tab" data-tab="achievements" aria-selected="${tab==='achievements'}">Conquistas</button><button type="button" role="tab" data-pf="tab" data-tab="skill" aria-selected="${tab==='skill'}">Skill</button><button type="button" role="tab" data-pf="tab" data-tab="employment" aria-selected="${tab==='employment'}">Meu emprego</button>${company.role?`<button type="button" role="tab" data-pf="tab" data-tab="company" aria-selected="${tab==='company'}">Gerenciar empresa</button>`:''}</nav>`:''}<div class="pf-panel">${tab==='company'&&v.mine&&company.role?company.html():tab==='employment'&&v.mine?employmentHtml():tab==='skill'&&v.mine?skillHtml(v):tab==='achievements'&&v.mine?achievementsHtml():profileHtml(v)}</div>`;
    {const nav=window_.body.querySelector<HTMLElement>('.pf-tabs');if(nav){nav.scrollLeft=tabsScroll;nav.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});}}
    if(typed.size)window_.body.querySelectorAll<HTMLInputElement>('input[name^="co-"]').forEach(input=>{const value=typed.get(input.name);if(value!==undefined)input.value=value;if(input.name===focusName){input.focus();if(caret!==null)input.setSelectionRange(caret,caret);}});
    if(tab==='profile'||!v.mine)void showPortrait(v);
    if(editing){const input=window_.body.querySelector<HTMLInputElement>('[name="status"]');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}
  }
  async function showPortrait(v:ProfileView):Promise<void> {
    const opened=generation;
    let src=portraits.get(v.skin);
    if(!src){
      src=await hooks.portrait(v.skin).catch(()=>undefined);
      if(src)portraits.set(v.skin,src);
    }
    const slot=window_?.body.querySelector<HTMLElement>('.pf-model');if(!slot||opened!==generation||view?.skin!==v.skin)return;
    // The store's picture stands in when the scene could not draw the skin.
    slot.innerHTML=`<img class="${src?'':'pf-fallback'}" src="${src??`${import.meta.env.BASE_URL}skins/cards/${encodeURIComponent(v.skin)}.webp`}" alt="" draggable="false">`;
  }
  function closePicker():void {picker?.close();picker=undefined;hideTip();}
  function openPicker():void {
    if(!view?.owned)return;
    closePicker();
    const chosen=view.badges.map(badge=>badge.id),owned=view.owned;
    const win=floatingWindow({className:'pf-picker',label:'Escolher emblemas',onClose:()=>{picker=undefined;hideTip();},near:window_?.element});
    picker=win;wireTips(win.body);
    win.head.innerHTML='<div class="pf-id"><h2>Editar emblemas</h2><small>O que aparece no seu perfil</small></div>';
    const draw=()=>{
      win.body.innerHTML=`<p class="pf-lead">Escolha até ${PROFILE.shownBadges}. Passe o mouse para ler a descrição, e abra a carta no canto de cada um.</p>
        ${owned.length?`<div class="pf-collection">${owned.map(badge=>{const at=chosen.indexOf(badge.id);return `<span class="pf-tile-box"><button type="button" class="pf-tile${at>=0?' on':''}" ${rarityAttributes(badge)} aria-pressed="${at>=0}" data-pick="${e(badge.id)}" data-tip-title="${e(badge.name)}" data-tip-rarity="${e(badge.rarity)}" data-tip-text="${e(badge.description)}">${badgeMedal(badge)}<small>${e(badge.name)}</small>${at>=0?`<i>${at+1}</i>`:''}</button><button type="button" class="pf-tile-view" data-view="${e(badge.id)}" aria-label="Ver a carta de ${e(badge.name)}" title="Ver a carta">${uiIcon('maximize')}</button></span>`;}).join('')}</div>`:'<p class="pf-empty">Você ainda não tem emblemas. Eles são conquistados jogando na cidade.</p>'}
        <footer class="pf-picker-foot"><small>${chosen.length}/${PROFILE.shownBadges} em exibição</small><button type="button" class="button primary" data-pick-save ${owned.length?'':'disabled'}>Salvar</button></footer>`;
    };
    win.body.addEventListener('click',event=>{
      const target=event.target as HTMLElement,tile=target.closest<HTMLElement>('[data-pick]'),view=target.closest<HTMLElement>('[data-view]');
      if(view){const badge=owned.find(each=>each.id===view.dataset.view);if(badge){hideTip();openBadgeCard(badge,view);}return;}
      if(tile){
        const id=tile.dataset.pick!,at=chosen.indexOf(id);
        if(at>=0)chosen.splice(at,1);
        else if(chosen.length<PROFILE.shownBadges)chosen.push(id);
        else{hooks.toast(`Só cabem ${PROFILE.shownBadges} emblemas. Tire um para escolher outro.`);return;}
        hideTip();draw();win.body.querySelector<HTMLElement>(`[data-pick="${CSS.escape(id)}"]`)?.focus();return;
      }
      if(target.closest('[data-pick-save]'))void change(()=>api<ProfileView>('/profile/badges',{badges:chosen})).then(ok=>{if(ok)closePicker();});
    });
    draw();
  }
  /** Applies a change on the server; the window redraws what it answers. */
  async function change(job:()=>Promise<ProfileView>):Promise<boolean> {
    if(busy)return false;
    busy=true;const opened=generation;
    try{const next=await job();if(opened===generation){view=next;render();}return true;}
    catch(error){hooks.toast(error instanceof Error?error.message:'Não foi possível salvar.',true);return false;}
    finally{busy=false;}
  }
  const person=(v:ProfileView):ProfilePerson=>({id:v.id,name:v.name,color:v.color,number:v.number,...(v.photo?{photo:v.photo}:{})});
  /** The next key pressed becomes the skill's, and reaches nothing else in the game. */
  function captureKey():void {
    capturing=true;keyError='';render();
    const stop=()=>{capturing=false;window.removeEventListener('keydown',press,true);window.removeEventListener('pointerdown',away,true);cancelCapture=undefined;};
    const away=()=>{stop();render();};
    const press=(event:KeyboardEvent)=>{
      event.preventDefault();event.stopPropagation();
      if(event.repeat||['Shift','Control','Alt','Meta'].includes(event.key))return;
      stop();
      if(event.key!=='Escape'){
        if(isSkillKey(event.code)&&view){
          const loadout=loadoutOf(view.loadouts,view.skin,view.ownedSkills??[])!;
          void change(()=>api<ProfileView>('/profile/skill',{skill:loadout.skill,key:event.code})).then(ok=>{if(ok&&view?.loadouts)hooks.loadouts(view.loadouts);});
          return;
        }
        keyError=isTakenKey(event.code)?`${keyLabel(event.code)} já é usada pelo jogo. Escolha outra.`:'Use uma letra ou um número.';
      }
      render();
    };
    cancelCapture=stop;
    window.addEventListener('keydown',press,true);window.addEventListener('pointerdown',away,true);
  }
  let cancelCapture:(()=>void)|undefined;
  function ensureWindow():FloatingWindow {
    if(window_){window_.front();return window_;}
    const win=floatingWindow({className:'pf-profile',label:'Perfil',onClose:()=>{window_=undefined;view=undefined;generation++;cancelCapture?.();closePicker();company.watch(false);company.reset();}});
    window_=win;
    wireTips(win.body);
    win.element.addEventListener('click',event=>{
      const co=(event.target as HTMLElement).closest<HTMLElement>('[data-co]');if(co&&view?.mine){company.click(co,win.element);return;}
      const button=(event.target as HTMLElement).closest<HTMLElement>('[data-pf]');if(!button||!view)return;
      const v=view;
      switch(button.dataset.pf){
        case 'gram':hooks.highgram(v.id);break;
        case 'tab':tab=button.dataset.tab==='company'?'company':button.dataset.tab==='employment'?'employment':button.dataset.tab==='skill'?'skill':button.dataset.tab==='achievements'?'achievements':'profile';editing=false;keyError='';cancelCapture?.();render();if(tab==='achievements')void loadAchievements();if(tab==='employment')void loadEmployment();break;
        case 'employment-hire':void employmentAction('hire');break;
        case 'employment-withdraw':void employmentAction('withdraw');break;
        case 'employment-resign':if(confirm('Pedir demissão e iniciar o cooldown?'))void employmentAction('resign');break;
        case 'status-edit':editing=true;render();break;
        case 'status-cancel':editing=false;render();break;
        case 'badges':openPicker();break;
        case 'medal':{const badge=v.badges.find(each=>each.id===button.dataset.id);if(badge){hideTip();openBadgeCard(badge,button);}break;}
        case 'achievement':{const badge=achievements?.flatMap(series=>series.tiers).find(tier=>tier.badge.id===button.dataset.id)?.badge;if(badge){hideTip();openBadgeCard(badge,button);}break;}
        case 'skill':{
          const key=loadoutOf(v.loadouts,v.skin,v.ownedSkills??[])!.key,skill=button.dataset.skill!;
          void change(()=>api<ProfileView>('/profile/skill',{skill,key})).then(ok=>{if(ok&&view?.loadouts)hooks.loadouts(view.loadouts);});
          break;
        }
        case 'key':if(capturing)cancelCapture?.();captureKey();break;
        case 'skill-shop':hooks.collection(v.skin);break;
        case 'copy':void navigator.clipboard.writeText(v.number).then(()=>hooks.toast('Número copiado.'),()=>hooks.toast(`Seu número: ${v.number}`));break;
        case 'save':void change(async()=>{await api('/phone/contacts',{userId:v.id});hooks.contactSaved();hooks.toast('Contato salvo na agenda do celular.');return api<ProfileView>(`/profile/${encodeURIComponent(v.id)}`);});break;
        case 'message':hooks.message(person(v));break;
        case 'call':hooks.call(person(v));break;
      }
    });
    win.element.addEventListener('submit',event=>{
      event.preventDefault();
      const input=(event.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="status"]');if(!input)return;
      void change(()=>api<ProfileView>('/profile/status',{status:input.value})).then(ok=>{if(ok){editing=false;render();}});
    });
    win.element.addEventListener('input',event=>{
      const input=event.target as HTMLInputElement;if(input.name?.startsWith('co-')){company.input(input);return;}
      if(input.name!=='status')return;
      const count=win.element.querySelector('[data-pf-count]');if(count)count.textContent=`${input.value.length}/${PROFILE.statusMax}`;
    });
    // Esc leaves the box being edited, not the window.
    win.element.addEventListener('keydown',event=>{if(event.key==='Escape'&&editing){event.stopPropagation();editing=false;render();}});
    return win;
  }
  return {
    get isOpen():boolean {return !!window_;},
    get ownId():string|undefined {return view?.mine?view.id:undefined;},
    async open(id:string):Promise<void> {
      const win=ensureWindow(),opened=++generation;
      editing=false;keyError='';
      if(view?.id!==id){
        view=undefined;tab='profile';closePicker();
        win.head.innerHTML='<div class="pf-id"><h2>Perfil</h2></div>';win.body.innerHTML='<p class="pf-empty"><span class="loader" aria-hidden="true"></span></p>';
      }
      try{
        const next=await api<ProfileView>(`/profile/${encodeURIComponent(id)}`);
        if(opened!==generation)return;
        view=next;if(next.mine&&!company.known)company.watch(true);render();win.settle();
        if(tab==='achievements'&&next.mine)void loadAchievements();
      }catch(error){if(opened===generation)win.body.innerHTML=`<p class="pf-empty">${e(error instanceof Error?error.message:'Não foi possível abrir o perfil.')}</p>`;}
    },
    /** The room's answers to the company tab (state, result of an action, name search). */
    companyMessage(kind:'state'|'result'|'search',payload:unknown):void {
      if(kind==='state')company.setState(payload);else if(kind==='result')company.setResult(payload as CompanyResult);else company.setSearch((payload as {players?:Array<{userId:string;name:string}>}).players??[]);
    },
    /** An owner or manager changed this player's job (admitted, dismissed, turned down): the employment tab reads it again. */
    employmentChanged():void {if(window_&&tab==='employment')void loadEmployment();},
    /** Esc: the topmost of the two windows. */
    closeTop():boolean {
      if(picker){closePicker();return true;}
      if(window_){window_.close();return true;}
      return false;
    },
    close():void {closePicker();window_?.close();},
  };
}
