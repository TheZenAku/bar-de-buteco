# Últimos resultados de teste

Registre aqui a última execução de cada suíte: ambiente, commit e resultado. Não registre execução que não aconteceu.

## Ambiente (Marco 0, 24/10/2026)

- Windows 10 Pro 10.0.19045.
- Node 26.12.1, npm 11.20.0.
- Microsoft Edge (Playwright, canal `msedge`) com SwiftShader.
- Banco isolado de E2E em `.local/character-e2e` (`tests/e2e/server.mjs`, portas 3111, 2677 e 5273). O banco local ativo não foi usado.

## Antes do Marco 0 — `main` @ `76cfc5d`

Reprodução da auditoria (`54a4c66` + um commit só de documentação).

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Build | `npm run build` | **falhou**: 11 × TS2339 em `tests/avatar-v2/avatar-v2.spec.ts` (`window.avatarV2Lab`) |
| API | `npm test` | 22/22 |
| Servidor | `npm test` | 19/19 |
| Integração | `npm test` | **50/51**: ENOENT em `assets-bar/Universal Base Characters[Standard]/…/Superhero_Male_FullBody.gltf` |
| Ferramentas | `npm test` | **não executou** (a falha anterior interrompe o script) |
| Dependências | `npm audit --omit=dev` | **2 altas**: Zod `<4.6.6` e body-parser 2.0–2.3 |

## Depois do Marco 0 — `marco-0/baseline` @ `35f37e0`

| Suíte | Comando | Onde | Resultado |
| --- | --- | --- | --- |
| Instalação | `npm ci` | clone limpo | ok |
| Typecheck e build | `npm run build` | clone limpo e árvore de trabalho | ok, com 2 avisos do Vite (BUILD-01, BUILD-02 em [PROBLEMAS.md](PROBLEMAS.md)) |
| API | `npm test` | clone limpo | 22/22 |
| Servidor | `npm test` | clone limpo | 19/19 |
| Integração | `npm test` | clone limpo | 51/51 |
| Ferramentas | `npm test` | clone limpo | 26/26 |
| Dependências | `npm audit --omit=dev` e `npm audit` | clone limpo e árvore | 0 vulnerabilidades |
| E2E focado | `npx playwright test --project=interface --project=game` | árvore | 9/9 (4,1 min) |

Detalhes do E2E focado:

- **Primeira rodada: 8/9.** Falhou `nova-ui.spec.ts:60` ("comanda notices…"): timeout no `hover` de um aviso de 1 s, que expirou durante a animação de entrada. A rodada coincidiu com o `npm ci` do clone limpo rodando em paralelo.
- **Mesmo teste isolado:** 3/3 com `--repeat-each=3`.
- **Segunda rodada completa, sem carga concorrente:** 9/9.
- **Diagnóstico:** instabilidade de tempo sob carga (QA-02), não regressão. Os arquivos que o teste exercita não foram alterados neste marco.
- **Escolha dos projetos:** `interface` (criador, preview e roupas) e `game` (contas novas entrando no mundo) cobrem o que mudou: o criador e o caminho de avatar do `BarScene`.

Não executado no Marco 0 (fora do escopo; veja [PLANO.md](PLANO.md)):

- os demais projetos E2E: `world`, `media`, `doors`, `ambient`, `environment` e `voice`;
- carga;
- Docker;
- celulares físicos.

## Marco 1 — `marco-1/fundacao` @ `2751179` + árvore de trabalho (24/10/2026)

