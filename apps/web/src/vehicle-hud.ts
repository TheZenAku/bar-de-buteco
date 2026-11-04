import {
  CAR_PARTS,CAR_SEATS,MOTO_ENGINE,MOTO_LIGHT,MOTO_PARTS,atVehicleFuelPump,isCar,isRidingHorse,
  readVehicleParts,vehicleFuelUse,vehicleMotionSpeed,vehicleName,vehicleOccupants,vehiclePowered,
  vehicleSeat,vehicleSpeed,vehicleTank,type MotoBody,type MotoState,type PlayerState,
} from '@bar/shared';
import {escape as e} from './api';
import {uiIcon} from './ui-icons';
import './vehicle-hud.css';
import {vehicleFuelBusy,type FuelServiceState} from '@bar/shared';

const drawings:Record<string,string>={
  car:'<path d="m4 10 2-6h12l2 6M3 11l1-1h16l1 1v8H3v-8Zm1 8v2h3v-2m10 0v2h3v-2M1 9h3m16 0h3M6 14h3m6 0h3M9 17h6"/>',
  arrowLeft:'<path d="m11 5-7 7 7 7M4 12h17"/>',
  arrowRight:'<path d="m13 5 7 7-7 7M20 12H3"/>',
  engine:'<path d="M4 9v9h3l3 3h8l3-4V9h-3l-2-3H9L6 9H4ZM9 3h6m-3 0v3M1 10v7m0-3h3m17-3h2v7h-2"/>',
  headlight:'<path d="M11 4v16c7 0 11-3 11-8S18 4 11 4ZM2 6l5-1M2 10l5-1m-5 5 5-1m-5 5 5-1"/>',
  wipers:'<path d="M2 6Q12-2 22 6l-5 10q-5-4-10 0L2 6Zm10 14L6 7m6 13 5-10M5 8l3-1m8 3 3 1"/><circle cx="12" cy="20" r="1"/>',
  fuel:'<path d="M4 21V3h10v18M3 21h12M7 6h4v5H7m7 3h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9l-4-4m2 2v5h2"/>',
  battery:'<path d="M3 7h18v13H3V7Zm3-3v3m12-3v3M6 13h4m-2-2v4m7-2h3"/>',
  door:'<path d="M4 21V9l6-6h9v18H4Zm3-11 4-5h5v5H7Zm6 5h3"/>',
  hazard:'<path d="m12 2 11 19H1L12 2Zm0 7v5m0 3v.2"/>',
  horse:'<path d="m5 21 2-8-3-3 4-6 2 2 5-3 5 7-3 3-4-2-1 5 4 5M8 4V1m5 6h.1M7 13h5"/>',
};
const icon=(name:string)=>drawings[name]?`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[name]}</svg>`:uiIcon(name);
const condition=(value:number)=>value<35?'bad':value<70?'worn':'good';
const stateLabel=(value:number,excellent:string)=>value<=0?'Inoperante':value<35?'Danificado':value<70?'Desgastado':value<90?'Bom':excellent;
const point=(radius:number,angle:number)=>({x:180+radius*Math.sin(angle*Math.PI/180),y:180-radius*Math.cos(angle*Math.PI/180)});
const arc=(radius:number)=>{const a=point(radius,-125),b=point(radius,125);return `M${a.x} ${a.y}A${radius} ${radius} 0 1 1 ${b.x} ${b.y}`;};
let nextHudId=0;

