# Luta (soco)

**R** levanta a guarda. Com a guarda alta, o **clique** dá os socos leves em sequência (jab, direto, gancho, e o jab de novo) e o **botão direito** dá o soco forte. Qualquer pessoa a pé pode ser socada, com ou sem guarda, e um soco pode matar: quem fica sem vida e sem a reserva do coração cai em ragdoll e a [Morte](morte.md) vem buscar. Cada soco que acerta mostra a vida que tirou num número que sobe do ponto do impacto, para todo mundo perto.

Esta primeira versão tem só socos, de propósito. A base (dados de cada golpe, tabela do punho, netcode, reações) foi feita para receber outros golpes sem mexer na estrutura.

## Controles

| Tecla | O que faz |
| --- | --- |
| R | Levanta ou baixa a guarda. Com ela alta, o corpo olha para onde a câmera olha e o mouse fica preso ao jogo. Esc solta o mouse e baixa a guarda. |
| Clique | Soco leve. Clicando no ritmo: jab → direto → gancho → jab… |
| Botão direito | Soco forte. Demora para sair, tira mais e empurra longe. |
| W A S D | Com a guarda alta: passos curtos (2,2 m/s) para frente, para os lados e para trás, sem correr. |

No toque: **Mais › Luta (guarda)**; com a guarda alta, **Soco** e **Forte** aparecem no lugar de Freio e Buzina.

A guarda não sobe com algo na mão (bebida, bandeja, sacola do Highfood), com fogo de artifício, com cigarro aceso, sentado, montado, trabalhando ou voando; a sala diz o motivo uma vez. Qualquer coisa que tire o jogador dali (sentar, subir na moto, receber a bebida, desmaiar, sair) baixa a guarda. Com a guarda alta, dançar, acenar, fumar e usar item pedem para baixá-la antes. Enquanto um soco segura os pés ou um golpe atordoa, as outras ações esperam ("Espere o golpe terminar").

## Os golpes

Números em `FIGHT_MOVES` (`packages/shared/src/fight.ts`).

| Golpe | Clipe (Mixamo) | Acerta entre | Pés presos | Vida | Atordoa | Empurra |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Jab | Lead Jab (1), 1,3× | 0,20–0,34 s | 7 inputs (0,35 s) | 7 | 0,28 s | 0,12 m |
| Direto | Elbow Punch, 1,5× | 0,30–0,56 s | 12 (0,6 s) | 11 | 0,38 s | 0,22 m |
| Gancho | Punching, 1,3× | 0,34–0,50 s | 11 (0,55 s) | 14 | 0,45 s | 0,3 m |
| Soco forte | Hook Punch, 1,25× | 0,56–0,76 s | 17 (0,85 s) | 24 | 0,65 s | 0,8 m |

- **Sequência:** o próximo soco leve sai quando os pés soltam (fim de "pés presos"). Até o fim da janela da sequência (`chainSteps`) ele é o próximo da corrente; depois, volta ao jab. O forte sai a qualquer momento com os pés livres e termina a corrente.
- **Buffer:** um clique dado com os pés ainda presos espera até 320 ms para sair (`FIGHT.bufferMs`); no máximo dois esperam. Apertar sem parar não empilha socos para depois.
- **Passo para dentro e mira:** ao sair, o soco gira o corpo para quem estiver até 2,6 m e até ~52° da direção da câmera, e dá um passo até a distância em que o ponto doce do punho encontra o corpo (até `lungeMax`; perto demais, até 0,25 m para trás). O gancho e o soco forte vêm de lado, então o corpo vira um pouco para fora para o punho chegar no alvo (o `aim` de cada skin, medido do clipe).
- **Quem leva:** perde a vida (o anel primeiro, depois a reserva do coração, como qualquer dano em `needs.ts`), fica atordoado (não anda nem soca), é empurrado na direção do golpe (contra paredes e móveis) e faz a reação: leve, média, de lado ou pesada conforme o soco, e para frente quando o golpe vem de trás (mais de ~110° fora de onde olha). Um soco que estava saindo é cortado.
- **Nocaute:** quando o golpe é maior que a vida mais a reserva, o corpo voa em ragdoll (mais longe no soco forte) e, quando para, a vida acaba e a Morte vem. Quem levanta de um nocaute (ou de qualquer queda) fica 2,5 s sem poder ser socado ou chutado.

### Quem pode ser socado

Quem está a pé e livre, com ou sem guarda, atordoado, ou no meio de um chute do Rafael. Sentado, montado, trabalhando, jogando, no palco, voando, desmaiado, caído, morto ou ausente, não.

## Como o soco acerta (hitbox)

A sala não tem esqueleto. Ela decide pelo **caminho do punho medido dos próprios clipes de cada skin** (`packages/shared/src/fight-paths.ts`, gerado por `npm run assets:punches`): os nós dos dedos a cada 20 ms durante a janela do golpe, nos eixos do avatar. O corpo atingido é uma cápsula em pé, do quadril (+5 cm) até a cabeça (+14 cm) da skin na guarda, com 22 cm de raio; o punho é uma bola de 9 cm.

