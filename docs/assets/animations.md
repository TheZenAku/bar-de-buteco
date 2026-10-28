# Animações do bar

Os FBXs originais ficam em `assets-bar/anim`. `npm run assets:animations` gera bancos GLB em `apps/web/public/animations`, sem duplicar malhas e texturas. Three.js participa somente da conversão offline; o navegador reproduz os bancos no PlayCanvas.

## Mapeamento das ações

| Ação no jogo | Fonte | Comportamento |
| --- | --- | --- |
| Parado | `Idle` já calibrado de cada modelo | Loop de repouso normal. |
| Caminhar | `misc/Standard Walk.fbx` | Loop de caminhada, separado da corrida. |
| Correr | `misc/Run.fbx` | Loop de corrida real; não é mais a caminhada apenas acelerada. |
| Embriagado parado / andando | `misc/Drunk Idle Variation.fbx` / `misc/Drunk Walk.fbx` | Entra nos estágios altos de embriaguez; substitui a inclinação procedural nos modelos completos. |
| Tropeçar | `misc/Drunk Idle Variation.fbx` | Cambaleio temporário; não reutiliza mais a queda de desmaio. |
| Dançar | `misc/Samba Dancing.fbx` | Samba em loop para a tecla G e a festa. |
| Acenar | `misc/Waving Gesture.fbx` | Gesto único sincronizado pela tecla V; antes o servidor o convertia imediatamente em `idle`. |
| Usar objeto | `misc/Button Pushing.fbx` (trecho de 2 s) | Mão estendida ao abrir porta, jukebox ou TV; o personagem vira para o ponto tocado. |
| Esperar / banheiro | `misc/Standing Idle 03.fbx` | Repouso neutro enquanto aguarda Seu Zé ou usa o banheiro, sem reutilizar uma ação incompatível. |
| Sentar | `misc/Seated Idle.fbx` | Loop neutro de cadeira. Substitui `Sitting Drinking`, que fazia o personagem segurar um copo invisível. |
| Blackjack | `carta-sentado.fbx` / `sit-angry.fbx` | Pose normal ou reação à derrota. As cartas públicas da mão aparecem como geometria real entre as duas mãos (até cinco no leque). |
| Beber | `bebendo.fbx` | Dura 8,87 s; long neck ou copo de chopp acompanha a mão e inclina até os lábios. |
| Desmaiar | `bebado-caido.fbx` | Queda única que conserva o último quadro no chão. |
| Recuperar | `misc/Standing Up.fbx` (primeiros 5 s) | Levanta do chão durante a condição de recuperação, em vez de saltar de caído para `Idle`. |
| Dealer | `carta-distribui.fbx` / `carta-recomeco.fbx` | Distribui e recolhe/prepara as cartas. |
| Seu Zé | `Bartending.fbx` | Atendimento atrás do balcão, exclusivo da skin Magrão. |
| Karatê | `karate-kick.fbx` | Golpe de 2 s da skin Rafael, sem dano ou deslocamento. |
| Bengala | `A_Male_Walk_OldCane*.fbx` | Caminhada e repouso do comando `/velho`, com a bengala presa à mão direita. |

## Retarget e objetos

O pacote `misc` usa nomes `mixamorig` e um esqueleto de referência mais alto que o Nathan. O conversor traduz cada osso para os nomes canônicos, mede a altura do quadril na pose de bind e normaliza a escala antes de transferir a animação. Isso evita deslocamentos verticais, membros torcidos e diferenças entre Nathan, Leandro, Rafael, Read, Magrão e os corpos personalizados.

Cada personagem conserva o próprio rig, pesos e matrizes de bind. A calibração mede as direções reais dos membros, adapta rotações globais e trata ossos auxiliares de torção, cotovelo e joelho; veja [esqueletos nativos](native-rigs.md). Clipes sentados ancoram a posição real dos quadris à cadeira. Movimento de raiz visual não substitui a posição autoritativa do servidor.

Os objetos não fazem parte dos FBXs. Garrafa, copo, bengala e cartas são entidades separadas e só aparecem nas ações correspondentes. Garrafa e copo usam um referencial reconstruído a partir da mão e dos dedos de cada rig; as cartas usam as duas mãos. Assim, trocar de personagem não depende de offsets copiados de outro esqueleto.

O servidor sincroniza o início de ações únicas e encerra aceno/uso/recuperação sem sobrescrever uma caminhada que tenha começado no meio do gesto. Ações que ocupam um lugar ou objeto continuam bloqueando movimento conforme a regra do jogo. Os efeitos visuais das cartas não modificam distribuição, privacidade ou resultados do blackjack.

`npm run assets:skins` reimporta as [skins Mixamo](skins-mixamo.md) e regenera os bancos. `npm run assets:retarget` recalibra os modelos existentes. O conversor usa `FBXLoader.parse`; os testes conferem os nomes exigidos, durações, alvos de osso, quaternions normalizados e emendas dos loops.
