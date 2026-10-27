# Estado atual e inventário técnico

## Método e limitações

Foram inspecionados Git, manifests, código-fonte, migrações, infraestrutura, documentação, testes e assets locais. Foram executados `npm test`, `npm run build`, `npm audit --omit=dev` e `npm outdated`. Não foram alterados código, banco, dependências ou serviços. O teste E2E completo e o teste de carga não foram repetidos porque os gates anteriores já falharam. A varredura formal Codex Security não iniciou por ausência de Python real no host; a revisão estática continuou manualmente.

Estado Git: branch `main`, commit `54a4c6650ea06d6cbd2a82d0beaab8f3124581e8`, somente `bar-de-buteco - Atalho.lnk` não rastreado. Nenhum segredo foi reproduzido.

## Topologia

```text
apps/web       PlayCanvas 2.23.3 + Vite 8.3.5 + DOM/CSS
apps/api       Fastify 5.6.1 + Drizzle 0.45.4 + PostgreSQL/PGlite
apps/server    Colyseus 0.18 + sala autoritativa em memória
packages/shared contratos Zod, mundo, colisão, catálogos e tickets
tools          importadores de mapa, animação, skins, roupas, áudio e operação
tests          unidade, integração, navegador, laboratório legado de avatar e carga
infra          Docker Compose, nginx, migrations e exemplos de produção
```

Entradas: `apps/web/src/main.ts`, `apps/api/src/index.ts`, `apps/server/src/index.ts`. Rede: HTTPS/JSON/cookie para API e WebSocket Colyseus para mundo; segredo compartilhado protege chamadas API↔mundo. Banco: PostgreSQL nativo em produção e PGlite local.

## Inventário classificado

| Subsistema | Classificação | Evidência |
| --- | --- | --- |
| Autenticação/sessão | Funcional, refatorar | Argon2id, tokens hash, cookie HttpOnly, recuperação revoga sessões em `apps/api/src/auth/service.ts` e `app.ts`; falta homologação externa |
| Multiplayer | Funcional, refatorar | sala singleton, tick 20 Hz, patch 10 Hz, AOI 18 m, reconexão 30 s em `BarRoom.ts`; estado volátil e arquivo central grande |
| Movimento/colisão/câmera | Funcional e reutilizável | `packages/shared/src/world.ts`, dados importados e testes de escada, parede, câmera e interação |
| Mapa | Funcional, pesado | GLB visual 16,37 MiB + colisão 0,27 MiB; pipeline em `tools/assets/import-map.mjs`; 503 colisores documentados |
| Quaternius legado | Funcional tecnicamente, rejeitado artisticamente | corpo, roupas, cores e persistência existem, mas o asset não deve ser a base visual futura |
| Avatar V2 | Rejeitado artisticamente | laboratório e 63 GLBs existem, mas o asset não deve ser integrado, polido nem usado como fallback final |
| Novo sistema de avatar | Ausente | requer seleção visual de asset gratuito, POC PlayCanvas e aprovação explícita antes da implementação |
| Skins premium/rigs | Funcional, reutilizável | rigs nativos e bancos por skin; validações de joints/weights passaram |
| Animação | Funcional, risco legal | estados e retargeting reais; licenças dos FBX não verificadas; lógica ainda espalhada no `BarScene` |
| Inventário/economia | Funcional, incompleto como loop | transações/ledgers/idempotência; ganhos normais desativados, logo não há loop econômico orgânico |
| Necessidades | Funcional | vida/fôlego/fome/sede/bexiga/embriaguez testados no shared e no servidor |
| Blackjack | Funcional | até 4 lugares, cartas privadas, turnos, estatísticas; sem apostas conforme escopo |
| NPCs/eventos | Funcional, limitado | FSMs predeterminadas e três eventos; não é framework orientado a dados |
| Interações | Funcional, acoplada | alcance e catálogo compartilhado, mas execução é uma grande árvore de casos no servidor/cliente |
| Voz | Funcional, experimental | WebCodecs Opus/µ-law, relay por distância; custo de banda/compatibilidade precisa medição real |
| Jukebox/TV | Funcional com dependência externa | IFrame API, timeline autoritativa e atenuação; políticas/disponibilidade do YouTube são risco externo |
| Áudio ambiente | Funcional | shuffle bag, crossfade e ducking; seis M4A, 16,57 MiB |
| Dia/noite/fog | Funcional | ciclo 40 min, luzes, sombras e fog; precisa perfis de qualidade por hardware |
| UI/UX | Funcional, refatorar | DOM/CSS, toast, painéis e responsividade; `main.ts` mistura estado, apresentação e comandos |
| Administração | Funcional | owner protegido, delegação, moedas, kick/ban/eventos, reversões e auditoria persistente |
| Observabilidade | Parcial | logs JSON no mundo e health endpoints; sem métricas, tracing, alertas ou crash reporting |
| Deploy | Parcial | Docker/nginx/Compose presentes; não homologados neste ambiente |
| Testes | Abrangentes, gate quebrado | API 22/22, server 19/19, integração 50/51 nesta execução; build falhou |
| Mobile/toque/controle | Ausente/parcial | CSS responsivo existe; controles centrais continuam teclado/mouse; mobile não medido |
| Empregos/celular/poker/moto | Ausente | aparecem na visão futura, não há implementação integrada |

## Persistência

O schema contém usuários, perfis, carteiras, inventários de skin/item, dois ledgers, sessões, verificação, reset, bloqueios, denúncias, ações administrativas, estatísticas, resultados e controles. Compras e reversões usam transação e chaves idempotentes. O mundo, NPCs, rodadas e eventos ficam em memória e se perdem ao reiniciar.

## Escala e composição

- 147 arquivos TS/MJS/CSS/HTML e aproximadamente 12.476 linhas.
- Maiores concentrações: `BarScene.ts` 1.132, `BarRoom.ts` 673, `main.ts` 522.
- `apps/web/public`: 53 arquivos, 104,99 MiB; 25 GLBs somam 80,5 MiB.
- Fontes em `assets-bar`: 701 arquivos, 595,3 MiB, incluindo 523 FBX.
- `BAR_Avatar_V2/export`: 104 arquivos, 11,4 MiB e 63 GLBs que passam a ser dívida de remoção, não investimento reutilizável.

## Evidência de execução

- **TESTADO:** API 22/22 e servidor 19/19 passaram.
- **TESTADO:** integração 50/51; roupas falharam por `ENOENT` na fonte externa ausente.
- **TESTADO:** build/typecheck falhou em testes do Avatar V2 rejeitado; o plano é isolá-los/removê-los junto do laboratório.
- **NÃO EXECUTADO nesta auditoria:** E2E, carga e Docker, pois o gate básico não ficou verde.
- **HISTÓRICO DOCUMENTADO, não repetido:** o laboratório já passou em execuções anteriores, mas isso não o torna aceitável artisticamente nem candidato ao produto.

