import {EMPTY_OFFER,MAX_COIN_BALANCE,VEHICLE_KEY,itemById,offerIsEmpty,type InventoryView,type ItemId,type TradeClosed,type TradeInvite,type TradeOffer,type TradeSideView,type TradeView} from '@bar/shared';
import {escape as e} from '../api';
import {plateHtml} from '../garage-panel';
import {itemImage,uiIcon} from '../ui-icons';

const money=(value:number)=>value.toLocaleString('pt-BR');
const keyImage=()=>`<img class="item-img" src="${import.meta.env.BASE_URL}${VEHICLE_KEY.icon}" alt="" draggable="false">`;
export interface TradeHooks {
  send(type:string,payload:Record<string,unknown>):void;
  inventory():InventoryView|undefined;balance():number;now():number;
  notify(title:string,text:string,warning?:boolean):void;
  /** The window: the game's modal. */
  open():void;close():void;isOpen():boolean;content():HTMLElement;
  /** Who is around the invitation goes in. */
  root:HTMLElement;
}
const line=(image:string,label:string,count:string,extra='')=>`<li class="trade-line" ${extra}><span class="item-icon" aria-hidden="true">${image}</span><span>${label}</span><b>${count}</b></li>`;
/** What one side is giving, the same way in both columns and on the review. */
function offerLines(side:TradeSideView,removable:boolean):string {
  const remove=(kind:string,id:string)=>removable?`data-trade-remove="${kind}" data-id="${e(id)}" role="button" tabindex="0" title="Tirar da oferta"`:'';
  const rows=[
    ...(side.offer.coins?[line(uiIcon('coins'),'Moedas',money(side.offer.coins))]:[]),
    ...side.offer.items.map(({itemId,quantity})=>{const item=itemById(itemId);return line(item?itemImage(item):'',e(item?.name??itemId),`×${quantity}`,remove('item',itemId));}),
    ...side.vehicles.map(vehicle=>`<li class="trade-line trade-key" ${remove('vehicle',vehicle.id)}><span class="item-icon" aria-hidden="true">${keyImage()}</span><span>${e(VEHICLE_KEY.name)} ${plateHtml(vehicle.plate)}<small>Quem fica com a chave fica com o veículo.</small></span><b>×1</b></li>`),
  ];
  return rows.length?`<ul class="trade-lines">${rows.join('')}</ul>`:'<p class="trade-nothing">Nada ainda.</p>';
}

/**
 * The trade's window and invitation (docs/sistemas/troca.md). It only ever shows what the room says is on the table and asks it to change: nothing here decides
 * anything. Agreeing and confirming carry the version on screen, so a change made a moment before a click is not agreed to.
 */
