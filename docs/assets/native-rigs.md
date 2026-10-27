# Animações nos esqueletos nativos

Cada personagem conserva seu próprio esqueleto, hierarquia, proporções, pesos e matrizes de bind. Compartilhamos os movimentos de origem; cada modelo recebe clipes adaptados ao seu rig.

| Modelo | Rig | Juntas da malha |
| --- | --- | --- |
| Nathan | Nathan | 88 |
| Leandro | AccuRig | 100 |
| Rafael | Character Creator / Unreal | 100 |
| Read | AccuRig | 82 |
| Magrão / Seu Zé | AccuRig | 100 |
| Personalizado masculino e feminino | Quaternius | 65 em cada corpo |

## Correção da adaptação

Somente multiplicar as rotações de repouso não resolve poses de origem diferentes. Um rig em A-pose, ao receber movimentos preparados em T-pose, pode terminar com os braços atravessando o tronco. A adaptação agora mede as direções reais dos membros de cada modelo e calcula uma referência virtual compatível com a animação. A pose de bind original do modelo continua intacta.

`tools/assets/lib/animation-retarget.mjs` concentra essa calibração para Idle, Walk, Pose, ações e `/velho`. Cada ombro, braço e segmento da perna recebe sua correção. Mãos e dedos conservam seus eixos nativos; rosto e solas conservam sua orientação neutra. Os ossos de torção distribuem somente a rotação ao longo do membro, sem dobrar a cadeia. Os auxiliares de cotovelo e joelho acompanham a dobra entre os segmentos. A coluna do Rafael mantém seus cinco ossos, com o mapeamento dos três controles de origem sem duplicar os controles intermediários.

O renderizador usa os clipes do próprio modelo e o banco `animations/<id>.glb`. As raízes dos rigs nativos são restauradas pelos clipes, inclusive a conversão de eixos do modelo; não são zeradas pelo código de caminhada. Os controles, a propriedade de skins, as roupas e o estado multiplayer continuam nos sistemas existentes.

## Regerar

Na raiz do projeto:

```powershell
# Recalibrar os modelos existentes e todos os bancos, sem reimportar geometria:
npm.cmd run assets:retarget

# Reimportar Leandro, Read e Magrão dos FBXs, recalibrar Rafael e gerar os bancos:
npm.cmd run assets:skins

# Apenas os bancos de ações e as bengalas:
npm.cmd run assets:animations
```

`tools/assets/retarget-skins.mjs` também aceita IDs específicos. Depois de recalibrar um modelo, regenere seu banco com `node tools/assets/convert-animations.mjs <id>`. Repetir a calibração não acumula dados de animação. A automação de roupas usa a mesma adaptação para os corpos personalizados.

## Validação

`tests/tools/retarget.test.mjs` confere os seis rigs adaptados em caminhada, repouso, dança, bebida e assentos: direção dos membros, comprimento dos ossos, preservação da hierarquia, matrizes de bind e dados originais, repetibilidade e movimento dos auxiliares. Os testes existentes também verificam os bancos, as roupas, as bengalas e as ações exclusivas.

Prévias com os sete modelos no PlayCanvas: [caminhada](../previews/native-rigs-walk.png) e [dança](../previews/native-rigs-dance.png).

A adaptação preserva os pesos fornecidos pelos artistas. Uma malha com pesos ruins ou geometria que já se atravessa na origem ainda pode exigir correção no próprio asset.
