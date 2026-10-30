# Animações do bar

Os FBXs originais ficam em `assets-bar/anim`. `npm run assets:animations` gera bancos GLB em `apps/web/public/animations`, sem duplicar malhas e texturas: `<skin>.glb` com as ações e `<skin>-dances.glb` com as danças, que o cliente baixa depois do primeiro para não atrasar o avatar. Three.js participa somente da conversão offline; o navegador reproduz os bancos no PlayCanvas.

## Mapeamento das ações

| Ação no jogo | Fonte | Comportamento |
| --- | --- | --- |
| Parado | `misc/Idle (1).fbx` | `Idle` do banco Mixamo: primeiros 4 s, com os últimos 0,5 s misturados à pose inicial para fechar o loop. |
| Caminhar | `misc/Standard Walk.fbx` | Loop de caminhada, separado da corrida. |
| Correr | `Standard Run.fbx` | Loop de corrida de todas as skins. O arquivo avança cerca de 3 m por ciclo (root motion); o conversor (`inPlace`) remove esse avanço constante e mantém o balanço do quadril, porque quem move o avatar é o servidor. O avanço medido dá o ritmo do clipe a 1× (`MIXAMO_PACE.Run`, 4 m/s no Nathan): a 6 m/s a cadência fica em 1,5×. |
| Embriagado parado / andando | `misc/Drunk Idle Variation.fbx` / `misc/Drunk Walk.fbx` | Entra nos estágios altos de embriaguez; substitui a inclinação procedural nos modelos completos. |
| Tropeçar | `misc/Drunk Idle Variation.fbx` | Cambaleio temporário; não reutiliza mais a queda de desmaio. |
| Dançar | Todos os FBXs de `dance/` | Cada **G** toca uma dança sorteada (veja abaixo). Os NPCs na festa escolhem uma pelo próprio id. |
| Acenar | `misc/Waving Gesture.fbx` | Gesto único sincronizado pela tecla V; antes o servidor o convertia imediatamente em `idle`. |
| Usar objeto | `misc/Button Pushing.fbx` (trecho de 2 s) | Mão estendida ao abrir porta, jukebox ou TV; o personagem vira para o ponto tocado. |
| Esperar / vaso sanitário | `misc/Standing Idle 03.fbx` | Repouso enquanto aguarda Seu Zé ou usa o vaso sanitário. O mictório mantém a ação específica `urinar`. |
| Permanecer sentado | `Sitting.fbx` | Loop de 1,17 s no esqueleto nativo do Nathan, adaptado a cada skin como as demais ações nativas. `Sit` substitui o corpo de `sentado_loop` nas mesas e nos bancos. Entra com mistura de 0,3 s e continua no tempo decorrido desde o início desse trecho da linha do tempo. A cadeira e os demais objetos mantêm a animação original. |
| Blackjack | `carta-sentado.fbx` / `misc/Sitting Angry.fbx` | Pose normal específica das cartas ou reação Mixamo à derrota. As cartas públicas da mão aparecem como geometria real entre as duas mãos (até cinco no leque). |
| Beber | `bebendo.fbx` | Dura 8,87 s; long neck ou copo de chopp acompanha a mão e inclina até os lábios. Com uma bebida na mão (`holding`), roda em loop numa camada própria (`Hand`, mascarada ao braço esquerdo e ao pescoço) por cima de parado, andar, correr, os andares bêbados, a bengala e `Use`, no relógio da sala: quem estiver perto vê os goles ao mesmo tempo. |
| Desmaiar / recuperar | `cair` / `levantar_chao` do export do bar | Mantém o par sincronizado, incluindo a pose no chão e o deslocamento da raiz. `Fallen` (`bebado-caido.fbx`) e `Recover` (`misc/Standing Up.fbx`, primeiros 5 s) permanecem no banco como alternativas de carregamento. |
| Dealer | `carta-distribui.fbx` / `carta-recomeco.fbx` | Distribui e recolhe/prepara as cartas. |
| Seu Zé | `Bartending.fbx` | Atendimento atrás do balcão, exclusivo da skin Magrão. |
| Karatê | `karate-kick.fbx` | Golpe de 2 s da skin Rafael, sem dano ou deslocamento. |
| Bengala | `A_Male_Walk_OldCane*.fbx` | Caminhada e repouso do comando `/velho`, com a bengala presa à mão direita. |