Estas execuções locais também ocorreram no Windows com Node 26.12.1/npm 11.20.0. Node 24 é agora o alvo único em `.nvmrc`, `engines`, Docker e CI, mas o workflow remoto ainda não foi observado; por isso este documento não trata a execução local como prova de Node 24/Linux.

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Typecheck e build | `npm run build` | passou; ficou apenas BUILD-02 (bundle grande, Marco 2) |
| API | `npm test` | 33 aprovados; 1 smoke PostgreSQL ignorado sem `TEST_DATABASE_URL` |
| Migrações PGlite (focado) | `tsx --test test/migrations.test.ts` no workspace API | 5/5: conexão runtime sem DDL; reaplicação vazia; checksum; rollback do lote; baseline legado incompleto recusado; compatibilidade futura/lacuna |
| Typecheck API após MIG-01 | `npm run typecheck -w @bar/api` | passou |
| Infra PostgreSQL (focado) | `node --test tests/tools/infra.test.mjs` + parse do shell | 3/3 e sintaxe de `010-roles.sh` passaram; validação estática, sem executar Docker/PostgreSQL |
| Servidor | `npm test` | 32/32 |
| Integração | `npm test` | 56/56 |
| Ferramentas | `npm test` | 33/33 |
| E2E de cancelamento da entrada | `npx playwright test tests/e2e/bar.spec.ts --project=world --grep "leaving while admission"` | 1/1 |
| E2E determinístico de toast | `npx playwright test tests/e2e/nova-ui.spec.ts --project=interface --grep "comanda notices" --repeat-each=10` | 10/10 |
| Carga padrão | `npm run test:load` | 32 clientes/30 s, 0 falhas; entrada 910 ms, RTT p50 3 ms/p95 25 ms, event loop p95 29,98 ms |
| Dependências | `npm audit --omit=dev` e `npm audit` | 0 vulnerabilidades |
| Binários sem scripts de instalação | `npm install-scripts ls --json` + execução de Argon2, esbuild e msgpackr-extract | nenhuma pendência após negação explícita; hash/verify, esbuild 0.28.2 e `extractStrings` nativo passaram |
| PostgreSQL 17 nativo | `npm run test:postgres -w @bar/api` | **não executado localmente:** teste ignorado sem `TEST_DATABASE_URL`; job de CI criado e ainda não observado |
| Topologia da CI/Docker | inspeção de `.github/workflows/ci.yml` e Dockerfile | `verify`, `e2e`, `load` e `postgres-smoke` independentes; todos os jobs e estágios Docker instalam npm 11.20 antes de `npm ci`; workflow ainda não observado no GitHub Actions |
| Compose/PostgreSQL/SMTP/backup | `docker ...` | **não executado:** comando `docker` ausente neste host |

O build acima também verifica a migração do Fastify para `LogController`, o import ESM explícito do helper do Vite e o contrato único da cena. A última rodada integral tinha 154 testes aprovados; depois dela, os 5 testes focados do runner também passaram, mas a suíte integral ainda precisa ser repetida antes de somar esse novo conjunto ao baseline. As coberturas incluem configuração inválida, segredos separados, readiness, métricas protegidas, correlação, leases/reentrega/dead letter, persistência/replay do outbox, nonces, takeover/reconnect, lifecycle de admissão, bootstrap do Compose, caminhos de preview, backup/restore e invariantes de migração. O E2E segura `/api/blocks`, volta ao lobby durante a entrada e prova que a conclusão antiga não conecta o jogador depois.

## Toasts essenciais, TVs agrupadas e jukebox na parede — `marco-1/fundacao` @ `ad40761` + árvore de trabalho (27/10/2026)

Mesmo ambiente local (Windows, Edge com SwiftShader). Para separar regressão de instabilidade antiga, os E2E que falharam também rodaram em `ad40761`, sem estas mudanças.

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Typecheck e build | `npm run build` | passou |
| API / Servidor / Integração / Ferramentas | `npm test` | 42 (+1 ignorado) / 32 / 58 / 35 |
| E2E `environment` | `npx playwright test --project=environment` | 3/3. O fixture `environment.html` não aplicava a câmera (`onMediaFrame` fora dos callbacks), e a falha da névoa vinha daí |
| E2E `media` (dublês) | `--project=media -g "API double\|unreachable"` | 3/3, incluindo o novo teste do grupo de TVs |
| E2E `media` (YouTube real) | `--project=media -g "real YouTube"` | **falhou nas duas árvores**: entradas sem confirmação e interação ausente sob carga. Em `ad40761` falha ainda antes, ao chegar à jukebox |
| E2E `interface` | `--project=interface` | 5/6. `ad40761` ficou em 3/6. `clothing.spec` falha nas duas |
| E2E `world` + `doors` | `--project=world --project=doors` | `inventory.spec` passou depois de esperar o fim da ação antes de descartar. **Falham também em `ad40761`:** `bar.spec:86` (`cartRenders` 2 ≠ 1), recuperação de senha (timeout no clique) e `doors.spec` (rótulo "Sentar" após fechar a porta) |

Não executados: `game`, `ambient`, `voice` e carga.

## Economia, Tonico, empregos, telão e gráficos — `marco-1/fundacao` @ `ad40761` + árvore de trabalho (27/10/2026)

