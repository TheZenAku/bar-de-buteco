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

## Servidor com muitos jogadores (2026-11-04)

Medido com 25 bots reais: tick p50 0,6–0,8 ms, envio de estado (`bar_world_patch_ms`, fora do tick) p50 ~1 ms, mundo ~5% de um núcleo. O servidor **não** era o limite do FPS; o relatório do cliente mostra ~1150 draw calls e render de ~7 ms com 26 atores.

- **Verificação de sessão espalhada.** A manutenção (a cada 3 s) chamava `/api/internal/validate` para *cada* jogador, todos de uma vez (N requisições com ~8 consultas cada, em rajada). Agora cada sessão é confirmada a cada `ACCESS_RECHECK_MS` (padrão 12 000; 0 = toda rodada), as mais antigas primeiro, no máximo 24 por rodada e 6 em paralelo. Bans e kicks seguem chegando como controles a cada rodada. Com 25 bots a CPU da API caiu de ~12,6% para ~3,2% de um núcleo.
- **Buffer do patch** do Colyseus começa em 512 KB (padrão 16 KB estourava e realocava a cada entrada).
- **Métricas novas** (`/metrics`, HUD admin `patch`/`phases`): `bar_world_patch_ms` e `bar_world_phase_*_ms` por fase do tick.
- `tests/load/patch-bench.mts` mede o custo do patch por cliente sem subir servidor: 128 jogadores todos visíveis = 2,9 ms por patch e ~2,9 KB/cliente/patch (~29 KB/s); limitando a 48 visíveis cai para 1,4 ms, a 24 para 0,8 ms.
- Capacidade: `ROOM_CAPACITY` (padrão 32, máx. 128). Não foi testada acima de 26 jogadores reais.

## Modelos de jogador pesados (2026-11-04)

No relatório, `read` e `gilmar-gordo` tinham ~100 mil triângulos cada e `magrao` 58 mil (os demais ~11 mil): 25 personagens somavam 1,17 M de triângulos, redesenhados também em cada lâmpada com sombra ao vivo. `node tools/assets/simplify-skins.mjs` reduz todo skin acima de 40 mil para 20 mil (meshoptimizer; o erro fica em 0,1–0,4% do tamanho do modelo, os cartões gerados ficam indistinguíveis). O original vai para `.local/skins-full/` e o script sempre parte dele. Se o Vite segurar o GLB aberto, o script move o antigo para `.glb.old` e escreve o novo.

## Picos do tick: busca de caminho (2026-11-05)

Captura com 27 jogadores: tick p50 0,7 ms, mas p99 de 50–65 ms e máximo de 74 ms. A fase `service` (Tonico, ajudantes) tinha máximo de 60–87 ms com média de 0,1–2 ms: era a busca A* do garçom. Medido: uma fatia de 400 nós (`SEARCH_SLICE`) custava 35–80 ms, porque cada aresta é caminhada em subpassos contra os colisores do mapa (0,1–0,2 ms por nó).

Agora a fatia é de tempo, não de nós: `PathSearch.runFor(ms)` (navigation.ts) expande em lotes de 8 até gastar `SEARCH_MS` (3 ms por tick, waiter.ts). Medido depois: fatia máxima ~5 ms. O mesmo caminho é achado, só em mais ticks. Também: a lista de obstáculos das motos é montada uma vez por tick, não uma vez por jogador andando.

Sobra (não medido): `findPath` síncrono em refueling.ts (orçamento de 3000 nós, só quando alguém pede abastecimento) pode segurar o tick por centenas de ms; o `loop.p95` ~35 ms do relatório é o piso do `monitorEventLoopDelay` com resolução de 20 ms no Windows, não atraso real.

## Vários mundos (2026-11-05)

`WORLD_SHARDS=n` (.env) faz o processo do mundo virar só uma porta de entrada (`apps/server/src/gateway.ts`) que sobe n mundos filhos (`WORLD_SHARD=i`, porta `GAME_PORT+1+i`, só loopback). Nginx, Vite e os bots continuam apontando para `GAME_PORT`. Com 1 (padrão) nada muda.

- O cliente pergunta `POST /matchmake/...`; a entrada manda ao mundo com menos gente que ainda tem vaga (consulta o `/health` de cada um a cada 1 s e conta quem acabou de mandar). A resposta traz o `processId`, e o socket `/<processId>/<roomId>` é levado ao mundo certo.
- Cada mundo é um bar independente (sem Redis, sem presença compartilhada): quem está em mundos diferentes não se vê, não troca, não joga junto. O mundo i>0 tem outbox e diários próprios (`outbox.s<i>.jsonl`).
- Um mundo que cai é reiniciado em 2 s; os filhos morrem se a entrada morrer (canal IPC).
- Teste: `apps/server/test/gateway.integration.test.ts` (2 mundos de 2 vagas: espalha, enche, o quinto é recusado).
- Não verificado: com 1000 pessoas de verdade (só testei com 4), a mesma pessoa em dois mundos ao mesmo tempo (a sessão do mesmo usuário em outro processo não é derrubada), e o nginx de produção (`/game/` já passa tudo para a mesma porta, deve servir).

## Multidão: modelos perto, "papelões" longe (2026-11-05)

