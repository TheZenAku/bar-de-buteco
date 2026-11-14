import {CATEGORY_NAMES,PARTS,PART_SLOTS,SLOT_NAMES,UPGRADES,UPGRADE_MAX,UPGRADE_TRACKS,WEAPONS,arsenalStats,arsenalWeapon,nextUpgrade,ownedInOrder,upgradeLevel,
  withPart,withUpgrade,type ArsenalView,type PartId,type PartSlot,type UpgradeTrack,type WeaponId,type WeaponStats} from '@bar/shared';
import {escape as e} from '../../api';
import {coins,uiIcon} from '../../ui-icons';
import type {MenuSounds} from '../../pause-menu/menu-sounds';
import {inputCode} from '../key-bindings';
import type {WeaponsController} from '../controller';
import {SLOT_ICONS,partVisual,weaponPicture} from './art';
import {STAT_HINTS,STAT_NAMES,caliberText,modesText,partEffects,statLines} from './stats-view';
import './weapons-ui.css';

/**
 * The Arsenal window (docs/sistemas/armas.md#arsenal), inside showModal('ARSENAL',…,'arsenal'): the owned weapons on the left, the chosen one
 * on the right with its bars, its slots (the compatible parts owned, as chips) and its five upgrade tracks; a second tab lists the parts and the
 * weapons each fits. Hovering or focusing a part or an upgrade shows on the bars what it would change (a green or red ghost segment). Changes go
 * to the room (weapon.configure / weapon.upgrade) and the window redraws when the new weapon.arsenal arrives. A gamepad drives it through the
 * keys the pad mapper presses (arrows move between controls by where they are on screen, Enter presses, Q/E switch tabs, Escape closes).
 */
export interface ArsenalHost {
  sounds:MenuSounds;
  balance():number|undefined;
  close():void;
}
type Tab='armas'|'pecas';
type Preview={slot:PartSlot;part:PartId|null}|{track:UpgradeTrack};
const BUSY_MS=4000;

