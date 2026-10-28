# B.A.R. — Bar de Buteco

MVP de um boteco social 3D para navegadores desktop: contas, mundo multiplayer, conversa por proximidade, interações, blackjack, NPCs, três eventos e moderação. Interface em português, mapa BarBoteco com rua, varanda, dois andares e escada, e jogadores com modelo 3D animado. Não há apostas, dinheiro real nem prêmios.

## Abrir o projeto

No Windows, também é possível abrir **`tools/iniciar.bat`** com dois cliques. Use `tools/reiniciar.bat`, `tools/parar.bat` e `tools/status.bat` para controlar os serviços. Consulte [os iniciadores do Windows](tools/README.md) para logs e diagnóstico.

Requer **Node.js 24** e **npm 11.20.x** (a mesma versão fixada na CI e nas imagens). Na raiz:

```sh
npm install
npm run seed -w @bar/api
npm run dev
```

No Windows, se o PowerShell bloquear `npm.ps1`, use **`npm.cmd`** nos comandos acima. Abra **https://localhost:5173** (o navegador avisa sobre o certificado próprio na primeira visita: clique em *Avançado* e continue; o HTTPS é o que libera o microfone do chat de voz).

O seed é opcional: cria contas confirmadas para testar rapidamente. Execute antes de iniciar a API. O PostgreSQL embutido permite um único processo usando o diretório de dados.

| Conta local | E-mail | Senha padrão |
| --- | --- | --- |
| Administração | `admin@bar.local` | `ButecoDemo2026!` |
| Chico | `jogador1@bar.local` | `ButecoDemo2026!` |
| Bia | `jogador2@bar.local` | `ButecoDemo2026!` |

`DEMO_PASSWORD` substitui a senha na criação. O seed preserva senhas e permissões existentes, prepara a coleção de skins das contas de demonstração e recusa execução em produção. Use duas janelas com **perfis separados ou modo anônimo**, uma conta em cada, para testar multiplayer. A mesma conta não pode ocupar duas vagas.

Também é possível criar uma conta pela tela inicial. Em desenvolvimento, novos cadastros são ativados automaticamente e entram direto na partida. `AUTO_VERIFY_EMAIL=false` exige confirmação antes da partida; em produção, a confirmação é exigida por padrão e `AUTO_VERIFY_EMAIL=true` habilita a ativação automática. A **Caixa de e-mail local** continua disponível em desenvolvimento para recuperar a senha ou confirmar cadastros quando essa exigência estiver habilitada. Essa caixa não existe em produção.

## Controles e atividades

O [ciclo de dia e noite](docs/sistemas/day-night.md) completa um dia em **40 minutos reais**, com horário sincronizado pelo servidor, sol e lua móveis, sombras, iluminação externa automática e névoa para ocultar os limites do mapa.

O bar tem [som ambiente dinâmico](docs/sistemas/ambient.md): seis gravações discretas da cidade, em ordem aleatória sem repetição imediata e com transições suaves. Começa ao entrar; ajuste em **Configurações → Som ambiente** ou use o botão de som do topo. A jukebox reduz o ambiente automaticamente e o chat de voz mantém seus controles próprios.

Novas contas entram vestindo **Nathan**, a skin gratuita. **C** abre a coleção: Leandro, Rafael e Read são vendidos na loja, e a skin vestida fica salva na conta. O saldo inicial é zero; as moedas vêm do trabalho no bar (J). Veja [skins e coleção](docs/sistemas/skins.md).

| Controle | Ação |
| --- | --- |
| WASD | Caminhar, em relação à câmera |
| Shift | Correr |
| Arrastar o mouse / roda | Girar a câmera / ajustar distância |
| E | Usar o objeto próximo; levantar ao estar sentado |
| G | Dançar / parar |
| V | Acenar para o pessoal |
| I | Abrir ou fechar a mochila, usar itens e acessar a venda da casa |
| T | Sentado à mesa: pedir comida e bebida ao Tonico |
| J | Trabalhar no bar (Ajudante do Magrão) e ganhar moedas |
| C | Escolher o visual (skin); todos veem a troca na hora |
| X | Golpe de karatê exclusivo da skin Rafael (em pé e sem outra interação) |
| Enter | Abrir o chat de proximidade (12 m) |
| `/velho` no chat | Alternar bengala e caminhada lenta (0,475 m/s); repita para voltar ao normal |
| Esc | Fechar uma janela |

Chegue perto das cadeiras, do balcão, da jukebox ou da mesa para ver a interação. Na mesa, **Começar rodada** inicia blackjack para até quatro pessoas; **Comprar carta** e **Parar** são validados no servidor. O dealer para em 17, incluindo soft 17. Cada turno tem limite de 25 segundos. As estatísticas persistem na conta.