Mesmo ambiente local (Windows, Edge com SwiftShader). Escopo em [economia](../sistemas/economia.md), [gráficos](../sistemas/graficos.md) e [funcionalidades](../projeto/funcionalidades.md).

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Typecheck e build | `npm run build` | passou (mesmo aviso de tamanho de chunk do Vite) |
| API / Servidor / Integração / Ferramentas | `npm test` | 43 (+1 ignorado) / 40 / 58 / 35, nenhuma falha. Novos: `wallet.test`, `economy.integration.test`, `navigation.test`, `waiter.test`, `jobs.test` |
| E2E `economy` (novo, projeto `world`) | `npx playwright test tests/e2e/economy.spec.ts` | 1/1 |
| E2E `admin` | `npx playwright test tests/e2e/admin.spec.ts` | 2/2, depois de desligar a resolução dinâmica do preset Alto. Com ela ligada falhou 3/3 (a janela de 350 ms do painel ocupado não era observada); com o cliente anterior, 1/1 |
| E2E completo | `npx playwright test` | Executado uma vez, em paralelo com outras suítes. Além das falhas antigas listadas acima (`bar.spec:86`, recuperação de senha, `clothing.spec`, `doors.spec`), falharam `bar.spec:249`, `bar.spec:297` e `voice.spec` |
| A/B de `bar.spec:249`, `bar.spec:297` e `voice.spec` | mesmas specs com `main.ts`/`game-ui.ts` revertidos às versões anteriores | **falham igual nas duas versões do cliente**, nas mesmas linhas. O log do mundo mostra `maintenance_retry` e `auth_refresh_unavailable` (as chamadas internas à API estouram 4 s sob a carga de dois navegadores em WebGL por software), sem expulsão nem erro do servidor. Os projetos `game` e `voice` não tinham execução anterior registrada. O servidor anterior não foi testado nesse A/B |

Não executados: carga e a suíte E2E completa depois das últimas correções.

## Bots de desempenho — `marco-1/fundacao` @ `15bd316` + árvore de trabalho (28/10/2026)

`npm run bots` ([`tests/load/bots.ts`](../../tests/load/bots.ts)) contra a stack isolada (`tests/e2e/server.mjs`), com a stack de desenvolvimento do usuário ligada na mesma VM. Os números do mundo vêm do `/metrics`; o FPS é de um Edge headless com GPU (`--use-angle=d3d11`), não do navegador do usuário.

| Suíte | Comando | Resultado |
| --- | --- | --- |
| 30 bots, 3 min | `API_INTERNAL_URL=http://127.0.0.1:3111 BOTS_WORLD_URL=http://127.0.0.1:2677 BOTS_SECONDS=180 npm run bots -- 30` | 30/30 no bar; tick do mundo p95 0,7 ms parado e ~2,4 ms com os bots ativos; RTT p50 1 ms / p95 ≤ 7 ms. Pelo log do mundo: 9 shows no palco (os 4 instrumentos), 9 pedidos entregues pelo Tonico, 7 turnos de trabalho; os 30 avatares saíram ao final |
| Cliente com 30 bots | o mesmo, com um jogador no Edge | 62–63 FPS antes dos bots; 57–63 FPS com 28 personagens no raio de visão |
| Painel: Bots de teste | admin de demonstração na stack isolada, pelo SDK e pelo Edge | `admin.bots` acima da capacidade recusado com a mensagem; 10 → 15 → 5 → 0 bots seguiram o pedido, os que saíram levaram o avatar e o processo filho terminou com código 0; no Edge, Aplicar 12, +5 e Remover todos, com o painel atualizado sozinho e sem erros na página. Matando o mundo à força, o processo dos bots saiu junto |
| Servidor (depois do painel) | `npm run test -w @bar/server` | 52/52 (novo: `bots.test`, nunca em produção) |
| Servidor / API | `npm run test -w @bar/server`, `npm run test -w @bar/api` | 51/51 e 45 (+1 ignorado), nenhuma falha. Novos: `dev-bots.test` (API) e o bot que leva o avatar ao sair, em `room.integration.test` |

## Mesas, Tonico, ajudante, decoração e sombras — `marco-1/fundacao` @ `bbd50d9` + árvore de trabalho (28/10/2026)

