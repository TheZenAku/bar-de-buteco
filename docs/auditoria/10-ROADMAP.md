# Roadmap por vertical slices

Hipótese: 2 desenvolvedores, dedicação integral, IA como acelerador e revisão humana obrigatória. Estimativas são faixas de calendário, não promessa; recalibrar após cada marco.

## Fase 0 — recuperar o gate (1–2 semanas)

Objetivo: build, testes e CI reproduzíveis. Remover o laboratório Avatar V2 do gate padrão e planejar sua exclusão, eliminar a dependência da pasta Quaternius, substituir esses testes por fixtures técnicas neutras, atualizar dependências vulneráveis e registrar baseline. Aceite: build verde, todas as suítes básicas verdes em clone limpo, audit sem alto/crítico ou exceção documentada. Rollback: commits pequenos/lockfile anterior.

## Fase 1 — fundação modular e operação (2–4 semanas)

Extrair lifecycle de cena/app/sala, contratos versionados, config validada, readiness/métricas, outbox de controles/estatísticas e staging PostgreSQL. Não mudar gameplay observável. Aceite: testes de caracterização, crash/retry e restore; Compose homologado. Rollback por fachada antiga/feature flag.

## Fase 2 — performance e pipeline (3–5 semanas)

Manifest de licença, budgets, KTX2/meshopt, carregamento por fases, perfis de qualidade, LOD de avatar, importadores atômicos e testes físicos. Aceite: budgets medidos em desktop modesto e dois celulares; visuais aprovados; nenhum asset desconhecido no build candidato.

## Fase 3 — interação universal (2–4 semanas)

Extrair catálogo/reserva/cancelamento/feedback e migrar porta, cadeira, balcão, jukebox e banheiro. Aceite: concorrência de dois usuários, distância/parede, reconexão e input teclado/controle/touch. Rollback por adaptadores dos handlers atuais.

## Fase 4 — loop econômico jogável (3–5 semanas)

Primeiro emprego no balcão, recompensas idempotentes, sinks, telemetria e balanceamento inicial. Aceite: jogador novo entende e completa em ≤5 min; nenhuma duplicação sob retry; moedas têm ganho e gasto sem admin. Sem dinheiro real.

## Fase 5 — novo avatar aprovado visualmente (3–6 semanas)

Fazer bake-off de no máximo três assets gratuitos, começando pelos candidatos de `09-ASSETS-E-FERRAMENTAS.md`. Aprovar visualmente no mapa antes de programar a integração completa. Depois, adaptar rig, props/sockets, catálogo, serialização, roupas e LOD por feature flag. Aceite: licença verificada, identidade visual aprovada, 16 avatares no budget, roupas críticas sem clipping e rollback técnico temporário. Ao atingir paridade, remover Avatar V2 e Quaternius; eles não são fallback artístico permanente.

## Fase 6 — social/moderação/acessibilidade (2–4 semanas)

Amigos/convite e celular mínimo, mute/report workflow, retenção/exclusão, controles remapeáveis/touch, redução de movimento e contraste. Aceite: testes de abuso, privacidade e teclado/touch.

## Fase 7 — beta operacional (2–4 semanas)

Soak 2 h, carga, falha de banco/restart, backups, alertas, runbooks, suporte e piloto fechado. Aceite: SLO inicial, rollback exercitado, nenhum P0/P1 aberto, licenças completas.

## Expansão

Novos empregos, mapa e minijogos usam frameworks aprovados. Poker, moto, feed e múltiplas salas só entram por proposta com custo/moderação/escala. Reavaliar engine somente pelos gatilhos de `03-COMPARATIVO-ENGINES.md`.

## Divisão de trabalho

- Dev A: cliente 3D, assets, animação, performance e UI de mundo.
- Dev B: API, mundo autoritativo, banco, economia e operação.
- Shared/contracts exigem revisão cruzada. Cada slice define contrato primeiro; não editar simultaneamente `BarScene`/`BarRoom` sem divisão explícita. Integração diária em branch curta; WIP máximo de uma feature grande por pessoa.

## Definição de pronto comum

Contrato e erro definidos; autoridade correta; testes unitários/integração/E2E proporcionais; build verde; métricas/budget; acessibilidade; docs e changelog; licença; migração/rollback; observabilidade; demonstração real sem mock apresentado como pronto.

