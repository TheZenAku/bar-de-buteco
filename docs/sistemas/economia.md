# Economia: moedas, balcão, mesa, empregos e mídia

As moedas são da conta e ficam na API. O mundo só **pede** mudanças. Cada pedido tem um identificador próprio, então repetir a chamada nunca cobra nem paga duas vezes. Não existe dinheiro real.

## Onde as moedas entram e saem

| Origem | Valor | Quando cobra / paga | Estorno |
| --- | --- | --- | --- |
| Balcão do Magrão | preço do item (long neck 30, copo de chopp 20) | ao pedir | se o pedido cair antes de servir (levantar, cair, sair, desconectar) |
| Mesa, com o Tonico ou com quem trabalha no bar | soma do cardápio (até 4 itens) | ao pedir | se a pessoa cancelar enquanto o pedido está no balcão, cair, sair do bar, se não houver caminho ou se a administração cancelar |
| Jukebox | 15 por vídeo novo | ao tocar um link | se o comando falhar depois da cobrança (revisão mudou, a pessoa se afastou) |
| TVs | 25 por vídeo novo | ao tocar um link | idem |
| Telão do palco | 50 por vídeo novo | ao tocar um link | idem |
| Ingresso do palco | 200, vale 30 min | ao comprar na escada do palco | se a pessoa sair de perto da escada (ou mudar de sessão) antes de receber o ingresso |
| Ajudante do Magrão (emprego) | 6 por tarefa concluída (pegar um pedido no balcão e entregá-lo contam como duas) | ao terminar a tarefa | — |

