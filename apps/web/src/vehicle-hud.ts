import {vehicleSpeed,vehicleMotionSpeed,type MotoBody} from '@bar/shared';
import {CAR_SEATS,MOTO_ENGINE,MOTO_LIGHT,atVehicleFuelPump,isCar,isRidingHorse,readVehicleParts,vehicleName,vehicleOccupants,vehiclePowered,vehicleSeat,vehicleTank,type MotoState,type PlayerState} from '@bar/shared';
import {escape as e} from './api';
import {uiIcon} from './ui-icons';
import './vehicle-hud.css';

const drawings:Record<string,string>={
  car:'<path d="m3 10 2-6h14l2 6v10h-3v-3H6v3H3V10Zm0 0h18M6 13h2m8 0h2"/>',
  arrowLeft:'<path d="m11 5-7 7 7 7M4 12h17"/>',
  arrowRight:'<path d="m13 5 7 7-7 7M20 12H3"/>',
  engine:'<path d="M3 10v7h3l3 3h9v-4h3v-6h-3V7H8v3H3Zm5-6h7M11 4v3M1 11v5"/>',
  headlight:'<path d="M14 6c-5 0-7 2-7 6s2 6 7 6V6ZM3 7H1m3 5H1m2 5H1m16-10 5-2m-5 7h5m-5 5 5 2"/>',
  wipers:'<path d="M3 6h18l2 12H1L3 6Zm2 12 7-9m0 9 6-9M7 11l6-4m0 4 6-4"/>',
  fuel:'<path d="M4 21V4h10v17M3 21h12M6 7h6v5H6m8 2h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9l-4-4m2 2v5h2"/>',
  battery:'<path d="M3 7h18v13H3V7Zm3-3v3m12-3v3M6 13h4m-2-2v4m7-2h3"/>',
  door:'<path d="M4 21V9l6-6h9v18H4Zm3-11 4-5h5v5H7Zm6 5h3"/>',
  hazard:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v.2"/>',
  horse:'<path d="m5 21 2-8-3-3 4-6 2 2 5-3 5 7-3 3-4-2-1 5 4 5M8 4V1m5 6h.1M7 13h5"/>',
};
const icon=(name:string)=>drawings[name]?`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[name]}</svg>`:uiIcon(name);
const condition=(value:number)=>value<30?'bad':value<70?'worn':'good';
const stateLabel=(value:number)=>value<=0?'quebrado':value<30?'crítico':value<70?'desgastado':'bom';
const button=(control:string,symbol:string,label:string,options:{active?:boolean;disabled?:boolean;value?:number;key?:string;detail?:string}={})=>{
  const health=options.value===undefined?'':`${Math.round(options.value)}% · ${stateLabel(options.value)}`;
  return `<button type="button" class="vh-control ${options.active?'is-on':''} ${options.value===undefined?'':`vh-${condition(options.value)}`}" data-vcontrol="${control}" ${options.disabled?'disabled':''} aria-label="${e(label)}${health?` · condição ${health}`:''}" aria-pressed="${!!options.active}" title="${e([label,health,options.detail].filter(Boolean).join(' · '))}">${icon(symbol)}<span>${e(label)}</span>${options.value===undefined?'':`<i class="vh-condition" aria-hidden="true"></i>`}${options.key?`<kbd>${options.key}</kbd>`:''}<small>${e(options.detail??health)}</small></button>`;
};

