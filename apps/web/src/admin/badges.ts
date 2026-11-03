import {BADGE_ICONS,BADGE_RARITIES,BADGE_RARITY_INFO,PROFILE,RAREST_BADGE,achievementAmount,achievementOfBadge,type AdminAccount,type AdminBadge,type AdminBadgeHolder,type AdminOverview,type BadgeRarity} from '@bar/shared';
import {ApiError} from '../api';
import {badgeImageUrl,badgeMedal,openBadgeCard} from '../profile/badge-card';
import {ago,card,e,empty,n,reasonField,uiIcon,type SectionFactory} from './kit';

const COLORS=['#fac416','#f59847','#ea2fdc','#a77bff','#17d4f4','#0386f0','#5fd86c','#e0e4ec'];
const BLANK={name:'',description:'',icon:'trophy',color:COLORS[0]!,rarity:'common' as BadgeRarity,image:null as string|null};
const PAGE_SIZE=8;
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

/** The file as the server keeps it: a PNG of at most PROFILE.badgeImageSide on its longest side, transparency intact. */
export async function badgePng(file:File):Promise<Blob> {
  if(file.type!=='image/png')throw new Error('Envie um arquivo PNG.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('Não foi possível abrir este PNG.');});
  const scale=Math.min(1,PROFILE.badgeImageSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d')!;
  context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível preparar a imagem.')),'image/png'));
}
/** Sends the bytes, not JSON (as phone/media.ts); answers the image's id. */
export async function sendBadgeImage(blob:Blob):Promise<string> {
  const response=await fetch('/api/admin/badges/images',{method:'POST',credentials:'include',headers:{'Content-Type':'image/png'},body:blob});
  const data=await response.json().catch(()=>({error:'O servidor não respondeu como esperado.'}));
  if(!response.ok)throw new ApiError(data.error||'Não foi possível enviar a imagem.',response.status);
  return data.id;
}

/** Emblemas: the catalog, and who has each one. Players choose which they show in their profile (docs/sistemas/perfil.md). */
export const badgesSection:SectionFactory=(root,ctx)=>{
  let badges:AdminBadge[]=[],images:string[]=[],selected='',holders:AdminBadgeHolder[]=[],disposed=false,loaded=false;
  let editing:string|null=null,draft={...BLANK},draftReason='',grantReason='';
  let view:'catalog'|'edit'|'holders'='catalog',query='',rarityFilter='',originFilter='',sort='name',page=0,catalogScroll=0;
  let holdersFor='',holdersLoading=false,holdersError='',holderRequest=0,searchRequest=0;
  /** The removal waiting for its reason. */
  let removing:{kind:'delete'|'revoke'|'image';id:string;title:string}|undefined;
  let search='',found:AdminAccount[]=[],target:AdminAccount|undefined,searchTimer:ReturnType<typeof setTimeout>|undefined;

  const current=()=>badges.find(badge=>badge.id===selected);
  function formHtml():string {
    const title=editing?'Editar emblema':'Novo emblema';
    return `<form class="admin-badge-form admin-badge-editor" data-badge-form="save"><div class="admin-badge-editor-grid"><div>${card('Informações',`
      <label>Nome<input name="name" required minlength="2" maxlength="${PROFILE.badgeNameMax}" value="${e(draft.name)}"></label>
      <label>Descrição<textarea name="description" required minlength="3" maxlength="${PROFILE.badgeDescriptionMax}">${e(draft.description)}</textarea><small>Aparece no perfil e na carta do emblema.</small></label>
      ${reasonField('Motivo',editing?'O que mudou':'Por que este emblema existe')}`,{icon:'pencil'})}</div><div>${card('Aparência',`
      <button type="button" class="admin-badge-preview" data-badge="card-draft" title="Ver como fica a carta">${badgeMedal(draft)}<small>Ver a carta</small></button>
      <fieldset><legend>Raridade</legend><div class="admin-badge-rarities">${BADGE_RARITIES.map(rarity=>`<button type="button" data-badge-rarity="${rarity}" aria-pressed="${rarity===draft.rarity}" style="--rarity:${BADGE_RARITY_INFO[rarity].color}">${BADGE_RARITY_INFO[rarity].name}</button>`).join('')}</div><small class="admin-badge-hint">A mais rara, ${BADGE_RARITY_INFO[RAREST_BADGE].name}, é a carta cravejada de brilhos.</small></fieldset>
      <fieldset><legend>Ícone</legend><div class="admin-badge-icons">${BADGE_ICONS.map(icon=>`<button type="button" data-badge-icon="${icon}" aria-pressed="${!draft.image&&icon===draft.icon}" aria-label="${icon}">${uiIcon(icon)}</button>`).join('')}</div></fieldset>
      <fieldset><legend>Ou uma imagem sua</legend><div class="admin-badge-upload"><button type="button" class="mini-button" data-badge="upload">${uiIcon('image')}Enviar PNG</button>${draft.image&&!badges.some(badge=>badge.image===draft.image)?`<button type="button" class="mini-button" data-badge="image-delete">${uiIcon('trash')}Apagar esta imagem</button>`:''}<input type="file" accept="image/png" hidden data-badge-file><small>Aparece sem moldura, e fundo transparente fica melhor. Acima de ${PROFILE.badgeImageSide} px, a imagem é reduzida. Fica salva no servidor e pode ser usada em outros emblemas.</small></div>
        ${images.length?`<div class="admin-badge-icons">${images.map(id=>`<button type="button" data-badge-image="${e(id)}" aria-pressed="${id===draft.image}" aria-label="Imagem enviada"><img src="${e(badgeImageUrl(id))}" alt="" loading="lazy"></button>`).join('')}</div>`:''}</fieldset>
      ${draft.image?'':`<fieldset><legend>Cor</legend><div class="admin-badge-colors">${COLORS.map(color=>`<button type="button" data-badge-color="${color}" aria-pressed="${color===draft.color}" aria-label="Cor ${color}" style="--swatch:${color}"></button>`).join('')}</div></fieldset>`}
      `,{icon:'image'})}</div></div>
      <div class="admin-badge-actions admin-badge-save"><small>${e(title)} · alterações registradas no log</small><button type="button" class="mini-button" data-badge="cancel">Cancelar</button><button type="submit" class="button primary">${uiIcon(editing?'check':'plus')}${editing?'Salvar':'Criar emblema'}</button></div>
    </form>`;
  }
  /** What gives a badge by itself, for one that comes with the game (docs/sistemas/conquistas.md). */
  function earnedBy(id:string):string {
    const achievement=achievementOfBadge(id);
    return achievement?`<br><small class="admin-badge-earned">${uiIcon('trophy')}Automático, ao chegar a ${e(achievementAmount(achievement.series,achievement.series.goals[achievement.level]!))}</small>`:'';
  }
  function holdersHtml():string {
    const badge=current();if(!badge)return card('Quem tem',empty('Escolha um emblema no catálogo.'),{icon:'users'});
    if(holdersError)return card('Quem tem',`<p class="admin-note">${e(holdersError)}</p><button type="button" class="mini-button" data-badge="holders-retry">Tentar novamente</button>`,{icon:'users'});
    if(holdersLoading||holdersFor!==selected)return '<p class="admin-loading" role="status">Carregando os jogadores…</p>';
    return card(`Quem tem ${e(badge.name)}`,`<form class="admin-badge-grant" data-badge-form="grant">
        <label>Conceder a<input name="search" type="search" autocomplete="off" placeholder="Nome, usuário ou e-mail" value="${e(search)}"></label>
        ${target?`<p class="admin-note">Vai receber: <b>${e(target.displayName)}</b> (@${e(target.username)})</p>`:found.length?`<div class="admin-badge-found">${found.map(person=>`<button type="button" class="mini-button" data-badge-target="${e(person.id)}">${e(person.displayName)} <small>@${e(person.username)}</small></button>`).join('')}</div>`:''}
        ${target?`${reasonField('Motivo','Por que esta pessoa recebe o emblema')}<button type="submit" class="mini-button">${uiIcon('gift')}Conceder</button>`:''}
      </form>
      ${holders.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Jogador</th><th>Desde</th><th></th></tr></thead><tbody>${holders.map(person=>`<tr><td><button type="button" class="admin-link" data-admin-go-player="${e(person.id)}">${e(person.name)}</button></td><td>${ago(person.grantedAt)}</td><td><button type="button" class="mini-button" data-badge="revoke" data-id="${e(person.id)}">${uiIcon('trash')}Retirar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Ninguém tem este emblema ainda.')}`,{icon:'users'});
  }
  function filtered():AdminBadge[] {
    const text=normalize(query.trim());
    return badges.filter(badge=>(!text||normalize(`${badge.name} ${badge.description} ${badge.id}`).includes(text))&&(!rarityFilter||badge.rarity===rarityFilter)&&(!originFilter||Boolean(achievementOfBadge(badge.id))===(originFilter==='automatic')))
      .sort((a,b)=>sort==='holders'?b.holders-a.holders||a.name.localeCompare(b.name,'pt-BR'):sort==='rarity'?BADGE_RARITIES.indexOf(b.rarity)-BADGE_RARITIES.indexOf(a.rarity)||a.name.localeCompare(b.name,'pt-BR'):a.name.localeCompare(b.name,'pt-BR'));
  }
  function resultsHtml():string {
    const matches=filtered(),pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));page=Math.min(page,pages-1);
    return `<div class="admin-badge-results-head"><small role="status">${matches.length?`${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,matches.length)} de ${n(matches.length)} emblemas`: 'Nenhum emblema encontrado'}</small>${query||rarityFilter||originFilter?'<button type="button" class="text-button" data-badge="clear">Limpar filtros</button>':''}</div>
      ${matches.length?`<div class="admin-badge-catalog">${matches.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(badge=>`<article class="admin-badge-item" data-badge-id="${e(badge.id)}">
        <div class="admin-badge-item-head"><div class="admin-badge-cell"><button type="button" data-badge="card" data-id="${e(badge.id)}" aria-label="Ver a carta de ${e(badge.name)}">${badgeMedal(badge)}</button></div><div><h4>${e(badge.name)}</h4><span class="admin-badge" style="color:${BADGE_RARITY_INFO[badge.rarity].color}">${BADGE_RARITY_INFO[badge.rarity].name}</span><small>${n(badge.holders)} ${badge.holders===1?'jogador':'jogadores'}</small></div></div>
        <p class="admin-badge-item-description">${e(badge.description)}</p>${earnedBy(badge.id)}
        <div class="admin-badge-row"><button type="button" class="mini-button" data-badge="edit" data-id="${e(badge.id)}">${uiIcon('pencil')}Editar</button><button type="button" class="mini-button" data-badge="select" data-id="${e(badge.id)}">${uiIcon('users')}Quem tem</button><button type="button" class="mini-button danger" data-badge="delete" data-id="${e(badge.id)}" aria-label="Apagar ${e(badge.name)}">${uiIcon('trash')}</button></div>
      </article>`).join('')}</div>`:empty(badges.length?'Tente outro nome ou ajuste os filtros.':'Nenhum emblema criado. Use Novo emblema para começar.')}
      <nav class="admin-pagination" aria-label="Páginas de emblemas"><button type="button" class="mini-button" data-badge="prev" ${page===0?'disabled':''}>Anterior</button><small>Página ${page+1} de ${pages}</small><button type="button" class="mini-button" data-badge="next" ${page>=pages-1?'disabled':''}>Próxima</button></nav>`;
  }
  function catalogHtml():string {
    const given=badges.reduce((sum,badge)=>sum+badge.holders,0);
    return `<div class="admin-badge-toolbar"><div><h4>Catálogo de emblemas</h4><small>${n(badges.length)} no catálogo · ${n(given)} concessões · até ${PROFILE.shownBadges} por perfil</small></div><button type="button" class="button primary" data-badge="new">${uiIcon('plus')}Novo emblema</button></div>
      <div class="admin-badge-filters"><label>Buscar emblema<input type="search" name="badge-query" placeholder="Nome ou descrição" value="${e(query)}" autocomplete="off"></label>
      <label>Raridade<select name="badge-rarity"><option value="">Todas as raridades</option>${BADGE_RARITIES.map(rarity=>`<option value="${rarity}" ${rarityFilter===rarity?'selected':''}>${BADGE_RARITY_INFO[rarity].name}</option>`).join('')}</select></label>
      <label>Origem<select name="badge-origin"><option value="">Todas as origens</option><option value="automatic" ${originFilter==='automatic'?'selected':''}>Conquistas automáticas</option><option value="manual" ${originFilter==='manual'?'selected':''}>Concessão manual</option></select></label>
      <label>Ordenar por<select name="badge-sort">${[['name','Nome'],['rarity','Mais raros'],['holders','Mais jogadores']].map(([value,label])=>`<option value="${value}" ${sort===value?'selected':''}>${label}</option>`).join('')}</select></label></div>
      <div data-badge-results>${resultsHtml()}</div>`;
  }
  function workspaceHtml():string {
    const badge=current();
    return `<div class="admin-badge-workspace-head"><button type="button" class="mini-button" data-badge="back">${uiIcon('chevronLeft')}Catálogo</button><h4>${e(editing?draft.name||badge?.name||'Editar emblema':view==='holders'?badge?.name??'Quem tem':'Novo emblema')}</h4></div>
      ${selected&&editing?`<nav class="admin-subtabs" aria-label="Gerenciar emblema"><button type="button" data-badge="tab-edit" aria-pressed="${view==='edit'}">Editar emblema</button><button type="button" data-badge="tab-holders" aria-pressed="${view==='holders'}">Quem tem <i>${n(badge?.holders??0)}</i></button></nav>`:''}
      ${view==='edit'?formHtml():holdersHtml()}`;
  }
  function render():void {
    if(disposed)return;
    if(!loaded){root.innerHTML='<p class="admin-loading">Carregando os emblemas…</p>';return;}
    const scroll=root.scrollTop;
    const active=document.activeElement,focusAttribute=active instanceof HTMLElement&&root.contains(active)?['data-badge-icon','data-badge-image','data-badge-color','data-badge-rarity','name'].find(attribute=>active.hasAttribute(attribute)):undefined;
    const focusSelector=focusAttribute?`[${focusAttribute}="${CSS.escape(active!.getAttribute(focusAttribute)!)}"]`:undefined;
    const paletteScroll=[...root.querySelectorAll('.admin-badge-icons')].map(element=>element.scrollTop);
    root.innerHTML=`<div class="admin-badge-manager">${removing?`<form class="admin-badge-confirm" data-badge-form="remove"><b>${e(removing.title)}</b>${reasonField('Motivo')}<div class="admin-badge-actions"><button type="submit" class="mini-button danger">${uiIcon('trash')}Confirmar</button><button type="button" class="mini-button" data-badge="keep">Cancelar</button></div></form>`:''}${view==='catalog'?catalogHtml():workspaceHtml()}
      <p class="fine-print">Tudo fica registrado no log. Apagar um emblema também o tira de quem já o tinha. Um emblema automático apagado deixa de ser dado; retirado de alguém, só volta com a concessão manual.</p></div>`;
    const saveReason=root.querySelector<HTMLTextAreaElement>('[data-badge-form="save"] [name="reason"]');if(saveReason)saveReason.value=draftReason;
    const giveReason=root.querySelector<HTMLTextAreaElement>('[data-badge-form="grant"] [name="reason"]');if(giveReason)giveReason.value=grantReason;
    root.querySelectorAll('.admin-badge-icons').forEach((element,index)=>{element.scrollTop=paletteScroll[index]??0;});
    if(focusSelector)root.querySelector<HTMLElement>(focusSelector)?.focus({preventScroll:true});
    root.scrollTop=scroll;
    if(removing){root.scrollTop=0;root.querySelector<HTMLTextAreaElement>('[data-badge-form="remove"] [name="reason"]')?.focus({preventScroll:true});}
  }
  function results():void {const slot=root.querySelector('[data-badge-results]');if(slot)slot.innerHTML=resultsHtml();}
  function back():void {keepDraft();view='catalog';removing=undefined;render();root.scrollTop=catalogScroll;root.querySelector<HTMLElement>(`[data-badge="edit"][data-id="${CSS.escape(selected)}"]`)?.focus({preventScroll:true});}
  function open(id:string,tab:'edit'|'holders'):void {
    keepDraft();if(view==='catalog')catalogScroll=root.scrollTop;
    const badge=badges.find(each=>each.id===id);if(!badge)return;
    if(editing!==id){editing=id;draft={name:badge.name,description:badge.description,icon:badge.icon,color:badge.color,rarity:badge.rarity,image:badge.image};draftReason='';}
    if(selected!==id){selected=id;holdersFor='';holders=[];target=undefined;search='';found=[];grantReason='';clearTimeout(searchTimer);searchRequest++;}
    view=tab;removing=undefined;render();root.scrollTop=0;
    if(tab==='edit')root.querySelector<HTMLInputElement>('[name="name"]')?.focus({preventScroll:true});
    else void ctx.run(loadHolders,'');
  }
  /** What is being typed survives a redraw of the section. */
  function keepDraft():void {
    const form=root.querySelector<HTMLFormElement>('[data-badge-form="save"]');
    if(form){const data=new FormData(form);draft.name=String(data.get('name')??'');draft.description=String(data.get('description')??'');draftReason=reason(form);}
    const grant=root.querySelector<HTMLFormElement>('[data-badge-form="grant"]');if(grant)grantReason=reason(grant);
  }
  function reason(form:HTMLFormElement):string {return String(new FormData(form).get('reason')??'');}
  async function load():Promise<void> {
    const result=await ctx.api<{badges:AdminBadge[];images:string[]}>('/admin/badges');if(disposed)return;
    badges=result.badges;images=result.images;loaded=true;
    if(!current())selected=badges[0]?.id??'';
    if(view==='holders')await loadHolders();else render();
  }
  async function loadHolders():Promise<void> {
    const id=selected,request=++holderRequest;holdersLoading=true;holdersError='';render();
    try {
      const result=id?(await ctx.api<{holders:AdminBadgeHolder[]}>(`/admin/badges/${encodeURIComponent(id)}/holders`)).holders:[];
      if(disposed||request!==holderRequest||id!==selected)return;
      keepDraft();holders=result;holdersFor=id;
    } catch(error){if(!disposed&&request===holderRequest)holdersError='Não foi possível carregar os jogadores.';throw error;}
    finally {if(!disposed&&request===holderRequest){holdersLoading=false;render();}}
  }
  async function find():Promise<void> {
    const text=search.trim(),request=++searchRequest,id=selected;
    const people=text.length<2?[]:(await ctx.api<AdminOverview>(`/admin/overview?search=${encodeURIComponent(text)}&limit=6`)).users;
    if(disposed||request!==searchRequest||text!==search.trim()||id!==selected||view!=='holders')return;
    found=people;
    const input=root.querySelector<HTMLInputElement>('[name="search"]'),focused=document.activeElement===input,at=input?.selectionStart??text.length;
    keepDraft();render();
    const next=root.querySelector<HTMLInputElement>('[name="search"]');if(focused){next?.focus({preventScroll:true});next?.setSelectionRange(at,at);}
  }
  const click=(event:MouseEvent)=>{
    const element=event.target as HTMLElement;
    const person=element.closest<HTMLElement>('[data-admin-go-player]');
    if(person){ctx.go('players',{player:person.dataset.adminGoPlayer!});return;}
    const icon=element.closest<HTMLElement>('[data-badge-icon]');
    if(icon){keepDraft();draft.icon=icon.dataset.badgeIcon!;draft.image=null;render();return;}
    const image=element.closest<HTMLElement>('[data-badge-image]');
    if(image){keepDraft();draft.image=image.dataset.badgeImage!;render();return;}
    const color=element.closest<HTMLElement>('[data-badge-color]');
    if(color){keepDraft();draft.color=color.dataset.badgeColor!;render();return;}
    const rarity=element.closest<HTMLElement>('[data-badge-rarity]');
    if(rarity){keepDraft();draft.rarity=rarity.dataset.badgeRarity as BadgeRarity;render();return;}
    const pick=element.closest<HTMLElement>('[data-badge-target]');
    if(pick){keepDraft();target=found.find(each=>each.id===pick.dataset.badgeTarget);search=target?.displayName??'';found=[];render();return;}
    const button=element.closest<HTMLElement>('[data-badge]');if(!button)return;
    const id=button.dataset.id??'';
    switch(button.dataset.badge){
      case 'card':{const badge=badges.find(each=>each.id===id);if(badge)openBadgeCard(badge,button);break;}
      case 'card-draft':keepDraft();openBadgeCard({...draft,name:draft.name||'Nome do emblema',description:draft.description||'A descrição aparece aqui.'},button);break;
      case 'new':keepDraft();catalogScroll=root.scrollTop;editing=null;selected='';draft={...BLANK};draftReason='';view='edit';render();root.scrollTop=0;root.querySelector<HTMLInputElement>('[name="name"]')?.focus({preventScroll:true});break;
      case 'select':open(id,'holders');break;
      case 'edit':open(id,'edit');break;
      case 'tab-edit':open(selected,'edit');break;
      case 'tab-holders':open(selected,'holders');break;
      case 'holders-retry':void ctx.run(loadHolders,'');break;
      case 'back':back();break;
      case 'cancel':back();editing=null;draft={...BLANK};draftReason='';break;
      case 'prev':case 'next':page+=button.dataset.badge==='next'?1:-1;results();root.scrollTop=0;root.querySelector<HTMLElement>('[data-badge="'+button.dataset.badge+'"]')?.focus({preventScroll:true});break;
      case 'clear':query='';rarityFilter='';originFilter='';page=0;render();root.scrollTop=0;root.querySelector<HTMLInputElement>('[name="badge-query"]')?.focus({preventScroll:true});break;
      case 'upload':root.querySelector<HTMLInputElement>('[data-badge-file]')?.click();break;
      case 'image-delete':if(draft.image){keepDraft();removing={kind:'image',id:draft.image,title:'Apagar esta imagem do servidor?'};render();}break;
      case 'delete':{
        const badge=badges.find(each=>each.id===id);if(!badge)break;
        keepDraft();removing={kind:'delete',id,title:`Apagar ${badge.name}${badge.holders?` e tirar de ${badge.holders} jogador(es)`:''}?`};render();
        break;
      }
      case 'revoke':{
        const holder=holders.find(each=>each.id===id);if(!holder)break;
        keepDraft();removing={kind:'revoke',id,title:`Retirar o emblema de ${holder.name}?`};render();
        break;
      }
      case 'keep':keepDraft();removing=undefined;render();break;
    }
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;event.preventDefault();
    if(form.dataset.badgeForm==='remove'&&removing){
      const {kind,id}=removing,why=reason(form);keepDraft();
      if(kind==='delete')void ctx.run(async()=>{badges=(await ctx.api<{badges:AdminBadge[]}>('/admin/badges/delete',{id,reason:why})).badges;removing=undefined;if(editing===id){editing=null;draft={...BLANK};draftReason='';}if(selected===id)selected='';render();},'Emblema apagado.');
      else if(kind==='image')void ctx.run(async()=>{images=(await ctx.api<{images:string[]}>('/admin/badges/images/delete',{id,reason:why})).images;removing=undefined;if(draft.image===id)draft.image=null;render();},'Imagem apagada.');
      else void ctx.run(async()=>{await ctx.api('/admin/badges/grant',{badgeId:selected,playerId:id,grant:false,reason:why});removing=undefined;await load();},'Emblema retirado.');
    }else if(form.dataset.badgeForm==='save'){
      keepDraft();
      const why=reason(form),id=editing;
      const saved={...draft};
      void ctx.run(async()=>{badges=(await ctx.api<{badges:AdminBadge[]}>('/admin/badges',{...(id?{id}:{}),...saved,reason:why})).badges;back();editing=null;draft={...BLANK};draftReason='';},id?'Emblema salvo.':'Emblema criado.');
    }else if(form.dataset.badgeForm==='grant'&&target){
      keepDraft();
      const why=reason(form),player=target;
      void ctx.run(async()=>{await ctx.api('/admin/badges/grant',{badgeId:selected,playerId:player.id,grant:true,reason:why});target=undefined;search='';found=[];grantReason='';await load();},`Emblema concedido a ${player.displayName}.`);
    }
  };
  const input=(event:Event)=>{
    const field=event.target as HTMLInputElement;
    if(field.name==='badge-query'){query=field.value;page=0;results();return;}
    if(field.name!=='search')return;
    search=field.value;target=undefined;
    searchRequest++;
    clearTimeout(searchTimer);searchTimer=setTimeout(()=>void find().catch(()=>{}),250);
  };
  const change=(event:Event)=>{
    const field=event.target as HTMLInputElement;
    if(field.name==='badge-rarity'){rarityFilter=field.value;page=0;results();return;}
    if(field.name==='badge-origin'){originFilter=field.value;page=0;results();return;}
    if(field.name==='badge-sort'){sort=field.value;page=0;results();return;}
    const file=field.matches('[data-badge-file]')?field.files?.[0]:undefined;if(!file)return;
    keepDraft();
    void ctx.run(async()=>{const id=await sendBadgeImage(await badgePng(file));images=[id,...images.filter(each=>each!==id)];draft.image=id;render();},'Imagem salva no servidor. Falta salvar o emblema para usá-la.');
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);root.addEventListener('input',input);root.addEventListener('change',change);
  render();void ctx.run(load,'');
  return {destroy(){disposed=true;clearTimeout(searchTimer);root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.removeEventListener('input',input);root.removeEventListener('change',change);}};
};
