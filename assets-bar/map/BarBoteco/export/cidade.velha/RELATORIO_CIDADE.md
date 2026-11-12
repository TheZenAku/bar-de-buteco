# Bar de Buteco — expansão para cidade (800 × 800 m)

Data: 31/10/2026 · Blender 4.0.2 · 1 unidade = 1 metro (sistema métrico, `scale_length` 1,0)

## Arquivos

| O quê | Onde |
|---|---|
| Mapa original (não modificado) | `Desktop\BAR\2.0\map\bar_boteco_4.0.2.blend` (332 MB, data de 29/10) |
| Cópia de segurança antes da cidade | `Desktop\BAR\2.0\map\bar_boteco_4.0.2_BACKUP_antes_cidade_2026-10-31.blend` |
| **Nova versão com a cidade** | `Desktop\BAR\2.0\map\bar_boteco_4.0.2_cidade.blend` (359 MB) |
| Scripts (re-executáveis, mesmo padrão do pipeline) | `BarBoteco\scripts\cidadelib.py` e `21_` a `29_cidade_*.py` |
| Exportação por setor + manifesto | `BarBoteco\export\cidade\` |
| Capturas (11 renders EEVEE) | `BarBoteco\export\cidade\capturas\` |
| Validação completa (JSON) | `BarBoteco\export\cidade\validacao.json` |

Ao abrir o arquivo, a visibilidade da viewport está como você tinha deixado: o bar e o bairro original ocultos, os props manuais visíveis. A cidade nova fica visível, com colisores e LODs ocultos. Para ver tudo junto, rode no Blender:
`MODO = "tudo"; exec(open(r"C:\Users\rafael\BarBoteco\scripts\29_cidade_visibilidade.py").read())`. Com `MODO = "usuario"` o estado original volta. O céu panorâmico novo renderiza normalmente, mas fica oculto na viewport porque a tampa do céu bloqueia as vistas aéreas.

## Dimensões e organização

- **Área jogável:** x e y de −400 a +400 m, ou seja, 800 × 800 m = **0,64 km²**. A origem continua no canto do bar, que ocupa (0..32, 0..26) e fica no centro do mapa. Nada do bar foi deslocado.
- **Setores:** **64** (grade 8 × 8 de 100 m), com nomes `CITY_Sxx_yy`. `xx` é a coluna de oeste para leste e `yy` é a linha de sul para norte; o bar fica em `CITY_S04_04`. Cada setor tem as subcoleções `_VISUAL`, `_COLLISION`, `_ROADS`, `_PROPS`, `_VEGETATION`, `_LOD` e `_MARKERS`, todas dentro da coleção raiz `CIDADE`.
- **Anel visual externo:** vai até cerca de ±740 m, o que dá **≈1,48 km de extensão total**. Está dividido em 8 octantes (`ANEL_N`, `ANEL_NE`…) e não tem colisão.
- **Fundo distante:** morros a 820–960 m, panorama com raio de 1.050 m e chão com raio de 1.250 m (coleção `CITY_DISTANTE`).
- Propriedades da cena atualizadas:
  - `area_jogavel` passou para [−400, −400, 400, 400]; o valor antigo ficou em `area_jogavel_bairro_antigo`;
  - `nevoa` vai de 90 a 650 m;
  - `camera_far_minimo_m` = 1.700;
  - `setores` foi criada e descreve a grade.

## Plano urbano

O bairro original, com as 7 × 7 quadras, a praça, a igreja, a escola e o campinho, virou o **núcleo do Centro**, e o bar continua como ponto de encontro ao lado da praça. Em volta dele passa um **anel viário** que costura as 24 ruas antigas às novas. Nenhuma rua antiga termina mais em cavalete.

| Bairro | Onde | Caráter | Pontos de interesse |
|---|---|---|---|
| **Centro** | bairro original + anel + "Centro Novo" ao norte (y 159–265) | quadras pequenas de 38 × 40 m, sobrados de 1 a 3 pavimentos com comércio no térreo, ruas de mão única com setas | Praça e Igreja (originais), **Prefeitura** no eixo da praça e da igreja, **Terminal Central**, bar, 4 luzes reais, lombadas pintadas em volta da praça |
| **Parque Olaria** | sul (abaixo da Avenida Principal) e sudoeste | casas térreas compactas, geminadas, puxadinhos em tijolo aparente, lajes com caixa d'água, comércio nas esquinas, malha levemente ondulada | **Área de lazer** (pista de caminhada, academia ao ar livre e parquinho), **Campo do Olaria** (alambrado, arquibancada e vestiário), Supermercado e Posto na curva da avenida |
| **Jardim Conceição** | oeste e norte | ruas sinuosas, lotes médios com recuo e jardim, sobrados, 58 lotes em aclive com muro de arrimo e escada, terrenos vazios e obras | **EMEF**, **UBS**, **Praça do Jardim** (quiosque e parquinho), **Bosque**, **rotatória** no fim da avenida |
| **Distrito Industrial** | faixa leste, junto à ferrovia | galpões de 8 a 12 m com docas, escritório, pátio e vagas, muro pré-moldado, guarita, lotes vazios | **Transportadora** (8 docas e carretas), **Metalúrgica** (chaminé), **Subestação**, faixa da ferrovia |

**Sistema viário:**

- **Avenida Principal:** boulevard de 20 m com canteiro gramado, árvores e luminárias. Liga o Distrito Industrial, o sul do Centro, o Olaria e o Jardim Conceição, onde termina numa rotatória.
- **Anel perimetral:** 14 m nas faces oeste e norte. A face leste é a Av. da Indústria, com 16 m e esquinas de raio 10 m para caminhões.
- **Coletoras** de 11–12 m, **locais** de 8–10 m e uma rua de contorno interna.
- Ao todo são **13,5 km de vias novas**, com 156 cruzamentos e 137 faixas de pedestre.
- Sinalização horizontal: retenção e "PARE" pintado nas vias secundárias, linha amarela nas coletoras e avenidas, tracejado de faixas, setas de mão única e remendos de asfalto.
- Calçadas e guias: guia de concreto, sarjeta, meio-fio de 15 cm e esquinas arredondadas. A pedra portuguesa vai no Centro, o cimentado no Olaria e faixa gramada de serviço no Jardim Conceição.

**Limites do mapa:**

- **Sul:** muro de divisa com pichação, eucaliptos e, depois, rodovia em aterro.
- **Oeste:** cerca de arame, quebra-vento de eucaliptos e canavial; ao longe aparece uma usina.
- **Norte:** alambrado, mata ciliar e córrego, com um bairro em encosta logo depois.
- **Leste:** ferrovia com cerca de concreto, silos e galpões.
- Paredes invisíveis de 40 m de altura (`COL_Cid_Limite_*`) fecham o perímetro em segmentos por setor.

## O que foi criado (contagens)

- **687 lotes:**
  - 293 casas populares, 111 casas médias e 22 casinhas;
  - 127 comércios e 83 sobrados comerciais;
  - 34 galpões;
  - 9 terrenos vazios residenciais e 4 industriais, mais 6 obras;
  - 167 ampliações (puxadinhos e edículas);
  - 12 pontos de interesse em quadras inteiras, mais 7 trechos de ferrovia.
- **Vegetação:** 1.865 árvores novas (ipê, duas copas genéricas e eucalipto) e arbustos.
- **Mobiliário e sinalização:**
  - 537 postes com fiação aérea (496 nas calçadas e 41 pares no canteiro central);
  - 22 pontos de ônibus com lixeira e marcador;
  - 123 placas PARE, 112 placas de rua, 13 de sentido único, 18 de 40 km/h, mais placas de escola e de "Distrito Industrial";
  - bancos, orelhões e 92 carros estacionados.
- **Luzes reais novas:** 9 pontuais, **todas sem sombra**, com `cutoff` de 30 m e a propriedade `luz_noturna`. Ficam só no Centro e nos POIs; o resto da iluminação vem do material emissivo `Lampada` dos postes.
- **Marcadores:** `Ponto_Prefeitura`, `Ponto_Terminal`, `Ponto_Escola_Conceicao`, `Ponto_UBS`, `Ponto_Praca_Conceicao`, `Ponto_Bosque_Conceicao`, `Ponto_Lazer_Olaria`, `Ponto_Campo_Olaria`, `Ponto_Supermercado`, `Ponto_Posto`, `Ponto_Subestacao`, `Ponto_Transportes`, `Ponto_Metalurgica`, `Ponto_Onibus_01…22` e `Bairro_*` (4).
- **Atlas novo:** `atlas_cidade.jpg` (1024 px, 236 KB), com letreiros fictícios, vitrine, porta de enrolar, doca, basculante e placas de trânsito. Nenhum nome comercial real foi usado.

## Desempenho

**Totais do arquivo:** 13.986 objetos (10.193 da cidade nova), 1.024 malhas, 156 materiais (**26 novos**, todos reaproveitando texturas que já existiam, mais o atlas) e 100 imagens. São 26 luzes no total; das 9 novas, nenhuma projeta sombra.

**Triângulos LOD0 por setor:**

| Medida | Valor |
|---|---|
| Média | ≈12,2 mil (3,9 mil de geometria fundida + 8,3 mil de instâncias) |
| Mediana | 10,7 mil |
| Mínimo | ≈5,8 mil |
| Máximo | 35 mil |
| LOD1 da cidade inteira | 9,1 mil |
| LOD2 da cidade inteira | 26,5 mil |
| Anel externo | 38,5 mil |
| Fundo distante | 4,6 mil |

**Setores mais pesados:** S03_07, S02_07, S00_07, S05_07 e S01_07, todos de 28 a 35 mil triângulos. É a borda norte, onde a mata ciliar concentra árvores. As árvores LOD0 (328 triângulos cada) são o maior custo da cidade.

**S04_04 (bar + bairro original):** soma cerca de 520 mil triângulos, mas quase tudo é conteúdo **original**: o interior do bar, os props do Meshy e `Exterior_Mobiliario`, que sozinho tem 189 mil. Esse conteúdo continua no `bar_boteco.glb` do `08_export.py`.

**Primitivas (draw calls) por setor:** em média 44, no máximo 65.

**Instanciamento:** os repetidos usam malha vinculada. Os mais usados:

| Malha | Instâncias |
|---|---|
| `P_Arvore_B` | 758 |
| `P_Arvore_A` | 587 |
| `K_Eucalipto` | 576 |
| `P_Poste_Luz` | 570 |
| `P_Caixa_Agua_Casa` | 414 |
| `P_Canteiro` | 337 |
| `P_Arvore_Ipe` | 227 |
| `P_AC` | 150 |
| `P_Poste_Trafo` | 130 |
| `K_Placa_PARE` | 123 |

Também são instanciados `K_Arbusto`, `K_Bomba`, `K_Carreta`, carros e placas. Casas e galpões têm dimensões únicas, então são **fundidos por setor e por material compartilhado**. Janelas e portas são decalques do atlas, com 2 triângulos cada; instanciá-las custaria mais do que fundi-las.

**Esquema de LOD:**

- **LOD0:** malhas fundidas e instâncias.
- **LOD1:** `Sxx_yy_Edificios_LOD1` (volume + cobertura simples), `K_Arvore_LOD1` (≈30 triângulos), `K_Eucalipto_LOD1`, `K_Poste_LOD1` e `K_Carro_LOD1`.
- **LOD2:** `Sxx_yy_Silhueta_LOD2` (uma caixa por prédio, inclusive o bairro original), `Sxx_yy_Vegetacao_LOD2` (8 triângulos por árvore, inclusive as 282 originais) e `Sxx_yy_Chao_LOD2`.
- As distâncias estão nas propriedades das malhas e dos objetos: `lod1`, `lod_dist_m` e `cull_m`. Props pequenos somem entre 50 e 140 m.

**Colisores:** 7.278 no total, dos quais **5.725 são novos**, todos caixas `COL_*` na convenção do bar (escala = tamanho):

- 1 de chão por setor;
- 1.148 de calçada e quadra;
- volumes de prédios, muros de frente, troncos de árvore, postes, abrigos e carros;
- **146 para as casas do antigo anel decorativo**, que não tinham colisão e agora ficam dentro da área jogável.

Nenhuma malha visual é usada como colisão e o cenário externo não tem colisão.

**Exportação** (`28_cidade_export.py`, no mesmo padrão do `08_export.py`):

| Item | Tamanho |
|---|---|
| Visual dos 64 setores | 20,6 MB |
| LOD dos 64 setores | 4,4 MB |
| Colisão dos 64 setores | 1,3 MB |
| Texturas (18 arquivos, compartilhados) | 2,3 MB |
| Anel externo | 2,4 MB |
| Fundo distante | 0,16 MB |

O maior setor visual tem 695 KB. Os setores saem como glTF separado e todos apontam para `export\cidade\texturas\`, então nenhuma textura se repete entre setores. O manifesto `cidade_setores.json` traz limites, arquivos, tamanhos, triângulos e vizinhos de cada setor.

## Validação (`27_cidade_validar.py`)

| Verificação | Resultado |
|---|---|
| Bar e objetos originais preservados | **sim**: assinatura (nomes + transformações + malhas) idêntica antes e depois, 3.611 objetos. 15 marcadores e 16 portas com pivô intactos |
| Ponto de nascimento | mesma posição (12; −1,6; 0,15), fora de qualquer colisor |
| Conectividade | 202 nós viários, **todos alcançáveis a partir do bar**, 0 componentes isolados, **0 ruas sem saída**. As 24 "pontas" são as bocas que entram no bairro original |
| Rotas entre bairros (menor caminho) | Centro–Jardim Conceição 343 m · Centro–Industrial 476 m · Olaria–Jardim Conceição 555 m · Industrial–Olaria 614 m · Centro–Olaria 698 m · Jardim Conceição–Industrial 718 m |
| Chão sem buraco | 40.000 raios em grade de 4 m. Um único raio sem acerto, que caiu exatamente sobre a aresta comum de duas quadras; 0,1 m para cada lado há chão |
| Colisão na altura da calçada | 96,5% dos pontos de calçada e quadra. Os 3,5% restantes são faixas de eucalipto atrás dos lotes de borda, ainda apoiadas no chão de colisão do setor (15 cm abaixo) |
| Obstáculos nas vias | nenhum prop novo sobre o leito, exceto as árvores e luminárias do **canteiro central** (intencional). Calçada livre mínima de 1,4 m |
| Colisores novos invadindo ruas antigas | nenhum |
| Materiais redundantes | nenhum |
| Escala | métrico, metros, `scale_length` 1,0 |

**Itens do mapa original que foram retirados do jogo:** 128 itens, movidos para a coleção `_OBSOLETO_Limite_Antigo`. Eles continuam no arquivo, fora da view layer e do export:

- 4 muros invisíveis `COL_Rua_Limite` do limite antigo;
- 120 cavaletes e cones que fechavam as saídas das ruas;
- 4 objetos do fundo distante antigo: os prédios a 200–360 m e os morros a 430–560 m ficariam dentro da cidade.

## O que ainda falta para integrar ao jogo

1. **Loader de streaming:** carregar os setores pelo `cidade_setores.json`. Sugestão: 3 × 3 setores em LOD0 em volta do jogador, o anel seguinte com `*_lod` (LOD1 e LOD2) e o resto só com LOD2. `cidade_anel` e `cidade_distante` ficam sempre carregados.
2. **Troca de LOD das instâncias:** os nós `INST_*` levam `lod1` e `cull_m` nos extras; falta trocar por distância no PlayCanvas.
3. **Colisão por setor:** os arquivos `cidade_Sxx_yy_colisao.glb` seguem a mesma convenção do `bar_boteco_colisao.glb`.
4. **Bar e bairro original:** continuam no `bar_boteco.glb` (sempre carregado). Como `Exterior_Distante` virou obsoleto, o fundo agora vem do `cidade_distante`. Para mover o bairro original para os setores, use `INCLUIR_BAIRRO_ORIGINAL = True` no `28_` e retire `EXTERIOR` do `08_`.
5. **Noite:** ligar as luzes `luz_noturna` e animar o emissivo dos postes.
6. **Névoa e far plane:** ler `nevoa` e `camera_far_minimo_m` dos extras da cena.
7. **IA de trânsito e moto:** `cidade_vias.json` traz nós, arestas, larguras, mão única e canteiro. `cidade_lotes.json` traz lotes e portões.
8. **Teste em aparelho:** os números acima são de geometria, não de quadros por segundo. Ainda é preciso medir FPS e memória num celular de entrada com 9 setores carregados.

## Otimizações recomendadas (não aplicadas, para não mexer em conteúdo original)

- **Texturas grandes do bar:** 41 texturas de 2048 px ou mais (assets do Meshy), 4 delas com 4096², todas embutidas no `.blend`. Reduzir para 1024 e/ou usar KTX2/WebP.
- **`Exterior_Mobiliario` (original):** 189 mil triângulos, com 81 carros a 446 triângulos cada. É candidato a LOD ou a ficar só em LOD1.
- **Draw calls:** juntar as 11 cores de reboco num atlas de cor ou em cor de vértice tiraria cerca de 10 primitivas por setor. Fundir setores 2 × 2 no LOD2 também ajuda.
- **Árvores:** uma LOD0 mais leve (em torno de 120 triângulos) reduziria cerca de 40% dos triângulos dos setores mais arborizados.
- **Compressão:** aplicar Draco ou meshopt aos `.bin` dos setores.

## Limitações conhecidas

- Ruas e quadras são planas. Os desníveis estão nos platôs dos lotes, nos muros de arrimo, no aterro da rodovia e na encosta fora do limite.
- Só o bar tem interior; os prédios novos são fachadas e volumes.
- As casas do antigo anel decorativo (bordas do bairro original) continuam no estilo simplificado original. Ganharam colisão, mas não muros nem portões.
- Ao longo das divisas virtuais existem junções em T entre quadras vizinhas, o que pode gerar costuras de subpixel.
- Re-executar `03_rua.py` ou `07_exterior.py` recria os cavaletes, os muros do limite antigo e o fundo antigo. Depois disso, rode `22_cidade_base.py` de novo, que move esses itens para o obsoleto outra vez.

## Ordem dos scripts

`21_cidade_texturas` → `22_cidade_base` → `23_cidade_edificios` → `24_cidade_props` → `25_cidade_anel` → `26_cidade_lod` → `27_cidade_validar` → `28_cidade_export`

Cada etapa apaga e refaz apenas o que ela mesma criou (propriedade `cid_etapa`). Para rodar no Blender MCP:
`exec(open(r"C:\Users\rafael\BarBoteco\scripts\22_cidade_base.py", encoding="utf-8").read())`
