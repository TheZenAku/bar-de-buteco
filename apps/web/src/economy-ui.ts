import {JOBS,STAGE_PASS,TABLE_MENU,TABLE_ORDER_MAX_ITEMS,itemById,mediaPriceKey,type JobSlotsView,type JobTaskView,type WorldState} from '@bar/shared';
import {escape as e} from './api';
import type {TableOrderView} from './networking';
import {GRAPHICS_PRESETS,PRESET_LABELS,type GraphicsSettings} from './graphics';
import {coins,itemImage} from './ui-icons';
import {itemCost,price as livePrice} from './prices';

/** Above the jukebox and TV panels: what a new video costs (the room charges it, never the browser). */
export function mediaPriceNote(kind:'jukebox'|'tv',id:string,balance:number|undefined):string {
  const price=livePrice(mediaPriceKey(kind,id));
  return `<p class="media-price"><b>${coins(price)}</b> por vídeo novo · pausar, avançar e pular são de graça${balance===undefined?'':` · você tem ${coins(balance)}`}</p>`;
}

/** Minutes left on a stage pass (`until`: server clock), at least 1 while it lasts. */
export const stageMinutes=(until:number,now:number)=>Math.max(1,Math.ceil((until-now)/60_000));
/**
 * At the stage's steps: buy the pass to go up (the room charges it, never the browser), or see how long the current
 * one lasts. The screen is paid apart, at the front of the stage.
 */
export function stagePanelHtml(price:number,until:number,now:number,balance:number|undefined):string {
  const telao=`<p class="fine-print">O telão é à parte: ${coins(livePrice('media:telao'))} por vídeo novo. Vá ao blip turquesa no meio da frente do palco (ou encoste na borda da frente, de cima do palco) e aperte E. Todas as luzes do palco mudam de cor com o vídeo.</p>`;
  if(until>0)return `<div class="stage-panel"><p class="modal-description">Seu ingresso está valendo: o palco é seu por mais <b>${stageMinutes(until,now)} min</b>. É só subir pela escada.</p>${telao}<button class="button secondary full" data-action="close-modal">Fechar</button></div>`;
  const short=balance!==undefined&&balance<price;
  return `<div class="stage-panel"><p class="media-price"><b>${coins(price)}</b> pelo ingresso · vale ${STAGE_PASS.durationMs/60_000} minutos${balance===undefined?'':` · você tem ${coins(balance)}`}</p>
    <p class="modal-description">Só sobe no palco quem tem ingresso. Enquanto ele valer, você sobe e desce à vontade; se acabar lá em cima, pode ficar até descer.</p>
    <button class="button primary full" data-action="stage-buy" ${short?'disabled':''}>${short?'Moedas insuficientes':`Pagar ${price} moedas e subir`}</button>${telao}</div>`;
}

/**
 * The table menu, for a seated player: up to four items, paid on ordering, brought by Tonico or by a player working the
 * bar (`workers`). Once ordered, the customer waits at the table; the order can be cancelled only while at the counter.
 */
