# Critérios de aceite e estratégia de testes

## Gate de cada marco

1. `npm ci`, `npm run build` e `npm test` passam em clone limpo.
2. Testes E2E focados passam; suíte completa antes de merge/release.
3. Nenhuma vulnerabilidade alta/crítica sem avaliação e exceção com prazo.
4. Nenhum asset sem licença/procedência no artefato de produção.
5. Migração de banco é compatível com versão anterior durante rollout.
6. Métricas e logs comprovam o caminho novo; feature flag permite desligar mudança arriscada.
7. Documentação de execução, teste e rollback atualizada.

## Matriz mínima

| Área | Prova obrigatória |
| --- | --- |
| Auth | registro, verificação, login, reset, revogação, CSRF/origin, rate limit |
| Economia | corrida/retry, saldo limitado, ledger, falha no meio da transação |
| Mundo | movimento adulterado, parede/escada, AOI, reconnect/takeover |
| Interação | alcance, obstrução, ocupação concorrente, cancelamento |
| Minijogo | sigilo, ordem, timeout, reconnect, resultado idempotente |
| Admin | menor privilégio, owner protegido, kick≠ban, reversão concorrente |
| Voz/chat | distância, block/mute, pacote inválido, permissão negada |
| Assets | validator, hash, tamanho, rig/weights, screenshot e licença |
| Performance | 1/8/16/32 usuários conforme camada; p50/p95/p99 e memória |
| Operação | deploy staging, readiness, backup/restore, restart e rollback |
| Acessibilidade | teclado, foco, contraste, zoom/fonte e touch |

## Hardware e navegadores

Definir modelos reais antes do beta. Mínimo sugerido: notebook Windows com GPU integrada, desktop modesto, Android intermediário e iPhone suportado; Chrome, Edge, Firefox e Safari quando aplicável. Registrar resolução, versão, FPS, memória, tempo de boot e temperatura qualitativa.

## Critérios de produto

- 80% de cinco testadores novos entram e concluem primeira atividade sem ajuda verbal.
- primeira ação social/atividade em ≤5 min;
- erro de conexão explica recuperação;
- nenhum gasto/perda permanente causado por evento cômico;
- com 1–2 jogadores há ao menos uma atividade clara com NPC;
- sessão de 20 min oferece escolha, não obrigação repetitiva.

## Rollback

Código: versão anterior implantável. Banco: expand/contract, nunca depender de down migration destrutiva. Assets: manifests com hash e versão anterior retida. Features: flag server-side. Economia: compensação em ledger, não edição silenciosa. Testar rollback em staging antes do beta.

