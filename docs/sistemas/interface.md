# Interface Midnight Neon

A interface segue a referência **Midnight Neon Menu** (`assets-bar/ui/midnight-neon-menu-main`), um conceito minimalista inspirado nos menus do GTA Online: painéis escuros, cantos retos e tipografia limpa. As cores são as da logo do **Highland Bar**. Ela substitui por completo o tema anterior, Boteco Social (marrom com neon, Lilita One e Nunito), que continua no histórico do git. O fundo da partida continua sendo o mapa PlayCanvas interativo.

A referência é um protótipo React, Tailwind e TanStack. A integração reproduz o seu vocabulário no cliente TypeScript/DOM existente, sem adicionar outro aplicativo, roteador ou renderizador. O diretório de referência permanece intacto. O que a referência não tem (painéis do jogo, janelas, mochila, blackjack, configurações) foi feito com os mesmos elementos dela.

## Identidade

| Elemento | Na referência | No jogo |
| --- | --- | --- |
| Cores | Tokens oklch de `src/styles.css`: fundo arroxeado, painel preto a 90%, rosa, ciano e lilás suaves | As da logo do Highland (tiradas de `favicon-192.png`): magenta `#ea2fdc`, ciano `#17d4f4`, azul elétrico `#0386f0`, dourado `#fac416` e laranja `#f59847`, sobre uma noite violeta. Painéis violeta-escuros a 90% com a linha neon da logo (magenta, azul, ciano) no topo; o que está ativo ou selecionado fica magenta (`#b90eb2`, texto branco) com brilho; dinheiro em dourado; foco em ciano. Menta continua no microfone ligado e no turno de trabalho; o laranja, no medidor de fome |
| Fontes | Chakra Petch e JetBrains Mono | Servidas localmente (`assets/fonts`, subconjunto latino, licença OFL). Jogar não depende do Google Fonts |
| Ícones | Lucide, sem emoji | Lucide (`lucide-static` 1.64.0, ISC), embutidos em `ui-icons.ts`. Moedas usam o ícone de moedas em vez da imagem dourada |
| Cabeçalho | Rótulo mono espaçado e título grande em caixa alta | "O seu bar · A sua galera / Highland Bar" na entrada; no jogo, a logo pequena no canto superior esquerdo |
| Abas | Fundo preto; a ativa em branco com texto preto; linha em gradiente rosa, lilás e ciano por baixo | Entrada, administração e janelas como Pessoas no bar; a ativa fica magenta e a linha segue a logo |
| Lista | Ícone, rótulo em caixa alta e seta; o item ativo fica branco | Opções de acesso, "O Bar", "Controles" e o menu de painéis; o item ativo fica magenta |
| Cartão de detalhe | Título com ícone rosa, conteúdo, rodapé mono com a posição na lista | Painéis do HUD e o detalhe da entrada |
| Painel de dinheiro | Mono, alinhado à direita, saldo em ciano | Carteira num chip próprio no fim do topo, à direita, com o saldo em dourado |
| Dicas de tecla | Chips pretos com a tecla contornada | Rodapé da entrada e os avisos "E" e "P" do jogo |
| Fundo | Céu em degradê, grade em perspectiva, sol desfocado e scanlines | Entrada e tela de espera (a grade corre em direção a quem olha) e, só as scanlines, o fundo das janelas |

A logo (`assets-bar/logo/logo.png`, a do letreiro da fachada) está nos favicons (`favicon-32.png`, `favicon-192.png` e `apple-touch-icon.png`), na entrada como letreiro animado (`ui/logo-highland.webp`, 720 px, veja abaixo), na tela de espera (132 px, flutuando) e, no jogo, no canto superior esquerdo (`ui/logo-highland-hud.webp`, 128 px, mostrada com 56 px; 48 px em telas compactas e 40 px no celular). O título **Highland Bar** da entrada é um neon que falha de vez em quando.

Os marcadores do mundo mantêm a cor do seu anel na cena: verde no objetivo do trabalho, magenta na escada do palco, turquesa no telão, dourado na loja da casa e violeta na mesa de luz, em cima do palco (`--blip-job`, `--blip-stage`, `--blip-telao`, `--blip-shop` e `--blip-desk`). O crachá desenhado sobre eles segue a interface: chip preto, cantos retos e texto mono. O do trabalho mostra sempre a distância (e fica na borda da tela quando a estação sai de vista); os do palco e do telão só aparecem com o jogador em cima do anel, com o nome e o preço, logo abaixo dos pés. De longe, o anel basta.

