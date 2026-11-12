import {CLEAN_TASKS,DIRT_CLEAN,DIRT_PENDING,type FactoryShipmentView} from '@bar/shared/factory';
import {SHIPMENT_LABEL,ago,badge,card,e,meter,n,reasonField,requestId,uiIcon,type FactoryAdminSnapshot,type SectionFactory,type WorldSnapshot} from './kit';
import {baggingTone,dryerTone,history,label,pallet,processLine,ring,tankPicture,tankTone,dryerPicture,type Tone} from './factory-visuals';
import {followGo} from './overview';
import './factory.css';

const text=(value:unknown)=>e(String(value??'—'));
const num=(value:unknown)=>Number(value)||0;
const jsonDownload=(name:string,value:unknown)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download=name;a.click();URL.revokeObjectURL(a.href);};
const MATERIALS=['MALTE','MIX','PRODUTO'] as const;
const MATERIAL_TONE:Record<string,Tone>={MALTE:'gold',MIX:'cyan',PRODUTO:'mint'};
const TABS=[['overview','Visão geral','dashboard'],['process','Processo','warehouse'],['stock','Estoque','package'],['orders','Ordens e equipe','users'],['dock','Doca e cargas','truck'],['balance','Balanceamento','sliders'],['tools','Ferramentas','wrench']] as const;
type Tab=typeof TABS[number][0];
/** What each balance parameter is called, grouped; the keys are the server's (admin.factory.debug balance-set). */
const BALANCE:ReadonlyArray<{title:string;fields:ReadonlyArray<readonly [string,string,string]>}>=[
  {title:'Receita',fields:[['recipe.waterL','Água','L'],['recipe.targetC','Temperatura alvo','°C'],['recipe.malteBags','Sacos de malte','sacos'],['recipe.mixBags','Sacos de mix','sacos'],['recipe.litresPerKg','Litros por kg','L/kg'],['recipe.yieldMin','Rendimento mínimo','0–1'],['recipe.yieldMax','Rendimento máximo','0–1']]},
  {title:'Tempos e vazões',fields:[['waterFlowLps','Vazão da água','L/s'],['agitatorRpm','Agitador','rpm'],['dissolveS','Dissolver','s'],['homogenizeS','Homogeneizar','s'],['preheatS','Pré-aquecer','s'],['coolS','Resfriar','s'],['dryerFlowLph','Vazão do secador','L/h']]},
  {title:'Ensaque e simulação',fields:[['bagFillS','Encher um saco','s'],['bagKg','Peso do saco','kg'],['bagToleranceKg','Tolerância do peso','kg'],['slotCapacity','Capacidade da vaga','sacos'],['timeScale','Velocidade do tempo','1–60×']]},
];
const ORDER_STATUS:Record<string,string>={open:'aberta',completed:'concluída',done:'concluída',cancelled:'cancelada',canceled:'cancelada',expired:'expirada',ghost:'fantasma'};
const BOARD_RESULT:Record<string,string>={completed:'concluída',cancelled:'cancelada',closed:'encerrada'};
const shortMarker=(marker:string)=>marker.replace(/^Ponto_EB_/,'').replaceAll('_',' ');
const action=(op:string,labelText:string,options:{target?:string|number;value?:number;danger?:boolean;icon?:string}={})=>
  `<button type="button" class="mini-button${options.danger?' danger':''}" data-debug="${op}"${options.target!==undefined?` data-target="${e(String(options.target))}"`:''}${options.value!==undefined?` data-value="${options.value}"`:''}>${options.icon?uiIcon(options.icon):''}${labelText}</button>`;
const field=(key:string,labelText:string,unit:string,value:unknown,attrs='')=>
  `<form class="fx-field" data-balance="${e(key)}"><label for="fx-${e(key)}">${labelText}<small>${e(key)}</small></label><span class="fx-input"><input id="fx-${e(key)}" data-k="bal-${e(key)}" name="value" type="number" step="any" value="${num(value)}" ${attrs}><em>${unit}</em></span><button class="mini-button">Aplicar</button></form>`;
let lastTab:Tab='overview';

