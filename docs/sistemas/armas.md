# Armas (tiro em terceira pessoa)

Sistema completo de tiro: dez armas, equipamentos (miras, lunetas, silenciador, empunhaduras, laser, lanterna, carregadores), melhorias, mira pelo ombro e
luneta com zoom, roda de armas, tiro *hitscan* decidido pela sala com compensação de latência, mira assistida no controle (estilo Red Dead Redemption 2) e
no celular. **Ainda não está liberado para os jogadores:** só o comando `/armas` ativa, e por enquanto só para administradores.

## Como ligar

| Comando (no chat) | Quem | O que faz |
| --- | --- | --- |
| `/armas` | administradores (ou todos, se `/armas todos` estiver ligado) | Liga ou desliga as armas para quem digitou. Ao ligar, o arsenal de teste vem completo (todas as armas, todos os equipamentos, munição infinita, melhorias de graça) e a pistola já sai na mão. |
| `/armas todos` | administradores | Libera (ou volta a fechar) o `/armas` para qualquer jogador, até o mundo reiniciar. Ao fechar, quem não é admin perde as armas na hora. |
| `/alvos` | administradores | Põe quatro alvos de treino na frente (a 6, 12, 22 e 35 m: parado, andando de lado, correndo para frente e para trás, parado longe). Levam tiro e soco, caem e levantam em 4 s com a vida cheia. `/alvos` de novo tira; saem sozinhos em 20 min ou quando o admin sai. |

O arsenal é por jogador e fica guardado (tabelas `weapon_arsenal`, `weapon_parts`, `weapon_ammo`, migração 028): a arma que o jogador **tem** decide o modelo,
o tipo, os números e os equipamentos que cabem. Hoje a única forma de ganhar armas é o `/armas` (kit de teste, origem `teste`); a loja, o drop e a troca
entram depois em cima do mesmo esquema.

## Controles

| Teclado e mouse | Controle (padrão Xbox) | Toque | O que faz |
| --- | --- | --- | --- |
| Caps Lock (segurar, ou tocar uma vez para deixar aberta) | LB (segurar) | botão Arma | Roda de armas. Solte em cima da arma; o centro guarda a arma. (Não é Tab: o Tab do navegador passeia pelos botões da página.) |
| 1 … 0 | RB / LB (toque rápido) | — | Arma seguinte / anterior (no teclado, escolhe direto pela posição na roda). |
| Clique | RT | Fogo (segurar; arrastar nele também gira a câmera) | Atira. |
| Botão direito (segurar) | LT (segurar) | Mirar (liga/desliga) | Mira pelo ombro, ou pela luneta. |
| R | X | Recarregar | Recarrega (sem arma na mão, o R continua sendo a guarda da luta). |
| V | Y | — | Modo de tiro (automático / semi), nas armas que têm os dois. |
| X | B | — | Guarda a arma / saca a última. |
| H | R3 | — | Troca o ombro da câmera. |
| U | D-pad → | — | Abre o Arsenal (equipamentos e melhorias). |
| Shift (com luneta) | L3 (com luneta) | Fôlego | Segura o fôlego: a luneta para de balançar por alguns segundos. |
| Roda do mouse (com luneta) | D-pad ↑ ↓ | Zoom + / − | Muda o aumento da luneta de precisão (8x ↔ 4x). |

Com a arma na mão o mouse fica preso ao jogo (como na guarda da luta); Esc solta e abre o menu sem guardar a arma. Correndo, a arma fica baixa e não atira.
Mirando, o personagem anda mais devagar (depende da arma) e não corre. A arma sai sozinha da mão ao sentar, montar, dirigir, pegar bebida ou bandeja,
desmaiar, morrer ou levantar a guarda; dançar, acenar, fumar e o fogo de artifício pedem para guardar a arma antes.

## Teclas configuráveis (2026-11-09)

Esc › Ajustes › Armas e mira › **Teclas das armas**: cada ação (roda, arsenal, guardar/sacar, recarregar, modo de tiro, arma seguinte, arma anterior, ombro, fôlego)
tem uma linha; clicar nela e apertar uma tecla (ou o botão lateral do mouse) troca. Esc cancela, Delete deixa sem tecla, uma tecla já usada por outra ação troca
de lugar com ela. Fica salvo no navegador (`weaponKeys`, validado por `readWeaponKeys`). Atirar e mirar seguem nos botões esquerdo e direito, os dígitos escolhem
pela ordem da roda, o botão do meio liga/desliga o mouse (por isso não é configurável) e controle e toque têm layout próprio.

