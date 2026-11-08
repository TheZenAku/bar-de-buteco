# Scooter de Entrega (`moto-scooter`)
A scooter vermelha com o baú da casa, que foi a primeira moto de entrega, de volta ao HighMotors como modelo próprio (a moto de entrega `moto-delivery` hoje é a v4). Para o resto do jogo é uma moto comum: peças, combustível, garagem, guincho, chave, placa Mercosul e entregas do Highfood. A bag de entrega não aparece nela: o baú já é dela.
## Catálogo
- `packages/shared/src/vehicle-models.ts`: `MOTO_SCOOTER_MODEL = 'moto-scooter'`, nome, foto (`moto/foto-scooter.webp`), sem pintura, `isScooter`, `vehiclePriceKey`.
- `packages/shared/src/moto.ts`: `MOTO_SCOOTER` = motor da moto de entrega com as medidas da scooter (rodas 0,225 m, entre-eixos 1,342 m, 1,99 m com o baú). O casco é o corpo e o escudo (`HALF_WIDTH` 0,40 m); pontas do guidão e espelhos ficam de fora.
- Preço: `vehicle:moto-scooter` (padrão 8.000 moedas), editável em Admin → Preços. A loja (`vehicleOffers`) e o admin listam pelo `VEHICLE_CATALOG`.
## Modelo 3D
`npm run assets:moto-scooter` valida e publica `assets-bar/map/BarBoteco/export/moto_scooter/moto_scooter.glb` em `apps/web/public/moto/`. Origem (`scripts/` na mesma pasta): `20_moto_delivery.py` fez a scooter (Blender 4.0, a partir de um GLB do Sketchfab que não está mais no disco) e `20b_scooter_pontos.py` (Python puro, sem Blender) acrescenta ao GLB pronto os pontos que o jogo pede hoje: setas (lentes brancas do escudo na frente, pontas da lanterna atrás), freio, placa e luz da placa no paralama traseiro, baú, garupa, câmera e contato com o chão.
- Ossos: `raiz > chassi > direcao > roda_dianteira`, `roda_traseira`, `bau`. Sem descanso, suspensão ou balança (o `MotoRig` aceita sem aviso).
- Luzes: a scooter não tem malhas de lente; `moto-lights.ts` (perfil `SCOOTER_LAMPS`) desenha as lentes nos pontos. A lanterna também é o freio.
## Testes
`tests/integration/moto-scooter.test.ts` e `tests/fixtures/moto-fogo.html?model=moto-scooter` (a mesma cena da Caveira, com este modelo).
