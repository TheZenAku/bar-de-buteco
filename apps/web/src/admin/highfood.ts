import {SKINS,customerLookSchema,type AdminAccount,type AdminOverview,type CustomerLook,type CustomerProfile} from '@bar/shared';
import {badgeImageUrl} from '../profile/badge-card';
import {customerPicture} from '../highfood/npc-avatar';
import {badgePng,sendBadgeImage} from './badges';
import {badge,card,e,empty,n,reasonField,stat,uiIcon,type SectionFactory,type WorldSnapshot} from './kit';

interface Stats {today:{count:number;paid:number;people:number};week:{count:number;paid:number;people:number};vehicles:number;vehicleSpentWeek:number}
const LOOK_LIMITS:Record<keyof CustomerLook,number>={tone:5,hair:7,hairColor:6,facial:3,glasses:2,shirt:7,bg:7};
const LOOK_LABELS:Record<keyof CustomerLook,string>={tone:'Pele',hair:'Cabelo',hairColor:'Cor do cabelo',facial:'Barba',glasses:'Óculos',shirt:'Roupa',bg:'Fundo'};
const blank=():Omit<CustomerProfile,'id'>&{id?:string}=>({name:'',skin:'nathan',look:{tone:2,hair:1,hairColor:0,facial:0,glasses:0,shirt:0,bg:0},image:null,lines:['Valeu, {nome}!'],active:true});

