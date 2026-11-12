import {e,uiIcon,type Section,type SectionFactory,type WorldSnapshot} from './kit';
import {summaryTab} from './economy-summary';
import {vaultTab} from './economy-vault';
import {firmTab} from './economy-firm';
import {companyTab} from './economy-company';
import {levelsSection,pricesSection} from './prices';
import './economy.css';

/**
 * Economia: the one place for the city's money and every value that moves it. Each tab is a section of its own
 * (a file each); this only switches between them, keeps the one in use and tells it about the world's snapshots.
 */
const TABS:ReadonlyArray<{id:string;label:string;icon:string;factory:SectionFactory}>=[
  {id:'summary',label:'Resumo',icon:'dashboard',factory:summaryTab},
  {id:'vault',label:'Cofre da cidade',icon:'landmark',factory:vaultTab},
  {id:'firm',label:'Empresa Brasil',icon:'warehouse',factory:firmTab},
  {id:'company',label:'Donos e caixa',icon:'briefcase',factory:companyTab},
  {id:'prices',label:'Preços',icon:'tag',factory:pricesSection},
  {id:'xp',label:'XP e níveis',icon:'trophy',factory:levelsSection},
];
/** The tab the administration was on: reopening the section goes back to it. */
let lastTab='summary';

export const economySection:SectionFactory=(root,ctx,params)=>{
  let tab=TABS.find(t=>t.id===params.tab)?.id??lastTab,child:Section|undefined,snapshot:WorldSnapshot|null=ctx.world(),disposed=false;
  root.innerHTML=`<div class="eco"><div class="admin-chips eco-tabs" role="tablist" aria-label="Partes da economia">${TABS.map(t=>`<button type="button" role="tab" data-eco-tab="${t.id}" aria-pressed="${t.id===tab}">${uiIcon(t.icon)}${e(t.label)}</button>`).join('')}</div><div class="eco-panel" data-eco-panel role="tabpanel"></div></div>`;
  const panel=root.querySelector<HTMLElement>('[data-eco-panel]')!;
  function open(id:string):void {
    const entry=TABS.find(t=>t.id===id)??TABS[0]!;
    child?.destroy?.();child=undefined;panel.innerHTML='';tab=lastTab=entry.id;ctx.message('');
    for(const button of root.querySelectorAll<HTMLElement>('[data-eco-tab]'))button.setAttribute('aria-pressed',String(button.dataset.ecoTab===entry.id));
    child=entry.factory(panel,ctx,tab===params.tab?params:{});
    if(snapshot)child.world?.(snapshot);
  }
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-eco-tab]');
    if(button&&button.dataset.ecoTab!==tab){event.stopPropagation();open(button.dataset.ecoTab!);}
  };
  root.addEventListener('click',click);
  open(tab);
  return {
    world(next:WorldSnapshot){snapshot=next;if(!disposed)child?.world?.(next);},
    destroy(){disposed=true;child?.destroy?.();root.removeEventListener('click',click);},
  };
};
