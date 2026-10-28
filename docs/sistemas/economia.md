# Economia: moedas, balcão, mesa, empregos e mídia

As moedas são da conta e ficam na API. O mundo só **pede** mudanças. Cada pedido tem um identificador próprio, então repetir a chamada nunca cobra nem paga duas vezes. Não existe dinheiro real.

## Onde as moedas entram e saem

| Origem | Valor | Quando cobra / paga | Estorno |
| --- | --- | --- | --- |
| Balcão do Magrão | preço do item (long neck 30, copo de chopp 20) | ao pedir | se o pedido cair antes de servir (levantar, cair, sair, desconectar) |
| Mesa, com o Tonico | soma do cardápio (até 4 itens) | ao pedir | se a pessoa sair da mesa, se não houver caminho ou se a administração cancelar |
| Jukebox | 15 por vídeo novo | ao tocar um link | se o comando falhar depois da cobrança (revisão mudou, a pessoa se afastou) |
| TVs | 25 por vídeo novo | ao tocar um link | idem |
| Telão do palco | 50 por vídeo novo | ao tocar um link | idem |
| Ingresso do palco | 200, vale 30 min | ao comprar na escada do palco | se a pessoa sair de perto da escada (ou mudar de sessão) antes de receber o ingresso |
| Ajudante do Magrão (emprego) | 6 por tarefa concluída | ao terminar a tarefa | — |

Pausar, continuar, parar e desligar a mídia são de graça. Os preços estão em `MEDIA_PRICES`, `STAGE_PASS` e `ITEM_CATALOG` (`packages/shared`). Eles podem ser ajustados sem alterar o código, com `PRICE_JUKEBOX`, `PRICE_TV`, `PRICE_TELAO` e `PRICE_STAGE` no ambiente do mundo (`0` torna gratuito). O motivo no extrato do ingresso é `stage:pass`.

## Palco

Só sobe no palco do quintal quem tem ingresso. Ele é comprado com **E** ao pé da escada do palco (lado oeste), onde fica o blip magenta, e vale 30 minutos (`STAGE_PASS`). Enquanto vale, a pessoa sobe e desce à vontade. Se acabar lá em cima, ela pode ficar até descer; para subir de novo, precisa de outro ingresso. Não se compra um ingresso novo enquanto o atual vale.

O bloqueio está no movimento compartilhado (`movePlayer`, `packages/shared/src/world.ts`): sem ingresso, os degraus seguram o corpo como uma parede, no servidor e na predição do navegador. O mundo guarda o vencimento em `Player.stageUntil` e o zera quando vence, então os dois lados decidem igual. O ingresso é da sala: reiniciar o mundo apaga os ingressos, como a jukebox e as TVs.

Lá em cima, os quatro lugares de músico (violão, cavaquinho, bateria e vocal) são de graça: veja [músicos do palco](palco.md).

Pôr vídeo no telão é cobrado à parte (50 moedas por vídeo novo) e não exige ingresso: basta ir ao blip turquesa, no meio da frente do palco, e apertar **E**. De cima do palco, a borda da frente também serve.

Os dois blips do palco (escada e telão) só aparecem para quem está no quintal e embaixo do palco. O quintal é a área do palco (`inStageArea`): fica dentro dos muros do lote, até a parede dos fundos do prédio. No salão, na rua ou no andar de cima, os blips não aparecem.

## Garantias

`/api/internal/wallet` (`apps/api/src/wallet-service.ts`) aplica cada mudança numa transação com a carteira travada:

- registra a linha do livro-caixa `world:<requestId>` antes de mexer no saldo; uma repetição devolve o resultado já aplicado;
- o saldo nunca fica negativo nem passa de `MAX_COIN_BALANCE`;
- o mundo só pode **creditar** por trabalho (`job:`) ou estorno (`refund:<id da cobrança>`). Um estorno devolve no máximo o valor cobrado, uma única vez, e só da mesma conta;
- o trabalho paga até `JOB_DAILY_CAP` (400) moedas por pessoa e por dia. Uma tarefa acima do limite fica registrada com valor 0, para nunca ser paga depois;
- só a sessão viva do jogador é aceita, com o segredo interno.

No mundo, estornos e pagamentos que a API não aceitou ainda (API fora do ar) ficam em `WalletRetries` com o mesmo identificador e são reenviados a cada rodada de manutenção (3 s). Já uma cobrança que não passa recusa a ação: nada fica pendente. A métrica `bar_world_wallet_credits_pending` mostra a fila.

## Pedido na mesa (Tonico)

