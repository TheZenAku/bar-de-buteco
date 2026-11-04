# Tarefa: trocar a moto de entrega pela v3 (naked 250 cc refeita) e tratar a bag como item separado

Você está na VM do jogo "bar-de-buteco". A moto v3 substitui a v2 (e a scooter antiga). Ela mantém os nomes de osso que `apps/web/src/engine/moto-delivery.ts` já usa (`chassi`, `direcao`, `roda_dianteira`, `roda_traseira`, `ponto_piloto`, `ponto_mao_E/D`, `ponto_pe_E/D`, `ponto_farol`, `ponto_lanterna`, `ponto_escapamento`), então a troca é quase direta. **A bag de entrega NÃO vem na moto**: é outro GLB, encaixado no `ponto_bau`.

## Arquivos (em `assets-bar/map/BarBoteco/export/moto_v3/`)

- `moto_delivery.glb` (2,6 MB, 31 mil triângulos, 35 juntas): 7 malhas — `Moto` (1 material, textura 2048 + mapa metal/rugosidade), `Moto_Placa`, `Luz_Farol`, `Luz_Seta_E`, `Luz_Seta_D`, `Luz_Lanterna`, `Luz_Freio`.
- `moto_delivery_colisao.glb`: casco convexo (110 triângulos), sem espelhos nem pontas do guidão.
- `moto_bag.glb` (0,4 MB, 1,8 mil triângulos): bag de entrega, com logo Highland Bar Delivery dos dois lados e atrás.
- `moto_delivery.js` e `moto_bag.js`: scripts PlayCanvas. Porte os campos novos para o `MotoRig` do `moto-delivery.ts`.
- `moto_atlas.png`, `moto_metal_rugosidade.png`, `moto_placa.png`, `moto_bag.png`: já embutidas nos GLBs.
- `scripts/`: `55_moto_v3.py`, `56_moto_bag.py`, `moto_textura3.py`, `moto_ref.py` e dependências. Não rode aqui; se algo precisar mudar, me diga o quê.

Não renomeie nós: o script e o jogo acham os ossos pelo nome.

## Medidas (use estes valores)

- Metros reais, Y para cima, origem no chão entre os eixos, frente = +Z, esquerda do piloto = +X.
- Caixa total (com espelhos): 0,85 × 1,18 × 2,03 m (largura × altura × comprimento).
- **Entre-eixos 1,361 m** (eixos em z = −0,686 e +0,675), **raio da roda 0,30 m**, banco a 0,80 m. Antes (scooter) eram 1,342 m e 0,225 m: atualize `WHEELBASE` e `WHEEL_RADIUS` em `packages/shared/src/moto.ts` e `raioRoda` no rig.
- Colisão: o casco, ou caixa com halfExtents (0.29, 0.51, 1.00) e offset do centro (0, 0.51, −0.02). Em `moto.ts`: `HALF_WIDTH .29`, `HALF_LENGTH 1.00`, `CENTRE_Z −.02`, `HEIGHT 1.18`. Confira se `SCALE` multiplica essas constantes.
- Cor: o vermelho Highland está assado na textura (decalques com cor real, não dá para recolorir por `baseColorFactor`). Se quiser outras cores, peça outra textura.

## Rig

```
Moto_Rig > raiz > chassi > direcao > suspensao_diant > roda_dianteira
                                   > ponto_mao_E/D, ponto_farol, ponto_farol_alto, ponto_seta_frente_E/D, ponto_buzina
                         > balanca > roda_traseira
                         > descanso
                         > ponto_piloto, ponto_garupa, ponto_pe_E/D, ponto_pe_garupa_E/D, ponto_lanterna, ponto_freio,
                           ponto_luz_placa, ponto_placa, ponto_seta_tras_E/D, ponto_escapamento, ponto_tanque, ponto_motor,
                           ponto_bau, ponto_camera
                 > ponto_contato_diant, ponto_contato_tras, ponto_descanso_chao
```

