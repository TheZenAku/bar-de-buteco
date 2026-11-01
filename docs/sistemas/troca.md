# Troca entre jogadores

Dois jogadores podem trocar moedas, itens e [chaves de veículo](garagem.md#chave). Uma troca acontece inteira ou não acontece: nada sai das mãos de ninguém até os dois confirmarem a mesma oferta.

## Como negociar

1. **Pedir.** Botão direito em outro jogador, a até 4 m, e **Negociar**. A outra pessoa recebe um convite com 20 s para responder. Quem recusa fica 15 s sem receber um novo pedido da mesma pessoa.
2. **Oferecer.** A janela mostra as duas ofertas e a própria mochila. Um clique num item põe 1 na oferta, e um clique na linha da oferta tira. As moedas são digitadas, e a chave entra e sai com um clique.
3. **Aceitar.** Cada um clica em **Aceitar esta oferta**. Se alguém mudar qualquer coisa, os dois aceites caem e a oferta que mudou pisca em laranja com um aviso.
4. **Conferir.** Com os dois de acordo, as ofertas travam e a tela mostra só o que cada um entrega e recebe. O botão fica bloqueado por 3 s, para dar tempo de ler. A tela avisa quando você não vai receber nada e quando vai entregar uma chave.
5. **Confirmar.** Com as duas confirmações, a troca é feita. **Voltar** reabre as ofertas e **Cancelar** encerra, a qualquer momento antes disso.

Depois da confirmação dos dois, a janela não fecha e a troca não pode mais ser cancelada, mesmo que a conexão de alguém caia. Ela termina do mesmo jeito.

### Quando a negociação cai

Nada muda de mãos, e os dois veem o motivo, se:

- alguém se afasta mais de 8 m, cancela ou sai do jogo;
- a conexão de alguém cai, ou a conta entra de outra janela;
- alguém desmaia, é lançado ao chão ou sobe numa moto;
- ninguém mexe por 5 minutos.

Quem bloqueou o outro não recebe pedido, e não dá para negociar com bots.

## Moedas e veículos

- **Sem limite de valor.** A troca movimenta qualquer valor que o jogador tenha, ao contrário do Pix, que tem limite de 5.000 por envio e 10.000 por dia.
- **Chave:** quem fica com a chave fica com o veículo, com as mesmas peças, os mesmos quilômetros e a mesma placa. Se ele estiver na rua, vai para a garagem na hora, e quem estiver pilotando desce. O novo dono retira de lá.
- **Último veículo:** quem negocia o último fica offline no Highfood.
- **O que precisa caber:** quem recebe precisa ter espaço na mochila, respeitar o limite de cada item e de 10 veículos, e não passar do máximo de moedas. Nada é arredondado nem deixado para trás: se não couber, a troca não acontece.

## Por que não dá para duplicar nem roubar

| Tentativa | O que impede |
| --- | --- |
| Confirmar duas vezes, ou repetir a mensagem | Cada troca tem um id, e a tabela `trades` só aceita uma linha por id, gravada na mesma transação. Uma repetição encontra essa linha e não muda nada |
| A resposta da API se perde depois de a troca acontecer | A sala tenta de novo com o mesmo id e recebe "já feita". Testado perdendo a resposta de propósito |
| Dois pedidos iguais ao mesmo tempo | Uma trava por id faz o segundo esperar o primeiro e encontrar a linha pronta |
| Prometer as mesmas moedas ou o mesmo item a duas pessoas | Na transação, carteiras e pilhas ficam travadas e são conferidas com o valor atual. A segunda troca falha inteira |
| Vender a mesma chave a duas pessoas | Um veículo só tem uma coluna de dono, travada na transação. A segunda troca falha |
| Gastar o item ou as moedas com a janela aberta | A API confere o saldo real no fim. Se faltar, nada acontece, e os dois recebem uma mensagem |
| Trocar a oferta na última hora | Mudar a oferta cancela os dois aceites e gera uma nova versão. Aceitar e confirmar levam a versão vista, e a sala recusa uma versão antiga |
| Confirmar sem ler | As ofertas ficam travadas e a confirmação só é aceita 3 s depois, regra conferida na sala |
| Mesmo item duas vezes na oferta, quantidade negativa ou quebrada | Recusados pelo esquema tanto na sala quanto na API |
| Pagar a troca com o que vai receber nela | Tudo é conferido com o que cada um tem antes de qualquer movimento |
| Mandar mensagens falsas | O navegador só faz pedidos. A sala confere se a troca é da pessoa, e a API confere sessão e banimento dos dois |
| O servidor cair no meio | É uma única transação do banco: ou tudo foi gravado, ou nada foi. Nada fica reservado no caminho, então não há o que perder |

**Nada fica reservado durante a negociação.** Oferecer um item não o tira da mochila. Isso significa que não existe estado intermediário a recuperar depois de uma queda. O custo é que a troca pode falhar no fim, se alguém gastar o que ofereceu, e nesse caso ninguém perde nada.

## Registro

- **`trades`:** uma linha por troca feita, com as duas ofertas. Fica mesmo se a conta for apagada.
- **Livro-caixa:** duas linhas por lado que deu moedas, que somam zero (`trade:out:<quem>:<id>`, `trade:in:<quem>:<id>`). Aparece no extrato do HighBank como "Troca com fulano". A Economia da administração não conta como moedas criadas nem destruídas.
- **Itens:** `inventory_ledger` com o motivo `trade`, que aparece em "Histórico recente" na mochila.
- **Log da administração:** "Negociou com outro jogador", com o que cada um deu e recebeu, e "Negociação recusada", com o motivo.

### Antes de vender moedas por dinheiro

A troca não tem limite, e por isso é o caminho mais fácil para revender moedas e juntar saldo de contas falsas. Para acompanhar, use o log e a tabela `trades`. Se isso virar um problema, a medida mais simples é exigir uma idade mínima de conta para trocar moedas. Isso não está feito.

## Como funciona

| Parte | Onde |
| --- | --- |
| Regras, esquemas, tipos | `packages/shared/src/trade.ts` |
| A conversa: convites, versões, aceites | `apps/server/src/world/trades.ts` |
| Distância, ofertas, reenvio e resultado | `apps/server/src/BarRoom.ts` |
| A transação que move tudo | `apps/api/src/trade-service.ts` |
| Janela e convite | `apps/web/src/trade/trade.ts` |

| Mensagem | Quem envia | Para quê |
| --- | --- | --- |
| `trade.request`, `trade.respond` | Jogador | Pedir e responder |
| `trade.offer` | Jogador | A oferta inteira, sempre substituindo a anterior |
| `trade.ready`, `trade.confirm` | Jogador | Aceitar e confirmar, com a versão vista |
| `trade.cancel` | Jogador | Encerrar |
| `trade.invite`, `trade.uninvite`, `trade.sent`, `trade.notice`, `trade.state`, `trade.closed` | Sala | O que mudou |
| `POST /api/internal/trades/commit` | Mundo para a API | A transação |

Se a API não responder, a sala tenta de novo a cada 1,5 s, com o mesmo id. A janela fica em "Fazendo a troca…" até haver resposta. Depois de 200 tentativas (cerca de 5 minutos, sem contar o tempo de espera de cada chamada), ela avisa para conferir a mochila.

## Testes

| Teste | O que cobre |
| --- | --- |
| `apps/api/test/trade.test.ts` | Troca completa, repetição, recusas sem nenhuma mudança, o que não cabe, pedidos simultâneos, a mesma chave vendida a dois, troca contra uso de item e gasto, e uma sequência de trocas aleatórias entre 4 pessoas conferindo que moedas e itens não são criados nem perdidos |
| `apps/server/test/garage-trade.integration.test.ts` | API e banco reais com WebSockets reais: pedido, recusa, oferta além do que se tem, golpe da oferta trocada, versão antiga, 3 s de leitura, **resposta da API perdida duas vezes**, moto vendida na rua, e negociação caindo por distância, cancelamento, desmaio, queda, saldo gasto e saída |
| `tests/e2e/garage-trade.spec.ts` | Dois navegadores: botão direito, convite, ofertas, aceite que cai, confirmação e o comprador pilotando |

Os testes de concorrência rodam no PGlite, o mesmo banco usado hoje. Ele executa uma transação por vez, então não exercita as travas como um PostgreSQL com várias conexões. As travas seguem a mesma ordem do Pix, e uma possível troca de banco deve repetir esse teste.

## Limitações

- Só dá para negociar com alguém por perto.
- Um jogador pode dar coisas de graça: a tela avisa, mas permite, porque a troca é livre.
- Uma troca feita não tem como ser desfeita pelo jogo. A administração pode ajustar moedas e itens à mão.
