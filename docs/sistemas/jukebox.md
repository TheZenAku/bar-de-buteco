# Jukebox e TVs

A jukebox e as TVs são **sistemas independentes**. Cada um tem seu próprio objeto no cenário, sua janela de controle, seu link do YouTube, seu estado compartilhado, suas mensagens de rede, seus players e seu volume. Tocar, pausar, parar ou desligar um nunca altera o outro, e cada um funciona mesmo que o outro nunca tenha sido usado.

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

## Luzes da jukebox

Desligada, a jukebox fica apagada. Quando alguém põe um vídeo para tocar, os tubos dos arcos e a grade da frente (`Jukebox_FX_Luz`) acendem, e a luz na frente dela (`Jukebox_FX_Ponto_Luz`) pinta o chão e as paredes com a mesma cor. Faixas de cor sobem pelos dois lados dos arcos e se encontram no topo, com "lâmpadas" correndo por elas. Pausada, a jukebox fica com as luzes paradas e fracas. Parada, encerrada ou desligada, ela apaga devagar.

**De onde vêm as cores.** O player do YouTube é um iframe de outro domínio, e nenhuma página consegue ler os pixels dele. O YouTube publica, porém, imagens do próprio vídeo que podem ser lidas (`i.ytimg.com` responde com CORS): a capa e os quadros em 25 %, 50 % e 75 % da duração. `apps/web/src/engine/video-palette.ts` tira as três cores mais vivas de cada imagem, ignorando preto, branco e cinza, e as deixa no brilho máximo, como um neon. `apps/web/src/engine/jukebox-lights.ts` passa de uma imagem para a outra conforme a música avança, então as cores mudam ao longo do vídeo. Um vídeo sem cor (preto e branco) ou sem rede fica no âmbar original da jukebox.

**Limitações.** As cores acompanham o vídeo pelas quatro imagens, não quadro a quadro. O pisca não segue a batida da música, porque o áudio do iframe também não pode ser lido.

Todos os navegadores mostram as mesmas cores no mesmo momento, porque o desenho segue a linha do tempo compartilhada da jukebox. O brilho é dividido pela exposição da cena e nunca passa de 1, então a tela mostra exatamente o tom tirado do vídeo, sem estourar para branco. A luz da jukebox não entra no circuito das luminárias de teto (`environment-lighting.ts` ignora `Jukebox_FX_*`).

## Código

- `packages/shared/src/jukebox.ts`: `JUKEBOX_PLACEMENT`, `JUKEBOX_SYSTEMS`, `TV_SYSTEMS` (cada grupo lista suas telas em `screens` e as posições do som em `sources`), curvas de volume (`JUKEBOX_AUDIO`, `TV_AUDIO`, `mediaGain`), validação de links, linha do tempo e redução de comandos (*compare-and-swap*). As funções são compartilhadas; o estado não.
- `packages/shared/src/world.ts`: interações. Há um objeto por tela, com `media` apontando para o grupo. O ponto de uso de cada TV é o primeiro ponto livre do chão diante da tela (`TV_SPOTS`); a TV do balcão é usada pelo corredor entre a parede e o balcão.
- `apps/server/src/BarRoom.ts`: um par de handlers por tipo, cada um com seu mapa de estado. `requireMedia` aceita o comando de quem estiver perto de qualquer tela do grupo, e `tv.open` abre o painel do grupo.
- `apps/web/src/jukebox.ts`: `MediaController` com duas instâncias, `JukeboxController` e `TelevisionController`. Cada uma tem seus players, painéis (IDs `#jukebox-*` e `#tv-*`), mensagens e volume.
- `apps/web/src/engine/television-surface.ts`: projeção do player na tela da TV.
- `apps/web/src/engine/video-palette.ts` e `jukebox-lights.ts`: cores do vídeo e luzes da jukebox do mapa.

## Player e tela da TV

Cada fonte ativa tem um `YT.Player` oficial por tela: um para cada TV do grupo e um, invisível, para a jukebox. Todos seguem a mesma linha do tempo compartilhada, e os players são reutilizados ao trocar de vídeo. A cada 5 s, uma tela que se afastou mais de 1,5 s da linha do tempo é corrigida. Fechar a janela de controle não destrói os players nem interrompe a reprodução; desligar, sair do bar ou remover a fonte destrói os players e limpa timers e iframes.

O vídeo da TV não é uma textura WebGL. A tela recebe um plano que "abre" o canvas (alpha zero, com teste de profundidade), e o iframe atrás dele recebe uma transformação projetiva CSS calculada a partir dos quatro cantos da tela pela câmera real. O vídeo fica na superfície da TV, com posição, tamanho, orientação e perspectiva corretos, e é escondido pelo que estiver na frente: paredes, móveis, pessoas, painéis e janelas.

