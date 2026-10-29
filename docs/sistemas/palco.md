# Músicos do palco

O palco do quintal tem quatro lugares de músico: **violão**, **cavaquinho**, **bateria** e **vocal**. Cada lugar aceita um jogador por vez. As animações são as de `16_animacoes_palco.py` (`assets-bar/map/BarBoteco/export/animacoes`).

## No jogo

1. Suba no palco com o ingresso (veja [economia](economia.md#palco)).
2. Chegue a até 1,5 m de um lugar livre. O botão **E** mostra *Tocar violão*, *Tocar cavaquinho*, *Tocar bateria* ou *Cantar no microfone*. Um lugar em uso não é oferecido.
3. Com **E**, o avatar desliza até o lugar em 0,35 s e toca quatro fases: pega o instrumento (`entrando`), começa (`comecando`), toca em loop (`loop`) e, quando pedido, guarda o instrumento e sai (`saindo`). Depois disso (`fim`), o lugar fica livre.
4. Durante o show, o movimento, os emotes e o karatê ficam travados. **E** de novo (*Parar de tocar* ou *Parar de cantar*) guarda o instrumento. Pedido antes do loop, o fim começa assim que o começo acaba.

O instrumento do mapa (`Palco_Violao`, `Palco_Cavaquinho`, `Palco_Baquetas`) some enquanto alguém toca, e a cópia que vem no GLB da animação vai para as mãos. No primeiro quadro de pegar e no último de guardar, a cópia coincide com o instrumento do mapa, com até 3 mm de diferença, então a troca não aparece. O microfone do vocal fica no pedestal.

O lugar da bateria fica dentro do volume da bateria (`COL_Palco_Bateria`). Por isso, os lugares se pegam por proximidade, nunca por chegar ao ponto. No fim, o servidor leva o baterista para o chão livre ao lado (`standingPosition`), e o avatar caminha até lá.

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

- A rotação de cada osso no mundo é medida a partir da pose de repouso do esqueleto de autoria e aplicada à pose de ligação (bind) de cada skin, lida das matrizes inversas de bind.
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
- `tests/e2e/environment.spec.ts`: a cena com os quatro lugares em skins diferentes, a troca do instrumento, alguém chegando no meio, sem erros no console.
- `tests/e2e/stage.spec.ts` (projeto `stage`), com dois jogadores ao vivo:
  - um sobe, pega o violão e toca, com o movimento travado;
  - o outro chega depois e vê o loop, e o violão não lhe é oferecido;
  - **E** guarda o violão, que volta ao lugar para os dois;
  - nenhum dos dois tem erros no console.