- **Botões laterais** (event.button 3 e 4, chamados `Mouse4` = voltar e `Mouse5` = avançar): por padrão arma anterior e seguinte. Dentro do jogo nunca voltam a página
  (`guardSideButtons`: preventDefault em mousedown/mouseup/auxclick; **nunca** em pointerdown, que cancelaria também o mousedown).
- Teclas proibidas (usadas pelo jogo em qualquer lugar): W A S D, setas, E, T, Q, B, C, F, G, Z, K, N, O, Y, Espaço, Enter, Tab, Esc, dígitos, F1–F12, Meta.
- Código: `weapons/key-bindings.ts` (ações, padrões, troca), `key-capture.ts` (a captura; o menu de pausa a deixa passar por `data-capturing`), `controller.input()`
  (todas as teclas e botões passam por aqui). Dicas (HUD "Recarregar", chip de primeiro uso, roda) e o guia leem as teclas escolhidas. Sem arma na mão, R e V
  voltam a ser a guarda e o aceno; com arma e o recarregar em outra tecla, R não faz nada.

## Fotos e melhorias (2026-11-09)

A foto da arma (roda, Arsenal, **chip de munição do HUD**) segue as peças encaixadas e as melhorias: as peças trocam camadas; as melhorias (sem modelo) aparecem como
marca **+N** na cor do nível (ciano, violeta, magenta, dourado com tudo no máximo; `upgradeTier` em ui/art.ts). Um `weapon.arsenal` novo redesenha a roda aberta, o
Arsenal e o chip.

## Animações (2026-11-09)

Guardar a arma dura `holsterTime(drawMs)` (weapons/contract.ts) tanto na lógica quanto na pose: antes a lógica escondia a arma em 320 ms enquanto o arco ia até 80% do
saque, e a arma sumia no meio do caminho. Um guardar desfeito, ou começado no meio do saque, parte de onde a arma está. A convergência do cano para a mira some
suavemente (antes um corte duro em um ângulo dava um pulo) e a corrida dos outros jogadores tem histerese (3,7/4,4) em vez de um limiar que piscava.

## As armas

Números em `WEAPONS` (`packages/shared/src/weapons/catalog.ts`). Vida a vencer: anel (100) + reserva do coração (100) = 200. Dano a até 3 m, sem melhorias.

| Arma | Calibre | Modo | Cadência | Pente | Dano (corpo / cabeça) | Tiros p/ derrubar (corpo / cabeça) | Alcance cheio → mínimo | Recarga |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| Pistola 9mm | 9 mm | Semi | 380 tpm | 15 | 28 / 56 | 8 / 4 | 18 → 40 m (55%) | 1,45 / 1,85 s |
| Revólver .38 | .38 | Semi | 160 tpm | 6 | 50 / 110 | 4 / 2 | 16 → 45 m (60%) | 0,45 s + 0,38 s por bala |
| Submetralhadora | 9 mm | Auto, Semi | 850 tpm | 30 | 17 / 27 | 12 / 8 | 10 → 30 m (50%) | 1,75 / 2,15 s |
| Fuzil 5,56 | 5,56 | Auto, Semi | 700 tpm | 30 | 24 / 43 | 9 / 5 | 30 → 70 m (60%) | 2,1 / 2,6 s |
| Fuzil 7,62 | 7,62 | Auto, Semi | 600 tpm | 30 | 31 / 56 | 7 / 4 | 28 → 65 m (60%) | 2,3 / 2,8 s |
| Carabina de alavanca | .44 | Semi (alavanca) | 90 tpm | 6 (10 com o tubo longo) | 68 / 136 | 3 / 2 | 35 → 80 m (65%) | 0,4 s + 0,43 s por bala |
| Escopeta 12 | Calibre 12 | Semi (bomba) | 72 tpm | 6 | 144 (9 × 16) / 216 | 2 / 1 | 7 → 20 m (25%) | 0,38 s + 0,48 s por cartucho |
| Espingarda de cano duplo | Calibre 12 | dois canos | 300 tpm | 2 | 170 (10 × 17) / 255 | 2 / 1 | 8 → 22 m (25%) | 1,9 / 2,2 s |
| Fuzil DMR | .308 | Semi | 320 tpm | 10 (20 com o estendido) | 55 / 110 | 4 / 2 | 45 → 110 m (70%) | 2,4 / 2,95 s |
| Rifle de precisão | .308 | Ferrolho manual | 46 tpm | 5 | 125 / 313 | 2 / 1 | 80 → 250 m (80%) | 0,52 s + 0,44 s por bala |

