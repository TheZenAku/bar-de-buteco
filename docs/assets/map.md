# Mapa BarBoteco

O cenário ativo é `assets-bar/map/BarBoteco/export/bar_boteco.glb`, acompanhado de `bar_boteco_colisao.glb`. O jogo usa o GLB visual otimizado sem Draco: as texturas estão embutidas e não há dependência de imagens externas ou de um decodificador. Os dois arquivos são publicados integralmente em `apps/web/public/maps`.

Execute `npm run assets:map` depois de atualizar os exports. O importador valida o formato, registra hashes SHA-256 e gera `packages/shared/src/map-data.json`. Esse arquivo alimenta a movimentação autoritativa, a previsão do cliente, as colisões da câmera, o nascimento e as interações. O GLB de colisão nunca é desenhado.

## Layout

O bar continua no quarteirão central, agora cercado por um bairro de 5 × 5 quadras jogáveis e um anel externo de cenário em LOD. Os limites autoritativos vão de x −103 a 135 e de z −117 a 91 (o z do jogo é o y do Blender com sinal trocado).

- **Bar térreo (0,30 m):** varandas, salão, balcão em L, cozinha, câmara fria, depósitos e banheiros.
- **Piso superior (3,45 m):** salão de jogos, lounge, escritório, depósito e sacadas. A escada fica em x 13,25–16,45 e z −11,65 a −14,8, com patamar a 1,88 m.
- **Terraço (3,45 m):** área sobre o anexo com mesas.
- **Quintal (0,30 m):** pergolado, churrasqueira e palco a 0,90 m, com degraus de 0,50 e 0,70 m.
- **Bairro:** ruas, calçadas, casas, lojas, praça com coreto, igreja, escola, campinho, ponto de ônibus, carros, postes, árvores, fiação, prédios distantes, morros e panorama.

Os novos marcadores `Ponto_Praca`, `Ponto_Igreja`, `Ponto_Campinho`, `Ponto_Escola` e `Ponto_Onibus` também são importados e ficam disponíveis para futuras rotas e atividades.

## Colisões e interações

O export fornece 1.550 volumes sólidos e 134 triângulos de apoio. Paredes, móveis, casas, carros, postes, árvores, guarda-corpos, pisos, ruas, rampas, palco e escadas preservam as posições e dimensões exportadas.

As 16 folhas de porta são dinâmicas. O importador ignora apenas seus pivôs vazios `COLPORTA_*`, lê a geometria real de cada folha e exporta dobradiça, largura e ângulos. A colisão acompanha individualmente o estado aberto ou fechado; veja [portas](../sistemas/doors.md).

O jogador é um cilindro de 0,34 m de raio e 1,86 m de altura que sobe degraus de até 0,26 m. Obstáculos baixos usam um raio reduzido nos pés, subpassos impedem atravessar paredes finas e apoios inacessíveis não permitem trocar de andar pelo vazio.

As 31 mesas vermelhas mantêm colisores compactos. As cadeiras são instâncias de GPU atravessáveis para permitir circulação entre conjuntos apertados. O importador lê as 142 transformações de `EXT_mesh_gpu_instancing`, associa 124 cadeiras às mesas e valida separadamente as 18 cadeiras empilhadas do depósito. Não existe lista manual para manter sincronizada: mover, adicionar ou remover conjuntos no Blender atualiza o jogo ao executar a importação. Ao levantar, o servidor sempre desloca o personagem para uma saída livre atrás ou nas diagonais da cadeira, evitando deixá-lo em pé dentro da malha visual.

## Pontos do jogo

O nascimento parte de `Spawn_Jogador`, na calçada, e procura o ponto livre mais próximo, mantendo distância das pessoas presentes. `Ponto_Balcao` posiciona o atendimento do Seu Zé. Blackjack e jukebox continuam sendo objetos do jogo: o blackjack fica no salão de jogos superior e a jukebox no salão térreo (`BLACKJACK_TABLE` e `JUKEBOX` em `packages/shared/src/world.ts`). As rotas de Tonico, Dona Lurdinha e Seu Zé são verificadas contra os novos colisores.

## Câmera e iluminação

A câmera acompanha a altura do jogador e encurta seu braço contra paredes, lajes, móveis e o forro da varanda. O plano distante foi ampliado para 1.100 m, conforme o valor autorado no mapa, para exibir o bairro, os prédios, os morros e o panorama. A névoa dinâmica começa entre 62–70 m e termina entre 430–520 m; uma máscara adicional nas bordas oculta o fim da área jogável.

O importador glTF separa o sol das 13 luminárias do bar, preservando posições, cores e potências relativas. O ciclo completo de dia e noite dura 40 minutos; céu, lua, ambiente, névoa, luzes externas, festa e apagão permanecem integrados. Para limitar custo de GPU, doze focos externos com sombras atendem o entorno imediato do bar, enquanto o restante do bairro usa materiais emissivos, luz ambiente, lua e névoa.

## Testes

`tests/integration/map.test.ts` verifica hashes e publicação dos GLBs, as contagens, 128 posições de nascimento, escadas, rotas do navegador, balcão, assentos, jukebox, palco, barreiras e câmera. `tests/integration/doors.test.ts` valida dimensões e giro das 16 folhas. Todos os 124 assentos precisam ter uma saída livre. `apps/server/test/npcs.test.ts` simula as rotas dos NPCs no mobiliário importado.

Veja os [resultados da validação do mapa](../validacao/validation-map.md).
