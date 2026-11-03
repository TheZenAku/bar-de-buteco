# Câmera

A câmera de terceira pessoa segue o estilo da exploração do GTA V: fica atrás do personagem, um pouco acima dos ombros, gira 360° com o mouse, tem três zooms na rodinha (perto, médio e longe) e não atravessa o cenário. **Q** alterna entre primeira e terceira pessoa e conserva a distância escolhida. Nenhuma dessas ações mostra aviso ou toast.

O olhar da câmera move **somente o osso da cabeça**, na horizontal e na vertical, em primeira e terceira pessoa. Parado, girar o mouse não gira o corpo; andando, o corpo continua apontando para o deslocamento. O giro adicional da cabeça é suavizado e limitado a 80° para cada lado e 50° para cima/baixo. Quando a câmera fica atrás, a cabeça mantém esse limite em vez de torcer o pescoço. O servidor replica os dois ângulos separadamente da orientação do corpo, inclusive sentado. Clipes que usam a boca, celular, quedas, palco e moto mantêm sua pose própria.

O giro é aplicado depois da animação e removido antes de avaliar o quadro seguinte. Assim, não se acumula nem altera pescoço, tronco, quadril ou a orientação do personagem. `head-look.ts` na engine aplica a rotação em eixos do mundo, compatível com os eixos diferentes das skins. `tests/integration/head-look.test.ts` verifica esses limites, preservação das animações, pais intactos, taxas de quadros, contrato de rede e envios parados; `tests/e2e/camera.spec.ts` verifica cabeça e corpo com Nathan e Tião nas duas visões.

| Visão | Como fica |
| --- | --- |
| Terceira pessoa | Atrás do personagem, 30 cm à direita, orbitando a altura dos ombros, a 2,5 m (perto), 4,2 m (médio, onde todo mundo começa) ou 6,5 m (longe). |
| Primeira pessoa | Nos olhos do personagem: logo acima e à frente da articulação da cabeça, então acompanha o corpo sentado, no mictório ou fumando. A cabeça do próprio personagem some, mas mãos, braços e o que elas seguram aparecem. Parado, o corpo conserva a direção; só o osso da cabeça acompanha a visão. O nome e o anel do próprio jogador não aparecem. |

## Como ajustar

### No jogo, por jogador

Em **Configurações → Câmera**. Tudo fica salvo no navegador (`bar:settings:v1`).

| Ajuste | O que faz | Faixa | Padrão |
| --- | --- | --- | --- |
| **Zoom** ou rodinha | Afastamento da câmera. Cada passo da rodinha muda um nível e ela para em perto e em longe. Em primeira pessoa, rodar para fora volta ao último zoom. | Perto, Médio, Longe | Médio |
| **Altura** | Sobe ou desce o ponto que a câmera orbita. | −60 a +60 cm | 0 |
| **Sensibilidade do mouse** | Multiplica o giro. | 25% a 300% | 100% |
| **Suavização** | Em 0% a câmera reage com o dobro da velocidade; em 100%, com a metade. Vale para giro, zoom e acompanhamento a pé. Na moto não muda nada. | 0% a 100% | 50% |

### No código, para todo mundo

Os números ficam juntos no bloco *The feel of the third-person view*, no início de [`camera-rig.ts`](../../apps/web/src/engine/camera-rig.ts). Os três zooms são `CAMERA_ZOOMS`, no começo do mesmo arquivo. Se mudar os valores, cada jogador passa para o novo valor mais próximo do que tinha salvo.

