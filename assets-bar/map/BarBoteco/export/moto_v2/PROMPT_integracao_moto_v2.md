# Tarefa: trocar a moto de entrega pela v2 (nova malha, luzes de verdade, rig completo)

Você está na VM do jogo "bar-de-buteco". A moto antiga (scooter do Sketchfab, `export/moto/`) foi substituída por uma moto naked de 125 cc refeita do zero a partir do modelo vermelho da Tripo. O rig mantém os nomes que `apps/web/src/engine/moto-delivery.ts` já usa, então a troca é quase direta; o que muda são as medidas, as luzes (agora são peças do GLB) e os ossos novos.

## Arquivos (em `assets-bar/map/BarBoteco/export/moto_v2/`)

- `moto_delivery.glb`: modelo + rig, ~1,8 MB (atlas 2048 JPEG + textura do baú + placa), 15,6 mil triângulos, 9 malhas (10 draw calls), 42 juntas.
- `moto_delivery_colisao.glb`: casco convexo (60 triângulos).
- `moto_delivery.js`: script PlayCanvas `motoDelivery` v2. Porte os campos novos para o `MotoRig` do `moto-delivery.ts` (mesma aritmética).
- `moto_atlas.png`, `moto_bau.png`, `moto_placa.png`: já estão dentro do GLB; só para conferência.
- `scripts/54_moto_tripo.py` + `moto_textura.py` (+ `carro_textura.py`, que ele importa): geram tudo no Blender. Não rode aqui; se algo precisar mudar, me diga o quê.

Não renomeie nós: o script e o jogo acham os ossos pelo nome.

## Medidas (use estes valores, não adivinhe)

- Metros reais, Y para cima, origem no chão no meio do entre-eixos, frente = +Z (padrão glTF), esquerda do piloto = +X.
- Caixa total (com espelhos): 0,81 × 1,26 × 2,07 m (largura × altura × comprimento), de z = −1,09 a +0,98.
- **Entre-eixos 1,38 m** (eixos em z = ±0,69), **raio da roda 0,29 m** (antes 1,342 m e 0,225 m: atualize `WHEELBASE` e `WHEEL_RADIUS` em `packages/shared/src/moto.ts`, e `raioRoda` no rig). Altura do banco 0,81 m.
- Colisão: o casco ou uma caixa com halfExtents (0.29, 0.61, 1.01) e offset do centro (0, 0.62, −0.03). Antes eram `HALF_WIDTH .32`, `HALF_LENGTH .99`, `CENTRE_Z −.05`, `HEIGHT 1.42`; agora `HALF_WIDTH .29`, `HALF_LENGTH 1.01`, `CENTRE_Z −.03`, `HEIGHT 1.26`. Confira se a escala (`SCALE`) multiplica essas constantes.
- Uma só pintura (vermelho Highland): o material `Moto_Pintura` multiplica a textura por `baseColorFactor` (0.78, 0.055, 0.045). O jogo pode trocar a cor mudando esse fator, sem outra textura.

## Rig

```
Moto_Rig > raiz > chassi > direcao > suspensao_diant > roda_dianteira
                                   > manete_freio, manete_embreagem, punho_acelerador, ponteiro_velocimetro
                                   > ponto_mao_E/D, ponto_farol, ponto_farol_alto, ponto_painel, ponto_seta_frente_E/D, ponto_buzina
                         > balanca > roda_traseira
                         > descanso
                         > bau > bau_tampa ; ponto_entrega
                         > ponto_piloto, ponto_garupa, ponto_pe_E/D, ponto_pe_garupa_E/D, ponto_lanterna, ponto_freio,
                           ponto_luz_placa, ponto_placa, ponto_seta_tras_E/D, ponto_escapamento, ponto_tanque, ponto_motor, ponto_camera
                 > ponto_contato_diant, ponto_contato_tras, ponto_descanso_chao
```

