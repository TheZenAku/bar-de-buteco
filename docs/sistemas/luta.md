# Luta (soco)

**R** levanta a guarda. Com a guarda alta, o **clique** dá os socos leves em sequência (jab, direto, gancho, e o jab de novo) e o **botão direito** dá o soco forte. Qualquer pessoa a pé pode ser socada, com ou sem guarda, e um soco pode matar: quem fica sem vida e sem a reserva do coração cai em ragdoll e a [Morte](morte.md) vem buscar. Cada soco que acerta mostra a vida que tirou num número que sobe do ponto do impacto, para todo mundo perto.

Os golpes se encadeiam em **combos** (veja abaixo): cada golpe oferece os próximos conforme o botão apertado. As skins Rafael ganham a tecla da skill como terceiro botão, com **chutes** que entram no meio dos socos.

## Controles

| Tecla | O que faz |
| --- | --- |
| R | Levanta ou baixa a guarda. Com ela alta, o corpo olha para onde a câmera olha e o mouse fica preso ao jogo. Esc solta o mouse e baixa a guarda. |
| Clique | Soco leve. Clicando no ritmo: jab → direto → gancho → jab… |
| Botão direito | Soco forte; dentro de um combo, o golpe pesado que a corrente oferece (cotovelada, forte). Demora para sair, tira mais e empurra longe. |
| Tecla da skill (X por padrão) | **Só skins Rafael que compraram o karatê ou o chute voador:** o chute do combo. Com a guarda alta ela não lança ninguém. |
| Espaço ou botão lateral do mouse (Mouse 4/5), segurar | **Defesa**, só com a guarda alta. Segurar bloqueia o que vem pela frente; apertar no instante do golpe é um **parry**. Ver [Defesa](#defesa). Com ela alta o passo cai para 1,3 m/s e não corre. |
| W A S D | Com a guarda alta: passos curtos (2,2 m/s) para frente, para os lados e para trás. Com Shift corre de guarda alta (4,8 m/s), gastando fôlego como a corrida normal. |

No toque: **Mais › Luta (guarda)**; com a guarda alta, **Soco**, **Forte** e **Defesa** (botão que se segura) aparecem no lugar de Freio e Buzina.

Dá para lutar com o cigarro na boca: ele continua aceso e preso aos lábios enquanto os braços ficam na guarda. A guarda não sobe com algo na mão (bebida, bandeja, sacola do Highfood), com fogo de artifício, sentado, montado, trabalhando ou voando; a sala diz o motivo uma vez. Qualquer coisa que tire o jogador dali (sentar, subir na moto, receber a bebida, desmaiar, sair) baixa a guarda. Com a guarda alta, dançar, acenar, acender outro cigarro e usar item pedem para baixá-la antes. Enquanto um soco segura os pés ou um golpe atordoa, as outras ações esperam ("Espere o golpe terminar").

## Os golpes

Números em `FIGHT_MOVES` (`packages/shared/src/fight.ts`).

| Golpe | Clipe (Mixamo) | Acerta entre | Pés presos | Vida | Atordoa | Empurra |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Jab | Lead Jab (1), 1,3× | 0,20–0,34 s | 7 inputs (0,35 s) | 7 | 0,28 s | 0,12 m |
| Direto | Elbow Punch, 1,5× | 0,30–0,56 s | 12 (0,6 s) | 11 | 0,38 s | 0,22 m |
| Gancho | Punching, 1,3× | 0,34–0,50 s | 11 (0,55 s) | 14 | 0,45 s | 0,3 m |
| Cotovelada | Illegal Elbow Punch, 1,3× | 0,24–0,47 s | 10 (0,5 s) | 12 | 0,42 s | 0,3 m |
| Soco forte | Hook Punch, 1,25× | 0,56–0,76 s | 17 (0,85 s) | 24 | 0,65 s | 0,8 m |
| Chute frontal (Rafael) | Kicking, 1,75× | 0,37–0,53 s | 11 (0,55 s) | 16 | 0,52 s | 0,5 m |
| Chute no tronco (Rafael) | Mma Kick, 1,4× | 0,28–0,41 s | 9 (0,45 s) | 19 | 0,58 s | 0,6 m |
| Chute de karatê (Rafael) | o karatê, 1,5× | 0,32–0,51 s | 11 (0,55 s) | 27 | 0,8 s | 1 m |

- **Sequência:** o próximo golpe sai quando os pés soltam (fim de "pés presos"). Até o fim da janela do combo (`chainSteps`) ele é o que o golpe anterior oferece para aquele botão (`then`, tabela abaixo); depois, o botão recomeça pelo seu primeiro golpe (jab, forte, chute frontal).
- **Buffer:** um clique dado com os pés ainda presos espera até 320 ms para sair (`FIGHT.bufferMs`); no máximo dois esperam. Apertar sem parar não empilha socos para depois.
- **Passo para dentro e mira:** ao sair, o soco gira o corpo para quem estiver até 2,6 m e até ~52° da direção da câmera, e dá um passo até a distância em que o ponto doce do punho encontra o corpo (até `lungeMax`; perto demais, até 0,25 m para trás). O gancho e o soco forte vêm de lado, então o corpo vira um pouco para fora para o punho chegar no alvo (o `aim` de cada skin, medido do clipe).
- **Quem leva:** perde a vida (o anel primeiro, depois a reserva do coração, como qualquer dano em `needs.ts`), fica atordoado (não anda nem soca), é empurrado na direção do golpe (contra paredes e móveis) e faz a reação: leve, média, de lado ou pesada conforme o soco, e para frente quando o golpe vem de trás (mais de ~110° fora de onde olha). Um soco que estava saindo é cortado.
- **Nocaute:** quando o golpe é maior que a vida mais a reserva, o corpo voa em ragdoll (mais longe no soco forte) e, quando para, a vida acaba e a Morte vem. Quem levanta de um nocaute (ou de qualquer queda) fica 2,5 s sem poder ser socado ou chutado.

### Combos

Cada golpe diz o que vem depois para cada botão (`then` em `FIGHT_MOVES`). Sem golpe anterior (ou fora da janela), o clique dá o jab, o botão direito o forte e a skill o chute frontal.

| Depois de | Clique | Botão direito | Chute (Rafael) |
| --- | --- | --- | --- |
| Jab | Direto | Cotovelada | Chute frontal |
| Direto | Gancho | Forte | Chute no tronco |
| Gancho | Jab (recomeça) | Forte | Chute de karatê |
| Cotovelada | Gancho | Forte | Chute no tronco |
| Chute frontal | Direto | Forte | Chute no tronco |
| Chute no tronco | Gancho | Forte | Chute de karatê |
| Forte | (jab, recomeça) | (forte) | Chute de karatê |
| Chute de karatê | fim do combo | | |

Exemplos: **1-2-3** (clique ×3: jab, direto, gancho); **jab, cotovelada, forte** (clique, direito, direito); **jab, direto, chute no tronco** e **jab, direto, gancho, chute de karatê** (cliques e a skill); **combo de chutes** (skill ×3: frontal, tronco, karatê); **forte, chute de karatê** (direito, skill). O chute de karatê fecha o combo: o próximo golpe recomeça.

### Os chutes na guarda (Rafael)

Os chutes são golpes como os socos: viajam dentro do input, usam a tabela de trajetória (`fight-paths.ts`, medida do **pé**, bola de 17 cm em vez dos 9 cm do punho) e a mesma sala decide o acerto, com rewind. Diferenças:

- **Dano maior** que qualquer soco leve (16, 19 e 27 contra 7 a 14; o karatê passa até o soco forte, 24) e atordoamento maior.
- **Não jogam o corpo longe.** Quem leva é empurrado até 1 m, reage (`HitMedium`/`HitHeavy`) e fica atordoado, como num soco forte. Só o nocaute (golpe maior que a vida mais a reserva) faz o corpo voar, em ragdoll, e a Morte vem como com qualquer soco. O chute livre, sem guarda, continua lançando longe ([Perfil](perfil.md#o-chute-que-acerta)).
- **Só quem tem o chute:** a sala recusa um chute de outra skin (o banco não tem os clipes) e de quem não comprou o karatê ou o chute voador (`FightHost.kicks`). Os socos continuam abertos.
- Com a guarda alta, a tecla da skill no cliente aperta o botão de chute (`useSkill` em `main.ts`); a sala ignora a mensagem `player.skill` de quem está de guarda (cliente antigo não lança ninguém).
- No celular, o chute está em **Mais › (nome da skill)**; não há botão próprio ainda.

### Quem pode ser socado

Quem está a pé e livre, com ou sem guarda, atordoado, ou no meio de um chute do Rafael. Sentado, montado, trabalhando, jogando, no palco, voando, desmaiado, caído, morto ou ausente, não.

## Ritmo dos golpes (tempo) — 2026-11-09

O dono achou os golpes lentos (o punho do jab saía aos 0,2 s, o do soco forte aos 0,56 s). `FIGHT.tempo` (1,3) faz cada golpe tocar 1,3 ms de clipe por ms real:
- Os clipes, as janelas (`activeFrom`, `activeTo`, `swingMs`, `durationMs`) e o caminho do punho ficam como medidos, em **milissegundos de clipe**; `clipMs(real)` e
  `realMs(clipe)` convertem. Os passos (`lockSteps`, `chainSteps`, `lungeSteps`) são em inputs reais e saem da tabela já encurtados (`ceil`, `ceil`, `floor`):
  os pés soltam quando o punho acabou, e o passo à frente termina antes do punho poder acertar.
- Sala (`world/fight.ts`): o tempo do golpe é `clipMs(now - at)`; as poses voltam no tempo real (`realMs`); o parry/bloqueio e o rewind seguem em ms reais.
- Navegador: o clipe toca a `FIGHT.tempo` (`fightSync`), a idade do golpe é em segundos de clipe, o passo do clipe (`punchRoot`) interpola por `passos × tempo`.
- A pose é desenhada do **clique**, não do próximo input (até um tick de 50 ms antes): `LocalPunch.startedAt`.
- Mira do golpe mais fiel ao mouse: o cone da mira assistida caiu de 0,9 para 0,6 rad e o alcance de 2,6 para 2,5 m (`FIGHT.aimCone`, `aimRange`).
Não verificado ao vivo (só testes): se 1,3 é o ritmo certo; se a mira ficou precisa o bastante com o mouse; e a sensação de "lag" contra o bot, que pode ter outras causas.

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

Para treinar contra um adversário que o servidor controla, com prêmio, veja o [Zeca](zeca.md): a mesma luta (guarda, bloqueio, parry) contra um bot.

## Defesa

Com a guarda alta, **segurar Espaço** (ou o botão Defesa no toque) levanta os braços. É a mesma guarda: tudo abaixo vale só enquanto `Fist.fight` está ligado, e a defesa toma as mãos, então nenhum soco sai com ela alta (o clique é descartado, não fica na fila).

| | Bloqueio | Parry |
| --- | --- | --- |
| Quando | Segurando a tecla quando o golpe acerta (ou apertada até 360 ms **depois** dele) | Aperto novo da tecla até 450 ms antes do golpe ou 360 ms depois (`BLOCK.parryMs`, `parryLateMs`) |
| Dano | Passa 15% da vida do golpe (30% nos fortes e chutes pesados), nunca o último ponto | Nenhum |
| Fôlego da guarda | Paga 1,0× o dano do golpe de um medidor de 100 | Devolve 30 |
| Quem bateu | Nada | Cambaleia 800 ms, perde a corrente e é empurrado |
| Quem defendeu | Empurrado metade do golpe, sem atordoar | Seu **próximo golpe em 1,4 s sai 35% mais forte**, uma vez |

- **Só pela frente.** O arco coberto é ±1,2 rad (`BLOCK.arc`) em torno de para onde o defensor olha, medido nas poses de quando o golpe acertou. De lado ou por trás o golpe entra inteiro e a defesa cai.
- **Fôlego da guarda** (`Fist.guard`, 0–100, barra azul no prompt: dourada abaixo de 30, vermelha quebrada). Volta 14/s depois de 0,9 s sem apanhar. Chegando a 0 a **guarda quebra**: o golpe que quebrou entra por inteiro como atordoamento de 1,1 s, e a defesa só volta com 40% do medidor. Três socos fortes quebram um medidor cheio; uns dez jabs também.
- **Anti-spam.** Só o aperto feito 550 ms ou mais depois do aperto anterior abre janela de parry (`BLOCK.parryCooldownMs`). Segurar a tecla ou martelar é bloqueio comum.
- **Parado de propósito:** a defesa só sobe com os pés livres (não enquanto um soco os prende nem atordoado ou com a guarda quebrada), e qualquer golpe que entra a derruba.
- **Feedback.** Parry: "PARRY!" branco, anel e estrela, pausa de 90 ms nos dois, quem bateu é sacudido para trás e reage (HitMedium). Bloqueio: "DEFENDIDO" (ou o pouco que passou), baque e estrela pequena. Quem soca vê um bloqueio já no desenho do próprio golpe quando o alvo aparece com a defesa alta (`predictPunch`); a palavra da sala (`fight.hit` com `guard`) confirma ou troca por parry. Os braços sobem por uma camada (`GuardBlock`, clipe `FightBlock`, o primeiro instante do Center Block do Mixamo) por cima da camada da guarda.

### Responder a uma sequência (2026-11-10)
Com o ritmo 1,3 o atordoamento de um golpe (`stunMs`) passou a ser maior que o intervalo até o golpe seguinte da sequência (gancho→jab 342 ms contra 450 ms de stun, chutes idem): quem levava o primeiro não conseguia mais defender nada, e o navegador só soltava o bloqueio depois que o patch dizia que o stun acabou. Correções: (1) o stun termina pelo relógio, no início do input (`FightDirector.guard(player,input,now)`), não um passo depois; (2) um bloqueio **segurado** sobe através do stun de um golpe levado depois de `BLOCK.hitFreeMs` (150 ms), como bloqueio simples (nunca parry), exceto no stun de um parry (`noCancelUntil`) e na guarda quebrada; (3) o navegador manda o bloqueio durante o stun e já desenha a saída (`FightController.decorate`); o estado `stagger` não segura mais socos/bloqueio, só o relógio (`stunUntil`). O parry só abre num aperto novo da tecla feito com os pés livres. Teste: `test/fight.test.ts` ("a held block answers a chain"). Não testado na tela, nem com ping real.

### Defesa que responde (2026-11-10, segunda rodada)
Parry: aperto até 300 ms antes do golpe ou 240 ms depois (`BLOCK.parryMs/parryLateMs`; o bot, sem ping nem interpolação, fica com 180/0, `botParryMs`). Golpe bloqueado faz o agressor recuar 420 ms (`BLOCK.recoilMs`): é a abertura para o contra-ataque e quebra a sequência. Soco já a caminho (passou da metade até a janela) ainda acerta quando o dono é atingido: troca, não corte. O medidor de guarda gasta 1,0× o dano (era 1,4×). Teste do degrau do Zeca mede 14 s (com recuo os atacantes morriam antes e o teste saturava em 100).

### Corpos não se atravessam + golpe que corta golpe (2026-11-10, terceira rodada)
Dono: "o Zeca entra dentro de mim e me acerta, ignora a minha defesa, não sente o golpe". Reproduzido com um jogador simulado andando para cima do Zeca: os dois ficavam **no mesmo ponto em 85% da luta** e o Zeca acabava **atrás** do jogador em até metade dela. Dentro um do outro tudo desanda: o arco do bloqueio (`blockCovers`) lê o golpe como vindo de trás ou de direção aleatória e ele entra inteiro, a mira (`punchAim` descarta menos de 5 cm) e o punho (que nasce além do corpo do alvo) erram, e o soco do jogador "atravessa" o Zeca sem acertar.
- **Separação (`FIGHT.bodyGap` 0,55 m, `SparringDirector.separate`).** Ninguém prevê o corpo do Zeca, então ele é quem cede, em linha reta para longe do jogador; com parede atrás, de lado. Roda antes do pensamento dele (o jogador pode ter andado para cima dele) e depois do passo (o `lunge` e o passo do clipe o levariam para dentro). Só no Zeca de propósito: entre duas pessoas o corpo é previsto pelos dois navegadores, e separar só na sala daria elástico (ficou como pendência, com a mesma regra no `fightMove`).
- **Golpe corta golpe.** Quem é atingido **antes de o punho dele estar na janela de acerto** (`activeFrom`) perde o golpe, também o que já tinha encostado em alguém e esperava o bloqueio chegar (`pending`). Antes, passada metade do caminho até a janela o golpe vinha assim mesmo (um "troca" largo demais): o jab do jogador acertava o Zeca e o soco dele entrava do mesmo jeito. Só punhos que já estavam os dois na janela trocam. Consequência de projeto: o jab corta o soco forte em preparo (o forte demora 430 ms para a janela, o jab 154 ms).
- **Aperto atrasado que não abre parry é bloqueio comum.** Antes, um aperto até 360 ms depois do contato só contava se abrisse janela de parry; num aperto dentro dos 550 ms do anterior (mão pesada, segunda defesa da mesma sequência) o golpe entrava inteiro. Agora é bloqueio (o bot, sem janela atrasada, segue como era).
- Os testes de defesa desatualizados da rodada anterior (janelas 450/360, desgaste 1,0×, chute com empurrão até 2,2 m) foram acertados aos números atuais.
**Medido num jogador simulado (`SparringAI` contra um bloqueador com atraso de reação 200 a 500 ms):** com um aperto por golpe, quase toda sequência vira parry; segurando a tecla, o forte do Zeca difícil quebra a guarda em ~4 golpes. **Não visto na tela nem com ping real.** Ponto aberto: a sala espera até 320 ms para julgar um golpe em quem está com a guarda alta (`BLOCK.deferMaxMs`), então todo golpe que o jogador leva na guarda reage ~200 ms depois de o punho encostar na tela; é o preço de poder defender depois de ver o golpe, e a decisão de encurtar é do dono.

### Netcode da defesa

O problema: quem defende aperta a tecla ao ver o soco *na tela dele*, uns 100–200 ms depois de o soco existir para a sala. Julgada pelo relógio em que o input chega, a defesa quase sempre chegaria tarde, e quem tem ping alto nunca defenderia. Resolvido em quatro partes (`world/fight.ts`, `packages/shared/src/fight.ts`):

1. **A defesa viaja no input** (`block`, a cada input enquanto segurada; `blockAt: {seen, ago}` só no input do aperto). É a mesma fila numerada do soco e da caminhada, então a previsão do passo lento (`fightMove`, que lê só o input) bate com a sala sem correção.
2. **A sala mede o aperto na linha do tempo de quem apertou.** `seen`/`ago` dizem quanto o input demorou: `oneWayOf` = (agora − seen − ago − meio tick) / 2, com teto de 250 ms (`BLOCK.lateMaxMs`), então o aperto é datado em `agora − oneWay`. Um navegador que mente só consegue se atrasar para trás até o teto. Cada jogador guarda os últimos intervalos em que segurou (`BlockSpan`) e `blockVerdict(spans, instanteDoGolpe)` decide parry, bloqueio ou nada.
3. **O golpe espera o aperto chegar.** Quando o punho encontra alguém com a guarda alta, o acerto fica pendente por `oneWay + meio tick` (entre 25 e 150 ms, `BLOCK.deferMaxMs`) e é decidido só então, com os inputs desse tick já processados. Pula a espera quando a defesa já está segurada há mais que a janela do parry (nenhum aperto novo muda o resultado) e para quem está sem a guarda (nada a esperar). O atraso é invisível para quem apanha, porque os outros avatares já são desenhados 100–120 ms atrás, e para quem soca, porque o som, a estrela e a pausa saem na hora pela previsão local; só o número demora.
4. **O instante do golpe é o do rewind.** O golpe é julgado no instante em que o punho tocou (`ativo.at + contato.ms`), as poses de defensor e agressor vêm do histórico nesse instante, não nas de agora. O parry nunca "perde" por causa da espera.

Validação: o `block` só é aceito com os pés livres; a janela do parry não pode ser reaberta por repetição; o `blockAt` tem teto; nada do que o navegador diz dá mais vantagem que ~250 ms.

## Animações

> **Passo do golpe é do corpo (root motion, 08/11).** O Direto (Elbow Punch) dá um passo de boxe de 0,62 m e volta, o Jab avança 0,28 m e o Forte 0,18 m. Antes esse passo ficava só no clipe: o corpo (a posição da sala) não andava junto, então quando outro soco ou um passo entrava no meio do clipe o desenho voltava à origem em 0,08 s, e o passo de volta parecia o corpo sendo puxado. Agora o conversor tira o passo do clipe (`anchor:'hip'`, o quadril fica no lugar) e grava o caminho em `extras.root`; `npm run assets:punches` o copia para `FistPath.root` (m, a cada tick). `punchStep` soma esse caminho ao avanço do golpe enquanto os pés estão plantados, e `fightMove` continua com ele depois, enquanto o jogador fica parado (`punchCarries`; a sala lê o mesmo de `animationState === 'punch'`). Golpe completo: o corpo vai e volta exatamente como o clipe. Cortado por outro soco ou por um passo: fica onde o passo tinha chegado, sem salto. O alcance e a mira (`reach`, `aim`) já contam esse caminho, então o acerto não mudou. Para quem assiste, `BarScene.carriedOffset` desenha o passo pelo relógio do clipe a partir do último estado da sala (os patches chegam a cada 100 ms e deslizavam os pés).
>
> **Passos sem patinar.** Cada skin anda num ritmo próprio depois do retarget (o Walk do Rafael leva o pé apoiado a 1,10 m/s, o do Nathan a 1,24). `npm run assets:paces` mede isso nos bancos e grava `apps/web/src/engine/clip-paces.ts`; o BarScene toca cada passo na velocidade do corpo dividida pelo ritmo da própria skin (antes, um número só, medido no Nathan antes de o Walk ser esticado 20%). Os passos da guarda vão até 2,6×; o Walk segue limitado a 2,2× (para as pernas não girarem) e, acima de 2,6 m/s (o andar de sempre, 3,5), o corpo troca para o trote `Jog`, que acompanha sem patinar.

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
- Defesa: `BLOCK`, `blockVerdict`, `oneWayOf`, `blockCovers`, `chipOf` em `fight.ts`; `FightDirector.raise/drop/settle/resolve/block/parry`; `Fist.block/guard/breakUntil`; cliente `FightController.setBlock`, `BarScene.addBlockLayer/fightGuarded`, `BlowSounds.block/parry`; teste de regras `tests/integration/fight-block.test.ts`.
- `apps/server/src/state.ts`: `Fist`, aninhado em `Player.fist`, porque um Schema tem no máximo 63 campos e o `Player` já tinha 55.
- Cliente: `apps/web/src/fight/fight-controller.ts`, `networking.ts` (fluxo de socos previsto e reconciliado), `engine/BarScene.ts` (`fightClip`, `guardStep`, `fightSync`, `predictPunch`, `fightHit`, `addGuardLayer`), `engine/fight-flinch.ts`, `main.ts` (R, mouse, dica na tela, nocaute), `mouse-capture.ts` (prende o mouse na guarda), `touch/`.
- Testes: `tests/integration/fight.test.ts` (regras, toda skin acerta e erra onde deve, tabela igual aos bancos), `apps/server/test/fight.test.ts` (diretor: acerto, rewind acerta e sem ele erra, teto do rewind, nocaute, golpe que corta o soco do outro, pés presos, guarda recusada) e `apps/server/test/fight.integration.test.ts` (WebSockets de verdade, do primeiro input até a Morte).

### Para mudar um golpe ou acrescentar outro

1. O clipe em `convert-animations.mjs` (`rate`/`from`/`to` se precisar) e `npm run assets:animations`. Chute: `foot` em vez de `hand` em `PUNCHES`, `only` com as skins que têm o clipe, e `then` nos golpes que o oferecem.
2. A janela em `PUNCHES` de `measure-punches.mjs` (`--probe` mostra onde o punho está) e `npm run assets:punches`.
3. A entrada em `FIGHT_MOVES` (a duração tem que bater com `durations.json`; o teste confere) e, se for novo, o id em `PUNCH_IDS`.
4. Subir a versão dos bancos em `skinAsset` (`BarScene.ts`), senão os navegadores ficam com o banco antigo em cache.

## Pendências e o que não foi verificado

- Sons escolhidos sem ouvir (os chutes usam os mesmos do soco forte).
- **Os combos novos e os chutes na guarda não foram vistos em quadro:** as janelas de acerto vêm da medição do pé (`--probe`), a emenda entre os clipes de chute e a guarda do boxe não foi conferida por imagem, e o botão de chute no toque também não.
- Não testado em celular de verdade nem nos óculos VR (no VR não há botão de soco).
- Os passos laterais e para trás foram conferidos pela telemetria (clipe e camada certos), não por um quadro de perto.
- Esquiva, estamina por golpe e barra de vida do adversário ficaram para depois, de propósito.
- **Defesa (2026-11-09) não foi vista nem ouvida:** a pose dos braços (`FightBlock`) foi escolhida por medida das mãos no clipe-fonte e conferida por teste, não em quadro; os sons do bloqueio e do parry são sintetizados no navegador (`BlowSounds.synthesize`) e não foram ouvidos; o botão de toque e o balanceamento (0,15 de dano passando, 1,4× de custo, 180 ms de janela) não foram testados com duas pessoas em rede de verdade. Os números estão todos em `BLOCK`.
