# Fábrica EMPRESA BRASIL — 10/11/2026

Arquivo: `Mapa_Highland_v5.6_Empresa_Brasil.blend` (a v5.5 foi para `versoes_antigas`). Export: `exportacao_jogo/v5.6_2026-11-10/`.

O lote da caixa-guia "EMPRESA BRASIL" foi refeito:
- **Onde fica:** setor S07_04, esquina da Rua da Ferrovia (leste) com a rua de baixo (sul).
- **O que saiu:** o galpão azul, o escritório, a guarita, as 3 docas e o estacionamento antigos foram apagados.
- **O que entrou:** uma fábrica de alimentos com interior jogável.
- **A caixa-guia:** continua no arquivo, oculta. Nenhum script a exporta.

## O que tem

**Fora**
- **Galpão:** 26,5 × 31,1 m, beiral de 12 m e cumeeira de 14 m.
  - Paredes: alvenaria até 1,4 m e chapa metálica acima.
  - Estrutura: pilares pré-moldados e faixa verde e amarela.
  - Janelas: faixa alta de basculantes.
  - Telhado: telhas translúcidas, lanternim na cumeeira, calhas e condutores.
- **Letreiros "EMPRESA BRASIL":** no oitão da rua e na fachada sul.
- **Entrada:**
  - pátio de concreto;
  - portão de correr de 9 m, aberto e estacionado por dentro do muro;
  - totem com a marca;
  - muro de 2,4 m com pilaretes.
- **Portas na fachada leste:**
  - portão de enrolar de 5 × 5,2 m para o caminhão, com marquise e refletor;
  - porta de pedestre ao lado.
- **Poste com transformador:** saiu da frente do portão (y 53 → 60,17, já na calçada), e a fiação foi ajustada. Ele bloqueava a entrada do caminhão.

**Dentro** (na sequência do trabalho)
1. **Baia de carga e descarga.**
   - Faixa sul inteira do galpão, 6 m de largura.
   - O caminhão entra pelo portão de enrolar e para ao lado dos paletes.
   - Não cabe manobra de retorno lá dentro: o caminhão sai de ré.
   - Zebrado na soleira, "CARGA E DESCARGA" pintado no piso e balizadores.
2. **Matéria-prima.**
   - 8 vagas de palete (4 de MALTE e 4 de MIX), com demarcação no piso e placas suspensas.
   - Do lado delas: balança de plataforma, paleteira e lavatório "LAVE AS MÃOS".
3. **Sala de PREPARO.**
   - Painéis de 3 m, azulejo branco por dentro e **sem teto**.
   - Porta com cortina de PVC.
   - **3 tanques de inox**, cada um com:
     - agitador (motorredutor);
     - boca de carga com a tampa aberta;
     - cintas de camisa, visor de nível, termômetro e placa TANQUE 01/02/03;
     - válvula de fundo.
   - **Plataforma de alimentação** a 2 m com escada e guarda-corpo. É dali que o jogador despeja o saco na boca de carga.
   - Coletor, bomba sanitária e linha que sobe e segue até a bomba de alta pressão do secador.
4. **SECADOR spray, do chão ao telhado.**
   - Câmara de inox com 4,6 m de diâmetro e cone.
   - Válvula rotativa na saída e distribuidor de ar com atomizador no topo.
   - Visores iluminados em 5,6 m e 9 m.
   - **Plataforma de inspeção a 4,2 m**, em volta da câmara (guarda-corpo dos dois lados).
   - **Plataforma do topo a 8,6 m.**
   - 2 escadas, com degraus de 19–20 cm (o jogo sobe no máximo 26 cm por passo).
   - Em volta:
     - aquecedor de ar com queimador;
     - duto de ar quente isolado até o topo;
     - ciclone com exaustor e chaminé saindo pelo telhado;
     - bomba de alta pressão.
5. **ENSAQUE.**
   - Sala com tetinho, interligada ao secador pela tubulação de produto, que passa por cima do teto e desce na moega.
   - Ensacadeira:
     - moega e bico com garras;
     - balança;
     - painel e coluna luminosa;
     - esteira até a porta;
     - costuradeira e fardo de sacos vazios.
6. **Produto acabado.** 5 vagas de palete na saída do ensaque, junto da baia do caminhão.
7. **SALA DE CONTROLE.**
   - Console com 3 monitores (telas de tanques, secador e alarmes) e cadeira.
   - Painéis de comando com tela da ensacadeira, botoeiras, sinaleiros e emergência.
   - Janelão para o secador e janelas para o preparo e para o corredor.
   - Forro com luminárias e ar-condicionado.
8. **Utilidades.** Quadros elétricos (QGBT) com eletrocalha, compressor de ar, bancada de manutenção, hidrante, 8 extintores com placa e 16 luminárias industriais.

**Corredor de 1,6 m entre a sala de controle e o ensaque.** É o caminho para a área do secador e das utilidades. Sem ele, a fileira de salas fechava a metade norte do galpão.

## Jogabilidade (conferida)
- **Colisão:** 164 caixas novas. Pisos elevados, degraus e plataformas usam `COL_Cid_Plataforma`, que o jogo trata como piso e sólido.
- **Auditoria de caminhada** (`62a` + `62b`, que simulam o `world.ts`): 0 armadilhas. Tudo é alcançável a pé a partir do spawn do bar:
  - baia, salas e corredor;
  - plataforma do preparo (2 m);
  - patamar e plataforma de 4,2 m;
  - escada 2 e plataforma de 8,6 m;
  - utilidades;
  - pátio.
