import {RIBEIRO_RECIPES,RIBEIRO_MATERIAL_INFO,WEAPONS,type RibeiroMaterial,type RibeiroOrder,type RibeiroView} from '@bar/shared';
import {escape as e} from '../api';
import {weaponPicture} from '../weapons/ui/art';
import {opGroups} from './ops';

/** One weapon of one OP with units still waiting at the preparation point. */
export interface QueueRow {key:string;label:string;customer:string;operatorName:string;createdAt:number;weapon:RibeiroOrder['weapon'];waiting:number;total:number;orders:RibeiroOrder[]}

/** What can be chosen at the preparation point: every (OP, weapon) with units waiting, the oldest OP first. */
export function queueRows(view:Pick<RibeiroView,'orders'>|undefined):QueueRow[] {
  const rows:QueueRow[]=[];
  for(const group of opGroups(view?.orders??[]))for(const line of group.lines){
    const orders=line.orders.filter(order=>order.status==='queued');
    if(orders.length)rows.push({key:`${group.key}|${line.weapon}`,label:group.label,customer:group.customer,operatorName:group.operatorName,createdAt:group.createdAt,weapon:line.weapon,waiting:orders.length,total:line.total,orders});
  }
  return rows;
}
const age=(at:number)=>{const minutes=Math.max(0,Math.floor((Date.now()-at)/60_000));return minutes<1?'agora há pouco':minutes<60?`há ${minutes} min`:`há ${Math.floor(minutes/60)} h`;};

/**
 * "Which OP do I make now?": opened at the preparation point before the raw material is taken. It lists the waiting OPs by customer, one
 * row per weapon, with what each unit is made of; choosing a row takes the material of its oldest waiting unit (the room validates that
 * it is still waiting).
 */
export class RibeiroQueuePicker {
  private node?:HTMLElement;private view?:RibeiroView;private onKey?:(event:KeyboardEvent)=>void;
  constructor(private readonly pick:(orderId:string)=>void){}
  get isOpen():boolean {return !!this.node?.isConnected;}
  open(view:RibeiroView):void {this.view=view;if(!this.isOpen){this.node=document.body.appendChild(Object.assign(document.createElement('div'),{className:'rb-game-layer rb-pick-layer'}));this.node.onclick=event=>this.click(event);this.onKey=event=>{if(event.key==='Escape'){event.stopPropagation();this.close();}};window.addEventListener('keydown',this.onKey,true);}this.render();}
  /** The room sent a new state: redraw, and close when nothing is waiting any more. */
  update(view:RibeiroView):void {this.view=view;if(!this.isOpen)return;if(!queueRows(view).length){this.close();return;}this.render();}
  close():void {if(this.onKey)window.removeEventListener('keydown',this.onKey,true);this.onKey=undefined;this.node?.remove();this.node=undefined;}
  private render():void {
    if(!this.node||!this.view)return;
    const rows=queueRows(this.view),waiting=rows.reduce((sum,row)=>sum+row.waiting,0);
    this.node.innerHTML=`<section class="rb-game rb-pick" role="dialog" aria-modal="true" aria-label="Escolher OP"><header><span>RF · PREPARAÇÃO INDUSTRIAL</span><button type="button" data-rbp="close" aria-label="Fechar">×</button></header><div class="rb-game-copy"><small>${waiting} UNIDADE${waiting===1?'':'S'} AGUARDANDO</small><h2>Qual OP produzir?</h2><p>Escolha a OP e a arma: o material de uma unidade é retirado e você a leva até uma máquina de corte.</p></div><div class="rb-pick-list">${rows.map(row=>this.row(row)).join('')||'<p class="rb-empty">Nenhuma OP aguardando preparação.</p>'}</div></section>`;
  }
  private row(row:QueueRow):string {
    const recipe=RIBEIRO_RECIPES.find(item=>item.weapon===row.weapon),weapon=WEAPONS[row.weapon];
    const materials=recipe?Object.entries(recipe.materials).map(([id,quantity])=>`<span>${e(RIBEIRO_MATERIAL_INFO[id as RibeiroMaterial].name)} <b>${quantity}</b></span>`).join(''):'';
    return `<article class="rb-pick-row"><div class="rb-gun">${weaponPicture(row.weapon)}</div><div class="rb-pick-copy"><em>${e(row.label)}${row.customer?` · ${e(row.customer)}`:''}</em><b>${e(weapon.name)}</b><small>${row.waiting} de ${row.total} na fila · aberta por ${e(row.operatorName||'—')} · ${age(row.createdAt)}</small><div class="rb-pick-mats">${materials}</div></div><button class="button primary" type="button" data-rbp="pick" data-id="${e(row.orders[0]!.id)}">Produzir</button></article>`;
  }
  private click(event:MouseEvent):void {
    const button=(event.target as Element).closest<HTMLButtonElement>('[data-rbp]');
    if(!button){if(event.target===this.node)this.close();return;}
    if(button.dataset.rbp==='close'){this.close();return;}
    if(button.dataset.rbp==='pick'&&button.dataset.id){const id=button.dataset.id;this.close();this.pick(id);}
  }
}