Cada cliente recebe o estado completo (schema) só dos `FULL_DETAIL_MAX` = 32 jogadores mais próximos (dentro de `AOI_RADIUS`, 18 m) e os desenha como modelos. Todos os outros, até `CROWD.radius` = 140 m, chegam como registros binários e viram sprites achatados da skin, virados para a câmera. Antes, quem estava a mais de 18 m simplesmente não existia no cliente.

- **Servidor** (`apps/server/src/world/crowd.ts`, chamado por `BarRoom.refreshViews`): `CrowdPlanner` com grade de 24 m. `models()` escolhe os 32 mais próximos (quem já está na vista conta como mais perto e fica até 1,18× o raio: sem pisca-pisca na borda); sempre modelos: o próprio jogador, quem está numa moto ou arremessado (de qualquer distância) e quem divide a mesa/jogo (`currentTableId`, `foosball:`, `pool:`, `truco:`). `sprites()` pega os `CROWD.max` = 260 mais próximos fora dos modelos (por faixas de 5 m, sem ordenar), menos quem está sentado ou em atividade (`noSprite`). O refresh roda a 5 Hz; os sprites vão a cada 2º refresh (2,5 Hz) por `client.sendBytes('crowd', …)` e só quando a lista mudou (quem está parado não gera tráfego). `Player.slot` (uint16, schema) liga o sprite ao modelo.
- **Fio** (`packages/shared/src/crowd.ts`): 11 bytes por pessoa: slot u16, x y z em decímetros i16, direção u8, skin u8, andar/correr u8. 260 pessoas = 2,9 KB por mensagem.
- **Cliente** (`apps/web/src/engine/crowd.ts`, ligado em BarScene/networking/main): uma malha, uma textura e **uma chamada de desenho** para todos. O vertex shader vira o quadrado para a câmera (cilíndrico) e escolhe o ângulo (1 de 16) pela diferença entre a direção da pessoa e a da câmera; o passo da caminhada alterna 2 poses. Sem esqueleto, sem sombra, `discard` em alfa < 0,5 (sem ordenar). Quem já é modelo (mesmo `slot`) fica sem sprite. A posição e a direção vão alcançando o último registro (suavização, salto se > 6 m).
- **Arte**: `node tools/assets/render-crowd-sheets.mjs [skin…]` desenha, com o próprio motor (`tests/fixtures/crowd-render.js`), `apps/web/public/skins/crowd/<skin>.webp`: 16 ângulos × 3 poses (parado e dois passos), células de 56×112, ortográfico, mesmo quadro de 1,2×2,4 m para todas as skins (a altura do sprite é a do modelo). O cliente monta todas num atlas só (≈ 1,8 k × 1,7 k, 12 MB com mipmaps). **Skin nova: rodar o script** (sem folha, a skin não aparece como sprite).
- **Medido**: planejar 1000 jogadores amontoados num quadrado de 45 m (o pior caso) custa 25 ms (modelos) + 33 ms (sprites) por rodada, o que dá uns 20% de um núcleo; espalhados em 300 m, 3 + 29 ms. `npx tsx tests/load/crowd-bench.mts [lado]`. No cliente (fixture, GPU virtual): 268 sprites custaram menos de 1 ms por quadro (16,2 contra 17,6 ms sem eles, ruído).
- **Não verificado**: 1000 bots de verdade (só o planejador e dois testes de socket: `crowd.test.ts`, `crowd.integration.test.ts`); FPS no navegador do usuário; o visual de sprites em noite/apagão (brilho = 0,55 + 0,45 × luz do dia, sem as luzes do bar); sprite de gente sentada (fica de fora, por isso mesas longe parecem vazias); sprite de moto/cavalo (idem, o cavaleiro some a mais de 18 m se não for de moto).
- **Mundos** (`WORLD_SHARDS`) continuam independentes: a multidão só mostra quem está no mesmo mundo.

## Capacidade de 1000 num bar só (2026-11-05)

- `ROOM_CAPACITY` agora vai até 1024 (`MAX_CAPACITY` em config.ts; era 128), `admin.bots` também. O `.env` (não versionado) foi criado com `ROOM_CAPACITY=1024`; **o mundo precisa ser reiniciado** para valer. Em produção, `infra/compose.yml` e `infra/production.env.example` continuam em 32 (mude lá se for o caso).
- `findSpawn` (packages/shared/src/world.ts) procurava um lugar livre só a 9,6 m do marcador: a 700ª pessoa recebia "Não há uma posição livre". Agora procura até 40 m.
- O planejador ficou mais rápido para multidão densa: os modelos são achados em anéis de células de 6 m (para quando os 32 mais próximos estão garantidos) e os sprites são calculados uma vez por célula de 6 m e compartilhados por quem está nela. 1000 jogadores num quadrado de 45 m: modelos 25 → 7 ms, sprites 34 → 15 ms por rodada.
- Fases novas no relatório do servidor: `views:entries`, `views:models`, `views:sprites`, `views:diff`.
- `npm run test:load` com `LOAD_CLIENTS` até 1024 (cliente e servidor no mesmo processo, então os tempos de rede são pessimistas) e agora imprime o tick e as fases do servidor. Medido com 700 clientes andando, todos amontoados: tick p50 4,6 ms, p95 55 ms (coleta de lixo dos 700 clientes do próprio teste), `players` 5,4 ms, `views` 10 ms e patch 8 ms (mediana), em média ≈ 40% de um núcleo. 1000 é extrapolação (≈ 60%), **não foi rodado**. O pior caso é todo mundo andando no mesmo lugar; espalhados pela cidade custa bem menos.