- Rotação de repouso = identidade em todos os nós, exceto `direcao` (inclinada 27° em X, como a coluna) e seus filhos, que compensam. Gire sempre `repouso × rotação` (o `moto_delivery.js` faz isso).
- `chassi`, `direcao` (eixo Y local, + = esquerda), `roda_dianteira`, `roda_traseira` (eixo X local, + = rolar para frente) funcionam como antes.
- Novos: `suspensao_diant` (desliza ao longo do seu Y local = eixo da coluna; + = comprime, curso útil 0,07 m), `balanca` (X local, + levanta a roda traseira, ±3°), `descanso` (X local; **repouso é recolhido**, −90° o abre e a perna toca o chão), `bau_tampa` (X local; −105° abre a tampa), `manete_freio` (Y local, − fecha), `punho_acelerador` (Y local), `ponteiro_velocimetro` (Y local; 0 = zero da escala, **−270° = fundo de escala**, 0 a 120 km/h).
- Para esconder o baú, escala 0 no osso `bau` (a malha tem pele; desativar o nó não esconde).
- Pontos de encaixe (posição em repouso, espaço da moto, Y para cima): `ponto_piloto` (0, 0.806, −0.30) superfície do banco; `ponto_mao_E/D` (±0.215, ~1.02, +0.27) manoplas (seguem o guidão); `ponto_pe_E/D` (±0.205, 0.385, −0.10) pedaleiras do piloto; `ponto_pe_garupa_E/D` (±0.205, 0.417, −0.50); `ponto_garupa` (0, 0.81, −0.48); `ponto_entrega` (0, 1.22, −0.76) tampa do baú; `ponto_escapamento` (−0.185, 0.41, −1.02); `ponto_camera` (0, 1.55, −0.35) alvo sugerido da câmera de 3ª pessoa. O piloto monta com as mesmas constantes do `seatRider` (`HIP_OVER_SEAT`, `HIP_FORWARD`, `WRIST_*`); confira visualmente porque o guidão é mais estreito (±0,27 m) e o banco 4 cm mais alto que o da scooter.

## Luzes: agora são peças do GLB

O `moto-lights.ts` hoje desenha lentes e halos por cima de um modelo de material único. A v2 tem uma malha por grupo de luz, todas **apagadas** de fábrica (cor de lente, sem emissive), todas com pele no osso certo:

| malha (nome do nó) | o que é | osso | ponto (luz real / halo) |
| --- | --- | --- | --- |
| `Luz_Farol` | lente do farol | direcao | `ponto_farol` (aponta +Z; vira com o guidão), `ponto_farol_alto` |
| `Luz_Posicao` | anel do farol + brilho do painel | direcao | `ponto_farol`, `ponto_painel` |
| `Luz_Seta_E`, `Luz_Seta_D` | seta dianteira + traseira do lado | direcao + chassi | `ponto_seta_frente_E/D`, `ponto_seta_tras_E/D` |
| `Luz_Lanterna` | lanterna + lâmpada da placa | chassi | `ponto_lanterna`, `ponto_luz_placa` |
| `Luz_Freio` | lente interna da lanterna | chassi | `ponto_freio` |

Para acender: clone o material por moto (os materiais do GLB são compartilhados entre instâncias) e ponha `emissive` + `emissiveIntensity`; o `luz(nome, ligada, intensidade)` do `moto_delivery.js` já faz isso e traz as cores (farol 1,0/0,96/0,82; seta 1,0/0,55/0,05; lanterna 1,0/0,06/0,04; freio 1,0/0,10/0,06). Se o jogo continuar usando halos e luzes reais (`moto-lights.ts`), basta reposicionar `LAMPS` nos pontos acima e acender as lentes do GLB em vez de desenhar lentes novas. Os lugares do modelo antigo (`chassi` em `[.128,.842,.598]` etc.) não valem mais: tudo mudou de lugar.

## Verifique antes de me entregar

Carregue o jogo pelo servidor como o jogador faz e tire screenshots da moto parada, andando e virando à direita. Confirme: anda para onde o farol aponta; rodas giram no sentido do movimento; virando à direita o guidão vira à direita (`ponto_mao_E` vai à frente) e a moto inclina para dentro; não tomba e bate nas paredes; o baú mostra o logo dos dois lados e atrás; farol, lanterna, freio e setas acendem sozinhos; o piloto senta com as mãos nas manoplas e os pés nas pedaleiras; sem erro no console. No fim, diga: arquivos alterados, o que testou, o que não ficou bom e o que dependeu de suposição.
