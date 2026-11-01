# Highfood e HighMotors

O emprego de entregador. O jogador compra a moto no celular, tira ela da [garagem](garagem.md), fica online pelo app ou na base ao lado do bar, recebe pedidos no app, pilota seguindo o GPS e entrega na mão de um cliente que espera na calçada. Cada entrega paga moedas.

## Do começo ao fim

1. **Comprar a moto.** App **HighMotors** no celular: 10.000 moedas. Ela vem emplacada, fica na [garagem](garagem.md) e a chave vai para a mochila.
2. **Tirar da garagem.** Em um dos dois anéis ciano na rua ao lado do bar, **E** e **Retirar**.
3. **Ficar online.** Pelo app, de qualquer lugar, com **Ficar online** na tela inicial, ou na base (o anel vermelho em `x -3,80`, `z -15,50`), com **E**. O personagem veste a mochila do Highfood, que todos veem. Quem está num turno do bar precisa encerrar antes, e vice-versa. Online com a moto ainda na garagem, os pedidos não chegam, e o app mostra a rota até lá.
4. **Esperar.** O pedido seguinte demora de 25 a 70 s para aparecer. Nada aparece na tela do jogo.
5. **Olhar o celular.** Quando surge um pedido, o celular vibra (som real) a cada 9 s e o ícone do celular na barra treme e ganha um número. O pedido só aparece **dentro do app Highfood**, com o cliente, o restaurante, o endereço, a distância pelas ruas e o valor. Com o celular já aberto em outro app, sobe uma notificação.
6. **Aceitar ou recusar.** O pedido espera 45 s. Três pedidos ignorados seguidos põem o jogador offline.
7. **Pilotar.** O minimapa mostra a linha do GPS até a calçada do cliente, afasta para 62 m de alcance e o anel com a distância aparece no mundo. O prazo é de 30 s mais a rota a 7,5 m/s (27 km/h). Com três vezes o prazo, o cliente desiste e o pedido se perde.
8. **Descer.** Ao descer a até 35 m do cliente, o personagem pega o pedido no baú sozinho (2 s). Se a moto foi deixada ali de outro jeito, **E** ao lado dela faz o mesmo. Subir de novo ou cair devolve o saco ao baú.
9. **Entregar.** O cliente acena quando o entregador chega perto. Com o saco na mão, a menos de 1,9 m dele, **E** abre a caixa de diálogo com o rosto do cliente e o que ele diz. **Entregar o pedido** (E) confirma, **Agora não** (Esc) fecha. O saco passa para a mão do cliente, que agradece, vira e vai embora.
10. **Receber.** As moedas caem na carteira, com um aviso e as estrelas dadas. O próximo pedido volta ao passo 4.

Pedidos não acabam: enquanto o jogador estiver online, eles continuam vindo. **Ficar offline** fica na tela inicial e na aba Perfil do app, ou no painel da base. Sair do jogo com um pedido em andamento conta como pedido perdido.

## App Highfood

| Aba | O que mostra |
| --- | --- |
| **Início** | Offline com **Ficar online**, procurando pedidos com **Ficar offline**, a moto guardada com a rota até a garagem, o pedido novo com a contagem, ou a entrega em andamento com as etapas, o prazo, Mapa e Cancelar |
| **Pedidos** | As últimas 30 entregas e pedidos perdidos: cliente, restaurante, endereço, valor, estrelas |
| **Ganhos** | Hoje e o teto do dia, quantas ainda pagam preço cheio, os últimos 7 dias em barras e o total |
| **Perfil** | Nível (Novato, Entregador, Experiente, Veterano, Lenda das ruas), nota, entregas, porcentagem no prazo, link para a moto, Ficar offline |

A **nota** é a média das últimas 50 entregas. Cada entrega vale 5 estrelas, menos 1 pelo atraso, 1 por queda (até 2) e 1 pelo baú destruído. Pedido em que o cliente desistiu ou cancelado vale 1 estrela. Nota de 4,5 ou mais faz os pedidos chegarem 15% antes; abaixo de 3,5, 30% depois. **A nota nunca muda o valor de um pedido.**

## App HighMotors