- **Recarga:** "tática" (ainda tem bala na câmara) / "vazia". Revólver, escopeta, carabina e rifle de precisão (pelo ferrolho aberto) recarregam bala por
  bala, uma bala por bala que falta; atirar no meio para a recarga com o que já entrou. O carregador rápido transforma a recarga do revólver num municiador
  (1,6 s inteiro); na carabina e no rifle de precisão só deixa cada bala mais rápida (antes ele virava uma troca de carregador na carabina, que não tem).
- **Mudanças do dono (09/11/2026):** a submetralhadora é de uma mão só, como o revólver (sem empunhaduras no trilho); o rifle de precisão é de ferrolho
  manual de verdade (modelo novo, o ferrolho a cada tiro); o DMR vem com carregador curto de 10 e o estendido é o de 20; a carabina leva 6 no tubo curto
  e 10 no longo; a escopeta tem o tubo curto até logo depois da bomba (o estendido é o tubo inteiro, mesma munição de antes: 6 e 9); os fuzis 5,56 e
  7,62 usam tambores (modelos diferentes) como carregador estendido, com a mesma munição (+50%: 45); os carregadores de caixa ganham um puxador de
  borracha com o carregador rápido; o cano duplo aceita **Canos serrados**.
- **Tiro na cabeça mata na hora, com qualquer arma** (regra do dono, 09/11/2026): o acerto na cabeça tira toda a vida que resta (anel e reserva),
  dentro do alcance da arma. A coluna "cabeça" acima é o dano da tabela, que hoje só conta para o número mostrado quando ele já passaria da vida.
- **Pernas** levam 80% do dano. Os bagos da escopeta somam.
- **Queda com a distância:** dano cheio até o primeiro número, cai suave até o segundo e fica no mínimo; passou do alcance máximo, não acerta.

## Equipamentos

Cada equipamento é do jogador (não da arma): tendo um, ele serve em todas as armas que o aceitam. Mudam números (`PARTS`, mesmo arquivo).

| Equipamento | Encaixe | Efeito | Serve em |
| --- | --- | --- | --- |
| Mira reflex | Mira | Ponto vermelho compacto, 1,3×. Mira rápida. | 9MM, SMG, 12 |
| Mira red dot | Mira | Ponto vermelho, 1,45×, mira mais firme. | 9MM, SMG, 5.56, 7.62, 12, DMR, .308 |
| Mira holográfica | Mira | Anel holográfico, 1,45×, bom em movimento. | SMG, 5.56, 7.62, 12, DMR, .308 |
| Luneta 4x | Mira | Luneta de combate 4x (a visão passa pela lente). | 5.56, 7.62, .44, DMR, .308 |
| Luneta de precisão | Mira | 8x / 4x, balança: segure o fôlego. | .44, DMR, .308 |
| Silenciador | Boca do cano | Quase não se ouve de longe (28% do alcance do som), sem clarão; −12% de alcance, −3% de dano. | 9MM, SMG, 5.56, 7.62, DMR, .308 |
| Compensador | Boca do cano | −20% de coice para cima, −15% para os lados; clarão maior. | 9MM, SMG, 5.56, 7.62, DMR |
| Empunhadura vertical | Trilho | −15% de coice, −20% para os lados; mira 5% mais lenta. | 5.56, 7.62, DMR |
| Empunhadura angulada | Trilho | Mira 12% mais rápida, saque 8% mais rápido. | 5.56, 7.62, DMR |
| Mira laser | Trilho | −32% de dispersão do quadril. Todos veem o ponto vermelho. | 9MM, SMG, 5.56, 7.62, 12, DMR |
| Lanterna tática | Trilho | Ilumina para onde a arma aponta quando escurece. | 9MM, SMG, 5.56, 7.62, 12 |
| Canos serrados | Boca do cano | Modelo serrado, segurado com as duas mãos à frente: chumbo 60% mais aberto, dispersão do quadril +25%, alcance −28%, recarga 22% mais lenta, saque 20% e mira 15% mais rápidos, coice +12%. | 2×12 |
| Carregador estendido | Carregador | +50% de munição (DMR: o de 20; carabina: o tubo longo de 10; 5,56 e 7,62: tambor; escopeta: o tubo inteiro); recarga 12% e mira 4% mais lentas. | 9MM, SMG, 5.56, 7.62, 12, DMR, .44 |
| Carregador rápido | Carregador | Recarga 25% mais rápida (revólver: municiador; carabina e rifle de precisão: cada bala mais rápida). Puxador de borracha nos carregadores de caixa. | 9MM, .38, SMG, 5.56, 7.62, .44, DMR, .308 |