/** Highfood: how the service is doing, and the customers' profiles, whose pictures come from the same store as the badges'. */
export const highfoodSection:SectionFactory=(root,ctx)=>{
  let customers:CustomerProfile[]=[],images:string[]=[],stats:Stats|undefined,draft:ReturnType<typeof blank>|undefined,disposed=false,snapshot:WorldSnapshot|null=ctx.world();
  let search='',found:AdminAccount[]=[],target:AdminAccount|undefined,searchTimer:ReturnType<typeof setTimeout>|undefined;
  function grantHtml():string {
    return card('Dar ou tirar a moto de alguém',`<form class="admin-badge-grant" data-food-grant><label>Jogador<input name="search" type="search" autocomplete="off" placeholder="Nome, usuário ou e-mail" value="${e(search)}"></label><label>Placa, para tirar uma moto de quem tem mais de uma<input name="plate" autocomplete="off" maxlength="7" placeholder="ABC1D23"></label>
      ${target?`<p class="admin-note">Escolhido: <b>${e(target.displayName)}</b> (@${e(target.username)})</p>${reasonField('Motivo','Por que esta pessoa recebe ou perde a moto')}<div class="admin-badge-actions"><button type="submit" class="mini-button" value="give">${uiIcon('gift')}Dar a moto</button><button type="submit" class="mini-button" value="take">${uiIcon('trash')}Tirar a moto</button></div>`:found.length?`<div class="admin-badge-found">${found.map(person=>`<button type="button" class="mini-button" data-food-target="${e(person.id)}">${e(person.displayName)} <small>@${e(person.username)}</small></button>`).join('')}</div>`:''}</form>
      <p class="fine-print">As moedas não mudam: isto é para corrigir um erro ou premiar alguém. A moto vendida no HighMotors sai pelo preço em Preços.</p>`,{icon:'bike'});
  }
  async function find():Promise<void> {
    const text=search.trim();
    found=text.length<2?[]:(await ctx.api<AdminOverview>(`/admin/overview?search=${encodeURIComponent(text)}&limit=6`)).users;
    if(disposed)return;
    keepDraft();render();
    const input=root.querySelector<HTMLInputElement>('[data-food-grant] [name="search"]');input?.focus();input?.setSelectionRange(text.length,text.length);
  }
  function keepDraft():void {
    const form=root.querySelector<HTMLFormElement>('[data-food-form]');if(!form||!draft)return;
    const data=new FormData(form);
    draft.name=String(data.get('name')??'');draft.skin=String(data.get('skin')??draft.skin);draft.active=data.get('active')==='on';
    draft.lines=String(data.get('lines')??'').split('\n').map(line=>line.trim()).filter(Boolean);
  }
  function formHtml():string {
    if(!draft)return card('Perfil do cliente',empty('Escolha um cliente na lista, ou crie um novo.'),{icon:'pencil'});
    const d=draft,name=d.name||'Novo cliente';
    return card(d.id?`Editar ${e(name)}`:'Novo cliente',`<form class="admin-food-form" data-food-form>
      <div class="admin-food-preview">${customerPicture({...(d.id?{id:d.id}:{}),name,look:d.look,image:d.image},'npc-picture admin-food-face')}<small>${d.image?'Foto enviada':'Avatar gerado'}</small></div>
      <label>Nome<input name="name" required minlength="2" maxlength="40" value="${e(d.name)}"></label>
      <label>Corpo no jogo<select name="skin">${SKINS.map(skin=>`<option value="${skin.id}" ${skin.id===d.skin?'selected':''}>${e(skin.name)}</option>`).join('')}</select></label>
      <fieldset><legend>Foto do perfil</legend><div class="admin-badge-upload"><button type="button" class="mini-button" data-food="upload">${uiIcon('image')}Enviar PNG</button>${d.image?`<button type="button" class="mini-button" data-food="no-image">${uiIcon('close')}Usar o avatar gerado</button>`:''}<input type="file" accept="image/png" hidden data-food-file><small>O mesmo envio dos emblemas: PNG, reduzido a 256 px. A foto fica salva no servidor.</small></div>
        ${images.length?`<div class="admin-badge-icons">${images.map(id=>`<button type="button" data-food-image="${e(id)}" aria-pressed="${id===d.image}" aria-label="Imagem enviada"><img src="${e(badgeImageUrl(id))}" alt="" loading="lazy"></button>`).join('')}</div>`:''}</fieldset>
      ${d.image?'':`<fieldset><legend>Avatar gerado</legend><div class="admin-food-look">${(Object.keys(LOOK_LIMITS) as Array<keyof CustomerLook>).map(key=>`<div><small>${LOOK_LABELS[key]}</small><span><button type="button" class="mini-button" data-food-look="${key}" data-step="-1" aria-label="${LOOK_LABELS[key]}: anterior">‹</button><b>${d.look[key]+1}</b><button type="button" class="mini-button" data-food-look="${key}" data-step="1" aria-label="${LOOK_LABELS[key]}: próximo">›</button></span></div>`).join('')}</div></fieldset>`}
      <label>Falas (uma por linha, até 8)<textarea name="lines" required rows="5" maxlength="1500">${e(d.lines.join('\n'))}</textarea><small class="admin-badge-hint">{nome} vira o nome do entregador, {item} o primeiro item do pedido.</small></label>
      <label class="admin-check"><input type="checkbox" name="active" ${d.active?'checked':''}> Recebe entregas</label>
      ${reasonField('Motivo',d.id?'O que mudou':'Por que este cliente existe')}
      <div class="admin-badge-actions"><button type="submit" class="mini-button">${uiIcon(d.id?'check':'plus')}${d.id?'Salvar':'Criar cliente'}</button><button type="button" class="mini-button" data-food="cancel">Cancelar</button></div></form>`,{icon:'pencil'});
  }
  function render():void {
    if(disposed)return;
    if(!stats){root.innerHTML='<p class="admin-loading">Carregando o Highfood…</p>';return;}
    const live=snapshot?.highfood??[];
    root.innerHTML=`<img class="admin-food-logo" src="${import.meta.env.BASE_URL}highfood/logo.webp" alt="Highfood, Highland Bar Delivery" draggable="false"><div class="admin-stats">${stat('Entregas hoje',n(stats.today.count),`${n(stats.today.people)} entregador(es)`)}${stat('Pago hoje',n(stats.today.paid),'Moedas criadas pelo Highfood')}${stat('Pago em 7 dias',n(stats.week.paid),`${n(stats.week.count)} entregas`)}${stat('Motos vendidas',n(stats.vehicles),`${n(stats.vehicleSpentWeek)} moedas saíram em 7 dias`)}</div>
      ${card(`Online agora (${live.length})`,live.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Entregador</th><th>Situação</th><th>Pedido</th><th class="num">Neste turno</th></tr></thead><tbody>${live.map(row=>`<tr><td><button type="button" class="admin-link" data-admin-go-player="${e(row.playerId)}">${e(row.name)}</button></td><td>${row.status==='order'?badge('Entregando','cyan'):row.status==='offer'?badge('Pedido no app','gold'):badge('Procurando','muted')}</td><td>${row.order?`${e(row.order)} · ${e(row.address)}`:'—'}</td><td class="num">${n(row.done)} · ${n(row.earned)} moedas</td></tr>`).join('')}</tbody></table></div>`:empty('Ninguém online no Highfood.'),{icon:'bike'})}
      <div class="admin-grid">${card(`Clientes (${customers.length})`,`<div class="admin-scroll"><table class="admin-table admin-food-table"><thead><tr><th></th><th>Cliente</th><th>Corpo</th><th></th></tr></thead><tbody>${customers.map(person=>`<tr class="${person.id===draft?.id?'selected':''}"><td>${customerPicture(person,'npc-picture admin-food-thumb')}</td><td><b>${e(person.name)}</b>${person.active?'':` ${badge('Inativo','muted')}`}<br><small>${e(person.lines[0]??'')}</small></td><td>${e(SKINS.find(skin=>skin.id===person.skin)?.name??person.skin)}</td><td><button type="button" class="mini-button" data-food="edit" data-id="${e(person.id)}">${uiIcon('pencil')}Editar</button></td></tr>`).join('')}</tbody></table></div>`,{icon:'users',actions:`<button type="button" class="mini-button" data-food="new">${uiIcon('plus')}Novo cliente</button>`})}${formHtml()}</div>${grantHtml()}
      <p class="fine-print">Os valores de cada entrega e o teto diário ficam em Preços, no grupo Highfood e veículos. O cálculo e o motivo de cada número estão em docs/sistemas/highfood.md.</p>`;
  }
  async function load():Promise<void> {
    const result=await ctx.api<{customers:CustomerProfile[];images:string[];stats:Stats}>('/admin/highfood');
    if(disposed)return;
    customers=result.customers;images=result.images;stats=result.stats;render();
  }
  const click=(event:MouseEvent)=>{
    const element=event.target as HTMLElement;
    const person=element.closest<HTMLElement>('[data-admin-go-player]');
    if(person){ctx.go('players',{player:person.dataset.adminGoPlayer!});return;}
    const pick=element.closest<HTMLElement>('[data-food-target]');
    if(pick){keepDraft();target=found.find(each=>each.id===pick.dataset.foodTarget);search=target?.displayName??'';found=[];render();return;}
    const image=element.closest<HTMLElement>('[data-food-image]');
    if(image&&draft){keepDraft();draft.image=image.dataset.foodImage!;render();return;}
    const look=element.closest<HTMLElement>('[data-food-look]');
    if(look&&draft){
      keepDraft();
      const key=look.dataset.foodLook as keyof CustomerLook,limit=LOOK_LIMITS[key]+1;
      draft.look={...draft.look,[key]:(draft.look[key]+Number(look.dataset.step)+limit)%limit};
      render();return;
    }
    const button=element.closest<HTMLElement>('[data-food]');if(!button)return;
    switch(button.dataset.food){
      case 'new':draft=blank();render();break;
      case 'edit':{const found=customers.find(each=>each.id===button.dataset.id);if(found){draft={...found,look:{...found.look},lines:[...found.lines]};render();}break;}
      case 'cancel':draft=undefined;render();break;
      case 'no-image':if(draft){keepDraft();draft.image=null;render();}break;
      case 'upload':root.querySelector<HTMLInputElement>('[data-food-file]')?.click();break;
    }
  };
  const change=(event:Event)=>{
    const field=event.target as HTMLInputElement,file=field.matches('[data-food-file]')?field.files?.[0]:undefined;if(!file||!draft)return;
    keepDraft();
    void ctx.run(async()=>{const id=await sendBadgeImage(await badgePng(file));images=[id,...images.filter(each=>each!==id)];if(draft)draft.image=id;render();},'Foto salva no servidor. Falta salvar o cliente para usá-la.');
  };
  const input=(event:Event)=>{
    const field=event.target as HTMLInputElement;if(field.name!=='search'||!field.closest('[data-food-grant]'))return;
    search=field.value;target=undefined;
    clearTimeout(searchTimer);searchTimer=setTimeout(()=>void find().catch(()=>{}),250);
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;
    if(form.matches('[data-food-grant]')&&target){
      event.preventDefault();keepDraft();
      const give=(event.submitter as HTMLButtonElement|null)?.value!=='take',why=String(new FormData(form).get('reason')??''),person=target,plate=String(new FormData(form).get('plate')??'').trim();
      void ctx.run(async()=>{await ctx.api('/admin/highfood/vehicle',{playerId:person.id,owned:give,reason:why,...(plate&&!give?{plate}:{})});target=undefined;search='';await load();},give?`Moto dada a ${person.displayName}.`:`Moto retirada de ${person.displayName}.`);
      return;
    }
    if(!form.matches('[data-food-form]')||!draft)return;
    event.preventDefault();keepDraft();
    const reason=String(new FormData(form).get('reason')??''),body=draft;
    if(!customerLookSchema.safeParse(body.look).success)return;
    void ctx.run(async()=>{customers=(await ctx.api<{customers:CustomerProfile[]}>('/admin/highfood/customers',{...body,lines:body.lines.slice(0,8),reason})).customers;draft=undefined;render();},body.id?'Cliente salvo. Vale nas próximas entregas (até 1 min).':'Cliente criado.');
  };
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('submit',submit);root.addEventListener('input',input);
  render();void ctx.run(load,'');ctx.requestWorld();
  return {world(next){snapshot=next;render();},destroy(){disposed=true;clearTimeout(searchTimer);root.removeEventListener('input',input);root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('submit',submit);}};
};