export function createTrade(hooks:TradeHooks){
  let view:TradeView|undefined,invite:TradeInvite|undefined,inviteTimer:ReturnType<typeof setInterval>|undefined,tick:ReturnType<typeof setInterval>|undefined,coinTimer:ReturnType<typeof setTimeout>|undefined;
  let theirsShown='',changedAt=0;
  const inviteNode=document.createElement('section');
  inviteNode.className='trade-invite';inviteNode.hidden=true;inviteNode.setAttribute('role','alertdialog');inviteNode.setAttribute('aria-label','Convite para negociar');inviteNode.setAttribute('data-capture-input','');
  hooks.root.append(inviteNode);
  function dropInvite():void {invite=undefined;clearInterval(inviteTimer);inviteNode.hidden=true;inviteNode.replaceChildren();}
  inviteNode.addEventListener('click',event=>{
    const answer=(event.target as HTMLElement).closest<HTMLElement>('[data-trade-invite]')?.dataset.tradeInvite;
    if(!answer||!invite)return;
    hooks.send('trade.respond',{inviteId:invite.id,accept:answer==='yes'});dropInvite();
  });
  const mine=():TradeOffer=>view?.me.offer??EMPTY_OFFER;
  const sendOffer=(offer:TradeOffer)=>{if(view)hooks.send('trade.offer',{tradeId:view.id,offer});};
  function backpackHtml():string {
    const pack=hooks.inventory(),offered=new Map(mine().items.map(item=>[item.itemId,item.quantity]));
    if(!pack)return '';
    const keys=(pack.keys??[]).map(key=>{const on=mine().vehicles.includes(key.vehicleId);return `<button type="button" class="inventory-slot vehicle-key" data-trade-add="vehicle" data-id="${e(key.vehicleId)}" aria-pressed="${on}" title="${e(VEHICLE_KEY.name)} ${e(key.plate)}. ${e(VEHICLE_KEY.description)}" aria-label="${e(VEHICLE_KEY.name)}, placa ${e(key.plate)}">${keyImage()}<small>${e(key.plate)}</small></button>`;}).join('');
    const items=pack.stacks.map(stack=>{const item=itemById(stack.itemId);if(!item)return '';const left=stack.quantity-(offered.get(stack.itemId)??0);return `<button type="button" class="inventory-slot" data-trade-add="item" data-id="${e(item.id)}" ${left>0?'':'disabled'} title="${e(item.name)}: clique para pôr 1 na oferta" aria-label="${e(item.name)}, ${left}">${itemImage(item)}<b>${left}</b></button>`;}).join('');
    return `<h4>Sua mochila</h4><div class="inventory-slots trade-pack">${keys}${items||(keys?'':'<p class="trade-nothing">Sua mochila está vazia.</p>')}</div><p class="fine-print">Clique num item para pôr na oferta, e na linha da oferta para tirar.</p>`;
  }
  function offerStage(state:TradeView):string {
    const changed=performance.now()-changedAt<4000;
    return `<div class="trade-grid">
      <section class="trade-side"><header><h4>Sua oferta</h4>${state.me.ready?`<span class="trade-pill ok">${uiIcon('check')}Você aceitou</span>`:''}</header>
        <label class="trade-coins">${uiIcon('coins')}<span>Moedas (você tem ${money(hooks.balance())})</span><input type="number" name="trade-coins" min="0" max="${Math.min(hooks.balance(),MAX_COIN_BALANCE)}" step="1" inputmode="numeric" value="${state.me.offer.coins}" aria-label="Moedas na sua oferta"></label>
        ${offerLines(state.me,true)}</section>
      <section class="trade-side ${changed?'changed':''}" data-trade-them><header><h4>Oferta de ${e(state.them.name)}</h4>${state.them.ready?`<span class="trade-pill ok">${uiIcon('check')}Aceitou</span>`:'<span class="trade-pill">Escolhendo…</span>'}</header>
        ${offerLines(state.them,false)}${changed?'<p class="trade-warning" role="status">A oferta mudou agora. Confira de novo.</p>':''}</section></div>
      <div class="trade-pack-box">${backpackHtml()}</div>
      <div class="trade-actions"><button type="button" class="button primary" data-trade="ready" ${state.me.ready||(offerIsEmpty(state.me.offer)&&offerIsEmpty(state.them.offer))?'disabled':''}>${uiIcon('check')}${state.me.ready?`Esperando ${e(state.them.name)}`:'Aceitar esta oferta'}</button>${state.me.ready?'<button type="button" class="button" data-trade="unready">Mudar a oferta</button>':''}<button type="button" class="button" data-trade="cancel">Cancelar</button></div>`;
  }
  function reviewStage(state:TradeView):string {
    const wait=Math.max(0,Math.ceil((state.confirmableAt-hooks.now())/1000)),nothing=offerIsEmpty(state.them.offer),giving=state.me.vehicles.length>0;
    return `<p class="modal-description">As duas ofertas estão travadas. Leia com calma antes de confirmar: uma troca feita não volta.</p>
      <div class="trade-grid"><section class="trade-side"><header><h4>Você entrega</h4></header>${offerLines(state.me,false)}</section><section class="trade-side"><header><h4>Você recebe de ${e(state.them.name)}</h4></header>${offerLines(state.them,false)}</section></div>
      ${nothing?'<p class="trade-warning" role="alert">Você não vai receber nada nessa troca.</p>':''}${giving?`<p class="trade-warning" role="alert">Você vai entregar ${state.me.vehicles.length===1?'uma chave':'chaves'}: ${state.me.vehicles.length===1?'o veículo passa':'os veículos passam'} para ${e(state.them.name)} e não ${state.me.vehicles.length===1?'volta':'voltam'}.</p>`:''}
      <div class="trade-actions"><button type="button" class="button primary" data-trade="confirm" ${wait>0||state.me.confirmed?'disabled':''}>${uiIcon('check')}<span data-trade-count>${state.me.confirmed?`Esperando ${e(state.them.name)}`:wait>0?`Confirmar em ${wait} s`:'Confirmar a troca'}</span></button><button type="button" class="button" data-trade="unready">Voltar</button><button type="button" class="button" data-trade="cancel">Cancelar</button></div>`;
  }
  function render():void {
    if(!view||!hooks.isOpen())return;
    const body=hooks.content(),field=body.querySelector<HTMLInputElement>('input[name="trade-coins"]'),typing=field&&document.activeElement===field,typed=field?.value;
    body.innerHTML=`<div class="trade-window" data-trade-stage="${view.stage}" data-version="${view.version}">${view.stage==='offer'?offerStage(view):view.stage==='review'?reviewStage(view):`<div class="trade-busy" role="status">${uiIcon('handshake')}<p>Fazendo a troca…</p><small>Isso é rápido. Se a conexão cair, ela termina do mesmo jeito.</small></div>`}</div>`;
    // Rewritten on every change from the other side: what is being typed stays.
    if(typing){const again=body.querySelector<HTMLInputElement>('input[name="trade-coins"]');if(again){again.value=typed??'';again.focus();}}
  }
  function clickWindow(event:MouseEvent):void {
    if(!view||!hooks.isOpen())return;
    const target=event.target as HTMLElement;
    if(!target.closest('.trade-window'))return;
    const add=target.closest<HTMLElement>('[data-trade-add]');
    if(add&&view.stage==='offer'){
      const offer=mine(),id=add.dataset.id!;
      if(add.dataset.tradeAdd==='vehicle')sendOffer({...offer,vehicles:offer.vehicles.includes(id)?offer.vehicles.filter(each=>each!==id):[...offer.vehicles,id]});
      else{
        const has=offer.items.find(item=>item.itemId===id);
        sendOffer({...offer,items:has?offer.items.map(item=>item.itemId===id?{...item,quantity:item.quantity+1}:item):[...offer.items,{itemId:id as ItemId,quantity:1}]});
      }
      return;
    }
    const remove=target.closest<HTMLElement>('[data-trade-remove]');
    if(remove&&view.stage==='offer'){
      const offer=mine(),id=remove.dataset.id!;
      if(remove.dataset.tradeRemove==='vehicle')sendOffer({...offer,vehicles:offer.vehicles.filter(each=>each!==id)});
      else sendOffer({...offer,items:offer.items.flatMap(item=>item.itemId!==id?[item]:item.quantity>1?[{...item,quantity:item.quantity-1}]:[])});
      return;
    }
    switch(target.closest<HTMLElement>('[data-trade]')?.dataset.trade){
      case 'ready':hooks.send('trade.ready',{tradeId:view.id,version:view.version,ready:true});break;
      case 'unready':hooks.send('trade.ready',{tradeId:view.id,version:view.version,ready:false});break;
      case 'confirm':hooks.send('trade.confirm',{tradeId:view.id,version:view.version});break;
      case 'cancel':hooks.send('trade.cancel',{tradeId:view.id});break;
    }
  }
  function typeCoins(event:Event):void {
    const field=event.target as HTMLInputElement;
    if(field.name!=='trade-coins'||!view)return;
    clearTimeout(coinTimer);
    coinTimer=setTimeout(()=>{
      if(!view)return;
      const value=Math.max(0,Math.min(hooks.balance(),Math.floor(Number(field.value)||0)));
      if(field.value!==String(value)&&field.value!=='')field.value=String(value);
      if(value!==mine().coins)sendOffer({...mine(),coins:value});
    },250);
  }
  document.addEventListener('click',clickWindow);
  // The lines of an offer are buttons to the keyboard too.
  document.addEventListener('keydown',event=>{
    const row=(event.target as HTMLElement).closest?.<HTMLElement>('[data-trade-remove]');
    if(row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();row.click();}
  });
  document.addEventListener('input',typeCoins);
  function stopTick():void {clearInterval(tick);tick=undefined;}
  return {
    /** Nothing can be closed while the API is at it; everything else is a cancel. */
    mayClose:()=>view?.stage!=='committing',
    leave():void {if(view&&view.stage!=='committing')hooks.send('trade.cancel',{tradeId:view.id});view=undefined;stopTick();},
    get inviteOpen(){return !!invite;},
    invited(next:TradeInvite):void {
      invite=next;inviteNode.hidden=false;
      inviteNode.innerHTML=`<i class="trade-invite-icon">${uiIcon('handshake')}</i><div><small>Negociação</small><b>${e(next.fromName)} quer negociar com você</b><span data-trade-left></span></div><div class="trade-invite-actions"><button type="button" class="button primary" data-trade-invite="yes">Aceitar</button><button type="button" class="button" data-trade-invite="no">Recusar</button></div>`;
      const left=()=>{const seconds=Math.ceil((next.expiresAt-hooks.now())/1000);const node=inviteNode.querySelector('[data-trade-left]');if(node)node.textContent=`${Math.max(0,seconds)} s para responder`;if(seconds<=0)dropInvite();};
      clearInterval(inviteTimer);inviteTimer=setInterval(left,500);left();
    },
    uninvited(id:string):void {if(invite?.id===id)dropInvite();},
    state(next:TradeView):void {
      const theirs=JSON.stringify(next.them.offer);
      if(view&&view.id===next.id&&theirs!==theirsShown){changedAt=performance.now();setTimeout(render,4100);}
      theirsShown=theirs;view=next;
      if(!hooks.isOpen())hooks.open();
      if(!tick)tick=setInterval(()=>{
        const count=hooks.content().querySelector('[data-trade-count]');
        if(view?.stage==='review'&&count&&!view.me.confirmed){
          const wait=Math.ceil((view.confirmableAt-hooks.now())/1000);
          if(wait<=0&&count.closest('button')?.hasAttribute('disabled'))render();
          else if(wait>0)count.textContent=`Confirmar em ${wait} s`;
        }
      },200);
      render();
    },
    /** The backpack or the wallet changed under the window. */
    refresh():void {if(view?.stage==='offer')render();},
    closed(message:TradeClosed):void {
      const was=view;view=undefined;stopTick();clearTimeout(coinTimer);
      if(was&&was.id===message.id&&hooks.isOpen())hooks.close();
      if(message.status==='done'){
        const said=(side?:TradeSideView)=>{if(!side||offerIsEmpty(side.offer))return 'nada';return [side.offer.coins?`${money(side.offer.coins)} moedas`:'',...side.offer.items.map(({itemId,quantity})=>`${quantity}× ${itemById(itemId)?.name??itemId}`),...side.vehicles.map(vehicle=>`a chave ${vehicle.plate}`)].filter(Boolean).join(', ');};
        hooks.notify('Troca feita',`Você entregou ${said(message.gave)} e recebeu ${said(message.got)}.`);
      }else hooks.notify(message.status==='failed'?'A troca não aconteceu':'Negociação encerrada',message.message,true);
    },
    reset():void {view=undefined;stopTick();dropInvite();},
  };
}
export type TradeUi=ReturnType<typeof createTrade>;