O DMR já vem com a Luneta 4x e o rifle de precisão com a Luneta de precisão.

## Melhorias

Cinco níveis por arma em cada trilha (`UPGRADES`): **Dano** +4%/nível, **Alcance** +8%/nível, **Controle** −7% de coice/nível, **Precisão** −6% de
dispersão/nível, **Manuseio** −5% no tempo de mirar, recarregar e sacar/nível. Preço para chegar a cada nível: 120, 240, 450, 750 e 1200 moedas vezes o
peso da arma (pistola 1 … precisão 1,75; nível 5 custa de 1200 a 2100). No kit de teste as melhorias são de graça.

## O tiro (hitscan)

`packages/shared/src/weapons/ballistics.ts`, a mesma conta na sala e no navegador:

1. Um raio sai da **câmera** pelo centro da mira (é para onde o jogador aponta), pulando o que fica entre a câmera e o atirador.
2. Ele acha o primeiro corpo ou sólido do mapa (`bulletWorld` em `world.ts`: percorre só as células da grade que o raio cruza, então até os 400 m do rifle
   saem baratos; postes e troncos finos param a bala, ao contrário da câmera; o piso também).
3. A bala de verdade vai do **cano** (`muzzleOf`: ombro + alcance da arma ao longo da mira) até esse ponto. Se uma parede ou alguém estiver nesse caminho
   (atirando com o ombro rente a uma quina), quem leva é o que está no caminho. A mira mostra um sinal onde a bala vai parar de fato.
4. A dispersão é um cone (quadril, mira, andando, rajada) e os bagos da escopeta formam um anel com um pouco de acaso, tudo **semeado** pelo id do
   atirador e o número do tiro: todo navegador e a sala calculam os mesmos bagos.

**Zonas do corpo:** cabeça (bola), tronco e pernas (cápsulas), com as alturas de cada skin em pé (`bodies-data.ts`, medidas do Idle de cada banco).

## Rede

Sacar, mirar, recarregar e cada tiro vão **dentro do input** (`player.input.gun`), na ordem que o navegador previu, como os socos. Cada tiro leva o
ponto e a direção da câmera, o cone usado, o número do tiro e o "quando eu via" (`seen`/`ago`) da compensação de latência: a sala volta os outros corpos
até onde o atirador os via (no máximo 350 ms) e decide. Conferências: arma sacada e pronta, munição, cadência (o intervalo do navegador e um balde na
sala), número do tiro sempre crescente, ponto da câmera perto da cabeça e sem parede no meio, cone nunca mais estreito que o da mira parada.

O navegador desenha o próprio tiro na hora (clarão, traçante, impacto, som); a sala manda `weapon.shot` para quem está ao alcance do som (160 m; 45 m com
silenciador) e `weapon.hit` para o atirador, o atingido e quem está perto. O estado da arma de cada jogador vai em `Player.gun` (arma, equipamentos,
mirando, elevação da mira, munição, recarga).

## Interface

Tudo no visual Midnight Neon (magenta no que está escolhido, painéis violeta, ouro no dinheiro, Chakra Petch e JetBrains Mono, cantos retos, ícones
no traço do Lucide; a pistola e o carregador foram desenhados no mesmo traço em `ui-icons.ts`). Nada usa `backdrop-filter` nem depende de transição:
o DOM só é escrito quando um valor muda. Arquivos: `apps/web/src/weapons/hud.ts` + `weapons.css` (HUD) e `apps/web/src/weapons/ui/` (o resto).

### HUD

