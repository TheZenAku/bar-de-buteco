# Interface Boteco Sem Noção

A referência é `assets-bar/ui/boteco-balada-de-jogos-main/src/routes/index.tsx`, com a paleta e os efeitos de `src/styles.css`. O jogo usa essa identidade sobre o cenário PlayCanvas: placas com contorno marrom, cerveja e feltro, tipografia Bungee / Bungee Shade / Permanent Marker / Space Mono, chat à direita e ações na base. A imagem fornecida é o fundo da entrada; durante a partida o fundo continua sendo o mapa 3D interativo.

`apps/web/src/main.ts` mantém os formulários, eventos e integrações existentes. `boteco.css` aplica o tema, adapta os painéis de conta, pessoas, administração, skins e blackjack, e ajusta a disposição para telas estreitas. As fontes são distribuídas localmente com suas licenças, sem requisições ao Google Fonts durante o jogo. O projeto de referência permanece intacto.

O cabeçalho apresenta nome da conta, skin atual, lotação/capacidade, latência, conexão e atividade recebida do servidor. A barra inferior permite pedir bebida no balcão, focar o chat, alternar dança, escolher skin e executar o karatê quando Rafael estiver selecionado. A placa de interação também aceita clique. Recolher o chat atualiza `aria-expanded`; Resenhar e Enter o reabrem. Modais mantêm navegação por teclado e as animações de interface respeitam a preferência de movimento reduzido.

O protótipo inclui atributos corporais, carteira, mensagens predefinidas e sorteio local de cartas. Esses dados demonstrativos não são apresentados como estado do jogo. As cartas, turnos, resultados e estatísticas continuam vindo do blackjack multiplayer; não há apostas. Sinuca, truco e banheiro não possuem sistemas implementados no jogo e não ganham botões sem função. Pedir bebida exige proximidade do balcão e mantém a validação do servidor.

A disposição foi verificada em 1440, 960 e 390 pixels de largura, incluindo o quinto botão exclusivo do Rafael. O movimento continua sendo por teclado; o tema responsivo não implementa um joystick para dispositivos de toque.

O teste de navegador `Boteco interface uses live state and its action bar works at desktop and narrow widths` verifica dados reais, dança, foco e recolhimento do chat, troca de skin, karatê, limites da tela e retorno à entrada. A suíte existente verifica também contas, recuperação, chat entre clientes, bloqueios, denúncias, reconexão, animações, navegação pelo mapa e blackjack/eventos administrativos.

Validação em 21/10/2026: typecheck e build aprovados; os seis testes de navegador passaram em 3,5 minutos, usando API, sala e banco separados do desenvolvimento. Após os ajustes de reabertura da lista de pessoas, ativação de botões com Enter e organização das fontes, o teste de interface passou novamente. A captura final confirmou fontes locais carregadas, ausência de falhas de requisição/JavaScript e ausência de rolagem horizontal na partida e na entrada em 390 px. O build mantém o aviso anterior sobre o tamanho do bundle principal do motor 3D.

Prévias da implementação: [entrada](previews/interface-lobby.png), [partida](previews/interface-game.png) e [tela estreita com Rafael e administração](previews/interface-mobile.png).
