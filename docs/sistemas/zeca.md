# Zeca: o desafio do terraço

Zeca é um lutador que fica no **terraço do andar de cima** (marcador `Ponto_Terraco`, o maior chão livre do bar). Quem chega perto e aperta **E** ("Falar com o Zeca") ouve um desafio: um sparring valendo moedas, XP e conquistas. A luta é a [luta de soco](luta.md) de verdade, com guarda, bloqueio e parry, contra um boneco que o servidor controla.

## Como funciona

1. **Conversa.** E perto dele abre o diálogo (`sparring.talk` → `sparring.dialog`). Ele fala uma fala de desafio e oferece **Bora! (E)** ou **Agora não (Esc)**. Em cooldown ele diz quanto falta ("daqui a 5 h 12 min") e só oferece "Certo". Se há outra luta em andamento, pede para esperar. **Não existe seletor de dificuldade e nenhuma fala cita a fase.**
2. **Contagem.** Aceitar (`sparring.accept`) leva o jogador a 2,1 m do Zeca (se o chão permite), levanta a guarda sozinho e começa uma contagem de 3 s. Nela o Zeca não ataca e não pode ser atingido.
3. **Luta.** Os dois têm **vida própria da luta** (o jogador 100; o Zeca 70, 100 ou 130). A barra de vida real **nunca é tocada**, nem há nocaute nem Morte: a vida real fica como estava. Cada golpe, bloqueio e parry vale como em qualquer luta entre jogadores. Limite de 3 minutos; sair a mais de 14 m do Zeca, sentar, cair da conexão ou apertar **Desistir** encerra a luta como derrota.
4. **Fim.** Zerar a vida do Zeca vence (ele cai e se levanta; depois some e o Zeca parado volta ao terraço). Zerar a sua perde. Vencendo, o servidor pede o prêmio à API **uma vez** (id da luta) e avisa com `sparring.result` (faixa "+N moedas").

Só uma luta de cada vez no bar: o Zeca que luta é um corpo extra (um `Player` do mundo, id `sparring:<jogador>`) e o parado sai de cena durante ela.

## A escada (dinâmica, sem escolha)

Cada jogador tem um degrau, guardado pela API (`sparring_progress`). Ganhar o prêmio sobe um degrau; vencer o mais difícil volta ao primeiro. Perder não muda nada (e não gasta o cooldown).

| Degrau | Prêmio | Vida do Zeca | Dano dele | Reação | Bloqueia | Parry | Combos | Particularidade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (fácil) | 100 moedas | 70 | 60% | 520 ms | 12% | 0% | jab ou jab-direto | parado de frente, lento |
| 2 (médio) | 200 moedas | 100 | 90% | 300 ms | 40% | 12% | até 3 socos, ou jab + forte | |
| 3 (difícil) | 300 moedas | 130 | 110% | 170 ms | 62% | 35% | até 3 socos, jab + forte, forte | circula em volta do jogador |

Tudo isso é `SPARRING_TIERS` (`packages/shared/src/sparring.ts`). "Reação" é quanto o Zeca demora para ver um golpe vindo; só então decide bloquear. O parry exige apertar até 180 ms antes do golpe, então só um Zeca rápido consegue parar um jab. Ao se levantar de um golpe ele se cobre (com a probabilidade de bloqueio), então uma sequência não é de graça.

## Cooldown

Jogador comum: **6 horas** entre prêmios, contadas **da última vitória paga**. Durante ela o Zeca nem aceita a luta (a conversa avisa o tempo restante, pela API, então vale mesmo entre reinícios do mundo). Administrador: **ilimitado** (a API lê o papel da conta). Uma vitória que a API recusar por cooldown (corrida) mostra "o Zeca só paga uma vez a cada 6 horas" e não dá nada.

## Conquistas e XP

Cada vitória **paga** (e só ela, para não haver farm) conta nas séries:

| Série | Conta | Níveis | XP por unidade |
| --- | --- | --- | --- |
| Sparring do Zeca (`sparring`) | toda vitória | 1, 5, 25, 100 | 50 |
| Quebra-Queixo (`quebra-queixo`) | vitórias no degrau mais difícil | 1, 5, 15, 50 | 100 |

Uma vitória no degrau 3 rende 150 XP no total, uma no degrau 1, 50. O XP é lido dos contadores como todo o resto ([níveis](niveis.md)) e pode ser ajustado em Administração → preços (`xp:sparring`, `xp:quebra-queixo`).

## Onde está o código

- `packages/shared/src/sparring.ts`: constantes, degraus, tipos das mensagens e esquemas da API.
- `apps/server/src/world/sparring.ts`: `SparringDirector` (conversa, duelo, fim, prêmio) e `SparringAI` (o que o Zeca faz a cada tick). Ligação em `BarRoom.ts` (`sparring`, mensagens `sparring.talk/accept/quit`, ganchos de dano e nocaute do `FightHost`: `spared`, `damage`, `knockout`, `hittable`).
- `apps/server/src/world/npcs.ts`: o Zeca parado (`Npc` `sparring`, skin Tião).
- API: `infra/migrations/026_sparring.sql` (`sparring_progress`), `027_sparring_achievements.sql` (os 8 emblemas), `apps/api/src/sparring-service.ts`, rotas `/api/internal/sparring/status` e `/win`. A razão do extrato é `sparring:win`.
- Cliente: `apps/web/src/sparring/` (diálogo, barras, contagem, faixa de resultado), `main.ts` (`sparringPrompt`, ligação das mensagens).
- Testes: `apps/api/test/sparring.test.ts` (escada, cooldown de 6 h, admin, idempotência), `apps/server/test/sparring.test.ts` (conversa, contagem, vitória, derrota, degraus mais duros, limites) e `sparring.integration.test.ts` (tudo por WebSocket).

## Por que é assim

- **O Zeca é um jogador do mundo**, não um NPC: assim a luta inteira (bloqueio, parry, netcode com adiamento do acerto, mira, reações, efeitos, números de dano) funciona sem uma linha duplicada. O preço são ganchos pequenos: a vida real é poupada (`FightHost.spared`), o dano vai para a vida da luta e o nocaute do Zeca encerra a luta em vez de lançá-lo.
- **O prêmio é da API**, num registro só, com id da luta: a escada e o cooldown sobrevivem a reinício e a queda do mundo, e uma repetição não paga duas vezes.
- A IA vê o golpe pelos dados da sala (como um jogador vê pela tela) mas só depois da sua "reação", e não tem lag compensation (`seen` no futuro): o Zeca enxerga a sala como ela é.

## Pendências e o que não foi verificado

- **Nada foi visto nem ouvido na tela:** o posicionamento no terraço (testei só que o chão em volta é livre), a contagem, as barras e a faixa de resultado só foram checados por teste e tipos.
- O equilíbrio dos três degraus foi medido só contra um bot que ataca sem defender (esse bot ganha dos degraus fácil e médio com facilidade e perde para o difícil na maioria das vezes). Contra gente de verdade, os números (`SPARRING_TIERS`) provavelmente precisam de ajuste.
- O Zeca parado fica em pose de descanso (não de guarda) e cai com o clipe `Fallen`; falas e rosto do diálogo são provisórios (um ícone, sem retrato).
- Quem luta enquanto outro jogador está por perto vê o Zeca como um jogador qualquer em listas e no mapa (nome "Zeca").
