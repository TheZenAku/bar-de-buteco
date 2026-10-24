# Estado da execução

- **Marco atual:** 0, baseline reproduzível. **Concluído** em 24/10/2026, na branch `marco-0/baseline` (ainda sem merge na `main`).
- **Ponto de partida:** `main` @ `76cfc5d` (auditoria em `54a4c66`, mais um commit só de documentação). A árvore estava limpa.

## O que foi feito

| Commit | Mudança |
| --- | --- |
| `994f96d` | Retira o laboratório Avatar V2 rejeitado do build e do produto ([ADR-001](DECISOES.md)) |
| `c2beaa9` | Fixture técnica no lugar da fonte Quaternius ausente ([ADR-002](DECISOES.md)) |
| `35f37e0` | Zod 4.6.7 único e body-parser 2.4.0 ([ADR-003, ADR-004](DECISOES.md)) |
| (este commit) | `docs/execucao/` |

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

## Próximo passo

Revisar e fazer o merge de `marco-0/baseline` na `main`. Depois disso, a próxima sessão inicia o **Marco 1** pela caracterização (testes) do ciclo de vida de `BarRoom` antes de qualquer extração.