## Entrada

Três abas, como na referência:

- **Conta**: Entrar, Criar conta e Recuperar senha (ou Nova senha, pelo link do e-mail). Com a sessão ativa, Continuar e Usar outra conta.
- **O Bar**: galera, blackjack, pebolim, jukebox e TVs, palco, mesa e balcão e trabalho, com preços e limites lidos de `@bar/shared`. Nada é inventado.
- **Controles**: as teclas por grupo. A ajuda do jogo (`?`) lê a mesma lista (`CONTROLS` em `lobby-menu.ts`).

Apontar ou focar um item de O Bar e de Controles mostra o seu detalhe. As setas esquerda e direita trocam de aba; para cima e para baixo percorrem a lista.

### A logo na entrada

Ao lado do menu fica a logo grande, como um letreiro de neon vivo (`lobby-hero.ts` e `lobby-hero.css`):

- **Entrada**: cai girando, quica e acende com uma onda de choque e um clarão.
- **O tempo todo**: flutua e balança; dá um pulinho a cada 9 s; o neon falha de vez em quando; um brilho passa por ela; às vezes dá uma falha de imagem em ciano e magenta. Atrás, raios girando nos dois sentidos, um halo que pulsa no compasso de 124 BPM (o mesmo do [show do palco](palco.md#show-de-luzes)), um anel de neon nas cores da logo, quatro faíscas em órbita e quatro holofotes varrendo o céu. Embaixo, um equalizador de 18 barras.
- **Com o mouse**: a logo se inclina na direção do ponteiro, em qualquer ponto da entrada, e cresce um pouco quando o ponteiro passa por cima.
- **Com um clique, um brinde**: a logo amassa e estica, solta bolhas, estrelas e confetes, toca um tim-tim de copo (sintetizado, sem arquivo de som) e mostra o grito da rodada. Cliques seguidos, a menos de 1,3 s um do outro, continuam a rodada: *Saúde!*, *Tim-tim!*, *Mais uma! ×3*, *Ô loco! ×4*, *Desce redondo! ×5*, *Saideira! ×6*.
- **Fundo**: bolhas de cerveja sobem pela entrada inteira, cada uma com tamanho, velocidade e balanço próprios.

Em telas a partir de 1280 px, a logo fica à direita do menu (até 480 px) e a luz dela passa por trás dos painéis. Abaixo disso, ela fica entre o título e as abas, menor (150 a 230 px), e no celular os holofotes e a dica somem. Tudo se move com `transform` e `opacity`; os desfoques e as máscaras são desenhados uma vez só, o que pesa pouco mesmo com a composição por software do navegador. Com *reduzir movimento* ligado no sistema, nada se mexe e o brinde mostra só o grito (com o tim-tim).

## Na tela

A tela mostra só o que é usado o tempo todo. O resto abre por tecla ou pelo topo: a mochila (I ou Mochila, nas ações), as pessoas (botão Pessoas no bar) e a ajuda, que lista todas as teclas. Não há dicas de teclas fixas na tela, e a caixa de e-mail local (só em desenvolvimento) aparece apenas na entrada.

| Lugar | O que fica ali |
| --- | --- |
| Superior esquerdo | A logo e, durante um turno de trabalho, o painel **Turno** embaixo dela |
| Superior direito | Ferramentas (turno, painéis, pessoas no bar, som, microfone, vozes, configurações, ajuda) e, por último, a carteira |
| Meio, à direita | O **Papo no Balcão** |
| Inferior esquerdo | O **mapa** e, num arco sobre a borda dele, os núcleos de **Seu estado** |
| Inferior central | A barra de ações; acima dela, os avisos de tecla (**E** perto de algo e **P** sentado à mesa) e, acima deles, uma linha de ícones com o que está sendo consumido. Sentado no blackjack, a mesa ocupa o lugar dos dois e os ícones sobem para o topo |

No celular, a primeira linha do topo traz a logo e a carteira, e a segunda, as ferramentas. O chat vem embaixo, na largura da tela; a barra de ações ocupa a largura do rodapé em duas linhas e, logo acima dela, à esquerda, fica o mapa (menor) com os núcleos de **Seu estado** na borda. Os avisos de tecla sobem para cima do mapa.

**Mapa:** um radar redondo no canto inferior esquerdo, como os do GTA e do Red Dead Redemption 2 (`minimap.ts` e `minimap.css`). Mostra de cima a vizinhança e o bar ao redor do jogador: ruas, quarteirões, casas, árvores e carros nos tons violeta da noite, e as paredes do bar em neon magenta. Ele gira com a câmera (o que está à frente da câmera fica para cima) e o jogador é a seta branca no centro, apontando para onde o personagem está virado, com um leque claro marcando o que a câmera vê. A borda tem o degradê da logo, marcas a cada 30° e os pontos cardeais (o **N** num círculo magenta). Os lugares de usar aparecem como ícones nas cores dos anéis da cena: balcão (laranja), palco (rosa), jukebox (ciano), loja da casa (dourado), blackjack (lilás), pebolim (azul) e banheiros (um por andar). As outras pessoas são pontos ciano; os funcionários, como o Magrão e o Tonico, dourados. No andar de cima, a laje cobre o térreo e as paredes do andar aparecem em neon; o que está no outro andar fica apagado. Durante um turno, a estação de trabalho aparece com uma maleta verde e, fora do alcance, fica na borda, com uma seta para ela. O alcance é de 15 m dentro do terreno do bar e até 8 m dele (a calçada da frente), e de 28 m mais longe, na rua, com transição suave. Embaixo, um selo diz onde você está: Salão, Quintal, Andar de cima, Terraço ou, fora do bar, o lugar mais próximo (Praça, Igreja, Campinho, Escola, Ponto de ônibus) ou Rua. Tudo vem dos colisores do mapa (`map-data.json`) e das posições desenhadas pela cena (`BarScene.mapView`). O mapa é desenhado num canvas próprio, só quando algo nele mudou e no máximo 30 vezes por segundo; não mexe no DOM a cada quadro, o que travava o jogo com os serviços de acessibilidade do navegador ligados (veja o marcador do trabalho). Não recebe o ponteiro: arrastar sobre ele continua girando a câmera. Tem 188 px no desktop, 152 px em telas compactas, 148 px em telas baixas e 104 px no celular.

**Consumindo:** enquanto o personagem bebe ou come, cada item vira um ícone redondo numa única linha, como os espaços de comida dos jogos de sobrevivência: a foto do item dentro de um anel magenta que esvazia conforme ele acaba, com o tempo que falta embaixo. Nos últimos 10 s, o anel fica dourado e pulsa. O verbo e o nome (bebendo, comendo, usando) são a dica do ícone e o seu rótulo acessível. A gelada na mão e um pedido de quatro itens na mesa ocupam uma linha curta, não cinco barras; acima de seis itens, o último ícone vira "+N". Antes era uma barra de progresso por item, e um pedido grande enchia a tela. Cada coisa dura o mesmo tempo de onde vier (`CONSUME_MS`, de 1,5 a 3 min): o que está na mão (a gelada do Magrão, a bebida ou a comida da mochila), enquanto você anda ou faz outra coisa, e cada item servido no seu assento, enquanto você está sentado. O curativo mostra o seu uso rápido (2 s). Tudo vem do estado da sala e do relógio do servidor (`consumption.ts`; o desenho em `consuming-hud.ts` só mexe num anel quando o valor muda meio por cento). O ícone some quando o item termina; o da mesa, também quando você levanta.

**Seu estado** não é um painel: são núcleos pequenos e redondos num arco colado à borda do mapa, por cima dele, como no Red Dead Online. O anel em volta de cada um é o medidor, em dez segmentos e na cor dele, e o símbolo dentro do núcleo é cheio e esvazia de cima para baixo junto com o anel. Da esquerda para a direita: vida (coração magenta), fôlego (raio menta), fome (coxa de frango laranja), sede (gota ciano), bexiga (vaso lilás) e, só quando há álcool, a embriaguez (caneca dourada, com o anel no degradê da logo), por último, para que nada se mexa quando ela aparece. Todos têm o mesmo tamanho: 32 px no desktop, 28 px em telas compactas e baixas e 24 px (22 px em celulares baixos) no celular. O arco começa à esquerda, a 130° (longe da borda da tela), e segue no sentido horário, um núcleo a cada 21° (24° e 25° no celular); o tamanho e o arco vêm de variáveis do `minimap.css` e o lugar de cada núcleo, de `--i`. A bexiga e a embriaguez enchem conforme sobem. Não há números na tela: o nome e o valor (ou o estágio da embriaguez, como "Tonto") aparecem sobre o núcleo ao passar o mouse, e cada núcleo é um medidor acessível com esse nome e esse valor. No estado crítico, anel e símbolo ficam vermelhos, um halo vermelho pulsa em volta e o núcleo treme; o da vida bate como um coração. Quando um medidor melhora (comer, beber, descansar, ir ao banheiro), o anel acende e o núcleo dá um pulinho. Os símbolos são do Lucide (coração, raio, coxa de frango, gota e caneca, preenchidos); o vaso foi desenhado na mesma grade. Sentado no blackjack, a mesa fica no centro do rodapé; em telas de até 1420 px, o mapa e os núcleos saem da frente.

O botão **Pessoas no bar** abre uma janela com duas abas. **Quem está por perto** traz a lotação do bar (pessoas/capacidade, com a barra), a sua conexão (estado e latência, atualizada no lugar enquanto a janela está aberta) e a lista de pessoas, com silenciar, bloqueio e denúncia. **Seu lugar no bar** é a conta: nome, visual, e-mail, rodadas de blackjack, voltar à entrada e sair da conta.

| Painel | Dados e ações reais |
| --- | --- |
| Ações | Uma barra de ícones no rodapé, com a tecla no canto de cada botão; o nome aparece ao passar o mouse ou focar. Interagir (E), gelada no balcão (E), pedido na mesa (P), dança (G), aceno (V), cigarro (F), cigarro inteiro (Shift+F), chat (T), mochila (I), visual (C), trabalho (J) e o golpe exclusivo do Rafael (X). O som fica só no botão do topo. Arraste-a pela faixa da esquerda, que também a recolhe |
| Papo no Balcão | Chat de proximidade, histórico e comandos, incluindo `/velho`. Fica no meio da tela, encostado no lado direito. Parado, mostra só o texto das mensagens sobre a cena, sem fundo (com uma sombra sob as letras, e as linhas mais antigas sumindo para cima), e o cabeçalho com o botão **Ocultar chat**. **T**, Enter ou Resenhar abrem a caixa: o painel, o campo para escrever e o histórico para rolar; Esc, enviar a mensagem ou clicar na cena fecham. O campo guarda o seu espaço mesmo escondido, então abrir a caixa não move nada, e as linhas paradas deixam o ponteiro passar para a cena. Com o chat oculto, T o mostra de novo, e uma mensagem nova acende um ponto magenta no botão Resenhar |
| Turno | Só durante um turno de trabalho: tarefa, contagem, tarefas feitas, ganhos e fim do turno. O botão **Turno** do topo mostra ou esconde o painel ([economia](economia.md)) |

A carteira fica no fim do topo, à direita; a conexão, na janela Pessoas no bar. A carteira é consultada na API ao entrar e atualizada periodicamente, incluindo alterações feitas pela administração. Comprar uma skin atualiza saldo e coleção; vestir troca o visual na hora para todos. Os lugares do bar (balcão, jukebox, TVs, mesas, palco) são usados chegando perto e apertando **E**, com validação do servidor.

Álcool, necessidades, carteira e inventário usam dados reais. A interface não inventa saldo, ganhos, consumo ou jogadores. Sinuca, dardos, humor e mensagens periódicas continuam fora do jogo; o blackjack usa cartas, turnos, apostas e pagamentos reais ([Blackjack](blackjack.md)), e o pebolim, física, placar e partidas valendo moedas de verdade ([Pebolim](pebolim.md)).

## Organizar a interface

Arraste o cabeçalho de um painel para movê-lo. O botão do cabeçalho recolhe ou expande seu conteúdo; o do chat o oculta. **Painéis** abre um menu com **Tela cheia** (veja abaixo), **Travar painéis** (bloqueia a movimentação; vira **Destravar painéis**), a opção de ocultar e reexibir cada painel e a de restaurar a disposição inicial. Também é possível focar um cabeçalho e usar as setas; Shift aumenta o deslocamento.

Posição, visibilidade, recolhimento e trava são salvos por conta e faixa de largura em `localStorage`, neste navegador (a chave é `bar:nova-ui:hud:v4`). Cada painel guarda a distância até os lados da tela mais próximos de onde foi solto: esquerda, direita ou o meio, na largura, e topo, base ou o meio, na altura (o terço da tela em que está o centro dele). Assim ele acompanha as bordas quando a janela muda de tamanho: a barra de ações continua centralizada a 12 px da base, o chat continua a 16 px da borda direita e no meio da altura, e um painel posto à direita continua à mesma distância da borda direita. Uma janela menor só aperta o painel para dentro da tela; a posição escolhida volta quando a janela cresce de novo. As disposições anteriores (`v1` a `v3`) deixaram de valer quando o chat foi para a direita e o mapa ocupou o canto inferior esquerdo. JSON inválido é ignorado. Telas estreitas usam uma disposição própria. Em telas largas, um painel sobe o necessário para caber inteiro; nas compactas e no celular ele fica no lugar e rola. A barra de ações sempre sobe o necessário, também quando quebra em duas linhas. Em telas baixas, o chat e as ações ficam compactos. Resenhar, Enter e T reabrem o chat mesmo se ele estiver oculto.

### Tela cheia

O jogo funciona nas duas telas cheias:

- **F11**, a do navegador. A página vê que ocupa a tela inteira e o menu mostra **Sair da tela cheia**. Uma página não consegue sair dessa tela cheia, então o botão avisa: aperte F11 de novo.
- **Painéis → Tela cheia**, a da própria página (Fullscreen API), com o documento inteiro, então janelas, avisos e o celular continuam visíveis. O mesmo item vira **Sair da tela cheia**. Quando o navegador permite (Edge e Chrome), o Esc continua sendo do jogo, fechando janelas como sempre, e é preciso segurar o Esc para sair da tela cheia.

Nos dois casos o cenário 3D ocupa a tela inteira. O PlayCanvas, por padrão, mantinha a proporção do primeiro tamanho da janela, e por isso sobrava uma faixa vazia embaixo depois do F11. Agora a cena segue o tamanho da janela (`FILLMODE_NONE` e o `resize` da janela em `BarScene`). A barra de ações também tinha um erro: medida "apertada" na primeira montagem, ela crescia 1 px a cada redimensionamento. Agora é medida na altura natural, a da fileira de botões (52 px).

O movimento permanece por teclado. Arrastar painéis não gira a câmera, e arrastar sobre o HUD não seleciona texto (só o chat e os campos permitem seleção). Modais mantêm foco e navegação por teclado, e a interface respeita a preferência por movimento reduzido.

## Avisos

Cada aviso é um painel preto com uma faixa lateral na cor do tipo, rótulo mono, título em caixa alta, fechamento e uma linha de duração na base. Tipos: recado (ciano), no bar (rosa), fique de olho (vermelho suave) e conquista (lilás). Há no máximo quatro avisos ativos. Avisos com o mesmo identificador são deduplicados enquanto estão na tela. Passar o mouse ou focar um aviso pausa tanto sua linha quanto sua expiração. As classes `comanda` do tema anterior foram mantidas.

Só o essencial vira aviso; o que já aparece em outro lugar da tela não gera aviso.

- **Fique de olho:** erros da API, do servidor ou da conexão; ações recusadas (longe demais, item que sumiu, golpe em andamento); microfone indisponível ou desconectado; vida baixa; item levado durante um desmaio.
- **No bar:** denúncia registrada e mudança na própria permissão de administração.

Não viram aviso:

- mensagens do chat, que ficam no painel do chat;
- eventos do bar, que têm o banner próprio;
- resultado do blackjack, que aparece na mesa;
- compras, uso e descarte de itens, que aparecem na mochila;
- troca de visual, chegada ao bar e ações do próprio personagem;
- confirmações de som e microfone;
- os demais medidores do canto da tela (**Seu estado**).

Textos de jogadores são inseridos como texto, inclusive nos avisos. HTML enviado pelo chat não vira marcação executável. Não existem mensagens automáticas demonstrativas. Sair do bar limpa os avisos da sessão anterior.

## Arquivos e verificação

`neon-ui.css` contém os tokens e os estilos da entrada, do HUD, das janelas e dos avisos; `assets/fonts/neon-ui.css` declara as fontes. `game-ui.ts` define as telas; `lobby-menu.ts` as abas O Bar e Controles; `lobby-hero.ts` e `lobby-hero.css` a logo animada da entrada e as bolhas; `ui-icons.ts` os ícones; `hud-panels.ts` controla o layout dos painéis; `needs-hud.ts` e `needs.css`, os núcleos do canto; `minimap.ts` e `minimap.css`, o mapa; `notifications.ts` controla os avisos. `main.ts` continua conectando contas, API, multiplayer, modais e ações. `economy.css`, `needs.css`, `jukebox.css`, `voice.css` e `admin.css` usam a mesma identidade.

Os testes de `tests/e2e/nova-ui.spec.ts` verificam a logo no canto superior esquerdo, o chat no meio da direita (sem fundo parado, com a caixa aberta pelo T e fechada pelo Esc, e oculto pelo próprio cabeçalho), o mapa redondo no canto inferior esquerdo com o nome do lugar, os núcleos redondos com valores válidos, pequenos, em ordem e logo fora do anel do mapa, por cima dele, a carteira no fim do topo, conexão e conta na janela de pessoas, a trava dentro de Painéis, a barra de ações em uma linha no rodapé, o mapa e os núcleos (dentro da tela e fora dos painéis em todas as larguras), a ausência das dicas de tecla e da caixa de e-mail no jogo, a lotação na janela de pessoas, arrastar, trava, persistência, armazenamento inválido, limites da tela, carteira, chat entre clientes, bloqueio de notificações, segurança do texto e o ciclo de vida dos avisos. Em tela cheia, verificam o item Tela cheia de Painéis (entrar e sair), a cena ocupando a janela em 1920 × 1080, 1366 × 768 e de volta, a barra de ações centralizada a 12 px da base, o chat mantendo a distância da borda direita e o meio da altura e o aviso de F11 quando a janela é a tela inteira. Na entrada, verificam a logo animada ao lado do menu em 1440 px (720 px de imagem, mostrada com 480), o brinde e a rodada de cliques, os confetes que somem sozinhos, a logo entre o título e as abas em 1100, 760 e 390 px sem rolagem lateral e o brinde com movimento reduzido. Os testes existentes cobrem contas, skins, administração, moderação, mapa, blackjack, eventos, animações e `/velho`, em serviços e banco isolados.

O painel administrativo bloqueia a edição durante buscas, impedindo que uma resposta atrasada recrie o formulário no meio de uma escolha de operação.

`npm run test:e2e` organiza os fluxos em grupos de clientes locais para respeitar os limites de cadastro por endereço. Matchmaking e WebSocket passam pelo proxy de mesma origem do ambiente de testes. API, mundo, banco e fundos continuam isolados do desenvolvimento; os limites e as permissões de produção permanecem ativos.

Validação em 29/10/2026: typecheck e build aprovados. Passaram os projetos `interface` (4/4), `game` e `world` (11/12: contas, recuperação de senha, administração, mochila, economia e blackjack), `voice` e os quatro testes da jukebox com API dublê. Duas falhas não envolvem a interface: `bar.spec.ts:86` diverge na contagem do mapa 3D (`cartRenders` 2 em vez de 1) e o teste da jukebox com YouTube real não chega a abrir a janela, porque a caminhada esbarra no colisor da jukebox. Telas conferidas em 1440, 1100, 960, 760 e 390 px de largura: entrada, espera, HUD, avisos, ajuda, configurações, mochila, skins, conta, pessoas, cardápio da mesa, trabalhos, palco, turno, blackjack e banner de evento.

Prévias: [entrada](../previews/nova-ui-lobby.png), [desktop](../previews/nova-ui-desktop.png), [tela estreita](../previews/nova-ui-mobile.png) e [aviso no jogo](../previews/nova-ui-toast.png).
