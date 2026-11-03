# Cidade em torno do bar

O bar continua em `bar_boteco.glb`, sempre carregado. Em volta dele, o jogo desenha uma cidade de 800 × 800 m, de x e z −400 a +400, com Centro, Parque Olaria, Jardim Conceição e Distrito Industrial. O mapa é dividido em 64 setores de 100 m que entram e saem conforme o jogador anda. A colisão é outra história: os colisores dos 64 setores ficam sempre no servidor e na previsão do cliente, em JSON.

O código fica em:

- `tools/assets/import-city.mjs`: valida o export e publica os arquivos.
- `packages/shared/src/city.ts`: grade, colisores, marcadores e névoa.
- `packages/shared/src/city-roads.ts`: grafo viário.
- `apps/web/src/engine/city-plan.ts`: decide o que carrega e o que aparece, sem renderizador.
- `apps/web/src/engine/city-streaming.ts`: carrega e desenha com o PlayCanvas.

## Importar e republicar

O Blender gera `assets-bar/map/BarBoteco/export/cidade` (`28_cidade_export.py`). Depois de um novo export, rode:

```
npm run assets:map
```

O importador primeiro lê e valida tudo, e só então escreve:

- grade do manifesto (8 × 8, 100 m, origem −400) e limites de cada setor;
- `.gltf`, `.bin` e `_colisao.glb` de todos os setores e o tamanho de cada buffer;
- URIs dos glTF: relativas, dentro da pasta da cidade e apontando para um arquivo que existe;
- os 39 marcadores e os extras de névoa e câmera da cena;
- o perímetro: `COL_Cid_Limite_*` precisa cobrir os quatro lados sem buraco, com a face interna em ±400;
- o chão: cada setor precisa de um `COL_Cid_Chao` que o cubra na altura 0.

Se algo faltar, o erro cita o arquivo e nada é publicado. Arquivos iguais aos publicados não são tocados, então reimportar sem mudanças não reinicia o mundo em desenvolvimento. Os demais chegam por um nome temporário. Se um deles estiver aberto por outro processo, o Windows recusa a troca e o importador avisa: feche a aba do jogo e importe de novo. O próprio Vite pode manter `bar_boteco.glb` aberto por tempo indefinido, mesmo sem ninguém baixando. Nesse caso, fechar abas não resolve. O Windows permite renomear o arquivo aberto, então mova o publicado para fora de `public/maps`, coloque o novo no lugar e importe de novo; não é preciso reiniciar o `npm run dev`. Só são removidos arquivos listados na publicação anterior (`cidade_publicacao.json`). Uma pasta `public/maps/cidade` que não tenha esse carimbo faz o importador parar. A pasta não é trocada de uma vez porque o Windows recusa renomear pasta recém-escrita enquanto o antivírus a segura.

### O que é publicado

```
apps/web/public/maps/cidade/
  cidade_setores.json  cidade_vias.json  cidade_lotes.json  pontos_ifood.json  validacao.json  cidade_publicacao.json
  cidade_anel.gltf + .bin   cidade_distante.gltf + .bin
  setores/  cidade_Sxx_yy.gltf + .bin, cidade_Sxx_yy_lod.gltf + .bin   (128 glTF)
  texturas/ 22 JPEG compartilhados
```

São 288 arquivos e 37 MB. Capturas, relatório, GLBs de colisão, `.blend` e scripts não vão para o runtime. As relações `../texturas/` e `texturas/` ficam como no export.

### O que as cópias publicadas deixam de fora

Os arquivos do export não são alterados. As cópias publicadas só têm triângulos colapsados em um ponto (mesmo tamanho de arquivo, só índices mudam):