Só com a arma na mão: a mira (abre com a dispersão; anel na escopeta; a retícula da mira óptica ao mirar), o marcador de acerto (dourado na cabeça,
magenta maior ao derrubar) e a linha "Você derrubou …", a luneta em tela cheia (máscara, retícula que balança, zoom, fôlego), de onde veio o tiro que
você levou, e o contador de munição (embaixo à direita; no toque, em cima à direita, sob o cabeçalho). Carregador vazio sem recarga em andamento: um
aviso pulsa ao lado do contador com a tecla do aparelho em uso (**R**, **X** no controle, o botão Recarregar no toque) ou "Sem munição".
Nas três primeiras vezes que a arma sai (por navegador), um chip sobre o contador diz onde estão a roda e o Arsenal, nas teclas do aparelho; some em
9 s ou na primeira vez que a roda abre, e não volta depois disso (`bar:armas:hint` no localStorage).

### Roda de armas

`weapons/ui/wheel.ts`. Abre por cima da cena, que continua rodando (um degradê radial escurece as bordas; a mira e a linha de derrubada esperam).
Cada arma do arsenal é um setor, a partir de cima no sentido horário, na ordem `WHEEL_ORDER`: a figura, a sigla e um anel com as balas do carregador
(dourado quando está no fim, vermelho vazio); um traço ciano marca a que está na mão e, com mouse, o número da tecla 1 … 0 fica no canto. O setor
escolhido acende em magenta e uma seta na borda do centro mostra para onde o ponteiro aponta. O centro (guardar a arma) mostra a arma escolhida: categoria,
nome, calibre, modos de tiro, balas, os equipamentos instalados e "U · Arsenal" (no controle, "D-pad →").

- **Mouse:** o movimento do mouse (preso ao jogo) move o ponteiro; soltar o Caps Lock ou clicar escolhe. Com o mouse solto, passar por cima escolhe.
- **Controle:** o direcional direito aponta (fica onde parou); soltar o LB escolhe.
- **Toque:** o botão Arma abre com a arma da mão já escolhida (apertar de novo não troca nada). Tocar num setor saca; tocar no centro guarda; tocar fora
  fecha sem trocar. O botão Arsenal fica no painel, porque no celular não há tecla U.
- Telas pequenas: com até 560 px de altura (celular deitado) os detalhes vão para um painel à esquerda da roda; com até 560 px de largura (em pé), embaixo.
- Sons: os do menu (abrir, passar, escolher, fechar).

### Arsenal

`weapons/ui/arsenal.ts`, a janela `showModal('ARSENAL',…,'arsenal')` (classe `arsenal-modal`, destruída ao fechar como a coleção). Abre com **U**
(U de novo fecha), **D-pad →**, o botão Arsenal da roda no toque, ou o menu Esc › Ações › Arsenal (só aparece com o `/armas` ligado).

- **Armas:** a lista das armas do arsenal à esquerda (a que está na mão tem a marca "Na mão"); à direita a escolhida: categoria e calibre, nome,
  descrição, modos, capacidade, luneta, e o botão **Sacar** (saca e fecha).
- **Barras** (`weapons/ui/stats-view.ts`), feitas dos números de verdade de `weaponStats` com os equipamentos e melhorias de agora, e o número ao
  lado: Dano (por tiro; na escopeta bagos × dano), Cadência (tiros/min), Alcance (dano cheio até … cai até … m), Precisão (cone mirando, escala
  logarítmica), Controle (coice por tiro), Manuseio (tempo de mira; sacar e recarregar também contam), Mobilidade (passo mirando), Capacidade.
  Passar o mouse (ou o foco) num equipamento ou numa melhoria mostra nas barras o que muda: um trecho verde do que ganha, vermelho do que perde, e o
  número novo na mesma cor.
- **Equipamentos:** um grupo por encaixe que a arma tem (Mira, Boca do cano, Trilho, Carregador), com "Nenhum" e as peças do arsenal que servem nela;
  clicar manda `weapon.configure`. Se existem peças que servem mas o jogador não tem, uma linha diz quantas.
- **Melhorias:** as cinco trilhas com cinco segmentos, o preço do próximo nível ("Grátis no teste" no kit de teste; "Faltam N" quando a carteira não
  alcança) e **Melhorar**, que manda `weapon.upgrade`. "Completo" no nível 5.
