# Estado da execução

- **Marco atual:** 1, modularização e operação. **Em andamento** em 24/10/2026, na branch `marco-1/fundacao`.
- **Ponto de partida:** `main` @ `76cfc5d` (auditoria em `54a4c66`, mais um commit só de documentação). A árvore estava limpa.

## O que foi feito

| Commit | Mudança |
| --- | --- |
| `994f96d` | Retira o laboratório Avatar V2 rejeitado do build e do produto ([ADR-001](DECISOES.md)) |
| `c2beaa9` | Fixture técnica no lugar da fonte Quaternius ausente ([ADR-002](DECISOES.md)) |
| `35f37e0` | Zod 4.6.7 único e body-parser 2.4.0 ([ADR-003, ADR-004](DECISOES.md)) |
| `5ec574c` | Configuração, observabilidade e outbox transacional da API ([ADR-005, ADR-006](DECISOES.md)) |
| `7ba8df8` | Relay com lease/confirmação e outbox durável do mundo ([ADR-005](DECISOES.md)) |
| `2751179` | Volume persistente do outbox do mundo no Compose |
| (árvore atual, ainda sem commit) | Lifecycle de admissão, contrato único da cena e registro de sessões da sala ([ADR-007](DECISOES.md)); segredos separados, Node 24, smoke PostgreSQL e restore verificável ([ADR-008, ADR-009](DECISOES.md)); CI separada, política explícita de scripts de dependências e testes de toast determinísticos ([ADR-010](DECISOES.md)); runner de migração explícito e papéis PostgreSQL separados ([ADR-011](DECISOES.md)) |
| (limpeza, sem commit) | Remove o Avatar V2, o protótipo `ui-marrom`, o tema visual anterior e duplicatas; reorganiza `docs/` e `tools/` por assunto ([ADR-012](DECISOES.md)) |

## Critérios de aceite do Marco 0

| Critério | Situação | Evidência |
| --- | --- | --- |
| `npm ci` em clone limpo | passou | [TESTES.md](TESTES.md) |
| `npm run build` em clone limpo | passou | idem; 2 avisos do Vite registrados |
| `npm test` em clone limpo | passou: 22 + 19 + 51 + 26 | idem |
| Zero vulnerabilidade alta ou crítica | passou: `npm audit` com 0, inclusive dev | idem |
| Diff sem artefatos temporários | passou: as capturas regeneradas pelos E2E em `docs/previews/` foram restauradas antes do commit | `git status` limpo |
| Gameplay inalterado | passou em produção; em dev, o avatar passa a ser o mesmo de produção | E2E `game` e `interface` 9/9 |
| Animações sem licença fora do artefato | parcial: nada do Avatar V2 no `dist`; as outras animações FBX continuam com licença não verificada | LEG-01 em [PROBLEMAS.md](PROBLEMAS.md) |

## Rollback

Os commits são independentes e a reversão não é destrutiva:

- `git revert 35f37e0` volta as dependências e o lockfile;
- `git revert c2beaa9` volta o teste anterior, que depende da fonte ausente;
- `git revert 994f96d` restaura o laboratório.

Também é possível simplesmente não fazer o merge da branch.

As mudanças mais recentes do Marco 1 ainda estão somente na árvore de trabalho, portanto não existe hash para revertê-las. A reversão deve ser feita por commits pequenos depois da revisão, usando `git revert`; as fachadas `BarScene`, `BarRoom` e `main.ts` foram preservadas justamente para permitir que cada extração seja revertida sem migração de dados. Migrações aplicadas não são editadas nem desfeitas de modo destrutivo: uma versão anterior já adaptada inicia com o schema expandido, enquanto uma versão anterior ao ADR-011 exige a credencial bootstrap temporária descrita no [runbook](../../infra/README.md#rollback-de-implantação).

## Próximo passo

Executar o [runbook](../../infra/README.md) em um host com Docker: volume novo e upgrade ensaiado de volume existente, papéis/negação de DDL, concorrência do migrador, Compose, Mailpit/SMTP e backup seguido de restore-check. A separação de código e configuração entre owner, migrador e runtime está implementada, mas a execução externa ainda não ocorreu.

Antes de encerrar o marco, ainda é obrigatório homologar Compose/PostgreSQL/SMTP e backup/restore em um host com Docker. Este host não possui o comando `docker`; portanto essa validação não foi simulada nem declarada como concluída.
