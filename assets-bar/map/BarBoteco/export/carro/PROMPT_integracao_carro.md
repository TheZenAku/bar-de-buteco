# Tarefa: colocar o carro hatch no jogo

Você está na VM do servidor do jogo "bar-de-buteco" (Highland Bar). O jogo já tem veículo (a moto de entrega: `apps/web/src/engine/moto-delivery.ts`, `moto-lights.ts`, `moto-motion.ts`, garagem, app "Motors" no celular). Quero o **carro hatch** como segundo modelo de veículo, aproveitando esse sistema: comprável na loja do celular, guardado na garagem, dirigível, com as luzes e as portas funcionando, sincronizado entre jogadores.

## Arquivos

A pasta do pipeline do Blender está em `C:\Users\MuOnline\Desktop\BAR\bar-de-buteco\assets-bar\map\BarBoteco`. Os arquivos do carro ficam em `export\carro\`. Se não estiverem, procure por `carro_hatch.glb`.

- `carro_hatch.glb`: modelo + rig (1169 KB, atlas JPEG 2048 embutido). É ele que vai para o jogo (sugestão: `apps/web/public/carro/carro_hatch.glb`, ao lado de `public/moto/`).
- `carro_hatch_colisao.glb`: casco convexo simplificado (228 triângulos) para a física.
- `carro_atlas.png` / `carro_placa.png`: texturas mestre (já estão dentro do GLB).
- `carro_hatch.js`: script PlayCanvas clássico `carroHatch` (rodas, direção, volante, rolagem, portas, capô, tampa, limpadores, faróis, freio, ré, setas, cor e placa). Leia o cabeçalho dele.
- `scripts\21_carro_hatch.py` (+ `carro_textura.py`): geram tudo no Blender. Não rode aqui. Se o modelo precisar mudar, me diga o quê.

Não edite o GLB nem renomeie nós: o script acha ossos, malhas e materiais pelo nome.

## Antes de mexer

Leia como a moto foi integrada (carregamento do GLB, `MotoRig`, montar/desmontar, câmera, física, rede, garagem, `MOTO_MODEL` em `@bar/shared`) e me mostre um plano curto de como generalizar isso para um segundo modelo sem quebrar a moto. Pergunte antes só se algo afetar jogadores online (reiniciar serviço, mudar `map-data.json`).

## Fatos do modelo (use estes valores, não adivinhe)

- Escala real em metros, Y para cima, origem no chão no meio do entre-eixos.
- Frente do carro = +Z (padrão glTF, igual à moto e ao Mixamo). Esquerda do motorista = +X; o motorista senta à **esquerda** (+X). No PlayCanvas, `entity.forward` aponta para -Z, então a frente no mundo é `-entity.forward` (`carro.frente()`).
- Medidas: 1.73 × 1.39 × 3.71 m (largura com espelhos × altura × comprimento). Rodas com raio de 0,285 m; entre-eixos de 2,314 m; bitola de 1,33 m. Centros das rodas: dianteiras em (±0.665, 0.29, 1.157), traseiras em (±0.665, 0.29, -1.157).
- 14 mil triângulos e 9 draw calls: malha `Carro` com 2 materiais (`Carro_Pintura`, a lataria que recebe a cor do carro, e `Carro_Atlas`, o resto), `Carro_Vidros` (transparente, dupla face), `Carro_Placas`, e as lentes `Luz_Farol`, `Luz_Lanterna`, `Luz_Re`, `Luz_Seta_E` e `Luz_Seta_D`, cada uma com material próprio para acender separado. Tudo com pele rígida no mesmo esqueleto (42 juntas).
- O emissivo das lentes vem ligado no GLB (fator 1). O `carroHatch` apaga tudo no `initialize` e acende conforme o estado. Se não usar o script, apague você mesmo.
- Hierarquia: `Carro_Rig > raiz`. Debaixo de `raiz`: `chassi`, `direcao_E > roda_dianteira_E`, `direcao_D > roda_dianteira_D`, `roda_traseira_E`, `roda_traseira_D`, `ponto_porta_E`, `ponto_porta_D`. Debaixo de `chassi`: `porta_E`, `porta_D`, `capo`, `tampa_traseira` (com `limpador_traseiro` e `ponto_placa_tras`), `volante` (com `ponto_mao_E` e `ponto_mao_D`), `limpador_E`, `limpador_D` e os outros pontos.
- A rotação de repouso é identidade em todos os nós, menos `volante` (eixo Y = coluna de direção) e os três limpadores (eixo Y = normal do vidro). Gire sempre como `repouso × rotação`, que é o que o `carro_hatch.js` faz.
  - Rodas: eixo X local; positivo = rolar para a frente.
  - Direção (`direcao_E/D`): eixo Y local; positivo = virar à esquerda.
  - Rolagem: eixo Z local do `chassi` (pivô a 0,55 m do chão); positivo = topo vai para a direita (-X).
  - Portas: eixo Y local; `porta_E` abre com ângulo negativo e `porta_D` com positivo (~68°). Capô: eixo X, negativo (~52°). Tampa traseira: eixo X, positivo (~78°).
- Para esconder uma peça (ex.: tirar uma porta), ponha escala 0 no osso dela. Desativar o nó não esconde, porque a malha tem pele.
- Colisão: o casco `carro_hatch_colisao.glb` ou uma caixa com halfExtents (0.76, 0.56, 1.80) e offset (0, 0.82, 0).

Pontos de encaixe (posição em repouso no espaço do carro, já em coordenadas glTF):

| nó | pai | posição (x, y, z) | uso |
|---|---|---|---|
| ponto_placa_tras | tampa_traseira | (0.000, 0.755, -1.793) | placa traseira (segue a tampa) |
| ponto_mao_E | volante | (0.534, 0.804, 0.270) | volante, mão esquerda (segue o volante) |
| ponto_mao_D | volante | (0.186, 0.804, 0.270) | volante, mão direita (segue o volante) |
| ponto_motorista | chassi | (0.360, 0.542, -0.020) | assento do motorista; abaixe o personagem pela altura do quadril |
| ponto_passageiro | chassi | (-0.360, 0.542, -0.020) | assento do passageiro |
| ponto_tras_E | chassi | (0.330, 0.512, -0.780) | banco de trás, lado esquerdo |
| ponto_tras_D | chassi | (-0.330, 0.512, -0.780) | banco de trás, lado direito |
| ponto_olhos | chassi | (0.360, 1.170, -0.100) | câmera interna (olhos do motorista) |
| ponto_pe_E | chassi | (0.270, 0.377, 0.630) | pedal da embreagem |
| ponto_pe_D | chassi | (0.430, 0.377, 0.630) | pedais de freio/acelerador |
| ponto_farol_E | chassi | (0.488, 0.645, 1.737) | centro do farol esquerdo (spot para +Z) |
| ponto_farol_D | chassi | (-0.488, 0.645, 1.737) | centro do farol direito |
| ponto_lanterna_E | chassi | (0.597, 0.769, -1.763) | lanterna/freio esquerda |
| ponto_lanterna_D | chassi | (-0.597, 0.769, -1.763) | lanterna/freio direita |
| ponto_re_E | chassi | (0.547, 0.676, -1.766) | luz de ré esquerda |
| ponto_re_D | chassi | (-0.547, 0.676, -1.766) | luz de ré direita |
| ponto_seta_frente_E | chassi | (0.617, 0.640, 1.729) | seta dianteira esquerda |
| ponto_seta_frente_D | chassi | (-0.617, 0.640, 1.729) | seta dianteira direita |
| ponto_seta_tras_E | chassi | (0.623, 0.668, -1.761) | seta traseira esquerda |
| ponto_seta_tras_D | chassi | (-0.623, 0.668, -1.761) | seta traseira direita |
| ponto_placa_frente | chassi | (0.000, 0.415, 1.849) | placa dianteira |
| ponto_escapamento | chassi | (-0.420, 0.250, -1.860) | ponta do escapamento (fumaça) |
| ponto_luz_interna | chassi | (0.000, 1.362, -0.300) | luz de teto |
| ponto_porta_malas | chassi | (0.000, 0.930, -1.420) | centro do porta-malas (carga/entrega) |
| ponto_porta_E | raiz | (1.150, 0.000, 0.150) | no chão, ao lado da porta do motorista (entrar/sair) |
| ponto_porta_D | raiz | (-1.150, 0.000, 0.150) | no chão, ao lado da porta do passageiro |

## O script carro_hatch.js

- É script clássico (`pc.createScript('carroHatch')`), testado no PlayCanvas 2.23.3. Se o jogo usa TypeScript/ESM como a moto (`moto-delivery.ts`), porte para o mesmo padrão de `MotoRig`; a lógica é curta.
- Estado: `velocidade` (m/s; negativo = ré e acende a luz de ré), `direcao` (-1 a +1; +1 = direita), `freio`, `farol` (0, 1, 2), `seta` ('', 'E', 'D', 'alerta'), `portaE`, `portaD`, `capo`, `tampa` (0 a 1, com abertura suave) e `limpadores`. Métodos: `ponto(nome)`, `frente()`, `definirCor(r, g, b)` e `definirPlaca(texto)`, que desenha a placa Mercosul num canvas e põe na frente e atrás. Use a placa que o jogo já gera para o veículo (`plateHtml` em `garage-panel.ts`).
- Ele clona os materiais que mudam por instância (pintura, placa e lentes). Dois carros na rua podem ter cores, placas e luzes diferentes.
- Ele cria 2 spots de farol e 1 luz de freio de verdade (`luzesReais`). Se o `environment-lighting.ts` tiver orçamento de luzes, desligue esse atributo e use o mesmo esquema da moto (`moto-lights.ts`).
- Ele só cuida do visual: a cada quadro, passe a `velocidade` e a `direcao` do veículo físico.

## Física

Use o mesmo caminho da moto (RaycastVehicle do ammo.js, se for isso que ela usa), agora com 4 rodas de verdade: raio 0,285, conexões nos centros das rodas acima, `setCoordinateSystem(0, 1, 2)` (frente em +Z). Ponto de partida: 850 kg, suspensão de ~0,15 m, velocidade máxima de ~140 km/h, centro de massa baixo (~0,45 m). Ajuste até ficar gostoso de dirigir nas ruas do mapa. O sinal do steering do Bullet pode ser o contrário do `direcao` do script; confira no teste.

## Comportamento esperado

- O carro aparece na loja do celular (foto: tire um print do modelo) e na garagem, como a moto.
- Entrar: perto da porta do motorista (`ponto_porta_E`) aparece "E para entrar". A porta abre, o personagem vai para o `ponto_motorista`, sentado, com as mãos em `ponto_mao_E`/`ponto_mao_D` (IK como na moto), e a porta fecha. Câmera em 3ª pessoa atrás do carro, com opção de câmera interna em `ponto_olhos`.
- Sair: E de novo abre a porta e põe o personagem no `ponto_porta_E`.
- Controles: os mesmos da moto (W/S, A/D, espaço = freio de mão). Para farol (apagado/baixo/alto), setas e pisca-alerta, escolha teclas livres no esquema de input do jogo e me diga quais.
- Multiplayer: sincronize posição, rotação, velocidade, direção, freio, farol, setas, portas e quem está dirigindo. Nos outros clientes o carro é só visual (sem física), interpolado e animado pelo mesmo script.

## Verifique antes de me entregar

Carregue o jogo pelo servidor, como o jogador faz, e tire screenshots: carro parado com o farol aceso à noite, andando, virando à direita, de ré e com as portas abertas. Confirme que:

- ele anda para onde o farol aponta e as rodas giram no sentido do movimento;
- virando à direita, as rodas e o volante viram à direita e a carroceria rola para fora da curva;
- as portas abrem para fora, sem atravessar os para-lamas;
- o interior aparece pelos vidros (painel, volante, bancos) e o motorista fica sentado no banco da esquerda;
- dá para trocar a cor de um carro sem mudar a do outro, e a placa é a do veículo;
- não aparece nenhum erro no console.

No final, me diga: arquivos alterados, onde o carro fica, os controles, o que você testou e o resultado, o que não ficou bom e o que dependeu de suposição.
