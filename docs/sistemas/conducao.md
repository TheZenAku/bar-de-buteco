# Condução de carro e moto

O Hatch 80 usa um modelo planar arcade de dois eixos: direção, aderência e
deslizamento são grandezas separadas. A moto mantém a simulação de bicicleta,
com resposta e aderência recalibradas. Dimensões, potência, velocidade máxima,
garagem, peças e economia mantêm seus contratos existentes.

## Direção e freios

W acelera; S freia antes de engatar ré. A/D aplicam direção progressivamente,
com retorno ao centro ao soltar e resposta mais rápida ao contraesterçar.
O carro usa 35° de esterço máximo, aplicação de 4 unidades/s e retorno de 6;
a moto usa 28°, 4,5 e 6. A assistência reduz o esterço em velocidade, enquanto
os pneus limitam separadamente a força lateral. A aderência nominal é de
17 m/s² para o carro e 20 m/s² para a moto; são valores de jogabilidade arcade.

Espaço freia a traseira do carro e reduz sua aderência lateral para 22%,
permitindo fechar curvas com derrapagem. Soltar o freio de mão restaura a
aderência, e os pneus dissipam o deslizamento. Na moto, Espaço continua sendo
o freio traseiro. Pneus de carro danificados afetam o eixo correspondente;
suspensão e direção também continuam influenciando a condução.

O carro faz a transição entre manobras cinemáticas e forças dos pneus em
1–3 m/s, mantendo manobras de ré estáveis. O limite de energia impede que
pneus e correções de trajetória acelerem o veículo sem força do motor.

## Simulação e rede

Os comandos continuam em `moto.input`, com passo de 50 ms. O carro integra
forças em subpassos de até 10 ms e verifica o deslocamento e a varredura dos
cantos do casco a cada 10 cm. Impactos removem a velocidade contra a parede,
retêm o componente tangente quando há espaço e interrompem a rotação bloqueada.

`MotoBody`/`MotoState` acrescentam `lateralSpeed` (m/s no +X local, à esquerda)
e `yawRate` (rad/s, positivo à esquerda). Campos ausentes são zero. `speed`
continua sendo a componente longitudinal assinada, usada para D/R e luz de ré.
`vehicleSpeed` e `vehicleVelocity` calculam a velocidade resultante e o vetor
no mundo, usados em colisões, atropelamentos, combustível e velocímetro.
`vehicleMotionSpeed` também considera a velocidade dos cantos de um casco
girando nas verificações de entrada, saída, ignição e abertura das portas.
Um veículo deslizando continua sendo simulado mesmo com `speed === 0`.

Previsão e servidor executam a mesma função. Reconciliação preserva os novos
campos; interpolação e extrapolação remotas acompanham o movimento lateral e a
rotação. Rodas e volante acompanham a direção aplicada, com inclinação baseada
na curva realizada. FOV/desfoque usam a velocidade máxima do modelo correto.

Paradas forçadas limpam as três velocidades com `STOPPED_VEHICLE`. Os campos
novos são transitórios: não entram no banco, e veículos retirados da garagem
começam sem movimento residual. Cliente e servidor precisam ser publicados
juntos, com recarga dos clientes abertos.

## Medições reproduzíveis

Execute com Node 24 e npm 11.20:

```powershell
node --import tsx tools/vehicle-handling-metrics.ts
```

Piso plano sem colisões, peças saudáveis, esterço total, velocidade resultante
mantida e oito segundos de estabilização. A coluna anterior corresponde ao
modelo de bicicleta legado. Esses números são metas e medições deste jogo,
sem equivalência numérica com a física do GTA.

| Veículo | km/h | Raio anterior | Raio atual |
| --- | ---: | ---: | ---: |
| Carro | 36 | 11,11 m | 7,72 m |
| Carro | 54 | 25,00 m | 13,96 m |
| Carro | 72 | 44,44 m | 24,63 m |
| Carro | 108 | 100,00 m | 55,74 m |
| Moto | 36 | 7,14 m | 5,00 m |
| Moto | 54 | 16,07 m | 11,25 m |

## Validação

- `tests/integration/vehicle-handling.test.ts`: raios, simetria, freio de mão,
  recuperação, conservação de energia, ré, peças por eixo, colisões laterais,
  estados antigos e previsão em 30/60/120 FPS.
- `tests/integration/vehicle-network.test.ts`: continuação da simulação em
  deslizamento e reprodução das entradas ainda não confirmadas.
- `apps/server/test/car.integration.test.ts`: comandos reais, passageiros,
  replicação do movimento lateral, parada e retirada da garagem sem resíduos.
- `tests/e2e/car.spec.ts`: motorista e observador no jogo, direção, derrapagem,
  parada e velocímetro com componentes longitudinal/lateral distintas.
- As regressões existentes da moto verificam condução, colisões, quedas,
  manutenção e apresentação para outro jogador.

Capturas da nova manobra: `test-results/previews/car-arcade-handbrake-driver.png`
e `car-arcade-handbrake-observer.png` na mesma pasta.

## Referências

- [Multi Theft Auto — setVehicleHandling](https://wiki.multitheftauto.com/wiki/SetVehicleHandling):
  parâmetros distintos de direção, tração e freios do San Andreas.
- [Project Cerbera — San Andreas handling.cfg](https://projectcerbera.com/gta/sa/tutorials/handling):
  pesquisa dos parâmetros de aderência por eixo e direção de carros e motos.
- [NVIDIA PhysX — Vehicles](https://docs.nvidia.com/gameworks/content/gameworkslibrary/physx/guide/Manual/Vehicles.html):
  entrada progressiva, assistência conforme velocidade e forças dos pneus.
- [Glenn Fiedler — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/):
  simulação com passo fixo e interpolação independente da taxa de quadros.
