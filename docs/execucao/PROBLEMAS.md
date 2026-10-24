# Problemas, riscos e bloqueios

Prioridade: P0 bloqueia a publicação; P1 deve ser resolvido antes do beta; P2 é melhoria. IDs `ENG-`, `SEC-`, `LEG-` etc. vêm da [auditoria](../auditoria/02-PROBLEMAS-E-RISCOS.md).

## Resolvidos no Marco 0

| ID | Problema | Resolução |
| --- | --- | --- |
| ENG-01 | Build com 11 TS2339 em testes do laboratório Avatar V2 | Laboratório retirado do build e do produto (ADR-001) |
| ENG-02 | Teste de roupas com ENOENT na fonte Quaternius ausente | Fixture de contagem com procedência (ADR-002) |
| SEC-01 | Zod `<4.6.6` (alto) | Zod 4.6.7 único (ADR-003) |
| SEC-02 | body-parser 2.0–2.3 (alto) | body-parser 2.4.0 (ADR-004) |

## Abertos

| ID | Prioridade | Problema | Dono sugerido | Próxima ação |
| --- | --- | --- | --- | --- |
| LEG-01 | P0 legal | Licença não verificada das animações FBX, inclusive as publicadas em `apps/web/public/animations` e nos bancos das skins | produto/legal | Manifest de licença (Marco 2); sem release enquanto não for resolvido |
| ART-01 | P0 direção | O personagem personalizado de produção ainda usa o corpo base do Quaternius (CC0, mas rejeitado artisticamente) | produto+arte | Marco 5: bake-off, aprovação visual e só então a migração |
| DEBT-01 | P2 | `BAR_Avatar_V2/` continua no repositório (295 arquivos rastreados; 556 MB no disco local, incluindo arquivos não rastreados). Não entra no build | Dev A | Excluir no Marco 5, com a migração (prompt mestre, Marco 5) |
| DEBT-02 | P2 | Os testes de roupa validam o GLB publicado, mas reimportar exige a fonte do kit, que não está mais no repositório | Dev A | Ao trocar o avatar, a fixture deixa de ser necessária; até lá, medir de novo se o GLB for reimportado |
| BUILD-01 | P2 | O Vite avisa que `vite.config.ts` importa `./http-redirect` sem extensão, o que não será suportado quando `configLoader: 'native'` virar o padrão | Dev A | Ajustar no Marco 1 (config validada) |
| BUILD-02 | P1 | Bundle JS principal acima de 1 800 kB depois de minificado (aviso do Vite) | Dev A | Code-splitting e carregamento por fases (Marco 2) |
| OPS-02 | P2 | O npm 11 não executa scripts de instalação sem aprovação (`esbuild` postinstall, `msgpackr-extract`). Build e testes passaram assim no clone limpo (verificado). NÃO VERIFICADO: o impacto de desempenho de o `msgpackr` rodar sem a extensão nativa | Dev B | Decidir no Marco 1 se aprova os scripts na CI (`npm install-scripts approve`) e medir o impacto |
| ENV-01 | P2 | Este host usa Node 26.12.1; a baseline da auditoria fala em Node 24 e o `engines` aceita `>=22` | Dev B | Fixar a versão da CI/produção (`.nvmrc`/`engines`) no Marco 1 |
| QA-02 | P2 | `nova-ui.spec.ts:60` ("comanda notices") é instável sob carga de CPU: o `hover` espera a animação de entrada e um aviso de 1 s expira antes. Passou 3/3 isolado e 9/9 na rodada sem carga | Dev A | Tornar o teste independente do relógio real (relógio controlado no fixture) sem afrouxar a asserção |
| QA-03 | P2 | Os E2E sobrescrevem capturas rastreadas em `docs/previews/`, sujando a árvore a cada execução | Dev A | Gerar as capturas fora do repositório, ou só sob uma flag explícita (Marco 1) |
| PERF-01 | P1 | `apps/web/dist` tem 109 MB; o mapa sozinho, 16,37 MiB | Dev A | Marco 2 |
| OPS-01, REL-01, QA-01, GAME-01, ARC-01 | P1 | Veja a auditoria | — | Marcos 1–4 |
