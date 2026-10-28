# Decisões (ADRs resumidas)

Formato: contexto → decisão → consequência. As decisões de arquitetura de longo prazo estão na [auditoria](../auditoria/04-ARQUITETURA-RECOMENDADA.md) e no [prompt mestre](../auditoria/PROMPT-MESTRE-CLAUDE.md), seção 3.

## ADR-000 — decisões herdadas da auditoria (24/10/2026)

Manter:

- PlayCanvas;
- monólito modular entre cliente, API e mundo;
- autoridade do servidor sobre a simulação;
- autoridade da API sobre conta, economia e persistência.

Não reutilizar Avatar V2/Antonia nem Quaternius como avatar final, sistema modular ou fallback artístico. Fora do escopo: dinheiro real, apostas e pay-to-win.

## ADR-001 — remover o laboratório Avatar V2 em vez de corrigi-lo (Marco 0)

**Contexto.**

- O build falhava com 11 erros TS2339 em `tests/avatar-v2`.
- O Avatar V2 foi rejeitado pelo produto e suas animações não têm licença verificada.
- O jogo ativava o V2 em modo dev (`AVATAR_V2_GAME_ENABLED = import.meta.env.DEV`); produção já usava o caminho legado.

**Decisão.**

- Remover do código o laboratório, a ponte `avatar-v2-game.ts`, os specs e as configs do Playwright, o script `tools/avatar-v2-lab.mjs` e o middleware `/avatars-v2` do Vite.
- `BarScene`, `CharacterPreview` e o criador ficam só com o caminho que produção já executava.
- `CharacterPreview` continua como fachada, ponto de entrada do futuro avatar.

**Consequência.**

- O modo dev passa a mostrar o mesmo avatar de produção; o gameplay de produção não muda.
- O código removido continua no histórico (`54a4c66`).
- A pasta de fontes `BAR_Avatar_V2/` (295 arquivos rastreados) não entra no build. Sua exclusão fica para o Marco 5, junto com a do Quaternius, conforme o prompt mestre.

## ADR-002 — fixture de contagem no lugar da fonte Quaternius (Marco 0)

**Contexto.**

- `characters.test.ts` lia `Superhero_Male_FullBody.gltf` de `assets-bar/`, removido do repositório em `cee1cc7`.
- O resultado era ENOENT, e a falha interrompia os testes de ferramentas.

**Decisão.**

- Medir uma vez, da versão em `155c016`, a contagem de índices do corpo original: 37 698.
- Guardá-la em `tests/fixtures/characters/base-male-source.json` com a procedência. O arquivo tem só números, nenhum conteúdo do kit.
- A asserção e o valor esperado não mudaram.

**Consequência.**

- O teste é autocontido.
- Ao reimportar de uma fonte diferente, a fixture precisa ser medida de novo e revisada.
- Isso não reabilita o Quaternius como direção do produto.

## ADR-003 — Zod 4.6.7 único no monorepo (Marco 0)

**Contexto.**

- Havia três versões do Zod: shared 3.25.76, servidor 4.3.6 e API 4.6.7.
- O alerta alto GHSA-mrhx-c7xc-m3w5 vale para `<4.6.6`.

**Decisão.**

- Usar Zod 4.6.7 em todos os workspaces; o servidor continua com versão fixa, como antes.
- O shared usa só APIs compatíveis entre v3 e v4: `object`, `enum`, `number`, `int`, `min`, `max`, `default`, `strict`, `literal`, `infer` e `finite`, este último descontinuado no v4, mas ainda existente.
- Não usar `npm audit fix --force`.

**Consequência.**

- Fica uma única cópia deduplicada, inclusive com o `@colyseus/core`.
- `instanceof ZodError` passa a funcionar também para os schemas do shared. O desvio por nome em `apps/api/src/app.ts` continua inofensivo.

## ADR-004 — body-parser só pelo lockfile (Marco 0)

