# Garagem, placa, chave e tranca

Todo veículo comprado fica guardado numa garagem, tem placa, e quem tem a chave é o dono. O estado de cada veículo, como um farol quebrado, fica salvo no banco e continua igual mesmo depois de o servidor reiniciar.

## Garagens

Há duas, na rua ao lado do bar, com um anel ciano no chão e o ícone no minimapa. As duas também aparecem no app **Mapas**.

| Garagem | x | y | z | Rotação |
| --- | --- | --- | --- | --- |
| Garagem 1 | -13,25 | 0,15 | -8,30 | -1,596 rad |
| Garagem 2 | -13,16 | 0,15 | -2,93 | -1,592 rad |

Em cima do anel, **E** abre a lista de veículos de que o jogador tem a chave, com a placa, o estado geral, os quilômetros e o que está mais gasto.

| Situação | Botão | O que faz |
| --- | --- | --- |
| Guardado | **Retirar** | O veículo sai na rua mais perto do anel, trancado e do jeito que entrou |
| Na rua, a até 16 m da garagem | **Guardar** | Entra de graça. Se alguém estiver pilotando, desce na hora |
| Na rua, mais longe que isso | **Trazer de guincho** | Vai para a garagem pelo preço do guincho (`vehicle:tow`) |

- Pilotando devagar (até 1 m/s) em cima do anel, **E** abre a garagem em vez de descer da moto.
- **Um veículo na rua por vez**, por jogador. Para tirar outro, guarde o primeiro.
- A moto comprada não aparece mais sozinha na base do Highfood. Ela sai da garagem.
- Sem o dono por 60 s, um veículo parado volta para a garagem. Ao reiniciar o mundo, todos voltam. Nos dois casos não há cobrança e o estado fica salvo.

Pode haver até 10 veículos no nome de um jogador, comprados ou negociados (`GARAGE.VEHICLE_LIMIT`).

## O que fica salvo

`player_vehicles` guarda a condição das 12 partes e os quilômetros de cada veículo, por placa.

- **Dano e conserto:** vão para a API em até 1 s depois de acontecer (`keepVehicles` em `BarRoom.ts`). Se o mundo cair de repente, perde-se no máximo esse último segundo.
- **Quilômetros:** vão a cada rodada de manutenção, de 3 s.
- **Ao sair do mapa:** guardar, despawnar, trocar de dono ou o dono ir embora grava o estado final na hora.
- **Se a API estiver fora do ar:** as atualizações ficam na fila da sala e vão quando ela voltar.

Não ficam salvos a posição, a tranca e se a moto estava caída. O veículo sempre volta de pé, trancado e na garagem. As motos spawnadas pela administração continuam existindo só na sala, como antes.

## Placa

Todo veículo tem uma placa no padrão Mercosul (`ABC1D23`), inclusive as motos da administração. A placa de um veículo comprado é única (restrição no banco) e nunca muda, nem quando ele troca de dono. As motos que já existiam receberam placas `HLD` na migração `014_garage_trade.sql`.

A placa aparece:

- na traseira da moto, em 3D;
- no botão direito na moto, com o nome do dono;
- em **Informações do veículo**, com o dono e se está trancada;
- na garagem, na mochila, no HighMotors e na negociação;
- na administração: em **Veículos**, na ficha do jogador e no log.

## Chave

Comprar um veículo dá a chave. Ela aparece na mochila (I) com **borda ciano forte e brilho**, cor que nenhum outro item tem, e a placa escrita no espaço. Ao passar o mouse ou clicar, a descrição explica que ela nunca cai.

- **Nunca cai da mochila:** nem ao desmaiar nem de outro jeito. Não tem botão de descartar e nenhuma mensagem do jogo a remove.
- **Não ocupa espaço:** uma mochila cheia não impede ninguém de ter um veículo.
- **Só sai por negociação:** a [troca](troca.md) é o único caminho. Quem fica com a chave fica com o veículo, do jeito que ele está.

