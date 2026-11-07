# Caminhão baú e o inventário do baú

O Caminhão Baú é o terceiro veículo de quatro rodas (depois do Hatch 80), vendido no app **HighMotors** por `vehicle:caminhao` (60 000 moedas por padrão, editável em Preços). Tem dois lugares e um **baú de carga**: um inventário só dele, separado da mochila, que abre por trás.

O modelo vem do Blender (`scripts/59_caminhao.py` e `59a`…`59e`, `caminhao_textura.py`, no pipeline do bar). `npm run assets:caminhao` copia o GLB, a colisão e a foto para `apps/web/public/caminhao/` sem alterar o GLB: o jogo acha ossos, malhas e materiais pelo nome.

## O veículo

O áudio do caminhão é próprio (`TruckSounds`): gravações reais de diesel, sem o
sintetizador do Hatch. Partida e desligamento seguem `engine`/`engineAt`; tentativas
sem sucesso usam um loop do arranque. Marcha lenta e aceleração do Iveco Daily
misturam-se com o pedal e a velocidade, com seis faixas de marcha e queda de rotação
nas trocas. O pedal previsto localmente evita esperar a resposta da sala.
A aceleração usa o trecho de acelerações leves 1146, em vez do antigo loop de
grandes acelerações 1147. A faixa de reprodução fica entre 0,85× e 1,14× e um
filtro de agudos de 1,4 kHz atua só no motor, evitando o assobio na aceleração.
Buzina gravada enquanto pressionada e aviso de ré abaixo de −0,2 m/s também saem
da posição do caminhão. Até quatro caminhões próximos tocam ao mesmo tempo;
fora de 90 m as fontes são liberadas. O volume geral e a aba oculta silenciam o bus.

As gravações CC0 do BigSoundBank ficam em `assets-bar/sounds/caminhao/`, com autores
e links em `CREDITS.md`. `npm run assets:caminhao:sound` reproduz os sete recortes
WAV PCM mono de 48 kHz, com margem de pico e emendas sobrepostas, em
`apps/web/public/caminhao/sound/`. O manifesto contém cortes e hashes SHA-256.

O freio de mão usa o áudio compartilhado de todos os veículos, descrito em
[Ações dos veículos](veiculos-acoes.md): clique ao acionar/soltar e atrito dos
pneus somente durante movimento com a barra de espaço pressionada.

| | |
| --- | --- |
| Medidas | 2,2 m de largura (espelhos fora do casco), 5,4 m de comprimento, 2,55 m de altura; entre-eixos de 3,12 m; pneus de 0,43 m, rodas duplas atrás |
| Origem | no chão, no meio do entre-eixos; frente = +Z no glTF (como o carro) |
| Física | a mesma do carro (`stepCarDynamics`), com as constantes `TRUCK` de `packages/shared/src/vehicle-models.ts`: 3,8 t, 86 km/h no máximo, esterço que fecha cedo, curva de 5 m de raio |
| Lugares | 2: motorista (esquerda) e passageiro. `vehicleSeats(model)` e `carSpec(model).SEATS` dizem quantos e onde |
| Tanque | 110 L, 0,21 L/km; o bocal fica no lado esquerdo, junto ao tanque (`vehicleFiller`) |
| Peças | as 18 do carro. A **tampa do porta-malas** é a porta de enrolar do baú; o capô não existe (o comando é recusado) |
| Pintura | só a cabine (`Caminhao_Pintura`); o baú é alumínio |
| Luzes | faróis, lanternas, ré, setas e a luz interna (acende com o baú aberto) |
| Comandos | os do carro, menos capô e porta-malas (U): o baú abre pela traseira |

`isCar()` passou a valer para o Hatch e o caminhão (tudo que é quatro rodas); `isHatch()` e `isTruck()` pegam um modelo só. As regras do carro (física, peças, combustível, portas, mochila de peças) continuam as mesmas para os dois.

## O baú

