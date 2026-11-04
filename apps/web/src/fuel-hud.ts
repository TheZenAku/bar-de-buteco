import {MOTO_ENGINE,pumpNear,vehicleMotionSpeed,vehicleSeat,type FuelServiceState,type MotoState,type PlayerState,type WorldState} from '@bar/shared';
import './fuel-hud.css';
export function fuelContext(self:PlayerState|undefined,world:WorldState|undefined){
  const vehicle=self&&Object.values(world?.motos??{}).find(v=>vehicleSeat(v,self.id)>=0);
  const service=vehicle&&Object.values(world?.fuelServices??{}).find(s=>s.vehicleId===vehicle.id&&s.phase!=='idle');
  const pump=vehicle&&vehicle.riderId===self?.id&&vehicle.engine===MOTO_ENGINE.OFF&&vehicleMotionSpeed(vehicle)<=.05&&!vehicle.phase?pumpNear(vehicle):undefined;
  const occupied=pump&&world?.fuelServices?.[pump.id]?.phase!=='idle'&&!!world?.fuelServices?.[pump.id];
  return {vehicle,service,pump,occupied};
}
export function createFuelHud(parent:HTMLElement,cancel:()=>void){
  const node=document.createElement('aside');node.id='fuel-service-hud';node.hidden=true;node.setAttribute('aria-label','Atendimento do posto');
  node.innerHTML='<strong>Frentista realizando abastecimento</strong><span data-fuel-stage></span><meter min="0" max="100" aria-label="Combustível no tanque"></meter><span data-fuel-values></span><small data-fuel-message></small><button type="button">Interromper abastecimento</button>';
  parent.append(node);node.querySelector('button')!.onclick=cancel;
  const labels:Record<string,string>={authorizing:'Autorizando atendimento','to-pump':'Indo até a bomba',take:'Retirando o bico','to-car':'Indo até o tanque',insert:'Inserindo o bico',fueling:'Abastecendo',remove:'Retirando o bico do tanque',return:'Voltando à bomba',replace:'Devolvendo o bico',paying:'Confirmando pagamento',home:'Atendimento concluído'};
  return {update(service:FuelServiceState|undefined,vehicle:MotoState|undefined,driver:boolean){
    node.hidden=!service;if(!service)return;
    node.querySelector('[data-fuel-stage]')!.textContent=labels[service.phase]??'';
    node.querySelector('meter')!.value=vehicle?.fuel??0;
    node.querySelector('[data-fuel-values]')!.textContent=`${(vehicle?.fuel??0).toLocaleString('pt-BR',{maximumFractionDigits:1})}% · ${service.litres.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} L · ${service.total} moedas`;
    node.querySelector('[data-fuel-message]')!.textContent=service.message;
    node.querySelector('button')!.hidden=!driver||['remove','return','replace','paying','home'].includes(service.phase);
  }};
}
