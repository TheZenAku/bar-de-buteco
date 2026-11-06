# A Morte

Quando um jogador morre, a Morte surge da névoa perto dele, flutua até ele, golpeia o chão ao lado do corpo, ri e o leva. A tela da vítima escurece por 5 segundos com uma frase, e ela só volta depois de repetir uma sequência de botões. Quem está perto vê a cena e ouve; só a vítima vê o escuro e o minigame.

Ao morrer, o personagem entra imediatamente em **ragdoll**, sincronizado com os outros jogadores. O corpo cai e permanece no chão até a névoa levá-lo, sem iniciar a animação de levantar. Uma queda que já esteja em andamento, como a de um acidente fatal, é preservada. O ragdoll é removido quando o corpo some, no respawn ou ao sair.

## Causa da morte

O jogo **ainda não tem causa de morte própria**: `needs.ts` só desmaia (e o desmaio não mata). A única causa é o botão **Matar jogador (teste)** da administração. Quando uma causa de verdade existir, basta chamar `deaths.kill(id, causa)` em `BarRoom.ts` (o `cause` vai para o log `death_start`).

Admin → Jogadores → ficha → aba **Moderação** → *Matar jogador (teste)*, com motivo obrigatório (o mesmo formulário de confirmação do banimento). `POST /api/admin/player {op:'kill'}`:

- só administradores; a **conta principal nunca** (403), nem por ela mesma; outro administrador só pela conta principal (a mesma regra de moderação);
- grava `player-kill` em `moderation_actions` com o motivo e põe o controle `kill` no outbox (o mesmo canal de `sync`, `kick` e `event`);
- **409** se o jogador já estiver morto: o mundo registra `death_start` e `death_end` no log (`game_logs`, origem `world`), e a API recusa enquanto o último for `death_start` (com teto de `DEATH.maxMs`), ou quando houve outra ordem de morte nos últimos 5 s (o clique duplo, antes de o log do mundo chegar). Se o jogador não está no bar, o mundo ignora o controle.

## A skin Morte

`morte` em `SKINS` (base `morte`, variante Original, **lendária**, preço 0) com `adminOnly: true`:

- oculta por padrão no `skin_catalog` (`availability` padrão `hidden` quando `adminOnly`), e `POST /api/wardrobe/buy` a recusa com **409 mesmo que a administração a ponha à venda**;
- a concessão e a retirada são as da ficha do jogador (aba *Itens e skins*, `op:'skin'`), que já lista tudo o que está em `SKINS`; retirar põe Nathan de volta;
- `seed.ts` e `dev-bots.ts` não a dão aos bots nem à conta de desenvolvimento.

**Pendência:** a skin é uma carta, não um corpo jogável. Não existe `models/morte.glb` com o rig Mixamo e o banco de animações que todo corpo de jogador precisa, nem a arte da carta (`skins/cards/morte.webp`) e do giro. Quem a recebe e veste vê o visual padrão no mundo (o cliente avisa no console) e a carta sem imagem na coleção.

## A sequência (servidor autoritativo)

`apps/server/src/world/death.ts` (`DeathDirector`), ligado ao `BarRoom` por `deaths`. O estado de cada morte vive só no servidor; os clientes desenham o que ele manda.

1. **`dying`**: `kill` põe `interactionState = 'death'` (o corpo para, sai de mesa, moto, cavalo e turno; `handle()` recusa tudo menos `death.input` e `ping`), calcula o plano (`planDeath`) e manda `death.scene` a quem está num raio de `max(AOI_RADIUS, SCENE_AUDIO_RADIUS)` e à vítima. Quem chega no meio não recebe a cena (nada é reenviado).
2. A cena é a de `deathFrame(plano, agora)` (`packages/shared/src/death.ts`), a mesma conta no servidor e nos clientes: **01** surge 4,5 m à frente da vítima, de frente para ela (7 s; o corpo sobe junto com a fumaça, que vai de 1,25 s a 5,75 s) → **02** flutua até 1,25 m dela, a raiz andando pelo chão, o laço da 02 tocando (≥ 1,8 s, 1,6 m/s) → **03** golpe, impacto no quadro 64 (2,67 s) → **04** risada → **05** um furacão de fogo: ela gira e encolhe dentro dele e some no quadro 100 da 05 (4,17 s), quando o servidor passa para `interactionState = 'death-gone'`; depois o furacão se desfaz até o fim dos 6 s. Se não há chão livre à frente, ela surge de outro lado (`planDeath` gira a direção e encurta a distância).
3. **`blackout`**: 5 s, frase sorteada (seção abaixo), enviada só à vítima em `death.screen`.
4. **`play`**: o servidor sorteia a sequência (4 botões; tamanho 4, +1 por rodada vencida até 7, `DEATH.roundsToWin = 1`, então hoje é sempre 4) e a manda para ser exibida (600 ms por botão, 150 ms de intervalo). Depois, até 10 s (`DEATH.inputLimitMs`) para repetir. **Toda tecla vai ao servidor** (`death.input {button}`), que compara com a sequência: antes de acabar a exibição é ignorada (não é erro); errar ou estourar o tempo é erro.
5. **Erro**: `error` com a frase vermelha por 2 s (`DEATH.errorHoldMs`, entradas ignoradas) e então uma sequência **nova**. Não reaparece até acertar.
6. **Acerto** (`won`): `respawn`. Um ponto caminhável aleatório (`findSpawn` a partir de âncoras sorteadas até 28 m do marcador de entrada, a 6 m ou mais de onde a Morte estava e livre de outros jogadores), rotação aleatória, tudo solto. Inventário, carteira e skin não são tocados.

