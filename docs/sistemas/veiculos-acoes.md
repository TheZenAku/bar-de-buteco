Verificação de posse e ações dos veículos, implementadas e verificadas em 04/11/2026.

A auditoria da API local em uso (`/api/internal/vehicles/ownership-audit`, protegida pelo segredo interno) encontrou **139 contas, 3 proprietários de moto, 4 motos, 4 compras e nenhuma concessão administrativa**. Não foi encontrada distribuição da moto para todas as contas. O identificador `moto-delivery` continua sendo o da moto anterior: quem já tinha comprado uma moto vê a v4. Nenhuma compra foi removida. O teste da API confirma que duas contas novas não possuem veículo nem chave, e que a compra por uma delas não concede nada à outra. Os testes de navegador usam outra API e outro banco, em `.local/e2e`, sem alterar essas contas locais.

| Ação | Controle e comportamento |
| --- | --- |
| Bag do Highfood | Ao montar durante o turno, a bag v3 é encaixada em `ponto_bau`. Ao desmontar ou sair do turno, a bag da moto é destruída; a mochila volta ao piloto a pé. O mesmo encaixe aparece nos outros clientes |
| Buzina de moto/carro | Segurar F enquanto dirige. A moto usa um tom mais agudo e o carro dois tons mais graves. Áudio posicional até 65 m, com volume geral e limite de vozes. B continua sendo a tecla do microfone no modo apertar para falar |
| Grau de moto | Segurar Shift com o motor ligado e velocidade para a frente acima de 1,2 m/s. Sobe suavemente até 34°. Soltar Shift, frear, dar ré, perder os comandos ou desmontar baixa a frente. Carros ignoram o grau |
| Empinada do cavalo | Pressionar Shift montado. Empinada de 1,8 s, até 48°, com patas dianteiras flexionadas, piloto acompanhando a sela e relincho. A ação fica parada; depois pode retomar o galope com Shift e movimento. Intervalo mínimo de 2,8 s e uma ação por pressão, sem repetir só por manter a tecla |

O servidor limita quem pode acionar cada veículo, conserva o estado da buzina/grau e o timestamp da empinada. Após 250 ms sem comando do motorista, a buzina desliga e o grau baixa. Som e animação são derivados desse estado público. O relincho é a gravação CC0 [Neighing of a horse, nº 0460, de Joseph SARDIN / BigSoundBank](https://bigsoundbank.com/neighing-of-a-horse-s0460.html), distribuída localmente; créditos em `mounts/sound/CREDITS.txt` e origem em `assets-bar/sounds/cavalo/NEIGH_SOURCE.txt`.

Grau e empinada são poses controladas sobre a simulação existente, sem introduzir uma simulação de equilíbrio ou tombos para trás. As colisões do veículo continuam usando os cascos compartilhados. O grau gira o conjunto sobre o eixo traseiro, preservando a altura da roda traseira. Os nós dos GLBs e os scripts do Blender não foram alterados.

Arquivos principais: `packages/shared/src/vehicle-actions.ts`, `moto.ts` e `index.ts`; `apps/server/src/BarRoom.ts` e `state.ts`; `apps/web/src/networking.ts`; `engine/moto-delivery.ts`, `horse-mount.ts`, `horse-sound.ts`, `vehicle-horn.ts`, `BarScene.ts` e `scene-types.ts`; ajuda em `lobby-menu.ts`, `vehicle-hud.ts` e `car-panel.ts`. A auditoria está em `apps/api/src/highfood-service.ts` e `app.ts`; o importador de áudio é `tools/assets/import-horse-sounds.mjs`.

Validação:

- `apps/api/test/highfood.test.ts` e `car.test.ts`: seis testes passaram, incluindo isolamento de posse, compra paga e acesso interno da auditoria.
- `tests/integration/vehicle-actions.test.ts`: quatro testes passaram, cobrindo pré-condições, descida do grau, apoio da roda traseira, ciclo da empinada e schemas compatíveis com os comandos anteriores.
- `apps/server/test/vehicle-actions.integration.test.ts` e `horse.integration.test.ts`: passaram com WebSockets reais, autoridade do motorista, timeout da buzina, carro sem grau, empinada pública, bloqueio de repetição e desmontagem.
- `tests/e2e/moto-actions.spec.ts`: passou com dois navegadores sobre o servidor, compra/garagem/turno, bag encaixada para ambos, buzinas de moto e carro, grau e empinada/relincho replicados. Nenhum erro de console foi capturado.
- Regressão de moto, colisões, interpolação, assets, cavalo e ações compartilhadas: 39 testes passaram.
- `tests/e2e/horse.spec.ts`, cenário do rig real: passou com sela, mãos/pés, rédeas e poses nas quatro direções, caminhada, galope e desmontagem.
- `npm run assets:horse:sound` e `npm run build`: passaram, incluindo os typechecks de todos os workspaces e dos testes. O Vite manteve o aviso de bundle grande já existente.

Capturas: [bag encaixada](../../test-results/vehicle-actions/01-highfood-bag-na-moto.png), [buzina da moto](../../test-results/vehicle-actions/02-moto-buzina.png), [grau com bag](../../test-results/vehicle-actions/03-moto-grau-com-bag.png), [após desmontar](../../test-results/vehicle-actions/04-highfood-desmontou.png), [buzina do carro](../../test-results/vehicle-actions/05-carro-buzina.png) e [empinada do cavalo](../../test-results/vehicle-actions/06-cavalo-empina-relincha.png). Telemetria em [verification.json](../../test-results/vehicle-actions/verification.json). Essas evidências locais ficam em `test-results`, ignorado pelo Git.
