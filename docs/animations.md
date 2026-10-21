# Animações do bar

Os FBXs originais ficam em `assets-bar/anim`. `npm run assets:animations` gera bancos GLB de animação em `apps/web/public/animations`, sem duplicar as malhas e texturas das skins. Three.js é usado apenas na conversão offline; o navegador continua usando PlayCanvas.

| Arquivo | Uso |
| --- | --- |
| `bebendo.fbx` | Bebida no balcão; a interação dura os 8,87 segundos do clipe. |
| `bebado-caido.fbx` | Tonico cai ao chegar perto de alguém durante o evento do inconveniente e permanece caído até o evento terminar. |
| `carta-distribui.fbx` | Dealer durante a rodada de blackjack. |
| `carta-recomeco.fbx` | Dealer recolhendo/preparando cartas na fase de resultados. |
| `carta-sentado.fbx` | Jogadores sentados à mesa de blackjack. |
| `sit-angry.fbx` | Reação à derrota no blackjack. |
| `Sitting Drinking.fbx` | Cadeiras comuns: sentado bebendo, com o copo na mão direita. O clipe original caminha cerca de 3 m até a cadeira; o conversor usa só a parte sentada (a partir de 4,7 s, 10,5 s em loop) e funde o último 0,6 s com o primeiro quadro para o loop não ter emenda. |
| `Dancing.fbx` | Dança (tecla G) e NPCs durante a festa; substitui a dança procedural. |
| `Bartending.fbx` | Seu Zé (skin Magrão) trabalhando atrás do balcão; exclusivo dele. |
| `karate-kick.fbx` | Tecla X, exclusiva do Rafael; uma execução de dois segundos, sem dano ou deslocamento. |

Os FBXs de ações usam o esqueleto do Nathan. Leandro, Read e Magrão mantêm os rigs AccuRig de suas pastas em `assets-bar`, com pesos e matrizes de bind originais e animações retargeted próprias. Para essas skins e para o Rafael, o conversor adapta rotações globais usando os clipes `Pose` presentes nos modelos como calibração, mapeia os nomes dos ossos e ajusta a altura do quadril. Cada skin carrega seu próprio banco `animations/<skin>.glb`. Os clipes sentados são alinhados à altura das cadeiras; o movimento da raiz não altera a posição autoritativa.

`npm run assets:skins` reimporta os FBXs AccuRig, incorpora as texturas e adapta Idle, Walk e Pose a cada esqueleto; em seguida regenera os bancos de ações. Veja [skins AccuRig](skins-accurig.md).

O servidor valida a skin e impede movimento, outra interação e troca de skin durante o chute. O horário de início da animação é sincronizado para espectadores e reconexões. A tecla X não é capturada ao digitar em formulários ou com modais abertos. Os efeitos visuais das cartas não modificam a distribuição, a privacidade ou os resultados do blackjack.

O conversor usa [`FBXLoader.parse`](https://threejs.org/docs/pages/FBXLoader.html#parse). Os bancos são carregados como containers pelo PlayCanvas e os clipes de ação são reproduzidos sem repetição.