Escopo em [economia](../sistemas/economia.md), [dia e noite](../sistemas/day-night.md) e [objetos do bar](../sistemas/drinks.md).

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passou (API, servidor, web, shared e raiz) |
| Servidor | `npm run test -w @bar/server` | 58/58. Novos: consumo aos poucos e recolhimento (`served.test`), mesas só quando sujas e pedido do ajudante (`jobs.test`), Tonico recolhendo mesa (`waiter.test`), terraço de qualquer ponto e busca em fatias (`navigation.test`); `economy.integration.test` com levantar recusado, cancelar no balcão e o fluxo completo de pedido ao ajudante |
| Integração / Ferramentas | `tsx --test tests/integration/*.test.ts`, `node --test tests/tools/*.test.mjs` | 66/67 e 26/26. A falha é `map.test` (mapa publicado igual ao export): o export do BarBoteco foi refeito às 20:57 e ainda não foi importado com `npm run assets:map` |
| Rota do Tonico | script com 24 pontos de partida em volta do balcão para cada lugar de cada mesa | antes: 2/12 falhas no salão de cima e 7/12 no terraço (mesas 34–39); depois: 0 falhas em 96 buscas por mesa; terraço de ~1,4 s para 0,2–0,4 s |
| Sombras e decoração | capturas da página `tests/fixtures/environment.html` no Edge com GPU | meio-dia: rua, árvores, postes, carros e pessoas com sombra do sol (antes tudo na sombra do domo do céu); interior à noite: sombra de contato sob os personagens, sem sombras fantasmas depois de saírem; geladeiras, estufa e balcão com os objetos reais |

Não executados: E2E com Playwright e carga.

## Animações do bar e mapa novo — `marco-1/fundacao` @ `bbd50d9` + árvore de trabalho (28/10/2026, noite)

Escopo em [animações do bar](../sistemas/animacoes-bar.md): o export do BarBoteco das 20:57 (`Mictorio_Lugar_*`, `Balcao_Lugar_Magrao`, `Balcao_Entrega`, `Copo_Bandeja`, `Freezer_Bar_Tampa`) e `animacoes_bar.js` portado para PlayCanvas.

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Import do mapa | `npm run assets:map` | 124 assentos (cada um com a sua instância de cadeira), 39 mesas, 7 GLBs de animação publicados, 20 clipes validados |
| Typecheck | `npm run typecheck` | passou (API, servidor, web, shared e raiz) |
| Todas as suítes | `npm test` | API 45 (+1 ignorado), servidor 60/60, integração 73/73, ferramentas 26/26. Novos: `bar-animations.integration.test` (mictório, levantar, cigarro, Magrão e vômito por WebSocket), `bartender.test` reescrito, `tests/integration/bar-animations.test`. `map.test` voltou a passar com o mapa importado |
| E2E das animações | `npx playwright test --project=bar-animations` | 2/2 (50 s): todas as ações em seis skins na página de fixture, sem erros nem avisos no console; ao vivo, F acende e apaga pelo servidor e o painel F8 responde |
| E2E dos músicos (retarget movido para `mixamo-retarget.ts`) | `npx playwright test --project=environment --grep "stage musicians"` | 1/1 |
| Capturas | fixture no Vite do usuário, Edge com GPU | cadeira puxada 40 cm e de volta, sentado comendo com o garfo, levantando ao lado da cadeira, mictório, fumaça, vômito com poça, caído, pano na quina da mesa, Magrão na chopeira (copo da bandeja escondido), long neck com a tampa do freezer e o chopp deixado no balcão |

Corrigido junto: ao terminar **Limpar a mesa N**, a próxima tarefa podia ser a mesma mesa e trocava sozinha sem avisar o ajudante (`jobs.test`, `economy.integration.test`).

Não executados: carga, bots ao vivo (que agora também fumam e usam o mictório) e a suíte E2E completa.

Depois (29/10, madrugada): idle e andar do módulo no lugar dos do jogo, câmera do mictório e jato mais visível. `npx playwright test --project=bar-animations`: 3/3, com um teste novo ao vivo que anda até o mictório, aperta E e confere `urinar`, o jato, e o andar (`Bar andar_loop`, ritmo 1,5–2,2×) e o idle (`Bar parado_loop`) do módulo. A caminhada até o banheiro pelo helper `walk.ts` encalhou numa quina de mesa em 4 de 7 execuções, também com o andar novo desligado (A/B); o teste repete só a caminhada (até 2 vezes).
