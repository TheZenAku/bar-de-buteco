# Últimos resultados de teste

Registre aqui a última execução de cada suíte: ambiente, commit e resultado. Não registre execução que não aconteceu.

## Ambiente (Marco 0, 24/10/2026)

- Windows 10 Pro 10.0.19045.
- Node 26.12.1, npm 11.20.0.
- Microsoft Edge (Playwright, canal `msedge`) com SwiftShader.
- Banco isolado de E2E em `.local/character-e2e` (`tools/e2e-server.mjs`, portas 3111, 2677 e 5273). O banco local ativo não foi usado.

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
