# Blackjack: o 21 do Baiano

A mesa de blackjack fica no salão de jogos, no andar de cima. Até quatro pessoas jogam contra o dealer e apostam moedas do jogo. As regras seguem as de cassino. O servidor decide tudo: o navegador só desenha a mesa e envia pedidos.

## Regras da casa

| Regra | Como funciona |
| --- | --- |
| Baralho | Seis baralhos (312 cartas), embaralhados de novo a cada rodada (Fisher–Yates com `crypto.randomInt`). Por isso, contar cartas não adianta |
| Dealer | Para em qualquer 17, inclusive com Ás valendo 11 (S17) |
| Conferência | Com Ás ou carta de valor 10 à mostra, o dealer confere a carta virada. Se tiver blackjack, a rodada termina na hora, antes de qualquer dobra ou divisão |
| Blackjack | Ás + carta de valor 10 nas duas primeiras cartas paga 3 para 2. Se a aposta for ímpar, a metade é arredondada para baixo, como nas fichas de cassino |
| Seguro | Oferecido quando o dealer mostra um Ás. Custa metade da aposta e paga 2 para 1 se o dealer tiver blackjack. Quem tem blackjack e aceita recebe 1 para 1 em qualquer caso (*even money*) |
| Dobrar | Com as duas primeiras cartas, inclusive depois de dividir. Dobra a aposta da mão e recebe uma carta só |
| Dividir | Duas cartas do mesmo valor (um 10 e um Rei também), até quatro mãos. Ases divididos recebem uma carta cada e param. 21 depois de dividir vale 21, não blackjack |
| Desistir | Desistência tardia: só como primeira decisão da mão original, depois da conferência. Devolve metade da aposta |
| Tempo | 12 s de apostas depois da primeira (1,5 s quando todos os sentados já apostaram), 8 s para o seguro e 20 s por decisão (`BLACKJACK_TURN_MS` no `.env`). Sem resposta, a mão para |

Com essas regras e a estratégia básica, a vantagem da casa fica em torno de 0,4%. No longo prazo, a mesa retira um pouco de moeda da economia.

A ordem de jogo começa pela cadeira à esquerda do dealer, que é a da direita de quem olha a mesa (cadeira 3), e segue até a cadeira 0, como num cassino.

## Fases da rodada

```
waiting → betting → closing → dealing → (insurance) → playing → dealer → results → waiting
```

1. **waiting**: mesa parada. A primeira aposta abre a rodada para todos.
2. **betting**: janela de apostas. Cada um escolhe as fichas e confirma (**Apostar**). Dá para trocar ou retirar a aposta até a janela fechar. Nenhuma moeda sai da carteira nessa fase.
3. **closing**: a janela fecha e as apostas são cobradas, todas de uma vez. Se a carteira de alguém recusar, essa pessoa fica de fora da rodada e recebe o aviso.
4. **dealing**: duas cartas para cada um e para o dealer (uma virada). A fase dura o tempo da animação (350 ms por carta).
5. **insurance**: só quando o dealer mostra um Ás.
6. **playing**: cada mão na sua vez.
7. **dealer**: a carta virada aparece e o dealer compra até 17, uma carta a cada 850 ms. Se nenhuma mão depende do total do dealer (todas estouraram, desistiram ou são blackjack), ele só vira a carta.
8. **results**: 7 s com os ganhos na mesa. Em seguida a mesa volta para **waiting**, e cada lugar guarda a última aposta para **Repetir**.

Quem senta no meio de uma rodada assiste e entra na próxima. Quem levanta no meio da rodada, ou é derrubado, ou cai da conexão, tem as mãos paradas onde estão. Essas mãos são acertadas no fim normalmente, e a cadeira fica livre depois dos resultados. Sair da mesa não apaga uma derrota nem evita uma decisão. Antes de sair, o painel avisa: "Suas mãos param onde estão".

## Moedas: o caminho de cada aposta

As moedas são as da carteira real (`wallets` e `currency_ledger` na API). Nada é calculado no navegador.

