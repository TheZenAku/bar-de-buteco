# Skins Mixamo

Cada personagem tem o próprio esqueleto Mixamo, auto-rigado no próprio corpo. Os arquivos ficam em `assets-bar/mixamo/download/`; `npm run assets:skins` gera `apps/web/public/models/<id>.glb` e os bancos de animação.

| Skin | Esqueleto | Malha e pesos | Texturas |
| --- | --- | --- | --- |
| Rafael | `assets-bar/skins/Rafael/rafael-rigged-corrigido.fbx` (com skin) | Do próprio arquivo, com as normais | O PNG da pasta `.fbm`, que veio em `Rafael-Rigged.zip` |
| Gilmar (`gilmar-gordo`) | `gilmar-gordo/gilmar-gordo-mixamo.fbx` | `gilmar-gordo/gilmar-gordo.fbx`, pesos automáticos | `gilmar-gordo/gilmar-gordo_texture*.png` |
| Gabriel | `assets-bar/skins/Gabriel/Double Dagger Stab.fbx` (com skin) | Do próprio download, com as normais | O JPEG da pasta `.fbm` do FBX da Tripo |
| Flavio Hipotético (`flavio-hipotetico`) | `assets-bar/skins/Flavio Hipotético/Flavio Hipotetico.glb` (GLB já riggado) | Do próprio arquivo, com as normais | O JPEG embutido no GLB |
| Leandro | `assets-bar/skins/Leandro/Leandro.glb` (GLB já riggado) | Do próprio arquivo, com as normais | O JPEG embutido no GLB |
| Rafael Rosé (`rafael-rose`) | `assets-bar/skins/Rafael/Black/Rafael_GokuBlack.glb` (GLB já riggado) | Do próprio arquivo, com as normais | O JPEG embutido no GLB |
| Tonico (só o NPC, fora da coleção) | `assets-bar/skins/Tonico/Tonico.glb` (GLB já riggado) | Do próprio arquivo, com as normais | O JPEG embutido no GLB |
| Tião (`tiao`) | `assets-bar/skins/Tiao/tiao.glb` (GLB já riggado) | Do próprio arquivo, com as normais | O JPEG embutido no GLB |
| Read, Magrão | `outros/<id>-mixamo.fbx` | Rig AccuRig anterior em `assets-bar/mixamo/accurig/<id>.glb` | As do rig anterior |

## Fluxo

1. Para um personagem já existente, `npm run assets:mixamo-export` gera `assets-bar/mixamo/upload/<id>.obj` na pose de bind. Para um novo, envie a malha original.
2. No Mixamo, faça o auto-rig e baixe o FBX. Com **With Skin**, o importador usa a malha e os pesos do Mixamo. Com **Without Skin**, usa só o esqueleto: os pesos vêm do rig anterior ou são calculados.
3. `npm run assets:skins`. Para uma skin: `node tools/assets/import-mixamo.mjs gilmar-gordo` e `node tools/assets/convert-animations.mjs gilmar-gordo`.

## Importador

`tools/assets/import-mixamo.mjs` obtém malha e pesos, nesta ordem:

- **Download com skin**: malha e pesos do Mixamo. As normais, que o Mixamo descarta, vêm do FBX original quando os vértices coincidem.
- **GLB já riggado** (`glb`): malha, normais, pesos, pose de bind e textura do próprio arquivo. Os ossos precisam dos nomes do Mixamo, com ou sem o `:` depois de `mixamorig`.
- **Rig anterior** (`rig`): o modelo AccuRig é posto na T-pose do Mixamo (cada membro alinhado à direção do esqueleto novo) e a malha deformada vira a nova pose de bind. Os pesos passam para os ossos Mixamo correspondentes: torções vão para o membro; dedos médio, anelar e mínimo vão para o indicador (o esqueleto Mixamo tem polegar e indicador); ossos de cotovelo, joelho e planta do pé dividem o peso entre os dois lados da articulação. As juntas Mixamo são ajustadas aos pivôs do rig anterior, para os quais os pesos foram pintados (deslocamentos de até 15 cm).
- **Malha sem rig** (`mesh`): pesos automáticos (`tools/assets/lib/auto-weights.mjs`, no estilo "bone heat"). Cada vértice se prende ao osso mais próximo que enxerga de dentro do corpo. Camadas soltas, como a barra da camisa sobre o short, ficam com o osso atrás do menor número de superfícies. A coxa e o braço não alcançam o que está acima da própria articulação, então o quadril fica com a pelve e o short não atravessa a camisa ao andar. Depois os pesos se difundem pela superfície, com no máximo quatro influências por vértice e corte abaixo de 4%.

Em todos os casos, a malha é simplificada para até 100 mil triângulos com meshoptimizer (costuras de UV preservadas) e a altura é normalizada (Rafael e Rafael Rosé 1,75 m; Gilmar, Gabriel, Flavio Hipotético e Tião 1,80 m; os demais 1,86 m). As texturas são incorporadas: cor base e normal em JPEG 2048, metálico/rugosidade em PNG 512, ou as do rig anterior. Quem só tem a cor (`texture`) leva o arquivo como veio. Depois são acrescentados Idle, Walk e Pose a partir do Nathan.

