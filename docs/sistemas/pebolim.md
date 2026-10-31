# Pebolim: as mesas do salão de jogos

As duas mesas de pebolim (totó) ficam no salão de jogos, no andar de cima, embaixo das janelas. Cada mesa tem a sua partida, de 1 contra 1 ou em duplas, contra outras pessoas ou contra o **Zé do Totó**, o jogador da casa. Dá para jogar amistoso ou valendo moedas. O servidor decide tudo: a física da bola, os gols e as regras. O navegador desenha a mesa e envia para onde o ponteiro aponta e quando o jogador chuta.

## A mesa

É a mesa brasileira de 11 bonecos por time, a do modelo `P_Pebolim` do mapa (`05_props.py`): 1 goleiro, 2 na zaga, 5 no meio e 3 no ataque. São oito bastões a 14 cm um do outro, alternando como na mesa de verdade: goleiro vermelho, zaga vermelha, ataque azul, meio vermelho, meio azul, ataque vermelho, zaga azul e goleiro azul. O feltro tem 1,12 × 0,64 m e o gol tem 20 cm. O Vermelho defende o gol do lado da escada (x menor) e o Azul, o outro.

| Medida | Valor | Por quê |
| --- | --- | --- |
| Bola | 35 mm (raio 17,5 mm) | A ITSF usa bolas de 34 a 36 mm |
| Curso de cada bastão | Zaga 17 cm, ataque 10 cm, meio 5 cm e goleiro 24 cm | O boneco da ponta chega a 29 cm do meio, rente à parede. O goleiro, sozinho no bastão, alcança os cantos |
| Pé do boneco | 7,5 cm abaixo do eixo | Um boneco girado mais de 56° passa por cima da bola |
| Chute | Toque ≈ 1,5 m/s, bomba ≈ 5 m/s | Cresce com o tempo que o botão fica apertado (até 0,5 s) |
| Rampas | Junto às paredes laterais e nos cantos atrás dos goleiros | A bola volta para o campo, nunca para dentro do gol pela parede do fundo |

A física (`packages/shared/src/foosball.ts`) roda a 60 passos por segundo, cada um dividido em 10 subpassos. Assim, nem a bomba atravessa um boneco. Cada boneco é uma caixa sob o eixo, deslocada pelo giro do bastão:

- **Parado**, o boneco bloqueia. Uma bola lenta (menos de 0,7 m/s) morre no pé dele: é o **domínio**.
- **No chute**, o pé vai para trás e para cima (e passa por cima de uma bola até 5 cm atrás dele), depois desce para frente. A bola sai com a velocidade do pé.
- **Bola atrás do boneco**, fora do alcance do chute para frente: o chute vira um **recuo**, que devolve a bola de leve para o seu bastão de trás. É o que o jogador de verdade faz girando o boneco para trás. Sem isso, a bola morria entre dois bastões de costas um para o outro. O goleiro nunca recua, porque atrás dele só tem o próprio gol.
- **Puxada**: o movimento lateral do bastão no instante do chute passa um pouco para a bola (atrito da borracha), e um chute com a ponta do pé sai cruzado.
- **Levantar** (botão direito ou Shift): os bonecos giram para a horizontal e a bola passa por baixo. Quando um bastão chuta, os bastões do mesmo time à frente dele se levantam sozinhos por 0,28 s, para o chute não bater nos próprios bonecos.

## Regras

As regras seguem as da ITSF (Federação Internacional de Futebol de Mesa) e a versão simplificada da federação britânica. Também valem as do totó de bar no Brasil: gol vale de qualquer boneco e a bola sai pelo time que levou o gol.

