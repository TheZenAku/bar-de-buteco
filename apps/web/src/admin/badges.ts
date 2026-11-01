import {BADGE_ICONS,BADGE_RARITIES,BADGE_RARITY_INFO,PROFILE,RAREST_BADGE,achievementAmount,achievementOfBadge,type AdminAccount,type AdminBadge,type AdminBadgeHolder,type AdminOverview,type BadgeRarity} from '@bar/shared';
import {ApiError} from '../api';
import {badgeImageUrl,badgeMedal,openBadgeCard} from '../profile/badge-card';
import {ago,card,e,empty,n,reasonField,stat,uiIcon,type SectionFactory} from './kit';

const COLORS=['#fac416','#f59847','#ea2fdc','#a77bff','#17d4f4','#0386f0','#5fd86c','#e0e4ec'];
const BLANK={name:'',description:'',icon:'trophy',color:COLORS[0]!,rarity:'common' as BadgeRarity,image:null as string|null};

/** The file as the server keeps it: a PNG of at most PROFILE.badgeImageSide on its longest side, transparency intact. */
async function badgePng(file:File):Promise<Blob> {
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
async function sendBadgeImage(blob:Blob):Promise<string> {
  const response=await fetch('/api/admin/badges/images',{method:'POST',credentials:'include',headers:{'Content-Type':'image/png'},body:blob});
  const data=await response.json().catch(()=>({error:'O servidor não respondeu como esperado.'}));
  if(!response.ok)throw new ApiError(data.error||'Não foi possível enviar a imagem.',response.status);
  return data.id;
}

/** Emblemas: the catalog, and who has each one. Players choose which they show in their profile (docs/sistemas/perfil.md). */
export const badgesSection:SectionFactory=(root,ctx)=>{
  let badges:AdminBadge[]=[],images:string[]=[],selected='',holders:AdminBadgeHolder[]=[],disposed=false,loaded=false;
  let editing:string|null=null,draft={...BLANK};
  /** The removal waiting for its reason. */
  let removing:{kind:'delete'|'revoke'|'image';id:string;title:string}|undefined;
  let search='',found:AdminAccount[]=[],target:AdminAccount|undefined,searchTimer:ReturnType<typeof setTimeout>|undefined;

  const current=()=>badges.find(badge=>badge.id===selected);
  function formHtml():string {
    const title=editing?'Editar emblema':'Novo emblema';
    return card(title,`<form class="admin-badge-form" data-badge-form="save">
      <button type="button" class="admin-badge-preview" data-badge="card-draft" title="Ver como fica a carta">${badgeMedal(draft)}<small>Ver a carta</small></button>
      <label>Nome<input name="name" required minlength="2" maxlength="${PROFILE.badgeNameMax}" value="${e(draft.name)}"></label>
      <label>Descrição (aparece ao passar o mouse e na carta)<textarea name="description" required minlength="3" maxlength="${PROFILE.badgeDescriptionMax}">${e(draft.description)}</textarea></label>
      <fieldset><legend>Raridade</legend><div class="admin-badge-rarities">${BADGE_RARITIES.map(rarity=>`<button type="button" data-badge-rarity="${rarity}" aria-pressed="${rarity===draft.rarity}" style="--rarity:${BADGE_RARITY_INFO[rarity].color}">${BADGE_RARITY_INFO[rarity].name}</button>`).join('')}</div><small class="admin-badge-hint">A mais rara, ${BADGE_RARITY_INFO[RAREST_BADGE].name}, é a carta cravejada de brilhos.</small></fieldset>
      <fieldset><legend>Ícone</legend><div class="admin-badge-icons">${BADGE_ICONS.map(icon=>`<button type="button" data-badge-icon="${icon}" aria-pressed="${!draft.image&&icon===draft.icon}" aria-label="${icon}">${uiIcon(icon)}</button>`).join('')}</div></fieldset>
      <fieldset><legend>Ou uma imagem sua</legend><div class="admin-badge-upload"><button type="button" class="mini-button" data-badge="upload">${uiIcon('image')}Enviar PNG</button>${draft.image&&!badges.some(badge=>badge.image===draft.image)?`<button type="button" class="mini-button" data-badge="image-delete">${uiIcon('trash')}Apagar esta imagem</button>`:''}<input type="file" accept="image/png" hidden data-badge-file><small>Aparece sem moldura, e fundo transparente fica melhor. Acima de ${PROFILE.badgeImageSide} px, a imagem é reduzida. Fica salva no servidor e pode ser usada em outros emblemas.</small></div>
        ${images.length?`<div class="admin-badge-icons">${images.map(id=>`<button type="button" data-badge-image="${e(id)}" aria-pressed="${id===draft.image}" aria-label="Imagem enviada"><img src="${e(badgeImageUrl(id))}" alt="" loading="lazy"></button>`).join('')}</div>`:''}</fieldset>
      ${draft.image?'':`<fieldset><legend>Cor</legend><div class="admin-badge-colors">${COLORS.map(color=>`<button type="button" data-badge-color="${color}" aria-pressed="${color===draft.color}" aria-label="Cor ${color}" style="--swatch:${color}"></button>`).join('')}</div></fieldset>`}
      ${reasonField('Motivo',editing?'O que mudou':'Por que este emblema existe')}
      <div class="admin-badge-actions"><button type="submit" class="mini-button">${uiIcon(editing?'check':'plus')}${editing?'Salvar':'Criar emblema'}</button>${editing?'<button type="button" class="mini-button" data-badge="cancel">Cancelar</button>':''}</div>
    </form>`,{icon:editing?'pencil':'plus'});
  }
  /** What gives a badge by itself, for one that comes with the game (docs/sistemas/conquistas.md). */
  function earnedBy(id:string):string {
    const achievement=achievementOfBadge(id);
    return achievement?`<br><small class="admin-badge-earned">${uiIcon('trophy')}Automático, ao chegar a ${e(achievementAmount(achievement.series,achievement.series.goals[achievement.level]!))}</small>`:'';
  }
  function holdersHtml():string {
    const badge=current();if(!badge)return card('Quem tem',empty('Escolha um emblema no catálogo.'),{icon:'users'});
    return card(`Quem tem ${e(badge.name)}`,`<form class="admin-badge-grant" data-badge-form="grant">
        <label>Conceder a<input name="search" type="search" autocomplete="off" placeholder="Nome, usuário ou e-mail" value="${e(search)}"></label>
        ${target?`<p class="admin-note">Vai receber: <b>${e(target.displayName)}</b> (@${e(target.username)})</p>`:found.length?`<div class="admin-badge-found">${found.map(person=>`<button type="button" class="mini-button" data-badge-target="${e(person.id)}">${e(person.displayName)} <small>@${e(person.username)}</small></button>`).join('')}</div>`:''}
        ${target?`${reasonField('Motivo','Por que esta pessoa recebe o emblema')}<button type="submit" class="mini-button">${uiIcon('gift')}Conceder</button>`:''}
      </form>
      ${holders.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Jogador</th><th>Desde</th><th></th></tr></thead><tbody>${holders.map(person=>`<tr><td><button type="button" class="admin-link" data-admin-go-player="${e(person.id)}">${e(person.name)}</button></td><td>${ago(person.grantedAt)}</td><td><button type="button" class="mini-button" data-badge="revoke" data-id="${e(person.id)}">${uiIcon('trash')}Retirar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Ninguém tem este emblema ainda.')}`,{icon:'users'});
  }
  function render():void {
    if(disposed)return;
    if(!loaded){root.innerHTML='<p class="admin-loading">Carregando os emblemas…</p>';return;}
    const given=badges.reduce((sum,badge)=>sum+badge.holders,0);
    root.innerHTML=`${removing?`<form class="admin-badge-confirm" data-badge-form="remove"><b>${e(removing.title)}</b>${reasonField('Motivo')}<div class="admin-badge-actions"><button type="submit" class="mini-button">${uiIcon('trash')}Confirmar</button><button type="button" class="mini-button" data-badge="keep">Cancelar</button></div></form>`:''}<div class="admin-stats">${stat('No catálogo',n(badges.length),'Emblemas criados')}${stat('Concedidos',n(given),'Somando todos os jogadores')}${stat('Em exibição',`até ${PROFILE.shownBadges}`,'Por perfil, à escolha do jogador')}</div>
      ${card(`Catálogo (${badges.length})`,badges.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th></th><th>Emblema</th><th>Raridade</th><th class="num">Jogadores</th><th></th></tr></thead><tbody>${badges.map(badge=>`<tr class="${badge.id===selected?'selected':''}"><td class="admin-badge-cell"><button type="button" data-badge="card" data-id="${e(badge.id)}" aria-label="Ver a carta de ${e(badge.name)}" title="Ver a carta">${badgeMedal(badge)}</button></td><td><b>${e(badge.name)}</b><br><small>${e(badge.description)}</small>${earnedBy(badge.id)}</td><td><span class="admin-badge" style="color:${BADGE_RARITY_INFO[badge.rarity].color}">${BADGE_RARITY_INFO[badge.rarity].name}</span></td><td class="num">${n(badge.holders)}</td>
          <td class="admin-badge-row"><button type="button" class="mini-button" data-badge="select" data-id="${e(badge.id)}">${uiIcon('users')}Quem tem</button><button type="button" class="mini-button" data-badge="edit" data-id="${e(badge.id)}">${uiIcon('pencil')}Editar</button><button type="button" class="mini-button" data-badge="delete" data-id="${e(badge.id)}">${uiIcon('trash')}Apagar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum emblema criado.'),{icon:'trophy'})}
      <div class="admin-grid">${holdersHtml()}${formHtml()}</div>
      <p class="fine-print">Tudo fica registrado no log. Apagar um emblema também o tira de quem já o tinha. Um emblema automático apagado deixa de ser dado; retirado de alguém, só volta com a concessão manual.</p>`;
  }
  /** What is being typed survives a redraw of the section. */
  function keepDraft():void {
    const form=root.querySelector<HTMLFormElement>('[data-badge-form="save"]');if(!form)return;
    const data=new FormData(form);draft.name=String(data.get('name')??'');draft.description=String(data.get('description')??'');
  }
  function reason(form:HTMLFormElement):string {return String(new FormData(form).get('reason')??'');}
  async function load():Promise<void> {
    const result=await ctx.api<{badges:AdminBadge[];images:string[]}>('/admin/badges');if(disposed)return;
    badges=result.badges;images=result.images;loaded=true;
    if(!current())selected=badges[0]?.id??'';
    await loadHolders();
  }
  async function loadHolders():Promise<void> {
    holders=selected?(await ctx.api<{holders:AdminBadgeHolder[]}>(`/admin/badges/${encodeURIComponent(selected)}/holders`)).holders:[];
    if(!disposed)render();
  }
  async function find():Promise<void> {
    const text=search.trim();
    found=text.length<2?[]:(await ctx.api<AdminOverview>(`/admin/overview?search=${encodeURIComponent(text)}&limit=6`)).users;
    if(disposed)return;
    const input=root.querySelector<HTMLInputElement>('[name="search"]'),at=input?.selectionStart??text.length;
    keepDraft();render();
    const next=root.querySelector<HTMLInputElement>('[name="search"]');next?.focus();next?.setSelectionRange(at,at);
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
      case 'select':keepDraft();selected=id;target=undefined;search='';found=[];void ctx.run(loadHolders,'');break;
      case 'edit':{const badge=badges.find(each=>each.id===id);if(badge){editing=id;draft={name:badge.name,description:badge.description,icon:badge.icon,color:badge.color,rarity:badge.rarity,image:badge.image};render();}break;}
      case 'cancel':editing=null;draft={...BLANK};render();break;
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
      const {kind,id}=removing,why=reason(form);keepDraft();removing=undefined;
      if(kind==='delete')void ctx.run(async()=>{badges=(await ctx.api<{badges:AdminBadge[]}>('/admin/badges/delete',{id,reason:why})).badges;if(editing===id){editing=null;draft={...BLANK};}if(selected===id)selected=badges[0]?.id??'';await loadHolders();},'Emblema apagado.');
      else if(kind==='image')void ctx.run(async()=>{images=(await ctx.api<{images:string[]}>('/admin/badges/images/delete',{id,reason:why})).images;if(draft.image===id)draft.image=null;render();},'Imagem apagada.');
      else void ctx.run(async()=>{await ctx.api('/admin/badges/grant',{badgeId:selected,playerId:id,grant:false,reason:why});await load();},'Emblema retirado.');
    }else if(form.dataset.badgeForm==='save'){
      keepDraft();
      const why=reason(form),id=editing;
      void ctx.run(async()=>{badges=(await ctx.api<{badges:AdminBadge[]}>('/admin/badges',{...(id?{id}:{}),...draft,reason:why})).badges;editing=null;draft={...BLANK};if(!selected)selected=badges[0]?.id??'';await loadHolders();},id?'Emblema salvo.':'Emblema criado.');
    }else if(form.dataset.badgeForm==='grant'&&target){
      keepDraft();
      const why=reason(form),player=target;
      void ctx.run(async()=>{await ctx.api('/admin/badges/grant',{badgeId:selected,playerId:player.id,grant:true,reason:why});target=undefined;search='';await load();},`Emblema concedido a ${player.displayName}.`);
    }
  };
  const input=(event:Event)=>{
    const field=event.target as HTMLInputElement;if(field.name!=='search')return;
    search=field.value;target=undefined;
    clearTimeout(searchTimer);searchTimer=setTimeout(()=>void find().catch(()=>{}),250);
  };
  const change=(event:Event)=>{
    const field=event.target as HTMLInputElement,file=field.matches('[data-badge-file]')?field.files?.[0]:undefined;if(!file)return;
    keepDraft();
    void ctx.run(async()=>{const id=await sendBadgeImage(await badgePng(file));images=[id,...images.filter(each=>each!==id)];draft.image=id;render();},'Imagem salva no servidor. Falta salvar o emblema para usá-la.');
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);root.addEventListener('input',input);root.addEventListener('change',change);
  render();void ctx.run(load,'');
  return {destroy(){disposed=true;clearTimeout(searchTimer);root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.removeEventListener('input',input);root.removeEventListener('change',change);}};
};