O vídeo **nunca sai da TV**. Ele continua na tela quando ela fica pequena, quando sai parcialmente da câmera ou quando há algo na frente. Só deixa de ser desenhado quando a câmera vê a TV por trás, porque aí não há projeção possível. A reprodução continua nesse caso. **Assistir na TV**, no painel, aproxima a câmera da tela do grupo mais próxima; ESC volta.

O mouse só passa para o player do YouTube quando o ponteiro está sobre uma tela sem parede no caminho. Uma TV escondida atrás de uma parede não rouba o arraste da câmera.

**Atenção, políticas do YouTube.** A API pede um player visível de pelo menos 200 × 200 px, e as [políticas para desenvolvedores](https://developers.google.com/youtube/terms/developer-policies) (seções III.I.7 e III.I.9) proíbem reprodução invisível e separar o áudio do vídeo. A versão anterior respeitava isso com um card no canto. Este comportamento foi escolhido pelo produto: TVs pequenas ou fora da vista e a jukebox sem vídeo. Antes de publicar, revise o risco ou troque a fonte da jukebox por áudio próprio, com licença.

## Som

O volume de cada fonte é calculado pela distância do personagem local, incluindo a altura. A jukebox usa a distância até a jukebox. Um grupo de TVs usa a distância até a tela mais próxima, e só o player dessa tela fica com som; os outros ficam mudos, então o som não se repete nem ecoa. Para o som trocar de tela, a outra precisa estar pelo menos 1,5 m mais perto, o que evita que ele fique pulando de uma TV para outra entre duas telas. Há suavização de 0,25 s, silêncio total fora do alcance e o volume geral das configurações por cima. O som ambiente baixa enquanto a jukebox ou uma TV estiver em uso.

**Palco × bar.** O telão (área `stage`) e a jukebox e as TVs (área `bar`) nunca tocam um por cima do outro. Onde os dois chegam, a área que soa mais alta para quem escuta fica com o som e a outra some, com uma transição curta onde os dois estão parecidos (`areaMix` em `packages/shared/src/jukebox.ts`). Na frente do palco só se ouve o telão; na jukebox, só a jukebox. Uma fonte pausada não cala a outra área, e fontes da mesma área continuam se misturando como antes.

**Fontes longe daqui.** Uma fonte que ninguém neste navegador consegue ouvir (fora do alcance, ou coberta pela outra área) e cujas telas estão fora de vista fica pausada neste navegador depois de 3 s. Ela volta, já sincronizada com a linha do tempo, assim que pode ser ouvida ou vista de novo. Com até seis players do YouTube decodificando ao mesmo tempo, o som travava em máquinas modestas. O navegador de quem deu o último comando nunca pausa a fonte, porque é ele que avisa o fim do vídeo. O painel mostra *Em espera: longe daqui*.

**Limitação:** isto é atenuação por distância, não posicionamento estéreo (esquerda/direita). O áudio de um iframe do YouTube não pode ser ligado ao Web Audio (`PannerNode`). O navegador não expõe esse som à página e a política do YouTube proíbe extraí-lo. O chat de voz, que é áudio do próprio jogo, é posicional.

## Multiplayer

Os estados são públicos na sala, inclusive para quem chega depois. São efêmeros como o resto do mundo: reiniciar o servidor desliga a jukebox e as TVs. Cada comando leva a revisão que o jogador viu; uma revisão antiga é recusada (*Outra pessoa alterou a reprodução*), o que evita duas pessoas sobrescreverem uma à outra. São quatro comandos por segundo por tipo e por jogador. Os links aceitos são só os de `youtube.com`, `www.youtube.com`, `m.youtube.com` e `youtu.be`. O fim de um vídeo só é aceito se vier de quem o pôs para tocar, com revisão, vídeo e tempo coerentes; num grupo, só o player com som informa o fim.

O estado compartilhado representa a intenção do bar; o painel mostra à parte o que acontece **neste navegador** (carregando, reproduzindo, bloqueado pelo autoplay, erro). Se o navegador bloquear o autoplay, qualquer clique ou tecla no jogo libera a reprodução; o painel também tem **Ativar reprodução neste navegador**.

## Testes

- `tests/integration/jukebox.test.ts`:
  - links, linha do tempo e curva de volume;
  - os grupos de TVs: as três telas do térreo num grupo e a de cima em outro, com o som vindo da tela mais próxima;
  - o lugar da jukebox: é a do mapa (`COL_Int_Jukebox`), encostada na base da escada, sem outro volume no lugar dela, sem tapar corredor nem escada e com ponto de uso andável.
- `tests/e2e/environment.spec.ts`:
  - a jukebox apagada, acesa com as cores do vídeo, pausada e desligada (capturas `jukebox-off.png`, `jukebox-playing.png`);
  - o palco: lentes, spots da treliça, luz frontal e luz de festa com as cores do telão e de volta ao branco; os blips da escada e do telão no quintal, nunca no salão nem em cima do palco (capturas `stage-*.png`, `telao-blip.png`).
- `tests/integration/map.test.ts`: o telão alcançado do blip e da borda da frente do tablado (nunca do fundo do palco), e a área do palco igual ao quintal.
- `apps/server/test/stage.integration.test.ts`: o telão trocado de cima do palco, cobrado de novo.
- `apps/server/test/jukebox.integration.test.ts`: conexões reais.
  - Proximidade, entrada tardia e revisões conflitantes.
  - Para as TVs: cada tela abre o painel do grupo, e outra tela do mesmo grupo controla o mesmo vídeo. A TV de cima não controla o térreo, e o estado da jukebox não muda.
- `tests/e2e/jukebox.spec.ts` (projeto `media`):
  - **YouTube real:** a jukebox toca só o som, sem card. As TVs do salão tocam outro vídeo nas três telas, com som só na mais próxima, e a tela física aparece em perspectiva. Pausar e desligar as TVs deixam a jukebox tocando. Dois ouvintes recebem volumes diferentes.
  - **Dublê da API:** erros, autoplay, limites de volume, distância, troca rápida e encerramento.
  - **API inacessível:** falha de conexão e nova tentativa limpa.

Capturas: [TV](../previews/jukebox-tv.png), [TV em perspectiva](../previews/jukebox-tv-angle.png) e [controles da jukebox](../previews/jukebox-controls.png).

## Telão do palco

O **telão** (`telao` em `TELEVISIONS`) é um terceiro sistema de vídeo, independente das TVs, com o mesmo player e a mesma sincronia. É a tela de LED do mapa (`Telao_Tela`, de `15_palco.py`): 5,76 × 3,24 m (16:9) na treliça do fundo do palco, virada para a plateia; o importador exporta posição e tamanho em `map-data.json` → `stage.screen`. Sem vídeo, a tela mostra a arte de espera do mapa (*Música ao vivo*); com vídeo, a cena esconde essa arte e abre a tela para o player.

Para usar, vá ao **blip turquesa** no chão, no meio da frente do palco (`TV_SPOTS.telao`), e aperte **E**. Vale a borda inteira da frente do tablado (`STAGE_FRONT`), do quintal ou de cima do palco: o tablado fica exatamente 0,6 m acima do quintal, o limite de altura do alcance (`REACH_HEIGHT` em `world.ts`, com margem para o arredondamento de 0,9 − 0,3). Não precisa de ingresso do palco. O blip, assim como o da escada do palco, só aparece para quem está no quintal (`inStageArea`) e embaixo do palco. O selo diz *Vídeo no telão · 50 moedas*, ou *Telão · trocar o vídeo* enquanto um vídeo toca. O som alcança o quintal todo (`TELAO_AUDIO`: cheio até 7 m, silêncio a 30 m) e não toca por cima da jukebox e das TVs (veja *Som*). **Assistir no telão**, no painel, afasta a câmera o bastante para a tela caber na vista.

**Luzes do palco.** Todas as luzes do palco seguem as cores do vídeo do telão, do mesmo jeito que a jukebox (`apps/web/src/engine/stage-lights.ts`, com as cores de `video-colours.ts`). Três cores tiradas das imagens do vídeo correm do meio do palco para as laterais e sobem pela treliça, com "lâmpadas" correndo. Cada luz mostra a cor que passa pelo seu lugar:

- as lentes dos refletores, as barras de LED do chão e a fita de LED da borda (`Palco_FX_Luz`);
- a contraluz colorida (`Luz_Palco_Cor`), com a cor do meio;
- os spots brancos da treliça: as lâmpadas do bar (`Lampada`) acima do tablado. O shader troca a emissão só dentro do volume do palco, e as outras lâmpadas do bar ficam como estão;
- a luz frontal (`Luz_Palco`) e a luz de festa do palco (`Stage party wash`). Elas mantêm o brilho dado pelo dia e noite e pela festa, e só a cor muda.

Pausado, as cores param e a luz fica fraca. Desligado, as lentes, a fita e a contraluz ficam com um brilho fraco do magenta original, para o palco não ficar morto à noite, e os spots e as luzes brancas voltam ao branco. Todos os navegadores veem as mesmas cores no mesmo momento. A paleta é a mesma da jukebox, então um vídeo de cores claras (como *Big Buck Bunny*) dá luzes claras.

Escolher um vídeo novo custa moedas: 15 na jukebox, 25 nas TVs e 50 no telão. Pausar, continuar, parar e desligar são de graça. O servidor valida o comando antes de cobrar e estorna se ele falhar depois. Subir no palco é outro pagamento (ingresso de 200 moedas). Veja [economia](economia.md#palco).