A **jukebox** e as **TVs** são independentes: cada uma com seu link do YouTube, controles, estado compartilhado e volume pela distância até ela. Na jukebox (encostada na parede, ao pé da escada) ou diante de uma TV, pressione **E**, cole um link e clique em **Tocar**. As três TVs do térreo passam sempre o mesmo vídeo; a do andar de cima tem o seu. O vídeo fica sempre na tela da TV, nunca num card no canto (**Assistir na TV** aproxima a câmera). A jukebox só toca o som, sem vídeo. Fechar os controles mantém a reprodução. Consulte [jukebox, TVs, limitações do YouTube e testes](docs/sistemas/jukebox.md).

As **portas** do mapa abrem e fecham com **E**, girando nas próprias dobradiças, sincronizadas para todos e com colisão que acompanha a folha; o personagem se vira para o objeto e estende a mão ao usar portas, jukebox e TVs. Veja [portas](docs/sistemas/doors.md). No balcão, escolha **long neck** ou **copo de chopp**: o Magrão cobra, o personagem espera o atendimento e bebe com o objeto real na mão. Veja [cerveja](docs/sistemas/drinks.md).

A **economia** usa moedas do jogo, sem dinheiro real. Sentado a uma mesa, aperte **T** e o **Tonico** busca o pedido no balcão e leva até você, por um caminho calculado no mapa. A jukebox, as TVs e o **telão do palco** cobram por vídeo novo, e o balcão cobra a bebida. Pedido cancelado volta para a carteira. As moedas vêm do emprego de **Ajudante do Magrão** (**J**), com poucas vagas, tarefas por estação e limite diário. A administração acompanha e ajusta tudo em **⚙ → Mundo ao vivo**. Veja [economia](docs/sistemas/economia.md). Os gráficos têm presets, resolução dinâmica, sombras, névoa e limite de FPS em **Configurações** ([gráficos](docs/sistemas/graficos.md)). O que falta da lista de funcionalidades e o plano estão em [funcionalidades](docs/projeto/funcionalidades.md).

O personagem tem **vida, fôlego, fome, sede, bexiga e embriaguez**, no painel **Seu Estado**. Correr cansa, a cerveja sobe (e enche a bexiga: use os banheiros com **E**), quem bebe demais ganha postura e caminhada próprias, cambaleia, apaga e se levanta antes de voltar ao normal; a galera leva quem exagerou para tomar um ar na calçada. Veja [necessidades](docs/sistemas/needs.md).

A **mochila persistente** reúne bebidas, comidas e curativos em pilhas, com atalhos no painel **Bolso**, loja, histórico e kit inicial. Compras, uso, descarte e perdas são validados no servidor e continuam salvos entre sessões. Abra com **I**. Veja [inventário](docs/sistemas/inventory.md).

O comando `/velho` mantém a skin. A bengala acompanha a mão direita e a caminhada usa a animação fornecida, com transição de 0,35 s. Shift mantém a velocidade de 0,475 m/s nesse modo. Outras ações continuam disponíveis; a bengala fica guardada durante dança, bebida, assentos e golpes. O estilo fica no estado da sala e sobrevive à reconexão; não modifica a skin salva na conta. Veja [a importação e a validação da bengala](docs/assets/old-cane.md).

Apagão, frequentador inconveniente e festa são escolhidos pelo servidor entre 5 e 10 minutos, com duração de 30 a 90 segundos e sem repetição automática consecutiva. A administração pode iniciar eventos pelo botão de engrenagem. Eventos não alteram as regras nem cancelam rodadas.

O painel de pessoas permite bloquear mensagens e denunciar jogadores. A administração consulta denúncias e histórico, expulsa e bane contas. Banimento e redefinição de senha revogam sessões.

O menu **⚙ Administração** também permite buscar jogadores e adicionar, remover ou definir moedas para testes. A conta principal `rafaelrodrigues-2017@hotmail.com` pode conceder e remover administradores pelo próprio jogo. Veja [permissões, carteiras e moderação](docs/sistemas/admin.md).

A interface segue a referência visual **Boteco Social**: seis painéis móveis, recolhíveis e ocultáveis, layout salvo por conta neste navegador, cores neon e notificações em formato de comanda. Carteira, coleção, pessoas, chat e interações usam os dados reais do jogo. Veja [interface e integração dos controles](docs/sistemas/interface.md).

## Estrutura e execução

| Pasta | Responsabilidade |
| --- | --- |
| `apps/web` | Vite, PlayCanvas, interface, predição e reconciliação |
| `apps/api` | Fastify, contas, sessões, e-mails, moderação e estatísticas |
| `apps/server` | Colyseus, movimento autoritativo, AOI, NPCs, eventos e blackjack |
| `packages/shared` | Contratos, validação de movimento, colisões e tickets internos |
| `tests` | Navegador (`e2e`, com o servidor isolado em `e2e/server.mjs`), integração, ferramentas e simulação de carga |
| `infra` | PostgreSQL, migração SQL, Docker Compose e nginx |
| `tools` | Iniciadores do Windows (`.bat`); `assets/` gera os arquivos do jogo a partir das fontes; `ops/` faz backup, restore e pseudônimos de log |
| `assets-bar` | Fontes dos assets (FBX, Blender, texturas, sons); não entra no build, os importadores de `tools/assets` publicam em `apps/web/public` |
| `docs` | Documentação por assunto; comece pelo [índice](docs/README.md) |

