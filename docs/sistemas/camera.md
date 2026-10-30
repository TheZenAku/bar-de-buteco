# Câmera

O jogador escolhe livremente a distância com a **rodinha do mouse**, em zoom contínuo: movimentos pequenos produzem ajustes pequenos, sem saltar entre distâncias predefinidas. **Q** alterna entre primeira e terceira pessoa e conserva a última distância escolhida em terceira pessoa. Nenhuma dessas ações mostra aviso ou toast.

Em **Configurações → Câmera**, o campo **Distância (m)** aceita um valor exato, com ajuste de 0,05 m pelos controles do campo e sem máximo predefinido. Zero entra em primeira pessoa; um valor positivo volta à terceira pessoa. A escolha fica salva no navegador (`bar:settings:v1`): `camera` guarda `first` ou `third`, e `cameraDistance` guarda a última distância positiva, inclusive ao entrar em primeira pessoa.

| Visão | Como fica |
| --- | --- |
| Primeira pessoa | Nos olhos do personagem: logo acima e à frente da articulação da cabeça, então acompanha o corpo sentado, no mictório ou fumando. A cabeça do próprio personagem some (a articulação é encolhida depois que os clipes posam o corpo), mas mãos, braços e o que elas seguram aparecem. Parado, o corpo vira junto com a visão. O nome e o anel do próprio jogador não aparecem. |
| Terceira pessoa | Distância escolhida pelo jogador, olhando a 1,25 m acima dos pés. A menos de 1 m, o ponto de órbita sobe gradualmente até os olhos para evitar entrar no peito; a cabeça some no zoom bem próximo. Quem entra pela primeira vez começa a 6,4 m. |

Preferências antigas são migradas: `near`, `default` e `far` viram terceira pessoa a 3 m, 6,4 m e 10,5 m, respectivamente, quando ainda não existe distância salva.

Arrastar o mouse gira a visão livremente nos eixos horizontal e vertical, em ambas as visões. A câmera pode passar por cima e por baixo do personagem e completar voltas, sem limite de inclinação. Um vetor de orientação acompanha o giro vertical, mantendo o movimento contínuo ao cruzar os polos. Assistindo a uma TV ou ao telão, o enquadramento próprio da tela também permite giro sem limites.

## Movimento suave

Tudo é suavizado por amortecimento exponencial (`camera-rig.ts`):

- o giro e a inclinação seguem o mouse um pouco atrás da mão;
- o zoom desliza até a distância escolhida, e entrar ou sair da primeira pessoa leva a câmera dos olhos para a órbita ao redor do personagem (e vice-versa) suavemente;
- o ponto que a câmera olha segue o corpo com um pequeno atraso; um salto grande (renascer, ser levado de volta) muda direto;
- paredes, lajes, portas, móveis e demais colisores não encurtam a distância escolhida;
- ações como usar o mictório conservam a orientação escolhida pelo jogador, sem giro automático.

## Raio-X

A câmera atravessa os colisores do cenário em qualquer direção. Isso só altera a câmera: as colisões do personagem e as regras de circulação continuam valendo. `cameraFraction` permanece disponível para consultas de geometria, como a sombra de contato, mas não controla o zoom.

Quando alguma coisa sólida fica entre a câmera e o corpo (um teste de visão até a cabeça, o peito e o quadril, `sightBlocked`), abre-se uma janela em volta do personagem: tudo o que está na frente dele, dentro dessa janela, deixa de ser desenhado, do mesmo jeito para qualquer material. A janela tem o formato do corpo (0,8 m para cada lado e 40% mais alta que larga), o miolo totalmente aberto e uma borda fina pontilhada para não ter corte seco. Ela abre em cerca de um décimo de segundo e fecha em um quarto de segundo quando a visão fica livre.

Regras da janela (`camera-xray.ts`):

- só corta o que está mais de 0,5 m à frente do centro do corpo, então os braços e o copo na mão nunca somem;
- nunca corta o piso em que o personagem pisa (nada abaixo de 12 cm acima dos pés), então não aparece um buraco no chão;
- vale só para a imagem: as sombras continuam inteiras;
- não funciona em primeira pessoa, assistindo a uma tela ou na porta do bar.

O recorte é um trecho de shader (`litUserMainStartPS`) aplicado a todos os materiais iluminados antes de o primeiro ser desenhado. Ele descarta pixels com um padrão Bayer 4×4, sem transparência nem ordenação. Na medição com GPU (Edge headless, D3D11), o quadro ficou em ~52 FPS com e sem o trecho compilado.

## Onde está

| Arquivo | Papel |
| --- | --- |
| `apps/web/src/engine/camera-rig.ts` | Zoom contínuo, visões, giro livre, suavização e quando abrir o raio-X |
| `apps/web/src/engine/camera-xray.ts` | O recorte no shader e seus parâmetros |
| `apps/web/src/engine/BarScene.ts` | Liga a câmera à cena: Q, rodinha, arrasto, cabeça escondida, nome e anel do jogador |
| `packages/shared/src/world.ts` | Consultas de geometria (`cameraFraction`) e de visibilidade do jogador (`sightBlocked`) |
| `apps/web/src/settings.ts`, `apps/web/src/main.ts` | Distância e visão salvas, migração de preferências e controles em Configurações |

`tests/integration/camera.test.ts` cobre o zoom fino, a conservação da distância, o giro livre e a passagem da câmera por paredes. `tests/integration/camera-settings.test.ts` cobre a persistência e a migração das preferências. `tests/integration/map.test.ts` continua verificando as consultas de geometria e visibilidade, além das colisões do jogador.
