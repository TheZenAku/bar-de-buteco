# Perfil do jogador

Clique com o **botão direito** em um jogador, ou em você mesmo, e escolha **Perfil** (ou use Pessoas no bar → Perfil). O clique esquerdo em outro jogador não abre mais nada. Em primeira pessoa, o seu próprio corpo não é clicável; use **Pessoas no bar → Seu lugar no bar → Seu perfil**.

A janela não para o jogo: dá para andar com ela aberta. Ela é arrastada pelo cabeçalho (mouse, toque ou setas com o cabeçalho em foco), nunca sai da tela e abre onde foi deixada. **Esc** fecha a de cima. Em telas estreitas, ela ocupa a largura disponível.

## O que aparece

- **Nome** e **@ do Highgram**, que abre o perfil dela no Highgram do celular.
- **O modelo atual**, parado, desenhado uma vez pelo próprio jogo (`engine/skin-portrait.ts`), numa camada própria e com luz fixa, sem depender da hora do dia. Se a cena 3D falhar, entra a miniatura da loja.
- **Emblemas**: uma grade de seis espaços. Passar o mouse (ou focar) mostra o nome, a raridade e a descrição, e **clicar abre a [carta](#a-carta)**. A cor da raridade aparece na borda de baixo do espaço, e os Lendários piscam. Espaço vazio é um hexágono apagado.
- **Mensagem de status**, abaixo do quadro do modelo: até 60 caracteres, em uma linha.
- O **número**: no seu perfil, com o botão de copiar. No de outra pessoa, **Salvar contato** é o caminho para ter o número na agenda; depois de salvo, viram **Mensagem** e **Ligar** ([celular](celular.md#números-contatos-e-o-perfil-do-jogador)).

## O que o dono edita

No próprio perfil, além do que todos veem:

- O lápis da mensagem de status (**Enter** salva, **Esc** cancela).
- **Editar emblemas** abre uma segunda janela com a coleção. Escolha até seis; a ordem dos cliques é a ordem no perfil. O botão no canto de cada emblema abre a carta, mesmo dos que não estão em exibição.
- A aba **Conquistas**, com o progresso de cada série de emblemas ganhos jogando ([conquistas](conquistas.md)).
- A aba **Skill**, descrita abaixo.

## Skills

Alguns personagens têm habilidades próprias, listadas em `SKILLS` (`packages/shared/src/profile.ts`). Elas **são compradas na [coleção](skins.md#habilidades)**: a aba **Skill** mostra as bloqueadas, com o preço, e leva até lá. Entre as compradas, o jogador escolhe qual fica ativa e em qual tecla. A escolha vale por personagem, em todas as variantes dele, e fica salva na conta (`user_profiles.skill_loadouts`).

| Skill | Skin | Clipe | Duração |
| --- | --- | --- | ---: |
| Golpe de karatê | Rafael | `Kick` | 2 s |
| Chute voador | Rafael | `AirKick` | 2,9 s |

- Sem escolha salva, a primeira skill comprada do personagem fica ativa na tecla **X**.
- Valem letras e números que o jogo ainda não usa a pé: W, A, S, D, E, G, V, F, C, Q, T, M, I, B, P, K e J são recusadas. Na moto, Z, X, C e H continuam sendo os comandos dela.
- A barra de ações mostra um botão com a skill ativa e a tecla escolhida. Ele só aparece se o jogador tiver comprado alguma skill do personagem vestido.
- O servidor confere se a skill é do personagem vestido, se foi comprada e se o jogador está livre (`player.skill`). A escolha de tecla fica só no cliente e na API.

Para criar uma skill: ponha o clipe no banco das skins do personagem (`clips` e `exclusive` em `tools/assets/convert-animations.mjs`) e acrescente a entrada em `SKILLS`, com a duração do clipe, a raridade e o preço. O preço entra na tabela sozinho, e a coleção passa a vendê-la.

### O chute que acerta

Os dois chutes do Rafael derrubam quem o pé tocar: o corpo voa em ragdoll, cai, rola e a pessoa se levanta sozinha. Quem leva o chute vê o aviso **Chutado**, com a vida perdida.

| Skill | Vida | Lançamento | Distância típica |
| --- | ---: | --- | --- |
| Golpe de karatê | 6 | 9 m/s, subindo a 3,8 m/s | 8 a 9 m |
| Chute voador | 10 | 12 m/s, subindo a 4,8 m/s | 11 a 13 m |

As distâncias são em rua aberta. Dentro do bar, a parede para o corpo antes, e ele bate e volta.

**O que conta como acertar.** A sala não tem esqueleto, então decide por uma tabela com o caminho do quadril e dos pés durante o clipe (`packages/shared/src/kick-paths.ts`, gerada do próprio `rafael.glb`). A cada passo do servidor, ela confere todo o trajeto da perna desde o passo anterior contra o corpo da outra pessoa, tratado como uma cápsula em pé. Assim, o que a perna toca no desenho é o que apanha, e o karatê, que vem girando pela direita, pega quem está à direita, mas não quem está à esquerda.

- A perna só conta enquanto está no ar: de 0,4 a 0,85 s no karatê e de 0,9 a 1,45 s no chute voador. O clipe segue o relógio da sala, para o pé estar onde a sala acha que está.
- Um chute pode pegar várias pessoas, cada uma uma vez.
- **Mira:** ao apertar a tecla, o Rafael gira até quem estiver a até 2 m e a até 60° da frente dele. Quem está atrás não é mirado.
- Parede segura o chute e a mira. Poste, árvore e móvel baixo, não.

**Quem pode ser atingido.** Só quem está a pé e livre, fumando ou no meio de outro chute. Quem está sentado, trabalhando, jogando, no banheiro, no palco, na moto, desmaiado, já caído ou ausente não é atingido.

**Para não virar perseguição:**

- Um chute nunca tira o último ponto de vida, então sozinho ele não desmaia ninguém nem faz perder item.
- Depois de se levantar, a pessoa fica 2,5 s sem poder ser chutada de novo (`KICK.graceMs`).

Como em todo ragdoll, cair derruba a bebida da mão e a encomenda do Highfood.

**O que se vê e se ouve no golpe** (só no navegador, sem passar pela sala):

- A [perna cortando o ar](../assets/sons-golpes.md), mesmo que erre, e o som do pé ao acertar.
- Uma estrela de luz onde o pé encosta (`engine/blow-fx.ts`).
- A câmera treme para quem chutou e, mais forte, para quem levou. Com "reduzir movimento" no sistema, não treme.
- O clipe de quem chutou segura 70 ms ao acertar, para o golpe ter peso.
- Cada batida forte do corpo faz barulho, e no chão levanta poeira. Isso vale também para quem cai da moto.

Os números ficam em `KICKS` e `KICK` (`packages/shared/src/kick.ts`). Para outra skill que acerte: ponha o clipe em `KICKS` de `tools/assets/measure-kicks.mjs`, rode `npm run assets:kicks` e acrescente a entrada em `KICKS`.

### Animação do chute voador

O FBX `assets-bar/skins/Rafael/rafael-rigged-corrigido.fbx` tem malha, esqueleto e textura, mas **nenhuma curva de animação**. Por isso, o `AirKick` usa `assets-bar/anim/misc/Drop Kick.fbx`, o chute no ar do acervo. Quando chegar o arquivo definitivo, basta trocar o `filename` de `AirKick` em `convert-animations.mjs` e a duração em `AIR_KICK_DURATION_MS`, rodar `node tools/assets/convert-animations.mjs rafael` e depois `npm run assets:kicks`, senão o chute acerta pelo caminho do clipe antigo (um teste avisa).

## Emblemas

O catálogo fica no banco (`badges`) e é gerenciado em **Administração → [Emblemas](admin.md)**: criar, editar, apagar, conceder e retirar, sempre com motivo no registro. Além dos criados à mão, há os que o jogador ganha sozinho ao jogar ([conquistas](conquistas.md)). Todo emblema novo chega com um aviso, seja qual for a origem. Um emblema tem nome, descrição, uma [raridade](#raridade), um ícone de `BADGE_ICONS`, uma cor e, se quiser, uma imagem enviada. Com imagem, a arte é ela sozinha, sem moldura, ocupando o espaço inteiro; com ícone, é o ícone num hexágono da cor escolhida (`badgeMedal`). `user_badges.shown_at` guarda a posição dele entre os seis em exibição.

### Imagem enviada

No formulário do emblema, **Enviar PNG** escolhe um arquivo do computador. O navegador reduz a imagem a no máximo 256 × 256 px, mantendo a transparência, e a envia na hora. Ela fica salva no banco do servidor (`badge_images`, migração `010_badge_images.sql`), junto com os outros dados do jogo, e entra na lista do formulário para servir a qualquer emblema. O emblema só passa a usá-la quando é salvo; escolher um ícone volta para o ícone. A cor só vale para o hexágono, então o formulário a esconde enquanto há imagem.

A imagem continua no servidor mesmo que o emblema seja apagado ou troque de arte. **Apagar esta imagem** só aparece quando nenhum emblema a usa. A API aceita apenas PNG inteiro, de até 256 px de lado e 300 kB; o `id` é o SHA-256 do arquivo, então o mesmo arquivo é guardado uma vez só. Envio e remoção ficam no log.

A migração `009_profile.sql` cria o emblema **Fundador** e o concede à conta principal, para testar a janela.

### Raridade

São cinco, da mais comum à mais rara (`BADGE_RARITIES`, coluna `badges.rarity`, migração `011_badge_rarity.sql`):

| Raridade | `id` | Na carta |
| --- | --- | --- |
| Comum | `common` | Moldura cinza |
| Incomum | `uncommon` | Moldura verde |
| Raro | `rare` | Moldura ciano |
| Épico | `epic` | Moldura violeta |
| Lendário | `legendary` | Moldura dourada, **cravejada de brilhos**, com foil holográfico |

Quem escolhe é o administrador, no formulário do emblema. Um emblema novo começa **Comum**, e a edição que não informa a raridade mantém a que ele tem.

### A carta

Clicar num emblema o amplia numa carta (`apps/web/src/profile/badge-card.ts`), que cresce a partir do próprio emblema. Ela inclina em 3D seguindo o mouse ou o dedo, com o reflexo acompanhando; parada, balança de leve. **Esc**, o X ou um clique fora fecham, e o Esc não fecha a janela que está atrás. O jogo continua rodando.

No Lendário, cada pedra (as da moldura e as espalhadas pela face) tem uma direção própria e só brilha quando a inclinação a vira para a luz, então os brilhos correm pela carta conforme ela se mexe. As pedras são sorteadas a partir do nome do emblema, logo a mesma carta tem sempre o mesmo desenho.

Tudo isso roda num laço de quadros só enquanto a carta está aberta. Com "reduzir movimento" no sistema, ela abre parada e sem animação.

No administrador, **Ver a carta** (abaixo da prévia do formulário) mostra como ela vai ficar antes de salvar, e clicar na medalha do catálogo abre a carta do emblema salvo.

## API

| Rota | O que faz |
| --- | --- |
| `GET /api/profile/:id` | O perfil. `owned` e `loadouts` vêm só no próprio |
| `POST /api/profile/status` | `{status}` |
| `POST /api/profile/badges` | `{badges:[id…]}`, até seis, só os que a conta tem |
| `POST /api/profile/skill` | `{skill,key}` para o personagem vestido; exige a skill comprada |
| `GET /api/admin/badges` · `POST /api/admin/badges` | Catálogo; criar, ou editar com `id` |
| `POST /api/admin/badges/delete` | Apaga e tira de quem tinha |
| `POST /api/admin/badges/images` · `POST /api/admin/badges/images/delete` | Envia um PNG (os bytes do arquivo, `Content-Type: image/png`); apaga um que nenhum emblema usa |
| `GET /api/badges/images/:id` | O PNG, para qualquer conta logada |
| `GET /api/admin/badges/:id/holders` · `POST /api/admin/badges/grant` | Quem tem; conceder e retirar |

## Código

- Cliente: `apps/web/src/profile/profile-window.ts` (a janela), `badge-card.ts` e `badge-card.css` (medalha e carta), `floating-window.ts` (arrastar, manter na tela, ordem), `profile.css`, `apps/web/src/world-menu.ts` (menu do botão direito, que a moto também usa), `apps/web/src/admin/badges.ts`.
- API: `apps/api/src/profile-service.ts`.
- Chutes: `packages/shared/src/kick.ts` e `kick-paths.ts`, `BarRoom.stepKicks`, `apps/web/src/engine/blow-sound.ts` e `blow-fx.ts`.
- Testes: `apps/api/test/profile.test.ts`, `tests/e2e/profile.spec.ts` e `tests/e2e/badge-card.spec.ts` (com `tests/fixtures/badge-card.html`). Chutes: `tests/integration/kick.test.ts`, `apps/server/test/kick.integration.test.ts` e `tests/e2e/kick.spec.ts`.
