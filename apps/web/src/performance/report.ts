import type {DiagnosticSnapshot} from './monitor';
import type {SceneInventory} from './inventory';
import type {PerformanceRecording,RecordingBucket} from './recording';

export const REPORT_REFERENCES=[
  {topic:'Medição e limites do AppStats (PlayCanvas 2.23+)',url:'https://developer.playcanvas.com/user-manual/optimization/app-stats/'},
  {topic:'CPU, GPU, materiais, sombras e bounding boxes de personagens',url:'https://developer.playcanvas.com/user-manual/optimization/guidelines/'},
  {topic:'Batching de geometria compatível',url:'https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/batching/'},
  {topic:'Long Animation Frames e atribuição parcial de scripts',url:'https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing'},
  {topic:'Diagnóstico completo de funções, layout e coleta de lixo',url:'https://developer.chrome.com/docs/devtools/performance'},
];
export const CLAUDE_PROMPT=`Analise este relatório de desempenho do B.A.R., jogo web em TypeScript com PlayCanvas. Responda em português.
1. Comece pela cobertura: build, hardware, cenário, frames ativos, pausas, retenção e APIs indisponíveis. Não trate null como zero nem o inventário da exportação como estado de uma travada passada.
2. Separe fatos medidos, correlações e hipóteses. Use os caminhos exatos do JSON como evidência. Classifique CPU do cliente, GPU, personagens/animação, draw calls/materiais, texturas/VRAM, shaders, streaming/carregamento, layout/interface, rede e servidor.
3. Examine recording.buckets (distribuições de TODOS os frames por intervalo), events, browser.longAnimationFrames/scripts, browser.longTasks, serverSamples, contextSamples e session.markers. CPU/draw calls/GPU não são leituras atômicas do mesmo frame. Não some fases sobrepostas nem faça média de percentis para inventar um percentil global.
4. Relacione inventory.characters, meshes, textures, materials, animations, lights e assets pelos IDs/fontes; recursos compartilhados não devem ser contados por personagem. Distingua tamanho transferido, dados de animação, heap JS e VRAM estimada. Primitivas do inventário não são o total efetivamente desenhado por frame.
5. Priorize por impacto observado, frequência, confiança e esforço. Para cada suspeita indique evidência, arquivo/função (phaseSources), mecanismo provável, mudança proposta, teste A/B controlado, métrica de sucesso e risco visual/funcional.
6. Considere LOD de malha/esqueleto/animação, customAabb conservadora, culling, instancing/batching compatível, compartilhamento de materiais/texturas, KTX2/Basis, mipmaps, redução de curvas/keyframes, sombras/cascatas, overdraw, resolução, shaders, cache/streaming e alocações. Não suponha que qualquer técnica se aplica sem conferir o código e as medições.
7. Se faltar atribuição por função, GPU por passe/mesh, overdraw ou prova de vazamento, diga exatamente qual captura adicional fazer em DevTools/heap snapshot/Spector.js, no mesmo cenário. Termine com uma sequência curta de otimizações verificáveis, sem prometer ganhos não medidos.`;

