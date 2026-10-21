# B.A.R. — Bar de Buteco

MVP de um boteco social 3D para navegadores desktop: contas, mundo multiplayer, conversa por proximidade, interações, blackjack, NPCs, três eventos e moderação. Interface em português, cenário procedural em escala real e jogadores com modelo 3D animado. Não há apostas, dinheiro real nem prêmios.

## Abrir o projeto

Requer **Node.js 24** e npm. Na raiz:

```sh
npm install
npm run seed -w @bar/api
npm run dev
```

No Windows, se o PowerShell bloquear `npm.ps1`, use **`npm.cmd`** nos comandos acima. Abra **http://localhost:5173**.

O seed é opcional: cria contas confirmadas para testar rapidamente. Execute antes de iniciar a API. O PostgreSQL embutido permite um único processo usando o diretório de dados.

| Conta local | E-mail | Senha padrão |
| --- | --- | --- |
| Administração | `admin@bar.local` | `ButecoDemo2026!` |
| Chico | `jogador1@bar.local` | `ButecoDemo2026!` |
| Bia | `jogador2@bar.local` | `ButecoDemo2026!` |

`DEMO_PASSWORD` substitui a senha na criação. O seed não altera contas existentes e recusa execução em produção. Use duas janelas com **perfis separados ou modo anônimo**, uma conta em cada, para testar multiplayer. A mesma conta não pode ocupar duas vagas.

Também é possível criar uma conta pela tela inicial. Em desenvolvimento, novos cadastros são ativados automaticamente: basta entrar com o e-mail e a senha escolhidos. `AUTO_VERIFY_EMAIL=false` exige confirmação; em produção, a confirmação é exigida por padrão e `AUTO_VERIFY_EMAIL=true` habilita a ativação automática. A **Caixa de e-mail local** continua disponível em desenvolvimento para recuperar a senha ou confirmar cadastros quando essa exigência estiver habilitada. Essa caixa não existe em produção.

## Controles e atividades

| Controle | Ação |
| --- | --- |
| WASD | Caminhar, em relação à câmera |
| Shift | Correr |
| Arrastar o mouse / roda | Girar a câmera / ajustar distância |
| E | Usar o objeto próximo; levantar ao estar sentado |
| G | Dançar / parar |
| C | Escolher o visual (skin); todos veem a troca na hora |
| Enter | Abrir o chat de proximidade (12 m) |
| Esc | Fechar uma janela |

Chegue perto das cadeiras, do balcão, da jukebox ou da mesa para ver a interação. Na mesa, **Começar rodada** inicia blackjack para até quatro pessoas; **Comprar carta** e **Parar** são validados no servidor. O dealer para em 17, incluindo soft 17. Cada turno tem limite de 25 segundos. As estatísticas persistem na conta.

Apagão, frequentador inconveniente e festa são escolhidos pelo servidor entre 5 e 10 minutos, com duração de 30 a 90 segundos e sem repetição automática consecutiva. A administração pode iniciar eventos pelo botão de engrenagem. Eventos não alteram as regras nem cancelam rodadas.

O painel de pessoas permite bloquear mensagens e denunciar jogadores. A administração consulta denúncias e histórico, expulsa e bane contas. Banimento e redefinição de senha revogam sessões.

## Estrutura e execução

| Pasta | Responsabilidade |
| --- | --- |
| `apps/web` | Vite, PlayCanvas, interface, predição e reconciliação |
| `apps/api` | Fastify, contas, sessões, e-mails, moderação e estatísticas |
| `apps/server` | Colyseus, movimento autoritativo, AOI, NPCs, eventos e blackjack |
| `packages/shared` | Contratos, validação de movimento, colisões e tickets internos |
| `tests` | Navegador, contratos e simulação de carga |
| `infra` | PostgreSQL, migração SQL, Docker Compose e nginx |

A API usa a porta 3001; o jogo, 2567; o cliente, 5173. `.env.example` contém a configuração. Sem `DATABASE_URL`, os dados persistem em `.data/postgres` via PGlite (PostgreSQL embutido). `DATABASE_URL` ativa PostgreSQL nativo. Movimento, NPCs e rodadas ficam em memória; reiniciar o jogo reinicia esse estado.

Em produção, use PostgreSQL nativo, SMTP, HTTPS e um segredo aleatório. Veja [execução em Docker e configuração de produção](infra/README.md). Os arquivos de infraestrutura estão preparados, mas Docker e entrega SMTP externa não foram executados neste ambiente.

## Verificação

```sh
npm run build
npm test
npm run test:e2e
npm run test:load
```

Os testes de navegador usam as contas locais do seed, além de cadastros próprios. No Windows usam Edge instalado; em outros sistemas, execute `npx playwright install chromium`. `PLAYWRIGHT_CHANNEL` pode selecionar outro canal instalado. Não use contas reais nos testes. Cada execução cria contas de teste no banco de desenvolvimento; use um `DATA_PATH` separado para isolar os dados.

`test:load` cria API, PostgreSQL em memória e servidor isolados em portas aleatórias; não altera os dados do bar de desenvolvimento. O padrão é 32 clientes durante 30 segundos. Para duas horas, ajuste `LOAD_DURATION_MS=7200000`; para mudar a carga, ajuste `LOAD_CLIENTS`. O relatório sai em `test-results/load-report.json`.

Consulte [resultados e limites da validação](docs/validation.md), [arquitetura](docs/architecture.md), [rede](docs/networking.md) e [contratos de integração](docs/implementation-contract.md).

## Escopo da versão

Os sistemas funcionais do MVP estão implementados para execução local. O cenário (um salão de 20 × 14 m em escala real) e os NPCs são procedurais. Os jogadores escolhem entre três skins (`SKINS` em `packages/shared`), convertidas de `assets-bar` para `apps/web/public/models`: "Nathan", da Renderpeople, com caminhada própria e animação parada do Mixamo, "Leandro", gerado no Meshy AI sem esqueleto e ligado automaticamente ao esqueleto do Nathan para usar as mesmas animações, e "Rafael", com esqueleto próprio no padrão Character Creator / Unreal, para o qual as animações do Nathan foram redirecionadas a partir da T-pose do modelo. O jogo usa as animações da própria skin quando ela as traz, e as do Nathan nos demais casos. As miniaturas do seletor ficam em `apps/web/public/skins`. A escolha fica salva no navegador. Confira a licença desses assets antes de publicar. As sessões usam cookies HttpOnly; o servidor autoriza movimento, interações e cartas. A capacidade é configurável e a sala principal não cria mundos separados quando lota: a interface aguarda uma vaga.

Ficam para homologação do ambiente de publicação: o teste contínuo de duas horas, 30/60 FPS em hardware de referência, latência de rede real, operação do PostgreSQL nativo no Compose e entrega de e-mail SMTP. A expansão para 64+ jogadores não é uma capacidade comprovada desta versão.
