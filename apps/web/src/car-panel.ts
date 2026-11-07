import {CAR_PARTS,carSpec,isTruck,vehicleName,vehicleOccupants,vehicleSeats,readCarParts,motoPartStatus,MOTO_STATUS_LABELS,MOTO_ENGINE,CAR_REPAIR} from '@bar/shared';
import {escape as e} from './api';
import {plateHtml} from './garage-panel';
import {uiIcon} from './ui-icons';
import type {MotoPanelView} from './moto-panel';
const hue=(condition:number)=>Math.round(condition*1.25);
export function carPanelHtml({moto,selected,pieces,blocked,working,keyHolder,viewerId}:MotoPanelView):string {
  const parts=readCarParts(moto.parts),chosen=CAR_PARTS.find(p=>p.id===selected)??CAR_PARTS[0]!,value=parts[chosen.id]!,status=motoPartStatus(value);
  const average=Math.round(CAR_PARTS.reduce((sum,p)=>sum+parts[p.id]!,0)/CAR_PARTS.length),control=keyHolder||moto.riderId===viewerId;
  const button=(action:string,label:string)=>`<button type="button" class="mini-button" data-action="vehicle-control" data-control="${action}" ${control?'':'disabled'}>${label}</button>`;
  const shape=(id:string,geometry:string)=>`<g data-part="${id}" style="fill:hsl(${hue(parts[id]!)} 60% 25%);stroke:${selected===id?'#fff':`hsl(${hue(parts[id]!)} 75% 55%)`}">${geometry}</g>`;
  const drawing=`<svg class="moto-plan" viewBox="0 0 200 420" role="img" aria-label="O carro visto de cima e o estado das peças">
    ${shape('carroceria','<rect x="43" y="20" width="114" height="380" rx="26"/>')}
    ${shape('capo','<rect x="55" y="40" width="90" height="65" rx="12"/>')}${shape('motor','<rect x="78" y="54" width="44" height="32" rx="5"/>')}
    ${shape('farol','<path d="M53 27h32v13H53zm62 0h32v13h-32z"/>')}
    ${shape('pneu_de','<rect x="29" y="92" width="18" height="62" rx="6"/>')}${shape('pneu_dd','<rect x="153" y="92" width="18" height="62" rx="6"/>')}
    ${shape('pneu_te','<rect x="29" y="283" width="18" height="62" rx="6"/>')}${shape('pneu_td','<rect x="153" y="283" width="18" height="62" rx="6"/>')}
    <path d="M57 120h86v32H57zm6 55h74v122H63z" fill="#152236" stroke="#6385a1"/>
    ${shape('porta_esquerda','<rect x="44" y="160" width="14" height="130" rx="4"/>')}${shape('porta_direita','<rect x="142" y="160" width="14" height="130" rx="4"/>')}
    ${shape('porta_malas','<rect x="56" y="325" width="88" height="50" rx="8"/>')}${shape('lanterna','<path d="M51 378h30v12H51zm68 0h30v12h-30z"/>')}
    ${shape('escapamento','<rect x="57" y="390" width="12" height="18"/>')}${shape('bateria','<rect x="61" y="91" width="20" height="15"/>')}
    ${shape('direcao','<circle cx="78" cy="177" r="10"/>')}${shape('freios','<circle cx="100" cy="305" r="10"/>')}
    ${shape('suspensao','<path d="M48 114h104v7H48zm0 177h104v7H48z"/>')}${shape('limpadores','<path d="m58 150 35-22 4 5-35 22zm43 0 35-22 4 5-35 22z"/>')}
  </svg>`;
  const groups=[...new Set(CAR_PARTS.map(p=>p.group))],occupants=vehicleOccupants(moto);
  return `<div class="moto-panel" data-moto="${e(moto.id)}" data-car-panel>
    <div class="moto-owner">${plateHtml(moto.plate??'')}<b>${e(vehicleName(moto.model??''))}</b><span>De ${e(moto.ownerName??'outro jogador')}</span><span>${uiIcon(moto.locked?'lock':'unlock')}${moto.locked?'Trancado':'Destrancado'}</span>${keyHolder?`<button type="button" class="button" data-action="moto-lock">${moto.locked?'Destrancar':'Trancar'} <kbd>L</kbd></button>`:''}</div>
    <div class="moto-summary"><div><small>Estado geral</small><b data-moto-overall>${average}%</b></div><div><small>Motor</small><b data-moto-engine>${moto.engine===MOTO_ENGINE.ON?'Ligado':moto.engine===MOTO_ENGINE.CRANKING?'Dando partida':'Desligado'}</b></div><div><small>Lugares</small><b>${occupants.filter(Boolean).length}/${carSpec(moto.model).SEATS}</b></div></div>
    <div class="car-controls">${button('headlights',`Faróis: ${['apagados','baixos','altos'][moto.headlights??0]}`)}${button('left-door','Porta esquerda')}${button('right-door','Porta direita')}${isTruck(moto)?'':`${button('hood','Capô')}${button('trunk','Porta-malas')}`}${button('wipers',moto.wipers?'Desligar limpadores':'Ligar limpadores')}${button('engine','Motor (R)')}</div>
    <p class="fine-print">F: buzina · W/S: acelerar, frear e ré · A/D: direção · Espaço: freio de mão · H: faróis · Z/C: setas · X: alerta · N: limpadores · ${isTruck(moto)?'':'O: capô · U: porta-malas · '}Y/Shift+Y: portas · E: sair · Q: câmera.${isTruck(moto)?' O baú abre pela traseira: de pé atrás do caminhão, E.':''}</p>
    <div class="car-seats">${vehicleSeats(moto.model).map((seat,i)=>`<span>${uiIcon('users')}${e(seat.name)}: ${occupants[i]?'ocupado':'livre'}</span>`).join('')}</div>
    ${keyHolder?`<div class="car-paint"><label for="car-paint-color">Cor da pintura</label><input type="color" id="car-paint-color" data-car-color value="${e(moto.color??'#ccc9c2')}"><button class="button" type="button" data-action="car-paint">Aplicar cor</button></div>`:''}
    <div class="moto-layout"><div class="moto-parts" role="group" aria-label="Partes do carro">${groups.map(group=>`<div class="moto-group"><h4>${e(group)}</h4>${CAR_PARTS.filter(p=>p.group===group).map(p=>`<button type="button" class="moto-part" data-action="moto-part" data-part="${p.id}" aria-pressed="${p.id===chosen.id}" style="--condition:${parts[p.id]}%;--hue:${hue(parts[p.id]!)}"><span>${e(p.name)}</span><b>${parts[p.id]}%</b><i></i></button>`).join('')}</div>`).join('')}</div>
    <div class="moto-side"><div class="moto-drawing">${drawing}</div><section class="item-detail moto-detail" aria-label="${e(chosen.name)}"><header class="moto-detail-head"><h3>${e(chosen.name)}</h3><strong style="--hue:${hue(value)}">${value}%</strong></header><p><b>${MOTO_STATUS_LABELS[status]}.</b> ${e(chosen[status])}</p>
      ${working?.motoId===moto.id?'<p role="status">Consertando a peça…</p>':`<button class="button primary" type="button" data-action="moto-repair" data-part="${chosen.id}" ${blocked?'disabled':''}>${uiIcon('wrench')}Consertar (+40%)</button>${blocked?`<p class="item-blocked">${e(blocked)}</p>`:''}`}
      <p class="fine-print">Peças de carro na mochila: ${pieces}. Cada conserto consome uma e leva ${CAR_REPAIR.ms/1000} s. A loja da casa vende as peças.</p></section></div></div></div>`;
}
