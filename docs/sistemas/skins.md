# Skins e coleção

Os jogadores usam somente skins completas. **Nathan** é gratuito e já pertence a toda conta: é o visual de quem acabou de se cadastrar e o substituto de qualquer skin que a conta não possua. **Leandro**, **Rafael**, **Read** e **Gilmar** são vendidos na loja. Magrão permanece exclusivo do NPC Seu Zé. A lista fica em `SKINS` e a skin gratuita em `DEFAULT_SKIN`, ambos em `packages/shared`.

O cadastro não tem etapa de aparência: com o e-mail confirmado (ou com a ativação automática), a conta entra direto no bar vestindo Nathan. Na partida, **C** abre a coleção, com a carteira e um cartão por skin. Clicar numa skin possuída a veste; numa skin bloqueada, abre a confirmação de compra.

## Persistência e autoridade

`user_profiles.equipped_skin` guarda o que está vestido; o padrão é `'nathan'`. A migração `005_retire_character_creator.sql` passa para Nathan as contas que vestiam o antigo personagem personalizado e remove a coluna `character_config`. As tabelas de carteira, coleção e lançamentos vêm de `002_characters.sql`, cujo nome é mantido porque migrações aplicadas são imutáveis. Em desenvolvimento, os scripts `dev` e `seed` chamam o runner explícito antes de iniciar; em produção, o serviço one-shot `migrate` conclui antes da API. A conexão runtime nunca aplica DDL.

`GET /api/wardrobe` retorna seleção, catálogo, preços, posse e saldo da própria conta. `POST /api/wardrobe/buy` compra uma skin; `POST /api/wardrobe/equip` veste uma skin possuída. A posse de Nathan não depende de registro em `skin_inventory`.

O servidor do mundo consulta a API ao entrar e reconectar e revalida durante a partida. A validação interna devolve `{equippedSkin,ownedSkins}`; uma skin vestida que não esteja na coleção vira Nathan. As opções enviadas pelo navegador na entrada não concedem posse nem definem a skin. `player.skin` também exige autorização persistida, via API interna; `player.appearance` apenas solicita sincronização depois de vestir pela API. O patch público transmite somente a skin selecionada, sem expor saldo ou inventário. Trocar de skin não altera movimento, colisões, regras do blackjack, eventos ou moderação. O karatê continua exclusivo de Rafael e a troca visual aguarda o fim do golpe.

## Loja e moeda

A compra é permanente, exige conta confirmada e usa uma transação com bloqueio da carteira. A coleção tem chave única por conta/skin. Repetir uma compra não cobra novamente; compras concorrentes não podem produzir saldo negativo. Preço, débito, posse e lançamento vêm do servidor, nunca do formulário. A loja não vende moeda nem usa dinheiro real; as moedas vêm do trabalho no bar (J), descrito em [economia](economia.md).

| Variável | Padrão |
| --- | ---: |
| `WALLET_INITIAL_COINS` | 0 |
| `WALLET_DAILY_COINS` | 0 |
| `SKIN_PRICE_LEANDRO` | 750 |
| `SKIN_PRICE_RAFAEL` | 1000 |
| `SKIN_PRICE_READ` | 850 |
| `SKIN_PRICE_GILMAR_GORDO` | 900 |

O saldo inicial e o bônus diário estão preparados para futura configuração e permanecem desativados. O fluxo diário não aparece com valor zero. Não há endpoint público que conceda saldo arbitrário. A infraestrutura do futuro bônus usa um lançamento único por conta/data UTC para impedir resgates duplicados.

As contas de demonstração preparadas explicitamente pelo seed recebem a coleção completa para conferir animações. Isso não altera o cadastro normal. O seed continua proibido em produção. Os testes de navegador usam serviços e banco separados e concedem **somente às suas contas de teste** 5.000 moedas para exercitar compras; esse valor não é aplicado ao bar em `localhost:5173`.

## Assets e renderização

Cada skin é um GLB em `apps/web/public/models`, com banco de animações em `apps/web/public/animations/<id>.glb` e bengala em `apps/web/public/props/old-cane-<id>.glb`. As miniaturas da loja ficam em `apps/web/public/skins`. O cliente carrega Nathan ao iniciar e as demais skins quando aparecem na cena. Veja [esqueletos nativos](../assets/native-rigs.md), [skins Mixamo](../assets/skins-mixamo.md) e [animações](../assets/animations.md).

## Verificação

Os testes de API verificam posse de Nathan sem compra, saldo zero, ganhos desativados, compras repetidas/concorrentes e a recusa de vestir skin não comprada. Os testes de WebSocket verificam a rejeição de seleção forjada na entrada e de skin não adquirida. O teste de navegador cobre conta nova vestindo Nathan, compra e troca para Rafael vista por outro cliente, retorno a Nathan e persistência após novo login.
