# Conquistas

Os emblemas que o jogador ganha jogando. Cada atividade da cidade é uma **série de quatro níveis**: ao chegar à quantidade de cada nível, o emblema aparece sozinho na coleção do jogador. São 26 séries, 104 emblemas no total, todos em `ACHIEVEMENT_SERIES` (`packages/shared/src/achievements.ts`).

## O que o jogador vê

- **Um aviso** no alto da tela, com a medalha e o botão **Ver a carta**. Ele chega em até 3 segundos, ou na próxima vez que o jogador entrar, se ele não estava no bar.
- **A aba Conquistas** no próprio perfil (botão direito em si mesmo → Perfil): todas as séries, com o progresso até o próximo nível e as quatro medalhas. O que já foi começado vem primeiro. Medalha ainda não ganha fica apagada, e passar o mouse mostra o que ela pede; a ganha abre a carta.
- **Editar emblemas**, como qualquer outro: entrar na coleção não coloca o emblema em exibição, quem escolhe é o jogador. Nada de "Bexiga Solta" aparecendo no perfil sem ele querer.
- **Os outros ficam sabendo** no chat: quem está perto vê os níveis III; o bar inteiro vê os níveis IV.

## Níveis

| Nível | Raridade | Moldura da carta |
| --- | --- | --- |
| I | Comum | Cinza |
| II | Incomum | Verde |
| III | Raro | Ciano |
| IV | Lendário | Dourada, cravejada de brilhos |

Épico fica de fora das séries e continua disponível para os emblemas criados à mão. A medalha mostra o nível em algarismo romano sobre o hexágono; numa série, o ícone é o mesmo e a cor muda com o nível.

## As séries

| Série | O que conta | Níveis | Onde é contado |
| --- | --- | --- | --- |
| Bebum | Cervejas (long neck e chopp) | 10, 50, 200, 1.000 | Mundo |
| Boca Nervosa | Petiscos (coxinha, pastel, torresmo) | 10, 50, 200, 1.000 | Mundo |
| Cafeinado | Cafés | 5, 25, 100, 500 | Mundo |
| Fumante | Cigarros até o fim | 5, 25, 100, 500 | Mundo |
| Bexiga Solta | Visitas completas ao banheiro, com pelo menos 10 de bexiga | 5, 25, 100, 500 | Mundo |
| Passou Mal | Vezes que vomitou | 1, 5, 25, 100 | Mundo |
| Apagão | Vezes que apagou de tanto beber | 1, 5, 25, 100 | Mundo |
| Pé de Valsa | Minutos dançando | 5, 30, 120, 600 | Mundo |
| Estrela do Palco | Minutos tocando no palco | 5, 30, 120, 600 | Mundo |
| Mesa de Luz | Efeitos disparados, no máximo um a cada 5 s | 10, 50, 250, 1.000 | Mundo |
| DJ de Boteco | Vídeos que começaram a tocar nas TVs, no telão ou na jukebox | 5, 25, 100, 500 | Mundo |
| Ajudante do Magrão | Tarefas de turno | 10, 50, 250, 1.000 | Mundo |
| Freguês | Pedidos entregues na mesa | 5, 25, 100, 500 | Mundo |
| Rei do 21 | Mãos ganhas no blackjack | 5, 25, 100, 500 | Mundo |
| Craque do Pebolim | Partidas ganhas, sem contar W.O. | 1, 10, 50, 200 | Mundo |
| Motoboy | Km de moto | 1, 10, 50, 250 | Mundo |
| Barbeiro | Batidas que lançaram o piloto | 1, 10, 50, 200 | Mundo |
| Mecânico | Consertos de moto | 1, 10, 50, 200 | Mundo |
| Andarilho | Km a pé | 1, 10, 50, 250 | Mundo |
| Frequentador | Horas na cidade | 1, 10, 50, 200 | Mundo |
| Resenha | Mensagens de chat que alguém ouviu, no máximo uma a cada 10 s | 25, 100, 500, 2.000 | Mundo |
| Gente Boa | Acenos, no máximo um a cada 10 s | 10, 50, 200, 1.000 | Mundo |
| Telefonista | Ligações atendidas, de pelo menos 15 s (conta para os dois lados) | 1, 10, 50, 200 | Mundo |
| Fofoqueiro | Mensagens no Highzap | 25, 100, 500, 2.000 | API |
| Influencer | Fotos publicadas no Highgram | 1, 10, 50, 200 | API |
| Mão Aberta | Pix enviados | 1, 10, 50, 200 | API |

