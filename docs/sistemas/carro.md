# Hatch 80: carro, quatro lugares e pintura

O modelo `carro-hatch` está à venda em **Celular (K) → HighMotors → Loja**, com preço inicial de **35.000 moedas**, ajustável em Administração → Preços. O comprador escolhe a cor antes de confirmar. A chave aparece na mochila e o carro fica guardado na garagem; cada jogador mantém um veículo na rua por vez.

## Garagem, chave e pintura

Retire o carro com E em uma das garagens. Ele aparece trancado em uma rua livre, com a própria placa Mercosul, cor, quilometragem e peças. L tranca/destranca o veículo do dono dentro do alcance da chave. O guincho e o GPS do HighMotors também funcionam para o carro. Guardar perto da garagem é gratuito; longe usa o preço do guincho.

A pintura pode ser alterada em **HighMotors → Meus veículos → carro → Cor da pintura** e no painel **Informações do veículo** aberto com o botão direito. Não há cobrança para repintar. Somente o dono pode salvar uma cor; a API valida `#RRGGBB`, persiste por veículo e comunica a mudança à sala. Materiais de pintura e placas são copiados por instância, portanto um carro não muda o outro.

Negociar a chave transfere o mesmo veículo, incluindo cor, placa, peças e quilometragem. As quantidades e a carteira continuam sendo decididas pela API. Uma repetição da mesma compra não cria outro carro nem cobra novamente.

## Quatro ocupantes

Há um motorista e três passageiros, nos quatro pontos originais do rig. E entra no primeiro lugar livre. O menu de botão direito permite escolher um lugar específico livre. Só é possível entrar com o carro parado, dentro do alcance e com acesso à tranca. O quinto jogador é recusado; ninguém pode ocupar um assento já tomado.

Só o motorista envia comandos de direção. Passageiros acompanham a posição autoritativa do carro e a interpolação dos demais clientes. E sai pelo lado correspondente quando a velocidade está baixa. As portas abrem por um segundo ao entrar/sair. Desconexão, recolhimento, negociação e garagem limpam os assentos, sem deixar personagens presos.

Os personagens usam a animação sentada, com ajuste de tamanho ao teto baixo e restauração ao sair. Mãos do motorista seguem o volante e pés seguem os pedais. Q alterna a câmera externa/interna; a interna usa `ponto_olhos` e esconde a cabeça e seus ossos faciais, preservando corpo e mãos.

## Controles

| Tecla | Ação |
| --- | --- |
| W / S | Acelerar; frear e depois dar ré |
| A / D | Virar para esquerda/direita |
| Espaço | Freio de mão |
| E | Entrar / sair |
| Q | Alternar câmera |
| L | Chave: trancar/destrancar |
| H | Farol baixo → alto → apagado |
| Z / C | Setas esquerda/direita |
| X | Pisca-alerta |
| R | Ligar/desligar motor; W também dá partida |
| N | Limpadores manuais |
| O / U | Abrir/fechar capô / porta-malas |
| Y / Shift+Y | Abrir/fechar porta esquerda / direita |

Portas, capô, porta-malas, faróis e limpadores também possuem botões no painel do veículo. Somente motorista ou dono próximo podem comandar a carroceria; o motor exige o lugar do motorista. Aberturas são recusadas em movimento. Limpadores também acompanham a chuva automaticamente, desde que bateria e peça funcionem. Luz de ré acompanha a velocidade negativa; freios e setas usam o relógio da sala e as condições das peças.

## Painel ao dirigir e colisão com jogadores

Entrar em carro ou moto substitui o painel inferior de ações por um painel do veículo. Ao sair, a disposição e as preferências anteriores das ações voltam. Passageiros veem a velocidade, o lugar ocupado e as condições, com os comandos de condução desabilitados. A montaria recebe sua própria versão, com velocidade, vida e fôlego do jogador, câmera e desmontagem.

O velocímetro acompanha a previsão da condução em km/h; D/N/R indicam avanço, repouso e ré. A ignição tem um espaço de chave funcional: a chave entra ao assumir a direção e pode ser retirada com o veículo parado e motor desligado. Sem ela, nem o botão do motor nem W dão partida. Tranca, motor, faróis, limpadores, setas e alerta têm botões; as condições das peças aparecem em porcentagem e por cor (verde, amarelo e vermelho). O botão Condição abre a manutenção completa. Carros têm controle de porta e limpadores; motos mostram a bateria e não recebem controles de carroceria de carro.

Desligar o motor, ficar sem combustível ou sair do lugar do motorista apaga faróis, lanternas, luzes de freio, ré, setas e alerta. Os limpadores também desligam; o automatismo de chuva só funciona com motor ligado. O renderizador verifica a alimentação independentemente dos comandos, evitando luzes residuais com entradas atrasadas.

Carros e motos bloqueiam a caminhada e a corrida dos jogadores com suas caixas orientadas e altura real. Servidor e previsão usam a mesma regra em cada passo do movimento; é possível deslizar pelas laterais e contornar o veículo. Quem for sobreposto por um veículo ainda consegue sair do casco.

