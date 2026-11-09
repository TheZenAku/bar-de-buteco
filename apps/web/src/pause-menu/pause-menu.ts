import {uiIcon} from '../ui-icons';
import type {MenuSounds} from './menu-sounds';

/**
 * What a row of the list does when chosen:
 * - `action`: closes the menu and does it in the world (dance, open the chat);
 * - `window`: closes the menu and opens a window, which brings the menu back where it was when the player dismisses it;
 * - `switch`: turns something on or off in place;
 * - `page`: its controls are on the right (settings), or its text is (guide): → or Enter goes in;
 * - `confirm`: asks for a second press first (leaving the bar);
 * - `info`: text on the right (the guide); Enter steps in to scroll it only when it is longer than the pane.
 */
export type EntryKind='action'|'window'|'switch'|'page'|'confirm'|'info';
export interface MenuEntry {
  id:string;label:string;icon:string;kind:EntryKind;
  /** The key that does the same with the menu closed. */
  key?:string;
  hidden?:()=>boolean;
  /** Why it cannot be chosen now: said on the right, and the row knocks instead of acting. */
  blocked?:()=>string|undefined;
  /** A short live word at the row's end ("Dançando", "3 itens"); switches say Ligado or Desligado by themselves. */
  state?:()=>string|undefined;
  dot?:()=>boolean;
  run?:()=>void;
  on?:()=>boolean;toggle?:()=>void;
  /** The right side. A page's controls are `.pm-row` elements (rows.ts). */
  detail?:()=>string;
  /** While shown, about four times a second: figures that move (ping, meters) written in place. */
  live?:(pane:HTMLElement)=>void;
  /** Page controls that are not settings: `data-pm-act="name"` on an input or a button calls `acts[name]`. */
  acts?:Record<string,(control:HTMLElement)=>void>;
  tone?:'gold'|'danger';
  /** A small heading over the first row of a run with the same group (the guide: how things work, then the keys). */
  group?:string;
  /** The big faint glyph in the detail's corner; off where the detail has its own picture (the skin). */
  mark?:boolean;
  /** What Enter does, in the keys along the bottom, when the kind's own word is wrong (an action that opens something: Abrir). */
  verb?:string;
}
export interface MenuTab {id:string;label:string;icon:string;hidden?:()=>boolean;entries:MenuEntry[]}
export interface MenuHost {
  sounds:MenuSounds;
  /** Right side of the header: the player, the level and the wallet. */
  header():string;
  /** Under the title: where the player is (the minimap's zone). */
  where():string;
  /** Esc was pressed with nothing of the game's in front: the menu may open. Read before any other handler sees the key. */
  canOpen():boolean;
  /** Something that must not sit under the menu came up (the death scene): it closes. */
  mustClose():boolean;
  opened():void;
  closed(reason:'resume'|'window'|'action'):void;
}
type Zone='list'|'page';
const ROW_CONTROL='select,input,button:not(.pm-step)';
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Keys that stay the browser's: reload, developer tools, full screen, and anything with a modifier. */
const browserKey=(event:KeyboardEvent)=>['F5','F11','F12'].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey;

/**
 * The pause menu, opened with Esc (docs/sistemas/interface.md#menu). The world keeps running and drawing behind its blur:
 * nothing here disables the scene. It takes the keyboard while open (a window-level listener in the capture phase that
 * stops every key before the game's handlers) and the mouse (a scrim over the canvas; mouse-capture.ts lets the cursor go).
 */