| Regra | Como funciona |
| --- | --- |
| Partida | Até 3, 5 (padrão, como o jogo da ITSF), 7 ou 10 gols. Também pode ser melhor de 3 sets |
| Moeda | Na primeira saída, a moeda decide quem sai. Depois, sai quem levou o gol. No set seguinte, sai quem perdeu o anterior |
| Saída | A bola fica parada na frente do boneco do meio da linha de 5. Primeiro aparece **Pronto?**, depois a contagem de 3 a 1. Então a bola rola até o boneco do lado e já está valendo. É o "pronto?" e os dois toques da regra |
| Gol | Vale de qualquer boneco, goleiro inclusive. A bola que passa a linha conta na hora: a que entra e sai também vale. Bola tocada por último pelo adversário é **gol contra** |
| Giro | Não existe: o chute é sempre um movimento só. O controle não permite girar |
| Tempo de posse | 10 s na linha de 5 e 15 s nas outras, com goleiro e zaga contando como uma só. Estourou no ataque, a bola vai para a zaga do outro time. Nas demais, vai para o meio dele. O relógio aparece no placar a partir de 3 s e fica laranja nos últimos 3 |
| Bola morta | Nesta mesa, toda bola parada está ao alcance de algum boneco: os bastões ficam a 14 cm e o pé alcança 9 cm. Por isso não existe bola morta, e o tempo de posse resolve a bola presa |
| Bola fora | Não acontece: as paredes são altas |
| Conexão | Se alguém cai, a partida para e espera 20 s (`FOOSBALL.pauseMs`). Ao voltar, a bola continua de onde parou, depois de uma contagem. Se a pessoa não volta, no amistoso o Zé do Totó assume o lugar; valendo moedas, o time dela perde por W.O. |
| Sair no meio | No amistoso, o Zé assume. Valendo moedas, é W.O. O painel avisa antes |

## A partida, passo a passo

```
lobby → kickoff → playing → goal → (set) → … → finished → lobby (revanche)
                       ↘ kickoff (posse estourada) ↗
              (paused enquanto alguém está sem conexão)
```

1. **lobby**: quem chega primeiro abre a mesa e escolhe as regras. Pode escolher o formato (1 × 1 ou 2 × 2), os gols, os sets, o nível do Zé e o valor da partida. No 2 × 2, cada time tem **Goleiro e zaga** e **Meio e ataque**; no 1 × 1, cada um joga com os quatro bastões. Os lugares vazios podem ficar com o Zé (só no amistoso), e quem chega toma o lugar dele. Quando todos marcam **Estou pronto**, a partida começa. Uma mudança de regra pede o pronto de novo.
2. **kickoff**: a contagem antes da saída (2,4 s) ou do recomeço depois de uma falta ou pausa (1,5 s).
3. **playing**: a bola está valendo.
4. **goal**: 2,6 s com o **GOL!** na tela, o nome de quem marcou, o bastão e a velocidade.
5. **set**: 4,2 s entre os sets, na melhor de 3.
6. **finished**: 9 s com o resultado. Depois a mesa volta ao lobby com os mesmos lugares. **Quero revanche** já marca o pronto da próxima.

Uma mesa cheia, ou com partida rolando, é **assistida**: o painel abre só para ver, e o jogador para de assistir com E ou com **Parar de assistir**.

## Zé do Totó

O jogador da casa (`apps/server/src/minigames/foosball-cpu.ts`) joga com as mesmas regras e a mesma física. Ele vê a bola com atraso, como uma pessoa, prevê onde ela cruza cada bastão (com as tabelas nas paredes) e põe o boneco mais próximo lá. Com a bola dominada no pé, ele mira: escolhe a brecha entre os bonecos do próximo bastão adversário, ou o canto do gol longe do goleiro, e bate com a ponta do pé para cruzar. Se não conseguir alinhar em 0,7 s, chuta reto. Com a bola presa atrás de um boneco, ele recua.

| Nível | Atraso | Erro de mira | Mãos | Chuta quando pode | Pensa |
| --- | --- | --- | --- | --- | --- |
| Tomou todas | 230 ms | 3,4 cm | 50% | 45% | 260 ms |
| Na média | 130 ms | 1,8 cm | 75% | 80% | 150 ms |
| Sóbrio | 70 ms | 0,7 cm | 100% | 95% | 70 ms |