| Quer mudar | Constante | Valor | Efeito de aumentar |
| --- | --- | --- | --- |
| **Distância** de cada zoom | `CAMERA_ZOOMS` | 2,5, 4,2 e 6,5 m | Câmera mais longe naquele nível |
| Quanto a rodinha precisa girar para um passo | `ZOOM_NOTCH` | 50 pixels | Exige mais giro |
| Recuo ao correr | `RUN_BACK` | 0,5 m | Abre mais o quadro na corrida |
| **Altura** do ponto de órbita | `HEAD_TO_SHOULDERS` | 0,2 m abaixo da cabeça | Enquadra mais baixo |
| Inclinação inicial | `START_PITCH` | 0,12 rad | Começa olhando mais de cima |
| Limites do olhar | `PITCH_UP`, `PITCH_DOWN` | −0,6 e 1,35 rad | Olha mais para baixo (`PITCH_DOWN`); um `PITCH_UP` mais negativo olha mais para cima |
| Personagem fora do centro | `SHOULDER_SIDE` | 0,3 m | Mais para o lado; 0 centraliza |
| **Sensibilidade** base | `TURN_PER_PIXEL`, `LOOK_PER_PIXEL` | 0,006 e 0,004 rad/px | Gira mais por pixel |
| **Suavização** do giro | `TURN_RATE` | 18 por segundo | Responde mais rápido, com menos suavização |
| Suavização do zoom | `ZOOM_RATE_S` | 10 por segundo | Zoom mais rápido |
| Atraso ao seguir o corpo | `FOLLOW_RATE`, `FOLLOW_RATE_UP` | 10 e 6 por segundo | Fica mais colada ao corpo |
| Volta para trás do personagem | `FOLLOW_AFTER`, `FOLLOW_TURN` | 1,5 s e 0,5 por segundo | Espera mais e gira mais rápido, respectivamente; `FOLLOW_TURN` 0 desliga |
| Aproximar de obstáculo | `CLOSE_TIME` | 0,08 s | Aproxima mais devagar |
| Afastar de novo | `OPEN_TIME`, `OPEN_AFTER` | 0,5 s e 0,18 s | Afasta mais devagar e espera mais |
| Antecipar cantos | `LEAD_TIME`, `LEAD_MOST` | 0,12 s e 2,5 m | Começa a aproximar mais cedo |

## Movimento

- **Mouse:** o giro horizontal não tem limite. Em terceira pessoa, a inclinação para antes dos polos e o horizonte nunca vira. Em primeira pessoa, e assistindo a uma TV ou ao telão, o giro continua sem limites.
- **Suavização:** giro, inclinação e zoom seguem a mão com um pequeno atraso. O ponto que a câmera olha é resolvido para um alvo em movimento, então a distância não muda com a taxa de quadros. Um salto grande (renascer, ser levado de volta) muda direto.
- **Travadas:** a câmera recebe o tempo real do quadro, não o limitado a 0,1 s pelo motor. Um quadro travado não joga a visão metros para trás.
- **Acompanhamento:** depois de 1,5 s sem mexer o mouse, andando ou correndo, a câmera volta aos poucos para trás do personagem, mais rápido na corrida. Ela não gira quando o personagem vem na direção dela nem quando ele está parado. Sentar ou usar o mictório também não gira a visão.
- **Corrida:** o quadro recua um pouco com a velocidade, medida só pelo deslocamento dos pés.

## Qualquer personagem

O enquadramento usa só a posição dos pés e a altura da articulação da cabeça, que toda skin tem. A altura é suavizada devagar: um personagem mais alto, sentado ou caído muda o quadro sem que o balanço da caminhada chegue à câmera. Um avatar ainda carregando (a caixa, sem esqueleto) usa uma altura padrão de 1,62 m.

## Colisão

A cada quadro, um raio sai do corpo até o lugar onde a câmera quer ficar (`cameraFraction`, sobre os mesmos colisores do mapa):

- **Paredes, lajes, tetos, portas e piso** param a câmera no mesmo quadro: ela nunca fica do outro lado.
- **Móveis e objetos** (geladeiras, carrinho de espetinho, carros) aproximam a câmera em 0,08 s, de forma contínua.
- **Afastar** espera 0,18 s com o caminho livre e leva cerca de meio segundo, começando devagar, para não ficar indo e voltando perto de obstáculos.
- **Cantos:** um raio extra olha 0,12 s à frente do movimento da câmera, para ela começar a se aproximar antes de chegar ao canto.
- **Ombro:** sem espaço do lado direito, a câmera volta para trás do personagem até esse lado ficar livre por 0,4 s.
- **Piso:** a câmera fica pelo menos 18 cm acima do chão sob os pés. Olhando para cima, ela se aproxima em vez de entrar no chão.
- **Cabeça:** a menos de 42 cm dela, a cabeça some, e só volta a mais de 55 cm. Isso não conta como primeira pessoa, então o corpo não passa a girar com a visão.
- **A distância escolhida nunca muda:** é para ela que a câmera volta quando há espaço.
- **Moto:** só o prédio aproxima a câmera, para ela não ficar indo e voltando atrás de cada carro ou banco na rua. O resto é resolvido pelo raio-X.

