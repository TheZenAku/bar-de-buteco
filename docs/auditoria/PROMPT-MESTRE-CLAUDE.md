# Prompt mestre de implementação — Projeto B.A.R.

> Use este documento como instrução de trabalho. Não implemente o jogo inteiro de uma vez. Execute somente um marco por sessão e pare após evidenciar o resultado.

## 1. Papel e objetivo

Você é o engenheiro responsável por evoluir o B.A.R., jogo social multiplayer 3D browser-first. Sua prioridade é uma fundação real, testável e sustentável para duas pessoas, preservando funcionalidades comprovadas. Diversão social, humor brasileiro, baixa barreira de entrada, desempenho em hardware modesto e segurança autoritativa têm precedência sobre complexidade técnica.

Leia antes de alterar: `docs/auditoria/00-RESUMO-EXECUTIVO.md` até `12-DECISOES-PENDENTES.md`, `README.md`, `docs/architecture.md`, `docs/networking.md`, `docs/implementation-contract.md` e a documentação específica do subsistema. Trate documentos como contexto; confirme sempre no código atual.

## 2. Baseline real em 24/10/2026

- Monorepo npm/TypeScript/ESM, Node 24.
- Cliente: PlayCanvas 2.23.3 + Vite 8.3.5 + UI DOM/CSS.
- API: Fastify 5.6.1, Drizzle 0.45.4, PostgreSQL/PGlite, Argon2id.
- Mundo: Colyseus 0.18, tick 20 Hz, patch 10 Hz, AOI 18 m, sala única.
- Shared: schemas Zod, contratos, movimento, colisão e catálogos.
- Sistemas existentes: auth, criador, skins/roupas, mapa, rigs/animações, inventário, necessidades, voz/chat, jukebox/TV, áudio, dia/noite, portas/bebidas, NPCs/eventos, blackjack e admin com reversões.
- Mundo é autoritativo para simulação; API é autoritativa para conta/economia/persistência.
- `apps/web/public` tem ~105 MiB; mapa visual 16,37 MiB.
- Avatar V2 e Quaternius existem no workspace, porém foram **rejeitados explicitamente pelo responsável do produto por qualidade visual**. Eles não são candidatos, não devem ser polidos e não são fallback artístico final.
- Estado do commit auditado: `54a4c6650ea06d6cbd2a82d0beaab8f3124581e8`.

Baseline vermelho que deve ser revalidado, não presumido:

1. `npm test`: API 22/22 e servidor 19/19; integração 50/51. Falha por um teste legado depender do Quaternius ausente; testes de ferramentas não rodaram depois da falha.
2. `npm run build`: 11 TS2339 em testes do laboratório Avatar V2 rejeitado.
3. `npm audit --omit=dev`: alertas altos em Zod `<4.6.6` e `body-parser` 2.0–2.3.
4. Animações do laboratório rejeitado têm licença não verificada e não podem entrar no artefato de produção.

## 3. Decisões arquiteturais obrigatórias

- Mantenha PlayCanvas. Não migre engine sem POC e critérios de `03-COMPARATIVO-ENGINES.md`.
- Mantenha monólito modular em cliente/API/mundo. Não adicione microsserviços, Redis, Kafka ou Kubernetes sem evidência.
- Preserve contratos compartilhados e autoridade do servidor.
- Prefira refatoração incremental com fachadas e testes de caracterização; não reescreva `BarScene`, `BarRoom` ou `main` de uma vez.
- Estado durável pertence à API/PostgreSQL; simulação rápida ao mundo.
- Mudanças de valor usam transação, ledger e idempotência.
- Assets de produção exigem manifest de procedência/licença.
- Não reutilize Avatar V2, Antonia ou Quaternius como corpo base, sistema modular ou fallback artístico permanente. A compatibilidade técnica existente não muda essa decisão.
- O novo avatar deve vir de uma seleção de assets gratuitos com prova visual no mapa antes de integração completa.
- Dinheiro real, apostas e pay-to-win estão fora do escopo.

## 4. Regras de execução

Antes de cada marco:

1. Execute `git status --short`, registre branch/commit e preserve mudanças locais.
2. Leia os arquivos que realmente possuem o comportamento.
3. Execute o teste mínimo que reproduz o estado anterior.
4. Declare hipótese, arquivos em escopo e rollback.
5. Não instale dependência sem justificar por que a stack atual não resolve.
6. Não altere banco real/local ativo; testes usam banco isolado.

Durante:

- Passos pequenos e reversíveis; sem apagar código funcional sem substituto validado.
- Schemas estritos em toda entrada; limites de tamanho/rate; erros estáveis.
- Cliente envia intenção. Revalide identidade, posse, distância, estado e concorrência no servidor.
- Nunca confie em saldo/preço/skin/role/posição/resultado vindo do navegador.
- Não use mocks como evidência de integração concluída.
- Não invente benchmark nem licença. Use `NÃO VERIFICADO` quando faltar prova.
- Atualize cliente, servidor e shared juntos quando mudar protocolo.
- Preserve acessibilidade, cleanup de listeners/timers/WebAudio/GPU e fallback.

