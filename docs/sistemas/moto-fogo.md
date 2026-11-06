# Moto Caveira em Chamas (`moto-fogo`)

Segundo modelo de moto do HighMotors, além da Highland Bar Delivery. É uma moto de passeio (chopper esqueleto, caveira no farol, fogo nas duas rodas): **não leva a bag de entrega** e não entra no fluxo do Highfood. Para o resto do jogo é uma moto comum: peças, combustível, garagem, guincho, chave e placa.

## Catálogo

- `packages/shared/src/vehicle-models.ts`: `MOTO_FOGO_MODEL = 'moto-fogo'`, nome, foto (`moto/foto-fogo.webp`), `vehiclePriceKey` e `isFogo`. `VEHICLE_MODELS` alimenta os schemas de compra (`/api/vehicles/buy`) e de spawn (`admin.moto.spawn`).
- `packages/shared/src/moto.ts`: `MOTO_FOGO` = motor e dirigibilidade da moto de entrega com as medidas deste modelo (rodas 0,285 m, entre-eixos 1,5335 m, comprimento 2,15 m). O casco tem a largura do corpo e das manoplas (`HALF_WIDTH` 0,46 m); as pontas do guidão (±0,63 m, acima de 1 m de altura) ficam fora para a moto não enroscar em portas.
- Preço: `vehicle:moto-fogo` (padrão 25.000 moedas), editável em Admin → Preços.
- Admin → Veículos: botão "Spawnar moto Caveira em Chamas". Celular (`phone/apps/motors.ts`): foto, descrição e especificações próprias.

## Modelo 3D

`npm run assets:moto-fogo` valida e publica `assets-bar/map/BarBoteco/export/moto_fogo/moto_fogo.glb` em `apps/web/public/moto/` (com `moto_fogo_colisao.glb`). Origem: `scripts/58_moto_fogo.py` (na mesma pasta), que parte do modelo da Tripo e faz tudo medindo a malha:

- **Rodas (`Moto_Rodas`)**: as da Tripo eram ovais (53 × 58 cm) e com o aro fora do centro do pneu, então balançavam ao girar. Foram descartadas e refeitas por revolução em volta do eixo medido no cubo original (y = ∓0,7587 / 0,7541, z = 0,297): pneu com ombros e banda de rodagem em blocos, aro, cubo, cinco raios, disco de freio (frente) e coroa (trás). Ficam concêntricas a 0,1 mm em qualquer ângulo, diâmetro 0,594 m nos dois sentidos. Textura própria (`moto_fogo_rodas.png`) nos tons medidos da original (pneu 0,25 / aro 0,33). A pinça de freio e as porcas ficam presas ao garfo.
- **Luzes da própria malha**: `Luz_Farol` = olhos da caveira, `Luz_Seta_E` / `Luz_Seta_D` = bolas âmbar da frente e de trás de cada lado, `Luz_Lanterna` = lente embutida na rabeta (lanterna e freio: não há `Luz_Freio`, a lente sobe para o nível do freio). Material `Moto_Caveira_Luzes`: a textura da moto como cor e um mapa de brilho (`moto_fogo_luz.png`) como emissiva.
- **Farol = um por olho**: pontos `ponto_olho_E/D` no centro de cada olho. `moto-lights.ts` (perfil `FOGO_LAMPS`) cria um spot e um halo por olho, na cor da chama (laranja); nada fica no centro do crânio, e a moto não tem lentes geradas (nem placa nem painel).
- **Placa**: pendurada em pé na ponta da rabeta; `ponto_placa` já desconta os 15° que `moto-delivery.ts` aplica. **Só preta e vermelha** (fundo preto, faixa, borda e caracteres vermelhos) para esta moto; as outras seguem o padrão Mercosul.
- **Escapamento**: `ponto_escape_1/2` = as duas ponteiras empilhadas do lado esquerdo do piloto (o outro lado não tem cano).
- Mesmos nomes de osso da moto de entrega, sem descanso. `fogo_diant` e `fogo_tras` são irmãos das rodas: seguem garfo, suspensão e inclinação, mas não giram.

## Fogo nas rodas (`engine/moto-fire.ts`)

Desenhado pelo jogo, não vem no GLB. Cada roda tem uma malha de 72 línguas + 14 brasas (uma draw call por roda). No vertex shader cada língua nasce na banda de rodagem, sobe, vira para a câmera e se estica; com velocidade, a metade de cima do pneu arrasta o fogo para trás. Aditivo, sem escrever profundidade. Intensidade: apagado com o motor desligado, 45% parado com o motor ligado, 100% a 12 m/s. No PlayCanvas `SEMANTIC_ATTR0` divide a posição 0 com `SEMANTIC_POSITION`: os dados das línguas vão em `SEMANTIC_TEXCOORD1`.

## Fumaça e fogo no escapamento (`engine/moto-exhaust.ts`)

Em cada ponteira, uma malha de 18 baforadas (alfa) e um quadro de chama (aditivo), tudo montado no vertex shader a partir de poucos uniforms. A fumaça sai fina com o motor em marcha lenta e mais grossa e escura com o acelerador; em velocidade fica para trás no mundo. A chama ("estouro") sai da ponteira de tempos em tempos (2,5 a 8 s, aleatório) e com mais chance quando se solta o acelerador em velocidade.

## Cor (pintura) da moto

A textura tem o vermelho pintado nas peças (paralamas, costelas do tanque, manoplas, decalques). `engine/moto-paint.ts` dá a cada moto uma cópia do material do corpo com um `diffusePS` que leva só os pixels vermelhos (matiz até ±12–24° do vermelho, saturados) para a cor do dono: troca o matiz e escala saturação e brilho pela distância até a cor padrão `FOGO_DEFAULT_COLOR` (`#6b1d1d`, identidade). Ossos, metal, couro e lentes não mudam. A cor vem de `MotoState.color` (a da compra; moto sem cor, ou cinza padrão, mostra a textura original).

**Na loja (HighMotors)**: a página da oferta tem seletor de cor e o botão "Voltar ao vermelho original"; a foto muda ao vivo. A foto (`foto-fogo.webp`) e a máscara de pintura (`foto-fogo-mascara.webp`, diferença entre duas renderizações com fogo congelado) foram feitas com a própria engine; `phone/apps/fogo-photo.ts` aplica a mesma conta do shader só onde a máscara manda (chamas e metal não mudam). A cor segue em `POST /api/vehicles/buy` (`color`) e, depois de comprada, pode ser trocada em Meus veículos (`/api/vehicles/paint` aceita `moto-fogo`).

## Testes

`tests/integration/moto-fogo.test.ts` (catálogo, preço, schema, medidas, cor padrão, física) e `tests/e2e/moto-fogo.spec.ts`: fixture `tests/fixtures/moto-fogo.html` (eixos fixos a 0,297 m andando, lâmpadas da própria malha, um spot e um halo por olho, lanterna sobe no freio, placa sob a rabeta, fogo nas duas rodas, escapamento, pintura, sem bag) e a loja pelo `highmotors.html` (cor escolhida, foto repintada, `color` no POST de compra).
