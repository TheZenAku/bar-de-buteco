# Execução e hospedagem

Desenvolvimento sem Docker usa PostgreSQL embutido PGlite, gravado em `.data/postgres`. A API aplica as migrações SQL de `infra/migrations`; `DATABASE_URL` seleciona o PostgreSQL nativo com o mesmo schema Drizzle. PGlite tem um único processo proprietário: pare a API antes de executar seed, migração ou promoção administrativa no banco embutido.

## Contas de demonstração

Na raiz, com Node 24 e `npm install` concluído:

```sh
npm run seed -w @bar/api
npm run dev
```

No PowerShell com políticas de execução restritas, use `npm.cmd`.

O seed é uma ação explícita de desenvolvimento e cria estas contas confirmadas: `admin@bar.local` (administradora), `jogador1@bar.local` e `jogador2@bar.local`. Senha: `ButecoDemo2026!`; `DEMO_PASSWORD` pode substituí-la. Contas existentes não têm senha ou permissão alteradas. O comando recusa `NODE_ENV=production`. Cadastro público sempre cria jogador comum.

Confirmações e recuperação chegam à caixa local `/api/dev/mail` quando não há SMTP; o endpoint existe somente em desenvolvimento e aceita somente loopback. Mensagens ficam em memória até reiniciar a API. SMTP configurado usa Nodemailer; `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_PORT` e `MAIL_FROM` configuram entrega real. O link de confirmação dura 24 horas, recuperação 30 minutos. Recuperação revoga todas as sessões; logout revoga a sessão atual. Sessões duram sete dias.

## Contêineres

Copie `infra/production.env.example` para `.env.production` (ignorado pelo Git), configure segredos aleatórios independentes, origem HTTPS e SMTP. Use senha PostgreSQL hexadecimal para não precisar escapar caracteres na URL. Execute da raiz:

```sh
docker compose --env-file .env.production -f infra/compose.yml config
docker compose --env-file .env.production -f infra/compose.yml up --build -d
```

O nginx fica em `127.0.0.1:8080`. Termine TLS num proxy reverso do host e encaminhe para essa porta, com suporte a WebSocket. API, jogo e banco ficam somente na rede Docker. A origem pública configurada deve ser a origem HTTPS acessada pelo navegador. O nginx encaminha `/api` à API e `/game` ao Colyseus. Endpoints internos e caixa de desenvolvimento não são publicados. `TRUST_PROXY_HOPS=1` só deve ser usado atrás deste proxy, que substitui o cabeçalho de IP.

Para capturar e-mails durante uma homologação privada, configure `SMTP_HOST=mailpit`, `SMTP_PORT=1025` e suba com `--profile mail`. A caixa estará em `http://localhost:8025`; isso não entrega mensagens externas. Mesmo nessa configuração, a aplicação do Compose exige HTTPS e cookies seguros.

Cadastre e confirme a conta do operador antes de promovê-la explicitamente:

```sh
docker compose --env-file .env.production -f infra/compose.yml exec api npm run admin -w @bar/api -- --email operador@example.com
```

A promoção é registrada em `moderation_actions`. Nunca exponha PostgreSQL nem o segredo `AUTH_SECRET` ao cliente. Faça backup periódico do volume `bar-postgres` com `pg_dump`; preserve os segredos fora do repositório. O mundo é transitório: reiniciar o jogo encerra rodadas e eventos, enquanto contas, estatísticas, bloqueios, denúncias e punições persistem.

## Validação e limites

```sh
npm run typecheck -w @bar/api
npm test -w @bar/api
```

Os testes verificam confirmação, senha Argon2id, CSRF, autorização administrativa, revogação, bloqueio, denúncia, banimento, estatísticas idempotentes e persistência após reiniciar PGlite. Devem rodar em CI junto aos testes do jogo e do cliente; SMTP de produção e Docker exigem homologação no ambiente de destino. O host de implementação não possui Docker e o Compose não foi executado nele.

Estatísticas usam `(roundId,userId)` para impedir duplicação durante retry. Comandos administrativos são persistidos e consumidos atomicamente pela consulta do jogo; existe uma janela entre consumo e aplicação em que uma queda do processo pode perder um comando. Banimentos continuam efetivos, pois também revogam sessões no banco. Este MVP usa uma única instância de jogo; a fila não deve ser consumida por múltiplos mundos independentes.

Referências de implementação: [Drizzle/PGlite](https://orm.drizzle.team/docs/get-started/pglite-new), [cookies Fastify](https://github.com/fastify/fastify-cookie) e [SMTP Nodemailer](https://nodemailer.com/smtp).
