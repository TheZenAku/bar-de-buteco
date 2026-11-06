# Sons do voo

Dois sons de bancos abertos, sob **CC0** (domínio público: sem crédito obrigatório, uso comercial livre). Ficam em `assets-bar/sounds/voo` (originais) e `apps/web/public/voo` (o que o site serve, copiados sem conversão: o navegador decodifica OGG e FLAC).

| Som no jogo | Arquivo | Pacote | Autor | Licença |
| --- | --- | --- | --- | --- |
| O vento do voo (em laço) | `vento-loop.ogg` | [wind whoosh loop](https://opengameart.org/content/wind-whoosh-loop) | SketchMan3 | CC0 |
| O estrondo da barreira do som | `estrondo.flac` | [synthesized explosion](https://opengameart.org/content/synthesized-explosion) | qubodup (Iwan Gabovitch) | CC0 |

O corte de ar que sobe junto do estrondo é o `ar-longo` dos golpes ([sons-golpes.md](sons-golpes.md)), tocado a 55% da velocidade.

Testado e descartado: o vento de 1 min 30 s do [BigSoundBank (nº 0595, CC0)](https://bigsoundbank.com/wind_s0595.html), 8,5 MB em WAV, grande demais para baixar por jogador.

**Escolhido pela descrição das páginas, sem ouvir.** Eu não escuto áudio: o estrondo toca a 72% da velocidade (mais grave) e o vento sobe de 85% a 135% da velocidade com o filtro abrindo de 0,5 a 7 kHz. Se algum não soar bem, troque o arquivo em `apps/web/public/voo` e o nome em `CLIPS` (`apps/web/src/engine/fly-sound.ts`).
