# Sinuca: bola 8 nas mesas do salão de jogos

As três mesas de sinuca do andar de cima (`P_Sinuca`, no meio do salão de jogos) agora são jogáveis. Cada mesa tem a sua partida de bola 8, de uma pessoa contra outra ou contra o **Juca da Sinuca**, o jogador da casa. As regras são as da Noel Snooker ([noelsnooker.com.br/regras/regra-bola-8](https://noelsnooker.com.br/regras/regra-bola-8/)). O servidor decide tudo: ele roda cada tacada pela física, aplica as regras e manda a gravação do percurso das bolas. Todo mundo na mesa, e quem está perto, vê as mesmas bolas rolarem. O navegador só mira e desenha.

Cada partida vale moedas do jogo, com os mesmos valores e o mesmo jeito do truco (veja **Apostas**).

## A mesa

| Medida | Valor | Por quê |
| --- | --- | --- |
| Área de jogo | 1,90 × 0,90 m, entre os narizes das tabelas | É a medida do modelo `P_Sinuca` do mapa |
| Bolas | 52 mm (raio 26 mm) | A bola das mesas de bar desse tamanho no Brasil |
| Caçapa do canto | Boca de 10,6 cm, cerca de 2 bolas, com as queixadas a 142° | Como numa mesa de verdade: a bola que entra torta bate na queixada e pode sair |
| Caçapa do meio | Boca de 11,6 cm, com as queixadas a 104° | Ela só aceita a bola que chega de frente |
| Linha de cabeceira | A um quarto da mesa, do lado da cabeceira (x = −0,475 m) | O quadro, atrás dela, é onde vai a branca da saída |
| Marcas | Superior no meio da linha de cabeceira; inferior no pé, onde fica a bola da frente do triângulo | São as marcas da regra |

**Triângulo** (Noel Snooker): a 1 na frente, sobre a marca inferior; a 8 no meio; uma lisa numa ponta da base e uma listrada na outra; as outras por sorteio. As bolas ficam a um fio de distância (0,1 mm), com até 0,02 mm de folga cada uma, como num triângulo de verdade. Por isso cada saída sai diferente.

## A física

`packages/shared/src/pool/physics.ts` roda só no servidor, em passos fixos de 1 ms. O resultado não depende da taxa de quadros de ninguém, e a mesma tacada sempre dá o mesmo resultado.

- **Sem atravessar**: dentro de cada passo, cada contato acontece no instante exato calculado pelo movimento (bola com bola, com a tabela e com a ponta da queixada). Assim nem a saída mais forte atravessa uma bola ou uma tabela.
- **Contatos no mesmo instante**: a branca que acerta duas bolas encostadas ao mesmo tempo divide o impulso entre as duas, como na mesa real. Os impulsos são resolvidos juntos (Gauss–Seidel projetado). Bolas apertadas num grupo (contra a tabela, no triângulo) também entram juntas. Um contato que mal encosta não quica, então nada treme.
- **Deslizar e rolar**: a bola desliza até o ponto de contato com o feltro parar e então rola (atrito de deslize 0,2, de rolamento 0,012). Por isso a tacada no centro para a branca na bola, a puxada volta e a seguida acompanha.
- **Efeito lateral**: muda o ângulo de saída da tabela (efeito a favor e contra), joga a branca um pouco para o lado contrário (o desvio do taco) e se perde com o tempo.
- **Bola com bola**: restituição de 0,94 e atrito entre as bolas, que desvia um pouco a bola atingida num corte e transmite efeito.
- **Tabelas**: restituição de 0,88, menor quanto mais forte a batida (nunca abaixo de 0,6), com atrito no nariz.
- **Taco inclinado**: a branca pula. No ar, ela passa por cima das bolas e, alta o bastante, por cima da tabela e para fora da mesa.
- **O taco**: depois do toque, o taco continua para a frente, em média até 12 cm. Se a branca parar na frente dele (o caso clássico é empurrar uma bola colada), é **bi-toque**. Se uma bola estiver debaixo da linha do taco, atrás da branca, e o taco estiver baixo demais para passar por cima, o taco **toca a bola**. A mira fica vermelha e avisa antes.

Uma tacada típica leva poucos milissegundos para ser calculada. A saída leva cerca de 50 ms, uma vez só, quando a tacada é dada. A gravação guarda cada bola que se moveu, 30 vezes por segundo e a cada batida, em décimos de milímetro, mais os sons. A de uma saída tem uns 20 kB. Ela só sai do servidor para o navegador, então o limite de 8 kB das mensagens que chegam ao servidor não vale para ela.

## As regras (Noel Snooker)

O juiz (`packages/shared/src/pool/rules.ts`) recebe o que a física registrou e diz o resultado: as faltas, quem joga, os grupos, o que volta para a marca, as escolhas e o fim da partida.

- **Mesa aberta**: até alguém encaçapar uma bola legalmente, a branca pode tocar primeiro qualquer bola menos a 8. A primeira bola que cai define o grupo do jogador. Lisa e listrada na mesma tacada não é falta.
- **Continuidade**: quem encaçapa uma bola do próprio grupo sem falta continua jogando. Sem bola encaçapada, ou com falta, a vez passa.
- **Bola da vez**: com os grupos definidos, a branca precisa tocar primeiro uma bola do grupo do jogador. Quando o grupo acaba, a bola da vez é a 8. Se a branca tocar duas bolas no mesmo instante e uma delas for da vez, a tacada vale.
- **Saída**: no mínimo duas bolas precisam tocar as tabelas, e a branca conta. As saídas seguintes são alternadas. Quem ganha o cara ou coroa escolhe sair ou passar a saída, e o adversário não pode recusar. Numa saída com falta, as bolas encaçapadas ficam fora.
- **A 8 na saída**: sem outra falta, quem saiu escolhe entre recolocar a 8 na marca inferior e continuar, ou uma nova saída. Com falta, quem escolhe é o adversário.
- **Faltas**, todas detectadas pela mesa e mostradas no painel:

| Falta | Como a mesa vê |
| --- | --- |
| Suicídio (branca encaçapada) | A branca caiu numa caçapa |
| Não tocar em bola | A branca não encostou em nenhuma bola |
| Tocar primeiro a bola errada | A primeira bola da branca não era da vez |
| Encaçapar bola do adversário | Caiu uma bola do grupo do outro |
| Bola para fora da mesa | Uma bola saiu da mesa voando |
| Tocar bola com o taco | O taco, baixo demais, encostou numa bola atrás da branca |
| Bi-toque | O taco tocou a branca de novo |
| Tacar com bola em movimento | Chegou uma tacada nova enquanto as bolas ainda rolavam |
| A branca saltar por cima de bola | A branca passou por cima de outra bola |
| Saída sem duas bolas na tabela | Menos de duas bolas chegaram às tabelas na saída |

"Jogar sem ter contato com o chão" não existe no jogo, e as "faltas não punidas" também não, porque a mesa vê tudo.

- **A 8 antes da hora** é derrota.
- **A 8 com a branca**, com só a 8 em jogo, é derrota.
- **A 8 com falta enquanto o adversário ainda tem bolas** (a branca, uma bola dele ou qualquer outra falta): o adversário recebe o benefício da página. A bola de menor número do grupo dele sai da mesa, e ele tem uma tacada contínua para limpar o resto. Se limpar, vence. Se errar ou fizer falta, quem encaçapou a 8 vence. Se a bola tirada era a última dele, ele vence na hora.
- **Desistir**: sair da mesa no meio da partida é desistir, e a partida vai para o outro jogador. A página diz que a partida termina quando um jogador desiste.

### Onde a regra é omissa (decisões minhas)

A página não resolve estes casos. As decisões abaixo podem ser trocadas:

| Caso | Como ficou |
| --- | --- |
| Onde vai a branca da saída | Em qualquer ponto do quadro, atrás da linha de cabeceira, como nas mesas brasileiras |
| Bola encaçapada na saída conta como bola na tabela? | Sim: para cair, ela passou pela linha da tabela |
| Depois de uma falta | A página não fala em bola na mão: o adversário joga a branca de onde ela parou |
| Branca encaçapada ou fora da mesa | Volta para a marca superior ("o mesmo acontecerá com a branca"). Se a marca estiver ocupada, vai para a linha do comprido da mesa, o mais perto possível, na direção da tabela de cabeceira |
| A 8 recolocada com a marca ocupada | Na linha do comprido da mesa, o mais perto possível, na direção da tabela do pé (a página) |
| Bola fora da mesa | É falta. Uma bola da vez volta para a marca inferior, pela mesma regra da 8. A 8 fora da mesa é falta, não derrota |
| Lisa e listrada na mesma tacada, mesa aberta | O grupo é o da primeira bola que cai |
| A saída define o grupo? | Sim, se a saída for legal |
| A 8 na mesma tacada da última bola do grupo | É a 8 antes da hora (o grupo não estava limpo quando a tacada começou), então é derrota |
| Benefício por outras faltas além da branca e da bola do adversário | Vale para qualquer falta com a 8 (mantém o espírito da regra) |
| A 8 na saída, com falta, e nova saída | O adversário, que escolheu, sai |
| Tempo | 60 s por tacada. Sem tacada, a vez passa, sem falta. 20 s para cada escolha |
| Sorteio de quem sai | Só na primeira partida da dupla. Na revanche, a saída alterna |

## Apostas

Os valores e o jeito são os do truco ([Truco](truco.md)):

| Partida | Aposta por pessoa | Quem decide |
| --- | --- | --- |
| Contra o Juca, Iniciante | 100 moedas | O nível escolhido por quem abriu a mesa |
| Contra o Juca, Na média | 150 moedas | O mesmo |
| Contra o Juca, Matador | 200 moedas | O mesmo |
| Entre duas pessoas | De 400 a 5000, de 100 em 100 | Quem abriu a mesa, com o **−** e o **+** |

- Quem vence recebe o dobro do que pôs. Contra o Juca, a casa cobre a parte dele, como os NPCs do truco.
- Quem sai no meio da partida, ou não volta depois de cair da conexão, perde a aposta, e a partida vai para o outro.
- Como no truco, o lugar vazio é da casa: quem confirma a aposta sozinho joga contra o Juca no nível escolhido. **Chamar o Juca agora** e **Tirar o Juca** continuam no lobby.
- Qualquer mudança de nível ou de valor pede a confirmação de novo. O botão mostra **Apostar X e começar** (ou **e confirmar**, entre duas pessoas), **Faltam moedas** quando o saldo não dá, e **Retirar a aposta** enquanto se espera o outro.

As moedas fazem o caminho seguro do truco:

| Passo | Onde | O que acontece |
| --- | --- | --- |
| Início | `GameBank('pool').stake` → `POST /api/internal/wallet` | Com os dois prontos, a parte de cada um é gravada no diário em disco (`.data/world/outbox.pool.jsonl`) e debitada com o motivo `pool:bet:<partida>`. Se uma carteira recusa, a partida não começa e as partes voltam |
| Fim | `GameBank.settle` → `POST /api/internal/pool/settle` | O vencedor recebe 2× a sua parte e o perdedor recebe 0. O acerto é reenviado a cada 3 s enquanto a API estiver fora |
| A API paga | `WalletService.settlePool` | Paga uma vez por partida e jogador, só contra a parte dele no livro-caixa e nunca acima de 2× (`POOL_MAX_RETURN`). Não há conferência de pote, como no truco, porque a parte do Juca é da casa |
| Queda do servidor | `GameBank.recover` | As partes de partidas que não terminaram voltam (`pool:refund:<partida>`) |

Os valores ficam na tabela de preços do admin, grupo **Jogos**: `pool:level-facil`, `pool:level-medio`, `pool:level-dificil`, `pool:min-bet` e `pool:max-bet`. No admin, as moedas aparecem com a origem **Sinuca**, e o log mostra **Partida de sinuca** e **Prêmio da sinuca recusado**.

> As moedas não podem ser compradas com dinheiro real. Se um dia puderem, vale a ressalva do blackjack: antes, é preciso uma avaliação jurídica.

## A partida, passo a passo

```
lobby → choice (cara ou coroa) → aim → rolling → aim … → finished → lobby (revanche)
                                  ↘ choice (a 8 na saída) ↗
                 (paused enquanto quem precisa jogar está sem conexão)
```

1. **lobby**: dois lugares e a aposta, num cartão sobre a mesa, como no truco. Quando todo mundo confirma a aposta, ela é recolhida e a partida começa. O lugar vazio fica com o Juca.
2. **choice**: o cara ou coroa. Quem ganha escolhe sair ou passar a saída.
3. **aim**: a vez de alguém, com 60 s. Na saída, a branca vai no quadro.
4. **rolling**: a tacada rola. O resultado vem 0,5 s depois que tudo para.
5. **finished**: o resultado fica 15 s. Depois a mesa volta ao lobby com os mesmos lugares, e **Revanche** já marca o pronto. O placar de partidas vencidas fica ao lado do nome.

Se a conexão de quem precisa jogar ou escolher cai, a mesa espera 25 s. Se a pessoa não volta, perde a partida. Uma mesa com partida rolando é assistida: o painel abre só para ver.

## Juca da Sinuca

O jogador da casa (`packages/shared/src/pool/ai.ts`) joga com a mesma física e o mesmo juiz. Para cada bola que ele pode tocar e cada caçapa, ele acha a bola fantasma. Descarta os caminhos bloqueados e os cortes finos demais e ordena o resto pela facilidade. Depois simula as melhores tacadas com algumas forças, e com seguida e puxada quando sabe usar. Cada resultado é avaliado pelo juiz: vencer, falta, continuar com boa posição para a próxima ou, sem bola, deixar pouco para o adversário. Os níveis que sabem jogar repetem as melhores tacadas com a mira um pouco para cada lado e decidem pela média. Assim evitam a tacada que, por um fio, derruba a 8 ou a branca. Ele pensa em fatias de poucos milissegundos por ciclo da sala, para o servidor não travar, e erra conforme o nível:

| Nível | Erro de mira | Erro de força | Tacadas que pesa | Seguida e puxada | Pensa |
| --- | --- | --- | --- | --- | --- |
| Iniciante | 1,5° | 14% | 5 | não | 1,6 a 2,8 s |
| Na média | 0,55° | 7% | 9 | sim | 1,3 a 2,3 s |
| Matador | 0,17° | 3% | 14 | sim | 1,0 a 1,9 s |

Em 12 partidas simuladas, o Matador venceu o Iniciante 11 vezes.

## O painel

O painel (`apps/web/src/pool/`) segue o blackjack: o mesmo cabeçalho, o feltro violeta, o magenta da vez, o dourado para o que conta e o relógio ciano. Ele ocupa a tela toda, do tamanho da mesa de truco. Enquanto você está na mesa, o cabeçalho do jogo, a barra de ações, os avisos de tecla e o mapa saem da frente, e o jogo para de receber o teclado (E sai da mesa). O rodapé mostra o saldo e o que está em jogo, e o topo mostra **Valendo X** durante a partida. A tela final mostra o que você ganhou ou perdeu.

- **Placar**: os dois jogadores, com o contorno magenta em quem joga. Cada um mostra o grupo (lisas ou listradas), as bolas que ainda faltam (as encaçapadas apagadas), **Na bola 8** em dourado quando o grupo acabou, o benefício quando vale e as partidas vencidas. No meio ficam de quem é a vez, **mesa aberta** ou **saída**, e a barra do tempo, que fica laranja nos últimos 10 s.
- **O que aconteceu**: as três últimas jogadas numa faixa entre o placar e a mesa (faltas em laranja, bolas encaçapadas em dourado), nunca por cima de uma caçapa.
- **A mesa** (`render.ts`, canvas): madeira escura com o brilho magenta da casa e os diamantes, as tabelas com as queixadas, o feltro violeta com a linha de cabeceira, as marcas e a logo. Cada bola é desenhada ponto a ponto como uma esfera iluminada e gira pelo quanto rolou: a listra, o número no disco branco e os pontos vermelhos da branca acompanham o movimento. A caçapa brilha na cor da bola que caiu. Numa tela em pé (celular), a mesa fica em pé.
- **Mira**: a linha da branca até a bola fantasma e para onde vão as duas bolas (a atingida em ciano). A linha fica vermelha, com um X, quando a bola atingida não é da vez. O taco recua com a força e fica vermelho quando encostaria numa bola. Os outros veem a mira e o taco de quem joga, mais apagados.
- **Comandos (mouse)**: mover o mouse sobre a mesa mira. **Segurar o botão esquerdo** trava a mira e enche a barra de força (de 0 a 100% em 1,4 s, e para no máximo), com o taco recuando junto. **Soltar o botão** dá a tacada com a força em que a barra parou. Um toque rápido (menos de 3%) não taca, e o botão direito ou Esc cancelam a tacada que está carregando. A roda do mouse faz o ajuste fino da mira, que se perde quando o mouse se move de novo de verdade. O efeito se escolhe clicando na bola do efeito (duplo clique centraliza) e a inclinação no controle **Taco**. Pelo teclado, I J K L, Z/X e A/D também funcionam. Na saída, a branca segue o ponteiro dentro do quadro, e o clique a deixa ali (M volta a movê-la). No toque: arraste para mirar ou mover a branca e segure **Segure para tacar**, soltando para tacar. Os comandos escrevem num objeto só (`PoolControls`), pronto para um controle ou outro esquema de toque.
- **Escolhas**: o cara ou coroa (**Eu saio** / **Passar a saída**) e a 8 na saída (**A 8 na marca e jogo** / **Nova saída**), com as teclas 1 e 2.
- **Fim**: **Vitória!** em dourado, ou quem venceu, o motivo e o placar, com **Revanche** e **Sair da mesa**.
- **Sons** (`sounds.ts`, sintetizados): o estalo das bolas (mais seco quanto mais forte), a batida na tabela, a bola caindo e rolando na caçapa, a ponta do taco, o pulo, a falta, a sua vez e o fim. Liga e desliga no ícone de som (salvo neste navegador).

Na cena 3D (`apps/web/src/engine/pool-balls.ts`), quem está perto vê as 16 bolas na mesa de verdade, com o mesmo percurso da gravação: rolando, girando e caindo na caçapa. O modelo do mapa trazia um triângulo, uma branca e um taco decorativos fundidos à malha da mesa. Os triângulos deles são tirados quando o mapa carrega, e só as bolas do jogo ficam. Os avatares ficam de pé dos dois lados compridos da mesa. Eles ainda não seguram um taco.

Para ver o painel sem servidor, abra `tests/fixtures/pool.html` pela Vite (`/@fs/<caminho>`). A vitrine roda a mesa do servidor, a física e o Juca no navegador:

- `fixture.play('dificil')` joga você contra o Juca.
- `fixture.watch('medio')` põe o Juca contra ele mesmo, só para assistir.
- `fixture.lobby()` mostra o lobby.
- `?clean` esconde a barra, e `?play` ou `?watch` começa direto.

## Mensagens

| Do navegador | O que faz |
| --- | --- |
| `pool.join {tableId, seat?}` | Pega um lugar. Se a mesa estiver cheia ou em jogo, assiste (`pool.open` diz qual) |
| `pool.watch {tableId}` | Assiste de perto (`''` para de assistir) |
| `pool.leave` | Sai da mesa. No meio da partida, é desistir |
| `pool.seat`, `pool.cpu`, `pool.config`, `pool.ready` | O lobby: trocar de lugar, chamar ou tirar o Juca, o nível dele e o pronto |
| `pool.choice {choice}` | `break` ou `pass` no cara ou coroa; `spot` ou `rerack` com a 8 na saída |
| `pool.aim {...}` | A mira e a branca no quadro, até 14 por segundo, repassadas a quem está na mesa |
| `pool.shot {shot, angle, power, spinX, spinY, elevation, cue?}` | A tacada. `shot` é o contador de tacadas da mesa: uma tacada repetida (clique duplo) ou antiga é recusada |

O servidor manda `pool.view` (a mesa como está, a cada mudança), `pool.shot` (a gravação da tacada, para todos ao mesmo tempo, e para quem chega no meio, que entra no ponto em que ela está) e `pool.aim`. Recebem tudo os jogadores da mesa, quem assiste e quem está no mesmo andar a até 18 m (para as bolas 3D). Quem anda para longe para de assistir. O jogador vem da sessão, nunca da mensagem, e os valores são conferidos por esquema (`poolShotSchema` e os outros).

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `packages/shared/src/pool/table.ts` | Mesa, caçapas, tabelas, marcas, triângulo e lugares no bar |
| `packages/shared/src/pool/physics.ts` | A física e a gravação da tacada |
| `packages/shared/src/pool/aim.ts` | A linha de mira e caminhos livres (painel e Juca) |
| `packages/shared/src/pool/rules.ts` | O juiz da bola 8 (Noel Snooker) |
| `packages/shared/src/pool/ai.ts` | Juca da Sinuca |
| `packages/shared/src/pool/index.ts` | Tempos, visão sincronizada, codificação da gravação e esquemas das mensagens |
| `apps/server/src/minigames/pool.ts` | A mesa: lobby, apostas, sorteio, vez, tacadas, juiz, escolhas, pausa, desistência e revanche |
| `apps/api/src/wallet-service.ts` | `settlePool` |
| `apps/server/src/BarRoom.ts` | Mensagens `pool.*`, quem recebe as visões, lugares dos avatares e log `pool_match` |
| `apps/web/src/pool/` | Painel, desenho da mesa, sons e estilo |
| `apps/web/src/engine/pool-balls.ts` | As bolas nas mesas 3D e a retirada do triângulo decorativo do mapa |

## Testes

- `apps/server/test/pool.test.ts` cobre:
  - a mesa do mapa e o triângulo;
  - a física: saída real, encaçapar reto, em corte e rente à tabela, puxada, seguida e efeito na tabela, colisões simultâneas, nada atravessa nada em tacadas fortes em todas as direções, a mesma tacada dá o mesmo resultado, bi-toque, salto, branca para fora e o taco na bola;
  - a linha de mira;
  - as regras: os cenários 1 a 13 do pedido, a 8 na saída e o benefício;
  - a mesa: partida completa com sorteio, branca no quadro e juiz, tacada com bola em movimento, sequências até o fim contra o Juca contando todas as bolas a cada tacada (cenário 15), o Matador contra o Iniciante, escolhas da 8, desistência, pausa por queda de conexão, tempo esgotado e revanche com a saída alternada.
- `apps/server/test/pool.test.ts` também cobre as apostas: os valores por nível, a aposta entre pessoas e os seus limites, a carteira que recusa, o vencedor recebendo o dobro e a desistência que perde a parte.
- `apps/api/test/wallet.test.ts`: o acerto da sinuca paga uma vez, só contra a parte do próprio jogador e até 2×.
- `apps/server/test/pool.room.test.ts` usa clientes WebSocket de verdade (cenário 16). As duas partes de 400 são debitadas pela API, e o vencedor recebe 800 uma vez. Os lugares, o sorteio, a vez e a branca fora do quadro são conferidos. A mira de quem joga chega ao outro jogador. Uma tacada chega idêntica aos dois jogadores e a quem está perto, e a mesa depois dela também é idêntica. Quem está em outro andar não recebe nada, e o teste termina com a desistência.
