# Som ambiente

A cidade tem som de cidade: o ruído de fundo muda com a **hora do dia**, o **clima**, o **bairro**, a **distância das ruas** e se você está **debaixo de um teto**, e de vez em quando acontece alguma coisa ao longe (um cachorro, uma moto, uma sirene). É o desenho que jogos como GTA V usam: camadas contínuas de gravações reais, mais sons pontuais sorteados e colocados no mundo. Tudo é local a cada jogador, tocado no navegador, sem serviço externo, e todas as gravações são **CC0** (domínio público; a lista com autor e página de cada uma está em `assets-bar/sound/cidade/fontes.json`).

Antes havia seis gravações longas tocadas em sequência. Cada uma trazia seus próprios latidos, buzinas e sinos, na mesma ordem: o jogador logo reconhecia e enjoava. Agora nenhuma gravação carrega eventos: o fundo é uniforme e os eventos são sorteados à parte.

## Camadas (`camas`)

São 16 gravações de 36 a 48 s, mono, sem eventos marcantes (o trecho de cada uma foi escolhido medindo a variação de volume segundo a segundo). Tocam em laço sem emenda: o fim é fundido no começo (4 s, potência constante), feito na hora a partir do arquivo, que continua sendo uma gravação comum. Cada camada toca em **duas fontes** que partem de pontos diferentes da gravação e ficam em lados opostos, o que a espalha pela largura do estéreo, e seu volume oscila devagar (períodos de 41 a 127 s, diferentes entre camadas) para que a soma nunca se repita do mesmo jeito.

| Camada | Quando e onde |
| --- | --- |
| `dia-a`, `dia-b` | Trânsito distante de bairro, de dia; mais no Centro |
| `noite-a`, `noite-b` | Zumbido da cidade à noite |
| `via` | Rugido constante, perto de avenidas |
| `fluxo` | Carros passando, mais à noite, perto das vias |
| `grilos-a`, `grilos-b` | Noite; mais no parque e no Jardim Conceição; calam na chuva |
| `cigarras-a`, `cigarras-b` | Calor do meio-dia (a) e fim de tarde (b); no verde; calam na chuva |
| `sapos` | Noite no Parque Olaria; cantam mais com chuva |
| `passaros-a`, `passaros-b` | Coro do amanhecer (a) e dia (b); no verde; calam na chuva e na tempestade |
| `vento` | Segue o vento do clima |
| `industria` | Zumbido de fábrica, só no Distrito Industrial |
| `salao` | Som de ambiente fechado, só sob teto |

Quanto vale cada camada vem de `worldOf` (`apps/web/src/city-ambience/model.ts`): a hora do jogo (`dawn`, `midday`, `dusk`, `night`), os traços do bairro (`cityZone`: Centro urbano, Parque Olaria verde, Jardim Conceição residencial, Distrito Industrial industrial; o chão sem nome em volta do bar fica no meio-termo) e a **rua mais próxima** (grafo de `cidade_vias.json`: avenida e centro são movimentadas, rua local quase não, e o ruído some a 90 m do meio-fio). Mudar de bairro, de hora ou de clima leva a mistura de uma camada à outra em alguns segundos (constante de tempo de 2,5 s), sem corte. Só ficam na memória as camadas que alguém precisa: uma camada que não é chamada por 90 s é descartada.

## Sons pontuais (`pontos`)

36 gravações em 14 tipos (cães, galos, buzinas, motos, carros, ônibus, sirenes, crianças, aves, urutau, avião, sinos, obra, campainha de bicicleta). Cada tipo tem seu próprio relógio, com intervalo sorteado e **esticado quando o lugar não combina** (metade do peso, o dobro da espera): poucos cães no meio do Centro de dia, muitos carros numa avenida, galo só de manhã, crianças só de dia e longe de tempestade, obra só em horário de trabalho. Regras em `SPOTS`.

- **Nunca a mesma gravação duas vezes seguidas** no mesmo tipo, e nenhum som começa a menos de 3 s do anterior; no máximo 5 ao mesmo tempo.
- **Fatias.** As gravações longas têm os trechos com atividade (um latido, uma sirene subindo) marcados na importação. Cada vez toca uma fatia sorteada de um trecho, com entrada e saída suaves, e não a gravação inteira. 36 arquivos rendem muito mais que 36 sons.
- **Colocados no mundo.** Cada som sai de um ponto em torno do jogador, à distância que sua regra permite. Cães, aves e sirenes vêm de qualquer direção; buzinas, motos, carros e ônibus saem de **uma rua real** perto o bastante, em proporção ao movimento dela, e **atravessam** a rua enquanto tocam. O lado (pan) acompanha para onde a câmera olha, e muda se você gira. Mais longe é mais baixo e mais abafado (passa-baixas que fecha com a distância).
- **Resposta.** Um latido pode ser respondido por outro, de outra direção, alguns segundos depois; o mesmo vale para galos.
- **Chuva e tempestade** silenciam o que um tempo assim cala (crianças, aves, avião), por tipo (`rainMute`). A chuva em si segue sendo o som procedural de `weather-sound.ts`.

## Dentro e fora

A cena (`BarScene.ambienceProbe`) informa quatro vezes por segundo onde o jogador está, para onde a câmera olha, a hora, a escuridão e o clima. Com teto por cima (o mesmo teste da chuva), ela lança oito raios de 7 m na altura do peito e mede o quanto o lugar é **fechado**, de 0 (ao ar livre) a 1 (salão fechado); a varanda fica no meio. Quanto mais fechado, mais o conjunto da rua passa por um filtro que fecha (de 15,5 kHz a 950 Hz) e perde nível, as camadas de rua caem a cerca de um quarto e entra o `salao`. O movimento é gradual, em meio segundo.

## Mixagem e controles

