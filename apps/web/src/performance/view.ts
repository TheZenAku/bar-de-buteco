import {bytes,e,n,stat} from '../admin/kit';
import type {DiagnosticSnapshot,HudMetric} from './monitor';
import type {FrameSample} from './frames';

const value=(v:number|null|undefined,digits=1)=>v===null||v===undefined||!Number.isFinite(v)?'—':n(v,digits);
const ms=(v:number|null|undefined)=>`${value(v)} ms`;
export const serverFresh=(s:DiagnosticSnapshot)=>s.server!==null&&s.serverAgeMs!==null&&s.serverAgeMs<6000;

/** Bucket peaks, not averages: even a single slow frame remains visible in the chart. */
export function frameChart(samples:FrameSample[],targetFps:number,compact=false,stutterMs=50):string {
  if(!samples.length)return '<p class="perf-empty">Jogue alguns segundos para preencher o gráfico.</p>';
  const width=640,height=compact?78:150,base=height-20,top=12,budget=1000/targetFps;
  const max=Math.max(50,budget*2,...samples.map(s=>s.ms)),bins=Math.min(180,samples.length),peaks:number[]=[];
  for(let i=0;i<bins;i++){
    let peak=0;for(let j=Math.floor(i*samples.length/bins);j<Math.floor((i+1)*samples.length/bins);j++)peak=Math.max(peak,samples[j]!.ms);
    peaks.push(peak);
  }
  const y=(v:number)=>base-(base-top)*v/max;
  return `<svg class="perf-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Histórico do tempo de frame em milissegundos; picos indicam travadas">
    <line x1="0" x2="640" y1="${y(budget)}" y2="${y(budget)}" class="perf-budget"/>
    ${peaks.map((peak,i)=>`<rect x="${i*width/bins}" y="${y(peak)}" width="${Math.max(1,width/bins-1)}" height="${base-y(peak)}" class="${peak>=Math.max(stutterMs,budget*2)?'perf-spike':'perf-bar'}"><title>${value(peak)} ms</title></rect>`).join('')}
    <text x="4" y="10">Pico ${value(max)} ms</text><text x="636" y="${height-3}" text-anchor="end">Meta ${value(budget)} ms · ${targetFps} FPS</text>
  </svg>`;
}

export function metricRows(s:DiagnosticSnapshot):Record<Exclude<HudMetric,'graph'>,string> {
  const f=s.frames,r=s.render,fresh=serverFresh(s),server=fresh?s.server:null;
  return {
    fps:`${value(f.fps,0)} FPS <small>média ${value(f.averageFps,0)}</small>`,
    low1:`${value(f.low1,0)} FPS <small>1% low${f.samples<100?' · aguardando 100 frames':''}</small>`,
    low01:`${value(f.low01,0)} FPS <small>0,1% low${f.samples<1000?' · aguardando 1.000 frames':''}</small>`,
    frametime:`${ms(f.p50)} <small>p95 ${ms(f.p95)} · p99 ${ms(f.p99)}</small>`,
    stutters:`${f.stutters} travadas <small>${f.severe} ≥ 100 ms · pico ${ms(f.max)}</small>`,
    memory:s.memory?`${bytes(s.memory.used)} <small>heap JS / limite ${bytes(s.memory.limit)}</small>`:'Indisponível <small>navegador sem leitura de heap JS</small>',
    render:r?`${ms(r.updateMs+r.renderMs)} CPU · ${ms(r.gpuMs)} GPU <small>${n(r.drawCalls)} draws · ${r.width} × ${r.height} · VRAM est. ${bytes(r.vram)}</small>`:'Aguardando renderização',
    network:s.network.fresh?`${value(s.network.ping,0)} ms <small>jitter ${ms(s.network.jitter)} · ${s.network.pending} pendentes</small>`:'Aguardando ping <small>sem amostra recente</small>',
    server:server?`${ms(server.tick.p95Ms)} tick p95 <small>${value(server.tick.actualHz)} Hz / ${value(server.tick.targetHz,0)} · CPU ${value(server.process.cpuPercent,0)}%</small>`:'Aguardando servidor <small>sem amostra recente</small>',
    serverMemory:server?`${bytes(server.process.rss)} RSS <small>heap ${bytes(server.process.heapUsed)} · máquina ${bytes(server.host.totalMem-server.host.freeMem)}</small>`:'Aguardando memória do servidor',
    world:server?`${server.world.players}/${server.world.capacity} jogadores <small>${server.world.npcs} NPCs · ${server.world.motos} motos · ${server.world.walletRetries+server.world.resultOutbox+server.world.logQueue} na fila</small>`:'Aguardando estado do mundo',
  };
}