**Contexto.** O body-parser 2.3.0 (GHSA-27r3-jxmh-p828) chega por `@colyseus/core → express 5.3.0`, cuja faixa é `^2.3.0`.

**Decisão.** Usar `npm update body-parser`, que leva à 2.4.0, sem override e sem mexer nos manifests.

**Consequência.** Reverter só o lockfile desfaz a mudança.

## ADR-005 — entrega confiável entre API e mundo (Marco 1)

**Contexto.** Controles administrativos e resultados de partidas podiam se perder quando um processo caía entre leitura e confirmação.

**Decisão.** A API mantém controles em outbox transacional com lease, confirmação, reentrega e dead letter. O mundo mantém resultados pendentes em outbox durável em disco e confirma apenas depois da aceitação pela API. As rotas anteriores continuam compatíveis durante a transição.

**Consequência.** Reinícios deixam de perder comandos/resultados e a idempotência permanece na fronteira persistente. O volume `bar-world` é obrigatório no Compose.

## ADR-006 — readiness e observabilidade protegida (Marco 1)

**Contexto.** Liveness isolada não informa se API, banco e relay estão aptos a servir tráfego, e identificadores crus não devem aparecer nos logs.

**Decisão.** API e mundo expõem health, readiness e métricas internas protegidas; chamadas carregam `x-request-id`; logs do mundo usam pseudônimos. O Compose usa readiness na API, mas liveness no mundo: a sala nasce sob demanda no primeiro ingresso e usar `/ready` para liberar o próprio frontend criaria um deadlock de bootstrap. A readiness do mundo permanece disponível para monitorar a sala depois de criada.

**Consequência.** A API não libera dependentes antes do banco; o processo do mundo precisa estar vivo para o frontend subir, e `/ready` distingue depois se sala, API e outbox estão operacionais. Investigações correlacionam falhas sem registrar IDs de conta em claro.

## ADR-007 — lifecycle incremental por fachadas (Marco 1)

**Contexto.** `main.ts`, `BarScene` e `BarRoom` concentram responsabilidades. Uma reescrita simultânea mudaria demasiadas invariantes de conexão, reconexão e gameplay.

**Decisão.** Manter as três fachadas e extrair primeiro fronteiras pequenas e testáveis: `AdmissionLifecycle` invalida continuações assíncronas antigas do cliente; `SceneCallbacks` é o único canal de eventos da cena; `SessionRegistry` possui nonces e índices de sessões da sala. A remoção por presença esperada torna inofensivo o `onLeave` atrasado de uma sessão substituída.

**Consequência.** Sair durante o carregamento não pode reconectar rede/microfone por trás do lobby; takeover e reconnect deixam de depender de busca linear. Mensagens e estado de rede permanecem iguais. Sistemas de gameplay continuam atrás das fachadas e serão extraídos apenas em fatias futuras com caracterização própria.

## ADR-008 — segredos distintos por finalidade (Marco 1)

**Contexto.** `AUTH_SECRET` assinava tickets e também autorizava API↔mundo, métricas e HMAC de logs. O vazamento de uma função comprometia todas as demais.

**Decisão.** `AUTH_SECRET` fica exclusivo para tickets. `INTERNAL_SECRET` protege chamadas internas, métricas e pseudônimos. Produção exige chaves fortes, diferentes e com pelo menos 32 caracteres; somente desenvolvimento mantém fallback transitório quando a nova variável está ausente.

**Consequência.** A chave de ticket não abre endpoints internos. Compose, exemplos, ferramenta de pseudônimo e testes usam o contrato novo; ambientes de produção precisam provisionar a variável antes de atualizar.

## ADR-009 — recuperação testável e runtime fixado (Marco 1)

**Contexto.** Havia apenas a recomendação genérica de usar `pg_dump`, sem restore ensaiável, e a versão de Node divergia entre documentação, host e CI.

**Decisão.** Fixar Node 24 em `.nvmrc`/`engines`/CI. Backups custom do PostgreSQL ficam sob `.local/backups`, com SHA-256, publicação sem overwrite e validação por restore em banco temporário de nome reservado. A CI ganha job isolado com PostgreSQL 17 e reaplicação das migrações.