- Rotação de repouso = identidade em todos os nós, exceto `direcao` e `suspensao_diant` (inclinados 27°, a coluna) e seus filhos, que compensam. Gire sempre `repouso × rotação` (o `moto_delivery.js` faz).
- `chassi` (Z local = inclinação, + inclina para a direita), `direcao` (Y local, + = esquerda), `roda_dianteira` e `roda_traseira` (X local, + = rolar para a frente) funcionam como antes.
- Novos: `suspensao_diant` (desliza no Y local = eixo da coluna; + comprime, curso 0,07 m), `balanca` (X local; + levanta a roda traseira, ±3°), `descanso` (X local; **repouso é recolhido**, −90° abre e a perna toca o chão).
- Pontos: `ponto_piloto` (0, 0.80, −0.30) superfície do banco; `ponto_garupa` (0, 0.87, −0.64); `ponto_pe_E/D` (±0.235, 0.30, −0.115) pedaleiras; `ponto_mao_E/D` nas manoplas (seguem o guidão); `ponto_bau` (0, 0.885, −0.70) onde a bag assenta; `ponto_escapamento` na ponta do cano; `ponto_camera` alvo sugerido da 3ª pessoa. Confira a pose do piloto (`seatRider`) visualmente: o guidão e o banco são outros.

## Bag de entrega (modelo separado)

- `moto_bag.glb`: origem no centro da base, já inclinada 13° para assentar no banco; filha de `moto.ponto('ponto_bau')` com posição e rotação locais zero (`moto.encaixarBag(bag)` faz isso). 0,42 × 0,44 m de base, 0,30 m de corpo + 0,085 m de tampa com alça. Rig: `Bag_Rig > bag_raiz > bag_tampa`; `bag.script.motoBag.aberta = true` abre a tampa (−105° em X).
- A moto sai sem bag por padrão. Quem monta a bag (entregador em serviço, por exemplo) instancia o GLB e a encaixa; tirar a bag é `bag.destroy()`. Se for desenhar a bag para outros jogadores, sincronize só um booleano "tem bag".

## Luzes: peças do GLB, apagadas de fábrica

| malha | o que é | osso | ponto (luz real / halo) |
| --- | --- | --- | --- |
| `Luz_Farol` | lente do farol | direcao | `ponto_farol` (aponta +Z; vira com o guidão), `ponto_farol_alto` |
| `Luz_Seta_E`, `Luz_Seta_D` | seta dianteira + traseira do lado | direcao + chassi | `ponto_seta_frente_E/D`, `ponto_seta_tras_E/D` |
| `Luz_Lanterna` | lanterna traseira (+ luz da placa) | chassi | `ponto_lanterna`, `ponto_luz_placa` |
| `Luz_Freio` | lente interna da lanterna | chassi | `ponto_freio` |

Para acender, clone o material por moto (os do GLB são compartilhados entre instâncias) e ponha `emissive` + `emissiveIntensity`; o `luz(nome, ligada, intensidade)` do `moto_delivery.js` faz isso (cores: farol 1,0/0,96/0,82; seta 1,0/0,55/0,05; lanterna 1,0/0,06/0,04; freio 1,0/0,10/0,06). Se o jogo mantiver os halos e luzes reais do `moto-lights.ts`, reposicione `LAMPS` nos pontos acima e acenda as lentes do GLB em vez de desenhar lentes novas. Os lugares da scooter não valem mais. Não há luz de posição nem painel aceso nesta moto.

## Verifique antes de me entregar

Carregue o jogo pelo servidor como o jogador faz e tire screenshots da moto parada, andando e virando à direita, com e sem bag. Confirme: anda para onde o farol aponta; rodas giram no sentido do movimento; virando à direita o guidão vira à direita (`ponto_mao_E` vai à frente) e a moto inclina para dentro; não tomba e bate nas paredes; a bag aparece só quando encaixada e mostra o logo dos dois lados e atrás; farol, lanterna, freio e setas acendem sozinhos; o piloto senta com as mãos nas manoplas e os pés nas pedaleiras; sem erro no console. No fim, diga: arquivos alterados, o que testou, o que não ficou bom e o que dependeu de suposição.
