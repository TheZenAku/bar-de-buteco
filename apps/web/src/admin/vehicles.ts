import {uiIcon,type Section,type SectionFactory} from './kit';
import {ownedVehiclesSection} from './owned-vehicles';
import {registerVehicleSection} from './register-vehicle';
import {spawnVehiclesSection} from './spawn-vehicles';

type Tab='players'|'register'|'spawn';
let lastTab:Tab='players';
const TABS=[['players','Veículos dos jogadores','users'],['register','Registrar veículo','key'],['spawn','Spawn','plus']] as const;
const factories:Record<Tab,SectionFactory>={players:ownedVehiclesSection,register:registerVehicleSection,spawn:spawnVehiclesSection};

export const vehiclesSection:SectionFactory=(container,ctx,params)=>{
  let current:Tab=params.player?'players':lastTab,active:Section|undefined;
  container.innerHTML=`<div class="admin-subtabs admin-vehicle-tabs" role="tablist" aria-label="Gerenciamento de veículos">${TABS.map(([id,label,icon])=>`<button type="button" role="tab" id="admin-vehicles-${id}" data-vehicle-tab="${id}" aria-controls="admin-vehicle-panel">${uiIcon(icon)}${label}</button>`).join('')}</div><div id="admin-vehicle-panel" role="tabpanel" class="admin-subtab-body"></div>`;
  const root=container.querySelector<HTMLElement>('#admin-vehicle-panel')!;
  function open(tab:Tab):void {
    active?.destroy?.();current=lastTab=tab;root.innerHTML='';root.setAttribute('aria-labelledby',`admin-vehicles-${tab}`);root.toggleAttribute('data-owned-vehicles',tab==='players');
    for(const button of container.querySelectorAll<HTMLElement>('[data-vehicle-tab]')){
      const selected=button.dataset.vehicleTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
    }
    active=factories[tab](root,ctx,params);container.scrollTop=0;const snapshot=ctx.world();if(snapshot)active.world?.(snapshot);
  }
  const click=(event:MouseEvent)=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-vehicle-tab]');if(button&&button.dataset.vehicleTab!==current)open(button.dataset.vehicleTab as Tab);};
  const keydown=(event:KeyboardEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-vehicle-tab]');if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=[...container.querySelectorAll<HTMLElement>('[data-vehicle-tab]')],index=buttons.indexOf(button);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length;
    event.preventDefault();buttons[next]!.focus();buttons[next]!.click();
  };
  container.addEventListener('click',click);container.addEventListener('keydown',keydown);open(current);
  return {world(snapshot){active?.world?.(snapshot);},destroy(){active?.destroy?.();container.removeEventListener('click',click);container.removeEventListener('keydown',keydown);}};
};
