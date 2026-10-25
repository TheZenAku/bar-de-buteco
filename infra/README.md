# Execução e hospedagem

Desenvolvimento sem Docker usa PostgreSQL embutido PGlite, gravado em `.data/postgres`; `DATABASE_URL` seleciona PostgreSQL nativo com o mesmo schema Drizzle. Migrações não são mais executadas pela conexão normal da API: `npm run migrate -w @bar/api` é o único caminho que aplica DDL. `npm run dev -w @bar/api` e `npm run seed -w @bar/api` executam esse comando antes do processo principal; o E2E também faz `migrate → seed → API`. PGlite tem um único processo proprietário: pare a API antes de executar seed, migração ou promoção administrativa no banco embutido.

Cada arquivo `NNN_nome.sql` de `infra/migrations` recebe um checksum SHA-256 normalizado para LF em `bar_schema_migrations`. O runner recusa arquivo aplicado que foi alterado, versão repetida, lacuna no histórico ou banco legado com schema parcial. Todas as migrações pendentes, a verificação estrutural e seus registros entram numa transação. A API runtime apenas lê o ledger e verifica o contrato do schema; banco vazio ou atrasado impede o startup sem executar DDL.

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

Copie `infra/production.env.example` para `.env.production` (ignorado pelo Git), configure segredos aleatórios independentes, origem HTTPS e SMTP. As três senhas PostgreSQL devem ser hexadecimais, distintas e ter pelo menos 32 caracteres para entrarem nas URLs sem escaping. Execute da raiz:

```sh
docker compose --env-file .env.production -f infra/compose.yml config
docker compose --env-file .env.production -f infra/compose.yml up --build -d
```

Em volume novo, a imagem PostgreSQL cria os papéis; em todo deploy, o serviço idempotente `postgres-bootstrap` os reconcilia também em volumes existentes. Depois, o serviço one-shot `migrate` aplica e certifica o schema e só então a API pode iniciar. Falha em qualquer gate deixa a API bloqueada. O runner usa lock consultivo com espera limitada por `MIGRATION_LOCK_TIMEOUT_MS` (30 s por padrão), portanto duas implantações não alteram o schema ao mesmo tempo nem ficam bloqueadas indefinidamente.

### Papéis do banco

| Papel | Uso | Privilégios |
| --- | --- | --- |
| `bar_owner` | proprietário lógico, sem login | possui schema e objetos da aplicação |
| `bar_migrator` | serviço `migrate` | login sem superuser e `NOINHERIT`; assume `bar_owner` somente durante a migração |
| `bar_runtime` | API | login sem superuser; DML nas tabelas da aplicação, sem `CREATE`/`ALTER`/`DROP`; somente leitura no ledger de migrações |
| `bar` | bootstrap e operação | superuser criado pela imagem, reservado a init, backup/restore e recuperação excepcional; nunca é a credencial normal da API |

Não use `MIGRATION_DATABASE_URL` na API nem `DATABASE_URL` no migrador. Em produção o processo de migração exige URLs diferentes. Nunca edite um SQL já registrado; crie o próximo arquivo numerado e mantenha mudanças de banco expand/contract compatíveis com a versão anterior da aplicação.

### Atualizar um volume PostgreSQL já existente

O diretório `/docker-entrypoint-initdb.d` roda automaticamente apenas quando o volume nasce; por isso o Compose possui também o gate `postgres-bootstrap`, que executa o mesmo script idempotente contra todo volume. Para um volume `bar-postgres` anterior a esta separação de papéis, faça uma janela de manutenção:

1. Confirme que `.env.production` contém `POSTGRES_PASSWORD`, `BAR_MIGRATOR_PASSWORD` e `BAR_RUNTIME_PASSWORD` distintos.
2. Crie um backup e conclua `npm run ops:restore-check -- --input ...` antes de alterar papéis.
3. Pare entrada e escrita: `docker compose --env-file .env.production -f infra/compose.yml stop web game api`.
4. Suba a topologia nova sem remover volumes: `docker compose --env-file .env.production -f infra/compose.yml up --build -d`. O Compose espera PostgreSQL saudável, `postgres-bootstrap` concluído e `migrate` concluído antes de iniciar a API.
5. Confira os gates one-shot com `docker compose --env-file .env.production -f infra/compose.yml ps -a postgres-bootstrap migrate` e seus logs. Ambos devem terminar com código zero.
6. Confirme `/api/ready`, a entrada no mundo e uma escrita comum da aplicação; confirme também, no staging, que `bar_runtime` recebe negação ao tentar `CREATE TABLE`.

O bootstrap transfere somente objetos da aplicação no schema `public`; não usa `REASSIGN OWNED` e não altera templates ou bancos compartilhados. Num banco legado sem ledger, os SQLs compatíveis são reaplicados e o schema completo é verificado antes de registrar o baseline. Se a estrutura divergir, a migração para sem certificar o histórico: restaure o backup ou corrija a divergência de forma explícita, nunca insira linhas manualmente em `bar_schema_migrations`.

### Rollback de implantação

Não reverta schema destrutivamente durante um incidente. Volte a imagem da aplicação e preserve o banco; o runtime aceita migrações futuras desconhecidas quando todas as migrações do artefato antigo continuam presentes com o mesmo checksum. Uma imagem anterior à separação MIG-01 tenta DDL no próprio startup e não funciona com `bar_runtime`: somente nesse rollback legado, aponte temporariamente a API para `postgresql://bar:${POSTGRES_PASSWORD}@postgres:5432/bar`, limite a janela e restaure imediatamente a credencial `bar_runtime` ao avançar novamente. Registre essa exceção operacional; não promova `bar_runtime` nem entregue a ele propriedade dos objetos.

