# Mapa BarBoteco

O cenário do bar e do bairro original é `assets-bar/map/BarBoteco/export/bar_boteco.glb`, acompanhado de `bar_boteco_colisao.glb`. O jogo usa o GLB visual otimizado sem Draco: as texturas estão embutidas e não há dependência de imagens externas ou de um decodificador. Os dois são publicados em `apps/web/public/maps`: a colisão como está, e o visual com as [correções de publicação](../sistemas/cidade.md#o-que-as-cópias-publicadas-deixam-de-fora). Em volta dele fica a [cidade](../sistemas/cidade.md), de `export/cidade`, carregada por setores.

Execute `npm run assets:map` depois de atualizar os exports. O importador valida o formato, registra hashes SHA-256 e gera `packages/shared/src/map-data.json` e, para a cidade, `city-data.json` e `city-roads.json`. Esses arquivos alimentam a movimentação autoritativa, a previsão do cliente, as consultas de visibilidade da câmera, o nascimento e as interações. O GLB de colisão nunca é desenhado.

## Layout

O bar continua no quarteirão central, cercado pelo bairro de 5 × 5 quadras e pelas casas do antigo anel, que agora fazem parte do Centro da cidade. Os limites autoritativos vêm da grade da cidade: x e z de −400 a +400 (o z do jogo é o y do Blender com sinal trocado).

- **Bar térreo (0,30 m):** varandas, salão, balcão em L, cozinha, câmara fria, depósitos e banheiros.
- **Piso superior (3,45 m):** salão de jogos, lounge, escritório, depósito e sacadas. A escada fica em x 13,25–16,45 e z −11,65 a −14,8, com patamar a 1,88 m.
- **Terraço (3,45 m):** área sobre o anexo com mesas.
- **Quintal (0,30 m):** pergolado, churrasqueira e palco a 0,90 m (`15_palco.py`), com degraus de 0,50 e 0,70 m no lado oeste.
- **Bairro:** ruas, calçadas, casas, lojas, praça com coreto, igreja, escola, campinho, ponto de ônibus, carros, postes, árvores e fiação. Morros e panorama vêm de `cidade_distante`.

Os novos marcadores `Ponto_Praca`, `Ponto_Igreja`, `Ponto_Campinho`, `Ponto_Escola` e `Ponto_Onibus` também são importados e ficam disponíveis para futuras rotas e atividades.

## Colisões e interações

O export fornece 1.553 volumes sólidos (o da jukebox, `COL_Int_Jukebox`, entre eles; os quatro `COL_Rua_Limite` antigos ficam de fora) e 134 triângulos de apoio. A cidade acrescenta os seus ([colisão](../sistemas/cidade.md#colisão)). Paredes, móveis, casas, carros, postes, árvores, guarda-corpos, pisos, ruas, rampas, palco e escadas preservam as posições e dimensões exportadas.

As 16 folhas de porta são dinâmicas. O importador ignora apenas seus pivôs vazios `COLPORTA_*`, lê a geometria real de cada folha e exporta dobradiça, largura e ângulos. A colisão acompanha individualmente o estado aberto ou fechado; veja [portas](../sistemas/doors.md).

O jogador é um cilindro de 0,34 m de raio e 1,86 m de altura que sobe degraus de até 0,26 m. Obstáculos baixos usam um raio reduzido nos pés, subpassos impedem atravessar paredes finas e apoios inacessíveis não permitem trocar de andar pelo vazio.

As 31 mesas vermelhas mantêm colisores compactos. As cadeiras são instâncias de GPU atravessáveis para permitir circulação entre conjuntos apertados. O importador lê as 142 transformações de `EXT_mesh_gpu_instancing`, associa 124 cadeiras às mesas e valida separadamente as 18 cadeiras empilhadas do depósito. Não existe lista manual para manter sincronizada: mover, adicionar ou remover conjuntos no Blender atualiza o jogo ao executar a importação. Ao levantar, o servidor sempre desloca o personagem para uma saída livre atrás ou nas diagonais da cadeira, evitando deixá-lo em pé dentro da malha visual.

As 8 mesas de piquenique do quintal (24–31, `P_Mesa_Madeira`, colisor `COL_Mob_Mesa_Madeira`) têm os bancos embutidos e nenhuma cadeira. O importador cria os 6 lugares de cada uma: 3 em cada banco, a 0,62 m do meio da mesa e a −0,6, 0 e +0,6 m ao longo dela, de frente para o tampo e girados como a mesa (`bench: true`, sem `chair`). São os assentos `seat-125` a `seat-172`; o importador falha se o número de lugares não bater com o `lugares` do marcador.

## Mesas numeradas

Cada mesa de cliente tem um número, escrito no porta-guardanapo em cima dela (`14_mesas.py`). No export, o marcador `Mesa_NN` (coleção `Mesas`) fica no tampo, com `mesa`, `area`, `andar` e `lugares`. O importador associa cada marcador ao colisor da sua mesa e falha se faltar número, se houver número repetido ou se a sequência pular algum.

| Área | Mesas | Observação |
| --- | --- | --- |
| Salão (térreo) | 1–11 | da frente para o fundo |
| Varanda | 12–20 | contornando o L |
| Quintal | 21–31 | 24–31 são as de piquenique, com 6 lugares nos bancos (3 de cada lado) |
| Salão de cima | 32–33 | |
| Terraço | 34–39 | |

`map-data.json` → `tables` traz as 39 mesas em ordem de número (`id` `mesa-N`, `number`, `area`, `floor`, `places`, posição, altura do tampo em `top` e o colisor). Cada assento tem `table`, o número da sua mesa, e o botão de sentar mostra *Sentar · mesa N*. No código, use `CAFE_TABLES` e `tableByNumber(n)` (`@bar/shared`). **Toda referência a uma mesa, no jogo ou nos pedidos de mudança, usa esse número.**

## Fachada iluminada

A fachada *Highland Bar* (`13_fachada.py`) tem o letreiro com a logo na quina do andar de cima (`Letreiro_Highland`, com a borda em `Neon_Magenta`), as duas placas do beiral da varanda (`Placa_Highland`) e um halo magenta nos tijolos da quina (`Luz_Letreiro`). O importador falha se algum desses materiais deixar de ser emissivo ou se a luz sumir.

No jogo, a fachada fica acesa de dia e de noite e só apaga no apagão, junto com a luz do bar. O motor não tem *bloom*, então emissão acima de 1 só estoura o pixel para branco e muda o tom (o neon com força 3 viraria lilás). Por isso, `environment-lighting.ts` mantém o canal mais forte de cada material exatamente no valor do Blender **depois da exposição da cena**: o magenta, o ciano, o amarelo e o laranja da logo aparecem como na arte. `Luz_Letreiro` não vira luminária de teto: continua pontual, sem sombra, com a cor magenta original, e acende à noite.

## Palco do quintal

O palco (`15_palco.py`) é um tablado de 10,3 × 4,2 m a 0,90 m, encostado nos muros leste e norte do quintal. Só se sobe pela escada de dois degraus do lado oeste (`COL_Palco_Degrau`, com corrimãos `COL_Palco_Corrimao`). Em cima ficam as quatro torres de treliça, a cobertura, as caixas de som, os retornos, o backline e a mesa de som, cada um com seu volume `COL_Palco_*`. O importador exporta para `map-data.json` → `stage`:

- `deck` e `steps`: os volumes de `COL_Palco` e dos degraus. O jogo usa os dois para saber quem está no palco e para segurar quem não tem ingresso (veja [economia](../sistemas/economia.md#palco)).
- `screen`: o centro, a largura, a altura e o giro do telão `Telao_Tela` (plano 16:9 de 5,76 × 3,24 m, virado para a plateia). É nele que o vídeo aparece; sem vídeo, aparece a arte de espera do próprio mapa.
- `places`: os lugares dos músicos (`Palco_Lugar_Violao`, `_Cavaquinho`, `_Bateria`, `_Vocal`): ponto e ângulo do vazio, os quatro clipes, o instrumento do mapa e o GLB das animações (`export/animacoes/palco_*.glb`, publicado em `apps/web/public/palco`, com hash e durações). Veja [músicos do palco](../sistemas/palco.md).

O importador falha se faltar o tablado, a escada, o telão, um dos quatro clipes de um lugar, o instrumento dele no mapa, as lentes e a fita de LED (`Palco_FX_Luz`, material `Palco_Luz`) ou a contraluz colorida (`Luz_Palco_Cor`). No jogo, essas luzes seguem as cores do vídeo do telão (`apps/web/src/engine/stage-lights.ts`, veja [jukebox e TVs](../sistemas/jukebox.md#telão-do-palco)). `Luz_Palco`, a luz branca de frente, continua sendo uma luminária externa do ciclo de dia e noite.

## Pontos do jogo

O nascimento parte de `Spawn_Jogador`, na calçada, e procura o ponto livre mais próximo, mantendo distância das pessoas presentes. `Ponto_Balcao` posiciona o atendimento do Seu Zé. O blackjack continua sendo um objeto do jogo, no salão de jogos superior (`BLACKJACK_TABLE` em `packages/shared/src/world.ts`). A jukebox é a do mapa (`Jukebox` + `COL_Int_Jukebox`, de `12_jukebox.py`), na base da escada do térreo; o importador exporta sua posição em `map-data.json` → `jukebox`, e as luzes dela estão em [jukebox](../sistemas/jukebox.md#luzes-da-jukebox). As rotas de Tonico e Seu Zé são verificadas contra os novos colisores.

## Câmera e iluminação

A câmera acompanha a altura do jogador com zoom contínuo e giro livre em qualquer ângulo. Paredes, lajes, portas e os demais colisores não encurtam a distância escolhida; obstáculos entre a câmera e o personagem abrem uma janela de raio-X em volta dele ([câmera](../sistemas/camera.md)). As colisões do jogador permanecem ativas. O plano distante é de 1.700 m (`camera_far_minimo_m` da cidade), para os morros e o panorama; o que tem detalhe não depende dele, e sim do streaming. A névoa vem dos extras da cena da cidade: de 90 a 650 m de dia e de 80 a 540 m à noite, multiplicada pela opção de névoa. O fim da área jogável é coberto pelo anel e pelo fundo distante.

O importador glTF separa o sol das 13 luminárias do bar, preservando posições, cores e potências relativas. O ciclo completo de dia e noite dura 40 minutos; céu, lua, ambiente, névoa, luzes externas, festa e apagão permanecem integrados. Para limitar custo de GPU, doze focos externos com sombras atendem o entorno imediato do bar, enquanto o restante do bairro usa materiais emissivos, luz ambiente, lua e névoa.

## Testes

`tests/integration/city.test.ts` verifica a publicação, a colisão e os limites da cidade. `tests/integration/map.test.ts` verifica hashes e publicação dos GLBs, as contagens, a numeração 1–39 das mesas e a mesa de cada assento, 128 posições de nascimento, escadas, rotas do navegador, balcão, assentos, jukebox, palco, barreiras e consultas de visibilidade. `tests/integration/camera.test.ts` verifica o zoom e o giro livres da câmera, inclusive através das paredes. `tests/integration/doors.test.ts` valida dimensões e giro das 16 folhas. Todos os 124 assentos precisam ter uma saída livre. `apps/server/test/npcs.test.ts` simula as rotas dos NPCs no mobiliário importado.

Veja os [resultados da validação do mapa](../validacao/validation-map.md).
