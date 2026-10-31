# Músicos do palco

O palco do quintal tem quatro lugares de músico: **violão**, **cavaquinho**, **bateria** e **vocal**. Cada lugar aceita um jogador por vez. As animações são as de `16_animacoes_palco.py` (`assets-bar/map/BarBoteco/export/animacoes`).

## No jogo

1. Suba no palco com o ingresso (veja [economia](economia.md#palco)).
2. Chegue a até 1,5 m de um lugar livre. O botão **E** mostra *Tocar violão*, *Tocar cavaquinho*, *Tocar bateria* ou *Cantar no microfone*. Um lugar em uso não é oferecido.
3. Com **E**, o avatar desliza até o lugar em 0,35 s e toca quatro fases: pega o instrumento (`entrando`), começa (`comecando`), toca em loop (`loop`) e, quando pedido, guarda o instrumento e sai (`saindo`). Depois disso (`fim`), o lugar fica livre.
4. Durante o show, o movimento, os emotes e o karatê ficam travados. **E** de novo (*Parar de tocar* ou *Parar de cantar*) guarda o instrumento. Pedido antes do loop, o fim começa assim que o começo acaba.

O instrumento do mapa (`Palco_Violao`, `Palco_Cavaquinho`, `Palco_Baquetas`) some enquanto alguém toca, e a cópia que vem no GLB da animação vai para as mãos. No primeiro quadro de pegar e no último de guardar, a cópia coincide com o instrumento do mapa, com até 3 mm de diferença, então a troca não aparece. O microfone do vocal fica no pedestal.

O lugar da bateria fica dentro do volume da bateria (`COL_Palco_Bateria`). Por isso, os lugares se pegam por proximidade, nunca por chegar ao ponto. No fim, o servidor leva o baterista para o chão livre ao lado (`standingPosition`), e o avatar caminha até lá.

## Show de luzes

Enquanto alguma coisa toca no palco, o quintal ganha um show de luzes: lasers, moving heads, blinders, estrobo e desenhos feitos a laser no telão. Ele é separado das luzes do próprio palco, que seguem as cores do vídeo do telão ([jukebox e TVs](jukebox.md#telão-do-palco)), e fica em `apps/web/src/engine/stage-show.ts`. Quem comanda o show é a [mesa de luz](#mesa-de-luz).

**Quando liga.** Com a mesa no **Auto** (o padrão), o show liga com um vídeo **tocando** no telão ou com um músico em um dos lugares, do começo da música (`comecando`) até o loop. Pegando o instrumento (`entrando`) ou guardando (`saindo`), ainda não. Com a mesa em **Ligado**, o show fica sempre aceso; em **Apagado**, nunca acende, nem com música. Um efeito disparado na mesa acende o show enquanto dura, em qualquer modo. O show acende em pouco mais de 1 s e apaga em cerca de 4 s.

**O equipamento**, montado a partir dos colisores do mapa (`15_palco.py`):

- na treliça da frente, entre as torres (`COL_Palco_Torre*`) e logo abaixo da lona: cinco lasers e quatro moving heads;
- um laser em cima de cada caixa de som (`COL_Palco_PA_Esq` e `COL_Palco_PA_Dir`);
- um laser em cima do telão, que atira por cima da banda;
- no meio da treliça, o projetor que desenha no telão.

Os lasers são instantâneos, como espelhos. Os moving heads giram até onde o programa aponta, na velocidade de um motor. Cada head tem uma luz spot de verdade (sem sombra) que pinta o chão e quem estiver na plateia. O estrobo é uma luz spot larga, virada para a plateia e de costas para o telão, para não refletir na tela; ele também acende os blinders brancos da treliça e das caixas.

**Os feixes** são quadriláteros virados para a câmera, em quatro lotes aditivos de uma chamada de desenho cada: lasers, feixes dos heads, brilhos (lentes, blinders e pontos) e os traços desenhados no telão. Cada feixe para no primeiro colisor do mapa que encontra (o tablado, as paredes do prédio, os muros, as casas vizinhas) ou no chão, e deixa um ponto de luz ali. Um laser que não acerta nada se apaga no céu depois de 30 m. Para não sumir de longe, um laser nunca fica mais fino que 3 pixels, e o brilho dele cai na mesma proporção. De dia, os feixes e os brilhos ficam com 45% da força.

O vídeo do telão é um player (do YouTube ou de [outra plataforma](jukebox.md#plataformas)) atrás do canvas, visto por um "buraco" de alpha zero. Por isso a luz do show sobe o alpha do canvas até a sua própria força (`BLENDEQUATION_MAX`): um feixe ou um desenho na frente do vídeo continua aparecendo.

**Desenhos no telão.** O Letreiro e os Desenhos são traçados por um laser no plano do telão, 5 cm à frente dele, como numa tela de projeção. A fonte é de traço único (`apps/web/src/engine/laser-font.ts`: A–Z, 0–9, `! ? . -` e ♥). O ponto do laser corre pelas letras e deixa o traço aceso; dá para ver o feixe saindo do projetor na treliça até o ponto. Entre um traço e outro o laser apaga. Enquanto há desenho, o telão escurece em meio segundo para 22% (a arte de espera perde o brilho próprio e o vídeo ganha um véu preto), como um painel de LED que apaga para o laser. HIGHLAND ocupa 90% da largura do telão, com letras de uns 80 cm.

**Programas.** São dezesseis. No rodízio da casa, cada um dura oito compassos de 124 BPM (cerca de 15,5 s), e o próximo entra com um flash:

| Programa | O que faz |
| --- | --- |
| Leque | Doze lasers saem do meio da treliça em leque, que abre e fecha a cada dois compassos e varre de um lado para o outro; os heads fazem círculos |
| Tesoura | Os lasers das caixas se cruzam sobre a plateia como uma tesoura; os heads pulam de lado a cada batida |
| Túnel | Dezesseis lasers saem do telão num cone que gira e respira na batida, um túnel em direção à plateia; os heads em branco |
| Onda | Os lasers da treliça mergulham um depois do outro, como uma onda que corre pelo palco; os heads acompanham |
| Chuva | Feixes chovem sobre a plateia, vão e voltam e piscam a cada colcheia |
| Estrobo | Um compasso com estrobo em toda batida, o seguinte só no primeiro tempo; os heads em branco escolhem gente na plateia; os lasers gaguejam na batida |
| Varredura | Uma cortina de 28 lasers sobe por cima das cabeças e desce, uma cor por compasso |
| Letreiro | O laser escreve o letreiro da mesa (HIGHLAND por padrão) no telão, letra por letra, com as cores da paleta da esquerda para a direita. Depois segura o texto pulsando na batida, com um brilho que corre pelas letras a cada compasso e a treliça atirando na plateia, e por fim apaga o texto do começo para o fim |
| Desenhos | Uma estrela que gira, um coração que bate, uma caneca de chopp com espuma e bolhas e um par de colcheias, um por quarto do programa: desenhado, mostrado e apagado |
| Céu líquido | Um teto de 34 feixes logo acima da plateia, ondulando como água |
| Hélice | Três hélices de quatro feixes na treliça, a do meio girando ao contrário, abrindo na batida |
| Grade | Um leque de cada caixa de som; eles se cruzam numa grade de losangos que muda de altura a cada compasso, e os lados trocam de cor na batida |
| Foco | Todos os lasers se encontram num ponto que passeia sobre a plateia e se abrem num estouro a cada batida; os heads seguem o ponto |
| Equalizador | Cada laser da treliça é uma barra de equalizador, uma coluna de feixes que pula nas colcheias e cai; embaixo a primeira cor da paleta, em cima a última |
| Cometa | Um feixe corre das caixas pela treliça e volta, com rastro |
| Relâmpago | Feixes soltos riscam o quintal ao acaso nas colcheias, e a treliça inteira estala no primeiro tempo de cada compasso |

As cores vêm de oito paletas: Highland, Verde, Fogo, Neon, Gelo, Brasil, Pôr do sol e Arco-íris. Na paleta automática, elas trocam a cada programa e todas passam. O tempo, o programa, a paleta e a batida são contados pelo relógio do servidor, a partir dos ajustes da mesa (`showMoment` em `packages/shared/src/stage-show.ts`). Assim, todos os navegadores veem o mesmo show no mesmo momento. O áudio do player não entra no Web Audio, então o show não ouve a música: ele segue o compasso da mesa, que o DJ acerta no tap.

O estrobo, os blinders e os flashes de troca de programa passam por um limitador: um flash só começa 0,45 s depois do anterior, em qualquer programa e andamento (no máximo cerca de 2 Hz). Flashes rápidos sobre a tela inteira podem provocar crises em quem tem epilepsia fotossensível, e por isso o show nunca chega à faixa de 3 Hz ou mais. Um flash segurado pelo limitador não acende.

## Mesa de luz

A mesa de luz fica em cima do palco, ao lado da mesa de som, no ponto que o admin escolheu (`LIGHT_DESK` em `packages/shared/src/stage-show.ts`: x 22,07, y 0,90, z −23,46, de frente para a mesa de som). O blip é violeta (`--blip-desk`). O anel aparece no quintal e também em cima do palco, e o nome só aparece com o jogador em cima dele. Quem sobe no palco (com ingresso) e aperta **E** no anel (*Mexer na mesa de luz*) abre o painel.

O painel fica preso à direita, sobre um fundo transparente. O HUD sai da frente e a câmera vai para o fundo do quintal, de frente para o palco, virada para que o palco fique no meio da parte livre da tela. Arrastar com o mouse gira a câmera. **Esc** fecha o painel e devolve a câmera. Tudo o que se muda no painel vale para todo mundo no quintal na hora, e o rodapé mostra quem mexeu por último.

- **No ar**: o programa, a paleta, o andamento e o compasso de agora, com uma luz que pisca na batida. Logo abaixo ficam os botões **Auto**, **Ligado** e **Apagado**.
- **Efeitos** (teclas 1 a 4): **Flash** (um disparo dos blinders e do estrobo), **Blackout** (um compasso no escuro, que volta com um flash), **Drop** (um compasso subindo e fechando num ponto, sem estrobo, e outro com tudo aberto na batida) e **Letreiro** (escreve o texto agora, por oito compassos, por cima do programa que estiver no ar).
- **Tap** (ou barra de espaço): toque junto com a música. Com dois toques ou mais, o andamento vira a média dos intervalos (até cinco toques) e a batida cai no toque.
- **Cenas**: as nove da casa são Padrão da casa, Abertura Highland, Festa no quintal, Rave, Pagode, Modão, Noite gelada, Karaokê e Tudo apagado. Em **Minhas cenas**, o DJ salva o que está no ar com um nome, até 12 cenas, guardadas só neste navegador.
- **Programas**: **Rodízio** (tocar num programa tira ou põe de volta na sequência; "Todos no rodízio" volta todos) ou **Fixo** (o programa escolhido fica no ar e recomeça a cada volta). Cada programa dura 4, 8 ou 16 compassos. O que está no ar ganha a marca *no ar*.
- **Cores**: Automática ou uma das oito paletas.
- **Ritmo**: andamento de 60 a 180 BPM (com ±1), "O 'um' é agora" (o compasso começa no clique) e os níveis: Geral, Lasers e desenhos, Moving heads, Estrobo e blinders (0–100%) e Movimento (25–200%, a velocidade das varreduras e giros, que também seguem o andamento).
- **Letreiro**: o texto que o laser escreve, com prévia de como vai sair e atalhos (HIGHLAND, BOTECO, SAUDE!, EU ♥ CHOPP, BOA NOITE). O texto perde os acentos e fica em maiúsculas, só com o que a fonte desenha; `<3` vira ♥. Tem no máximo 14 caracteres. Com espaço e mais de 9 caracteres, vai em duas linhas.

**Servidor.** `BarState.stageShow` (`StageShowState` em `apps/server/src/state.ts`) sincroniza os ajustes. A mesa manda dois comandos:

- `show.set`: uma mudança qualquer validada por `showPatchSchema`, até 12 por segundo;
- `show.cue`: um efeito, até 3 por segundo.

Os dois exigem o jogador em cima do palco e ao alcance da mesa (`requireLightDesk`). `applyShowPatch` mantém a contagem de batidas quando o andamento muda, para o programa não pular. Um tap cai numa batida inteira, e com `bar` no começo de um compasso; só valem toques dos últimos 2 s. A cena aplicada fica em `preset`, com `minha:` na frente quando é do DJ. O E na mesa vira o avatar para a mesa de som, toca o gesto de usar e manda `lights.open` para aquele navegador. Os ajustes vivem na memória da sala: ao reiniciar o servidor, volta o show da casa.

## Servidor (autoridade)

- `BarState.musicians` sincroniza, para cada lugar, `{ id, playerId, phase, startedAt, stopping }`: o lugar, o jogador, a fase e o início dela (relógio do servidor).
- `apps/server/src/world/musicians.ts` (`Musicians`):
  - recusa um lugar ocupado e um jogador que já toca;
  - avança as fases pelo comprimento dos clipes (`map-data.json` → `stage.places[].animation.durations`), em fronteiras exatas mesmo com tick atrasado;
  - no **E**, vai para `saindo` na hora se está no loop; antes do loop, marca `stopping`;
  - conexão caída por `MUSICIANS.dropMs` (10 s; `MUSICIAN_DROP_MS` no ambiente) faz o músico parar, e o lugar se libera ao fim do clipe de saída;
  - um avatar que saiu do bar libera o lugar na hora.
- `BarRoom` cuida das regras de entrada e saída:
  - `player.interact` com `palco-<lugar>` exige estar no palco, ao alcance e sem outra ação;
  - o jogador vai para o ponto e o ângulo do vazio, com `interactionState = stage-<lugar>` e `animationState = stage`;
  - `stand` pede a parada;
  - um desmaio ou tropeço libera o lugar sem o clipe de saída;
  - sair do bar (`park`) pede a parada.

As fases que correm sozinhas (pegar → começar → loop, e o fim) **não** dependem do cliente dono avisar com `aoMudarFase`. O servidor e todos os clientes calculam essas fases com `musicianPhase` (`packages/shared/src/musicians.ts`), a partir da fase sincronizada e de `startedAt`. Assim, uma aba em segundo plano não segura o lugar nem atrasa o show para os outros, e quem chega no meio entra na fase e no tempo certos.

## Cliente

O jogo usa PlayCanvas, não three.js. O módulo `palco_musicos.js` foi portado para `apps/web/src/engine/stage-musicians.ts` com a mesma conversão, que desde 28/10 fica em `mixamo-retarget.ts` e também serve às [animações do bar](animacoes-bar.md):

- A direção dos membros da skin é alinhada à referência da autoria numa pose virtual, preservando as matrizes de bind. A diferença de rotação de cada osso no mundo é aplicada a essa referência calibrada; aplicar a diferença diretamente ao bind deixava membros desalinhados entre rigs.
- Ossos da skin sem par no clipe ficam na pose de bind.
- O quadril anda os metros do clipe a partir do repouso da skin.
- Os nomes Mixamo funcionam com qualquer prefixo (`mixamorig:`, `mixamorig1`…), e os nomes canônicos das skins (`hip`, `upperarm_l`…) também.

A conversão acontece no navegador, uma vez por skin e por lugar, quando alguém toca à vista ou quando o jogador chega perto de um lugar livre (pré-carga).

Em `BarScene`, cada fase é um estado de animação `Palco <lugar> <fase>`, posto no tempo do relógio do servidor:

- crossfade de 0,35 s ao entrar e do loop para a saída;
- 0,3 s de volta ao Idle no fim;
- sem balanço de bêbado durante o show.

O Blender deixa de fora canais constantes iguais ao repouso, como a rotação do violão e do cavaquinho no loop. Eles são preenchidos com o valor de repouso. Sem isso, um cliente que pula uma fase (aba escondida, atraso) seguraria o instrumento torto.

As alturas das skins atuais (1,74–1,88 m) ficam dentro da tolerância de 0,15 m em torno dos 1,75 m de autoria. Uma skin fora dela gera um aviso no console; nesse caso, ajuste a escala da skin. Nas banquetas altas, o quadril sentado fica na altura de quem está em pé, como no Blender.

## Assets

`npm run assets:map` lê os vazios `Palco_Lugar_*` e valida os quatro clipes de cada GLB e o instrumento no mapa. Também publica `export/animacoes/palco_*.glb` em `apps/web/public/palco` e grava em `stage.places[]` o arquivo, o hash e as durações. Os FBX de `export/animacoes/fbx` não são usados.

## Testes

- `apps/server/test/musicians.test.ts`: fases dos quatro lugares, um músico por lugar, parada antes do loop, queda de conexão, desmaio.
- `apps/server/test/musicians.integration.test.ts`, por WebSocket real: os quatro lugares ao mesmo tempo, movimento travado, lugar ocupado recusado, quem chega no meio vê o loop, parada, baterista saindo da bateria, conexão derrubada.
- `tests/integration/map.test.ts`: GLBs publicados iguais ao export, clipes e durações, alcance a partir do palco e nunca do chão do quintal, lugar ocupado fora do **E**.
- `tests/e2e/environment.spec.ts`: a cena com os quatro lugares em skins diferentes, a troca do instrumento, alguém chegando no meio, sem erros no console. O show de luzes: apagado sem nada tocando; com o telão tocando, os dezesseis programas em sequência, com lasers que batem no mapa (ou os desenhos no telão, que escurece para eles) e os quatro heads acesos; o flash na troca de programa; apagado com o vídeo pausado; com um músico, só depois de pegar o instrumento.
- `tests/integration/stage-show.test.ts`: a mesa no palco (alcance só lá em cima), o relógio da casa (124 BPM, todos os programas e paletas), andamento sem pulo, tap na batida e no compasso, limpeza do letreiro, comandos recusados, efeitos e a fonte do laser (todo caractere permitido, HIGHLAND do tamanho do telão).
- `apps/server/test/stage-show.integration.test.ts`, por WebSocket real: recusado do chão e longe da mesa, E abre o painel virado para a mesa de som, ajustes, cena e efeito chegam a outro jogador, comandos inválidos não mudam nada.
- `tests/e2e/stage.spec.ts`, mesa de luz: sobe com ingresso, E no blip abre o painel (HUD escondido), a cena Abertura Highland põe o letreiro no telão escurecido, o texto `Boteco <3` vira `BOTECO ♥`, o tap muda o andamento, a tecla 3 dispara o Drop e Esc fecha.
- `tests/e2e/stage.spec.ts` (projeto `stage`), com dois jogadores ao vivo:
  - um sobe, pega o violão e toca, com o movimento travado;
  - o outro chega depois e vê o loop, e o violão não lhe é oferecido;
  - **E** guarda o violão, que volta ao lugar para os dois;
  - nenhum dos dois tem erros no console.
