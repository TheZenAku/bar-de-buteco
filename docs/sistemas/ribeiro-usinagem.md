# Ribeiro Usinagem e Ferramentaria

O sistema da Ribeiro é autoritativo no servidor e persiste o estoque, as ordens, os ciclos e os produtos finalizados. O terminal RF-01 fica em `345,93 / 0,15 / 316,07`; nele o funcionário abre OPs para todas as armas do catálogo atual e solicita matéria-prima pelo HighCargo.

O estoque físico fica em `339,48 / 0,15 / 314,65`, rotação `-0,060 rad`. `E` abre diretamente a relação de produtos finalizados; retirar uma unidade desconta o estoque autoritativo e registra a arma no arsenal persistente do jogador. Uma arma já possuída ou uma falha da API não consome o saldo.

## Fluxo industrial

1. **Recebimento** (`342,90 / 0,15 / 321,58`): o GPS do HighCargo conduz o caminhão até esta doca. Estacionado no círculo, ele é descarregado pela equipe.
2. **Preparação** (`350,49 / 0,15 / 320,32`): o operador retira a matéria-prima reservada para a próxima OP.
3. **Corte e preparação**: o operador calibra a medida do batente dentro da tolerância; aprovado o minigame, uma das quatro máquinas processa a peça por oito segundos.
4. **Usinagem**: o operador executa a sequência de comandos CNC antes do ciclo de dez segundos em uma das duas máquinas.
5. **Furação e acabamento**: o plano de furação exige selecionar os pontos na ordem técnica. Depois do ciclo de sete segundos, a retirada exige um segundo minigame de regulagem do acabamento superficial. Como ainda não há coordenada própria de acabamento, ele acontece no controle da mesma furadeira.
6. **Montagem**: três bancadas montam a arma por doze segundos.
7. **Estoque**: a conclusão da montagem registra automaticamente uma unidade no estoque da fábrica.

O jogador transporta somente o estado lógico da peça; esta versão não cria props. Ao sair durante um transporte, a OP volta à preparação para não deixar uma peça inacessível no mundo. Um ciclo de máquina interrompido por reinício volta pronto para retirada; uma montagem concluída durante a interrupção é registrada no estoque.

Os desafios têm duração máxima de 60 segundos, reservam a estação para um operador e são validados pelo servidor. Sair do alcance, fechar o desafio ou errar a sequência não avança a OP.

## Matéria-prima e HighCargo

As receitas consomem aço 4140, alumínio 7075, polímero técnico e conjuntos de mola. Cada palete solicitado representa 18 volumes. O pedido aparece no aplicativo HighCargo para motoristas habilitados, com coleta no fornecedor e retorno à doca correta da Ribeiro; sem motorista, a entrega automática do fornecedor continua disponível.

As coordenadas, receitas e contratos ficam em `packages/shared/src/machine-shop.ts`; a regra autoritativa em `apps/server/src/world/machine-shop.ts`; o terminal e as interações em `apps/web/src/machine-shop/controller.ts`. O estado usa o registro persistente `ribeiro-state` no serviço interno da API.
