# Sons dos golpes

São os sons dos [chutes do Rafael](../sistemas/perfil.md#o-chute-que-acerta) e de um corpo caindo, inclusive depois de uma batida de moto. Todos são gravações reais de bancos de som abertos, sob a licença **CC0** (domínio público), que dispensa crédito e permite uso comercial. O crédito fica aqui mesmo assim.

| Som no jogo | Arquivos | Pacote | Autor | Licença |
| --- | --- | --- | --- | --- |
| A perna cortando o ar: `ar-1`, `ar-2`, `ar-3`, `ar-longo` | `swosh-15`, `20`, `22`, `29` | [Swish - bamboo stick weapon swhoshes](https://opengameart.org/content/swish-bamboo-stick-weapon-swhoshes) | qubodup (Iwan Gabovitch) | CC0 |
| O pé acertando: `chute-1` a `chute-4` e `chute-peso` | `hit15`, `hit11`, `hit23`, `hit10`, `hit34` | [37 hits/punches](https://opengameart.org/content/37-hitspunches) | Independent.nu, enviado por qubodup | CC0 |
| O corpo no chão: `queda-1` a `queda-4` | `wet_towel_on_floor-03`, `07`, `08`, `10` | [12 wet towel hitting/falling/punching floor sounds](https://opengameart.org/content/12-wet-towel-hittingfallingpunching-floor-sounds) | qubodup (Iwan Gabovitch) | CC0 |

O arquivo de texto dentro do pacote da toalha cita outras licenças. A página do pacote informa que ele também está sob CC0 desde 24/08/2024 e manda ignorar esse texto.

## Como são publicados

As gravações escolhidas ficam em `assets-bar/sounds/golpes`. O comando `npm run assets:kick:sound` (`tools/assets/import-kick-sounds.mjs`) gera os clipes em `apps/web/public/kick/sound`, em WAV mono de 32 kHz, 264 kB ao todo:

- O silêncio do começo sai, para o som tocar na hora do golpe, e não depois.
- O fim é cortado quando o som morre, antes do ruído da sala.
- O pico é igualado entre os clipes.

## Como foram escolhidos

**A escolha foi feita por medição, sem ouvir.** Eu não tenho como escutar áudio, então comparei ataque, decaimento e espectro de todas as gravações dos pacotes:

- **Ar:** curtos, com a energia entre 200 e 800 Hz. O `ar-longo` sobe por cerca de 300 ms, acompanhando os dois pés subindo no chute voador.
- **Chute:** ataque de até 20 ms, com grave e algum estalo acima de 3 kHz, para reconhecer a pancada também de longe.
- **Peso:** a maior parte abaixo de 200 Hz. Entra junto com o chute no golpe voador.
- **Queda:** tocada mais devagar quanto mais forte o corpo bate (de 92% a 68% da velocidade), porque a gravação é de uma toalha molhada, mais leve que um corpo.

Se algum não soar bem, troque o arquivo na tabela `CLIPS` do importador e rode o comando de novo.

## Como tocam

`apps/web/src/engine/blow-sound.ts`. Cada som vem de onde o golpe acontece, com o volume geral do jogador. Nada disso passa pela sala: cada navegador toca o que está desenhando.

| Quando | Som | Volume |
| --- | --- | --- |
| A perna sai, acertando ou não | Um de `ar-*`, ou `ar-longo` no chute voador | Fixo |
| O pé acerta | Um de `chute-*`, com `chute-peso` por baixo no chute voador | Fixo |
| O tronco ou a cabeça batem em algo a partir de 1,2 m/s | Um de `queda-*` | Cresce com a força da batida |

O mesmo som nunca toca duas vezes seguidas, e a velocidade varia um pouco a cada vez. Até 45 m de distância ele é ouvido; além disso, não toca.