| O quê | Triângulos | Por quê |
| --- | --- | --- |
| `Silhueta_Original_LOD2` no `*_Estatico` dos setores | 2.720 | `25_cidade_anel.py` não dá coleção a esse tipo de malha, então ele caiu no LOD0: caixas por cima de cada prédio do bairro antigo e uma de 32 × 26 × 7 m fechando o bar |
| `*_Vegetacao_LOD2` e `*_Chao_LOD2` dentro do bairro antigo | 2.274 | As árvores e o chão reais de lá estão sempre desenhados |
| Cavaletes e cones do limite antigo em `Mapa_Bairro` (`bar_boteco.glb`) | 6.576 | Só nos exports de antes da cidade: fechavam as saídas e ficam fundidos na malha, sem nó próprio |

O importador confere os triângulos dos cavaletes e cones (96 de 56 e 24 de 50) e falha se forem outros. O export de 01/11/2026 já vem sem eles, sem `Fundo_Distante` e sem `COL_Rua_Limite`, então esses cortes não fazem nada. Um export antigo continua funcionando: o nó `Fundo_Distante` é destruído ao carregar o mapa, e os `COL_Rua_Limite` não entram no `map-data.json`.

### O que a cópia publicada do bar recebe

Desde o export de 02/11/2026 "b" (reboco `Bar_Reboco_*`, escada de granito, TV de 1,06 × 0,60 m), o `bar_boteco.glb` traz esses nós e é publicado byte a byte, junto com o `bar_magrao.glb` reexportado para a tampa nova. O resto desta seção só vale para um export que volte a vir sem eles.

Os `bar_boteco.glb` de 01/11/2026 e da primeira versão de 02/11/2026 saíram de um `.blend` em que o `17_lugares_animacao.py` não rodou: vêm com o freezer fechado, sem a bandeja de copos e sem os lugares do Magrão e dos mictórios. Nesse caso, `withBarPieces` faz o seguinte na cópia publicada, sem alterar o arquivo do export:

- abre o freezer exportado: tira o tampo do corpo e transforma a tampa dele, com o puxador, no nó `Freezer_Bar_Tampa`, que gira na dobradiça;
- copia de `export/anterior_2026-10-29/bar_boteco.glb` só o interior do freezer (gelo, forro, faces de dentro das paredes e borda de borracha) e a bandeja;
- acrescenta a `INST_A_long-neck` as 59 long necks de dentro do freezer;
- copia os nós `Copo_Bandeja`, `Balcao_Lugar_Magrao`, `Balcao_Entrega` e `Mictorio_Lugar_1` a `3`.

Por fora, o freezer do balcão fica igual aos outros.

Um export com esses nós passa direto e dispensa a pasta `anterior_2026-10-29`. Isso exige rodar o `17_lugares_animacao.py` depois do `36_bar_polimento.py` e antes do `08_export.py`. Desde 02/11/2026 o script 17 faz o freezer do bar a partir do `P_Freezer` do 36.

### Carros

Desde 02/11/2026 não há carro parado no mapa (`32_remover_carros.py`). O script removeu os sedans visíveis, mas deixou as caixas `COL_Ext_Sedan_*` no `bar_boteco_colisao.glb`. O importador as ignora, porque seriam paredes invisíveis na rua.

### Inox

A cena não tem mapa de ambiente, então metal não reflete nada e fica preto. Os materiais `Inox`, `Pol_Inox` e `Pgn_Inox` chegam com metalness até 1, e `environment-lighting.ts` reduz esse valor a 0,2 ao carregar o mapa.

## Pontos iFood

`pontos_ifood.json` traz os 23 pontos de retirada "Highland Bar Delivery": nome, setor, posição, frente e colisor, em glTF. `npm run assets:gps` lê o arquivo e grava os pontos em `gps-data.json`. No [Highfood](highfood.md), cada pedido é retirado no ponto mais perto, com um código digitado na tela. O anel da base do Highfood fica na rua, na frente do ponto do bairro antigo, mas é independente dele. O ponto do bairro antigo está fundido em `Mapa_Bairro`, com a caixa `COL_Ponto_iFood` em `bar_boteco_colisao.glb`. Os outros 22 estão no `*_Estatico` de 22 setores, com `COL_Ponto_iFood_02` a `23` nos colisores deles. A câmera atravessa essas caixas, como faz com os pontos de ônibus, e o minimapa as desenha como os outros objetos da rua.

