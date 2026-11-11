# Fábrica EMPRESA BRASIL — texturas, mesa de controle e pisos (3ª rodada, 10/11/2026)

Arquivo: `Mapa_Highland_v5.8_Empresa_Brasil_Texturas.blend`. A v5.7 foi para `versoes_antigas`.
Export: `exportacao_jogo/v5.8_2026-11-10/`.

## Corrigido
- **Monitores voando:** os monitores estavam 16,5 cm acima do tampo, por um erro de altura no script. Agora a base apoia no tampo.
- **Mesa de controle:**
  - **Monitor:** moldura com vidro rebaixado e queixo, carcaça traseira com ventilação, articulação, braço e base oval.
  - **Teclado:** corpo inclinado com pés, cerca de 100 teclas individuais (inclusive numérico e setas), LEDs e cabo.
  - **Mouse:** arredondado, com roda e divisão dos botões.
  - **Telefone IP:** corpo inclinado, teclas e display próprio ("RAMAL 201"), monofone no gancho e fio espiral.
  - **Prancheta:** prendedor de metal, caneta e folha de checklist de turno.
  - **Console:** portas com puxador e grelha, tampo com borda arredondada.
- **Cadeira:** base de 5 patas afiladas com rodízios duplos, pistão cromado, mecanismo com alavanca, assento e encosto estofados (tecido Poliigon), suporte do encosto e braços curvos com apoio.
- **Texturas da Poliigon em todos os equipamentos:**
  - **Problema:** a cor chapada da paleta era uma cor lisa sem textura.
  - **Agora:** a paleta é um **atlas 1024** de 64 células. Cada cor leva a textura da Poliigon do tipo de superfície, tingida, e um **mapa de normal** na mesma posição:
    - metal pintado: MetalPaintedMatte;
    - plástico: PlasticMoldWorn;
    - plástico jateado e borracha: PlasticMoldDryBlast;
    - tecido: BoucleFabricBubbly;
    - papel e ráfia: FabricPlainNaturalSheer;
    - latão, cobre e alumínio: MetalGalvanizedSteelWorn.
  - **Como as faces usam o atlas:** cada face é projetada dentro da sua célula (0,5 m por célula, com a fase do mundo mantida).
  - **Custo:** continua 1 material (+1 emissivo para LEDs). Não aumentou chamadas de desenho por cor.
- **Outros materiais:**
  - **Isopainel:** sai da cor lisa para a textura do metal pintado da Poliigon, clareada, com normal.
  - **Azulejo:** sai o azulejo desenhado à mão para o **TilesCeramicWhite** da Poliigon, clareado para branco de indústria, com rejunte e normal.
- **Piso de epóxi branco** no preparo, na sala de controle e no ensaque, com rodapé sanitário chanfrado nas paredes:
  - textura do ConcreteFloorPoured da Poliigon clareada;
  - brilho alto (rugosidade 0,16);
  - normal do concreto.
- Todas as texturas continuam em **512 px**. Só o atlas da paleta, o atlas de placas e as telas ficam em 1024, porque são atlas.

## Conferido
- **Visual:** mesa, telefone, cadeira, preparo, quadros e ensaque olhados de perto.
- **Colisão:** os colisores não mudaram (229 no setor), então a auditoria de caminhada da 2ª rodada continua valendo.
- **Importação do jogo:** aceita. 64 setores, 7.603 colisores, 59 texturas sem nenhuma sobrando, 87 marcadores.

## Custo do setor S07_04
- **Triângulos:** 159 mil (125 mil estáticos e 34 mil em instâncias).
- **Chamadas de desenho:** 77.
- **Visual:** 6,9 MB. Eram 4,9 MB; as UVs por face no atlas separam vértices.
- **Comparação:** continua o setor mais pesado da cidade.

## Ainda não feito
- Não foi publicado na VM nem testado no jogo.
- A lógica da fábrica não existe no jogo.
