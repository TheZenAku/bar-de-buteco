import {escape as e} from '../api';
import {HUD_METRICS,type PerformanceMonitor} from './monitor';
import {frameChart,metricRows} from './view';

/** A passive overlay: it never captures the mouse or keys needed to play. */
export function createPerformanceHud(parent:HTMLElement,monitor:PerformanceMonitor):()=>void {
  const root=document.createElement('aside');root.id='performance-hud';root.className='performance-hud';root.setAttribute('aria-label','Desempenho do jogo');root.hidden=true;parent.append(root);
  const unsubscribe=monitor.subscribe(s=>{
    root.hidden=!s.enabled||!s.preferences.hud||!s.preferences.metrics.length;
    if(root.hidden)return;
    root.dataset.corner=s.preferences.corner;
    root.dataset.dense=String(s.preferences.metrics.length>7);
    const rows=metricRows(s);
    root.innerHTML=`<header>DESEMPENHO <span>${s.collecting?'AO VIVO':'PAUSADO'}</span></header><div class="perf-hud-values">${s.preferences.metrics.map(key=>key==='graph'?`<div class="perf-hud-graph">${frameChart(s.timeline,s.preferences.targetFps,true,s.preferences.stutterMs)}</div>`:`<div class="perf-hud-row"><label>${e(HUD_METRICS[key])}</label><b>${rows[key]}</b></div>`).join('')}</div><footer>Janela ${s.preferences.windowSeconds} s · ${s.frames.samples} frames</footer>`;
  });
  return ()=>{unsubscribe();root.remove();};
}