- **Quem abre:** só quem tem a chave. O caminhão do bar, sem dono, não tem baú.
- **Como:** de pé, atrás do caminhão, com ele parado (até 0,2 m/s) e em pé no chão. O prompt do **E** mostra "para abrir o baú do caminhão". Também há "Abrir baú" no menu do botão direito do veículo (a sala recusa se não estiver na traseira).
- **O que acontece:** a porta de enrolar sobe (o osso `porta_bau` escala o Y para 0,04 em volta do topo da abertura), a luz do baú acende, o painel abre com o baú de um lado e a mochila do outro. Escolher uma pilha e **Guardar/Retirar 1, 5 ou tudo**.
- **Limites:** 24 pilhas diferentes; cada item cabe até 10× o limite da mochila (`storageStackMax`). Para tirar, vale o limite da mochila (12 pilhas, `stackMax` do item).
- **Fecha sozinho:** ao fechar o painel (Esc), ao se afastar (fora da traseira), ao desmaiar, morrer ou sair do jogo, com 90 s sem mover nada, se o caminhão sair da rua (garagem, guincho) ou deixar de estar de pé. A sala avisa o cliente (`storage.closed`, com o motivo).
- **Só uma pessoa por vez** no mesmo baú, e cada pessoa tem um baú aberto por vez.
- **Carga desenhada:** o osso `carga_1…3` mostra caixas e barris por quanto o baú tem (`load`: 0 vazio, 1 a partir de 1 unidade, 2 de 25, 3 de 70). `MotoState.load` vem da sala e da lista de veículos da API (`OwnedVehicle.load`), então a carga continua certa depois de guardar e retirar o caminhão da garagem.
- **O baú acompanha o caminhão:** troca de dono (troca entre jogadores) leva o conteúdo junto; quem perde a chave deixa de abrir.

## Dados e segurança

- Tabela `vehicle_storage (vehicle_id, item_id, quantity > 0)`, migração `infra/migrations/024_vehicle_storage.sql` (só expande; **sem chave estrangeira** de propósito: a `014_garage_trade.sql` refaz a chave primária de `player_vehicles` e precisa continuar re-executável por cima de um banco pronto). `HighfoodService.setVehicle` apaga as linhas do veículo que a administração tira.
- `apps/api/src/vehicle-storage-service.ts`: a API é dona das quantidades, como na mochila. Toda movimentação é **uma transação** que trava a linha do veículo (serializa quem mexe no mesmo caminhão), reivindica o `requestId` no `inventory_ledger` (`storage-deposit:<id>` / `storage-withdraw:<id>`, então repetir o pedido não move nada de novo) e só então move. A mochila vira o ledger do jogador, com os motivos "Guardado/Retirado do baú do caminhão" no console da administração.
- Rota interna `POST /api/internal/vehicle-storage` (`action: view | move`), só com o segredo interno e uma sessão viva. A **sala** confere quem está onde (dono, traseira, parado, consciente) e só então chama a API; as mensagens do cliente são `storage.open`, `storage.move` e `storage.close` (`storageOpenSchema` / `storageMoveSchema`, com `requestId` UUID) e as respostas `storage.state` e `storage.closed`. Cada pessoa tem uma operação por vez (`storageBusy`).
- Duas mãos no mesmo item: o teste `apps/api/test/vehicle-storage.test.ts` joga duas movimentações simultâneas pelas últimas unidades e exige que só uma vença.

## Publicar

1. Aplicar a migração **antes** de subir a API nova: `npm run migrate -w @bar/api`. Sem ela a API recusa subir (`Schema do banco desatualizado; faltam: 024_vehicle_storage.sql`); em desenvolvimento o `predev` já faz isso ao iniciar com `npm run dev`, mas um `tsx watch` que só reinicia **não** roda o `predev`.
2. `npm run assets:caminhao` (copia o GLB e a foto).
3. Reiniciar API e sala (a `Moto` do estado ganhou o campo `load`) e recarregar os navegadores.

## Testes

- `tests/integration/truck.test.ts`: modelo, física, vaga, assentos e regras do baú (funções puras de `@bar/shared`).
- `apps/api/test/vehicle-storage.test.ts`: compra, depósito, retirada, idempotência, limites, corrida, troca de dono, remoção.
- `apps/server/test/truck.integration.test.ts`: a sala de verdade: dois lugares, baú só para o dono e só atrás, fechamento sozinho, persistência pela garagem e ao sair do jogo.
- `tests/e2e/truck.spec.ts` (projeto `truck`): o rig no motor do jogo (`tests/fixtures/truck.html`) e o fluxo completo no jogo, da compra ao baú.
