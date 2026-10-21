# Mapa BarBoteco

O cenário ativo é `assets-bar/map/BarBoteco/export/bar_boteco.glb`, acompanhado de `bar_boteco_colisao.glb`. O jogo usa o GLB visual otimizado sem Draco: todas as texturas estão embutidas e não há dependência de um decodificador ou de imagens externas. Os arquivos originais são copiados integralmente para `apps/web/public/maps`.

Execute `npm run assets:map` depois de atualizar os exports. O importador valida o formato, registra hashes SHA-256 e gera `packages/shared/src/map-data.json`. Esse arquivo alimenta a movimentação autoritativa, a previsão do cliente, as colisões da câmera, o nascimento e as interações. O GLB de colisão não é desenhado sobre o cenário.

## Layout

O complexo ocupa x 0–32 e z 0 a −26 (o z do jogo é o y do Blender com sinal trocado):

- **Térreo (0,30 m):** varanda na frente e na lateral oeste; salão com 11 mesas; balcão em L com geladeiras, garrafeiro e chopeira; cozinha, câmara fria, depósitos e banheiros ao fundo.
- **Superior (3,45 m):** salão de jogos com três sinucas e dois pebolins, lounge com balcão próprio, escritório, depósito e duas sacadas (3,65 m). A escada fica em x 13,25–16,45, z −11,65 a −14,8, com patamar a 1,88 m.
- **Terraço (3,45 m)** sobre o anexo, com seis mesas.
- **Quintal (0,30 m)** com pergolado, mesas de madeira, churrasqueira e **palco** (0,90 m, degraus de 0,50 e 0,70 m). Acesso pelo portão social aberto no muro oeste (z −19,5 a −22,5) e pelas portas do corredor do prédio.
- **Rua e calçada** em volta; os limites do mundo vêm dos muros `COL_Rua_Limite` (x −26 a 58, z −52 a 26).

## Colisões

O export fornece 487 caixas de colisão; o importador acrescenta as 16 folhas de portas já abertas, mantendo os vãos livres. Paredes, móveis, casas, carros, postes, árvores, guarda-corpos, pisos e escadas preservam posições e dimensões. Há 54 triângulos de apoio: rua, calçadas, pisos, lajes, sacadas, rampas, patamar, palco e degraus. As caixas inclinadas das escadas são avaliadas por suas faces superiores, evitando transformar uma rampa em parede.

O jogador é um cilindro de 0,34 m de raio e 1,86 m de altura que sobe degraus de até 0,26 m. Abaixo da altura do joelho (obstáculo até 0,5 m acima do piso), só os pés colidem, com raio de 0,15 m; é isso que permite subir os degraus de 30 cm do palco. Subpassos impedem atravessar paredes finas correndo, e apoios inacessíveis não permitem saltar entre andares nem cair pelo vazio da escada.

As 33 mesas de plástico e suas 128 cadeiras seguem o layout de `scripts/06_interior.py`. Como as cadeiras não têm colisor no export, o importador mantém a lista das mesas e **falha** se ela deixar de bater com os colisores `COL_Mob_Mesa_Plastico`; se o mobiliário for reorganizado no Blender, atualize a lista em `tools/import-map.mjs`. Ao levantar, o servidor procura uma saída livre sem atravessar obstáculos, o que permite sentar junto às mesas sem ficar preso.

## Pontos do jogo

O nascimento parte de `Spawn_Jogador`, na calçada, e procura o ponto livre mais próximo, mantendo distância das pessoas já presentes. O balcão usa `Ponto_Balcao`, com o Seu Zé atrás do balcão em L. Blackjack e jukebox, ausentes no asset, são objetos do jogo: o blackjack fica no salão de jogos do andar superior, entre a última sinuca e o lounge, e a jukebox no térreo, no espaço vazio da última fileira do salão, longe da entrada da escada (`BLACKJACK_TABLE` e `JUKEBOX` em `packages/shared/src/world.ts`). Tonico circula entre a varanda e o salão pelo corredor do balcão; Dona Lurdinha, pelo quintal em frente ao palco.

## Câmera e iluminação

A câmera acompanha a altura do jogador e encurta seu braço contra paredes, lajes, móveis e o forro da varanda, gerado pelo importador a partir das medidas de `04_predio.py`. Objetos finos (postes, troncos, pilares) não encurtam a câmera; o marcador de nascimento fica diante de um poste.

O importador glTF do PlayCanvas cria as luzes desligadas e limita a intensidade a 2. O jogo liga as 14 luzes do mapa (sol e luminárias) em suas posições e cores originais e mantém a força relativa de cada luminária em relação à mediana, com alcance proporcional e queda linear. O sol projeta sombras. A luz ambiente diurna fica abaixo das luminárias, para os interiores serem lidos pelos focos de luz quente. Apagão e festa continuam controlando a iluminação; as luzes de festa ficam no salão, no salão de jogos e no palco.

## Testes

`tests/integration/map.test.ts` verifica a integridade dos arquivos publicados, as contagens, 128 posições de nascimento, a subida e descida da escada, a interação restrita ao andar, as rotas usadas pelo teste de navegador (salão de jogos, blackjack, balcão, assento e jukebox), a subida ao palco, paredes, forro e guarda-corpo. `apps/server/test/npcs.test.ts` simula as rotas dos NPCs, e o teste de navegador percorre o mapa pelo teclado.

Veja os [resultados da validação do mapa](validation-map.md), incluindo os cenários completos de navegador e a carga local de 32 clientes.