Pausar, continuar, avançar, voltar e pular a mídia são de graça; tirar o próprio vídeo da fila devolve as moedas, e um vídeo que a plataforma recusa nos primeiros 30 s também. Os valores padrão estão em `MEDIA_PRICES`, `STAGE_PASS`, `ITEM_CATALOG` e `JOBS` (`packages/shared`), e as variáveis `PRICE_JUKEBOX`, `PRICE_TV`, `PRICE_TELAO`, `PRICE_STAGE`, `SKIN_PRICE_*`, `WALLET_INITIAL_COINS` e `WALLET_DAILY_COINS` continuam mudando o padrão. Por cima deles, a administração muda qualquer preço ou pagamento em **Administração → Preços** (ver [admin.md](admin.md#preços)): a tabela efetiva (`packages/shared/src/prices.ts`) vem da API, o mundo cobra e paga com ela e os navegadores mostram os valores novos em poucos segundos (`0` torna gratuito). O motivo no extrato do ingresso é `stage:pass`.

## Palco

Só sobe no palco do quintal quem tem ingresso. Ele é comprado com **E** ao pé da escada do palco (lado oeste), onde fica o blip magenta, e vale 30 minutos (`STAGE_PASS`). Enquanto vale, a pessoa sobe e desce à vontade. Se acabar lá em cima, ela pode ficar até descer; para subir de novo, precisa de outro ingresso. Não se compra um ingresso novo enquanto o atual vale.

O bloqueio está no movimento compartilhado (`movePlayer`, `packages/shared/src/world.ts`): sem ingresso, os degraus seguram o corpo como uma parede, no servidor e na predição do navegador. O mundo guarda o vencimento em `Player.stageUntil` e o zera quando vence, então os dois lados decidem igual. O ingresso é da sala: reiniciar o mundo apaga os ingressos, como a jukebox e as TVs.

Lá em cima, os quatro lugares de músico (violão, cavaquinho, bateria e vocal) são de graça: veja [músicos do palco](palco.md).

Pôr vídeo no telão é cobrado à parte (50 moedas por vídeo novo) e não exige ingresso: basta ir ao blip turquesa, no meio da frente do palco, e apertar **E**. De cima do palco, a borda da frente também serve.

Os dois blips do palco (escada e telão) só aparecem para quem está no quintal e embaixo do palco. O quintal é a área do palco (`inStageArea`): fica dentro dos muros do lote, até a parede dos fundos do prédio. No salão, na rua ou no andar de cima, os blips não aparecem. O anel aparece de longe; o selo com o nome e o preço (ingresso ou vídeo no telão) só com o jogador em cima dele.

## Garantias

`/api/internal/wallet` (`apps/api/src/wallet-service.ts`) aplica cada mudança numa transação com a carteira travada:

- registra a linha do livro-caixa `world:<requestId>` antes de mexer no saldo; uma repetição devolve o resultado já aplicado;
- o saldo nunca fica negativo nem passa de `MAX_COIN_BALANCE`;
- o mundo só pode **creditar** por trabalho (`job:`) ou estorno (`refund:<id da cobrança>`). Um estorno devolve no máximo o valor cobrado, uma única vez, e só da mesma conta;
- o trabalho paga até `JOB_DAILY_CAP` (400) moedas por pessoa e por dia. Uma tarefa acima do limite fica registrada com valor 0, para nunca ser paga depois;
- só a sessão viva do jogador é aceita, com o segredo interno.

No mundo, estornos e pagamentos que a API não aceitou ainda (API fora do ar) ficam em `WalletRetries` com o mesmo identificador e são reenviados a cada rodada de manutenção (3 s). Já uma cobrança que não passa recusa a ação: nada fica pendente. A métrica `bar_world_wallet_credits_pending` mostra a fila.

## Pedido na mesa (Tonico ou quem trabalha no bar)

1. Sentado, a pessoa aperta **P** (ou **Pedir na mesa** na barra de ações, ou o botão da mesa) e escolhe até 4 itens. Se alguém estiver trabalhando como *Ajudante do Magrão*, o cardápio mostra, além de **Pedir ao Tonico**, um botão **Pedir para Fulano** por ajudante (`table.order` com `to`).
2. O mundo cobra e coloca o pedido com quem foi escolhido: na fila do Tonico (máximo de 8) ou na lista do ajudante (máximo de 2). É um pedido por pessoa.
3. **A pessoa fica na mesa até o pedido chegar.** Levantar é recusado com um aviso. Enquanto o pedido ainda está no balcão (na fila, ou sendo buscado e preparado), dá para cancelar, e as moedas voltam. Depois que sai do balcão, não dá mais: ele está a caminho. Cair, sair do bar, desconectar ou a administração cancelar ainda estornam o pedido.
4. O Tonico sai da ronda e vai até o balcão (`PICKUP_POINT`). Enquanto o Magrão prepara (3,5 s), o caminho até a mesa é procurado. Ele leva o pedido na **bandeja**, com os objetos 3D de cada item em cima. Na mesa, para ao lado de quem pediu, pega um item de cada vez com a mão direita e o põe no tampo (0,3 s de preparo e 0,7 s por item), e volta. Enquanto serve, os eventos não o interrompem. O pedido do ajudante segue o mesmo caminho, feito pelo jogador (veja [Empregos](#empregos)).
5. **Cada item dura um tempo na mesa** (`CONSUME_MS`, o mesmo da gelada do balcão e dos itens da mochila): long neck 3 min; chopp e refrigerante 2,5 min; água 2 min; café, coxinha e pastel 1,5 min; torresmo 2,5 min. Com a pessoa sentada, os efeitos do item entram aos poucos, em partes de 5%. Ao terminar, o item fica **vazio** na mesa (salgados deixam só o prato). Se a pessoa levanta antes, o resto fica para trás. Enquanto ela está sentada, cada item tem a sua barra de progresso acima dos avisos de tecla, com o tempo que falta ([interface](interface.md)).
6. **O que terminou é recolhido.** Os itens terminados ou deixados esperam na mesa (`doneAt`). Com alguém trabalhando no bar, a mesa vira tarefa do ajudante. Sem ninguém trabalhando, o **Tonico** recolhe entre um pedido e outro: vai até a mesa que espera há mais tempo, põe os itens na bandeja um a um (0,5 s cada, no máximo 6 por viagem) e os leva ao balcão. Um pedido novo tem prioridade sobre ir limpar (mas ele termina de levar o que já pegou). Se ninguém recolher, os itens somem sozinhos 10 min depois de terminados (`LEFTOVER_MS`).

### Bandeja e lugares na mesa

- **Onde cada item fica:** quando o Tonico chega ao balcão, o mundo (`apps/server/src/world/served.ts`) escolhe os lugares no quarto do tampo à frente de quem pediu: longe do porta-guardanapo numerado, sem encostar nos outros itens e o mais perto possível da borda dessa pessoa, com o rótulo virado para ela. Ao chegar à mesa, os lugares são escolhidos de novo, porque a mesa pode ter mudado no caminho. O tamanho de cada item vem de `SERVED_PROPS` (`packages/shared/src/economy.ts`), igual ao objeto real.
- **Mesa cheia:** saem primeiro os itens terminados (os mais antigos antes) e depois os itens antigos da própria pessoa. O que um vizinho ainda está consumindo nunca some. Há no máximo 96 itens no bar inteiro.
- **Onde o Tonico para:** ao lado da pessoa, a até 75 cm do centro do pedido e nunca em cima dela. Se esse ponto não tiver caminho, ele vai até 90 cm do assento.
- **Estado sincronizado:** `state.served` traz cada item (posição, giro, mesa, o momento em que toca o tampo e `doneAt`). `npc.carrying`/`npc.carryingOrder` (Tonico) e `player.carrying`/`player.carryingOrder` (ajudante) dizem o que está na bandeja. Os navegadores desenham a bandeja na mão esquerda (IK de dois ossos, palma para cima) e animam a mão direita levando cada item da bandeja até o lugar, com o tronco levemente curvado (`apps/web/src/engine/serving-props.ts` e `BarScene.carryTray`). Quem chega depois vê os itens direto na mesa.
- **Cancelamento:** um pedido estornado não deixa nenhum item na mesa.

### Caminho do Tonico

O caminho sai de `apps/server/src/world/navigation.ts`: um A* com passos de 35 cm que usa as mesmas regras de piso, colisão, portas e escada dos jogadores, então não há navmesh para gerar nem para manter em sincronia com o mapa.

- **Passagens estreitas:** a porta do salão de cima para o terraço deixa só 15 cm de folga para o corpo. Antes, a grade ficava ancorada onde o Tonico estava e quase nunca acertava essa faixa: dependendo de onde ele parou no balcão, de 2 em 12 (salão de cima) a 7 em 12 (terraço, mesas 34 a 39) buscas falhavam, e o pedido era estornado com "O Tonico não achou caminho até a sua mesa". Agora um passo bloqueado é tentado de novo 5, 10 e 15 cm para cada lado, e a busca encontra a passagem de qualquer ponto de partida.
- **Outro andar:** quando o destino está em outro andar, a estimativa da busca passa pela escada (achada nas rampas do mapa), em vez de vasculhar o andar inteiro antes de subir. O terraço caiu de ~1,4 s para 0,2 a 0,4 s de busca.
- **Sem travar o mundo:** as buscas do Tonico rodam 400 nós por tick (`PathSearch.run`), a do pedido durante o preparo do Magrão. O tick do mundo não para enquanto ele procura.

A busca tem limite. Se não houver caminho, o pedido é estornado com uma mensagem, e uma mesa suja inalcançável é deixada de lado por 1 min.

## Empregos

`JOBS` (`packages/shared/src/economy.ts`) descreve cada emprego: vagas, pagamento, ponto de início, estações, tempo de cada tarefa, limite de inatividade, duração máxima do turno e descanso. O primeiro emprego é o **Ajudante do Magrão**, com 2 vagas: levar os pedidos que os clientes fizerem para ele, recolher o que ficou nas mesas, repor as geladeiras e lavar os copos. Cada mesa é chamada pelo número escrito nela no mapa (*Limpar a mesa 7*; veja [mesas numeradas](../assets/map.md#mesas-numeradas)).

- **Limpar a mesa** dura o clipe `limpar_mesa` (9 s): o ajudante vai para a quina livre mais perto e passa o pano ([animações do bar](animacoes-bar.md)). Terminada uma mesa, a próxima tarefa nunca é a mesma mesa.
- **Só mesas com o que recolher:** uma mesa entra nas tarefas apenas quando tem itens terminados ou deixados (`ServedItems.dirtyTables`), a que espera há mais tempo primeiro, e nunca a mesa em que o outro ajudante já está. Se a mesa ficar limpa antes (as sobras vencem, por exemplo), a tarefa troca sozinha, com prazo novo. Sem mesa suja, as tarefas são geladeiras e pia. Ao terminar **Limpar a mesa N**, os itens terminados somem; o que alguém ainda está consumindo fica.
- **Pedidos para o ajudante:** vêm antes de qualquer estação (no máximo 2 por vez, `MAX_WORKER_ORDERS`). A tarefa vira **Pegar o pedido de Fulano no balcão** (E no balcão, 3,5 s de preparo do Magrão) e depois **Levar o pedido de Fulano à mesa N** (E encostado na mesa). Com o pedido pego, a bandeja aparece na mão do ajudante (`player.carrying`), como a do Tonico, e na mesa ele põe um item de cada vez. Durante a entrega, **E** não interrompe. Essas duas tarefas têm prazo de 90 s. Se o turno do ajudante acabar (parou, ficou parado, caiu, saiu ou a administração encerrou), os pedidos dele passam na frente da fila do Tonico, sem nova cobrança, e o cliente é avisado. A estação de cada tarefa vai junto em `job.state` (`task.station`), porque balcão e entrega não estão em `JOBS`.

- **J** abre os empregos. O turno começa perto do balcão do térreo e mostra a tarefa no painel **Turno** do HUD, que só existe durante o turno. Ele começa no canto superior direito, embaixo das ferramentas (embaixo do chat no celular), longe do centro da tela. Como os outros painéis, pode ser arrastado pelo título, recolhido (o cabeçalho continua mostrando a contagem) e escondido pelo olho do cabeçalho ou pelo menu **Painéis**. O botão **Turno**, no topo, mostra ou esconde o painel. Posição e escolha ficam salvas por conta. O painel é montado quando a tarefa muda; só a contagem e a barra se atualizam no lugar.
- **Objetivo no mapa (blip):** a estação da tarefa ganha só um anel verde no chão, que pulsa devagar; um traço fraco dele aparece através de móveis e paredes. Nada flutua acima dele. Na tela, um selo deitado sobre o anel mostra a distância (e *suba*/*desça* quando ela está em outro andar); fora da vista, o selo vai para a borda da tela, com uma seta apontando para ela. O marcador some durante a tarefa e volta na próxima. **Só quem está trabalhando vê o blip:** a sala manda a tarefa (`job.state`) apenas para o próprio trabalhador, e o marcador é desenhado só no navegador dele (`BarScene.setObjective`; o selo em `objective-blip.ts`).
  - O marcador 3D é criado uma vez e movido de tarefa em tarefa. Recriá-lo congelava a tela na tarefa seguinte: o PlayCanvas libera a malha do anel junto com a última instância, e o marcador novo desenhava a malha liberada, com erro em todo quadro.
  - O selo é desenhado num `<canvas>` próprio, só quando muda. Mover um elemento HTML a cada quadro fazia o navegador recalcular estilos e, com serviços de acessibilidade ativos, a árvore de acessibilidade, com quedas de quadro.
- Na estação, **E** começa a tarefa. O personagem fica no lugar com a animação de uso, e **E** de novo interrompe sem pagar.
- Cada tarefa concluída paga na hora e passa à próxima: um pedido, a mesa suja mais antiga ou outra estação.
- Ficar 60 s sem trabalhar encerra o turno. O turno dura até 15 min e depois exige 3 min de descanso, para a vaga não ficar presa com uma só pessoa.
- Todos veem as vagas ocupadas (`state.jobs`) e quem trabalha (`player.job`).

Para criar outro emprego, acrescente uma entrada em `JOBS` com estações tiradas dos colisores do mapa. O servidor, o HUD e o painel da administração passam a mostrá-lo sem mais código.

## Administração: Mundo ao vivo

Em **⚙ Administração → Mundo ao vivo**, a administração vê o estado da sala em tempo real (comando `admin.world`):

- ocupação, evento, créditos pendentes e fila de resultados;
- empregos: vagas e aberto/fechado (editáveis; o pagamento por tarefa fica em **Preços**), quem trabalha, em que estação e quanto ganhou, com **Encerrar turno**;
- pedidos do Tonico (fase atual e fila), com **Cancelar e devolver**;
- quem espera no balcão do Magrão;
- jukebox, TVs e telão (vídeo, quem escolheu, preço), com **Desligar**;
- **Bots de teste** (só em desenvolvimento): quantidade com **Aplicar**, **+5**, **+10** e **Remover todos**, o que cada bot está fazendo, o tick do mundo (p95) e, dos últimos 15 s, RTT, inputs por segundo e o event loop do processo dos bots. O mundo roda `tests/load/bots.ts` como processo filho (`apps/server/src/world/bots.ts`), muda a quantidade por IPC e recusa mais bots do que cabem (`ROOM_CAPACITY` menos os jogadores). O painel se atualiza sozinho quando todos entram ou saem. Detalhes em [tools/README.md](../../tools/README.md#bots-de-desempenho);
- NPCs e uma tabela de jogadores com posição, animação, interação, emprego e saldo, com **Ficha** para abrir o jogador na categoria Jogadores;
- o processo do mundo: tempo no ar, memória, tick p95, última conversa com a API e se a tabela de preços está sincronizada.

Os comandos conferem o papel `admin` da sessão, que é revalidado a cada rodada de manutenção, e ficam registrados no log do mundo (`admin_job`, `admin_table_cancel`, `admin_media_off`, `admin_bots`; o processo dos bots registra `bots_start`, `bots_output` e `bots_exit`). As alterações de vagas valem para a sala até o mundo reiniciar. O painel se atualiza a cada 5 segundos.

## Testes

- `apps/api/test/wallet.test.ts`: cobrança única com pedidos simultâneos, saldo insuficiente, motivos recusados, estorno único e limitado, teto diário do trabalho e exigência de sessão e segredo.
- `apps/server/test/economy.integration.test.ts`: em WebSockets reais, o pedido exige estar sentado, o preço vem do catálogo, o Tonico entrega na mesa, os itens chegam ao estado do navegador em cima do tampo, levantar estorna e saldo insuficiente recusa.
- `apps/server/test/served.test.ts`: os itens ficam no lado de quem pediu, dentro do tampo, longe do porta-guardanapo e uns dos outros, com o rótulo para a pessoa; a mesa cheia libera itens terminados e os antigos da própria pessoa, nunca os do vizinho sentado; cada item é consumido aos poucos e por inteiro; terminado ou deixado, espera ser recolhido (limpeza da mesa ou um a um pelo Tonico) e expira depois; pedido estornado não deixa nada.
- `apps/server/test/waiter.test.ts`: sem ninguém trabalhando, o Tonico recolhe o que terminou de uma mesa e leva ao balcão, e um pedido novo passa na frente. O Tonico leva o pedido na bandeja, para ao alcance dos lugares escolhidos (sem ficar em cima da pessoa), fica de frente para eles e só sai depois de pôr o último item. Também cobre as vagas do emprego, a exigência de estar perto da estação, o pagamento único da tarefa, a troca de estação e o descanso.
- `apps/server/test/navigation.test.ts`: há caminho do balcão até mesas dos dois andares (escada incluída), ele é seguido sem atravessar paredes, o terraço é alcançado de qualquer ponto de partida no balcão, a busca em fatias acha o mesmo caminho e o destino inalcançável termina dentro do limite.
- `apps/server/test/jobs.test.ts`: mesas só entram nas tarefas quando sujas, uma por ajudante, e a tarefa troca quando a mesa fica limpa; o pedido dado ao ajudante vem primeiro (balcão, depois mesa) e volta para a sala quando o turno acaba.
- `apps/server/test/economy.integration.test.ts` também cobre: levantar com pedido pendente é recusado; cancelar no balcão estorna uma vez; o que ficou na mesa vira tarefa e some ao limpar; um cliente pede para um ajudante, que pega no balcão, leva na bandeja e serve, recebendo pelas duas tarefas.
- `apps/server/test/jukebox.integration.test.ts`: só escolher um vídeo cobra, e o telão tem estado próprio.
