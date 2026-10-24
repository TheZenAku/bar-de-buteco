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