export function clientStats(s:DiagnosticSnapshot):string {
  const f=s.frames,r=s.render;
  return `<div class="admin-stats">${stat('FPS atual',value(f.fps,0),'Último segundo de jogo')}${stat('FPS médio',value(f.averageFps,0),`${f.samples} frames · ${value(f.seconds)} s medidos`)}${stat('1% low',value(f.low1,0),f.samples<100?'Requer 100 frames':'Média do 1% mais lento')}${stat('0,1% low',value(f.low01,0),f.samples<1000?'Requer 1.000 frames':'Média do 0,1% mais lento')}${stat('Frame p95 / p99',`${value(f.p95)} / ${value(f.p99)} ms`,`Pico ${ms(f.max)}`)}${stat('Travadas na janela',value(f.stutters,0),`${f.severe} frames ≥ ${Math.max(100,s.preferences.stutterMs,2000/s.preferences.targetFps)} ms`,f.stutters?'warn':'')}${stat('Memória JS do cliente',bytes(s.memory?.used),s.memory?`Heap reservado ${bytes(s.memory.total)} · limite ${bytes(s.memory.limit)}`:'Indisponível neste navegador')}${stat('CPU update / render',r?`${value(r.updateMs)} / ${value(r.renderMs)} ms`:'—','Tempos do motor, sem espera da GPU')}${stat('GPU',ms(r?.gpuMs),'Indisponível sem suporte de temporização')}${stat('Draw calls / primitivas',r?`${value(r.drawCalls,0)} / ${value(r.primitives,0)}`:'—','Primitivas dependem do build do motor')}${stat('VRAM estimada',bytes(r?.vram),r?`${r.width} × ${r.height} · escala ${value(r.scale*100,0)}%`:'Aguardando renderização')}${stat('Avatares / shaders',r?`${r.actors} / ${r.compiling}`:'—','Avatares carregados / shaders pendentes')}${stat('Ping / jitter',s.network.fresh?`${value(s.network.ping,0)} / ${value(s.network.jitter,0)} ms`:'—',`${s.network.pending} comandos aguardando confirmação`)}${stat('Tarefas longas JS',s.longTasks.supported?String(s.longTasks.count):'Indisponível',s.longTasks.supported?`${ms(s.longTasks.totalMs)} acumulados · pico ${ms(s.longTasks.maxMs)}`:'Navegador sem Long Tasks API')}</div>`;
}
export function serverStats(s:DiagnosticSnapshot):string {
  const p=s.server;
  if(!p)return '<p class="perf-empty">Ative a coleta para receber o diagnóstico do servidor.</p>';
  return `${!serverFresh(s)?'<p class="perf-warning">Sem resposta recente. Estes são os últimos valores recebidos.</p>':''}<div class="admin-stats">
    ${stat('Tick p50 / p95',`${value(p.tick.p50Ms)} / ${value(p.tick.p95Ms)} ms`,`Orçamento ${ms(p.tick.budgetMs)}`)}
    ${stat('Tick p99 / máximo',`${value(p.tick.p99Ms)} / ${value(p.tick.maxMs)} ms`,`${p.tick.overBudget} ticks acima do orçamento / ${p.tick.samples}`)}
    ${stat('Frequência do mundo',`${value(p.tick.actualHz)} Hz`,`Meta ${value(p.tick.targetHz,0)} Hz · janela de até 30 s`)}
    ${stat('CPU do processo',`${value(p.process.cpuPercent)}%`,'100% = um núcleo lógico; inclui threads auxiliares')}
    ${stat('RAM do processo (RSS)',bytes(p.process.rss),`Heap ${bytes(p.process.heapUsed)} / ${bytes(p.process.heapTotal)}`)}
    ${stat('RAM da máquina',bytes(p.host.totalMem-p.host.freeMem),`${bytes(p.host.freeMem)} livres / ${bytes(p.host.totalMem)}`)}
    ${stat('Event loop p95 / máximo',`${value(p.loop.p95Ms)} / ${value(p.loop.maxMs)} ms`,'Último intervalo de 1 s; inclui resolução de 20 ms')}
    ${stat('Jogadores / NPCs / motos',`${p.world.players} / ${p.world.npcs} / ${p.world.motos}`,`${p.world.capacity} vagas`)}
    ${stat('Filas: carteira / resultados / logs',`${p.world.walletRetries} / ${p.world.resultOutbox} / ${p.world.logQueue}`,'Pendências de comunicação com a API')}
    ${stat('Último contato com a API',p.world.apiAgeMs===null?'—':`${value(p.world.apiAgeMs/1000)} s`,'Idade informada pelo servidor')}
  </div>`;
}