- **Avisos da auditoria no lote:** o único é "área sob teto alcançável", que é o próprio interior. Agora é proposital.
- **Caminhão:** o piso do lote e do galpão é `COL_Cid_Quadra`, onde veículo anda. A entrada (calçada → portão de 9 m → portão de enrolar de 5 m) está livre e alinhada.

## Marcadores para a programação do jogo (`Ponto_EB_*`, 34)
| Marcador | Para quê |
|---|---|
| `Ponto_EB_Portao`, `Ponto_EB_Doca`, `Ponto_EB_Entrada_Pessoal` | Entrada de veículos, vaga do caminhão na baia, porta de pedestre |
| `Ponto_EB_MP_Malte_1..4`, `Ponto_EB_MP_Mix_1..4`, `Ponto_EB_PA_1..5` | Centro de cada palete, na altura do piso do palete. Têm `tipo` e `capacidade` (18) nos extras |
| `Ponto_EB_Tanque_1..3` e `Ponto_EB_Tanque_N_Operador` | Boca de carga de cada tanque e onde o jogador fica na plataforma |
| `Ponto_EB_Painel` | Console da sala de controle |
| `Ponto_EB_Ensaque`, `_Bico`, `_Saida` | Operador da ensacadeira, bico de enchimento, fim da esteira |
| `Ponto_EB_Secador_Inspecao_N/S/L/O`, `_Topo`, `_Base`, `Ponto_EB_Bomba_Alta_Pressao`, `Ponto_EB_Balanca` | Pontos de inspeção e manutenção |

## Estoque dinâmico
O mapa leva só os paletes vazios. Os sacos ficam fora do mapa, para o estoque ser de verdade.

**Arquivos:** `exportacao_jogo/v5.6_2026-11-10/empresa_brasil/`
- **`empresa_brasil_estoque.glb`** (205 KB):
  - um saco de 25 kg de cada tipo: `EB_Saco_Malte`, `EB_Saco_Mix`, `EB_Saco_Produto`;
  - o arranjo do palete, `EB_Palete_Arranjo` → `EB_Arranjo_01..18`: 3 sacos por camada × 6 camadas.
- **`empresa_brasil_estoque.json`:** as 13 vagas, com marcador, tipo, capacidade e posição em coordenadas do jogo.

**Como o jogo usa:** para mostrar N sacos numa vaga, instancia o saco do tipo nas N primeiras posições do arranjo. O saco carregado na mão é o mesmo protótipo.

No Blender, a coleção `EB_Empresa_Brasil_ESTOQUE` mostra os paletes cheios, só como prévia (não é exportada com a cidade).

## Texturas (512 px)
Ficam em `texturas_512/empresa_brasil/`, com nome único (`eb_*`).

- **Da Poliigon:** piso de concreto, pátio, reboco, metal pintado (só normal), galvanizado e madeira do palete.
- **Desenhadas pelo 81a:**
  - grade das plataformas;
  - inox escovado;
  - azulejo branco 15 × 15;
  - paleta de cores chapadas, que junta tintas e LEDs num material só e num emissivo.
- **Atlas de placas e rótulos:** 1024 px, porque tem texto (letreiro, placas de setor e de segurança, rótulos dos sacos, telas do painel). Na qualidade baixa o jogo reduz para 512.

## Custo (setor S07_04)
| | v5.5 | v5.6 |
|---|---|---|
| Triângulos (estático + instâncias) | 18,7 mil | 52,9 mil (o maior setor da cidade tem 68,7 mil) |
| Primitivas (chamadas de desenho) | 40 | 69 (o maior setor já tinha 70) |
| Materiais | 33 | 56 (a fábrica usa 23; a paleta tirou 15) |
| Visual / colisão | 1,0 / 0,09 MB | 2,4 / 0,13 MB |

Paletes, luminárias, balizadores e extintores saem como instâncias de GPU.

A checagem de importação do jogo (`prepareCity`) aceita o export:
- 64 setores;
- 7.596 colisores;
- 53 texturas, nenhuma sem uso;
- 73 marcadores.

## O que NÃO foi feito
- **Lógica de jogo:** ainda não existe no jogo:
  - pegar e carregar o saco;
  - despejar no tanque;
  - preparar, secar e ensacar;
  - controlar o estoque;
  - carregar e descarregar o caminhão.

  O mapa e as peças estão prontos para isso: marcadores, vagas, arranjo e saco.
- **Publicação:** nada foi publicado na VM nem testado no jogo.
- **Colisão dos sacos:** vem pelo jogo. Os paletes de estoque não têm colisor de pilha, porque a altura depende do estoque. O `movePlayer` do jogo já aceita obstáculos dinâmicos.
- **`tests/integration/city.test.ts`:** fixa números da cidade que já estavam velhos antes desta versão: 40 texturas, 2.720 silhuetas e 5.650 caixas. Precisa ser atualizado ao importar. Agora são 53 texturas, 0 silhuetas e o total novo de caixas.

## Scripts (`C:\Users\rafael\BarBoteco\scripts`)
- **`81a_texturas_empresa.py`** (Python do sistema): texturas, atlas e paleta.
- **`81_empresa_brasil.py`** (Blender): limpa o lote antigo uma vez e constrói tudo. É idempotente. Medidas e posições ficam nas constantes do topo de cada parte.
- **`81b_estoque_export.py`** (Blender): GLB e JSON do estoque.
- **`28_cidade_export.py`:** agora lê as subcoleções do setor (`all_objects`). A fábrica fica em `EB_Empresa_Brasil_VISUAL/COLISAO/MARCADORES`, dentro das coleções do S07_04.