**Consequência.** Restore nunca aponta para `bar` e só remove um banco que a própria execução confirmou ter criado. Docker/restore e o job remoto continuam não comprovados até rodarem nos ambientes correspondentes.

## ADR-010 — CI isolada e scripts de dependências negados por padrão (Marco 1)

**Contexto.** Build, testes, E2E e carga competiam dentro de um único job de 15 minutos. O npm 11 também listava scripts pendentes de `argon2`, `esbuild` e `msgpackr-extract`, embora o alvo suportado já receba binários pré-compilados e todas as três dependências funcionem sem executá-los.

**Decisão.** Separar `verify`, `e2e`, `load` e `postgres-smoke`, com limites e artefatos próprios. Fixar npm 11.20 como gerenciador de desenvolvimento (a versão mínima que aplica esta política), instalá-lo explicitamente antes de `npm ci` nos quatro jobs e nos estágios Docker, registrar negação explícita dos três scripts em `allowScripts` e manter o lockfile como fonte das versões; qualquer dependência futura que realmente precise de lifecycle exige revisão específica, não aprovação global.

**Consequência.** Uma suíte lenta não consome o orçamento das demais e os relatórios sobrevivem a falhas. CI e imagem não dependem da versão de npm que vier embutida no Node 24 para interpretar `devEngines`/`allowScripts`. A instalação não executa código adicional desnecessário; plataformas fora do alvo Node 24/Linux x64 precisam comprovar seus binários antes de serem declaradas suportadas. O workflow remoto continua não comprovado até uma execução no GitHub Actions.

## ADR-011 — migração explícita e credencial runtime sem DDL (Marco 1)

**Contexto.** Toda conexão da API reaplicava quatro arquivos com `IF NOT EXISTS` usando o mesmo superuser `bar` do PostgreSQL. Não havia histórico imutável, checksum, exclusão entre réplicas nem forma de distinguir um schema legado correto de outro apenas parcialmente compatível.

**Decisão.** `connectDatabase` passa a somente conectar e validar. O comando one-shot `migrate` usa um ledger com checksum normalizado, valida contrato estrutural, serializa concorrentes por lock consultivo com timeout e aplica o lote pendente numa transação. A API em produção usa `bar_runtime`, sem superuser nem DDL; `bar_migrator` assume o owner sem login `bar_owner` somente no runner. O bootstrap `bar` permanece reservado à operação. A ordem do Compose é PostgreSQL saudável → migração concluída → API.

**Consequência.** Startup runtime não altera schema e falha cedo se o deploy esqueceu a migração. SQL aplicado torna-se imutável; toda evolução exige novo arquivo expand/contract. Volumes legados só recebem baseline depois de verificar colunas, defaults, chaves, checks e índices esperados. Um runtime anterior à migração explícita precisa excepcionalmente da credencial bootstrap para rollback, conforme o runbook; versões já adaptadas aceitam linhas futuras no ledger para permitir rollback de aplicação compatível. Compose, papéis reais e upgrade de volume continuam sem homologação local enquanto Docker não existir neste host.

## ADR-012 — limpeza de arquivos sem uso e reorganização de pastas (Marco 1)

**Contexto.** O repositório acumulava acervos que nada carregava: o Avatar V2 rejeitado (ADR-001), o protótipo React/Lovable `assets-bar/ui/ui-marrom`, o tema visual anterior (`style.css`, `boteco.css` e quatro fontes), cópias de `.blend`, um som duplicado e um atalho do Windows. A documentação e as ferramentas ficavam numa única pasta plana cada.

**Decisão.**

