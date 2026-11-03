# Truco: a mesa do salão de jogos

A mesa de truco fica no salão de jogos, no andar de cima, entre a janela e a primeira sinuca. Jogam de 1 a 4 pessoas, em duas duplas, e os NPCs completam os lugares vazios. A partida vale moedas do jogo. O servidor decide tudo: o navegador desenha a mesa e envia pedidos.

## O regulamento

A fonte das regras é o [regulamento da Copag](https://blog.copag.com.br/regras/truco), somado ao que o dono do jogo definiu: a ordem das manilhas, as sequências de pedidos e os sinais de rosto.

| Regra | Como funciona |
| --- | --- |
| Baralho | 40 cartas, sem 8, 9, 10 e curingas. Três cartas para cada um e uma vira |
| Ordem das cartas | Manilhas, depois 3, 2, Ás, Rei, Valete, Dama, 7, 6, 5 e 4. Duas cartas comuns do mesmo valor empatam, seja qual for o naipe |
| Manilhas | O valor seguinte ao da vira; depois do 3 vem o 4. Do naipe mais forte ao mais fraco: Paus (Zap), Copas (Copeta), Espadas (Espadilha) e Ouros (Pica-fumo) |
| Ordem de jogo | O baralho e a vez andam no sentido anti-horário. O Mão, à direita de quem dá as cartas, joga primeiro. O Pé, quem deu, joga por último. A cada mão, o baralho passa para a frente |
| Mão | Vale 1 tento. Até três vazas: quem vencer duas ganha. A partida vai a 12 tentos |
| Pedidos | Truco (3), Seis (6), Nove (9) e Doze (12), a qualquer hora da mão, também fora da vez |
| Respostas | Mandar cair, aumentar ou fugir. Quem foge paga o que a mão valia: 1, 3, 6 ou 9 |
| Primeira iniciativa | Um parceiro responde pelos dois, e a resposta dele vale. O mesmo vale na Mão de 11 |
| Limite de tentos | Quem fecharia a partida com o valor atual da mão não pode aumentar, salvo com o placar empatado. Quem tem 9 não pede Seis, a não ser em 9 a 9 |

### Carta encoberta

Da 2ª vaza em diante, na sua vez, a carta pode ir virada para a mesa (**Encoberta**, tecla **6**). Ela não vale nada: perde de qualquer carta aberta e nunca é revelada, nem no fim da mão. O servidor descarta a face na hora, então ela não chega a nenhum navegador. Na 1ª vaza não é permitido. A regra vem do [artigo de Truco Paulista da Copag](https://blog.copag.com.br/a-copag/afinal-como-se-joga-o-truco-paulista). Se os quatro jogarem encoberta, a vaza empata. Uma carta encoberta não conta como "carta exposta" para os empates.

### Empates

| Vazas | Quem leva a mão |
| --- | --- |
| Empate na 1ª | Quem vencer a próxima que não empatar. Se a 2ª empatar também, a 3ª decide |
| Empate na 2ª | Quem venceu a 1ª, na hora |
| Empate na 3ª | Quem venceu a 1ª |
| Três empates, sem pedido | Ninguém pontua e o baralho passa |
| Três empates, com pedido | 3 tentos. Quem pediu **com carta exposta** perde (os adversários levam). Quem pediu **no escuro** ganha (*joga pelo empate*) |
| Três empates na Mão de 11 | 3 tentos para os adversários da dupla que está com 11 |
| Três empates na Mão de Ferro | Ninguém pontua e o baralho passa |

Se os dois parceiros jogam a carta mais forte da vaza, a vaza é da dupla. Só há empate entre duplas adversárias.

### Mão de 11 e Mão de Ferro

**Mão de 11**: quando só uma dupla tem 11 tentos. Os dois veem as cartas um do outro antes de decidir. Se jogam, a mão vale 3, para quem ganhar. Se fogem, os adversários levam 1. Ninguém pede Truco. Com vitória garantida (Casal Maior, ou cartas que nenhuma combinação derrota), o botão é **Mostrar**: a dupla leva os 3 tentos sem jogar.

**Mão de Ferro**: no 11 a 11. Não há decisão nem pedido, e quem ganhar ganha a partida. Na variação **Escuro**, escolhida antes da partida, ninguém vê as próprias cartas: cada um escolhe uma carta virada, e ela só aparece quando cai na mesa.

### Sinais

Ao lado de cada jogador há um rosto neutro 😐. Quem clica no próprio rosto escolhe um sinal, que aparece por 0,9 s e volta ao neutro:

| Rosto | Manilha | Gesto do regulamento |
| --- | --- | --- |
| 😉 | Zap | Piscar um olho |
| 🤨 | Copeta | Erguer a sobrancelha |
| 😕 | Espadilha | Encher a bochecha ou entortar a boca |
| 😛 | Pica-fumo | Mostrar a ponta da língua |

A mesa toda vê o rosto, como numa mesa de verdade: quem estiver olhando, pega. O sinal não precisa ser verdadeiro. Os NPCs também fazem sinais, e cada personalidade lê os rostos dos outros de um jeito.

## O que o regulamento deixou em aberto

Estas decisões são do jogo, não do regulamento:

| Ponto | Decisão | Por quê |
| --- | --- | --- |
| Empate na 2ª e na 3ª vaza | A tabela de desempate do [artigo de Truco Paulista da Copag](https://blog.copag.com.br/a-copag/afinal-como-se-joga-o-truco-paulista) | A página de regras só trata dos três empates e do empate na 1ª |
| Pedir mais depois de aceitar | A dupla que aceitou pode aumentar depois, a qualquer hora | É o costume. O regulamento só descreve a sequência |
| "Carta exposta" e "no escuro" | Exposta: já havia carta na mesa, na vaza, quando pediu. No escuro: não havia | O regulamento usa os termos sem defini-los |
| Quem recomeça depois de empate | Quem mostrou primeiro a carta do empate | O regulamento não diz |
| Mão de Ferro, valor | 1 tento, que já fecha a partida | O regulamento não diz, e não muda o resultado |
| Três empates com Seis, Nove ou Doze | 3 tentos, como está escrito | O regulamento diz 3, sem citar o valor da mão |
| Exemplo das manilhas | Copas ganha de Espadas | O exemplo da página diz o contrário da própria lista de naipes, e a lista é repetida em outro trecho |
| Três empates, FAQ | O baralho passa para a frente | A FAQ diz "rodada nova", o texto principal diz "passando o maço", e as duas coisas combinam |

Regras da mesa física que não entram:

- **Maço, corte, corte seco, dar por cima ou por baixo**: o servidor embaralha com `crypto.randomInt` e distribui. Ninguém toca no baralho, então não há o que proibir na Mão de Ferro.
- **Pedir Truco na Mão de 11**: o regulamento pune com 3 tentos, e o pedido do dono do jogo é que não seja permitido. Aqui o botão não existe e o servidor recusa.
- **Palavras durante a jogada ("Jorge", "Truca")**: o painel cobre o chat e os sinais são só os quatro rostos, mas o jogo não pune quem usar a voz por proximidade ou escrever no chat.

## Apostas

As moedas são as da carteira real. Cada pessoa aposta o mesmo valor, e quem ganha recebe de volta **o dobro do que pôs**: a soma das apostas da mesa dividida por dois. Quem perde não recebe nada.

| Partida | Aposta por pessoa | NPCs |
| --- | --- | --- |
| Contra NPCs, nível **Iniciante** | 100 | Todos iniciantes: Juninho, Tati Novata e Beto do Bingo |
| Contra NPCs, nível **Médio** | 150 | Todos de nível médio: Seu Arlindo, Bira Blefe e Zé Provoca |
| Contra NPCs, nível **Experiente** | 200 | Todos experientes: Dona Neide, Dra. Valquíria e Mestre Tião |
| **Entre jogadores** (gente nas duas duplas) | A partir de 400, até 5.000, de 100 em 100 | Se faltar gente, os NPCs do nível escolhido completam |

Duas pessoas na mesma dupla contra dois NPCs jogam pelo nível. Basta uma pessoa em cada dupla para ser partida entre jogadores. Os valores ficam na tabela de preços, grupo **Jogos** (`truco:level-iniciante`, `truco:level-medio`, `truco:level-experiente`, `truco:min-bet` e `truco:max-bet`).

Exemplos no nível Experiente, com 200 por pessoa: a mesa soma 800, e cada vencedor recebe 400 (os seus 200 mais 200 de lucro). Sozinho com um NPC parceiro, você recebe 400. Em dupla com outra pessoa, cada um recebe 400. **A parte dos NPCs é da casa**: contra eles, a vitória cria moedas e a derrota as retira da economia.

Como as moedas andam:

- **Confirmação**: ninguém paga até todos confirmarem (**Apostar**). Qualquer mudança de nível, valor, lugar ou gente na mesa pede a confirmação de novo.
- **Cobrança**: passa por `GameBank('truco')`, com diário em disco (`.data/world/outbox.truco.jsonl`), como no blackjack e no pebolim. Se a carteira de alguém recusar, ou alguém sair durante a cobrança, a partida não começa e todas as apostas voltam.
- **Prêmio**: `POST /api/internal/truco/settle` (`WalletService.settleTruco`) paga uma vez por partida e jogador, no máximo 2 vezes a aposta dessa pessoa no livro-caixa. Diferente do pebolim, não há conferência do pote, porque a parte dos NPCs é da casa.
- **Sair no meio**: com **Sair**, E, ao ser derrubado ou ao cair da conexão sem voltar, a pessoa perde a aposta na hora, mesmo que a dupla dela ganhe depois. Um NPC do nível assume o lugar.
- **Servidor caiu**: ao subir, as apostas das partidas que não terminaram voltam para a carteira.

Uma partida em andamento não aceita gente nova. O resultado fica na tela por 15 s (ou até **Nova partida**), e a mesa volta para o lobby pedindo novas apostas.

## A mesa, passo a passo

```
lobby → shuffling → dealing → (eleven) → playing ⇄ bet
                                            ↓
                 hand-end ← … ← trick-end ←─┘
                    ↓
            próxima mão ou match-end → (Jogar de novo)
```

1. **lobby**: quem chega escolhe o lugar. O segundo jogador senta de frente para o primeiro, como parceiro, e pode trocar de lugar. Qualquer um escolhe o nível e o valor, e a partida começa quando todos confirmam a aposta. Lugar vazio vira NPC do nível.
2. **shuffling** e **dealing**: 1 s de embaralhar e 2,1 s de distribuir (`TRUCO`).
3. **eleven**: só na Mão de 11.
4. **playing**: 25 s por carta. Sem resposta, a primeira carta da mão vai para a mesa. O NPC pensa de 1,1 s a 2,9 s.
5. **bet**: 20 s para responder. Quando a dupla tem uma pessoa e um NPC, o NPC espera a pessoa e só responde quando o tempo acaba. Sem NPC na dupla, o silêncio é fuga.
6. **trick-end**: 1,7 s com a carta vencedora em destaque.
7. **hand-end**: 3,2 s com o resultado. O placar sobe.
8. **match-end**: vitória ou derrota, com o que ganhou ou perdeu em moedas. **Nova partida** ou **Sair**.

Quem sai é substituído por um NPC na hora, e a partida continua. Sem nenhuma pessoa na mesa, ela volta ao lobby.

## Privacidade

As cartas nunca entram no estado sincronizado da sala. `TrucoTable.viewFor` monta a visão de cada lugar, e a sala envia por mensagem (`truco.view`) só para aquela pessoa. As outras mãos aparecem como uma contagem de cartas. `partnerCards` só existe para a dupla na Mão de 11, enquanto decide. No Escuro, nem a própria mão vem aberta.

Os NPCs decidem com `TrucoGame.observe(lugar)`: as próprias cartas, as jogadas na mão, as vazas, o placar, o valor da mão, os rostos vistos e o histórico dos adversários na partida (pedidos, pedidos que perderam, fugas). Ali não há como ver a mão de outro.

## NPCs

`trucoDecide` imagina as cartas que não vê, joga a mão até o fim de cabeça várias vezes (Monte Carlo) e estima a chance de ganhar. A partir daí, cada personalidade decide com seus números (`TRAITS` em `ai.ts`).

Os níveis diferem de verdade, e não só no nome. O nível Experiente testa de cabeça cada carta da mão e joga a melhor. O Médio segue regras práticas e erra de vez em quando. O Iniciante estima mal, gasta a carta mais alta para levar a vaza e às vezes joga a carta errada. Em 200 partidas por confronto, com a medição feita ao ajustar os números: Experiente vence o Iniciante em cerca de 70%, Experiente vence o Médio em 62% e Médio vence o Iniciante em cerca de 58%. O truco tem muita sorte, então uma partida isolada não diz muito.

| Personalidade | Como joga |
| --- | --- |
| Conservador (Seu Arlindo, nível Médio) | Só pede com mão muito boa e foge cedo |
| Blefador (Bira Blefe, nível Médio) | Pede sem cartas com frequência e faz sinais falsos |
| Estratégico (Dra. Valquíria, nível Experiente) | Imagina mais mãos e calcula o que vale aceitar |
| Experiente (Dona Neide e Mestre Tião, nível Experiente) | Como o estratégico, mas lê melhor os rostos e às vezes segura o pedido |
| Iniciante (Juninho, Tati Novata e Beto do Bingo, nível Iniciante) | Erra a estimativa e às vezes joga a carta errada |
| Provocador (Zé Provoca, nível Médio) | Pede muito e fala o tempo todo |

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `packages/shared/src/truco/cards.ts` | Baralho, força das cartas, manilha, vitória garantida |
| `packages/shared/src/truco/betting.ts` | Escada de pedidos e limite de tentos |
| `packages/shared/src/truco/scoring.ts` | Quem leva a mão e a regra dos três empates |
| `packages/shared/src/truco/game.ts` | `TrucoGame`: a partida, sem relógio, rede ou desenho |
| `packages/shared/src/truco/ai.ts` | Personalidades, decisões, sinais e falas dos NPCs |
| `packages/shared/src/truco/stakes.ts` | Níveis, valores e limites das apostas |
| `packages/shared/src/truco/index.ts` | Esquemas das mensagens, rostos e `TrucoView` |
| `apps/server/src/minigames/truco.ts` | `TrucoTable`: lugares, apostas, relógio, NPCs e visão de cada pessoa |
| `apps/api/src/wallet-service.ts` | `settleTruco` |
| `apps/server/src/BarRoom.ts` | Mensagens `truco.*`, cadeiras (`TRUCO_SEATS`) e saída |
| `apps/web/src/truco/` | Painel (`table.ts`), cartas (`card.ts`), sons (`sounds.ts`) e estilo |
| `apps/web/src/engine/BarScene.ts` | `buildTruco`: a mesa em 3D |

A mesa fica em `TRUCO_TABLE` (`packages/shared/src/world.ts`), na posição que o dono escolheu: x 5,82, y 3,45, z −5,16, rotação 185°.

Para ver o painel sem servidor, abra `tests/fixtures/truco.html` pelo Vite (`/@fs/<caminho>`). A barra do topo escolhe cenas fictícias, roda uma mão de demonstração ou joga de verdade contra os NPCs, com a mesma `TrucoTable` do servidor. `?live` já abre jogando.

## Testes

- `apps/server/test/truco-rules.test.ts`: baralho, manilhas, ordem, todos os padrões de empate, escada de pedidos, primeira iniciativa, limite de tentos, Mão de 11, Casal Maior, Mão de Ferro, Escuro, carta encoberta, valores das apostas, cada nível vencendo o de baixo e partidas inteiras entre todas as personalidades.
- `apps/server/test/truco-table.test.ts`: lugares, níveis e seus NPCs, confirmação, cobrança recusada, prêmio em dobro, perda de quem sai, privacidade das visões, tempo esgotado, sinais e partida inteira em cada nível.
- `apps/api/test/wallet.test.ts`: o acerto paga uma vez, só contra a aposta da própria pessoa, até 2 vezes.
- `tests/e2e/truco.spec.ts`: duas pessoas andam até a mesa, veem o mínimo de 400 entre jogadores, apostam no nível Médio contra dois NPCs, são cobradas de verdade, cada uma vendo só as próprias cartas, uma carta vai encoberta, e saem.
