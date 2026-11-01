import {HIGHFOOD,courierLevel,nearestGarage,type HighfoodHistoryEntry,type HighfoodOrderView,type HighfoodState,type HighfoodView,type VehicleView} from '@bar/shared';
import {api,escape as e} from '../../api';
import {customerPicture} from '../../highfood/npc-avatar';
import {price} from '../../prices';
import {uiIcon} from '../../ui-icons';
import {avatar,timeAgo,type PhoneApp} from '../core';

type Tab='home'|'orders'|'earnings'|'profile';
const TABS:ReadonlyArray<readonly [Tab,string,string]>=[['home','Início','home'],['orders','Pedidos','receipt'],['earnings','Ganhos','coins'],['profile','Perfil','user']];
const coins=(value:number)=>value.toLocaleString('pt-BR');
const metres=(value:number)=>value>=1000?`${(value/1000).toFixed(1).replace('.',',')} km`:`${Math.round(value)} m`;
const stars=(value:number)=>`<span class="hf-stars" role="img" aria-label="${value.toLocaleString('pt-BR',{maximumFractionDigits:1})} de 5 estrelas" style="--value:${value/5*100}%">★★★★★</span>`;
const clock=(ms:number)=>{const seconds=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const STATUS:Record<HighfoodHistoryEntry['status'],string>={delivered:'Entregue',cancelled:'Cancelado por você','gave-up':'Cliente desistiu',left:'Saiu com o pedido'};
const STEPS=[['going','A caminho'],['unload','No baú'],['carrying','Em mãos']] as const;
const LOGO=`${import.meta.env.BASE_URL}highfood/logo.webp`;

/**
 * Highfood: the courier's side of the app. Orders appear here and only here, so a new one has to be looked at (the phone
 * vibrates in the pocket); the room decides when one comes up, the API keeps the history and the money. Going online is from here or from the base.
 */
export const highfood:PhoneApp={id:'highfood',name:'Highfood',icon:'food',image:'highfood/logo-icon.webp',tint:'#120406',open(view,ctx){
  let tab:Tab='home',data:HighfoodView|undefined,failed=false;
  const food=()=>ctx.host.food.state(),serverNow=()=>ctx.host.serverNow();
  const me=()=>ctx.host.user()?.id;
  /** Their bike is out on the street, or else it is in the garage. */
  const bikeOut=()=>Object.values(ctx.host.world()?.motos??{}).some(moto=>moto.ownerId===me());
  function toGarage():void {
    const self=ctx.host.world()?.players?.[me()??''],garage=nearestGarage(self??{x:HIGHFOOD.BASE.x,z:HIGHFOOD.BASE.z});
    ctx.host.gps.setWaypoint({x:garage.x,y:garage.y,z:garage.z,source:'waypoint',label:garage.name});ctx.open('mapas');
  }
  const garageCard=()=>`<section class="hf-card"><header><small>Sua moto está guardada</small></header><p class="hf-note">Os pedidos só chegam com a moto na rua. Vá até uma garagem e retire ela.</p><div class="hf-actions"><button type="button" class="ph-pill-btn wide hf-go" data-hf="to-garage">${uiIcon('mapPin')}Traçar rota até a garagem</button></div></section>`;
  async function load():Promise<void> {
    try{
      const [view,vehicle]=await Promise.all([api<HighfoodView>('/highfood'),api<VehicleView>('/vehicles')]);
      data=view;failed=false;ctx.host.food.setOwned(vehicle.owned);
    }catch{failed=true;}
    render();
  }
  const orderHead=(order:HighfoodOrderView)=>`<div class="hf-who">${customerPicture(order.customer,'npc-picture hf-face')}<div><b>${e(order.customer.name)}</b><small>${e(order.place)} · ${e(order.neighbourhood)}</small></div></div>
    <div class="hf-line">${uiIcon('store')}<span><b>${e(order.restaurant)}</b><small>${e(order.items.join(' · '))}</small></span></div>
    <div class="hf-line">${uiIcon('mapPin')}<span><b>${e(order.address)}</b><small>${metres(order.length)} pelas ruas</small></span></div>`;
  function homeHtml(state:HighfoodState):string {
    if(state.status==='off'){
      const owned=ctx.host.food.owned();
      return `<div class="hf-off"><i class="hf-radar off">${uiIcon('bike')}</i><h3>Você está offline</h3>
        <p>${owned?(bikeOut()?'Fique online daqui mesmo. O celular vibra quando aparecer um pedido.':'Fique online daqui mesmo. Para os pedidos chegarem, sua moto precisa estar na rua: ela está na garagem.'):'Para entregar você precisa de uma moto. Ela está à venda no HighMotors.'}</p>
        ${owned?`<button type="button" class="ph-pill-btn wide hf-go" data-hf="online">${uiIcon('bike')}Ficar online</button>${bikeOut()?'':`<button type="button" class="ph-pill-btn wide soft" data-hf="to-garage">${uiIcon('mapPin')}Traçar rota até a garagem</button>`}`:'<button type="button" class="ph-pill-btn wide hf-go" data-hf="motors">Abrir o HighMotors</button>'}</div>`;
    }
    if(state.status==='offer'&&state.offer){
      const offer=state.offer;
      return `<section class="hf-card hf-offer" aria-live="assertive"><header><small>Novo pedido</small><b class="hf-pay">${coins(offer.pay)} <small>moedas</small></b><i class="hf-count" data-hf-count>${clock(offer.expiresAt-serverNow())}</i></header>
        ${orderHead(offer)}<p class="hf-note">Já com ${Math.round(offer.pay-offer.pay/(1+price('highfood:on-time-pct')/100))} moedas de bônus, se chegar no prazo.</p>
        <div class="hf-actions"><button type="button" class="ph-pill-btn soft" data-hf="decline">Recusar</button><button type="button" class="ph-pill-btn hf-go" data-hf="accept">Aceitar</button></div></section>`;
    }
    if(state.status==='order'&&state.order){
      const order=state.order,left=order.promiseAt-serverNow(),index=STEPS.findIndex(([id])=>id===order.stage);
      const hint=order.stage==='going'?'Siga o GPS e desça da moto perto do cliente. O pedido sai do baú na hora.':order.stage==='unload'?'Tirando o pedido do baú…':`Leve até ${order.customer.name} e aperte E.`;
      return `<section class="hf-card"><header><small>Entrega em andamento</small><b class="hf-pay">${coins(order.pay)} <small>moedas</small></b></header>
        <ol class="hf-steps">${STEPS.map(([,label],i)=>`<li class="${i<index?'done':i===index?'now':''}"><i></i>${label}</li>`).join('')}</ol>${orderHead(order)}
        <p class="hf-note ${left<0?'late':''}" data-hf-promise>${left>=0?`Prazo: ${clock(left)}`:'Atrasado: sem bônus e com menos estrelas'}</p>${order.crashes?`<p class="hf-note late">Pedido amassado em ${order.crashes} ${order.crashes===1?'queda':'quedas'}: vale menos.</p>`:''}
        <p class="ph-hint">${e(hint)}</p>
        <div class="hf-actions"><button type="button" class="ph-pill-btn soft" data-hf="map">${uiIcon('map')}Mapa</button><button type="button" class="ph-pill-btn soft danger-text" data-hf="cancel">Cancelar</button></div></section>`;
    }
    const next=state.nextAt?state.nextAt-serverNow():0;
    if(!bikeOut())return `${garageCard()}<div class="hf-actions center"><button type="button" class="ph-pill-btn soft danger-text" data-hf="offline">Ficar offline</button></div>`;
    return `<div class="hf-off"><i class="hf-radar">${uiIcon('bike')}</i><h3>Procurando pedidos…</h3><p>${next>20_000?'Os pedidos vêm aos poucos. Fique por perto: o celular vibra quando aparecer um.':'Quase lá: fique de olho.'}</p><button type="button" class="ph-pill-btn soft danger-text" data-hf="offline">Ficar offline</button></div>`;
  }
  function todayHtml():string {
    const today=data?.today,state=food();
    return `<div class="hf-today"><div><b>${coins(today?.earned??state.earned)}</b><small>moedas hoje</small></div><div><b>${today?.count??state.done}</b><small>entregas hoje</small></div><div><b>${data?.rating?data.rating.toFixed(1).replace('.',','):'—'}</b><small>sua nota</small></div></div>`;
  }
  function ordersHtml():string {
    if(!data)return `<p class="ph-empty small">${failed?'Não foi possível carregar.':'Carregando…'}</p>`;
    if(!data.recent.length)return '<p class="ph-empty">Nenhuma entrega ainda. Fique online na base do Highfood para receber pedidos.</p>';
    return `<div class="ph-list">${data.recent.map(entry=>{
      const person=data!.customers[entry.customerId];
      return `<div class="ph-row hf-entry">${person?customerPicture({id:entry.customerId,...person},'npc-picture hf-face small'):avatar({name:entry.customer},40)}<span class="fl"><b>${e(entry.customer)}</b><small>${e(entry.restaurant)}</small><small>${e(entry.address)} · ${metres(entry.length)}</small></span>
        <span class="hf-entry-end">${entry.status==='delivered'?`<b class="in">+${coins(entry.paid)}</b>${entry.stars?stars(entry.stars):''}`:`<small class="late">${STATUS[entry.status]}</small>`}<time>${timeAgo(entry.at)}</time></span></div>`;
    }).join('')}</div>`;
  }
  function earningsHtml():string {
    if(!data)return `<p class="ph-empty small">${failed?'Não foi possível carregar.':'Carregando…'}</p>`;
    const {today,week}=data,share=today.cap?Math.min(1,today.earned/today.cap):0,days=Array.from({length:7},(_,i)=>{const date=new Date(Date.now()-(6-i)*86_400_000),key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,found=week.find(day=>day.day===key);return {label:date.toLocaleDateString('pt-BR',{weekday:'short'}).slice(0,3),earned:found?.earned??0,count:found?.count??0};}),most=Math.max(1,...days.map(day=>day.earned));
    return `<section class="hf-card"><header><small>Hoje</small><b class="hf-pay">${coins(today.earned)} <small>de ${coins(today.cap)}</small></b></header>
        <div class="hf-meter" role="meter" aria-valuemin="0" aria-valuemax="${today.cap}" aria-valuenow="${today.earned}" aria-label="Moedas de hoje"><i style="width:${share*100}%"></i></div>
        <p class="hf-note">${share>=1?'Você chegou ao teto de hoje: as próximas entregas não pagam até amanhã.':today.fullLeft>0?`Mais ${today.fullLeft} ${today.fullLeft===1?'entrega':'entregas'} a preço cheio hoje. Depois elas pagam ${Math.round(today.lateShare*100)}%.`:`As entregas de agora pagam ${Math.round(today.lateShare*100)}% do normal, até o teto.`}</p></section>
      <h3 class="ph-section">Últimos 7 dias</h3><div class="ph-card hf-chart" role="img" aria-label="Moedas por dia">${days.map(day=>`<div title="${day.count} entregas"><b>${day.earned?coins(day.earned):''}</b><i style="height:${Math.max(day.earned?6:1,day.earned/most*100)}%"></i><small>${e(day.label)}</small></div>`).join('')}</div>
      <h3 class="ph-section">No total</h3><div class="ph-card"><div class="ph-row"><span class="fl">Moedas ganhas</span><b>${coins(data.earnedTotal)}</b></div><div class="ph-row"><span class="fl">Entregas feitas</span><b>${coins(data.deliveries)}</b></div></div>
      <p class="ph-hint">As moedas caem na carteira assim que o cliente recebe. O extrato completo fica no HighBank.</p>`;
  }
  function profileHtml():string {
    const user=ctx.host.user(),level=courierLevel(data?.deliveries??0),span=level.next?level.next-level.from:1,done=level.next?(data?.deliveries??0)-level.from:1;
    return `<div class="hf-profile">${avatar({name:user?.displayName??'?',color:user?.color,id:user?.id,...(ctx.profile()?.photo?{photo:ctx.profile()!.photo!}:{})},84)}<h3>${e(user?.displayName??'')}</h3><p class="hf-level">${e(level.name)}</p>${data?.rating?`<p>${stars(data.rating)} <b>${data.rating.toFixed(1).replace('.',',')}</b> <small>(últimas ${Math.min(50,data.ratings)})</small></p>`:'<p class="ph-hint">Sem avaliações ainda.</p>'}</div>
      ${level.next?`<div class="ph-card hf-progress"><small>Faltam ${level.next-(data?.deliveries??0)} entregas para ${e(level.nextName??'')}</small><div class="hf-meter"><i style="width:${Math.min(100,done/span*100)}%"></i></div></div>`:''}
      <h3 class="ph-section">Seus números</h3><div class="ph-card"><div class="ph-row"><span class="fl">Entregas</span><b>${coins(data?.deliveries??0)}</b></div><div class="ph-row"><span class="fl">No prazo</span><b>${data?.onTimeShare===null||data?.onTimeShare===undefined?'—':`${Math.round(data.onTimeShare*100)}%`}</b></div><div class="ph-row"><span class="fl">Moedas ganhas</span><b>${coins(data?.earnedTotal??0)}</b></div></div>
      <h3 class="ph-section">Sua moto</h3><div class="ph-list"><button type="button" class="ph-row" data-hf="motors">${uiIcon('bike')}<span class="fl"><b>Ver no HighMotors</b><small>Estado das peças, placa e guincho</small></span>${uiIcon('chevronRight')}</button></div>
      <p class="ph-hint">Nota acima de 4,5 traz pedidos um pouco mais rápido; abaixo de 3,5 eles demoram mais. A nota nunca muda o valor de um pedido.</p>
      ${food().status!=='off'?'<div class="hf-actions center"><button type="button" class="ph-pill-btn soft danger-text" data-hf="offline">Ficar offline</button></div>':''}`;
  }
  function render():void {
    const state=food(),scroll=view.querySelector('.ph-body')?.scrollTop??0;
    const online=state.status!=='off';
    view.innerHTML=`<header class="hf-top"><span class="hf-logo"><img class="hf-logo-img" src="${LOGO}" alt="Highfood, Highland Bar Delivery" draggable="false"></span><span class="hf-status ${online?'on':''}"><i></i>${online?'Online':'Offline'}</span></header>
      <div class="ph-body hf-body">${tab==='home'?`${todayHtml()}${homeHtml(state)}`:tab==='orders'?ordersHtml():tab==='earnings'?earningsHtml():profileHtml()}</div>
      <nav class="hf-tabs" aria-label="Highfood">${TABS.map(([id,label,icon])=>`<button type="button" data-hf-tab="${id}" aria-current="${id===tab}">${uiIcon(icon)}<small>${label}</small></button>`).join('')}</nav>`;
    const body=view.querySelector('.ph-body');if(body)body.scrollTop=scroll;
  }
  view.addEventListener('click',event=>{
    const target=event.target as HTMLElement,tabButton=target.closest<HTMLElement>('[data-hf-tab]');
    if(tabButton){tab=tabButton.dataset.hfTab as Tab;render();if(tab!=='home')void load();return;}
    const state=food();
    switch(target.closest<HTMLElement>('[data-hf]')?.dataset.hf){
      case 'accept':if(state.offer){ctx.host.send('food.accept',{orderId:state.offer.id});ctx.sounds.click();}break;
      case 'decline':if(state.offer)ctx.host.send('food.decline',{orderId:state.offer.id});break;
      case 'cancel':ctx.host.send('food.cancel',{});break;
      case 'offline':ctx.host.send('food.stop',{});break;
      case 'online':ctx.host.send('food.start',{});ctx.sounds.click();break;
      case 'to-garage':toGarage();break;
      case 'map':ctx.open('mapas');break;
      case 'motors':ctx.open('highmotors');break;
    }
  });
  const stopFood=ctx.host.food.listen(()=>{ctx.foodSeen();render();if(tab==='home'&&food().status!=='offer')void load();}),stopReceipt=ctx.host.food.receipts(()=>void load());
  // Offers and the promise run by the clock, between the room's messages; only those numbers change.
  const tick=setInterval(()=>{
    const state=food();
    const count=view.querySelector('[data-hf-count]');if(count&&state.offer)count.textContent=clock(state.offer.expiresAt-serverNow());
    const promise=view.querySelector<HTMLElement>('[data-hf-promise]');
    if(promise&&state.order){const left=state.order.promiseAt-serverNow();promise.textContent=left>=0?`Prazo: ${clock(left)}`:'Atrasado: sem bônus e com menos estrelas';promise.classList.toggle('late',left<0);}
  },500);
  ctx.foodSeen();
  render();void load();
  return ()=>{clearInterval(tick);stopFood();stopReceipt();};
}};