export function createArsenal(root:HTMLElement,weapons:WeaponsController,host:ArsenalHost):{destroy():void} {
  let tab:Tab='armas';
  let weapon:WeaponId|undefined;
  let part:PartId|undefined;
  let preview:Preview|undefined;
  let shownArsenal:ArsenalView|undefined,shownWant:string|undefined;
  /** Requests on their way to the room ("weapon:slot", "up:track"): their buttons wait for the next arsenal. */
  const busy=new Map<string,number>();
  let busyTimer=0;

  const view=()=>weapons.gun.arsenal;
  const owned=()=>ownedInOrder(view());
  const ownedParts=()=>{const v=view();return v?PART_SLOTS.flatMap(slot=>v.parts.filter(id=>PARTS[id].slot===slot)):[];};

  function render():void {
    const v=view();
    shownArsenal=v;shownWant=weapons.gun.want;
    // Keep the focus and the panes' scroll across a redraw.
    const focus=(document.activeElement as HTMLElement|null)?.closest<HTMLElement>('[data-key]')?.dataset.key;
    const scrolls=[...root.querySelectorAll<HTMLElement>('[data-scroll]')].map(node=>[node.dataset.scroll!,node.scrollTop] as const);
    if(!v){root.innerHTML='<p class="ar-empty">Carregando o arsenal…</p>';weapons.requestArsenal();return;}
    const list=owned(),parts=ownedParts();
    if(!weapon||!list.includes(weapon))weapon=(list.includes(weapons.gun.want as WeaponId)?weapons.gun.want as WeaponId:list[0]);
    if(!part||!parts.includes(part))part=parts[0];
    root.innerHTML=`<div class="ar" data-tab="${tab}">
      <div class="ar-top"><div class="ar-tabs" role="tablist">
        <button type="button" role="tab" data-key="tab:armas" data-ar-tab="armas" aria-selected="${tab==='armas'}">${uiIcon('gun')}Armas<small>${list.length}</small></button>
        <button type="button" role="tab" data-key="tab:pecas" data-ar-tab="pecas" aria-selected="${tab==='pecas'}">${uiIcon('wrench')}Equipamentos<small>${parts.length}</small></button></div>
        ${v.test?`<span class="ar-kit">${uiIcon('sparkles')}Kit de teste: munição infinita, melhorias grátis</span>`:''}</div>
      <div class="ar-body">${tab==='armas'?weaponsTab(v,list):partsTab(v,parts)}</div></div>`;
    for(const [name,top] of scrolls){const node=root.querySelector<HTMLElement>(`[data-scroll="${name}"]`);if(node)node.scrollTop=top;}
    const again=focus?root.querySelector<HTMLElement>(`[data-key="${CSS.escape(focus)}"]`):undefined;
    if(again&&!again.matches(':disabled'))again.focus({preventScroll:true});
    if(preview)renderPreview();
    // The chosen item stays in sight in its list (a strip on a phone).
    const strip=root.querySelector<HTMLElement>('.ar-list'),item=strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if(strip&&item){
      if(item.offsetLeft<strip.scrollLeft)strip.scrollLeft=item.offsetLeft-8;
      else if(item.offsetLeft+item.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=item.offsetLeft+item.offsetWidth-strip.clientWidth+8;
      if(item.offsetTop<strip.scrollTop)strip.scrollTop=item.offsetTop-8;
      else if(item.offsetTop+item.offsetHeight>strip.scrollTop+strip.clientHeight)strip.scrollTop=item.offsetTop+item.offsetHeight-strip.clientHeight+8;
    }
  }

  // ---- Armas: the list, and the weapon's bars, slots and upgrades.
  function weaponsTab(v:ArsenalView,list:WeaponId[]):string {
    if(!list.length)return '<p class="ar-empty">Nenhuma arma no arsenal.</p>';
    const want=weapons.gun.want;
    const items=list.map(id=>{const def=WEAPONS[id],equipped=!!arsenalWeapon(v,id)?.equipped,badge=id===want?'Na mão':equipped?'Na roda':'';return `<button type="button" class="ar-item" data-key="w:${id}" data-ar-weapon="${id}" aria-current="${id===weapon}">
      ${weaponPicture(id,arsenalWeapon(v,id)?.parts,arsenalWeapon(v,id)?.upgrades)}<span><b>${e(def.name)}</b><small>${e(CATEGORY_NAMES[def.category])} · ${e(caliberText(arsenalStats(v,id)!))}</small></span>${badge?`<i class="ar-hand" title="${badge}">${badge}</i>`:''}</button>`;}).join('');
    return `<nav class="ar-list" data-scroll="list" aria-label="Armas">${items}</nav><section class="ar-detail" data-scroll="detail">${weaponDetail(v,weapon!)}</section>`;
  }
  function weaponDetail(v:ArsenalView,id:WeaponId):string {
    const def=WEAPONS[id],item=arsenalWeapon(v,id)!,stats=arsenalStats(v,id)!,equipped=item.equipped,waitEquip=busy.has(`equip:${id}`);
    const slots=PART_SLOTS.filter(slot=>def.slots[slot]?.length);
    const slotRows=slots.map(slot=>{
      const options=def.slots[slot]!.filter(option=>v.parts.includes(option)),fitted=item.parts[slot],wait=busy.has(`${id}:${slot}`);
      const chip=(option:PartId|null)=>{const on=(fitted??null)===option;return `<button type="button" class="ar-chip" data-key="p:${slot}:${option??''}" data-ar-slot="${slot}" data-ar-part="${option??''}" aria-pressed="${on}"${wait?' aria-busy="true"':''}>
        ${option?partVisual(option,'ar-chip-art'):`<span class="ar-chip-art wp-part-glyph">${uiIcon('close')}</span>`}<span>${option?e(PARTS[option].name):'Nenhum'}</span></button>`;};
      return `<div class="ar-slot"><span class="ar-slot-name">${uiIcon(SLOT_ICONS[slot])}${e(SLOT_NAMES[slot])}</span><div class="ar-chips">${chip(null)}${options.map(chip).join('')}</div>
        ${options.length<def.slots[slot]!.length?`<small class="ar-note">Mais ${def.slots[slot]!.length-options.length} ${def.slots[slot]!.length-options.length===1?'equipamento serve':'equipamentos servem'} aqui.</small>`:''}</div>`;
    }).join('')||'<p class="ar-note">Esta arma não aceita equipamentos.</p>';
    const balance=host.balance();
    const upgrades=UPGRADE_TRACKS.map(track=>{
      const level=upgradeLevel(item.upgrades,track),next=nextUpgrade(v,id,track),wait=busy.has(`up:${id}:${track}`);
      const short=!v.test&&next&&balance!==undefined&&next.cost>balance?next.cost-balance:0;
      const price=!next?'Máximo':v.test?'Grátis no teste':short?`Faltam ${coins(short)}`:coins(next.cost);
      return `<div class="ar-up"><div class="ar-up-name"><b>${e(UPGRADES[track].name)}</b><small>${e(UPGRADES[track].description)}</small></div>
        <span class="ar-segs" role="img" aria-label="Nível ${level} de ${UPGRADE_MAX}">${Array.from({length:UPGRADE_MAX},(_,i)=>`<i${i<level?' data-on':''}></i>`).join('')}</span>
        <button type="button" class="ar-buy" data-key="u:${track}" data-ar-up="${track}"${!next||short?' disabled':''}${wait?' aria-busy="true"':''}><span>${next?'Melhorar':'Completo'}</span><small>${price}</small></button></div>`;
    }).join('');
    return `<header class="ar-head"><div><small class="ar-eyebrow">${e(CATEGORY_NAMES[def.category])} · ${e(caliberText(stats))}</small><h3>${e(def.name)}</h3>
        <p>${e(def.description)}</p><div class="ar-tags"><span>${e(modesText(stats))}</span><span>${stats.mag} no carregador</span>${stats.scope?`<span>Luneta ${stats.zooms.map(zoom=>`${zoom}x`).join(' / ')}</span>`:''}${stats.suppressed?'<span>Silenciada</span>':''}</div></div>
        <button type="button" class="ar-draw" data-key="equip" data-ar-equip="${id}" aria-pressed="${equipped}"${waitEquip?' aria-busy="true"':''}>${uiIcon(equipped?'check':'gun')}<span>${equipped?'Remover da roda':'Equipar'}</span></button></header>
      <div class="ar-cols"><div class="ar-col"><figure class="ar-figure">${weaponPicture(id,item.parts,item.upgrades)}</figure><div class="ar-stats">${statsHtml(stats,undefined)}</div></div>
        <div class="ar-col"><h4 class="ar-group">Equipamentos</h4>${slotRows}<h4 class="ar-group">Melhorias</h4>${upgrades}</div></div>`;
  }
  /** The bars; with `next`, a ghost segment from now to what it would be (green up, red down) and the figure it would read. */
  function statsHtml(stats:WeaponStats,next:WeaponStats|undefined):string {
    const now=statLines(stats),then=next?statLines(next):undefined;
    return now.map((line,i)=>{
      const after=then?.[i],delta=after?after.score-line.score:0,changed=Math.abs(delta)>.004||(after&&after.figure!==line.figure);
      const low=Math.min(line.score,after?.score??line.score),high=Math.max(line.score,after?.score??line.score);
      const sign=delta>0?'up':delta<0?'down':'same';
      return `<div class="ar-stat" title="${e(STAT_HINTS[line.key])}"${changed?` data-delta="${sign}"`:''}><span>${STAT_NAMES[line.key]}</span>
        <span class="ar-bar"><i class="ar-fill" style="--v:${low.toFixed(3)}"></i>${changed?`<i class="ar-ghost" style="--from:${low.toFixed(3)};--to:${high.toFixed(3)}"></i>`:''}</span>
        <output>${e(changed&&after?after.figure:line.figure)}</output></div>`;
    }).join('');
  }
  function renderPreview():void {
    const v=view(),stats=root.querySelector<HTMLElement>('.ar-stats');
    if(!v||!weapon||!stats||tab!=='armas')return;
    let next:WeaponStats|undefined;
    if(preview&&'slot' in preview)next=arsenalStats(withPart(v,weapon,preview.slot,preview.part),weapon);
    else if(preview&&nextUpgrade(v,weapon,preview.track))next=arsenalStats(withUpgrade(v,weapon,preview.track),weapon);
    stats.innerHTML=statsHtml(arsenalStats(v,weapon)!,next);
  }

  // ---- Equipamentos: the parts owned, and the weapons each fits.
  function partsTab(v:ArsenalView,parts:PartId[]):string {
    if(!parts.length)return '<p class="ar-empty">Nenhum equipamento no arsenal.</p>';
    let group='';
    const items=parts.map(id=>{const def=PARTS[id],head=def.slot!==group?`<small class="ar-list-group">${e(SLOT_NAMES[def.slot])}</small>`:'';group=def.slot;
      return `${head}<button type="button" class="ar-item ar-item-part" data-key="pt:${id}" data-ar-pick="${id}" aria-current="${id===part}">${partVisual(id,'ar-item-art')}<span><b>${e(def.name)}</b><small>${e(SLOT_NAMES[def.slot])}</small></span></button>`;}).join('');
    return `<nav class="ar-list" data-scroll="list" aria-label="Equipamentos">${items}</nav><section class="ar-detail" data-scroll="detail">${partDetail(v,part!)}</section>`;
  }
  function partDetail(v:ArsenalView,id:PartId):string {
    const def=PARTS[id],fits=owned().filter(item=>WEAPONS[item].slots[def.slot]?.includes(id));
    const rows=fits.map(item=>{const on=arsenalWeapon(v,item)?.parts[def.slot]===id,wait=busy.has(`${item}:${def.slot}`);
      return `<div class="ar-fit">${weaponPicture(item,arsenalWeapon(v,item)?.parts,arsenalWeapon(v,item)?.upgrades)}<span><b>${e(WEAPONS[item].name)}</b><small>${on?'Instalado':arsenalWeapon(v,item)?.parts[def.slot]?`Troca: ${e(PARTS[arsenalWeapon(v,item)!.parts[def.slot]!].name)}`:'Encaixe livre'}</small></span>
        <button type="button" class="ar-buy" data-key="f:${item}" data-ar-fit="${item}" data-ar-on="${on}"${wait?' aria-busy="true"':''}><span>${on?'Tirar':'Instalar'}</span></button></div>`;}).join('');
    return `<header class="ar-head"><div><small class="ar-eyebrow">${e(SLOT_NAMES[def.slot])}</small><h3>${e(def.name)}</h3><p>${e(def.description)}</p></div></header>
      <div class="ar-cols"><div class="ar-col"><figure class="ar-figure ar-figure-part">${partVisual(id,'ar-figure-art')}</figure>
        <ul class="ar-effects">${partEffects(id).map(effect=>`<li data-good="${effect.good}">${uiIcon(effect.good?'trendingUp':'alert')}${e(effect.text)}</li>`).join('')||'<li>Sem efeito nos números.</li>'}</ul></div>
        <div class="ar-col"><h4 class="ar-group">Serve em</h4>${rows||'<p class="ar-note">Nenhuma das suas armas aceita este equipamento.</p>'}</div></div>`;
  }

  // ---- Acting.
  function send(key:string,act:()=>void):void {
    busy.set(key,performance.now());act();host.sounds.select();
    clearTimeout(busyTimer);
    // Refused (an error toast came instead of an arsenal): the buttons come back by themselves.
    busyTimer=window.setTimeout(()=>{busy.clear();render();},BUSY_MS);
    render();
  }
  function setTab(next:Tab):void {if(next===tab)return;tab=next;preview=undefined;host.sounds.tab(next==='pecas'?1:-1);render();root.querySelector<HTMLElement>('[aria-current="true"]')?.focus({preventScroll:true});}
  const onClick=(event:MouseEvent)=>{
    const target=(event.target as Element).closest<HTMLElement>('button');
    if(!target||!root.contains(target))return;
    if(target.matches(':disabled')||target.getAttribute('aria-busy')==='true'){host.sounds.deny();return;}
    const d=target.dataset;
    if(d.arTab){setTab(d.arTab as Tab);return;}
    if(d.arWeapon){if(d.arWeapon!==weapon){weapon=d.arWeapon as WeaponId;preview=undefined;host.sounds.move(owned().indexOf(weapon));render();}return;}
    if(d.arPick){if(d.arPick!==part){part=d.arPick as PartId;host.sounds.move(ownedParts().indexOf(part));render();}return;}
    if(d.arEquip){const id=d.arEquip as WeaponId,item=arsenalWeapon(view(),id);if(item)send(`equip:${id}`,()=>weapons.equip(id,!item.equipped));return;}
    if(d.arSlot&&weapon){
      const slot=d.arSlot as PartSlot,choice=(d.arPart||null) as PartId|null;
      if((arsenalWeapon(view(),weapon)?.parts[slot]??null)===choice)return;
      const id=weapon;send(`${id}:${slot}`,()=>weapons.configure(id,slot,choice));return;
    }
    if(d.arUp&&weapon){const id=weapon,track=d.arUp as UpgradeTrack;send(`up:${id}:${track}`,()=>weapons.upgrade(id,track));return;}
    if(d.arFit&&part){const id=d.arFit as WeaponId,slot=PARTS[part].slot,choice=d.arOn==='true'?null:part;send(`${id}:${slot}`,()=>weapons.configure(id,slot,choice));}
  };
  // What a part or an upgrade would change, on the bars, while hovered or focused.
  const previewOf=(node:Element|null):Preview|undefined=>{
    const button=node?.closest<HTMLElement>('[data-ar-slot],[data-ar-up]');
    if(!button||!root.contains(button))return undefined;
    return button.dataset.arUp?{track:button.dataset.arUp as UpgradeTrack}:{slot:button.dataset.arSlot as PartSlot,part:(button.dataset.arPart||null) as PartId|null};
  };
  const same=(a?:Preview,b?:Preview)=>JSON.stringify(a)===JSON.stringify(b);
  const point=(node:Element|null)=>{const next=previewOf(node);if(!same(next,preview)){preview=next;renderPreview();}};
  const onOver=(event:Event)=>point(event.target as Element);
  const onOut=(event:Event)=>{if(!previewOf((event as MouseEvent|FocusEvent).relatedTarget as Element|null))point(null);};

  // The keys (and the pad, which presses them): arrows move to the nearest control that way, Enter presses, Q/E switch tabs, U closes.
  const onKey=(event:KeyboardEvent)=>{
    if(!root.isConnected||event.ctrlKey||event.altKey||event.metaKey)return;
    const active=document.activeElement as HTMLElement|null;
    if(active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))return;
    const arrows:Record<string,[number,number]>={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    const direction=arrows[event.key];
    let handled=true;
    if(direction)move(direction);
    else if(event.key==='Enter'&&active&&root.contains(active)&&active.tagName==='BUTTON')active.click();
    else if(event.code==='KeyQ'&&!event.repeat)setTab('armas');
    else if(event.code==='KeyE'&&!event.repeat)setTab('pecas');
    else if(inputCode(event.code)===weapons.keys.arsenal&&!event.repeat)host.close();
    else handled=false;
    if(handled){event.preventDefault();event.stopPropagation();}
  };
  function move([dx,dy]:[number,number]):void {
    const controls=[...root.querySelectorAll<HTMLElement>('button')].filter(node=>node.offsetParent!==null);
    const active=document.activeElement as HTMLElement|null;
    if(!active||!root.contains(active)){(root.querySelector<HTMLElement>('.ar-item[aria-current="true"]')??controls[0])?.focus();return;}
    // Between the two panes: right from the list goes to the details' first control, left from the details' left edge back to the chosen item.
    const list=root.querySelector<HTMLElement>('.ar-list'),detail=root.querySelector<HTMLElement>('.ar-detail'),wide=!!list&&getComputedStyle(list).flexDirection==='column';
    if(wide&&dx>0&&list!.contains(active)){const first=detail?.querySelector<HTMLElement>('button:not(:disabled)');if(first){first.focus();detail!.scrollTop=0;host.sounds.move(0);}return;}
    const from=active.getBoundingClientRect(),fx=from.left+from.width/2,fy=from.top+from.height/2;
    let best:HTMLElement|undefined,bestScore=Infinity;
    for(const node of controls){
      if(node===active)continue;
      const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      // Ahead in the arrow's direction (edges, so a wide neighbour still counts), then the nearest, the sideways offset weighing triple.
      const ahead=dx>0?r.left-from.right>-4:dx<0?from.left-r.right>-4:dy>0?r.top-from.bottom>-4:from.top-r.bottom>-4;
      if(!ahead)continue;
      const along=dx?(x-fx)*dx:(y-fy)*dy,side=dx?Math.abs(y-fy):Math.abs(x-fx);
      const score=along+side*3;
      if(along>0&&score<bestScore){bestScore=score;best=node;}
    }
    if(best&&wide&&dx<0&&list!.contains(best)&&!list!.contains(active))best=list!.querySelector<HTMLElement>('[aria-current="true"]')??best;
    if(!best)return;
    best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'});
    // Walking the list shows each item at once, as the pause menu does.
    if(best.matches('.ar-item'))best.click();else host.sounds.move(controls.indexOf(best));
  }

  root.addEventListener('click',onClick);
  root.addEventListener('pointerover',onOver);root.addEventListener('pointerout',onOut);
  root.addEventListener('focusin',onOver);root.addEventListener('focusout',onOut);
  window.addEventListener('keydown',onKey,true);
  const offChange=weapons.on('change',()=>{
    const v=view();
    if(v===shownArsenal&&weapons.gun.want===shownWant)return;
    if(v!==shownArsenal){busy.clear();clearTimeout(busyTimer);}
    render();
  });
  if(!view())weapons.requestArsenal();
  render();
  root.querySelector<HTMLElement>('.ar-item[aria-current="true"]')?.focus({preventScroll:true});
  return {destroy(){
    clearTimeout(busyTimer);offChange();window.removeEventListener('keydown',onKey,true);
    root.removeEventListener('click',onClick);root.removeEventListener('pointerover',onOver);root.removeEventListener('pointerout',onOut);
    root.removeEventListener('focusin',onOver);root.removeEventListener('focusout',onOut);
  }};
}