O runtime dá preferência aos clipes Mixamo do banco para repouso, caminhada, corrida, caminhada e repouso de bêbado, dança, aceno, uso de objetos, espera e permanência sentado. Os clipes `parado_loop`, `andar_loop` e `andar_bebado_loop` do export do mapa não substituem essa locomoção.

As ações com contatos e objetos sincronizados conservam o corpo do export: `sentar` e `levantar` puxam a cadeira; comida, cigarro, vômito, mictório, limpeza de mesa e serviço do Magrão acompanham seus próprios objetos e efeitos. `cair` e `levantar_chao` conservam a continuidade da pose e do deslocamento. Os [músicos do palco](../sistemas/palco.md) mantêm suas animações específicas para os instrumentos.

## Danças

O conversor lê todos os FBXs de `assets-bar/anim/dance` em ordem alfabética e gera um clipe `Dance <nome do arquivo>` para cada um, com duas exceções que ele mesmo detecta e registra no log:

- **Cópias**: o mesmo movimento baixado duas vezes (por exemplo `Hip Hop Dancing (7).fbx` e `Hip Hop Dancing (1).fbx`: arquivos diferentes, rotações iguais até meio grau). Fica só o primeiro nome.
- **Poses paradas**: `Female Dance Pose`, `Female Dance Pose (1)` e `Male Dance Pose` têm um único quadro (0,03 s). No G, o personagem ficaria congelado, então não entram.

Restam 13 danças. Quando uma dança não fecha o loop (`Dancing Twerk` e `Hip Hop Dancing (3)` terminam com um polegar fora da pose inicial), os últimos 0,3 s são misturados ao primeiro quadro.

O sorteio é do servidor: a cada G que começa uma dança, `player.dance` recebe um número aleatório de 0 a 65535. O cliente toca `danças[dance % 13]`, com as danças em ordem alfabética, então todos veem a mesma. Um novo G encerra a dança; o próximo G sorteia de novo. Para acrescentar uma dança, ponha o FBX em `dance/` e rode `npm run assets:animations`. Servidor e cliente não guardam lista própria.

## Retarget e objetos

O pacote `misc` usa nomes `mixamorig` e um esqueleto de referência mais alto que o Nathan. O conversor traduz cada osso para os nomes canônicos, mede a altura do quadril na pose de bind e normaliza a escala antes de transferir a animação. Isso evita deslocamentos verticais, membros torcidos e diferenças entre Nathan, Leandro, Rafael, Read, Magrão e os corpos personalizados.

Cada personagem conserva o próprio rig, pesos e matrizes de bind. A calibração mede as direções reais dos membros, adapta rotações globais e trata ossos auxiliares de torção, cotovelo e joelho; veja [esqueletos nativos](native-rigs.md). Clipes sentados ancoram a posição real dos quadris à cadeira. Movimento de raiz visual não substitui a posição autoritativa do servidor.

Os objetos não fazem parte dos FBXs. Garrafa, copo, bengala e cartas são entidades separadas e só aparecem nas ações correspondentes. Garrafa e copo usam um referencial reconstruído a partir da mão e dos dedos de cada rig; as cartas usam as duas mãos. Assim, trocar de personagem não depende de offsets copiados de outro esqueleto.

O servidor sincroniza o início de ações únicas e encerra aceno/uso/recuperação sem sobrescrever uma caminhada que tenha começado no meio do gesto. Ações que ocupam um lugar ou objeto continuam bloqueando movimento conforme a regra do jogo. Os efeitos visuais das cartas não modificam distribuição, privacidade ou resultados do blackjack.

`npm run assets:skins` reimporta as [skins Mixamo](skins-mixamo.md) e regenera os bancos. `npm run assets:retarget` recalibra os modelos existentes. O conversor usa `FBXLoader.parse`; os testes conferem os nomes exigidos, durações, alvos de osso, quaternions normalizados e emendas dos loops.
