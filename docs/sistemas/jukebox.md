# Jukebox e TVs

A jukebox e as TVs são **sistemas independentes**. Cada um tem seu próprio objeto no cenário, sua janela de controle, seu link (de qualquer [plataforma aceita](#plataformas)), seu estado compartilhado, suas mensagens de rede, seus players e seu volume. Tocar, pausar, parar ou desligar um nunca altera o outro, e cada um funciona mesmo que o outro nunca tenha sido usado.

| | Jukebox | TVs |
| --- | --- | --- |
| Objeto | O modelo do próprio mapa (`Jukebox`, de `12_jukebox.py`), encostado na base da escada do térreo e virado para o salão, em `(15.7, 0.3, -11.29)` | Dois grupos: **TVs do salão** (salão, parede lateral e balcão) e **TV do andar de cima** |
| Interação | Encostar na frente da jukebox e apertar **E** (*Tocar a jukebox*) | Ficar no chão diante de qualquer tela do grupo e apertar **E** (*Usar a TV…*) |
| Imagem | O vídeo não aparece; os tubos da jukebox acendem com as cores dele (veja *Luzes da jukebox*) | Sempre na **tela física da TV**, com perspectiva. As três TVs do salão mostram o mesmo vídeo |
| Som | Pela distância até a jukebox (cheio até 5 m, mudo a partir de 20 m) | Pela distância até a TV do grupo mais próxima (cheio até 3 m, mudo a partir de 14 m) |
| Estado na sala | `BarState.jukeboxes` | `BarState.televisions`: `tv-main` e `tv-upstairs` |
| Mensagens | `jukebox.command`, `jukebox.ended`, `jukebox.open`, `jukebox.result` | `tv.command`, `tv.ended`, `tv.open`, `tv.result` |
| Volume pessoal | Configurações → *Jukebox* (`bar:jukebox:volume`) | Configurações → *TVs* (`bar:tv:volume`) |

A jukebox vem do mapa: o importador lê o nó `Jukebox` e o volume `COL_Int_Jukebox`, e `JUKEBOX_PLACEMENT` sai deles (`map-data.json` → `jukebox`). A antiga jukebox de caixas, montada no código, foi removida. Mover a jukebox no Blender e rodar `npm run assets:map` move a interação, o som e a colisão juntos.

## Plataformas

O painel aceita links destas plataformas e links diretos. Cada uma toca no player oficial dela, sem download nem proxy, e a fila, a sincronia, o controle e o preço são os mesmos para todas. Dá para misturar plataformas na mesma fila.

| Plataforma | Links aceitos | Som | Onde aparece |
| --- | --- | --- | --- |
| YouTube | `youtube.com/watch`, `youtu.be`, `/shorts/`, `/live/`, `music.youtube.com` | Volume pela distância | Tela da TV |
| Vimeo | `vimeo.com/123`, `vimeo.com/123/hash` (não listado), `player.vimeo.com/video/123` | Volume pela distância | Tela da TV |
| SoundCloud | `soundcloud.com/artista/faixa`, com o `/s-…` de uma faixa privada | Volume pela distância | Capa da faixa na TV |
| Mixcloud | `mixcloud.com/artista/set` | Volume pela distância | Capa do set na TV |
| Spotify | `open.spotify.com/track/…`, `/episode/…`, `spotify:track:…` | **Sem volume:** toca cheio perto da fonte e para longe dela | Capa na TV |
| TikTok | `tiktok.com/@pessoa/video/123` | **Só mudo ou não:** liga perto da fonte e desliga longe dela | Tela da TV |
| Twitch | `twitch.tv/canal` (ao vivo), `twitch.tv/videos/123` | Volume pela distância | **Janela sobre o jogo**, não na TV |
| Link direto | Qualquer `https` público: MP4, WebM, MP3, OGG, WAV, FLAC, playlists HLS (`.m3u8`), rádios (Icecast, Shoutcast), arquivos do Dropbox | Volume pela distância | Tela da TV |

Ao colar o link, o painel diz qual é a plataforma e o que ela não faz. A lógica está em `parseMediaLink` (`packages/shared/src/media-links.ts`), a mesma no navegador e no servidor. `MEDIA_PLATFORMS` diz o que cada plataforma permite.

**Spotify e TikTok não deixam a página definir o volume.** A fonte fica ligada ou desligada conforme a curva de distância passa de 25 % (e desliga abaixo de 15 %, para não piscar na borda). O Spotify nem sequer tem mudo: "mudo" é pausar, e um relógio segue contando para o player voltar no ponto certo e avisar o fim. Quem não está logado no Spotify ouve só a prévia, que dura menos que a música; quando a prévia de quem controla acaba, a fila anda. O TikTok não tem volume, e o Spotify não respeita o volume das configurações além de ligar ou desligar.

**A Twitch só toca com o player inteiro visível.** Ela ignora o comando de tocar se o player estiver coberto (mesmo por um canvas transparente), reduzido ou menor que 400 × 300 px, então não dá para projetá-la na tela da TV. Ela abre numa janela sobre o jogo, com um único player para todas as telas do grupo, e as TVs ficam com a imagem de espera. A janela só aparece para quem está ao alcance do som. Dá para arrastá-la e fechá-la só para si (*Fechar*); *Ativar reprodução neste navegador* a traz de volta. Um canal fora do ar é pulado, com as moedas de volta. A Twitch exige que a página esteja num **domínio com https**: ela lê o `parent` do endereço da página, e abrir o jogo por um IP não funciona. Clipes não têm player controlável.

**Streams sem linha do tempo.** Canal da Twitch, rádio e HLS ao vivo não têm duração nem posição compartilhada: cada navegador entra onde a transmissão está, e o painel mostra *No ao vivo*, sem barra nem avanço. Uma playlist HLS ao vivo cuja duração cresce segue a regra de [lives](#lives).

**O que não entra, e por quê.** A plataforma precisa ter um player que a página consiga tocar, pausar, buscar e silenciar. O link destas é recusado na hora, com o motivo:

- **Dailymotion:** a API exige um Player ID criado numa conta do Dailymotion. Sem ele, o player não responde a comandos. Dá para adicionar quando houver esse ID.
- **Facebook:** o player incorporado só toca mudo. Testado: com som ele nunca começa, e tirar o mudo pausa o vídeo.
- **Instagram, X, Kick, Kwai, Bilibili, Rumble, Google Drive:** o embed não tem API de controle, ou não existe.
- **Apple Music, Deezer, Netflix, Disney+, Max, Prime Video, Globoplay:** exigem login ou DRM, e não deixam a página controlar o player.
- **Links curtos** (`vm.tiktok.com`, `on.soundcloud.com`, `spotify.link`): o painel pede o endereço completo, porque o servidor não segue redirecionamentos de links colados.

**Links diretos: o que muda.** Eles dão a maior liberdade e o maior risco, então vale decidir antes de publicar:

- **Quem está por perto baixa o arquivo do servidor de quem colou o link**, que fica sabendo o IP dessas pessoas. O servidor do jogo nunca abre o link (sem risco de SSRF), e o painel avisa ao colar.
- **Não há moderação nenhuma:** nenhuma plataforma filtra o conteúdo. A administração pode desligar o aparelho, mas só depois que a imagem apareceu.
- **Endereços internos são recusados:** `localhost`, IPs escritos em qualquer forma, `.local`, `.lan` e parecidos, para que um link não faça o navegador de todo mundo bater no roteador ou na própria máquina. Só `https`: uma página segura não abre mídia em `http`.
- Um HLS só toca se o servidor dele responder com CORS (exceto no Safari). Arquivos e rádios não precisam.

**Para desligar plataformas**, use `MEDIA_PROVIDERS` no servidor, com a lista das que ficam: `MEDIA_PROVIDERS=youtube,vimeo,soundcloud,mixcloud,spotify,tiktok,twitch` tira os links diretos. O padrão é todas. O nome de cada uma é a chave de `MEDIA_PLATFORMS`.

## Luzes da jukebox

Desligada, a jukebox fica apagada. Quando alguém põe um vídeo para tocar, os tubos dos arcos e a grade da frente (`Jukebox_FX_Luz`) acendem, e a luz na frente dela (`Jukebox_FX_Ponto_Luz`) pinta o chão e as paredes com a mesma cor. Faixas de cor sobem pelos dois lados dos arcos e se encontram no topo, com "lâmpadas" correndo por elas. Pausada, a jukebox fica com as luzes paradas e fracas. Parada, encerrada ou desligada, ela apaga devagar.

**De onde vêm as cores.** O player é um iframe de outro domínio, e nenhuma página consegue ler os pixels dele. O YouTube publica, porém, imagens do próprio vídeo que podem ser lidas (`i.ytimg.com` responde com CORS): a capa e os quadros em 25 %, 50 % e 75 % da duração. As outras plataformas dão só a capa, que o servidor recebe do oEmbed (`thumb` no estado), então a cor fica a mesma durante toda a faixa. Quando a capa não pode ser lida (Vimeo e Mixcloud, conforme o servidor de imagens) ou não existe (Twitch, TikTok, link direto), a jukebox fica no âmbar original. `apps/web/src/engine/video-palette.ts` tira as três cores mais vivas de cada imagem, ignorando preto, branco e cinza, e as deixa no brilho máximo, como um neon. `apps/web/src/engine/jukebox-lights.ts` passa de uma imagem para a outra conforme a música avança, então as cores mudam ao longo do vídeo. Um vídeo sem cor (preto e branco) ou sem rede fica no âmbar original da jukebox.

**Limitações.** As cores acompanham o vídeo pelas imagens, não quadro a quadro. O pisca não segue a batida da música, porque o áudio do iframe também não pode ser lido.

Todos os navegadores mostram as mesmas cores no mesmo momento, porque o desenho segue a linha do tempo compartilhada da jukebox. O brilho é dividido pela exposição da cena e nunca passa de 1, então a tela mostra exatamente o tom tirado do vídeo, sem estourar para branco. A luz da jukebox não entra no circuito das luminárias de teto (`environment-lighting.ts` ignora `Jukebox_FX_*`).

## Código

- `packages/shared/src/jukebox.ts`: `JUKEBOX_PLACEMENT`, `JUKEBOX_SYSTEMS`, `TV_SYSTEMS` (cada grupo lista suas telas em `screens` e as posições do som em `sources`), curvas de volume (`JUKEBOX_AUDIO`, `TV_AUDIO`, `mediaGain`), validação de links, linha do tempo, fila e redução de comandos (*compare-and-swap*), e os relatórios dos players (`endMedia`, `failMedia`, `liveMedia`). As funções são compartilhadas; o estado não.
- `packages/shared/src/world.ts`: interações. Há um objeto por tela, com `media` apontando para o grupo. O ponto de uso de cada TV é o primeiro ponto livre do chão diante da tela (`TV_SPOTS`); a TV do balcão é usada pelo corredor entre a parede e o balcão.
- `apps/server/src/BarRoom.ts`: os handlers de cada tipo (`<tipo>.command`, `.ended`, `.failed`, `.live`), cada um com seu mapa de estado. `requireMedia` aceita o comando de quem estiver perto de qualquer tela do grupo, `requireMediaControl` aceita o de quem controla o vídeo de onde ele o ouve, e `tv.open` abre o painel do grupo.
- `packages/shared/src/media-links.ts`: as plataformas (`MEDIA_PLATFORMS`), a leitura dos links (`parseMediaLink`) e o endereço próprio de cada link (`mediaLinkUrl`).
- `apps/server/src/world/media-check.ts`: pergunta à plataforma (oEmbed) se o vídeo pode tocar fora do site dela, antes de entrar na fila.
- `apps/web/src/media/`: os players. `player.ts` define o que o controlador espera deles (os estados e erros do YouTube são a língua comum), `platforms.ts` traz um adaptador por plataforma e `file.ts`, o `<video>` dos links diretos, com o hls.js carregado só quando alguém usa um `.m3u8`.
- `apps/web/src/jukebox.ts`: `MediaController` com duas instâncias, `JukeboxController` e `TelevisionController`. Cada uma tem seus players, painéis (IDs `#jukebox-*` e `#tv-*`), mensagens e volume.
- `apps/web/src/engine/television-surface.ts`: projeção do player na tela da TV.
- `apps/web/src/engine/video-palette.ts` e `jukebox-lights.ts`: cores do vídeo e luzes da jukebox do mapa.

## Player e tela da TV

Cada fonte ativa tem um player oficial por tela: um para cada TV do grupo e um, invisível, para a jukebox. Todos seguem a mesma linha do tempo compartilhada. Os do YouTube são reutilizados ao trocar de vídeo; os das outras plataformas são feitos para um link só, e são refeitos a cada vídeo (`build`). Uma tela é conferida assim que começa a tocar e depois a cada 3 s; se se afastou mais de 1,5 s da linha do tempo (5 s numa live), é corrigida. Fechar a janela de controle não destrói os players nem interrompe a reprodução; desligar, sair do bar ou remover a fonte destrói os players e limpa timers e iframes.

O vídeo da TV não é uma textura WebGL. A tela recebe um plano que "abre" o canvas (alpha zero, com teste de profundidade), e o player atrás dele recebe uma transformação projetiva CSS calculada a partir dos quatro cantos da tela pela câmera real. O vídeo fica na superfície da TV, com posição, tamanho, orientação e perspectiva corretos, e é escondido pelo que estiver na frente: paredes, móveis, pessoas, painéis e janelas.

O vídeo **nunca sai da TV** (a Twitch é a exceção, veja [Plataformas](#plataformas)). Ele continua na tela quando ela fica pequena, quando sai parcialmente da câmera ou quando há algo na frente. Só deixa de ser desenhado quando a câmera vê a TV por trás, porque aí não há projeção possível. A reprodução continua nesse caso. O player de uma tela sem projeção fica escondido: no canto da página, ele apareceria pela abertura de outra TV. **Assistir na TV**, no painel, aproxima a câmera da tela do grupo mais próxima; ESC volta.

**Controles do player.** Só aparecem nas telas de quem controla o vídeo (veja *Fila e controle*). O Vimeo mostra os dele a todos em vídeos de contas gratuitas, mas só quem controla consegue clicar. Para todos os outros, os players são criados sem controles (`controls=0`, `disablekb=1`, sem tela cheia nem anotações) e não recebem o mouse (`pointer-events: none`): ninguém pausa ou avança só a própria cópia, o que tirava os navegadores de sincronia. Quando o controle muda de pessoa, os players das telas dela são recriados com ou sem controles. Para quem controla, o mouse passa para o player quando o ponteiro está sobre uma tela sem parede no caminho; uma TV escondida atrás de uma parede não rouba o arraste da câmera. O telão nunca recebe o mouse (ele ocupa a vista do quintal e travaria o arraste), então quem controla o telão usa o painel. O cartão de fim e o de erro do YouTube não são desenhados: a tela volta para a imagem de espera.

**Atenção, políticas do YouTube.** A API pede um player visível de pelo menos 200 × 200 px, e as [políticas para desenvolvedores](https://developers.google.com/youtube/terms/developer-policies) (seções III.I.7 e III.I.9) proíbem reprodução invisível e separar o áudio do vídeo. A versão anterior respeitava isso com um card no canto. Este comportamento foi escolhido pelo produto: TVs pequenas ou fora da vista e a jukebox sem vídeo. Antes de publicar, revise o risco ou troque a fonte da jukebox por áudio próprio, com licença. As outras plataformas têm termos próprios sobre players escondidos ou em segundo plano, e cada um deve ser revisto antes de publicar. A TikTok também pode limitar a incorporação por domínio.

## Som

O volume de cada fonte é calculado pela distância do personagem local, incluindo a altura. A jukebox usa a distância até a jukebox. Um grupo de TVs usa a distância até a tela mais próxima, e só o player dessa tela fica com som; os outros ficam mudos, então o som não se repete nem ecoa. Para o som trocar de tela, a outra precisa estar pelo menos 1,5 m mais perto, o que evita que ele fique pulando de uma TV para outra entre duas telas. Há suavização de 0,25 s, silêncio total fora do alcance e o volume geral das configurações por cima. O som ambiente baixa enquanto a jukebox ou uma TV estiver em uso.

**Palco × bar.** O telão (área `stage`) e a jukebox e as TVs (área `bar`) nunca tocam um por cima do outro. Onde os dois chegam, a área que soa mais alta para quem escuta fica com o som e a outra some, com uma transição curta onde os dois estão parecidos (`areaMix` em `packages/shared/src/jukebox.ts`). Na frente do palco só se ouve o telão; na jukebox, só a jukebox. Uma fonte pausada não cala a outra área, e fontes da mesma área continuam se misturando como antes.

**Fontes longe daqui.** Uma fonte que ninguém neste navegador consegue ouvir (fora do alcance, ou coberta pela outra área) e cujas telas estão fora de vista fica pausada neste navegador depois de 3 s. Ela volta, já sincronizada com a linha do tempo, assim que pode ser ouvida ou vista de novo. Com até seis players decodificando ao mesmo tempo, o som travava em máquinas modestas. O navegador de quem controla o vídeo nunca pausa a fonte, porque é ele que avisa o fim do vídeo. O painel mostra *Em espera: longe daqui*.

**Limitação:** isto é atenuação por distância, não posicionamento estéreo (esquerda/direita). O áudio de um iframe não pode ser ligado ao Web Audio (`PannerNode`). O navegador não expõe esse som à página e a política do YouTube proíbe extraí-lo. O chat de voz, que é áudio do próprio jogo, é posicional.

## Multiplayer

Os estados são públicos na sala, inclusive para quem chega depois, com a fila. São efêmeros como o resto do mundo: reiniciar o servidor desliga a jukebox e as TVs e esvazia as filas. A `revision` muda a cada mudança da reprodução (não da fila). Pausar, continuar, avançar e pular levam a revisão que o jogador viu; uma revisão antiga é recusada (*Outra pessoa alterou a reprodução*). Pôr na fila e tirar da fila nunca conflitam, então não comparam a revisão. São quatro comandos por segundo por tipo e por jogador. Os links aceitos estão em [Plataformas](#plataformas); o link de um vídeo do YouTube dentro de uma playlist (`watch?v=…&list=…`) põe esse vídeo.

O que os players veem chega ao servidor como relatório. Só vale o de quem controla o vídeo (ou o de qualquer um, enquanto ninguém controla), com a revisão e o vídeo de agora. Num grupo, só o player com som relata:

- `<tipo>.ended`: o vídeo acabou, e a fila anda. Um fim mais de 8 s antes da linha do tempo chegar lá é ignorado; um fim depois dela vale, mesmo bem depois (ninguém estava lá para avisar).
- `<tipo>.failed`: a plataforma recusou o vídeo (erros 2, 100, 101 e 150, os códigos do YouTube, que todos os players usam), e a fila anda. Nos primeiros 30 s, as moedas voltam, e quem pôs o vídeo recebe um aviso.
- `<tipo>.live`: é uma live, com a borda ao vivo do player de quem relata (veja *Lives*).

O estado compartilhado representa a intenção do bar; o painel mostra à parte o que acontece **neste navegador** (carregando, reproduzindo, bloqueado pelo autoplay, erro). Se o navegador bloquear o autoplay, qualquer clique ou tecla no jogo libera a reprodução; o painel também tem **Ativar reprodução neste navegador**.

## Fila e controle

Cada fonte (a jukebox, cada grupo de TVs e o telão) tem a sua fila. Com a fonte desligada, o link colado toca na hora; com algo tocando ou pausado, ele entra no fim da fila (*Pôr na fila*). Quando o vídeo acaba, é pulado ou a plataforma o recusa, o próximo começa do zero; depois do último, a fonte desliga. A fila tem até 20 vídeos, até 3 de cada pessoa, sem repetir um vídeo que já está nela ou tocando. Cada vídeo é cobrado ao entrar na fila. Quem o pôs pode tirá-lo (*Tirar da fila*), mesmo longe da TV, e recebe as moedas de volta.

**Quem controla.** O vídeo que toca é controlado por quem o pôs (`by`). Só essa pessoa pausa, continua, avança, volta e pula, e só ela vê os botões no painel e os controles do player na tela. Ela faz isso de onde ouvir o vídeo, mesmo sentada (`requireMediaControl`). Os outros veem *No controle: …* e podem pôr o próprio vídeo na fila. Quem sai do bar deixa de controlar: o vídeo dela, ou o que entra da fila de alguém que já saiu, fica sem controle, e quem estiver na tela assume com o primeiro comando. A administração desliga a fonte e esvazia a fila, devolvendo as moedas de quem estava esperando.

**Controles no painel.** −10 s e +10 s, a barra de posição (ao soltar, todo mundo vai para lá), Pausar ou Continuar, e *Pular vídeo* (ou *Desligar*, com a fila vazia). Na tela, os controles do player de quem controla também valem para todos. Com o player em foco (a pessoa clicou nele), uma pausa, um play ou um salto do tempo que não veio do próprio jogo vira comando (`watchControls`). Se o servidor recusar, os players daquele navegador voltam ao estado do bar.

**Vídeos que não tocam fora da plataforma não entram na fila.** O link é conferido duas vezes antes de ser cobrado:

1. No navegador de quem cola o link, um player invisível e mudo tenta tocar o vídeo por um instante (`probe`). Se a plataforma recusar (autor bloqueou a incorporação, restrição de idade, bloqueio na região, vídeo removido) ou um link direto não for mídia, o painel mostra o motivo e nada é enviado. Sem resposta em 8 s, o servidor decide sozinho. O Spotify (sem mudo, ele tocaria alto) e a Twitch (não toca escondida) pulam esta etapa.
2. O servidor pergunta ao oEmbed da plataforma: YouTube (`YOUTUBE_OEMBED_URL`, padrão `https://www.youtube.com/oembed`; `off` desliga a conferência de todas; nos testes `node --test` fica desligado), Vimeo, SoundCloud, Mixcloud e Spotify. 401 ou 403 (incorporação desligada ou vídeo privado) e 400 ou 404 (vídeo inexistente) recusam o vídeo sem cobrar. A resposta traz o título que a fila mostra para todos, como texto, e a capa. As respostas ficam 10 min em memória. Sem resposta (plataforma fora do ar, lenta ou limitando), o vídeo entra, e o relatório `failed` dos players o pula se ele não tocar. Só vai para o oEmbed o endereço reconstruído a partir do link já lido, nunca o texto colado. A Twitch (o oEmbed exige chave), o TikTok (responde igual para qualquer id) e os links diretos não têm esta etapa; o título vem do próprio link.

## Lives

O tempo de um vídeo começa em 0, mas o de uma live conta desde que a transmissão começou, igual para todo mundo, e `getDuration()` dá a borda ao vivo. Antes, uma live posta no bar começava do 0 da linha do tempo, horas atrás da transmissão. Agora, quando o player de quem controla percebe a live (o `isLive` do YouTube ou a duração que cresce com o relógio), ele manda a borda ao vivo, e a linha do tempo do bar salta para lá (`liveMedia`). Todo mundo segue dali, sincronizado com a transmissão. Até isso chegar, os players não puxam a live de volta para o começo. O painel mostra *Ao vivo* e quanto o bar está atrás da transmissão, com *−30 s*, *+30 s* e **Ir para o ao vivo**, que leva todo mundo à borda ao vivo do player de quem controla. Uma live acaba quando a transmissão acaba.

## Testes

- `tests/integration/jukebox.test.ts`:
  - links (inclusive `/live/`), linha do tempo, controle de quem pôs o vídeo, avanço, fila (limites, tirar da fila, ordem), relatórios de fim, recusa e live, e curva de volume;
  - os grupos de TVs: as três telas do térreo num grupo e a de cima em outro, com o som vindo da tela mais próxima;
  - o lugar da jukebox: é a do mapa (`COL_Int_Jukebox`), encostada na base da escada, sem outro volume no lugar dela, sem tapar corredor nem escada e com ponto de uso andável.
- `tests/e2e/environment.spec.ts`:
  - a jukebox apagada, acesa com as cores do vídeo, pausada e desligada (capturas `jukebox-off.png`, `jukebox-playing.png`);
  - o palco: lentes, spots da treliça, luz frontal e luz de festa com as cores do telão e de volta ao branco; os blips da escada e do telão no quintal, nunca no salão nem em cima do palco (capturas `stage-*.png`, `telao-blip.png`).
- `tests/integration/map.test.ts`: o telão alcançado do blip e da borda da frente do tablado (nunca do fundo do palco), e a área do palco igual ao quintal.
- `apps/server/test/stage.integration.test.ts`: um segundo vídeo no telão, posto de cima do palco, entra na fila e também é cobrado.
- `apps/server/test/jukebox.integration.test.ts`: conexões reais.
  - Proximidade, entrada tardia, revisões conflitantes e a fila. O oEmbed falso: vídeo bloqueado, inexistente, sem resposta e resposta reaproveitada. Só quem controla mexe no vídeo, de onde o ouve. Estornos ao tirar da fila e na recusa, relatórios só de quem controla, a live saltando para a borda e o controle liberado quando o jogador sai.
  - Para as TVs: cada tela abre o painel do grupo, a TV de cima abre o seu, e o estado da jukebox não muda.
- `tests/e2e/jukebox.spec.ts` (projeto `media`):
  - **YouTube real:** a jukebox toca só o som, sem card. As TVs do salão tocam outro vídeo nas três telas, com som só na mais próxima, e a tela física aparece em perspectiva. Pausar e desligar as TVs deixam a jukebox tocando. Dois ouvintes recebem volumes diferentes. Um segundo link entra na fila e toca ao pular, e +10 s avança a linha do tempo.
  - **Dublê da API do YouTube:** a conferência do link (um vídeo recusado não é enviado), erros, autoplay, limites de volume, distância, fila (pôr, tirar, repetido, pular), recusa durante a reprodução e encerramento sem player esquecido. Nas TVs: controles do player e mouse só nas telas de quem controla; +10 s e a barra de posição; pausa e salto pelos controles do player indo para todos; a live saltando para a borda ao vivo; o fim tocando o próximo da fila, com o controle passando para o dono dele; e alguém assumindo um vídeo sem controle.
  - **API inacessível:** falha de conexão e nova tentativa limpa.
- `tests/integration/media-links.test.ts`: cada forma de link de cada plataforma, o que é recusado e por quê, os endereços internos e os links parecidos com os de uma plataforma.
- `apps/server/test/media-check.test.ts`: o oEmbed de cada plataforma, o endereço reconstruído, a recusa e nenhuma requisição para link direto.
- `apps/server/test/media-platforms.integration.test.ts`: conexões reais com links de outras plataformas: fila, cobrança, estorno, canal fora do ar e `MEDIA_PROVIDERS`.
- `tests/e2e/media-platforms.spec.ts` (projeto `media`), com os players **reais** de cada plataforma, atrás de um canvas de tela cheia e projetados pequenos como no jogo: tocar, seguir o tempo, buscar, tela escondida, pausar, continuar e encerrar sem player esquecido. Também um arquivo servido pelo teste (a fila trocando de plataforma nos dois sentidos), a janela da Twitch e, no jogo de verdade, o SoundCloud e um MP4 na TV e o SoundCloud na jukebox, com as luzes vindas da capa.
- `tests/e2e/media-firefox.spec.ts` (projeto `media-firefox`): o Vimeo real. Ele põe uma verificação de robô (Cloudflare Turnstile) na frente do player para navegadores automatizados: sempre no Edge e, no Firefox, a partir do segundo player. Por isso o teste usa um player só e fica como pulado se a verificação aparecer. **Os três players do Vimeo juntos nunca rodaram em teste automático:** confira num navegador de verdade.

Capturas: [TV](../previews/jukebox-tv.png), [TV em perspectiva](../previews/jukebox-tv-angle.png) e [controles da jukebox](../previews/jukebox-controls.png).

## Telão do palco

O **telão** (`telao` em `TELEVISIONS`) é um terceiro sistema de vídeo, que aceita as mesmas plataformas, independente das TVs, com o mesmo player e a mesma sincronia. É a tela de LED do mapa (`Telao_Tela`, de `15_palco.py`): 5,76 × 3,24 m (16:9) na treliça do fundo do palco, virada para a plateia; o importador exporta posição e tamanho em `map-data.json` → `stage.screen`. Sem vídeo, a tela mostra a arte de espera do mapa (*Música ao vivo*); com vídeo, a cena esconde essa arte e abre a tela para o player.

Para usar, vá ao **blip turquesa** no chão, no meio da frente do palco (`TV_SPOTS.telao`), e aperte **E**. Vale a borda inteira da frente do tablado (`STAGE_FRONT`), do quintal ou de cima do palco: o tablado fica exatamente 0,6 m acima do quintal, o limite de altura do alcance (`REACH_HEIGHT` em `world.ts`, com margem para o arredondamento de 0,9 − 0,3). Não precisa de ingresso do palco. O blip, assim como o da escada do palco, só aparece para quem está no quintal (`inStageArea`) e embaixo do palco. O selo diz *Vídeo no telão · 50 moedas*, ou *Telão · pôr vídeo na fila · 50 moedas* enquanto um vídeo toca. O som alcança o quintal todo (`TELAO_AUDIO`: cheio até 7 m, silêncio a 30 m) e não toca por cima da jukebox e das TVs (veja *Som*). **Assistir no telão**, no painel, afasta a câmera o bastante para a tela caber na vista.

**Luzes do palco.** Todas as luzes do palco seguem as cores do vídeo do telão, do mesmo jeito que a jukebox (`apps/web/src/engine/stage-lights.ts`, com as cores de `video-colours.ts`). Três cores tiradas das imagens do vídeo correm do meio do palco para as laterais e sobem pela treliça, com "lâmpadas" correndo. Cada luz mostra a cor que passa pelo seu lugar:

- as lentes dos refletores, as barras de LED do chão e a fita de LED da borda (`Palco_FX_Luz`);
- a contraluz colorida (`Luz_Palco_Cor`), com a cor do meio;
- os spots brancos da treliça: as lâmpadas do bar (`Lampada`) acima do tablado. O shader troca a emissão só dentro do volume do palco, e as outras lâmpadas do bar ficam como estão;
- a luz frontal (`Luz_Palco`) e a luz de festa do palco (`Stage party wash`). Elas mantêm o brilho dado pelo dia e noite e pela festa, e só a cor muda.

Por cima disso, enquanto o vídeo toca, o quintal ganha o [show de luzes](palco.md#show-de-luzes) (lasers, moving heads e estrobo), que é separado destas luzes.

Pausado, as cores param e a luz fica fraca. Desligado, as lentes, a fita e a contraluz ficam com um brilho fraco do magenta original, para o palco não ficar morto à noite, e os spots e as luzes brancas voltam ao branco. Todos os navegadores veem as mesmas cores no mesmo momento. A paleta é a mesma da jukebox, então um vídeo de cores claras (como *Big Buck Bunny*) dá luzes claras.

Escolher um vídeo novo custa moedas: 15 na jukebox, 25 nas TVs e 50 no telão, também para pôr na fila. Pausar, continuar, avançar e pular são de graça; tirar o próprio vídeo da fila devolve as moedas. O servidor valida o comando antes de cobrar e estorna se ele falhar depois. Subir no palco é outro pagamento (ingresso de 200 moedas). Veja [economia](economia.md#palco).