- **Aba Equipamentos:** as peças do arsenal por encaixe; à direita a figura, a descrição, os efeitos em porcentagem (verde o que ajuda, vermelho o que
  atrapalha) e as armas em que servem, cada uma com Instalar ou Tirar (e o que ela troca).
- Enquanto o pedido vai à sala o botão espera; a janela se redesenha quando chega o novo `weapon.arsenal` (um erro vira o aviso de sempre e o botão volta
  em 4 s).
- Teclado e controle: as setas andam para o controle mais perto naquela direção (na lista, já mostram a arma); da lista, → vai ao primeiro botão dos
  detalhes; Enter aperta; Q / E (LB / RB) trocam de aba; Esc (B) fecha.

### Ajustes

Menu Esc › Ajustes › **Armas e mira** (só com o `/armas` ligado; `weapons/ui/settings-rows.ts`, aplicados por `aimSettingPatch` em `main.ts`, que troca
o objeto inteiro para os assinantes ouvirem):

| Linha | Chave | Valores |
| --- | --- | --- |
| Ajuda no controle | `aim.assistPad` | Travar no alvo (como no RDR2) (padrão), Assistida, Livre |
| Ajuda no toque | `aim.assistTouch` | ligado (padrão) |
| Tiro automático | `aim.autoFire` | desligado (padrão); só no celular |
| Sensibilidade mirando / na luneta | `aim.adsSensitivity`, `aim.scopeSensitivity` | 25 % a 300 % (100 %: o mesmo giro na tela que sem mirar) |
| Velocidade do direcional | `pad.lookSpeed` | 30 % a 300 % |
| Curva de resposta | `pad.curve` | 1 (linear) a 3; padrão 1,8 |
| Inverter vertical, Vibração | `pad.invertY`, `pad.vibration` | desligado, ligado |
| Ombro da câmera | `shoulder` | Direito, Esquerdo (atalho H, R3) |

O Guia ganha **Controles das armas** (teclado e mouse, controle, toque), também só com o `/armas` ligado.

Conferir sem servidor: `tests/fixtures/gun-hud.html` (pela Vite em `/@fs/<caminho>`): `fixture.show(...)` desenha o HUD, `fixture.wheel('fuzil','touch')`
abre a roda, `fixture.arsenal('fuzil',undefined,'[data-ar-up="dano"]')` abre o Arsenal com uma prévia, `fixture.menu('ajustes','armas')` o menu Esc.

## Mira assistida

Só no controle e no toque; o mouse nunca tem. Lógica em `apps/web/src/weapons/aim-assist.ts` (pura, testada em `tests/integration/aim-assist.test.ts`).
Alvos: outros jogadores em pé e os alvos de treino (nunca NPCs), dentro do alcance da arma (trava até 60 m, 120 m com luneta), à frente e à vista
(raio da câmera ao peito, conferido ~10 vezes por segundo). Tudo é calculado a partir de onde a câmera está de verdade (o ombro desloca a visada).

| Modo (Ajustes › Armas e mira) | O que faz |
| --- | --- |
| **Travar no alvo** (padrão do controle, como o RDR2) | Ao apertar LT, a mira pula para o peito do melhor alvo perto do centro (cone de 8° a 30° conforme a distância) em ~150 ms, sem passar do ponto, e o segue enquanto o LT estiver seguro. O analógico direito desliza a mira sobre o corpo (para cima chega na cabeça); empurrar para fora do corpo solta. Um movimento rápido do analógico troca para o alvo daquele lado; soltar e apertar LT de novo trava outra vez. Atirando do quadril: só atrito e um puxão leve. |
| **Assistida** | Sem pulo grande: atrito (a mira fica mais lenta sobre o corpo), magnetismo (acompanha o alvo que se move) e um pulo pequeno (até 6°) ao começar a mirar. |
| **Livre** | Nada. |
| **Toque** (liga/desliga) | Pulo mais suave ao mirar (até 12°), acompanha o alvo e atrito no arraste. **Disparo automático** (desligado por padrão): mirando, atira sozinho depois de 120 ms com a mira no corpo. |

O controle tem zona morta radial, curva de resposta e aceleração no fim do curso (ajustáveis), inverter Y e vibração.

## Câmera