- A cada passo da sala (50 ms), o punho é seguido em sub-passos de 10 ms, como **segmento** de um ponto ao outro contra a cápsula: um gancho rápido não atravessa o corpo entre dois passos.
- O primeiro corpo que o punho encontra apanha; um soco acerta uma pessoa só.
- Parede segura o soco (a mesma regra do chute: poste e móvel baixo, não).
- Cada skin tem a sua tabela: o alcance vai de 0,68 m (Gabriel) a 1,08 m (Tião) no ponto doce. Skin nova sem tabela usa a do Nathan até a tabela ser gerada (o teste avisa).

## Netcode

Servidor autoritativo a 20 Hz, patches a 10 Hz, como o resto do jogo. O que foi feito para o soco ser imediato para quem soca, justo para quem apanha e à prova de trapaça:

1. **O soco viaja dentro do input** (`player.input`, campos `fight` e `punch`), na mesma fila numerada da caminhada. A sala processa na mesma ordem em que o navegador previu. Uma mensagem separada chegaria fora de ordem com os passos e o corpo seria corrigido.
2. **Mesmas regras dos dois lados** (`fight.ts`): `punchAllowed` (qual soco pode sair), `throwPunch`, `punchStep` (pés presos e passo para dentro) e `fightMove` (o movimento do input). Os pés presos e o passo contam em inputs, não em tempo, então a previsão bate com a sala ao centímetro, como a posição. A reconciliação pega o estado do soco da sala (`Player.fist`) e reaplica os inputs ainda sem resposta, do mesmo jeito que faz com a posição.
3. **Na guarda o navegador manda input todo tick**, parado ou não, porque a sala conta os pés presos em inputs.
4. **O clique sai na hora para quem soca.** O clipe começa no input seguinte (até 50 ms), sem esperar a sala. Quando o punho desenhado encontra alguém desenhado, o som, a estrela e a pausa do golpe saem na hora (`BarScene.predictPunch`). O número vem com a palavra da sala, uma viagem depois.
5. **Compensação de lag (rewind).** O input do soco diz qual estado do mundo o navegador estava desenhando: o `serverTime` do último patch e há quantos ms ele chegou. Daí sai o instante que o jogador via (`seenAt`: os outros avatares deslizam 100 ms atrás do patch novo). A sala guarda 1 s de histórico de cada corpo, tick a tick, e julga o punho contra os outros **onde o atacante os via** (`rewindOf`). O rewind vai no máximo a 300 ms. Além disso, o alvo ainda tem que estar dentro do alcance do golpe + 0,75 m agora. Acima desses limites, a vantagem passa para quem levou: ele escapou.
6. **Quem apanha** recebe `fight.hit` antes do patch e já reage e trava a entrada. A sala põe `interactionState='stagger'` durante o atordoamento, o que desliga a previsão de movimento (o mesmo caminho de qualquer ação que prende o corpo) e evita o elástico.
7. **Quem só assiste** vê o soco no relógio da sala. Um soco visto atrasado começa 120 ms antes do ponto em que a sala está (para o preparo aparecer) e alcança tocando até 1,8× mais rápido, em vez de pular.
8. **Validação:** a sala só aceita o soco que as regras permitem naquele input (sequência, pés presos, atordoamento, guarda). O passo para dentro é limitado por golpe. O rewind tem teto e não aceita um estado do futuro. O soco recusado não acontece, e o navegador desfaz o desenho quando a sala responde ao input sem o soco (`FightController.reconcile`).

`fight.hit` vai para quem está a até 18 m (o mesmo raio em que os avatares são vistos) e traz quem bateu, quem levou, o golpe, o dano, a vida restante, o ponto do impacto, a direção, a reação, até quando atordoa e se foi nocaute.

## Animações

> **Flicker ao entrar na guarda (corrigido em 2026-11-08):** a guarda subia e caía sozinha dois quadros depois, e o corpo piscava entre `FightIdle` e `Idle`. Era o mouse: eu pedia o bloqueio do ponteiro duas vezes (em `changed` e em `mouseCapture.sync`), o navegador derrubava o primeiro e o `pointerlockchange` de "perdeu" era lido como Esc, que baixa a guarda. Agora há um pedido só, e só conta como Esc um bloqueio que já durava 400 ms (`STEADY_MS` em `mouse-capture.ts`).

13 clipes novos em cada banco de skin de jogador (`tools/assets/convert-animations.mjs`; Seu Zé e Tonico ficam de fora):