export function tableMenuHtml(balance:number,pending?:TableOrderView,workers:ReadonlyArray<{id:string;name:string}>=[]):string {
  if(pending){
    const who=pending.waiter??'Tonico',items=pending.items.map(id=>e(itemById(id)?.name??id)).join(', ');
    if(pending.stage==='carrying')return `<div class="table-menu"><p class="modal-description">${e(who)} já está trazendo o seu pedido: <b>${items}</b> (${coins(pending.total)}).</p><p class="fine-print">Fique na mesa: ele chega já, já.</p><button class="button secondary full" data-action="close-modal">Fechar</button></div>`;
    return `<div class="table-menu"><p class="modal-description">${e(who)} vai pegar o seu pedido no balcão: <b>${items}</b> (${coins(pending.total)}).</p><p class="fine-print">Você fica na mesa até ele chegar. Enquanto o pedido ainda está no balcão, dá para cancelar e as moedas voltam para a carteira.</p><button class="button secondary full" data-action="table-cancel">Cancelar pedido</button></div>`;
  }
  const who=workers.length?'Quem você escolher busca no balcão e traz':'O Tonico busca no balcão e traz';
  return `<form id="table-order" class="table-menu" data-capture-input><p class="modal-description">Escolha até ${TABLE_ORDER_MAX_ITEMS} itens. ${who} até a sua mesa; cada coisa dura alguns minutos e você consome ali mesmo. Você fica na mesa até o pedido chegar.</p>
    <div class="menu-grid">${TABLE_MENU.map(id=>{const item=itemById(id)!;return `<label class="menu-item"><input type="checkbox" name="item" value="${id}" data-price="${itemCost(id)}"><span class="item-icon" aria-hidden="true">${itemImage(item)}</span><span><b>${e(item.name)}</b><small>${e(item.description)}</small></span><span class="shop-price">${coins(itemCost(id))}</span></label>`;}).join('')}</div>
    <div class="menu-total"><span>Total <b id="table-total">${coins(0)}</b></span><small>Carteira: ${coins(balance)}</small></div>
    <div class="menu-submit"><button class="button primary full" type="submit" value="" data-order-submit disabled>Pedir ao Tonico</button>
    ${workers.map(w=>`<button class="button secondary full" type="submit" name="to" value="${e(w.id)}" data-order-submit disabled>Pedir para ${e(w.name)} <small>(trabalhando no bar)</small></button>`).join('')}</div></form>`;
}
export function tableMenuTotal(form:HTMLFormElement):number {
  const boxes=[...form.querySelectorAll<HTMLInputElement>('input[name=item]')],chosen=boxes.filter(box=>box.checked);
  for(const box of boxes)box.disabled=!box.checked&&chosen.length>=TABLE_ORDER_MAX_ITEMS;
  const total=chosen.reduce((sum,box)=>sum+Number(box.dataset.price),0);
  form.querySelector('#table-total')!.innerHTML=coins(total);
  for(const button of form.querySelectorAll<HTMLButtonElement>('[data-order-submit]'))button.disabled=!chosen.length;
  return total;
}

export function jobsHtml(world:WorldState|undefined,task:JobTaskView|null|undefined):string {
  const slots=(id:string):JobSlotsView|undefined=>world?.jobs?.[id];
  return `<p class="modal-description">Trabalhe no bar para ganhar moedas sem gastar dinheiro de verdade. Cada tarefa concluída paga na hora; há um limite de ganhos por dia.</p>
    <div class="job-list">${JOBS.map(job=>{const s=slots(job.id),mine=task?.jobId===job.id,full=!!s&&s.workers>=s.slots;
      return `<article class="job-card ${mine?'active':''}"><div><b>${e(job.name)}</b><small>${e(job.description)}</small></div>
        <div class="job-meta"><span>${s?`${s.workers}/${s.slots} vagas`:'—'}</span><span>${coins(s?.pay??job.pay)} por tarefa</span><span>Turno de até ${Math.round(job.shiftMaxMs/60000)} min</span></div>
        ${mine?`<button class="button secondary" data-action="job-stop">Encerrar turno</button>`:`<button class="button primary" data-action="job-start" data-job="${job.id}" ${!s?.enabled||full||task?'disabled':''}>${!s?.enabled?'Vagas fechadas':full?'Sem vagas agora':'Começar turno'}</button>`}
        <p class="fine-print">Comece perto do balcão do térreo. Fique mais de ${Math.round(job.taskTimeoutMs/1000)} s sem trabalhar e o turno acaba.</p></article>`;}).join('')}</div>`;
}

/** The worker's current task, in the job panel. Built when the task changes; jobPanelTick moves its clocks. */
export function jobPanelHtml(task:JobTaskView,near:boolean):string {
  const job=JOBS.find(j=>j.id===task.jobId);
  return `<div class="job-task"><small>${e(job?.name??'Trabalho')} · <span title="Tempo até o fim do turno" data-job-shift></span></small><b>${e(task.startedAt?task.action:task.label)}</b>
    ${task.startedAt?'<div class="hud-track"><i data-job-progress></i></div>':`<p>${near?'Aperte <kbd>E</kbd> para começar':'Siga o marcador verde'} · <span data-job-clock></span></p>`}</div>
    <div class="job-hud-foot"><span>${task.tasks} ${task.tasks===1?'tarefa':'tarefas'}</span><span>+${coins(task.earned)}</span><button class="mini-button" data-action="jobs">Encerrar…</button></div>`;
}
/** Ten times a second: only the clocks and the progress change, never the panel's structure. */
export function jobPanelTick(body:HTMLElement,summary:HTMLElement,task:JobTaskView,now:number):void {
  const set=(element:Element|null,text:string)=>{if(element&&element.textContent!==text)element.textContent=text;};
  const progress=task.startedAt?Math.min(1,(now-task.startedAt)/task.durationMs):0,left=Math.max(0,Math.ceil((task.deadline-now)/1000));
  const bar=body.querySelector<HTMLElement>('[data-job-progress]'),width=`${(progress*100).toFixed(0)}%`;
  if(bar&&bar.style.width!==width)bar.style.width=width;
  set(body.querySelector('[data-job-clock]'),`${left}s`);
  set(body.querySelector('[data-job-shift]'),`fim em ${Math.max(1,Math.ceil((task.shiftEndsAt-now)/60000))} min`);
  set(summary,task.startedAt?width:`${left}s`);
}


