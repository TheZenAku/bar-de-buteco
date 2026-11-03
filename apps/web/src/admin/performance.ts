import {card,e,n,type SectionFactory} from './kit';
import {HUD_METRICS,type HudMetric,type PerformancePreferences} from '../performance/monitor';
import {clientStats,eventsTable,frameChart,recommendations,serverStats} from '../performance/view';

export const performanceSection:SectionFactory=(root,ctx)=>{
  const monitor=ctx.performance,p=monitor.state.preferences;
  const checked=(on:boolean)=>on?'checked':'';
  root.innerHTML=`${card('Coleta e comparação',`<div class="perf-toolbar">
    <label class="perf-check"><input type="checkbox" data-perf="enabled" ${checked(p.enabled)}>Coletar desempenho</label>
    <label>Janela de frames<select data-perf="windowSeconds" aria-label="Janela de frames">${[10,30,60].map(v=>`<option value="${v}" ${p.windowSeconds===v?'selected':''}>${v} segundos</option>`).join('')}</select></label>
    <label>Meta de FPS<select data-perf="targetFps" aria-label="Meta de FPS">${[30,60,120,144].map(v=>`<option value="${v}" ${p.targetFps===v?'selected':''}>${v} FPS</option>`).join('')}</select></label>
    <label>Travada a partir de<select data-perf="stutterMs" aria-label="Limiar de travada">${[20,33,50,100,150,250,500].map(v=>`<option value="${v}" ${p.stutterMs===v?'selected':''}>${v} ms</option>`).join('')}</select></label>
    <button type="button" class="mini-button" data-perf-action="reset">Zerar análise</button><button type="button" class="mini-button" data-perf-action="export">Exportar relatório JSON</button>
    </div><p class="perf-status" role="status" data-perf-status></p><p class="admin-note">Abra a coleta e feche a administração para medir durante o jogo. Menus e aba em segundo plano pausam os frames. Uma travada exige também pelo menos 2× o orçamento da meta de FPS. As métricas do servidor chegam a cada 2 s.</p>`,{icon:'activity'})}
    ${card('Exibir por cima do jogo',`<div class="perf-toolbar"><label class="perf-check"><input type="checkbox" data-perf="hud" ${checked(p.hud)}>Mostrar HUD de desempenho</label>
      <label>Posição do HUD<select data-perf="corner" aria-label="Posição do HUD">${Object.entries({'top-right':'Superior direito','top-left':'Superior esquerdo','bottom-right':'Inferior direito','bottom-left':'Inferior esquerdo'}).map(([key,label])=>`<option value="${key}" ${p.corner===key?'selected':''}>${label}</option>`).join('')}</select></label></div>
      <div class="perf-options">${Object.entries(HUD_METRICS).map(([key,label])=>`<label class="perf-check"><input type="checkbox" data-perf-metric="${key}" ${checked(p.metrics.includes(key as HudMetric))}>${e(label)}</label>`).join('')}</div>
      <p class="admin-note">Marque as leituras que quer acompanhar ao andar pelo mapa. As escolhas ficam salvas por conta neste navegador. O HUD não captura o mouse.</p>`,{icon:'panels'})}
    ${card('Cliente · frames e renderização','<div data-perf-client></div>',{icon:'activity'})}
    ${card('Tempo de frame · menor é melhor','<div data-perf-chart></div><p class="admin-note">Cada barra preserva o maior frame do trecho. A linha indica o orçamento da meta; os picos vermelhos passaram do limiar de travada.</p>')}
    ${card('Servidor · simulação, CPU e memória','<div data-perf-server></div>',{icon:'server'})}
    ${card('Pistas para investigar','<ul class="perf-hints" data-perf-hints></ul><p class="admin-note">São hipóteses baseadas nas leituras. A memória do cliente é o heap JavaScript disponível no navegador; VRAM é estimada. Campos sem suporte mostram “—”. Nenhuma configuração gráfica é alterada automaticamente.</p>',{icon:'search'})}
    ${card('Travadas registradas','<p class="admin-note" data-perf-events-count></p><div data-perf-events></div>',{icon:'clock'})}`;
  const change=(event:Event)=>{
    const input=event.target as HTMLInputElement|HTMLSelectElement;
    if(input.dataset.perfMetric){
      const key=input.dataset.perfMetric as HudMetric,current=monitor.state.preferences.metrics;
      monitor.configure({metrics:(input as HTMLInputElement).checked?[...new Set([...current,key])]:current.filter(k=>k!==key)});return;
    }
    const key=input.dataset.perf;if(!key)return;
    const patch=key==='enabled'||key==='hud'?{[key]:(input as HTMLInputElement).checked}:key==='corner'?{corner:input.value}:{[key]:Number(input.value)};
    monitor.configure(patch as Partial<PerformancePreferences>);
    ctx.message(key==='enabled'?(monitor.state.preferences.enabled?'Coleta ativada. Feche a janela e jogue para medir os frames.':'Coleta desativada.'):'Preferências de desempenho salvas neste navegador.');
  };
  const click=(event:MouseEvent)=>{
    const action=(event.target as HTMLElement).closest<HTMLElement>('[data-perf-action]')?.dataset.perfAction;
    if(action==='reset'){monitor.reset();ctx.message('Análise zerada. Feche a janela para iniciar um novo percurso.');}
    if(action==='export'){monitor.export();ctx.message('Relatório JSON exportado com frames, travadas e métricas do servidor.');}
  };
  root.addEventListener('change',change);root.addEventListener('click',click);
  const unsubscribe=monitor.subscribe(s=>{
    root.querySelector('[data-perf-status]')!.textContent=`${s.reason} · ${n(s.frames.samples)} frames na janela`;
    root.querySelector('[data-perf-client]')!.innerHTML=clientStats(s);
    root.querySelector('[data-perf-chart]')!.innerHTML=frameChart(s.timeline,s.preferences.targetFps,false,s.preferences.stutterMs);
    root.querySelector('[data-perf-server]')!.innerHTML=serverStats(s);
    root.querySelector('[data-perf-hints]')!.innerHTML=recommendations(s).map(h=>`<li>${e(h)}</li>`).join('');
    root.querySelector('[data-perf-events-count]')!.textContent=`${s.events.length} registros guardados (limite 100). Exibindo os últimos 20; o relatório inclui todos os guardados.`;
    root.querySelector('[data-perf-events]')!.innerHTML=eventsTable(s);
  });
  return {destroy(){unsubscribe();root.removeEventListener('change',change);root.removeEventListener('click',click);}};
};
