# Moto de entrega

A moto Highland Bar Delivery fica estacionada na rua, em frente ao bar. Qualquer jogador sobe nela, pilota pelas ruas e calçadas do bairro e desce onde quiser. Todos veem a moto de qualquer ponto do mapa, com o piloto em cima.

## Controles

| Controle | Na moto |
| --- | --- |
| **E** perto dela | Subir (o aviso é "E para subir") |
| **E** montado | Descer pelo lado esquerdo. Acima de 3 m/s o servidor recusa e pede para diminuir |
| **W** | Acelerar; freia se estiver de ré |
| **S** | Frear; parado, dá ré |
| **A / D** | Virar |
| **Espaço** | Freio de mão |
| Arrastar o mouse | Olhar em volta; 1,5 s depois de soltar a câmera volta para trás da moto |

Não há controle de toque, porque o jogo não tem controles de toque para andar. Montado, as outras ações pedem para descer primeiro; o chat, a voz e o celular continuam funcionando.

## Onde mudar

| O quê | Onde |
| --- | --- |
| Posição e direção da moto (`x`, `y` do piso, `z`, `yaw` em radianos, como em "Sua posição" no painel de administração) | `MOTOS` em `packages/shared/src/moto.ts` |
| Motor, freios, velocidade máxima, direção, tempo até voltar à vaga | `MOTO` no mesmo arquivo |
| Postura do piloto | constantes acima de `seatRider` em `apps/web/src/engine/moto-delivery.ts` |

A moto fica em x 13,6, z 3,85, no meio-fio entre o poste e o carro prata, virada para −X. Largada longe da vaga, ela volta sozinha depois de 5 minutos sem ninguém (`RETURN_MS`).

## Como funciona

O jogo usa PlayCanvas sem motor de física: o movimento é decidido pelo servidor, com as caixas e os pisos de `map-data.json`. Por isso a moto não usa Ammo nem `btRaycastVehicle`. Um veículo só no navegador não respeitaria o servidor, e o servidor não tem como rodar Ammo com esses colisores sem duplicar o mapa inteiro.

`stepMoto` (`packages/shared/src/moto.ts`) é o mesmo passo no servidor e na previsão do piloto:

- **Modelo de bicicleta:** o eixo traseiro segue a direção da moto e a roda dianteira a faz girar. Forças em newtons sobre 150 kg, com velocidade máxima de 55 km/h e ré de 2,5 m/s. O ângulo da direção diminui com a velocidade.
- **Chão:** consulta a altura nas duas rodas e nos cantos do casco. A inclinação entre os eixos vem daí, e a moto sobe o meio-fio de 15 cm. Só anda em superfícies `COL_Rua*`: o piso do bar, o quintal e o palco funcionam como parede.
- **Colisão:** caixa orientada de 0,64 × 1,98 m (a do `moto_delivery_colisao.glb`, sem espelhos) contra os mesmos sólidos do jogador, com checagem a cada 10 cm, para não atravessar nada nem a 55 km/h. De frente ela para e, acima de 3 m/s, volta um pouco; de lado, desliza pela parede perdendo velocidade.
- **Em pé:** não existe tombamento. A inclinação na curva é só visual, no osso `chassi`.

### Rede

`BarState.motos` traz posição, direção, inclinação, velocidade, guidão e quem pilota, para todos os jogadores. A moto não usa a área de interesse de 18 m, e quem pilota também passa a ser visto de qualquer distância, para ninguém ver uma moto andando sozinha.

O piloto manda `moto.input` a cada tick, como faz ao andar. O servidor consome no máximo um por tick e o navegador prevê os mesmos passos, reaplicando os que ainda não foram confirmados a cada patch. Sem inputs por mais de 250 ms (aba congelada, conexão ruim), o servidor solta os controles. Se o piloto cair, apagar ou sair do bar, ele fica ao lado da moto e ela freia sozinha.

Nos outros navegadores a moto não tem física: ela segue o estado da sala, avançando pela própria velocidade entre os patches para não dar trancos.

### Desenho

`MotoRig` (`apps/web/src/engine/moto-delivery.ts`) é o `moto_delivery.js` portado para TypeScript, com os mesmos campos e contas, porque o cliente não usa componentes de script. Recebe só `velocidade` e `direcao`, e `anguloDirecao` acompanha o ângulo real da roda naquela velocidade.

Não existe animação de pilotar. `seatRider` parte do clipe `Sit` e, depois dele em cada quadro, põe o quadril no banco, curva o tronco e leva mãos e pés às manoplas e ao assoalho por IK de dois ossos, no espaço do mundo. Os ombros ficam longe das manoplas para braços de 38 a 52 cm, então cada corpo curva o tronco até alcançar, com até 44°.

A câmera (`CameraRig.ride` e `chase`) vai para a terceira pessoa ao montar e devolve a vista anterior ao descer.

## Publicar uma nova versão

`npm run assets:moto` confere os nós de `assets-bar/map/BarBoteco/export/moto/moto_delivery.glb` e copia o arquivo para `apps/web/public/moto`. O script que gera o modelo é `assets-bar/map/BarBoteco/scripts/20_moto_delivery.py`, no Blender.

## Testes

| Teste | O que cobre |
| --- | --- |
| `tests/integration/moto.test.ts` | Direção, velocidade, freios, ré, colisão em todas as direções, meio-fio, bar fora de alcance, determinismo |
| `apps/server/test/moto.integration.test.ts` | Montar, previsão igual à sala, um piloto só, descer à esquerda, queda e desmaio soltam a moto |
| `tests/e2e/moto.spec.ts` | Teclado real com dois jogadores: aviso, câmera, farol à frente, rodas, curva à direita, parede. As imagens vão para `test-results/moto` |

## Limitações

- Moto e jogadores não colidem: dá para atravessar a moto parada a pé, e a moto passa por quem está na rua.
- Sem animação própria de pilotar. Gilmar, de braços mais curtos, fica bem curvado e a mão chega a 5 cm do ponto da manopla.
- O farol e a lanterna não acendem luz, e não há som de motor. Os pontos `ponto_farol`, `ponto_lanterna` e `ponto_escapamento` estão disponíveis no rig.
- O `moto_delivery_colisao.glb` não é carregado: o jogo só colide com caixas, então a moto usa a caixa equivalente.
