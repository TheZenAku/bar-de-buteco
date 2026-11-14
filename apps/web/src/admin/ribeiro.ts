import {RIBEIRO_NAME} from '@bar/shared';
import {e,requestId,uiIcon,type SectionFactory,type WorldSnapshot} from './kit';
import {chartHover} from './charts';
import {summaryTab} from './ribeiro-summary';
import {productionTab} from './ribeiro-production';
import {stockTab} from './ribeiro-stock';
import {teamTab} from './ribeiro-team';
import type {RibeiroHub,RibeiroTab,RibeiroTabFactory} from './ribeiro-kit';
import './ribeiro.css';

const TABS:ReadonlyArray<{id:string;label:string;icon:string;factory:RibeiroTabFactory}>=[
  {id:'summary',label:'Resumo',icon:'dashboard',factory:summaryTab},
  {id:'production',label:'Produção',icon:'wrench',factory:productionTab},
  {id:'stock',label:'Estoque e insumos',icon:'package',factory:stockTab},
  {id:'team',label:'Equipe e folha',icon:'users',factory:teamTab},
];
/** The tab the administration was on: reopening the section goes back to it. */
let lastTab='summary';

/**
 * Administração › Ribeiro: the machine shop (docs/sistemas/ribeiro-usinagem.md), kept apart from the EMPRESA BRASIL on purpose. The world's admin snapshot carries the whole
 * shop (`ribeiro`); a change goes to the room as `admin.ribeiro` with the reason typed at the top, and the snapshot that answers it brings the verdict (`ribeiroResult`).
 */
export const ribeiroSection:SectionFactory=(root,ctx,params)=>{
  let tab=TABS.find(t=>t.id===params.tab)?.id??lastTab,child:RibeiroTab|undefined,world:WorldSnapshot|null=ctx.world(),disposed=false,signature='',pending='',timer=0;
  root.innerHTML=`<div class="rb">
    <div class="rb-head">
      <div class="admin-chips rb-tabs" role="tablist" aria-label="Partes da Ribeiro">${TABS.map(t=>`<button type="button" role="tab" data-rb-tab="${t.id}" aria-pressed="${t.id===tab}">${uiIcon(t.icon)}${e(t.label)}</button>`).join('')}</div>
      <label class="rb-reason">Motivo das alterações<input data-rb-reason maxlength="500" autocomplete="off" placeholder="Obrigatório para alterar algo; vai para o log (mínimo 3 letras)"></label>
    </div>
    <p class="rb-brand"><span class="rb-dot"></span><b>${e(RIBEIRO_NAME)}</b><small>Empresa separada da EMPRESA BRASIL: equipe, estoque e folha próprios.</small></p>
    <div class="rb-panel" data-rb-panel role="tabpanel"></div>
  </div>`;
  const panel=root.querySelector<HTMLElement>('[data-rb-panel]')!,reasonInput=root.querySelector<HTMLInputElement>('[data-rb-reason]')!;
  // The tooltip lives on the section, not on the panel: opening another tab empties the panel.
  const unhover=chartHover(root.querySelector<HTMLElement>('.rb')!);

  const hub:RibeiroHub={
    ctx,
    open:id=>open(id),
    command(payload){
      if(pending){ctx.message('Espere a resposta do pedido anterior.',true);return false;}
      if(!world){ctx.message('O mundo não respondeu ainda: espere alguns segundos e tente de novo.',true);return false;}
      const why=reasonInput.value.trim();
      if(why.length<3){ctx.message('Escreva o motivo lá em cima (pelo menos 3 caracteres): ele vai para o log.',true);reasonInput.focus();return false;}
      const id=requestId();pending=id;ctx.send('admin.ribeiro',{requestId:id,reason:why,...payload});ctx.message('Pedido enviado ao mundo…');
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>{if(pending===id){ctx.requestWorld();timer=window.setTimeout(()=>{if(pending===id){pending='';ctx.message('O mundo não respondeu: confira se a sala está no ar e tente de novo.',true);}},2500);}},3500);
      return true;
    },
  };
  function open(id:string):void {
    const entry=TABS.find(t=>t.id===id)??TABS[0]!;
    child?.destroy?.();child=undefined;panel.innerHTML='';tab=lastTab=entry.id;signature='';
    for(const button of root.querySelectorAll<HTMLElement>('[data-rb-tab]'))button.setAttribute('aria-pressed',String(button.dataset.rbTab===entry.id));
    child=entry.factory(panel,hub);show(true);
  }
  function show(force=false):void {
    if(disposed||!child)return;
    const view=world?.ribeiro;
    if(!view){signature='';if(!panel.querySelector('.rb-wait'))panel.innerHTML=`<p class="admin-loading rb-wait">${world?'O mundo ainda não mandou os dados da Ribeiro (a sala pode estar reiniciando)…':'Abrindo a Ribeiro…'}</p>`;return;}
    panel.querySelector('.rb-wait')?.remove();
    const next=JSON.stringify([view,world!.players.map(p=>[p.id,p.name,p.connected])]);
    if(!force&&next===signature)return;
    signature=next;child.update(view,world!);
  }
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-rb-tab]');
    if(button&&button.dataset.rbTab!==tab){event.stopPropagation();open(button.dataset.rbTab!);}
  };
  root.addEventListener('click',click);
  open(tab);ctx.requestWorld();
  return {
    world(next:WorldSnapshot){
      world=next;
      const result=next.ribeiroResult;
      if(result&&result.requestId===pending){pending='';window.clearTimeout(timer);ctx.message(result.message,!result.ok);}
      show();
    },
    destroy(){disposed=true;window.clearTimeout(timer);unhover();child?.destroy?.();root.removeEventListener('click',click);},
  };
};
