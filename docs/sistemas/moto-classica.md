# Clássica Raiada (`moto-classica`)
Terceiro modelo de moto do HighMotors: a clássica preta de rodas raiadas. Para o resto do jogo é uma moto comum: peças, combustível, garagem, guincho, chave, placa Mercosul e entregas do Highfood (a bag aparece nela como na moto de entrega).
## Catálogo
- `packages/shared/src/vehicle-models.ts`: `MOTO_CLASSICA_MODEL = 'moto-classica'`, nome, foto (`moto/foto-classica.webp`), cor padrão `CLASSICA_DEFAULT_COLOR` (`#222225`, o preto do tanque como veio), `paintable`, `vehiclePriceKey` e `isClassica`.
- `packages/shared/src/moto.ts`: `MOTO_CLASSICA` = motor e dirigibilidade da moto de entrega com as medidas deste modelo (rodas 0,30 m, entre-eixos 1,372 m, comprimento 1,98 m). O casco tem a largura do corpo e das manoplas (`HALF_WIDTH` 0,40 m); os espelhos (±0,48 m, acima de 1,2 m) ficam de fora para a moto não enroscar em portas.
- Preço: `vehicle:moto-classica` (padrão 15.000 moedas), editável em Admin → Preços.
- Admin → Veículos (spawn, registro, pintura) lista o modelo pelo `VEHICLE_CATALOG`. Celular (`phone/apps/motors.ts`): foto, descrição, especificações e cor do tanque na compra e em Meus veículos (`/api/vehicles/paint` aceita qualquer modelo `paintable`).
## Modelo 3D
`npm run assets:moto-classica` valida e publica `assets-bar/map/BarBoteco/export/moto_classica/moto_classica.glb` em `apps/web/public/moto/` (com `moto_classica_colisao.glb`). Origem: `scripts/61_moto_classica_tripo.py` (na mesma pasta), que mantém a malha da Tripo e só dá acabamento: rodas raiadas novas, solda de vértices, UV e atlas novos, farol plano no aro original, rig com os mesmos nomes de osso da moto de entrega (com descanso e manetes).
- **Luzes da própria malha** (material `Moto_Atlas`, acendem pelo emissive): `Luz_Farol`, `Luz_Seta_E`/`Luz_Seta_D` (setas da frente), `Luz_Lanterna` (lanterna larga da rabeta, que também é a luz de freio). O modelo não tem seta atrás: `ponto_seta_tras_E/D` ficam nas pontas da lanterna e o pisca de trás é halo + luz ali. Perfil `CLASSICA_LAMPS` em `moto-lights.ts`.
- **Cor**: o tanque é o material `Moto_Pintura` (textura neutra × cor base). `engine/moto-paint.ts` (`TankPaint`) dá a cada moto uma cópia desse material na cor do dono (`MotoState.color`; sem cor, ou o cinza de veículo sem pintura, fica o preto original). Banco, metal e rodas não mudam.
## Testes
`tests/integration/moto-classica.test.ts` (catálogo, preço, schema, medidas, cor padrão, física) e `tests/fixtures/moto-fogo.html?model=moto-classica` (a mesma cena da Caveira, com este modelo).
