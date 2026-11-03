# Análise de desempenho

Abra **Administração → Desempenho**, marque **Coletar desempenho** e **Mostrar HUD de desempenho**. Marque as caixas das métricas que deseja ver e escolha um dos quatro cantos. Feche a administração e percorra o mapa: o HUD continua atualizando sem capturar mouse ou teclado. As preferências ficam salvas por conta neste navegador. Desmarcar a coleta interrompe observadores, temporização GPU e consultas de diagnóstico; sair da partida ou perder a administração também interrompe a coleta.

A janela permite selecionar 10, 30 ou 60 segundos de frames, meta de 30/60/120/144 FPS e limiar de travada. **Zerar análise** inicia uma comparação nova. Alterar janela, meta ou limiar também limpa a análise para evitar misturar critérios. A meta serve ao diagnóstico; o limite real de FPS continua em **Configurações → Gráficos**.

## Leituras do cliente

- **FPS atual:** número de frames dividido pela soma dos intervalos no último segundo. **FPS médio:** a mesma conta na janela escolhida.
- **1% low / 0,1% low:** `1000 / média dos intervalos dos 1% / 0,1% frames mais lentos`. Exigem 100 / 1.000 amostras. Não são o recíproco do p99/p99,9.
- **Tempo de frame:** percentis p50/p95/p99 por nearest rank, máximo e gráfico que preserva os picos de cada trecho.
- **Travada:** frame com intervalo pelo menos igual ao maior entre o limiar escolhido e duas vezes o orçamento da meta. Travadas severas também precisam de pelo menos 100 ms. Intervalos reais vêm de `performance.now()`, sem o limite de 100 ms usado pelo motor para a simulação.
- **Memória JS:** heap utilizado, reservado e limite, quando `performance.memory` estiver disponível. Não é a RAM total do navegador nem da aba; não se soma ao RSS do servidor.
- **CPU update/render:** tempos do motor. **GPU:** temporização assíncrona do profiler, habilitado somente durante a coleta; pode estar indisponível ou chegar alguns frames depois. **VRAM:** estimativa dos recursos do motor, sem incluir memória física total ou overhead do driver. Primitivas dependem do build do motor. Os contratos são os de [AppStats do PlayCanvas 2.23.3](https://api.playcanvas.com/engine/classes/AppStats.html).
- **Rede:** último ping do heartbeat existente, jitter (média das diferenças absolutas entre pings sucessivos na janela de 30 s), comandos pendentes de confirmação. Ping com mais de 7 s não é apresentado como atual.
- **Tarefas longas:** quantidade, duração acumulada e máximo durante a coleta em jogo, se o navegador oferecer Long Tasks API. Não identificam uma função causadora por si só.

Menus e aba em segundo plano pausam os frames e descartam a referência de tempo anterior, evitando uma travada falsa na retomada. Dados antigos saem normalmente da janela. Os tempos de renderização conservam a última leitura quando pausados; o estado **PAUSADO** aparece no HUD e na administração.

## Leituras do servidor

O comando WebSocket `admin.performance` exige administração no servidor e tem limite de uma requisição por segundo; o cliente o consulta a cada 2 s enquanto conectado, habilitado e com a aba visível. A resposta é pequena e independente do snapshot completo de **Mundo ao vivo**. Após 6 s sem resposta o HUD deixa de tratar as leituras como atuais.

O mundo informa duração do tick p50/p95/p99/máximo, ticks acima do orçamento de 50 ms, frequência efetiva e meta de 20 Hz, RSS/heap/memória externa do processo, RAM utilizada/livre da máquina, CPU do processo, atraso do event loop, jogadores/NPCs/motos e filas. A janela de ticks é de até 30 s; CPU e event loop usam intervalos de 1 s. CPU de 100% representa um núcleo lógico e pode superar 100% com threads auxiliares. Event loop usa resolução de 20 ms e inclui esse intervalo normal.

## Investigar e comparar

Cada travada guarda horário, intervalo real, posição do jogador, CPU/GPU, draw calls, shaders pendentes, último ping e tick p95 recente. A tabela mostra os últimos 20 eventos e mantém até 100. As pistas do painel relacionam as leituras com possíveis causas: tick sobrecarregado, tarefas síncronas, conexão/API, heap em crescimento, renderização e aquecimento de shaders. São hipóteses; nenhuma configuração é alterada automaticamente.

Repita o mesmo percurso por 30–60 s, alterando uma configuração de cada vez. Use **Exportar relatório JSON** antes e depois. O relatório inclui amostras brutas da janela (até 24 mil), resumo, os eventos guardados, leituras e histórico de até dez minutos com uma amostra por segundo. O histórico de memória ajuda a distinguir carregamento inicial de crescimento persistente. O diagnóstico é local à sessão do administrador; não transmite FPS ou memória dos outros jogadores.

## Relatório detalhado v2 para o Claude

O mesmo botão baixa um único JSON, com um `claudePrompt` pronto para orientar a análise. Basta anexar o arquivo ao Claude e pedir que siga esse campo. Não é necessário copiar informações do console. `version: 2` mantém os campos anteriores e acrescenta:

| Campo | Evidência incluída |
| --- | --- |
| `environment` | Commit, alterações locais, data/modo do build, variante do motor, navegador, núcleos lógicos, memória aproximada disponível, viewport/DPR e relógios |
| `session` | Origem monotônica, duração, cenário opcional e marcadores com horário/posição |
| `recording` | Totais de todos os frames medidos: tempo ativo, FPS médio, frames acima do orçamento e travadas; até 600 intervalos detalhados |
| `recording.buckets[].metrics` | Quantidade, média, p50/p95/p99/máximo de cada leitura, calculados sobre todos os frames do intervalo: frame, CPU, GPU, draw calls, primitivas disponíveis, VRAM, avatares, shaders e resolução |
| `recording.buckets[].phases` | Tempos exclusivos dos blocos de `BarScene.update`: setup, poses/props dos avatares, predição do cliente, veículos, efeitos do bar, câmera, streaming, iluminação, palco, marcadores e mídia |
| `recording.buckets[].details` | Subdivisões da mídia: captura do mouse, vídeo, minimapa, indicadores, voz e botão de áudio. Estes tempos estão **dentro** de `phases.media` |
| `phaseSources` / `detailSources` | Arquivo/função associados a cada bloco instrumentado |
| `events` | Até 100 travadas, com o intervalo real e últimas medições de CPU/GPU, blocos de código, rede e posição; quantidade descartada explícita |
| `browser` | Tarefas longas, Long Animation Frames com atribuição de scripts/layout quando suportada, recursos transferidos e eventos de erro/visibilidade/perda do contexto gráfico |
| `inventory` | Recursos vivos no instante da exportação: dispositivos, VRAM por categoria, geometria, materiais, texturas, personagens, animações, luzes, câmeras, scripts nativos e assets |
| `contextSamples` | Uma amostra por segundo de câmera, população/avatares em repouso, resolução, configurações, setores/LOD da cidade, caches, contagem de recursos, VRAM e comandos pendentes |
| `serverSamples` | Até 300 respostas completas do servidor, com momento de recebimento no relógio do cliente |
| `analysis` | Intervalos mais lentos, ranking de blocos de código, sinais priorizados, evidências, testes A/B e capturas adicionais necessárias |
| `references` / `notes` | Fontes oficiais, unidades, limitações e regras para interpretar os dados |

Os intervalos fecham após aproximadamente um segundo ou 2.000 frames; pausas também fecham o intervalo atual. O histórico guarda os últimos 600 intervalos, aproximadamente dez minutos ativos. Muitas pausas encurtam a cobertura. Totais de frames, tempo ativo e travadas continuam cobrindo a sessão inteira. Os percentis de cada intervalo **não** são percentis globais; não calcule a média dos p95/p99. Os 1% e 0,1% low continuam sendo os da janela de frames selecionada.

O inventário percorre a cena somente na exportação. Cada tabela guarda até 500 linhas ordenadas por custo aproximado, e personagens até 256; `total` e `omitted` indicam truncamento. O percurso tem limite de 50 mil nós. A duração da inspeção aparece em `collectionMs`; o relatório é preparado após abrir a administração, fora da medição do percurso. Não há leitura síncrona de buffers GPU nem captura de imagens.

Meshes compartilhados são relacionados por ID e os buffers do total de geometria são deduplicados por identidade. Texturas aparecem uma vez, incluindo recursos dinâmicos e render targets expostos pelo motor. As linhas de materiais relacionam slots com IDs de textura. Texturas incluem tamanho, formato GPU, compressão, mipmaps, anisotropia e memória estimada. O inventário de personagens relaciona skin, clip, ossos, camadas de animação, repouso, custom AABB, meshes e materiais, sem nome/ID de conta.

Arquivos de animação incluem origem, curvas, duração, entradas de keyframes e volume estimado dos dados numéricos. Isso não é custo de CPU medido nem tamanho transferido. O custo da avaliação nativa das animações aparece em `animationMs`, separado das poses e props em `phases.avatars` (que continuam dentro do CPU update do motor). Os scripts TypeScript comuns não são componentes `script` de PlayCanvas: consulte `phases`, `details` e suas referências de código.

## Um percurso fácil de repetir

1. Abra **Administração → Desempenho**, ative a coleta e opcionalmente escreva um cenário, por exemplo “palco, 10 personagens, sombras altas”.
2. Clique em **Zerar análise**, feche as janelas e percorra o trecho por 60–120 segundos. Inclua a ação problemática e aguarde alguns segundos após a travada.
3. Volte ao painel e use **Marcar ponto no relatório** se quiser registrar a posição e o cenário atual. O marcador não cria frames enquanto o painel está aberto.
4. Use **Exportar relatório JSON**. Envie esse arquivo ao Claude pedindo para seguir `claudePrompt`.
5. Para comparar, mude somente uma configuração, zere a análise, repita o mesmo percurso e exporte outro arquivo. Guarde cada condição com um cenário identificável.

Para problemas de carregamento, capture um percurso frio e outro aquecido. Para problemas durante o jogo, compare pelo menos três execuções aquecidas por condição com câmera, horário, população e dispositivo semelhantes. Fixe a resolução adaptativa antes de comparar resoluções. O profiler altera um pouco o custo observado; compare sempre com a mesma coleta/HUD habilitados. A instrumentação de blocos não lê o relógio quando a coleta está desativada.

## Técnicas e como confirmar a necessidade

| Suspeita | Evidência e experimento | Técnicas para avaliar |
| --- | --- | --- |
| CPU de personagens | Comparar `animationMs`, `phases.avatars`, ossos/camadas e personagens ativos versus em repouso, variando apenas a população | LOD de animação/esqueleto/malha, reduzir curvas/keyframes, evitar poses/props desnecessárias, custom AABB conservadora e compartilhamento dos recursos imutáveis |
| Draw calls e submissão | CPU render elevado junto com instâncias/materiais; mesma câmera e população, comparar geometria agrupada | Instancing de geometria compatível, batching estático/dinâmico, atlas e compartilhamento de materiais; confirmar restrições de skinning, transparência e movimento antes de aplicar |
| GPU, fill rate e overdraw | GPU disponível elevada; repetir com resolução fixa reduzida e depois com transparências/efeitos alterados separadamente | Menor resolução, menos transparência sobreposta, backface culling, shaders mais simples, LOD, efeitos/pós-processamento e menor alcance |
| Sombras e luzes | GPU/CPU render, luzes com sombras, resolução e casters; alterar somente sombras mantendo horário | Reduzir distância/resolução/cascatas/frequência, limitar casters/luzes, usar iluminação pré-calculada quando aplicável; omni pode exigir seis faces |
| Texturas e VRAM | Ordenar `inventory.textures` por bytes, conferir tamanho em tela, formato e slots; comparar VRAM e qualidade | Limites 512/1024, KTX2/Basis compatível, mipmaps, atlas/channel packing, compartilhar texturas e descarregar recursos sem uso. PNG/JPEG/WebP menores não significam menos VRAM |
| Shaders | Travadas nos mesmos intervalos de compilação, diferença entre percurso frio/aquecido | Reduzir variantes de materiais e preparar shaders fora do jogo; medir custo/memória do aquecimento |
| Streaming/carregamento | Recursos lentos/grandes, setores/LOD, caches e picos em `streaming`; conferir tarefas de parse/decode fora do update | Priorização e orçamento de carregamento, prefetch, cache, GLB/meshopt/Draco quando compatível, descarte de setores; transferência e parse são custos distintos |
| Interface/mídia/voz | `details`, scripts em Long Animation Frames e forced style/layout; testar cada recurso isoladamente | Atualizar DOM apenas ao mudar, diminuir frequência do minimapa/indicadores, evitar layout síncrono, reduzir uploads de vídeo e trabalho de áudio desnecessário |
| Alocações e memória | Heap/recursos/VRAM crescendo em percursos aquecidos repetidos e sem estabilizar | Reuso de temporários, limites de cache, liberar entidades/meshes/texturas/listeners; confirmar retenção com heap snapshots antes de chamar crescimento de vazamento |
| Rede e servidor | Ping/jitter/pendentes, tick p95, CPU, event loop e filas, observando idade de cada leitura | Rever trabalho síncrono, interesse espacial, frequência/tamanho das mensagens e filas; atraso de rede não é automaticamente queda de FPS |

## Limites para evitar conclusões erradas

O [AppStats](https://developer.playcanvas.com/user-manual/optimization/app-stats/) publica CPU, draw calls e GPU em momentos diferentes. Draw calls/primitivas referem-se ao frame anterior; resultados GPU chegam depois e podem se repetir. Correlacionar um pico com uma leitura não prova causalidade. As fases de CPU também podem conter outras fases: não some CPU, animação e blocos de código como custos independentes.

O inventário mostra o estado **ao exportar**, não necessariamente os recursos presentes na travada. Triângulos da geometria habilitada incluem objetos fora da câmera e não incluem os passes reais de sombra; `visibleThisFrame` também não é uma captura de draw calls. Modelos nunca carregados e arquivos apenas em disco não são auditados automaticamente. O build release pode não disponibilizar contagem real de primitivas.

Long Animation Frames dependem do navegador e seus nomes de função são pontos de entrada, não a função lenta mais interna. Conforme a [documentação da API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing), scripts de workers e iframes de outra origem podem não ter atribuição. Tarefas que atravessam uma pausa são excluídas. Recursos de rede incluem o buffer inicial ainda disponível e requisições enquanto os observadores estão ligados, inclusive menus; não são uma captura completa desde o início da página. Zero bytes transferidos pode significar cache ou restrição de Timing-Allow-Origin.

GPU por mesh/passe e overdraw exigem captura de frame, por exemplo Spector.js em WebGL. Stack completa, alocações, GC e vazamentos exigem DevTools Performance/Memory. O JSON explicita essas lacunas em vez de inventar números. As [orientações oficiais de otimização](https://developer.playcanvas.com/user-manual/optimization/guidelines/) e as [regras de batching](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/batching/) fundamentam as hipóteses, sem prometer ganhos antes de medir.

Não são exportados chat, cookies, tokens, nomes dos jogadores, conteúdo de respostas nem payloads de rede. URLs de recurso/código têm credenciais, query e fragmento removidos. Cenário e marcadores são texto fornecido por quem coleta. O JSON não é enviado automaticamente a serviços externos.
