import {GARAGES,HIGHFOOD,type HighfoodDialog,type HighfoodReceipt,type HighfoodState} from '@bar/shared';
import {escape as e} from '../api';
import {uiIcon} from '../ui-icons';
import {customerPicture} from './npc-avatar';

/** The local player's shift as the room tells it, for the phone's app, the GPS and the prompts. */
export function createCourier(){
  let state:HighfoodState={status:'off',since:0,done:0,earned:0},owned=false;
  const listeners=new Set<(state:HighfoodState)=>void>(),receipts=new Set<(receipt:HighfoodReceipt)=>void>();
  return {
    state:()=>state,
    owned:()=>owned,
    setOwned(value:boolean):void {owned=value;},
    update(next:HighfoodState):void {state=next;for(const listener of listeners)listener(state);},
    receipt(receipt:HighfoodReceipt):void {for(const listener of receipts)listener(receipt);},
    listen(listener:(state:HighfoodState)=>void):()=>void {listeners.add(listener);return ()=>listeners.delete(listener);},
    receipts(listener:(receipt:HighfoodReceipt)=>void):()=>void {receipts.add(listener);return ()=>receipts.delete(listener);},
  };
}
export type Courier=ReturnType<typeof createCourier>;

/** The base's panel: what E on the ring shows. */
export function basePanelHtml(owned:boolean,bikeOut:boolean,state:HighfoodState,price:number,cap:number):string {
  const logo=`<img class="hf-panel-logo" src="${import.meta.env.BASE_URL}highfood/logo.webp" alt="Highfood, Highland Bar Delivery" draggable="false">`;
  if(!owned)return `<div class="hf-panel">${logo}<p class="modal-description">Para entregar pelo Highfood você precisa de uma moto.</p><p class="modal-description">Abra o app <b>HighMotors</b> no celular (K). A moto custa <b>${price.toLocaleString('pt-BR')} moedas</b> e fica guardada na garagem, em ${GARAGES.length} pontos na rua ao lado do bar.</p><button class="button primary" data-action="food-motors">${uiIcon('bike')}Abrir o HighMotors</button></div>`;
  if(state.status!=='off')return `<div class="hf-panel">${logo}<p class="modal-description">Você está online. Hoje neste turno: <b>${state.done}</b> ${state.done===1?'entrega':'entregas'}, <b>${state.earned.toLocaleString('pt-BR')}</b> moedas.</p><div class="hf-panel-actions"><button class="button primary" data-action="food-app">${uiIcon('food')}Abrir o Highfood</button><button class="button" data-action="food-stop">Ficar offline</button></div></div>`;
  return `<div class="hf-panel">${logo}<p class="modal-description">Fique online e os pedidos começam a chegar no app <b>Highfood</b> do celular. Não aparece aviso na tela: o celular vibra no bolso, e é preciso olhar o app para ver e aceitar o pedido.</p>
    <ul class="hf-panel-list"><li>${uiIcon('compass')}O GPS do minimapa mostra o caminho até o cliente.</li><li>${uiIcon('bag')}Desça da moto perto do endereço: o pedido sai do baú.</li><li>${uiIcon('coins')}Entregue na mão do cliente e receba na hora, até ${cap.toLocaleString('pt-BR')} moedas por dia.</li><li>${uiIcon('flame')}Batendo a moto, o pedido amassa e vale menos.</li>${bikeOut?'':`<li>${uiIcon('warehouse')}Sua moto está na garagem: retire ela para os pedidos chegarem.</li>`}</ul>
    <button class="button primary" data-action="food-start">${uiIcon('bike')}Ficar online</button></div>`;
}

/** The customer's speech when handing over: their face, what they say, and the one thing to do. */
export function createFoodDialog(root:HTMLElement,actions:{confirm:(orderId:string)=>void;leave:()=>void}){
  const node=document.createElement('section');
  node.id='food-dialog';node.className='food-dialog';node.hidden=true;node.setAttribute('role','dialog');node.setAttribute('aria-label','Entrega');
  root.append(node);
  let current:HighfoodDialog|undefined,typing:ReturnType<typeof setInterval>|undefined;
  const key=(event:KeyboardEvent)=>{
    if(!current)return;
    const name=event.key.toLowerCase();
    if(name==='e'||event.key==='Enter'){event.preventDefault();event.stopPropagation();actions.confirm(current.orderId);close();}
    else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();actions.leave();close();}
  };
  function close():void {
    current=undefined;clearInterval(typing);node.classList.remove('open');
    removeEventListener('keydown',key,true);
    setTimeout(()=>{if(!current)node.hidden=true;},220);
  }
  node.addEventListener('click',event=>{
    const action=(event.target as HTMLElement).closest<HTMLElement>('[data-food]')?.dataset.food;
    if(!current||!action)return;
    if(action==='confirm')actions.confirm(current.orderId);else actions.leave();
    close();
  });
  return {
    get isOpen(){return !!current;},
    show(dialog:HighfoodDialog|null):void {
      if(!dialog){if(current)close();return;}
      clearInterval(typing);
      const firstOpen=!current;current=dialog;
      node.hidden=false;
      node.innerHTML=`${customerPicture(dialog.customer,'npc-picture food-dialog-face')}<div class="food-dialog-body"><header><b>${e(dialog.customer.name)}</b><small>${e(dialog.restaurant)} · ${e(dialog.items.join(', '))}</small></header><p class="food-dialog-line" aria-live="polite"></p>
        <div class="food-dialog-actions"><button type="button" class="button primary" data-food="confirm">${uiIcon('bag')}Entregar o pedido<kbd>E</kbd></button><button type="button" class="button" data-food="leave">Agora não<kbd>Esc</kbd></button></div></div>`;
      const line=node.querySelector<HTMLElement>('.food-dialog-line')!,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduced)line.textContent=dialog.line;
      else {let shown=0;typing=setInterval(()=>{shown=Math.min(dialog.line.length,shown+2);line.textContent=dialog.line.slice(0,shown);if(shown>=dialog.line.length)clearInterval(typing);},28);}
      requestAnimationFrame(()=>node.classList.add('open'));
      if(firstOpen)addEventListener('keydown',key,true);
    },
    reset():void {if(current)close();},
  };
}
void HIGHFOOD;
