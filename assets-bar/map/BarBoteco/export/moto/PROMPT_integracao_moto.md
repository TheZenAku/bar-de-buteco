# Tarefa: colocar a moto de entrega (Highland Bar Delivery) no jogo

Você está na VM do servidor do jogo "bar-de-buteco" (Highland Bar). Quero a moto de entrega dentro do jogo: estacionada no mapa, pilotável com física de veículo e funcionando pelo servidor, do jeito que os jogadores acessam.

## Arquivos que já estão aqui

A pasta do pipeline do Blender foi copiada para `C:\Users\MuOnline\Desktop\BAR\bar-de-buteco\assets-bar\map\BarBoteco`. Os arquivos da moto devem estar em `export\moto\` dentro dela. Se não estiverem, procure por `moto_delivery.glb`.

- `moto_delivery.glb`: modelo + rig (559 KB, textura JPEG embutida). É este que vai para o jogo.
- `moto_delivery_colisao.glb`: casco convexo simplificado (118 triângulos) para colisão.
- `moto_delivery_atlas.png`: textura mestre. Já está dentro do GLB, não precisa carregar separado.
- `moto_delivery.js`: script PlayCanvas `motoDelivery` que anima rodas, guidão e inclinação. Leia o cabeçalho dele.
- `scripts\20_moto_delivery.py`: gera tudo no Blender. Não rode aqui; se o modelo precisar mudar, me diga o quê.

Não edite os GLBs nem renomeie nós: o script acha os ossos pelo nome.

## Antes de mexer: investigue e me mostre um plano curto

1. Qual motor o jogo usa de fato. Eu disse PlayCanvas, mas o mapa já foi integrado antes em three.js (`integracao_highland.js`, função `prepararMapa`, carregando `bar_boteco.glb`). Descubra se é PlayCanvas engine (npm/CDN), projeto do PlayCanvas Editor ou three.js, e a versão.
2. Como o mapa e os assets são carregados e servidos (caminhos, servidor HTTP/Node, build, cache).
3. Como o personagem é controlado: input, câmera, animações e colisão com o mapa (tem física? Ammo? colisão própria usando `bar_boteco_colisao.glb`?).
4. Se é multiplayer, como o estado dos jogadores é sincronizado.
5. Como o jogo é publicado no servidor (deploy, serviço, reinício).

Depois me diga em poucas linhas como vai integrar e o que vai alterar, e siga. Pergunte antes só se algo afetar jogadores online (por exemplo, reiniciar o serviço em produção). Se for um projeto do Editor que você não consegue editar daqui, me avise.

## Fatos do modelo (use estes valores, não adivinhe)

- Escala real em metros, Y para cima. Origem no chão, no meio entre os eixos.
- Frente da moto = +Z (padrão glTF, igual ao personagem do Mixamo). Esquerda do piloto = +X. No PlayCanvas, `entity.forward` aponta para -Z, então a frente no mundo é `-entity.forward`.
- Medidas: 1,26 × 1,47 × 1,99 m (largura × altura × comprimento, com espelhos). Rodas com raio de 0,225 m; entre-eixos de 1,342 m. Centro da roda dianteira em (0.004, 0.225, 0.671), traseira em (-0.015, 0.225, -0.671).
- Uma malha só, com pele rígida (cada vértice 100% em 1 osso): 1 material, ~8,4 mil triângulos, 15 juntas, 1 draw call.
- Hierarquia: `Moto_Rig > raiz > chassi`. Debaixo do `chassi`: `direcao` (com `roda_dianteira`, `ponto_mao_E`, `ponto_mao_D`, `ponto_farol`), `roda_traseira`, `bau` (com `ponto_entrega`), `ponto_piloto`, `ponto_pe_E`, `ponto_pe_D`, `ponto_lanterna`, `ponto_escapamento`.
- Rotação de repouso é identidade em todos os nós, menos `direcao` (inclinada 9,3° em X, seguindo a coluna) e o filho dela, `roda_dianteira`. Gire sempre como `repouso × rotação`, que é o que o moto_delivery.js faz.
  - Rodas: eixo X local; positivo = rolar para a frente.
  - Direção: eixo Y local do osso `direcao`; positivo = virar à esquerda.
  - Inclinação: eixo Z local do `chassi`, com pivô no chão; positivo = topo vai para a direita (-X).
- Para esconder o baú, ponha escala 0 no osso `bau`. Desativar o nó não esconde, porque a malha tem pele.
- Colisão: o casco `moto_delivery_colisao.glb` ou uma caixa com halfExtents (0.32, 0.71, 0.99) e offset (0, 0.71, -0.05).

Pontos de encaixe (posição em repouso, no espaço da moto):

| nó | pai | posição (x, y, z) | uso |
|---|---|---|---|
| ponto_piloto | chassi | (0, 0.767, -0.336) | superfície do banco; abaixe o personagem pela altura do quadril |
| ponto_mao_E / ponto_mao_D | direcao | (0.54, 1.195, 0.408) / (-0.54, 1.195, 0.423) | manoplas (seguem o guidão) |
| ponto_pe_E / ponto_pe_D | chassi | (±0.088, 0.427, 0.128) | assoalho |
| ponto_farol | direcao | (0.003, 1.263, 0.612) | luz do farol, apontando para +Z |
| ponto_lanterna | chassi | (-0.016, 0.649, -1.0) | luz de freio |
| ponto_escapamento | chassi | (-0.176, 0.241, -0.888) | fumaça |
| ponto_entrega | bau | (-0.017, 1.246, -0.785) | tampa do baú (pegar/entregar pedido) |

## O script moto_delivery.js

- É script clássico (`pc.createScript('motoDelivery')`), testado no PlayCanvas 2.23.3.
- Atributos: `velocidade` (m/s; negativo = ré), `direcao` (-1 a +1; +1 = direita), `anguloDirecao` (28°), `inclinacaoMax` (10°), `velocidadeInclinacao`, `raioRoda` (0,225) e `suavizacao`. Métodos: `ponto(nome)` e `frente()`.
- Ele só cuida do visual. Não deixe a física e o script girarem as mesmas peças: a cada quadro, passe para ele a `velocidade` e a `direcao` do veículo físico e deixe que ele anime os ossos.
- Se o projeto usar scripts ESM (`class extends Script`) ou criar o app depois de carregar os scripts, adapte: o `createScript` precisa que o app já exista, ou que ele seja passado como 2º argumento. Se o jogo for three.js, porte a mesma lógica (são umas 40 linhas).

## Física do veículo

Referência: "Vehicle Physics", projeto oficial da PlayCanvas que usa o RaycastVehicle do ammo.js (https://playcanvas.com/project/643289/overview/raycast-vehicle). Os scripts dele só abrem com login. Se você conseguir acessar, use como base; se não, implemente direto com `Ammo.btRaycastVehicle`.

- Moto tem 2 rodas, e o RaycastVehicle com 2 rodas tomba. Use 4 rodas de raycast invisíveis (2 por eixo, a ±0,15 m em X, raio 0,225) e mantenha o chassi em pé, por exemplo com `angularFactor (0, 1, 0)` no estilo arcade, ou com `rollInfluence` bem baixo. A inclinação na curva é só visual (osso `chassi`), e o script já faz isso.
- `setCoordinateSystem(0, 1, 2)` deixa a frente do veículo em +Z, igual à da moto.
- O sinal do steering do Bullet pode ser o contrário do `direcao` do script. Confira no teste.
- Ponto de partida para os ajustes: ~150 kg no total (moto + piloto) e velocidade máxima de uns 50–60 km/h, coerente com uma scooter. Ajuste motor, freio e suspensão até ficar gostoso de pilotar na rua.
- Se o jogo não usa Ammo e não dá para adicionar (ou se for three.js), faça um controle arcade: raycast para o chão nas duas rodas e colisão contra os mesmos colisores do mapa que o jogador já usa. Não coloque um segundo motor de física se já existir um.

## Comportamento esperado

- A moto aparece estacionada na rua, perto da entrada do bar. Deixe a posição numa constante fácil de mudar e me diga onde ficou.
- Montar: perto da moto aparece o aviso "E para subir". Ao apertar E, o personagem fica preso no `ponto_piloto` numa pose sentada/pilotando, e a câmera vai para a 3ª pessoa, atrás da moto. Se não houver animação de pilotar, use a melhor pose sentada que existir e me avise.
- Descer: apertar E de novo desmonta pelo lado esquerdo (+X).
- Controles: W/S acelera, freia e dá ré; A/D vira; espaço é freio de mão, se fizer sentido. Use o esquema de input que o jogo já tem, incluindo toque no celular, se houver.
- Multiplayer (se existir): sincronize posição, rotação, velocidade, direção e quem está pilotando. Nos outros clientes a moto é só visual (sem física), interpolada, com o mesmo moto_delivery.js animando rodas e guidão.

## Verifique antes de me entregar

Carregue o jogo pelo servidor, como o jogador faz, e tire screenshots da moto parada, andando e virando à direita. Confirme que:

- ela anda para onde o farol aponta;
- as rodas giram no sentido do movimento;
- virando à direita, o guidão vira à direita (o `ponto_mao_E` vai para a frente) e a moto inclina para dentro da curva;
- ela não tomba, e bate nas paredes em vez de atravessar;
- o baú mostra o logo Highland Bar Delivery dos dois lados;
- não aparece nenhum erro no console.

No final, me diga: arquivos alterados, onde a moto ficou, os controles, o que você testou e o resultado, o que não ficou bom e o que dependeu de suposição.
