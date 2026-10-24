# Multiplayer, backend, segurança e operação

## Autoridade

Preservar o desenho atual: cliente envia intenção; mundo decide movimento/interação/minijogo; API decide identidade, posse e economia. O ticket de 60 s só admite a conexão; a sessão é revalidada. Nenhum campo de join concede role, skin ou saldo.

Tick alvo 20 Hz e patch 10 Hz são adequados para o bar, desde que medidos. Movimento local usa predição/reconciliação; remotos usam buffer de interpolação (100–150 ms adaptável). Aumentar capacidade só depois de teste de CPU, banda e renderização; `ROOM_CAPACITY` permitir 128 não comprova 128 jogadores.

## Persistência e entrega confiável

Substituir filas voláteis por outbox:

1. API grava estado e evento na mesma transação.
2. mundo faz lease do evento por ID.
3. aplicação é idempotente.
4. mundo confirma `applied`; lease expira em crash.
5. dead-letter registra falhas repetidas.

O mesmo padrão serve para estatísticas, comandos admin e recompensas de trabalho. Rodadas ativas continuam efêmeras no MVP, mas o usuário deve receber encerramento compreensível após restart.

## Segurança mínima de produção

- Atualizar alertas Zod/body-parser e travar versões verificadas.
- Segredos distintos para ticket, tráfego interno e banco; rotação documentada.
- HTTPS/WSS, cookies Secure, origem exata, proxy confiável com hop fixo.
- Limites globais de JSON, WebSocket, chat/voz/comandos e conexões por IP/conta.
- CSP/headers, logs sem token/e-mail desnecessário, erros públicos sem stack.
- Backup diário, restore testado, usuário DB sem superuser e migrations forward-only.
- SAST/dependency audit/secret scan na CI; revisão manual nas rotas de economia/admin.

O relay de voz não grava áudio. Documentar isso e não adicionar gravação sem consentimento, retenção e base legal. Bloqueio deve cortar chat e voz nos dois sentidos, como hoje.

## Observabilidade

Health não basta. Expor readiness separada e métricas: jogadores, joins, reconexões, tick p50/p95/p99, patches, bytes, comandos rejeitados, fila/outbox, DB, erros de mídia e memória. Logs JSON com `requestId`, `roomId`, `userId` pseudonimizado e `actionId`; nunca senha/token/áudio. Alertas simples: sala indisponível, DB, p99 do tick, fila antiga, taxa de erro/login e memória.

## Deploy recomendado

Primeiro release: um host/container web+API+mundo e PostgreSQL gerenciado ou dedicado, CDN para assets e SMTP transacional. Nginx continua como edge interno, com TLS no provedor. Sem autoscaling do mundo até existir particionamento de salas. Backups e restore valem mais que alta disponibilidade prematura.

Ambientes: dev PGlite; CI PostgreSQL efêmero além de PGlite; staging igual a produção; produção PostgreSQL. Migrations executadas em job único antes do rollout, com backup e plano de compatibilidade.

## Testes

- Contratos entre versões cliente/mundo/API.
- Duas contas reais, takeover, reconexão, pacote atrasado/repetido/fora de ordem.
- Falha API durante resultado/compra/comando e recuperação da outbox.
- Carga gradual 16/32/48 usuários; soak 2 h; limites de voz e mídia.
- Teste de autorização por rota e propriedade, fuzz de schemas e invariantes econômicos.
- Restore de backup em staging e rollback da versão sem rollback destrutivo de schema.

## Custos

Não há medição de egress ou CPU em produção. Principais custos: 105 MiB iniciais/atualizações, relay de voz, WebSocket permanente, PostgreSQL, SMTP e observabilidade. Medir bytes por sessão e concorrência antes de escolher provedor; evitar compromisso anual antes do beta.