Regras: uma morte por vez por jogador (outro `kill` é ignorado); quem sai durante a morte encerra a sessão normalmente e **volta vivo no ponto de respawn** (`death_end` com `reason: 'disconnected'`); quem reconecta no meio (queda de rede, `onDrop`) retoma a tela onde estava (`resume`); uma morte que ninguém termina acaba sozinha em 15 min.

## Frases

`packages/shared/src/morte-frases.ts`: oito categorias (geral, bebidas, jogos, veículos, cigarro, dinheiro, palco, social) e as cinco frases de erro, `{nome}` virando o nome do personagem. A categoria é a do que o jogador **mais fez nesta sessão do mundo** (`BarRoom.achieved` soma cada contagem de conquista pela tabela `SERIES_CATEGORY`; moto conta por 50 m; não há dado de "fiado", então Pix representa dinheiro); sem dado, "geral". O contador vive na memória do mundo: some quando o mundo reinicia. A última frase de cada jogador não se repete.

## No cliente

- `engine/morte-scene.ts`: os cinco GLBs (`apps/web/public/models/morte/`, cópias de `assets-bar/skins/Morte/`, sem reexportar), um rig por clipe criado na primeira vez e só o do clipe atual ligado. O tempo do clipe segue o relógio do servidor (corrigido só se passar 0,2 s de diferença). Disco de névoa no chão ao surgir e ao partir (em vez de recortar o corpo, que já começa abaixo do piso), rachaduras no impacto, poeira pelo `SmokeBurst`, e o corpo da vítima é puxado para o ponto da Morte e afundado nos 4,17 s antes de sumir (`BarScene.applyDeathPull`). `BarScene` esconde o avatar com `death-gone` e o devolve sem deslizar pelo mapa.
- **Pré-carga:** os GLBs (9 MB) são pedidos quando o jogador entra no bar e o navegador está ocioso; uma morte que chegue antes carrega o que falta.
- `death/death-ui.ts` + `death.css` (só a vítima): vinheta e dessaturação (`backdrop-filter`) durante a cena; fade de 0,6 s para preto e a frase em cinza; depois quatro botões grandes nos cantos (cor, ícone e número distintos; 24% do menor lado da tela, de 72 a 150 px), barra do tempo, bolinhas de progresso, `pointerdown` com `touch-action: none` e sem zoom por duplo toque; teclas **1–4** e **setas** (cima, direita, baixo, esquerda); tique-taque por segundo e batida de coração que acelera. No erro, vinheta vermelha pulsando (1,7 vez por segundo) e a frase tremendo. Ao acertar, fade de 0,6 s de volta ao mundo. `Esc` e atalhos com Ctrl continuam com o navegador e o menu do jogo. O mouse trancado do modo tela cheia é solto ao começar o minigame.
- `death/death-audio.ts`: tudo sintetizado em WebAudio, sem arquivos. Drone de 44–59 Hz com vento e sussurros enquanto a Morte está lá; terra rachando e sino fúnebre ao surgir; passos arrastados e foice cortando o ar; impacto grave e metálico; risada reverberada (cai de volume); névoa e sussurros na partida; no escuro, 1 s de silêncio e então a batida; estalo seco no erro; inspiração e sino no acerto. No máximo **6 vozes** ao mesmo tempo (a sétima é descartada). Para quem está longe, o volume cai com a distância (até 40 m); a vítima ouve tudo. Segue o volume geral.
- **Efeitos:** shake curto na chegada e no impacto, zoom leve e rápido na risada (`fovPunch`, +1,6°); `prefers-reduced-motion` desliga o shake, o zoom, o pulso e o tremor, e mantém as frases e o minigame.
- **Níveis gráficos:** em **Baixo**, metade dos puffs de fumaça, névoa menos densa e vinheta plana, sem filtro sobre a imagem (o jogo não tem bloom).

## Testes

- `apps/server/test/death.test.ts`: linha do tempo, a morte inteira (cena → escuro → erro de 2 s → sequência nova → acerto → respawn), tempo esgotado, saída no meio, frases.
- `apps/server/test/death.integration.test.ts`: WebSocket de verdade e o relógio movido (`mock.timers`): kill → cena a quem está perto → escuro só para a vítima → tecla fora de hora → erro → nova sequência → acerto → respawn em chão caminhável; morte repetida; sair durante a morte.
- `apps/api/test/morte.test.ts`: não aparece nem se compra, concessão e retirada, `kill` (permissões, conta principal, motivo, 409).
- `tests/fixtures/morte.html`: a cena e a tela da vítima sozinhas, com um relógio que o teste move (`/@fs/…/tests/fixtures/morte.html` no Vite).

## O que não foi verificado

Sons em aparelho de verdade (só montados, nunca ouvidos); a cena dentro do bar real (o avatar sendo puxado, shake e dessaturação sobre o mundo), os 60 fps no celular; o toque num celular real (testado só com emulação de toque no Edge).
