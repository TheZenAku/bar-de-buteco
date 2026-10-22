# Interface Boteco Social

A interface ativa substitui o tema anterior pela referência em `assets-bar/ui/nova-ui`. Foram portados os seis painéis, a paleta marrom com detalhes neon, os ícones de contorno, as fontes Lilita One e Nunito e as notificações em formato de comanda. A imagem fornecida aparece na entrada; o fundo da partida continua sendo o mapa PlayCanvas interativo.

O protótipo original usa React, Tailwind e Sonner. A integração reproduz seus componentes no cliente TypeScript/DOM existente, sem adicionar outro aplicativo, roteador ou renderizador. O diretório de referência permanece intacto. Fontes, licenças e imagem são distribuídas localmente; jogar não depende de Google Fonts ou de outros serviços de interface.

## Painéis

| Painel | Dados e ações reais |
| --- | --- |
| Seu Estado | Lotação/capacidade, conexão, latência, atividade e saldo da carteira |
| Ações | Bebida, dança, aceno, chat, visual, interação, som e o golpe exclusivo do Rafael |
| Papo no Balcão | Chat de proximidade, histórico e comandos, incluindo `/velho` |
| Galera no Bar | Jogadores próximos, presença e atividade dos NPCs; acesso aos bloqueios e denúncias |
| Bolso | Personagem e skins que a conta possui; acesso à coleção e loja |
| Pelo Bar | Balcão, jukebox, blackjack e assentos, com distância e indicação de alcance |

A carteira é consultada na API ao entrar e atualizada periodicamente, incluindo alterações feitas pela administração. Comprar uma skin atualiza saldo e coleção; vestir preserva o personagem personalizado. Os botões de lugares continuam exigindo proximidade e validação do servidor. Não teleportam o personagem.

O protótipo possui álcool, energia, humor, gastos locais, objetos de inventário, sinuca, dardos e mensagens periódicas fictícias. Como esses sistemas não existem no servidor atual, foram adaptados aos sistemas disponíveis. A interface não inventa saldo, ganhos, consumo ou jogadores. O blackjack usa as cartas, turnos e resultados reais, sem apostas.

## Organizar a interface

Arraste o cabeçalho de um painel para movê-lo. O botão do cabeçalho recolhe ou expande seu conteúdo. **Painéis** permite ocultar e reexibir cada painel e restaurar a disposição inicial. **Livre/Travado** bloqueia a movimentação. Também é possível focar um cabeçalho e usar as setas; Shift aumenta o deslocamento.

Posição, visibilidade, recolhimento e trava são salvos por conta e faixa de largura em `localStorage`, neste navegador. JSON inválido é ignorado. O redimensionamento mantém os painéis dentro da tela, e telas estreitas usam uma disposição própria. Em telas baixas, o chat e as ações ficam compactos e painéis secundários podem ser reabertos pelo menu. Resenhar e Enter reabrem o chat mesmo se ele estiver oculto.

O movimento permanece por teclado. Arrastar painéis não gira a câmera. Modais mantêm foco e navegação por teclado, e a interface respeita a preferência por movimento reduzido.

## Comandas / toasts

As notificações mantêm o formato da referência: canhoto colorido, linha perfurada, título, ícone ou inicial do remetente, fechamento e barra de duração. Há no máximo quatro avisos ativos. Avisos com o mesmo identificador são deduplicados enquanto estão na tela. Passar o mouse ou focar um aviso pausa tanto sua barra quanto sua expiração.

- **Recado no balcão:** mensagem recebida de outro jogador, respeitando proximidade e bloqueios.
- **No bar:** conexão, ações confirmadas no estado da sala, comandos e outras confirmações.
- **Fique de olho:** erros da API, do servidor ou da conexão.
- **Conquista:** compra concluída de uma skin e vitória confirmada no blackjack.

Textos de jogadores são inseridos como texto, inclusive nos toasts. HTML enviado pelo chat não vira marcação executável. Não existem mensagens automáticas demonstrativas. Sair do bar limpa os avisos da sessão anterior.

## Arquivos e verificação

`game-ui.ts` define as telas; `nova-ui.css` contém o tema e os estilos da comanda; `hud-panels.ts` controla o layout; `live-hud.ts` apresenta o estado; `notifications.ts` controla os avisos. `main.ts` continua conectando contas, API, multiplayer, modais e ações. `character.css` e `admin.css` usam a nova identidade.

Os testes de `tests/e2e/nova-ui.spec.ts` verificam arrastar, trava, persistência, armazenamento inválido, limites da tela, carteira, chat entre clientes, bloqueio de notificações, segurança do texto e o ciclo de vida das comandas. Os testes existentes cobrem contas, criação, roupas, skins, administração, moderação, mapa, blackjack, eventos, animações e `/velho`, em serviços e banco isolados.

A prévia de personagem pode ser fechada com modelos e texturas ainda carregando: a aplicação de prévia mantém o registro de assets até finalizar esses pedidos e então libera o motor. O painel administrativo bloqueia a edição durante buscas, impedindo que uma resposta atrasada recrie o formulário no meio de uma escolha de operação.

`npm run test:e2e` organiza os fluxos em três grupos de clientes locais para respeitar os limites de cadastro por endereço. Matchmaking e WebSocket passam pelo proxy de mesma origem do ambiente de testes. API, mundo, banco e fundos continuam isolados do desenvolvimento; os limites e as permissões de produção permanecem ativos.

Validação em 22/10/2026: os 14 testes de navegador passaram em 9,8 minutos; typecheck e build aprovados. Foram verificados os fluxos de administração, conta e recuperação, chat e reconexão, mapa e blackjack, roupas, skins, animações, `/velho`, organização dos painéis e comandas.

Prévias: [entrada](previews/nova-ui-lobby.png), [desktop](previews/nova-ui-desktop.png), [tela estreita](previews/nova-ui-mobile.png) e [comanda no jogo](previews/nova-ui-toast.png).
