import {GARAGE,MOTO_PARTS,garageById,motoPartStatus,readMotoParts,type GarageVehicle,type GarageView} from '@bar/shared';
import {escape as e} from './api';
import {uiIcon} from './ui-icons';

export const plateHtml=(plate:string)=>`<span class="car-plate" aria-label="Placa ${e(plate)}"><i>BRASIL</i>${e(plate)}</span>`;
const km=(metres:number)=>`${(metres/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km`;

function vehicleHtml(vehicle:GarageVehicle,view:GarageView,anotherOut:boolean):string {
  const parts=readMotoParts(vehicle.parts),values=MOTO_PARTS.map(part=>({name:part.name,value:Math.round(parts[part.id])}));
  const overall=Math.round(values.reduce((sum,part)=>sum+part.value,0)/values.length),worn=values.filter(part=>part.value<70).sort((a,b)=>a.value-b.value).slice(0,3);
  const action=!vehicle.out
    ?`<button type="button" class="button primary" data-action="garage-take" data-vehicle="${e(vehicle.id)}" ${anotherOut?'disabled':''}>${uiIcon('key')}Retirar</button>`
    :vehicle.far
      ?`<button type="button" class="button" data-action="garage-store" data-recall="true">${uiIcon('truck')}Trazer de guincho · ${view.towPrice.toLocaleString('pt-BR')}</button>`
      :`<button type="button" class="button" data-action="garage-store">${uiIcon('warehouse')}Guardar</button>`;
  return `<article class="garage-vehicle" data-plate="${e(vehicle.plate)}"><img src="${import.meta.env.BASE_URL}moto/foto.webp" alt="" draggable="false">
    <div class="garage-vehicle-body"><header><b>${e(vehicle.name)}</b>${plateHtml(vehicle.plate)}</header>
      <p class="garage-facts"><span>${overall}% de estado</span><span>${km(vehicle.mileage)}</span><span class="${vehicle.out?'out':''}">${vehicle.out?(vehicle.far?'Na rua, longe daqui':'Na rua, aqui perto'):'Guardada'}</span></p>
      ${worn.length?`<p class="garage-worn">${worn.map(part=>`<span class="status-${motoPartStatus(part.value)}">${e(part.name)} ${part.value}%</span>`).join('')}</p>`:''}
      ${anotherOut&&!vehicle.out?'<p class="fine-print">Só um veículo na rua por vez: guarde o outro primeiro.</p>':''}
    </div>${action}</article>`;
}
/** E on a garage's ring: every vehicle whose key this player holds, what state each is in, and taking one out or putting one away. */
export function garagePanelHtml(view:GarageView):string {
  const garage=garageById(view.garageId)!,anotherOut=view.vehicles.some(vehicle=>vehicle.out);
  if(!view.vehicles.length)return `<div class="garage-panel" data-garage="${garage.id}"><p class="modal-description">Você não tem a chave de nenhum veículo. As motos ficam à venda no app <b>HighMotors</b> do celular (K).</p><button type="button" class="button primary" data-action="food-motors">${uiIcon('bike')}Abrir o HighMotors</button></div>`;
  return `<div class="garage-panel" data-garage="${garage.id}"><p class="modal-description">O que quebrou continua quebrado: cada veículo sai daqui do jeito que entrou. Perto da garagem (até ${GARAGE.STORE_REACH} m) ele entra de graça.</p>
    <div class="garage-list">${view.vehicles.map(vehicle=>vehicleHtml(vehicle,view,anotherOut)).join('')}</div></div>`;
}

let context:AudioContext|undefined;
/** The little double chirp of a key's button, drawn rather than recorded. */
export function keyChirp(volume:number,locking:boolean):void {
  try{
    context??=new AudioContext();
    if(context.state==='suspended')void context.resume();
    const start=context.currentTime,gain=context.createGain();
    gain.connect(context.destination);
    for(const [at,pitch] of locking?[[0,2100],[.14,2100]] as const:[[0,1700]] as const){
      const tone=context.createOscillator(),each=context.createGain();
      tone.type='square';tone.frequency.value=pitch;
      each.gain.setValueAtTime(0,start+at);each.gain.linearRampToValueAtTime(.05*volume,start+at+.008);each.gain.setValueAtTime(.05*volume,start+at+.07);each.gain.linearRampToValueAtTime(0,start+at+.09);
      tone.connect(each).connect(gain);tone.start(start+at);tone.stop(start+at+.1);
    }
  }catch{/* No audio here: the notice says it anyway. */}
}