`camera-rig.ts` ganhou membros opcionais (o comportamento sem arma não muda; `tests/integration/camera.test.ts` e `camera-aim.test.ts`): com a arma
na mão não há recentragem automática e o giro é mais rápido. Os números abaixo são os padrões escolhidos pelo dono ao vivo em 09/11/2026
(`DEFAULT_AIM_CAMERA` em `weapons/aim-settings.ts`):
- **Com a arma na mão (sem mirar):** enquadramento próprio, que entra e sai suave: 6 m atrás, 1,2 m para o lado e 60 cm acima, com o personagem bem à
  esquerda e longe da mira.
- **Mirando:** 1,55 m atrás (pistolas 1,45 m), 45 cm para o lado e 30 cm acima; nivelar 0% (a câmera orbita o personagem ao olhar para cima e para baixo);
  30% do zoom de cada arma (lunetas à parte); segue o personagem 6× mais firme e gira 1,5× mais rápido.
- **Luneta:** a câmera vai para o olho, com o aumento da luneta (4x, 8x) e a cabeça escondida.
- **A mira não sai do lugar** ao apertar ou soltar o botão direito: no clique o controlador acha o que está no meio da tela (mapa ou corpo, `sightPoint`
  em `controller.ts`) e a câmera (`holdAim`) gira quadro a quadro para manter esse ponto no meio enquanto muda de posição; solta quando a troca
  termina ou quando o jogador mexe a câmera.

O zoom entra por último no campo de visão (`2·atan(tan(base/2)/zoom)`) e a sensibilidade mirando cai na mesma proporção, vezes o ajuste do jogador. O coice
empurra a mira para cima e para o lado e devolve parte quando o tiro para. Todos esses números se ajustam ao vivo em Esc › Ajustes › Armas e mira ›
**Posição da câmera (ajuste fino)** (a página aparece sempre para administradores; para os outros só com o `/armas`), salvos por navegador.
**Copiar valores** copia o texto para virar o padrão; **Restaurar padrão** volta. Ao mudar o padrão, sobe `AIM_CAMERA_VERSION`: quem tinha salvo o
padrão antigo recebe o novo.
H (R3) troca o ombro; fora isso a câmera fica sempre no ombro escolhido (numa parede desse lado ela só chega mais perto, nunca troca sozinha).

## Animações e efeitos

`apps/web/src/engine/weapons/` (a pose é procedural, sem clipes novos; o banco de animações não mudou):
- **Pose:** a arma é posta primeiro (coronha no ombro direito; pistola e cano duplo serrado nas duas mãos à frente do peito, a mão esquerda do serrado
  embaixo dos canos; revólver e submetralhadora numa mão só) e os braços vão até ela por IK de dois ossos; o tronco leva metade da elevação; fora da
  mira, guarda baixa; correndo, arma de lado. As pernas usam os passos laterais da luta quando o corpo olha para a mira (`gunClip`, que reusa
  `guardStep`); andando para trás, a caminhada normal tocada ao contrário (`WalkBack`, estado de velocidade −1), porque o passo de recuo da luta
  agachava e pulava como boxeador.
- **Carregadores no modelo** (`weapon-models.ts` `extendMag`/`followMag`, `meta.looks`): ossos opcionais aparecem conforme o carregador. Tubo longo da
  escopeta e da carabina com o estendido; tambor no lugar do carregador nos fuzis, seguindo o carregador na recarga; puxador de borracha no pé do
  carregador com o rápido; o carregador do DMR na metade do comprimento sem o estendido. O carregador que cai no chão na recarga continua sendo a
  caixa comum, mesmo com o tambor.
- **Movimentos:** saque e guarda (pistolas no quadril, armas longas nas costas), coice com mola, recarga de pente (o pente vazio cai no chão), bala por bala,
  basculante, municiador do revólver; bomba, alavanca e ferrolho depois de cada tiro; ferrolho/slide recuando e ficando aberto na última bala.
- **Efeitos:** clarão (quase nada com silenciador) com luz curta, traçantes, faíscas/poeira/lascas/vidro conforme a superfície, buracos de bala (96, somem
  aos poucos), sangue, cápsulas que quicam no chão, laser visível para todos e lanterna quando escurece (até 3 acesas).