/** The factory console: a fixed bar (state, reason, auto refresh) over six tabs. Every change goes to the room, which is the authority. */
export const factorySection:SectionFactory=(root,ctx,params)=>{
  let snapshot:WorldSnapshot|null=ctx.world(),disposed=false,auto=true,tab:Tab=TABS.find(item=>item[0]===params.tab)?.[0]??lastTab,slot='',pressed=false,stale=false,seenAt=0;
  const timer=window.setInterval(()=>{if(auto)ctx.requestWorld();},2000);
  /** The last minutes, for the charts: one point per snapshot. */
  const past={malte:[] as number[],mix:[] as number[],produto:[] as number[],silo:[] as number[],inlet:[] as number[],outlet:[] as number[],bags:[] as number[]};
  const sample=(f:FactoryAdminSnapshot,at:number)=>{
    if(at===seenAt)return;seenAt=at;
    const total=(material:string)=>f.slots.filter(s=>s.material===material).reduce((sum,s)=>sum+s.quantity,0);
    const add=(list:number[],value:number)=>{list.push(value);if(list.length>90)list.shift();};
    add(past.malte,total('MALTE'));add(past.mix,total('MIX'));add(past.produto,total('PRODUTO'));add(past.silo,num(f.dryer.powderKg));add(past.inlet,num(f.dryer.inletC));add(past.outlet,num(f.dryer.outletC));add(past.bags,num(f.bagging.producedBags));
  };

  root.innerHTML=`<div class="fx">
    <div class="fx-head"><div class="fx-bar">
      <div class="fx-status" data-fx-status></div>
      <label class="fx-reason">Motivo das alterações<input data-factory-reason maxlength="500" placeholder="Obrigatório, vai para o log (mín. 3 letras)"></label>
      <button type="button" class="mini-button" data-action="auto" aria-pressed="true"></button>
    </div>
    <div class="admin-chips fx-tabs" role="tablist">${TABS.map(([id,name,icon])=>`<button type="button" role="tab" data-fx-tab="${id}" aria-pressed="${id===tab}">${uiIcon(icon)}${name}</button>`).join('')}</div></div>
    <div class="fx-panel" data-fx-panel role="tabpanel"></div>
  </div>`;
  const panel=root.querySelector<HTMLElement>('[data-fx-panel]')!,status=root.querySelector<HTMLElement>('[data-fx-status]')!,autoButton=root.querySelector<HTMLElement>('[data-action=auto]')!;

  const reason=()=>{const value=root.querySelector<HTMLInputElement>('[data-factory-reason]')?.value.trim()??'';if(value.length<3){ctx.message('Escreva o motivo lá em cima (pelo menos 3 caracteres): ele vai para o log.',true);root.querySelector<HTMLInputElement>('[data-factory-reason]')?.focus();return null;}return value;};
  const sendDebug=(op:string,value?:number,target?:string)=>{const why=reason();if(!why)return;ctx.send('admin.factory.debug',{requestId:requestId(),op,value,target,reason:why});ctx.message(`Comando ${op} enviado.`);};

  /** The production board (OPs) and the plant's dirt: what is on, what is offered, and the tools to unstick it. */
  const productionCard=(f:FactoryAdminSnapshot):string=>{
    const board=f.board,dirt=f.dirt;
    if(!board&&!dirt)return '';
    const active=board?.active,recipe=(o:{batches:number;malteBags:number;mixBags:number})=>`${o.batches} lote(s) · ${o.malteBags} MALTE + ${o.mixBags} MIX por lote`;
    const order=active?`<div class="fx-op"><h5>${text(active.name)} ${badge(active.status==='running'?'em andamento':'aprovada, esperando iniciar',active.status==='running'?'magenta':'gold')}</h5><p>${recipe(active)}</p>
      <dl><dt>Lotes iniciados</dt><dd>${active.batchesStarted}/${active.batches}</dd><dt>Lotes secos</dt><dd>${active.batchesDone}</dd><dt>Sacos ensacados</dt><dd>${active.bags}</dd><dt>Aprovada por</dt><dd>${text(active.approvedByName||'—')} ${active.approvedAt?ago(active.approvedAt):''}</dd></dl>${meter(active.batchesDone/Math.max(1,active.batches),'Lotes secos da ordem')}</div>`
      :`<p class="admin-empty">Nenhuma ordem de produção: a fábrica não produz até o gerente aprovar uma.</p>`;
    const offers=!active&&board?.offers.length?`<h5>Opções sorteadas por ${text(board.offersBy||'—')} (${ago(board.offersAt)})</h5><ul class="fx-people">${board.offers.map(o=>`<li><b>${text(o.name)}</b><span>${recipe(o)}</span></li>`).join('')}</ul>`:'';
    const history=board?.history.length?`<h5>Últimas ordens</h5><ul class="fx-people">${[...board.history].reverse().slice(0,5).map(h=>`<li><b>${text(h.name)}</b>${badge(BOARD_RESULT[h.result]??h.result,h.result==='completed'?'mint':'muted')}<span>${h.batchesDone}/${h.batches} lotes · ${h.bags} sacos</span><small>${text(h.by)} · ${ago(h.at)}</small></li>`).join('')}</ul>`:'';
    const levels=dirt?CLEAN_TASKS.map(task=>{const level=dirt.levels[task.id]??0;return `<li class="fx-dirt"><b>${text(task.label)}</b>${meter(level,`Sujeira de ${task.label}`)}<span>${level<DIRT_CLEAN?'limpo':`${Math.round(level*100)}%`}</span>${level>=DIRT_PENDING?badge('pendente','gold'):''}</li>`;}).join(''):'';
    const dirtHtml=dirt?`<h5>Sujeira ${dirt.required?badge('limpeza obrigatória','red'):badge('livre','mint')}</h5><ul class="fx-people">${levels}</ul>`:'';
    const buttons=`<div class="fx-actions"><button type="button" class="mini-button" data-board="cancel" ${active?.status==='approved'?'':'disabled'}>Cancelar OP</button><button type="button" class="mini-button danger" data-board="close" ${active?'':'disabled'}>Encerrar OP</button><button type="button" class="mini-button" data-board="clean">${uiIcon('drop')}Limpar tudo</button></div>`;
    return card('Ordem de produção e limpeza',`<div class="fx-board">${order}${offers}${history}${dirtHtml}</div>${buttons}<p class="fine-print">Quem cria as opções é o dono da empresa e quem escolhe é o gerente (Perfil › Gerenciar empresa). Estas ferramentas desempacam: “Cancelar” só vale para ordem aprovada; “Encerrar” fecha a ordem em andamento sem deixar a fábrica suja; “Limpar tudo” zera a sujeira e lava os tanques. O motivo vai na barra de cima.</p>`,{icon:'clipboard'});
  };

  /* ── Tabs ─────────────────────────────────────────────────────────────── */
  const views:Record<Tab,(f:FactoryAdminSnapshot)=>string>={
    overview(f){
      const capacity=(material:string)=>f.slots.filter(s=>s.material===material).reduce((sum,s)=>sum+s.capacity,0),total=(material:string)=>f.slots.filter(s=>s.material===material).reduce((sum,s)=>sum+s.quantity,0);
      const rings=MATERIALS.map(material=>ring(total(material)/Math.max(1,capacity(material)),`${total(material)}`,`${material[0]}${material.slice(1).toLowerCase()} · de ${capacity(material)} sacos`,MATERIAL_TONE[material]!)).join('')
        +ring(num(f.bagging.palletBags)/18,`${num(f.bagging.palletBags)}/18`,'Palete atual','magenta')
        +ring(num(f.bagging.emptyBags)/100,`${num(f.bagging.emptyBags)}`,'Sacos vazios','cyan');
      const alarms=[...f.alarms].reverse();
      return `${card('Linha de produção',processLine(f),{icon:'warehouse',className:'fx-line-card'})}
        <div class="fx-rings">${rings}</div>
        <div class="admin-grid">
          ${card('Estoque nos últimos minutos',history([{name:'Malte',tone:'gold',values:past.malte},{name:'Mix',tone:'cyan',values:past.mix},{name:'Produto',tone:'mint',values:past.produto}],{unit:' sacos'}),{icon:'package'})}
          ${card('Secador',history([{name:'Entrada',tone:'red',values:past.inlet},{name:'Saída',tone:'gold',values:past.outlet}],{unit:'°C',max:250}),{icon:'activity'})}
        </div>
        ${card(`Alarmes e eventos · ${alarms.filter(a=>!a.acknowledged).length} sem reconhecer`,alarms.length?`<ul class="fx-alarms">${alarms.map(a=>{const tone:Tone=a.severity==='critical'||a.severity==='alarm'?'red':a.severity==='warning'?'gold':'cyan';return `<li class="${tone}${a.acknowledged?' done':''}">${badge(text(a.severity),tone)}<b>${text(a.source)}</b><span>${text(a.text)}</span><small>${a.at?ago(Number(a.at)):''}${a.acknowledged?' · reconhecido':''}</small></li>`;}).join('')}</ul>`:'<p class="admin-empty">Nenhum alarme. Tudo calmo.</p>',{icon:'flag'})}`;
    },
    process(f){
      const recipe=f.balance.recipe as Record<string,unknown>|undefined,recipeL=num(recipe?.waterL)||1200,target=num(recipe?.targetC)||65;
      const tanks=f.tanks.map(tank=>{const penalties=(tank.penalties as string[]|undefined)??[];return `<article class="fx-unit">
        <header><h5>TQ-${100+num(tank.id)}</h5>${badge(text(label(tank.state)),tankTone(String(tank.state)))}</header>
        <div class="fx-unit-body">${tankPicture(tank,recipeL,target)}<dl>
          <dt>Água</dt><dd>${n(num(tank.waterL))}/${n(recipeL)} L</dd><dt>Temp.</dt><dd>${n(num(tank.temperatureC),1)}/${n(target)} °C</dd>
          <dt>Insumos</dt><dd>${num(tank.malteBags)} M · ${num(tank.mixBags)} X</dd><dt>Agitador</dt><dd>${n(num(tank.agitatorRpm))} rpm</dd>
          <dt>Tampa</dt><dd>${tank.lidOpen?'aberta':'fechada'}</dd><dt>Qualid.</dt><dd>${n(num(tank.quality))}%</dd></dl></div>
        ${penalties.length?`<p class="fx-penalty">${penalties.map(p=>badge(text(p),'gold')).join(' ')}</p>`:''}
        <div class="fx-actions">${action('tank-fill','Encher',{target:tank.id as number})}${action('tank-ready','Pronto',{target:tank.id as number})}${action('tank-grumps','Grumos',{target:tank.id as number})}${action('tank-dirty','Sujo',{target:tank.id as number})}</div></article>`;}).join('');
      return `<div class="fx-units">${tanks}</div>
        <div class="admin-grid">
          <article class="fx-unit"><header><h5>Secador</h5>${badge(text(label(f.dryer.state)),dryerTone(String(f.dryer.state)))}</header>
            <div class="fx-unit-body">${dryerPicture(f.dryer)}<dl><dt>Fluxo</dt><dd>${n(num(f.dryer.flowLph))} L/h</dd><dt>Silo</dt><dd>${n(num(f.dryer.powderKg))} kg</dd><dt>Tanque de origem</dt><dd>${f.dryer.sourceTank?`TQ-${100+num(f.dryer.sourceTank)}`:'—'}</dd><dt>Falha</dt><dd>${f.dryer.fault?badge(text(f.dryer.fault),'red'):'nenhuma'}</dd><dt>Etapa</dt><dd>${n(num(f.dryer.stepS))} s</dd></dl></div>
            <div class="fx-actions">${action('dryer-ready','Pronto')}${action('dryer-producing','Produzindo')}${action('dryer-resolve','Resolver falha',{icon:'check'})}</div>
            <div class="fx-actions"><span class="fx-actions-title">Falhas de teste</span>${action('fault-dryer','Bico entupido')}${action('fault-burner','Queimador')}${action('fault-fan','Exaustor')}</div>
            <form class="fx-inline" data-silo><label>Silo (kg)<input data-k="silo" name="value" type="number" min="0" value="${num(f.dryer.powderKg)}"></label><button class="mini-button">Ajustar</button></form></article>
          <article class="fx-unit"><header><h5>Ensaque</h5>${badge(text(label(f.bagging.state)),baggingTone(String(f.bagging.state)))}</header>
            <div class="fx-unit-body fx-bag">${pallet(num(f.bagging.palletBags))}<dl><dt>Balança</dt><dd>${n(num(f.bagging.weightKg),1)} kg</dd><dt>Palete</dt><dd>${num(f.bagging.palletBags)}/18</dd><dt>Sacos vazios</dt><dd>${num(f.bagging.emptyBags)}</dd><dt>Produzidos</dt><dd>${num(f.bagging.producedBags)}</dd><dt>Recusados</dt><dd>${num(f.bagging.rejectedBags)}</dd><dt>Lote</dt><dd>${text(f.bagging.lot||'—')}</dd></dl></div>
            <div class="fx-actions">${action('bag-cycle','Avançar etapa')}${action('bag-reset','Zerar ensaque')}${action('empty-bags','+100 sacos vazios',{value:100})}</div>
            <form class="fx-inline" data-bags><label>Sacos vazios<input data-k="bags" name="value" type="number" min="0" value="${num(f.bagging.emptyBags)}"></label><button class="mini-button">Ajustar</button></form></article>
        </div>`;
    },
    stock(f){
      const total=(material:string)=>f.slots.filter(s=>s.material===material).reduce((sum,s)=>sum+s.quantity,0);
      const selected=f.slots.find(s=>s.marker===slot)??f.slots[0];
      const groups=MATERIALS.map(material=>{const list=f.slots.filter(s=>s.material===material);return `<section class="fx-group"><h5>${badge(material,MATERIAL_TONE[material]!)} ${total(material)} de ${list.reduce((s,x)=>s+x.capacity,0)} sacos · ${list.length} vagas</h5><div class="fx-slots">${list.map(s=>{const ratio=s.quantity/Math.max(1,s.capacity);return `<button type="button" class="fx-slot ${MATERIAL_TONE[material]} ${s.quantity===0?'empty':ratio>=1?'full':''}" data-slot="${e(s.marker)}" aria-pressed="${s.marker===selected?.marker}" title="${e(s.marker)}${s.reservedBy?` · reservada por ${e(s.reservedBy)}`:''}"><b>${s.quantity}</b><small>/${s.capacity}</small><i style="--fill:${Math.round(ratio*100)}%"></i><span>${e(shortMarker(s.marker))}</span>${s.batchId?`<em>${e(s.batchId.slice(-4))}</em>`:''}${s.reservedBy?'<u>reservada</u>':''}</button>`;}).join('')}</div></section>`;}).join('');
      const editor=selected?`<aside class="fx-editor"><h5>${e(shortMarker(selected.marker))}</h5><p>${badge(selected.material,MATERIAL_TONE[selected.material]!)} ${selected.quantity}/${selected.capacity} sacos · nível ${n(selected.levelM,2)} m</p>
        ${selected.batchId?`<p>Lote <b>${e(selected.batchId)}</b></p>`:''}${selected.reservedBy?`<p>Reservada por <b>${e(selected.reservedBy)}</b></p>`:''}
        <form class="fx-inline" data-stock="${e(selected.marker)}"><label>Quantidade<input data-k="stock-${e(selected.marker)}" name="quantity" type="number" min="0" max="${selected.capacity}" value="${selected.quantity}"></label><button class="mini-button">Aplicar</button></form>
        <div class="fx-actions"><button type="button" class="mini-button" data-stock-quick="${e(selected.marker)}" data-quantity="${selected.capacity}">Encher</button><button type="button" class="mini-button" data-stock-quick="${e(selected.marker)}" data-quantity="0">Esvaziar</button></div></aside>`:'';
      const lots=f.slots.filter(s=>s.batchId);
      return `<div class="fx-toolbar"><span>Toque numa vaga para editar.</span>${action('seed-full','Encher tudo')}${action('seed-empty','Apagar tudo',{danger:true})}${action('empty-bags','100 sacos vazios',{value:100})}</div>
        <div class="fx-stock"><div>${groups}</div>${editor}</div>
        ${card('Lotes e rastreabilidade',lots.length?`<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Lote</th><th>Vaga</th><th class="num">Sacos</th><th></th></tr></thead><tbody>${lots.map(s=>`<tr><td>${e(s.batchId)}</td><td>${e(shortMarker(s.marker))}</td><td class="num">${s.quantity}</td><td class="fx-row-actions">${action('lot-approve','Aprovar',{target:s.batchId})}${action('lot-reject','Reprovar',{target:s.batchId,danger:true})}</td></tr>`).join('')}</tbody></table></div>`:'<p class="admin-empty">Nenhum lote registrado.</p>',{icon:'scroll'})}`;
    },
    orders(f){
      const orders=f.orders??[],operators=f.operators??[],equipment=Object.entries(f.equipment??{});
      const order=(o:Record<string,unknown>)=>`<tr><td>${o.kind==='sale'?badge('venda','mint'):badge('compra','cyan')}</td><td>${text(o.material)}</td><td class="num">${text(o.pallets)} ${Number(o.pallets)===1?'palete':'paletes'}</td><td>${badge(text(ORDER_STATUS[String(o.status)]??o.status),String(o.status)==='open'?'magenta':'muted')}</td><td class="fx-row-actions"><button class="mini-button" data-order="ghost" data-id="${text(o.id)}">Fantasma</button><button class="mini-button" data-order="complete" data-id="${text(o.id)}">Concluir</button><button class="mini-button" data-order="cancel" data-id="${text(o.id)}">Cancelar</button><button class="mini-button" data-order="expire" data-id="${text(o.id)}">Expirar</button></td></tr>`;
      return `${productionCard(f)}<div class="admin-grid">
        ${card('Nova ordem',`<form class="fx-inline wide" data-order-create><label>Tipo<select name="kind" data-k="o-kind"><option value="purchase">Coleta de matéria-prima</option></select></label><label>Material<select name="material" data-k="o-mat"><option>MALTE</option><option>MIX</option><option>PRODUTO</option></select></label><label>Paletes<input data-k="o-pal" name="pallets" type="number" min="1" max="25" value="1"></label><label>Preço<input data-k="o-price" name="price" type="number" min="0" value="0"></label><button class="mini-button">Criar</button></form>`,{icon:'tag'})}
        ${card('Pessoas e expediente',`<form class="fx-inline wide" data-employment><label>Jogador<input data-k="e-player" name="player" required placeholder="Nome ou id"></label><label>Ação<select name="action" data-k="e-action"><option value="admitir">Admitir</option><option value="demitir">Demitir</option><option value="cooldown 0">Zerar cooldown</option><option value="expediente on">Entrar em expediente</option><option value="expediente off">Sair do expediente</option></select></label><button class="mini-button">Aplicar</button></form><p class="fine-print">Usa o comando administrativo do servidor e entra no log geral.</p>`,{icon:'users'})}
      </div>
      ${card(`Ordens · ${orders.length}`,orders.length?`<div class="admin-scroll"><table class="admin-table"><tbody>${orders.map(order).join('')}</tbody></table></div>`:'<p class="admin-empty">Sem ordens abertas.</p>',{icon:'scroll'})}
      <div class="admin-grid">
        ${card(`Em serviço · ${f.activeOperators}`,operators.length?`<ul class="fx-people">${operators.map(w=>`<li><b>${e(w.name)}</b><span>${e(w.station||'sem posto')}</span>${badge(w.ppe?'EPI ok':'sem EPI',w.ppe?'mint':'gold')}${w.carrying?badge(`carrega ${e(w.carrying)}`,'cyan'):''}<small>${w.since?ago(Number(w.since)):''}</small></li>`).join('')}</ul>`:'<p class="admin-empty">Ninguém em serviço: a simulação fica pausada.</p>',{icon:'users'})}
        ${card('Equipamentos',`${equipment.length?`<ul class="fx-people">${equipment.map(([name,item])=>`<li><b>${e(name)}</b>${badge(e(item.state),item.reservedBy?'gold':'muted')}<span>${n(item.hours,1)} h</span>${item.reservedBy?`<small>${e(item.reservedBy)}</small>`:''}</li>`).join('')}</ul>`:'<p class="admin-empty">Sem equipamentos listados.</p>'}<div class="fx-actions">${action('release-reservations','Liberar reservas')}</div>`,{icon:'wrench'})}
      </div>`;
    },

    dock(f){
      const trips=f.shipments??[],trucks=f.dock??[],active=trips.filter(t=>['loaded','in_transit','to_supplier','returning'].includes(t.status)).length;
      const trip=(t:FactoryShipmentView)=>{
        const live=['loaded','in_transit','to_supplier','returning'].includes(t.status);
        return `<tr><td>${t.kind==='sale'?badge('venda','mint'):badge('coleta','cyan')}</td><td>${e(t.plate)}</td><td>${e(t.driverName||t.driverId.slice(0,6))}</td><td>${t.pallets} ${t.material==='PRODUTO'?'de produto':e(t.material)}</td>
          <td>${badge(text(SHIPMENT_LABEL[t.status]??t.status),live?'magenta':t.status==='delivered'?'mint':'muted')}</td><td>${e(t.destLabel||'—')}</td>
          <td class="num">${t.gross?n(t.gross):'—'}</td><td class="num">${t.freight?n(t.freight):'—'}</td><td>${ago(Date.parse(t.createdAt))}</td>
          <td class="fx-row-actions">${t.status==='loaded'?`<button type="button" class="mini-button" data-ship="depart" data-id="${e(t.id)}">Liberar saída</button>`:''}${t.status==='in_transit'||t.status==='to_supplier'?`<button type="button" class="mini-button" data-ship="deliver" data-id="${e(t.id)}">Forçar chegada</button>`:''}${live?`<button type="button" class="mini-button danger" data-ship="cancel" data-id="${e(t.id)}">Cancelar</button>`:''}</td></tr>`;
      };
      return `<p class="fx-pointer">${uiIcon('coins')}Preço do palete, imposto, frete, cofre da cidade e os livros ficam em <button type="button" class="text-button admin-go" data-admin-go="economy" data-go-tab="firm">Economia › Empresa Brasil ${uiIcon('chevronRight')}</button>; donos, senhas e o saldo da empresa em <button type="button" class="text-button admin-go" data-admin-go="economy" data-go-tab="company">Economia › Donos e caixa ${uiIcon('chevronRight')}</button></p>
        ${card(`Caminhões na doca · ${trucks.length}`,trucks.length?`<ul class="fx-people">${trucks.map(truck=>`<li><b>${e(truck.plate||'Caminhão do bar')}</b><span>${e(truck.ownerName||'sem dono')}${truck.driverId?` · dirigido por ${e((snapshot?.players??[]).find(player=>player.id===truck.driverId)?.name??truck.driverId)}`:''}</span></li>`).join('')}</ul>`:'<p class="admin-empty">Nenhum caminhão estacionado na doca.</p>',{icon:'truck'})}
        ${card(`Cargas · ${active} em andamento · ${trips.length} listadas`,trips.length?`<div class="admin-scroll fx-trips-scroll"><table class="admin-table fx-trips"><thead><tr><th></th><th>Placa</th><th>Motorista</th><th>Carga</th><th>Situação</th><th>Destino</th><th class="num">Venda</th><th class="num">Frete</th><th>Criada</th><th></th></tr></thead><tbody>${trips.map(trip).join('')}</tbody></table></div>`:'<p class="admin-empty">Nenhuma carga ainda.</p>',{icon:'truck'})}`;
    },
    balance(f){
      const balance=f.balance as Record<string,unknown>,recipe=(balance.recipe??{}) as Record<string,unknown>;
      const read=(key:string)=>key.startsWith('recipe.')?recipe[key.slice(7)]:balance[key];
      return `<div class="admin-grid fx-balance">${BALANCE.map(group=>card(group.title,`<div class="fx-fields">${group.fields.map(([key,name,unit])=>field(key,name,unit,read(key))).join('')}</div>`)).join('')}</div>
        <div class="fx-toolbar"><span>O servidor valida de novo cada valor. Aplica um por vez.</span>${action('balance-reset','Restaurar padrão',{danger:true})}</div>`;
    },
    tools(f){
      const markers=f.markers??[];
      return `<div class="admin-grid">
        ${card('Simulação e testes',`<div class="fx-actions">${action('auto-cycle','Rodar ciclo completo',{icon:'activity'})}${action('seed-full','Galpão cheio')}${action('seed-empty','Galpão vazio',{danger:true})}${action('fault-dryer','Semear falha')}</div><p class="fine-print">O ciclo completo roda sozinho: água, dosagem, secagem, ensaque e paletização.</p>`,{icon:'activity'})}
        ${card('Segurança',`<div class="fx-actions">${action('emergency','Parada de emergência',{danger:true})}${action('rearm','Rearmar')}${action('release-reservations','Liberar reservas')}</div><p class="fine-print">Emergência ${f.emergency?badge('ligada','red'):badge('desligada','mint')}</p>`,{icon:'flag'})}
      </div>
      ${card(`Marcadores · ${markers.length}`,`<div class="fx-toolbar flush">${action('markers-toggle','Mostrar marcadores no mapa')}</div><div class="admin-scroll fx-markers"><table class="admin-table"><thead><tr><th>Marcador</th><th>X, Y, Z</th><th></th></tr></thead><tbody>${markers.map(m=>`<tr><td>${e(shortMarker(m.name))}</td><td class="num">${m.xyz.map(v=>n(v,2)).join(', ')}</td><td class="fx-row-actions"><button class="mini-button" data-marker-copy="${e(m.xyz.join(','))}">Copiar</button>${action('teleport','Ir até',{target:m.name})}</td></tr>`).join('')||'<tr><td colspan="3">Sem marcadores.</td></tr>'}</tbody></table></div>`,{icon:'mapPin'})}
      <div class="admin-grid">
        ${card('Estado e eventos',`<div class="fx-actions"><button class="mini-button" data-action="copy">${uiIcon('copy')}Copiar estado</button><button class="mini-button" data-action="download">Baixar estado</button><button class="mini-button" data-action="events">Exportar eventos</button></div><pre class="admin-json fx-json">${e(JSON.stringify(f,null,2))}</pre>`,{icon:'server'})}
        <div>
          ${card('Comandos de chat',`<p class="fx-cmd"><code>/fabrica estado</code><code>/fabrica estoque &lt;tipo&gt; &lt;n&gt;</code><code>/fabrica falha &lt;tipo&gt;</code><code>/fabrica tempo &lt;x&gt;</code><code>/fabrica reset</code><code>/emprego &lt;jogador&gt; &lt;admitir|demitir|expediente on|expediente off|cooldown 0&gt;</code></p><p class="fine-print">Só administradores; a resposta é particular e vai para o log.</p>`,{icon:'scroll'})}
          ${card('Zona de perigo',`<form data-reset class="fx-danger">${reasonField('Motivo do reset','Registrado no log')}<label>Digite RESETAR para confirmar<input name="confirm" required pattern="RESETAR" autocomplete="off"></label><button class="mini-button danger">Resetar a fábrica inteira</button></form>`,{icon:'flag',className:'fx-danger-card'})}
        </div>
      </div>`;
    },
  };

  /* ── Drawing: the bar every time, the tab unless somebody is using it ── */
  const dirty=()=>{
    const kept=new Map<string,string>();
    for(const control of panel.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-k]')){
      const changed=control instanceof HTMLSelectElement?control.selectedIndex!==Math.max(0,[...control.options].findIndex(o=>o.defaultSelected)):control.value!==control.defaultValue;
      if(changed)kept.set(control.dataset.k!,control.value);
    }
    return kept;
  };
  const statusHtml=(f:FactoryAdminSnapshot)=>{
    const state:[Tone,string]=f.emergency?['red','Emergência']:f.pausedWithoutOperator?['gold','Pausada: sem operador']:f.started?['mint','Em operação']:['muted','Parada'];
    return `<span class="fx-pill ${state[0]}"><i></i>${state[1]}</span><span class="fx-meta"><b>${f.activeOperators}</b> em serviço · rev. <b>${f.revision}</b> · ${f.markerCount}/48 marcadores</span>`;
  };
  const draw=()=>{
    if(disposed)return;const f=snapshot?.factory;
    autoButton.setAttribute('aria-pressed',String(auto));autoButton.textContent=auto?'Ao vivo: ligado':'Ao vivo: pausado';
    if(!f){panel.innerHTML='<p class="admin-loading">Carregando a fábrica…</p>';status.innerHTML='';return;}
    sample(f,snapshot!.at);status.innerHTML=statusHtml(f);
    const active=document.activeElement;
    if(pressed||(active&&panel.contains(active)&&/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName))){stale=true;return;}
    stale=false;const kept=dirty();panel.innerHTML=views[tab](f);
    for(const control of panel.querySelectorAll<HTMLInputElement>('[data-k]'))if(kept.has(control.dataset.k!))control.value=kept.get(control.dataset.k!)!;
  };

  /* ── Events ───────────────────────────────────────────────────────────── */
  const click=async(event:MouseEvent)=>{
    if(followGo(event.target as HTMLElement,ctx.go))return;
    const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(!target)return;
    if(target.dataset.fxTab){tab=lastTab=target.dataset.fxTab as Tab;for(const b of root.querySelectorAll<HTMLElement>('[data-fx-tab]'))b.setAttribute('aria-pressed',String(b===target));stale=true;(document.activeElement as HTMLElement|null)?.blur();draw();return;}
    if(target.dataset.slot){slot=target.dataset.slot;stale=false;(document.activeElement as HTMLElement|null)?.blur();draw();return;}
    const f=snapshot?.factory;if(!f)return;
    if(target.dataset.action==='auto'){auto=!auto;draw();return;}
    if(target.dataset.action==='copy'){await navigator.clipboard.writeText(JSON.stringify(f,null,2));ctx.message('Estado copiado.');return;}
    if(target.dataset.action==='download'){jsonDownload('fabrica-estado.json',f);return;}
    if(target.dataset.action==='events'){jsonDownload('fabrica-eventos.json',f.alarms);return;}
    if(target.dataset.markerCopy){await navigator.clipboard.writeText(target.dataset.markerCopy);ctx.message('Coordenada copiada.');return;}
    if(target.dataset.stockQuick){const why=reason();if(!why)return;const found=f.slots.find(item=>item.marker===target.dataset.stockQuick);ctx.send('admin.factory.stock',{requestId:requestId(),marker:target.dataset.stockQuick,material:found?.material,quantity:Number(target.dataset.quantity),reason:why});return;}
    if(target.dataset.debug){
      if(target.dataset.debug==='seed-empty'&&!confirm('Apagar todo o estoque da fábrica?'))return;
      if(target.dataset.debug==='emergency'&&!confirm('Acionar a parada de emergência?'))return;
      sendDebug(target.dataset.debug,target.dataset.value!==undefined&&Number.isFinite(Number(target.dataset.value))?Number(target.dataset.value):undefined,target.dataset.target);return;
    }
    if(target.dataset.board){
      const op=target.dataset.board,why=reason();if(!why)return;
      const sure:Record<string,string>={cancel:'Cancelar a ordem de produção aprovada?',close:'Encerrar a ordem em andamento agora, sem passar pela limpeza?',clean:'Limpar a fábrica inteira (zera a sujeira e lava os tanques)?'};
      if(!confirm(sure[op]??'Confirmar?'))return;
      ctx.send('admin.factory.board',{requestId:requestId(),op,reason:why});ctx.message('Pedido enviado ao mundo…');return;
    }
    if(target.dataset.order){const why=reason();if(!why)return;ctx.send('admin.factory.order',{requestId:requestId(),op:target.dataset.order,id:target.dataset.id,reason:why});return;}
    if(target.dataset.ship){
      const why=reason();if(!why)return;
      if(target.dataset.ship==='cancel'&&!confirm('Cancelar essa carga? A carga no baú sai; o que já foi pago não volta.'))return;
      ctx.send('admin.factory.shipment',{requestId:requestId(),op:target.dataset.ship,id:target.dataset.id,reason:why});return;
    }
  };
  const submit=(event:SubmitEvent)=>{
    const form=(event.target as HTMLElement).closest<HTMLFormElement>('form');if(!form)return;event.preventDefault();
    const data=new FormData(form);
    if(form.dataset.reset!==undefined){ctx.send('admin.factory.reset',{requestId:requestId(),reason:String(data.get('reason')??'').trim(),confirm:String(data.get('confirm')??'')});return;}
    const why=reason();if(!why)return;
    if(form.dataset.stock){const found=snapshot?.factory?.slots.find(item=>item.marker===form.dataset.stock);ctx.send('admin.factory.stock',{requestId:requestId(),marker:form.dataset.stock,material:found?.material,quantity:Number(data.get('quantity')),reason:why});}
    else if(form.dataset.orderCreate!==undefined)ctx.send('admin.factory.order',{requestId:requestId(),op:'create',kind:String(data.get('kind')),material:String(data.get('material')),pallets:Number(data.get('pallets')),price:Number(data.get('price')),reason:why});
    else if(form.dataset.balance)sendDebug('balance-set',Number(data.get('value')),form.dataset.balance);
    else if(form.dataset.silo!==undefined)sendDebug('silo',Number(data.get('value')));
    else if(form.dataset.bags!==undefined)sendDebug('empty-bags',Number(data.get('value')));
    else if(form.dataset.employment!==undefined)ctx.send('chat.send',{text:`/emprego ${String(data.get('player')).trim()} ${String(data.get('action'))}`});
  };
  // A redraw between pressing and releasing would swallow the click: wait for the release.
  const down=()=>{pressed=true;};
  const up=()=>{pressed=false;if(stale)window.setTimeout(draw,0);};
  const focusOut=()=>{if(stale)window.setTimeout(draw,0);};
  root.addEventListener('click',click);root.addEventListener('submit',submit);root.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);root.addEventListener('focusout',focusOut);
  draw();ctx.requestWorld();
  return {
    world(next:WorldSnapshot){snapshot=next;draw();},
    destroy(){disposed=true;window.clearInterval(timer);root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);root.removeEventListener('focusout',focusOut);},
  };
};
