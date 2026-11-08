# Níveis, XP e bônus diário

Cada jogador tem um **nível de 1 a 100**. O XP vem do que se faz no bar e na cidade: beber, comer, dançar, tocar no palco, trabalhar, jogar, rodar de moto, andar, conversar, postar e o resto do que as [conquistas](conquistas.md) contam. Também entra o tempo na cidade (60 XP por hora).

## De onde vem o XP

O XP **não é gravado à parte**. Ele é calculado a partir dos contadores de `user_achievements`: cada série vale um tanto por unidade (`XP_PER_UNIT` em `packages/shared/src/levels.ts`: 10 por cerveja, 40 por partida de sinuca vencida, 15 por km de moto, 1 por mensagem no chat…). Por isso:

- tudo o que conta para um emblema também dá XP, sem código novo em cada ação;
- quem já jogava antes dos níveis já começa com o XP do seu histórico;
- mudar um valor em `XP_PER_UNIT` recalcula o nível de todo mundo, para cima ou para baixo.

O fluxo é o mesmo das conquistas. A cada rodada de manutenção (3 s), o mundo manda os contadores para `POST /api/internal/achievements`, e a resposta traz o XP total de quem fez alguma coisa. O mundo grava `Player.level` no estado da sala, que todos veem, e manda `xp.state {xp, gained}` só para o próprio jogador. O primeiro relatório depois de entrar chega com `gained: 0` e só posiciona a barra. Bots de desenvolvimento não ganham XP.

A curva fica em `xpToNext(nível) = 50 + 15·n + 0,3·n²`, arredondada a 5: são 65 XP do nível 1 para o 2, uns 1.550 no nível 50 e uns 4.470 no 99. Para chegar ao 100, são cerca de 178 mil XP.

## Postos e ícones

São dez postos de dez níveis: Forasteiro, Freguês, Chegado, Boêmio, Seresteiro, Malandro, Sócio, Lenda, Patrono e Imortal (`RANKS`). O ícone de cada nível é um SVG desenhado em `apps/web/src/levels/rank-icon.ts`. O posto define o formato (de medalha redonda a sol de doze pontas, com asas a partir do Patrono e coroa no Imortal) e as cores. O número do nível fica no meio, e os dez entalhes no alto marcam o degrau dentro do posto. Quem chega a um posto novo é anunciado no chat para quem está perto.

O ícone aparece:

- **no HUD**, ao lado da carteira, com o nome do posto e a barra de XP. A barra corre até o novo valor, o ganho sobe em "+N XP", e subir de nível mostra o ícone grande com raios e faíscas no meio da tela;
- **ao lado do nome** acima da cabeça, na lista de pessoas e no **perfil**, que também mostra o nível, o posto e a barra de XP de qualquer jogador (`ProfileView.xp`).

Com *reduzir movimento* ligado no sistema, as animações são cortadas.

## Nomes acima das cabeças

Os nomes de jogadores e NPCs ficam **ocultos por padrão**. A tecla **Z** mostra todos por 4 s, aparecendo e sumindo suavemente. Enquanto estão ocultos, o jogo nem calcula onde eles ficariam na tela. Na moto, o Z continua sendo a seta esquerda. O Z não pode mais ser usado como tecla de skill: quem já tinha a skill no Z volta para a tecla padrão.

## Bônus diário

O botão de presente, ao lado do nível, abre a janela do bônus. Quando o bônus está liberado, o botão pisca e um aviso aparece ao entrar. São sete dias seguidos, com 50, 75, 100, 150, 200, 250 e 400 XP (`DAILY_XP`). Ao perder um dia, a sequência recomeça. O dia é o do bar (Brasília, `barDayKey`). Depois de receber, a janela conta o tempo até o próximo.

As **moedas do bônus diário** (preço `reward:daily`, 0 = só XP), que antes ficavam num botão da coleção, vêm agora junto com o XP. Elas continuam no extrato como `daily`, com a mesma chave de antes, então quem já recebeu as moedas no dia não recebe de novo.

- `GET /api/daily` → `{day, claimed, coins, rewards}`; `POST /api/daily` → o mesmo, com `gained: {xp, coins}` quando foi esta chamada que recebeu.
- Cada resgate grava uma linha `diario:<dia>` em `user_achievements` (valor = dia da sequência), e a chave primária garante um resgate por dia. O XP soma no contador `diario`. Atalho: se o bônus precisar de mais do que o dia e a sequência, vale criar uma tabela própria.

## Na administração

- **Níveis e XP** (menu da administração): a tabela de `XP_PER_UNIT` (uma linha por série, "XP por cerveja", "XP por minuto"…) e os sete dias do bônus (`xp:<série>` e `xp:daily-<n>`). É a mesma tabela dos Preços, com rascunho, motivo, **Padrão** e **Reajuste** em %, guardada em `economy_prices`. Fica fora da seção Preços e é registrada como `xp-values-set`, para não contar como mudança de preço na inflação da Economia. Como o XP é recalculado dos contadores, mudar o valor de uma série sobe ou desce o nível de todo mundo que já fez aquilo. Já o contador do bônus guarda XP, então os valores do bônus só valem a partir do próximo resgate.
- **Ficha do jogador → Nível**: nível, posto, XP e **Ajustar XP** (adicionar, retirar, definir o XP total ou definir o nível). O ajuste vai para dois contadores da própria administração em `user_achievements`: `ajuste-xp` (somado) e `ajuste-xp-menos` (subtraído), porque os contadores não podem ser negativos. Eles guardam o saldo do ajuste, então **Definir** acerta o total mesmo com o resto do histórico. O XP total nunca fica abaixo de 0. **Liberar o bônus de hoje de novo** apaga a linha `diario:<dia>` de hoje: o jogador pode receber o XP do dia outra vez, mas as moedas do bônus não se repetem no mesmo dia (a chave do extrato é a mesma). Cada ação é registrada (`xp-add`, `xp-remove`, `daily-reset`) e exige um motivo, com a mesma permissão de mexer na carteira.
- O mundo recebe a cada rodada (3 s) o XP de **todos** que estão online, não só de quem fez algo. Assim, um ajuste ou um valor novo aparece no HUD e no nível acima da cabeça em poucos segundos, sem reiniciar nada.

Testes: `tests/integration/levels.test.ts` (curva, postos, XP dos contadores) e `apps/api/test/wardrobe.test.ts` (resgate único com chamadas simultâneas e o XP no perfil), além de `apps/api/test/admin-console.test.ts` (ajustes, bônus liberado de novo e valores de XP). A fixture `tests/fixtures/admin-levels.html` mostra a aba Nível; com `?section=levels`, mostra a seção Níveis e XP.
