# Export v7.1 — mapa inteiro (14/11/2026, ~01:00)

Origem: estado atual do Blender (cópia `Desktop\BAR\2.0\map\Mapa_Highland_v7.1_Export_Completo.blend`), cena da cidade.
Gerado pelo `95z_exportar.py` com SETORES=ALL e FARM=1 (via `rodar_na_cena.py`), depois `68_limpar_export.py` e `82_zfight_setor.py --aplicar` até zerar em todos os setores com malha. Sem o 83 no S07_04, porque a AO assada do 95d substitui ele. O 85 não teve nada a tirar.

| Pasta | Conteúdo |
|---|---|
| `cidade/` | 64 setores (+ LOD e colisão), anel, distante, 103 texturas, manifesto `cidade_setores.json`. Lotes/vias/iFood/validação/relatório mantidos (vêm dos scripts de construção, não do export). |
| `empresa_brasil/` | estoque, tanques, portões, carrinho, 48 marcadores (+4 em `empresa_brasil_portoes.json` > marcadores_novos) |
| `farm_armas/` | `farm_armas_dinamicos.glb` + `farm_armas_portas.json` (`placeholders/` não foi mexida) |
| `anterior_2026-11-13/` | backup do que estava aqui antes |

O que mudou de fato em relação ao publicado (comparação byte a byte e por JSON):
- **S07_00 (Farm):** `INST_P_FA_Estante_A` e `_B` saíram e entrou `INST_P_FA_Rack_Barras` (−15.908 triângulos); colisão do setor refeita.
- **farm_armas_portas.json:** uma caixa de colisão dinâmica com x/z deslocados 0,3 a 0,6 m (321,9→321,6 e 325,7→326,3).
- **empresa_brasil_carrinho.json/.glb:** caixa do carrinho com diferença de 1 a 2 cm.
- Os outros 63 setores têm `.bin` idênticos aos publicados. Os `.gltf` só mudaram de formatação (o conteúdo do JSON é igual).
- AO da Farm (`fa_ao_*.png`): ficaram as reassadas em 13/11 que já estavam publicadas. O .blend ainda guarda as antigas.

O bar (`bar_boteco*.glb`) não foi reexportado: o GLB publicado tem correções feitas depois do export, e uma reexportação apagaria essas correções.
