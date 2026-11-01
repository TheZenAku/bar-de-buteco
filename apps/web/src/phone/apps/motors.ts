import {MOTO_PARTS,MOTO_STATUS_LABELS,motoPartStatus,nearestGarage,readMotoParts,type OwnedVehicle,type VehicleView} from '@bar/shared';
import {api,escape as e} from '../../api';
import {plateHtml} from '../../garage-panel';
import {uiIcon} from '../../ui-icons';
import {header,type PhoneApp} from '../core';

const SPECS:ReadonlyArray<readonly [string,string,string]>=[['gauge','Velocidade','55 km/h'],['package','Baú','Pedidos do Highfood'],['wrench','Peças','Conserto com Peça de moto'],['users','Lugares','1, com tranca e chave']];

/** HighMotors: vehicles for sale, and the ones whose key this player holds. The room places them; the API keeps who holds what. */
export const highmotors:PhoneApp={id:'highmotors',name:'HighMotors',icon:'bike',tint:'linear-gradient(160deg,#39414f,#0e1116)',open(view,ctx){
  let vehicle:VehicleView|undefined,screen:'list'|'confirm'|'bought'='list',busy=false,failed='';
  const wallet=()=>ctx.host.wallet()??0;
  const parked=()=>{const me=ctx.host.user()?.id;return Object.values(ctx.host.world()?.motos??{}).find(moto=>moto.ownerId===me);};
  function toGarage():void {
    const self=ctx.host.world()?.players?.[ctx.host.user()?.id??''],garage=nearestGarage(self??{x:0,z:0});
    ctx.host.gps.setWaypoint({x:garage.x,y:garage.y,z:garage.z,source:'waypoint',label:garage.name});ctx.open('mapas');
  }
  async function load():Promise<void> {
    try{vehicle=await api<VehicleView>('/vehicles');failed='';}catch(error){failed=error instanceof Error?error.message:'Não foi possível carregar.';}
    render();
  }
  function listingHtml(item:VehicleView):string {
    const short=item.price-wallet();
    return `<article class="hm-card"><img class="hm-photo" src="/moto/foto.webp" alt="Moto de entrega Highland Bar Delivery" draggable="false"><div class="hm-info"><small>Scooter de entrega · 0 km</small><h3>${e(item.name)}</h3><b class="hm-price">${item.price.toLocaleString('pt-BR')} <small>moedas</small></b>
      <ul class="hm-specs">${SPECS.map(([icon,label,value])=>`<li>${uiIcon(icon)}<span><small>${label}</small>${value}</span></li>`).join('')}</ul>
      <p class="hm-note">Com a moto você pode entregar pelo Highfood. Ela vem emplacada, fica guardada na garagem e a chave vai para a sua mochila.</p>
      <button type="button" class="ph-pill-btn wide" data-hm="buy" ${short>0||item.vehicles.length>=item.limit?'disabled':''}>${item.vehicles.length>=item.limit?`Máximo de ${item.limit} veículos`:short>0?`Faltam ${short.toLocaleString('pt-BR')} moedas`:item.owned?'Comprar outra':'Comprar'}</button></div></article>`;
  }
  function garageHtml(item:OwnedVehicle,tow:number):string {
    const out=parked(),moto=out?.vehicleId===item.id?out:undefined;
    const parts=readMotoParts(moto?.parts??item.parts),worst=[...MOTO_PARTS].map(part=>({part,value:parts[part.id]})).sort((a,b)=>a.value-b.value);
    const worn=worst.filter(entry=>entry.value<70),average=Math.round(worst.reduce((sum,entry)=>sum+entry.value,0)/worst.length);
    return `<article class="hm-card" data-plate="${e(item.plate)}"><img class="hm-photo" src="/moto/foto.webp" alt="Sua moto" draggable="false"><div class="hm-info"><small>Sua moto</small><h3>${e(item.name)}</h3><p>${plateHtml(item.plate)}</p>
      <div class="hm-numbers"><div><b>${average}%</b><small>Estado geral</small></div><div><b>${(item.mileage/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km</b><small>Rodados</small></div><div><b>${moto?(moto.riderId?'Em uso':'Na rua'):'Na garagem'}</b><small>Onde está</small></div></div>
      ${worn.length?`<h4>Precisa de atenção</h4><ul class="hm-parts">${worn.slice(0,4).map(({part,value})=>`<li><span>${e(part.name)}</span><i class="status-${motoPartStatus(value)}">${value}%</i></li>`).join('')}</ul>`:`<p class="hm-note">${MOTO_STATUS_LABELS.good}: nada para consertar.</p>`}
      <p class="hm-note">Conserte com Peças de moto da loja da casa: botão direito na moto, Informações do veículo.</p>
      <div class="hm-buttons">${moto?`<button type="button" class="ph-pill-btn soft" data-hm="locate">${uiIcon('mapPin')}Marcar no mapa</button>`:`<button type="button" class="ph-pill-btn soft" data-hm="to-garage">${uiIcon('warehouse')}Ir à garagem</button>`}<button type="button" class="ph-pill-btn soft" data-hm="tow" data-vehicle="${e(item.id)}" ${busy||(out&&!moto)?'disabled':''}>${uiIcon('truck')}Guincho · ${tow}</button></div></div></article>`;
  }
  function render():void {
    if(failed){view.innerHTML=`<header class="hm-top"><b>High</b>Motors</header><p class="ph-empty">${e(failed)}</p>`;return;}
    if(!vehicle){view.innerHTML='<header class="hm-top"><b>High</b>Motors</header><p class="ph-empty small">Carregando…</p>';return;}
    if(screen==='confirm'){
      view.innerHTML=`${header('Confirmar compra','Voltar')}<div class="ph-body hm-confirm"><img class="hm-photo" src="/moto/foto.webp" alt="" draggable="false"><h3>${e(vehicle.name)}</h3><p class="hm-big">${vehicle.price.toLocaleString('pt-BR')} <small>moedas</small></p>
        <div class="ph-card"><div class="ph-row"><span class="fl">Saldo agora</span><b>${wallet().toLocaleString('pt-BR')}</b></div><div class="ph-row"><span class="fl">Saldo depois</span><b>${(wallet()-vehicle.price).toLocaleString('pt-BR')}</b></div></div>
        <p class="ph-hint">A compra não pode ser desfeita. A moto vem emplacada, fica na garagem, na rua ao lado do bar, e a chave vai para a sua mochila.</p><button type="button" class="ph-pill-btn wide" data-hm="confirm" ${busy?'disabled':''}>${busy?'Comprando…':'Confirmar compra'}</button></div>`;
      return;
    }
    if(screen==='bought'){
      view.innerHTML=`<div class="ph-body hm-confirm done"><i class="bank-ok">${uiIcon('check')}</i><h2>A moto é sua!</h2><p>Ela está na garagem e a chave já está na sua mochila (I). Nunca cai, nem quando você desmaia.</p><button type="button" class="ph-pill-btn wide" data-hm="to-garage">${uiIcon('mapPin')}Traçar rota até a garagem</button><button type="button" class="ph-pill-btn wide soft" data-hm="highfood">Abrir o Highfood</button><button type="button" class="ph-pill-btn wide soft" data-hm="garage">Ver minhas motos</button></div>`;
      return;
    }
    view.innerHTML=`<header class="hm-top"><b>High</b>Motors<small>${vehicle.owned?`${vehicle.vehicles.length} ${vehicle.vehicles.length===1?'veículo':'veículos'}`:'Veículos à venda'}</small></header><div class="ph-body hm-body">${vehicle.vehicles.map(each=>garageHtml(each,vehicle!.tow)).join('')}${listingHtml(vehicle)}</div>`;
  }
  async function buy():Promise<void> {
    if(busy||!vehicle)return;
    busy=true;render();
    try{
      const result=await api<VehicleView&{balance:number}>('/vehicles/buy',{requestId:crypto.randomUUID()});
      vehicle=result;ctx.host.balance(result.balance);screen='bought';
    }catch(error){ctx.host.error(error instanceof Error?error.message:'Não foi possível comprar.');screen='list';}
    finally{busy=false;render();}
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-hm],[data-ph]');if(!button)return;
    if(button.dataset.ph==='back'){screen='list';render();return;}
    switch(button.dataset.hm){
      case 'buy':screen='confirm';render();break;
      case 'confirm':void buy();break;
      case 'garage':screen='list';void load();break;
      case 'highfood':ctx.open('highfood');break;
      case 'locate':{const moto=parked();if(moto){ctx.host.gps.setWaypoint({x:moto.x,y:moto.y,z:moto.z,source:'bike',label:'Sua moto'});ctx.open('mapas');}break;}
      case 'to-garage':toGarage();break;
      case 'tow':ctx.host.send('moto.tow',{vehicleId:button.dataset.vehicle});busy=true;render();setTimeout(()=>{busy=false;void load();},1200);break;
    }
  });
  render();void load();
}};
