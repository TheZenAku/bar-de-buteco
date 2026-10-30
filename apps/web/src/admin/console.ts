import type {PublicUser} from '@bar/shared';
import {api,ApiError} from '../api';
import {e,lock,uiIcon,type AdminContext,type Section,type SectionFactory,type SectionId,type WorldSnapshot} from './kit';
import {overviewSection} from './overview';
import {playersSection} from './players';
import {reportsSection} from './reports';
import {economySection} from './economy';
import {pricesSection} from './prices';
import {logsSection} from './logs';
import {worldSection} from './world';
import {serverSection} from './server';

/** The administration's categories, in the menu's order. */
const SECTIONS:ReadonlyArray<{id:SectionId;label:string;icon:string;description:string;factory:SectionFactory}>=[
  {id:'overview',label:'Visão geral',icon:'dashboard',description:'O bar agora: quem está, como vai a economia e o que pede atenção.',factory:overviewSection},
  {id:'players',label:'Jogadores',icon:'users',description:'Busque uma conta para ver a ficha completa e ajustar carteira, mochila, skins e acesso.',factory:playersSection},
  {id:'reports',label:'Denúncias',icon:'flag',description:'O que os jogadores denunciaram, para analisar e marcar como resolvido.',factory:reportsSection},
  {id:'economy',label:'Economia',icon:'trendingUp',description:'Moedas em circulação, inflação, de onde as moedas vêm e para onde vão.',factory:economySection},
  {id:'prices',label:'Preços',icon:'tag',description:'Quanto custa cada coisa e quanto o bar paga. As mudanças valem para todos em poucos segundos.',factory:pricesSection},
  {id:'logs',label:'Logs',icon:'scroll',description:'Tudo o que aconteceu, filtrado por tipo, jogador, período ou texto.',factory:logsSection},
  {id:'world',label:'Mundo ao vivo',icon:'activity',description:'A sala neste momento: empregos, pedidos, aparelhos, palco, bots e quem está no bar.',factory:worldSection},
  {id:'server',label:'Servidor',icon:'server',description:'Processos, memória, disco, banco de dados e filas entre a API e o mundo.',factory:serverSection},
];
// The section the administration was on: reopening the window goes back to it.
let lastSection:SectionId='overview';

export interface AdminConsoleHooks {
  user:()=>PublicUser|undefined;
  send:(type:string,payload?:unknown)=>void;
  position:()=>string;
  changedWallet:()=>void;
  denied:()=>void;
}
export function adminConsole(container:HTMLElement,hooks:AdminConsoleHooks){
  let section:Section|undefined,current:SectionId=lastSection,snapshot:WorldSnapshot|null=null,busy=false,disposed=false;
  const user=hooks.user();
  container.innerHTML=`<div class="admin-console">
    <aside class="admin-nav">
      <div class="admin-nav-head"><span class="eyebrow">Administração</span><b>${user?.isOwner?'Conta principal':'Administrador'}</b><small>${e(user?.displayName??'')}</small></div>
      <nav aria-label="Categorias da administração">${SECTIONS.map(s=>`<button type="button" data-admin-nav="${s.id}" aria-current="${s.id===current}">${uiIcon(s.icon)}<span>${s.label}</span>${s.id==='reports'?'<i class="admin-count" hidden></i>':''}</button>`).join('')}</nav>
      <div class="admin-position"><label for="admin-position">${uiIcon('mapPin')}Sua posição</label><input id="admin-position" readonly value="${e(hooks.position())}"><button class="mini-button" data-action="admin-copy-position">${uiIcon('copy')}Copiar</button></div>
    </aside>
    <div class="admin-main">
      <header class="admin-main-head"><div><h3 id="admin-section-title"></h3><p class="admin-section-description"></p></div><p class="admin-feedback" role="status" aria-live="polite"></p></header>
      <div class="admin-section" id="admin-section"></div>
    </div>
  </div>`;
  const root=container.querySelector<HTMLElement>('#admin-section')!,feedback=container.querySelector<HTMLElement>('.admin-feedback')!;
  const message=(text:string,error=false)=>{feedback.textContent=text;feedback.classList.toggle('error',error);};
  const ctx:AdminContext={
    api,user:hooks.user,world:()=>snapshot,requestWorld:()=>hooks.send('admin.world'),send:hooks.send,message,
    go:(id,params)=>open(id,params),
    reports:open=>{const count=container.querySelector<HTMLElement>('.admin-count');if(count){count.hidden=!open;count.textContent=String(open);}},
    async run(job,success,options={}){
      if(busy||disposed)return false;
      busy=true;const unlock=lock(root);message('Aplicando alteração…');
      try{await job();if(disposed)return false;if(options.wallet)hooks.changedWallet();message(success);return true;}
      catch(error){if(disposed)return false;if(error instanceof ApiError&&error.status===403)hooks.denied();message(error instanceof Error?error.message:'Não foi possível concluir a ação.',true);return false;}
      finally{busy=false;unlock();}
    },
  };
  function open(id:SectionId,params:Record<string,string>={}):void {
    const entry=SECTIONS.find(s=>s.id===id)??SECTIONS[0]!;
    section?.destroy?.();section=undefined;busy=false;
    current=lastSection=entry.id;root.innerHTML='';root.setAttribute('aria-busy','false');message('');
    container.querySelector('#admin-section-title')!.textContent=entry.label;
    container.querySelector('.admin-section-description')!.textContent=entry.description;
    for(const button of container.querySelectorAll<HTMLElement>('[data-admin-nav]'))button.setAttribute('aria-current',String(button.dataset.adminNav===entry.id));
    section=entry.factory(root,ctx,params);
    if(snapshot)section.world?.(snapshot);
  }
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-admin-nav]');if(!button)return;
    event.stopPropagation();if(button.dataset.adminNav!==current)open(button.dataset.adminNav as SectionId);
  };
  // The menu answers the arrows like the entry's lists.
  const keydown=(event:KeyboardEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-admin-nav]');if(!button||!['ArrowUp','ArrowDown'].includes(event.key))return;
    const all=[...container.querySelectorAll<HTMLElement>('[data-admin-nav]')],next=all[(all.indexOf(button)+(event.key==='ArrowDown'?1:all.length-1))%all.length]!;
    event.preventDefault();next.focus();next.click();
  };
  container.addEventListener('click',click);container.addEventListener('keydown',keydown);
  // The world's state, kept fresh while the window is open (the room answers admin.world only to administrators).
  const poll=setInterval(()=>{if(!disposed)hooks.send('admin.world');},5000);hooks.send('admin.world');
  void api<{reports:unknown[]}>('/admin/reports?status=open').then(r=>ctx.reports(r.reports.length)).catch(()=>{});
  open(current);
  return {
    world(next:unknown):void {snapshot=next as WorldSnapshot;if(!disposed)section?.world?.(snapshot);},
    destroy():void {disposed=true;clearInterval(poll);section?.destroy?.();container.removeEventListener('click',click);container.removeEventListener('keydown',keydown);},
  };
}
