# Inventário

O inventário é persistente por conta e funciona como uma mochila de **12 pilhas**. Itens iguais se agrupam até o limite definido no catálogo. Toda conta recebe uma única vez o kit inicial: duas águas, uma coxinha e um curativo. A mochila abre com **I** ou pelo painel **Bolso**; nele também ficam atalhos de uso, a venda da casa e o histórico recente.

## Catálogo e efeitos

`packages/shared/src/inventory.ts` é a fonte única de identificadores, nomes, preços, limite de pilha, ícone, categoria, efeito e objeto visual. O catálogo atual contém água, refrigerante, café, long neck, copo americano, coxinha, pastel, torresmo e curativo. `packages/shared/src/needs.ts` deriva `CONSUMABLES` desse catálogo, evitando diferenças entre o texto da interface e o efeito aplicado pelo servidor.

Bebidas com objeto usam a animação `Drink` e os modelos de copo ou garrafa já publicados em `apps/web/public/props`. Comidas e curativo usam `Use`. O item é retirado de forma autoritativa antes da ação e o efeito só é aplicado quando a animação termina; interromper a ação aplica apenas a fração concluída. Um personagem desmaiado, cambaleando, sentado ou ocupado não pode usar ou descartar itens.

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