export function createVehicleHud(host:HTMLElement,onControl:(action:string)=>void){
  let drawn='',lastHorse:{id:string;x:number;z:number;at:number}|undefined,horseSpeed=0;
  host.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLButtonElement>('[data-vcontrol]');
    if(!target||target.disabled)return;
    onControl(target.dataset.vcontrol!);
    if(event.detail>0)target.blur();
  });
  function speed(value:number,top:number,longitudinal=value){
    const kmh=Math.round(Math.abs(value)*3.6),number=host.querySelector('[data-vh-speed]'),gear=host.querySelector('[data-vh-gear]');
    if(number&&number.textContent!==String(kmh))number.textContent=String(kmh);
    if(gear)gear.textContent=longitudinal<-.05?'R':longitudinal>.05?'D':'N';
    host.style.setProperty('--vh-speed',String(Math.min(1,Math.abs(value)/top)));
  }
  return {
    speed(value:number|Pick<MotoBody,'speed'|'lateralSpeed'>){speed(typeof value==='number'?value:vehicleSpeed(value),host.dataset.kind==='car'?38.9:15.3,typeof value==='number'?value:value.speed);},
    update(self:PlayerState|undefined,vehicles:Record<string,MotoState>,now=Date.now()):boolean {
      const vehicle=self?Object.values(vehicles).find(v=>vehicleSeat(v,self.id)>=0):undefined,horse=isRidingHorse(self?.interactionState),mounted=!!vehicle||horse;
      host.classList.toggle('hidden',!mounted);
      if(!mounted||!self){drawn='';lastHorse=undefined;return false;}
      const car=isCar(vehicle),kind=horse?'horse':car?'car':'moto';host.dataset.kind=kind;
      const driver=vehicle?.riderId===self.id,parts=readVehicleParts(vehicle?.model,vehicle?.parts),power=!!vehicle&&vehiclePowered(vehicle);
      const engine=vehicle?.engine??0,fuel=Math.max(0,Math.min(100,vehicle?.fuel??100)),seat=vehicle?vehicleSeat(vehicle,self.id):-1;
      const fuelText=`${(fuel*vehicleTank(vehicle?.model)/100).toLocaleString('pt-BR',{maximumFractionDigits:1})} / ${vehicleTank(vehicle?.model).toLocaleString('pt-BR')} L`;
      const canRefuel=!!vehicle&&driver&&atVehicleFuelPump(vehicle)&&engine===MOTO_ENGINE.OFF&&vehicleMotionSpeed(vehicle)<.05;
      const raining=host.dataset.raining==='true',wiping=!!vehicle&&(vehicle.wipers||raining)&&power&&parts.limpadores!>0&&parts.bateria!>0;
      const signature=JSON.stringify([vehicle?.id,kind,driver,seat,vehicle?.parts,engine,vehicle?.ignition,vehicle?.locked,vehicle?.headlights,vehicle?.lights,vehicle?.doors,vehicle?.wipers,wiping,vehicle?.hood,vehicle?.trunk,vehicle?.passengers,Math.round(fuel*10),canRefuel,Math.round(self.stamina??100),Math.round(self.hp??100)]);
      if(signature!==drawn){
        drawn=signature;
        const motorLabel=engine===MOTO_ENGINE.CRANKING?'Dando partida':power?'Desligar motor':'Ligar motor';
        const lock=vehicle?.locked?'Destrancar portas':'Trancar portas',lights=vehicle?.headlights??0,bits=vehicle?.lights??0;
        const controls=horse?`<div class="vh-horse-stat">${icon('horse')}<span>Montaria<b>Cavalo do Tião</b></span></div><div class="vh-horse-stat">${icon('heart')}<span>Sua vida<b>${Math.round(self.hp??100)}%</b></span></div><div class="vh-horse-stat">${icon('sparkles')}<span>Seu fôlego<b>${Math.round(self.stamina??100)}%</b></span></div>`:
          `${button('ignition','key',vehicle?.ignition?'Chave inserida':'Colocar chave',{active:vehicle?.ignition,disabled:!driver||engine!==MOTO_ENGINE.OFF||vehicleMotionSpeed(vehicle!)>.05,detail:vehicle?.ignition?'Ignição · clique para retirar':'Ignição · clique para inserir'})}
          ${button('engine','engine',motorLabel,{active:power,disabled:!driver||(engine===MOTO_ENGINE.OFF&&(!vehicle?.ignition||fuel<=0)),value:parts.motor,key:'R'})}
          ${button('lock',vehicle?.locked?'lock':'unlock',car?lock:vehicle?.locked?'Destrancar':'Trancar',{active:vehicle?.locked,disabled:!driver,key:'L'})}
          ${button('headlights','headlight',lights===2?'Farol alto':lights===1?'Farol baixo':'Faróis apagados',{active:power&&lights>0,disabled:!driver||!power,value:parts.farol,key:'H'})}
          ${car?button('wipers','wipers',wiping?'Limpadores ligados':'Limpadores',{active:wiping,disabled:!driver||!power||parts.limpadores!<=0,value:parts.limpadores,key:'N',detail:raining&&power?'Automático · chuva':vehicle?.wipers?'Ligados':'Desligados'}):button('battery','battery','Bateria',{value:parts.bateria,disabled:true})}`;
        host.innerHTML=`<div class="vh-heading"><span class="vh-name">${icon(horse?'horse':car?'car':'bike')}<b>${horse?'Cavalo':e(vehicleName(vehicle!.model??'moto-delivery'))}</b>${vehicle?.plate?`<span class="vh-plate">${e(vehicle.plate)}</span>`:''}</span><span class="vh-seat">${horse?'Montaria':driver?'Motorista':CAR_SEATS[seat]?.name??'Passageiro'}${car?` · ${vehicleOccupants(vehicle!).filter(Boolean).length}/4`:''}</span></div>
          <div class="vh-main"><div class="vh-dial"><svg viewBox="0 0 120 82" aria-hidden="true"><path class="vh-dial-track" d="M13 68a49 49 0 1 1 94 0" pathLength="100"/><path class="vh-dial-fill" d="M13 68a49 49 0 1 1 94 0" pathLength="100"/></svg><strong data-vh-speed>0</strong><span>km/h</span><b class="vh-gear" data-vh-gear>N</b></div><div class="vh-controls">${controls}</div>${horse?'':`<div class="vh-fuel ${fuel<15?'vh-bad':''}" title="${Math.round(fuel)}% de combustível"><span>${icon('fuel')}<b>${Math.round(fuel)}%</b></span><meter min="0" max="100" low="15" optimum="80" value="${fuel}" aria-label="Nível de combustível">${Math.round(fuel)}%</meter><small>${fuelText}</small>${canRefuel?'<button type="button" data-vcontrol="refuel">Abastecer</button>':'<small>Abasteça nas garagens</small>'}</div>`}</div>
          <div class="vh-footer"><div class="vh-signals">${horse?'<span>WASD · conduzir &nbsp; Shift · galopar</span>':`${button('left','arrowLeft','Seta esquerda',{active:power&&!!(bits&MOTO_LIGHT.LEFT),disabled:!driver||!power,key:'Z'})}${button('hazard','hazard','Pisca-alerta',{active:power&&(bits&6)===6,disabled:!driver||!power,key:'X'})}${button('right','arrowRight','Seta direita',{active:power&&!!(bits&MOTO_LIGHT.RIGHT),disabled:!driver||!power,key:'C'})}${car?button('doors','door','Portas',{active:!!vehicle?.doors,disabled:!driver||vehicleMotionSpeed(vehicle!)>1.5,detail:vehicle?.doors?'Abertas':'Fechadas'}):''}`}</div><div class="vh-utility">${!horse?'<button type="button" data-vcontrol="info" title="Ver todas as peças e condições">'+icon('wrench')+'<span>Condição</span></button>':''}<button type="button" data-vcontrol="camera" title="Alternar câmera (Q)">${icon('camera')}<kbd>Q</kbd></button><button type="button" data-vcontrol="exit" ${vehicle&&vehicleMotionSpeed(vehicle)>(car?1.5:3)?'disabled title="Pare para sair"':''}>${icon('logOut')}<span>${horse?'Desmontar':'Sair'}</span><kbd>E</kbd></button></div></div>
          ${!horse&&!driver?'<p class="vh-passenger">Você é passageiro. Os comandos ficam com o motorista.</p>':''}`;
      }
      if(horse){
        if(lastHorse?.id===self.id&&now>lastHorse.at){const distance=Math.hypot(self.x-lastHorse.x,self.z-lastHorse.z);horseSpeed=Math.min(9,distance/((now-lastHorse.at)/1000));}
        lastHorse={id:self.id,x:self.x,z:self.z,at:now};speed(horseSpeed,9);
      }else speed(vehicleSpeed(vehicle!),car?38.9:15.3,vehicle!.speed);
      return true;
    },
    reset(){host.classList.add('hidden');host.replaceChildren();drawn='';lastHorse=undefined;},
  };
}
