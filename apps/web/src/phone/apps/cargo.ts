import type {FreightOffer,FreightState} from '@bar/shared/factory';
import {isRibeiroMaterial,RIBEIRO_NAME} from '@bar/shared';
import {escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import type {PhoneApp} from '../core';
import './cargo.css';

type Tab='offers'|'trip'|'history';
const TABS:ReadonlyArray<readonly [Tab,string,string]>=[['offers','Cargas','package'],['trip','Viagem','mapPin'],['history','Histórico','receipt']];
const coins=(value:number)=>value.toLocaleString('pt-BR');
const clock=(at:number)=>new Date(at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const minutes=(ms:number)=>{const total=Math.max(0,Math.ceil(ms/60_000));return total>=60?`${Math.floor(total/60)} h ${total%60} min`:`${total} min`;};
const STATUS:Record<string,string>={loaded:'Carregado na doca',in_transit:'A caminho do destino',to_supplier:'Indo ao fornecedor',returning:'Voltando à doca da fábrica',delivered:'Entregue',cancelled:'Cancelada'};
const STEPS=[['to_supplier','Fornecedor'],['returning','Voltar à doca'],['delivered','Descarga']] as const;
const rid=()=>crypto.randomUUID();

/**
 * HighCargo: the truck driver's side of the plant's raw-material requests. Open requests (made at the plant's computer) show here; a driver at the wheel
 * of a truck takes one, drives to a supplier by the GPS and back to the dock, where the plant's racks receive it and the driver is paid the freight.
 * A request nobody takes is delivered by the supplier's own driver (an NPC) within half an hour: the time is on every card.
 * The app exists only for whoever holds a truck key or is at the wheel of a truck (`visible`).
 */
export const highcargo:PhoneApp={id:'highcargo',name:'HighCargo',icon:'truck',tint:'linear-gradient(160deg,#f6b04a,#b8641a)',
  visible:host=>!!host.freight.state()?.eligible,
  open(view,ctx){
    let tab:Tab='offers',notice:{ok:boolean;text:string}|undefined,busy='';
    const feed=ctx.host.freight,state=():FreightState|undefined=>feed.state();
    const estimate=(offer:FreightOffer,pay:FreightState['pay'])=>{
      const base=pay.purchaseFreight+pay.freightPerPallet*offer.pallets;
      // The supplier is 140-640 m from the dock and the truck comes back: the trip is 2x that.
      return {low:Math.round(base+pay.freightPerKm*.28),high:Math.round(base+pay.freightPerKm*1.28)};
    };
    function offersHtml(s:FreightState):string {
      const busyTrip=!!s.trip,driving=!!s.driving;
      const status=driving?`<div class="cg-status on">${uiIcon('truck')}<span><b>Ao volante${s.driving!.plate?` · ${e(s.driving!.plate)}`:''}</b><small>Pode aceitar uma carga agora.</small></span></div>`
        :`<div class="cg-status">${uiIcon('truck')}<span><b>Fora do caminhão</b><small>Entre no seu caminhão (ao volante) para aceitar uma carga.</small></span></div>`;
      const cards=s.offers.map(offer=>{
        const pay=estimate(offer,s.pay),left=offer.npcAt-Date.now(),can=driving&&!busyTrip&&!busy;
        const why=busyTrip?'Termine a viagem em andamento primeiro.':!driving?'Entre no caminhão para aceitar.':'';
        return `<article class="cg-card"><header><span class="cg-mat" data-mat="${offer.material}">${offer.material}</span><b>${offer.pallets} palete${offer.pallets>1?'s':''}</b><small>${offer.bags} volumes industriais</small></header>
          <div class="cg-line">${uiIcon('coins')}<span><b>≈ ${coins(pay.low)}–${coins(pay.high)} moedas</b><small>${coins(s.pay.purchaseFreight)} + ${coins(s.pay.freightPerPallet)} por palete + ${coins(s.pay.freightPerKm)}/km (rota sorteada; ida e volta)</small></span></div>
          <div class="cg-line">${uiIcon('clock')}<span><b>${left>0?`Sem motorista, o fornecedor entrega às ${clock(offer.npcAt)} (em ${minutes(left)})`:'O fornecedor já vai entregar'}</b><small>${e(offer.requestedBy)} · pedido às ${clock(offer.createdAt)}</small></span></div>
          <button type="button" class="ph-pill-btn cg-go${can?'':' off'}" data-cg="accept" data-order="${e(offer.id)}" aria-disabled="${!can}" data-why="${e(why)}">${uiIcon('truck')}Aceitar entrega</button>${why?`<p class="cg-why">${e(why)}</p>`:''}</article>`;
      }).join('');
      return `${status}${cards||`<div class="ph-empty">${uiIcon('package')}<b>Nenhuma carga agora</b><span>Quando a fábrica pedir matéria-prima, aparece aqui. O celular avisa.</span></div>`}
        <p class="ph-hint">Aceitou? O GPS marca o fornecedor e depois a doca correta da empresa solicitante. Estacione no círculo para descarregar e receber o frete.</p>`;
    }
    function tripHtml(s:FreightState):string {
      const trip=s.trip;
      if(!trip)return `<div class="ph-empty">${uiIcon('mapPin')}<b>Sem viagem</b><span>Aceite uma carga na aba Cargas.</span></div>`;
      const index=STEPS.findIndex(([id])=>id===trip.status);
      const where=trip.status==='returning'?(isRibeiroMaterial(trip.material)?`${RIBEIRO_NAME} · recebimento`:'Doca da EMPRESA BRASIL'):trip.destLabel;
      const steps=trip.kind==='purchase'?`<ol class="cg-steps">${STEPS.map(([id,label],i)=>`<li class="${i<index?'done':i===index?'now':''}"><i></i>${label}</li>`).join('')}</ol>`:'';
      const hint=trip.status==='to_supplier'?'Siga o GPS até o fornecedor e pare no ponto. A carga entra no baú sozinha.':trip.status==='returning'?'Volte à doca da fábrica e estacione parado no círculo. A equipe descarrega.':trip.status==='loaded'?'Saia da fábrica: a venda é paga na saída e o GPS aponta o destino.':'Siga o GPS e pare no destino para receber o frete.';
      return `<article class="cg-card"><header><span class="cg-mat" data-mat="${trip.material}">${trip.material==='PRODUTO'?'PRODUTO':trip.material}</span><b>${trip.pallets} palete${trip.pallets>1?'s':''}</b><small>${e(trip.plate||'')}</small></header>
        ${steps}<div class="cg-line">${uiIcon('mapPin')}<span><b>${e(STATUS[trip.status]??trip.status)}</b><small>${e(where)}</small></span></div>
        <div class="cg-line">${uiIcon('coins')}<span><b>Frete: ${coins(trip.freight)} moedas</b><small>Pago quando a carga chega.</small></span></div><p class="cg-why">${e(hint)}</p>
        <div class="cg-actions"><button type="button" class="ph-pill-btn soft" data-cg="map">${uiIcon('map')}Mapa</button>${trip.kind==='purchase'?`<button type="button" class="ph-pill-btn soft danger-text" data-cg="cancel" data-trip="${e(trip.id)}">Desistir</button>`:''}</div></article>`;
    }
    function historyHtml(s:FreightState):string {
      if(!s.recent.length)return `<div class="ph-empty">${uiIcon('receipt')}<b>Nenhuma entrega ainda</b><span>As viagens concluídas aparecem aqui.</span></div>`;
      return `<div class="ph-card cg-history">${s.recent.map(trip=>`<div class="ph-row"><span class="cg-mat" data-mat="${trip.material}">${trip.material}</span><span class="fl"><b>${trip.pallets} palete${trip.pallets>1?'s':''} · ${trip.kind==='sale'?'entrega de produto':'coleta'}</b><small>${trip.at?new Date(trip.at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</small></span><b class="in">+${coins(trip.freight)}</b></div>`).join('')}</div>`;
    }
    function render():void {
      const s=state(),scroll=view.querySelector('.ph-body')?.scrollTop??0;
      if(!s?.eligible){view.innerHTML=`<header class="cg-top"><b>${uiIcon('truck')}HighCargo</b></header><div class="ph-body"><div class="ph-empty">${uiIcon('truck')}<b>Só para quem tem caminhão</b><span>Compre um Caminhão Baú no HighMotors para receber cargas.</span></div></div>`;return;}
      const body=tab==='offers'?offersHtml(s):tab==='trip'?tripHtml(s):historyHtml(s);
      view.innerHTML=`<header class="cg-top"><b>${uiIcon('truck')}HighCargo</b><span class="cg-pill ${s.trip?'on':''}">${s.trip?'Em viagem':s.driving?'Ao volante':'Disponível'}</span></header>
        <div class="ph-body cg-body">${notice?`<p class="cg-notice ${notice.ok?'ok':'bad'}" role="status">${e(notice.text)}</p>`:''}${body}</div>
        <nav class="cg-tabs" aria-label="HighCargo">${TABS.map(([id,label,icon])=>`<button type="button" data-cg-tab="${id}" aria-current="${id===tab}">${uiIcon(icon)}<small>${label}${id==='offers'&&s.offers.length&&!s.trip?` (${s.offers.length})`:''}</small></button>`).join('')}</nav>`;
      const bodyNode=view.querySelector('.ph-body');if(bodyNode)bodyNode.scrollTop=scroll;
    }
    view.addEventListener('click',event=>{
      const target=event.target as HTMLElement,tabButton=target.closest<HTMLElement>('[data-cg-tab]');
      if(tabButton){tab=tabButton.dataset.cgTab as Tab;notice=undefined;render();return;}
      const action=target.closest<HTMLElement>('[data-cg]');if(!action)return;
      switch(action.dataset.cg){
        case 'accept':
          if(action.getAttribute('aria-disabled')==='true'){notice={ok:false,text:action.dataset.why||'Ainda não dá.'};render();return;}
          const order=action.dataset.order!;busy=order;notice=undefined;ctx.host.send('freight.accept',{orderId:order,requestId:rid()});setTimeout(()=>{if(busy===order){busy='';render();}},5000);render();return;
        case 'map':ctx.open('mapas');return;
        case 'cancel':if(confirm('Desistir da viagem? A carga do baú se perde e o pedido volta a ficar aberto.')){ctx.host.send('factory.shipment.cancel',{id:action.dataset.trip});}return;
      }
    });
    const stopState=feed.listen(()=>render());
    const stopResult=feed.onResult(result=>{
      if(!result.action.startsWith('freight.')&&result.action!=='shipment.cancel')return;
      busy='';notice={ok:result.ok,text:result.message};if(result.ok&&result.action==='freight.accept')tab='trip';render();
    });
    // The "in N min" and the order list stay honest while the app is open.
    const tick=setInterval(()=>{if(tab==='offers')render();},20_000);
    ctx.host.send('freight.view');
    render();
    return ()=>{stopState();stopResult();clearInterval(tick);};
  }};
