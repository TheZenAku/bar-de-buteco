# Velocímetro neon

O HUD em `apps/web/src/vehicle-hud.ts` e `vehicle-hud.css` substitui o painel anterior. A composição segue a referência `speedometer.png`: mostrador circular à esquerda, identificação acima dos três indicadores, contornos neon e barra inferior com rebaixo central. Os contornos, escala, ponteiro e ícones são vetoriais; os textos, barras e comandos são elementos independentes. Não há imagem estática do painel nem novas dependências.

## Integração existente

- `main.ts` continua chamando `update(self, world.motos, world.serverTime)` para os dados da sala e `speed(scene.vehicleSpeed())` para a velocidade prevista por quadro. Os comandos seguem o callback original, `vehicle.control` e os controles da cena.
- `vehicleSeat` encontra o veículo ocupado. `vehicleOccupants` e `CAR_SEATS` fornecem ocupação e posição do jogador. A saída oculta o HUD e restaura o painel de ações pelo fluxo existente.
- `vehicleSpeed` inclui a velocidade lateral; o sentido usa a velocidade longitudinal. A escala vai até 200 km/h, mas a leitura digital pode ultrapassar esse valor sem truncamento. O ponteiro para no final da escala.
- `readVehicleParts`, `CAR_PARTS` e `MOTO_PARTS` fornecem integridade do motor e a média de todas as peças, com o mesmo cálculo dos painéis de informações. Faróis e limpadores também respeitam peças quebradas e alimentação elétrica.
- Combustível e capacidade vêm do estado e de `vehicleTank`. A autonomia divide o combustível restante pelo consumo por quilômetro calculado por `vehicleFuelUse`, incluindo aceleração e marcha lenta. Parado, mantém a estimativa do último consumo em movimento; sem uma amostra, apresenta `— km`. Combustível ausente apresenta `—`, sem preencher a barra.
- `vehiclePowered`, `MOTO_ENGINE`, `headlights`, `lights`, `locked`, `doors`, `wipers` e o atributo de chuva já atualizado pelo jogo comandam os indicadores. Permissões do motorista, parada para sair e inserção da chave continuam respeitadas. O [abastecimento com frentista](abastecimento.md) exige uma bomba do posto e bloqueia direção e saída até o fim do atendimento.
- A montaria mantém os dados do jogador, a medição de deslocamento e os controles de câmera e desmontagem, sem indicadores de combustível ou motor.

O DOM só é recriado ao trocar de veículo ou tipo de montaria. Mudanças de combustível, danos, ocupantes e comandos atualizam os elementos existentes, preservando foco e transições. As cores reutilizam as variáveis do minimapa e a fonte local Chakra Petch. A composição escala proporcionalmente e reposiciona o minimapa nas telas estreitas. `prefers-reduced-motion` desativa a animação de entrada e as transições do ponteiro e das barras.

## Limites dos sistemas atuais

Não existe transmissão automática simulada: P indica parada com motor desligado, N indica ausência de movimento longitudinal com motor ligado, R e D indicam o sentido medido. Essas letras são indicadores, não comandos de câmbio.

Não existem sistemas de cinto, piloto automático ou controle eletrônico de estabilidade. Seus ícones não são exibidos. O espaço inferior direito mantém comandos reais de ignição, portas e saída; a câmera permanece disponível, assim como setas e painel de condições. Na moto, bateria substitui limpadores e não há comando de portas.

A autonomia é uma estimativa do consumo do jogo, não uma distância garantida. Alterações de velocidade e aceleração mudam a estimativa; o HUD não altera o consumo, a física, a transmissão, as permissões ou os eventos de entrada e saída.

## Verificação

`tests/fixtures/vehicle-hud.html` fornece estados controlados e registra comandos para os testes do HUD em `tests/e2e/car.spec.ts`. Eles verificam escala, velocidade lateral e ré, previsão por quadro, marcha em repouso, combustível, cálculo de autonomia, danos, foco preservado, peças quebradas, chuva, switches, passageiros, solicitação de abastecimento junto à bomba do posto, troca entre carro/moto/cavalo, saída, oito resoluções de 320 a 1920 px, separação do minimapa e movimento reduzido.

Os testes existentes de compra/garagem e direção do carro exercitam o HUD com o cliente PlayCanvas e o servidor reais. Capturas dos testes ficam em `test-results/previews/vehicle-hud-desktop.png`, `vehicle-hud-mobile.png` e `car-driving-hud.png`.

Comandos de verificação:

```powershell
npm run typecheck
npm run build -w @bar/web
npx playwright test --project=car --grep 'car purchase|arcade car steering|vehicle dashboard|neon vehicle HUD'
```

Na validação desta implementação, a verificação de tipos e o build passaram. Os seis cenários selecionados passaram entre as execuções. O teste existente de direção/freio de mão falhou inicialmente por não alcançar o limiar de derrapagem e passou na repetição, sem alterações na física. A conferência final da fixture em carro, moto, cavalo e saída não registrou erros de console nem de JavaScript. O build ainda avisa sobre o tamanho do bundle principal do jogo; a compilação termina com sucesso.