## Streaming

`BarScene.update` passa a posição do jogador ou da moto (ou a câmera, no lobby) a `CityStreaming.update`, que atualiza `CityPlanner` cinco vezes por segundo.

| O que | Sempre carregado | Observação |
| --- | --- | --- |
| `bar_boteco.glb` | sim | Erro fatal só se este falhar |
| `cidade_distante` (morros, chão, panorama) | sim | Falha só registra aviso |
| `cidade_anel` | sim | Falha só registra aviso |
| Setor completo (`cidade_Sxx_yy.gltf`) | não | O setor central e os vizinhos |
| LOD do setor (`_lod.gltf`) | enquanto a névoa o deixar visível | Fica carregado debaixo do setor completo para a troca ser imediata |

- **Setor central:** muda só 8 m depois da linha entre setores (`CENTRE_MARGIN`), então parar sobre a linha não troca nada.
- **Um por vez:** cada setor mostra um arquivo só. O que sai é escondido antes de o outro aparecer. Enquanto o completo carrega, o LOD fica no lugar; se o LOD ainda não chegou, o completo permanece.
- **Antecipação:** a 2 m/s ou mais, os setores a 3 s de distância na direção do movimento são baixados e ficam ocultos.
- **Liberação:** o que ninguém precisa fica 8 s carregado (`RETAIN_MS`) e depois é destruído. Um arquivo que chega depois de o setor ser abandonado espera o mesmo prazo. Depois de `destroy`, é liberado assim que chega.
- **Falha:** cada arquivo tem até 4 tentativas, com esperas de 2, 8 e 30 s, e o setor e o arquivo vão para o console. O LOD ou o fundo continua no lugar. `retryFailed` dá uma nova rodada.

### Detalhe por qualidade

Configurações → Gráficos → **Detalhe da cidade** (`CITY_TUNING`):

| | Setores completos | LOD1 até o anel | Arquivos ao mesmo tempo | `cull_m` × | Luzes reais |
| --- | --- | --- | --- | --- | --- |
| Baixo | 3 × 3 | 2 | 2 | 0,6 | não |
| Médio | 3 × 3 | 3 | 3 | 0,8 | sim |
| Alto | 3 × 3 + os que estão a até 120 m | 4 | 4 | 1 | sim |
| Ultra | 5 × 5 | 5 | 6 | 1,25 | sim |

### LOD e instâncias

- O arquivo `_lod.gltf` tem quatro nós por setor. `_Edificios_LOD1` aparece até o anel de LOD1, `_Silhueta_LOD2` depois dele, e `_Vegetacao_LOD2` e `_Chao_LOD2` sempre. Os setores do bairro antigo só têm os dois últimos.
- O PlayCanvas mantém `EXT_mesh_gpu_instancing`, mas não aplica culling às instâncias nem guarda os `extras`. Os extras são lidos no `postprocess` do nó. Cada `INST_*` ganha uma caixa calculada das matrizes (`setCustomAabb`) para o recorte por câmera, e é escondido além do `cull_m × qualidade`, com 5% de folga para não piscar.
- O parser clonaria a textura a cada referência repetida à mesma imagem (32 texturas para 13 imagens em um setor). `CityStreaming` entrega uma única cópia de cada arquivo (`image.processAsync`) e aponta os materiais para a primeira textura de cada imagem. As clones não usadas nunca chegam à GPU e são liberadas com o setor. As texturas compartilhadas só saem com a cena.
- Os `K_*_LOD1` citados nos extras não existem em nenhum arquivo exportado. Por isso, no anel de LOD1 as árvores são as de `_Vegetacao_LOD2`.
- Os chãos distantes ficam a −0,02 e −0,06 m, perto demais das ruas para a profundidade separá-los de longe. Por isso usam `depthBias`.
- Sombras: um setor completo só projeta sombra do sol se estiver a até 70 m. LOD, anel e fundo não projetam nem recebem.

### Noite

