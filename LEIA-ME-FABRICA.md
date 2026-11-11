# Pacote da Fábrica (EMPRESA BRASIL) — v6.0, 10/11/2026

Os arquivos já estão nas pastas do repositório. Extraia **na raiz** de `bar-de-buteco` (Z:\bar-de-buteco) e confirme "substituir".

- `assets-bar/map/BarBoteco/export/cidade/` — cidade com a fábrica (setor S07_04)
- `assets-bar/map/BarBoteco/export/bar_boteco*.glb`, `bar_env.png` — bar
- `assets-bar/map/BarBoteco/export/empresa_brasil/` — sacos, tanques, 25 vagas e os 48 marcadores `Ponto_EB_*`
- `assets-bar/map/BarBoteco/scripts/` — scripts do Blender (28, 68, 81*), só referência
- `assets-bar/map/BarBoteco/texturas/empresa_brasil/` — texturas da fábrica, só referência
- `docs/fabrica/relatorios/` — relatórios da fábrica
- `PROMPT_CODEX_FABRICA.md` — cole no Codex

Depois: `npm run assets:map`. Esperado: 64 setores, 7612 colisores, 60 texturas, 87 marcadores, 0 silhuetas.
Ajuste `tests/integration/city.test.ts` (silhuetas 2720 → 0, texturas → 60).
Não testado no jogo, nada publicado.