export function graphicsSettingsHtml(g:GraphicsSettings,scene?:{currentScale:number;fps:number}):string {
  const option=(value:string|number,label:string,current:string|number)=>`<option value="${value}" ${String(value)===String(current)?'selected':''}>${label}</option>`;
  return `<section><h3>Gráficos</h3>
    <label class="setting-row"><span>Qualidade</span><select data-setting="graphics.preset">${(['low','medium','high','ultra','custom'] as const).map(p=>option(p,PRESET_LABELS[p],g.preset)).join('')}</select><output></output></label>
    <label class="setting-row"><span>Resolução de renderização</span><input type="range" min="50" max="100" step="5" data-setting="graphics.renderScale" value="${Math.round(g.renderScale*100)}"><output>${Math.round(g.renderScale*100)}%</output></label>
    <label class="setting-row"><span>Sombras</span><select data-setting="graphics.shadows">${option('off','Desligadas',g.shadows)}${option('low','Baixas',g.shadows)}${option('medium','Médias',g.shadows)}${option('high','Altas',g.shadows)}${option('ultra','Ultra',g.shadows)}</select><output></output></label>
    <label class="setting-row"><span>Névoa atmosférica</span><select data-setting="graphics.fog">${option('light','Leve (vê mais longe)',g.fog)}${option('normal','Normal',g.fog)}${option('dense','Densa (mais leve de rodar)',g.fog)}</select><output></output></label>
    <label class="setting-row"><span>Limite de FPS</span><select data-setting="graphics.fpsCap">${option(0,'Sem limite (tela)',g.fpsCap)}${option(30,'30',g.fpsCap)}${option(60,'60',g.fpsCap)}${option(120,'120',g.fpsCap)}</select><output></output></label>
    <label class="setting-row"><span>Nitidez em telas densas</span><select data-setting="graphics.pixelRatioCap">${option(1,'1× (mais rápido)',g.pixelRatioCap)}${option(1.5,'1,5×',g.pixelRatioCap)}${option(2,'2× (mais nítido)',g.pixelRatioCap)}</select><output></output></label>
    <label class="setting-toggle"><span><b>Resolução dinâmica</b><small>Reduz a resolução quando o FPS cai e devolve quando sobra desempenho</small></span><input type="checkbox" role="switch" data-setting="graphics.dynamicResolution" ${g.dynamicResolution?'checked':''}><i aria-hidden="true"></i></label>
    <p class="fine-print" id="graphics-status">${scene?`Agora: ${scene.fps} FPS · ${Math.round(scene.currentScale*100)}% da resolução.`:''} Geração de quadros (DLSS/FSR Frame Generation) não existe em navegadores; a resolução dinâmica e o limite de FPS são as técnicas disponíveis no WebGL.</p>
  </section>`;
}
/** A changed option turns the preset into Personalizado; choosing a preset applies all of its values. */
export function nextGraphics(current:GraphicsSettings,key:string,value:string|boolean):GraphicsSettings {
  if(key==='preset')return value==='custom'?{...current,preset:'custom'}:{preset:value as GraphicsSettings['preset'],...GRAPHICS_PRESETS[value as keyof typeof GRAPHICS_PRESETS]};
  const parsed=key==='renderScale'?Number(value)/100:key==='fpsCap'||key==='pixelRatioCap'?Number(value):value;
  return {...current,[key]:parsed,preset:'custom'} as GraphicsSettings;
}