Um raio custou cerca de 0,011 ms na medição feita dentro do bar. O quadro usa no máximo sete, contando os do raio-X. Postes e troncos finos e os limites invisíveis do mapa não contam (regra de `firstHit`). O que é só visual, sem colisor, como as vigas do pergolado, não para a câmera.

## Raio-X

O raio-X agora é a rede de segurança: o corpo pode ficar escondido mesmo com a câmera livre, como um carro na frente dos pés. Quando alguma coisa sólida fica entre a câmera e o corpo (um teste de visão até a cabeça, o peito e o quadril, `sightBlocked`), abre-se uma janela em volta do personagem: tudo o que está na frente dele, dentro dessa janela, deixa de ser desenhado, do mesmo jeito para qualquer material. A janela tem o formato do corpo (0,8 m para cada lado e 40% mais alta que larga), o miolo totalmente aberto e uma borda fina pontilhada para não ter corte seco. Ela abre em cerca de um décimo de segundo e fecha em um quarto de segundo quando a visão fica livre.

Regras da janela (`camera-xray.ts`):

- só corta o que está mais de 0,5 m à frente do centro do corpo, então os braços e o copo na mão nunca somem;
- nunca corta o piso em que o personagem pisa (nada abaixo de 12 cm acima dos pés), então não aparece um buraco no chão;
- vale só para a imagem: as sombras continuam inteiras;
- não funciona em primeira pessoa, assistindo a uma tela ou na porta do bar.

O recorte é um trecho de shader (`litUserMainStartPS`) aplicado a todos os materiais iluminados antes de o primeiro ser desenhado. Ele descarta pixels com um padrão Bayer 4×4, sem transparência nem ordenação. Na medição com GPU (Edge headless, D3D11), o quadro ficou em ~52 FPS com e sem o trecho compilado.

## Preferências antigas

`near`, `default` e `far` viram perto, médio e longe, quando ainda não existe distância salva. Um zoom livre salvo antes dos três níveis vira o nível mais próximo. A exceção é quem tem salva exatamente a antiga distância inicial (6,4 m), ou seja, nunca mexeu no zoom: esse jogador vai para o médio.

## Onde está

| Arquivo | Papel |
| --- | --- |
| `apps/web/src/engine/camera-rig.ts` | Toda a câmera: órbita, suavização, acompanhamento, colisão, ajustes e quando abrir o raio-X |
| `apps/web/src/engine/camera-xray.ts` | O recorte no shader e seus parâmetros |
| `apps/web/src/engine/BarScene.ts` | Liga a câmera à cena: Q, rodinha, arrasto, tempo real do quadro, cabeça escondida, nome e anel do jogador |
| `packages/shared/src/world.ts` | Consultas de geometria (`cameraFraction`) e de visibilidade do jogador (`sightBlocked`) |
| `apps/web/src/settings.ts`, `apps/web/src/main.ts` | Preferências salvas, migração e controles em Configurações |

`tests/integration/camera.test.ts` cobre os três zooms, giro, colisão (inclusive que nenhum quadro de um giro rápido fica atrás de parede, a 60 e a 20 FPS), abertura sem saltos, piso, acompanhamento, alturas diferentes de cabeça, corrida, ajustes e moto. `tests/integration/camera-settings.test.ts` cobre a persistência e a migração das preferências. `tests/integration/map.test.ts` continua verificando as consultas de geometria e visibilidade, além das colisões do jogador.