O anúncio com foto, preço e **Comprar**, com confirmação e o saldo depois, e os veículos do jogador: placa, estado geral, quilômetros rodados, onde está, o que precisa de conserto, **Marcar no mapa** ou **Ir à garagem**, e **Guincho**. Dá para ter mais de uma moto, até 10.

- A moto fica na [garagem](garagem.md). Sem o dono por 60 s, ela volta para lá, com o estado salvo.
- **Guincho (30 moedas):** traz a moto até a rua mais perto do jogador, esteja onde estiver.
- O conserto é o mesmo de [todas as motos](moto.md#estado-das-peças). Os outros jogadores podem levantar e consertar a moto de alguém. Só pilotam se ela estiver [destrancada](garagem.md#tranca).

## GPS e Mapas

O app **Mapas** agora desenha a cidade inteira, com os nomes das ruas e dos bairros e a sua moto. **Tocar no mapa marca um destino**: a linha aparece no celular e no minimapa, com a distância pelas ruas e o tempo estimado. Tocar num lugar usa o nome dele. A busca tem **traçar rota**. O X remove o destino, que também some sozinho ao chegar. Um pedido em andamento passa na frente do destino marcado, que volta quando o pedido acaba.

A rota não vem do `cidade_vias.json`, porque essa malha não chega ao bairro original, onde o bar fica. `npm run assets:gps` (`tools/assets/build-gps.ts`) testa a moto de verdade em uma grade de 3 m sobre os mesmos pisos e colisores da física e grava em `packages/shared/src/gps-data.json`:

- cada célula: **0** a moto não cabe, ou tem algo no meio, como um carro; **1** meio da rua; **2** beira da rua ou perto de algum obstáculo; **3** calçada e terrenos, só quando não há outro caminho;
- os **1.159 pontos de entrega**: calçada, com alguém podendo ficar em pé, um prédio perto, a moto cabendo no meio-fio e o caminho a pé livre;
- os **nomes de rua**: reais, das plantas da prefeitura. Veja [Nomes das ruas](cidade.md#nomes-das-ruas).

A rota é um A* sobre essa grade (`packages/shared/src/gps.ts`), de 5 ms em média, com os degraus da grade retirados. Saindo 14 m da linha, ela é recalculada. **Rode `npm run assets:gps` de novo quando o mapa mudar**: `tests/integration/highfood.test.ts` falha se a grade ficar desatualizada.

## Dinheiro: como está balanceado

O jogo hoje só cria moedas pelo trabalho, por isso o Highfood é a maior torneira da economia. Os números abaixo são os padrões e todos mudam em **Administração → Preços**, grupo Highfood e veículos.

| Chave | Valor | O que faz |
| --- | --- | --- |
| `vehicle:moto` | 10.000 | Preço da moto |
| `vehicle:tow` | 30 | Guincho |
| `highfood:base` | 8 | Valor fixo por entrega |
| `highfood:per-100m` | 4 | Por 100 m de rota, medidos pelas ruas |
| `highfood:on-time-pct` | 20 | Bônus chegando no prazo |
| `highfood:full-per-day` | 20 | Entregas por dia a preço cheio |
| `highfood:late-pct` | 50 | O que as seguintes pagam |
| `cap:highfood-daily` | 700 | Teto por jogador e por dia |

Uma entrega no prazo paga de 16 a 40 moedas, 26 em média (rota média de 340 m, medida sorteando 400 pedidos). Estimativa de um dia para quem joga bem, com 2 minutos por entrega (cerca de 50 s de espera, 40 s de moto, 20 s na porta e o tempo no app). O tempo ainda não foi medido com jogadores de verdade:

| | Entregas | Moedas | Tempo |
| --- | --- | --- | --- |
| Primeiras 20 | 20 | cerca de 520 | 40 min |
| Até o teto | mais 15 | mais 180 | 30 min |
| **Dia completo** | **35** | **700** | **cerca de 1 h 10** |

A moto se paga em **14 dias no teto**, ou 19 dias com 40 minutos por dia.

O que segura a inflação:

- **Teto por conta, conferido na API.** A API decide o pagamento e o teto a partir da tabela de preços; o mundo só informa o que aconteceu. Cada pedido paga uma vez (o id do pedido é a chave no livro-caixa), mesmo que a mensagem se repita.
- **A moto é um ralo grande e a barreira contra contas falsas.** Cada conta de farm precisa juntar 10.000 moedas antes da primeira entrega, o que no emprego do bar leva 25 dias no teto.
- **Saídas recorrentes:** cada 300 m rodados tiram 1% de uma peça, em geral dos pneus e dos freios. Um dia completo são cerca de 12 km, ou 40 pontos, e a peça de 40 moedas devolve 40%. São por volta de 40 moedas por dia só de desgaste, mais as quedas e o guincho.
- **Tempo real entre os pedidos e o dia reduzido a meio preço:** repetir o dia inteiro não rende mais do que o teto, e nem rende muito por hora perto dele.
- **Sem pagamento grande de uma vez:** a entrega mais longa paga 40 moedas.

Para acompanhar, veja **Economia** (fonte "Entregas Highfood", separada de "Trabalho") e a categoria **Highfood** da administração: moedas pagas hoje e em 7 dias, motos vendidas e quem está online.

### Antes de vender moedas por dinheiro

- **Regra prática:** o preço em dinheiro de 1.000 moedas precisa fazer sentido contra 1 h 30 de trabalho. Se a moto custar muito mais em reais do que os jogadores acham justo, eles vão preferir o trabalho; se custar pouco, ninguém vai trabalhar. Comece com um pacote pequeno e meça em **Economia**.
- **Pix entre jogadores** é o caminho para revenda de moedas e para juntar contas: mantém o limite de 5.000 por envio e 10.000 por dia, e vale exigir uma idade mínima de conta quando houver venda.
- **Risco jurídico:** com moedas compradas por dinheiro, o blackjack e o pebolim valendo moedas podem contar como jogo de azar no Brasil. Fale com um advogado antes de ligar a venda, ou mantenha os jogos com fichas que não vêm de compra.

## Administração

Categoria **Highfood**:

- quanto o serviço pagou e quem está online agora;
- **Clientes:** nome, corpo no jogo, falas (até 8; `{nome}` vira o nome do entregador e `{item}` o primeiro item do pedido), se recebe entregas, e a **foto**. **Enviar PNG** é o mesmo envio dos emblemas, com o mesmo depósito (`badge_images`). Sem foto, aparece o avatar gerado, que pode ser ajustado ali. Uma imagem usada por um cliente não pode ser apagada. As mudanças valem no próximo pedido, em até 1 min;
- **Dar ou tirar a moto** de alguém, sem mexer nas moedas. De quem tem mais de uma, é preciso informar a placa.

Em **Veículos**, as motos de jogadores aparecem com a placa e o nome do dono e não contam no limite de 12 das motos spawnadas. Despawnar a moto de alguém a devolve para a garagem com o estado salvo. Tudo fica no log.

## Avatares, objetos, animações e som

- **Marca:** a logo Highland Bar Delivery, em `assets-bar/logo/highland-bar-delivery.png`. `npm run assets:highfood:logo` publica `apps/web/public/highfood/logo.webp` e `logo-icon.webp`. Ela aparece no ícone do app, no topo do app, no painel da base, na administração, na placa da base, no saco e na mochila.
- **Avatares:** vetores desenhados em código (`apps/web/src/highfood/npc-avatar.ts`), 24 clientes prontos, cada um com pele, cabelo, barba, óculos, roupa e fundo.
- **Objetos:** o saco de papel, a mochila, o celular na mão e a placa da base são caixas com a marca aplicada (`apps/web/src/engine/highfood-props.ts`). A placa não colide, porque fica fora do caminho.
- **Animações novas** para todas as skins (`npm run assets:animations`): `Text` (`Texting While Standing`, o cliente esperando e qualquer pessoa parada com o celular aberto), `Thank` (`Thankful`, ao receber o pedido) e `Pick` (`Picking Up Object`, ao tirar o saco do baú).
- **Vibração:** recorte de *Vibration Cell Phone.flac*, de qubodup, [Freesound 182855](https://freesound.org/s/182855/), licença CC0. `npm run assets:phone:sound` corta de `assets-bar/sound/freesound` para `apps/web/public/phone/vibrate.wav` (três pulsos, 1,32 s). Foi escolhida pelo espectro, porque aqui ninguém ouve áudio. Confirme de ouvido e, para trocar, mude a fonte ou os tempos no script.

## Como funciona

| Parte | Onde |
| --- | --- |
| Regras, valores, clientes, restaurantes | `packages/shared/src/highfood.ts` |
| Rotas e pontos de entrega | `packages/shared/src/gps.ts`, `gps-data.json` |
| Turnos, ofertas, prazo (sem rede nem dinheiro) | `apps/server/src/world/highfood.ts` |
| Cliente na calçada, saco, baú, diálogo, moto com dono | `apps/server/src/BarRoom.ts` |
| Pagamento, histórico, clientes, veículos | `apps/api/src/highfood-service.ts`, migração `013_highfood.sql` |
| Apps | `apps/web/src/phone/apps/highfood.ts`, `motors.ts`, `maps.ts` |
| GPS, minimapa, diálogo | `apps/web/src/gps.ts`, `minimap.ts`, `highfood/courier.ts` |

O cliente é um NPC comum em `state.npcs` (`cliente-<pedido>`), visto por quem está perto, e o entregador o vê de qualquer distância. `Player.courier` e `Player.parcel` trazem a mochila e o saco para todos os jogadores. O pedido em si só vai para o entregador (`food.state`).

| Mensagem | Quem envia | Para quê |
| --- | --- | --- |
| `food.start`, `food.stop` | Jogador | Ficar online ou offline |
| `food.accept`, `food.decline`, `food.cancel` | Jogador | O pedido |
| `food.unload`, `food.talk`, `food.leave`, `food.deliver` | Jogador | Baú, diálogo e entrega |
| `moto.tow`, `phone.look` | Jogador | Guincho, celular na mão |
| `food.state`, `food.base`, `food.owned`, `food.dialog`, `food.delivered`, `food.receipt`, `food.notice`, `moto.towed` | Sala | O que mudou |

Se a API estiver fora do ar, o saco já mudou de mão e o pagamento fica guardado na sala, com o mesmo id de pedido, até ela voltar. Reiniciar o mundo durante essa espera perde esse pagamento.

## Testes

| Teste | O que cobre |
| --- | --- |
| `tests/integration/highfood.test.ts` | Rotas de qualquer ponto, a moto cabendo ao longo de 97% ou mais das rotas, grade conferida com o mapa, pontos de entrega válidos, cálculo do pagamento, a conta do dia e da moto, desgaste, clientes |
| `apps/api/test/highfood.test.ts` | A mesma compra uma vez, sem moedas, pagamento uma vez, histórico, meio preço depois de 20, teto exato, clientes, foto em uso, dar a moto |
| `apps/server/test/highfood.integration.test.ts` | Tempos do turno, ofertas ignoradas, desistência e, por WebSockets reais, o turno inteiro: online pelo app, longe da base e sem pedidos com a moto guardada, garagem, moto trancada, oferta, baú, diálogo, pagamento, cliente indo embora, cancelar, guincho |
| `tests/e2e/highfood.spec.ts` | Navegador e teclado de verdade: comprar, marcar destino no mapa, retirar da garagem, ficar online pelo app, vibração sem aviso na tela, aceitar, pilotar pela linha, baú, diálogo, receber, abas do app, foto do cliente na administração. As imagens vão para `test-results/highfood` |

## Limitações

- O mapa não tem restaurantes: a retirada não é uma etapa, e o pedido já sai no baú.
- Só existe um modelo de moto. O app e a tabela já aceitam outros modelos.
- A base fica debaixo de uma árvore: com a câmera baixa, as folhas podem cobrir o personagem. Girar a câmera resolve.
- Os clientes usam as skins do jogo, então os corpos repetem. Eles não têm caminho próprio: ao ir embora, andam em linha reta por 3,5 s e somem.
- O celular na mão só aparece com o personagem parado. Andando, ele volta ao normal.
- Quem pilota não vê o nome da rua no minimapa, só no app Mapas.