/** Observations are hypotheses based on readings, never an automatic hardware diagnosis. */
export function recommendations(s:DiagnosticSnapshot):string[] {
  const hints:string[]=[],f=s.frames,r=s.render,p=serverFresh(s)?s.server:null,budget=1000/s.preferences.targetFps;
  if(!s.enabled)return ['Ative a coleta, feche esta janela e percorra o mapa. Abra novamente para comparar os frames com o servidor.'];
  if(f.samples<100)hints.push('Ainda há poucas amostras. Jogue até completar pelo menos 100 frames; o 0,1% low requer 1.000.');
  if(p&&p.tick.p95Ms!==null&&p.tick.p95Ms>p.tick.budgetMs*.8)hints.push('O tick do mundo está perto ou acima do orçamento. Compare com menos bots, NPCs e jogadores e investigue as rotinas do servidor.');
  if(p&&p.loop.maxMs>100)hints.push('O event loop do servidor teve atraso acima de 100 ms. Procure tarefas síncronas, picos de CPU e acesso a disco no processo.');
  if(p&&(p.world.apiAgeMs===null||p.world.apiAgeMs>15000||p.world.walletRetries+p.world.resultOutbox>0))hints.push('Há atraso ou pendências entre mundo e API. Verifique as filas e a categoria Servidor antes de atribuir as travadas à renderização.');
  if(s.network.fresh&&((s.network.ping??0)>150||(s.network.jitter??0)>30))hints.push('A latência ou sua variação está alta. Compare uma conexão por cabo e observe se os comandos pendentes crescem quando o movimento dá saltos.');
  if(s.memory&&s.memory.used/s.memory.limit>.8)hints.push('O heap JavaScript está acima de 80% do limite. Compare o uso depois de repetir o mesmo percurso e investigue recursos que continuam retidos.');
  const heaps=s.history.map(h=>h.heap).filter((h):h is number=>h!==null);
  if(heaps.length>=30&&heaps.at(-1)!-heaps[0]!>64*1024*1024)hints.push('A memória JS cresceu mais de 64 MB no histórico. Carregamento e cache também causam crescimento; repita o percurso para verificar se estabiliza.');
  if(r&&r.updateMs+r.renderMs>budget*.8)hints.push('O trabalho de CPU do cliente está perto do orçamento do frame. Compare quantidade de avatares e draw calls; reduzir a resolução pode ter pouco efeito nesse caso.');
  if(r?.gpuMs!==null&&r?.gpuMs!==undefined&&r.gpuMs>budget*.8)hints.push('O tempo de GPU está próximo do orçamento. Compare menor escala de resolução, sombras mais leves e menor qualidade da cidade em Configurações → Gráficos.');
  if(f.p95!==null&&f.p95>budget*1.2&&r&&r.gpuMs===null&&r.updateMs+r.renderMs<budget*.5)hints.push('Os frames estão lentos sem CPU alta no motor. Teste reduzir resolução e sombras e confira o limite de FPS; sem temporização de GPU a causa ainda é uma hipótese.');
  if(f.stutters&&s.events.some(event=>(event.render?.compiling??0)>0))hints.push('Algumas travadas coincidiram com compilação de shaders. Repita o percurso já aquecido e compare antes de alterar a qualidade.');
  if(s.longTasks.count)hints.push('Foram observadas tarefas longas no JavaScript. Para localizar funções, grave o mesmo trecho no painel Performance das ferramentas do navegador.');
  if(!hints.length)hints.push('Nenhum sinal forte nos limites atuais. Compare o mesmo percurso por 30–60 s, alterando uma configuração de cada vez e exportando cada resultado.');
  return hints;
}

export function eventsTable(s:DiagnosticSnapshot):string {
  if(!s.events.length)return '<p class="perf-empty">Nenhuma travada registrada nesta sessão de coleta.</p>';
  return `<div class="admin-scroll"><table class="admin-table"><thead><tr><th>Horário</th><th>Frame</th><th>CPU / GPU</th><th>Draws / shaders</th><th>Ping / tick p95</th><th>Posição</th></tr></thead><tbody>${s.events.slice(-20).reverse().map(event=>`<tr><td>${e(new Date(event.at).toLocaleTimeString('pt-BR'))}</td><td class="down">${ms(event.ms)}</td><td>${event.render?`${value(event.render.updateMs+event.render.renderMs)} / ${value(event.render.gpuMs)} ms`:'—'}</td><td>${event.render?`${event.render.drawCalls} / ${event.render.compiling}`:'—'}</td><td>${value(event.ping,0)} / ${value(event.tickP95)} ms</td><td>${e(event.position)}</td></tr>`).join('')}</tbody></table></div>`;
}
