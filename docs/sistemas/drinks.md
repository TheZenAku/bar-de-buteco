# Bebidas e comidas em 3D

Ao pedir no balcão (E ou *Pedir gelada*), o jogador escolhe **long neck** ou **copo de chopp**. O Seu Zé prepara e entrega; o personagem bebe com o objeto escolhido na mão, e todos no bar veem o mesmo objeto. Água, refrigerante e café usados da mochila aparecem na mão do mesmo jeito, cada um com o próprio objeto.

Tudo o que o Tonico serve na mesa também é um objeto 3D: ele leva o pedido na bandeja e deixa os itens no tampo (veja [economia](economia.md#pedido-na-mesa-tonico)).

## Assets

Os modelos reais estão em `assets-bar/objects` (1 malha cada, cerca de 1,9 m e texturas PBR de 2048 px no original):

| Item | Pasta | No jogo (`apps/web/public/props/<id>.glb`) |
| --- | --- | --- |
| `garrafa` (long neck) | `garrafa de cerveja` | 3 000 triângulos, **23 cm**, 247 KiB |
| `copo` (chopp) | `copo americano` | 2 400 triângulos, **9,3 cm**, 212 KiB |
| `agua` | `Garrafa de Agua` | 2 400 triângulos, **20,5 cm** (500 ml), 195 KiB |
| `refrigerante` | `highcola` | 2 400 triângulos, **19 cm** com o canudo, 236 KiB |
| `cafe` | `Cafe` | 2 000 triângulos, **12 cm** com a tampa, 214 KiB |
| `coxinha` | `Coxinha` | 1 500 triângulos, **8 cm**, 209 KiB (servida num pratinho) |
| `pastel` | `Pastel` | 1 500 triângulos, **15 cm** de comprimento, deitado, 152 KiB (servido num pratinho) |
| `torresmo` | `Porção de Torresmo` | 3 000 triângulos, prato de **23 cm**, 396 KiB |

Banqueta, cadeira, mesa, chopeira e carrinho de espeto, da mesma pasta, já fazem parte do mapa (`bar_boteco.glb`).

Os FBX do Meshy vêm centrados na origem, deitados (girados −90° em X) e em escala de centímetros ×100. `npm run assets:drinks` (`tools/assets/import-drinks.mjs`):

- aplica a transformação do FBX e reduz cada objeto ao tamanho real (uma long neck de 355 ml e um copo americano de 190 ml), sem deformar;
- põe a origem no centro da base, com +Y apontando para a boca do objeto e o rótulo para +Z (o pastel, modelado em pé, é deitado);
- quando a exportação separa as normais em cada face (o que impede juntar vértices e simplificar), refaz as normais suaves com vincos acima de 60°; comidas com muitas arestas vivas simplificam em modo `Permissive`;
- simplifica a malha com o `meshoptimizer`, preservando as costuras de UV e as normais;
- reduz e incorpora as texturas: cor e normal em 512 px, metálico e rugosidade combinados no canal glTF.

Os arquivos originais não são alterados. `npm run assets:drinks -- agua cafe` reimporta só os itens citados.

## Pegada por esqueleto

O clipe de bebida (`bebendo.fbx`, adaptado a cada rig) levanta a bebida com a **mão esquerda**. A cada quadro, depois da animação, `apps/web/src/engine/drink-props.ts` reconstrói a pegada a partir dos ossos daquele personagem:

- **Mão:** direção dos dedos (da mão até o meio das primeiras falanges), eixo entre os nós dos dedos (do mínimo ao indicador; sem mínimo, pelo polegar) e lado da palma (medido na pose de bind: palmas para baixo na pose T, para as coxas na pose A).
- **Objeto:** em pé no punho, com o fundo para o lado do mínimo e a boca para o lado do polegar, encostado na palma. A garrafa é segurada a um terço da altura; o copo, mais embaixo, com a borda acima da mão.
- **Dedos:** se fecham em volta do objeto. O sentido da flexão é testado em cada dedo, porque os eixos das juntas variam entre rigs.
- **Gole:** perto da boca, o **pulso gira** com o objeto até o ângulo de beber. Na garrafa, o fundo sobe acima do gargalo; no copo, a borda inclina para o rosto. Mão e objeto se movem juntos, a borda chega aos lábios (no máximo 3,5 cm de ajuste) e nunca entra no rosto.
- **Fim:** quando o clipe volta, o pulso volta junto; ao terminar a bebida, o objeto some da mão.

Assim não há um deslocamento fixo por convenção de osso. Funciona nos esqueletos suportados, cada um como foi feito: Nathan (Renderpeople), Leandro e Read (AccuRig) e Rafael (Unreal). O Read não tem os dedos médio, anelar e mínimo: o eixo vem do polegar, e há um ajuste por personagem em `RIG_GRIP`. Nenhum esqueleto foi substituído, e as demais animações não mudaram.

## Estado e multiplayer

`Player.drinkItem` (um de `HELD_DRINKS`: `garrafa`, `copo`, `agua`, `refrigerante`, `cafe`, ou vazio) é definido no pedido ou pelo item da mochila (`prop` no catálogo) e sincronizado com a sala; os outros jogadores veem o mesmo objeto na mesma mão. Ele é limpo ao terminar de beber, ao cancelar, ao sair e ao entrar de novo. Uma segunda bebida não começa durante a primeira. O NPC que bebe usa a garrafa. A água é bebida como a garrafa (fundo para cima), o refrigerante quase em pé, pelo canudo, e o café inclinado como um copo. Se o modelo não carregar, aparece o copo simples antigo. Veja também [inventário](inventory.md).

## Testes

- `tests/integration/drinks.test.ts`: os oito GLBs são válidos, de tamanho real, com origem na base, centrados, dentro da área que a mesa reserva para cada um, com malha simplificada e texturas incorporadas; todo item do cardápio da mesa tem objeto, e toda bebida da mochila tem o seu na mão.
- `apps/server/test/doors.integration.test.ts`: o copo escolhido é sincronizado para outro jogador e limpo ao cancelar.
- `tests/e2e/bar.spec.ts`: o pedido no balcão mostra a escolha, e o personagem bebe com a garrafa na mão.
- Verificação visual nos seis rigs, em repouso e no gole, com a garrafa e com o copo: [pegadas](../previews/drink-grip.png) e [gole com a garrafa](../previews/drink-sip.png).