1. Sentado, a pessoa aperta **T** (ou **Pedir na mesa** no painel de ações, ou o botão **Pedir ao Tonico**) e escolhe até 4 itens.
2. O mundo cobra e coloca o pedido na fila (máximo de 8, um por pessoa).
3. O Tonico sai da ronda e vai até o balcão (`PICKUP_POINT`), espera o preparo (3,5 s) e leva o pedido na **bandeja**, com os objetos 3D de cada item em cima. Na mesa, ele para ao lado de quem pediu, pega um item de cada vez com a mão direita e o põe no tampo (0,3 s de preparo e 0,7 s por item), e volta. Enquanto serve, os eventos não o interrompem.
4. Na entrega, os efeitos de todos os itens são aplicados com a pessoa sentada.
5. **Os itens ficam na mesa.** Todos veem os mesmos objetos nos mesmos lugares. Eles continuam lá enquanto a pessoa está sentada e por mais 4 min depois que ela levanta (`LEFTOVER_MS`), a menos que o ajudante limpe a mesa antes.

### Bandeja e lugares na mesa

- **Onde cada item fica:** quando o Tonico sai do balcão, o mundo (`apps/server/src/world/served.ts`) escolhe os lugares no quarto do tampo à frente de quem pediu: longe do porta-guardanapo numerado, sem encostar nos outros itens e o mais perto possível da borda dessa pessoa, com o rótulo virado para ela. O tamanho de cada item vem de `SERVED_PROPS` (`packages/shared/src/economy.ts`), igual ao objeto real.
- **Mesa cheia:** saem primeiro as sobras de quem já levantou (as mais antigas antes) e depois os itens antigos da própria pessoa. O que um vizinho ainda sentado está consumindo nunca some. Há no máximo 96 itens no bar inteiro.
- **Onde o Tonico para:** ao lado da pessoa, a até 75 cm do centro do pedido e nunca em cima dela. Se esse ponto não tiver caminho, ele volta à regra antiga (até 90 cm do assento).
- **Estado sincronizado:** `state.served` traz cada item (posição, giro, mesa e o momento em que toca o tampo). `npc.carrying` e `npc.carryingOrder` dizem o que está na bandeja. Os navegadores desenham a bandeja na mão esquerda do Tonico (IK de dois ossos, palma para cima) e animam a mão direita levando cada item da bandeja até o lugar, com o tronco levemente curvado (`apps/web/src/engine/serving-props.ts` e `BarScene.carryTray`). Quem chega depois vê os itens direto na mesa.
- **Cancelamento:** se a pessoa levanta, sai do bar ou a administração cancela, o pedido é estornado e nenhum item dele fica na mesa.
- **Limpar a mesa:** quando o *Ajudante do Magrão* termina **Limpar a mesa N**, as sobras dessa mesa somem. Os itens de quem ainda está sentado ficam.

O caminho sai de `apps/server/src/world/navigation.ts`: um A* sobre uma grade de 35 cm ancorada no ponto de partida. Ele usa as mesmas regras de piso, colisão, portas e escada dos jogadores, então não há navmesh para gerar nem para manter em sincronia com o mapa. Um mapa maior ou uma porta fechada não exigem nada a mais. A busca tem limite. Se não houver caminho, o pedido é estornado com uma mensagem.

## Empregos