| Passo | Onde | O que acontece |
| --- | --- | --- |
| Aposta, dobra, divisão, seguro | `BlackjackBank.stake` → `POST /api/internal/wallet` | Primeiro a intenção é gravada no diário em disco (`.data/world/outbox.blackjack.jsonl`). Depois a carteira é debitada com o motivo `blackjack:bet:<rodada>`. Uma recusa (4xx) apaga a intenção e a ação não acontece. Se a API não responder, a aposta fica como **incerta** |
| Fim da rodada | `BlackjackBank.settle` → `POST /api/internal/blackjack/settle` | Numa só gravação atômica do diário, as apostas do jogador naquela rodada viram um acerto. O acerto leva o pagamento e a lista das apostas confirmadas e das incertas. É entregue na hora e reenviado a cada 3 s enquanto a API estiver fora |
| A API paga | `WalletService.settleBlackjack` | Paga uma vez por rodada e jogador (lançamento `blackjack:<rodada>:<jogador>`, motivo `blackjack:payout:<rodada>`). Antes, confere três coisas: toda aposta confirmada existe no livro-caixa como débito daquele jogador naquela rodada; o pagamento não passa de 2,5 vezes o apostado (`BLACKJACK_MAX_RETURN`, o máximo possível, um blackjack); e cada aposta incerta é devolvida só se o débito existir |
| Queda do servidor | `BlackjackBank.recover` | Ao subir, as apostas de rodadas que não terminaram viram acertos de devolução (`blackjack:refund:<rodada>`): volta exatamente o que foi descontado |

O acerto não exige sessão ativa, porque o livro-caixa é a prova. Quem saiu da conta no meio da rodada recebe do mesmo jeito. A rota de carteira comum continua recusando qualquer crédito que não seja trabalho ou estorno, então não há outro jeito de o mundo pagar uma aposta.

A estatística da conta (`/api/stats`, rodadas, vitórias, derrotas e empates) conta o resultado líquido da rodada: ganhou se recebeu mais do que apostou. Ela continua indo pelo outbox de resultados. No admin, as moedas do blackjack aparecem como origem **Blackjack** na economia. O log mostra **Rodada de blackjack** (apostado, recebido e o resultado de cada mão) e **Prêmio do blackjack recusado** se a API recusar um acerto.

Os limites de aposta ficam na tabela de preços, grupo **Jogos**: `blackjack:min-bet` (10) e `blackjack:max-bet` (500), por mão. O máximo nunca fica abaixo do mínimo (`betLimits`). Uma mudança vale a partir da próxima aposta.

## Contra falhas e trapaças

- **Cartas privadas**: o sapato e a carta virada do dealer nunca entram no estado sincronizado. A carta virada vai como `?` até virar.
- **Sem contagem**: sapato novo a cada rodada.
- **Clique repetido**: cada decisão leva a mão da vez e o `move` da mesa, um contador que muda a cada jogada e a cada troca de vez. Um clique duplo, ou um clique feito para uma decisão que já passou, é recusado ("Essa jogada já passou"). Antes, dividir duas vezes seguidas passaria, porque a mão volta a ter duas cartas.
- **Ordem e identidade**: o jogador vem da sessão, nunca da mensagem. Fora da vez, a ação é recusada.
- **Valores**: aposta inteira entre os limites da mesa, validada por esquema (`blackjackBetSchema`) e de novo pela mesa. O saldo é conferido antes (cache da sala) e na cobrança (API, com trava da carteira).
- **Ações legais**: dobrar, dividir e desistir só quando as regras permitem. A conferência acontece no servidor, não no botão.
- **Cobrança em andamento**: enquanto um débito de dobra, divisão ou seguro não volta, a mão espera. Nenhuma outra ação é aceita e o tempo não corre contra o jogador. O pedido à API tem limite de 4 s.
- **Limite de mensagens**: aposta e decisão aceitam 4 por segundo, o seguro 2.
- **Desmaio e conexão**: desmaiado não aposta nem joga (`NEEDS_CONSCIOUS`). Cair da conexão para as mãos.

## O painel

O painel (`apps/web/src/blackjack/table.ts` e `blackjack.css`) é um feltro violeta, preso ao centro do rodapé. Enquanto você está sentado, a barra de ações e os avisos de tecla saem da frente e o que está sendo consumido sobe para o topo.

