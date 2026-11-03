import {CATALOG_AVAILABILITY,CATALOG_AVAILABILITY_NAMES,RARITIES,RARITY_INFO,RAREST,type AdminCatalogEntry,type CatalogAvailability,type Rarity} from '@bar/shared';
import {liveCard,skinCardHtml,type LiveCard} from '../collection/skin-card';
import {ago,card,chips,compact,e,n,reasonField,stat,uiIcon,type SectionFactory} from './kit';

/**
 * Coleção: what each card and skill is worth and how it shows up in the game (docs/sistemas/skins.md). Rarity, text and sale are kept in skin_catalog,
 * the price in the price table. New characters and variants come from the importer: this edits what exists.
 */
export const collectionSection:SectionFactory=(root,ctx)=>{
  let entries:AdminCatalogEntry[]=[],selected='',disposed=false,live:LiveCard|undefined;
  /** What the form is showing, unsaved: the preview follows it. */
  let draft:{rarity:Rarity;availability:CatalogAvailability}|undefined;

  const current=()=>entries.find(entry=>entry.key===selected);
  const preview=(entry:AdminCatalogEntry)=>({id:entry.id,name:entry.name,variant:entry.variant,accent:entry.accent,rarity:draft?.rarity??entry.rarity});
  function cardsHtml():string {
    const skins=entries.filter(entry=>entry.kind==='skin'),skills=entries.filter(entry=>entry.kind==='skill');
    return card(`Cartas (${skins.length})`,`<div class="admin-coll-cards">${skins.map(entry=>`<button type="button" class="admin-coll-card" data-coll="pick" data-key="${e(entry.key)}" aria-pressed="${entry.key===selected}" aria-label="${e(entry.name)}, ${e(RARITY_INFO[entry.rarity].name)}">${skinCardHtml({id:entry.id,name:entry.name,variant:entry.variant,accent:entry.accent,rarity:entry.rarity},{size:'small',tag:entry.price?`<em class="price">${uiIcon('coins')}${n(entry.price)}</em>`:'<em class="closed">Grátis</em>'})}${entry.availability==='sale'?'':`<i class="admin-coll-off">${e(CATALOG_AVAILABILITY_NAMES[entry.availability])}</i>`}</button>`).join('')}</div>
      <p class="admin-coll-note">Personagens e variantes novos entram pelo importador de modelos (<code>tools/assets/import-mixamo.mjs</code>, <code>packages/shared/src/skins.ts</code>). Aqui se decide o que cada carta vale e como ela aparece.</p>`,{icon:'cards'})
      +card(`Habilidades (${skills.length})`,`<p class="admin-coll-note">Quem quer usar compra uma vez e vale em todas as variantes do personagem. Exige ter uma carta dele.</p><div class="admin-coll-skills">${skills.map(entry=>`<button type="button" class="admin-coll-skill" data-coll="pick" data-key="${e(entry.key)}" aria-pressed="${entry.key===selected}" style="--rarity:${e(RARITY_INFO[entry.rarity].color)}">${uiIcon(entry.icon)}<span><b>${e(entry.name)}</b><small>${e(entries.find(each=>each.key===`skin:${entry.base}`)?.name??entry.base)} · ${n(entry.owners)} ${entry.owners===1?'dono':'donos'}${entry.availability==='sale'?'':` · ${e(CATALOG_AVAILABILITY_NAMES[entry.availability])}`}</small></span><b>${n(entry.price)}</b></button>`).join('')}</div>`,{icon:'bolt'});
  }
  function editorHtml():string {
    const entry=current();if(!entry)return card('Editar','<p class="admin-empty">Escolha uma carta ou habilidade.</p>',{icon:'pencil'});
    const rarity=draft?.rarity??entry.rarity,availability=draft?.availability??entry.availability,free=entry.key==='skin:nathan';
    return card(`Editar ${e(entry.name)}`,`${entry.kind==='skin'?`<div class="admin-coll-preview"><div class="sc-scene" data-coll-preview>${skinCardHtml(preview(entry),{size:'big'})}</div></div>`:''}
      <div class="admin-coll-stats">${stat('Donos',n(entry.owners))}${stat(entry.kind==='skin'?'Vestindo':'Vendida por',entry.kind==='skin'?n(entry.wearing):n(entry.price))}${stat('Arrecadou',compact(entry.revenue))}</div>
      <form class="admin-badge-form" data-coll-form>
        <fieldset><legend>Raridade</legend><div class="admin-badge-rarities">${RARITIES.map(each=>`<button type="button" data-coll-rarity="${each}" aria-pressed="${each===rarity}" style="--rarity:${RARITY_INFO[each].color}">${RARITY_INFO[each].name}</button>`).join('')}</div>${entry.kind==='skin'?`<small class="admin-badge-hint">Duas últimas: carta holográfica. ${RARITY_INFO[RAREST].name}: cravejada de brilhos.</small>`:''}</fieldset>
        <fieldset><legend>Situação</legend>${free?'<small class="admin-badge-hint">A carta gratuita fica sempre disponível.</small>':chips('availability',CATALOG_AVAILABILITY.map(each=>[each,CATALOG_AVAILABILITY_NAMES[each]] as const),availability)}<small class="admin-badge-hint">Fora de venda: aparece fechada para quem não tem. Oculta: só quem tem vê. Quem já comprou nunca perde.</small></fieldset>
        <label>Preço em moedas<span class="admin-coll-price"><input name="price" type="number" inputmode="numeric" min="${entry.priceMin}" max="${entry.priceMax}" step="1" value="${entry.price}" ${free?'readonly':''} aria-label="Preço em moedas"><small>Padrão ${n(entry.defaultPrice)}</small></span></label>
        <label>Texto da carta<textarea name="description" required minlength="3" maxlength="160">${e(entry.description)}</textarea></label>
        ${reasonField('Motivo','O que mudou e por quê')}
        <div class="admin-badge-actions"><button type="submit" class="mini-button">${uiIcon('check')}Salvar</button></div>
        ${entry.updatedAt?`<small class="admin-badge-hint">Editada ${e(ago(entry.updatedAt))}${entry.updatedBy?` por ${e(entry.updatedBy)}`:''}.</small>`:''}
      </form>`,{icon:'pencil'});
  }
  function mountPreview():void {
    live?.destroy();live=undefined;
    const scene=root.querySelector<HTMLElement>('[data-coll-preview]');
    if(scene&&current())live=liveCard(scene,current()!.id);
  }
  function render():void {
    live?.destroy();live=undefined;
    const typing=root.querySelector<HTMLFormElement>('[data-coll-form]'),keep=typing?{price:(typing.elements.namedItem('price') as HTMLInputElement).value,description:(typing.elements.namedItem('description') as HTMLTextAreaElement).value,reason:(typing.elements.namedItem('reason') as HTMLTextAreaElement).value}:undefined;
    root.innerHTML=`<div class="admin-coll"><div class="admin-coll-left">${cardsHtml()}</div><div class="admin-coll-right">${editorHtml()}</div></div>`;
    const form=root.querySelector<HTMLFormElement>('[data-coll-form]');
    if(form&&keep&&draft){(form.elements.namedItem('price') as HTMLInputElement).value=keep.price;(form.elements.namedItem('description') as HTMLTextAreaElement).value=keep.description;(form.elements.namedItem('reason') as HTMLTextAreaElement).value=keep.reason;}
    mountPreview();
  }
  const click=(event:Event)=>{
    const target=event.target as HTMLElement;
    const pick=target.closest<HTMLElement>('[data-coll="pick"]');
    if(pick){selected=pick.dataset.key!;draft=undefined;render();return;}
    const entry=current();if(!entry)return;
    draft??={rarity:entry.rarity,availability:entry.availability};
    const rarity=target.closest<HTMLElement>('[data-coll-rarity]');
    if(rarity){draft.rarity=rarity.dataset.collRarity as Rarity;render();return;}
    const chip=target.closest<HTMLElement>('[data-admin-chip="availability"]');
    if(chip){draft.availability=chip.dataset.value as CatalogAvailability;render();}
  };
  const submit=(event:Event)=>{
    const form=(event.target as HTMLElement).closest<HTMLFormElement>('[data-coll-form]');if(!form)return;
    event.preventDefault();
    const entry=current();if(!entry)return;
    const values=Object.fromEntries(new FormData(form));
    void ctx.run(async()=>{
      const answer=await ctx.api<{entries:AdminCatalogEntry[]}>('/admin/collection',{key:entry.key,rarity:draft?.rarity??entry.rarity,availability:draft?.availability??entry.availability,description:String(values.description),price:Number(values.price),reason:String(values.reason)});
      entries=answer.entries;draft=undefined;if(!disposed)render();
    },`${entry.name} atualizada. Os jogadores veem na próxima vez que abrirem a coleção.`);
  };
  root.addEventListener('click',click);root.addEventListener('submit',submit);
  root.innerHTML='<p class="admin-empty">Carregando as cartas…</p>';
  void ctx.api<{entries:AdminCatalogEntry[]}>('/admin/collection').then(answer=>{
    if(disposed)return;
    entries=answer.entries;selected=entries[0]?.key??'';render();
  },error=>{if(!disposed)root.innerHTML=`<p class="admin-empty">${e(error instanceof Error?error.message:'Não foi possível ler a coleção.')}</p>`;});
  return {destroy(){disposed=true;live?.destroy();root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};
};