O nginx fica em `127.0.0.1:8080`. Termine TLS num proxy reverso do host e encaminhe para essa porta, com suporte a WebSocket. API, jogo e banco ficam somente na rede Docker. A origem pública configurada deve ser a origem HTTPS acessada pelo navegador. O nginx encaminha `/api` à API e `/game` ao Colyseus. Endpoints internos e caixa de desenvolvimento não são publicados. `TRUST_PROXY_HOPS=1` só deve ser usado atrás deste proxy, que substitui o cabeçalho de IP.

Para capturar e-mails durante uma homologação privada, configure `SMTP_HOST=mailpit`, `SMTP_PORT=1025` e suba com `--profile mail`. A caixa estará em `http://localhost:8025`; isso não entrega mensagens externas. Mesmo nessa configuração, a aplicação do Compose exige HTTPS e cookies seguros.

Cadastre e confirme a conta do operador antes de promovê-la explicitamente:

```sh
docker compose --env-file .env.production -f infra/compose.yml exec api npm run admin -w @bar/api -- --email operador@example.com
```

A promoção é registrada em `moderation_actions`. Nunca exponha PostgreSQL, `AUTH_SECRET` ou `INTERNAL_SECRET` ao cliente. Preserve os segredos fora do repositório e use valores diferentes. Reiniciar o jogo encerra rodadas e eventos ativos. Resultados já encerrados aguardando a API sobrevivem no volume `bar-world`; contas, estatísticas, bloqueios, denúncias e punições persistem no PostgreSQL.

## Backup e verificação de restore

Os comandos abaixo usam o `pg_dump`/`pg_restore` do contêiner PostgreSQL com o papel operacional `bar`, nunca a credencial runtime. Eles nunca restauram sobre `bar`: a verificação cria um banco aleatório com o prefixo reservado `bar_restore_check_`, valida as tabelas essenciais e o remove mesmo quando o restore falha. Backups são gravados somente em `.local/backups`, sem sobrescrever arquivos, com checksum SHA-256 ao lado.

Antes do backup, evite capturar o banco enquanto ainda existem resultados somente no outbox do mundo:

1. Consulte `/metrics` do mundo pela rede interna e espere `bar_world_result_outbox_pending 0`.
2. Pare apenas o serviço `game`; API e PostgreSQL podem continuar atendendo.
3. Não remova o volume `bar-world`. Se não for possível zerar a fila, preserve esse volume junto com o dump, pois ele contém resultados que a API ainda não confirmou.
4. Crie e verifique o backup; depois reinicie `game`.

```sh
docker compose --env-file .env.production -f infra/compose.yml exec -T game node -e "fetch('http://127.0.0.1:2567/metrics',{headers:{'x-internal-secret':process.env.INTERNAL_SECRET}}).then(r=>r.text()).then(console.log)"
docker compose --env-file .env.production -f infra/compose.yml stop game
npm run ops:backup
npm run ops:restore-check -- --input .local/backups/ARQUIVO.dump
docker compose --env-file .env.production -f infra/compose.yml start game
```

Para outro arquivo de ambiente dentro do projeto, passe `-- --env-file .env.staging` aos dois scripts. O backup só é considerado utilizável depois que `ops:restore-check` termina com sucesso. Copie o `.dump` e o `.sha256` para armazenamento externo cifrado, aplique retenção e teste periodicamente uma recuperação no staging. Se a verificação for interrompida, procure por bancos com prefixo `bar_restore_check_`; a ferramenta tenta removê-los automaticamente e nunca executa `DROP` contra outro nome.

## Validação e limites

```sh
npm run typecheck -w @bar/api
npm test -w @bar/api
npm run test:postgres -w @bar/api # exige TEST_DATABASE_URL para um PostgreSQL nativo descartável
```

Os testes verificam confirmação, senha Argon2id, CSRF, autorização administrativa, revogação, bloqueio, denúncia, banimento, estatísticas idempotentes, persistência após reiniciar PGlite e as garantias do ledger: conexão runtime sem DDL, reaplicação vazia, checksum, rollback transacional, baseline legado e rollback expand-only. Um job separado da CI executa `test:postgres` contra PostgreSQL 17. Localmente ele é ignorado sem `TEST_DATABASE_URL`; SMTP de produção, permissões reais dos três papéis e o Compose completo ainda exigem homologação no ambiente de destino. O host de implementação não possui Docker e o Compose não foi executado nele.

O npm 11.20 bloqueia scripts de dependências por padrão e está fixado em `packageManager`/`devEngines`, de modo que uma versão incapaz de aplicar a política recusa os comandos de desenvolvimento. CI e Docker instalam essa versão explicitamente antes de `npm ci`, sem depender do npm embutido na imagem Node 24. O projeto nega explicitamente os scripts de `argon2`, `esbuild` e `msgpackr-extract`, pois o alvo Node 24/Linux x64 usa os binários pré-compilados já validados. `npm install-scripts ls --json` deve continuar sem pendências; não use aprovação global ao adicionar uma dependência nova.

Estatísticas usam `(roundId,userId)` para impedir duplicação durante retry. O mundo grava resultados em disco antes do envio e só os remove depois da confirmação da API. Comandos administrativos são persistidos, alugados por instância, confirmados depois da aplicação e reenviados quando um lease expira; falhas definitivas vão para dead letter. As rotas legadas continuam disponíveis durante a janela de compatibilidade. O MVP continua com uma única sala de jogo por decisão de produto, não por limitação de atomicidade da fila.

Referências de implementação: [Drizzle/PGlite](https://orm.drizzle.team/docs/get-started/pglite-new), [cookies Fastify](https://github.com/fastify/fastify-cookie) e [SMTP Nodemailer](https://nodemailer.com/smtp).