Atropelar pessoas de propósito não vale emblema, para não premiar quem atrapalha os outros.

### Regras da contagem

- **Bebida e comida contam pela parte consumida**: meia cerveja derrubada é meia cerveja a caminho da próxima. Vale igual na mão, na mesa e na mochila, porque tudo passa por `BarRoom.consume`.
- **O que dura** (dança, palco, tempo na cidade) é lido a cada 5 segundos. Personagem parado também conta, inclusive dançando com o jogador longe do teclado: o cliente envia comandos mesmo parado, então o servidor não sabe distinguir, e essas séries não valem moedas.
- **O que uma tecla poderia repetir** tem intervalo mínimo (`everyMs`) ou um custo real: tempo do clipe, moedas ou a bexiga.
- **Vídeo conta quando começa a tocar**, não quando entra na fila: um vídeo tirado da fila devolve as moedas e não conta.
- Bots de desenvolvimento não ganham nada.

## Como funciona

1. **Mundo:** `BarRoom.achieved` soma em `AchievementTracker` (`apps/server/src/world/achievements.ts`), em memória. As frações ficam lá, e só números inteiros saem.
2. **Relatório:** a cada rodada de manutenção (3 s), o mundo chama `POST /api/internal/achievements` com o que foi feito e quem está online. Se a API não responde, o que não foi entregue volta para o próximo relatório. Se o mundo cair, perde no máximo os últimos segundos, que não são dinheiro.
3. **API:** `AchievementService` (`apps/api/src/achievement-service.ts`) soma em `user_achievements` e dá os emblemas dos níveis cruzados.
4. **Aviso:** a mesma resposta traz os emblemas de quem está online ainda não avisados (`user_badges.notified_at` nulo), de qualquer origem: o mundo, o celular ou a concessão manual da administração. Cada um é avisado uma vez, e o mundo manda `achievement.unlocked` para o cliente.

O celular conta direto na API, uma vez por `requestId`: uma mensagem ou Pix repetido pela rede não soma de novo.

Um emblema é dado **só quando o contador cruza o nível**. Assim, um emblema retirado pela administração não volta na próxima cerveja, e o contador continua de onde estava.

## Na administração

Os 104 emblemas aparecem em **Administração → Emblemas**, com a linha "Automático, ao chegar a…". O administrador pode editar nome, descrição, raridade e arte, inclusive enviando um PNG: o emblema continua sendo dado do mesmo jeito. Apagar faz o emblema deixar de ser dado e sair de quem o tinha. Com imagem enviada, o número do nível não aparece na medalha, porque a arte fica sozinha.

As quantidades de cada nível ficam no código, não no painel. Texto de emblema editado no painel não muda sozinho se a quantidade mudar depois.

## Migração

`infra/migrations/012_achievements.sql` cria `user_achievements`, a coluna `user_badges.notified_at` e os emblemas. Ela também aproveita o que o banco já sabia: mãos ganhas no blackjack, mensagens do Highzap, fotos do Highgram e Pix enviados. Quem já tinha chegado a um nível recebe o emblema e o aviso ao entrar. O resto (cervejas, por exemplo) começa do zero, porque não havia registro.

## Criar uma série

1. Acrescente a entrada em `ACHIEVEMENT_SERIES`. O ícone precisa estar em `BADGE_ICONS`.
2. Chame `this.achieved(jogador, 'id')` no ponto do `BarRoom` em que a ação termina. Para algo que acontece na API, use o callback `achieved` de `PhoneService` ou `AchievementService.add`.
3. Crie uma migração nova com os emblemas da série. As já aplicadas não podem mudar, e `apps/api/test/achievements.test.ts` confere se todo emblema do catálogo está no banco.

## API

| Rota | O que faz |
| --- | --- |
| `GET /api/profile/achievements` | As séries do próprio jogador, com contagem, níveis e o que já tem |
| `POST /api/internal/achievements` | Só o mundo: `{events:[{userId,series,amount}],online:[id…]}`; responde `{unlocked:[{userId,badge}]}` |

## Testes

- `apps/api/test/achievements.test.ts`: catálogo, níveis, aviso único, retirada, emblema apagado e editado, celular, migração sobre dados antigos.
- `apps/server/test/achievements.integration.test.ts`: bebida real na mão, aceno, chat, caminhada, banheiro, dança, API fora do ar, avisos e bots.
- `tests/e2e/achievements.spec.ts`: tecla real, aviso, carta, aba, coleção e administração no navegador.
