# Abastecimento com frentista

As três bombas do posto em `Ponto_Posto` (aproximadamente x −254, z 87) atendem carros e motos. Estacione a até 4,5 m da bomba, com passagem livre até o tanque, pare completamente e desligue o motor. **E** solicita o atendimento. O botão do painel do veículo usa o mesmo comando. Garagens não abastecem instantaneamente.

Cada bomba tem um frentista e uma máquina de estados independente: autorização → caminhada à bomba → retirada do bico → caminhada ao veículo → inserção → abastecimento → retirada → retorno à bomba → devolução → pagamento → retorno ao ponto de espera. O motorista e os passageiros ficam no veículo; direção, partida e saída são recusadas pelo servidor. A câmera continua disponível. **Interromper abastecimento** encerra o fluxo pela retirada e devolução do bico, cobrando somente o consumo registrado.

## Integração

- `packages/shared/src/refueling.ts`: bombas derivadas dos colliders reais `COL_Cid_Bomba`, orientação, pontos do tanque por modelo, preço por bomba (6 moedas/L), velocidade de 1,2 L/s e contratos públicos.
- `apps/server/src/world/refueling.ts`: sequência autoritativa, caminhos que reutilizam a navegação do mapa e contornam veículos, cancelamento e retomada de pagamentos. Posições e animações são replicadas pelo Colyseus, com os NPCs na mesma área de interesse dos demais personagens.
- Combustível continua em `Moto.fuel`, em percentual, e na persistência de veículos existente. Capacidades: 42 L no hatch, 5,5 L na moto. Nenhuma equação de direção ou física foi modificada.
- `apps/web/src/engine/fuel-props.ts`: bico separado e mangueira segmentada ligados à bomba. O bico segue o punho real depois da solução de braços. O modelo próprio `frentista` usa Idle/Walk adaptados ao seu esqueleto; retirada, inserção e devolução usam o sistema de dois ossos já usado para servir pedidos. Tronco e joelhos se inclinam para alcançar a tampa. Sem clips específicos, a pose procedural continua executando as ações.
- `apps/web/src/fuel-hud.ts`: progresso, percentual, litros, moedas e interrupção. A notificação final confirma litros e pagamento. E tem prioridade sobre a saída quando há uma bomba disponível, e não executa saída durante atendimento.

## Modelo do atendente

O visual do atendente vem de `assets-bar/skins/Frentista/frentista.glb`. Para reconstruir o modelo publicado, execute `node tools/assets/import-mixamo.mjs frentista`: ele gera `apps/web/public/models/frentista.glb`, com textura incorporada, 65 ossos Mixamo com nomes canônicos e altura de 1,80 m. Idle, Walk e Pose ficam no próprio modelo; o cliente não solicita bancos de ações, danças ou bengala para esse NPC. Todos os atendentes das bombas usam essa skin, exclusiva do serviço de abastecimento.

Aplicar a migração **019_fuel_services.sql** pelo procedimento normal de migração da API antes de iniciar esta versão. Ela acrescenta reservas e protege o saldo reservado contra débitos simultâneos de outros sistemas. A reserva não desconta moedas: o saldo só muda após o bico ser devolvido. A reserva limita o volume à quantidade pagável; ao atingir esse limite, o NPC finaliza normalmente. Tanque cheio e saldo zero são recusados antes de retirar o bico.

A carteira e o livro-caixa existentes continuam sendo usados. O preço é arredondado para moedas inteiras uma única vez sobre o total de litros. A identidade do atendimento torna reserva, cobrança e novas tentativas idempotentes. Desconexões interrompem o fluxo e o NPC devolve o bico. Se a API cair, a bomba aguarda confirmação do pagamento e repete a mesma operação, sem nova cobrança.

O diário durável usa o `FileOutbox` existente, ao lado de `WORLD_OUTBOX_PATH`, com sufixo `.fuel.jsonl`. Ele registra o custo antes de liberar o combustível correspondente. No reinício do servidor, atendimentos interrompidos são acertados com a mesma identidade e reservas sem consumo são liberadas; o mundo 3D reinicia com os bicos nas bombas, como os demais NPCs. O processo depende da preservação desse diário, assim como os acertos dos minijogos existentes. O combustível usa a rotina de persistência existente; um encerramento abrupto ainda pode perder a última fração que não chegou à API.

## Validação

- `apps/server/test/refueling.test.ts`: sequência completa na primeira bomba, deslocamento sem teleporte, limite de moedas, tanque cheio, motor ligado, velocidade lateral, cancelamentos em cada etapa, desconexão, indisponibilidade da API e moto.
- `apps/server/test/refueling.integration.test.ts`: sala Colyseus e carteira reais; bloqueia acelerador, partida e saída; replica estados; cobra uma vez somente após a devolução.
- `apps/api/test/fuel.test.ts`: reserva sem débito, gasto concorrente, acerto após logout e repetição idempotente.
- `tests/e2e/refueling.spec.ts`: PlayCanvas real no navegador, caminhada animada, bico no punho, ponta no tanque, devolução e fallback sem clips. Capturas em `test-results/previews/fuel-*.png`.

Executar `npm run typecheck`, os testes das duas workspaces e `npx playwright test --project=refueling`. O teste de carro existente também foi adaptado para o atendimento no posto.