- **Topo**: nome da mesa, limites, regras (ícone de ajuda), som da mesa (liga e desliga, salvo neste navegador) e **Sair**.
- **Feltro**: o dealer e o sapato no alto, com a impressão "Blackjack paga 3 para 2". Abaixo, a frase da fase e a barra do tempo, que fica laranja nos últimos 5 s da sua vez. Depois vêm as quatro cadeiras em arco. Cada uma mostra as mãos com o total ("7/17" quando o Ás ainda vale 11, "BJ" no blackjack), o selo do resultado, as fichas no círculo da aposta e o nome.
- **Cartas**: cada carta é guardada pela posição na distribuição (`seq`). A carta nova voa do sapato no ritmo do servidor, a virada gira quando o dealer a mostra, e na divisão a carta desliza para a mão nova. No fim da rodada, as cartas voltam para o sapato. Com movimento reduzido, nada voa.
- **Apostas**: fichas de 5, 10, 25, 100 e 500 nas cores de cassino, **Limpar**, **×2**, **Repetir** e **Apostar**. A aposta em montagem aparece apagada no seu círculo até ser confirmada. Nos resultados, **Repetir X na próxima** já deixa a aposta feita quando a mesa abrir de novo.
- **Decisões**: Pedir, Parar, Dobrar, Dividir e Desistir, com as teclas **1 a 5**. No seguro, **1** aceita e **2** recusa. Os botões que as regras não permitem ficam apagados.
- **Resultados**: o líquido de cada um sobe do círculo da aposta (dourado ao ganhar, vermelho ao perder), as fichas perdidas vão para a casa e a frase da fase diz quanto você ganhou.
- **Sons**: carta, virada, fichas, a sua vez, vitória, blackjack e derrota, sintetizados no navegador (`sounds.ts`) e no volume geral do jogo.
- **Tamanhos**: o painel se ajusta à própria largura (*container queries*). Em telas largas, as quatro cadeiras ficam lado a lado. No celular, ficam duas a duas, as vazias somem e os botões quebram em duas linhas. Em telas baixas, as cartas diminuem.

Para ver o painel sem servidor, abra `tests/fixtures/blackjack.html` pelo Vite (`/@fs/<caminho>`). Lá, `window.fixture.set(mesa)` desenha qualquer estado.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `packages/shared/src/blackjack.ts` | Regras e tempos (`BLACKJACK`), valor da mão, rótulo do total, pagamentos, limites, fichas e esquemas das mensagens |
| `apps/server/src/minigames/blackjack.ts` | A mesa: fases, sapato, decisões, conferência, dealer e acerto |
| `apps/server/src/minigames/blackjack-bank.ts` | Diário de apostas e acertos, entrega e recuperação |
| `apps/server/src/BarRoom.ts` | Mensagens `blackjack.join`, `blackjack.leave`, `blackjack.bet`, `blackjack.action` e `blackjack.insurance`, cadeira mais próxima, estado sincronizado (`TableState`) e log |
| `apps/api/src/wallet-service.ts` | `settleBlackjack` |
| `apps/web/src/blackjack/` | Painel, sons e estilo |

## Testes

- `apps/server/test/blackjack.test.ts`: regras (soft 17, 3:2, conferência, seguro e *even money*, dobra, divisão, ases, quatro mãos, desistência), clique repetido, vez, tempo, cobrança pendente, saída no meio, aposta recusada e o diário do banco (incerta, reinício, devolução e recusa definitiva).
- `apps/api/test/wallet.test.ts`: o acerto paga uma vez, só contra apostas da própria rodada, até 2,5 vezes, e devolve as incertas pelo valor real.
- `apps/server/test/room.integration.test.ts`: limites da aposta, cobrança das duas apostas pela API e a carta virada fora do estado.
- `tests/e2e/bar.spec.ts`: caminhar até a mesa, apostar pelas fichas, jogar pelo teclado até o acerto e ver a estatística.

> As moedas não podem ser compradas com dinheiro real. Se um dia puderem, apostar moedas vira jogo de azar com valor econômico, com risco jurídico no Brasil e nas lojas de aplicativos. Antes disso, é preciso uma avaliação jurídica.
