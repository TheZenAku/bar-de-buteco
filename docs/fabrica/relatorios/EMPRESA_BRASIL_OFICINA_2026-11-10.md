# Fábrica EMPRESA BRASIL — oficina, extintores e hidrante (4ª rodada, 10/11/2026)

Arquivo: `Mapa_Highland_v5.9_Empresa_Brasil_Oficina.blend`. A v5.8 foi para `versoes_antigas`.
Export: `exportacao_jogo/v5.9_2026-11-10/`.

## Refeito
- **Bancada de oficina** (parede oeste, fundo do galpão):
  - estrutura de tubo 50 × 50 com sapatas de borracha, travessas e prateleira de baixo;
  - tampo de madeira com cantoneira e gaveteiro de 3 gavetas com puxador e etiqueta;
  - luminária sobre o painel.
- **Painel perfurado:** chapa com furos e a silhueta de cada ferramenta pintada. As ferramentas 3D ficam penduradas em ganchos no lugar da silhueta:
  - 3 martelos;
  - 8 chaves combinadas;
  - 7 chaves de fenda coloridas;
  - 3 alicates;
  - 3 chaves inglesas;
  - arco de serra e trena.
- **Sobre a bancada:**
  - morsa com base giratória, mordentes com chapa xadrez, guias, fuso e manípulo com esferas;
  - caixa de ferramentas sanfonada com alça e fechos;
  - furadeira a bateria, almotolia, gaveteiro de peças (18 gavetinhas) e estopa;
  - luminária articulada presa na borda.
- **Prateleira de baixo:** caixa plástica vazada com rolamentos, motor de reserva, balde com alça.
- **Extintores** (8, no padrão brasileiro):
  - **Montagem:** presos na parede com suporte, topo a 1,60 m, e a placa "EXTINTOR" fotoluminescente na parede logo acima. Antes a placa ficava solta no ar.
  - **Detalhes:**
    - cilindro com base plástica;
    - válvula de latão com gatilho, alça, pino e lacre;
    - manômetro, mangueira com difusor;
    - rótulo "PÓ QUÍMICO ABC 6 kg" com instruções.
  - **Piso:** demarcação vermelha com borda amarela embaixo de cada um.
- **Hidrante:**
  - abrigo com moldura e porta de vidro "INCÊNDIO", fecho;
  - mangueira aduchada, esguicho e registro angular com volante;
  - placa "HIDRANTE" e demarcação no piso.
- **Ralo linear do preparo:** a faixa lisa virou um ralo sanitário de verdade, com grelha de inox com fendas em gomos de 0,5 m, moldura e caixa sifonada na ponta (`ralo_linear` no 81p).
- **Textura nova:** `eb_oficina.png` (painel, placas e rótulos), gerada pelo `81d_oficina_texturas.py`.

## Conferido
- **Visual:** bancada, painel, extintor, hidrante e piso olhados de perto.
- **Caminhada:** 0 armadilhas, todas as zonas da fábrica alcançáveis.
- **Importação do jogo:** aceita. 64 setores, 7.612 colisores, 60 texturas sem nenhuma sobrando, 87 marcadores.

## Custo do setor S07_04
- **Triângulos:** 186 mil (139 mil estáticos e 47 mil em instâncias).
- **Chamadas de desenho:** 82.
- **Visual:** 7,7 MB.

## Ainda não feito
- Não foi publicado na VM nem testado no jogo.
- A lógica da fábrica não existe no jogo.

## Ordem dos scripts
`81a` → `81c` → `81d` → `81` → `81b` → `28` (`SO_SETORES={"S07_04"}`) → `68` → validar.