/** Vector contours follow the reference; the dial and every readout remain independent elements. */
function frame(id:string){
  return `<svg class="vh-frame" viewBox="0 0 1000 386" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-edge" x1="0" y1="300" x2="1000" y2="80" gradientUnits="userSpaceOnUse"><stop stop-color="#ed30ff"/><stop offset=".21" stop-color="#7433f3"/><stop offset=".39" stop-color="#0eeaff"/><stop offset=".57" stop-color="#7d36ec"/><stop offset=".8" stop-color="#142b70"/><stop offset="1" stop-color="#db29fa"/></linearGradient>
      <linearGradient id="${id}-glass" x1="400" y1="70" x2="500" y2="300" gradientUnits="userSpaceOnUse"><stop stop-color="#0a0c19" stop-opacity=".94"/><stop offset=".55" stop-color="#090913" stop-opacity=".87"/><stop offset="1" stop-color="#100b21" stop-opacity=".96"/></linearGradient>
      <linearGradient id="${id}-divider"><stop stop-color="#25213e"/><stop offset=".6" stop-color="#16417a"/><stop offset="1" stop-color="#6425aa"/></linearGradient>
    </defs>
    <path class="vh-glowing-edge" fill="url(#${id}-glass)" stroke="url(#${id}-edge)" stroke-width="2.6" d="M82 292C25 292 2 248 2 182C2 83 76 2 179 2C243 2 289 32 320 65Q330 76 351 66H970Q998 66 998 94V264Q998 292 970 292Z"/>
    <path fill="url(#${id}-glass)" stroke="url(#${id}-edge)" stroke-width="2.5" d="M490 66C533 65 546 18 580 17H789Q816 17 816 42Q816 66 795 66ZM816 66Q823 22 849 22H970Q996 22 996 47V66Z"/>
    <path stroke="#02cfff" stroke-opacity=".65" stroke-width="5" d="M491 65C534 64 549 19 580 18"/>
    <path stroke="url(#${id}-divider)" stroke-width="2" d="M420 70C384 70 390 129 376 174L358 264Q353 288 334 288M617 70Q578 70 578 107V257Q578 278 568 288M830 69Q792 69 792 108V257Q792 278 781 288"/>
    <path class="vh-glowing-edge" fill="url(#${id}-glass)" stroke="url(#${id}-edge)" stroke-width="2.6" d="M58 310H468Q488 310 499 331L517 365Q521 380 539 380H613Q631 380 639 365L657 332Q668 310 691 310H961Q998 310 998 347Q998 382 963 382H30Q2 382 2 358Q2 330 30 316Q40 310 58 310Z"/>
    <path stroke="#a078ed" stroke-opacity=".45" stroke-width="1.5" d="M144 327V370M265 327V370M386 327V370M783 327V370M891 327V370"/>
    <path stroke="#b25af8" stroke-opacity=".16" stroke-width="5" d="M20 347Q32 316 64 316H465M683 316H960"/>
  </svg>`;
}

function dial(id:string){
  const colors=['#f431ff','#ae48ff','#00dcff','#00eaff','#078fff','#1375ff','#9d2bec','#e426ff'].map(color=>[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)));
  const ring=Array.from({length:80},(_,i)=>{
    const position=i/79*(colors.length-1),index=Math.min(colors.length-2,Math.floor(position)),mix=position-index;
    const rgb=colors[index]!.map((channel,c)=>Math.round(channel+(colors[index+1]![c]!-channel)*mix));
    const a=point(162,-125+i*250/80),b=point(162,-125+(i+1)*250/80+.1);
    return `<path d="M${a.x} ${a.y}A162 162 0 0 1 ${b.x} ${b.y}" stroke="rgb(${rgb.join(',')})"/>`;
  }).join('');
  const ticks=Array.from({length:41},(_,i)=>{
    const a=-125+i*6.25,major=i%4===0,p=point(155,a),q=point(major?145:149,a),label=point(129,a);
    return `<path d="M${p.x} ${p.y}L${q.x} ${q.y}" class="${major?'vh-tick-major':'vh-tick'}"/>${major?`<text x="${label.x}" y="${label.y}" dominant-baseline="central" text-anchor="middle">${i*5}</text>`:''}`;
  }).join('');
  return `<div class="vh-dial"><svg viewBox="0 0 360 300" aria-hidden="true">
    <defs><g id="${id}-ring" fill="none" stroke-width="10">${ring}</g><mask id="${id}-progress"><path class="vh-dial-progress" fill="none" stroke="white" stroke-width="13" stroke-linecap="round" d="${arc(162)}" pathLength="100"/></mask><radialGradient id="${id}-core"><stop stop-color="#080910"/><stop offset="1" stop-color="#080810" stop-opacity=".88"/></radialGradient></defs>
    <path class="vh-dial-bezel" d="${arc(172)}"/>
    <use class="vh-dial-track" href="#${id}-ring"/>
    <use class="vh-dial-fill" href="#${id}-ring" mask="url(#${id}-progress)"/>
    <path class="vh-dial-shine" d="${arc(168)}"/>
    <circle cx="180" cy="180" r="96" fill="url(#${id}-core)" stroke="#252033" stroke-width="2"/>
    <g class="vh-dial-scale">${ticks}</g>
    <g class="vh-needle"><path class="vh-needle-glow" d="M178 171L180 34L183 171Z"/><path d="M179 167L180 34L181 167Z" fill="#ffc4ff"/></g>
    </svg><strong data-vh-speed>0</strong><span class="vh-unit">km/h</span>
    <div class="vh-gears" aria-label="Sentido de movimento"><span data-vh-position="P">P</span><span data-vh-position="R">R</span><span data-vh-position="N">N</span><span data-vh-position="D">D</span><b class="sr-only" data-vh-gear>N</b></div></div>`;
}

