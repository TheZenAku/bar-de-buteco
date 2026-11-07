import {INVENTORY_CAPACITY,STORAGE,itemById,storageStackMax,type InventoryStack,type StorageView} from '@bar/shared';
import {escape as e} from './api';
import {plateHtml} from './garage-panel';
import {itemImage,uiIcon} from './ui-icons';

/** What the panel needs to draw the two sides: the hold (from the room) and the backpack (the room keeps it in `inventory.state`). */
export interface StoragePanelModel {
  storage:StorageView;backpack:readonly InventoryStack[];backpackCapacity:number;
  /** `side:itemId` of the stack picked, and whether a move is with the API right now. */
  selected:string;busy:boolean;
}
const slot=(side:'hold'|'bag',stack:InventoryStack,selected:string)=>{
  const item=itemById(stack.itemId);if(!item)return '';
  return `<button type="button" class="inventory-slot" data-action="storage-select" data-side="${side}" data-item="${e(item.id)}" aria-pressed="${selected===`${side}:${item.id}`}" aria-label="${e(item.name)}, ${stack.quantity}" title="${e(item.name)}">${itemImage(item)}<b>${stack.quantity}</b></button>`;
};
const grid=(side:'hold'|'bag',stacks:readonly InventoryStack[],capacity:number,selected:string)=>
  stacks.filter(stack=>itemById(stack.itemId)).map(stack=>slot(side,stack,selected)).join('')+Array.from({length:Math.max(0,capacity-stacks.length)},()=>'<span class="inventory-slot empty" aria-hidden="true"></span>').join('');

/** The truck's hold beside the backpack: pick a stack, then move one, five or all of it across. */
export function storagePanelHtml({storage,backpack,backpackCapacity,selected,busy}:StoragePanelModel):string {
  const [side,itemId]=selected.split(':') as ['hold'|'bag'|undefined,string|undefined],item=itemId?itemById(itemId):undefined;
  const inHold=storage.stacks.find(stack=>stack.itemId===itemId)?.quantity??0,inBag=backpack.find(stack=>stack.itemId===itemId)?.quantity??0;
  const bagFull=!inBag&&backpack.length>=INVENTORY_CAPACITY,holdFull=!inHold&&storage.usedSlots>=storage.capacity;
  let detail='<div class="item-detail empty"><p class="empty-state">Escolha um item para guardar ou retirar.</p></div>';
  if(item&&side){
    const from=side==='bag'?inBag:inHold,direction=side==='bag'?'deposit':'withdraw';
    // What fits at the other end: the hold's stack limit when storing, the backpack's when taking out.
    const room=side==='bag'?storageStackMax(item.id)-inHold:item.stackMax-inBag;
    const limit=Math.max(0,Math.min(from,room,STORAGE.MAX_MOVE)),blocked=side==='bag'?(holdFull?'O baú está cheio.':room<=0?`O baú já tem o máximo de ${e(item.name)}.`:''):(bagFull?'Sua mochila está cheia.':room<=0?`Sua mochila já tem o máximo de ${e(item.name)}.`:'');
    const button=(amount:number,label:string)=>`<button type="button" class="button ${amount===1?'primary':'secondary'}" data-action="storage-move" data-direction="${direction}" data-item="${e(item.id)}" data-amount="${amount}" ${busy||blocked||amount>limit||amount<1?'disabled':''}>${label}</button>`;
    detail=`<section class="item-detail" aria-label="${e(item.name)}"><header><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><div><small>${side==='bag'?'Na mochila':'No baú'}</small><h3>${e(item.name)}</h3></div><strong>×${from}</strong></header>
      <p>${e(item.description)}</p>${blocked?`<p class="item-blocked">${blocked}</p>`:''}
      <div class="item-actions">${button(1,side==='bag'?'Guardar 1':'Retirar 1')}${button(5,side==='bag'?'Guardar 5':'Retirar 5')}${button(Math.max(1,limit),side==='bag'?'Guardar tudo':'Retirar tudo')}</div></section>`;
  }
  const usedHold=storage.usedSlots,usedBag=backpack.length;
  return `<div class="storage-panel" data-storage="${e(storage.vehicleId)}">
    <div class="moto-owner">${plateHtml(storage.plate)}<b>${e(storage.name)}</b><span>${uiIcon('package')}${storage.units} ${storage.units===1?'unidade':'unidades'} no baú</span></div>
    <div class="storage-columns">
      <section class="storage-side" aria-label="Baú do caminhão"><div class="inventory-summary"><div class="status-row"><span>${uiIcon('package')} Baú</span><b>${usedHold} / ${storage.capacity} pilhas</b></div><div class="hud-track"><i style="width:${Math.min(100,usedHold/Math.max(1,storage.capacity)*100)}%"></i></div></div>
        <div class="inventory-slots" role="group" aria-label="Itens no baú">${grid('hold',storage.stacks,storage.capacity,selected)}</div></section>
      <section class="storage-side" aria-label="Mochila"><div class="inventory-summary"><div class="status-row"><span>${uiIcon('bag')} Mochila</span><b>${usedBag} / ${backpackCapacity} pilhas</b></div><div class="hud-track"><i style="width:${Math.min(100,usedBag/Math.max(1,backpackCapacity)*100)}%"></i></div></div>
        <div class="inventory-slots" role="group" aria-label="Itens na mochila">${grid('bag',backpack,backpackCapacity,selected)}</div></section>
    </div>
    ${detail}
    <p class="fine-print">O baú só abre para quem tem a chave, de pé atrás do caminhão, com ele parado. Ele fecha sozinho se você se afastar. Cada item cabe até ${STORAGE.STACK_FACTOR}× o limite da mochila, em até ${storage.capacity} pilhas.</p>
  </div>`;
}
