# Moto de entrega

O mapa começa sem nenhuma moto Highland Bar Delivery de uso comum. A administração cria essas em **Veículos**, e qualquer jogador perto delas sobe, pilota pelas ruas e calçadas da [cidade](cidade.md) e desce onde quiser. Os jogadores também podem [comprar a própria moto](highfood.md#app-highmotors) no celular: ela fica na [garagem](garagem.md), com placa, chave e tranca. Todos veem as motos de qualquer ponto do mapa, com o piloto em cima.

## Spawnar e despawnar

Na administração, a categoria **Veículos** lista as motos do mapa, com quem pilota, a posição, a distância até você e a velocidade.

- **Spawnar moto:** cria uma moto parada na rua livre mais perto de você, à sua frente e virada na mesma direção quando couber. De dentro do bar ou do terraço, ela aparece na rua lá fora. Sem rua a até 30 m, o servidor recusa e explica.
- **Despawnar:** tira aquela moto do mapa. Quem estiver pilotando desce na hora, ao lado dela, e recebe um aviso.
- **Despawnar todas:** aparece quando há mais de uma moto.

Cabem até 12 motos. Elas ficam só na sala: quando o mundo reinicia, o mapa volta sem nenhuma. Uma moto largada fica onde parou até alguém pegar ou despawnar. Cada spawn e despawn fica registrado no log.

## Controles

| Controle | Na moto |
| --- | --- |
| **E** perto dela | Subir (o aviso é "E para subir"). Caída, levantar (o aviso é "E para levantar a moto") |
| **E** montado | Descer pelo lado esquerdo. Acima de 3 m/s o servidor recusa e pede para diminuir |
| **W** | Acelerar; freia se estiver de ré. Com o motor desligado, tenta dar partida |
| **S** | Frear; parado, dá ré |
| **A / D** | Virar |
| **Espaço** | Freio de mão |
| **Z / C** | Seta esquerda e seta direita. Apagam sozinhas depois de uma curva de uns 40° |
| **X** | Pisca-alerta |
| **H** | Farol alto |
| Arrastar o mouse | Olhar em volta; 1,5 s depois de soltar a câmera volta para trás da moto |
| **Botão direito** na moto (sem arrastar) | Abre o menu com **Informações do veículo**, a até 40 m. Vale para qualquer moto e qualquer jogador. Se o clique pegar também quem está nela, o menu traz o **Perfil** |

Não há controle de toque, porque o jogo não tem controles de toque para andar. Montado, as outras ações pedem para descer primeiro; o chat, a voz e o celular continuam funcionando. Z, X, C e H só valem para a moto enquanto você está nela; fora dela, X e C voltam a ser o chute e a troca de skin.

## Luzes

| Luz | Quando acende | Onde |
| --- | --- | --- |
| Farol baixo e alto | Com alguém montado. Ilumina a rua de verdade e vira com o guidão | Lente redonda do guidão |
| Painel | Com alguém montado | Atrás do farol |
| Luz de posição | Com alguém montado | Os dois painéis do escudo frontal |
| Lanterna e luz de placa | Com alguém montado | Vidro vermelho embaixo do baú |
| Luz de freio | Espaço, ou S e W contra o movimento. A lanterna fica mais forte | A mesma lente |
| Setas e pisca-alerta | Z, C e X, piscando cerca de 90 vezes por minuto | Painéis do escudo (âmbar, no lugar da posição) e cantos da traseira |

As luzes continuam acesas enquanto a moto cai e apagam quando ela para no chão ou fica sem piloto. Quem olha de fora vê as mesmas luzes: `MotoState.lights` leva as chaves e o freio pela sala. O piloto vê as próprias na hora, antes da resposta da sala.

Cada lâmpada é uma lente acesa sobre o desenho do modelo, um halo virado para a câmera (o jogo não tem bloom) e, onde chega à rua, uma luz de verdade sem sombra. O `.glb` tem um material só, então não dá para acender as peças dele. Passados 55 m da câmera só ficam a lente e o halo, o que permite ter 12 motos no mapa. Posições, cores e intensidades ficam em `apps/web/src/engine/moto-lights.ts`.

## Batidas

Bater faz a moto reagir como no mundo real, e o que conta é a parte da velocidade que vai direto contra o obstáculo, não a velocidade total.

- **Até 3,5 m/s contra o obstáculo:** é só um esbarrão. A moto para ou desliza, e o piloto fica nela.
- **A partir de 3,5 m/s:** o piloto é lançado com a velocidade e a direção que a moto tinha, sobe por cima do guidão e cai em ragdoll. Depois de parar, ele se levanta sozinho do chão, sem precisar de tecla. A moto segue conforme o tipo de batida:
  - **De frente** (mais de metade da velocidade contra o obstáculo): a traseira levanta, ela volta e tomba de lado.
  - **De raspão:** ela continua andando sozinha, oscilando, até perder velocidade e tombar. Numa rua livre, isso dá uns 30 m a partir de 13 m/s.
- **Quem está a pé no caminho:** também é lançado, na direção da moto, e o piloto cai junto. Abaixo de 3,5 m/s a moto ainda atravessa quem está a pé.
- **Outra moto:** bate como qualquer obstáculo, leva parte do golpe e tomba também. Quem estava nela é lançado.
- **Piloto que some em alta velocidade** (conexão caiu, desmaio acima de 3 m/s): a moto segue sozinha e tomba do mesmo jeito.

Com a moto caída, chegue perto e aperte **E**. O personagem se abaixa, põe as mãos no guidão e no banco, e em 1,7 s a moto fica de pé, pronta para subir. Se ela parou onde não cabe em pé, como em cima de um canteiro ou encostada numa parede, sobe no lugar livre mais próximo. Enquanto a moto rola ou cai, ninguém sobe nela. Se quem está levantando sair, ela volta para o chão.

Na administração, a coluna **Situação** de Veículos mostra Desgovernada, Caída ou Sendo levantada.

## Atropelar alguém

Quem está a pé e é atingido a partir de 3,5 m/s cai em ragdoll e perde vida pela velocidade da moto (`motoStrikeHp`): a energia cresce com o quadrado da velocidade, então bater devagar tira pouco e bater a toda tira muito.

| Velocidade | Vida perdida |
| --- | --- |
| 3,5 m/s (13 km/h) | 13 |
| 8 m/s (29 km/h) | 32 |
| 12 m/s (43 km/h) | 55 |
| 15,3 m/s (55 km/h) | 80 |

A vida sai na hora do impacto, menos o último ponto: esse só sai quando o corpo para. Assim, um golpe fatal lança o corpo primeiro, e a pessoa desmaia onde cai, em vez de sair do ar direto para o desmaio. Quem foi atingido vê um aviso com o nome de quem pilotava, ou "Uma moto desgovernada" se não havia ninguém nela. Quem pilota continua caindo junto, mas não perde vida.

## Som

Cada moto soa de onde está, para todos os jogadores. Os sons seguem o estado da sala (`engine`, `engineAt`, `crank`, `gas` e a velocidade), então todos ouvem a mesma coisa. Quem pilota ouve o acelerador na hora, antes da resposta da sala. O código fica em `apps/web/src/engine/moto-sound.ts` e o volume segue o volume geral das Configurações.

| Situação | Som |
| --- | --- |
| Subir na moto, ou W com o motor desligado, e pegar | `liga`. O motor puxa aos 0,6 s, com o som ainda tocando |
| A partida não pega porque o motor está ruim | `falha-1`, `falha-3` ou `falha-4`, sorteado pela sala (o motor de partida gira e não pega) |
| A partida não pega porque a bateria está fraca ou descarregada | `falha-2` (só o estalo do relé) |
| Parada, motor ligado | `idle` em loop |
| Acelerando ou andando | `acelerando` em loop, mais agudo e mais alto conforme a velocidade. Soltar o acelerador derruba o tom |
| Soltar o acelerador em velocidade | `parando`, por cima dos loops |
| Descer, cair, ou o motor morrer sozinho | `desliga` |

Só as 4 motos mais próximas tocam os loops, até 85 m. Quanto pior o motor, mais o som falha, e com o escapamento furado ele fica mais alto.

**De onde vêm os arquivos.** Os nove `SCOOTER_*.flac` em `assets-bar/map/BarBoteco/export/moto/sound` são a mesma linha do tempo, exportada até pontos diferentes: `LIGA`, `ACELERANDO`, `DESLIGA` e `PARANDO` são idênticos entre si (91,84 s), as quatro `FALHA` também (120,75 s), e `IDLE` contém tudo (138,39 s). Lá dentro há nove trechos separados por silêncio, e `npm run assets:moto:sound` recorta cada um de `SCOOTER_IDLE.flac` para `apps/web/public/moto/sound` (WAV mono de 32 kHz, 2,3 MB no total). Quem é quem foi deduzido do espectrograma e da ordem em que os arquivos foram salvos. Para corrigir, basta trocar os tempos na tabela `CLIPS` de `tools/assets/import-moto-sounds.mjs` e rodar o script de novo.

| Clipe | Trecho (s) | Observação |
| --- | --- | --- |
| `liga` | 0 a 1,293 | Motor de partida e o motor pegando |
| `desliga` | 1,835 a 3,128 | |
| `acelerando` | 47,2 a 53,2 | Só um pedaço dos 63 s, em rotação alta, com as pontas sobrepostas para virar loop |
| `parando` | 87,2 a 91,842 | Os 2,5 s anteriores do trecho ainda são o acelerador aberto |
| `falha-1` a `falha-4` | 95,906 a 101,139; 103,183 a 104,95; 106,597 a 111,82; 113,25 a 120,575 | A duração também é o tempo que a tentativa leva (`MOTO_CRANK_MS`) |
| `idle` | 131,5 a 137 | O trecho começa do silêncio e só fica estável perto dos 131 s |

## Estado das peças

Com o botão direito na moto, **Informações do veículo** abre o painel: as 12 partes com a porcentagem, a moto vista de cima com cada parte na cor do seu estado, e o que aquela condição significa. Qualquer jogador abre o painel de qualquer moto. Cada batida tira condição das partes, conforme a força e o lado atingido (`wearMotoParts`): de frente, sofrem pneu dianteiro, farol e direção; de trás, lanterna, escapamento e baú; a queda pega carenagem e guidão.

- Abaixo de 1,5 m/s contra o obstáculo, a batida não marca a moto. A pior batida (a toda, de frente) tira de 11% a 18% do motor e de 41% a 69% do farol.
- A carenagem protege motor, bateria, freios e suspensão. Inteira, eles sofrem 65% do golpe; sem ela, 135%.
- Moto nova vem com tudo a 100%. A condição das motos compradas fica salva no banco e sobrevive a um reinício do mundo. A das motos spawnadas se perde, porque elas só existem na sala.

| Parte | A partir de | O que acontece |
| --- | --- | --- |
| Motor | 60% | Perde força (até 45% da força, em 0%) |
| Motor | 50% | Pode não pegar na partida (a chance cai até 20% e, em 0%, nunca pega) |
| Motor | 35% | Morre sozinho andando, de 2% a 18% de chance por segundo. W tenta de novo |
| Bateria | 25% | A partida pode só estalar. Em 0%, não dá partida e nenhuma luz acende |
| Bateria, farol, lanterna | 35% | As luzes oscilam |
| Farol, lanterna | 0% | Não acendem. A lanterna leva junto o freio e as setas traseiras |
| Escapamento | 35% | Mais alto e até 10% menos força |
| Freios | 70% | Freiam menos (30% da força, em 0%) |
| Suspensão | 35% | A moto vira menos |
| Direção | 35% | Puxa para um lado, sempre o mesmo em cada moto, mesmo com o guidão reto |
| Pneus | 25% | Mais resistência: em 0% não passa de meia velocidade. O dianteiro vira menos, o traseiro tira força |
| Baú | 35% | Nas entregas do [Highfood](highfood.md), o pedido chega amassado: vale 15% menos e 1 estrela a menos |

**Consertar.** Perto da moto (até cerca de 1,5 m), com ela parada e sem ninguém nela, de pé ou caída: escolha a parte e clique em **Consertar**. Isso usa 1 peça da mochila, leva 3,5 s e devolve 40%. Enquanto isso, a pessoa não anda e ninguém sobe na moto. Quem cair ou sair no meio perde a peça.

**A peça é provisória.** Há um único item, **Peça de moto** (`peca_moto`, 40 moedas), que serve para qualquer parte, com ícone provisório. A loja da casa vende, e o preço muda em Preços na administração. Para ter peças específicas, adicione os itens em `ITEM_CATALOG` e faça `MOTO_REPAIR` escolher o item por parte.

## Sensação de velocidade

Só para quem pilota, a partir de 50% da velocidade máxima e no máximo a 95%. É discreto de propósito:

- **Zoom out:** a câmera recua até 0,5 m e o campo de visão abre 4° (de 57° para 61°), sem mudar a distância escolhida pelo jogador.
- **Borrão nos cantos:** cada pixel é borrado na direção do centro da tela, quase só nos cantos, e o resto da imagem continua nítido. Os cantos escurecem muito pouco.

O efeito entra aos poucos e sai mais rápido, para não ficar preso depois de uma batida. O borrão roda depois do quadro pronto, sobre uma cópia dele, e não escreve no alfa do canvas, que é transparente na abertura das TVs (`apps/web/src/engine/speed-blur.ts`). Parado ou devagar, não custa nada. A toda, em 1280 × 720 com a GPU desta máquina, o tempo de quadro continuou em 15,9 ms com e sem ele. Os valores ficam nas constantes `RUSH_*` de `BarScene.ts` e `camera-rig.ts`.

## Onde mudar

| O quê | Onde |
| --- | --- |
| Tamanho da moto (desenho, rodas, colisão e altura do banco acompanham) | `SCALE` em `packages/shared/src/moto.ts` (v4: 1,0; modelo em metros) |
| Motor, freios, velocidade máxima, direção, máximo de motos no mapa | `MOTO` no mesmo arquivo |
| A partir de quanto a batida derruba (`CRASH_SPEED`), o que conta como raspão (`GLANCING`), tempo para levantar a moto (`LIFT_MS`) | `MOTO` no mesmo arquivo |
| Como a moto rola sozinha e tomba | Constantes de `packages/shared/src/moto-crash.ts` |
| O corpo: peso, atrito, quique, quanto quica ao bater | Constantes de `packages/shared/src/ragdoll.ts` |
| Luzes | `apps/web/src/engine/moto-lights.ts` |
| Postura do piloto | constantes acima de `seatRider` em `apps/web/src/engine/moto-delivery.ts` |
| Partes, o que cada dano faz, desgaste, vida do atropelado, conserto | `packages/shared/src/moto-parts.ts` |
| Mistura e distância dos sons | `apps/web/src/engine/moto-sound.ts` |
| Recortes dos sons | `CLIPS` em `tools/assets/import-moto-sounds.mjs` e depois `npm run assets:moto:sound` |
| Zoom e borrão em velocidade | `RUSH_*` em `BarScene.ts` e `camera-rig.ts`; o borrão em `speed-blur.ts` |

## Como funciona

O jogo usa PlayCanvas sem motor de física: o movimento é decidido pelo servidor, com as caixas e os pisos de `map-data.json` e `city-data.json`. Por isso a moto não usa Ammo nem `btRaycastVehicle`. Um veículo só no navegador não respeitaria o servidor, e o servidor não tem como rodar Ammo com esses colisores sem duplicar o mapa inteiro.

`stepMoto` (`packages/shared/src/moto.ts`) é o mesmo passo no servidor e na previsão do piloto:

- **Modelo de bicicleta:** o eixo traseiro segue a direção da moto e a roda dianteira a faz girar. Forças em newtons sobre 150 kg, com velocidade máxima de 55 km/h e ré de 2,5 m/s. O ângulo da direção diminui com a velocidade.
- **Chão:** consulta a altura nas duas rodas e nos cantos do casco. A inclinação entre os eixos vem daí, e a moto sobe o meio-fio de 15 cm. Só anda em superfícies de rua (`COL_Rua*` e, na cidade, `COL_Cid_Chao`, `_Quadra`, `_Quadra_Faixa`, `_Calcada` e `_Canteiro`): o piso do bar, o quintal e o palco funcionam como parede. Caixas giradas da cidade são testadas pela forma real.
- **Colisão:** caixa orientada de 0,842 × 2,004 m e altura de 1,20 m, incluindo os espelhos da v4, contra os mesmos sólidos do jogador e as outras motos, com checagem a cada 10 cm, para não atravessar nada nem a 55 km/h. De frente ela para e, acima de 3 m/s, volta um pouco; de lado, desliza pela parede perdendo velocidade. `advanceMoto` também devolve a batida: a velocidade, quanto dela foi contra o obstáculo, a direção da face atingida e o que foi atingido.
- **Em pé:** montada, ela não tomba. A inclinação na curva é só visual, no osso `chassi`.
- **Estado das peças:** `motoHandling` transforma o motor e as partes em força, freio, curva, resistência e puxão. O passo recebe esse resultado, e a sala e a previsão do piloto calculam o mesmo a partir de `MotoState.parts` e `engine`. Com tudo novo, a moto anda exatamente como antes.

### A moto sem piloto

`packages/shared/src/moto-crash.ts` roda só na sala. Os outros jogadores só desenham as amostras, como já faziam com a moto parada. `MotoState.phase` diz em que fase ela está:

| Fase | O que acontece |
| --- | --- |
| `''` | Sobre as rodas, podendo ser pilotada |
| `loose` | Rolando sozinha. As rodas e o garfo a mantêm de pé enquanto ela tem velocidade, a inclinação a faz virar e os buracos da rua a balançam. Abaixo de uns 4,5 m/s ela para de se segurar |
| `tumble` | Corpo rígido: 28 pontos de contato (rodas, manoplas, farol, assoalho, baú) contra os mesmos pisos e sólidos, com impulsos e atrito de Coulomb. A traseira subir na parede, o raspão de lado e o giro vêm dos impulsos, não de um roteiro. Os pneus rolam num sentido e seguram no outro |
| `down` | Parada de lado, com as luzes apagadas |
| `lifting` | Sendo levantada por `lifterId` |

### O corpo lançado

O jogo não tem motor de física, então `packages/shared/src/ragdoll.ts` é um pequeno, por dinâmica baseada em posição: 16 pontos ligados por hastes, com limites de dobra e joelhos e cotovelos que só dobram para um lado. Ele colide com os mesmos pisos e sólidos que os jogadores usam e tem atrito e quique. Roda a 120 Hz.

**A sala e cada navegador rodam os mesmos passos.** `BarState.ragdolls` traz só o início: de onde, quando, a velocidade, a força da batida e uma semente para o sorteio. A partir daí todos calculam o mesmo corpo, então nada do corpo trafega durante o voo. A sala usa o resultado para saber onde o jogador está. Medido entre dois navegadores, a posição final do corpo difere em menos de 2 cm. Quem chega no meio da queda recalcula o tempo que perdeu.

`apps/web/src/engine/moto-ragdoll.ts` transforma os pontos em rotações de mundo sobre o clipe, como `seatRider`, e por isso os eixos dos ossos de cada skin não importam. O clipe só aparece no que o ragdoll não mexe, como mãos, pés e clavículas. Quando o corpo para, `levantar_chao` começa virado para o lado em que ele caiu, e a diferença some em 0,5 s. Já o início do voo parte de onde a moto estava desenhada e alcança a posição da sala em uns 0,3 s, porque quem olha de fora vê a moto 200 ms atrasada.

A câmera continua em terceira pessoa até o corpo ficar de pé, mesmo para quem estava em primeira pessoa.

**Um corpo lançado só perde energia** (`spendEnergy`). Nesse tipo de simulação, toda correção de posição vira velocidade: uma parte empurrada para fora de um sólido dispararia o corpo para cima, e um pé preso do outro lado de um muro fino faria o corpo correr ao longo do muro cada vez mais rápido. Por isso, a cada passo, o que o corpo ganhou de energia é tirado. A [queda do corpo tem som e poeira](../assets/sons-golpes.md), e os [chutes do Rafael](perfil.md#o-chute-que-acerta) lançam este mesmo corpo.

### Rede

`BarState.motos` traz posição, direção, inclinação, velocidade, guidão, quem pilota, o motor e a condição das partes (`parts`, um texto curto na ordem de `MOTO_PARTS`), para todos os jogadores. A moto não usa a área de interesse de 18 m, e quem pilota também passa a ser visto de qualquer distância, para ninguém ver uma moto andando sozinha.

O piloto manda um `moto.input` por passo e o navegador prevê os mesmos passos, reaplicando os que ainda não foram confirmados a cada patch. O servidor roda quantos o relógio permite: um por tick, mais os que uma falha curta acumulou, até meio segundo. Assim uma entrada atrasada não se perde, a fila não cresce e ninguém anda mais rápido que o tempo. Sem inputs por mais de 250 ms (aba congelada, conexão ruim), o servidor solta os controles. Se o piloto cair, apagar ou sair do bar, ele fica ao lado da moto e ela freia sozinha.

### Movimento suave

A simulação roda a 20 Hz, e os patches chegam a 10 Hz. A 55 km/h, cada tick anda 76 cm. Filtrar essa posição "perseguindo o alvo" faz a velocidade desenhada oscilar em volta da real, e por isso a moto tremia mais quanto mais rápida. `apps/web/src/engine/moto-motion.ts` segue as técnicas conhecidas (o passo fixo com interpolação de "Fix Your Timestep" e a interpolação de snapshots):

- **Quem pilota (`PredictedRide`):** os ticks são contados pelo tempo real dos quadros, não por um timer, que numa página ocupada dispara atrasado e de forma irregular. O desenho é a mistura dos dois últimos ticks pela fração de tempo passada.
- **Correção do servidor:** quando a sala discorda da previsão, a simulação adota o valor na hora e a diferença some do desenho aos poucos, sem salto.
- **Os outros jogadores (`RoomTrack`):** veem amostras da sala tocadas 200 ms atrás, para um patch atrasado não deixar faltar dado. O relógio é o da própria moto (`MotoState.ticks`), porque um patch pode trazer nenhum, um ou três passos. Sem amostras novas, ela segue pela própria velocidade por mais 200 ms e espera.
- **Câmera (`trail` em `camera-rig.ts`):** a suavização é resolvida para um alvo em movimento. A exponencial comum supõe o alvo parado durante o quadro, e a distância até a moto variava com a duração de cada quadro.
- **Raio-x:** a janela para antes da traseira da moto, e um poste cruzando a vista não abre a janela: ela só abre com o piloto escondido por mais de 0,25 s.

Medido a 55 km/h, em cada quadro (`tests/e2e/moto.spec.ts` verifica a velocidade desenhada a cada execução):

| | Antes | Agora |
| --- | --- | --- |
| Velocidade desenhada / real, quem pilota (percentis 5 e 95) | 73% a 126% | 99,8% a 100,1% |
| Velocidade desenhada / real, outro jogador (percentis 5 e 95) | não medido | 98,5% a 104,6% |
| Variação da distância moto-câmera por quadro (média / pico) | 3 cm / 52 cm | 0,15 cm / 1,15 cm |

### Desenho

`MotoRig` (`apps/web/src/engine/moto-delivery.ts`) porta os campos da v4: velocidade, direção, freio, acelerador, descanso e curso da suspensão. O ângulo de direção acompanha a simulação; a inclinação continua derivada da aceleração lateral real, inclusive em ré, em vez de apenas do comando do guidão. A suspensão, a balança e o descanso preservam o repouso dos ossos. As cinco malhas de luz usam materiais emissivos independentes por moto; os pontos da v4 posicionam halos, luzes e placa.

Não existe animação de pilotar. `seatRider` parte do clipe `Sit` e, depois dele em cada quadro, põe o quadril no banco, curva o tronco e leva mãos e pés às manoplas e às pedaleiras por IK de dois ossos, no espaço do mundo. Os corpos de braços mais curtos curvam o tronco até alcançar, com até 32°.

A câmera (`CameraRig.ride` e `chase`) vai para a terceira pessoa ao montar e devolve a vista anterior ao descer.

O modelo v4 é desenhado a 100% (`SCALE = 1`), pois já usa metros: roda de raio 0,30 m, entre-eixos de 1,361 m e banco a aproximadamente 0,80 m. A caixa total medida é X ±0,420034 m, Y 0 a 1,199489 m e Z −1,016950 a +0,986000 m; os valores compartilhados arredondam essa caixa para fora. O GLB de colisão mede aproximadamente 0,598 × 1,019 × 1,999 m; usa-se a caixa visual maior para proteger também os espelhos. Os contatos exportados são Z +0,686 na frente e −0,675 atrás; preservam-se os nós do arquivo.

A bag é um item separado da v3. Fora do Highfood, a moto não recebe bag automaticamente. Durante o turno, montar na moto encaixa a bag em `ponto_bau` e esconde a mochila; desmontar remove a bag da moto e mostra a mochila novamente. Cada cliente deriva esse encaixe dos estados públicos `courier` e `riderId`, inclusive para outros jogadores. O carregamento assíncrono verifica novamente se a moto e o piloto ainda estão presentes antes de encaixar, para não deixar bag órfã após desmontar ou despawnar.

`const bag = await motos.criarBag()` cria uma entidade fora da cena; `moto.encaixarBag(bag)` coloca-a em `ponto_bau`, com posição/rotação locais zeradas. `bag.script.motoBag.aberta = true` abre a tampa; `bag.destroy()` remove o item. O módulo `moto-bag.ts` porta o script original, preservando a textura embutida com logos dos dois lados e atrás. A inclinação de 13° de `bag_raiz` já vem no arquivo e não deve ser duplicada. O encaixe também pode ser usado por itens fora do turno, sem fundir a bag à malha da moto.

As [ações de veículos](veiculos-acoes.md) incluem buzina em F, grau na moto em movimento com Shift e empinada com relincho no cavalo com Shift. Elas são validadas e replicadas pelo servidor.

## Publicar uma nova versão

`npm run assets:moto` confere os nós, malhas e texturas embutidas de `export/moto_v4/moto_delivery.glb` e publica a moto, sua colisão e seu script em `apps/web/public/moto`. Publica também `moto_bag.glb` e `moto_bag.js` de `export/moto_v3`. Os arquivos-fonte ficam em `assets-bar/map/BarBoteco`; nenhum script do Blender é executado. A geração da v4 está em `export/moto_v4/scripts/57_moto_v4.py` e contém caminhos de outra máquina.

O mesmo comando renderiza `moto/foto-v4.webp` a partir do GLB publicado, usando PlayCanvas e o navegador de testes (`tools/assets/render-moto-photo.mjs`). Essa é a foto usada na loja HighMotors, nos detalhes da oferta e nos veículos comprados. A oferta aparece como “Moto de entrega”, com aviso de que a bag não acompanha a moto. O identificador persistido continua `moto-delivery`, preservando as motos e chaves já compradas; compras novas e retiradas na garagem usam a v4.

## Testes

| Teste | O que cobre |
| --- | --- |
| `tests/integration/moto.test.ts` | Direção, velocidade, freios, ré, colisão em todas as direções, meio-fio, bar fora de alcance, determinismo, onde a moto pode nascer |
| `tests/integration/moto-crash.test.ts` | Força da batida (de frente, de raspão, de leve), moto contra moto, voo do corpo sem esticar membros nem entrar no chão, o mesmo corpo em qualquer divisão do tempo, parede que segura o corpo, moto sozinha até tombar, tombo e raspão de lado, onde ela volta a ficar de pé |
| `tests/integration/moto-motion.test.ts` | Desenho na velocidade real com quadros irregulares, correções sem salto, amostras irregulares tocadas por igual, moto parada e moto movida para longe |
| `tests/integration/moto-parts.test.ts` | O que cada dano faz na pilotagem, chance de partida e de morrer, desgaste por força e lado, carenagem, vida do atropelado, quem pode consertar, oscilação das luzes, mistura do som, clipes publicados com a duração certa |
| `apps/server/test/moto-parts.integration.test.ts` | Sobre WebSockets reais: partida e motor puxando só depois de pegar, motor que morre, W tentando de novo, cada falha com seu clipe, previsão igual à sala com a moto gasta, atropelamento (vida, aviso, ragdoll), golpe fatal desmaiando só ao cair, desgaste de batida de frente, conserto (longe, sem peça, parte perfeita, ninguém sobe, peça gasta, +40%) |
| `apps/server/test/moto.integration.test.ts` | Mapa sem moto, spawn e despawn só para administradores, limite, montar, previsão igual à sala, entradas irregulares, um piloto só, descer à esquerda, queda e desmaio soltam a moto, moto sozinha até o chão, levantar à mão, batida de leve e batida forte, atropelamento, despawn com piloto |
| `tests/e2e/moto.spec.ts` | Teclado e administração reais, com dois jogadores: spawn, aviso, câmera, farol à frente, rodas, suavidade para quem pilota e para quem olha, curva à direita, parede devagar, despawn. As imagens vão para `test-results/moto` |
| `tests/integration/moto-model.test.ts` | Arquivos publicados idênticos aos fontes v4/v3, bag separada, texturas embutidas, dimensões reais e caixa compartilhada contendo o GLB completo |
| `tests/e2e/moto-v4.spec.ts` | Servidor real, pilotagem e pose por IK, luzes e screenshots parada/andando/virando com e sem bag, logos, tampa e remoção. Imagens e telemetria em `test-results/moto-v4` |
| `tests/e2e/moto-parts.spec.ts` | Teclado e mouse reais, com dois jogadores: botão direito, menu e painel, sons ouvidos pelos dois (o que tocou, ganho e tom), zoom e borrão em velocidade, atropelar, aviso e vida, painel depois da batida, consertar e subir de novo. As imagens vão para `test-results/moto-parts` |
| `tests/e2e/moto-crash.spec.ts` | Teclado real, com dois jogadores: cada luz acesa e vista pelo outro, batida a toda contra o carro, o mesmo corpo nos dois navegadores, moto no chão, levantar do chão, levantar a moto e montar de novo. As imagens vão para `test-results/moto-crash` |

## Limitações

- Dá para atravessar a moto a pé, e abaixo de 3,5 m/s a moto passa por quem está na rua.
- Os NPCs não são obstáculo: a moto passa por eles.
- O corpo lançado não colide com a moto nem com outros jogadores, e uma moto tombando ou deslizando atravessa os outros (só a moto `loose` atropela).
- Quem pilota não perde vida nem itens ao bater: só cai e levanta. Só quem é atropelado perde vida.
- A moto caída ou deslizando não desgasta mais depois da queda. Só a moto comprada desgasta ao andar: 1 ponto a cada 300 m, em geral nos pneus e nos freios.
- A condição das peças das motos spawnadas se perde quando o mundo reinicia, como as próprias motos. A da moto comprada fica salva no banco ([garagem](garagem.md#o-que-fica-salvo)).
- O painel não anda com a pessoa: é preciso fechá-lo para chegar perto da moto.
- Sem animação própria de pilotar nem de levantar a moto (os dois são poses por IK).
- Não há som de batida nem de queda (não vieram na pasta). O som sai do centro da moto; `ponto_escapamento` está disponível no rig.
- A previsão não antecipa a queda: o piloto vê a moto parar e, um instante depois (o tempo de um patch), o corpo voar.
- O `moto_delivery_colisao.glb` não é carregado: o jogo só colide com caixas, então a moto usa a caixa equivalente.