- **Sons** (`weapon-audio.ts`): o próprio tiro no centro; o dos outros posicionado, com tomada de perto e de longe (troca entre 25 e 60 m), atraso do som
  pela distância, alcance do som da arma (160 m; 45 m com silenciador), reverb de rua ou de ambiente fechado (raio para cima a partir da câmera), sons
  mecânicos sincronizados com a recarga, impactos, zunido de bala passando perto da cabeça e cápsulas. Números de dano: branco no corpo, dourado na
  cabeça, magenta no tiro que derruba; vermelho em quem levou.

Modelos, sons e créditos (todos CC0): [docs/assets/armas.md](../assets/armas.md).

## Arquivos

- **Regras compartilhadas:** `packages/shared/src/weapons/` (`catalog.ts` armas, equipamentos, melhorias e preços; `stats.ts`; `bodies.ts` + `bodies-data.ts`
  (gerado: `npm run assets:gun-bodies`); `ballistics.ts`; `protocol.ts`; `arsenal.ts`), `world.ts` `bulletWorld`. Testes: `tests/integration/weapons.test.ts`.
- **Sala:** `apps/server/src/world/weapons.ts` (WeaponDirector), `world/targets.ts` (alvos de treino), `Gun` em `state.ts`, ligações em `BarRoom.ts`
  (`/armas`, `/armas todos`, `/alvos`, `weapon.arsenal|configure|upgrade`). Testes: `apps/server/test/weapons*.test.ts`.
- **API:** `apps/api/src/arsenal-service.ts`, rotas `/api/internal/arsenal/load|configure|upgrade`, migração `infra/migrations/028_arsenal.sql`.
- **Navegador:** `apps/web/src/weapons/` (`local-gun.ts` lógica e previsão, `controller.ts`, `aim-assist.ts`, `aim-settings.ts`, `hud.ts`, `ui/` roda,
  Arsenal e ajustes, `contract.ts`, `weapon-meta.ts`/`sound-meta.ts` gerados), `apps/web/src/gamepad/`, `apps/web/src/engine/weapons/` (visual e som).
  Testes: `tests/integration/local-gun.test.ts`, `aim-assist.test.ts`, `gamepad.test.ts`, `camera-aim.test.ts`; vitrine `tests/fixtures/gun-hud.html`.
- **Assets:** `npm run assets:weapons` (modelos, peças, `weapon-meta.ts`), `assets:weapons:icons`, `assets:weapons:sound`, `assets:gun-bodies`; fontes em
  `assets-bar/armas/` e `assets-bar/sounds/armas/`.

### Para mudar uma arma ou criar outra

Números: `WEAPONS` em `catalog.ts` (os testes de balanço em `weapons.test.ts` dizem quantos tiros cada uma leva para derrubar; ajuste-os junto). Arma nova:
id em `WEAPON_IDS` e `WHEEL_ORDER`, entrada em `WEAPONS`, modelo e pontos em `tools/assets/import-weapons.mjs`, sons em `import-weapon-sounds.mjs`, rodar os
scripts de assets.

## Verificado e pendências

**Verificado (2026-11-09):** typecheck de todos os pacotes; 99 testes de navegador/compartilhado e 40 da sala (incluindo luta e sparring) passando; 24 da API.
Ao vivo em https://localhost:5173 com uma conta de teste (as armas abertas só durante o teste): `/alvos`, `/armas` com a pistola na mão, mira, recarga,
roda (Caps Lock), troca de arma, modo de tiro, luneta 8x com fôlego; tiros aceitos pela sala e tirando vida dos alvos (pistola 3 tiros → 2 acertos, escopeta
2 tiros → 133 de dano). Um fuzil colado atrás de uma árvore teve os tiros parados no tronco: é a regra do cano funcionando.

**Não verificado (rodada de teclas/fotos/animações):** teclas, captura e fotos conferidas na página de teste (fixture) com Edge; a captura com eventos sintéticos (o botão lateral real do mouse, a navegação do navegador e as animações vistas no mundo ao vivo não foram conferidos).

**Não verificado:** nenhum som foi ouvido (escolhidos por medição); controle e celular de verdade, vibração; andar de lado com arma visto de perto; FPS com
muitos armados; morte a tiro de um jogador real até a Morte. A munição fora do kit de teste só existe em memória (falta a rota de salvar munição). A
escopeta não mostra o carregador estendido (o tubo não tem osso). Postes finos param bala; escadas (rampas) não.
