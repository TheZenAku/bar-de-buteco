import {RIBEIRO_MATERIALS,RIBEIRO_MATERIAL_INFO,RIBEIRO_RECIPES,type RibeiroAdminView,type RibeiroMaterial,type WeaponId} from '@bar/shared';
import {badge,card,e,empty,n,redraw,stat,uiIcon,when} from './kit';
import {hBars} from './charts';
import {WEAPON_LIST,canMake,chartPainter,materialName,weaponName,type RibeiroTabFactory} from './ribeiro-kit';

const PURCHASE:Record<string,[string,'gold'|'cyan'|'mint'|'muted'|'red']>={open:['aguardando motorista','gold'],accepted:['a caminho','cyan'],completed:['entregue','mint'],cancelled:['cancelado','muted'],expired:['expirado','red']};

/** Ribeiro › Estoque e insumos: the raw material on the shelves, what it can still make, the finished weapons and the HighCargo requests, with the tools to correct them. */
export const stockTab:RibeiroTabFactory=(root,hub)=>{
  let view:RibeiroAdminView|undefined,destroyed=false;
  const painter=chartPainter(root,()=>view?{
    possible:width=>hBars(WEAPON_LIST.map(weapon=>{const {count,limit}=canMake(weapon,view!.materials);return {label:weaponName(weapon),value:count,text:count?`${n(count)}`:`0 · falta ${materialName(limit)}`,tip:`${weaponName(weapon)} · dá para abrir ${n(count)} ordem(ns) · limita: ${materialName(limit)}`,tone:count===0?'down' as const:count<3?'alt' as const:'up' as const};}),width,'Ordens que a matéria-prima em estoque ainda cobre, por arma',190),
    stock:width=>hBars(WEAPON_LIST.map(weapon=>({label:weaponName(weapon),value:view!.stock[weapon]??0,tone:(view!.stock[weapon]??0)?'alt' as const:'muted' as const})),width,'Armas prontas em estoque por modelo',190),
  }:{});
  const materialOptions=RIBEIRO_MATERIALS.map(material=>`<option value="${material}">${e(materialName(material))}</option>`).join('');
  function render():void {
    if(destroyed||!view)return;
    const v=view,tiles=RIBEIRO_MATERIALS.map(material=>{const need=Math.min(...RIBEIRO_RECIPES.map(r=>r.materials[material]));return stat(materialName(material),n(v.materials[material]),`${RIBEIRO_MATERIAL_INFO[material].unit}(s) · a receita mais simples usa ${need}`,v.materials[material]===0?'down':v.materials[material]<need?'warn':'');}).join('');
    const recipeRows=RIBEIRO_RECIPES.map(recipe=>`<tr><td>${e(weaponName(recipe.weapon))}</td>${RIBEIRO_MATERIALS.map(material=>`<td class="num ${v.materials[material]<recipe.materials[material]?'down':''}">${recipe.materials[material]}</td>`).join('')}</tr>`).join('');
    const purchases=v.purchaseOrders.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Material</th><th class="num">Paletes</th><th class="num">Volumes</th><th>Estado</th><th>Pedido</th><th></th></tr></thead><tbody>
      ${v.purchaseOrders.map(order=>{const [text,tone]=PURCHASE[order.status]??[order.status,'muted' as const];return `<tr><td>${e(materialName(order.material))}</td><td class="num">${n(order.pallets)}</td><td class="num">${n(order.pallets*18)}</td><td>${badge(text,tone)}</td><td>${e(when(order.createdAt))}</td><td class="rb-act">${order.status==='open'?`<button type="button" class="mini-button danger" data-rb-purchase-cancel="${order.id}">Cancelar</button>`:''}</td></tr>`;}).join('')}</tbody></table></div>`:empty('Nenhum pedido de matéria-prima ainda.');
    root.innerHTML=`<div class="rb-page">
      <div class="admin-stats rb-stats" style="--cols:4">${tiles}</div>
      <div class="rb-pair">
        ${card('Quantas ordens o material cobre',`<div class="admin-chart-slot" data-chart="possible"></div><p class="fine-print">Para cada arma, quantas ordens dá para abrir com o que há nas prateleiras agora. Em vermelho, o material que falta; vale o que tem menos de cada insumo.</p>`,{icon:'calculator'})}
        ${card('Armas prontas no estoque',`<div class="admin-chart-slot" data-chart="stock"></div><p class="fine-print">É o que os funcionários retiram no estoque físico da Ribeiro e levam para a mochila.</p>`,{icon:'gun'})}
      </div>
      <div class="rb-pair">
        ${card('Ajustar matéria-prima',`<form class="eco-form" data-keep="rb-material" data-rb-material>
          <div class="eco-row"><label>Material<select name="material" aria-label="Material">${materialOptions}</select></label><label>O que fazer<select name="op" aria-label="O que fazer"><option value="in">Colocar no estoque</option><option value="out">Tirar do estoque</option></select></label></div>
          <label>Quantidade (volumes)<input name="amount" type="number" min="1" max="10000" step="1" required placeholder="18" aria-label="Quantidade"></label>
          <div class="admin-confirm-buttons"><button class="button primary" type="submit">${uiIcon('sliders')}Ajustar material</button></div>
          <p class="fine-print">Um palete que chega pelo HighCargo soma 18 volumes. O estoque nunca fica abaixo de zero.</p></form>`,{icon:'sliders'})}
        ${card('Ajustar armas prontas',`<form class="eco-form" data-keep="rb-weapon" data-rb-weapon>
          <div class="eco-row"><label>Arma<select name="weapon" aria-label="Arma">${WEAPON_LIST.map(weapon=>`<option value="${weapon}">${e(weaponName(weapon))}</option>`).join('')}</select></label><label>O que fazer<select name="op" aria-label="O que fazer"><option value="in">Colocar no estoque</option><option value="out">Tirar do estoque</option></select></label></div>
          <label>Quantidade (unidades)<input name="amount" type="number" min="1" max="1000" step="1" required placeholder="1" aria-label="Quantidade"></label>
          <div class="admin-confirm-buttons"><button class="button primary" type="submit">${uiIcon('sliders')}Ajustar armas</button></div>
          <p class="fine-print">Colocar uma arma aqui a cria do nada; tirar apaga uma unidade que ninguém retirou. Use para corrigir erros, não como produção.</p></form>`,{icon:'gun'})}
      </div>
      ${card('Pedidos de matéria-prima (HighCargo)',`<form class="rb-purchase" data-keep="rb-purchase" data-rb-purchase>
          <label>Material<select name="material" aria-label="Material do pedido">${materialOptions}</select></label>
          <label>Paletes<input name="pallets" type="number" min="1" max="10" step="1" value="1" required aria-label="Paletes"></label>
          <button class="button primary" type="submit">${uiIcon('truck')}Publicar pedido</button></form>
        <p class="fine-print">O pedido aparece no aplicativo HighCargo dos motoristas, com coleta no fornecedor e entrega na doca da Ribeiro. Só pode haver um pedido ativo por material. “Cancelar” vale enquanto nenhum motorista aceitou.</p>${purchases}`,{icon:'truck'})}
      <details class="rb-numbers"><summary>Receitas: matéria-prima por ordem (em vermelho, o que falta no estoque)</summary><div class="admin-scroll"><table class="admin-table"><thead><tr><th>Arma</th>${RIBEIRO_MATERIALS.map(material=>`<th class="num">${e(materialName(material))}</th>`).join('')}</tr></thead><tbody>${recipeRows}</tbody></table></div></details>
    </div>`;
    painter.paint();
  }
  const amountOf=(form:HTMLFormElement):{sign:1|-1;amount:number}|null=>{
    const data=new FormData(form),amount=Math.floor(Number(data.get('amount')));if(!Number.isSafeInteger(amount)||amount<1)return null;
    return {sign:data.get('op')==='out'?-1:1,amount};
  };
  const submit=(event:SubmitEvent)=>{
    const form=event.target as HTMLFormElement;
    if(form.matches('[data-rb-material]')){
      event.preventDefault();const value=amountOf(form);if(!value)return;
      const material=String(new FormData(form).get('material')) as RibeiroMaterial;
      if(value.sign<0&&value.amount>(view?.materials[material]??0)){hub.ctx.message(`O estoque só tem ${n(view?.materials[material]??0)} de ${materialName(material)}.`,true);return;}
      hub.command({op:'material',material,delta:value.sign*value.amount});
    }else if(form.matches('[data-rb-weapon]')){
      event.preventDefault();const value=amountOf(form);if(!value)return;
      const weapon=String(new FormData(form).get('weapon')) as WeaponId;
      if(value.sign<0&&value.amount>(view?.stock[weapon]??0)){hub.ctx.message(`O estoque só tem ${n(view?.stock[weapon]??0)} unidade(s) de ${weaponName(weapon)}.`,true);return;}
      hub.command({op:'stock',weapon,delta:value.sign*value.amount});
    }else if(form.matches('[data-rb-purchase]')){
      event.preventDefault();const data=new FormData(form),pallets=Math.floor(Number(data.get('pallets')));
      if(!Number.isSafeInteger(pallets)||pallets<1||pallets>10){hub.ctx.message('Peça de 1 a 10 paletes.',true);return;}
      hub.command({op:'purchase',material:String(data.get('material')),pallets});
    }
  };
  const click=(event:MouseEvent)=>{
    const cancel=(event.target as HTMLElement).closest<HTMLElement>('[data-rb-purchase-cancel]');
    if(cancel&&confirm('Cancelar este pedido no HighCargo?'))hub.command({op:'purchase.cancel',id:cancel.dataset.rbPurchaseCancel});
  };
  root.addEventListener('submit',submit);root.addEventListener('click',click);
  return {
    update(next){view=next;redraw(root,render);},
    destroy(){destroyed=true;painter.destroy();root.removeEventListener('submit',submit);root.removeEventListener('click',click);},
  };
};