- Antecipar a exclusão de `BAR_Avatar_V2/` prevista para o Marco 5, por decisão do responsável pelo produto. Nenhum código, teste ou build a referenciava.
- Remover o protótipo `ui-marrom`, o tema anterior, `apps/web/src/engine/index.ts` (barrel sem importações), a sonda manual `tests/fixtures/youtube.html`, o duplicado `... (1).m4a`, `assets-bar/objects/bar_boteco.blend` (cópia idêntica do mapa) e os `.blend1`. O atalho `.lnk` sai do git e passa a ser ignorado.
- Manter a biblioteca Mixamo de `assets-bar/anim/misc`, embora só 10 clipes estejam em uso: é a reserva para novas animações.
- Reorganizar `docs/` em `projeto`, `arquitetura`, `sistemas`, `assets` e `validacao`, com índice em `docs/README.md`. Em `tools/`, os importadores vão para `tools/assets` (com `lib` e `roupas`), `pseudonym.mjs` para `tools/ops` e o servidor dos E2E para `tests/e2e/server.mjs`. Os iniciadores `.bat` continuam na raiz de `tools/`.

**Consequência.** Tudo o que foi removido continua no histórico do git. Comandos `npm run assets:*` e `ops:*` não mudam; quem chamava os scripts pelo caminho antigo precisa usar o novo. Os rascunhos locais ignorados de `.local/` também foram apagados, sem retorno.

## ADR-013 — aposentar o criador de personagem; só skins (Marco 1)

**Contexto.** O personagem gratuito usava os corpos base do Quaternius, rejeitados artisticamente (ART-01), com cabelo, cores e roupas masculinas importadas. O responsável pelo produto pediu a retirada completa do criador, mantendo apenas o sistema de skins.

**Decisão.**

- Remover o criador e tudo o que só ele usava: editor e prévia 3D, materiais por cor, `characterSchema`/`DEFAULT_CHARACTER`, `POST /api/character`, o campo `character` de `PublicUser`, `Access` e `PlayerState`, a skin `custom`, os GLBs `base-male`/`base-female` (modelos, texturas, bancos e bengalas), o catálogo e a importação de roupas (`tools/assets/roupas`, `import-characters.mjs`, `character-clothing.mjs`, `npm run assets:characters`), testes, fixtures, capturas e documentação próprios.
- **Nathan passa a ser a skin gratuita** (`DEFAULT_SKIN`): pertence a toda conta sem registro em `skin_inventory`, é o visual de contas novas e o substituto de skin não possuída. Leandro, Rafael e Read continuam à venda.
- Contas novas entram no bar sem etapa de aparência; os bloqueios "crie seu personagem" saíram do ticket, do mundo, da loja de skins e da mochila.
- `005_retire_character_creator.sql` passa `equipped_skin='custom'` para `'nathan'`, muda o default e **remove a coluna `character_config`**.
- `CHARACTER_INITIAL_COINS`/`CHARACTER_DAILY_COINS` passam a `WALLET_INITIAL_COINS`/`WALLET_DAILY_COINS`; `SKIN_PRICE_NATHAN` deixa de existir.
- Mantidos por servirem às skins: `tools/assets/lib/character-gltf.mjs` (sem `topological`), `BONE_ALIASES` de Rafael/Read e a mensagem `player.appearance`, que sincroniza a skin vestida pela API. A migração `002_characters.sql` mantém o nome, porque cria carteira, coleção e lançamentos e migrações aplicadas são imutáveis.

**Consequência.**

- A migração 005 é contrativa, diferente das anteriores: a configuração salva dos personagens é apagada e uma versão anterior da API recusa iniciar contra o schema novo (exige `character_config`). Rollback exige restaurar o backup anterior à migração ou recriar a coluna (`ALTER TABLE user_profiles ADD COLUMN character_config jsonb`) e o default `'custom'`, e então implantar a versão antiga — cujos jogadores voltariam a passar pelo criador.
- API e mundo devem ser implantados juntos: um mundo antigo recusa a entrada de quem não tem `character`.
- Quem comprou Nathan antes desta mudança não é reembolsado automaticamente.
- ART-01 e DEBT-02 deixam de existir. O código removido continua no histórico do git.