A API usa a porta 3001; o jogo, 2567; o cliente, 5173 (HTTPS, com o jogo em `/game` no mesmo endereço; `BAR_HTTPS=0` volta ao HTTP). Para jogar pela internet basta abrir a porta 5173. `.env.example` contém a configuração. Sem `DATABASE_URL`, os dados persistem em `.data/postgres` via PGlite (PostgreSQL embutido). `DATABASE_URL` ativa PostgreSQL nativo. Movimento, NPCs e rodadas ficam em memória; reiniciar o jogo reinicia esse estado.

Em produção, use PostgreSQL nativo, SMTP, HTTPS e segredos aleatórios distintos para tickets e tráfego interno. Veja [execução em Docker e configuração de produção](infra/README.md). Os arquivos de infraestrutura estão preparados, mas Docker e entrega SMTP externa não foram executados neste ambiente.

## Verificação

```sh
npm run build
npm test
npm run test:e2e
npm run test:load
```

Os testes de navegador iniciam serviços isolados nas portas 3111/2677/5273, preparam contas de demonstração e usam `.local/e2e/postgres`, sem alterar o banco do bar de desenvolvimento. As contas criadas nessa execução recebem saldo de teste para exercitar compras. No Windows usam Edge instalado; em outros sistemas, execute `npx playwright install chromium`. `PLAYWRIGHT_CHANNEL` pode selecionar outro canal instalado. Não use contas reais nos testes.

Capturas automáticas vão para `test-results/previews` e não alteram a documentação. Para atualizar deliberadamente a galeria rastreada, execute os E2E com `UPDATE_PREVIEWS=1` (no PowerShell: `$env:UPDATE_PREVIEWS='1'` antes do comando) e revise as imagens antes do commit.

`test:load` cria API, PostgreSQL em memória e servidor isolados em portas aleatórias; não altera os dados do bar de desenvolvimento. O padrão é 32 clientes durante 30 segundos. Para duas horas, ajuste `LOAD_DURATION_MS=7200000`; para mudar a carga, ajuste `LOAD_CLIENTS`. O relatório sai em `test-results/load-report.json`.

Consulte [resultados e limites da validação](docs/validacao/validation.md), [arquitetura](docs/arquitetura/architecture.md), [rede](docs/arquitetura/networking.md) e [contratos de integração](docs/arquitetura/implementation-contract.md).

As animações de `assets-bar/anim`, seus usos e a conversão para os modelos estão descritos em [animações](docs/assets/animations.md). Para regenerar os bancos GLB, execute `npm run assets:animations`.

Cada skin mantém seu esqueleto nativo, com calibração própria de pose e ossos auxiliares. Para recalibrar os modelos existentes e regenerar todos os clipes, execute `npm run assets:retarget`. Veja [esqueletos nativos e adaptação de animações](docs/assets/native-rigs.md).

O cenário e suas colisões vêm de `assets-bar/map/BarBoteco/export`. Para atualizar os arquivos usados pelo jogo, execute `npm run assets:map`. Veja [integração do mapa](docs/assets/map.md) para pisos, escada, nascimento, câmera e pontos de interação.

## Escopo da versão

Os sistemas funcionais do MVP estão implementados para execução local. O cenário é o mapa BarBoteco importado integralmente, com rua, varanda, dois pavimentos e escada. Tonico, o dealer e o Magrão (bartender) usam modelos animados. Os jogadores começam com Nathan, gratuito, e podem adquirir Leandro, Rafael, Read e Gilmar na loja (`SKINS` em `packages/shared`). Cada personagem tem seu próprio esqueleto Mixamo, auto-rigado no próprio corpo. Os bancos de animação são adaptados a cada modelo. As miniaturas ficam em `apps/web/public/skins`; a coleção e a skin vestida ficam salvas na conta. Confira a licença de cada asset antes de publicar. As sessões usam cookies HttpOnly; o servidor autoriza aparência, movimento, interações e cartas. A capacidade é configurável e a sala principal não cria mundos separados quando lota: a interface aguarda uma vaga.

Ficam para homologação do ambiente de publicação: o teste contínuo de duas horas, 30/60 FPS em hardware de referência, latência de rede real, operação do PostgreSQL nativo no Compose e entrega de e-mail SMTP. A expansão para 64+ jogadores não é uma capacidade comprovada desta versão.

O **chat de voz por proximidade** (até 15 m, áudio posicional, microfone em **M** ou segurando **B**) e os volumes do jogo ficam em **Configurações**. Veja [chat de voz](docs/sistemas/voice.md).

Para reimportar as skins (cada personagem com seu esqueleto Mixamo) e seus bancos de animação, execute `npm run assets:skins`. Veja [skins Mixamo](docs/assets/skins-mixamo.md).
