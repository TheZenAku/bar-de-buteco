# Export v6.7 do mapa (12/11/2026) — já está no lugar

Esta pasta (`assets-bar/map/BarBoteco/export/`) já tem o mapa inteiro reexportado do Blender (`Mapa_Highland_v6.7_Correcoes_EB.blend`):

| Pasta | O que é |
|---|---|
| `cidade/` | 64 setores reexportados (visual + LOD + colisão), anel, distante, texturas, `cidade_setores.json`. Pós-processo: 68 (limpeza), 82 (z-fighting, todos os setores até 0), 83 (oclusão de contato na fábrica S07_04). Luzes dos postes (173) já vêm do .blend. |
| `empresa_brasil/` | estoque (sacos novos), tanques, `empresa_brasil_marcadores.json` (48), **novos** `empresa_brasil_portoes.glb` + `empresa_brasil_portoes.json` |
| `farm_armas/` | `farm_armas_dinamicos.glb` + `farm_armas_portas.json` reexportados |
| `bar_boteco*.glb`, `bar_env.png` | **não mudaram** (o bar não foi editado; o GLB publicado tem correções feitas depois do export que uma reexportação desfaria) |
| `anterior_2026-11-12/cidade/` | a `cidade/` que estava aqui antes (a cópia das 13:25, só com S07_00/S07_04 novos) |

`empresa_brasil/` e `farm_armas/`: os arquivos que já estavam aqui (copiados às 13:25) são **idênticos byte a byte** ao export completo, então não foram trocados.
Às 14:20 a `cidade/` foi trocada pela reexportação completa (todos os 64 setores do .blend, com o 82 aplicado em todos). Para o jogo ver isso, é preciso rodar o import-city de novo.

O que mudou no mapa: ver `PROMPT_CLAUDE_VM_v6.7.md` (mesma pasta).
