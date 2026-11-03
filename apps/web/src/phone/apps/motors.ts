import {MOTO_MODEL,MOTO_PARTS,motoPartStatus,nearestGarage,readMotoParts,type OwnedVehicle,type VehicleView} from '@bar/shared';
import {api,escape as e} from '../../api';
import {plateHtml} from '../../garage-panel';
import {uiIcon} from '../../ui-icons';
import {header,type PhoneApp} from '../core';

const SPECS:ReadonlyArray<readonly [string,string,string]>=[['gauge','Velocidade','55 km/h'],['package','Baú','Pedidos do Highfood'],['wrench','Peças','Conserto com Peça de moto'],['users','Lugares','1, com tranca e chave']];
type Tab='garage'|'shop';
type Filter='all'|'stored'|'out'|'attention';
const FILTERS:ReadonlyArray<readonly [Filter,string]>=[['all','Todos'],['stored','Na garagem'],['out','Na rua'],['attention','Atenção']];
const money=(value:number)=>value.toLocaleString('pt-BR');
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g,'');
// Artwork belongs to the model; future models without a photo get a neutral placeholder.
const photo=(model:string)=>model===MOTO_MODEL?'<img src="/moto/foto.webp" alt="" draggable="false" loading="lazy">':uiIcon('key');

/** Ownership and shopping have separate lists. Maintenance and actions live in each vehicle's detail view. */
export const highmotors:PhoneApp={id:'highmotors',name:'HighMotors',icon:'bike',tint:'linear-gradient(160deg,#39414f,#0e1116)',open(view,ctx){
  let vehicle:VehicleView|undefined,screen:'list'|'detail'|'offer'|'confirm'|'bought'='list',tab:Tab='garage',filter:Filter='all',query='',selected='',busy=false,failed='',closed=false;
  let towTimer:ReturnType<typeof setTimeout>|undefined;
  const scroll:Record<Tab,number>={garage:0,shop:0};
  const wallet=()=>ctx.host.wallet()??0;
  const parked=()=>{const me=ctx.host.user()?.id;return me?Object.values(ctx.host.world()?.motos??{}).find(moto=>moto.ownerId===me):undefined;};
  function condition(item:OwnedVehicle){
    const out=parked(),moto=out?.vehicleId===item.id?out:undefined,parts=readMotoParts(moto?.parts??item.parts);
    const values=MOTO_PARTS.map(part=>({part,value:parts[part.id]})),worn=values.filter(entry=>entry.value<70);
    return {moto,values,worn,average:Math.round(values.reduce((sum,entry)=>sum+entry.value,0)/values.length),location:moto?(moto.riderId?'Em uso':'Na rua'):'Na garagem'};
  }
  function toGarage():void {
    const self=ctx.host.world()?.players?.[ctx.host.user()?.id??''],garage=nearestGarage(self??{x:0,z:0});
    ctx.host.gps.setWaypoint({x:garage.x,y:garage.y,z:garage.z,source:'waypoint',label:garage.name});ctx.open('mapas');
  }
  async function load():Promise<void> {
    failed='';render();
    try{const result=await api<VehicleView>('/vehicles');if(closed)return;vehicle=result;}
    catch(error){if(closed)return;failed=error instanceof Error?error.message:'Não foi possível carregar seus veículos.';}
    render();
  }
  function rememberScroll():void {if(screen==='list')scroll[tab]=view.querySelector('.hm-body')?.scrollTop??0;}
  function showList(next:Tab=tab):void {rememberScroll();tab=next;screen='list';render();}
  const buyBlocked=()=>!vehicle||busy||vehicle.price>wallet()||vehicle.vehicles.length>=vehicle.limit;
  function buyLabel():string {
    if(!vehicle)return 'Comprar';
    if(vehicle.vehicles.length>=vehicle.limit)return `Limite de ${vehicle.limit} veículos atingido`;
    if(vehicle.price>wallet())return `Faltam ${money(vehicle.price-wallet())} moedas`;
    return 'Comprar veículo';
  }
  function topHtml():string {
    return `<header class="hm-top"><span class="hm-brand"><b>High</b>Motors</span><span class="hm-wallet" aria-label="Saldo: ${money(wallet())} moedas">${uiIcon('wallet')}<span><small>Seu saldo</small><b>${money(wallet())}</b></span></span></header>
      <div class="hm-tabs" role="tablist" aria-label="HighMotors"><button type="button" id="hm-tab-garage" role="tab" aria-selected="${tab==='garage'}" aria-controls="hm-panel" tabindex="${tab==='garage'?0:-1}" data-hm="tab" data-tab="garage">${uiIcon('key')}Meus veículos${vehicle?`<span>${vehicle.vehicles.length}</span>`:''}</button><button type="button" id="hm-tab-shop" role="tab" aria-selected="${tab==='shop'}" aria-controls="hm-panel" tabindex="${tab==='shop'?0:-1}" data-hm="tab" data-tab="shop">${uiIcon('store')}Loja</button></div>`;
  }
  function emptyHtml(icon:string,title:string,text:string,action:string,label:string):string {
    return `<div class="hm-empty">${uiIcon(icon)}<h3>${title}</h3><p>${text}</p><button type="button" class="ph-pill-btn" data-hm="${action}">${label}</button></div>`;
  }
  function garageCard(item:OwnedVehicle):string {
    const state=condition(item);
    return `<article class="hm-owned" data-plate="${e(item.plate)}"><button type="button" class="hm-owned-open" data-hm="detail" data-vehicle="${e(item.id)}" aria-label="Ver ${e(item.name)}, placa ${e(item.plate)}">
      <span class="hm-thumb">${photo(item.model)}</span><span class="hm-owned-info"><b>${e(item.name)}</b><span class="hm-owned-meta"><span class="hm-plate">${e(item.plate)}</span><span>${(item.mileage/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km</span></span><span class="hm-location ${state.moto?'out':''}">${uiIcon(state.moto?'mapPin':'warehouse')}${state.location}</span></span>${uiIcon('chevronRight')}</button>
      <div class="hm-owned-foot"><span class="${state.worn.length?'hm-warning':'hm-healthy'}">${uiIcon(state.worn.length?'wrench':'check')}${state.worn.length?`${state.worn.length} ${state.worn.length===1?'peça precisa':'peças precisam'} de atenção`:'Em bom estado'}</span><b>${state.average}%</b></div></article>`;
  }
  function garageResults():string {
    if(!vehicle)return '';
    const found=vehicle.vehicles.filter(item=>{
      const state=condition(item);
      return normalize(`${item.name} ${item.plate}`).includes(normalize(query))&&(filter==='all'||filter==='stored'&&!state.moto||filter==='out'&&!!state.moto||filter==='attention'&&state.worn.length>0);
    });
    return `<p class="hm-result-count" role="status">${found.length} ${found.length===1?'veículo':'veículos'}${query||filter!=='all'?' encontrados':''}</p>${found.length?found.map(garageCard).join(''):emptyHtml('search','Nenhum veículo encontrado','Tente outro nome, placa ou filtro.','clear','Limpar busca e filtros')}`;
  }
  function garageHtml():string {
    if(!vehicle)return '';
    if(!vehicle.vehicles.length)return `<div class="hm-page-title"><small>SUA GARAGEM</small><h2>Meus veículos</h2><p>Todos os seus veículos, em um só lugar.</p></div>${emptyHtml('warehouse','Sua garagem começa aqui','Você ainda não tem veículos. Encontre seu primeiro na loja.','shop','Explorar a loja')}`;
    return `<div class="hm-page-title"><small>SUA GARAGEM</small><h2>Meus veículos</h2><p>Localize, confira o estado e cuide do que é seu.</p></div>
      <label class="hm-search">${uiIcon('search')}<input type="search" name="hm-query" placeholder="Buscar por nome ou placa" aria-label="Buscar meus veículos por nome ou placa" value="${e(query)}" autocomplete="off"></label>
      <div class="hm-filters" role="group" aria-label="Filtrar meus veículos">${FILTERS.map(([id,label])=>`<button type="button" data-hm="filter" data-filter="${id}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div><div class="hm-results">${garageResults()}</div>`;
  }
  function shopHtml(item:VehicleView):string {
    const owned=item.vehicles.filter(each=>each.model===item.model).length;
    return `<div class="hm-page-title"><small>ENCONTRE SEU PRÓXIMO</small><h2>Loja de veículos</h2><p>Escolha seu próximo veículo para rodar pela cidade.</p></div><article class="hm-sale"><div class="hm-sale-photo">${photo(item.model)}<span class="hm-sale-badge">À venda · 0 km</span></div><div class="hm-sale-info"><small>${item.model===MOTO_MODEL?'Scooter · Entregas Highfood':'Veículo novo'}</small><h3>${e(item.name)}</h3>${owned?`<p class="hm-already">${uiIcon('key')}Você já tem ${owned} deste modelo</p>`:''}<p class="hm-price">${money(item.price)} <small>moedas</small></p><button type="button" class="ph-pill-btn wide" data-hm="offer">Ver detalhes</button></div></article><p class="hm-shop-note">${uiIcon('key')}Comprou? Ele aparece em <b>Meus veículos</b>.</p>`;
  }
  function detailHtml(item:OwnedVehicle):string {
    const state=condition(item),anotherOut=!!parked()&&!state.moto,tow=vehicle!.tow;
    const towReason=anotherOut?'Guarde o outro veículo antes de chamar o guincho.':tow>wallet()?`Faltam ${money(tow-wallet())} moedas para o guincho.`:'';
    return `${header('Meu veículo')}<div class="ph-body hm-detail"><div class="hm-detail-photo">${photo(item.model)}<span class="hm-detail-badge">${uiIcon('key')}Seu veículo</span></div><div class="hm-detail-info"><div class="hm-detail-title"><small>${state.location}</small><h2>${e(item.name)}</h2>${plateHtml(item.plate)}</div>
      <div class="hm-numbers"><div><b>${state.average}%</b><small>Estado geral</small></div><div><b>${(item.mileage/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km</b><small>Rodados</small></div></div>
      <div class="hm-action-card"><h3>${uiIcon('mapPin')}Onde está</h3><p>${state.moto?'Seu veículo está na rua. Veja a localização no mapa.':'Guardado na garagem. Vá até lá para retirar.'}</p><button type="button" class="ph-pill-btn wide" data-hm="${state.moto?'locate':'to-garage'}" data-vehicle="${e(item.id)}">${uiIcon(state.moto?'mapPin':'warehouse')}${state.moto?'Marcar no mapa':'Ir à garagem'}</button></div>
      <section class="hm-maintenance"><div class="hm-section-title"><h3>Estado das peças</h3><span class="${state.worn.length?'hm-warning':'hm-healthy'}">${state.worn.length?`${state.worn.length} com desgaste`:'Tudo em dia'}</span></div><ul class="hm-parts">${state.values.map(({part,value})=>`<li><span>${e(part.name)}</span><span class="hm-part-value status-${motoPartStatus(value)}"><span class="hm-part-meter" aria-hidden="true"><i style="width:${value}%"></i></span>${Math.round(value)}%</span></li>`).join('')}</ul><p class="hm-note">Use Peças de moto da loja da casa. Clique com o botão direito no veículo e abra Informações do veículo.</p></section>
      <div class="hm-action-card"><h3>${uiIcon('truck')}Precisa de um guincho?</h3><p>Traz o veículo até a rua mais perto de você.</p><button type="button" class="ph-pill-btn wide soft" data-hm="tow" data-vehicle="${e(item.id)}" ${busy||towReason?'disabled':''}>${busy?'Chamando guincho…':`Chamar guincho · ${money(tow)} moedas`}</button>${towReason?`<p class="hm-note">${towReason}</p>`:''}</div></div></div>`;
  }
  function offerHtml(item:VehicleView):string {
    return `${header('Detalhes do veículo')}<div class="ph-body hm-detail"><div class="hm-detail-photo">${photo(item.model)}<span class="hm-sale-badge">À venda · 0 km</span></div><div class="hm-detail-info"><div class="hm-detail-title"><small>${item.model===MOTO_MODEL?'Scooter de entrega':'Veículo novo'}</small><h2>${e(item.name)}</h2><p class="hm-price">${money(item.price)} <small>moedas</small></p></div>${item.model===MOTO_MODEL?`<ul class="hm-specs">${SPECS.map(([icon,label,value])=>`<li>${uiIcon(icon)}<span><small>${label}</small>${value}</span></li>`).join('')}</ul><p class="hm-note">Com a moto você pode entregar pelo Highfood. Ela vem emplacada, fica guardada na garagem e a chave vai para a sua mochila.</p>`:''}<button type="button" class="ph-pill-btn wide" data-hm="buy" ${buyBlocked()?'disabled':''}>${buyLabel()}</button></div></div>`;
  }
  function render():void {
    if(closed)return;
    if(screen==='confirm'&&vehicle){
      view.innerHTML=`${header('Confirmar compra')}<div class="ph-body hm-confirm"><div class="hm-confirm-photo">${photo(vehicle.model)}</div><small>SEU PRÓXIMO VEÍCULO</small><h3>${e(vehicle.name)}</h3><p class="hm-big">${money(vehicle.price)} <small>moedas</small></p><div class="ph-card"><div class="ph-row"><span class="fl">Saldo agora</span><b>${money(wallet())}</b></div><div class="ph-row"><span class="fl">Saldo depois</span><b>${money(wallet()-vehicle.price)}</b></div></div><p class="ph-hint">A compra não pode ser desfeita. O veículo vem emplacado, fica na garagem e a chave vai para a sua mochila.</p><button type="button" class="ph-pill-btn wide" data-hm="confirm" ${buyBlocked()?'disabled':''}>${busy?'Comprando…':'Confirmar compra'}</button></div>`;return;
    }
    if(screen==='bought'){
      view.innerHTML=`<div class="ph-body hm-confirm done"><i class="hm-success">${uiIcon('check')}</i><small>COMPRA CONCLUÍDA</small><h2>O veículo é seu!</h2><p>Ele já está na garagem e a chave está na sua mochila (I).</p><button type="button" class="ph-pill-btn wide" data-hm="garage">Ver meus veículos</button><button type="button" class="ph-pill-btn wide soft" data-hm="to-garage">${uiIcon('mapPin')}Traçar rota até a garagem</button>${vehicle?.model===MOTO_MODEL?'<button type="button" class="hm-text-button" data-hm="highfood">Abrir o Highfood</button>':''}</div>`;return;
    }
    const item=vehicle?.vehicles.find(each=>each.id===selected);
    if(screen==='detail'&&item){view.innerHTML=detailHtml(item);return;}
    if(screen==='offer'&&vehicle){view.innerHTML=offerHtml(vehicle);return;}
    screen='list';
    view.innerHTML=`${topHtml()}<div class="ph-body hm-body" id="hm-panel" role="tabpanel" aria-labelledby="hm-tab-${tab}">${failed?emptyHtml('refresh','Não foi possível carregar',e(failed),'retry','Tentar novamente'):!vehicle?'<p class="ph-empty" role="status">Carregando veículos…</p>':tab==='garage'?garageHtml():shopHtml(vehicle)}</div>`;
    const body=view.querySelector('.hm-body');if(body)body.scrollTop=scroll[tab];
  }
  async function buy():Promise<void> {
    if(buyBlocked())return;
    busy=true;render();
    try{
      const result=await api<VehicleView&{balance:number}>('/vehicles/buy',{requestId:crypto.randomUUID()});
      ctx.host.balance(result.balance);ctx.host.food.setOwned(true);
      if(closed)return;
      vehicle=result;screen='bought';scroll.garage=0;query='';filter='all';
    }catch(error){if(!closed){ctx.host.error(error instanceof Error?error.message:'Não foi possível comprar.');screen='offer';}}
    finally{busy=false;render();}
  }
  function onClick(event:Event):void {
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-hm],[data-ph]');if(!button||button.disabled)return;
    if(button.dataset.ph==='back'){if(busy)return;screen=screen==='confirm'?'offer':'list';render();return;}
    switch(button.dataset.hm){
      case 'tab':showList(button.dataset.tab as Tab);break;
      case 'shop':showList('shop');break;
      case 'filter':filter=button.dataset.filter as Filter;scroll.garage=0;render();view.querySelector<HTMLButtonElement>(`[data-filter="${filter}"]`)?.focus();break;
      case 'clear':query='';filter='all';scroll.garage=0;render();view.querySelector<HTMLInputElement>('[name="hm-query"]')?.focus();break;
      case 'detail':rememberScroll();selected=button.dataset.vehicle!;screen='detail';render();break;
      case 'offer':rememberScroll();screen='offer';render();break;
      case 'buy':if(!buyBlocked()){screen='confirm';render();}break;
      case 'confirm':void buy();break;
      case 'garage':showList('garage');break;
      case 'retry':void load();break;
      case 'highfood':ctx.open('highfood');break;
      case 'locate':{const moto=parked();if(moto&&moto.vehicleId===button.dataset.vehicle){ctx.host.gps.setWaypoint({x:moto.x,y:moto.y,z:moto.z,source:'bike',label:vehicle?.vehicles.find(each=>each.id===moto.vehicleId)?.name??'Seu veículo'});ctx.open('mapas');}break;}
      case 'to-garage':toGarage();break;
      case 'tow':{
        if(busy||!vehicle||wallet()<vehicle.tow)return;
        const out=parked();if(out&&out.vehicleId!==button.dataset.vehicle)return;
        ctx.host.send('moto.tow',{vehicleId:button.dataset.vehicle});busy=true;render();towTimer=setTimeout(()=>{busy=false;void load();},1200);break;
      }
    }
  }
  function onInput(event:Event):void {
    const input=event.target as HTMLInputElement;if(input.name!=='hm-query')return;
    query=input.value;scroll.garage=0;const results=view.querySelector('.hm-results');if(results)results.innerHTML=garageResults();
  }
  function onKeydown(event:KeyboardEvent):void {
    if(!(event.target as HTMLElement).closest('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();showList(event.key==='Home'?'garage':event.key==='End'?'shop':tab==='garage'?'shop':'garage');view.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  }
  view.addEventListener('click',onClick);view.addEventListener('input',onInput);view.addEventListener('keydown',onKeydown);
  void load();
  return ()=>{closed=true;clearTimeout(towTimer);view.removeEventListener('click',onClick);view.removeEventListener('input',onInput);view.removeEventListener('keydown',onKeydown);};
}};