Em simulação, dois Zés no nível médio fazem cerca de 3 gols por minuto, e o sóbrio ganha do que tomou todas por 9 × 0 em três minutos. Os testes garantem que o sóbrio vence quem não joga e vence o de porre.

## Moedas: partida valendo

Cada jogador põe o mesmo valor, escolhido por quem abriu a mesa. As fichas são de 10, 25, 50, 100, 250 e 500, dentro dos limites da tabela de preços: `foosball:min-bet` (10) e `foosball:max-bet` (500), no grupo **Jogos**. O time que vence leva o dobro do que cada um pôs, ou seja, as moedas dos perdedores. O Zé não joga valendo. As moedas fazem o mesmo caminho seguro das do blackjack:

| Passo | Onde | O que acontece |
| --- | --- | --- |
| Início | `GameBank('foosball').stake` → `POST /api/internal/wallet` | Quando todos estão prontos, a parte de cada um é gravada no diário em disco (`.data/world/outbox.foosball.jsonl`) e debitada com o motivo `foosball:bet:<partida>`. Se a carteira de alguém recusa, ou alguém sai durante a cobrança, a partida não começa e cada parte volta |
| Fim | `GameBank.settle` → `POST /api/internal/foosball/settle` | O vencedor recebe 2× a sua parte e o perdedor recebe 0. O acerto é reenviado a cada 3 s enquanto a API estiver fora |
| A API paga | `WalletService.settleFoosball` | Paga uma vez por partida e jogador (`foosball:<partida>:<jogador>`), só contra a parte dele no livro-caixa e nunca acima de 2× (`FOOSBALL_MAX_RETURN`). Uma trava por partida garante que a soma dos prêmios nunca passe do total que a partida tem em jogo |
| Queda do servidor | `GameBank.recover` | As partes de partidas que não terminaram voltam (`foosball:refund:<partida>`) |

O saldo é conferido na hora do pronto (cache da sala) e na cobrança (API). No admin, as moedas aparecem com a origem **Pebolim**. O log mostra **Partida de pebolim** (mesa, placar, resultado, W.O. e o líquido de cada jogador) e **Prêmio do pebolim recusado**. Ao fim de cada partida, quem está perto no bar lê no chat quem venceu, por quanto e valendo quanto.

> As moedas não podem ser compradas com dinheiro real. Partida valendo é entre jogadores, por habilidade, sem a casa no meio. Se as moedas um dia puderem ser compradas, vale a mesma ressalva do blackjack: antes, é preciso uma avaliação jurídica.

## O painel

O painel (`apps/web/src/foosball/`) é grande e fica no meio da tela. Enquanto você está na mesa, a barra de ações, os avisos de tecla e o mapa com os medidores saem da frente, e o jogo para de receber o teclado (E sai da mesa).

- **Placar**: os nomes, os gols e as **contas** de cada time, como no marcador de bolinhas das mesas de bar. Na melhor de 3, aparecem também os sets. No meio ficam o "até N gols" e o relógio de posse. **Valendo X** aparece em dourado.
- **A mesa** (`render.ts`, canvas): madeira escura com friso dourado e o brilho magenta da casa, o feltro listrado com as marcações do campo e a logo no círculo central, e os gols nas cores dos times. Os bastões são cromados e os punhos têm o lado de cada time (os seus acendem). As pontas do outro lado entram em hastes telescópicas. Os bonecos se inclinam no chute e deitam quando levantados. A bola rápida deixa um rastro neon. No gol, a meta acende, a mesa treme e sai confete.
- **Sua visão**: o seu gol fica sempre à esquerda e os seus punhos embaixo. Numa tela em pé (celular), a mesa gira: você ataca para cima e os seus punhos ficam à direita.
- **Comandos**: no mouse, os seus bonecos seguem o ponteiro, cada bastão pondo o boneco mais perto na frente dele. O clique chuta e segurar carrega a bomba, com o medidor embaixo da mesa. O botão direito levanta. No teclado, W/S ou as setas movem, Espaço chuta (segure para a bomba) e Shift levanta. No toque, arraste o dedo na mesa e use os botões **Chutar** (segure para a bomba) e **Levantar**.
- **Sem atraso**: os seus bastões se movem no próprio navegador, com os mesmos passos do servidor, então respondem na hora. A bola e o resto são desenhados 70 ms atrás do servidor, misturando os frames (30 por segundo).
- **Lobby**: os lugares de cada time (pronto, esperando, casa), **Jogar aqui**/**Mudar para cá**, **Chamar o Zé**/**Tirar o Zé**, as regras (só quem abriu a mesa muda) e **Estou pronto**, sempre visível.
- **Sons** (`sounds.ts`, sintetizados): a bola no boneco (mais forte no chute), na madeira e na trave, o apito da saída, a contagem, a falta, o gol com a torcida e o apito final. Liga e desliga no ícone de som (salvo neste navegador).
- **Regras**: o ícone de ajuda abre as regras e os comandos.

