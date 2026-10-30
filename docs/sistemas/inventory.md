# Inventário

O inventário é persistente por conta e funciona como uma mochila de **12 pilhas**. Itens iguais se agrupam até o limite definido no catálogo. Toda conta recebe uma única vez o kit inicial: duas águas, uma coxinha e um curativo. A mochila abre com **I** ou pelo botão **Mochila** da barra de ações.

A janela mostra o espaço usado sobre uma barra e as **12 casas** da mochila, como num inventário de jogo: as ocupadas com a imagem do item e a quantidade, as vazias apagadas. Escolher uma casa abre, ao lado, o cartão do item: categoria, nome, descrição, efeitos (por exemplo "fome +35"), quanto tempo dura, **Usar** e **Descartar**. Quando **Usar** espera (algo já na mão, sentado, cambaleando), o cartão diz por quê. No celular, o cartão vem embaixo das casas. O histórico recente fica no fim, recolhido.

A **venda da casa** saiu da mochila e está guardada para os pontos de venda do bar, quando os lugares forem escolhidos: a marcação continua em `shopHtml` (`main.ts`), com a ação `inventory-buy`, os estilos `.shop-*` e a rota `POST /api/inventory/buy`, que segue funcionando.

## Catálogo e efeitos

`packages/shared/src/inventory.ts` é a fonte única de identificadores, nomes, preços, limite de pilha, ícone, categoria, efeito e objeto visual. O catálogo atual contém água, refrigerante, café, long neck, copo de chopp, coxinha, pastel, torresmo e curativo. O ícone de cada item é uma imagem em `apps/web/public/ui/items/<id>.png`. A moeda que acompanha preços e ganhos fica em `apps/web/public/ui/moeda.png`. As duas vêm de `assets-bar/icons`, pelo `npm run assets:icons`. `packages/shared/src/needs.ts` deriva `CONSUMABLES` desse catálogo, evitando diferenças entre o texto da interface e o efeito aplicado pelo servidor.

Bebidas e comidas vão **para a mão** (`Player.holding`): duram o mesmo tempo que na mesa ou no balcão (`CONSUME_MS`: long neck 3 min, chopp e refrigerante 2,5 min, água 2 min, café, coxinha e pastel 1,5 min, torresmo 2,5 min), e o personagem anda livremente enquanto isso. O efeito entra aos poucos, em partes de 5%; uma queda derruba o que estava na mão (a parte já consumida conta). Bebidas aparecem na mão esquerda com o modelo de copo ou garrafa de `apps/web/public/props`, e o braço as leva à boca com a animação `Drink` por cima da caminhada. Uma coisa na mão por vez: enquanto houver, o botão **Usar** das outras bebidas e comidas fica desabilitado e o balcão recusa outro pedido. O curativo é usado na hora (`Use`, 2 s); interromper essa ação aplica apenas a fração concluída. O item sai da mochila de forma autoritativa antes de ir para a mão. Um personagem desmaiado, cambaleando, sentado ou ocupado não pode usar ou descartar itens.

## Persistência e autoridade

A migração `003_inventory.sql` cria:

- `item_inventory`: quantidade atual por conta e item;
- `inventory_ledger`: histórico imutável de kit inicial, compra, uso, descarte e perda.

`GET /api/inventory` devolve pilhas, ocupação, capacidade, saldo e histórico. `POST /api/inventory/buy` usa o preço do servidor e altera carteira, pilha e os dois históricos na mesma transação. `requestId` torna repetições simultâneas idempotentes: uma compra nunca cobra duas vezes. Quantidade máxima, saldo, personagem criado e capacidade são conferidos na API.

O mundo recebe somente as pilhas da própria conta durante a validação da sessão. Elas não entram no schema público nem nos patches de proximidade. Uso, descarte e perda passam por `POST /api/internal/inventory`, protegido pelo segredo interno e pela sessão ativa. A sala mantém uma cópia privada apenas para rejeitar cedo comandos impossíveis; a API continua sendo a autoridade.

Ao desmaiar por falta de vida há a chance configurada em `NEEDS.faint.itemLossChance` de perder uma unidade elegível. A remoção é persistida antes do aviso. Desmaio por álcool não faz essa segunda perda, pois já possui o fluxo de resgate na calçada.

## Sincronização da interface

Mensagens privadas `inventory.state` atualizam a mochila e os atalhos; `inventory.result` confirma uso ou descarte. O cliente solicita `inventory.sync` ao conectar, e a reconexão relê a API. Compras atualizam também o saldo compartilhado com a loja de skins. A atualização administrativa periódica relê carteira e inventário para refletir ajustes feitos por um administrador.

## Testes

- `apps/api/test/inventory.test.ts`: kit inicial, persistência, falta de saldo, preço forjado, limite de pilha, compra simultânea, sessão interna e remoção idempotente;
- `apps/server/test/inventory.integration.test.ts`: privacidade do estado, sincronização, remoção via API, animação antes do efeito, descarte e rejeição local;
- `tests/e2e/bar.spec.ts`: abertura por teclado, conteúdo inicial, uso e descarte pela interface.

Validação em 24/10/2026: TypeScript e build de produção aprovados; todos os 22 testes da API e 19 do servidor passaram. Os 26 testes de ferramentas também passaram. A suíte de integração teve 50 de 51 aprovações; a única falha foi um teste de roupa anterior que depende do arquivo ausente `assets-bar/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`.