`JOBS` (`packages/shared/src/economy.ts`) descreve cada emprego: vagas, pagamento, ponto de início, estações, tempo de cada tarefa, limite de inatividade, duração máxima do turno e descanso. O primeiro emprego é o **Ajudante do Magrão**, com 2 vagas: repor as geladeiras, lavar os copos e limpar as 11 mesas do salão (o que tira as sobras deixadas pelos clientes). Cada mesa é chamada pelo número escrito nela no mapa (*Limpar a mesa 7*; veja [mesas numeradas](../assets/map.md#mesas-numeradas)).

- **J** abre os empregos. O turno começa perto do balcão do térreo e mostra a tarefa no painel **Turno** do HUD, que só existe durante o turno. Ele começa no canto inferior direito (acima das ações no celular), longe do centro da tela. Como os outros painéis, pode ser arrastado pelo título, recolhido (o cabeçalho continua mostrando a contagem) e escondido pelo olho do cabeçalho ou pelo menu **Painéis**. O botão **Turno**, no topo, mostra ou esconde o painel. Posição e escolha ficam salvas por conta. O painel é montado quando a tarefa muda; só a contagem e a barra se atualizam no lugar.
- **Objetivo no mapa (blip):** a estação da tarefa ganha um anel verde no chão e uma seta girando acima dela, visível através das paredes. Na tela, um selo mostra a distância (e *suba*/*desça* quando ela está em outro andar); fora da vista, o selo vai para a borda da tela, com uma seta apontando para ela. O marcador some durante a tarefa e volta na próxima. **Só quem está trabalhando vê o blip:** a sala manda a tarefa (`job.state`) apenas para o próprio trabalhador, e o marcador é desenhado só no navegador dele (`BarScene.setObjective`; o selo em `objective-blip.ts`).
  - O marcador 3D é criado uma vez e movido de tarefa em tarefa. Recriá-lo congelava a tela na tarefa seguinte: o PlayCanvas libera a malha do anel junto com a última instância, e o marcador novo desenhava a malha liberada, com erro em todo quadro.
  - O selo é desenhado num `<canvas>` próprio, só quando muda. Mover um elemento HTML a cada quadro fazia o navegador recalcular estilos e, com serviços de acessibilidade ativos, a árvore de acessibilidade, com quedas de quadro.
- Na estação, **E** começa a tarefa. O personagem fica no lugar com a animação de uso, e **E** de novo interrompe sem pagar.
- Cada tarefa concluída paga na hora e sorteia outra estação.
- Ficar 60 s sem trabalhar encerra o turno. O turno dura até 15 min e depois exige 3 min de descanso, para a vaga não ficar presa com uma só pessoa.
- Todos veem as vagas ocupadas (`state.jobs`) e quem trabalha (`player.job`).

Para criar outro emprego, acrescente uma entrada em `JOBS` com estações tiradas dos colisores do mapa. O servidor, o HUD e o painel da administração passam a mostrá-lo sem mais código.

## Administração: Mundo ao vivo

Em **⚙ Administração → Mundo ao vivo**, a administração vê o estado da sala em tempo real (comando `admin.world`):

- ocupação, evento, créditos pendentes e fila de resultados;
- empregos: vagas, pagamento, aberto/fechado (editáveis), quem trabalha, em que estação e quanto ganhou, com **Encerrar turno**;
- pedidos do Tonico (fase atual e fila), com **Cancelar e devolver**;
- quem espera no balcão do Magrão;
- jukebox, TVs e telão (vídeo, quem escolheu, preço), com **Desligar**;
- **Bots de teste** (só em desenvolvimento): quantidade com **Aplicar**, **+5**, **+10** e **Remover todos**, o que cada bot está fazendo, o tick do mundo (p95) e, dos últimos 15 s, RTT, inputs por segundo e o event loop do processo dos bots. O mundo roda `tests/load/bots.ts` como processo filho (`apps/server/src/world/bots.ts`), muda a quantidade por IPC e recusa mais bots do que cabem (`ROOM_CAPACITY` menos os jogadores). O painel se atualiza sozinho quando todos entram ou saem. Detalhes em [tools/README.md](../../tools/README.md#bots-de-desempenho);
- NPCs e uma tabela de jogadores com posição, animação, interação, emprego e saldo.

Os comandos conferem o papel `admin` da sessão, que é revalidado a cada rodada de manutenção, e ficam registrados no log do mundo (`admin_job`, `admin_table_cancel`, `admin_media_off`, `admin_bots`; o processo dos bots registra `bots_start`, `bots_output` e `bots_exit`). As alterações de emprego valem para a sala até o mundo reiniciar.

## Testes

- `apps/api/test/wallet.test.ts`: cobrança única com pedidos simultâneos, saldo insuficiente, motivos recusados, estorno único e limitado, teto diário do trabalho e exigência de sessão e segredo.
- `apps/server/test/economy.integration.test.ts`: em WebSockets reais, o pedido exige estar sentado, o preço vem do catálogo, o Tonico entrega na mesa, os itens chegam ao estado do navegador em cima do tampo, levantar estorna e saldo insuficiente recusa.
- `apps/server/test/served.test.ts`: os itens ficam no lado de quem pediu, dentro do tampo, longe do porta-guardanapo e uns dos outros, com o rótulo para a pessoa; a mesa cheia libera sobras e itens antigos da própria pessoa, nunca os do vizinho sentado; sobras expiram e a limpeza da mesa as leva; pedido estornado não deixa nada.
- `apps/server/test/waiter.test.ts`: o Tonico leva o pedido na bandeja, para ao alcance dos lugares escolhidos (sem ficar em cima da pessoa), fica de frente para eles e só sai depois de pôr o último item. Também cobre as vagas do emprego, a exigência de estar perto da estação, o pagamento único da tarefa, a troca de estação e o descanso.
- `apps/server/test/navigation.test.ts`: há caminho do balcão até mesas dos dois andares (escada incluída), ele é seguido sem atravessar paredes, e o destino inalcançável termina dentro do limite.
- `apps/server/test/jukebox.integration.test.ts`: só escolher um vídeo cobra, e o telão tem estado próprio.
