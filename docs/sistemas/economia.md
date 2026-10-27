# Economia: moedas, balcão, mesa, empregos e mídia

As moedas são da conta e ficam na API. O mundo só **pede** mudanças. Cada pedido tem um identificador próprio, então repetir a chamada nunca cobra nem paga duas vezes. Não existe dinheiro real.

## Onde as moedas entram e saem

| Origem | Valor | Quando cobra / paga | Estorno |
| --- | --- | --- | --- |
| Balcão do Magrão | preço do item (long neck 30, copo americano 20) | ao pedir | se o pedido cair antes de servir (levantar, cair, sair, desconectar) |
| Mesa, com o Tonico | soma do cardápio (até 4 itens) | ao pedir | se a pessoa sair da mesa, se não houver caminho ou se a administração cancelar |
| Jukebox | 15 por vídeo novo | ao tocar um link | se o comando falhar depois da cobrança (revisão mudou, a pessoa se afastou) |
| TVs | 25 por vídeo novo | ao tocar um link | idem |
| Telão do palco | 60 por vídeo novo | ao tocar um link | idem |
| Ajudante do Magrão (emprego) | 6 por tarefa concluída | ao terminar a tarefa | — |

Pausar, continuar, parar e desligar a mídia são de graça. Os preços estão em `MEDIA_PRICES` e `ITEM_CATALOG` (`packages/shared`). A mídia pode ser ajustada sem alterar o código, com `PRICE_JUKEBOX`, `PRICE_TV` e `PRICE_TELAO` no ambiente do mundo (`0` torna gratuito).

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
3. O Tonico sai da ronda e vai até o balcão (`PICKUP_POINT`), espera o preparo (3,5 s), leva o pedido até a mesa, entrega (1,8 s) e volta. Enquanto serve, os eventos não o interrompem.
4. Na entrega, os efeitos de todos os itens são aplicados com a pessoa sentada.

O caminho sai de `apps/server/src/world/navigation.ts`: um A* sobre uma grade de 35 cm ancorada no ponto de partida. Ele usa as mesmas regras de piso, colisão, portas e escada dos jogadores, então não há navmesh para gerar nem para manter em sincronia com o mapa. Um mapa maior ou uma porta fechada não exigem nada a mais. A busca tem limite. Se não houver caminho, o pedido é estornado com uma mensagem.

## Empregos

`JOBS` (`packages/shared/src/economy.ts`) descreve cada emprego: vagas, pagamento, ponto de início, estações, tempo de cada tarefa, limite de inatividade, duração máxima do turno e descanso. O primeiro emprego é o **Ajudante do Magrão**, com 2 vagas: repor as geladeiras, lavar os copos e limpar as mesas do salão.

- **J** abre os empregos. O turno começa perto do balcão do térreo e mostra a tarefa num cartão do HUD.
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
- NPCs e uma tabela de jogadores com posição, animação, interação, emprego e saldo.

Os comandos conferem o papel `admin` da sessão, que é revalidado a cada rodada de manutenção, e ficam registrados no log do mundo (`admin_job`, `admin_table_cancel`, `admin_media_off`). As alterações de emprego valem para a sala até o mundo reiniciar.

## Testes

- `apps/api/test/wallet.test.ts`: cobrança única com pedidos simultâneos, saldo insuficiente, motivos recusados, estorno único e limitado, teto diário do trabalho e exigência de sessão e segredo.
- `apps/server/test/economy.integration.test.ts`: em WebSockets reais, o pedido exige estar sentado, o preço vem do catálogo, o Tonico entrega na mesa, levantar estorna e saldo insuficiente recusa. Também cobre as vagas do emprego, a exigência de estar perto da estação, o pagamento único da tarefa, a troca de estação e o descanso.
- `apps/server/test/navigation.test.ts`: há caminho do balcão até mesas dos dois andares (escada incluída), ele é seguido sem atravessar paredes, e o destino inalcançável termina dentro do limite.
- `apps/server/test/jukebox.integration.test.ts`: só escolher um vídeo cobra, e o telão tem estado próprio.