interface Finding {id:string;priority:'high'|'medium'|'info';confidence:'measured'|'hypothesis';title:string;evidence:unknown;investigate:string[];experiment:string}
export function analyzeReport(recording:ReturnType<PerformanceRecording['report']>,inventory:SceneInventory|null,snapshot:DiagnosticSnapshot){
  const findings:Finding[]=[],buckets=recording.buckets,budget=1000/snapshot.preferences.targetFps;
  const means=(key:'updateMs'|'renderMs'|'gpuMs'|'animationMs')=>buckets.filter(b=>b.metrics[key].samples).map(b=>({startMs:b.startMs,meanMs:b.metrics[key].mean!}));
  const slowest=[...buckets].sort((a,b)=>(b.metrics.frameMs.max??0)-(a.metrics.frameMs.max??0)).slice(0,10).map(b=>({
    startMs:b.startMs,endMs:b.endMs,frameMs:b.metrics.frameMs,drawCalls:b.metrics.drawCalls,gpuMs:b.metrics.gpuMs,compiling:b.metrics.compiling,
    phases:Object.entries(b.phases).map(([name,d])=>({name,...d})).sort((a,b)=>(b.mean??0)-(a.mean??0)),
  }));
  if(!recording.totalFrames)findings.push({id:'no-gameplay',priority:'high',confidence:'measured',title:'Nenhum frame de jogo coletado',evidence:{totalFrames:0},investigate:['Ativar coleta e fechar as janelas antes de jogar.'],experiment:'Jogar pelo menos 60 s e exportar novamente.'});
  const sustainedCpu=buckets.filter(b=>(b.metrics.updateMs.mean??0)+(b.metrics.renderMs.mean??0)>budget*.8);
  if(sustainedCpu.length)findings.push({id:'cpu-pressure',priority:'high',confidence:'hypothesis',title:'Trabalho de CPU do motor próximo do orçamento em alguns intervalos',
    evidence:{budgetMs:budget,intervals:sustainedCpu.length,path:'recording.buckets[].metrics.updateMs/renderMs'},investigate:['Comparar phases, animationMs, personagens ativos e draw calls nos intervalos lentos.','CPU update e render não incluem todo o JavaScript da página.'],experiment:'Mesmo percurso e câmera, variar apenas a quantidade de personagens; comparar médias de CPU, frame p95 e travadas.'});
  const gpu=means('gpuMs');
  if(gpu.some(b=>b.meanMs>budget*.8))findings.push({id:'gpu-pressure',priority:'high',confidence:'hypothesis',title:'GPU próxima do orçamento em intervalos com temporização disponível',evidence:{budgetMs:budget,intervals:gpu.filter(b=>b.meanMs>budget*.8)},
    investigate:['Sombras, transparência, luzes, materiais, pós-processamento e resolução.','Resultados GPU são assíncronos e repetidos; não comprovam qual objeto foi caro.'],experiment:'Fixar escala de resolução, depois repetir com metade da escala linear; comparar GPU e frame p95 com cena igual.'});
  if(recording.totalFrames&&!gpu.length)findings.push({id:'gpu-unavailable',priority:'info',confidence:'measured',title:'Sem temporização de GPU válida',evidence:{path:'recording.buckets[].metrics.gpuMs.samples',samples:0},investigate:['Suporte do navegador/device e estado do profiler.'],experiment:'Comparar resolução fixa baixa/alta; para atribuição de passes usar captura de frame compatível com o backend.'});
  const compiling=buckets.filter(b=>b.stutters&&(b.metrics.compiling.max??0)>0);
  if(compiling.length)findings.push({id:'shader-correlation',priority:'medium',confidence:'hypothesis',title:'Compilação e travadas coexistem em intervalos',evidence:{intervals:compiling.map(b=>b.startMs)},investigate:['Variantes de materiais e preparação de shaders antes do jogo.'],experiment:'Repetir exatamente o percurso aquecido e comparar contagem/duração das travadas.'});
  if(snapshot.longTasks.count)findings.push({id:'long-tasks',priority:'medium',confidence:'measured',title:'Tarefas longas na thread principal durante o jogo',evidence:snapshot.longTasks,
    investigate:['browser.longAnimationFrames[].scripts para atribuição disponível.','phaseSources e DevTools Performance para funções fora dos blocos medidos.'],experiment:'Gravar o trecho com travadas em DevTools e comparar scripting, layout, GC e tempo de renderização.'});
  if(inventory){
    const chars=inventory.characters.items,withoutAabb=chars.filter(c=>c.bones&&c.customAabb===0);
    if(withoutAabb.length)findings.push({id:'skinned-bounds',priority:'medium',confidence:'hypothesis',title:'Personagens com esqueleto sem customAabb',evidence:{characters:withoutAabb.map(c=>({index:c.index,skin:c.skin,bones:c.bones,resting:c.resting})),path:'inventory.characters'},
      investigate:['Custo de atualização das bounding boxes por osso no PlayCanvas.','Não concluir gargalo apenas pela ausência de customAabb.'],experiment:'Em uma cópia da cena, usar AABB conservadora que inclua todas as poses/props; comparar CPU com multidão e conferir culling visualmente.'});
    const large=inventory.textures.items.filter(t=>Math.max(t.width,t.height)>=2048);
    if(large.length)findings.push({id:'texture-candidates',priority:'medium',confidence:'hypothesis',title:'Texturas grandes para revisar por ocupação e uso',evidence:{countInRetainedRows:large.length,top:large.slice(0,10),path:'inventory.textures'},
      investigate:['Dimensão em tela, mipmaps, formato GPU, compartilhamento e panorama antes de reduzir.','PNG/JPEG/WebP menores não garantem VRAM menor. Texturas de dados e render targets precisam de tratamento específico.'],experiment:'Comparar um grupo de texturas em 1024/512 ou KTX2/Basis compatível; medir VRAM/GPU, carregamento e qualidade visual.'});
    const shadowLights=inventory.lights.items.filter(l=>l.enabled&&l.castShadows);
    if(shadowLights.length)findings.push({id:'shadow-passes',priority:'medium',confidence:'hypothesis',title:'Luzes ativas com sombras geram passes adicionais',evidence:{lights:shadowLights,shadowCasters:inventory.scene.shadowCasters},
      investigate:['Resolução, distância, cascatas e frequência de atualização de sombras.','Omni com sombras pode requerer seis faces.'],experiment:'Alterar apenas sombras; manter horário, câmera e personagens iguais e comparar CPU render, GPU e draw calls.'});
  }
  const servers=snapshot.server,serverFresh=snapshot.serverAgeMs!==null&&snapshot.serverAgeMs<6000;
  if(serverFresh&&servers&&(servers.tick.p95Ms??0)>servers.tick.budgetMs)findings.push({id:'server-tick',priority:'high',confidence:'measured',title:'Tick p95 do servidor acima do orçamento na última amostra',evidence:{tick:servers.tick,path:'serverSamples'},investigate:['Event loop, CPU e filas no mesmo intervalo recebido pelo cliente.'],experiment:'Repetir com população controlada e comparar tick, atrasos do event loop e comandos pendentes.'});
  return {budgetMs:budget,findings,slowestIntervals:slowest,phaseRanking:rankPhases(buckets),
    protocol:['Registrar cenário e marcar pontos antes/depois de uma ação problemática.','Aquecer assets e shaders; exportar também um percurso frio se o problema é carregamento.','Repetir o mesmo percurso por 60–120 s, com câmera, população, horário e configurações fixos.','Mudar uma variável por comparação; resolução adaptativa deve ser fixada para testar CPU versus GPU.','Comparar pelo menos três execuções por condição no dispositivo alvo; headless/software GPU não representa desempenho do jogador.'],
    missingEvidence:['GPU por mesh/passe e overdraw: captura de frame (ex.: Spector.js em WebGL).','Funções fora dos blocos, alocações e GC: DevTools Performance.','Vazamento: repetir percurso aquecido e comparar heap snapshots/recursos retidos; crescimento isolado não prova vazamento.','Inventário inclui apenas recursos carregados; modelos nunca usados e arquivos em disco exigem auditoria estática adicional.']};
}
function rankPhases(buckets:RecordingBucket[]){
  const totals=new Map<string,{samples:number;totalMs:number;maxMs:number}>();
  for(const bucket of buckets)for(const [name,d] of Object.entries(bucket.phases)){
    const row=totals.get(name)??{samples:0,totalMs:0,maxMs:0};row.samples+=d.samples;row.totalMs+=(d.mean??0)*d.samples;row.maxMs=Math.max(row.maxMs,d.max??0);totals.set(name,row);
  }
  return [...totals].map(([name,row])=>({name,...row,meanMs:row.samples?row.totalMs/row.samples:null})).sort((a,b)=>b.totalMs-a.totalMs);
}