A saída considera o tamanho real do modelo, o espaço do personagem, o chão da calçada e os outros veículos próximos. Se o lado da porta estiver ocupado, procura outro lado e depois o chão livre mais próximo, sempre fora dos cascos. Motorista e passageiros usam o mesmo fluxo de liberação de assento e limpeza dos comandos pendentes. As voltas acumuladas ao dirigir ou interpolar o veículo são normalizadas antes de virar rotação do personagem e antes de enviar movimento pela rede; sair, parar ou girar a câmera não pode encher a fila de comandos inválidos e travar a caminhada.

O tanque do carro tem 42 L e o da moto, 5,5 L. O nível tem consumo por distância e marcha lenta, é decidido no servidor e acompanha o veículo na garagem, reconexões e negociações. Tanque vazio interrompe o motor. Com o veículo parado e desligado a até 16 m de uma garagem, o painel oferece **Abastecer**, que completa o tanque sem cobrança. O combustível é persistido pela fila existente e pela migração aditiva `018_vehicle_fuel.sql`, com tanque cheio para veículos antigos.

## Estado e manutenção

O painel apresenta **18 peças**: motor, bateria, escapamento, freios, suspensão, direção, quatro pneus individuais, faróis, lanternas/setas, carroceria, duas portas, capô, tampa do porta-malas e limpadores. A garagem e o HighMotors mostram as condições reais, não apenas um percentual decorativo.

Motor, bateria, pneus, freios, suspensão, direção e escapamento influenciam partida, potência, aderência, frenagem e alinhamento. Faróis e lanternas oscilam ou apagam conforme a avaria. Portas destruídas deixam de aparecer; limpadores quebrados param. Batidas e quilometragem desgastam peças, sem derrubar o carro como uma moto. Colisões fortes também atingem a saúde dos ocupantes.

**Peça de carro**, vendida na loja da casa, custa inicialmente 75 moedas. Um conserto parado e sem ocupantes consome uma peça e recupera 40 pontos após 3,5 segundos. Peças de moto e de carro têm catálogos separados. O servidor recusa peças que não pertencem ao modelo e reserva a manutenção antes de consumir o item.

O estado é salvo pela mesma fila dos veículos existentes, inclusive ao guardar, recolher e desligar a sala. A cor é uma coluna persistente adicionada por `017_car_color.sql`; não altera propriedades nem peças de veículos antigos. `npm run dev` executa as migrações no `predev` da API. Para implantação com `start`, execute antes `npm run migrate -w @bar/api`.

## Modelo e simulação

`npm run assets:carro` valida os nós e materiais e publica `apps/web/public/carro/carro_hatch.glb`, o casco auxiliar e a foto fornecida. O GLB original não é modificado, os scripts Blender não são executados e `map-data.json` não é alterado.

A simulação determinística existente foi parametrizada por modelo: carro de 850 kg, raio das rodas 0,285 m, entre-eixos 2,314 m, bitola 1,33 m e caixa de colisão de 0,76 × 0,56 × 1,80 m de meias dimensões, com a frente em +Z. Quatro pontos de apoio amostram o terreno. Servidor e previsão do motorista executam a mesma simulação, sem introduzir outro motor de física. A suspensão e a rolagem são apresentadas pelo rig. O áudio do motor é procedural, espacial e respeita o volume geral, pois o pacote não contém gravações próprias.

Arquivos principais: `vehicle-models.ts`, `car-parts.ts`, `vehicle-parts.ts` e `moto.ts` em `packages/shared/src`; `car-rig.ts`, `car-sound.ts` e `moto-delivery.ts` no renderizador; `car-panel.ts`, HighMotors, garagem e os serviços persistentes da API.

O carro agora usa dinâmica planar de dois eixos, com velocidade lateral e angular,
aderência por eixo e derrapagem controlável pelo freio de mão. A moto mantém seu
modelo de bicicleta recalibrado. A arquitetura, as medições de curvas, os testes
e as referências estão em [Condução de carro e moto](conducao.md).

## Validação

- `tests/integration/car.test.ts`: dimensões, direção, determinismo, quatro lugares, garagem, saída e peças.
- `tests/integration/vehicle-network.test.ts`: saída de carro e moto após várias voltas, câmera, parada e continuidade da caminhada sem comandos inválidos.
- `apps/api/test/car.test.ts`: compra concorrente sem duplicação, permissões de pintura, persistência e transferência por negociação.
- `apps/server/test/car.integration.test.ts`: cinco clientes reais, autoridade do motorista, quatro assentos, manutenção e estado salvo na garagem.
- `tests/e2e/car.spec.ts`: importação e animação do rig, quatro ocupantes, pintura independente, noite, curvas, ré, portas, câmera interna e compra/garagem/painel no jogo real.

As capturas ficam em `test-results/previews/car-*.png`. A regressão cobre também física, previsão, garagem, negociação e manutenção da moto existente.