Na cena 3D (`apps/web/src/engine/foosball-balls.ts`), quem está perto vê a bola correr sobre o feltro da mesa de verdade. Os bastões e os bonecos fazem parte do mapa e ficam parados. O avatar fica nos punhos: o Vermelho do lado da janela, que só se alcança assim, e o Azul do lado da sala. No 2 × 2, a defesa fica perto do próprio gol. Quem sai da mesa fica do lado da sala.

Para ver o painel sem servidor, abra `tests/fixtures/foosball.html` pelo Vite (`/@fs/<caminho>`). A vitrine roda a física e o Zé de verdade no navegador:

- `fixture.play()` joga você contra o Zé.
- `fixture.play({local:false,level:'dificil'})` põe o Zé dos dois lados.
- `fixture.lobby({...})` mostra o lobby.
- `fixture.set(mesa)` desenha qualquer estado.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `packages/shared/src/foosball.ts` | Mesa, bastões, física, frames, lugares no bar, limites e esquemas das mensagens |
| `apps/server/src/minigames/foosball.ts` | A partida: lobby, fases, regras, pausa, W.O. e acerto |
| `apps/server/src/minigames/foosball-cpu.ts` | O Zé do Totó |
| `apps/server/src/minigames/blackjack-bank.ts` | `GameBank`, o diário de moedas do blackjack e do pebolim |
| `apps/server/src/BarRoom.ts` | Mensagens `foosball.join`, `.watch`, `.leave`, `.slot`, `.config`, `.cpu`, `.ready`, `.input` e `.kick`; estado `BarState.foosball`; física a 60 Hz num relógio próprio; frames `foosball.frame` para os jogadores, quem assiste e quem está perto |
| `apps/api/src/wallet-service.ts` | `settleFoosball` |
| `apps/web/src/foosball/` | Painel, desenho da mesa, sons e estilo |
| `apps/web/src/engine/foosball-balls.ts` | A bola nas mesas 3D |

## Testes

- `apps/server/test/foosball.test.ts`: a mesa do mapa, ponteiro e bonecos, chute (toque, bomba, domínio), bloqueio e levantar, gol e traves, frames, lobby (lugares, regras, Zé), partida até o fim e revanche, melhor de 3, tempo de posse (meio, defesa, ataque → zaga), pausa e retorno, saída no amistoso, moedas (recusa, W.O.), o Zé (vence quem não joga; o sóbrio vence o de porre) e o diário do banco.
- `apps/server/test/foosball.room.test.ts`: clientes WebSocket de verdade. Entram na mesa, as partes são cobradas pela API, os frames chegam a cerca de 30 por segundo, o chute é aceito, o W.O. é pago uma vez e o jogador sai pelo lado da sala.
- `apps/api/test/wallet.test.ts`: o acerto paga uma vez, só contra a parte do próprio jogador, até 2× e nunca acima do pote da partida.
- `tests/e2e/foosball.spec.ts` (projeto `foosball`): subir ao salão pelo teclado, E na mesa, regras, Zé sóbrio, pronto, partida com mouse e carga do chute, gol, e sair com o aviso.
