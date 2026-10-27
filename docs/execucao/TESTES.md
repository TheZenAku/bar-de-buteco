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