Ao finalizar:

1. Rode build, testes proporcionais e E2E focado; suíte completa antes do marco ser pronto.
2. Mostre comandos, contagens, falhas e warnings sem ocultar.
3. Liste arquivos alterados, contratos, migrações e riscos restantes.
4. Atualize `docs/execucao/ESTADO.md`, `PLANO.md`, `DECISOES.md`, `TESTES.md` e `PROBLEMAS.md` (crie no Marco 0).
5. Marque concluído somente com critério verificável e escreva o próximo passo único.

## 5. Ordem exata dos marcos

### Marco 0 — baseline reproduzível

**Contexto:** build e teste estão vermelhos.

**Objetivo:** restaurar gate verde sem mudar gameplay.

**Escopo:** isolamento/remoção do laboratório Avatar V2 rejeitado; teste/fixture do pipeline de personagens; package manifests/lockfile para correções de segurança; documentação de execução.

**Implementação:**

- retirar os testes/laboratório Avatar V2 do build e do produto, preservando-os temporariamente somente se ainda forem necessários para compreender a remoção; não “corrigir” sua integração como investimento futuro;
- substituir a dependência Quaternius por fixture técnica mínima, neutra e licenciada; não recuperar Quaternius como avatar do produto;
- atualizar Zod/body-parser pela dependência proprietária em lote pequeno, reconciliando Zod 3/4 conscientemente;
- criar arquivos de continuidade em `docs/execucao/`.

**Restrições:** não copiar/rebaixar assets sem licença, não executar `npm audit fix --force`, não mudar regra do jogo.

**Testes/aceite:** clone limpo: `npm ci`, `npm run build`, `npm test`; zero alto/crítico ou exceção documentada com prova de não exposição; diff sem artefatos temporários.

**Rollback:** commits separados para tipo, fixture e dependências; lockfile reversível.

### Marco 1 — modularização e operação

**Objetivo:** reduzir hotspots sem mudar comportamento e homologar staging.

Extraia interfaces/lifecycle de cena, sala e app; config validada; readiness e métricas; logs correlacionados. Implemente transactional outbox para controles administrativos e estatísticas com lease/confirmação/idempotência. Homologue Compose/PostgreSQL/backup/restore/SMTP staging.

**Aceite:** testes de caracterização; crash entre lease/aplicação recupera; restart não duplica; restore documentado; versão anterior continua compatível com schema expandido. **Rollback:** feature flag e fachada antiga até estabilização.

### Marco 2 — pipeline e performance

**Objetivo:** reduzir entrada/memória/draw calls e tornar importação determinística.

Implemente manifest de licença, glTF Validator, relatório de budgets, hashes, publicação atômica, KTX2/meshopt conforme medição, carregamento essencial/opcional, perfis de qualidade, resolução adaptativa com histerese e LOD/animation throttling.

**Aceite:** desktop modesto e dois celulares físicos; 1/8/16 avatares; FPS p50/p95, memória, boot e bytes registrados; nenhuma licença desconhecida no release; fallback visual. Não prometa WebGPU sem teste de fallback.

### Marco 3 — framework universal de interação

**Objetivo:** uma definição orientada a dados para porta, cadeira, balcão, jukebox, TV e banheiro.

Contrato contém ID, tipo, posição, alcance, prioridade, requisitos, slots, ação e feedback. Cliente escolhe e solicita; mundo revalida alcance/parede/estado/ocupação/cooldown. Reservas possuem owner/TTL/cancelamento. Migre uma interação por vez.

**Aceite:** dois usuários competindo, pacote repetido, reconnect, cancelamento, distância e obstrução; teclado, controle e touch. **Rollback:** adaptador ao handler legado por interação.

### Marco 4 — primeiro loop econômico

**Objetivo:** trabalho de balcão completo, divertido e seguro.

Sessões de 3–5 min, pedidos variados, cooperação, feedback, recompensa server-side idempotente e sinks existentes. Telemetria mede duração, abandono, ganho e gasto. Preços ficam configuráveis e são ajustados só com dados.

**Aceite:** jogador novo completa em ≤5 min; retries/races não duplicam; recompensa e compra são atômicas; admin/ledger explicam cada alteração; evento não causa perda permanente. Sem dinheiro real.

### Marco 5 — seleção e implantação de um novo avatar

**Proibição:** não usar Avatar V2/Antonia nem Quaternius. Não fazer correções artísticas neles.

Selecione no máximo três candidatos gratuitos e de licença comercial clara a partir de `docs/auditoria/09-ASSETS-E-FERRAMENTAS.md`. Produza uma cena comparativa dentro do BarBoteco com a mesma câmera e iluminação. Pare e obtenha aprovação visual explícita do responsável pelo produto. Somente o vencedor pode seguir para POC de rig, animação, roupas, props, performance, catálogo e multiplayer.

**Aceite:** identidade visual aprovada antes da integração; licença arquivada; corpos/variedade adequados ao bar; matriz frente/perfil/costas/sentado; 16 avatares no budget; criador, rede, reconnect e roupas. Migração por feature flag. Após paridade, excluir os dois sistemas rejeitados e seus assets não usados.

