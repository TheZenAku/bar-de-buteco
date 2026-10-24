# Plano de execução

Fonte: [prompt mestre](../auditoria/PROMPT-MESTRE-CLAUDE.md) e [roadmap da auditoria](../auditoria/10-ROADMAP.md). Execute **um marco por sessão** e pare depois de apresentar a evidência. Cada marco só começa quando o anterior estiver concluído, com o critério verificável registrado em [TESTES.md](TESTES.md).

| Marco | Nome | Depende de | Situação |
| --- | --- | --- | --- |
| 0 | Baseline reproduzível | — | concluído (veja [ESTADO.md](ESTADO.md)) |
| 1 | Modularização e operação | 0 | não iniciado |
| 2 | Pipeline e performance | 1 | não iniciado |
| 3 | Framework universal de interação | 1 | não iniciado |
| 4 | Primeiro loop econômico | 3 | não iniciado |
| 5 | Seleção e implantação de um novo avatar | 2; aprovação visual do produto | não iniciado; **bloqueia a integração**: só segue depois da aprovação visual explícita |
| 6 | Social, moderação e acessibilidade | 3 | não iniciado |
| 7 | Beta | 1–6 | não iniciado |

## Escopo de cada marco

### Marco 0

- Retirar o laboratório Avatar V2 do build e do produto.
- Substituir a dependência do Quaternius nos testes por uma fixture.
- Corrigir os alertas altos de Zod e body-parser.
- Criar estes arquivos de continuidade.
- Não altera o gameplay.

### Marco 1

- Extrair interfaces e o ciclo de vida de cena, sala e app.
- Validar a configuração.
- Readiness, métricas e logs correlacionados.
- Outbox transacional para controles administrativos e estatísticas.
- Homologar o staging: Compose, PostgreSQL, backup/restore e SMTP.

### Marco 2

- Manifest de licença, glTF Validator, budgets e hashes.
- Publicação atômica.
- KTX2 e meshopt, conforme a medição.
- Carregamento essencial e opcional.
- Perfis de qualidade, LOD e throttling de animação.

### Marco 3

Uma definição orientada a dados para porta, cadeira, balcão, jukebox, TV e banheiro, com reservas (owner, TTL e cancelamento). Uma interação migrada por vez.

### Marco 4

Trabalho no balcão (3–5 min), com recompensa idempotente feita no servidor, sinks e telemetria. Sem dinheiro real.

### Marco 5

- Bake-off de até três candidatos gratuitos, com licença comercial clara, dentro do BarBoteco.
- **Parar e pedir aprovação visual.**
- Só então: POC do vencedor e migração por feature flag.
- Depois da paridade, excluir o Avatar V2 e o Quaternius, junto com seus assets.

### Marco 6

- Celular mínimo e fluxo de denúncia e moderação.
- Retenção e exclusão de dados.
- Controle, touch e remapeamento.
- Redução de movimento e contraste.

### Marco 7

- Soak de 2 h e carga com 16, 32 e 48 jogadores.
- Simulação de falhas e backup/restore.
- Alertas, runbooks e SLO.
- Release apenas sem P0/P1 aberto.