- Barramento ambiente com ganho máximo **0,5** (`AMBIENT_MIX.gain`), multiplicado por **Geral × Som ambiente** nas configurações. Medido no jogo, o fundo fica perto de −38 dBFS de dia no Centro e −39 dBFS à noite, o mesmo nível de antes; os sons pontuais passam 2 a 5 dB acima do fundo (`SPOT_LEVEL`).
- Filtro passa-altas em 65 Hz. O ambiente cai suavemente para **30%** enquanto há uma seleção na jukebox ou TV, inclusive pausada, e volta ao desligar.
- O botão de som do topo liga e desliga ambiente e jukebox; a preferência fica salva no navegador. O chat de voz mantém controles independentes.
- Esconder a aba pausa tudo; voltar retoma. Sair do bar ou perder a conexão silencia e libera todas as camadas e sons; a reconexão retoma.
- O clique para entrar libera o áudio conforme a política do navegador; se ainda bloquear, tenta de novo na próxima interação. Um arquivo que falha é marcado e não é pedido de novo; se nenhum carregar, o ambiente fica em silêncio e não impede jogar.

### Memória e processamento

O contexto de áudio do ambiente roda a **32 kHz** (nada acima de 16 kHz é guardado; se o navegador recusar a taxa, usa a do aparelho). Áudio decodificado custa cerca de 128 kB por segundo em mono: uma camada de 48 s ocupa ~6 MB, e de dia ficam carregadas umas sete (~40 MB). Os sons pontuais ficam num cache que descarta o menos usado acima de **24 MB** (cerca de três minutos de gravações). Os 52 arquivos somam ~13 MB de AAC mono a 64 kbit/s.

## Arquivos

- `apps/web/src/city-ambience/model.ts`: o que decide tudo e não toca em áudio: `worldOf`, `BEDS`, `SPOTS`, `SpotScheduler`, distância, pan, laço sem emenda.
- `apps/web/src/city-ambience/engine.ts`: toca o modelo em Web Audio (`CityAmbience`).
- `apps/web/src/audio.ts`: dono do dispositivo, do volume geral e das regras do navegador (`BarAudio`); `ambient-mix.ts` tem o ganho do conjunto.
- `assets-bar/sound/cidade/`: `catalogo.json` (o que é cada camada e som e de que recorte), `fontes/` (originais) e `fontes.json` (autor, licença e página).
- `tools/assets/import-city-sounds.mjs` e `apps/web/src/assets/city-sounds.json` (o catálogo que o jogo lê, com duração, trechos e créditos).

## Trocar ou acrescentar sons

1. Ponha o original em `assets-bar/sound/cidade/fontes/<id do Freesound>.ogg` e acrescente a ficha em `fontes.json` (só entra **CC0**: o importador recusa o resto).
2. Em `catalogo.json`, acrescente a camada (`inicio` e `duracao` em segundos) ou o ponto (`modo`: `inteiro` ou `eventos`; `duracao` limita um original longo; `ajuste` em dB corrige um som baixo demais ou alto demais).
3. Acrescente o id às regras em `model.ts` (`BEDS` ou o `sounds` de um tipo em `SPOTS`), onde também ficam peso, intervalo, distância e ganho.
4. Com FFmpeg:

```powershell
npm run assets:cidade-sons -- "C:\caminho\ffmpeg.exe"
```

(`FFMPEG_PATH` também serve.) O importador recorta, aplica passa-altas em 55 Hz, normaliza em duas passagens (camadas −26 LUFS, pontos −23 LUFS), grava AAC mono e refaz só o que mudou. **O FFmpeg de `.local/ambient-tools` está corrompido** (fecha com falha de segmentação, provável efeito da queda de energia de 08/11); a primeira importação usou o pacote `ffmpeg-static` instalado fora do projeto.

## Validação

`tests/integration/city-ambience.test.ts` (sem navegador): todo id citado nas regras existe e é CC0, com arquivo, trechos dentro da duração; laço de potência constante e sem degrau; camadas por bairro, hora, chuva, vento e teto; ruído de rua só perto das vias; distância e pan; o agendador (espaçamento, variedade, nunca o mesmo som em seguida, galo de manhã, nada de crianças à noite, tempestade, carros só em via, determinismo por semente); a detecção de trechos da importação. `tests/integration/graphics-grain.test.ts` cobre a opção de granulação.

`tests/e2e/ambient.spec.ts` (precisa de navegador): decodifica de verdade todo AAC publicado; hora, teto e clima movem as camadas; sons pontuais nascem e terminam; redução para jukebox; aba oculta; preferência de mudo; arquivo ausente sem laço de requisições; autoplay barrado; e, no jogo, a sonda da cena, as configurações dentro do jogo e o silêncio ao voltar à entrada.

Em desenvolvimento, `barDebug.ambient()` mostra o estado (mundo, camadas com alvo, ganho e se estão carregadas, sons tocando, quantos de cada tipo já tocaram, falhas) e `barDebug.ambientTrigger('cao')` toca um tipo na hora para ouvir (`cao`, `galo`, `buzina`, `moto`, `carro`, `onibus`, `sirene`, `criancas`, `passaro`, `urutau`, `aviao`, `sino`, `martelo`, `campainha`).

## O que não foi verificado

As gravações foram escolhidas pela descrição de quem as publicou e por medições (uniformidade do volume, atividade, nível), **não ouvidas**. Os níveis relativos (`level` de cada camada, `gain` e `every` de cada tipo, `SPOT_LEVEL`) são um primeiro ajuste por números e precisam de ouvido: tudo isso está nas tabelas de `model.ts`. O som de sirene é de gravações norte-americanas e europeias, não brasileiras, e não há gravação livre de buzina de ônibus, vendedor ambulante nem carro de som.
