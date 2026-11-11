# Relatório final — EMPRESA BRASIL

Data da validação: 11/11/2026. Nenhuma VM foi acessada, nenhum deploy foi feito e nenhuma migração foi aplicada em produção.

## Entrega

Foram entregues as migrações expansivas `029_employment.sql` e `030_factory.sql`, serviço persistente de emprego, serviço transacional da fábrica, `FactoryDirector` autoritativo, estoque de 25 vagas, pedidos e carga no baú real do caminhão, SCADA, perfil **Meu emprego**, categoria administrativa A–M, comandos de chat, visualização dinâmica limitada por vaga, tutorial, documentação e testes.

O ciclo implementado cobre: contrato e expediente, EPI, retirada concorrente de sacos, preparo dos três tanques, qualidade, secador, falhas, alarme/emergência, silo, ensaque, costura, paletização, pedidos de compra/venda e pagamento idempotente. Estado e vagas são salvos atomicamente; processos ativos voltam em `PAUSADO` depois de restart. Reconexão durante turno persistente volta a registrar o jogador como operador no mundo.

Para aplicar em um ambiente autorizado, antes de iniciar a API nova:

```sh
npm run migrate -w @bar/api
```

## Evidência executada

| Verificação | Resultado |
|---|---|
| `npm run assets:fabrica` | passou — 48 marcadores, 25 vagas, SHA `ade9b5c93491` |
| cidade + regras compartilhadas | 24/24 passaram |
| `apps/server/test/factory.test.ts` | 9/9 passaram |
| API emprego/fábrica/catálogo/baú | 5/5 passaram |
| veículos administrativos após incluir caminhão | 1/1 passou |
| `npm run typecheck` | passou em API, servidor, web, shared e raiz |
| `npm run build` | passou — 1.739 módulos, build Vite em 3,65 s |
| Playwright `factory` | passou em 28,2 s; 12 sacos retirados/despejados e ensaque real |
| carga industrial | 2.400 ticks, 6 operadores, 2 fluxos, 10 min simulados; sem perda de reserva |

Saída do benchmark `npm run test:factory-load` nesta máquina:

```json
{"ticks":2400,"tickMs":{"average":0.0008769583,"p50":0.0002,"p95":0.0008,"maximum":0.7773},"revision":2400,"reservations":2}
```

O cliente E2E, em 1440×900, preset alto e dentro de S07_04, registrou 55 FPS, 469 draw calls globais, 348 entidades visíveis, 7 setores completos e 53 LODs visíveis. O asset original informado no pacote tem 82 chamadas estáticas no setor. Esses números não formam um A/B puro: 82 é a auditoria isolada do asset, enquanto 469 é o quadro global do jogo com HUD, avatar e setores vizinhos. A fábrica adiciona no máximo 25 entidades de vaga e uma luz sem sombra; não cria uma entidade por saco. Uma comparação GPU antes/depois estrita exige o mesmo commit sem/com o recurso, mesma câmera e coleta de 30–60 s pela ferramenta de desempenho.

As capturas validadas estão em `docs/fabrica/capturas/`: tanque pronto, secador pronto, secador produzindo, primeiro saco ensacado e perfil de emprego. O teste recusa capturar quando existe notificação de erro.

## Regressões encontradas e corrigidas durante a validação

- O sexto veículo do catálogo era descartado pelo limite antigo de cinco spawns administrativos; o limite agora acompanha a capacidade do mundo.
- Um turno persistido não recolocava o jogador no conjunto vivo de operadores ao reconectar; `employment.view` agora reconcilia o estado.
- A fixture de localização permitia somente cinco estações por rajada e bloqueava o ciclo E2E industrial; o handler existe apenas em `NODE_ENV=test` e agora comporta o percurso completo.
- O E2E reinicializa a ensacadeira que corretamente voltou em `PAUSADO` após uma execução interrompida.

## Limitações honestas

- `assets-bar/map/BarBoteco/export/bar_boteco.glb` já estava ausente no worktree. Por isso `npm run assets:map` completo não foi executável. `npm run assets:city` publicou e validou somente a cidade, preservando o GLB-base servido.
- O Node instalado é 26.12.1, fora do intervalo declarado pelo projeto (`>=24 <25`). O build e os testes de escopo passaram, mas isso aumenta a variância dos testes WebSocket temporizados.
- O conjunto completo do servidor havia terminado com 276/282 testes. Na repetição isolada com o `tsconfig` correto, `needs` passou e a regressão de `admin-vehicles` foi corrigida; continuam instáveis quatro testes antigos fora da fábrica: conquistas (timeout de consumo), luta (diferença de 1 ms), moto/morte (corrida de estado) e movimento da sala (passo exato). Eles não atravessam código industrial, mas impedem afirmar que `npm test` global está verde neste ambiente.
- Telas individuais, esteira, bico, válvula rotativa, queimador, ciclone e exaustor são malha estática. Para movimento físico dessas peças é necessária nova exportação do Blender. A entrega usa SCADA e estado/efeitos leves, sem inventar geometria.
- O painel expõe os grupos A–M e todas as mutações passam pelo servidor. Ainda não há editor persistente completo para modos de teste, política global de vagas/cooldown, pagamento manual de salário nem reconstrução/exclusão histórica de lotes. Esses itens exigem ampliar `factory_settings`, `factory_batches` e a política econômica; não foram apresentados como persistentes quando ainda não são.
- A atualização do SCADA usa snapshot a 2 Hz enquanto aberto, não delta binário. O polling cessa ao fechar e é limitado por proximidade/autoridade.

## Arquivos de referência

- `docs/sistemas/fabrica.md`
- `docs/sistemas/emprego.md`
- `tests/e2e/factory.spec.ts`
- `tests/load/factory.ts`
- `apps/server/test/factory.test.ts`
