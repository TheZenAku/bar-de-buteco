# Problemas, riscos e bloqueios

Prioridade: P0 bloqueia a publicação; P1 deve ser resolvido antes do beta; P2 é melhoria. IDs `ENG-`, `SEC-`, `LEG-` etc. vêm da [auditoria](../auditoria/02-PROBLEMAS-E-RISCOS.md).

## Resolvidos no Marco 0

| ID | Problema | Resolução |
| --- | --- | --- |
| ENG-01 | Build com 11 TS2339 em testes do laboratório Avatar V2 | Laboratório retirado do build e do produto (ADR-001) |
| ENG-02 | Teste de roupas com ENOENT na fonte Quaternius ausente | Fixture de contagem com procedência (ADR-002) |
| SEC-01 | Zod `<4.6.6` (alto) | Zod 4.6.7 único (ADR-003) |
| SEC-02 | body-parser 2.0–2.3 (alto) | body-parser 2.4.0 (ADR-004) |

## Resolvidos no Marco 1

| ID | Problema | Resolução |
| --- | --- | --- |
| BUILD-01 | Import sem extensão no `vite.config.ts` | Import ESM explícito `./http-redirect.js`; build sem o aviso |
| OPS-03 | Healthchecks não distinguiam dependência persistente de sala criada sob demanda | API usa `/api/ready`; o mundo usa `/health` no bootstrap para não bloquear a criação preguiçosa da sala e mantém `/ready` para monitoramento após ela existir |
| VOICE-01 | Nginx de produção negava o microfone inclusive para a própria origem | `Permissions-Policy` permite `microphone=(self)` |
| APP-01 | Sair durante o carregamento podia permitir que a continuação antiga conectasse rede e microfone no lobby | Lifecycle com geração, cleanup idempotente, quatro testes puros e E2E com requisição retida |
| REL-01 | Retry de estatística/controle tinha janela volátil em crash | Controles usam lease/ack/dead letter; resultados usam outbox persistente e idempotência ([ADR-005](DECISOES.md)) |
| QA-03 | E2E sobrescrevia capturas rastreadas em toda execução | Capturas vão a `test-results/previews`; `UPDATE_PREVIEWS=1` é obrigatório para atualizar a galeria |
| SEC-03 | Uma chave servia para tickets, tráfego interno, métricas e logs | `AUTH_SECRET` e `INTERNAL_SECRET` fortes e distintos em produção ([ADR-008](DECISOES.md)) |
| ENV-01 | Runtime variava entre Node 24 e versões aceitas genericamente | Node 24 fixado em `.nvmrc`, `engines`, Docker e CI |
| OPS-02 | Scripts de instalação de três dependências estavam sem decisão explícita no npm 11 | `argon2`, `esbuild` e `msgpackr-extract` usam os binários pré-compilados no alvo suportado e seus scripts foram negados explicitamente; hash, build e extensão nativa passaram ([ADR-010](DECISOES.md)) |
| OPS-04 | Backup era uma instrução sem restore verificável | Scripts com checksum, caminho restrito, arquivos privados, publicação sem overwrite/remoção concorrente, restore temporário e cleanup defensivo ([ADR-009](DECISOES.md)) |
| QA-01 | CI reunia build, testes, E2E e carga em um único job de 15 minutos | Verificação, E2E, carga e smoke PostgreSQL agora têm jobs e limites independentes; evidências E2E e relatório de carga são artefatos separados |
| QA-02 | Teste de toast dependia de 1,2 s reais contra expiração de 1 s e falhava sob carga | Scheduler injetável e relógio virtual na fixture; pause/resume por ponteiro e foco passaram 10/10 sem espera real |
| DB-01 | O superuser `bar` também era a credencial normal da aplicação | Bootstrap idempotente cria owner sem login, migrador `NOINHERIT` e runtime sem DDL; Compose reserva `bar` a init/ops. A prova em PostgreSQL/Compose real continua coberta por ENV-02 ([ADR-011](DECISOES.md)) |
| MIG-01 | Startup da API aplicava DDL sem ledger, checksum ou lock | Runner explícito transacional, ledger imutável, validação estrutural, lock com espera limitada e gate one-shot antes da API ([ADR-011](DECISOES.md)) |
| GAME-02 | No trabalho, a imagem congelava a partir da segunda tarefa (ou de um segundo turno): o marcador recriado desenhava a malha do anel já liberada pelo PlayCanvas e cada quadro lançava erro. O selo do blip, um elemento HTML movido a cada quadro, também derrubava o FPS com a acessibilidade do navegador ativa. O cartão da tarefa ficava fixo no meio da tela | Um único marcador, movido e ocultado; selo desenhado em canvas só quando muda; a tarefa virou o painel **Turno** do HUD (arrastar, recolher, esconder e mostrar pelo botão do topo). E2E do turno real em `economy.spec.ts` e regressão do marcador em `environment.spec.ts` |

## Abertos

| ID | Prioridade | Problema | Dono sugerido | Próxima ação |
| --- | --- | --- | --- | --- |
| LEG-01 | P0 legal | Licença não verificada das animações FBX, inclusive as publicadas em `apps/web/public/animations` e nos bancos das skins | produto/legal | Manifest de licença (Marco 2); sem release enquanto não for resolvido |
| ART-01 | P0 direção | O personagem personalizado de produção ainda usa o corpo base do Quaternius (CC0, mas rejeitado artisticamente) | produto+arte | **Resolvido:** criador aposentado; só skins, com Nathan gratuito ([ADR-013](DECISOES.md)) |
| DEBT-01 | P2 | `BAR_Avatar_V2/` continuava no repositório (295 arquivos rastreados; 556 MB no disco local). Não entrava no build | Dev A | **Resolvido:** excluído antecipadamente ([ADR-012](DECISOES.md)) |
| DEBT-02 | P2 | Os testes de roupa validam o GLB publicado, mas reimportar exige a fonte do kit, que não está mais no repositório | Dev A | **Resolvido:** testes, fixture e roupas removidos com o criador ([ADR-013](DECISOES.md)) |
| BUILD-02 | P1 | Bundle JS principal acima de 1 800 kB depois de minificado (aviso do Vite) | Dev A | Code-splitting e carregamento por fases (Marco 2) |
| PERF-01 | P1 | `apps/web/dist` tem 109 MB; o mapa sozinho, 16,37 MiB | Dev A | Marco 2 |
| OPS-01 | P1 operacional | Homologação integral de staging ainda não ocorreu | DevOps | Executar as ações externas de ENV-02 e SMTP-01; DB-01/MIG-01 já estão implementados, mas entram nessa homologação |
| GAME-01 | P1 produto | O ganho normal de moedas continua zero | produto+gameplay | Implementar o primeiro loop econômico no Marco 4, sem inventar ganhos antes da telemetria |
| ARC-01 | P1 arquitetura | As primeiras fronteiras de lifecycle foram extraídas, mas `main.ts`, `BarScene` e `BarRoom` continuam hotspots | Dev A | Continuar extrações incrementais e caracterizadas nos Marcos 2–4 |
| ENV-02 | P1 operacional | Docker não está instalado/disponível neste host; Compose, PostgreSQL externo, SMTP e backup/restore ainda não foram homologados | DevOps | Executar a matriz de staging em host com Docker antes de concluir o Marco 1 |
| SMTP-01 | P1 operacional | SMTP/Mailpit e TLS de entrega ainda não foram exercitados no staging | DevOps | Executar cadastro, confirmação e recuperação pelo Compose com Mailpit e depois provedor real |
