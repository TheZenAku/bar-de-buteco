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