function button(control:string,symbol:string,label:string,key=''){
  return `<button type="button" class="vh-control" data-vcontrol="${control}" aria-label="${e(label)}" title="${e(label)}"><span class="vh-control-symbol">${icon(symbol)}<i></i></span><span class="vh-control-label">${e(label)}</span>${key?`<kbd>${key}</kbd>`:''}</button>`;
}

function metric(name:string,symbol:string,label:string,action?:string){
  const meterLabel=name==='fuel'?'Combustível':name==='engine'?'Integridade do motor':label;
  const content=`${icon(symbol)}<strong data-vh="${name}-percent"></strong><div class="vh-progress"><meter min="0" max="100" value="0" data-vh-meter="${name}" aria-label="${e(meterLabel)}"></meter><i aria-hidden="true"></i></div><span class="vh-metric-label">${e(label)}</span><b data-vh="${name}-state"></b>`;
  return action?`<button type="button" class="vh-metric vh-${name}" data-vcontrol="${action}">${content}</button>`:`<div class="vh-metric vh-${name}">${content}</div>`;
}

export function createVehicleHud(host:HTMLElement,onControl:(action:string)=>void){
  const id=`vehicle-hud-${++nextHudId}`;
  let mountedId='',lastHorse:{id:string;x:number;z:number;at:number}|undefined,horseSpeed=0,powered=false,lastConsumption:number|undefined;
  let elements=new Map<string,HTMLElement>(),controls=new Map<string,HTMLButtonElement>();
  const element=(name:string)=>elements.get(name);
  const text=(name:string,value:string)=>{const node=element(name);if(node&&node.textContent!==value)node.textContent=value;};
  host.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLButtonElement>('[data-vcontrol]');
    if(!target||target.disabled)return;
    onControl(target.dataset.vcontrol!);
    if(event.detail>0)target.blur();
  });

  function build(kind:string){
    const horse=kind==='horse',car=kind==='car';
    host.innerHTML=`<div class="vh-dashboard">${frame(id)}${dial(id)}
      <div class="vh-heading"><span class="vh-name">${icon(horse?'horse':car?'car':'bike')}<b data-vh="name"></b><span class="vh-plate" data-vh="plate"></span></span><span class="vh-seat">${icon('user')}<span data-vh="seat"></span></span></div>
      <div class="vh-metrics">${horse?`${metric('health','heart','Sua vida')}${metric('stamina','sparkles','Seu fôlego')}<div class="vh-horse-stat">${icon('horse')}<span>Montaria</span><b>Cavalo do Tião</b></div>`:`${metric('fuel','fuel','Autonomia')}${metric('engine','engine','Motor','engine')}${metric('body',car?'car':'bike','Condição do Veículo','info')}`}</div>
      <div class="vh-functions">${horse?'<span class="vh-horse-help">WASD · conduzir<br>Shift · empinar / galopar</span>':`${button('headlights','headlight','Faróis','H')}${car?button('wipers','wipers','Limpadores','N'):button('battery','battery','Bateria')}${button('lock','lock','Travas','L')}${button('hazard','hazard','Pisca-alerta','X')}`}</div>
      <div class="vh-signals">${horse?'':`${button('left','arrowLeft','Seta esquerda','Z')}${button('right','arrowRight','Seta direita','C')}`}</div>
      <div class="vh-utility">${horse?button('camera','camera','Câmera','Q'):`${button('ignition','key','Ignição')}${car?button('doors','door','Portas'):button('camera','camera','Câmera','Q')}`}${car?button('camera','camera','Câmera','Q'):''}${button('exit','logOut',horse?'Desmontar':'Sair','E')}</div>
      ${horse?'':'<button type="button" class="vh-refuel" data-vcontrol="refuel" hidden>Abastecer</button>'}
      <span class="vh-passenger" data-vh="passenger" hidden>Você é passageiro. Os comandos ficam com o motorista.</span>
      </div>`;
    elements=new Map(Array.from(host.querySelectorAll<HTMLElement>('[data-vh]'),node=>[node.dataset.vh!,node]));
    elements.set('speed',host.querySelector<HTMLElement>('[data-vh-speed]')!);
    elements.set('gear',host.querySelector<HTMLElement>('[data-vh-gear]')!);
    controls=new Map(Array.from(host.querySelectorAll<HTMLButtonElement>('[data-vcontrol]'),node=>[node.dataset.vcontrol!,node]));
    for(const name of ['fuel','engine','body','health','stamina']){
      const meter=host.querySelector<HTMLMeterElement>(`[data-vh-meter="${name}"]`);
      if(meter)elements.set(`${name}-meter`,meter);
    }
  }

  function control(name:string,label:string,active=false,disabled=false,detail=''){
    const node=controls.get(name);if(!node)return;
    node.disabled=disabled;node.classList.toggle('is-on',active);
    node.setAttribute('aria-pressed',String(active));
    node.setAttribute('aria-label',[label,detail].filter(Boolean).join(' · '));
    const title=[label,detail,node.querySelector('kbd')?.textContent].filter(Boolean).join(' · ');
    if(node.title!==title)node.title=title;
  }

  function setMetric(name:string,value:number,label:string){
    const meter=element(`${name}-meter`) as HTMLMeterElement|undefined;
    if(!meter)return;
    const percent=Math.max(0,Math.min(100,value)),panel=meter.closest<HTMLElement>('.vh-metric')!;
    if(meter.value!==percent)meter.value=percent;
    panel.style.setProperty('--vh-level',`${percent}%`);panel.dataset.condition=condition(percent);delete panel.dataset.unavailable;
    text(`${name}-percent`,`${Math.round(percent)}%`);text(`${name}-state`,label);
  }

  function speed(value:number,longitudinal=value){
    if(!Number.isFinite(value)||!Number.isFinite(longitudinal))return;
    const kmh=Math.round(Math.abs(value)*3.6);
    // No transmission simulation: P = stopped with engine off, N = idle, R/D = signed motion.
    const gear=longitudinal<-.05?'R':longitudinal>.05?'D':Math.abs(value)>.05?'N':powered?'N':'P';
    text('speed',String(kmh));text('gear',gear);
    for(const position of host.querySelectorAll<HTMLElement>('[data-vh-position]')){
      const selected=position.dataset.vhPosition===gear;
      position.classList.toggle('is-selected',selected);
      if(selected)position.setAttribute('aria-current','true');else position.removeAttribute('aria-current');
    }
    host.style.setProperty('--vh-speed',String(Math.min(1,Math.abs(value)*3.6/200)));
    host.style.setProperty('--vh-angle',`${-125+Math.min(200,kmh)/200*250}deg`);
  }

  return {
    speed(value:number|Pick<MotoBody,'speed'|'lateralSpeed'>){speed(typeof value==='number'?value:vehicleSpeed(value),typeof value==='number'?value:value.speed);},
    update(self:PlayerState|undefined,vehicles:Record<string,MotoState>,now=Date.now(),services?:Record<string,FuelServiceState>):boolean {
      const vehicle=self?Object.values(vehicles).find(v=>vehicleSeat(v,self.id)>=0):undefined,horse=isRidingHorse(self?.interactionState),mounted=!!vehicle||horse;
      host.classList.toggle('hidden',!mounted);
      if(!mounted||!self){mountedId='';lastHorse=undefined;lastConsumption=undefined;return false;}
      const car=isCar(vehicle),kind=horse?'horse':car?'car':'moto',identity=`${kind}:${vehicle?.id??self.id}`;
      if(identity!==mountedId){mountedId=identity;lastConsumption=undefined;lastHorse=undefined;horseSpeed=0;build(kind);}
      host.dataset.kind=kind;
      powered=!!vehicle&&vehiclePowered(vehicle);host.classList.toggle('is-powered',powered||horse);
      text('name',horse?'Cavalo':vehicleName(vehicle!.model??'moto-delivery'));
      text('plate',vehicle?.plate??'');element('plate')!.hidden=!vehicle?.plate;
      if(horse){
        text('seat','Montaria');element('passenger')!.hidden=true;
        setMetric('health',self.hp??100,'Vida');setMetric('stamina',self.stamina??100,'Fôlego');
        if(lastHorse?.id===self.id&&now>lastHorse.at){const distance=Math.hypot(self.x-lastHorse.x,self.z-lastHorse.z);horseSpeed=Math.min(9,distance/((now-lastHorse.at)/1000));}
        lastHorse={id:self.id,x:self.x,z:self.z,at:now};speed(horseSpeed);
        return true;
      }
      const v=vehicle!,driver=v.riderId===self.id,seat=vehicleSeat(v,self.id),parts=readVehicleParts(v.model,v.parts),engine=v.engine??MOTO_ENGINE.OFF;
      const fuel=typeof v.fuel==='number'&&Number.isFinite(v.fuel)?Math.max(0,Math.min(100,v.fuel)):undefined;
      const motion=vehicleMotionSpeed(v),actualSpeed=vehicleSpeed(v),lights=v.headlights??0,bits=v.lights??0;
      const raining=host.dataset.raining==='true',wiping=!!(v.wipers||raining)&&powered&&parts.limpadores!>0&&parts.bateria!>0;
      text('seat',`${driver?'Motorista':CAR_SEATS[seat]?.name??'Passageiro'} - ${vehicleOccupants(v).filter(Boolean).length}/${car?4:1}`);
      element('passenger')!.hidden=driver;
      // Same all-part average as the existing car/moto information panels.
      const partList=car?CAR_PARTS:MOTO_PARTS,overall=partList.reduce((sum,p)=>sum+(parts[p.id]??100),0)/partList.length;
      setMetric('engine',parts.motor!,stateLabel(parts.motor!,'Ótimo'));
      setMetric('body',overall,stateLabel(overall,'Excelente'));
      if(fuel!==undefined){
        if(actualSpeed>.05)lastConsumption=vehicleFuelUse(v.model,actualSpeed,!!v.gas,1)/(actualSpeed/1000);
        const range=fuel===0?0:lastConsumption?Math.floor(fuel/lastConsumption):undefined;
        setMetric('fuel',fuel,range===undefined?'— km':`${range.toLocaleString('pt-BR')} km`);
        const fuelPanel=element('fuel-meter')!.closest<HTMLElement>('.vh-metric')!;
        fuelPanel.title=`Combustível: ${(fuel*vehicleTank(v.model)/100).toLocaleString('pt-BR',{maximumFractionDigits:1})} / ${vehicleTank(v.model).toLocaleString('pt-BR')} L. ${range===undefined?'Dirija para estimar a autonomia.':`Autonomia estimada pelo ${actualSpeed>.05?'consumo atual':'último consumo em movimento'}; inclui marcha lenta e aceleração.`}`;
      }else{
        text('fuel-percent','—');text('fuel-state','— km');
        const meter=element('fuel-meter') as HTMLMeterElement,panel=meter.closest<HTMLElement>('.vh-metric')!;
        meter.removeAttribute('value');panel.style.setProperty('--vh-level','0%');panel.dataset.unavailable='true';
        panel.title='Combustível indisponível';
      }
      control('engine',engine===MOTO_ENGINE.CRANKING?'Dando partida':powered?'Desligar motor':'Ligar motor',powered,!driver||engine===MOTO_ENGINE.CRANKING||(engine===MOTO_ENGINE.OFF&&(!v.ignition||fuel===undefined||fuel<=0)),`Integridade: ${Math.round(parts.motor!)}%`);
      control('info','Ver todas as peças e condições',false,false,`Condição do veículo: ${Math.round(overall)}%`);
      control('ignition',v.ignition?'Retirar chave':'Colocar chave',!!v.ignition,!driver||engine!==MOTO_ENGINE.OFF||motion>.05);
      control('lock',v.locked?'Destrancar portas':'Trancar portas',v.locked,!driver);
      control('headlights',lights===2?'Farol alto':lights===1?'Farol baixo':'Faróis apagados',powered&&lights>0&&parts.farol!>0&&parts.bateria!>0,!driver||!powered,`Condição: ${Math.round(parts.farol!)}%`);
      control('wipers',wiping?'Limpadores ligados':'Limpadores desligados',wiping,!driver||!powered||parts.limpadores!<=0,raining&&powered?'Automático · chuva':`Condição: ${Math.round(parts.limpadores??0)}%`);
      control('battery','Bateria',parts.bateria!>0,true,`${Math.round(parts.bateria!)}%`);
      control('hazard','Pisca-alerta',powered&&(bits&(MOTO_LIGHT.LEFT|MOTO_LIGHT.RIGHT))===(MOTO_LIGHT.LEFT|MOTO_LIGHT.RIGHT),!driver||!powered);
      control('left','Seta esquerda',powered&&!!(bits&MOTO_LIGHT.LEFT),!driver||!powered);
      control('right','Seta direita',powered&&!!(bits&MOTO_LIGHT.RIGHT),!driver||!powered);
      control('doors',v.doors?'Portas abertas':'Portas fechadas',!!v.doors,!driver||motion>1.5);
      control('exit','Sair',false,motion>(car?1.5:3),motion>(car?1.5:3)?'Pare para sair':'');
      const busy=vehicleFuelBusy(services,v.id);
      if(busy)for(const [name,button] of controls)if(name!=='info'&&name!=='camera')button.disabled=true;
      controls.get('refuel')!.hidden=busy||!(driver&&atVehicleFuelPump(v)&&engine===MOTO_ENGINE.OFF&&motion<=.05&&(v.fuel??100)<99.999);
      speed(actualSpeed,v.speed);
      return true;
    },
    reset(){host.classList.add('hidden');host.replaceChildren();mountedId='';lastHorse=undefined;lastConsumption=undefined;powered=false;elements.clear();controls.clear();},
  };
}