**A chave não é uma cópia guardada à parte.** Ela é a coluna `user_id` da linha do veículo em `player_vehicles`, vista da mochila. Como essa coluna só guarda um valor, não existem duas chaves do mesmo veículo. Por isso `peca_moto` e os outros itens ficam em `item_inventory`, e a chave não.

## Tranca

| Quem | Trancada | Destrancada |
| --- | --- | --- |
| Quem tem a chave | Sobe normalmente | Sobe normalmente |
| Qualquer outra pessoa | Não sobe, e o aviso mostra a placa e o dono | Sobe e pilota, sem virar dono |

- O veículo sempre sai da garagem **trancado**. O dono só destranca quando quer emprestar.
- **L**, o botão direito na moto ou **Informações do veículo** trancam e destrancam, a até 18 m. Toca um bipe gerado no navegador, que ninguém ouviu ainda.
- Trancar com alguém em cima não derruba ninguém. A tranca vale para a próxima subida.
- Uma moto caída pode ser levantada por qualquer um, trancada ou não, e qualquer um pode consertar. O desgaste de quem pegou emprestado fica na moto do dono.
- Para as entregas do Highfood só conta o veículo de que o próprio jogador tem a chave.

## Administração

- **Highfood → Dar ou tirar a moto:** dar cria um veículo novo. Para tirar de quem tem mais de um, é obrigatório informar a placa.
- **Jogadores → ficha:** lista os veículos de cada um.
- **Veículos:** mostra placa, dono e tranca. Despawnar a moto de alguém a devolve para a garagem com o estado salvo.
- **Logs:** retirar, guardar, trancar e negociar ficam registrados.

## Como funciona

| Parte | Onde |
| --- | --- |
| Posições, limites, placa, texto da chave | `packages/shared/src/garage.ts` |
| Veículos e placas no banco | `apps/api/src/highfood-service.ts`, migração `014_garage_trade.sql` |
| Sair, guardar, tranca e gravação do estado | `apps/server/src/BarRoom.ts` |
| Painel da garagem e bipe | `apps/web/src/garage-panel.ts` |
| Placa em 3D | `Motos.plate` em `apps/web/src/engine/moto-delivery.ts` |
| Anéis | `updateGarages` em `apps/web/src/engine/BarScene.ts` |
| Chave na mochila | `renderInventory` em `apps/web/src/main.ts`, `apps/web/src/trade/trade.css` |

| Mensagem | Quem envia | Para quê |
| --- | --- | --- |
| `player.interact` com `garagem-1` ou `garagem-2` | Jogador | Abrir a garagem |
| `garage.take`, `garage.store` | Jogador | Retirar e guardar. Guardar de longe exige `recall: true`, para ninguém pagar o guincho sem querer |
| `moto.lock` | Jogador | Trancar e destrancar |
| `garage.state`, `garage.taken`, `moto.locked`, `food.owned` | Sala | O que mudou |

## Testes

| Teste | O que cobre |
| --- | --- |
| `apps/server/test/garage-trade.integration.test.ts` | API e banco reais com WebSockets reais: lista, longe recusa, placa, tranca, emprestar, farol quebrado chegando ao banco, **mundo reiniciado com a moto na rua e o farol continuando quebrado**, guardar de graça, guincho cobrado |
| `apps/api/test/vehicle-migration.test.ts` | Banco como o de hoje, com motos: migração preserva dono e estado, dá placas únicas, pode rodar de novo |
| `tests/e2e/garage-trade.spec.ts` | Dois navegadores: borda da chave, descrição, anel, painel, placa, menu, venda da moto e o comprador retirando e pilotando. As imagens vão para `test-results/garage-trade` |

## Limitações

- Só um veículo na rua por jogador.
- Só existe o modelo de moto.
- A posição não fica salva: quem reinicia ou fica ausente reencontra o veículo na garagem, não onde o deixou.
- O bipe da chave foi gerado por código e não foi ouvido.
