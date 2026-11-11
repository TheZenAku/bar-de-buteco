# EMPRESA BRASIL — relatório de implementação da Fase 1

Data: 10/11/2026. Nada foi publicado e nenhuma migração foi aplicada.

## Entregue

- `assets:fabrica`, com validação de 48 marcadores, 25 vagas, GLBs e cópia para web/servidor;
- tipos, receita, cubicagem, qualidade/rendimento, janelas de horário e máquinas puras em `@bar/shared/factory`;
- migrações expansivas e reexecutáveis 029/030;
- `FactoryDirector` autoritativo, vazio por padrão, tick industrial a 4 Hz e pausa segura sem operador/em emergência;
- categoria administrativa “Fábrica” com estado JSON, estoque por vaga e reset; UUID, motivo, confirmação, papel de admin e log são validados no servidor;
- resumo em “Mundo ao vivo”;
- documentação de fábrica/emprego e notas nos sistemas existentes.

## Validação executada

```text
npm run assets:fabrica
Fábrica importada: 48 marcadores, 25 vagas, sha256 ade9b5c93491.

npx tsx --test apps/server/test/factory.test.ts
tests 3 · pass 3 · fail 0

npx tsx --test tests/integration/factory.test.ts
tests 5 · pass 5 · fail 0

npx tsx --test --test-name-pattern="EMPRESA BRASIL" tests/integration/city.test.ts
tests 1 · pass 1 · fail 0

npm run typecheck -w @bar/web
npm run typecheck -w @bar/server
npm run typecheck -w @bar/api
todos concluídos sem erro

node --test tests/tools/infra.test.mjs
tests 3 · pass 3 · fail 0

npx tsx --test apps/api/test/migrations.test.ts
tests 10 · pass 10 · fail 0
```

A tentativa de filtrar a suíte do servidor pelo script npm passou o argumento depois do glob e iniciou a suíte inteira. Antes da interrupção, dois testes preexistentes falharam por timeout/comportamento de mundo (`the world reports...` e `administrative vehicle changes...`). Os testes novos foram então executados diretamente e passaram.

`npm run assets:map` falhou antes do import porque `assets-bar/map/BarBoteco/export/bar_boteco.glb` está ausente. O worktree já registra esse arquivo como excluído; não foi restaurado nem substituído. Por isso não foi possível regenerar/publicar os números novos da cidade nem executar a suíte completa da cidade sobre a saída nova.

## Ainda não entregue

As Fases 2–7 do prompt não estão implementadas: API/UX completa de emprego, logística ligada ao caminhão, persistência real do diretor, interações de campo, processo ponta a ponta, cena instanciada, SCADA, HUD, efeitos/áudio, administração A–M completa, comandos de chat, carga de 10 minutos, e2e, capturas e medição gráfica antes/depois.

Não há números de desempenho nem capturas porque ainda não existe uma cena operacional completa. O modelo também não oferece nós móveis para esteira, bico, válvula rotativa, queimador, ciclone, exaustor ou telas individuais; movimento real dessas peças pede nova exportação do Blender. Até lá, a alternativa prevista são efeitos leves ancorados nos marcadores.

## Migração

Antes de iniciar uma versão futura da API que use as novas tabelas:

```sh
npm run migrate -w @bar/api
```
