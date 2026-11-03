# Coleção de cartas: skins, variantes e habilidades

Os jogadores usam somente skins completas, e cada skin é uma **carta**. **Nathan** é gratuito e já pertence a toda conta: é o visual de quem acabou de se cadastrar e o substituto de qualquer skin que a conta não possua. As outras cartas são vendidas. Magrão permanece exclusivo do NPC Seu Zé. A lista fica em `SKINS` e a skin gratuita em `DEFAULT_SKIN`, ambos em `packages/shared/src/skins.ts`.

O cadastro não tem etapa de aparência: com o e-mail confirmado (ou com a ativação automática), a conta entra direto no bar vestindo Nathan.

## Personagens, variantes e cartas

Um **personagem** tem um original e, se houver, **variantes**. Cada variante é uma skin completa, com modelo, banco de animações e bengala próprios, e tem `base` apontando para o original. É assim que Rafael Rosé (`rafael-rose`) é uma carta de Rafael (`rafael`).

- Cada carta é comprada sozinha. A variante não exige o original, e o original não dá a variante.
- `player.skin`, `skin_inventory` e `equipped_skin` guardam o id da carta. `skinBase(id)` diz de qual personagem ela é.
- As habilidades e a tecla escolhida são do personagem: valem em todas as variantes.

| Carta | Variante de | Raridade | Preço |
| --- | --- | --- | ---: |
| Nathan | | Comum | grátis |
| Leandro | | Incomum | 750 |
| Read | | Incomum | 850 |
| Gilmar | | Raro | 900 |
| Gabriel | | Raro | 900 |
| Flavio Hipotético | | Raro | 900 |
| Tião | | Raro | 900 |
| Rafael | | Épico | 1.000 |
| Rafael Rosé | Rafael | Lendário | 2.500 |

Esses são os padrões do código. A administração muda raridade, preço, texto e situação de venda sem nova versão.

### Raridade

São as cinco raridades dos emblemas (`RARITIES`, em `rarity.ts`): Comum, Incomum, Raro, Épico e Lendário. A moldura e o brilho de fundo têm a cor da raridade. Épico e Lendário têm película holográfica atrás do personagem. Lendário também é cravejada de brilhos, com o mesmo desenho das cartas de emblema (`studs` em `profile/badge-card.ts`).

## A tela

**C** ou o botão **Coleção** abre a tela (`apps/web/src/collection/`), que ocupa a janela inteira:

- **A mão**, embaixo: uma carta por personagem, em arco. Passar o mouse levanta a carta; clicar puxa ela para o centro. A contagem `1/2` diz quantas variantes o jogador tem, e um losango marca o personagem vestido.
- **A carta em foco**, no centro: inclina sob o mouse, com as camadas deslizando entre si. **Arrastar gira o personagem**, para ver as costas antes de comprar. Solta com impulso e volta para a frente sozinho.
- **As variantes**, à esquerda: trocar de variante vira a carta.
- **Os detalhes**, à direita: raridade, texto, botão de vestir ou comprar, e as habilidades do personagem.

Teclado: `←` `→` trocam de personagem, `↑` `↓` trocam de variante, **Enter** veste ou compra, **C** ou **Esc** fecham.

Comprar pede dois cliques, e o segundo botão volta sozinho depois de 7 segundos. Uma carta nova entra girando virada para baixo e cai de frente, com raios e faíscas proporcionais à raridade. Em seguida o jogador escolhe entre **Vestir agora** e **Guardar na coleção**. Quem prefere menos movimento (`prefers-reduced-motion`) vê tudo sem animação.

Os sons são sintetizados em `card-sounds.ts`, sem arquivos, e seguem o volume geral.

### Desempenho

A tela foi medida em 1080p com composição por software, como no navegador do servidor: 58 a 60 fps em todas as interações, inclusive com a carta lendária e na revelação.

- O mundo 3D para de ser desenhado enquanto a tela está aberta (`showModal` chama `scene.setEnabled(false)`).
- Só a carta em foco tem laço de quadro. Parada, ela atualiza um quadro sim, outro não.
- Cada quadro só move camadas por `transform`. A película e o brilho são imagens fixas deslizando, sem repintura.
- **Os cantos são retos de propósito.** Recortar com `border-radius` sobre as camadas em movimento custava mais da metade de cada quadro: 22 fps contra 58 ao trocar de carta.
- A folha de giro (de 100 a 190 KB) só é pedida quando o ponteiro chega à carta em foco. As imagens das cartas, de 20 a 40 KB, são decodificadas antes de virar a carta, para ela nunca chegar vazia.

## Habilidades

As habilidades (`SKILLS`, em `packages/shared/src/profile.ts`) **são compradas**, uma vez por conta, e exigem ter alguma carta do personagem. Quem compra Golpe de karatê usa nas duas cartas de Rafael.

| Habilidade | Personagem | Raridade | Preço |
| --- | --- | --- | ---: |
| Golpe de karatê | Rafael | Raro | 500 |
| Chute voador | Rafael | Épico | 800 |