As nove luzes `luz_noturna` (`Luz_*`) entram e saem com seu setor. São omni, sem sombra, com alcance de 30 m, e acendem à noite (`addCityLight`). Os postes usam o material `Lampada`, numa cópia única para a cidade, com o mesmo brilho noturno. O apagão apaga tudo, como já fazia com os postes do bairro. O panorama é pintado de dia e opaco, então recebe a cor do horizonte conforme a hora (`setPanorama`).

## Colisão

`import-city.mjs` lê cada caixa `COL_Cid_*` pela matriz mundial completa (pai, giro, escala), recusa caixa inclinada e grava `packages/shared/src/city-data.json`, carregado por servidor e cliente:

| Tipo | Vira | Exemplos |
| --- | --- | --- |
| Só piso | Dois triângulos na face de cima, sem volume sólido | `Chao`, `Quadra`, `Quadra_Faixa`, `Calcada`, `Canteiro` |
| Piso e sólido | Os dois | `Plato`, `Plataforma` |
| Sólido | Caixa | prédios, muros, troncos, postes, carros, limites e qualquer tipo novo |

As caixas giradas guardam a forma real em `turn`, e `hx`/`hz` continuam sendo a caixa que as envolve, para os consumidores antigos e para a grade. `boxContains`, a moto (`overlaps`), a câmera (`firstHit`) e o alcance de interação usam a forma real. Um alambrado de 68 m girado 1,6° ocuparia 2 m de largura sem isso. Pedestre e moto continuam usando a grade espacial de 8 m. Quando uma porta se move, só ela muda na grade.

- `floorHeight` escolhe o piso mais alto ao alcance, então o bar e o bairro antigo continuam em cima do chão da cidade.
- `roadHeight` aceita `COL_Rua*` e os pisos marcados como rua. O piso do bar continua fora, e a moto continua sem entrar nele.
- `COL_Cid_Limite_*` não esconde nada: a câmera a ignora em `firstHit`.
- `MAP_COLLIDERS` e `COLLIDERS` continuam só com o bar e o bairro antigo. A cidade está em `CITY_SOLIDS` e `solidColliders()`.

## Marcadores e vias

`CITY_MARKERS` traz `Ponto_*` e `Ponto_Onibus_01…22`, e os bairros `Bairro_Centro`, `Bairro_Parque_Olaria`, `Bairro_Jardim_Conceicao` e `Bairro_Distrito_Industrial`, com seu `label`. Os marcadores antigos não mudaram. O minimapa desenha as quadras e os prédios da cidade, e o nome embaixo dele é o do bairro ou do ponto próximo.

`@bar/shared/city-roads` traz o grafo de `cidade_vias.json` nos eixos do jogo, com `nearestRoadNode` e `roadRoute`. Hoje só os testes o usam. Fica fora do índice do pacote para não pesar no navegador.

## Nomes das ruas

As ruas têm nomes reais de Santa Bárbara d'Oeste, lidos das plantas da prefeitura: [Centro](https://ws.santabarbara.sp.gov.br/instar/mapas/loteamentos/centro.pdf), [Parque Olaria](https://ws.santabarbara.sp.gov.br/instar/mapas/loteamentos/olaria.pdf), [Jardim Conceição](https://ws.santabarbara.sp.gov.br/instar/mapas/loteamentos/conceicao.pdf) e [Distrito Industrial](https://ws.santabarbara.sp.gov.br/instar/mapas/loteamentos/distrito-industrial-i.pdf). As plantas são desenhos de CAD, sem texto, então a grafia foi lida a olho, com zoom. Os jogadores veem esses nomes no endereço dos pedidos do Highfood e no app Mapas.

A tabela fica em `tools/assets/street-names.ts`. Para mudar um nome, edite a tabela e rode `npm run assets:gps`. O `cidade_vias.json` continua com os nomes originais do export, que só servem de chave na tabela.