- **Guarda:** `FightIdle` (Bouncing Fight Idle, o boxeador balançando).
- **Socos:** `Jab`, `Cross`, `Hook`, `Heavy`. O conversor ganhou `rate`, que acelera o clipe na conversão.
- **Reações:** `HitLight`, `HitMedium`, `HitSide`, `HitHeavy`, `HitBack`. Os socos e as reações saem do **mesmo pacote de boxe da Mixamo**, que começa e termina na mesma guarda: soco, próximo soco e reação se emendam sem salto. O conversor tem um script que ordena todos os clipes do acervo pela distância até essa guarda.
- **Passos na guarda:** para frente é o `Walk`; `FightBack` (Standing Walk Back), `FightLeft` e `FightRight` (strafes). O passo é escolhido pela direção em que o corpo anda em relação a onde olha, com histerese nas bordas. O ritmo de cada clipe foi medido pelo pé apoiado: 1,15 / 1,61 / 1,6 m/s a 1×, assim o pé não escorrega.
- **Camada `Guard`:** a `FightIdle` só nos braços (das clavículas para baixo) por cima dos passos. As pernas vêm dos strafes e os punhos continuam na guarda.
- **Recuo procedural** (`engine/fight-flinch.ts`): por cima da reação, a parte de cima do corpo é jogada na direção do golpe e volta sozinha, como uma mola. O clipe não sabe de onde veio o golpe; isso sabe.
- **Pausa no impacto (hitstop):** 55 ms nos leves e 90 ms no forte, no clipe de quem bate. Depois o clipe recupera o relógio da sala acelerando um pouco.
- A cabeça não segue a câmera durante soco e reação. A camada de guarda e o recuo seguem o padrão de camadas mascaradas e de pose aditiva que já existia (bebida na mão, olhar).

Sons: os mesmos do chute (`blow-sound.ts`): o ar cortando quando o punho passa (`swingMs`) e o impacto, mais pesado no forte. **Não ouvi os sons:** a escolha veio do que o chute já usa e precisa ser confirmada de ouvido. A câmera treme um pouco para quem bate e mais para quem leva; com "reduzir movimento" no sistema, não treme.

## Números de dano

`apps/web/src/fight/damage-numbers.ts` e `fight.css`: o número nasce no ponto do impacto (corrigido para onde o corpo está desenhado), dá um pulo, sobe ~0,55 m e some. Fica branco no soco leve, dourado no forte e vermelho na vida que **você** perdeu; no nocaute aparece "24 KO" em magenta. O tamanho acompanha a distância. São até 24 elementos reaproveitados, movidos só por `transform` (nenhum layout por quadro). Todo mundo a até 18 m vê os mesmos números que a sala tirou.

## Arquivos

- `packages/shared/src/fight.ts`: regras, dados dos golpes, mira, teste de contato, rewind.
- `packages/shared/src/fight-paths.ts`: gerado, não editar.
- `tools/assets/measure-punches.mjs`: `npm run assets:punches`; `--probe <skin>` imprime o caminho do punho de cada golpe.
- `apps/server/src/world/fight.ts` (`FightDirector`, com histórico em anel por jogador) e a ligação em `BarRoom.ts` (`fights`, `guardRefusal`, `keepsGuard`, `punchable`, `stagger`, `pushBody`, `sendNear`, `FIGHT_BUSY`, `FIGHT_GUARDED`).
- `apps/server/src/state.ts`: `Fist`, aninhado em `Player.fist`, porque um Schema tem no máximo 63 campos e o `Player` já tinha 55.
- Cliente: `apps/web/src/fight/fight-controller.ts`, `networking.ts` (fluxo de socos previsto e reconciliado), `engine/BarScene.ts` (`fightClip`, `guardStep`, `fightSync`, `predictPunch`, `fightHit`, `addGuardLayer`), `engine/fight-flinch.ts`, `main.ts` (R, mouse, dica na tela, nocaute), `mouse-capture.ts` (prende o mouse na guarda), `touch/`.
- Testes: `tests/integration/fight.test.ts` (regras, toda skin acerta e erra onde deve, tabela igual aos bancos), `apps/server/test/fight.test.ts` (diretor: acerto, rewind acerta e sem ele erra, teto do rewind, nocaute, golpe que corta o soco do outro, pés presos, guarda recusada) e `apps/server/test/fight.integration.test.ts` (WebSockets de verdade, do primeiro input até a Morte).

### Para mudar um golpe ou acrescentar outro

1. O clipe em `convert-animations.mjs` (`rate`/`from` se precisar) e `npm run assets:animations`.
2. A janela em `PUNCHES` de `measure-punches.mjs` (`--probe` mostra onde o punho está) e `npm run assets:punches`.
3. A entrada em `FIGHT_MOVES` (a duração tem que bater com `durations.json`; o teste confere) e, se for novo, o id em `PUNCH_IDS`.
4. Subir a versão dos bancos em `skinAsset` (`BarScene.ts`), senão os navegadores ficam com o banco antigo em cache.

## Pendências e o que não foi verificado

- Sons escolhidos sem ouvir.
- Não testado em celular de verdade nem nos óculos VR (no VR não há botão de soco).
- Os passos laterais e para trás foram conferidos pela telemetria (clipe e camada certos), não por um quadro de perto.
- Bloqueio, esquiva, estamina por golpe e barra de vida do adversário ficaram para depois, de propósito (só soco nesta versão).
