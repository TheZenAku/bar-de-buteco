# Portas

As 16 folhas de porta do mapa BarBoteco abrem e fecham. São 15 portas, uma delas dupla: a do corredor do quintal, com as folhas `_E` e `_D`.

## De onde vêm os eixos

Em `04_predio.py`, cada folha é um objeto separado com o **pivô na dobradiça**, criado aberto a ±95° e com a propriedade `angulo_fechada_graus`. No GLB, isso vira um nó raiz por folha: a origem do nó é a dobradiça, a rotação (só em torno do eixo vertical) é o ângulo aberto exportado, e `extras.angulo_fechada_graus` é o ângulo fechado. O importador (`tools/import-map.mjs`) lê esses dados e grava em `map-data.json`:

- `doors[]`: id, porta (as folhas `_E`/`_D` formam uma porta), dobradiça, ângulo fechado, ângulo aberto e caixa local da folha (0,70 m de largura e 2,08 m de altura, com as maçanetas).

O importador recusa uma folha que não seja nó raiz ou que gire em outro eixo. O cenário e a hierarquia não foram alterados: o jogo só gira cada nó em torno da própria origem, de `angulo_fechada_graus` até o ângulo exportado, pelo sentido de 95° com que foi construída. Os sentidos variam por porta (por exemplo, as do banheiro abrem para dentro, a da cozinha para o corredor), e cada um é preservado.

## Comportamento

- Encostar no vão (dos dois lados) mostra **Abrir a porta** ou **Fechar a porta** com o nome do cômodo; **E** alterna. No vão, a porta tem prioridade sobre uma cadeira próxima.
- A folha gira suavemente em 0,8 s, a partir do horário do servidor; quem chega depois vê a porta já aberta ou fechada.
- **Ninguém é atravessado:** se alguém estiver na área que a folha varre, a porta não se move (*Tem alguém atrás da porta* ou *no caminho da porta*). Se o único no caminho for quem está usando a porta, o personagem dá um passo para trás, para um ponto livre fora da varredura.
- Cada porta é independente; a porta dupla abre e fecha as duas folhas juntas.
- As portas começam abertas, como no mapa exportado.

## Colisão

As folhas deixaram de ser colisores fixos. A física compartilhada (`solidColliders` em `packages/shared/src/world.ts`) põe a caixa de cada folha onde o estado da porta manda: no vão quando fechada, encostada na parede quando aberta. O servidor e a previsão de movimento do cliente usam o mesmo estado (`setDoorStates`, aplicado pela rede a cada atualização), então não há barreira invisível nem porta que se atravessa. A câmera também esbarra nas folhas.

Os vãos do mapa têm 0,80 m para um corpo de 0,68 m, e a folha aberta a 95° ocupa parte dessa largura. Para ninguém ficar preso no batente, dentro do vão de uma porta aberta o corpo passa de lado: colide com raio de 0,25 m em vez de 0,34 m. Ao empurrar contra o batente, ele desliza para o centro do vão. Porta fechada bloqueia por inteiro. As 15 portas são atravessadas nos dois sentidos, mesmo fora do centro.

## Multiplayer

`BarState.doors` guarda, por porta, `open` e `changedAt`, sincronizados para toda a sala. A interação usa a mensagem existente `player.interact`; o servidor valida a distância e a área varrida e registra `door` no log. O estado é efêmero como o resto do mundo: reiniciar o servidor reabre as portas.

## Testes

- `tests/integration/doors.test.ts`:
  - dobradiças, ângulos e caixas conferidos contra o GLB;
  - porta fechada bloqueia e aberta deixa passar, cada uma independente;
  - as 15 portas atravessadas nos dois sentidos, fora do centro;
  - varredura e interação pelos dois lados, nunca de outro andar;
  - pontos de uso das TVs.
- `apps/server/test/doors.integration.test.ts`: conexões reais. Estado sincronizado, outra pessoa no caminho bloqueia, quem usa a porta dá um passo para trás, o movimento continua sendo confirmado depois e o item de bebida é sincronizado.
- `tests/e2e/doors.spec.ts` (projeto `doors`): dois jogadores no navegador. O primeiro fecha a porta do banheiro, os dois clientes veem a folha girar até fechar, o vão fica bloqueado, a porta reabre e o primeiro entra no banheiro.

Capturas: [porta fechada](previews/door-closed.png) e [porta aberta](previews/door-open.png).