- **O traçado não é o real.** O mapa do jogo não segue a cidade: cada trecho de rua recebe um nome da planta do bairro onde está. Só no Centro as ruas paralelas mantêm a ordem real, de oeste para leste e de norte para sul.
- **Uma rua muda de nome ao cruzar um bairro.** Por isso a mesma rua do jogo pode ter um nome em cada lado da divisa. Perto da divisa, cerca de 4% dos endereços mostram o nome de uma rua do bairro vizinho.
- **Trechos curtos herdam um nome.** As plantas do Conceição e do Olaria têm menos ruas que o jogo, então trechos sem nome próprio usam o da rua nomeada mais próxima.

As placas 3D das esquinas (`P_Placa_Rua_A` e `_B`) não acompanham a rua onde estão. Os dois modelos se repetem pela cidade, com quatro nomes pintados em `atlas_bairro.jpg`: Rua Dona Margarida, Rua XV de Novembro, Rua João Lino e Rua 13 de Maio, que são as ruas em volta do bar. Em outras esquinas, a placa não bate com o endereço. Se a textura mudar, troque todas as cópias: `texturas/`, `export/cidade/texturas/`, a publicada (com o hash em `cidade_publicacao.json`) e a imagem embutida em `bar_boteco.glb`, ou gere o export de novo pelo Blender.

## Testes

- `tests/integration/city.test.ts`: manifesto, URIs, publicação, duplicidade, colisores, pisos, ruas, moto, setores nas bordas, marcadores, alcance a pé, limites, pontos iFood.
- `tests/integration/city-streaming.test.ts`: planejador com backend falso (3 × 3, histerese, sem duplicar, carga tardia, falhas, antecipação, qualidades).
- `tests/tools/import-city.test.mjs`: arquivo ausente, URI inválida, manifesto errado, perímetro aberto, publicação segura.
- `tests/e2e/city.spec.ts` (projeto `city`): streaming no navegador com três voltas sem crescer memória, noite, setor que falha e a moto saindo do bairro antigo no jogo real.

Em desenvolvimento, `barDebug.city()` mostra setor atual, setores completos e em LOD, carregamentos pendentes, falhas, assets, entidades, draw calls e o tempo da última atualização. Nada disso aparece na interface do jogador.

## Medições

Máquina virtual VMware, Edge com a GPU virtual, 1280 × 720, Alto, fixture `environment.html` sem outros jogadores:

| Medida | Valor |
| --- | --- |
| `bar_boteco.glb` | 19,5 MB, 4,2 s até o mapa base |
| Cidade para 3 × 3 completos | 8,7 MB, 2 s depois do mapa base |
| Cidade até o fim (13 completos, 64 LOD, anel, fundo) | 12,5 MB em 176 arquivos |
| FPS | 62–63 (limitado pela tela), em todos os presets |
| Draw calls | 947 no bar (Baixo 861, Médio 901, Ultra 1.030), 258–564 longe dele |
| Heap JS e VRAM | Heap 207 MB; VRAM 480 MB de texturas (incluído o bar), 20 MB de vértices, 2 MB de índices |
| Três voltas pelos 64 setores | Assets, VRAM e buffers iguais; heap 206 → 207 MB |

## Limitações conhecidas

- **Não foi medido em celular.** Os números acima são de PC virtual. A VRAM do bar (texturas de 2048 e 4096 px) e as ~860 draw calls no Baixo são os candidatos a problema em aparelho de entrada.
- O Campo do Olaria está fechado por quatro alambrados sem portão no export: dá para chegar até a cerca, não ao centro, onde está `Ponto_Campo_Olaria`.
- `cidade_vias.json` e `cidade_lotes.json` são publicados, mas ainda não há trânsito nem portões funcionando.
- O panorama é opaco até 26° de elevação: sol e lua baixos ficam atrás dele. Os morros distantes ficam da cor da névoa.
- O app Mapas do celular continua desenhando só o bairro antigo.
- O `bar_boteco.glb` de 01/11/2026 não tem as peças do `17_lugares_animacao.py` (veja [O que a cópia publicada do bar recebe](#o-que-a-cópia-publicada-do-bar-recebe)).