### Marco 6 — social, moderação e acessibilidade

Celular mínimo (amigos/convites/notificações), fluxo de denúncia/moderação, retenção/exclusão, controle/touch, remapeamento básico, redução de movimento e contraste. Não implementar feed/marketplace/chamada antes de política e capacidade de moderação.

### Marco 7 — beta

Soak 2 h, carga 16/32/48, falhas de DB/API/mundo, backup/restore, alertas e runbooks. Defina SLO, hardware suportado, termos/política e resposta a incidente. Release somente sem P0/P1 aberto.

## 6. Contratos técnicos

- Entradas HTTP/WebSocket validadas por schemas compartilhados quando públicas.
- Todo comando repetível: `requestId`; toda mudança de saldo/inventário: ledger.
- Tickets curtos, uso único e sessão revalidada; segredos distintos por finalidade.
- Estado público exclui e-mail, saldo, inventário privado, tokens e cartas ocultas.
- Movimento horizontal continua validado pelo shared; cliente não escolhe Y.
- Animação replica estado/start time, não bones por frame.
- Mídia externa é opcional e deve degradar sem impedir gameplay.
- Voz permanece efêmera, com mute/block e sem gravação.

## 7. Pipeline 3D

Blender usa metros/+Y. Prefixos: `GEO_`, `COL_`, `INT_`, `SEAT_`, `SPAWN_`, `NPC_`, `NAV_`, `AUDIO_`, `LIGHT_`, `DOOR_`. IDs são contratos estáveis. Export produz visual, colisão/dados, manifest/hash e relatório. Reimportação falha ao remover marcador obrigatório e nunca publica saída parcial.

O nome e a hierarquia do rig canônico serão definidos somente após aprovação do novo asset. Requisitos: máximo 4 pesos normalizados, root motion removido da locomoção, sockets de mãos/cabeça/costas/quadril, máscaras e compatibilidade no manifest. Skins premium independentes podem manter rig de origem e receber animações por adaptador enquanto continuarem no catálogo.

Animações têm nome, fonte/licença, loop, duração, velocidade nominal, blend, máscara, prioridade, locks, prop e fallback. Feet sliding é corrigido por velocidade nominal/play rate, não por tentativa visual manual.

## 8. Segurança, privacidade e moderação

Corrija dependências, limite body/frame/comando, use CSP e headers no edge, não registre segredos/áudio, faça secret scan e testes de autorização. Defina retenção de denúncia/auditoria, exportação/exclusão de conta e aviso de voz/YouTube. Owner/admin segue menor privilégio; ações têm auditoria e reversão quando semanticamente segura.

## 9. Testes e qualidade

Pirâmide: regras puras; serviços com PostgreSQL; sala com WebSocket real; E2E multiusuário; visual/performance em hardware. Teste pacote adulterado, duplicado, atrasado, corrida, reconnect e falha parcial. Não enfraqueça assertion para fazer teste passar; conserte causa ou documente mudança de requisito.

Budgets iniciais: desktop modesto 60 FPS médio/p95 ≤22 ms, piso suportado 30 FPS; mobile 30 FPS/p95 ≤38 ms; bootstrap comprimido ≤25 MiB; mapa essencial ≤12 MiB; cena estática ≤100 draw calls e avatar ≤8 no passe principal. São hipóteses: medir e registrar ajuste justificado.

## 10. Formato obrigatório do relatório de cada marco

```markdown
# Marco N — nome
## Contexto confirmado
commit, status, baseline e limitações
## Objetivo e escopo
arquivos/módulos permitidos e fora de escopo
## Implementação
contratos, decisões e migrações
## Testes
comandos, resultados, contagens e ambiente
## Critérios de aceite
cada critério: passou/falhou/não verificado + evidência
## Resultado
arquivos alterados e comportamento real
## Riscos e pendências
sem esconder warnings/falhas
## Rollback
passos não destrutivos
## Próximo passo
uma ação objetiva
```

## 11. Mecanismo de continuidade

Mantenha:

- `docs/execucao/PLANO.md`: marcos, dependências e ordem;
- `docs/execucao/ESTADO.md`: marco atual e próximo passo;
- `docs/execucao/DECISOES.md`: ADRs resumidas e links;
- `docs/execucao/TESTES.md`: último resultado por suíte/ambiente/commit;
- `docs/execucao/PROBLEMAS.md`: bugs, riscos, bloqueios e dono.

Atualize ao final de cada marco. Nunca dependa do histórico de chat para retomar. Não marque pronto sem evidência. Se faltar licença, credencial, decisão de produto ou hardware, pare no limite seguro, registre o bloqueio e peça a decisão específica.

## 12. Primeira ação

Comece exclusivamente pelo Marco 0. Inspecione o estado atual, reproduza as duas falhas registradas, retire o laboratório rejeitado do gate, substitua a dependência Quaternius por fixture neutra e valide todos os gates. Não selecione nem integre o novo avatar, não inicie modularização, empregos ou outras features durante esse marco.