O cliente acrescenta `?v=` às URLs do modelo, do banco e da bengala das skins reimportadas (`SKIN_VERSIONS` em `BarScene.ts`), para que o navegador não misture arquivos de esqueletos diferentes.

## Gilmar

É uma skin nova da loja, por 900 moedas (`SKIN_PRICE_GILMAR_GORDO`), com miniatura em `apps/web/public/skins/gilmar-gordo.jpg`. A malha do Meshy tem 140.908 triângulos, reduzidos para 100.000. Os pesos são automáticos porque o download do Mixamo veio sem skin. Um download **With Skin** os substituiria pelos do Mixamo sem outra mudança.

## Rafael

Desde 31/10/2026, é a versão da Tripo, de quimono. O `rafael-rigged-corrigido.fbx` traz 65 ossos (com todos os dedos), malha de 10.752 triângulos, normais e pesos. A textura é a do `.fbm` que veio no zip. A altura continua em 1,75 m. O arquivo não traz animação: o chute voador vem do acervo ([perfil](../sistemas/perfil.md#animação-do-chute-voador)).

## Gabriel

Skin da loja, por 900 moedas (`SKIN_PRICE_GABRIEL`), feita na Tripo. O arquivo `Double Dagger Stab.fbx` é um download do Mixamo **With Skin**: traz malha, normais, UVs e pesos. A malha é idêntica, vértice a vértice, à de `tripo_convert_*.fbx`, então vale a textura da pasta `.fbm` daquele FBX (1024 px). O `athlete 3d model.glb` da mesma pasta é outra geração da Tripo, com outros UVs, e não é usado. A malha tem 9.654 triângulos, abaixo do orçamento, e não é simplificada. Só há mapa de cor: sem mapa de normais nem de rugosidade, o material fica fosco. A animação que veio no download é ignorada.

## Leandro

Substituído em 01/11/2026 pelo personagem da Tripo em `assets-bar/skins/Leandro` (leia o `LEIAME.txt` da pasta). O GLB traz 65 ossos com nomes do Mixamo, 10.447 triângulos e uma textura de cor. O modelo caiu de 8 MB e 84 mil triângulos para 1,5 MB e 10 mil. Vem com 1 m de altura, e o importador leva a 1,86 m, a altura que ele já tinha.

## Rafael Rosé

Variante de Rafael, em `assets-bar/skins/Rafael/Black`, de quimono escuro e faixa vermelha. 65 ossos, 10.597 triângulos, 1,75 m como Rafael. É uma carta própria ([coleção](../sistemas/skins.md)), com banco de animações próprio, que inclui os clipes `Kick` e `AirKick` de Rafael (`exclusive` em `tools/assets/convert-animations.mjs`). A tabela de golpes (`kick-paths.ts`) é medida em `rafael.glb` e vale para as duas cartas.

O arquivo pintou o antebraço em 68 vértices da lateral da calça. A opção `strayArms` do importador tira essa influência dos vértices que seguem principalmente a perna. A limpeza é só nessa direção: a faixa vermelha é majoritariamente braço, e é o pouco de perna que a mantém na cintura quando o braço sobe. O topo da calça fecha com um leque de triângulos escondido sob a faixa, com arestas de 14% da altura, e por isso o teste de arestas aceita até 15% nesta skin.

## Tião

Importado em 03/11/2026 de `assets-bar/skins/Tiao/tiao.glb`, da Tripo. O arquivo traz 65 ossos Mixamo, 10.695 triângulos, normais, pesos e uma textura de cor JPEG embutida. A altura de origem é de aproximadamente 1 m, normalizada para 1,80 m, sem simplificar a malha. É uma carta Rara da coleção, por 900 moedas (`SKIN_PRICE_TIAO`), com bancos próprios de ações e danças, bengala e arte da carta com giro.

A revisão do arquivo recebida em 03/11/2026 foi reimportada com `node tools/assets/import-mixamo.mjs tiao`, seguida de `node tools/assets/convert-animations.mjs tiao` e `node tools/assets/render-skin-cards.mjs tiao`. Modelo, ações e arte usam a versão de cache `20261103-v2`, para que navegadores com a revisão anterior carreguem o boneco atualizado. O esqueleto manteve a estrutura, então os bancos regenerados permaneceram idênticos.

## Flavio Hipotético

Skin da loja, por 900 moedas (`SKIN_PRICE_FLAVIO_HIPOTETICO`), feita na Tripo. O GLB traz 65 ossos com nomes do Mixamo, 10.447 triângulos, abaixo do orçamento e sem simplificação, normais, pesos e uma textura de cor de 1024 px. Vem sem mapa de normais nem de rugosidade, sem animação e com 1 m de altura, que o importador leva a 1,80 m. A pose de bind é em A; o retarget calibra pela direção real dos ossos.

Sentado, a ponta de baixo da faixa presidencial acompanha a coxa e o trecho do meio some atrás do paletó, porque os pesos do arquivo prendem aquela parte à perna. Corrigir exige repintar os pesos na origem.