export function createPauseMenu(parent:HTMLElement,tabs:MenuTab[],host:MenuHost){
  const root=document.createElement('div');
  root.id='pause-menu';root.className='pm hidden';root.setAttribute('data-capture-input','');
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Menu');
  root.innerHTML=`<div class="pm-scrim" data-pm-scrim></div>
    <section class="pm-frame">
      <header class="pm-head">
        <div class="pm-brand"><img src="/ui/logo-highland-hud.webp" alt="" width="128" height="128"><div><h2>Highland Bar</h2><p class="pm-where"></p></div></div>
        <div class="pm-me"></div>
      </header>
      <nav class="pm-tabs"><kbd class="pm-shift" data-pm-shift="-1" aria-hidden="true">Q</kbd><div class="pm-tabrow" role="tablist" aria-label="Seções"><i class="pm-tab-tube" aria-hidden="true"></i></div><kbd class="pm-shift" data-pm-shift="1" aria-hidden="true">E</kbd></nav>
      <div class="pm-body" data-zone="list">
        <div class="pm-list" role="menu"><i class="pm-tube" aria-hidden="true"></i></div>
        <div class="pm-detail"></div>
      </div>
      <footer class="pm-keys" aria-hidden="true"></footer>
    </section>`;
  parent.append(root);
  const q=<T extends HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const tabRow=q('.pm-tabrow'),tabTube=q('.pm-tab-tube'),list=q('.pm-list'),tube=q('.pm-tube'),detail=q('.pm-detail'),body=q('.pm-body'),keys=q('.pm-keys'),me=q('.pm-me'),where=q('.pm-where');
  let open=false,closing=0,tab=0,zone:Zone='list',row=0,openedAt=0,armed:{id:string;until:number}|undefined,live=0;
  /** The entry chosen on each section, kept while the menu is closed: it opens where the player left it. */
  const chosen=new Map<string,string>();
  let shownTabs:MenuTab[]=[],shownEntries:MenuEntry[]=[],listKey='',headerHtml='',whereText='';
  /** Each row as last written: the live tick rewrites one only when it changed (a node's outerHTML never reads back the same). */
  const written=new Map<string,string>();

  const visibleTabs=()=>tabs.filter(t=>!t.hidden?.());
  const visibleEntries=(t:MenuTab)=>t.entries.filter(entry=>!entry.hidden?.());
  const current=()=>shownEntries.find(entry=>entry.id===chosen.get(shownTabs[tab]?.id??''))??shownEntries[0];
  const isSwitch=(entry:MenuEntry)=>entry.kind==='switch';
  const stateOf=(entry:MenuEntry)=>{
    if(armed?.id===entry.id&&armed.until>performance.now())return 'De novo para confirmar';
    if(isSwitch(entry))return entry.on?.()?'Ligado':'Desligado';
    return entry.state?.()??'';
  };

  // ---- Drawing
  function renderTabs():void {
    shownTabs=visibleTabs();tab=Math.max(0,Math.min(shownTabs.length-1,tab));
    tabRow.querySelectorAll('.pm-tab').forEach(node=>node.remove());
    tabRow.insertAdjacentHTML('beforeend',shownTabs.map((t,i)=>`<button type="button" class="pm-tab" role="tab" data-pm-tab="${i}" aria-selected="${i===tab}" tabindex="-1">${uiIcon(t.icon)}<span>${t.label}</span></button>`).join(''));
  }
  function placeTabTube(snap=false):void {
    const button=tabRow.querySelector<HTMLElement>(`[data-pm-tab="${tab}"]`);if(!button)return;
    tabTube.classList.toggle('pm-snap',snap);
    tabTube.style.width=`${button.offsetWidth}px`;tabTube.style.transform=`translateX(${button.offsetLeft}px)`;
    // On a phone the tabs scroll sideways: the chosen one is kept in view.
    if(button.offsetLeft<tabRow.scrollLeft)tabRow.scrollLeft=button.offsetLeft;
    else if(button.offsetLeft+button.offsetWidth>tabRow.scrollLeft+tabRow.clientWidth)tabRow.scrollLeft=button.offsetLeft+button.offsetWidth-tabRow.clientWidth;
    tabRow.querySelectorAll<HTMLElement>('.pm-tab').forEach((node,i)=>node.setAttribute('aria-selected',String(i===tab)));
  }
  /** The neon lights again: a short flicker as it lands on a new section (and on opening). */
  function ignite():void {
    if(reduced())return;
    for(const node of [tabTube,tube]){node.classList.remove('pm-ignite');void node.offsetWidth;node.classList.add('pm-ignite');}
  }
  function itemHtml(entry:MenuEntry,selected:boolean):string {
    const state=stateOf(entry),blocked=entry.blocked?.();
    const role=isSwitch(entry)?`menuitemcheckbox" aria-checked="${!!entry.on?.()}`:'menuitem';
    const end=entry.kind==='page'?uiIcon('chevronRight'):entry.key?`<kbd>${entry.key}</kbd>`:'';
    return `<button type="button" class="pm-item${entry.tone?` pm-${entry.tone}`:''}${blocked?' pm-blocked':''}${isSwitch(entry)&&entry.on?.()?' pm-on':''}" role="${role}" data-pm-entry="${entry.id}" aria-current="${selected}" tabindex="${selected?0:-1}">`
      +`${uiIcon(entry.icon)}<span class="pm-label">${entry.label}${entry.dot?.()?'<i class="pm-dot" aria-label="novo"></i>':''}</span><span class="pm-state">${state}</span>${end}</button>`;
  }
  function renderList(snap=true):void {
    const t=shownTabs[tab];if(!t)return;
    shownEntries=visibleEntries(t);
    const selected=current();
    if(selected)chosen.set(t.id,selected.id);
    listKey=shownEntries.map(entry=>entry.id).join('|');
    list.querySelectorAll('.pm-item,.pm-gap').forEach(node=>node.remove());
    written.clear();
    list.insertAdjacentHTML('beforeend',shownEntries.map((entry,i)=>{const html=itemHtml(entry,entry===selected);written.set(entry.id,html);return (entry.group&&entry.group!==shownEntries[i-1]?.group?`<p class="pm-gap" role="presentation">${entry.group}</p>`:'')+html;}).join(''));
    list.setAttribute('aria-label',t.label);
    placeTube(snap);
  }
  function placeTube(snap=false):void {
    const item=list.querySelector<HTMLElement>('.pm-item[aria-current="true"]');
    tube.hidden=!item;if(!item)return;
    tube.classList.toggle('pm-snap',snap);
    tube.style.height=`${item.offsetHeight}px`;tube.style.transform=`translateY(${item.offsetTop}px)`;
    // Kept in view without the jump scrollIntoView makes: only when it has left the visible part.
    if(item.offsetTop<list.scrollTop)list.scrollTop=item.offsetTop-6;
    else if(item.offsetTop+item.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=item.offsetTop+item.offsetHeight-list.clientHeight+6;
  }
  function renderDetail():void {
    const entry=current();
    if(!entry){detail.innerHTML='';return;}
    // Under the title only what the row is doing now (dancing, on, off); a window's count is already in its detail.
    const blocked=entry.blocked?.(),state=entry.kind==='window'||entry.kind==='page'||entry.kind==='info'?'':stateOf(entry);
    detail.innerHTML=`<div class="pm-detail-head"><button type="button" class="pm-back" data-pm-back aria-label="Voltar">${uiIcon('chevronLeft')}</button><span class="pm-glyph${entry.tone?` pm-${entry.tone}`:''}">${uiIcon(entry.icon)}</span><div class="pm-title"><h3>${entry.label}</h3>${state?`<p class="pm-now">${state}</p>`:''}</div>${entry.key?`<kbd class="pm-key">${entry.key}</kbd>`:''}</div>`
      +`${blocked?`<p class="pm-why">${uiIcon('info')}${blocked}</p>`:''}<div class="pm-detail-body">${entry.detail?.()??''}</div>`;
    if(entry.kind!=='page'&&entry.kind!=='info'&&entry.mark!==false)detail.insertAdjacentHTML('beforeend',`<span class="pm-mark" aria-hidden="true">${uiIcon(entry.icon)}</span>`);
    detail.scrollTop=0;
    for(const range of detail.querySelectorAll<HTMLInputElement>('input[type=range]'))paintRange(range);
    entry.live?.(detail);
  }
  function renderKeys():void {
    const entry=current(),page=zone==='page';
    const verb=!entry?'':entry.verb??(entry.kind==='switch'?(entry.on?.()?'Desligar':'Ligar'):entry.kind==='page'?'Ajustar':entry.kind==='info'?(overflows()?'Ler':''):entry.kind==='window'?'Abrir':entry.kind==='confirm'?'Confirmar':'Fazer agora');
    const hint=(k:string,label:string)=>`<span><kbd>${k}</kbd>${label}</span>`;
    keys.innerHTML=page
      ?(scrollOnly()?hint('↑ ↓','Rolar'):hint('↑ ↓','Navegar')+hint('← →','Ajustar'))+hint('Esc','Voltar')+hint('Q E','Seções')
      :hint('↑ ↓','Navegar')+(verb?hint('Enter',verb):'')+hint('Q E','Seções')+hint('Esc','Fechar');
  }
  function renderHeader():void {
    const html=host.header();if(html!==headerHtml){headerHtml=html;me.innerHTML=html;}
    const text=host.where();if(text!==whereText){whereText=text;where.innerHTML=text?`${uiIcon('mapPin')}<span>${text}</span>`:'';}
  }
  function renderAll(snap=true):void {
    renderHeader();renderTabs();renderList(snap);renderDetail();renderKeys();setZone(zone,false);
    requestAnimationFrame(()=>{placeTabTube(snap);placeTube(snap);});
  }

  // ---- Moving around
  function setZone(next:Zone,focus=true):void {
    zone=next;body.dataset.zone=next;
    if(!focus)return;
    if(next==='list')list.querySelector<HTMLElement>('.pm-item[aria-current="true"]')?.focus({preventScroll:true});
    else focusRow(row);
    renderKeys();
  }
  function select(index:number,sound=true):void {
    const count=shownEntries.length;if(!count)return;
    const next=(index%count+count)%count,entry=shownEntries[next]!;
    if(entry.id===current()?.id){list.querySelector<HTMLElement>(`[data-pm-entry="${entry.id}"]`)?.focus({preventScroll:true});return;}
    const previous=current();
    armed=undefined;chosen.set(shownTabs[tab]!.id,entry.id);
    // The two rows that changed hands are written again, so the live tick's copy of each stays true.
    for(const each of new Set([previous,entry]))if(each){const node=list.querySelector<HTMLElement>(`[data-pm-entry="${each.id}"]`);if(node){const html=itemHtml(each,each===entry);written.set(each.id,html);node.outerHTML=html;}}
    list.querySelector<HTMLElement>(`[data-pm-entry="${entry.id}"]`)?.focus({preventScroll:true});
    placeTube();renderDetail();renderKeys();
    if(sound)host.sounds.move(next);
  }
  function switchTab(direction:number,to?:number):void {
    const count=shownTabs.length;if(count<2)return;
    const next=to??((tab+direction)%count+count)%count;if(next===tab)return;
    tab=next;armed=undefined;zone='list';
    renderList();renderDetail();renderKeys();setZone('list');
    requestAnimationFrame(()=>{placeTabTube();placeTube(true);ignite();});
    host.sounds.tab(direction||1);
  }
  const rows=()=>Array.from(detail.querySelectorAll<HTMLElement>('.pm-row')).filter(node=>!node.classList.contains('pm-off')&&node.querySelector(`${ROW_CONTROL}:not(:disabled)`));
  const controlOf=(node:HTMLElement)=>node.querySelector<HTMLElement>(`[data-pm-control]:not(:disabled)`)??node.querySelector<HTMLElement>(`${ROW_CONTROL.split(',').map(s=>`${s}:not(:disabled)`).join(',')}`);
  function focusRow(index:number,sound=false):void {
    const all=rows();
    if(!all.length){zone='list';body.dataset.zone='list';return;}
    row=Math.max(0,Math.min(all.length-1,index));
    const target=all[row]!;
    detail.querySelectorAll('.pm-row.pm-at').forEach(node=>node.classList.remove('pm-at'));
    target.classList.add('pm-at');controlOf(target)?.focus({preventScroll:true});
    // In view, a little below the sticky title.
    const box=target.getBoundingClientRect(),pane=detail.getBoundingClientRect();
    if(box.top<pane.top+90)detail.scrollTop-=pane.top+90-box.top;else if(box.bottom>pane.bottom-12)detail.scrollTop+=box.bottom-pane.bottom+12;
    if(sound)host.sounds.move(row);
  }
  /** A guide or a page without controls: ↑ ↓ scroll it instead. */
  const scrollOnly=()=>zone==='page'&&!rows().length;
  const overflows=()=>detail.scrollHeight>detail.clientHeight+4;
  function enterPage():void {
    const entry=current();if(!entry)return;
    if(!rows().length){
      // Text: on a phone the detail replaces the list; elsewhere it is entered only to scroll what does not fit.
      if(matchMedia('(max-width: 760px)').matches||overflows()){zone='page';body.dataset.zone='page';renderKeys();host.sounds.select();detail.tabIndex=-1;detail.focus({preventScroll:true});}
      else host.sounds.deny();
      return;
    }
    row=0;setZone('page');host.sounds.select();
  }
  function backToList(sound=true):void {
    zone='list';body.dataset.zone='list';detail.querySelectorAll('.pm-row.pm-at').forEach(node=>node.classList.remove('pm-at'));
    setZone('list');if(sound)host.sounds.back();
  }
  function activate(entry=current()):void {
    if(!entry)return;
    const blocked=entry.blocked?.();
    if(blocked){host.sounds.deny();return;}
    switch(entry.kind){
      case 'switch':{entry.toggle?.();const on=!!entry.on?.();host.sounds.toggle(on);refreshRow(entry);renderDetail();renderKeys();break;}
      case 'page':case 'info':enterPage();break;
      case 'confirm':
        if(armed?.id===entry.id&&armed.until>performance.now()){armed=undefined;host.sounds.select();close('action');entry.run?.();}
        else{armed={id:entry.id,until:performance.now()+4000};host.sounds.step(.8);refreshRow(entry);renderDetail();}
        break;
      case 'window':host.sounds.select();close('window');entry.run?.();break;
      default:host.sounds.select();close('action');entry.run?.();
    }
  }
  function refreshRow(entry:MenuEntry):void {
    const node=list.querySelector<HTMLElement>(`[data-pm-entry="${entry.id}"]`);if(!node)return;
    const selected=node.getAttribute('aria-current')==='true',focused=document.activeElement===node;
    const html=itemHtml(entry,selected);
    if(written.get(entry.id)===html)return;
    written.set(entry.id,html);node.outerHTML=html;
    if(focused)list.querySelector<HTMLElement>(`[data-pm-entry="${entry.id}"]`)?.focus({preventScroll:true});
  }
  /** ← → on a control: the previous or next choice, a step of a slider, a switch flipped. */
  function adjust(control:HTMLElement,direction:number,big=false):boolean {
    if(control instanceof HTMLSelectElement){
      const options=Array.from(control.options),count=options.length;if(!count)return false;
      let next=control.selectedIndex;
      for(let i=0;i<count;i++){next=(next+direction+count)%count;if(!options[next]!.disabled)break;}
      if(next===control.selectedIndex)return false;
      control.selectedIndex=next;control.dispatchEvent(new Event('change',{bubbles:true}));return true;
    }
    if(control instanceof HTMLInputElement&&control.type==='range'){
      const min=Number(control.min||0),max=Number(control.max||100),step=Number(control.step||1)*(big?5:1);
      const value=Math.max(min,Math.min(max,Number(control.value)+direction*step));
      if(value===Number(control.value))return false;
      control.value=String(value);control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));return true;
    }
    if(control instanceof HTMLInputElement&&control.type==='checkbox'){control.click();return true;}
    return false;
  }
  /** The bar under a slider shows the value: --v from 0 to 1. */
  function paintRange(range:HTMLInputElement):void {
    const min=Number(range.min||0),max=Number(range.max||100);
    range.style.setProperty('--v',String((Number(range.value)-min)/Math.max(1,max-min)));
  }

  // ---- Keys: every one stops here while open, so the world, the chat and the shortcuts never see them.
  function onKey(event:KeyboardEvent):void {
    if(!open||closing)return;
    if(browserKey(event))return;
    event.stopImmediatePropagation();
    const k=event.key,code=event.code;
    const handled=()=>event.preventDefault();
    if(k==='Tab'){handled();trapTab(event.shiftKey);return;}
    if(k==='Escape'||k==='Backspace'){
      handled();
      // The Esc that opened the menu, delivered twice (pointer lock and key): one opening only.
      if(performance.now()-openedAt<250)return;
      if(zone==='page')backToList();else close('resume');
      return;
    }
    if(code==='KeyQ'||k==='PageUp'){handled();if(!event.repeat)switchTab(-1);return;}
    if(code==='KeyE'||k==='PageDown'){handled();if(!event.repeat)switchTab(1);return;}
    const up=k==='ArrowUp'||code==='KeyW',down=k==='ArrowDown'||code==='KeyS',left=k==='ArrowLeft'||code==='KeyA',right=k==='ArrowRight'||code==='KeyD';
    const enter=k==='Enter'||k===' ';
    if(zone==='list'){
      if(up||down){handled();select(shownEntries.indexOf(current()!)+(up?-1:1));return;}
      if(k==='Home'||k==='End'){handled();select(k==='Home'?0:shownEntries.length-1);return;}
      const entry=current();if(!entry)return;
      if(right&&(entry.kind==='page'||entry.kind==='info')){handled();enterPage();return;}
      if((left||right)&&isSwitch(entry)){handled();if(!!entry.on?.()!==right)activate(entry);else host.sounds.deny();return;}
      if(enter){handled();if(!event.repeat)activate(entry);return;}
      return;
    }
    // In a page.
    if(scrollOnly()){
      if(up||down){handled();detail.scrollBy({top:up?-80:80,behavior:reduced()?'auto':'smooth'});return;}
      if(left){handled();backToList();return;}
      return;
    }
    const all=rows(),target=all[row];
    if(up||down){handled();focusRow(row+(up?-1:1),true);return;}
    if(k==='Home'||k==='End'){handled();focusRow(k==='Home'?0:all.length-1,true);return;}
    const control=target?controlOf(target):null;
    if(!control)return;
    if(left||right){
      handled();
      if(control instanceof HTMLButtonElement){if(left)backToList();return;}
      if(!adjust(control,left?-1:1,event.shiftKey))host.sounds.deny();
      return;
    }
    if(enter){
      handled();if(event.repeat)return;
      if(control instanceof HTMLButtonElement)control.click();
      else if(control instanceof HTMLSelectElement)adjust(control,1);
      else if(control instanceof HTMLInputElement&&control.type==='checkbox')control.click();
      else host.sounds.deny();
    }
  }
  /** Tab walks the menu's own controls and wraps around: the page behind is out of reach while it is open. */
  function trapTab(back:boolean):void {
    const all=Array.from(root.querySelectorAll<HTMLElement>('.pm-item,.pm-detail select,.pm-detail input,.pm-detail button:not(.pm-step):not(.pm-back)')).filter(node=>!(node as HTMLButtonElement).disabled&&node.offsetParent!==null);
    if(!all.length)return;
    const at=all.indexOf(document.activeElement as HTMLElement),next=all[(at+(back?-1:1)+all.length)%all.length]!;
    next.focus({preventScroll:true});
  }
  window.addEventListener('keydown',onKey,true);
  // Esc opens it when nothing of the game's is in front. Whether anything is, is read now, before any handler closes it;
  // the decision waits until every handler has had the key (one that used it, like a pool cue let go, prevents its default).
  window.addEventListener('keydown',event=>{
    if(open||event.key!=='Escape'||event.repeat||!host.canOpen())return;
    setTimeout(()=>{if(!event.defaultPrevented&&!open&&host.canOpen())openMenu();},0);
  },true);
  root.addEventListener('focusin',event=>{
    const target=event.target as HTMLElement,item=target.closest<HTMLElement>('.pm-item');
    if(item){if(zone!=='list'){zone='list';body.dataset.zone='list';detail.querySelectorAll('.pm-row.pm-at').forEach(node=>node.classList.remove('pm-at'));renderKeys();}const index=shownEntries.findIndex(entry=>entry.id===item.dataset.pmEntry);if(index>=0&&shownEntries[index]!.id!==current()?.id)select(index);return;}
    const at=target.closest<HTMLElement>('.pm-row');
    if(at){const index=rows().indexOf(at);if(index>=0){row=index;detail.querySelectorAll('.pm-row.pm-at').forEach(node=>node.classList.toggle('pm-at',node===at));at.classList.add('pm-at');if(zone!=='page'){zone='page';body.dataset.zone='page';renderKeys();}}}
  });

  // ---- Pointer: hover picks (as a stick would), a click acts; a press outside the frame closes.
  root.addEventListener('pointermove',event=>{
    if(!open||event.pointerType==='touch')return;
    const target=event.target as HTMLElement,item=target.closest<HTMLElement>('.pm-item');
    if(item){const index=shownEntries.findIndex(entry=>entry.id===item.dataset.pmEntry);if(index>=0&&shownEntries[index]!.id!==current()?.id)select(index);return;}
  });
  root.addEventListener('click',event=>{
    if(!open||closing)return;
    const target=event.target as HTMLElement;
    const tabButton=target.closest<HTMLElement>('[data-pm-tab]');if(tabButton){const to=Number(tabButton.dataset.pmTab);switchTab(to>tab?1:-1,to);return;}
    const shift=target.closest<HTMLElement>('[data-pm-shift]');if(shift){switchTab(Number(shift.dataset.pmShift));return;}
    if(target.closest('[data-pm-back]')){backToList();return;}
    const item=target.closest<HTMLElement>('.pm-item');
    if(item){const index=shownEntries.findIndex(entry=>entry.id===item.dataset.pmEntry);if(index<0)return;if(shownEntries[index]!.id!==current()?.id)select(index,false);activate(shownEntries[index]);return;}
    const step=target.closest<HTMLElement>('.pm-step');
    if(step){const at=step.closest<HTMLElement>('.pm-row'),control=at?controlOf(at):null;if(control&&!adjust(control,Number(step.dataset.step)))host.sounds.deny();return;}
    if(target.closest('.pm-btn'))host.sounds.select();
    const act=target.closest<HTMLElement>('button[data-pm-act]');
    // A command can change other rows (Restaurar turns the lock off): the page is drawn again, on the same row.
    if(act){current()?.acts?.[act.dataset.pmAct!]?.(act);redraw();return;}
    // A click on a row's name works its control, as a label would.
    const at=target.closest<HTMLElement>('.pm-row');
    if(at&&!target.closest(ROW_CONTROL)){const control=controlOf(at);if(control instanceof HTMLSelectElement)adjust(control,1);else if(control instanceof HTMLInputElement&&control.type==='checkbox')control.click();else if(control instanceof HTMLButtonElement)control.click();}
  });
  root.addEventListener('pointerdown',event=>{if(open&&(event.target as HTMLElement).hasAttribute('data-pm-scrim'))close('resume');});
  // Sounds for whatever moved a control (keys, clicks, a dragged slider), and the slider's bar.
  root.addEventListener('input',event=>{const target=event.target as HTMLInputElement;if(target.type!=='range')return;paintRange(target);const min=Number(target.min||0),max=Number(target.max||100);host.sounds.step((Number(target.value)-min)/Math.max(1,max-min));});
  root.addEventListener('change',event=>{
    const target=event.target as HTMLElement;
    if(target instanceof HTMLInputElement&&target.type==='checkbox')host.sounds.toggle(target.checked);
    else if(target instanceof HTMLSelectElement)host.sounds.step(target.selectedIndex/Math.max(1,target.options.length-1));
    const act=target.dataset.pmAct;if(act)current()?.acts?.[act]?.(target);
  });
  addEventListener('resize',()=>{if(open)requestAnimationFrame(()=>{placeTabTube(true);placeTube(true);});});

  // ---- Live: the header, the rows' states and the shown entry's figures, while open.
  function tick():void {
    if(!open)return;
    if(host.mustClose()){close('resume');return;}
    renderHeader();
    const t=shownTabs[tab];
    const tabsNow=visibleTabs().map(x=>x.id).join('|');
    if(tabsNow!==shownTabs.map(x=>x.id).join('|')){renderAll(true);return;}
    if(t&&visibleEntries(t).map(entry=>entry.id).join('|')!==listKey){const focusInList=zone==='list';renderList(true);renderDetail();renderKeys();if(focusInList)setZone('list');return;}
    for(const entry of shownEntries)refreshRow(entry);
    if(armed&&armed.until<=performance.now()){const entry=shownEntries.find(x=>x.id===armed!.id);armed=undefined;if(entry){refreshRow(entry);if(entry===current())renderDetail();}}
    current()?.live?.(detail);
  }

  function redraw():void {
    if(!open)return;
    const keepRow=row,inPage=zone==='page';
    renderHeader();renderList(true);renderDetail();renderKeys();
    if(inPage&&rows().length){zone='page';body.dataset.zone='page';focusRow(keepRow);}else setZone('list');
  }
  function openMenu(options:{tab?:string;entry?:string;quiet?:boolean}={}):void {
    if(open&&!closing){if(options.tab||options.entry)goTo(options);return;}
    window.clearTimeout(closing);closing=0;
    open=true;openedAt=performance.now();zone='list';armed=undefined;
    if(options.tab){const index=visibleTabs().findIndex(t=>t.id===options.tab);if(index>=0)tab=index;}
    if(options.entry&&options.tab)chosen.set(options.tab,options.entry);
    root.classList.remove('hidden','pm-closing');document.documentElement.classList.add('pm-paused');
    renderAll(true);
    void root.offsetWidth;root.classList.add('pm-open');
    setZone('list');
    if(!options.quiet)host.sounds.open();else host.sounds.select();
    requestAnimationFrame(()=>{placeTabTube(true);placeTube(true);ignite();});
    window.clearInterval(live);live=window.setInterval(tick,250);
    host.opened();
  }
  function goTo(options:{tab?:string;entry?:string}):void {
    const index=options.tab?visibleTabs().findIndex(t=>t.id===options.tab):-1;
    if(index>=0&&index!==tab){tab=index;}
    if(options.entry&&options.tab)chosen.set(options.tab,options.entry);
    zone='list';renderAll(true);setZone('list');
  }
  function close(reason:'resume'|'window'|'action'='resume'):void {
    if(!open||closing)return;
    window.clearInterval(live);armed=undefined;
    if(reason==='resume')host.sounds.close();
    root.classList.remove('pm-open');root.classList.add('pm-closing');document.documentElement.classList.remove('pm-paused');
    if(root.contains(document.activeElement))(document.activeElement as HTMLElement).blur();
    const done=()=>{closing=0;open=false;root.classList.add('hidden');root.classList.remove('pm-closing');};
    // The world gets the keys back at once; the fade only draws.
    open=false;closing=window.setTimeout(done,reduced()?0:170);
    host.closed(reason);
  }
  return {
    get isOpen(){return open;},
    open:openMenu,
    close,
    /** Draws everything again in place (a preset that changed every graphics row, a voice mode that disables one). */
    refresh:redraw,
    /** The entry on screen now, if the menu is open on it. */
    showing(id:string):boolean {return open&&current()?.id===id;},
  };
}
export type PauseMenu=ReturnType<typeof createPauseMenu>;