A compra é feita na coleção. A aba **Skill** do perfil mostra as bloqueadas, com o preço, e leva à coleção. As liberadas seguem escolhidas ali, com a tecla ([perfil](perfil.md#skills)).

O servidor do mundo guarda as habilidades de cada jogador em `presence.skills` e recusa `player.skill` de quem não comprou. O botão da barra de ações só aparece para o que foi comprado, mas a autoridade é do servidor.

Quem comprou Rafael antes desta mudança **não** recebeu as habilidades de graça: a regra vale para todos. A administração pode conceder na ficha do jogador.

## Persistência e autoridade

`user_profiles.equipped_skin` guarda o que está vestido; o padrão é `'nathan'`. `skin_inventory` guarda as cartas e `skill_inventory` as habilidades. `skin_catalog` guarda o que a administração mudou em cada carta ou habilidade, pela chave (`skin:<id>`, `skill:<id>`). Sem linha ali, valem os padrões do código. O preço fica em `economy_prices`, como todos os outros. A migração é `015_collection.sql`.

| Rota | Faz |
| --- | --- |
| `GET /api/wardrobe` | Seleção, cartas, habilidades, preços, posse e saldo da própria conta |
| `POST /api/wardrobe/buy` | `{skin}`: compra uma carta |
| `POST /api/wardrobe/skill` | `{skill}`: compra uma habilidade |
| `POST /api/wardrobe/equip` | `{skin}`: veste uma carta que o jogador tem |
| `GET`, `POST /api/admin/collection` | O catálogo e a edição de uma entrada |

O servidor do mundo consulta a API ao entrar e reconectar, e revalida durante a partida. A validação interna devolve `{equippedSkin,ownedSkins,ownedSkills}`; uma skin vestida que não esteja na coleção vira Nathan. As opções enviadas pelo navegador na entrada não concedem posse nem definem a skin. `player.skin` também exige autorização persistida, via API interna; `player.appearance` apenas pede sincronização depois de vestir ou comprar pela API. O patch público transmite somente a skin selecionada, sem expor saldo ou inventário. Trocar de skin não altera movimento, colisões, regras do blackjack, eventos ou moderação. A troca visual aguarda o fim da skill em andamento.

## Loja e moeda

A compra é permanente, exige conta confirmada e usa uma transação com bloqueio da carteira. A coleção tem chave única por conta/carta. Repetir uma compra não cobra novamente; compras concorrentes não podem produzir saldo negativo. Preço, débito, posse e lançamento vêm do servidor, nunca do formulário. Cada compra grava sua própria linha no extrato, então uma carta retirada pela administração pode ser comprada de novo. A loja não vende moeda nem usa dinheiro real; as moedas vêm do trabalho no bar (J) e das entregas, descritos em [economia](economia.md) e [Highfood](highfood.md).

O saldo inicial e o bônus diário estão preparados para futura configuração e permanecem desativados (`WALLET_INITIAL_COINS`, `WALLET_DAILY_COINS`). O botão do bônus diário só aparece com valor acima de zero. As variáveis `SKIN_PRICE_<ID>` continuam valendo como padrão das cartas (`SKIN_PRICE_RAFAEL_ROSE`, por exemplo).

As contas de demonstração preparadas pelo seed e os bots de teste recebem a coleção completa e todas as habilidades. Isso não altera o cadastro normal. O seed continua proibido em produção. Os testes de navegador usam serviços e banco separados e dão **somente às suas contas de teste** 10.000 moedas; esse valor não é aplicado ao bar em `localhost:5173`.

## Assets e renderização

Cada skin é um GLB em `apps/web/public/models`, com banco de animações em `apps/web/public/animations/<id>.glb` e bengala em `apps/web/public/props/old-cane-<id>.glb`. O cliente carrega Nathan ao iniciar e as demais skins quando aparecem na cena. Veja [esqueletos nativos](../assets/native-rigs.md), [skins Mixamo](../assets/skins-mixamo.md) e [animações](../assets/animations.md).

A arte das cartas é gerada pelo próprio motor do jogo (`npm run assets:cards`, `tools/assets/render-skin-cards.mjs`):

- `apps/web/public/skins/cards/<id>.webp`: o recorte transparente, de 640 × 960.
- `apps/web/public/skins/turn/<id>.webp`: uma folha de 24 quadros do personagem girando, com o quadro da carta na primeira célula.

Depois de renderizar de novo, mude `CARD_ART` em `collection/skin-card.ts`, porque os arquivos ficam em cache por muito tempo.

### Criar uma carta nova

1. Acrescente o modelo em `skins` de `tools/assets/import-mixamo.mjs` e o id na lista de `tools/assets/convert-animations.mjs`. Se for variante de um personagem com habilidades, inclua o id em `exclusive`, para os clipes entrarem no banco dela.
2. Acrescente a entrada em `SKIN_IDS` e `SKINS` (`packages/shared/src/skins.ts`), com `base` apontando para o personagem. O preço entra na tabela sozinho.
3. Rode `npm run assets:skins`, que importa, converte e gera a arte.
4. Atualize `SKIN_VERSIONS` em `BarScene.ts`, `CARD_ART` e `rigs.js`.
5. Atualize as listas dos testes (`animations`, `mixamo-retarget`, `retarget`, `old-cane`, `animation-transitions`, `rigs.spec`).

## Verificação

- `apps/api/test/wardrobe.test.ts`: posse de Nathan sem compra, saldo zero, compras repetidas e concorrentes, variante vendida sozinha, habilidade que exige carta e vale em todas as variantes, carta oculta e fora de venda, recompra depois de retirada, edição e permissão no painel.
- `apps/server/test/kick.integration.test.ts`: o golpe é recusado sem a habilidade comprada, com WebSockets reais.
- `tests/integration/animations.test.ts` e `mixamo-retarget.test.ts`: esqueletos, bancos e pesos de Leandro e Rafael Rosé.
- `tests/e2e/collection.spec.ts`: a tela no fixture `tests/fixtures/collection.html` (teclado, compra, revelação, giro, celular) e o fluxo inteiro no jogo real (variante, habilidade bloqueada, golpe depois de comprar, edição no painel).
- `tests/e2e/bar.spec.ts`: conta nova vestindo Nathan, compra e troca vistas por outro cliente, persistência depois de novo login.
